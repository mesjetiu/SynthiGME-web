/**
 * Tests para RotarySwitch — selector rotativo rasterizado de 2 posiciones.
 *
 * Verifica creación de DOM, labels, estado, intercambio de PNG y callbacks.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { RotarySwitch } = await import('../../src/assets/js/ui/rotarySwitch.js');

describe('RotarySwitch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('usa estado inicial "a" por defecto', () => {
    const sw = new RotarySwitch({ labelA: 'ON', labelB: 'KBD' });
    assert.equal(sw.getState(), 'a');
    assert.equal(sw.getLabel(), 'ON');
  });

  it('crea la estructura DOM esperada con labels e imagen raster', () => {
    const sw = new RotarySwitch({ id: 'retrigger', labelA: 'ON', labelB: 'KBD' });
    const el = sw.createElement();

    assert.equal(el.id, 'retrigger');
    assert.ok(el.classList.contains('rotary-switch'));
    assert.equal(el.querySelector('.rotary-switch__label-a')?.textContent, 'ON');
    assert.equal(el.querySelector('.rotary-switch__label-b')?.textContent, 'KBD');

    const img = el.querySelector('.rotary-raster-graphic');
    assert.ok(img, 'debe crear imagen raster');
    assert.match(img.src, /assets\/knobs\/rotary-a\.png$/);
  });

  it('toggle intercambia estado, label e imagen PNG', () => {
    const sw = new RotarySwitch({ labelA: 'ON', labelB: 'KBD' });
    const el = sw.createElement();
    document.body.appendChild(el);

    sw.toggle();

    assert.equal(sw.getState(), 'b');
    assert.equal(sw.getLabel(), 'KBD');
    assert.equal(el.getAttribute('data-state'), 'b');
    assert.ok(el.classList.contains('is-b'));
    assert.match(el.querySelector('.rotary-raster-graphic').src, /assets\/knobs\/rotary-b\.png$/);
  });

  it('llama onChange con estado y label al alternar', () => {
    const calls = [];
    const sw = new RotarySwitch({
      labelA: 'ON',
      labelB: 'KBD',
      onChange: (state, label) => calls.push({ state, label })
    });
    sw.createElement();

    sw.toggle();

    assert.deepEqual(calls, [{ state: 'b', label: 'KBD' }]);
  });

  it('setState ignora estados inválidos y actualiza el PNG en estados válidos', () => {
    const sw = new RotarySwitch({ labelA: 'ON', labelB: 'KBD' });
    const el = sw.createElement();
    sw.setState('x');
    assert.equal(sw.getState(), 'a');

    sw.setState('b');
    assert.equal(sw.getState(), 'b');
    assert.match(el.querySelector('.rotary-raster-graphic').src, /assets\/knobs\/rotary-b\.png$/);
  });
});