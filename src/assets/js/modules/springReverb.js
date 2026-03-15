/**
 * SpringReverbModule — Módulo de Reverberación de Muelle
 *
 * Emula la reverberación de muelle del Synthi 100 (placa PC-16, D100-16 C1).
 *
 * Cadena de audio:
 *   inputGain(1) → springReverb.worklet → outputGain(level)
 *
 * Controles:
 *   - Mix (0-10): proporción dry/wet, controlable por CV (AudioParam mixControl)
 *   - Level (0-10): ganancia de salida con curva logarítmica (base 100)
 *
 * @version 1.0.0
 */

import { Module, setParamSmooth } from '../core/engine.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';
import { createLogger } from '../utils/logger.js';
import { reverberationConfig } from '../configs/index.js';

const log = createLogger('SpringReverbModule');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class SpringReverbModule extends Module {
  constructor(engine, id, options = {}) {
    const index = options.index ?? 1;
    super(engine, id, `Reverb ${index}`);

    this.index = index;
    this.sourceKind = options.sourceKind || 'reverberation';
    this.audioConfig = {
      levelLogBase: options.audio?.levelLogBase ?? 100
    };
    this.ramps = {
      level: options.ramps?.level ?? 0.06,
      mix: options.ramps?.mix ?? 0.05
    };

    this.values = {
      mix: options.initialValues?.mix ?? 0,
      level: options.initialValues?.level ?? 0
    };

    this.inputGain = null;
    this.workletNode = null;
    this.outputGain = null;
    this.isStarted = false;
  }

  _levelDialToGain(dialValue) {
    const clamped = clamp(dialValue, 0, 10);
    if (clamped <= 0) {
      return 0;
    }
    const normalized = clamped / 10;
    const base = this.audioConfig.levelLogBase;
    return (Math.pow(base, normalized) - 1) / (base - 1);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) {
      return;
    }

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;

    this.workletNode = new AudioWorkletNode(ctx, 'spring-reverb', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        mixControl: 0
      },
      processorOptions: {
        spring1DelayMs: reverberationConfig.audio?.spring1DelayMs,
        spring2DelayMs: reverberationConfig.audio?.spring2DelayMs,
        maxReverbTimeS: reverberationConfig.audio?.maxReverbTimeS,
        dampingFreqHz:  reverberationConfig.audio?.dampingFreqHz,
        allpassCoeff:   reverberationConfig.audio?.allpassCoeff,
        inputClipDrive: reverberationConfig.audio?.inputClipDrive
      }
    });
    attachProcessorErrorHandler(this.workletNode, `spring-reverb[${this.id}]`);

    // Enviar mix inicial al worklet
    this.workletNode.port.postMessage({ type: 'setMix', value: this.values.mix });

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = this._levelDialToGain(this.values.level);

    this.inputGain.connect(this.workletNode);
    this.workletNode.connect(this.outputGain);

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
      this.inputGain?.disconnect();
      this.workletNode?.disconnect();
      this.outputGain?.disconnect();
    } catch (error) {
      log.warn(`[${this.id}] stop error`, error);
    }

    this.inputGain = null;
    this.workletNode = null;
    this.outputGain = null;
    this.outputs.length = 0;
    this.isStarted = false;
  }

  setMix(value) {
    this.values.mix = clamp(value, 0, 10);
    if (this._isDormant) {
      return;
    }
    this.workletNode?.port?.postMessage({ type: 'setMix', value: this.values.mix });
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

  getInputNode() {
    if (!this.inputGain) {
      this._initAudioNodes();
    }
    return this.inputGain;
  }

  getOutputNode() {
    if (!this.outputGain) {
      this._initAudioNodes();
    }
    return this.outputGain;
  }

  getMixCVParam() {
    if (!this.workletNode) {
      this._initAudioNodes();
    }
    return this.workletNode?.parameters?.get('mixControl') ?? null;
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

    // Restaurar level y mix al despertar
    this._applyLevel(this.values.level);
    this.workletNode?.port?.postMessage({ type: 'setMix', value: this.values.mix });
  }
}

export default SpringReverbModule;
