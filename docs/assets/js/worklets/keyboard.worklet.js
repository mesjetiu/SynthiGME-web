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
 * Pitch:    ((midiNote - 66) / 12 * pitchSpread/9 + offset) / DIGITAL_TO_VOLTAGE
 *           → a spread=9: 1V/Oct exacto (0.25 digital/Oct), centrado en F#3
 *           → a spread=0: todas las notas dan ~0V
 *           → a spread=10: ~1.11V/Oct (intervalo expandido)
 *
 * Velocity: (midiVelocity / 127) * velocityLevel / DIGITAL_TO_VOLTAGE
 *           → dial +5: hasta +5V = 1.25 digital (el estándar)
 *           → dial  0: sin efecto (0V siempre)
 *           → dial -5: inversión, pulsación rápida → -5V = -1.25 digital
 *           Memoria: sample & hold hasta la siguiente pulsación
 *
 * Gate:     key pulsada → +gateLevel/DTV, key soltada → 0
 *           gateLevel = dial(-5..+5). Sin memoria: desaparece al soltar
 *           → dial +5: pulso +5V = 1.25 digital para disparo de envolvente
 *           → dial -5: pulso -5V = -1.25 digital invertido
 *           → dial  0: sin gate (0 siempre)
 *
 * @module worklets/keyboard
 */

// ─── Defaults (overridable via processorOptions from keyboard.config.js) ─────

const DEFAULTS = {
  pivotNote:          66,    // F#3 — 0V
  spreadUnity:        9,     // dial value for 1V/Oct
  semitonesPerOctave: 12,
  retriggerGapMs:     2      // ∼2ms retrigger gap
};

/**
 * Factor de conversión voltaje → unidades digitales.
 * El sistema CV del sintetizador usa 1 unidad digital = 4V reales.
 * Todas las salidas del worklet deben emitir en unidades digitales
 * para que los destinos (ej. freqCVInput ×4800 cents) las interpreten
 * correctamente como 1V/Oct.
 * @see voltageConstants.js — DIGITAL_TO_VOLTAGE
 */
const DIGITAL_TO_VOLTAGE = 4.0;

// ─── Processor ──────────────────────────────────────────────────────────────

class KeyboardProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // ── Config from processorOptions (keyboard.config.js) ──
    const opts = options?.processorOptions ?? {};
    this._pivotNote          = opts.pivotNote          ?? DEFAULTS.pivotNote;
    this._spreadUnity        = opts.spreadUnity        ?? DEFAULTS.spreadUnity;
    this._semitonesPerOctave = opts.semitonesPerOctave ?? DEFAULTS.semitonesPerOctave;
    this._retriggerGapSamples = Math.round(
      (opts.retriggerGapMs ?? DEFAULTS.retriggerGapMs) * sampleRate / 1000
    );

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
    this._outGate = 0; // gate off = 0V (sin memoria, desaparece al soltar)

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
      this._retriggerCounter = this._retriggerGapSamples;
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
          this._retriggerCounter = this._retriggerGapSamples;
        }
      }
    }
  }

  // ─── Cálculos de voltaje ────────────────────────────────────────────────

  /**
   * Recalcula el voltaje de pitch basado en la nota actual y parámetros.
   * Fórmula: ((note - PIVOT) / 12) * (spread / SPREAD_UNITY) + offset
   *          Todo dividido por DIGITAL_TO_VOLTAGE para convertir V → digital.
   *
   * Ejemplo con spread=9, F#4 (nota 78):
   *   v = (78-66)/12 * 9/9 = 1.0V → /4.0 = 0.25 digital
   *   → freqCVInput(×4800) = 1200 cents = 1 octava ✓
   */
  _recalcPitch() {
    if (this._currentPitch === null) {
      this._outPitch = this._pitchOffset / DIGITAL_TO_VOLTAGE;
      return;
    }
    let v = ((this._currentPitch - this._pivotNote) / this._semitonesPerOctave)
            * (this._pitchSpread / this._spreadUnity);
    if (this._invert) v = -v;
    v += this._pitchOffset;
    this._outPitch = v / DIGITAL_TO_VOLTAGE;
  }

  /**
   * Recalcula el voltaje de velocity en unidades digitales.
   *   output = (midiVelocity / 127) * velocityLevel / DIGITAL_TO_VOLTAGE
   *
   * Ejemplo: vel=127, dial=+5 → 5V → /4.0 = 1.25 digital
   * Dial +5 → hasta +5V (1.25 digital), dial 0 → 0V, dial -5 → -5V (-1.25 digital)
   */
  _recalcVelocity() {
    this._outVelocity = (this._currentVelocity / 127) * this._velocityLevel / DIGITAL_TO_VOLTAGE;
  }

  /**
   * Recalcula el voltaje de gate.
   */
  _recalcGate() {
    this._outGate = this._computeGateVoltage(this._gateOn);
  }

  /**
   * Calcula el voltaje de gate en unidades digitales.
   * gate ON  → +gateLevel / DIGITAL_TO_VOLTAGE
   * gate OFF → 0 (sin memoria: desaparece al soltar la tecla)
   *
   * Ejemplo: dial=+5 → 5V → /4.0 = 1.25 digital
   * @param {boolean} on
   * @returns {number}
   */
  _computeGateVoltage(on) {
    return on ? this._gateLevel / DIGITAL_TO_VOLTAGE : 0;
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
