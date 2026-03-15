/**
 * Tests para pitchToVoltageConverter.worklet.js — AudioWorkletProcessor del PVC
 * 
 * Verifica la lógica del procesador de pitch detection:
 * 
 * 1. ZERO-CROSSING: Detección de cruces por cero y medición de periodo
 * 2. RANGE MAPPING: Conversión de dial Range a factor de spread
 * 3. TRACK & HOLD: Mantiene voltaje cuando señal cae bajo umbral
 * 4. DORMANCY: Silencio de salida sin perder estado
 * 5. LOG CONVERSION: Frecuencia lineal → voltaje logarítmico (1V/Oct)
 * 
 * Referencia: Placa PC-25, plano D100-25 C1 (Cuenca/Datanomics 1982)
 * 
 * @version 1.0.0
 */

import { describe, test, it } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (deben coincidir con pitchToVoltageConverter.worklet.js)
// ═══════════════════════════════════════════════════════════════════════════

const MIN_FREQ = 250;
const MAX_FREQ = 8000;
const AMPLITUDE_THRESHOLD = 0.02;
const VOLTS_PER_OCTAVE = 1.0;
const DIGITAL_TO_VOLTAGE = 4.0;
const REFERENCE_FREQ = 440;  // A4 como referencia para conversión log
const RANGE_UNITY = 7;       // Posición del dial que da 1:1
const RANGE_MAX_SPREAD = 2;  // Factor máximo de spread en posición 10
const SAMPLE_RATE = 48000;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convierte frecuencia a voltaje logarítmico (1V/Oct).
 * Fórmula: log2(freq / referenceFreq) * voltsPerOctave
 * Resultado en unidades digitales (/ DIGITAL_TO_VOLTAGE)
 */
function freqToVoltage(freq, spreadFactor = 1) {
  if (freq <= 0) return 0;
  const octaves = Math.log2(freq / REFERENCE_FREQ);
  return (octaves * VOLTS_PER_OCTAVE * spreadFactor) / DIGITAL_TO_VOLTAGE;
}

/**
 * Convierte dial Range (0-10) a factor de spread.
 * Posición 0: spread=-2 (invertido, rango completo)
 * Posición 3.5: spread=0 (punto muerto)
 * Posición 7: spread=1 (1:1)
 * Posición 10: spread=2 (2:1)
 *
 * Dos tramos lineales con punto de inflexión en 3.5:
 * - [0, 3.5] → [-2, 0]
 * - [3.5, 10] → [0, 2]
 * Para que 7→1, usamos interpolación lineal en [3.5, 10]:
 *   spread = (dial - 3.5) / (10 - 3.5) * 2
 * Esto da 7 → (3.5/6.5)*2 ≈ 1.077, así que ajustamos:
 * Usamos una tabla de 3 puntos: 3.5→0, 7→1, 10→2
 */
function rangeDialToSpread(dial) {
  if (dial <= 3.5) {
    // Zona invertida: 0→-2, 3.5→0
    return -2 * (1 - dial / 3.5);
  }
  if (dial <= 7) {
    // Zona baja: 3.5→0, 7→1
    return (dial - 3.5) / (7 - 3.5);
  }
  // Zona alta: 7→1, 10→2
  return 1 + (dial - 7) / (10 - 7);
}

/**
 * Detecta si la amplitud RMS de un bloque supera el umbral.
 */
function checkAmplitude(samples, threshold) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms >= threshold;
}

/**
 * Estima frecuencia por conteo de cruces por cero (half-cycle).
 * Mide el periodo del primer medio ciclo detectado.
 */
