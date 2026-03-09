const DIGITAL_TO_VOLTAGE = 4.0;
const MIN_CUTOFF_HZ = 3;
const MAX_CUTOFF_HZ = 20000;
const REFERENCE_CUTOFF_HZ = 320;
const VOLTS_PER_OCTAVE = 0.55;
const RESPONSE_SELF_OSC_THRESHOLD = 5.5;
const DEFAULT_INPUT_DRIVE_BOOST = 1.4;
const DEFAULT_HP_DIRTY_EVEN = 0.12;
const DEFAULT_HP_DIRTY_DRIVE = 1.55;
const DEFAULT_LP_DRIVE = 1.15;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function controlToCutoffHz(controlDigital, config) {
  const controlVolts = controlDigital * DIGITAL_TO_VOLTAGE;
  const cutoff = config.referenceCutoffHz * Math.pow(2, controlVolts / config.voltsPerOctave);
  return clamp(cutoff, config.minCutoffHz, config.maxCutoffHz);
}

function responseDialToFeedback(dial, threshold = RESPONSE_SELF_OSC_THRESHOLD) {
  const value = clamp(dial, 0, 10);

  if (value <= threshold) {
    return (value / threshold) * 3.95;
  }

  const t = (value - threshold) / (10 - threshold);
  return 3.95 + t * 1.05;
}

class SynthiFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'cutoffControl',
        defaultValue: 0,
        minValue: -8,
        maxValue: 8,
        automationRate: 'a-rate'
      },
      {
        name: 'response',
        defaultValue: 0,
        minValue: 0,
        maxValue: 10,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor(options = {}) {
    super();

    const processorOptions = options.processorOptions || {};

    this._config = {
      mode: processorOptions.mode === 'highpass' ? 'highpass' : 'lowpass',
      minCutoffHz: processorOptions.minCutoffHz ?? MIN_CUTOFF_HZ,
      maxCutoffHz: processorOptions.maxCutoffHz ?? MAX_CUTOFF_HZ,
      referenceCutoffHz: processorOptions.referenceCutoffHz ?? REFERENCE_CUTOFF_HZ,
      voltsPerOctave: processorOptions.voltsPerOctave ?? VOLTS_PER_OCTAVE,
      selfOscillationThresholdDial: processorOptions.selfOscillationThresholdDial ?? RESPONSE_SELF_OSC_THRESHOLD,
      inputDriveBoost: processorOptions.inputDriveBoost ?? DEFAULT_INPUT_DRIVE_BOOST,
      hpDirtyEvenHarmonics: processorOptions.hpDirtyEvenHarmonics ?? DEFAULT_HP_DIRTY_EVEN,
      hpDirtyDrive: processorOptions.hpDirtyDrive ?? DEFAULT_HP_DIRTY_DRIVE,
      lpDrive: processorOptions.lpDrive ?? DEFAULT_LP_DRIVE
    };

    this._dormant = false;
    this._stopped = false;
    this._states = [];

    this.port.onmessage = (event) => {
      const data = event.data || {};
      switch (data.type) {
        case 'setDormant':
          this._dormant = !!data.dormant;
          break;
        case 'stop':
          this._stopped = true;
          break;
      }
    };
  }

  _ensureState(index) {
    if (!this._states[index]) {
      this._states[index] = {
        out1: 0,
        out2: 0,
        out3: 0,
        out4: 0,
        hp1: 0,
        hp2: 0,
        hp3: 0,
        hp4: 0
      };
    }
    return this._states[index];
  }

  process(inputs, outputs, parameters) {
    if (this._stopped) {
      return false;
    }

    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const input = inputs[0] || [];
    const responseValues = parameters.response;
    const cutoffValues = parameters.cutoffControl;
    const responseDial = responseValues.length > 0 ? responseValues[0] : 0;
    const feedbackBase = responseDialToFeedback(
      responseDial,
      this._config.selfOscillationThresholdDial
    );

    for (let channelIndex = 0; channelIndex < output.length; channelIndex++) {
      const outChannel = output[channelIndex];
      const inChannel = input[channelIndex];
      const state = this._ensureState(channelIndex);

      for (let i = 0; i < outChannel.length; i++) {
        const cutoffControl = cutoffValues.length > 1 ? cutoffValues[i] : (cutoffValues[0] ?? 0);
        const cutoffHz = controlToCutoffHz(cutoffControl, this._config);

        // OTA integrator coefficient (CEM3320 exponential model)
        const g = 1.0 - Math.exp(-2.0 * Math.PI * cutoffHz / sampleRate);

        const rawInput = inChannel ? inChannel[i] || 0 : 0;

        // Inaudible white noise at the input (~-60 dBFS).
        // At high Q the ladder's resonance amplifies the cutoff
        // frequency naturally, producing stable self-oscillation
        // without any special-case logic.
        const inputSample = rawInput + (Math.random() * 2 - 1) * 0.001;

        const resonanceDrive = 1 + (feedbackBase / 5.0) * this._config.inputDriveBoost;

        // Huovilainen Moog ladder: per-stage OTA saturation (CEM3320).
        // Each tanh models the differential-pair soft clipping of
        // the OTA, ensuring amplitude-limited self-oscillation.
        let x = Math.tanh(inputSample * resonanceDrive - feedbackBase * state.out4);

        state.out1 += g * (x                        - Math.tanh(state.out1));
        state.out2 += g * (Math.tanh(state.out1) - Math.tanh(state.out2));
        state.out3 += g * (Math.tanh(state.out2) - Math.tanh(state.out3));
        state.out4 += g * (Math.tanh(state.out3) - Math.tanh(state.out4));

        let y;
        if (this._config.mode === 'highpass') {
          const hpAlpha = clamp((2 * Math.PI * cutoffHz) / sampleRate, 0.0001, 0.99);
          state.hp1 += (inputSample - state.hp1) * hpAlpha;
          let hp = inputSample - state.hp1;
          state.hp2 += (hp - state.hp2) * hpAlpha;
          hp -= state.hp2;
          state.hp3 += (hp - state.hp3) * hpAlpha;
          hp -= state.hp3;
          state.hp4 += (hp - state.hp4) * hpAlpha;
          hp -= state.hp4;
          y = Math.tanh((hp + this._config.hpDirtyEvenHarmonics * state.out2) * this._config.hpDirtyDrive);
        } else {
          y = Math.tanh(state.out4 * this._config.lpDrive);
        }

        outChannel[i] = this._dormant ? 0 : y;
      }
    }

    return true;
  }
}

registerProcessor('synthi-filter', SynthiFilterProcessor);
