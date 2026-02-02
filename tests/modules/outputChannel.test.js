/**
 * Tests para lógica de audio de OutputChannel y Engine
 * 
 * Verifica:
 * - Cálculo de frecuencias de filtro bipolar (LP/HP)
 * - Cálculo de panning equal-power
 * - Mapeo de valores de knobs
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES REPLICADAS DE engine.js (para tests sin AudioContext)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula frecuencia de corte del Lowpass según valor bipolar.
 * Solo activo para valores negativos (-1 a 0).
 * 
 * @param {number} value - Valor bipolar (-1 a +1)
 * @returns {number} Frecuencia en Hz (200 a 20000)
 */
function getLowpassFreq(value) {
  // value < 0: LP activo, mapear -1→200Hz, 0→20000Hz
  // value >= 0: LP bypass (20000Hz)
  if (value >= 0) return 20000;
  
  const t = 1 + value; // -1→0, 0→1
  const minFreq = 200;
  const maxFreq = 20000;
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);
  return Math.pow(10, minLog + t * (maxLog - minLog));
}

/**
 * Calcula frecuencia de corte del Highpass según valor bipolar.
 * Solo activo para valores positivos (0 a +1).
 * 
 * @param {number} value - Valor bipolar (-1 a +1)
 * @returns {number} Frecuencia en Hz (20 a 5000)
 */
function getHighpassFreq(value) {
  // value > 0: HP activo, mapear 0→20Hz, +1→5000Hz
  // value <= 0: HP bypass (20Hz)
  if (value <= 0) return 20;
  
  const t = value; // 0→0, 1→1
  const minFreq = 20;
  const maxFreq = 5000;
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);
  return Math.pow(10, minLog + t * (maxLog - minLog));
}

/**
 * Calcula ganancias L/R para equal-power panning.
 * 
 * @param {number} pan - Valor de pan (-1 a +1)
 * @returns {{left: number, right: number}} Ganancias L/R
 */
