/**
 * Tests de integración: Knob + Oscillator Config
 * 
 * Verifica que los tooltips de frecuencia de osciladores funcionan correctamente
 * usando la configuración real del módulo oscillator.config.js y las funciones
 * de conversión dialToFrequency/frequencyToDial.
 * 
 * Estos tests validan la integración entre:
 * - Clase Knob (ui/knob.js)
 * - Configuración de oscilador (configs/modules/oscillator.config.js)
 * - Conversiones de frecuencia (state/conversions.js)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Configurar entorno DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Importaciones
import {
  dialToFrequency,
  frequencyToDial,
  generateFrequencyTable
} from '../../src/assets/js/state/conversions.js';

import { oscillatorConfig } from '../../src/assets/js/configs/index.js';

const { Knob } = await import('../../src/assets/js/ui/knob.js');

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const EPSILON = 0.01; // Tolerancia para frecuencias (1%)

function assertFreqClose(actual, expected, message) {
  const diff = Math.abs(actual - expected) / expected;
  assert.ok(
    diff < EPSILON,
    `${message}: ${actual} Hz ≉ ${expected} Hz (diff: ${(diff * 100).toFixed(2)}%)`
  );
}

/**
 * Simula la función getTooltipInfo para frecuencia (similar a app.js)
 */
