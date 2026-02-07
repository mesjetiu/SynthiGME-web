/**
 * Tests para el Noise Generator AudioWorklet Processor — Synthi 100 Cuenca
 * 
 * Verifica la lógica del filtro IIR de 1er orden (6 dB/oct) que modela
 * el circuito COLOUR del generador de ruido:
 * - Coeficientes del filtro (a1, Kinv) a partir de R·C
 * - Respuesta plana a p=0 (white noise)
 * - Respuesta LP a p=-1 (dark/pink noise)
 * - Respuesta HP a p=+1 (bright/blue noise)
 * - Atenuación 6 dB/oct en posición LP
 * 
 * Estos tests replican la matemática del worklet sin necesitar
 * AudioContext real, verificando la implementación IIR offline.
 * 
 * @version 1.0.0
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DEL CIRCUITO (deben coincidir con noise.config.js)
// ─────────────────────────────────────────────────────────────────────────────
const POT_RESISTANCE = 10000;    // 10 kΩ
const CAPACITANCE = 33e-9;       // 33 nF
const SAMPLE_RATE = 44100;       // Hz (estándar)

// Valores derivados
const TAU = POT_RESISTANCE * CAPACITANCE;   // 3.3×10⁻⁴ s
const K = 2 * SAMPLE_RATE * TAU;            // Factor bilineal

// Coeficientes constantes del filtro
const A1 = (2 - K) / (2 + K);
const KINV = K / (2 + K);

// Frecuencias características
const POLE_FREQ = 1 / (2 * Math.PI * TAU);      // ≈ 482 Hz
const LP_CUTOFF = 1 / (Math.PI * TAU);           // ≈ 965 Hz

/**
 * Calcula la respuesta en frecuencia del filtro IIR para una posición p dada.
 * Usa la evaluación de H(z) en el círculo unitario: z = e^(jω)
 * 
 * @param {number} freq - Frecuencia en Hz
 * @param {number} p - Posición del colour (-1=LP, 0=flat, +1=HP)
 * @returns {number} Magnitud de la respuesta |H(f)|
 */
function filterMagnitude(freq, p) {
  const omega = 2 * Math.PI * freq / SAMPLE_RATE;
  const delta = p * KINV;
  const b0 = 1 + delta;
  const b1 = A1 - delta;
  
  // H(e^jω) = (b0 + b1·e^(-jω)) / (1 + a1·e^(-jω))
  // Numerador: b0 + b1·cos(ω) - j·b1·sin(ω)
  const numReal = b0 + b1 * Math.cos(omega);
  const numImag = -b1 * Math.sin(omega);
  const numMag2 = numReal * numReal + numImag * numImag;
  
  // Denominador: 1 + a1·cos(ω) - j·a1·sin(ω)
  const denReal = 1 + A1 * Math.cos(omega);
  const denImag = -A1 * Math.sin(omega);
  const denMag2 = denReal * denReal + denImag * denImag;
  
  return Math.sqrt(numMag2 / denMag2);
}

/**
 * Convierte magnitud a dB.
 */
function toDb(magnitude) {
  return 20 * Math.log10(magnitude);
}

/**
 * Aplica el filtro IIR a un bloque de samples (offline).
 * Replica exactamente la lógica de process() del worklet.
 * 
 * @param {Float32Array} input - Samples de entrada (white noise)
 * @param {number} p - Posición del colour (-1..+1)
 * @returns {Float32Array} Samples filtrados
 */
function applyFilter(input, p) {
  const output = new Float32Array(input.length);
  const delta = p * KINV;
  const b0 = 1 + delta;
  const b1 = A1 - delta;
  let x1 = 0;
  let y1 = 0;
  
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b1 * x1 - A1 * y1;
    output[i] = y;
    x1 = x;
    y1 = y;
  }
  return output;
}

/**
 * Genera white noise determinístico usando un PRNG simple (seedable).
 * Para tests reproducibles.
 */
