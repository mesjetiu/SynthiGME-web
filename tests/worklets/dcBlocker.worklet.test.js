/**
 * Tests del worklet real `dc-blocker` (protección de altavoces en la salida).
 *
 * Hasta septiembre de 2026 este worklet no tenía ningún test, pese a estar en
 * la cadena que oye todo el mundo (muteNode → DC blocker → channelGains).
 * Aquí se carga el worklet de verdad en Node y se mide lo que hace:
 *
 * - Coeficiente del polo R = 1 − 2π·fc/fs, recalculado solo si cambia fc.
 * - Un escalón de DC sale con decaimiento exponencial exacto y[n] = x·Rⁿ y
 *   se extingue (τ ≈ 159 ms a 1 Hz).
 * - Respuesta en frecuencia medida con senos contra la magnitud teórica de
 *   H(z) = (1 − z⁻¹)/(1 − R·z⁻¹): −3 dB a fc, ≈ −0,04 dB a 10 Hz,
 *   transparente en el rango audible, DC + seno → solo el seno.
 * - k-rate, mensaje `reset`, continuidad entre bloques, entradas ausentes.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const DEFAULT_FC = 1;
const TAU = 1 / (2 * Math.PI * DEFAULT_FC);   // ≈ 159 ms

// ═══════════════════════════════════════════════════════════════════════════
// Entorno de worklet en Node
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;
  if (!globalThis.AudioWorkletProcessor) {
    globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
      constructor() {
        this.port = { onmessage: null, _messages: [], postMessage(m) { this._messages.push(m); } };
      }
    };
  }
  const registered = {};
  globalThis.registerProcessor = (name, cls) => { registered[name] = cls; };
  return registered;
}

let DCBlockerProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/dcBlocker.worklet.js?t=${Date.now()}`);
  DCBlockerProcessor = registered['dc-blocker'];
  assert.ok(DCBlockerProcessor, 'el worklet debe registrarse como "dc-blocker"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const expectedR = fc => 1 - (2 * Math.PI * fc / SAMPLE_RATE);

/** |H(e^{jω})| del DC blocker discreto con polo R. */
function theoreticalGain(freq, fc = DEFAULT_FC) {
  const R = expectedR(fc);
  const w = 2 * Math.PI * freq / SAMPLE_RATE;
  return Math.sqrt(2 - 2 * Math.cos(w)) / Math.sqrt(1 - 2 * R * Math.cos(w) + R * R);
}

const toDb = g => 20 * Math.log10(g);

function processBlock(proc, input, fc = DEFAULT_FC) {
  const output = new Float32Array(input.length);
  const ok = proc.process([[input]], [[output]], { cutoffFrequency: new Float32Array([fc]) });
  return { ok, output };
}

/** Pasa `n` muestras de signalAt(i) por el worklet en bloques de 128. */
function run(proc, signalAt, n, fc = DEFAULT_FC) {
  const out = new Float32Array(n);
  for (let start = 0; start < n; start += BLOCK) {
    const len = Math.min(BLOCK, n - start);
    const input = new Float32Array(len);
    for (let i = 0; i < len; i++) input[i] = signalAt(start + i);
    const { output } = processBlock(proc, input, fc);
    out.set(output, start);
  }
  return out;
}

function rms(arr, from = 0, to = arr.length) {
  let acc = 0;
  for (let i = from; i < to; i++) acc += arr[i] * arr[i];
  return Math.sqrt(acc / (to - from));
}

function mean(arr, from = 0, to = arr.length) {
  let acc = 0;
  for (let i = from; i < to; i++) acc += arr[i];
  return acc / (to - from);
}

const sine = (freq, amp = 0.5) => i => amp * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);

/**
 * Ganancia medida para un seno: se descartan `settleSeconds` (≥ 5τ a 1 Hz)
 * y se mide RMS sobre un número entero de periodos.
 */
function measureGain(freq, fc = DEFAULT_FC, { settleSeconds = 1.5, periods = 4 } = {}) {
  const proc = new DCBlockerProcessor();
  const settle = Math.round(settleSeconds * SAMPLE_RATE);
  const periodSamples = SAMPLE_RATE / freq;
  const measure = Math.round(periods * periodSamples);
  const out = run(proc, sine(freq), settle + measure, fc);
  return rms(out, settle) / (0.5 * Math.SQRT1_2);
}

// ═══════════════════════════════════════════════════════════════════════════