function createFreqTooltipInfo(isRangeLow = false, hasCV = false, showVoltage = false, showAudio = true) {
  return (dialValue, scaleValue) => {
    const parts = [];
    
    // Voltaje del potenciómetro (si está habilitado)
    // El pot del Synthi 100 genera 0-10V proporcional a la posición del dial.
    // El VCO interpreta ese voltaje con su propio tracking (0.95 u/oct).
    if (showVoltage) {
      parts.push(dialValue.toFixed(3) + ' V');
    }
    
    // Frecuencia real (si está habilitado)
    if (showAudio) {
      const freq = dialToFrequency(dialValue, {
        rangeLow: isRangeLow,
        trackingConfig: { alpha: 0.01, linearHalfRange: 2.5 }
      });
      
      let freqStr;
      if (freq >= 1000) {
        freqStr = (freq / 1000).toFixed(2) + ' kHz';
      } else {
        freqStr = freq.toFixed(2) + ' Hz';
      }
      
      if (hasCV) {
        freqStr += ' + CV';
      }
      
      parts.push(freqStr);
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Configuración de oscilador
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: oscillatorConfig', () => {
  
  it('tiene configuración de frecuencia con rango 0-10', () => {
    const freqCfg = oscillatorConfig.defaults.knobs.frequency;
    assert.strictEqual(freqCfg.min, 0);
    assert.strictEqual(freqCfg.max, 10);
    assert.strictEqual(freqCfg.initial, 5);
  });

  it('frecuencia usa curva synthi100 (no estándar)', () => {
    const freqCfg = oscillatorConfig.defaults.knobs.frequency;
    assert.strictEqual(freqCfg.curve, 'synthi100');
  });

  it('frecuencia tiene alta resolución (10000 pixels)', () => {
    const freqCfg = oscillatorConfig.defaults.knobs.frequency;
    assert.strictEqual(freqCfg.pixelsForFullRange, 10000);
  });

  it('frecuencia muestra 3 decimales en tooltip', () => {
    const freqCfg = oscillatorConfig.defaults.knobs.frequency;
    assert.strictEqual(freqCfg.scaleDecimals, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: dialToFrequency valores de referencia
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: dialToFrequency valores de referencia', () => {
  
  it('posición 5 → 261 Hz (Do central C4) en HI', () => {
    const freq = dialToFrequency(5, { trackingConfig: { alpha: 0 } });
    assert.strictEqual(freq, 261);
  });

  it('posición 5 → 26.1 Hz en LO (÷10)', () => {
    const freq = dialToFrequency(5, { rangeLow: true, trackingConfig: { alpha: 0 } });
    assertFreqClose(freq, 26.1, 'Frecuencia en rango LO');
  });

  it('posición 5 + 0.95 → 522 Hz (1 octava arriba)', () => {
    const freq = dialToFrequency(5 + 0.95, { trackingConfig: { alpha: 0 } });
    assert.strictEqual(freq, 522);
  });

  it('posición 5 - 0.95 → 130.5 Hz (1 octava abajo)', () => {
    const freq = dialToFrequency(5 - 0.95, { trackingConfig: { alpha: 0 } });
    assertFreqClose(freq, 130.5, 'Frecuencia 1 octava abajo');
  });

  it('posición 0 → frecuencia mínima (~10 Hz en HI)', () => {
    const freq = dialToFrequency(0, { trackingConfig: { alpha: 0 } });
    assert.ok(freq >= 5 && freq <= 15, `Frecuencia mínima HI: ${freq}`);
  });

  it('posición 10 → frecuencia alta (con clamp a 20000 Hz en HI)', () => {
    const freq = dialToFrequency(10, { trackingConfig: { alpha: 0 } });
    // La frecuencia teórica en dial 10 es ~10023 Hz (sin tracking distortion)
    // El clamp a 20000 solo aplica si se supera ese límite
    assert.ok(freq >= 8000 && freq <= 20000, `Frecuencia máxima HI: ${freq}`);
  });

  it('posición 0 → ~0.5-1 Hz en LO (clamped)', () => {
    const freq = dialToFrequency(0, { rangeLow: true, trackingConfig: { alpha: 0 } });
    assert.ok(freq >= 0.5 && freq <= 2, `Frecuencia mínima LO: ${freq}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Tooltip de frecuencia con formato correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: Tooltip de frecuencia - formato', () => {
  let container, knobEl, innerEl;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.querySelectorAll('.knob-tooltip, .knob-mod-badge').forEach(el => el.remove());
    document.body.removeChild(container);
  });

  it('muestra Hz para frecuencias < 1000 Hz', () => {
    const getTooltipInfo = createFreqTooltipInfo(false, false);
    const knob = new Knob(knobEl, {
      min: 0,
      max: 10,
      initial: 5, // 261 Hz
      scaleDecimals: 3,
      getTooltipInfo
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(content.includes('261'), 'Debe incluir 261');
    assert.ok(content.includes('Hz'), 'Debe incluir Hz');
    assert.ok(!content.includes('kHz'), 'No debe incluir kHz');
  });

  it('muestra kHz para frecuencias >= 1000 Hz', () => {
    const getTooltipInfo = createFreqTooltipInfo(false, false);
    const knob = new Knob(knobEl, {
      min: 0,
      max: 10,
      initial: 8, // ~2.3 kHz
      scaleDecimals: 3,
      getTooltipInfo
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(content.includes('kHz'), 'Debe incluir kHz para frecuencias altas');
  });

  it('incluye "+ CV" cuando hay modulación conectada', () => {
    const getTooltipInfo = createFreqTooltipInfo(false, true); // hasCV = true
    const knob = new Knob(knobEl, {
      min: 0,
      max: 10,
      initial: 5,
      scaleDecimals: 3,
      getTooltipInfo
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(content.includes('+ CV'), 'Debe incluir indicador de CV');
  });

  it('no incluye "+ CV" sin modulación', () => {
    const getTooltipInfo = createFreqTooltipInfo(false, false); // hasCV = false
    const knob = new Knob(knobEl, {
      min: 0,
      max: 10,
      initial: 5,
      scaleDecimals: 3,
      getTooltipInfo
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(!content.includes('+ CV'), 'No debe incluir CV sin modulación');
  });

  it('incluye voltaje cuando está habilitado', () => {
    const getTooltipInfo = createFreqTooltipInfo(false, false, true); // showVoltage = true
    const knob = new Knob(knobEl, {
      min: 0,
      max: 10,
      initial: 5,
      scaleDecimals: 3,
      getTooltipInfo
    });
    
    const content = knob._generateTooltipContent();
    assert.ok(content.includes(' V'), 'Debe incluir voltaje');
    assert.ok(content.includes('·'), 'Debe incluir separador');
  });

  it('frecuencias en rango LO son ~10x menores', () => {
    const getTooltipHI = createFreqTooltipInfo(false, false);
    const getTooltipLO = createFreqTooltipInfo(true, false); // rangeLow = true
    
    const freqHI = dialToFrequency(5, { trackingConfig: { alpha: 0 } });
    const freqLO = dialToFrequency(5, { rangeLow: true, trackingConfig: { alpha: 0 } });
    
    assertFreqClose(freqLO * 10, freqHI, 'LO debe ser 10x menor que HI');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: Knob con configuración real de oscilador
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: Knob con config de oscilador', () => {
  let container, knobEl, innerEl;
  const freqCfg = oscillatorConfig.defaults.knobs.frequency;

  beforeEach(() => {
    container = document.createElement('div');
    knobEl = document.createElement('div');
    knobEl.className = 'knob';
    innerEl = document.createElement('div');
    innerEl.className = 'knob-inner';
    knobEl.appendChild(innerEl);
    container.appendChild(knobEl);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.querySelectorAll('.knob-tooltip, .knob-mod-badge').forEach(el => el.remove());
    document.body.removeChild(container);
  });

  it('knob de frecuencia usa config de oscillatorConfig', () => {
    const knob = new Knob(knobEl, {
      min: freqCfg.min,
      max: freqCfg.max,
      initial: freqCfg.initial,
      pixelsForFullRange: freqCfg.pixelsForFullRange,
      scaleDecimals: freqCfg.scaleDecimals,
      getTooltipInfo: createFreqTooltipInfo()
    });
    
    assert.strictEqual(knob.min, 0);
    assert.strictEqual(knob.max, 10);
    assert.strictEqual(knob.value, 5);
    assert.strictEqual(knob.pixelsForFullRange, 10000);
    assert.strictEqual(knob.scaleDecimals, 3);
  });

  it('tooltip muestra valor de escala con 3 decimales', () => {
    const knob = new Knob(knobEl, {
      min: freqCfg.min,
      max: freqCfg.max,
      initial: 5.123,
      scaleDecimals: freqCfg.scaleDecimals
    });
    
    const formatted = knob._formatScaleValue();
    assert.strictEqual(formatted, '5.123');
  });

  it('pequeños cambios de dial producen pequeños cambios de frecuencia', () => {
    const freq1 = dialToFrequency(5.000, { trackingConfig: { alpha: 0 } });
    const freq2 = dialToFrequency(5.001, { trackingConfig: { alpha: 0 } }); // 0.001 de cambio
    
    // 0.001 dial ≈ 0.001/0.95 octavas ≈ 0.1% de cambio
    const changePercent = Math.abs(freq2 - freq1) / freq1 * 100;
    assert.ok(changePercent < 0.2, `Cambio debe ser pequeño: ${changePercent.toFixed(4)}%`);
  });

  it('alta resolución permite ajuste fino de frecuencia', () => {
    // Con 10000 px para rango completo (0-10), 1 px = 0.001 unidades
    const pxPerUnit = freqCfg.pixelsForFullRange / (freqCfg.max - freqCfg.min);
    assert.strictEqual(pxPerUnit, 1000, '1000 píxeles por unidad de dial');
    
    // Esto significa que 1 píxel de movimiento = 0.001 de dial
    // = ~0.1% de cambio de frecuencia (muy fino)
    const unitPerPx = 1 / pxPerUnit;
    assert.strictEqual(unitPerPx, 0.001, '0.001 unidades por píxel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: frequencyToDial (inversa)
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: frequencyToDial inversa', () => {
  
  it('261 Hz → dial 5', () => {
    const dial = frequencyToDial(261);
    assertFreqClose(dial, 5, 'Dial para 261 Hz');
  });

  it('522 Hz → dial ~5.95', () => {
    const dial = frequencyToDial(522);
    assertFreqClose(dial, 5.95, 'Dial para 522 Hz');
  });

  it('130.5 Hz → dial ~4.05', () => {
    const dial = frequencyToDial(130.5);
    assertFreqClose(dial, 4.05, 'Dial para 130.5 Hz');
  });

  it('26.1 Hz en LO → dial 5', () => {
    const dial = frequencyToDial(26.1, { rangeLow: true });
    assertFreqClose(dial, 5, 'Dial para 26.1 Hz en LO');
  });

  it('roundtrip: dialToFrequency → frequencyToDial preserva valor', () => {
    const dialOriginal = 6.5;
    const freq = dialToFrequency(dialOriginal, { trackingConfig: { alpha: 0 } });
    const dialRecovered = frequencyToDial(freq);
    
    assertFreqClose(dialRecovered, dialOriginal, 'Roundtrip preserva dial');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: generateFrequencyTable
// ═══════════════════════════════════════════════════════════════════════════

describe('Integración: generateFrequencyTable', () => {
  
  it('genera tabla con 11 entradas por defecto (0-10)', () => {
    const table = generateFrequencyTable();
    assert.strictEqual(table.length, 11);
  });

  it('tabla incluye dial, freq, freqIdeal y trackingError', () => {
    const table = generateFrequencyTable();
    const entry = table[5]; // dial = 5
    
    assert.ok('dial' in entry);
    assert.ok('freq' in entry);
    assert.ok('freqIdeal' in entry);
    assert.ok('trackingError' in entry);
  });

  it('posición 5 tiene 261 Hz ideal', () => {
    const table = generateFrequencyTable({ trackingConfig: { alpha: 0 } });
    const entry = table[5];
    
    assert.strictEqual(entry.dial, 5);
    assert.strictEqual(entry.freqIdeal, 261);
  });

  it('tabla LO tiene frecuencias 10x menores', () => {
    const tableHI = generateFrequencyTable({ trackingConfig: { alpha: 0 } });
    const tableLO = generateFrequencyTable({ rangeLow: true, trackingConfig: { alpha: 0 } });
    
    assertFreqClose(tableLO[5].freqIdeal * 10, tableHI[5].freqIdeal, 'LO 10x menor que HI');
  });

  it('tracking error es 0 dentro de zona lineal con alpha=0', () => {
    const table = generateFrequencyTable({ trackingConfig: { alpha: 0 } });
    
    // Con alpha=0, no hay distorsión, así que trackingError debe ser 0
    table.forEach(entry => {
      assert.strictEqual(entry.trackingError, 0, `Error en dial ${entry.dial}`);
    });
  });
});
