/**
 * Tests para VernierKnob — knob multivuelta rasterizado.
 *
 * Cubre la estructura DOM raster, la ruta de creación manual con
 * `.vernier-svg-container` vacío y la actualización visual de rotor/contador.
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

const { createVernierElements, VernierKnob } = await import('../../src/assets/js/ui/vernierKnob.js');

describe('createVernierElements', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('crea rotor, anillo fijo y contador como DOM rasterizado', () => {
    const { wrapper, knobEl, svgContainer, valueEl, labelEl } = createVernierElements({
      label: 'Frequency',
      showValue: true
    });

    assert.ok(wrapper.classList.contains('knob-wrapper--vernier'));
    assert.ok(knobEl.classList.contains('knob--vernier'));
    assert.equal(labelEl.textContent, 'Frequency');
    assert.ok(valueEl, 'debe crear valueEl por defecto');
    assert.ok(svgContainer.querySelector('.vernier-rotor'));
    assert.ok(svgContainer.querySelector('.vernier-ring'));
    assert.equal(svgContainer.querySelector('.vernier-counter')?.textContent, '0');
  });

  it('no crea valueEl cuando showValue=false', () => {
    const result = createVernierElements({ showValue: false });
    assert.equal(result.valueEl, undefined);
  });
});

describe('VernierKnob', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('puebla un vernier-svg-container vacío en la ruta de creación manual', () => {
    const root = document.createElement('div');
    root.className = 'knob knob--vernier';
    const container = document.createElement('div');
    container.className = 'vernier-svg-container';
    root.appendChild(container);
    const valueEl = document.createElement('div');
    valueEl.className = 'knob-value';
    document.body.appendChild(root);
    document.body.appendChild(valueEl);

    const knob = new VernierKnob(root, {
      min: 0,
      max: 1,
      initial: 0,
      valueElement: valueEl,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1
    });

    assert.ok(root.querySelector('.vernier-rotor'), 'debe crear rotor raster');
    assert.ok(root.querySelector('.vernier-ring'), 'debe crear anillo raster');
    assert.ok(root.querySelector('.vernier-counter'), 'debe crear contador');
    assert.equal(knob._getRotatingEl(), root.querySelector('.vernier-rotor'));
  });

  it('actualiza la rotación del rotor y el contador según el valor', () => {
    const { knobEl, valueEl } = createVernierElements({ showValue: true });
    document.body.appendChild(knobEl);
    document.body.appendChild(valueEl);

    const knob = new VernierKnob(knobEl, {
      min: 0,
      max: 1,
      initial: 0,
      valueElement: valueEl,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1
    });

    knob.setValue(0.55);

    assert.match(knobEl.querySelector('.vernier-rotor').style.transform, /rotate\(1980deg\)/);
    assert.equal(knobEl.querySelector('.vernier-counter').textContent, '5');
    assert.equal(valueEl.textContent, '5.5');
  });

  it('muestra 10 en el contador al alcanzar el valor máximo', () => {
    const { knobEl } = createVernierElements({ showValue: false });
    document.body.appendChild(knobEl);
    const knob = new VernierKnob(knobEl, { min: 0, max: 1, initial: 1 });

    assert.equal(knobEl.querySelector('.vernier-counter').textContent, '10');
  });
});