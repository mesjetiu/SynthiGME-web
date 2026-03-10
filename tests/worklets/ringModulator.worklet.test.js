/**
 * Tests para Ring Modulator Worklet
 *
 * Verifica el procesador DSP del modulador de anillo:
 * - Soft-clip: transparente bajo umbral, saturación suave sobre umbral
 * - Multiplicación pura de dos entradas
 * - Silencio cuando una entrada no está conectada (anything × 0 = 0)
 * - Manejo de dormancy (silencio sin destruir el procesador)
 * - Stop (destruye el procesador)
 * - Constantes del módulo
 * - Propiedades matemáticas (doblador de frecuencia, puerta de voltaje)
 *
 * Los tests se dividen en:
 *   PARTE 1: Tests offline de funciones DSP (softClip)
 *   PARTE 2: Propiedades matemáticas del multiplicador
 *   PARTE 3: Import real con mocks del entorno AudioWorklet
 *
 * @module tests/worklets/ringModulator.worklet.test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (replicadas del worklet para tests offline)
// ═══════════════════════════════════════════════════════════════════════════

const SOFT_CLIP_THRESHOLD = 0.8;

/**
 * Réplica de la función softClip del worklet para tests offline.
 */
function softClip(x) {
  if (x >= -SOFT_CLIP_THRESHOLD && x <= SOFT_CLIP_THRESHOLD) {
    return x;
  }
  const sign = x > 0 ? 1 : -1;
  const ax = Math.abs(x);
  const excess = ax - SOFT_CLIP_THRESHOLD;
  const range = 1.0 - SOFT_CLIP_THRESHOLD;
  return sign * (SOFT_CLIP_THRESHOLD + range * Math.tanh(excess / range));
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: SOFT-CLIP
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Worklet - softClip', () => {

  it('transparente para valores dentro del umbral (±0.8)', () => {
    assert.strictEqual(softClip(0), 0);
    assert.strictEqual(softClip(0.5), 0.5);
    assert.strictEqual(softClip(-0.5), -0.5);
    assert.strictEqual(softClip(0.8), 0.8);
    assert.strictEqual(softClip(-0.8), -0.8);
    assert.strictEqual(softClip(0.79), 0.79);
  });

  it('satura suavemente por encima del umbral', () => {
    const clipped = softClip(1.0);
    assert.ok(clipped > SOFT_CLIP_THRESHOLD, 'debe exceder el umbral');
    assert.ok(clipped < 1.0, 'debe estar por debajo de 1.0');
    // Con threshold=0.8 y tanh: softClip(1.0) ≈ 0.952
    assert.ok(Math.abs(clipped - 0.952) < 0.01, `expected ~0.952, got ${clipped}`);
  });

  it('satura simétricamente para valores negativos', () => {
    const pos = softClip(1.5);
    const neg = softClip(-1.5);
    assert.ok(Math.abs(pos + neg) < 1e-10, 'debe ser simétrico');
  });

  it('nunca excede ±1.0 para señales muy altas', () => {
    assert.ok(softClip(10.0) <= 1.0);
    assert.ok(softClip(-10.0) >= -1.0);
    assert.ok(softClip(100.0) <= 1.0);
  });

  it('asíntota se acerca a ±1.0', () => {
    const large = softClip(50.0);
    assert.ok(large > 0.99, `expected > 0.99, got ${large}`);
    assert.ok(large <= 1.0, 'must not exceed 1.0');
  });

  it('la derivada en el umbral es continua (sin discontinuidad)', () => {
    const epsilon = 0.0001;
    const belowThreshold = softClip(SOFT_CLIP_THRESHOLD - epsilon);
    const atThreshold = softClip(SOFT_CLIP_THRESHOLD);
    const aboveThreshold = softClip(SOFT_CLIP_THRESHOLD + epsilon);

    // La diferencia debe ser pequeña (continuidad)
    const diff1 = Math.abs(atThreshold - belowThreshold);
    const diff2 = Math.abs(aboveThreshold - atThreshold);
    assert.ok(diff1 < 0.001, `discontinuidad inferior: ${diff1}`);
    assert.ok(diff2 < 0.001, `discontinuidad superior: ${diff2}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: PROPIEDADES MATEMÁTICAS DEL MULTIPLICADOR
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Worklet - Propiedades matemáticas', () => {

  it('doblador de frecuencia: sin(wt) × sin(wt) produce cos(2wt)', () => {
    // sin²(wt) = (1 - cos(2wt)) / 2
    // Cuando la misma señal se conecta a ambas entradas,
    // la salida contiene el doble de la frecuencia (octava superior)
    const freq = 440;
    const sr = 44100;
    const len = 128;

    const sinA = new Float32Array(len);
    const result = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      sinA[i] = 0.7 * Math.sin(2 * Math.PI * freq * i / sr);
      // Multiplicación: sin(wt) × sin(wt) = sin²(wt)
      result[i] = sinA[i] * sinA[i];
    }

    // La salida debe tener componente DC (promedio > 0) y frecuencia 2f
    const dc = result.reduce((a, b) => a + b, 0) / len;
    assert.ok(dc > 0, 'sin² debe tener componente DC positivo');
    // DC teórico = A²/2 = 0.7²/2 = 0.245
    assert.ok(Math.abs(dc - 0.245) < 0.05, `DC esperado ~0.245, got ${dc}`);
  });

  it('puerta de voltaje: señal × 0 = 0 (silencio)', () => {
    const signal = [0.5, -0.3, 0.9, -0.7];
    for (const s of signal) {
      assert.ok(Math.abs(s * 0) === 0, `${s} × 0 debe ser 0`);
    }
  });

  it('modulación de anillo: sin(f1) × sin(f2) produce suma y diferencia', () => {
    // Verificar que la multiplicación de dos sinusoidales
    // produce componentes en f1+f2 y f1-f2
    const f1 = 440, f2 = 220;
    const sr = 44100;
    const len = 4096; // Suficiente para FFT

    const result = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const a = Math.sin(2 * Math.PI * f1 * i / sr);
      const b = Math.sin(2 * Math.PI * f2 * i / sr);
      result[i] = a * b;
    }

    // Analizar energía: sin(f1)×sin(f2) = 0.5[cos(f1-f2) - cos(f1+f2)]
    // f1-f2 = 220 Hz, f1+f2 = 660 Hz
    // No necesitamos FFT real, verificamos la identidad trigonométrica
    const expected = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      expected[i] = 0.5 * (Math.cos(2 * Math.PI * (f1 - f2) * t) -
                            Math.cos(2 * Math.PI * (f1 + f2) * t));
    }

    // Comparar resultado con identidad trigonométrica
    let maxError = 0;
    for (let i = 0; i < len; i++) {
      const err = Math.abs(result[i] - expected[i]);
      if (err > maxError) maxError = err;
    }
    assert.ok(maxError < 1e-10, `Error máximo: ${maxError}`);
  });

  it('multiplicación conmutativa: A×B = B×A', () => {
    const sr = 44100;
    const len = 128;
    for (let i = 0; i < len; i++) {
      const a = Math.sin(2 * Math.PI * 440 * i / sr) * 0.6;
      const b = Math.sin(2 * Math.PI * 330 * i / sr) * 0.4;
      assert.ok(Math.abs(a * b - b * a) < 1e-15, 'Multiplicación debe ser conmutativa');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: IMPORT REAL (con mocks del entorno AudioWorklet)
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Worklet - Import real', () => {

  let ProcessorClass;

  // Mock del entorno AudioWorklet
  beforeEach(async () => {
    // Preparar globals del AudioWorklet
    globalThis.AudioWorkletProcessor = class {
      constructor() {
        this.port = {
          onmessage: null,
          postMessage: () => {}
        };
      }
    };

    globalThis.sampleRate = 44100;

    // Capturar la clase registrada
    globalThis.registerProcessor = (name, cls) => {
      if (name === 'ring-modulator') {
        ProcessorClass = cls;
      }
    };

    // Importar el worklet (fuerza re-evaluación con timestamp)
    const workletPath = resolve('src/assets/js/worklets/ringModulator.worklet.js');
    const code = readFileSync(workletPath, 'utf-8');
    const dataUri = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    await import(dataUri);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function createProcessor() {
    const proc = new ProcessorClass();
    return proc;
  }

  function makeBuffers(inputA, inputB, length = 128) {
    const outBuf = new Float32Array(length);
    const inputs = [];
    const outputs = [[outBuf]];

    if (inputA !== null) {
      const bufA = inputA instanceof Float32Array ? inputA : new Float32Array(length).fill(inputA);
      inputs.push([bufA]);
    } else {
      inputs.push([]); // No connection
    }

    if (inputB !== null) {
      const bufB = inputB instanceof Float32Array ? inputB : new Float32Array(length).fill(inputB);
      inputs.push([bufB]);
    } else {
      inputs.push([]); // No connection
    }

    return { inputs, outputs };
  }

  // ── Tests ────────────────────────────────────────────────────────────────

  it('se registra como "ring-modulator"', () => {
    assert.ok(ProcessorClass, 'Debe registrar el procesador');
  });

  it('process() retorna true en operación normal', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(0.5, 0.3);
    const result = proc.process(inputs, outputs);
    assert.strictEqual(result, true);
  });

  it('multiplica correctamente dos señales constantes', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(0.5, 0.6);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      // Float32 precision: tolerance ~1e-7
      assert.ok(Math.abs(output[i] - 0.3) < 1e-6, `sample ${i}: expected ~0.3, got ${output[i]}`);
    }
  });

  it('multiplica correctamente señales variables', () => {
    const proc = createProcessor();
    const len = 128;
    const bufA = new Float32Array(len);
    const bufB = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      bufA[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 44100);
      bufB[i] = 0.7 * Math.sin(2 * Math.PI * 330 * i / 44100);
    }
    const { inputs, outputs } = makeBuffers(bufA, bufB, len);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < len; i++) {
      const expected = bufA[i] * bufB[i];
      // Float32 precision: tolerance of ~1e-7
      assert.ok(Math.abs(output[i] - expected) < 1e-6,
        `sample ${i}: expected ${expected}, got ${output[i]}`);
    }
  });

  it('aplica soft-clip a señales que exceden el umbral', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(1.5, 0.5);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    // softClip(1.5) × softClip(0.5) = softClip(1.5) × 0.5
    // softClip(1.5) < 1.0 (saturado)
    const clippedA = SOFT_CLIP_THRESHOLD +
      (1 - SOFT_CLIP_THRESHOLD) * Math.tanh((1.5 - SOFT_CLIP_THRESHOLD) / (1 - SOFT_CLIP_THRESHOLD));
    const expected = clippedA * 0.5;
    // Float32 precision: tolerance of ~1e-7
    assert.ok(Math.abs(output[0] - expected) < 1e-6,
      `expected ~${expected}, got ${output[0]}`);
  });

  it('silencio cuando entrada A no está conectada', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(null, 0.5);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      assert.ok(Math.abs(output[i]) === 0, `sample ${i} debe ser 0`);
    }
  });

  it('silencio cuando entrada B no está conectada', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(0.5, null);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      assert.ok(Math.abs(output[i]) === 0, `sample ${i} debe ser 0`);
    }
  });

  it('silencio cuando ambas entradas no están conectadas', () => {
    const proc = createProcessor();
    const { inputs, outputs } = makeBuffers(null, null);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      assert.ok(Math.abs(output[i]) === 0, `sample ${i} debe ser 0`);
    }
  });

  it('puerta de voltaje: señal × DC_0 = silencio', () => {
    const proc = createProcessor();
    const len = 128;
    const bufA = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      bufA[i] = 0.8 * Math.sin(2 * Math.PI * 440 * i / 44100);
    }
    const { inputs, outputs } = makeBuffers(bufA, 0.0, len);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      assert.ok(Math.abs(output[i]) === 0, `sample ${i} debe ser 0 (got ${output[i]})`);
    }
  });

  // ── Dormancy ─────────────────────────────────────────────────────────────

  it('dormancy: salida es silencio cuando dormant', () => {
    const proc = createProcessor();
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

    const { inputs, outputs } = makeBuffers(0.5, 0.3);
    proc.process(inputs, outputs);

    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      assert.ok(Math.abs(output[i]) === 0, `sample ${i} must be 0 during dormancy`);
    }
  });

  it('dormancy: process() sigue retornando true (no destruye)', () => {
    const proc = createProcessor();
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });

    const { inputs, outputs } = makeBuffers(0.5, 0.3);
    const result = proc.process(inputs, outputs);
    assert.strictEqual(result, true, 'dormancy no debe destruir el procesador');
  });

  it('dormancy: se recupera al despertar', () => {
    const proc = createProcessor();

    // Dormir
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    let { inputs, outputs } = makeBuffers(0.5, 0.4);
    proc.process(inputs, outputs);
    assert.ok(Math.abs(outputs[0][0][0]) === 0, 'dormant = silencio');

    // Despertar
    proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });
    const bufs2 = makeBuffers(0.5, 0.4);
    proc.process(bufs2.inputs, bufs2.outputs);
    const outVal = bufs2.outputs[0][0][0];
    // Float32 precision: tolerance of ~1e-7
    assert.ok(Math.abs(outVal - 0.2) < 1e-6,
      `despierto = multiplicación normal (got ${outVal})`);
  });

  // ── Stop ─────────────────────────────────────────────────────────────────

  it('stop: process() retorna false (destruye el procesador)', () => {
    const proc = createProcessor();
    proc.port.onmessage({ data: { type: 'stop' } });

    const { inputs, outputs } = makeBuffers(0.5, 0.3);
    const result = proc.process(inputs, outputs);
    assert.strictEqual(result, false, 'stop debe destruir el procesador');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Worklet - Constantes', () => {

  it('SOFT_CLIP_THRESHOLD es 0.8 (8V p-p / 10V p-p)', () => {
    assert.strictEqual(SOFT_CLIP_THRESHOLD, 0.8);
  });

  it('threshold representa 8V p-p límite sobre rango ~10V total', () => {
    // El Synthi 100 tiene rango interno de ~±5V (10V p-p)
    // Las entradas del ring mod soportan hasta 8V p-p sin distorsión
    const ratio = 8 / 10;
    assert.strictEqual(SOFT_CLIP_THRESHOLD, ratio);
  });
});
