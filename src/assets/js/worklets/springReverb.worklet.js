/**
 * Spring Reverb AudioWorkletProcessor
 *
 * Emula la reverberación de muelle del Synthi 100 (placa PC-16, D100-16 C1).
 *
 * Arquitectura DSP:
 *   input → softClip → allpass1(35ms) → allpass2(40ms) → dampingLPF → feedback
 *   output = (1 - mix) * dryClipped  +  mix * wetSample
 *
 * - 2 allpass delays en serie (muelles de 35ms y 40ms)
 * - Feedback con RT60 = 2.4s (feedbackGain ≈ 0.805)
 * - LPF de 1 polo para damping (~4500 Hz) — pérdida de agudos del muelle
 * - Soft clip (tanh) en la entrada — saturación característica del muelle
 * - Crossfader dry/wet controlable por dial + AudioParam CV
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTS (overridable via processorOptions from reverberation.config.js)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULTS = {
  spring1DelayMs:  35,
  spring2DelayMs:  40,
  maxReverbTimeS:  2.4,
  dampingFreqHz:   4500,
  allpassCoeff:    0.65,
  inputClipDrive:  1.5,
  mixCVScale:      5     // ±2V cubre rango completo → 2 * 5 = 10 dial units
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula tamaño de buffer allpass en samples.
 */
function delaySamples(delayMs) {
  return Math.ceil(delayMs / 1000 * sampleRate);
}

/**
 * Calcula el feedback gain para RT60 dado.
 * @returns {number} gain < 1 garantizado
 */
function calcFeedbackGain(totalDelayS, maxReverbTimeS) {
  return Math.pow(10, -3 * totalDelayS / maxReverbTimeS);
}

/**
 * Calcula coeficiente de damping LPF de 1 polo.
 * @returns {number} coeff ∈ (0, 1)
 */
function calcDampingCoeff(dampingFreqHz) {
  return 1 - Math.exp(-2 * Math.PI * dampingFreqHz / sampleRate);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

class SpringReverbProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'mixControl',
        defaultValue: 0,
        minValue: -10,
        maxValue: 10,
        automationRate: 'a-rate'
      }
    ];
  }

  constructor(options) {
    super();

    // Config from processorOptions (reverberation.config.js)
    const opts = options?.processorOptions ?? {};
    const spring1DelayMs = opts.spring1DelayMs ?? DEFAULTS.spring1DelayMs;
    const spring2DelayMs = opts.spring2DelayMs ?? DEFAULTS.spring2DelayMs;
    const maxReverbTimeS = opts.maxReverbTimeS ?? DEFAULTS.maxReverbTimeS;
    const dampingFreqHz  = opts.dampingFreqHz  ?? DEFAULTS.dampingFreqHz;
    this._allpassCoeff   = opts.allpassCoeff   ?? DEFAULTS.allpassCoeff;
    this._inputClipDrive = opts.inputClipDrive  ?? DEFAULTS.inputClipDrive;
    this._mixCVScale     = opts.mixCVScale      ?? DEFAULTS.mixCVScale;

    // Estado DSP
    const totalDelayS = (spring1DelayMs + spring2DelayMs) / 1000;
    this._feedbackGain = calcFeedbackGain(totalDelayS, maxReverbTimeS);
    this._dampCoeff = calcDampingCoeff(dampingFreqHz);

    // Allpass 1
    const len1 = delaySamples(spring1DelayMs);
    this._ap1Buffer = new Float32Array(len1);
    this._ap1Index = 0;

    // Allpass 2
    const len2 = delaySamples(spring2DelayMs);
    this._ap2Buffer = new Float32Array(len2);
    this._ap2Index = 0;

    // Damping LPF state
    this._dampState = 0;

    // Feedback state
    this._feedbackSample = 0;

    // Mix dial value (0-10)
    this._mixDial = 0;

    // Control flags
    this._dormant = false;
    this._stopped = false;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      switch (data.type) {
        case 'setMix':
          this._mixDial = data.value ?? 0;
          break;
        case 'setDormant':
          this._dormant = !!data.dormant;
          break;
        case 'stop':
          this._stopped = true;
          break;
      }
    };
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
    const mixCVValues = parameters.mixControl;
    const blockSize = output[0].length;

    for (let ch = 0; ch < output.length; ch++) {
      const outChannel = output[ch];
      const inChannel = input[ch];

      for (let i = 0; i < blockSize; i++) {
        if (this._dormant) {
          outChannel[i] = 0;
          continue;
        }

        const rawInput = inChannel ? (inChannel[i] || 0) : 0;

        // Soft clip input (saturación del muelle)
        const dryClipped = Math.tanh(rawInput * this._inputClipDrive);

        // Mix: dial + CV → normalizado [0, 1]
        const cv = mixCVValues.length > 1 ? mixCVValues[i] : (mixCVValues[0] ?? 0);
        const combined = this._mixDial + cv * this._mixCVScale;
        const mixNorm = Math.max(0, Math.min(1, combined / 10));

        // Allpass 1: input + feedback → delay
        const ap1Input = dryClipped + this._feedbackSample;
        const delayed1 = this._ap1Buffer[this._ap1Index];
        const ap1Out = -this._allpassCoeff * ap1Input + delayed1;
        this._ap1Buffer[this._ap1Index] = ap1Input + this._allpassCoeff * ap1Out;
        this._ap1Index = (this._ap1Index + 1) % this._ap1Buffer.length;

        // Allpass 2: cascada
        const delayed2 = this._ap2Buffer[this._ap2Index];
        const ap2Out = -this._allpassCoeff * ap1Out + delayed2;
        this._ap2Buffer[this._ap2Index] = ap1Out + this._allpassCoeff * ap2Out;
        this._ap2Index = (this._ap2Index + 1) % this._ap2Buffer.length;

        // Damping LPF de 1 polo
        this._dampState += this._dampCoeff * (ap2Out - this._dampState);
        const wetSample = this._dampState;

        // Feedback
        this._feedbackSample = wetSample * this._feedbackGain;

        // Crossfader dry/wet
        outChannel[i] = (1 - mixNorm) * dryClipped + mixNorm * wetSample;
      }
    }

    return true;
  }
}

registerProcessor('spring-reverb', SpringReverbProcessor);
