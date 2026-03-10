const DIGITAL_TO_VOLTAGE = 4.0;
const MIN_CUTOFF_HZ = 3;
const MAX_CUTOFF_HZ = 20000;
const REFERENCE_CUTOFF_HZ = 320;
const VOLTS_PER_OCTAVE = 0.55;
const RESPONSE_SELF_OSC_THRESHOLD = 5.5;
const DEFAULT_INPUT_DRIVE_BOOST = 1.4;
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
        s1: 0, s2: 0, s3: 0, s4: 0,   // TPT integrator states
        y4: 0                           // stage-4 output for feedback
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

        // TPT (Topology-Preserving Transform) ladder filter.
        // Uses tan() pre-warping (bilinear transform) so that each
        // integrator's −45° phase occurs exactly at the cutoff
        // frequency — unlike the exponential integrator, which loses
        // phase alignment above ~3 kHz and cannot self-oscillate.
        // 2× oversampling halves the feedback delay, keeping the
        // oscillation frequency within ~10% of the cutoff.
        const g = Math.tan(Math.PI * cutoffHz / (sampleRate * 2));
        const G = g / (1.0 + g);

        const rawInput = inChannel ? inChannel[i] || 0 : 0;

        // Inaudible white noise at the input (~-60 dBFS).
        // At high Q the ladder's resonance amplifies the cutoff
        // frequency naturally, producing stable self-oscillation
        // without any special-case logic.
        const inputSample = rawInput + (Math.random() * 2 - 1) * 0.001;

        const resonanceDrive = 1 + (feedbackBase / 5.0) * this._config.inputDriveBoost;

        // 4-stage OTA ladder with 2× oversampling.
        // Per-stage tanh models CEM3320 differential-pair saturation.
        // TPT state update: v = G·(tanh(in) − tanh(s)), y = v + s, s′ = y + v.
        let x, y1, y2, y3, y4;
        for (let os = 0; os < 2; os++) {
          x = Math.tanh(inputSample * resonanceDrive - feedbackBase * state.y4);

          const v1 = G * (x                  - Math.tanh(state.s1));
          y1 = v1 + state.s1;  state.s1 = y1 + v1;

          const v2 = G * (Math.tanh(y1) - Math.tanh(state.s2));
          y2 = v2 + state.s2;  state.s2 = y2 + v2;

          const v3 = G * (Math.tanh(y2) - Math.tanh(state.s3));
          y3 = v3 + state.s3;  state.s3 = y3 + v3;

          const v4 = G * (Math.tanh(y3) - Math.tanh(state.s4));
          y4 = v4 + state.s4;  state.s4 = y4 + v4;

          state.y4 = y4;
        }

        let y;
        if (this._config.mode === 'highpass') {
          // 4-pole HP from generalized ladder (binomial subtraction).
          // Uses stage OUTPUTS (y1-y4), not states, for correct
          // complementary response.  Coefficients [1, -4, 6, -4, 1].
          y = x - 4 * y1 + 6 * y2 - 4 * y3 + y4;
          y = Math.tanh(y);
        } else {
          y = Math.tanh(y4 * this._config.lpDrive);
        }

        outChannel[i] = this._dormant ? 0 : y;
      }
    }

    return true;
  }
}

registerProcessor('synthi-filter', SynthiFilterProcessor);
