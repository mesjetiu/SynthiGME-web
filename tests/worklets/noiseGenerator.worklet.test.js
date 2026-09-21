/**
 * Tests del worklet real `noise-generator` (ruido blanco + filtro COLOUR).
 *
 * Hasta septiembre de 2026 este fichero replicaba la transformada bilineal
 * del filtro y la probaba a sí misma. Ahora se carga el worklet de verdad.
 * Como la fuente es `Math.random()`, para medir el filtro se sustituye
 * temporalmente por una secuencia conocida (un seno): así el worklet
 * "genera" un seno y lo que sale es la respuesta del filtro COLOUR, que se
 * compara con el modelo analógico del circuito (τ = R·C = 3,3×10⁻⁴ s,
 * fc ≈ 965 Hz). Con el `Math.random` real se comprueban las estadísticas
 * del ruido blanco.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE_RATE = 48000;
const BLOCK = 128;

const R = 10000;
const C = 33e-9;
const TAU = R * C;
const FC = 1 / (Math.PI * TAU);          // ≈ 965 Hz

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

let NoiseProcessor;

async function loadProcessor() {
  const registered = createWorkletEnvironment();
  await import(`../../src/assets/js/worklets/noiseGenerator.worklet.js?t=${Date.now()}`);
  NoiseProcessor = registered['noise-generator'];
  assert.ok(NoiseProcessor, 'el worklet debe registrarse como "noise-generator"');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createProcessor(processorOptions) {
  const proc = new NoiseProcessor(processorOptions ? { processorOptions } : undefined);
  if (!proc.port._messages) {
    proc.port._messages = [];
    proc.port.postMessage = m => proc.port._messages.push(m);
  }
  return proc;
}

function send(proc, data) {
  proc.port.onmessage({ data });
}

/** Procesa un bloque con `channels` canales de salida y la posición dada (número o Float32Array). */
function processBlock(proc, position, channels = 1) {
  const output = Array.from({ length: channels }, () => new Float32Array(BLOCK));
  const colourPosition = position instanceof Float32Array ? position : new Float32Array([position]);
  const ok = proc.process([], [output], { colourPosition });
  return { ok, output };
}

const realRandom = Math.random;

/**
 * Sustituye Math.random por una fuente determinista: el worklet hace
 * x = random·2 − 1, así que random = (s + 1)/2 produce exactamente s.
 */
function injectSource(signalAt) {
  let n = 0;
  Math.random = () => (signalAt(n++) + 1) / 2;
}

function restoreRandom() {
  Math.random = realRandom;
}

/** Ganancia medida a `freq` con el filtro en `position`, inyectando un seno. */
function measureGain(position, freq, processorOptions) {
  const proc = createProcessor(processorOptions);
  injectSource(n => 0.5 * Math.sin(2 * Math.PI * freq * n / SAMPLE_RATE));
  const settleBlocks = Math.ceil(SAMPLE_RATE * 0.02 / BLOCK);
  const cycles = Math.max(20, Math.ceil(freq * 0.05));
  const measureBlocks = Math.ceil(cycles * SAMPLE_RATE / freq / BLOCK);
  let sumSq = 0;
  let count = 0;
  for (let b = 0; b < settleBlocks + measureBlocks; b++) {
    const { output } = processBlock(proc, position);
    if (b >= settleBlocks) {
      for (const v of output[0]) sumSq += v * v;
      count += BLOCK;
    }
  }
  restoreRandom();
  const rms = Math.sqrt(sumSq / count);
  return rms / (0.5 * Math.SQRT1_2);
}

/** |H(j2πf)| del circuito analógico: H(s) = (2 + (1+p)·sτ) / (2 + sτ). */
function analogGain(position, freq) {
  const wt = 2 * Math.PI * freq * TAU;
  return Math.hypot(2, (1 + position) * wt) / Math.hypot(2, wt);
}

const dB = g => 20 * Math.log10(g);

function assertMatchesAnalog(position, freq, tolDb = 0.2) {
  const measured = dB(measureGain(position, freq));
  const expected = dB(analogGain(position, freq));
  assert.ok(Math.abs(measured - expected) < tolDb,
    `p=${position} f=${freq} Hz: medido ${measured.toFixed(3)} dB, modelo ${expected.toFixed(3)} dB`);
}

// ═══════════════════════════════════════════════════════════════════════════

