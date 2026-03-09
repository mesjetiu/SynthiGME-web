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
});
