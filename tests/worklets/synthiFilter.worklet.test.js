import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const DIGITAL_TO_VOLTAGE = 4.0;
const VOLTS_PER_OCTAVE = 0.55;
const REFERENCE_CUTOFF_HZ = 320;
const MIN_CUTOFF_HZ = 3;
const MAX_CUTOFF_HZ = 20000;
const SAMPLE_RATE = 48000;

function controlToCutoffHz(controlDigital) {
  const controlVolts = controlDigital * DIGITAL_TO_VOLTAGE;
  return Math.max(MIN_CUTOFF_HZ, Math.min(MAX_CUTOFF_HZ, REFERENCE_CUTOFF_HZ * Math.pow(2, controlVolts / VOLTS_PER_OCTAVE)));
}

function responseDialToFeedback(dial, threshold = 5.5) {
  const value = Math.max(0, Math.min(10, dial));
  if (value <= threshold) {
    return (value / threshold) * 3.95;
  }
  return 3.95 + ((value - threshold) / (10 - threshold)) * 1.05;
}

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: () => {}
      };
    }
  };

  const registered = {};
  globalThis.registerProcessor = (name, processor) => {
    registered[name] = processor;
  };
  return registered;
}

describe('synthiFilter.worklet helpers', () => {
  test('control 0 equivale a 320 Hz', () => {
    assert.equal(controlToCutoffHz(0), 320);
  });

  test('0.1375 unidades digitales suben una octava', () => {
    assert.ok(Math.abs(controlToCutoffHz(0.1375) - 640) < 1e-9);
  });

  test('clamp del rango 5 Hz – 20 kHz', () => {
    assert.equal(controlToCutoffHz(-3), 3);
    assert.equal(controlToCutoffHz(3), 20000);
  });

  test('response entra en zona de auto-oscilación sobre 5.5', () => {
    assert.ok(responseDialToFeedback(5.4) < 3.95);
    assert.ok(responseDialToFeedback(5.6) > 3.95);
  });
});

