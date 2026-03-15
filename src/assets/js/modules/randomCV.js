/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RANDOM CONTROL VOLTAGE MODULE — Synthi 100 Cuenca (Datanomics 1982)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Módulo de audio para el generador de voltaje de control aleatorio.
 * Emula la placa PC-21 del EMS Synthi 100 versión Cuenca/GME.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CIRCUITO REAL (Plano D100-21 C1)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Fuente de ruido: Unión N-P del transistor Q1 en polarización inversa.
 * Arquitectura: Intercepta un generador de rampa cuya pendiente es
 * proporcional a la amplitud del ruido procesado.
 * Componentes clave: Operacionales CA3140, oscilador de unijuntura (Q13).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CADENA DE AUDIO (Web Audio API)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   RandomCVProcessor (3 canales)
 *       │
 *       ├── canal 0 ──→ ChannelSplitter ──→ voltage1Gain ──→ [output V1]
 *       │                      │
 *       ├── canal 1 ───────────┤──→ voltage2Gain ──→ [output V2]
 *       │                      │
 *       └── canal 2 ───────────┘──→ keyGain ──→ [output Key]
 *
 * El worklet genera señales normalizadas (±1). Los GainNodes aplican
 * la amplitud final, escalada a unidades digitales (1 digital = 4V):
 *   - V1, V2: curva LOG (pot 10K), ±2.5V = ±0.625 digital (gain 0→0.625)
 *   - Key: lineal bipolar, ±5V = ±1.25 digital (gain -1.25→+1.25)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SALIDAS EN MATRIZ DE CONTROL (Panel 6)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Fila 89: Key Pulse
 *   Fila 90: Voltage 1
 *   Fila 91: Voltage 2
 *
 * ─────────────────────────────────────────────────────────────────────────
 * USO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * @example
 * const rcvg = new RandomCVModule(engine, 'panel3-random-cv', {
 *   levelCurve: { logBase: 100 },
 *   ramps: { level: 0.06, mean: 0.05 }
 * });
 * // Lazy start: no arranca hasta que se conecta un pin en Panel 6
 * rcvg.start();
 * rcvg.setMean(2.0);       // ~4.5 Hz
 * rcvg.setVariance(3.0);   // 80% varianza
 * rcvg.setVoltage1Level(7); // ~±1.5V
 * rcvg.setKeyLevel(5);     // +5V pulsos
 *
 * @module modules/randomCV
 */

import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';
import { randomVoltageConfig } from '../configs/index.js';

const log = createLogger('RandomCVModule');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DE VOLTAJE
// ─────────────────────────────────────────────────────────────────────────────

/** Conversión digital ↔ voltaje: 1 unidad digital = 4V @see voltageConstants.js */
const DIGITAL_TO_VOLTAGE = 4.0;

/** Voltaje pico de salida V1/V2 (±V) — plano D100-21 */
const VOLTAGE_PEAK = randomVoltageConfig.audio?.maxVoltage ?? 2.5;

/** Voltaje pico del pulso Key (±V) — dial ±5 → ±5V */
const KEY_VOLTAGE_PEAK = randomVoltageConfig.audio?.keyMaxVoltage ?? 5.0;

export class RandomCVModule extends Module {
  