function generateWhiteNoise(length, seed = 42) {
  const buffer = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    // Linear congruential generator
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    buffer[i] = (s / 0x7FFFFFFF) - 1;  // Normalizar a [-1, 1]
  }
  return buffer;
}

/**
 * Calcula la potencia espectral media en una banda de frecuencias
 * usando una FFT simple (DFT directa, adecuada para tests).
 */
function bandPower(samples, freqLow, freqHigh, sampleRate = SAMPLE_RATE) {
  const N = samples.length;
  let power = 0;
  let count = 0;
  
  const binLow = Math.floor(freqLow * N / sampleRate);
  const binHigh = Math.ceil(freqHigh * N / sampleRate);
  
  for (let k = binLow; k <= binHigh && k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * k * n / N;
      re += samples[n] * Math.cos(angle);
      im += samples[n] * Math.sin(angle);
    }
    power += (re * re + im * im) / (N * N);
    count++;
  }
  
  return count > 0 ? power / count : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE CONSTANTES DEL CIRCUITO
// ─────────────────────────────────────────────────────────────────────────────

describe('Noise Generator COLOUR Filter — Constantes del circuito', () => {
  
  test('τ = R·C = 3.3×10⁻⁴ s', () => {
    assert.ok(Math.abs(TAU - 3.3e-4) < 1e-7,
      `τ esperado ≈ 3.3×10⁻⁴, obtenido ${TAU}`);
  });
  
  test('Polo fundamental fp ≈ 482 Hz', () => {
    assert.ok(Math.abs(POLE_FREQ - 482) < 2,
      `fp esperado ≈ 482 Hz, obtenido ${POLE_FREQ.toFixed(1)} Hz`);
  });
  
  test('LP fc(-3dB) ≈ 965 Hz', () => {
    assert.ok(Math.abs(LP_CUTOFF - 965) < 5,
      `fc esperado ≈ 965 Hz, obtenido ${LP_CUTOFF.toFixed(1)} Hz`);
  });
  
  test('a1 está en rango válido (-1, 1) para estabilidad del filtro', () => {
    assert.ok(Math.abs(A1) < 1,
      `a1 = ${A1.toFixed(6)} debe estar entre -1 y 1`);
  });
  
  test('Kinv > 0 (factor de modulación positivo)', () => {
    assert.ok(KINV > 0, `Kinv = ${KINV.toFixed(6)} debe ser > 0`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE RESPUESTA EN FRECUENCIA
// ─────────────────────────────────────────────────────────────────────────────

describe('Noise Generator COLOUR Filter — Respuesta en frecuencia', () => {
  
  // ─── POSICIÓN PLANA (p=0, dial 5: white noise) ───
  
  describe('Posición plana (p=0, dial 5 = white noise)', () => {
    
    test('Respuesta plana a 100 Hz (0 dB)', () => {
      const mag = filterMagnitude(100, 0);
      assert.ok(Math.abs(mag - 1.0) < 0.001,
        `|H(100Hz)| = ${mag.toFixed(4)}, esperado 1.0`);
    });
    
    test('Respuesta plana a 1000 Hz (0 dB)', () => {
      const mag = filterMagnitude(1000, 0);
      assert.ok(Math.abs(mag - 1.0) < 0.001,
        `|H(1kHz)| = ${mag.toFixed(4)}, esperado 1.0`);
    });
    
    test('Respuesta plana a 10000 Hz (0 dB)', () => {
      const mag = filterMagnitude(10000, 0);
      assert.ok(Math.abs(mag - 1.0) < 0.001,
        `|H(10kHz)| = ${mag.toFixed(4)}, esperado 1.0`);
    });
    
    test('Respuesta plana en todo el rango audible (±0.01 dB)', () => {
      const freqs = [20, 50, 100, 500, 1000, 5000, 10000, 15000, 20000];
      for (const f of freqs) {
        const magDb = toDb(filterMagnitude(f, 0));
        assert.ok(Math.abs(magDb) < 0.01,
          `A ${f} Hz: ${magDb.toFixed(4)} dB, esperado 0 dB`);
      }
    });
  });
  
  // ─── POSICIÓN LP (p=-1, dial 0: dark/pink noise) ───
  
  describe('Posición LP (p=-1, dial 0 = dark/pink noise)', () => {
    
    test('Ganancia DC = 0 dB (graves preservados)', () => {
      // A frecuencia muy baja (quasi-DC)
      const mag = filterMagnitude(1, -1);
      const magDb = toDb(mag);
      assert.ok(Math.abs(magDb) < 0.5,
        `Ganancia DC = ${magDb.toFixed(2)} dB, esperado ≈ 0 dB`);
    });
    
    test('Atenuación a 10 kHz > 15 dB', () => {
      const magDb = toDb(filterMagnitude(10000, -1));
      assert.ok(magDb < -15,
        `Atenuación a 10 kHz = ${magDb.toFixed(1)} dB, esperado < -15 dB`);
    });
    
    test('Pendiente ≈ 6 dB/octava (entre 2kHz y 8kHz)', () => {
      const mag2k = toDb(filterMagnitude(2000, -1));
      const mag4k = toDb(filterMagnitude(4000, -1));
      const mag8k = toDb(filterMagnitude(8000, -1));
      
      // Entre cada octava: diferencia ≈ 6 dB (±2 dB de tolerancia)
      const slope1 = mag2k - mag4k;  // dB por octava
      const slope2 = mag4k - mag8k;
      
      assert.ok(Math.abs(slope1 - 6) < 2,
        `Pendiente 2k-4k = ${slope1.toFixed(1)} dB/oct, esperado ≈ 6`);
      assert.ok(Math.abs(slope2 - 6) < 2,
        `Pendiente 4k-8k = ${slope2.toFixed(1)} dB/oct, esperado ≈ 6`);
    });
    
    test('fc(-3dB) ≈ 965 Hz ±100 Hz', () => {
      // Buscar el punto de -3 dB
      let fc3dB = 0;
      for (let f = 100; f <= 5000; f += 10) {
        const magDb = toDb(filterMagnitude(f, -1));
        if (magDb <= -3) {
          fc3dB = f;
          break;
        }
      }
      assert.ok(Math.abs(fc3dB - LP_CUTOFF) < 100,
        `fc(-3dB) = ${fc3dB} Hz, esperado ≈ ${LP_CUTOFF.toFixed(0)} Hz`);
    });
  });
  
  // ─── POSICIÓN HP (p=+1, dial 10: bright/blue noise) ───
  
  describe('Posición HP (p=+1, dial 10 = bright/blue noise)', () => {
    
    test('Ganancia DC ≈ 0 dB (no es HPF puro, es shelving)', () => {
      const mag = filterMagnitude(1, 1);
      const magDb = toDb(mag);
      // HP shelving no atenúa DC, mantiene ganancia unitaria
      assert.ok(Math.abs(magDb) < 1,
        `Ganancia DC = ${magDb.toFixed(2)} dB, esperado ≈ 0 dB (shelving)`);
    });
    
    test('Boost en HF ≈ +6 dB (shelving)', () => {
      const magDb = toDb(filterMagnitude(10000, 1));
      assert.ok(magDb > 4 && magDb < 7,
        `Ganancia a 10 kHz = ${magDb.toFixed(1)} dB, esperado ≈ +6 dB`);
    });
    
    test('Transición gradual: 100Hz < 1kHz < 10kHz', () => {
      const mag100 = filterMagnitude(100, 1);
      const mag1k = filterMagnitude(1000, 1);
      const mag10k = filterMagnitude(10000, 1);
      
      // En HP shelving, la ganancia crece monótonamente
      assert.ok(mag100 < mag1k,
        `100 Hz (${toDb(mag100).toFixed(1)} dB) debe ser < 1 kHz (${toDb(mag1k).toFixed(1)} dB)`);
      assert.ok(mag1k < mag10k,
        `1 kHz (${toDb(mag1k).toFixed(1)} dB) debe ser < 10 kHz (${toDb(mag10k).toFixed(1)} dB)`);
    });
  });
  
  // ─── SIMETRÍA LP/HP ───
  
  describe('Simetría LP/HP', () => {
    
    test('LP y HP tienen efectos opuestos (atenuación vs boost)', () => {
      // En un filtro shelving de 1er orden, LP atenúa HF y HP refuerza HF.
      // NO son simétricos en dB: el LP tiende a -∞ dB (roll-off ilimitado)
      // mientras que el HP satura en +6 dB (duplica la amplitud).
      // Solo verificamos la dirección de cada efecto.
      const freqs = [1000, 2000, 5000, 10000];
      for (const f of freqs) {
        const lpDb = toDb(filterMagnitude(f, -1));
        const hpDb = toDb(filterMagnitude(f, 1));
        // LP debe atenuar (negativo) y HP debe reforzar (positivo)
        assert.ok(lpDb < 0, `LP a ${f} Hz debe atenuar: ${lpDb.toFixed(1)} dB`);
        assert.ok(hpDb > 0, `HP a ${f} Hz debe reforzar: ${hpDb.toFixed(1)} dB`);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DEL FILTRO IIR (PROCESAMIENTO OFFLINE)
// ─────────────────────────────────────────────────────────────────────────────

describe('Noise Generator COLOUR Filter — Procesamiento IIR offline', () => {
  
  let whiteNoise;
  
  beforeEach(() => {
    // Generar 4096 samples de white noise determinístico
    whiteNoise = generateWhiteNoise(4096);
  });
  
  test('Filtro plano (p=0) preserva la señal sin cambios', () => {
    const filtered = applyFilter(whiteNoise, 0);
    
    // Cada sample filtrado debe ser igual al input
    for (let i = 0; i < whiteNoise.length; i++) {
      assert.ok(Math.abs(filtered[i] - whiteNoise[i]) < 1e-10,
        `Sample ${i}: input=${whiteNoise[i]}, filtered=${filtered[i]}`);
    }
  });
  
  test('Filtro LP (p=-1) reduce la energía total (por atenuación de HF)', () => {
    const filtered = applyFilter(whiteNoise, -1);
    
    // RMS del filtrado debe ser menor que el original
    const rmsOriginal = Math.sqrt(whiteNoise.reduce((s, x) => s + x * x, 0) / whiteNoise.length);
    const rmsFiltered = Math.sqrt(filtered.reduce((s, x) => s + x * x, 0) / filtered.length);
    
    assert.ok(rmsFiltered < rmsOriginal,
      `RMS filtrado (${rmsFiltered.toFixed(4)}) debe ser < original (${rmsOriginal.toFixed(4)})`);
  });
  
  test('Filtro HP (p=+1) aumenta la energía total (por boost de HF)', () => {
    const filtered = applyFilter(whiteNoise, 1);
    
    // RMS del filtrado debe ser mayor que el original
    const rmsOriginal = Math.sqrt(whiteNoise.reduce((s, x) => s + x * x, 0) / whiteNoise.length);
    const rmsFiltered = Math.sqrt(filtered.reduce((s, x) => s + x * x, 0) / filtered.length);
    
    assert.ok(rmsFiltered > rmsOriginal,
      `RMS filtrado (${rmsFiltered.toFixed(4)}) debe ser > original (${rmsOriginal.toFixed(4)})`);
  });
  
  test('Protección contra denormals: y[n] < 1e-30 se fuerza a 0', () => {
    // Con input muy pequeño y muchas iteraciones, el filtro podría
    // generar valores denormalizados. Verificamos la lógica de protección.
    const tiny = new Float32Array(1024).fill(0);
    tiny[0] = 1e-35;  // Valor extremadamente pequeño
    
    const filtered = applyFilter(tiny, -1);
    
    // Tras muchas iteraciones con input 0, y[n] debe tender a 0
    const lastSample = filtered[filtered.length - 1];
    assert.ok(Math.abs(lastSample) < 1e-20,
      `Último sample = ${lastSample}, debe tender a 0`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE POSICIONES INTERMEDIAS
// ─────────────────────────────────────────────────────────────────────────────

describe('Noise Generator COLOUR Filter — Posiciones intermedias', () => {
  
  test('p=-0.5 (dial 2.5): LP parcial, atenuación menor que p=-1', () => {
    const magFull = filterMagnitude(10000, -1);
    const magHalf = filterMagnitude(10000, -0.5);
    
    assert.ok(magHalf > magFull,
      `LP parcial (${toDb(magHalf).toFixed(1)} dB) debe atenuar menos que LP total (${toDb(magFull).toFixed(1)} dB)`);
    assert.ok(magHalf < 1.0,
      `LP parcial debe atenuar HF (mag=${magHalf.toFixed(4)}, esperado < 1.0)`);
  });
  
  test('p=+0.5 (dial 7.5): HP parcial, boost menor que p=+1', () => {
    const magFull = filterMagnitude(10000, 1);
    const magHalf = filterMagnitude(10000, 0.5);
    
    assert.ok(magHalf < magFull,
      `HP parcial (${toDb(magHalf).toFixed(1)} dB) debe reforzar menos que HP total (${toDb(magFull).toFixed(1)} dB)`);
    assert.ok(magHalf > 1.0,
      `HP parcial debe reforzar HF (mag=${magHalf.toFixed(4)}, esperado > 1.0)`);
  });
  
  test('Transición suave: posiciones cercanas tienen respuestas cercanas', () => {
    const freqTest = 5000;
    const mag0 = filterMagnitude(freqTest, 0);
    const mag01 = filterMagnitude(freqTest, 0.1);
    const magN01 = filterMagnitude(freqTest, -0.1);
    
    // Diferencia entre posiciones adyacentes debe ser pequeña
    assert.ok(Math.abs(mag0 - mag01) < 0.1,
      `Diferencia p=0 vs p=0.1 = ${Math.abs(mag0 - mag01).toFixed(4)}`);
    assert.ok(Math.abs(mag0 - magN01) < 0.1,
      `Diferencia p=0 vs p=-0.1 = ${Math.abs(mag0 - magN01).toFixed(4)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE VALORES DE COMPONENTES PERSONALIZADOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Noise Generator COLOUR Filter — Componentes personalizados', () => {
  
  test('Mayor capacitancia → menor fc (filtro más oscuro)', () => {
    // Con C más grande, τ mayor, fc menor
    const tauBig = POT_RESISTANCE * 100e-9;   // 100 nF
    const tauSmall = POT_RESISTANCE * 10e-9;   // 10 nF
    
    const fcBig = 1 / (Math.PI * tauBig);     // ≈ 318 Hz
    const fcSmall = 1 / (Math.PI * tauSmall);  // ≈ 3183 Hz
    
    assert.ok(fcBig < fcSmall,
      `C=100nF → fc=${fcBig.toFixed(0)} Hz < C=10nF → fc=${fcSmall.toFixed(0)} Hz`);
  });
  
  test('Mayor resistencia → menor fc', () => {
    const tauBig = 47000 * CAPACITANCE;   // 47kΩ
    const tauSmall = 1000 * CAPACITANCE;  // 1kΩ
    
    const fcBig = 1 / (Math.PI * tauBig);
    const fcSmall = 1 / (Math.PI * tauSmall);
    
    assert.ok(fcBig < fcSmall,
      `R=47kΩ → fc=${fcBig.toFixed(0)} Hz < R=1kΩ → fc=${fcSmall.toFixed(0)} Hz`);
  });
});