describe('synthiFilter.worklet import real', () => {
  let Processor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/synthiFilter.worklet.js?t=${Date.now()}`);
    Processor = registered['synthi-filter'];
  });

  test('registra el procesador synthi-filter', () => {
    assert.ok(Processor);
  });

  test('con entrada nula y respuesta baja mantiene salida estable', () => {
    const processor = new Processor({ processorOptions: { mode: 'lowpass' } });
    const outputs = [[new Float32Array(128)]];
    const keepAlive = processor.process([], outputs, {
      cutoffControl: new Float32Array([0]),
      response: new Float32Array([0])
    });

    assert.equal(keepAlive, true);
    const peak = Math.max(...outputs[0][0].map(Math.abs));
    assert.ok(peak < 1e-3);
  });

  test('dormant fuerza silencio', () => {
    const processor = new Processor({ processorOptions: { mode: 'lowpass' } });
    processor.port.onmessage({ data: { type: 'setDormant', dormant: true } });

    const input = [[new Float32Array(128).fill(0.5)]];
    const outputs = [[new Float32Array(128)]];
    processor.process(input, outputs, {
      cutoffControl: new Float32Array([0]),
      response: new Float32Array([2])
    });

    const peak = Math.max(...outputs[0][0].map(Math.abs));
    assert.equal(peak, 0);
  });

  test('respuesta alta sobre silencio produce oscilación LP', () => {
    const processor = new Processor({ processorOptions: { mode: 'lowpass' } });
    const outputs = [[new Float32Array(128)]];

    // White noise at the input is amplified by ladder resonance at high Q.
    // 80 blocks × 128 / 48 kHz ≈ 213 ms — enough for the resonance to build.
    for (let i = 0; i < 80; i++) {
      processor.process([], outputs, {
        cutoffControl: new Float32Array([0]),
        response: new Float32Array([10])
      });
    }

    const peak = Math.max(...outputs[0][0].map(Math.abs));
    assert.ok(peak > 1e-4, `Expected peak > 1e-4, got ${peak}`);
  });

  test('stop devuelve false en process()', () => {
    const processor = new Processor({ processorOptions: { mode: 'highpass' } });
    processor.port.onmessage({ data: { type: 'stop' } });

    const result = processor.process([], [[new Float32Array(128)]], {
      cutoffControl: new Float32Array([0]),
      response: new Float32Array([0])
    });

    assert.equal(result, false);
  });

  test('autooscilación sale por el worklet incluso sin entrada (level es externo)', () => {
    // El worklet siempre produce salida cuando hay Q alto.
    // El silenciamiento por level=0 ocurre en el GainNode de salida
    // del módulo, no dentro del worklet.
    const processor = new Processor({ processorOptions: { mode: 'lowpass' } });
    const outputs = [[new Float32Array(128)]];

    for (let i = 0; i < 80; i++) {
      processor.process([], outputs, {
        cutoffControl: new Float32Array([0]),
        response: new Float32Array([10])
      });
    }

    const peak = Math.max(...outputs[0][0].map(Math.abs));
    assert.ok(peak > 0.01,
      `Worklet debe producir señal con Q alto (peak=${peak})`);
  });

  test('HP también autooscila con response alto', () => {
    const processor = new Processor({ processorOptions: { mode: 'highpass' } });
    const outputs = [[new Float32Array(128)]];

    for (let i = 0; i < 80; i++) {
      processor.process([], outputs, {
        cutoffControl: new Float32Array([0]),
        response: new Float32Array([10])
      });
    }

    const peak = Math.max(...outputs[0][0].map(Math.abs));
    assert.ok(peak > 0.01,
      `HP worklet debe producir señal con Q alto (peak=${peak})`);
  });
});

// ---------------------------------------------------------------------------
// Multi-frequency self-oscillation tests (TDD).
//
// Requirements derived from the real Synthi 100 CEM3320 filter:
//   1. Self-oscillation must produce a clean, stable sinusoidal tone
//      across the practical frequency range (320 Hz – 5 kHz) in BOTH
//      LP and HP modes.
//   2. Peak amplitude > 0.02 (well above the 0.001 noise seed).
//   3. Coefficient of variation (CV) of positive peaks < 25%:
//      - Below this threshold the signal is perceived as a *tone*.
//      - Above it, as broadband noise ("air hiss").
//   4. Measured zero-crossing frequency must track the cutoff within ±30%.
// ---------------------------------------------------------------------------

function hzToCutoffControl(hz) {
  return (VOLTS_PER_OCTAVE * Math.log2(hz / REFERENCE_CUTOFF_HZ)) / DIGITAL_TO_VOLTAGE;
}

function collectSelfOscillation(ProcessorClass, mode, cutoffHz) {
  const SETTLE = 500;
  const COLLECT = 50;
  const BLOCK = 128;
  const proc = new ProcessorClass({ processorOptions: { mode } });
  const params = {
    cutoffControl: new Float32Array([hzToCutoffControl(cutoffHz)]),
    response: new Float32Array([10])
  };
  const out = [[new Float32Array(BLOCK)]];
  for (let i = 0; i < SETTLE; i++) proc.process([], out, params);
  const buf = new Float32Array(COLLECT * BLOCK);
  for (let i = 0; i < COLLECT; i++) {
    proc.process([], out, params);
    buf.set(out[0][0], i * BLOCK);
  }
  return buf;
}

function analyzeOscillation(buffer) {
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if (buffer[i - 1] <= 0 && buffer[i] > 0) crossings++;
  }
  const freq = crossings * SAMPLE_RATE / buffer.length;
  const absPeak = Math.max(...Array.from(buffer).map(Math.abs));
  const peaks = [];
  for (let i = 1; i < buffer.length - 1; i++) {
    if (buffer[i] > buffer[i - 1] && buffer[i] >= buffer[i + 1] && buffer[i] > 0.002) {
      peaks.push(buffer[i]);
    }
  }
  let cv = 1;
  if (peaks.length >= 3) {
    const mean = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    const std = Math.sqrt(peaks.reduce((s, p) => s + (p - mean) ** 2, 0) / peaks.length);
    cv = std / mean;
  }
  return { freq, absPeak, cv, peakCount: peaks.length };
}

describe('synthiFilter.worklet autooscilación multifrecuencia', () => {
  let Processor;

  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/synthiFilter.worklet.js?t=${Date.now()}`);
    Processor = registered['synthi-filter'];
  });

  const FREQS = [320, 1000, 3000, 5000];
  const MIN_PEAK = 0.10;
  const MAX_CV = 0.25;
  const FREQ_TOL = 0.30;

  for (const hz of FREQS) {
    test(`LP autooscila limpiamente a ${hz} Hz (peak>${MIN_PEAK}, CV<${MAX_CV * 100}%)`, () => {
      const buf = collectSelfOscillation(Processor, 'lowpass', hz);
      const { absPeak, cv } = analyzeOscillation(buf);
      assert.ok(absPeak > MIN_PEAK,
        `LP ${hz}Hz: peak=${absPeak.toFixed(4)} < ${MIN_PEAK}`);
      assert.ok(cv < MAX_CV,
        `LP ${hz}Hz: CV=${(cv * 100).toFixed(1)}% ≥ ${MAX_CV * 100}% — no es tono limpio`);
    });

    test(`HP autooscila limpiamente a ${hz} Hz (peak>${MIN_PEAK}, CV<${MAX_CV * 100}%)`, () => {
      const buf = collectSelfOscillation(Processor, 'highpass', hz);
      const { absPeak, cv } = analyzeOscillation(buf);
      assert.ok(absPeak > MIN_PEAK,
        `HP ${hz}Hz: peak=${absPeak.toFixed(4)} < ${MIN_PEAK}`);
      assert.ok(cv < MAX_CV,
        `HP ${hz}Hz: CV=${(cv * 100).toFixed(1)}% ≥ ${MAX_CV * 100}% — no es tono limpio`);
    });
  }

  for (const hz of [320, 3000, 5000]) {
    test(`LP frecuencia sigue cutoff a ${hz} Hz (±${FREQ_TOL * 100}%)`, () => {
      const buf = collectSelfOscillation(Processor, 'lowpass', hz);
      const { freq } = analyzeOscillation(buf);
      const ratio = freq / hz;
      assert.ok(ratio > (1 - FREQ_TOL) && ratio < (1 + FREQ_TOL),
        `LP ${hz}Hz: medida=${freq.toFixed(0)}Hz, ratio=${ratio.toFixed(2)}`);
    });

    test(`HP frecuencia sigue cutoff a ${hz} Hz (±${FREQ_TOL * 100}%)`, () => {
      const buf = collectSelfOscillation(Processor, 'highpass', hz);
      const { freq } = analyzeOscillation(buf);
      const ratio = freq / hz;
      assert.ok(ratio > (1 - FREQ_TOL) && ratio < (1 + FREQ_TOL),
        `HP ${hz}Hz: medida=${freq.toFixed(0)}Hz, ratio=${ratio.toFixed(2)}`);
    });
  }

  // HP must have comparable amplitude to LP — no silent mode.
  test('HP amplitude es comparable a LP en todo el rango', () => {
    for (const hz of FREQS) {
      const lpBuf = collectSelfOscillation(Processor, 'lowpass', hz);
      const hpBuf = collectSelfOscillation(Processor, 'highpass', hz);
      const lpPeak = Math.max(...Array.from(lpBuf).map(Math.abs));
      const hpPeak = Math.max(...Array.from(hpBuf).map(Math.abs));
      assert.ok(hpPeak >= lpPeak * 0.5,
        `${hz}Hz: HP peak=${hpPeak.toFixed(4)} < 50% of LP peak=${lpPeak.toFixed(4)}`);
    }
  });
});