  /**
   * @param {Object} engine - Instancia del AudioEngine
   * @param {string} id - Identificador único del módulo
   * @param {Object} [config] - Configuración
   * @param {Object} [config.levelCurve] - Curva del potenciómetro de nivel
   * @param {number} [config.levelCurve.logBase=100] - Base logarítmica
   * @param {Object} [config.ramps] - Tiempos de rampa
   * @param {number} [config.ramps.level=0.06] - Rampa de nivel (s)
   * @param {number} [config.ramps.mean=0.05] - Rampa de mean (s)
   */
  constructor(engine, id, config = {}) {
    super(engine, id, 'Random CV');
    
    this.config = {
      levelCurve: {
        logBase: config.levelCurve?.logBase ?? 100
      },
      ramps: {
        level: config.ramps?.level ?? 0.06,
        mean: config.ramps?.mean ?? 0.05
      }
    };
    
    // Nodos de audio
    this.workletNode = null;
    this.splitter = null;
    this.voltage1Gain = null;
    this.voltage2Gain = null;
    this.keyGain = null;
    
    // Valores actuales de los diales
    this.values = {
      mean: 0,
      variance: 0,
      voltage1: 0,
      voltage2: 0,
      key: 0
    };
    
    this.isStarted = false;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIONES DE DIAL
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Convierte valor de dial de nivel (0-10) a ganancia usando curva LOG.
   * Emula potenciómetro de 10K logarítmico (D100-21 W1).
   *
   * La ganancia se escala a unidades digitales: dial 10 → ±2.5V = ±0.625 digital.
   * (1 digital = DIGITAL_TO_VOLTAGE = 4V)
   *
   * @param {number} dial - Valor del dial (0-10)
   * @returns {number} Ganancia [0, 0.625] en unidades digitales
   * @private
   */
  _levelDialToGain(dial) {
    if (dial <= 0) return 0;
    const base = this.config.levelCurve.logBase;
    const normalized = dial / 10;
    const logGain = (Math.pow(base, normalized) - 1) / (base - 1);
    return logGain * VOLTAGE_PEAK / DIGITAL_TO_VOLTAGE;
  }
  
  /**
   * Convierte valor de dial Key (-5 a +5) a ganancia bipolar.
   * Dial -5 → gain -1.25 (pulso -5V), dial 0 → gain 0 (sin pulso),
   * dial +5 → gain +1.25 (pulso +5V).
   *
   * La ganancia se expresa en unidades digitales:
   *   dial ±5 → ±5V / 4V = ±1.25 digital
   *
   * @param {number} dial - Valor del dial (-5 a +5)
   * @returns {number} Ganancia [-1.25, +1.25] en unidades digitales
   * @private
   */
  _keyDialToGain(dial) {
    return dial * KEY_VOLTAGE_PEAK / (5 * DIGITAL_TO_VOLTAGE);
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
      this.workletNode = new AudioWorkletNode(ctx, 'random-cv', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [3],
        processorOptions: {
          minFreq:       randomVoltageConfig.audio?.minFreq,
          maxFreq:       randomVoltageConfig.audio?.maxFreq,
          keyPulseWidth: randomVoltageConfig.audio?.keyPulseWidth
        }
      });
      attachProcessorErrorHandler(this.workletNode, 'random-cv');
      
      // Separar los 3 canales
      this.splitter = ctx.createChannelSplitter(3);
      this.workletNode.connect(this.splitter);
      
      // GainNode para Voltage 1 (curva LOG, 0-1)
      this.voltage1Gain = ctx.createGain();
      this.voltage1Gain.gain.value = this._levelDialToGain(this.values.voltage1);
      this.splitter.connect(this.voltage1Gain, 0);
      
      // GainNode para Voltage 2 (curva LOG, 0-1)
      this.voltage2Gain = ctx.createGain();
      this.voltage2Gain.gain.value = this._levelDialToGain(this.values.voltage2);
      this.splitter.connect(this.voltage2Gain, 1);
      
      // GainNode para Key (lineal bipolar, -1 a +1)
      this.keyGain = ctx.createGain();
      this.keyGain.gain.value = this._keyDialToGain(this.values.key);
      this.splitter.connect(this.keyGain, 2);
      
      // Registrar salidas para el sistema de ruteo
      this.outputs.push(
        { id: 'voltage1', kind: 'randomCV', node: this.voltage1Gain, label: 'Random CV V1' },
        { id: 'voltage2', kind: 'randomCV', node: this.voltage2Gain, label: 'Random CV V2' },
        { id: 'key',      kind: 'randomCV', node: this.keyGain,      label: 'Random CV Key' }
      );
      
      // Aplicar valores actuales al worklet
      this._sendToWorklet('setMean', this.values.mean);
      this._sendToWorklet('setVariance', this.values.variance);
      
      log.info(`${this.id}] Audio nodes initialized (3 outputs)`);
      
    } catch (error) {
      log.error(`${this.id}] Error inicializando nodos:`, error);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Establece la frecuencia media del reloj.
   * @param {number} dialValue - Valor del dial Mean (-5 a +5)
   */
  setMean(dialValue) {
    this.values.mean = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setMean', this.values.mean);
  }
  
  /**
   * Establece la varianza temporal del reloj.
   * @param {number} dialValue - Valor del dial Variance (-5 a +5)
   */
  setVariance(dialValue) {
    this.values.variance = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setVariance', this.values.variance);
  }
  
  /**
   * Establece el nivel de Voltage 1 (curva LOG).
   * @param {number} dialValue - Valor del dial Voltage 1 (0-10)
   */
  setVoltage1Level(dialValue) {
    this.values.voltage1 = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    this._applyGain(this.voltage1Gain, this._levelDialToGain(this.values.voltage1));
  }
  
  /**
   * Establece el nivel de Voltage 2 (curva LOG).
   * @param {number} dialValue - Valor del dial Voltage 2 (0-10)
   */
  setVoltage2Level(dialValue) {
    this.values.voltage2 = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    this._applyGain(this.voltage2Gain, this._levelDialToGain(this.values.voltage2));
  }
  
  /**
   * Establece el nivel del pulso Key (lineal bipolar).
   * @param {number} dialValue - Valor del dial Key (-5 a +5)
   */
  setKeyLevel(dialValue) {
    this.values.key = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._applyGain(this.keyGain, this._keyDialToGain(this.values.key));
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────
  
  /** @returns {GainNode|null} Nodo de salida de Voltage 1 */
  getVoltage1Node() {
    if (!this.voltage1Gain) this._initAudioNodes();
    return this.voltage1Gain;
  }
  
  /** @returns {GainNode|null} Nodo de salida de Voltage 2 */
  getVoltage2Node() {
    if (!this.voltage2Gain) this._initAudioNodes();
    return this.voltage2Gain;
  }
  
  /** @returns {GainNode|null} Nodo de salida de Key Pulse */
  getKeyNode() {
    if (!this.keyGain) this._initAudioNodes();
    return this.keyGain;
  }
  
  /**
   * Obtiene el nodo de salida por identificador.
   * @param {string} outputId - 'voltage1', 'voltage2' o 'key'
   * @returns {GainNode|null}
   */
  getOutputNode(outputId) {
    switch (outputId) {
      case 'voltage1': return this.getVoltage1Node();
      case 'voltage2': return this.getVoltage2Node();
      case 'key':      return this.getKeyNode();
      default:         return null;
    }
  }
  
  getMean()     { return this.values.mean; }
  getVariance() { return this.values.variance; }
  
  // ─────────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Arranca el módulo (lazy init: no arranca hasta el primer pin en Panel 6). */
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
      this.workletNode.port.postMessage({ type: 'stop' });
      this.workletNode.disconnect();
      if (this.splitter) this.splitter.disconnect();
      if (this.voltage1Gain) this.voltage1Gain.disconnect();
      if (this.voltage2Gain) this.voltage2Gain.disconnect();
      if (this.keyGain) this.keyGain.disconnect();
      
      this.workletNode = null;
      this.splitter = null;
      this.voltage1Gain = null;
      this.voltage2Gain = null;
      this.keyGain = null;
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
   * Callback de cambio de estado de dormancy.
   * 
   * Al dormir: silencia las 3 salidas y detiene la generación en el worklet.
   * Al despertar: restaura los valores guardados en this.values.
   *
   * @param {boolean} dormant - true para dormir, false para despertar
   * @protected
   */
  _onDormancyChange(dormant) {
    // Notificar al worklet
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
      // Silenciar todas las salidas
      this._rampGain(this.voltage1Gain, 0, now, rampTime);
      this._rampGain(this.voltage2Gain, 0, now, rampTime);
      this._rampGain(this.keyGain, 0, now, rampTime);
    } else {
      // Restaurar valores desde this.values
      this._rampGain(this.voltage1Gain, this._levelDialToGain(this.values.voltage1), now, rampTime);
      this._rampGain(this.voltage2Gain, this._levelDialToGain(this.values.voltage2), now, rampTime);
      this._rampGain(this.keyGain, this._keyDialToGain(this.values.key), now, rampTime);
      
      // Restaurar parámetros del worklet
      this._sendToWorklet('setMean', this.values.mean);
      this._sendToWorklet('setVariance', this.values.variance);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS INTERNOS
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Envía un mensaje al worklet.
   * @param {string} type - Tipo de mensaje
   * @param {number} value - Valor a enviar
   * @private
   */
  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type, value });
    } catch (e) { /* ignore */ }
  }
  
  /**
   * Aplica una ganancia a un GainNode con rampa suave.
   * @param {GainNode} gainNode
   * @param {number} targetGain
   * @private
   */
  _applyGain(gainNode, targetGain) {
    if (!gainNode) return;
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(targetGain, now, this.config.ramps.level / 3);
  }
  
  /**
   * Rampa de ganancia para dormancy (tiempo fijo).
   * @param {GainNode} gainNode
   * @param {number} targetGain
   * @param {number} now
   * @param {number} rampTime
   * @private
   */
  _rampGain(gainNode, targetGain, now, rampTime) {
    if (!gainNode) return;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(targetGain, now, rampTime);
    } catch (e) { /* ignore */ }
  }
}