describe('noise-generator worklet', () => {
  beforeEach(loadProcessor);
  afterEach(restoreRandom);

  describe('Registro, parámetros y constantes', () => {
    it('un solo AudioParam colourPosition, a-rate, −1..+1 centrado en 0', () => {
      const [desc] = NoiseProcessor.parameterDescriptors;
      assert.equal(NoiseProcessor.parameterDescriptors.length, 1);
      assert.equal(desc.name, 'colourPosition');
      assert.equal(desc.defaultValue, 0);
      assert.equal(desc.minValue, -1);
      assert.equal(desc.maxValue, 1);
      assert.equal(desc.automationRate, 'a-rate');
    });

    it('a1 y Kinv salen de K = 2·fs·R·C con 10 kΩ y 33 nF', () => {
      const proc = createProcessor();
      const K = 2 * SAMPLE_RATE * TAU;
      assert.ok(Math.abs(proc._a1 - (2 - K) / (2 + K)) < 1e-12);
      assert.ok(Math.abs(proc._Kinv - K / (2 + K)) < 1e-12);
    });

    it('processorOptions cambian R y C', () => {
      const proc = createProcessor({ potResistance: 20000, capacitance: 47e-9 });
      const K = 2 * SAMPLE_RATE * 20000 * 47e-9;
      assert.ok(Math.abs(proc._a1 - (2 - K) / (2 + K)) < 1e-12);
    });

    it('arranca corriendo, despierto, sin bypass y con el filtro en reposo', () => {
      const proc = createProcessor();
      assert.equal(proc.isRunning, true);
      assert.equal(proc.dormant, false);
      assert.equal(proc.filterBypassed, false);
      assert.equal(proc._x1, 0);
      assert.equal(proc._y1, 0);
    });
  });

  describe('Ruido blanco (Math.random real)', () => {
    it('p=0: salida dentro de ±1, media ≈ 0 y RMS ≈ 1/√3 (uniforme)', () => {
      const proc = createProcessor();
      let sum = 0, sumSq = 0, count = 0;
      for (let b = 0; b < 400; b++) {
        const { output } = processBlock(proc, 0);
        for (const v of output[0]) {
          assert.ok(v >= -1 && v <= 1);
          sum += v; sumSq += v * v; count++;
        }
      }
      assert.ok(Math.abs(sum / count) < 0.02, `media ${sum / count}`);
      const rms = Math.sqrt(sumSq / count);
      assert.ok(Math.abs(rms - 1 / Math.sqrt(3)) < 0.02, `RMS ${rms}`);
    });

    it('cada bloque es distinto del anterior', () => {
      const proc = createProcessor();
      const a = processBlock(proc, 0).output[0].slice();
      const b = processBlock(proc, 0).output[0];
      assert.ok(a.some((v, i) => v !== b[i]));
    });

    it('p=−1 (LP) reduce la energía; p=+1 (HP) la aumenta', () => {
      const rmsAt = p => {
        const proc = createProcessor();
        let sumSq = 0;
        for (let b = 0; b < 300; b++) for (const v of processBlock(proc, p).output[0]) sumSq += v * v;
        return Math.sqrt(sumSq / (300 * BLOCK));
      };
      const flat = rmsAt(0), lp = rmsAt(-1), hp = rmsAt(1);
      assert.ok(lp < flat * 0.6, `LP ${lp.toFixed(3)} vs plano ${flat.toFixed(3)}`);
      assert.ok(hp > flat * 1.3, `HP ${hp.toFixed(3)} vs plano ${flat.toFixed(3)}`);
    });
  });

  describe('Filtro COLOUR medido (fuente inyectada)', () => {
    it('p=0: la salida es la fuente tal cual, muestra a muestra', () => {
      const proc = createProcessor();
      const src = new Float32Array(BLOCK).map((_, i) => Math.sin(i * 0.41) * 0.7);
      injectSource(n => src[n % BLOCK]);
      const { output } = processBlock(proc, 0);
      for (let i = 0; i < BLOCK; i++) assert.ok(Math.abs(output[0][i] - src[i]) < 1e-6, `muestra ${i}`);
    });

    it('p=−1 (LP): −3 dB en fc ≈ 965 Hz y 6 dB/oct por encima', () => {
      const g = dB(measureGain(-1, FC));
      assert.ok(Math.abs(g - (-3.01)) < 0.1, `en fc: ${g.toFixed(3)} dB`);
      const g4k = dB(measureGain(-1, 4000));
      const g8k = dB(measureGain(-1, 8000));
      assert.ok(Math.abs((g4k - g8k) - 6) < 0.6, `4k→8k: ${(g4k - g8k).toFixed(2)} dB/oct`);
    });

    it('p=+1 (HP): graves intactos, agudos hacia +6 dB', () => {
      assert.ok(Math.abs(dB(measureGain(1, 30))) < 0.05);
      const g8k = dB(measureGain(1, 8000));
      assert.ok(g8k > 5.5 && g8k < 6.03, `8 kHz: ${g8k.toFixed(2)} dB`);
    });

    it('en todo el recorrido del dial la respuesta sigue el modelo del circuito', () => {
      for (const p of [-1, -0.5, -0.2, 0.2, 0.5, 1]) {
        for (const f of [100, 500, 965, 2000, 3000]) assertMatchesAnalog(p, f);
      }
    });

    it('un R·C distinto mueve fc', () => {
      const opts = { potResistance: 10000, capacitance: 66e-9 };   // τ doble → fc/2
      const g = dB(measureGain(-1, FC / 2, opts));
      assert.ok(Math.abs(g - (-3.01)) < 0.1, `-3 dB en fc/2: ${g.toFixed(3)} dB`);
    });

    it('la DC pasa intacta en cualquier posición', () => {
      for (const p of [-1, 0, 1]) {
        const proc = createProcessor();
        injectSource(() => 0.4);
        let out;
        for (let b = 0; b < 30; b++) out = processBlock(proc, p).output[0];
        assert.ok(Math.abs(out[BLOCK - 1] - 0.4) < 1e-4, `p=${p}: ${out[BLOCK - 1]}`);
      }
    });
  });

  describe('a-rate y estado', () => {
    it('un array de 128 posiciones iguales da lo mismo que la posición constante', () => {
      injectSource(n => 0.5 * Math.sin(n * 0.3));
      const a = createProcessor();
      const outA = processBlock(a, -0.6).output[0].slice();
      injectSource(n => 0.5 * Math.sin(n * 0.3));
      const b = createProcessor();
      const outB = processBlock(b, new Float32Array(BLOCK).fill(-0.6)).output[0];
      for (let i = 0; i < BLOCK; i++) assert.ok(Math.abs(outA[i] - outB[i]) < 1e-9, `muestra ${i}`);
    });

    it('la posición puede cambiar dentro del bloque (modulación CV)', () => {
      // Primera mitad plano (salida = fuente), segunda mitad LP fuerte
      const src = n => 0.5 * Math.sin(2 * Math.PI * 8000 * n / SAMPLE_RATE);
      injectSource(src);
      const proc = createProcessor();
      const pos = new Float32Array(BLOCK);
      pos.fill(0, 0, 64);
      pos.fill(-1, 64);
      const { output } = processBlock(proc, pos);
      for (let i = 0; i < 64; i++) assert.ok(Math.abs(output[0][i] - src(i)) < 1e-6, `plano en ${i}`);
      let sumSq = 0;
      for (let i = 100; i < BLOCK; i++) sumSq += output[0][i] ** 2;
      const rmsLP = Math.sqrt(sumSq / 28);
      assert.ok(rmsLP < 0.5 * Math.SQRT1_2 * 0.5, `8 kHz atenuado en la mitad LP: rms ${rmsLP.toFixed(3)}`);
    });

    it('el estado del filtro persiste entre bloques', () => {
      injectSource(n => 0.5 * Math.sin(2 * Math.PI * 200 * n / SAMPLE_RATE));
      const proc = createProcessor();
      const first = processBlock(proc, -1).output[0].slice();
      const second = processBlock(proc, -1).output[0];
      assert.notEqual(proc._x1, 0);
      assert.notEqual(proc._y1, 0);
      // Sin discontinuidad en la frontera: el salto entre bloques es del orden del salto entre muestras
      const intraStep = Math.abs(first[BLOCK - 1] - first[BLOCK - 2]);
      const boundaryStep = Math.abs(second[0] - first[BLOCK - 1]);
      assert.ok(boundaryStep < intraStep * 3 + 1e-6, `frontera ${boundaryStep} vs interno ${intraStep}`);
    });

    it('mono → los canales extra son copia del primero', () => {
      const proc = createProcessor();
      const { output } = processBlock(proc, -0.3, 2);
      assert.deepEqual(Array.from(output[1]), Array.from(output[0]));
    });
  });

  describe('Bypass del filtro', () => {
    it('con setFilterBypassed y |p| < 0,02 saca el ruido sin filtrar y resetea el estado', () => {
      const proc = createProcessor();
      injectSource(n => 0.3 * Math.sin(n * 0.5));
      processBlock(proc, -1);                            // ensuciar el estado
      assert.notEqual(proc._y1, 0);
      send(proc, { type: 'setFilterBypassed', bypassed: true });
      const src = new Float32Array(BLOCK).map((_, i) => Math.sin(i * 0.2) * 0.6);
      injectSource(n => src[n % BLOCK]);
      const { output } = processBlock(proc, 0.01, 2);
      for (let i = 0; i < BLOCK; i++) assert.ok(Math.abs(output[0][i] - src[i]) < 1e-6, `muestra ${i}`);
      assert.equal(proc._x1, 0);
      assert.equal(proc._y1, 0);
      assert.deepEqual(Array.from(output[1]), Array.from(output[0]), 'también copia a estéreo');
    });

    it('con bypass activo pero |p| ≥ 0,02 sigue filtrando', () => {
      const proc = createProcessor();
      send(proc, { type: 'setFilterBypassed', bypassed: true });
      injectSource(n => 0.5 * Math.sin(2 * Math.PI * 8000 * n / SAMPLE_RATE));
      let out;
      for (let b = 0; b < 10; b++) out = processBlock(proc, -1).output[0];
      let sumSq = 0;
      for (const v of out) sumSq += v * v;
      assert.ok(Math.sqrt(sumSq / BLOCK) < 0.1, '8 kHz con LP a tope queda muy atenuado');
    });

    it('sin bypass, |p| < 0,02 pasa por el IIR igualmente (estado no se resetea)', () => {
      const proc = createProcessor();
      injectSource(n => 0.3 * Math.sin(n * 0.5));
      processBlock(proc, 0.01);
      assert.notEqual(proc._x1, 0);
    });

    it('con p modulado (a-rate) nunca hay bypass', () => {
      const proc = createProcessor();
      send(proc, { type: 'setFilterBypassed', bypassed: true });
      injectSource(n => 0.3 * Math.sin(n * 0.5));
      processBlock(proc, new Float32Array(BLOCK).fill(0));
      assert.notEqual(proc._x1, 0, 'ha pasado por el filtro');
    });
  });

  describe('Mensajes y ciclo de vida', () => {
    it('setDormant: silencio en todos los canales, sin tocar el estado del filtro', () => {
      const proc = createProcessor();
      injectSource(n => 0.3 * Math.sin(n * 0.5));
      processBlock(proc, -1);
      const { x, y } = { x: proc._x1, y: proc._y1 };
      send(proc, { type: 'setDormant', dormant: true });
      const { ok, output } = processBlock(proc, -1, 2);
      assert.equal(ok, true);
      assert.ok(output[0].every(v => v === 0) && output[1].every(v => v === 0));
      assert.equal(proc._x1, x);
      assert.equal(proc._y1, y);
      send(proc, { type: 'setDormant', dormant: false });
      assert.ok(processBlock(proc, -1).output[0].some(v => v !== 0));
    });

    it('stop: process() devuelve false y el nodo muere', () => {
      const proc = createProcessor();
      send(proc, { type: 'stop' });
      assert.equal(processBlock(proc, 0).ok, false);
    });

    it('sin salida sigue vivo; mensajes desconocidos se ignoran', () => {
      const proc = createProcessor();
      assert.equal(proc.process([], [[]], { colourPosition: new Float32Array([0]) }), true);
      assert.doesNotThrow(() => send(proc, { type: 'otro' }));
      assert.equal(proc.isRunning, true);
    });

    it('si algo revienta dentro, saca silencio y avisa una sola vez', () => {
      const proc = createProcessor();
      const outputs = [[new Float32Array(BLOCK).fill(0.3)]];
      const bad = { colourPosition: null };            // .length de null revienta
      assert.equal(proc.process([], outputs, bad), true);
      assert.ok(outputs[0][0].every(v => v === 0));
      proc.process([], outputs, bad);
      const errors = proc.port._messages.filter(m => m.type === 'process-error');
      assert.equal(errors.length, 1);
    });
  });
});
