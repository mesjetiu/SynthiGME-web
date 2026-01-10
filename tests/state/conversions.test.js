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
  getOutputFaderParamConfig
} from '../../src/assets/js/state/conversions.js';

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const EPSILON = 1e-9; // Tolerancia para comparaciones de punto flotante

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < EPSILON,
    `${message}: ${actual} ≉ ${expected}`
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
