/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENVELOPE SHAPER MODULE — Synthi 100 Cuenca (Datanomics 1982, CEM 3310)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de audio para el generador de envolvente ADSR+Delay.
 * Emula el CEM 3310 del EMS Synthi 100 versión Cuenca/GME.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CADENA DE AUDIO (Web Audio API)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Audio Input ──→ merger[0] ──┐
 *                               ├──→ EnvelopeShaperProcessor ──→ splitter
 *   Trigger In ───→ merger[1] ──┘         (2 canales)              │
 *                                                                   ├── [0] envGain → [output CV]
 *                                                                   └── [1] audioGain → [output Audio]
 *
 * El worklet aplica internamente:
 *   - Canal 0: envolvente × envelopeLevel (±1.25 digital = ±5V)
 *   - Canal 1: audioIn × envolvente × signalLevel (LOG, max 0.1875)
 *
 * Los GainNodes de salida están a ganancia 1 — solo sirven como
 * puntos de conexión para la matriz de ruteo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALIDAS EN MATRIZ (Panel 6)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Fila 97: Envelope 1 CV
 *   Fila 98: Envelope 2 CV
 *   Fila 99: Envelope 3 CV
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PANEL DE AUDIO (Panel 5)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Entradas  9-11: Señal de audio (VCA)
 *   Entradas 12-14: Trigger/Gate
 *   Salidas 118-120: Audio procesado
 *
 * @module modules/envelopeShaper
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';

const log = createLogger('EnvelopeShaperModule');

export class EnvelopeShaperModule extends Module {

