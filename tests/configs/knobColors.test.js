/**
 * Tests para knobColors — colores de centro de knobs del Synthi 100
 * 
 * Verifica que todos los colores están definidos, son strings hex válidos
 * y no hay duplicados accidentales.
 * 
 * @module tests/configs/knobColors.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOB_BLUE,
  KNOB_GREEN,
  KNOB_WHITE,
  KNOB_BLACK,
  KNOB_RED,
  KNOB_YELLOW
} from '../../src/assets/js/configs/knobColors.js';

const ALL_COLORS = {
  KNOB_BLUE,
  KNOB_GREEN,
  KNOB_WHITE,
  KNOB_BLACK,
  KNOB_RED,
  KNOB_YELLOW
};

describe('knobColors - Colores de centro del Synthi 100', () => {

  it('exporta exactamente 6 colores', () => {
    assert.strictEqual(Object.keys(ALL_COLORS).length, 6);
  });

  it('todos son strings', () => {
    for (const [name, color] of Object.entries(ALL_COLORS)) {
      assert.strictEqual(typeof color, 'string', `${name} debe ser string`);
    }
  });

  it('todos son colores hex válidos (#RRGGBB)', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const [name, color] of Object.entries(ALL_COLORS)) {
      assert.ok(hexPattern.test(color), `${name} (${color}) debe ser #RRGGBB`);
    }
  });

  it('no hay colores duplicados', () => {
    const values = Object.values(ALL_COLORS);
    const unique = new Set(values);
    assert.strictEqual(values.length, unique.size, 'No debe haber colores duplicados');
  });

  it('cada color tiene el valor esperado del Synthi 100 de Cuenca', () => {
    assert.strictEqual(KNOB_BLUE, '#547FA1');
    assert.strictEqual(KNOB_GREEN, '#467660');
    assert.strictEqual(KNOB_WHITE, '#BEB7B1');
    assert.strictEqual(KNOB_BLACK, '#242227');
    assert.strictEqual(KNOB_RED, '#B54049');
    assert.strictEqual(KNOB_YELLOW, '#C8A638');
  });
});
