/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KEYBOARD MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de audio para los teclados duales del Synthi 100.
 * Cada instancia representa un teclado (Upper o Lower) con 3 salidas DC:
 *
 *   - Pitch:    Voltaje proporcional a la nota (1V/Oct centrado en F#3)
 *   - Velocity: Voltaje proporcional a la velocidad de pulsación
 *   - Gate:     Señal de puerta (envelope trigger)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CADENA DE AUDIO (Web Audio API)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   KeyboardProcessor (3 canales)
 *       │
 *       ├── canal 0 ──→ ChannelSplitter ──→ pitchGain ──→ [output Pitch]
 *       │                      │
 *       ├── canal 1 ───────────┤──→ velocityGain ──→ [output Velocity]
 *       │                      │
 *       └── canal 2 ───────────┘──→ gateGain ──→ [output Gate]
 *
 * Los GainNodes permiten escalar/silenciar las salidas para dormancy.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALIDAS EN MATRIZ DE CONTROL (Panel 6)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Upper Keyboard:
 *     Fila 111: Pitch
 *     Fila 112: Velocity
 *     Fila 113: Gate
 *
 *   Lower Keyboard:
 *     Fila 114: Pitch
 *     Fila 115: Velocity
 *     Fila 116: Gate
 *
 * ─────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * @example
 * const kb = new KeyboardModule(engine, 'panel4-keyboard-upper', 'upper', {
 *   ramps: { level: 0.06 }
 * });
 * kb.start();
 * kb.noteOn(66, 100);   // F#3, velocity 100
 * kb.noteOff(66);
 * kb.setPitchSpread(9);  // 1V/Oct
 *
 * @module modules/keyboard
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler, sendWorkletMessage, safeDisconnectAll } from '../utils/audio.js';
import { keyboardConfig } from '../configs/index.js';

const log = createLogger('KeyboardModule');

export class KeyboardModule extends Module {

