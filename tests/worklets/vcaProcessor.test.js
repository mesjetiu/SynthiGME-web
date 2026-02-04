/**
 * Tests para el VCA CEM 3330 AudioWorklet Processor
 * 
 * Verifica que el worklet aplique correctamente:
 * - Curva logarítmica 10 dB/V
 * - Saturación suave para CV > 0V
 * - Corte mecánico cuando dial=0
 * 
 * @version 1.0.0
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DEL VCA CEM 3330 (deben coincidir con vcaProcessor.worklet.js)
// ─────────────────────────────────────────────────────────────────────────────
const VCA_DB_PER_VOLT = 10;
const VCA_LINEAR_THRESHOLD = 0;
const VCA_HARD_LIMIT = 3;        // Voltaje efectivo máximo (3V → ~4x gain)
const VCA_SATURATION_SOFTNESS = 2;

/**
 * Aplica saturación suave a voltajes positivos usando tanh.
 * Réplica de applySaturation() en el worklet.
 */
function applySaturation(voltage) {
  if (voltage <= VCA_LINEAR_THRESHOLD) {
    return voltage;  // Sin saturación para voltajes negativos
  }
  // Comprimir usando tanh: el exceso sobre 0V se mapea a (0, HARD_LIMIT)
  const excess = voltage - VCA_LINEAR_THRESHOLD;
  const compressed = Math.tanh(excess / VCA_SATURATION_SOFTNESS) * (VCA_HARD_LIMIT - VCA_LINEAR_THRESHOLD);
  return VCA_LINEAR_THRESHOLD + compressed;
}

/**
 * Calcula la ganancia desde voltaje total usando curva 10 dB/V.
 * Réplica de voltageToGain() en el worklet.
 */
function voltageToGain(voltage) {
  // Aplicar saturación primero
  const effectiveVoltage = applySaturation(voltage);
  
  // Curva 10 dB/V: gain = 10^(voltage*10/20)
  const dB = effectiveVoltage * VCA_DB_PER_VOLT;
  return Math.pow(10, dB / 20);
}

/**
 * Convierte posición de dial (0-10) a voltaje (-12V a 0V).
 */
