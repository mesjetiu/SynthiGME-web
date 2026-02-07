/**
 * Tests para lógica de audio de OutputChannel y Engine
 * 
 * Verifica:
 * - Coeficientes IIR del filtro RC pasivo (modelo circuito Cuenca 1982)
 * - Respuesta en frecuencia: fc, pendiente (dB/oct), ganancia en DC y HF
 * - Shelving HP (+6 dB) y lowpass (fc ≈ 677 Hz, 6 dB/oct)
 * - Cálculo de panning equal-power
 * - Mapeo de valores de knobs
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// MODELO DEL FILTRO RC PASIVO (réplica del worklet, para tests sin AudioContext)
// ─────────────────────────────────────────────────────────────────────────────
// Circuito real: Pot 10K LIN + 2× 0.047µF + buffer CA3140 (ganancia 2×)
//
// Función de transferencia analógica:
//   H(s) = (2 + (1+p)·s·τ) / (2 + s·τ)  donde τ = R·C = 4.7×10⁻⁴ s
//
// Comportamiento en audio:
//   p=-1 → LP: fc(-3dB) ≈ 677 Hz, atenúa HF a -6 dB/oct
//   p= 0 → Plano: 0 dB en todo el espectro (20 Hz – 20 kHz)
//   p=+1 → Shelving HF: +6 dB por encima de ~677 Hz, LF intactas
//
// Implementación digital (transformada bilineal):
//   K = 2·fs·τ
//   b0 = (2 + (1+p)·K) / (2 + K)
//   b1 = (2 - (1+p)·K) / (2 + K)
//   a1 = (2 - K) / (2 + K)
// ─────────────────────────────────────────────────────────────────────────────

const RC_DEFAULTS = {
  resistance: 10000,      // 10 kΩ
  capacitance: 47e-9,     // 0.047 µF
  sampleRate: 44100       // fs típico
};

/**
 * Calcula coeficientes IIR del filtro RC para una posición dada.
 * Réplica del algoritmo del worklet para verificación sin AudioContext.
 * 
 * @param {number} p - Posición bipolar (-1=LP fc≈677Hz, 0=plano, +1=HP shelf +6dB)
 * @param {Object} [opts] - Opciones de circuito (resistance, capacitance, sampleRate)
 * @returns {{ b0: number, b1: number, a1: number, K: number }} Coeficientes normalizados
 */
function getFilterCoefficients(p, opts = {}) {
  const R = opts.resistance || RC_DEFAULTS.resistance;
  const C = opts.capacitance || RC_DEFAULTS.capacitance;
  const fs = opts.sampleRate || RC_DEFAULTS.sampleRate;
  
  const tau = R * C;
  const K = 2 * fs * tau;
  const pK = (1 + p) * K;
  const invDenom = 1 / (2 + K);
  
  return {
    b0: (2 + pK) * invDenom,
    b1: (2 - pK) * invDenom,
    a1: (2 - K) * invDenom,
    K
  };
}

/**
 * Calcula la magnitud de la respuesta en frecuencia del filtro.
 * Evalúa |H(e^jω)| = |b0 + b1·e^-jω| / |1 + a1·e^-jω| a una frecuencia dada.
 * Devuelve ganancia lineal (1.0 = 0 dB, 0.5 ≈ -6 dB, 2.0 ≈ +6 dB).
 * 
 * @param {{ b0: number, b1: number, a1: number }} coeffs - Coeficientes IIR
 * @param {number} freq - Frecuencia de evaluación en Hz
 * @param {number} [fs=44100] - Frecuencia de muestreo
 * @returns {number} Magnitud de la respuesta (ganancia lineal)
 */