  /**
   * @param {Object} engine - Instancia del AudioEngine
   * @param {string} id - Identificador único (ej: 'panel4-keyboard-upper')
   * @param {'upper'|'lower'} side - Qué teclado (para kind en outputs)
   * @param {Object} [config] - Configuración
   * @param {Object} [config.ramps] - Tiempos de rampa
   * @param {number} [config.ramps.level=0.06] - Rampa de nivel (s)
   */
  constructor(engine, id, side, config = {}) {
    super(engine, id, `Keyboard ${side === 'upper' ? 'Upper' : 'Lower'}`);

    this.side = side;
    this.config = {
      ramps: {
        level: config.ramps?.level ?? 0.06
      }
    };

    // Nodos de audio
    this.workletNode = null;
    this.splitter = null;
    this.pitchGain = null;
    this.velocityGain = null;
    this.gateGain = null;

    // Valores actuales de los diales del panel
    this.values = {
      pitchSpread: 9,      // 0-10, default 9 (1V/Oct)
      pitchOffset: 0,      // voltaje DC offset (-5..+5)
      invert: false,       // inverting buffer
      velocityLevel: 0,    // -5..+5, centro
      gateLevel: 0,        // -5..+5, centro
      retrigger: 0         // 0 = Kbd (key release only), 1 = On (retrigger on new pitch)
    };

    this.isStarted = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Crea los nodos de audio: worklet → splitter → 3 GainNodes.
   * @private
   */
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    try {
      // WorkletNode con 3 canales de salida
      this.workletNode = new AudioWorkletNode(ctx, 'keyboard', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [3],
        processorOptions: {
          pivotNote:          keyboardConfig.audio?.pivotNote,
          spreadUnity:        keyboardConfig.audio?.spreadUnity,
          semitonesPerOctave: keyboardConfig.audio?.semitonesPerOctave,
          retriggerGapMs:     keyboardConfig.audio?.retriggerGapMs
        }
      });
      attachProcessorErrorHandler(this.workletNode, 'keyboard');

      // Separar los 3 canales
      this.splitter = ctx.createChannelSplitter(3);
      this.workletNode.connect(this.splitter);

      // GainNode para Pitch (pass-through, gain=1)
      this.pitchGain = ctx.createGain();
      this.pitchGain.gain.value = 1;
      this.splitter.connect(this.pitchGain, 0);

      // GainNode para Velocity (pass-through, gain=1)
      this.velocityGain = ctx.createGain();
      this.velocityGain.gain.value = 1;
      this.splitter.connect(this.velocityGain, 1);

      // GainNode para Gate (pass-through, gain=1)
      this.gateGain = ctx.createGain();
      this.gateGain.gain.value = 1;
      this.splitter.connect(this.gateGain, 2);

      // Registrar salidas para el sistema de ruteo
      const kindPrefix = this.side === 'upper' ? 'keyboardUpper' : 'keyboardLower';
      this.outputs.push(
        { id: 'pitch',    kind: kindPrefix, node: this.pitchGain,    label: `Keyboard ${this.side} Pitch` },
        { id: 'velocity', kind: kindPrefix, node: this.velocityGain, label: `Keyboard ${this.side} Velocity` },
        { id: 'gate',     kind: kindPrefix, node: this.gateGain,     label: `Keyboard ${this.side} Gate` }
      );

      // Aplicar valores actuales al worklet
      this._sendToWorklet('setPitchSpread', this.values.pitchSpread);
      this._sendToWorklet('setPitchOffset', this.values.pitchOffset);
      this._sendToWorklet('setInvert', this.values.invert);
      this._sendToWorklet('setVelocityLevel', this.values.velocityLevel);
      this._sendToWorklet('setGateLevel', this.values.gateLevel);
      this._sendToWorklet('setRetrigger', this.values.retrigger);

      log.info(`${this.id}] Audio nodes initialized (3 outputs)`);

    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NOTA MIDI → WORKLET
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Envía un noteOn al worklet.
   * @param {number} note - MIDI note number (0-127)
   * @param {number} velocity - MIDI velocity (1-127)
   */
  noteOn(note, velocity) {
    if (!this.workletNode) return;
    sendWorkletMessage(this.workletNode, { type: 'noteOn', note, velocity });
  }

  /**
   * Envía un noteOff al worklet.
   * @param {number} note - MIDI note number (0-127)
   */
  noteOff(note) {
    if (!this.workletNode) return;
    sendWorkletMessage(this.workletNode, { type: 'noteOff', note });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS (diales del panel)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Establece el Pitch Spread (rango de intervalo entre teclas).
   * @param {number} dialValue - Valor del dial (0-10), 9 = 1V/Oct
   */
  setPitchSpread(dialValue) {
    this.values.pitchSpread = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setPitchSpread', this.values.pitchSpread);
  }

  /**
   * Establece el Pitch Offset (transposición DC).
   * @param {number} dialValue - Valor del dial (-5 a +5)
   */
  setPitchOffset(dialValue) {
    this.values.pitchOffset = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setPitchOffset', this.values.pitchOffset);
  }

  /**
   * Establece el inverting buffer.
   * @param {boolean} invert - true para invertir polaridad del pitch
   */
  setInvert(invert) {
    this.values.invert = !!invert;
    if (this._isDormant) return;
    this._sendToWorklet('setInvert', this.values.invert);
  }

  /**
   * Establece el Velocity Level.
   * @param {number} dialValue - Valor del dial (-5 a +5)
   */
  setVelocityLevel(dialValue) {
    this.values.velocityLevel = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setVelocityLevel', this.values.velocityLevel);
  }

  /**
   * Establece el Gate/Envelope Trigger Level.
   * @param {number} dialValue - Valor del dial (-5 a +5)
   */
  setGateLevel(dialValue) {
    this.values.gateLevel = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setGateLevel', this.values.gateLevel);
  }

  /**
   * Establece el modo de retrigger.
   * @param {number} mode - 0 = Kbd (key release only), 1 = On (retrigger on new pitch)
   */
  setRetrigger(mode) {
    this.values.retrigger = mode === 1 ? 1 : 0;
    if (this._isDormant) return;
    this._sendToWorklet('setRetrigger', this.values.retrigger);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Serializa el estado del módulo para guardar en patch.
   * @returns {{ pitchSpread: number, pitchOffset: number, velocityLevel: number, gateLevel: number, retrigger: number }}
   */
  serialize() {
    return {
      pitchSpread: this.values.pitchSpread,
      pitchOffset: this.values.pitchOffset,
      velocityLevel: this.values.velocityLevel,
      gateLevel: this.values.gateLevel,
      retrigger: this.values.retrigger
    };
  }

  /**
   * Restaura el estado del módulo desde un patch guardado.
   * @param {{ pitchSpread?: number, pitchOffset?: number, velocityLevel?: number, gateLevel?: number, retrigger?: number }} data
   */
  deserialize(data) {
    if (!data) return;
    if (data.pitchSpread !== undefined) this.setPitchSpread(data.pitchSpread);
    if (data.pitchOffset !== undefined) this.setPitchOffset(data.pitchOffset);
    if (data.velocityLevel !== undefined) this.setVelocityLevel(data.velocityLevel);
    if (data.gateLevel !== undefined) this.setGateLevel(data.gateLevel);
    if (data.retrigger !== undefined) this.setRetrigger(data.retrigger);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {GainNode|null} Nodo de salida de Pitch */
  getPitchNode() {
    if (!this.pitchGain) this._initAudioNodes();
    return this.pitchGain;
  }

  /** @returns {GainNode|null} Nodo de salida de Velocity */
  getVelocityNode() {
    if (!this.velocityGain) this._initAudioNodes();
    return this.velocityGain;
  }

  /** @returns {GainNode|null} Nodo de salida de Gate */
  getGateNode() {
    if (!this.gateGain) this._initAudioNodes();
    return this.gateGain;
  }

  /**
   * Obtiene el nodo de salida por identificador.
   * @param {string} outputId - 'pitch', 'velocity' o 'gate'
   * @returns {GainNode|null}
   */
  getOutputNode(outputId) {
    switch (outputId) {
      case 'pitch':    return this.getPitchNode();
      case 'velocity': return this.getVelocityNode();
      case 'gate':     return this.getGateNode();
      default:         return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ─────────────────────────────────────────────────────────────────────────

  /** Arranca el módulo (lazy init). */
  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    this.isStarted = true;
    log.info(`${this.id}] Started`);
  }

  /** Detiene y libera todos los nodos de audio. */
  stop() {
    if (!this.isStarted || !this.workletNode) return;
    try {
      sendWorkletMessage(this.workletNode, { type: 'stop' });
      safeDisconnectAll(this.workletNode, this.splitter, this.pitchGain, this.velocityGain, this.gateGain);

      this.workletNode = null;
      this.splitter = null;
      this.pitchGain = null;
      this.velocityGain = null;
      this.gateGain = null;
      this.outputs.length = 0;
      this.isStarted = false;

      log.info(`${this.id}] Stopped`);
    } catch (error) {
      log.error(`${this.id}] Error deteniendo:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DORMANCY
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Callback de cambio de dormancy.
   * Al dormir: silencia las 3 salidas.
   * Al despertar: restaura gains y re-envía parámetros al worklet.
   * @param {boolean} dormant
   * @protected
   */
  _onDormancyChange(dormant) {
    sendWorkletMessage(this.workletNode, { type: 'setDormant', dormant });

    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const rampTime = 0.01;
    const now = ctx.currentTime;

    if (dormant) {
      this._rampGain(this.pitchGain, 0, now, rampTime);
      this._rampGain(this.velocityGain, 0, now, rampTime);
      this._rampGain(this.gateGain, 0, now, rampTime);
    } else {
      // Restaurar pass-through gains
      this._rampGain(this.pitchGain, 1, now, rampTime);
      this._rampGain(this.velocityGain, 1, now, rampTime);
      this._rampGain(this.gateGain, 1, now, rampTime);

      // Restaurar parámetros del worklet
      this._sendToWorklet('setPitchSpread', this.values.pitchSpread);
      this._sendToWorklet('setPitchOffset', this.values.pitchOffset);
      this._sendToWorklet('setInvert', this.values.invert);
      this._sendToWorklet('setVelocityLevel', this.values.velocityLevel);
      this._sendToWorklet('setGateLevel', this.values.gateLevel);
      this._sendToWorklet('setRetrigger', this.values.retrigger);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS INTERNOS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Envía un mensaje al worklet.
   * @param {string} type - Tipo de mensaje
   * @param {*} value - Valor a enviar
   * @private
   */
  _sendToWorklet(type, value) {
    sendWorkletMessage(this.workletNode, { type, value });
  }

}