  /**
   * @param {Object} engine - Instancia del AudioEngine
   * @param {string} id - Identificador único del módulo
   * @param {Object} [config] - Configuración
   * @param {Object} [config.ramps] - Tiempos de rampa
   * @param {number} [config.ramps.level=0.06] - Rampa de Signal Level (s)
   * @param {number} [config.ramps.envelope=0.01] - Rampa de Envelope Level (s)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Envelope Shaper');

    this.config = {
      ramps: {
        level: config.ramps?.level ?? 0.06,
        envelope: config.ramps?.envelope ?? 0.01
      }
    };

    // Nodos de audio
    this.workletNode = null;
    this.merger = null;
    this.splitter = null;
    this.envGain = null;      // Salida de envolvente CV
    this.audioGain = null;    // Salida de audio VCA
    this.audioInputGain = null;   // Entrada de audio
    this.triggerInputGain = null; // Entrada de trigger

    // Callback para notificar actividad (LED)
    this.onActiveChange = null;

    // Valores actuales de los diales
    this.values = {
      mode: 2,          // GATED
      delay: 0,
      attack: 0,
      decay: 5,
      sustain: 7,
      release: 3,
      envelopeLevel: 5,
      signalLevel: 0
    };

    this.isStarted = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    try {
      // WorkletNode: 1 input (2 canales: audio+trigger), 1 output (2 canales: env+audio)
      this.workletNode = new AudioWorkletNode(ctx, 'envelope-shaper', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit'
      });
      attachProcessorErrorHandler(this.workletNode, 'envelope-shaper');

      // Escuchar mensajes del worklet (estado de actividad para LED)
      this.workletNode.port.onmessage = (e) => {
        if (e.data?.type === 'active' && this.onActiveChange) {
          this.onActiveChange(e.data.value);
        }
      };

      // ChannelMerger para las 2 entradas
      this.merger = ctx.createChannelMerger(2);
      this.merger.connect(this.workletNode);

      // GainNodes de entrada (connect points para la matriz)
      this.audioInputGain = ctx.createGain();
      this.audioInputGain.gain.value = 1;
      this.audioInputGain.connect(this.merger, 0, 0);

      this.triggerInputGain = ctx.createGain();
      this.triggerInputGain.gain.value = 1;
      this.triggerInputGain.connect(this.merger, 0, 1);

      // ChannelSplitter para separar las 2 salidas
      this.splitter = ctx.createChannelSplitter(2);
      this.workletNode.connect(this.splitter);

      // GainNode de salida para envolvente CV (ganancia 1, point de conexión)
      this.envGain = ctx.createGain();
      this.envGain.gain.value = 1;
      this.splitter.connect(this.envGain, 0);

      // GainNode de salida para audio VCA (ganancia 1, point de conexión)
      this.audioGain = ctx.createGain();
      this.audioGain.gain.value = 1;
      this.splitter.connect(this.audioGain, 1);

      // Registrar salidas para el sistema de ruteo
      this.outputs.push(
        { id: 'envelope', kind: 'envelopeShaper', node: this.envGain, label: 'Envelope CV' },
        { id: 'audio',    kind: 'envelopeShaper', node: this.audioGain, label: 'Envelope Audio' }
      );

      // Registrar entradas
      this.inputs.push(
        { id: 'signal',  kind: 'envelopeShaper', node: this.audioInputGain,   label: 'Signal In' },
        { id: 'trigger', kind: 'envelopeShaper', node: this.triggerInputGain,  label: 'Trigger In' }
      );

      // Aplicar valores actuales al worklet
      this._sendToWorklet('setMode', this.values.mode);
      this._sendToWorklet('setDelay', this.values.delay);
      this._sendToWorklet('setAttack', this.values.attack);
      this._sendToWorklet('setDecay', this.values.decay);
      this._sendToWorklet('setSustain', this.values.sustain);
      this._sendToWorklet('setRelease', this.values.release);
      this._sendToWorklet('setEnvelopeLevel', this.values.envelopeLevel);
      this._sendToWorklet('setSignalLevel', this.values.signalLevel);

      log.info(`${this.id}] Audio nodes initialized (2 inputs, 2 outputs)`);

    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  setMode(value) {
    this.values.mode = Math.max(0, Math.min(4, Math.round(value)));
    this._sendToWorklet('setMode', this.values.mode);
  }

  setDelay(value) {
    this.values.delay = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setDelay', this.values.delay);
  }

  setAttack(value) {
    this.values.attack = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setAttack', this.values.attack);
  }

  setDecay(value) {
    this.values.decay = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setDecay', this.values.decay);
  }

  setSustain(value) {
    this.values.sustain = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setSustain', this.values.sustain);
  }

  setRelease(value) {
    this.values.release = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setRelease', this.values.release);
  }

  setEnvelopeLevel(value) {
    this.values.envelopeLevel = Math.max(-5, Math.min(5, value));
    this._sendToWorklet('setEnvelopeLevel', this.values.envelopeLevel);
  }

  setSignalLevel(value) {
    this.values.signalLevel = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setSignalLevel', this.values.signalLevel);
  }

  setGate(active) {
    this._sendToWorklet('gate', active);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────

  getEnvelopeNode() {
    if (!this.envGain) this._initAudioNodes();
    return this.envGain;
  }

  getAudioNode() {
    if (!this.audioGain) this._initAudioNodes();
    return this.audioGain;
  }

  getAudioInputNode() {
    if (!this.audioInputGain) this._initAudioNodes();
    return this.audioInputGain;
  }

  getTriggerInputNode() {
    if (!this.triggerInputGain) this._initAudioNodes();
    return this.triggerInputGain;
  }

  getOutputNode(outputId) {
    switch (outputId) {
      case 'envelope': return this.getEnvelopeNode();
      case 'audio':    return this.getAudioNode();
      default:         return null;
    }
  }

  getInputNode(inputId) {
    switch (inputId) {
      case 'signal':  return this.getAudioInputNode();
      case 'trigger': return this.getTriggerInputNode();
      default:        return null;
    }
  }

  getMode()          { return this.values.mode; }
  getDelay()         { return this.values.delay; }
  getAttack()        { return this.values.attack; }
  getDecay()         { return this.values.decay; }
  getSustain()       { return this.values.sustain; }
  getRelease()       { return this.values.release; }
  getEnvelopeLevel() { return this.values.envelopeLevel; }
  getSignalLevel()   { return this.values.signalLevel; }

  // ─────────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ─────────────────────────────────────────────────────────────────────────

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return; // AudioContext no disponible aún
    this.isStarted = true;
    log.info(`${this.id}] Started`);
  }

  stop() {
    if (!this.isStarted || !this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type: 'stop' });
      this.workletNode.disconnect();
      if (this.merger) this.merger.disconnect();
      if (this.splitter) this.splitter.disconnect();
      if (this.envGain) this.envGain.disconnect();
      if (this.audioGain) this.audioGain.disconnect();
      if (this.audioInputGain) this.audioInputGain.disconnect();
      if (this.triggerInputGain) this.triggerInputGain.disconnect();

      this.workletNode = null;
      this.merger = null;
      this.splitter = null;
      this.envGain = null;
      this.audioGain = null;
      this.audioInputGain = null;
      this.triggerInputGain = null;
      this.outputs.length = 0;
      this.inputs.length = 0;
      this.isStarted = false;

      log.info(`${this.id}] Stopped`);
    } catch (error) {
      log.error(`${this.id}] Error deteniendo:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DORMANCY
  // ─────────────────────────────────────────────────────────────────────────

  _onDormancyChange(dormant) {
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'setDormant', dormant });
      } catch (e) { /* ignore */ }
    }

    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const rampTime = 0.01;
    const now = ctx.currentTime;

    if (dormant) {
      this._rampGain(this.envGain, 0, now, rampTime);
      this._rampGain(this.audioGain, 0, now, rampTime);
    } else {
      this._rampGain(this.envGain, 1, now, rampTime);
      this._rampGain(this.audioGain, 1, now, rampTime);
      // Restaurar parámetros del worklet
      this._sendToWorklet('setMode', this.values.mode);
      this._sendToWorklet('setDelay', this.values.delay);
      this._sendToWorklet('setAttack', this.values.attack);
      this._sendToWorklet('setDecay', this.values.decay);
      this._sendToWorklet('setSustain', this.values.sustain);
      this._sendToWorklet('setRelease', this.values.release);
      this._sendToWorklet('setEnvelopeLevel', this.values.envelopeLevel);
      this._sendToWorklet('setSignalLevel', this.values.signalLevel);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type, value });
    } catch (e) { /* ignore */ }
  }

  _rampGain(gainNode, targetGain, now, rampTime) {
    if (!gainNode) return;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(targetGain, now, rampTime);
    } catch (e) { /* ignore */ }
  }
}