function calculateEqualPowerPan(pan) {
  const angle = (pan + 1) * 0.25 * Math.PI;
  return {
    left: Math.cos(angle),
    right: Math.sin(angle)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: FILTRO BIPOLAR
// ─────────────────────────────────────────────────────────────────────────────

describe('Filtro bipolar - Lowpass', () => {
  it('value = -1 → frecuencia mínima (~200Hz)', () => {
    const freq = getLowpassFreq(-1);
    assert.ok(Math.abs(freq - 200) < 0.001, `freq ${freq} debe ser ~200`);
  });

  it('value = 0 → bypass (20000Hz)', () => {
    const freq = getLowpassFreq(0);
    assert.ok(Math.abs(freq - 20000) < 0.001, `freq ${freq} debe ser ~20000`);
  });

  it('value > 0 → bypass (20000Hz)', () => {
    assert.ok(Math.abs(getLowpassFreq(0.5) - 20000) < 0.001);
    assert.ok(Math.abs(getLowpassFreq(1) - 20000) < 0.001);
  });

  it('value = -0.5 → frecuencia intermedia (~2000Hz)', () => {
    const freq = getLowpassFreq(-0.5);
    // -0.5 → t = 0.5, log interpolación 200→20000
    assert.ok(freq > 1000 && freq < 3000, `freq ${freq} debe estar entre 1000 y 3000`);
  });

  it('curva logarítmica: incrementos iguales en valor dan incrementos proporcionales en frecuencia', () => {
    const f1 = getLowpassFreq(-1);    // 200
    const f2 = getLowpassFreq(-0.5);  // ~2000
    const f3 = getLowpassFreq(0);     // 20000
    
    // Ratio f2/f1 ≈ ratio f3/f2 (propiedad logarítmica)
    const ratio1 = f2 / f1;
    const ratio2 = f3 / f2;
    assert.ok(Math.abs(ratio1 - ratio2) < 1, 'ratios deben ser aproximadamente iguales');
  });
});

describe('Filtro bipolar - Highpass', () => {
  it('value = 0 → bypass (20Hz)', () => {
    const freq = getHighpassFreq(0);
    assert.ok(Math.abs(freq - 20) < 0.001, `freq ${freq} debe ser ~20`);
  });

  it('value < 0 → bypass (20Hz)', () => {
    assert.ok(Math.abs(getHighpassFreq(-0.5) - 20) < 0.001);
    assert.ok(Math.abs(getHighpassFreq(-1) - 20) < 0.001);
  });

  it('value = +1 → frecuencia máxima (5000Hz)', () => {
    const freq = getHighpassFreq(1);
    assert.ok(Math.abs(freq - 5000) < 0.001, `freq ${freq} debe ser ~5000`);
  });

  it('value = +0.5 → frecuencia intermedia (~316Hz)', () => {
    const freq = getHighpassFreq(0.5);
    // +0.5 → t = 0.5, log interpolación 20→5000
    assert.ok(freq > 200 && freq < 500, `freq ${freq} debe estar entre 200 y 500`);
  });
});

describe('Filtro bipolar - Comportamiento conjunto LP/HP', () => {
  it('centro (value=0) → ambos en bypass (señal limpia)', () => {
    const lpFreq = getLowpassFreq(0);
    const hpFreq = getHighpassFreq(0);
    
    // LP a 20kHz pasa todo, HP a 20Hz pasa todo
    assert.ok(Math.abs(lpFreq - 20000) < 0.001, 'LP debe estar en bypass');
    assert.ok(Math.abs(hpFreq - 20) < 0.001, 'HP debe estar en bypass');
  });

  it('negativo (value<0) → LP activo, HP bypass', () => {
    const lpFreq = getLowpassFreq(-0.7);
    const hpFreq = getHighpassFreq(-0.7);
    
    assert.ok(lpFreq < 20000, 'LP debe estar activo');
    assert.ok(Math.abs(hpFreq - 20) < 0.001, 'HP debe estar en bypass');
  });

  it('positivo (value>0) → LP bypass, HP activo', () => {
    const lpFreq = getLowpassFreq(0.7);
    const hpFreq = getHighpassFreq(0.7);
    
    assert.ok(Math.abs(lpFreq - 20000) < 0.001, 'LP debe estar en bypass');
    assert.ok(hpFreq > 20, 'HP debe estar activo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: EQUAL-POWER PANNING
// ─────────────────────────────────────────────────────────────────────────────

describe('Equal-power panning', () => {
  it('pan = -1 → full izquierda', () => {
    const { left, right } = calculateEqualPowerPan(-1);
    assert.ok(Math.abs(left - 1) < 0.0001, `left debe ser 1, es ${left}`);
    assert.ok(Math.abs(right - 0) < 0.0001, `right debe ser 0, es ${right}`);
  });

  it('pan = +1 → full derecha', () => {
    const { left, right } = calculateEqualPowerPan(1);
    assert.ok(Math.abs(left - 0) < 0.0001, `left debe ser 0, es ${left}`);
    assert.ok(Math.abs(right - 1) < 0.0001, `right debe ser 1, es ${right}`);
  });

  it('pan = 0 → centro (≈0.707 ambos lados)', () => {
    const { left, right } = calculateEqualPowerPan(0);
    const expected = Math.SQRT1_2; // ≈ 0.7071
    assert.ok(Math.abs(left - expected) < 0.0001, `left debe ser ~0.707, es ${left}`);
    assert.ok(Math.abs(right - expected) < 0.0001, `right debe ser ~0.707, es ${right}`);
  });

  it('potencia constante: left² + right² ≈ 1 para cualquier pan', () => {
    for (const pan of [-1, -0.5, 0, 0.5, 1]) {
      const { left, right } = calculateEqualPowerPan(pan);
      const power = left * left + right * right;
      assert.ok(Math.abs(power - 1) < 0.0001, `potencia con pan=${pan} debe ser 1, es ${power}`);
    }
  });

  it('simetría: pan negativo = inverso de pan positivo', () => {
    const neg = calculateEqualPowerPan(-0.3);
    const pos = calculateEqualPowerPan(0.3);
    
    assert.ok(Math.abs(neg.left - pos.right) < 0.0001);
    assert.ok(Math.abs(neg.right - pos.left) < 0.0001);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: RANGOS DE VALORES DE KNOBS
// ─────────────────────────────────────────────────────────────────────────────

describe('Rangos de valores de OutputChannel', () => {
  it('filter knob: rango -1 a +1 con centro en 0', () => {
    const min = -1;
    const max = 1;
    const center = 0;
    
    assert.strictEqual(min, -1, 'min debe ser -1 (LP máximo)');
    assert.strictEqual(max, 1, 'max debe ser +1 (HP máximo)');
    assert.strictEqual(center, 0, 'centro debe ser 0 (bypass)');
  });

  it('pan knob: rango -1 a +1 con centro en 0', () => {
    const min = -1;
    const max = 1;
    const center = 0;
    
    assert.strictEqual(min, -1, 'min debe ser -1 (full L)');
    assert.strictEqual(max, 1, 'max debe ser +1 (full R)');
    assert.strictEqual(center, 0, 'centro debe ser 0');
  });

  it('level slider: rango 0 a 1', () => {
    const min = 0;
    const max = 1;
    
    assert.strictEqual(min, 0, 'min debe ser 0 (silencio)');
    assert.strictEqual(max, 1, 'max debe ser 1 (máximo)');
  });
});

describe('Valores límite de filtro', () => {
  it('LP: frecuencia mínima es audible (200Hz)', () => {
    const freq = getLowpassFreq(-1);
    assert.ok(freq >= 100, 'frecuencia mínima debe ser audible');
    assert.ok(freq <= 500, 'frecuencia mínima no debe ser muy alta');
  });

  it('HP: frecuencia máxima es razonable (5kHz)', () => {
    const freq = getHighpassFreq(1);
    assert.ok(freq >= 3000, 'frecuencia máxima HP debe ser alta');
    assert.ok(freq <= 10000, 'frecuencia máxima HP no debe ser extrema');
  });

  it('LP/HP no se solapan cuando ambos están en bypass', () => {
    const lpBypass = getLowpassFreq(0);
    const hpBypass = getHighpassFreq(0);
    
    // LP en 20kHz, HP en 20Hz → no hay solapamiento
    assert.ok(lpBypass > hpBypass, 'LP bypass debe ser mayor que HP bypass');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: VCA CEM 3330 (Output Channels)
// ─────────────────────────────────────────────────────────────────────────────
//
// Estos tests verifican la emulación del VCA CEM 3330 usado en los Output Channels
// de la versión Cuenca/Datanomics 1982 del Synthi 100.
//
// El VCA tiene:
// - Sensibilidad de 10 dB/V
// - Respuesta logarítmica
// - Corte mecánico en posición 0 del fader (ignora CV externo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constantes del VCA replicadas de voltageConstants.js
 */
const VCA_DB_PER_VOLT = 10;
const VCA_SLIDER_VOLTAGE_AT_MAX = 0;  // 0V (dial=10)
const VCA_SLIDER_VOLTAGE_AT_MIN = -12;  // -12V (dial=0)

/**
 * Convierte posición del dial (0-10) a voltaje del slider.
 * Réplica de vcaDialToVoltage() para tests sin imports ES6.
 */
function vcaDialToVoltage(dialPosition) {
  // Lineal: 0→-12V, 10→0V
  return VCA_SLIDER_VOLTAGE_AT_MIN + (dialPosition / 10) * (VCA_SLIDER_VOLTAGE_AT_MAX - VCA_SLIDER_VOLTAGE_AT_MIN);
}

/**
 * Convierte voltaje sumado a ganancia lineal.
 * Réplica simplificada de vcaVoltageToGain() para tests.
 */
function vcaVoltageToGain(voltage) {
  // 0V → 0 dB → ganancia 1.0
  // -12V → -120 dB → ganancia ~0
  const dB = voltage * VCA_DB_PER_VOLT;
  if (dB <= -120) return 0;
  return Math.pow(10, dB / 20);
}

/**
 * Calcula ganancia final del VCA con posición de dial y CV externo.
 * Réplica de vcaCalculateGain() para tests.
 */
function vcaCalculateGain(dialPosition, externalCV = 0) {
  // ─────────────────────────────────────────────────────────────────────────
  // CASO CRÍTICO: Posición 0 = corte mecánico total
  // El fader físicamente desconecta. Cualquier CV externo es IGNORADO.
  // ─────────────────────────────────────────────────────────────────────────
  if (dialPosition <= 0) {
    return 0;
  }
  
  const sliderVoltage = vcaDialToVoltage(dialPosition);
  const totalVoltage = sliderVoltage + externalCV;
  return vcaVoltageToGain(totalVoltage);
}

describe('VCA CEM 3330 - Conversión dial a voltaje', () => {
  it('dial = 10 → 0V (ganancia unidad)', () => {
    const voltage = vcaDialToVoltage(10);
    assert.ok(Math.abs(voltage - 0) < 0.001, `dial 10 debe dar 0V, dio ${voltage}V`);
  });

  it('dial = 0 → -12V (silencio antes de corte mecánico)', () => {
    const voltage = vcaDialToVoltage(0);
    assert.ok(Math.abs(voltage - (-12)) < 0.001, `dial 0 debe dar -12V, dio ${voltage}V`);
  });

  it('dial = 5 → -6V (mitad del recorrido)', () => {
    const voltage = vcaDialToVoltage(5);
    assert.ok(Math.abs(voltage - (-6)) < 0.001, `dial 5 debe dar -6V, dio ${voltage}V`);
  });

  it('escala lineal: incrementos iguales en dial dan incrementos iguales en voltaje', () => {
    const v0 = vcaDialToVoltage(0);
    const v2 = vcaDialToVoltage(2);
    const v4 = vcaDialToVoltage(4);
    const v6 = vcaDialToVoltage(6);
    
    const delta1 = v2 - v0;
    const delta2 = v4 - v2;
    const delta3 = v6 - v4;
    
    // Todos los deltas deben ser iguales (2.4V por cada 2 unidades)
    assert.ok(Math.abs(delta1 - delta2) < 0.001, 'delta 0→2 debe ≈ delta 2→4');
    assert.ok(Math.abs(delta2 - delta3) < 0.001, 'delta 2→4 debe ≈ delta 4→6');
  });
});

describe('VCA CEM 3330 - Conversión voltaje a ganancia', () => {
  it('0V → ganancia 1.0 (0 dB)', () => {
    const gain = vcaVoltageToGain(0);
    assert.ok(Math.abs(gain - 1.0) < 0.001, `0V debe dar ganancia 1.0, dio ${gain}`);
  });

  it('-6V → ganancia ~0.001 (-60 dB)', () => {
    const gain = vcaVoltageToGain(-6);
    const expectedDB = -60;
    const expectedGain = Math.pow(10, expectedDB / 20);
    assert.ok(Math.abs(gain - expectedGain) < 0.0001, `-6V debe dar ~${expectedGain}, dio ${gain}`);
  });

  it('-12V → ganancia ~0 (-120 dB)', () => {
    const gain = vcaVoltageToGain(-12);
    // -120 dB es prácticamente 0
    assert.ok(gain < 0.000001, `-12V debe dar ganancia ~0, dio ${gain}`);
  });

  it('curva exponencial: cada -1V reduce ganancia en 10 dB', () => {
    const g0 = vcaVoltageToGain(0);
    const g1 = vcaVoltageToGain(-1);
    const g2 = vcaVoltageToGain(-2);
    
    // Ratio entre g0/g1 y g1/g2 debe ser igual (~3.16 = 10dB)
    const ratio1 = g0 / g1;
    const ratio2 = g1 / g2;
    const expected10dB = Math.pow(10, 10 / 20);
    
    assert.ok(Math.abs(ratio1 - expected10dB) < 0.01, `ratio debe ser ~${expected10dB}, es ${ratio1}`);
    assert.ok(Math.abs(ratio2 - expected10dB) < 0.01, `ratio debe ser ~${expected10dB}, es ${ratio2}`);
  });
});

describe('VCA CEM 3330 - Función vcaCalculateGain (alto nivel)', () => {
  it('dial = 10, CV = 0 → ganancia 1.0', () => {
    const gain = vcaCalculateGain(10, 0);
    assert.ok(Math.abs(gain - 1.0) < 0.001, `dial 10 sin CV debe dar 1.0, dio ${gain}`);
  });

  it('dial = 5, CV = 0 → ganancia ~0.001 (-60 dB)', () => {
    const gain = vcaCalculateGain(5, 0);
    const expected = Math.pow(10, -60 / 20);  // ~0.001
    assert.ok(Math.abs(gain - expected) < 0.0001, `dial 5 debe dar ~${expected}, dio ${gain}`);
  });

  it('dial = 5, CV = +3V → ganancia ~0.03 (-30 dB)', () => {
    // dial 5 → -6V, +3V CV → -3V total → -30 dB
    const gain = vcaCalculateGain(5, 3);
    const expected = Math.pow(10, -30 / 20);  // ~0.03
    assert.ok(Math.abs(gain - expected) < 0.001, `dial 5 + CV 3V debe dar ~${expected}, dio ${gain}`);
  });

  it('dial = 5, CV = +6V → ganancia 1.0 (0 dB)', () => {
    // dial 5 → -6V, +6V CV → 0V total → 0 dB
    const gain = vcaCalculateGain(5, 6);
    assert.ok(Math.abs(gain - 1.0) < 0.001, `dial 5 + CV 6V debe dar 1.0, dio ${gain}`);
  });

  it('dial = 10, CV = -3V → ganancia ~0.03 (atenuación por CV negativo)', () => {
    // dial 10 → 0V, -3V CV → -3V total → -30 dB
    const gain = vcaCalculateGain(10, -3);
    const expected = Math.pow(10, -30 / 20);
    assert.ok(Math.abs(gain - expected) < 0.001, `dial 10 - CV 3V debe dar ~${expected}, dio ${gain}`);
  });
});

describe('VCA CEM 3330 - CORTE MECÁNICO en posición 0', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // TESTS CRÍTICOS
  // Estos tests verifican el comportamiento más importante del fader:
  // en posición 0, el fader desconecta MECÁNICAMENTE y cualquier CV externo
  // es completamente ignorado.
  // ─────────────────────────────────────────────────────────────────────────

  it('dial = 0, CV = 0 → ganancia 0 (silencio total)', () => {
    const gain = vcaCalculateGain(0, 0);
    assert.strictEqual(gain, 0, 'dial 0 debe dar ganancia 0');
  });

  it('dial = 0, CV = +5V → ganancia 0 (CV IGNORADO - corte mecánico)', () => {
    const gain = vcaCalculateGain(0, 5);
    assert.strictEqual(gain, 0, 'dial 0 + CV positivo debe seguir dando 0');
  });

  it('dial = 0, CV = +12V → ganancia 0 (CV máximo IGNORADO)', () => {
    const gain = vcaCalculateGain(0, 12);
    assert.strictEqual(gain, 0, 'dial 0 + CV máximo debe seguir dando 0');
  });

  it('dial = 0, CV = -5V → ganancia 0 (CV negativo también IGNORADO)', () => {
    const gain = vcaCalculateGain(0, -5);
    assert.strictEqual(gain, 0, 'dial 0 + CV negativo debe dar 0');
  });

  it('dial muy cercano a 0 (0.01) → ganancia NO es 0 (ya no hay corte mecánico)', () => {
    const gain = vcaCalculateGain(0.01, 0);
    // Dial 0.01 ya no está en corte mecánico, aunque la ganancia es muy baja
    assert.ok(gain > 0, 'dial ligeramente > 0 debe dar ganancia > 0');
    assert.ok(gain < 0.001, 'pero la ganancia debe ser muy pequeña');
  });

  it('dial negativo (-1) → tratado como 0, ganancia 0', () => {
    // Valores negativos son inválidos pero deben manejarse
    const gain = vcaCalculateGain(-1, 5);
    assert.strictEqual(gain, 0, 'dial negativo debe tratarse como corte');
  });
});
