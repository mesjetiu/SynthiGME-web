/**
 * Tests para knobFactory — factory de elementos DOM de knobs
 * 
 * Verifica la creación de estructura DOM, clases CSS y propiedades
 * según las opciones proporcionadas.
 * 
 * @module tests/ui/knobFactory.test
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

const { createKnobElements, createKnob } = await import('../../src/assets/js/ui/knobFactory.js');

// ═══════════════════════════════════════════════════════════════════════════
// createKnobElements
// ═══════════════════════════════════════════════════════════════════════════

describe('createKnobElements', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('crea wrapper, knobEl e inner por defecto', () => {
    const { wrapper, knobEl, inner } = createKnobElements();
    assert.ok(wrapper, 'debe crear wrapper');
    assert.ok(knobEl, 'debe crear knobEl');
    assert.ok(inner, 'debe crear inner');
  });

  it('wrapper tiene clase knob-wrapper', () => {
    const { wrapper } = createKnobElements();
    assert.ok(wrapper.classList.contains('knob-wrapper'));
  });

  it('knobEl tiene clases knob y knob--svg', () => {
    const { knobEl } = createKnobElements();
    assert.ok(knobEl.classList.contains('knob'));
    assert.ok(knobEl.classList.contains('knob--svg'));
  });

  it('inner tiene clase knob-inner y contiene img.knob-svg-ring', () => {
    const { inner } = createKnobElements();
    assert.ok(inner.classList.contains('knob-inner'));
    const img = inner.querySelector('img.knob-svg-ring');
    assert.ok(img, 'inner debe contener img.knob-svg-ring');
    assert.strictEqual(img.src, 'assets/knobs/knob.svg');
  });

  it('aplica size class cuando se proporciona', () => {
    const { knobEl } = createKnobElements({ size: 'sm' });
    assert.ok(knobEl.classList.contains('knob--sm'));
  });

  it('no añade size class cuando size es vacío', () => {
    const { knobEl } = createKnobElements({ size: '' });
    assert.ok(!knobEl.classList.contains('knob--'));
  });

  it('aplica className adicional al wrapper', () => {
    const { wrapper } = createKnobElements({ className: 'my-custom' });
    assert.ok(wrapper.classList.contains('my-custom'));
    assert.ok(wrapper.classList.contains('knob-wrapper'));
  });

  it('crea label cuando se proporciona', () => {
    const { labelEl } = createKnobElements({ label: 'Freq' });
    assert.ok(labelEl, 'debe crear labelEl');
    assert.strictEqual(labelEl.textContent, 'Freq');
    assert.ok(labelEl.classList.contains('knob-label'));
  });

  it('no crea label cuando no se proporciona', () => {
    const result = createKnobElements();
    assert.strictEqual(result.labelEl, undefined);
  });

  it('crea valueEl cuando showValue=true', () => {
    const { valueEl } = createKnobElements({ showValue: true });
    assert.ok(valueEl, 'debe crear valueEl');
    assert.ok(valueEl.classList.contains('knob-value'));
  });

  it('no crea valueEl cuando showValue=false (default)', () => {
    const result = createKnobElements();
    assert.strictEqual(result.valueEl, undefined);
  });

  it('aplica centerColor como CSS custom property', () => {
    const { knobEl } = createKnobElements({ centerColor: '#FF0000' });
    const center = knobEl.querySelector('.knob-center');
    assert.ok(center, 'debe crear knob-center');
    assert.strictEqual(
      center.style.getPropertyValue('--knob-center-color'),
      '#FF0000'
    );
  });

  it('no aplica centerColor cuando no se proporciona', () => {
    const { knobEl } = createKnobElements();
    const center = knobEl.querySelector('.knob-center');
    assert.ok(center, 'debe crear knob-center');
    assert.strictEqual(center.style.getPropertyValue('--knob-center-color'), '');
  });

  it('usa svgSrc personalizado', () => {
    const { inner } = createKnobElements({ svgSrc: 'assets/knobs/custom.svg' });
    const img = inner.querySelector('img');
    assert.strictEqual(img.src, 'assets/knobs/custom.svg');
  });

  it('la estructura DOM es wrapper > knobEl > [inner, center]', () => {
    const { wrapper, knobEl, inner } = createKnobElements();
    assert.strictEqual(knobEl.parentElement, wrapper);
    assert.strictEqual(inner.parentElement, knobEl);
    const center = knobEl.querySelector('.knob-center');
    assert.strictEqual(center.parentElement, knobEl);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createKnob
// ═══════════════════════════════════════════════════════════════════════════

describe('createKnob', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('retorna knobInstance junto con elementos DOM', () => {
    const result = createKnob({ label: 'Vol' });
    assert.ok(result.wrapper, 'debe tener wrapper');
    assert.ok(result.knobEl, 'debe tener knobEl');
    assert.ok(result.knobInstance, 'debe tener knobInstance');
  });

  it('knobInstance responde a getValue/setValue', () => {
    const { knobInstance } = createKnob({ min: 0, max: 1, initial: 0.5 });
    assert.strictEqual(typeof knobInstance.getValue, 'function');
    assert.strictEqual(typeof knobInstance.setValue, 'function');
    // getValue debería retornar el valor inicial
    const val = knobInstance.getValue();
    assert.ok(typeof val === 'number', 'getValue debe retornar número');
  });

  it('showValue es true por defecto en createKnob', () => {
    const result = createKnob();
    assert.ok(result.valueEl, 'createKnob debe crear valueEl por defecto');
  });

  it('pasa onChange al knobInstance', () => {
    let called = false;
    const { knobInstance } = createKnob({
      min: 0, max: 1, initial: 0,
      onChange: () => { called = true; }
    });
    knobInstance.setValue(0.5);
    assert.ok(called, 'onChange debe ser llamado al cambiar valor');
  });
});