describe('dc-blocker worklet', () => {
  beforeEach(loadProcessor);

  describe('Registro y parámetros', () => {
    it('cutoffFrequency: 1 Hz por defecto, 0.001–100 Hz, k-rate', () => {
      const [p] = DCBlockerProcessor.parameterDescriptors;
      assert.equal(DCBlockerProcessor.parameterDescriptors.length, 1);
      assert.deepEqual(p, {
        name: 'cutoffFrequency', defaultValue: 1, minValue: 0.001, maxValue: 100, automationRate: 'k-rate',
      });
    });

    it('arranca con el estado del filtro a cero y sin coeficiente calculado', () => {
      const proc = new DCBlockerProcessor();
      assert.equal(proc._x1, 0);
      assert.equal(proc._y1, 0);
      assert.equal(proc._lastFc, -1);
    });
  });

  describe('Coeficiente del polo', () => {
    it('R = 1 − 2π·fc/fs (a 1 Hz y 48 kHz, ≈ 0.999869)', () => {
      const proc = new DCBlockerProcessor();
      processBlock(proc, new Float32Array(BLOCK));
      assert.equal(proc._R, expectedR(1));
      assert.ok(Math.abs(proc._R - 0.999869) < 1e-6);
      assert.equal(proc._lastFc, 1);
    });

    it('solo se recalcula cuando cambia fc', () => {
      const proc = new DCBlockerProcessor();
      processBlock(proc, new Float32Array(BLOCK), 1);
      proc._R = 12345;                                   // centinela
      processBlock(proc, new Float32Array(BLOCK), 1);
      assert.equal(proc._R, 12345, 'misma fc: no toca R');
      processBlock(proc, new Float32Array(BLOCK), 10);
      assert.equal(proc._R, expectedR(10));
    });

    it('k-rate: solo cuenta el primer valor del bloque', () => {
      const proc = new DCBlockerProcessor();
      const fcs = new Float32Array(BLOCK).fill(50);
      fcs[0] = 2;
      proc.process([[new Float32Array(BLOCK)]], [[new Float32Array(BLOCK)]], { cutoffFrequency: fcs });
      assert.equal(proc._lastFc, 2);
    });
  });

  describe('Escalón de DC', () => {
    it('la primera muestra pasa entera y después decae como x·Rⁿ (exacto)', () => {
      const proc = new DCBlockerProcessor();
      const out = run(proc, () => 0.5, 4 * BLOCK);
      const R = expectedR(1);
      assert.equal(out[0], 0.5);
      for (const n of [1, 10, 127, 128, 300, 511]) {
        assert.ok(Math.abs(out[n] - 0.5 * R ** n) < 1e-6, `muestra ${n}`);
      }
    });

    it('τ ≈ 159 ms: a 1τ queda 1/e, a 5τ menos del 1 %', () => {
      const proc = new DCBlockerProcessor();
      const tau = Math.round(TAU * SAMPLE_RATE);
      const out = run(proc, () => 1, 6 * tau);
      assert.ok(Math.abs(out[tau] - Math.exp(-1)) < 0.002, `a 1τ: ${out[tau]}`);
      assert.ok(out[5 * tau] < 0.01, `a 5τ: ${out[5 * tau]}`);
      assert.ok(out[5 * tau] > 0, 'decae sin cruzar por cero (1er orden)');
    });

    it('DC negativa se extingue igual', () => {
      const proc = new DCBlockerProcessor();
      const out = run(proc, () => -0.8, SAMPLE_RATE);
      assert.equal(out[0], Math.fround(-0.8));
      assert.ok(Math.abs(out[SAMPLE_RATE - 1]) < 0.002);
    });

    it('con fc = 100 Hz se asienta ~100 veces más rápido', () => {
      const slow = run(new DCBlockerProcessor(), () => 1, 2000, 1);
      const fast = run(new DCBlockerProcessor(), () => 1, 2000, 100);
      assert.ok(slow[1999] > 0.7, `a 1 Hz aún queda ${slow[1999]}`);
      assert.ok(fast[1999] < 1e-10, `a 100 Hz queda ${fast[1999]}`);
    });

    it('silencio dentro, silencio fuera', () => {
      const out = run(new DCBlockerProcessor(), () => 0, 10 * BLOCK);
      assert.ok(out.every(v => v === 0));
    });
  });

  describe('Respuesta en frecuencia medida', () => {
    it('−3 dB en fc (1 Hz)', () => {
      const g = measureGain(1);
      assert.ok(Math.abs(toDb(g) - toDb(theoreticalGain(1))) < 0.05, `${toDb(g)} dB`);
      assert.ok(Math.abs(toDb(g) + 3.01) < 0.1, `${toDb(g)} dB, esperado ≈ −3 dB`);
    });

    it('−0,04 dB a 10 Hz: inaudible', () => {
      const g = measureGain(10);
      assert.ok(Math.abs(toDb(g) - toDb(theoreticalGain(10))) < 0.02, `${toDb(g)} dB`);
      assert.ok(toDb(g) > -0.06 && toDb(g) < 0, `${toDb(g)} dB`);
    });

    it('transparente en audio: 20 Hz, 100 Hz y 1 kHz dentro de 0,02 dB de 0', () => {
      for (const f of [20, 100, 1000]) {
        const g = measureGain(f, DEFAULT_FC, { periods: 20 });
        assert.ok(Math.abs(toDb(g)) < 0.02, `${f} Hz: ${toDb(g)} dB`);
      }
    });

    it('a Nyquist la ganancia es 2/(1+R), apenas por encima de 1', () => {
      const proc = new DCBlockerProcessor();
      const out = run(proc, i => (i % 2 ? -0.5 : 0.5), SAMPLE_RATE);
      const g = Math.abs(out[SAMPLE_RATE - 1]) / 0.5;
      const expected = 2 / (1 + expectedR(1));
      assert.ok(Math.abs(g - expected) < 1e-4, `${g} vs ${expected}`);
      assert.ok(g > 1 && g < 1.001);
    });

    it('con fc = 20 Hz la curva se desplaza: −3 dB a 20 Hz y transparente a 1 kHz', () => {
      const g20 = measureGain(20, 20, { settleSeconds: 0.2, periods: 20 });
      assert.ok(Math.abs(toDb(g20) + 3.01) < 0.1, `${toDb(g20)} dB`);
      const g1k = measureGain(1000, 20, { settleSeconds: 0.2, periods: 50 });
      assert.ok(Math.abs(toDb(g1k)) < 0.01, `${toDb(g1k)} dB`);
    });

    it('DC + seno: sale el seno sin la DC', () => {
      const proc = new DCBlockerProcessor();
      const settle = 2 * SAMPLE_RATE;
      const measure = SAMPLE_RATE;                        // 100 periodos de 100 Hz
      const out = run(proc, i => 0.7 + sine(100, 0.2)(i), settle + measure);
      assert.ok(Math.abs(mean(out, settle)) < 1e-3, `media residual ${mean(out, settle)}`);
      const g = rms(out, settle) / (0.2 * Math.SQRT1_2);
      assert.ok(Math.abs(toDb(g)) < 0.02, `seno a ${toDb(g)} dB`);
    });
  });

  describe('Estado, mensajes y bordes', () => {
    it('el estado continúa entre bloques: 2×128 equivale a 1×256', () => {
      const a = new DCBlockerProcessor();
      const b = new DCBlockerProcessor();
      const signal = i => 0.3 + sine(440, 0.4)(i);
      const chunked = run(a, signal, 256);
      const input = new Float32Array(256);
      for (let i = 0; i < 256; i++) input[i] = signal(i);
      const { output: whole } = processBlock(b, input);
      assert.deepEqual([...chunked], [...whole]);
      assert.equal(a._x1, b._x1);
      assert.equal(a._y1, b._y1);
    });

    it('reset pone x[n−1] e y[n−1] a cero: el siguiente escalón vuelve a pasar entero', () => {
      const proc = new DCBlockerProcessor();
      run(proc, () => 0.5, 10 * BLOCK);
      assert.notEqual(proc._y1, 0);
      proc.port.onmessage({ data: { type: 'reset' } });
      assert.equal(proc._x1, 0);
      assert.equal(proc._y1, 0);
      const { output } = processBlock(proc, new Float32Array(BLOCK).fill(0.5));
      assert.equal(output[0], 0.5);
    });

    it('mensajes desconocidos o vacíos no tocan el estado', () => {
      const proc = new DCBlockerProcessor();
      run(proc, () => 0.5, BLOCK);
      const { _x1, _y1 } = proc;
      assert.doesNotThrow(() => proc.port.onmessage({ data: { type: 'otro' } }));
      assert.doesNotThrow(() => proc.port.onmessage({ data: null }));
      assert.doesNotThrow(() => proc.port.onmessage({}));
      assert.equal(proc._x1, _x1);
      assert.equal(proc._y1, _y1);
    });

    it('sin entrada o sin salida sigue vivo y no toca el estado', () => {
      const proc = new DCBlockerProcessor();
      run(proc, () => 0.5, BLOCK);
      const { _x1, _y1 } = proc;
      const params = { cutoffFrequency: new Float32Array([1]) };
      assert.equal(proc.process([[]], [[new Float32Array(BLOCK)]], params), true);
      assert.equal(proc.process([], [[new Float32Array(BLOCK)]], params), true);
      assert.equal(proc.process([[new Float32Array(BLOCK)]], [[]], params), true);
      assert.equal(proc.process([[new Float32Array(BLOCK)]], [], params), true);
      assert.equal(proc._x1, _x1);
      assert.equal(proc._y1, _y1);
    });

    it('process() siempre devuelve true (el nodo vive mientras viva el engine)', () => {
      const proc = new DCBlockerProcessor();
      assert.equal(processBlock(proc, new Float32Array(BLOCK)).ok, true);
    });
  });
});
