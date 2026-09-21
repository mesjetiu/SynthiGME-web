/**
 * Tests del worklet real `output-filter` (filtro RC pasivo del Output Channel).
 *
 * Hasta septiembre de 2026 este filtro no tenía ningún test: el fichero
 * tests/modules/outputChannel.test.js replicaba las fórmulas de los
 * coeficientes y probaba la réplica. Aquí se carga el worklet de verdad en
 * Node (mock mínimo de AudioWorkletProcessor), se le hace procesar señales y
 * se mide lo que sale:
 *
 * - Coeficientes IIR: los que el worklet calcula, contra la transformada
 *   bilineal del circuito (τ = R·C, K = 2·fs·τ).
 * - Respuesta en frecuencia medida con senos: plano (p=0), lowpass (p=-1,
 *   fc ≈ 677 Hz, 6 dB/oct) y shelving de agudos (p=+1, +6 dB), contra el
 *   modelo analógico H(s) = (2 + (1+p)·sτ) / (2 + sτ).
 * - DC intacta en todas las posiciones, canales independientes, k-rate,
 *   processorOptions y metering por mensaje.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

// Valores del circuito Cuenca (los que el worklet usa por defecto)
const R = 10000;
const C = 47e-9;
const TAU = R * C;                      // 4.7e-4 s
const FC_LP = 1 / (Math.PI * TAU);      // ≈ 677 Hz (-3 dB del lowpass)

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

let OutputFilterProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/outputFilter.worklet.js?t=${Date.now()}`);
  OutputFilterProcessor = registered['output-filter'];
  assert.ok(OutputFilterProcessor, 'el worklet debe registrarse como "output-filter"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions) {
  const proc = new OutputFilterProcessor(processorOptions ? { processorOptions } : undefined);
  // El mock base no tiene _messages si AudioWorkletProcessor ya existía de otro test
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

/** Procesa un bloque (mono o estéreo) con la posición dada. Devuelve la salida. */
function processBlock(proc, inputChannels, position) {
  const outputChannels = inputChannels.map(ch => new Float32Array(ch.length));
  const ok = proc.process([inputChannels], [outputChannels], { filterPosition: new Float32Array([position]) });
  assert.equal(ok, true, 'process() debe devolver true para seguir vivo');
  return outputChannels;
}

/** Pasa `total` muestras de una señal (función de n) por el filtro y devuelve todo lo que sale. */
function run(proc, signalAt, position, total) {
  const out = new Float32Array(total);
  for (let start = 0; start < total; start += BLOCK) {
    const len = Math.min(BLOCK, total - start);
    const inp = new Float32Array(len);
    for (let i = 0; i < len; i++) inp[i] = signalAt(start + i);
    const [o] = processBlock(proc, [inp], position);
    out.set(o, start);
  }
  return out;
}

/**
 * Ganancia medida del filtro a una frecuencia: amplitud RMS de la salida en
 * régimen permanente dividida por la de la entrada. Se descarta el primer
 * tramo (transitorio ≈ 5τ) y se mide sobre un número entero de ciclos.
 */
function measureGain(position, freq, processorOptions) {
  const proc = createProcessor(processorOptions);
  const cycles = Math.max(20, Math.ceil(freq * 0.05));
  const settle = Math.ceil(SAMPLE_RATE * 0.02);            // 20 ms ≫ 5τ = 2,35 ms
  const measure = Math.round(cycles * SAMPLE_RATE / freq);
  const total = settle + measure;
  const out = run(proc, n => Math.sin(2 * Math.PI * freq * n / SAMPLE_RATE), position, total);

  let sumSq = 0;
  for (let n = settle; n < total; n++) sumSq += out[n] * out[n];
  const rmsOut = Math.sqrt(sumSq / measure);
  return rmsOut / Math.SQRT1_2;                             // RMS de un seno de amplitud 1
}

/** |H(j2πf)| del circuito analógico. */
function analogGain(position, freq) {
  const w = 2 * Math.PI * freq;
  const wt = w * TAU;
  const num = Math.hypot(2, (1 + position) * wt);
  const den = Math.hypot(2, wt);
  return num / den;
}

const dB = g => 20 * Math.log10(g);

/**
 * Comprueba que la ganancia medida coincide con el modelo analógico dentro
 * de `tolDb`. La bilineal no prewarpea, así que a 3 kHz (fs = 48 kHz) el
 * digital se desvía ≈ 0,1 dB del circuito; por encima ya no tiene sentido
 * comparar contra el modelo continuo con tolerancias finas.
 */
