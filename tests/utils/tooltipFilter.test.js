import '../mocks/localStorage.mock.js';

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';
import {
  getFilterFrequencyTooltipInfo,
  getFilterLevelTooltipInfo
} from '../../src/assets/js/utils/tooltipUtils.js';

function enableAllTooltips() {
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES);
  localStorage.removeItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE);
}

describe('tooltipUtils filtros Panel 1', () => {
  beforeEach(() => {
    enableAllTooltips();
  });

  it('frequency tooltip refleja 0.55 V/oct y una octava por 0.7 divisiones', () => {
    const tooltip = getFilterFrequencyTooltipInfo({
      referenceCutoffHz: 320,
      referenceDial: 5,
      octaveDialSpan: 0.7,
      voltsPerOctave: 0.55,
      minCutoffHz: 3,
      maxCutoffHz: 20000
    });

    assert.equal(tooltip(5.7), 'fc ≈ 640 Hz · ΣCV 0.55 V');
  });

  it('level tooltip a máximo muestra 5 Vp-p y no 50 V', () => {
    const tooltip = getFilterLevelTooltipInfo(5, 100);
    const result = tooltip(10);

    assert.ok(result.includes('5.00 Vp-p max'), `Resultado: "${result}"`);
    assert.ok(!result.includes('50.00 Vp-p'), `Resultado: "${result}"`);
    assert.ok(result.includes('×1.00'), `Resultado: "${result}"`);
    assert.ok(result.includes('0.0 dB'), `Resultado: "${result}"`);
  });

  it('level tooltip a cero muestra silencio efectivo', () => {
    const tooltip = getFilterLevelTooltipInfo(5, 100);
    const result = tooltip(0);

    assert.equal(result, '0.00 Vp-p max · ×0.00 · -∞ dB');
  });
});