/**
 * Tests de utils/panelBox.js: cajas absolutas { x, y, w, h } sobre el panel.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_SIZE, isBox, requireBox, boxCss, boxPlacement, applyBox } from '../../src/assets/js/utils/panelBox.js';

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

  it('lo exacto en 1/64 px va en left/top; lo demás, en translate (left/top se redondearía)', () => {
    assert.deepEqual(boxPlacement({ x: 174.5, y: 653 }), { left: 174.5, top: 653, transform: '' });
    assert.deepEqual(boxPlacement({ x: 5, y: 224.9 }), { left: 5, top: 0, transform: 'translate(0px, 224.9px)' });
    assert.deepEqual(boxPlacement({ x: 0.3, y: 38.25 }), { left: 0, top: 38.25, transform: 'translate(0.3px, 0px)' });
    assert.equal(
      boxCss({ x: 5, y: 18.3, w: 375, h: 103 }),
      'position: absolute; left: 5px; top: 0px; width: 375px; height: 103px; box-sizing: border-box; ' +
      'transform: translate(0px, 18.3px);'
    );
  });

  it('applyBox con coordenada fuera de la rejilla pone translate', () => {
    const el = { style: {} };
    applyBox(el, { x: 380, y: 121.6, w: 375, h: 103 });
    assert.equal(el.style.left, '380px');
    assert.equal(el.style.top, '0px');
    assert.equal(el.style.transform, 'translate(0px, 121.6px)');
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
