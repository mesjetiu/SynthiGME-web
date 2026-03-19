/**
 * OctaveFilterBankModule — Banco de Filtros de Ocho Octavas
 *
 * Emula el Eight-Octave Filter Bank del Synthi 100 (placa PC-22, D100-22C1).
 * Manipulador de formantes — NO controlado por voltaje.
 *
 * Cadena de audio:
 *   inputGain(1) → [8× BiquadFilter(bandpass)] → [8× bandGain] → sumNode → outputGain
 *
 * Cada banda es un filtro paso-banda de 2.º orden (12 dB/oct) con frecuencias
 * centrales: 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz.
 * Los 8 potenciómetros (10K log) controlan la amplitud de cada banda.
 *
 * @version 1.0.0
 */

import { Module, setParamSmooth } from '../core/engine.js';
import { safeDisconnectAll } from '../utils/audio.js';
import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/math.js';
import { dialToLogGain } from '../utils/audioConversions.js';

const log = createLogger('OctaveFilterBankModule');

const CENTER_FREQUENCIES = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
const BAND_COUNT = CENTER_FREQUENCIES.length;
const FILTER_Q = 1.414;         // √2 → ancho de banda ≈ 1 octava a -3 dB
const MAKEUP_GAIN_DB = 10;      // Compensación máxima por filtrado sustractivo

export class OctaveFilterBankModule extends Module {
  constructor(engine, id, options = {}) {
    super(engine, id, 'Octave Filter Bank');

    this.sourceKind = options.sourceKind || 'octaveFilterBank';
    this.audioConfig = {
      levelLogBase: options.audio?.levelLogBase ?? 100,
      filterQ: options.audio?.filterQ ?? FILTER_Q,
      makeupGainDb: options.audio?.makeupGainDb ?? MAKEUP_GAIN_DB
    };
    this.ramps = {
      bandLevel: options.ramps?.bandLevel ?? 0.03
    };

    // Valores de dial (0-10) para cada banda
    this.values = {
      bands: new Array(BAND_COUNT).fill(options.initialBandLevel ?? 0)
    };

    // Nodos de audio (null hasta _initAudioNodes)
    this.inputGain = null;
    this.filters = null;       // BiquadFilterNode[8]
    this.bandGains = null;     // GainNode[8]
    this.sumNode = null;       // GainNode (sumador)
    this.outputGain = null;    // GainNode (makeup gain)
    this.isStarted = false;
  }

  _bandDialToGain(dialValue) {
    return dialToLogGain(dialValue, this.audioConfig.levelLogBase);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.filters) return;

    // Nodo de entrada
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;

    // 8 filtros bandpass en paralelo + gain por banda
    this.filters = new Array(BAND_COUNT);
    this.bandGains = new Array(BAND_COUNT);

    // Nodo sumador: recibe las 8 bandas
    this.sumNode = ctx.createGain();
    // Ganancia de compensación: 10 dB ≈ 3.162
    const makeupLinear = Math.pow(10, this.audioConfig.makeupGainDb / 20);
    this.sumNode.gain.value = makeupLinear;

    for (let i = 0; i < BAND_COUNT; i++) {
      // Filtro paso-banda de 2.º orden
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = CENTER_FREQUENCIES[i];
      filter.Q.value = this.audioConfig.filterQ;
      this.filters[i] = filter;

      // Gain por banda (controlado por el knob correspondiente)
      const gain = ctx.createGain();
      gain.gain.value = this._bandDialToGain(this.values.bands[i]);
      this.bandGains[i] = gain;

      // Conexión: input → filter → bandGain → sumNode
      this.inputGain.connect(filter);
      filter.connect(gain);
      gain.connect(this.sumNode);
    }

    // Nodo de salida
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;
    this.sumNode.connect(this.outputGain);

    // Registrar salida para la matriz de routing (Panel 5)
    this.outputs.push({
      id: 'audio',
      kind: this.sourceKind,
      index: 0,
      node: this.outputGain,
      label: this.name
    });

    log.info(`Inicializado: ${BAND_COUNT} bandas, Q=${this.audioConfig.filterQ}, makeup=${this.audioConfig.makeupGainDb}dB`);
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    this.isStarted = !!this.filters;
  }

  stop() {
    if (!this.isStarted) return;

    try {
      const allNodes = [
        this.inputGain,
        ...(this.filters || []),
        ...(this.bandGains || []),
        this.sumNode,
        this.outputGain
      ].filter(Boolean);
      safeDisconnectAll(...allNodes);
    } catch (error) {
      log.warn(`[${this.id}] stop error`, error);
    }

    this.inputGain = null;
    this.filters = null;
    this.bandGains = null;
    this.sumNode = null;
    this.outputGain = null;
    this.outputs.length = 0;
    this.isStarted = false;
  }

  /**
   * Ajusta el nivel de una banda individual.
   * @param {number} bandIndex — Índice 0-7
   * @param {number} value — Dial 0-10
   */
  setBandLevel(bandIndex, value) {
    if (bandIndex < 0 || bandIndex >= BAND_COUNT) return;
    this.values.bands[bandIndex] = clamp(value, 0, 10);
    if (this._isDormant) return;
    this._applyBandLevel(bandIndex);
  }

  _applyBandLevel(bandIndex) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.bandGains?.[bandIndex]) return;
    setParamSmooth(
      this.bandGains[bandIndex].gain,
      this._bandDialToGain(this.values.bands[bandIndex]),
      ctx,
      { ramp: this.ramps.bandLevel }
    );
  }

  getInputNode() {
    if (!this.inputGain) this._initAudioNodes();
    return this.inputGain;
  }

  getOutputNode() {
    if (!this.outputGain) this._initAudioNodes();
    return this.outputGain;
  }

  _onDormancyChange(dormant) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.sumNode) return;

    if (dormant) {
      setParamSmooth(this.sumNode.gain, 0, ctx, { ramp: 0.01 });
    } else {
      // Restaurar makeup gain y niveles de banda
      const makeupLinear = Math.pow(10, this.audioConfig.makeupGainDb / 20);
      setParamSmooth(this.sumNode.gain, makeupLinear, ctx, { ramp: 0.01 });
      for (let i = 0; i < BAND_COUNT; i++) {
        this._applyBandLevel(i);
      }
    }
  }
}

export default OctaveFilterBankModule;