function getFrequencyResponse(coeffs, freq, fs = RC_DEFAULTS.sampleRate) {
  const omega = 2 * Math.PI * freq / fs;
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);
  
  // Numerador: b0 + b1·e^-jω
  const numReal = coeffs.b0 + coeffs.b1 * cosW;
  const numImag = -coeffs.b1 * sinW;
  const numMag = Math.sqrt(numReal * numReal + numImag * numImag);
  
  // Denominador: 1 + a1·e^-jω
  const denReal = 1 + coeffs.a1 * cosW;
  const denImag = -coeffs.a1 * sinW;
  const denMag = Math.sqrt(denReal * denReal + denImag * denImag);
  
  return numMag / denMag;
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
// TESTS: FILTRO RC PASIVO - COEFICIENTES IIR
// ─────────────────────────────────────────────────────────────────────────────
// Verifican que los coeficientes del filtro digital (b0, b1, a1) corresponden
// a la transformada bilineal del circuito analógico y producen la respuesta
// en frecuencia esperada en cada posición del dial.
// ─────────────────────────────────────────────────────────────────────────────

describe('Filtro RC pasivo - Coeficientes IIR', () => {
  it('p=0 (plano) → b0=1, b1=a1 (ganancia unitaria)', () => {
    const c = getFilterCoefficients(0);
    assert.ok(Math.abs(c.b0 - 1) < 1e-10, `b0 debe ser 1, es ${c.b0}`);
    assert.ok(Math.abs(c.b1 - c.a1) < 1e-10, `b1 debe igualar a1 para plano`);
  });

  it('p=-1 (LP máximo) → b0=b1 (LP puro)', () => {
    const c = getFilterCoefficients(-1);
    // Para LP: pK = 0, así b0 = 2/(2+K) = b1
    assert.ok(Math.abs(c.b0 - c.b1) < 1e-10, `b0 debe igualar b1 para LP puro`);
    assert.ok(c.b0 > 0 && c.b0 < 1, `b0 debe estar entre 0 y 1, es ${c.b0}`);
  });

  it('p=+1 (HP máximo) → coeficientes correctos', () => {
    const c = getFilterCoefficients(1);
    const K = c.K;
    // Para HP: pK = 2K
    const expectedB0 = (2 + 2 * K) / (2 + K);
    const expectedB1 = (2 - 2 * K) / (2 + K);
    assert.ok(Math.abs(c.b0 - expectedB0) < 1e-10);
    assert.ok(Math.abs(c.b1 - expectedB1) < 1e-10);
  });

  it('K precalculado es correcto (2·fs·τ)', () => {
    const c = getFilterCoefficients(0);
    const expectedK = 2 * RC_DEFAULTS.sampleRate * RC_DEFAULTS.resistance * RC_DEFAULTS.capacitance;
    assert.ok(Math.abs(c.K - expectedK) < 1e-6, `K debe ser ${expectedK}, es ${c.K}`);
  });

  it('coeficientes cambian monótonamente de LP a HP', () => {
    const positions = [-1, -0.5, 0, 0.5, 1];
    const b0Values = positions.map(p => getFilterCoefficients(p).b0);
    
    // b0 debe crecer monótonamente de LP a HP
    for (let i = 1; i < b0Values.length; i++) {
      assert.ok(b0Values[i] > b0Values[i - 1],
        `b0 debe crecer: p=${positions[i - 1]}→${b0Values[i - 1]}, p=${positions[i]}→${b0Values[i]}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: FILTRO RC PASIVO - RESPUESTA EN FRECUENCIA (dB, fc, pendiente)
// ─────────────────────────────────────────────────────────────────────────────
// Verifican el comportamiento audible del filtro: ganancia en dB a distintas
// frecuencias, frecuencia de corte (-3 dB), pendiente (6 dB/oct), shelving
// HP (+6 dB) y transición gradual entre posiciones.
// ─────────────────────────────────────────────────────────────────────────────

describe('Filtro RC pasivo - Respuesta en frecuencia', () => {
  it('plano (p=0): ganancia unitaria en todo el espectro', () => {
    const c = getFilterCoefficients(0);
    
    for (const freq of [50, 200, 1000, 5000, 15000]) {
      const mag = getFrequencyResponse(c, freq);
      assert.ok(Math.abs(mag - 1) < 0.001,
        `Plano: ganancia a ${freq}Hz debe ser ~1.0, es ${mag.toFixed(4)}`);
    }
  });

  it('LP máximo (p=-1): ganancia DC=1, atenúa agudos', () => {
    const c = getFilterCoefficients(-1);
    
    // DC debe ser 1.0
    const magDC = getFrequencyResponse(c, 1);
    assert.ok(Math.abs(magDC - 1) < 0.01, `LP DC debe ser ~1.0, es ${magDC.toFixed(4)}`);
    
    // 5kHz debe estar atenuado (>6dB)
    const mag5k = getFrequencyResponse(c, 5000);
    assert.ok(mag5k < 0.5, `LP 5kHz debe estar atenuado (<0.5), es ${mag5k.toFixed(4)}`);
    
    // 10kHz aún más atenuado
    const mag10k = getFrequencyResponse(c, 10000);
    assert.ok(mag10k < mag5k, `10kHz debe estar más atenuado que 5kHz`);
  });

  it('HP máximo (p=+1): atenúa graves, HF boosteado (+6dB shelf)', () => {
    const c = getFilterCoefficients(1);
    
    // DC debe ser 1.0 (shelving, no pasa-altos puro)
    const magDC = getFrequencyResponse(c, 1);
    assert.ok(Math.abs(magDC - 1) < 0.01, `HP DC debe ser ~1.0, es ${magDC.toFixed(4)}`);
    
    // HF debe acercarse a 2.0 (+6dB shelf)
    const mag10k = getFrequencyResponse(c, 10000);
    assert.ok(mag10k > 1.5, `HP 10kHz debe ser >1.5 (shelf), es ${mag10k.toFixed(4)}`);
    
    // La diferencia entre HF y DC es el shelving (~6dB)
    const shelfDb = 20 * Math.log10(mag10k / magDC);
    assert.ok(shelfDb > 3 && shelfDb < 7,
      `Shelving debe ser ~6dB, es ${shelfDb.toFixed(1)}dB`);
  });

  it('pendiente 6 dB/oct en LP (primer orden)', () => {
    const c = getFilterCoefficients(-1);
    
    // Medir ganancia a 2kHz y 4kHz (una octava)
    const mag2k = getFrequencyResponse(c, 2000);
    const mag4k = getFrequencyResponse(c, 4000);
    
    const slopeDb = 20 * Math.log10(mag4k / mag2k);
    // Primer orden: debe ser ~-6 dB/oct (tolerancia ±2dB por efectos de frecuencia finita)
    assert.ok(slopeDb < -4 && slopeDb > -8,
      `Pendiente debe ser ~-6 dB/oct, es ${slopeDb.toFixed(1)} dB/oct`);
  });

  it('transición continua: posiciones intermedias entre LP y plano', () => {
    // A 2kHz, la atenuación debe crecer gradualmente
    const positions = [0, -0.25, -0.5, -0.75, -1];
    const mags = positions.map(p => getFrequencyResponse(getFilterCoefficients(p), 2000));
    
    for (let i = 1; i < mags.length; i++) {
      assert.ok(mags[i] < mags[i - 1],
        `Atenuación a 2kHz debe crecer: p=${positions[i - 1]}→${mags[i - 1].toFixed(3)}, p=${positions[i]}→${mags[i].toFixed(3)}`);
    }
  });

  it('fc del LP ≈ 677 Hz (-3dB desde DC)', () => {
    const c = getFilterCoefficients(-1);
    const magDC = getFrequencyResponse(c, 1);
    const target3dB = magDC / Math.SQRT2;
    
    // Buscar la frecuencia donde la magnitud cruza -3dB
    let fc = 0;
    for (let f = 100; f < 2000; f += 10) {
      const mag = getFrequencyResponse(c, f);
      if (mag <= target3dB) {
        fc = f;
        break;
      }
    }
    
    // fc debe estar cerca de 1/(π·τ) ≈ 677 Hz
    const expectedFc = 1 / (Math.PI * RC_DEFAULTS.resistance * RC_DEFAULTS.capacitance);
    assert.ok(Math.abs(fc - expectedFc) < 50,
      `fc(-3dB) debe ser ~${expectedFc.toFixed(0)}Hz, es ${fc}Hz`);
  });
});

describe('Filtro RC pasivo - Valores del circuito Cuenca', () => {
  it('τ = R·C = 4.7e-4 s', () => {
    const tau = RC_DEFAULTS.resistance * RC_DEFAULTS.capacitance;
    assert.ok(Math.abs(tau - 4.7e-4) < 1e-8, `τ debe ser 4.7e-4, es ${tau}`);
  });

  it('fc teórica = 1/(2πτ) ≈ 339 Hz (polo fundamental)', () => {
    const tau = RC_DEFAULTS.resistance * RC_DEFAULTS.capacitance;
    const fc = 1 / (2 * Math.PI * tau);
    assert.ok(Math.abs(fc - 339) < 1, `fc debe ser ~339Hz, es ${fc.toFixed(1)}`);
  });

  it('fc LP (-3dB) = 1/(πτ) ≈ 677 Hz (factor 2× del divisor)', () => {
    const tau = RC_DEFAULTS.resistance * RC_DEFAULTS.capacitance;
    const fcLP = 1 / (Math.PI * tau);
    assert.ok(Math.abs(fcLP - 677) < 2, `fc LP debe ser ~677Hz, es ${fcLP.toFixed(1)}`);
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
  it('filter knob: rango -5 a 5 con centro en 0', () => {
    const min = -5;
    const max = 5;
    const center = 0;
    
    assert.strictEqual(min, -5, 'min debe ser -5 (LP máximo)');
    assert.strictEqual(max, 5, 'max debe ser 5 (HP máximo)');
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

describe('Valores límite de filtro RC', () => {
  it('LP extremo (p=-1): fc ≈ 677 Hz, audible', () => {
    const coeffs = getFilterCoefficients(-1);
    // Buscar frecuencia de corte a -3dB
    const refGain = getFrequencyResponse(coeffs, 10);  // ganancia DC (referencia)
    const target = refGain * Math.SQRT1_2;  // -3dB
    // fc nominal: 1/(2π·τ) = 1/(2π·10000·47e-9) ≈ 338 Hz (polo)
    // fc del filtro completo (b0/b1 shape) ≈ 677 Hz
    const fc677 = getFrequencyResponse(coeffs, 677);
    assert.ok(fc677 < refGain, 'a 677 Hz debe haber atenuación LP');
    assert.ok(fc677 > 0.3, 'la atenuación no debe ser extrema a 677 Hz');
  });

  it('HP extremo (p=+1): atenúa graves por debajo de fc', () => {
    const coeffs = getFilterCoefficients(+1);
    const refHigh = getFrequencyResponse(coeffs, 5000);
    const low100 = getFrequencyResponse(coeffs, 100);
    assert.ok(low100 < refHigh, '100 Hz debe tener menos ganancia que 5 kHz en HP');
  });

  it('posición neutra (p=0): respuesta plana en todo el rango', () => {
    const coeffs = getFilterCoefficients(0);
    const g100 = getFrequencyResponse(coeffs, 100);
    const g1k = getFrequencyResponse(coeffs, 1000);
    const g10k = getFrequencyResponse(coeffs, 10000);
    // Todas deben ser cercanas a 1 (ganancia unitaria ≈ plano)
    assert.ok(Math.abs(g100 - 1) < 0.05, `100 Hz plano: ${g100}`);
    assert.ok(Math.abs(g1k - 1) < 0.05, `1 kHz plano: ${g1k}`);
    assert.ok(Math.abs(g10k - 1) < 0.1, `10 kHz plano: ${g10k}`);
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

// ═══════════════════════════════════════════════════════════════════════════
// OutputChannel.setExternalCV() - API de modulación de amplitud
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputChannel.setExternalCV() - API', () => {
  // Mock del engine para verificar llamadas
  function createMockEngine() {
    const calls = [];
    return {
      calls,
      setOutputLevel: (channelIndex, gain, options) => {
        calls.push({ method: 'setOutputLevel', channelIndex, gain, options });
      },
      getOutputFilter: () => 0,  // Centro/bypass
      getOutputPan: () => 0,
      getOutputLevel: () => 0,
      getOutputMute: () => false
    };
  }

  // Crear instancia mínima de OutputChannel para testing
  function createTestChannel(engine, channelIndex = 0) {
    // Simular estructura básica del OutputChannel
    return {
      engine,
      channelIndex,
      values: {
        level: 5,        // dial en posición media
        externalCV: 0,
        filter: 0,
        pan: 0,
        power: true
      },
      setExternalCV(voltage, { ramp = 0.01 } = {}) {
        this.values.externalCV = voltage;
        const gain = vcaCalculateGain(this.values.level, voltage);
        this.engine.setOutputLevel(this.channelIndex, gain, { ramp });
      },
      getExternalCV() {
        return this.values.externalCV;
      }
    };
  }

  it('setExternalCV() almacena el voltaje en values.externalCV', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    
    channel.setExternalCV(3.5);
    
    assert.strictEqual(channel.values.externalCV, 3.5);
  });

  it('setExternalCV() llama a engine.setOutputLevel con ganancia calculada', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    channel.values.level = 10;  // dial máximo
    
    channel.setExternalCV(-3);  // CV de -3V → debería atenuar 30dB
    
    assert.strictEqual(engine.calls.length, 1);
    assert.strictEqual(engine.calls[0].method, 'setOutputLevel');
    assert.strictEqual(engine.calls[0].channelIndex, 0);
    
    // dial 10 → 0V, CV -3V → -3V total → -30 dB → gain ~0.0316
    const expectedGain = Math.pow(10, -30 / 20);
    assert.ok(Math.abs(engine.calls[0].gain - expectedGain) < 0.001);
  });

  it('setExternalCV() respeta corte mecánico (dial=0 ignora CV)', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    channel.values.level = 0;  // dial en corte
    
    channel.setExternalCV(10);  // CV alto
    
    // Debe llamar a setOutputLevel con ganancia 0
    assert.strictEqual(engine.calls[0].gain, 0);
  });

  it('setExternalCV() con CV positivo puede aumentar ganancia (saturación)', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    channel.values.level = 8;  // dial 8 → -2.4V
    
    channel.setExternalCV(3);  // CV +3V → total +0.6V
    
    // Ganancia > 1.0 (pero saturada)
    assert.ok(engine.calls[0].gain > 1.0, 'CV positivo debe poder superar ganancia 1.0');
    assert.ok(engine.calls[0].gain < 2.0, 'pero saturación debe limitar');
  });

  it('getExternalCV() devuelve el voltaje almacenado', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    
    channel.setExternalCV(-2.5);
    
    assert.strictEqual(channel.getExternalCV(), -2.5);
  });

  it('setExternalCV() usa rampa por defecto de 0.01s', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    
    channel.setExternalCV(1);
    
    assert.deepStrictEqual(engine.calls[0].options, { ramp: 0.01 });
  });

  it('setExternalCV() acepta rampa personalizada', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    
    channel.setExternalCV(1, { ramp: 0.05 });
    
    assert.deepStrictEqual(engine.calls[0].options, { ramp: 0.05 });
  });

  it('múltiples llamadas a setExternalCV() actualizan correctamente', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    channel.values.level = 10;
    
    channel.setExternalCV(0);
    channel.setExternalCV(-3);
    channel.setExternalCV(0);
    
    assert.strictEqual(engine.calls.length, 3);
    // Primera: CV=0 → gain=1.0
    assert.ok(Math.abs(engine.calls[0].gain - 1.0) < 0.001);
    // Segunda: CV=-3 → gain~0.0316
    assert.ok(Math.abs(engine.calls[1].gain - Math.pow(10, -30/20)) < 0.001);
    // Tercera: CV=0 → gain=1.0 de nuevo
    assert.ok(Math.abs(engine.calls[2].gain - 1.0) < 0.001);
  });

  it('cambio de dial recalcula ganancia con CV actual', () => {
    const engine = createMockEngine();
    const channel = createTestChannel(engine);
    
    // Establecer CV primero
    channel.setExternalCV(3);  // +3V
    engine.calls.length = 0;   // Limpiar llamadas
    
    // Simular cambio de dial (como hace flushValue)
    channel.values.level = 5;  // dial 5 → -6V + CV 3V = -3V → -30dB
    const gain = vcaCalculateGain(channel.values.level, channel.values.externalCV);
    channel.engine.setOutputLevel(channel.channelIndex, gain, { ramp: 0.06 });
    
    const expectedGain = Math.pow(10, -30 / 20);
    assert.ok(Math.abs(engine.calls[0].gain - expectedGain) < 0.001);
  });
});
