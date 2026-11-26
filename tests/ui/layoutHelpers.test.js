/**
 * Tests para layoutHelpers.js - Funciones de layout de paneles
 * 
 * Verifica:
 * - getOscillatorUIDefaults(): defaults interiores del blueprint con fallbacks
 * - resolveOscillatorUI(): merge de defaults + overrides de slot
 * - getNoiseUIDefaults() y getRandomCVUIDefaults(): merge con fallbacks
 * - resolveModuleUI(): merge de defaults + overrides de módulo
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOscillatorUIDefaults,
  resolveOscillatorUI,
  getNoiseUIDefaults,
  getRandomCVUIDefaults,
  resolveModuleUI
} from '../../src/assets/js/ui/layoutHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE getOscillatorUIDefaults()
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutHelpers - getOscillatorUIDefaults()', () => {
  const ui = getOscillatorUIDefaults();

  it('tiene propiedades de knobs', () => {
    assert.strictEqual(typeof ui.knobSize, 'number');
    assert.strictEqual(typeof ui.knobInnerPct, 'number');
    assert.ok(Array.isArray(ui.knobGap), 'knobGap debe ser array');
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('tiene switchOffset y ya no slotOffset (la posición es la caja del slot)', () => {
    assert.ok(ui.switchOffset, 'debe tener switchOffset');
    assert.strictEqual(ui.slotOffset, undefined);
  });

  it('el blueprint gana sobre el fallback', () => {
    assert.strictEqual(ui.knobSize, 45);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE resolveOscillatorUI()
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutHelpers - resolveOscillatorUI()', () => {
  const defaults = {
    knobSize: 45,
    knobInnerPct: 76,
    knobGap: [9, 9, 9, 9, 9, 0.5],
    knobRowOffsetX: -2,
    knobRowOffsetY: -17,
    knobOffsets: [6, 6, 6, 6, 6, 6, -18],
    switchOffset: { leftPercent: 36, topPx: 6 }
  };

  it('sin overrides: devuelve copia de defaults', () => {
    const result = resolveOscillatorUI(defaults, undefined);
    assert.deepStrictEqual(result.knobGap, defaults.knobGap);
    assert.strictEqual(result.knobSize, 45);
  });

  it('con override escalar: gana el override', () => {
    const result = resolveOscillatorUI(defaults, { knobSize: 50 });
    assert.strictEqual(result.knobSize, 50);
    // Los demás se mantienen
    assert.strictEqual(result.knobInnerPct, 76);
  });

  it('override de knobGap reemplaza el array completo', () => {
    const result = resolveOscillatorUI(defaults, { knobGap: [5, 5, 5, 5, 5, 5] });
    assert.deepStrictEqual(result.knobGap, [5, 5, 5, 5, 5, 5]);
  });

  it('override de knobOffsets reemplaza el array completo', () => {
    const result = resolveOscillatorUI(defaults, { knobOffsets: [0, 0, 0, 0, 0, 0, 0] });
    assert.deepStrictEqual(result.knobOffsets, [0, 0, 0, 0, 0, 0, 0]);
  });

  it('override parcial de switchOffset: merge un nivel', () => {
    const result = resolveOscillatorUI(defaults, { switchOffset: { topPx: 10 } });
    assert.strictEqual(result.switchOffset.topPx, 10, 'override gana');
    assert.strictEqual(result.switchOffset.leftPercent, 36, 'default se mantiene');
  });

  it('no muta el objeto defaults original', () => {
    const original = { ...defaults, switchOffset: { ...defaults.switchOffset } };
    resolveOscillatorUI(defaults, { knobSize: 99 });
    assert.strictEqual(defaults.knobSize, original.knobSize, 'defaults no debe mutar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE getNoiseUIDefaults() y getRandomCVUIDefaults()
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutHelpers - getNoiseUIDefaults()', () => {
  const noiseUI = getNoiseUIDefaults();

  it('tiene knobSize numérico', () => {
    assert.strictEqual(typeof noiseUI.knobSize, 'number');
    assert.ok(noiseUI.knobSize > 0);
  });

  it('tiene knobGap como array', () => {
    assert.ok(Array.isArray(noiseUI.knobGap));
  });

  it('tiene knobInnerPct', () => {
    assert.strictEqual(typeof noiseUI.knobInnerPct, 'number');
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof noiseUI.knobRowOffsetX, 'number');
    assert.strictEqual(typeof noiseUI.knobRowOffsetY, 'number');
  });
});

describe('layoutHelpers - getRandomCVUIDefaults()', () => {
  const cvUI = getRandomCVUIDefaults();

  it('tiene knobSize numérico', () => {
    assert.strictEqual(typeof cvUI.knobSize, 'number');
    assert.ok(cvUI.knobSize > 0);
  });

  it('tiene knobGap como array', () => {
    assert.ok(Array.isArray(cvUI.knobGap));
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof cvUI.knobRowOffsetX, 'number');
    assert.strictEqual(typeof cvUI.knobRowOffsetY, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE resolveModuleUI()
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutHelpers - resolveModuleUI()', () => {
  const defaults = {
    knobSize: 65,
    knobInnerPct: 76,
    knobGap: [15],
    knobRowOffsetX: 3,
    knobRowOffsetY: 28,
    knobOffsets: [0, 0]
  };

  it('sin overrides: devuelve copia de defaults', () => {
    const result = resolveModuleUI(defaults, undefined);
    assert.strictEqual(result.knobSize, 65);
    assert.deepStrictEqual(result.knobGap, [15]);
  });

  it('con override escalar: gana el override', () => {
    const result = resolveModuleUI(defaults, { knobSize: 50 });
    assert.strictEqual(result.knobSize, 50);
    assert.strictEqual(result.knobInnerPct, 76, 'el resto se mantiene');
  });

  it('override de knobGap reemplaza el array', () => {
    const result = resolveModuleUI(defaults, { knobGap: [20] });
    assert.deepStrictEqual(result.knobGap, [20]);
  });

  it('override de knobOffsets reemplaza el array', () => {
    const result = resolveModuleUI(defaults, { knobOffsets: [5, -5] });
    assert.deepStrictEqual(result.knobOffsets, [5, -5]);
  });

  it('no muta el objeto defaults original', () => {
    const originalSize = defaults.knobSize;
    resolveModuleUI(defaults, { knobSize: 99 });
    assert.strictEqual(defaults.knobSize, originalSize);
  });
});
