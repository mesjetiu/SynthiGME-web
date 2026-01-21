/**
 * Tests para state/conversions.js
 * 
 * Verifica:
 * - Inversibilidad: physicalToKnob(knobToPhysical(x)) ≈ x
 * - Curvas: linear, quadratic, exponential, logarithmic
 * - Clamps: valores fuera de [0,1] se normalizan
 * - Edge cases: 0, 1, rango 0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  knobToPhysical,
  physicalToKnob,
  getOscillatorParamConfig,
  getNoiseParamConfig,
  getInputAmplifierParamConfig,
  getOutputFaderParamConfig,
  dialToFrequency,
  applyTrackingDistortion,
  frequencyToDial,
  generateFrequencyTable
} from '../../src/assets/js/state/conversions.js';

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const EPSILON = 1e-6; // Tolerancia para comparaciones de punto flotante
const EPSILON_FREQ = 0.5; // Tolerancia para frecuencias (Hz)

function assertClose(actual, expected, message, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `${message}: ${actual} ≉ ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// knobToPhysical
// ═══════════════════════════════════════════════════════════════════════════

describe('knobToPhysical', () => {

  describe('curva linear', () => {
    const config = { min: 0, max: 100, curve: 'linear' };

    it('knob 0 → min', () => {
      assert.equal(knobToPhysical(0, config), 0);
    });

    it('knob 1 → max', () => {
      assert.equal(knobToPhysical(1, config), 100);
    });

    it('knob 0.5 → punto medio', () => {
      assert.equal(knobToPhysical(0.5, config), 50);
    });

    it('clamp: knob < 0 → min', () => {
      assert.equal(knobToPhysical(-0.5, config), 0);
    });

    it('clamp: knob > 1 → max', () => {
      assert.equal(knobToPhysical(1.5, config), 100);
    });
  });

  describe('curva quadratic', () => {
    const config = { min: 0, max: 100, curve: 'quadratic', curveExponent: 2 };

    it('knob 0 → min', () => {
      assert.equal(knobToPhysical(0, config), 0);
    });

    it('knob 1 → max', () => {
      assert.equal(knobToPhysical(1, config), 100);
    });

    it('knob 0.5 → 25 (0.5² = 0.25)', () => {
      assert.equal(knobToPhysical(0.5, config), 25);
    });
  });

  describe('curva exponential', () => {
    const config = { min: 0, max: 100, curve: 'exponential', curveK: 3 };

    it('knob 0 → min', () => {
      assert.equal(knobToPhysical(0, config), 0);
    });

    it('knob 1 → max', () => {
      assertClose(knobToPhysical(1, config), 100, 'knob 1 debería dar max');
    });

    it('knob 0.5 → valor intermedio (menor que 50 por curva)', () => {
      const result = knobToPhysical(0.5, config);
      assert.ok(result > 0 && result < 50, `Esperado < 50, obtenido ${result}`);
    });

    it('curveK = 0 → comportamiento linear', () => {
      const linearConfig = { min: 0, max: 100, curve: 'exponential', curveK: 0 };
      assert.equal(knobToPhysical(0.5, linearConfig), 50);
    });
  });

  describe('curva logarithmic', () => {
    const config = { min: 0, max: 100, curve: 'logarithmic' };

    it('knob 0 → min', () => {
      assert.equal(knobToPhysical(0, config), 0);
    });

    it('knob 1 → max', () => {
      assert.equal(knobToPhysical(1, config), 100);
    });

    it('knob 0.5 → valor intermedio (mayor que 50 por curva)', () => {
      const result = knobToPhysical(0.5, config);
      assert.ok(result > 50 && result < 100, `Esperado > 50, obtenido ${result}`);
    });
  });

  describe('curva desconocida', () => {
    it('usa linear como fallback', () => {
      const config = { min: 0, max: 100, curve: 'unknown' };
      assert.equal(knobToPhysical(0.5, config), 50);
    });
  });

  describe('offset (min != 0)', () => {
    it('linear con min=100, max=200', () => {
      const config = { min: 100, max: 200, curve: 'linear' };
      assert.equal(knobToPhysical(0, config), 100);
      assert.equal(knobToPhysical(1, config), 200);
      assert.equal(knobToPhysical(0.5, config), 150);
    });
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// physicalToKnob
// ═══════════════════════════════════════════════════════════════════════════

describe('physicalToKnob', () => {

  describe('curva linear', () => {
    const config = { min: 0, max: 100, curve: 'linear' };

    it('physical min → knob 0', () => {
      assert.equal(physicalToKnob(0, config), 0);
    });

    it('physical max → knob 1', () => {
      assert.equal(physicalToKnob(100, config), 1);
    });

    it('physical 50 → knob 0.5', () => {
      assert.equal(physicalToKnob(50, config), 0.5);
    });

    it('clamp: physical < min → knob 0', () => {
      assert.equal(physicalToKnob(-50, config), 0);
    });

    it('clamp: physical > max → knob 1', () => {
      assert.equal(physicalToKnob(150, config), 1);
    });
  });

  describe('rango 0', () => {
    it('min === max → knob 0', () => {
      const config = { min: 50, max: 50, curve: 'linear' };
      assert.equal(physicalToKnob(50, config), 0);
    });
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// INVERSIBILIDAD: physicalToKnob(knobToPhysical(k)) ≈ k
// ═══════════════════════════════════════════════════════════════════════════

describe('inversibilidad knobToPhysical ↔ physicalToKnob', () => {

  const curves = [
    { curve: 'linear' },
    { curve: 'quadratic', curveExponent: 2 },
    { curve: 'quadratic', curveExponent: 3 },
    { curve: 'exponential', curveK: 3 },
    { curve: 'exponential', curveK: 5 },
    { curve: 'logarithmic' }
  ];

  const testValues = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

  for (const curveConfig of curves) {
    const config = { min: 1, max: 10000, ...curveConfig };
    const curveName = curveConfig.curve + (curveConfig.curveExponent ? `(exp=${curveConfig.curveExponent})` : '') + (curveConfig.curveK ? `(k=${curveConfig.curveK})` : '');

    describe(`curva ${curveName}`, () => {
      for (const knobValue of testValues) {
        it(`knob ${knobValue} → physical → knob ≈ ${knobValue}`, () => {
          const physical = knobToPhysical(knobValue, config);
          const recovered = physicalToKnob(physical, config);
          assertClose(recovered, knobValue, `inversibilidad para knob=${knobValue}`);
        });
      }
    });
  }

});

// ═══════════════════════════════════════════════════════════════════════════
// PARAM CONFIG GETTERS
// ═══════════════════════════════════════════════════════════════════════════

describe('getOscillatorParamConfig', () => {

  it('devuelve defaults para frequency', () => {
    const config = getOscillatorParamConfig('frequency');
    assert.equal(config.min, 1);
    assert.equal(config.max, 10000);
    assert.equal(config.curve, 'quadratic');
  });

  it('devuelve defaults para pulseWidth', () => {
    const config = getOscillatorParamConfig('pulseWidth');
    assert.equal(config.min, 0.01);
    assert.equal(config.max, 0.99);
    assert.equal(config.curve, 'linear');
  });

  it('permite override desde panelConfig', () => {
    const panelConfig = {
      knobs: {
        frequency: { min: 10, max: 5000 }
      }
    };
    const config = getOscillatorParamConfig('frequency', panelConfig);
    assert.equal(config.min, 10);
    assert.equal(config.max, 5000);
    assert.equal(config.curve, 'quadratic'); // mantiene default
  });

});

describe('getNoiseParamConfig', () => {

  it('devuelve defaults para colour', () => {
    const config = getNoiseParamConfig('colour');
    assert.equal(config.min, 0);
    assert.equal(config.max, 1);
    assert.equal(config.curve, 'linear');
  });

});

describe('getInputAmplifierParamConfig', () => {

  it('devuelve defaults para level', () => {
    const config = getInputAmplifierParamConfig('level');
    assert.equal(config.min, 0);
    assert.equal(config.max, 1);
    assert.equal(config.curve, 'linear');
  });

});

describe('getOutputFaderParamConfig', () => {

  it('devuelve defaults para pan', () => {
    const config = getOutputFaderParamConfig('pan');
    assert.equal(config.min, -1);
    assert.equal(config.max, 1);
    assert.equal(config.curve, 'linear');
  });

  it('devuelve defaults para levelLeft', () => {
    const config = getOutputFaderParamConfig('levelLeft');
    assert.equal(config.min, 0);
    assert.equal(config.max, 1);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSIÓN DE FRECUENCIA DEL OSCILADOR (Synthi 100 - CEM 3340)
// ═══════════════════════════════════════════════════════════════════════════

describe('dialToFrequency', () => {

  describe('punto de referencia central', () => {
    it('dial 5 → 261 Hz (Do central)', () => {
      const freq = dialToFrequency(5);
      assert.equal(freq, 261);
    });

    it('dial 5 en rango LO → ~26.1 Hz (÷10)', () => {
      const freq = dialToFrequency(5, { rangeLow: true });
      assertClose(freq, 26.1, 'Frecuencia en LO', EPSILON_FREQ);
    });
  });

  describe('escala de octavas (0.95 unidades = 1 octava)', () => {
    it('dial 5 + 0.95 → ~522 Hz (1 octava arriba)', () => {
      // Sin distorsión de tracking (dentro del rango lineal)
      const freq = dialToFrequency(5 + 0.95, { trackingConfig: { alpha: 0 } });
      // 261 × 2^1 = 522
      assertClose(freq, 522, 'Una octava arriba', EPSILON_FREQ);
    });

    it('dial 5 - 0.95 → ~130.5 Hz (1 octava abajo)', () => {
      const freq = dialToFrequency(5 - 0.95, { trackingConfig: { alpha: 0 } });
      // 261 × 2^(-1) = 130.5
      assertClose(freq, 130.5, 'Una octava abajo', EPSILON_FREQ);
    });

    it('dial 5 + 1.9 → ~1044 Hz (2 octavas arriba)', () => {
      // Aún dentro del rango lineal (|V-5| = 2 < 2.5)
      const freq = dialToFrequency(5 + 1.9, { trackingConfig: { alpha: 0 } });
      // 261 × 2^2 = 1044
      assertClose(freq, 1044, 'Dos octavas arriba', EPSILON_FREQ);
    });
  });

  describe('rango HI vs LO', () => {
    it('LO siempre es HI ÷ 10', () => {
      const positions = [0, 2, 5, 8, 10];
      for (const dial of positions) {
        const freqHI = dialToFrequency(dial, { trackingConfig: { alpha: 0 } });
        const freqLO = dialToFrequency(dial, { rangeLow: true, trackingConfig: { alpha: 0 } });
        // Nota: pueden diferir ligeramente por clamping en extremos
        if (freqHI / 10 >= 0.5 && freqHI / 10 <= 2000) {
          assertClose(freqLO, freqHI / 10, `dial ${dial}: LO = HI/10`);
        }
      }
    });
  });

  describe('clamping a límites físicos', () => {
    it('rango HI: mínimo 5 Hz', () => {
      // Posición muy baja debería clampear a 5 Hz
      const freq = dialToFrequency(0, { trackingConfig: { alpha: 0 } });
      assert.ok(freq >= 5, `Frecuencia ${freq} debe ser >= 5 Hz`);
    });

    it('rango HI: máximo 20000 Hz', () => {
      // Posición muy alta debería clampear a 20000 Hz
      const freq = dialToFrequency(10, { trackingConfig: { alpha: 0 } });
      assert.ok(freq <= 20000, `Frecuencia ${freq} debe ser <= 20000 Hz`);
    });

    it('rango LO: mínimo 0.5 Hz', () => {
      const freq = dialToFrequency(0, { rangeLow: true, trackingConfig: { alpha: 0 } });
      assert.ok(freq >= 0.5, `Frecuencia ${freq} debe ser >= 0.5 Hz`);
    });

    it('rango LO: máximo 2000 Hz', () => {
      const freq = dialToFrequency(10, { rangeLow: true, trackingConfig: { alpha: 0 } });
      assert.ok(freq <= 2000, `Frecuencia ${freq} debe ser <= 2000 Hz`);
    });
  });

  describe('modulación CV externa', () => {
    it('CV +1V → 1 octava arriba (desde posición 5)', () => {
      const freqBase = dialToFrequency(5, { trackingConfig: { alpha: 0 } });
      const freqWithCV = dialToFrequency(5, { cvVoltage: 1, trackingConfig: { alpha: 0 } });
      assertClose(freqWithCV / freqBase, 2, 'CV +1V debe doblar frecuencia', 0.01);
    });

    it('CV -1V → 1 octava abajo', () => {
      const freqBase = dialToFrequency(5, { trackingConfig: { alpha: 0 } });
      const freqWithCV = dialToFrequency(5, { cvVoltage: -1, trackingConfig: { alpha: 0 } });
      assertClose(freqWithCV / freqBase, 0.5, 'CV -1V debe reducir frecuencia a la mitad', 0.01);
    });
  });

});

describe('applyTrackingDistortion', () => {

  describe('zona lineal (sin distorsión)', () => {
    it('V=5 → 5 (punto central)', () => {
      const v = applyTrackingDistortion(5);
      assert.equal(v, 5);
    });

    it('V=6 → 6 (dentro de ±2.5)', () => {
      const v = applyTrackingDistortion(6);
      assert.equal(v, 6);
    });

    it('V=7.5 → 7.5 (en el borde)', () => {
      const v = applyTrackingDistortion(7.5);
      assert.equal(v, 7.5);
    });

    it('V=2.5 → 2.5 (en el borde inferior)', () => {
      const v = applyTrackingDistortion(2.5);
      assert.equal(v, 2.5);
    });
  });

  describe('zona de distorsión (fuera del rango lineal)', () => {
    it('V=8 → <8 (se queda "flat")', () => {
      const v = applyTrackingDistortion(8, { alpha: 0.01 });
      assert.ok(v < 8, `Voltaje distorsionado ${v} debe ser < 8`);
      assert.ok(v > 7.5, `Voltaje distorsionado ${v} debe ser > 7.5`);
    });

    it('V=2 → >2 (se queda "flat" también en graves)', () => {
      const v = applyTrackingDistortion(2, { alpha: 0.01 });
      assert.ok(v > 2, `Voltaje distorsionado ${v} debe ser > 2`);
      assert.ok(v < 2.5, `Voltaje distorsionado ${v} debe ser < 2.5`);
    });

    it('alpha=0 → sin distorsión', () => {
      const v = applyTrackingDistortion(9, { alpha: 0 });
      assert.equal(v, 9);
    });

    it('alpha mayor → más distorsión', () => {
      const v1 = applyTrackingDistortion(9, { alpha: 0.01 });
      const v2 = applyTrackingDistortion(9, { alpha: 0.05 });
      assert.ok(v2 < v1, `alpha=0.05 (${v2}) debe distorsionar más que alpha=0.01 (${v1})`);
    });
  });

});

describe('frequencyToDial', () => {

  it('261 Hz → dial 5', () => {
    const dial = frequencyToDial(261);
    assertClose(dial, 5, 'Do central debe ser dial 5', 0.01);
  });

  it('522 Hz → dial ~5.95 (1 octava arriba)', () => {
    const dial = frequencyToDial(522);
    assertClose(dial, 5 + 0.95, '1 octava arriba', 0.01);
  });

  it('26.1 Hz en rango LO → dial ~5', () => {
    const dial = frequencyToDial(26.1, { rangeLow: true });
    assertClose(dial, 5, 'Do central en LO', 0.3);  // Tolerancia mayor por redondeos
  });

  it('es inversa aproximada de dialToFrequency', () => {
    const dialOriginal = 6.5;
    const freq = dialToFrequency(dialOriginal, { trackingConfig: { alpha: 0 } });
    const dialRecuperado = frequencyToDial(freq);
    assertClose(dialRecuperado, dialOriginal, 'Dial ida y vuelta', 0.01);
  });

});

describe('generateFrequencyTable', () => {

  it('genera tabla con 11 entradas por defecto (step=1)', () => {
    const table = generateFrequencyTable();
    assert.equal(table.length, 11);
  });

  it('dial 5 tiene error de tracking 0% sin distorsión', () => {
    const table = generateFrequencyTable({ trackingConfig: { alpha: 0 } });
    const row5 = table.find(r => r.dial === 5);
    assert.equal(row5.trackingError, 0);
  });

  it('tabla LO tiene frecuencias ÷10', () => {
    const tableHI = generateFrequencyTable({ trackingConfig: { alpha: 0 } });
    const tableLO = generateFrequencyTable({ rangeLow: true, trackingConfig: { alpha: 0 } });
    
    // Comparar posición central
    const hiRow5 = tableHI.find(r => r.dial === 5);
    const loRow5 = tableLO.find(r => r.dial === 5);
    
    assertClose(loRow5.freq, hiRow5.freq / 10, 'LO = HI/10 en dial 5', EPSILON_FREQ);
  });

});