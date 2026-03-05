/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KEYBOARD WORKLET — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AudioWorkletProcessor para los teclados duales del Synthi 100.
 * Cada teclado genera 3 señales de control (DC) simultáneas:
 *
 *   Canal 0: Pitch    — voltaje proporcional a la nota (1V/Oct @ spread=9)
 *   Canal 1: Velocity — voltaje proporcional a la velocidad de pulsación
 *   Canal 2: Gate     — señal de puerta (+V mientras hay tecla pulsada)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LÓGICA DE TECLADO (modelo 1982, revisión Datanomics)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * - Prioridad de nota más alta (High-note priority)
 * - Memoria (Sample & Hold): pitch y velocity se mantienen al soltar
 * - Nota pivote: F#3 (MIDI 66) = 0V. El spread se expande desde este centro
 * - Retrigger (selector rotativo del Panel 4, ON / KBD):
 *     Mode 0 «Kbd» (Retrigger Key Release): la envolvente solo se
 *         redispara si TODAS las teclas se sueltan primero. Si tocas
 *         legato (nueva nota sin soltar la anterior), el pitch cambia
 *         pero el gate NO hace retrigger.  Modo staccato clásico.
 *     Mode 1 «On» (Key Release or New Pitch): la envolvente se
 *         redispara siempre que hay un cambio de pitch, tanto al
 *         pulsar una nota más aguda como al soltar la más aguda.
 *         Permite ejecución legato con re-ataque automático.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVERSIONES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Pitch:    (midiNote - 66) / 12 * pitchSpread/9
 *           → a spread=9: 1V/Oct exacto, centrado en F#3
 *           → a spread=0: todas las notas dan ~0V
 *           → a spread=10: ~1.11V/Oct (intervalo expandido)
 *
 * Velocity: (midiVelocity / 127) * 7 - 3.5  → rango base [-3.5V, +3.5V]
 *           Multiplicado por factor velocityLevel/5 (dial -5..+5 → factor -1..+1)
 *
 * Gate:     -gateLevel cuando no hay tecla, +gateLevel con tecla pulsada
 *           gateLevel = dial(-5..+5) → ±5V
 *
 * @module worklets/keyboard
 */

// ─── Constantes ─────────────────────────────────────────────────────────────

/** Nota MIDI del pivote central (F#3) */
const PIVOT_NOTE = 66;

/** Valor de spread del dial que da 1V/Oct exacto */
const SPREAD_UNITY = 9;

/** Semitonos por octava */
const SEMITONES_PER_OCTAVE = 12;

/** Rango base de velocity en voltios (simétrico) */
const VELOCITY_RANGE_V = 7;

/** Duración del retrigger gap en samples (~2ms @ 48kHz) */
const RETRIGGER_GAP_SAMPLES = 96;

// ─── Processor ──────────────────────────────────────────────────────────────

class KeyboardProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // ── Estado de teclas ──
    /** @type {Set<number>} MIDI notes actualmente pulsadas */
    this._keysPressed = new Set();
    /** Última nota MIDI más aguda (sample & hold) */
    this._currentPitch = null;
    /** Última velocity MIDI (sample & hold) */
    this._currentVelocity = 0;
    /** Gate on/off */
    this._gateOn = false;

    // ── Parámetros del panel (diales) ──
    /** Pitch Spread: 0-10, default 9 (1V/Oct) */
    this._pitchSpread = 9;
    /** Pitch Offset: voltaje DC bipolar sumado al pitch (-5V..+5V) */
    this._pitchOffset = 0;
    /** Invert: si true, invierte polaridad del pitch */
    this._invert = false;
    /** Velocity Level: -5..+5, a 0 sin efecto */
    this._velocityLevel = 5;
    /** Gate/Envelope Trigger Level: -5..+5, normalmente +5V */
    this._gateLevel = 5;
    /** Retrigger mode: 0 = Kbd (key release only), 1 = On (retrigger on new pitch) */
    this._retrigger = 0;

    // ── Retrigger timing ──
    this._retriggerCounter = 0;
    this._retriggerActive = false;

    // ── Valores de salida calculados (sample & hold) ──
    this._outPitch = 0;
    this._outVelocity = 0;
    this._outGate = -1; // gate off = voltaje negativo normalizado

    // ── Dormancy ──
    this._dormant = false;
    this._stopped = false;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  process(_inputs, outputs) {
    if (this._stopped) return false;

    const output = outputs[0];
    const pitchCh = output[0];
    const velCh = output[1];
    const gateCh = output[2];
    const len = pitchCh.length;

    // ── Retrigger gap handling ──
    if (this._retriggerActive) {
      // Durante el gap, gate está en OFF
      for (let i = 0; i < len; i++) {
        pitchCh[i] = this._dormant ? 0 : this._outPitch;
        velCh[i] = this._dormant ? 0 : this._outVelocity;
        gateCh[i] = this._dormant ? 0 : this._computeGateVoltage(false);
      }
      this._retriggerCounter -= len;
      if (this._retriggerCounter <= 0) {
        this._retriggerActive = false;
        this._retriggerCounter = 0;
        // Restore gate ON after gap
        this._outGate = this._computeGateVoltage(true);
      }
      return true;
    }

    if (this._dormant) {
      pitchCh.fill(0);
      velCh.fill(0);
      gateCh.fill(0);
      return true;
    }

    // ── Salida normal (DC) ──
    pitchCh.fill(this._outPitch);
    velCh.fill(this._outVelocity);
    gateCh.fill(this._outGate);

    return true;
  }

  // ─── Message Handler ────────────────────────────────────────────────────

  _handleMessage(data) {
    switch (data.type) {
      case 'noteOn':
        this._handleNoteOn(data.note, data.velocity);
        break;
      case 'noteOff':
        this._handleNoteOff(data.note);
        break;
      case 'setPitchSpread':
        this._pitchSpread = data.value;
        this._recalcPitch();
        break;
      case 'setPitchOffset':
        this._pitchOffset = data.value;
        this._recalcPitch();
        break;
      case 'setInvert':
        this._invert = !!data.value;
        this._recalcPitch();
        break;
      case 'setVelocityLevel':
        this._velocityLevel = data.value;
        this._recalcVelocity();
        break;
      case 'setGateLevel':
        this._gateLevel = data.value;
        this._recalcGate();
        break;
      case 'setRetrigger':
        this._retrigger = data.value;
        break;
      case 'setDormant':
        this._dormant = !!data.dormant;
        break;
      case 'stop':
        this._stopped = true;
        break;
    }
  }

  // ─── Note Logic (High-note priority, sample & hold) ─────────────────────

  /**
   * Procesa un noteOn MIDI con prioridad de nota más alta.
   * @param {number} note - MIDI note number (0-127)
   * @param {number} velocity - MIDI velocity (0-127)
   */
  _handleNoteOn(note, velocity) {
    const lastPitch = this._currentPitch;
    this._keysPressed.add(note);

    const maxNote = this._getHighestNote();

    // Actualizar pitch (siempre a la nota más alta)
    this._currentPitch = maxNote;
    this._recalcPitch();

    // Velocity: solo se actualiza si es la primera nota o si la nueva nota
    // es más aguda que la anterior (prioridad alta ascendente)
    if (this._keysPressed.size === 1 || maxNote > (lastPitch ?? 0)) {
      this._currentVelocity = velocity;
      this._recalcVelocity();
    }

    // Gate ON / Retrigger
    if (!this._gateOn) {
      // Primera tecla (o tras soltar todas) → gate ON (ambos modos)
      this._gateOn = true;
      this._outGate = this._computeGateVoltage(true);
    } else if (this._retrigger === 1 && maxNote !== lastPitch) {
      // Mode 1 «On» (Key Release or New Pitch):
      // El pitch ha cambiado → retrigger (gap + re-gate)
      this._retriggerActive = true;
      this._retriggerCounter = RETRIGGER_GAP_SAMPLES;
    }
    // Mode 0 «Kbd» (Retrigger Key Release):
    // NO retrigger mientras hay teclas pulsadas — solo al pasar
    // de 0 teclas a 1+ (condición !this._gateOn, arriba).
  }

  /**
   * Procesa un noteOff MIDI.
   * El pitch y velocity se mantienen (sample & hold).
   * @param {number} note - MIDI note number (0-127)
   */
  _handleNoteOff(note) {
    this._keysPressed.delete(note);

    if (this._keysPressed.size === 0) {
      // No quedan teclas → gate OFF
      this._gateOn = false;
      this._outGate = this._computeGateVoltage(false);
      // Pitch y velocity mantienen su último valor (sample & hold)
    } else {
      // Aún hay teclas — recalcular a la más alta
      const maxNote = this._getHighestNote();
      if (maxNote !== this._currentPitch) {
        const oldPitch = this._currentPitch;
        this._currentPitch = maxNote;
        this._recalcPitch();
        // Mode 1 «On»: el pitch ha cambiado al soltar → retrigger
        if (this._retrigger === 1 && oldPitch !== null) {
          this._retriggerActive = true;
          this._retriggerCounter = RETRIGGER_GAP_SAMPLES;
        }
      }
    }
  }

  // ─── Cálculos de voltaje ────────────────────────────────────────────────

  /**
   * Recalcula el voltaje de pitch basado en la nota actual y parámetros.
   * Fórmula: ((note - PIVOT) / 12) * (spread / SPREAD_UNITY) + offset
   * Opcionalmente invertido.
   */
  _recalcPitch() {
    if (this._currentPitch === null) {
      this._outPitch = this._pitchOffset; // Solo offset, sin nota
      return;
    }
    let v = ((this._currentPitch - PIVOT_NOTE) / SEMITONES_PER_OCTAVE)
            * (this._pitchSpread / SPREAD_UNITY);
    if (this._invert) v = -v;
    v += this._pitchOffset;
    this._outPitch = v;
  }

  /**
   * Recalcula el voltaje de velocity.
   * Base: (vel/127)*7 - 3.5 → [-3.5, +3.5]
   * Factor: velocityLevel/5 → [-1, +1]
   */
  _recalcVelocity() {
    const base = (this._currentVelocity / 127) * VELOCITY_RANGE_V - (VELOCITY_RANGE_V / 2);
    const factor = this._velocityLevel / 5;
    this._outVelocity = base * factor;
  }

  /**
   * Recalcula el voltaje de gate.
   */
  _recalcGate() {
    this._outGate = this._computeGateVoltage(this._gateOn);
  }

  /**
   * Calcula el voltaje de gate.
   * gate ON  → +(gateLevel / 5)  (normalizado, GainNode escala a voltios)
   * gate OFF → -(gateLevel / 5)
   * @param {boolean} on
   * @returns {number}
   */
  _computeGateVoltage(on) {
    const level = this._gateLevel / 5; // -1..+1
    return on ? Math.abs(level) : -Math.abs(level);
  }

  /**
   * @returns {number} La nota MIDI más alta del set actual
   */
  _getHighestNote() {
    let max = -1;
    for (const n of this._keysPressed) {
      if (n > max) max = n;
    }
    return max;
  }
}

registerProcessor('keyboard', KeyboardProcessor);
