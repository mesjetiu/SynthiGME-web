/**
 * Tests para layoutHelpers.js - Funciones de layout de paneles
 * 
 * Verifica:
 * - getOscillatorLayoutSpec(): lectura desde blueprint con fallbacks
 * - resolveOscillatorUI(): merge de defaults + overrides de slot
 * - getNoiseUIDefaults() y getRandomCVUIDefaults(): merge con fallbacks
 * - resolveModuleUI(): merge de defaults + overrides de módulo
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOscillatorLayoutSpec,
  resolveOscillatorUI,
  getNoiseUIDefaults,
  getRandomCVUIDefaults,
  resolveModuleUI
} from '../../src/assets/js/ui/layoutHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE getOscillatorLayoutSpec()
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutHelpers - getOscillatorLayoutSpec()', () => {
  const spec = getOscillatorLayoutSpec();

  it('devuelve oscSize con width y height positivos', () => {
    assert.ok(spec.oscSize, 'debe tener oscSize');
    assert.ok(spec.oscSize.width > 0, 'width positivo');
    assert.ok(spec.oscSize.height > 0, 'height positivo');
  });

  it('devuelve gap con x e y numéricos', () => {
    assert.strictEqual(typeof spec.gap.x, 'number');
    assert.strictEqual(typeof spec.gap.y, 'number');
  });

  it('devuelve rowsPerColumn = 6', () => {
    assert.strictEqual(spec.rowsPerColumn, 6);
  });

  it('devuelve padding numérico', () => {
    assert.strictEqual(typeof spec.padding, 'number');
  });

  it('devuelve reservedHeight positivo', () => {
    assert.ok(spec.reservedHeight > 0);
  });

  it('incluye oscUIDefaults con propiedades de knobs', () => {
    const ui = spec.oscUIDefaults;
    assert.ok(ui, 'debe incluir oscUIDefaults');
    assert.strictEqual(typeof ui.knobSize, 'number');
    assert.strictEqual(typeof ui.knobInnerPct, 'number');
    assert.ok(Array.isArray(ui.knobGap), 'knobGap debe ser array');
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('oscUIDefaults tiene switchOffset y slotOffset', () => {
    const ui = spec.oscUIDefaults;
    assert.ok(ui.switchOffset, 'debe tener switchOffset');
    assert.ok(ui.slotOffset, 'debe tener slotOffset');
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
    switchOffset: { leftPercent: 36, topPx: 6 },
    slotOffset: { x: 0, y: 0 }
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

  it('override parcial de slotOffset: merge un nivel', () => {
    const result = resolveOscillatorUI(defaults, { slotOffset: { x: 5 } });
    assert.strictEqual(result.slotOffset.x, 5, 'override gana');
    assert.strictEqual(result.slotOffset.y, 0, 'default se mantiene');
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