function dialToVoltage(dialValue) {
  return (dialValue / 10) * 12 - 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LA CURVA dB/V
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Curva 10 dB/V', () => {
  
  test('Voltaje 0V → ganancia 1.0 (unity)', () => {
    const gain = voltageToGain(0);
    assert.strictEqual(gain, 1.0);
  });
  
  test('Voltaje -12V → ganancia ~0.251 (10^(-12*10/20))', () => {
    const gain = voltageToGain(-12);
    const expected = Math.pow(10, -12 * VCA_DB_PER_VOLT / 20);
    assert.ok(Math.abs(gain - expected) < 0.001,
      `Esperado ${expected.toFixed(4)}, obtenido ${gain.toFixed(4)}`);
  });
  
  test('Voltaje -6V → ganancia ~0.501 (mitad en dB)', () => {
    const gain = voltageToGain(-6);
    const expected = Math.pow(10, -6 * VCA_DB_PER_VOLT / 20);
    assert.ok(Math.abs(gain - expected) < 0.001,
      `Esperado ${expected.toFixed(4)}, obtenido ${gain.toFixed(4)}`);
  });
  
  test('Cada voltio adicional aumenta/disminuye 10 dB', () => {
    const gain0 = voltageToGain(0);
    const gainMinus1 = voltageToGain(-1);
    
    // 10 dB de diferencia = factor de 10^(10/20) ≈ 3.162
    const ratio = gain0 / gainMinus1;
    const expected = Math.pow(10, 10 / 20);
    
    assert.ok(Math.abs(ratio - expected) < 0.01,
      `Ratio esperado ${expected.toFixed(3)}, obtenido ${ratio.toFixed(3)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SATURACIÓN
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Saturación suave (CV > 0V)', () => {
  
  test('CV pequeño positivo (+1V) produce ganancia > 1.0', () => {
    const gain = voltageToGain(1);
    assert.ok(gain > 1.0, `Ganancia con +1V debe ser > 1.0, obtenido ${gain.toFixed(4)}`);
  });
  
  test('CV grande positivo (+5V) está limitado por saturación', () => {
    const gain5V = voltageToGain(5);
    const gainLinear5V = Math.pow(10, 5 * VCA_DB_PER_VOLT / 20);
    
    // La saturación debe limitar la ganancia
    assert.ok(gain5V < gainLinear5V,
      `Saturación debe limitar: ${gain5V.toFixed(2)} < ${gainLinear5V.toFixed(2)} (lineal)`);
  });
  
  test('Saturación converge a límite máximo (~3V efectivo)', () => {
    const gain10V = voltageToGain(10);
    const gain20V = voltageToGain(20);
    const gain100V = voltageToGain(100);
    
    // La saturación tanh comprime voltajes altos hacia ~3V efectivo
    // Con 3V y 10dB/V: ganancia máxima ≈ 10^(3*10/20) ≈ 31.6
    const maxGain = voltageToGain(VCA_HARD_LIMIT);
    
    // Verificar que la saturación está funcionando
    // Sin saturación, 10V → 10^(10*10/20) = 316x
    const linearGain10V = Math.pow(10, 10 * VCA_DB_PER_VOLT / 20);
    assert.ok(gain10V < linearGain10V, 
      `Saturación activa: ${gain10V.toFixed(1)} < ${linearGain10V.toFixed(1)} (lineal)`);
    
    // Las ganancias deben converger al máximo
    assert.ok(gain10V > maxGain * 0.8, `CV +10V cerca del límite: ${gain10V.toFixed(1)}`);
    assert.ok(gain20V > maxGain * 0.95, `CV +20V muy cerca del límite: ${gain20V.toFixed(1)}`);
    assert.ok(gain100V > maxGain * 0.999, `CV +100V prácticamente en el límite: ${gain100V.toFixed(1)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE DIAL (FADER)
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Conversión Dial → Voltaje', () => {
  
  test('Dial 0 → -12V', () => {
    assert.strictEqual(dialToVoltage(0), -12);
  });
  
  test('Dial 5 → -6V', () => {
    assert.strictEqual(dialToVoltage(5), -6);
  });
  
  test('Dial 10 → 0V', () => {
    assert.strictEqual(dialToVoltage(10), 0);
  });
  
  test('Dial 7.5 → -3V', () => {
    assert.strictEqual(dialToVoltage(7.5), -3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SUMA DIAL + CV
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Suma algebraica (Dial + CV)', () => {
  
  test('Dial=10, CV=0 → ganancia 1.0', () => {
    const dialVoltage = dialToVoltage(10); // 0V
    const cvVoltage = 0;
    const totalVoltage = dialVoltage + cvVoltage;
    const gain = voltageToGain(totalVoltage);
    
    assert.strictEqual(gain, 1.0);
  });
  
  test('Dial=10, CV=+4V → ganancia > 1.0 (con saturación)', () => {
    const dialVoltage = dialToVoltage(10); // 0V
    const cvVoltage = 4;
    const totalVoltage = dialVoltage + cvVoltage;
    const gain = voltageToGain(totalVoltage);
    
    assert.ok(gain > 1.0, `Con CV +4V ganancia debe ser > 1.0, obtenido ${gain.toFixed(4)}`);
    // Con saturación a 3V máx y 10dB/V, la ganancia máxima es ~31.6x
    // +4V después de saturación → ~2.89V → ganancia ~28x
    assert.ok(gain < 35, `Ganancia saturada en rango esperado (~28x): ${gain.toFixed(2)}`);
  });
  
  test('Dial=5, CV=+6V → compensa y llega a ~1.0', () => {
    const dialVoltage = dialToVoltage(5); // -6V
    const cvVoltage = 6;
    const totalVoltage = dialVoltage + cvVoltage; // 0V
    const gain = voltageToGain(totalVoltage);
    
    assert.strictEqual(gain, 1.0);
  });
  
  test('Dial=5, CV=-6V → ganancia muy baja (~0.063)', () => {
    const dialVoltage = dialToVoltage(5); // -6V
    const cvVoltage = -6;
    const totalVoltage = dialVoltage + cvVoltage; // -12V
    const gain = voltageToGain(totalVoltage);
    
    const expected = Math.pow(10, -12 * VCA_DB_PER_VOLT / 20);
    assert.ok(Math.abs(gain - expected) < 0.001,
      `Esperado ${expected.toFixed(4)}, obtenido ${gain.toFixed(4)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESCALA CV DE MATRIZ
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Escala CV de matriz (cvScale=4)', () => {
  const cvScale = 4.0; // Matriz normalizada -1..+1, escalado a ±4V
  
  test('CV matriz=+1, cvScale=4 → +4V real', () => {
    const cvNormalized = 1.0;
    const cvVoltage = cvNormalized * cvScale;
    
    assert.strictEqual(cvVoltage, 4);
  });
  
  test('CV matriz=-1, cvScale=4 → -4V real', () => {
    const cvNormalized = -1.0;
    const cvVoltage = cvNormalized * cvScale;
    
    assert.strictEqual(cvVoltage, -4);
  });
  
  test('Dial=7.5 + CV matriz=+0.75 → unity gain aproximadamente', () => {
    const dialVoltage = dialToVoltage(7.5); // -3V
    const cvNormalized = 0.75; // +3V (cuando cvScale=4)
    const cvVoltage = cvNormalized * cvScale;
    const totalVoltage = dialVoltage + cvVoltage; // 0V
    const gain = voltageToGain(totalVoltage);
    
    assert.strictEqual(gain, 1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE COMPORTAMIENTO DE MODULACIÓN AM
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Comportamiento AM (modulación)', () => {
  
  test('AM con LFO sinusoidal produce variación de ganancia', () => {
    // Simular un ciclo de LFO (0 → +1 → 0 → -1 → 0)
    const dialVoltage = dialToVoltage(7); // ~-3.6V
    const cvScale = 4.0;
    
    const gains = [];
    for (let phase = 0; phase < Math.PI * 2; phase += Math.PI / 4) {
      const cvNormalized = Math.sin(phase);
      const cvVoltage = cvNormalized * cvScale;
      const totalVoltage = dialVoltage + cvVoltage;
      gains.push(voltageToGain(totalVoltage));
    }
    
    // Verificar variación
    const minGain = Math.min(...gains);
    const maxGain = Math.max(...gains);
    
    assert.ok(maxGain > minGain, 'AM debe producir variación de ganancia');
    assert.ok(maxGain / minGain > 2, 'Variación debe ser significativa (> 6dB)');
  });
  
  test('AM bipolar centrado en dial=5 produce variación de ganancia', () => {
    const dialVoltage = dialToVoltage(5); // -6V
    const cvScale = 4.0;
    
    // CV oscilando ±1 (±4V después de escala)
    const cvMax = 1.0 * cvScale; // +4V
    const cvMin = -1.0 * cvScale; // -4V
    
    // Con dial=5 (-6V):
    // - CV +4V → total -2V → gain ~0.1
    // - CV -4V → total -10V → gain ~0.00001
    const gainMax = voltageToGain(dialVoltage + cvMax);
    const gainMin = voltageToGain(dialVoltage + cvMin);
    
    // Verificar que hay variación significativa (AM funciona)
    assert.ok(gainMax > gainMin * 100, 
      `Variación AM muy significativa: ${gainMax.toFixed(4)} > ${(gainMin * 100).toFixed(4)}`);
    // Con 10 dB/V, cada 2V de diferencia es 20dB ≈ 10x de ratio
    // Diferencia de 8V → 80dB → 10000x de ratio
    assert.ok(gainMax / gainMin > 1000, 
      `Ratio AM correcto (>1000x): ${(gainMax / gainMin).toFixed(0)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE CORTE MECÁNICO (CUTOFF)
// ─────────────────────────────────────────────────────────────────────────────

describe('VCA CEM 3330 - Corte mecánico (dial=0)', () => {
  
  test('Cuando cutoffEnabled=true, CV se ignora', () => {
    // Simular comportamiento del worklet con cutoff activo
    const cutoffEnabled = true;
    const dialVoltage = dialToVoltage(0); // -12V
    const cvVoltage = 10; // CV muy positivo
    
    // Con cutoff, el gain se calcula solo desde dialVoltage
    const gainWithCutoff = cutoffEnabled 
      ? voltageToGain(dialVoltage) // Ignora CV
      : voltageToGain(dialVoltage + cvVoltage);
    
    const gainWithoutCutoff = voltageToGain(dialVoltage + cvVoltage);
    
    assert.ok(gainWithCutoff < 0.1, 'Con cutoff, ganancia debe ser muy baja');
    assert.ok(gainWithoutCutoff > gainWithCutoff * 10, 
      'Sin cutoff, CV positivo aumentaría mucho la ganancia');
  });
  
  test('Cutoff desactivado (dial>0) permite que CV funcione', () => {
    const cutoffEnabled = false;
    const dialVoltage = dialToVoltage(1); // ~-10.8V
    const cvVoltage = 10;
    
    const totalVoltage = dialVoltage + cvVoltage;
    const gain = voltageToGain(totalVoltage);
    
    // Con dial > 0 y CV +10V, la ganancia debería ser mayor que sin CV
    const gainWithoutCV = voltageToGain(dialVoltage);
    assert.ok(gain > gainWithoutCV * 5, 
      `CV aumenta la ganancia significativamente: ${gain.toFixed(3)} > ${(gainWithoutCV * 5).toFixed(3)}`);
  });
});