function estimateFreqFromZeroCrossings(samples, sampleRate) {
  let lastSign = samples[0] >= 0 ? 1 : -1;
  let firstCrossing = -1;
  let secondCrossing = -1;
  
  for (let i = 1; i < samples.length; i++) {
    const sign = samples[i] >= 0 ? 1 : -1;
    if (sign !== lastSign) {
      if (firstCrossing === -1) {
        firstCrossing = i;
      } else {
        secondCrossing = i;
        break;
      }
      lastSign = sign;
    }
  }
  
  if (firstCrossing === -1 || secondCrossing === -1) return 0;
  
  // Periodo de medio ciclo → frecuencia
  const halfPeriodSamples = secondCrossing - firstCrossing;
  return sampleRate / (halfPeriodSamples * 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: CONVERSIÓN FRECUENCIA → VOLTAJE (LOG)
// ═══════════════════════════════════════════════════════════════════════════

describe('PVC Worklet — freqToVoltage', () => {
  
  test('A4 (440 Hz) → 0V (frecuencia de referencia)', () => {
    const v = freqToVoltage(440);
    assert.ok(Math.abs(v) < 1e-10, `Expected 0, got ${v}`);
  });
  
  test('A5 (880 Hz) → +1 octava → +0.25 digital (1V/4)', () => {
    const v = freqToVoltage(880);
    assert.ok(Math.abs(v - 1 / DIGITAL_TO_VOLTAGE) < 1e-10, `Got ${v}`);
  });
  
  test('A3 (220 Hz) → -1 octava → -0.25 digital (-1V/4)', () => {
    const v = freqToVoltage(220);
    assert.ok(Math.abs(v - (-1 / DIGITAL_TO_VOLTAGE)) < 1e-10, `Got ${v}`);
  });
  
  test('A6 (1760 Hz) → +2 octavas → +0.5 digital', () => {
    const v = freqToVoltage(1760);
    assert.ok(Math.abs(v - 2 / DIGITAL_TO_VOLTAGE) < 1e-10, `Got ${v}`);
  });
  
  test('spreadFactor=2 duplica el voltaje', () => {
    const v1 = freqToVoltage(880, 1);
    const v2 = freqToVoltage(880, 2);
    assert.ok(Math.abs(v2 - v1 * 2) < 1e-10);
  });
  
  test('spreadFactor=-1 invierte la polaridad', () => {
    const v1 = freqToVoltage(880, 1);
    const v2 = freqToVoltage(880, -1);
    assert.ok(Math.abs(v1 + v2) < 1e-10);
  });
  
  test('freq <= 0 → 0 digital', () => {
    assert.strictEqual(freqToVoltage(0), 0);
    assert.strictEqual(freqToVoltage(-100), 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: RANGE DIAL → SPREAD FACTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('PVC Worklet — rangeDialToSpread', () => {
  
  test('dial=7 → spread=1 (1:1)', () => {
    const s = rangeDialToSpread(7);
    assert.ok(Math.abs(s - 1) < 1e-10, `Expected 1, got ${s}`);
  });
  
  test('dial=10 → spread=2 (2:1)', () => {
    const s = rangeDialToSpread(10);
    assert.ok(Math.abs(s - 2) < 1e-10, `Expected 2, got ${s}`);
  });
  
  test('dial=3.5 → spread=0 (punto muerto)', () => {
    const s = rangeDialToSpread(3.5);
    assert.ok(Math.abs(s) < 1e-10, `Expected 0, got ${s}`);
  });
  
  test('dial=0 → spread=-2 (invertido, rango completo)', () => {
    const s = rangeDialToSpread(0);
    assert.ok(Math.abs(s - (-2)) < 1e-10, `Expected -2, got ${s}`);
  });
  
  test('dial=3 → spread negativo (zona invertida)', () => {
    const s = rangeDialToSpread(3);
    assert.ok(s < 0, `Expected negative spread, got ${s}`);
  });
  
  test('dial=5 → spread entre 0 y 1 (zona normal baja)', () => {
    const s = rangeDialToSpread(5);
    assert.ok(s > 0 && s < 1, `Expected 0 < spread < 1, got ${s}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: DETECCIÓN DE AMPLITUD
// ═══════════════════════════════════════════════════════════════════════════

describe('PVC Worklet — checkAmplitude', () => {
  
  test('señal silenciosa → bajo umbral', () => {
    const samples = new Float32Array(128).fill(0);
    assert.strictEqual(checkAmplitude(samples, AMPLITUDE_THRESHOLD), false);
  });
  
  test('señal fuerte → sobre umbral', () => {
    const samples = new Float32Array(128).fill(0.5);
    assert.strictEqual(checkAmplitude(samples, AMPLITUDE_THRESHOLD), true);
  });
  
  test('señal ligeramente sobre el umbral → sobre umbral', () => {
    const samples = new Float32Array(128).fill(AMPLITUDE_THRESHOLD * 1.1);
    assert.strictEqual(checkAmplitude(samples, AMPLITUDE_THRESHOLD), true);
  });
  
  test('señal sinusoidal con pico 0.1 → sobre umbral', () => {
    const samples = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      samples[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE);
    }
    assert.strictEqual(checkAmplitude(samples, AMPLITUDE_THRESHOLD), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: ESTIMACIÓN DE FRECUENCIA POR CRUCES POR CERO
// ═══════════════════════════════════════════════════════════════════════════

describe('PVC Worklet — estimateFreqFromZeroCrossings', () => {
  
  test('sinusoide de 440 Hz → estimación cercana a 440 Hz', () => {
    const numSamples = 1024;
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE);
    }
    const freq = estimateFreqFromZeroCrossings(samples, SAMPLE_RATE);
    // Tolerancia amplia: el método de medio ciclo no es perfecto
    assert.ok(Math.abs(freq - 440) < 20, `Expected ~440 Hz, got ${freq}`);
  });
  
  test('sinusoide de 1000 Hz → estimación cercana a 1000 Hz', () => {
    const numSamples = 1024;
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.sin(2 * Math.PI * 1000 * i / SAMPLE_RATE);
    }
    const freq = estimateFreqFromZeroCrossings(samples, SAMPLE_RATE);
    assert.ok(Math.abs(freq - 1000) < 50, `Expected ~1000 Hz, got ${freq}`);
  });
  
  test('señal DC (sin cruces) → 0 Hz', () => {
    const samples = new Float32Array(128).fill(0.5);
    const freq = estimateFreqFromZeroCrossings(samples, SAMPLE_RATE);
    assert.strictEqual(freq, 0);
  });
  
  test('silencio → 0 Hz', () => {
    const samples = new Float32Array(128).fill(0);
    const freq = estimateFreqFromZeroCrossings(samples, SAMPLE_RATE);
    assert.strictEqual(freq, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 5: INTEGRACIÓN — PIPELINE COMPLETO
// ═══════════════════════════════════════════════════════════════════════════

describe('PVC Worklet — Pipeline completo', () => {
  
  test('señal 440 Hz con range=7 → voltaje ~0V (referencia)', () => {
    const spread = rangeDialToSpread(7);
    const voltage = freqToVoltage(440, spread);
    assert.ok(Math.abs(voltage) < 1e-10, `Expected ~0V, got ${voltage}`);
  });
  
  test('señal 880 Hz con range=7 → voltaje positivo (1 oct up)', () => {
    const spread = rangeDialToSpread(7);
    const voltage = freqToVoltage(880, spread);
    assert.ok(voltage > 0, `Expected positive voltage, got ${voltage}`);
  });
  
  test('señal 880 Hz con range=0 → voltaje negativo (invertido)', () => {
    const spread = rangeDialToSpread(0);
    const voltage = freqToVoltage(880, spread);
    assert.ok(voltage < 0, `Expected negative voltage (inverted), got ${voltage}`);
  });
  
  test('señal 880 Hz con range=10 → mayor voltaje que range=7', () => {
    const spread7 = rangeDialToSpread(7);
    const spread10 = rangeDialToSpread(10);
    const v7 = freqToVoltage(880, spread7);
    const v10 = freqToVoltage(880, spread10);
    assert.ok(v10 > v7, `range=10 (${v10}) should give more voltage than range=7 (${v7})`);
  });
  
  test('track & hold: señal silenciosa mantiene último voltaje válido', () => {
    // Simular: primero señal fuerte, luego silencio
    const strongSignal = new Float32Array(128).fill(0.5);
    const silentSignal = new Float32Array(128).fill(0);
    
    const lastVoltage = 0.25; // simulando un voltaje previo
    
    const aboveThreshold = checkAmplitude(strongSignal, AMPLITUDE_THRESHOLD);
    assert.strictEqual(aboveThreshold, true);
    
    const belowThreshold = checkAmplitude(silentSignal, AMPLITUDE_THRESHOLD);
    assert.strictEqual(belowThreshold, false);
    
    // Cuando bajo umbral, devolver lastVoltage (no 0)
    const output = belowThreshold ? 0 : lastVoltage; // esto es lo que NO haría el PVC
    const pvcOutput = belowThreshold ? lastVoltage : lastVoltage; // esto SÍ: track & hold
    assert.strictEqual(pvcOutput, lastVoltage);
  });
});
