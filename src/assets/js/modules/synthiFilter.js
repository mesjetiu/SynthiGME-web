import { Module, setParamSmooth } from '../core/engine.js';
import { attachProcessorErrorHandler, sendWorkletMessage } from '../utils/audio.js';
import { createLogger } from '../utils/logger.js';
import { clamp } from '../utils/math.js';
import { dialToLogGain } from '../utils/audioConversions.js';

const log = createLogger('SynthiFilterModule');
const DIGITAL_TO_VOLTAGE = 4.0;

export class SynthiFilterModule extends Module {
  constructor(engine, id, options = {}) {
    const mode = options.mode === 'highpass' ? 'highpass' : 'lowpass';
    const index = options.index ?? 1;
    super(engine, id, mode === 'lowpass' ? `Filter LP ${index}` : `Filter HP ${index}`);

    this.mode = mode;
    this.index = index;
    this.sourceKind = options.sourceKind || (mode === 'lowpass' ? 'filterLP' : 'filterHP');
    this.audioConfig = {
      minCutoffHz: options.audio?.minCutoffHz ?? 3,
      maxCutoffHz: options.audio?.maxCutoffHz ?? 20000,
      referenceCutoffHz: options.audio?.referenceCutoffHz ?? 320,
      octaveDialSpan: options.audio?.octaveDialSpan ?? 0.7,
      voltsPerOctave: options.audio?.voltsPerOctave ?? 0.55,
      levelLogBase: options.audio?.levelLogBase ?? 100,
      selfOscillationThresholdDial: options.audio?.selfOscillationThresholdDial ?? 5.5,
      inputDriveBoost: options.audio?.inputDriveBoost ?? 1.4,
      lpDrive: options.audio?.lpDrive ?? 1.15
    };
    this.ramps = {
      frequency: options.ramps?.frequency ?? 0.03,
      response: options.ramps?.response ?? 0.04,
      level: options.ramps?.level ?? 0.03
    };

    this.values = {
      frequency: options.initialValues?.frequency ?? 5,
      response: options.initialValues?.response ?? 0,
      level: options.initialValues?.level ?? 0
    };

    this.inputGain = null;
    this.workletNode = null;
    this.outputGain = null;
    this.isStarted = false;
  }

  _frequencyDialToControl(dialValue) {
    const clamped = clamp(dialValue, 0, 10);
    const octaves = (clamped - 5) / this.audioConfig.octaveDialSpan;
    const volts = octaves * this.audioConfig.voltsPerOctave;
    return volts / DIGITAL_TO_VOLTAGE;
  }

  _levelDialToGain(dialValue) {
    return dialToLogGain(dialValue, this.audioConfig.levelLogBase);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) {
      return;
    }

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;

    this.workletNode = new AudioWorkletNode(ctx, 'synthi-filter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        cutoffControl: this._frequencyDialToControl(this.values.frequency),
        response: this.values.response
      },
      processorOptions: {
        mode: this.mode,
        minCutoffHz: this.audioConfig.minCutoffHz,
        maxCutoffHz: this.audioConfig.maxCutoffHz,
        referenceCutoffHz: this.audioConfig.referenceCutoffHz,
        voltsPerOctave: this.audioConfig.voltsPerOctave,
        selfOscillationThresholdDial: this.audioConfig.selfOscillationThresholdDial,
        inputDriveBoost: this.audioConfig.inputDriveBoost,
        lpDrive: this.audioConfig.lpDrive
      }
    });
    attachProcessorErrorHandler(this.workletNode, `synthi-filter[${this.id}]`);

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
      sendWorkletMessage(this.workletNode, { type: 'stop' });
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

  setFrequency(value) {
    this.values.frequency = clamp(value, 0, 10);
    if (this._isDormant) {
      return;
    }

    const param = this.workletNode?.parameters?.get('cutoffControl');
    const ctx = this.getAudioCtx();
    if (param && ctx) {
      setParamSmooth(param, this._frequencyDialToControl(this.values.frequency), ctx, {
        ramp: this.ramps.frequency
      });
    }
  }

  setResponse(value) {
    this.values.response = clamp(value, 0, 10);
    if (this._isDormant) {
      return;
    }

    const param = this.workletNode?.parameters?.get('response');
    const ctx = this.getAudioCtx();
    if (param && ctx) {
      setParamSmooth(param, this.values.response, ctx, {
        ramp: this.ramps.response
      });
    }
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

  getCutoffCVParam() {
    if (!this.workletNode) {
      this._initAudioNodes();
    }
    return this.workletNode?.parameters?.get('cutoffControl') ?? null;
  }

  _onDormancyChange(dormant) {
    sendWorkletMessage(this.workletNode, { type: 'setDormant', dormant });

    const ctx = this.getAudioCtx();
    if (!ctx || !this.outputGain) {
      return;
    }

    if (dormant) {
      setParamSmooth(this.outputGain.gain, 0, ctx, { ramp: 0.01 });
      return;
    }

    this._applyLevel(this.values.level);

    const cutoffParam = this.workletNode?.parameters?.get('cutoffControl');
    const responseParam = this.workletNode?.parameters?.get('response');
    if (cutoffParam) {
      setParamSmooth(cutoffParam, this._frequencyDialToControl(this.values.frequency), ctx, {
        ramp: this.ramps.frequency
      });
    }
    if (responseParam) {
      setParamSmooth(responseParam, this.values.response, ctx, {
        ramp: this.ramps.response
      });
    }
  }
}

export default SynthiFilterModule;
