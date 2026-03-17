/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PITCH TO VOLTAGE CONVERTER MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de audio para el Convertidor Pitch a Voltaje.
 * Emula la placa PC-25 del EMS Synthi 100 versión Cuenca/GME.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CIRCUITO REAL (Plano D100-25 C1)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Convierte la frecuencia fundamental de una señal de audio entrante
 * en un voltaje de control DC proporcional (1V/Octava).
 * Usa detección de cruces por cero (half-cycle period measurement).
 * Track & Hold: mantiene último voltaje válido cuando la señal decae.
 * Rango fiable: ~250 Hz - 8 kHz.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CADENA DE AUDIO (Web Audio API)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   inputGain ──→ PitchToVoltageConverterProcessor ──→ outputGain
 *   (Panel 5)         (1 in → 1 out DC)                (Panel 6)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ENTRADAS EN MATRIZ DE AUDIO (Panel 5)
 * ─────────────────────────────────────────────────────────────────────────
 *   Columna 50: Audio Input
 *
 * SALIDAS EN MATRIZ DE CONTROL (Panel 6)
 * ─────────────────────────────────────────────────────────────────────────
 *   Fila 121: Voltage Output
 *
 * @module modules/pitchToVoltageConverter
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler, sendWorkletMessage } from '../utils/audio.js';
import { pitchToVoltageConverterConfig } from '../configs/index.js';

const log = createLogger('PVCModule');

export class PitchToVoltageConverterModule extends Module {

  /**
   * @param {Object} engine - Instancia del AudioEngine
   * @param {string} id - Identificador único (ej: 'panel4-pvc')
   * @param {Object} [config] - Configuración
   * @param {Object} [config.ramps] - Tiempos de rampa
   * @param {number} [config.ramps.level=0.06] - Rampa de nivel (s)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Pitch to Voltage Converter');

    this.config = {
      ramps: {
        level: config.ramps?.level ?? pitchToVoltageConverterConfig.ramps?.level ?? 0.06
      }
    };

    // Nodos de audio
    this.workletNode = null;
    this.inputGain = null;
    this.outputGain = null;
    this._keepaliveGain = null;

    // Valores actuales del dial
    this.values = {
      range: config.range ?? pitchToVoltageConverterConfig.knobs?.range?.initial ?? 7
    };

    this.isStarted = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN DE AUDIO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Crea los nodos de audio: inputGain → worklet → outputGain.
   * @private
   */
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    try {
      // WorkletNode: 1 input (audio), 1 output (DC voltage)
      this.workletNode = new AudioWorkletNode(ctx, 'pitch-to-voltage-converter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });
      attachProcessorErrorHandler(this.workletNode, 'pitch-to-voltage-converter');

      // GainNode de entrada (punto de conexión para Panel 5)
      this.inputGain = ctx.createGain();
      this.inputGain.gain.value = 1;
      this.inputGain.connect(this.workletNode);

      // GainNode de salida (punto de conexión para Panel 6)
      this.outputGain = ctx.createGain();
      this.outputGain.gain.value = 1;
      this.workletNode.connect(this.outputGain);

      // Keepalive: ganancia 0 al destination (mantiene process() activo)
      this._keepaliveGain = ctx.createGain();
      this._keepaliveGain.gain.value = 0;
      this.workletNode.connect(this._keepaliveGain);
      this._keepaliveGain.connect(ctx.destination);

      // Registrar input para el sistema de ruteo
      this.inputs.push({
        id: 'audio',
        kind: 'pitchToVoltageConverterInput',
        node: this.inputGain,
        label: 'PVC Audio In'
      });

      // Registrar output para el sistema de ruteo
      this.outputs.push({
        id: 'voltage',
        kind: 'pitchToVoltageConverter',
        node: this.outputGain,
        label: 'PVC Voltage Out'
      });

      // Enviar estado inicial al worklet
      this._sendToWorklet('setRange', this.values.range);

      log.info(`${this.id}] Audio nodes initialized (1 input, 1 output)`);

    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Establece el factor de spread (Pitch Range).
   * @param {number} dialValue - Valor del dial (0-10), 7 = unity (1:1)
   */
  setRange(dialValue) {
    this.values.range = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setRange', this.values.range);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Serializa el estado del módulo para guardar en patch.
   * @returns {{ range: number }}
   */
  serialize() {
    return { range: this.values.range };
  }

  /**
   * Restaura el estado del módulo desde un patch guardado.
   * @param {{ range?: number }} data
   */
  deserialize(data) {
    if (!data) return;
    if (data.range !== undefined) this.setRange(data.range);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────

  /** @returns {GainNode|null} Nodo de salida de voltaje */
  getVoltageNode() {
    if (!this.outputGain) this._initAudioNodes();
    return this.outputGain;
  }

  /** @returns {GainNode|null} Nodo de entrada de audio */
  getAudioInputNode() {
    if (!this.inputGain) this._initAudioNodes();
    return this.inputGain;
  }

  /**
   * Obtiene el nodo de salida por identificador.
   * @param {string} outputId - 'voltage'
   * @returns {GainNode|null}
   */
  getOutputNode(outputId) {
    if (outputId === 'voltage') return this.getVoltageNode();
    return null;
  }

  /**
   * Obtiene el nodo de entrada por identificador.
   * @param {string} inputId - 'audio'
   * @returns {GainNode|null}
   */
  getInputNode(inputId) {
    if (inputId === 'audio') return this.getAudioInputNode();
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ─────────────────────────────────────────────────────────────────────────

  /** Arranca el módulo (lazy init). */
  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
    log.info(`${this.id}] Started`);
  }

  /** Detiene y libera todos los nodos de audio. */
  stop() {
    if (!this.isStarted || !this.workletNode) return;
    try {
      sendWorkletMessage(this.workletNode, { type: 'stop' });
      this.workletNode.disconnect();
      if (this.inputGain) this.inputGain.disconnect();
      if (this.outputGain) this.outputGain.disconnect();
      if (this._keepaliveGain) this._keepaliveGain.disconnect();

      this.workletNode = null;
      this.inputGain = null;
      this.outputGain = null;
      this._keepaliveGain = null;
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

  /**
   * Callback de cambio de dormancy.
   * Al dormir: silencia entrada y salida.
   * Al despertar: restaura gains y re-envía parámetros.
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
      this._rampGain(this.inputGain, 0, now, rampTime);
      this._rampGain(this.outputGain, 0, now, rampTime);
    } else {
      this._rampGain(this.inputGain, 1, now, rampTime);
      this._rampGain(this.outputGain, 1, now, rampTime);

      // Restaurar parámetros
      this._sendToWorklet('setRange', this.values.range);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
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

  /**
   * Rampa de ganancia para dormancy.
   * @param {GainNode} gainNode
   * @param {number} targetGain
   * @param {number} now
   * @param {number} rampTime
   * @private
   */
  _rampGain(gainNode, targetGain, now, rampTime) {
    if (!gainNode) return;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(targetGain, now + rampTime);
  }
}
