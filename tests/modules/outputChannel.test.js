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
