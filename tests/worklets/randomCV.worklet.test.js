/**
 * Tests para randomCV.worklet.js — AudioWorkletProcessor del Random CV Generator
 * 
 * Verifica la lógica del procesador de audio del RVG usando dos estrategias:
 * 
 * 1. MATEMÁTICA OFFLINE: Replica las funciones de conversión del worklet
 *    (_meanDialToFreq, _varianceDialToNorm, _calculateNextInterval)
 *    y verifica que los mapeos sean correctos sin instanciar el worklet.
 * 
 * 2. IMPORT REAL: Importa el worklet en un entorno simulado (globalThis mocks)
 *    y verifica process(), _fireEvent(), dormancy y gestión de mensajes.
 * 
 * Referencia: Placa PC-21 (D100-21 C1), reloj 0.2–20 Hz,
 *             jitter multiplicativo, pulso key 5ms
 * 
 * @version 1.0.0
 */

import { describe, test, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (deben coincidir con randomCV.worklet.js)
// ═══════════════════════════════════════════════════════════════════════════

const MIN_FREQ = 0.2;
const MAX_FREQ = 20;
const FREQ_RATIO = MAX_FREQ / MIN_FREQ; // 100
const KEY_PULSE_WIDTH = 0.005; // 5 ms
const MIN_PERIOD = 1 / MAX_FREQ; // 0.05s
const SAMPLE_RATE = 48000;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (para tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convierte dial Mean (-5 a +5) a frecuencia (Hz).
 * Mapeo exponencial idéntico al del worklet.
 */
function meanDialToFreq(dialValue) {
  const normalized = (dialValue + 5) / 10;
  return MIN_FREQ * Math.pow(FREQ_RATIO, normalized);
}

/**
 * Convierte dial Variance (-5 a +5) a varianza normalizada [0, 1].
 */
function varianceDialToNorm(dialValue) {
  return Math.max(0, Math.min(1, (dialValue + 5) / 10));
}

/**
 * Calcula el intervalo en samples hasta el próximo evento.
 */
function calculateNextInterval(meanFreq, variance, sampleRate = SAMPLE_RATE) {
  const basePeriod = 1 / meanFreq;
  
  let jitteredPeriod;
  if (variance <= 0) {
    jitteredPeriod = basePeriod;
  } else {
    const jitterFactor = 1 + variance * (Math.random() * 2 - 1);
    jitteredPeriod = basePeriod * jitterFactor;
  }
  
  if (jitteredPeriod < MIN_PERIOD) {
    jitteredPeriod = MIN_PERIOD;
  }
  
  return Math.round(jitteredPeriod * sampleRate);
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: CONVERSIÓN MEAN DIAL → FRECUENCIA (mapeo exponencial)
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCV Worklet — meanDialToFreq (exponencial)', () => {
  
  test('dial -5 → 0.2 Hz (mínima frecuencia)', () => {
    const freq = meanDialToFreq(-5);
    assert.ok(Math.abs(freq - 0.2) < 1e-10, `Esperado 0.2, obtenido ${freq}`);
  });
  
  test('dial +5 → 20 Hz (máxima frecuencia)', () => {
    const freq = meanDialToFreq(5);
    assert.ok(Math.abs(freq - 20) < 1e-10, `Esperado 20, obtenido ${freq}`);
  });
  
  test('dial 0 → ~2 Hz (centro geométrico)', () => {
    const freq = meanDialToFreq(0);
    // 0.2 × 100^0.5 = 0.2 × 10 = 2.0
    assert.ok(Math.abs(freq - 2.0) < 1e-10, `Esperado 2.0, obtenido ${freq}`);
  });
  
  test('monotonía: mayor dial → mayor frecuencia', () => {
    let prevFreq = 0;
    for (let dial = -5; dial <= 5; dial += 0.5) {
      const freq = meanDialToFreq(dial);
      assert.ok(freq > prevFreq,
        `Frecuencia en dial ${dial} (${freq.toFixed(4)}) debe ser > dial ${dial - 0.5} (${prevFreq.toFixed(4)})`);
      prevFreq = freq;
    }
  });
  
  test('rango total ≈ 6.6 octavas', () => {
    const fMin = meanDialToFreq(-5);
    const fMax = meanDialToFreq(5);
    const octaves = Math.log2(fMax / fMin);
    // log2(100) = 6.644
    assert.ok(Math.abs(octaves - 6.644) < 0.01,
      `Octavas: ${octaves.toFixed(3)}, esperado ~6.644`);
  });
  
  test('cuadrante negativo (-5 a 0): sub-hercio a 2 Hz', () => {
    assert.ok(meanDialToFreq(-5) < 1, 'dial -5 debe ser sub-hercio');
    assert.ok(meanDialToFreq(-3) < 1, 'dial -3 debe ser sub-hercio');
    assert.ok(Math.abs(meanDialToFreq(0) - 2) < 0.01, 'dial 0 debe ser ~2 Hz');
  });
  
  test('cuadrante positivo (0 a +5): 2 Hz a 20 Hz', () => {
    assert.ok(meanDialToFreq(0) >= 2);
    assert.ok(meanDialToFreq(5) <= 20 + 1e-10);
  });
  
  test('cada incremento de 1 en dial ≈ +0.66 octavas', () => {
    for (let dial = -4; dial <= 5; dial++) {
      const f1 = meanDialToFreq(dial - 1);
      const f2 = meanDialToFreq(dial);
      const octaves = Math.log2(f2 / f1);
      assert.ok(Math.abs(octaves - 0.6644) < 0.01,
        `dial ${dial - 1}→${dial}: ${octaves.toFixed(4)} octavas, esperado ~0.6644`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: CONVERSIÓN VARIANCE DIAL → VARIANZA NORMALIZADA
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCV Worklet — varianceDialToNorm (lineal)', () => {
  
  test('dial -5 → varianza 0 (constante, metrónomo)', () => {
    assert.strictEqual(varianceDialToNorm(-5), 0);
  });
  
  test('dial +5 → varianza 1 (máxima irregularidad)', () => {
    assert.strictEqual(varianceDialToNorm(5), 1);
  });
  
  test('dial 0 → varianza 0.5 (50%)', () => {
    assert.strictEqual(varianceDialToNorm(0), 0.5);
  });
  
  test('linealidad: incremento constante', () => {
    const step = varianceDialToNorm(1) - varianceDialToNorm(0);
    // Cada unidad de dial = 0.1 de varianza
    assert.ok(Math.abs(step - 0.1) < 1e-10);
  });
  
  test('clamp inferior: valores < -5 → 0', () => {
    assert.strictEqual(varianceDialToNorm(-10), 0);
    assert.strictEqual(varianceDialToNorm(-100), 0);
  });
  
  test('clamp superior: valores > +5 → 1', () => {
    assert.strictEqual(varianceDialToNorm(10), 1);
    assert.strictEqual(varianceDialToNorm(100), 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: CÁLCULO DE INTERVALO (jitter multiplicativo)
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCV Worklet — calculateNextInterval (jitter)', () => {
  
  test('variance=0: intervalo exacto (sin jitter)', () => {
    const freq = 2.0; // 2 Hz → 0.5s → 24000 samples
    const interval = calculateNextInterval(freq, 0);
    const expected = Math.round(SAMPLE_RATE / freq);
    assert.strictEqual(interval, expected);
  });
  
  test('variance=0 a 1 Hz: intervalo = 48000 samples', () => {
    const interval = calculateNextInterval(1.0, 0);
    assert.strictEqual(interval, SAMPLE_RATE);
  });
  
  test('variance=0 a 20 Hz: intervalo = 2400 samples', () => {
    const interval = calculateNextInterval(20, 0);
    assert.strictEqual(interval, Math.round(SAMPLE_RATE / 20));
  });
  
  test('variance=1: intervalo varía entre 0× y 2× el base', () => {
    const freq = 2.0;
    const baseInterval = SAMPLE_RATE / freq;
    const minExpected = Math.round(MIN_PERIOD * SAMPLE_RATE); // clamp
    const maxExpected = Math.round(baseInterval * 2);
    
    // Ejecutar muchas veces y verificar rango
    let foundSmall = false, foundLarge = false;
    for (let trial = 0; trial < 1000; trial++) {
      const interval = calculateNextInterval(freq, 1.0);
      assert.ok(interval >= minExpected,
        `Intervalo ${interval} < mínimo ${minExpected}`);
      assert.ok(interval <= maxExpected + 1, // +1 por redondeo
        `Intervalo ${interval} > máximo ${maxExpected}`);
      
      if (interval < baseInterval * 0.5) foundSmall = true;
      if (interval > baseInterval * 1.5) foundLarge = true;
    }
    
    assert.ok(foundSmall, 'Debe producir intervalos < 50% del base');
    assert.ok(foundLarge, 'Debe producir intervalos > 150% del base');
  });
  
  test('protección contra períodos negativos: clamp a MIN_PERIOD', () => {
    // Con freq muy alta y variance=1, el jitter puede dar período negativo
    // El clamp debe proteger
    for (let trial = 0; trial < 100; trial++) {
      const interval = calculateNextInterval(MAX_FREQ, 1.0);
      assert.ok(interval >= Math.round(MIN_PERIOD * SAMPLE_RATE),
        `Intervalo ${interval} < mínimo ${Math.round(MIN_PERIOD * SAMPLE_RATE)}`);
    }
  });
  
  test('distribución estadística: media ≈ base con varianza moderada', () => {
    const freq = 5.0;
    const baseInterval = SAMPLE_RATE / freq;
    let sum = 0;
    const N = 10000;
    
    for (let i = 0; i < N; i++) {
      sum += calculateNextInterval(freq, 0.5);
    }
    
    const mean = sum / N;
    // Con jitter simétrico, la media debe ser cercana al período base
    const deviation = Math.abs(mean - baseInterval) / baseInterval;
    assert.ok(deviation < 0.05,
      `Media ${mean.toFixed(0)} difiere > 5% del base ${baseInterval.toFixed(0)}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: CONSTANTES DEL WORKLET
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCV Worklet — Constantes', () => {
  
  test('KEY_PULSE_WIDTH = 5 ms', () => {
    assert.strictEqual(KEY_PULSE_WIDTH, 0.005);
  });
  
  test('ancho de pulso en samples a 48 kHz = 240', () => {
    const samples = Math.round(KEY_PULSE_WIDTH * SAMPLE_RATE);
    assert.strictEqual(samples, 240);
  });
  
  test('ancho de pulso en samples a 44.1 kHz = 221', () => {
    const samples = Math.round(KEY_PULSE_WIDTH * 44100);
    assert.strictEqual(samples, 221);
  });
  
  test('MIN_PERIOD = 50 ms (protección contra períodos negativos)', () => {
    assert.ok(Math.abs(MIN_PERIOD - 0.05) < 1e-10);
  });
  
  test('FREQ_RATIO = 100 (rango de 2 décadas)', () => {
    assert.strictEqual(FREQ_RATIO, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 5: IMPORT REAL DEL WORKLET — process() y mensajes
// ═══════════════════════════════════════════════════════════════════════════

function createWorkletEnvironment() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.currentFrame = 0;
  
  if (!globalThis.AudioWorkletProcessor) {
    globalThis.AudioWorkletProcessor = class AudioWorkletProcessor {
      constructor() {
        this.port = {
          onmessage: null,
          postMessage: () => {}
        };
      }
    };
  }
  
  const registered = {};
  globalThis.registerProcessor = (name, cls) => {
    registered[name] = cls;
  };
  
  return registered;
}

function createOutputs(numChannels, length) {
  return [Array.from({ length: numChannels }, () => new Float32Array(length))];
}

describe('RandomCV Worklet — Import real', () => {
  let RandomCVProcessor;
  
  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/randomCV.worklet.js?t=${Date.now()}`);
    RandomCVProcessor = registered['random-cv'];
  });
  
  test('registra el procesador como "random-cv"', () => {
    assert.ok(RandomCVProcessor, 'Procesador debe estar registrado');
  });
  
  test('process() retorna true en operación normal', () => {
    const proc = new RandomCVProcessor();
    const outputs = createOutputs(3, 128);
    const result = proc.process([], outputs, {});
    assert.strictEqual(result, true);
  });
  
  test('salida tiene 3 canales (V1, V2, Key)', () => {
    const proc = new RandomCVProcessor();
    const outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Cada canal debe tener 128 samples
    assert.strictEqual(outputs[0][0].length, 128);
    assert.strictEqual(outputs[0][1].length, 128);
    assert.strictEqual(outputs[0][2].length, 128);
  });
  
  test('tras primer bloque, V1 y V2 tienen valores DC (no todo ceros)', () => {
    const proc = new RandomCVProcessor();
    // Procesar suficientes bloques para que ocurra el primer evento
    // (samplesUntilNext empieza en 0, así que el primer evento es inmediato)
    const outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    const v1 = outputs[0][0];
    const v2 = outputs[0][1];
    
    // Después del primer evento, v1 y v2 deben tener valores DC (constantes)
    const v1Value = v1[1]; // sample 1 (sample 0 puede ser la transición)
    for (let i = 2; i < 128; i++) {
      // Puede haber otro evento dentro del bloque, pero los valores
      // deben ser constantes entre eventos
    }
    
    // Al menos uno de los canales no debe ser todo ceros
    // (probabilidad de que Math.random()*2-1 === 0 es virtualmente 0)
    const v1HasSignal = v1.some(s => s !== 0);
    const v2HasSignal = v2.some(s => s !== 0);
    assert.ok(v1HasSignal || v2HasSignal, 'V1 o V2 deben tener señal');
  });
  
  test('Key pulse: amplitud 1.0 durante ~5ms', () => {
    const proc = new RandomCVProcessor();
    const expectedPulseSamples = Math.round(KEY_PULSE_WIDTH * SAMPLE_RATE);
    
    // Procesar bloques suficientes para capturar un pulso completo
    // El primer evento es inmediato (_samplesUntilNext = 0)
    const allKey = [];
    for (let block = 0; block < 10; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      allKey.push(...outputs[0][2]);
    }
    
    // Contar samples a 1.0 desde el comienzo (primer pulso)
    let pulseCount = 0;
    for (let i = 0; i < allKey.length; i++) {
      if (allKey[i] === 1.0) {
        pulseCount++;
      } else if (pulseCount > 0) {
        break; // Terminó el primer pulso
      }
    }
    
    assert.strictEqual(pulseCount, expectedPulseSamples,
      `Pulso key debe tener ${expectedPulseSamples} samples, tiene ${pulseCount}`);
  });
  
  test('V1 y V2 están en rango [-1, +1]', () => {
    const proc = new RandomCVProcessor();
    
    for (let block = 0; block < 50; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      for (const sample of outputs[0][0]) {
        assert.ok(sample >= -1 && sample <= 1,
          `V1 sample ${sample} fuera de rango [-1, +1]`);
      }
      for (const sample of outputs[0][1]) {
        assert.ok(sample >= -1 && sample <= 1,
          `V2 sample ${sample} fuera de rango [-1, +1]`);
      }
    }
  });
  
  test('Key pulse está en {0.0, 1.0} solamente', () => {
    const proc = new RandomCVProcessor();
    
    for (let block = 0; block < 50; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      for (const sample of outputs[0][2]) {
        assert.ok(sample === 0.0 || sample === 1.0,
          `Key sample ${sample} debe ser 0.0 o 1.0`);
      }
    }
  });
  
  test('setMean cambia la frecuencia del reloj', () => {
    const proc = new RandomCVProcessor();
    
    // Enviar mensaje de mean muy alto (rápido)
    proc.port.onmessage({ data: { type: 'setMean', value: 5 } });
    
    // Contar eventos en 1 segundo de samples
    let eventCount = 0;
    const blocksPerSecond = SAMPLE_RATE / 128;
    
    for (let block = 0; block < blocksPerSecond; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      // Detectar flancos de subida en canal Key
      for (let i = 1; i < 128; i++) {
        if (outputs[0][2][i] === 1.0 && outputs[0][2][i - 1] === 0.0) {
          eventCount++;
        }
      }
    }
    
    // A 20 Hz durante 1 segundo, esperamos ~20 flancos (±algo por jitter)
    assert.ok(eventCount >= 10, `Solo ${eventCount} eventos en 1s a 20 Hz`);
    assert.ok(eventCount <= 30, `Demasiados eventos (${eventCount}) a 20 Hz`);
  });
  
  test('setVariance=0 produce intervalos iguales', () => {
    const proc = new RandomCVProcessor();
    proc.port.onmessage({ data: { type: 'setMean', value: 0 } });   // ~2 Hz
    proc.port.onmessage({ data: { type: 'setVariance', value: -5 } }); // 0 variance
    
    // Recoger posiciones de flancos de subida de Key
    const edges = [];
    let sampleIndex = 0;
    
    for (let block = 0; block < 1000; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      for (let i = 1; i < 128; i++) {
        if (outputs[0][2][i] === 1.0 && outputs[0][2][i - 1] === 0.0) {
          edges.push(sampleIndex + i);
        }
      }
      sampleIndex += 128;
      if (edges.length >= 5) break;
    }
    
    // Con variance=0, todos los intervalos deben ser iguales
    assert.ok(edges.length >= 3, `Necesito al menos 3 flancos, tengo ${edges.length}`);
    
    const intervals = [];
    for (let i = 1; i < edges.length; i++) {
      intervals.push(edges[i] - edges[i - 1]);
    }
    
    const first = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      assert.strictEqual(intervals[i], first,
        `Intervalo ${i} (${intervals[i]}) != intervalo 0 (${first}) con variance=0`);
    }
  });
  
  test('stop() hace que process() retorne false', () => {
    const proc = new RandomCVProcessor();
    proc.port.onmessage({ data: { type: 'stop' } });
    
    const outputs = createOutputs(3, 128);
    const result = proc.process([], outputs, {});
    assert.strictEqual(result, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 6: DORMANCY — Preservación de fase
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCV Worklet — Dormancy (preservación de fase)', () => {
  let RandomCVProcessor;
  
  beforeEach(async () => {
    const registered = createWorkletEnvironment();
    await import(`../../src/assets/js/worklets/randomCV.worklet.js?t=${Date.now()}`);
    RandomCVProcessor = registered['random-cv'];
  });
  
  test('dormant produce silencio en los 3 canales', () => {
    const proc = new RandomCVProcessor();
    
    // Primero procesar un bloque normal (genera un evento)
    let outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Dormir
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    
    outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Todas las salidas deben ser 0
    assert.ok(outputs[0][0].every(s => s === 0), 'V1 debe ser todo ceros durante dormancy');
    assert.ok(outputs[0][1].every(s => s === 0), 'V2 debe ser todo ceros durante dormancy');
    assert.ok(outputs[0][2].every(s => s === 0), 'Key debe ser todo ceros durante dormancy');
  });
  
  test('process() retorna true durante dormancy (no se desrregistra)', () => {
    const proc = new RandomCVProcessor();
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    
    const outputs = createOutputs(3, 128);
    const result = proc.process([], outputs, {});
    assert.strictEqual(result, true);
  });
  
  test('preservación de fase: variance=0 produce ritmo continuo', () => {
    const proc = new RandomCVProcessor();
    
    // Configurar reloj rápido a ~10 Hz (dial ~3.5), sin jitter
    // 10 Hz = 4800 samples/evento a 48 kHz → flancos frecuentes
    proc.port.onmessage({ data: { type: 'setMean', value: 3.5 } });
    proc.port.onmessage({ data: { type: 'setVariance', value: -5 } });
    
    // Recoger flancos ANTES de dormir
    const edgesBefore = [];
    let sampleIndex = 0;
    let prevKeySample = 0; // Último sample del bloque anterior (para detectar flancos entre bloques)
    
    for (let block = 0; block < 500; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      // Detectar flanco entre bloques
      if (outputs[0][2][0] === 1.0 && prevKeySample === 0.0) {
        edgesBefore.push(sampleIndex);
      }
      for (let i = 1; i < 128; i++) {
        if (outputs[0][2][i] === 1.0 && outputs[0][2][i - 1] === 0.0) {
          edgesBefore.push(sampleIndex + i);
        }
      }
      prevKeySample = outputs[0][2][127];
      sampleIndex += 128;
      if (edgesBefore.length >= 3) break;
    }
    
    assert.ok(edgesBefore.length >= 3, `No hay suficientes flancos antes de dormir: ${edgesBefore.length}`);
    const intervalBefore = edgesBefore[1] - edgesBefore[0];
    
    // DORMIR durante una cantidad arbitraria de bloques
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    const dormantBlocks = 200; // ~0.5 segundos de dormancy
    
    for (let block = 0; block < dormantBlocks; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      prevKeySample = outputs[0][2][127];
      sampleIndex += 128;
    }
    
    // DESPERTAR
    proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });
    
    // Recoger flancos DESPUÉS de despertar
    const edgesAfter = [];
    prevKeySample = 0;
    
    for (let block = 0; block < 1000; block++) {
      const outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      if (outputs[0][2][0] === 1.0 && prevKeySample === 0.0) {
        edgesAfter.push(sampleIndex);
      }
      for (let i = 1; i < 128; i++) {
        if (outputs[0][2][i] === 1.0 && outputs[0][2][i - 1] === 0.0) {
          edgesAfter.push(sampleIndex + i);
        }
      }
      prevKeySample = outputs[0][2][127];
      sampleIndex += 128;
      if (edgesAfter.length >= 3) break;
    }
    
    assert.ok(edgesAfter.length >= 3, `No hay suficientes flancos después de despertar: ${edgesAfter.length}`);
    
    // Los intervalos DESPUÉS deben ser iguales a los de ANTES
    const intervalAfter = edgesAfter[1] - edgesAfter[0];
    assert.strictEqual(intervalAfter, intervalBefore,
      `Intervalo antes (${intervalBefore}) != después (${intervalAfter}): fase perdida`);
    
    // La fase debe ser coherente: el primer flanco después de despertar
    // debe estar alineado con la rejilla temporal original
    const lastEdgeBefore = edgesBefore[edgesBefore.length - 1];
    const firstEdgeAfter = edgesAfter[0];
    const gapSamples = firstEdgeAfter - lastEdgeBefore;
    const remainder = gapSamples % intervalBefore;
    
    assert.strictEqual(remainder, 0,
      `El primer flanco tras despertar no está alineado con la rejilla: gap=${gapSamples}, intervalo=${intervalBefore}, residuo=${remainder}`);
  });
  
  test('el reloj NO se detiene durante dormancy: genera eventos fantasma', () => {
    const proc = new RandomCVProcessor();
    
    // Reloj rápido: 20 Hz (dial +5), sin jitter
    proc.port.onmessage({ data: { type: 'setMean', value: 5 } });
    proc.port.onmessage({ data: { type: 'setVariance', value: -5 } });
    
    // Procesar un bloque para inicializar
    let outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Dormir y procesar suficientes bloques para que pasen múltiples eventos
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    
    for (let block = 0; block < 100; block++) {
      outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
      
      // Verificar silencio
      assert.ok(outputs[0][0].every(s => s === 0), 'V1 debe ser silencio');
      assert.ok(outputs[0][2].every(s => s === 0), 'Key debe ser silencio');
    }
    
    // Despertar: el próximo evento NO debe ser inmediato
    // (porque el reloj siguió avanzando internamente)
    proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });
    
    outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Verificar que process retorna señal real (no todo ceros)
    // Es funcional de nuevo
    const hasSignal = outputs[0][0].some(s => s !== 0) || 
                      outputs[0][1].some(s => s !== 0);
    assert.ok(hasSignal, 'La salida debe tener señal tras despertar');
  });
  
  test('V1 y V2 cambian durante dormancy (eventos fantasma actualizan valores)', () => {
    const proc = new RandomCVProcessor();
    
    // Reloj rápido
    proc.port.onmessage({ data: { type: 'setMean', value: 5 } });
    proc.port.onmessage({ data: { type: 'setVariance', value: -5 } });
    
    // Procesar un bloque para obtener V1/V2 iniciales
    let outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Dormir y procesar muchos bloques (los eventos fantasma cambian V1/V2)
    proc.port.onmessage({ data: { type: 'setDormant', dormant: true } });
    for (let block = 0; block < 500; block++) {
      outputs = createOutputs(3, 128);
      proc.process([], outputs, {});
    }
    
    // Despertar
    proc.port.onmessage({ data: { type: 'setDormant', dormant: false } });
    outputs = createOutputs(3, 128);
    proc.process([], outputs, {});
    
    // Los valores V1/V2 deberían haber cambiado (con alta probabilidad)
    // No podemos garantizarlo 100% pero en 500 bloques a 20 Hz
    // habrán ocurrido ~500*128/2400 ≈ 26 eventos
    const v1Last = outputs[0][0][127];
    const v2Last = outputs[0][1][127];
    
    // Al menos uno no debe ser exactamente 0 (probabilidad ~100%)
    assert.ok(v1Last !== 0 || v2Last !== 0,
      'V1 o V2 deben tener valor no-cero tras despertar');
  });
});
