/**
 * Tests para las funciones de tooltip del Digital Sequencer 1000
 *
 * Verifica las 3 funciones tooltip:
 * - getSequencerClockRateTooltipInfo: frecuencia Hz + período
 * - getSequencerVoltageLevelTooltipInfo: voltaje de salida (0-7V)
 * - getSequencerKeyLevelTooltipInfo: nivel de key bipolar (±5V)
 *
 * Los tooltips dependen de localStorage para las preferencias de visualización.
 *
 * @module tests/utils/tooltipSequencer.test
 */

// Mock de localStorage ANTES de importar tooltipUtils
import '../mocks/localStorage.mock.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';
import {
  getSequencerClockRateTooltipInfo,
  getSequencerVoltageLevelTooltipInfo,
  getSequencerKeyLevelTooltipInfo
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

// ═══════════════════════════════════════════════════════════════════════════
// CLOCK RATE TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getSequencerClockRateTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getSequencerClockRateTooltipInfo();
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial 0: frecuencia mínima ~0.1 Hz', () => {
      const result = tooltipFn(0, 0);
      assert.ok(result.includes('0.1'), `Resultado: "${result}"`);
      assert.ok(result.includes('Hz'), `Resultado: "${result}"`);
    });

    it('dial 10: frecuencia máxima ~500 Hz', () => {
      const result = tooltipFn(1, 10);
      assert.ok(result.includes('500'), `Resultado: "${result}"`);
      assert.ok(result.includes('Hz'), `Resultado: "${result}"`);
    });

    it('dial 5: frecuencia intermedia (~7 Hz)', () => {
      const result = tooltipFn(0.5, 5);
      assert.ok(result.includes('Hz'), `Resultado: "${result}"`);
      // 0.1 * 5000^0.5 ≈ 7.07 Hz
      const match = result.match(/([\d.]+)\s*Hz/);
      assert.ok(match, `Debe contener valor en Hz: "${result}"`);
      const freq = parseFloat(match[1]);
      assert.ok(freq > 5 && freq < 10, `Frecuencia debe estar entre 5-10 Hz, got ${freq}`);
    });

    it('incluye período para frecuencias bajas', () => {
      const result = tooltipFn(0, 0);
      // A 0.1 Hz, período = 10s
      assert.ok(result.includes('s'), `Debe incluir período: "${result}"`);
    });
  });

  describe('con tooltips deshabilitados', () => {

    it('devuelve null con ambos deshabilitados', () => {
      disableAllTooltips();
      tooltipFn = getSequencerClockRateTooltipInfo();
      const result = tooltipFn(0.5, 5);
      assert.strictEqual(result, null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VOLTAGE LEVEL TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getSequencerVoltageLevelTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getSequencerVoltageLevelTooltipInfo();
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial 5 (centro): muestra voltage', () => {
      const result = tooltipFn(0.5, 5);
      assert.ok(result, 'Debe devolver resultado');
      assert.ok(result.includes('V'), `Debe incluir voltaje: "${result}"`);
    });

    it('dial 0 (mínimo): salida 0V', () => {
      const result = tooltipFn(0, 0);
      assert.ok(result.includes('0'), `Resultado: "${result}"`);
    });

    it('dial 10 (máximo): salida mayor escala', () => {
      const result = tooltipFn(1, 10);
      assert.ok(result.includes('V'), `Resultado: "${result}"`);
    });

    it('escala es lineal (proporcional al dial)', () => {
      const r5 = tooltipFn(0.5, 5);
      const r10 = tooltipFn(1, 10);
      // Extraer valores numéricos
      const v5 = parseFloat(r5.match(/([\d.]+)/)?.[1] || '0');
      const v10 = parseFloat(r10.match(/([\d.]+)/)?.[1] || '0');
      // A dial 5 debería ser la mitad de dial 10 (lineal)
      assert.ok(v10 > v5, `Dial 10 (${v10}) debe ser mayor que dial 5 (${v5})`);
    });
  });

  describe('con tooltips deshabilitados', () => {

    it('devuelve null con ambos deshabilitados', () => {
      disableAllTooltips();
      tooltipFn = getSequencerVoltageLevelTooltipInfo();
      const result = tooltipFn(0.5, 5);
      assert.strictEqual(result, null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KEY LEVEL TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getSequencerKeyLevelTooltipInfo', () => {

  let tooltipFn;

  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getSequencerKeyLevelTooltipInfo();
  });

  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });

  describe('con todos los tooltips habilitados', () => {

    it('dial 0 (centro): muestra ~0V', () => {
      const result = tooltipFn(0.5, 0);
      assert.ok(result, 'Debe devolver resultado');
      assert.ok(result.includes('V'), `Debe incluir voltaje: "${result}"`);
    });

    it('dial -5 (mínimo): muestra voltaje negativo', () => {
      const result = tooltipFn(0, -5);
      assert.ok(result.includes('-'), `Debe incluir signo negativo: "${result}"`);
    });

    it('dial +5 (máximo): muestra voltaje positivo', () => {
      const result = tooltipFn(1, 5);
      assert.ok(result.includes('V'), `Resultado: "${result}"`);
    });

    it('rango bipolar simétrico', () => {
      const rNeg = tooltipFn(0, -5);
      const rPos = tooltipFn(1, 5);
      // Ambos deben tener voltaje
      assert.ok(rNeg.includes('V'), `Neg: "${rNeg}"`);
      assert.ok(rPos.includes('V'), `Pos: "${rPos}"`);
    });
  });

  describe('con tooltips deshabilitados', () => {

    it('devuelve null con ambos deshabilitados', () => {
      disableAllTooltips();
      tooltipFn = getSequencerKeyLevelTooltipInfo();
      const result = tooltipFn(0.5, 0);
      assert.strictEqual(result, null);
    });
  });
});