function assertMatchesAnalog(position, freq, tolDb = 0.2) {
  const measured = dB(measureGain(position, freq));
  const expected = dB(analogGain(position, freq));
  assert.ok(Math.abs(measured - expected) < tolDb,
    `p=${position} f=${freq} Hz: medido ${measured.toFixed(3)} dB, modelo ${expected.toFixed(3)} dB`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('output-filter worklet', () => {
  beforeEach(loadProcessor);

  describe('Registro y parámetros', () => {
    it('expone filterPosition k-rate en [-1, +1], centrado en 0', () => {
      const [desc] = OutputFilterProcessor.parameterDescriptors;
      assert.equal(desc.name, 'filterPosition');
      assert.equal(desc.defaultValue, 0);
      assert.equal(desc.minValue, -1);
      assert.equal(desc.maxValue, 1);
      assert.equal(desc.automationRate, 'k-rate');
    });

    it('arranca plano: b0=1, b1=a1=0, y K = 2·fs·τ', () => {
      const proc = createProcessor();
      assert.equal(proc._b0, 1);
      assert.equal(proc._b1, 0);
      assert.equal(proc._a1, 0);
      assert.ok(Math.abs(proc._K - 2 * SAMPLE_RATE * TAU) < 1e-9);
    });

    it('processorOptions cambian R y C (y con ellos K)', () => {
      const proc = createProcessor({ potResistance: 20000, capacitance: 100e-9 });
      assert.ok(Math.abs(proc._K - 2 * SAMPLE_RATE * 20000 * 100e-9) < 1e-9);
    });

    it('sin entrada o sin salida no revienta y sigue vivo', () => {
      const proc = createProcessor();
      assert.equal(proc.process([[]], [[]], { filterPosition: new Float32Array([0]) }), true);
      assert.equal(proc.process([], [[new Float32Array(BLOCK)]], { filterPosition: new Float32Array([0]) }), true);
    });
  });

  describe('Coeficientes IIR (transformada bilineal)', () => {
    function coefficientsAt(position) {
      const proc = createProcessor();
      processBlock(proc, [new Float32Array(BLOCK)], position);
      return { b0: proc._b0, b1: proc._b1, a1: proc._a1, K: proc._K };
    }

    it('p=0 (plano): b0=1 y b1=a1 → H(z)=1', () => {
      const c = coefficientsAt(0);
      assert.ok(Math.abs(c.b0 - 1) < 1e-12);
      assert.ok(Math.abs(c.b1 - c.a1) < 1e-12);
    });

    it('p=-1 (LP): b0=b1, entre 0 y 1', () => {
      const c = coefficientsAt(-1);
      assert.ok(Math.abs(c.b0 - c.b1) < 1e-12);
      assert.ok(c.b0 > 0 && c.b0 < 1);
    });

    it('p=+1 (HP shelf): b0 → 2 en el límite, b1 negativo', () => {
      const c = coefficientsAt(1);
      const K = c.K;
      assert.ok(Math.abs(c.b0 - (2 + 2 * K) / (2 + K)) < 1e-12);
      assert.ok(Math.abs(c.b1 - (2 - 2 * K) / (2 + K)) < 1e-12);
      assert.ok(c.b1 < 0);
    });

    it('para cualquier p siguen la fórmula b0=(2+(1+p)K)/(2+K), b1=(2-(1+p)K)/(2+K), a1=(2-K)/(2+K)', () => {
      for (const p of [-1, -0.7, -0.25, 0, 0.3, 0.8, 1]) {
        const c = coefficientsAt(p);
        // El AudioParam llega como Float32Array: comparar con la misma precisión
        const pK = (1 + Math.fround(p)) * c.K;
        assert.ok(Math.abs(c.b0 - (2 + pK) / (2 + c.K)) < 1e-12, `b0 p=${p}`);
        assert.ok(Math.abs(c.b1 - (2 - pK) / (2 + c.K)) < 1e-12, `b1 p=${p}`);
        assert.ok(Math.abs(c.a1 - (2 - c.K) / (2 + c.K)) < 1e-12, `a1 p=${p}`);
      }
    });

    it('b0 crece y b1 decrece monótonamente de LP a HP; a1 no depende de p', () => {
      let prev = coefficientsAt(-1);
      for (const p of [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
        const c = coefficientsAt(p);
        assert.ok(c.b0 > prev.b0, `b0 debe crecer en p=${p}`);
        assert.ok(c.b1 < prev.b1, `b1 debe decrecer en p=${p}`);
        assert.ok(Math.abs(c.a1 - prev.a1) < 1e-12);
        prev = c;
      }
    });

    it('k-rate: recalcula solo cuando cambia la posición', () => {
      const proc = createProcessor();
      let recalcs = 0;
      const original = proc._updateCoefficients.bind(proc);
      proc._updateCoefficients = p => { recalcs++; original(p); };
      const silence = [new Float32Array(BLOCK)];
      processBlock(proc, silence, 0.5);
      processBlock(proc, silence, 0.5);
      processBlock(proc, silence, 0.5);
      processBlock(proc, silence, -0.5);
      assert.equal(recalcs, 2);
    });
  });

  describe('Respuesta en frecuencia medida', () => {
    it('p=0 (plano): la salida es la entrada, muestra a muestra', () => {
      const proc = createProcessor();
      const inp = new Float32Array(BLOCK).map((_, i) => Math.sin(i * 0.37) * 0.8);
      const [out] = processBlock(proc, [inp], 0);
      for (let i = 0; i < BLOCK; i++) {
        assert.ok(Math.abs(out[i] - inp[i]) < 1e-6, `muestra ${i}`);
      }
    });

    it('p=0: 0 dB de 20 Hz a 20 kHz', () => {
      for (const f of [20, 100, 677, 2000, 10000, 20000]) {
        assert.ok(Math.abs(dB(measureGain(0, f))) < 0.01, `f=${f}`);
      }
    });

    it('p=-1 (LP): -3 dB en fc ≈ 677 Hz', () => {
      const g = dB(measureGain(-1, FC_LP));
      assert.ok(Math.abs(g - (-3.01)) < 0.1, `en fc: ${g.toFixed(3)} dB`);
    });

    it('p=-1 (LP): graves intactos, agudos atenuados a 6 dB/oct', () => {
      assert.ok(Math.abs(dB(measureGain(-1, 20))) < 0.05, '20 Hz casi 0 dB');
      const g2k = dB(measureGain(-1, 2000));
      const g4k = dB(measureGain(-1, 4000));
      const g8k = dB(measureGain(-1, 8000));
      assert.ok(g2k < -8, `2 kHz claramente atenuado (${g2k.toFixed(2)} dB)`);
      // Primer orden: cada octava por encima de fc pierde ≈ 6 dB
      assert.ok(Math.abs((g2k - g4k) - 6) < 0.6, `2k→4k: ${(g2k - g4k).toFixed(2)} dB/oct`);
      assert.ok(Math.abs((g4k - g8k) - 6) < 0.6, `4k→8k: ${(g4k - g8k).toFixed(2)} dB/oct`);
    });

    it('p=+1 (HP shelf): graves intactos, agudos +6 dB (no es un highpass)', () => {
      assert.ok(Math.abs(dB(measureGain(1, 20))) < 0.05, '20 Hz casi 0 dB');
      // En fc (ωτ = 2) el shelf ya va por +4 dB: |H| = √20/√8 ≈ 1,58
      assertMatchesAnalog(1, FC_LP);
      const g5k = dB(measureGain(1, 5000));
      assert.ok(g5k > 5.5 && g5k < 6.03, `5 kHz ≈ +6 dB (${g5k.toFixed(2)})`);
    });

    it('en todo el recorrido del dial, la respuesta medida sigue el modelo analógico', () => {
      for (const p of [-1, -0.5, -0.2, 0.2, 0.5, 1]) {
        for (const f of [50, 200, 677, 1500, 3000]) {
          assertMatchesAnalog(p, f);
        }
      }
    });

    it('posiciones intermedias entre LP y plano atenúan menos cuanto más cerca de 0', () => {
      const gains = [-1, -0.75, -0.5, -0.25, 0].map(p => measureGain(p, 3000));
      for (let i = 1; i < gains.length; i++) {
        assert.ok(gains[i] > gains[i - 1], `p=${[-1, -0.75, -0.5, -0.25, 0][i]} debe atenuar menos`);
      }
    });

    it('la DC pasa a 0 dB en cualquier posición', () => {
      for (const p of [-1, -0.5, 0, 0.5, 1]) {
        const proc = createProcessor();
        const out = run(proc, () => 0.5, p, SAMPLE_RATE * 0.05);
        assert.ok(Math.abs(out[out.length - 1] - 0.5) < 1e-4, `p=${p}: ${out[out.length - 1]}`);
      }
    });

    it('un R·C distinto mueve fc: con τ doble, fc se reduce a la mitad', () => {
      const opts = { potResistance: 20000, capacitance: 47e-9 };
      const g = dB(measureGain(-1, FC_LP / 2, opts));
      assert.ok(Math.abs(g - (-3.01)) < 0.1, `-3 dB en fc/2: ${g.toFixed(3)} dB`);
    });
  });

  describe('Canales y estado', () => {
    it('los dos canales se filtran por separado, sin mezclarse', () => {
      const proc = createProcessor();
      const left = new Float32Array(BLOCK).fill(1);
      const right = new Float32Array(BLOCK);      // silencio
      const [l, r] = processBlock(proc, [left, right], -1);
      assert.ok(l[BLOCK - 1] > 0.9, 'el canal izquierdo pasa el escalón');
      assert.ok(r.every(v => v === 0), 'el derecho sigue en silencio');
    });

    it('el estado persiste entre bloques (sin discontinuidad en la frontera)', () => {
      const proc = createProcessor();
      const f = 1000;
      const sig = n => Math.sin(2 * Math.PI * f * n / SAMPLE_RATE);
      const out = run(proc, sig, -1, BLOCK * 4);
      // Un IIR de primer orden con entrada suave no puede dar saltos grandes
      // entre muestras consecutivas: máximo |Δ| ≈ 2π·f/fs·amplitud
      const maxStep = 2 * Math.PI * f / SAMPLE_RATE * 1.5;
      for (let n = 1; n < out.length; n++) {
        assert.ok(Math.abs(out[n] - out[n - 1]) < maxStep, `salto en n=${n}`);
      }
    });

    it('procesa solo los canales que tienen entrada y salida', () => {
      const proc = createProcessor();
      const inputs = [[new Float32Array(BLOCK).fill(0.5), new Float32Array(BLOCK).fill(0.5)]];
      const outputs = [[new Float32Array(BLOCK)]];
      assert.doesNotThrow(() => proc.process(inputs, outputs, { filterPosition: new Float32Array([0]) }));
      assert.ok(outputs[0][0].every(v => Math.abs(v - 0.5) < 1e-6));
    });
  });

  describe('Metering integrado', () => {
    it('apagado por defecto: no manda nada', () => {
      const proc = createProcessor();
      run(proc, () => 0.5, 0, SAMPLE_RATE * 0.3);
      assert.deepEqual(proc.port._messages, []);
    });

    it('con enableMeter manda un "meter" cada ~100 ms con peak, rms, meanAbs y meanDC de la ENTRADA', () => {
      const proc = createProcessor();
      proc.port.onmessage({ data: { type: 'enableMeter' } });
      // DC de 0.5 con el filtro en LP: la salida arranca en 0 pero la entrada
      // es constante, y lo que se mide es la entrada.
      run(proc, () => 0.5, -1, SAMPLE_RATE * 0.25);
      const meters = proc.port._messages.filter(m => m.type === 'meter');
      assert.equal(meters.length, 2, 'dos ventanas de 100 ms en 250 ms');
      for (const m of meters) {
        assert.ok(Math.abs(m.peak - 0.5) < 1e-6);
        assert.ok(Math.abs(m.rms - 0.5) < 1e-6);
        assert.ok(Math.abs(m.meanAbs - 0.5) < 1e-6);
        assert.ok(Math.abs(m.meanDC - 0.5) < 1e-6);
      }
    });

    it('con un seno, meanDC ≈ 0, rms ≈ 0,707·A y peak ≈ A', () => {
      const proc = createProcessor();
      proc.port.onmessage({ data: { type: 'enableMeter' } });
      const A = 0.8;
      run(proc, n => A * Math.sin(2 * Math.PI * 1000 * n / SAMPLE_RATE), 0, SAMPLE_RATE * 0.12);
      const [m] = proc.port._messages.filter(x => x.type === 'meter');
      assert.ok(m, 'debe haber una medición');
      assert.ok(Math.abs(m.meanDC) < 0.01);
      assert.ok(Math.abs(m.rms - A * Math.SQRT1_2) < 0.01);
      assert.ok(Math.abs(m.peak - A) < 0.01);
    });

    it('otros mensajes se ignoran', () => {
      const proc = createProcessor();
      assert.doesNotThrow(() => proc.port.onmessage({ data: { type: 'otro' } }));
      assert.doesNotThrow(() => proc.port.onmessage({ data: null }));
      assert.equal(proc._meterEnabled, false);
    });
  });
});
