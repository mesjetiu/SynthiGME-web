/**
 * Tests para las funciones de tooltip del Keyboard
 * 
 * Verifica las 3 funciones tooltip:
 * - getKeyboardPitchSpreadTooltipInfo: V/Oct, span, cents/st
 * - getKeyboardVelocityTooltipInfo: Vmax, digital
 * - getKeyboardGateTooltipInfo: gate voltage, digital
 * 
 * Los tooltips dependen de localStorage para las preferencias de visualización.
 * Se usa el mock de localStorage para controlar qué datos se muestran.
 * 
 * @version 1.0.0
 */

// Mock de localStorage ANTES de importar tooltipUtils
import '../mocks/localStorage.mock.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';
import {
  getKeyboardPitchSpreadTooltipInfo,
  getKeyboardVelocityTooltipInfo,
  getKeyboardGateTooltipInfo
} from '../../src/assets/js/utils/tooltipUtils.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function enableAllTooltips() {
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES);
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE);
}

function disableAllTooltips() {
  localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES, 'false');
  localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE, 'false');
}

function enableAudioOnly() {
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES);
  localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE, 'false');
}

function enableVoltageOnly() {
  localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES, 'false');
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE);
}

// ═══════════════════════════════════════════════════════════════════════════
// PITCH SPREAD TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getKeyboardPitchSpreadTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getKeyboardPitchSpreadTooltipInfo(); // spreadUnity=9, octaves=5
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial 9 (unity): muestra 1.000 V/Oct', () => {
      const result = tooltipFn(0.9, 9);
      assert.ok(result.includes('1.000 V/Oct'), `Resultado: "${result}"`);
    });

    it('dial 9: muestra 5.00V span', () => {
      const result = tooltipFn(0.9, 9);
      assert.ok(result.includes('5.00V span'), `Resultado: "${result}"`);
    });

    it('dial 9: muestra 100 cents/st', () => {
      const result = tooltipFn(0.9, 9);
      assert.ok(result.includes('100 cents/st'), `Resultado: "${result}"`);
    });

    it('dial 0: muestra 0.000 V/Oct', () => {
      const result = tooltipFn(0, 0);
      assert.ok(result.includes('0.000 V/Oct'), `Resultado: "${result}"`);
    });

    it('dial 4.5: muestra 0.500 V/Oct', () => {
      const result = tooltipFn(0.45, 4.5);
      assert.ok(result.includes('0.500 V/Oct'), `Resultado: "${result}"`);
    });

    it('dial 10: muestra ~1.111 V/Oct', () => {
      const result = tooltipFn(1, 10);
      assert.ok(result.includes('1.111 V/Oct'), `Resultado: "${result}"`);
    });

    it('dial 10: muestra ~5.56V span', () => {
      const result = tooltipFn(1, 10);
      assert.ok(result.includes('5.56V span'), `Resultado: "${result}"`);
    });
  });

  describe('con solo voltaje habilitado', () => {

    beforeEach(() => {
      enableVoltageOnly();
      tooltipFn = getKeyboardPitchSpreadTooltipInfo();
    });

    it('muestra V/Oct pero no cents/st', () => {
      const result = tooltipFn(0.9, 9);
      assert.ok(result.includes('V/Oct'), `Resultado: "${result}"`);
      assert.ok(!result.includes('cents/st'), `No debe tener cents/st: "${result}"`);
    });
  });

  describe('con solo audio habilitado', () => {

    beforeEach(() => {
      enableAudioOnly();
      tooltipFn = getKeyboardPitchSpreadTooltipInfo();
    });

    it('muestra cents/st pero no V/Oct', () => {
      const result = tooltipFn(0.9, 9);
      assert.ok(!result.includes('V/Oct'), `No debe tener V/Oct: "${result}"`);
      assert.ok(result.includes('cents/st'), `Resultado: "${result}"`);
    });
  });

  describe('con todos deshabilitados', () => {

    it('devuelve null', () => {
      disableAllTooltips();
      tooltipFn = getKeyboardPitchSpreadTooltipInfo();
      const result = tooltipFn(0.9, 9);
      assert.strictEqual(result, null);
    });
  });

  describe('spreadUnity personalizado', () => {

    it('spreadUnity=5, dial=5 → 1.000 V/Oct', () => {
      tooltipFn = getKeyboardPitchSpreadTooltipInfo(5);
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('1.000 V/Oct'), `Resultado: "${result}"`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VELOCITY TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getKeyboardVelocityTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getKeyboardVelocityTooltipInfo();
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial +5: muestra Vmax +5.0V', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('Vmax +5.0V'), `Resultado: "${result}"`);
    });

    it('dial +5: muestra 1.25 dig', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('1.25 dig'), `Resultado: "${result}"`);
    });

    it('dial -5: muestra Vmax -5.0V', () => {
      const result = tooltipFn(0, -5);
      assert.ok(result.includes('Vmax -5.0V'), `Resultado: "${result}"`);
    });

    it('dial -5: muestra -1.25 dig', () => {
      const result = tooltipFn(0, -5);
      assert.ok(result.includes('-1.25 dig'), `Resultado: "${result}"`);
    });

    it('dial 0: muestra Sin efecto', () => {
      const result = tooltipFn(0.5, 0);
      assert.ok(result.includes('Sin efecto'), `Resultado: "${result}"`);
    });

    it('dial +2.5: muestra Vmax +2.5V', () => {
      const result = tooltipFn(0.75, 2.5);
      assert.ok(result.includes('Vmax +2.5V'), `Resultado: "${result}"`);
    });
  });

  describe('con solo voltaje habilitado', () => {

    beforeEach(() => {
      enableVoltageOnly();
      tooltipFn = getKeyboardVelocityTooltipInfo();
    });

    it('muestra voltaje pero no dig', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('Vmax'), `Resultado: "${result}"`);
      assert.ok(!result.includes('dig'), `No debe tener dig: "${result}"`);
    });
  });

  describe('con solo audio habilitado', () => {

    beforeEach(() => {
      enableAudioOnly();
      tooltipFn = getKeyboardVelocityTooltipInfo();
    });

    it('muestra dig pero no Vmax', () => {
      const result = tooltipFn(1, 5);
      assert.ok(!result.includes('Vmax'), `No debe tener Vmax: "${result}"`);
      assert.ok(result.includes('dig'), `Resultado: "${result}"`);
    });
  });

  describe('con todos deshabilitados', () => {

    it('devuelve null', () => {
      disableAllTooltips();
      tooltipFn = getKeyboardVelocityTooltipInfo();
      const result = tooltipFn(1, 5);
      assert.strictEqual(result, null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getKeyboardGateTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getKeyboardGateTooltipInfo();
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial +5: muestra Gate +5.0V', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('Gate +5.0V'), `Resultado: "${result}"`);
    });

    it('dial +5: muestra 1.25 dig', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('1.25 dig'), `Resultado: "${result}"`);
    });

    it('dial -5: muestra Gate -5.0V', () => {
      const result = tooltipFn(0, -5);
      assert.ok(result.includes('Gate -5.0V'), `Resultado: "${result}"`);
    });

    it('dial 0: muestra Sin gate', () => {
      const result = tooltipFn(0.5, 0);
      assert.ok(result.includes('Sin gate'), `Resultado: "${result}"`);
    });

    it('dial +3: muestra Gate +3.0V', () => {
      const result = tooltipFn(0.8, 3);
      assert.ok(result.includes('Gate +3.0V'), `Resultado: "${result}"`);
    });

    it('dial +3: muestra 0.75 dig', () => {
      const result = tooltipFn(0.8, 3);
      assert.ok(result.includes('0.75 dig'), `Resultado: "${result}"`);
    });
  });

  describe('con solo voltaje habilitado', () => {

    beforeEach(() => {
      enableVoltageOnly();
      tooltipFn = getKeyboardGateTooltipInfo();
    });

    it('muestra Gate V pero no dig', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('Gate'), `Resultado: "${result}"`);
      assert.ok(!result.includes('dig'), `No debe tener dig: "${result}"`);
    });
  });

  describe('con solo audio habilitado', () => {

    beforeEach(() => {
      enableAudioOnly();
      tooltipFn = getKeyboardGateTooltipInfo();
    });

    it('muestra dig pero no Gate', () => {
      const result = tooltipFn(1, 5);
      assert.ok(!result.includes('Gate'), `No debe tener Gate: "${result}"`);
      assert.ok(result.includes('dig'), `Resultado: "${result}"`);
    });
  });

  describe('con todos deshabilitados', () => {

    it('devuelve null', () => {
      disableAllTooltips();
      tooltipFn = getKeyboardGateTooltipInfo();
      const result = tooltipFn(1, 5);
      assert.strictEqual(result, null);
    });
  });
});
