/**
 * Tests de utils/panelBox.js: cajas absolutas { x, y, w, h } sobre el panel.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_SIZE, isBox, requireBox, boxCss, applyBox } from '../../src/assets/js/utils/panelBox.js';

describe('panelBox', () => {
  it('el panel mide 760 px', () => {
    assert.equal(PANEL_SIZE, 760);
  });

  it('isBox acepta cuatro números con ancho y alto positivos (x, y pueden ser negativos o decimales)', () => {
    assert.ok(isBox({ x: 0, y: 0, w: 760, h: 760 }));
    assert.ok(isBox({ x: -7.5, y: 653, w: 371, h: 94 }));
  });

  it('isBox rechaza cajas incompletas, con texto, NaN o tamaño no positivo', () => {
    assert.equal(isBox(null), false);
    assert.equal(isBox({ x: 0, y: 0, w: 10 }), false);
    assert.equal(isBox({ x: '0', y: 0, w: 10, h: 10 }), false);
    assert.equal(isBox({ x: NaN, y: 0, w: 10, h: 10 }), false);
    assert.equal(isBox({ x: 0, y: 0, w: 0, h: 10 }), false);
    assert.equal(isBox({ x: 0, y: 0, w: 10, h: -1 }), false);
  });

  it('requireBox devuelve la caja o lanza con el nombre del módulo', () => {
    const b = { x: 1, y: 2, w: 3, h: 4 };
    assert.equal(requireBox(b, 'm'), b);
    assert.throws(() => requireBox({ x: 1 }, 'osciloscopio'), /osciloscopio/);
  });

  it('boxCss da posición absoluta, caja y border-box', () => {
    assert.equal(
      boxCss({ x: 8, y: 466, w: 744, h: 93 }),
      'position: absolute; left: 8px; top: 466px; width: 744px; height: 93px; box-sizing: border-box;'
    );
  });

  it('applyBox coloca el elemento sin tocar el resto de su estilo', () => {
    const el = { style: { visibility: 'hidden' } };
    applyBox(el, { x: 7.5, y: 653, w: 371, h: 94 });
    assert.deepEqual(el.style, {
      visibility: 'hidden', position: 'absolute', left: '7.5px', top: '653px',
      width: '371px', height: '94px', boxSizing: 'border-box'
    });
  });
});
