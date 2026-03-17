/**
 * RingModulatorModule — Modulador de Anillo de Precisión
 *
 * Emula el modulador de anillo del Synthi 100 (placa PC-05, D100-05 C1).
 * Multiplicador activo sin transformador basado en chip 4214AP.
 *
 * Cadena de audio:
 *   inputGainA → ┐
 *                ├→ ring-modulator.worklet → outputGain(level)
 *   inputGainB → ┘
 *
 * Controles:
 *   - Level (0-10): ganancia de salida con curva logarítmica (base 100)
 *
 * @version 1.0.0
 */

import { Module, setParamSmooth } from '../core/engine.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';
import { createLogger } from '../utils/logger.js';
import { ringModulatorConfig } from '../configs/index.js';
import { clamp } from '../utils/math.js';
import { dialToLogGain } from '../utils/audioConversions.js';

const log = createLogger('RingModulatorModule');

export class RingModulatorModule extends Module {
  constructor(engine, id, options = {}) {
    const index = options.index ?? 1;
    super(engine, id, `Ring Mod ${index}`);

    this.index = index;
    this.sourceKind = options.sourceKind || 'ringModulator';
    this.audioConfig = {
      levelLogBase: options.audio?.levelLogBase ?? 100
    };
    this.ramps = {
      level: options.ramps?.level ?? 0.06
    };

    this.values = {
      level: options.initialValues?.level ?? 0
    };

    this.inputGainA = null;
    this.inputGainB = null;
    this.workletNode = null;
    this.outputGain = null;
    this.isStarted = false;
  }

  /**
   * Convierte el valor del dial (0-10) a ganancia con curva logarítmica.
   * Dial 0 → gain 0 (silencio), Dial 10 → gain 1 (máximo).
   * Emula el potenciómetro 10K LOG del hardware.
   */
  _levelDialToGain(dialValue) {
    return dialToLogGain(dialValue, this.audioConfig.levelLogBase);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) {
      return;
    }

    // Nodos de ganancia de entrada (unity gain, para proporcionar destinos de conexión)
    this.inputGainA = ctx.createGain();
    this.inputGainA.gain.value = 1;

    this.inputGainB = ctx.createGain();
    this.inputGainB.gain.value = 1;

    // AudioWorkletNode con 2 entradas (A y B)
    this.workletNode = new AudioWorkletNode(ctx, 'ring-modulator', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        softClipThreshold: ringModulatorConfig.audio?.softClipThreshold
      }
    });
    attachProcessorErrorHandler(this.workletNode, `ring-modulator[${this.id}]`);

    // Nodo de ganancia de salida (level)
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this._levelDialToGain(this.values.level);

    // Conectar cadena: inputA → worklet input 0, inputB → worklet input 1
    this.inputGainA.connect(this.workletNode, 0, 0);
    this.inputGainB.connect(this.workletNode, 0, 1);
    this.workletNode.connect(this.outputGain);

    // Registrar salida
    this.outputs.push({
      id: 'audio',
      kind: this.sourceKind,
      index: this.index - 1,
      node: this.outputGain,
      label: this.name
    });
  }

  start() {
    if (this.isStarted) {
      return;
    }

    this._initAudioNodes();
    this.isStarted = !!this.workletNode;
  }

  stop() {
    if (!this.isStarted) {
      return;
    }

    try {
      this.workletNode?.port?.postMessage({ type: 'stop' });
      this.inputGainA?.disconnect();
      this.inputGainB?.disconnect();
      this.workletNode?.disconnect();
      this.outputGain?.disconnect();
    } catch (error) {
      log.warn(`[${this.id}] stop error`, error);
    }

    this.inputGainA = null;
    this.inputGainB = null;
    this.workletNode = null;
    this.outputGain = null;
    this.outputs.length = 0;
    this.isStarted = false;
  }

  setLevel(value) {
    this.values.level = clamp(value, 0, 10);
    if (this._isDormant) {
      return;
    }
    this._applyLevel();
  }

  _applyLevel(targetValue = this.values.level) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.outputGain) {
      return;
    }
    setParamSmooth(this.outputGain.gain, this._levelDialToGain(targetValue), ctx, {
      ramp: this.ramps.level
    });
  }

  /**
   * Obtiene el nodo de entrada para conectar señales de audio.
   * @param {string} inputId - 'A' o 'B' (entrada del multiplicador)
   * @returns {GainNode|null}
   */
  getInputNode(inputId) {
    if (!this.inputGainA) {
      this._initAudioNodes();
    }
    if (inputId === 'A') return this.inputGainA;
    if (inputId === 'B') return this.inputGainB;
    return null;
  }

  getOutputNode() {
    if (!this.outputGain) {
      this._initAudioNodes();
    }
    return this.outputGain;
  }

  _onDormancyChange(dormant) {
    if (this.workletNode?.port) {
      this.workletNode.port.postMessage({ type: 'setDormant', dormant });
    }

    const ctx = this.getAudioCtx();
    if (!ctx || !this.outputGain) {
      return;
    }

    if (dormant) {
      setParamSmooth(this.outputGain.gain, 0, ctx, { ramp: 0.01 });
      return;
    }

    // Restaurar level al despertar
    this._applyLevel(this.values.level);
  }
}

export default RingModulatorModule;
