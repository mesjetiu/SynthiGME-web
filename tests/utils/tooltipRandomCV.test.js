/**
 * Tests para las funciones de tooltip del Random Control Voltage Generator
 * 
 * Verifica las 4 funciones tooltip:
 * - getRandomCVMeanTooltipInfo: frecuencia, período, voltaje CV
 * - getRandomCVVarianceTooltipInfo: porcentaje + texto descriptivo
 * - getRandomCVVoltageLevelTooltipInfo: ±V, ganancia LOG, dB
 * - getRandomCVKeyTooltipInfo: voltaje bipolar + ancho de pulso
 * 
 * Los tooltips dependen de localStorage para las preferencias de visualización.
 * Se usa el mock de localStorage para controlar qué datos se muestran.
 * 
 * @version 1.0.0
 */

// Mock de localStorage ANTES de importar tooltipUtils (lee localStorage en cada llamada)
import '../mocks/localStorage.mock.js';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';
import {
  getRandomCVMeanTooltipInfo,
  getRandomCVVarianceTooltipInfo,
  getRandomCVVoltageLevelTooltipInfo,
  getRandomCVKeyTooltipInfo
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
// MEAN TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getRandomCVMeanTooltipInfo', () => {
  
  let tooltipFn;
  
  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getRandomCVMeanTooltipInfo(0.55);
  });
  
  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });
  
  describe('con todos los tooltips habilitados', () => {
    
    it('dial -5: muestra 0.2 Hz', () => {
      const result = tooltipFn(-5);
      assert.ok(result.includes('0.2 Hz'), `Resultado: "${result}"`);
    });
    
    it('dial +5: muestra 20.0 Hz', () => {
      const result = tooltipFn(5);
      assert.ok(result.includes('20.0 Hz'), `Resultado: "${result}"`);
    });
    
    it('dial 0: muestra ~2.0 Hz', () => {
      const result = tooltipFn(0);
      assert.ok(result.includes('2.0 Hz'), `Resultado: "${result}"`);
    });
    
    it('incluye período en ms para frecuencias altas', () => {
      const result = tooltipFn(5); // 20 Hz → 50 ms
      assert.ok(result.includes('50 ms'), `Resultado: "${result}"`);
    });
    
    it('incluye período en s para frecuencias bajas', () => {
      const result = tooltipFn(-5); // 0.2 Hz → 5.0 s
      assert.ok(result.includes('5.0 s'), `Resultado: "${result}"`);
    });
    
    it('incluye voltaje con signo', () => {
      const result = tooltipFn(3);
      assert.ok(result.includes('V'), `Resultado: "${result}"`);
    });
  });
  
  describe('con solo audio habilitado', () => {
    
    it('muestra frecuencia y período', () => {
      enableAudioOnly();
      tooltipFn = getRandomCVMeanTooltipInfo(0.55);
      const result = tooltipFn(0);
      assert.ok(result.includes('Hz'), `Debe incluir Hz: "${result}"`);
    });
  });
  
  describe('con solo voltaje habilitado', () => {
    
    it('muestra voltaje', () => {
      enableVoltageOnly();
      tooltipFn = getRandomCVMeanTooltipInfo(0.55);
      const result = tooltipFn(0);
      assert.ok(result.includes('V'), `Debe incluir V: "${result}"`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VARIANCE TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getRandomCVVarianceTooltipInfo', () => {
  
  let tooltipFn;
  
  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getRandomCVVarianceTooltipInfo();
  });
  
  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });
  
  it('dial -5: muestra "Constante"', () => {
    const result = tooltipFn(-5);
    assert.strictEqual(result, 'Constante');
  });
  
  it('dial -3: muestra porcentaje bajo + "Estable"', () => {
    const result = tooltipFn(-3);
    assert.ok(result.includes('20%'), `Resultado: "${result}"`);
    assert.ok(result.includes('Estable'), `Resultado: "${result}"`);
  });
  
  it('dial 0: muestra 50% + "Moderada"', () => {
    const result = tooltipFn(0);
    assert.ok(result.includes('50%'), `Resultado: "${result}"`);
    assert.ok(result.includes('Moderada'), `Resultado: "${result}"`);
  });
  
  it('dial +5: muestra 100% + "Máxima"', () => {
    const result = tooltipFn(5);
    assert.ok(result.includes('100%'), `Resultado: "${result}"`);
    assert.ok(result.includes('Máxima'), `Resultado: "${result}"`);
  });
  
  it('dial +3: muestra 80% + "Máxima"', () => {
    const result = tooltipFn(3);
    assert.ok(result.includes('80%'), `Resultado: "${result}"`);
    assert.ok(result.includes('Máxima'), `Resultado: "${result}"`);
  });
  
  it('devuelve null si audio tooltips deshabilitados', () => {
    disableAllTooltips();
    tooltipFn = getRandomCVVarianceTooltipInfo();
    const result = tooltipFn(0);
    assert.strictEqual(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VOLTAGE LEVEL TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getRandomCVVoltageLevelTooltipInfo', () => {
  
  let tooltipFn;
  
  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getRandomCVVoltageLevelTooltipInfo(2.5, 100);
  });
  
  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });
  
  it('dial 0: muestra ±0.00V', () => {
    const result = tooltipFn(0);
    assert.ok(result.includes('±0.00V'), `Resultado: "${result}"`);
  });
  
  it('dial 10: muestra ±2.50V (máximo)', () => {
    const result = tooltipFn(10);
    assert.ok(result.includes('±2.50V'), `Resultado: "${result}"`);
  });
  
  it('dial 5: muestra voltaje LOG (≈±0.23V)', () => {
    // gain ≈ 0.091 → 0.091 * 2.5 ≈ 0.227
    const result = tooltipFn(5);
    assert.ok(result.includes('±0.23V') || result.includes('±0.22V'),
      `Resultado: "${result}"`);
  });
  
  it('incluye ganancia formateada', () => {
    const result = tooltipFn(8);
    // gain ≈ 0.392 → "× 0.392" o similar
    assert.ok(result.includes('×'), `Debe incluir formato ganancia: "${result}"`);
  });
  
  it('incluye dB', () => {
    const result = tooltipFn(8);
    assert.ok(result.includes('dB'), `Debe incluir dB: "${result}"`);
  });
  
  it('dial 0 con ganancia 0: muestra -∞ dB', () => {
    const result = tooltipFn(0);
    assert.ok(result.includes('-∞ dB'), `Resultado: "${result}"`);
  });
  
  describe('curva LOG correcta', () => {
    
    it('mitad del dial produce << mitad del voltaje', () => {
      // LOG base 100: dial 5 → gain ≈ 0.091 → ±0.23V
      // dial 10 → gain = 1.0 → ±2.50V
      // 0.23 / 2.50 ≈ 9% — mucho menos que 50%
      const resultMid = tooltipFn(5);
      const resultMax = tooltipFn(10);
      
      // Extraer voltaje de ambos
      const voltMid = parseFloat(resultMid.match(/±(\d+\.\d+)V/)?.[1] || '0');
      const voltMax = parseFloat(resultMax.match(/±(\d+\.\d+)V/)?.[1] || '0');
      
      assert.ok(voltMid < voltMax * 0.15,
        `Voltaje medio (${voltMid}) debe ser < 15% del máximo (${voltMax})`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KEY TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════

describe('getRandomCVKeyTooltipInfo', () => {
  
  let tooltipFn;
  
  beforeEach(() => {
    enableAllTooltips();
    tooltipFn = getRandomCVKeyTooltipInfo(5);
  });
  
  it('devuelve una función', () => {
    assert.strictEqual(typeof tooltipFn, 'function');
  });
  
  it('dial 0: muestra "Sin pulso"', () => {
    const result = tooltipFn(0);
    assert.strictEqual(result, 'Sin pulso');
  });
  
  it('dial +5: muestra +5.0V y 5 ms', () => {
    const result = tooltipFn(5);
    assert.ok(result.includes('+5.0V'), `Resultado: "${result}"`);
    assert.ok(result.includes('5 ms'), `Resultado: "${result}"`);
  });
  
  it('dial -5: muestra -5.0V y 5 ms', () => {
    const result = tooltipFn(-5);
    assert.ok(result.includes('-5.0V'), `Resultado: "${result}"`);
    assert.ok(result.includes('5 ms'), `Resultado: "${result}"`);
  });
  
  it('dial +2.5: muestra +2.5V', () => {
    const result = tooltipFn(2.5);
    assert.ok(result.includes('+2.5V'), `Resultado: "${result}"`);
  });
  
  it('dial -1: muestra -1.0V', () => {
    const result = tooltipFn(-1);
    assert.ok(result.includes('-1.0V'), `Resultado: "${result}"`);
  });
  
  it('dial ≈0 (0.01): muestra "Sin pulso" (umbral 0.05)', () => {
    const result = tooltipFn(0.01);
    assert.strictEqual(result, 'Sin pulso');
  });
  
  it('devuelve null si ambos tooltips deshabilitados', () => {
    disableAllTooltips();
    tooltipFn = getRandomCVKeyTooltipInfo(5);
    const result = tooltipFn(3);
    assert.strictEqual(result, null);
  });
  
  it('acepta ancho de pulso personalizado', () => {
    tooltipFn = getRandomCVKeyTooltipInfo(10);
    const result = tooltipFn(5);
    assert.ok(result.includes('10 ms'), `Resultado: "${result}"`);
  });
});
