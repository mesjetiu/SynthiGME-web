/**
 * Tests para SGME_Oscillator — UI del oscilador
 * 
 * Verifica la creación de DOM, serialize/deserialize,
 * constantes de escala y colores, y el switch HI/LO.
 * 
 * @module tests/ui/sgmeOscillator.test
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

const { SGME_Oscillator } = await import('../../src/assets/js/ui/sgmeOscillator.js');

describe('SGME_Oscillator - Constructor', () => {

  it('tiene valores por defecto sensatos', () => {
    const osc = new SGME_Oscillator();
    assert.strictEqual(osc.title, 'Oscillator');
    assert.strictEqual(osc.rangeState, 'hi');
    assert.strictEqual(osc.knobs.length, 0); // hasta que se llame createElement
  });

  it('acepta opciones personalizadas', () => {
    const osc = new SGME_Oscillator({
      id: 'osc-1',
      title: 'Osc 1',
      knobSize: 50
    });
    assert.strictEqual(osc.id, 'osc-1');
    assert.strictEqual(osc.title, 'Osc 1');
    assert.strictEqual(osc.knobSize, 50);
  });
});

describe('SGME_Oscillator - createElement()', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('crea elemento con clase sgme-osc', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    assert.ok(el.classList.contains('sgme-osc'));
    assert.strictEqual(el.id, 'osc-test');
  });

  it('crea 7 knobs (uno por parámetro del oscilador)', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    osc.createElement();
    assert.strictEqual(osc.knobs.length, 7);
  });

  it('crea header con el título', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test', title: 'Oscillator 3' });
    const el = osc.createElement();
    const header = el.querySelector('.sgme-osc__header');
    assert.ok(header);
    assert.strictEqual(header.textContent, 'Oscillator 3');
  });

  it('crea labels para cada knob', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    const labels = el.querySelector('.sgme-osc__labels');
    assert.ok(labels);
    const spans = labels.querySelectorAll('span');
    assert.strictEqual(spans.length, 7);
    // Primer label es "Pulse level"
    assert.strictEqual(spans[0].textContent, 'Pulse level');
    // Último label es "Frequency"
    assert.strictEqual(spans[6].textContent, 'Frequency');
  });

  it('crea switch de rango HI/LO', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    document.body.appendChild(el);
    const switchEl = el.querySelector('.output-channel__switch');
    assert.ok(switchEl, 'debe tener switch de rango');
  });

  it('knobs bipolares (shape, symmetry) usan SVG centrado en 0', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    const rings = el.querySelectorAll('.knob-svg-ring');
    // Índice 1 (pulse shape) y 3 (sine symmetry) deben usar knob-0-center.svg
    assert.ok(rings[1].src.includes('knob-0-center'), 'Pulse shape debe usar SVG bipolar');
    assert.ok(rings[3].src.includes('knob-0-center'), 'Sine symmetry debe usar SVG bipolar');
    // Los demás usan knob.svg
    assert.ok(!rings[0].src.includes('knob-0-center'), 'Pulse level usa SVG normal');
    assert.ok(!rings[6].src.includes('knob-0-center'), 'Frequency usa SVG normal');
  });

  it('cada knob tiene centro de color del Synthi 100', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    const centers = el.querySelectorAll('.knob-center');
    assert.strictEqual(centers.length, 7);
    // Todos deben tener --knob-center-color definido
    centers.forEach((center, idx) => {
      const color = center.style.getPropertyValue('--knob-center-color');
      assert.ok(color, `knob ${idx} debe tener color de centro`);
    });
  });
});

describe('SGME_Oscillator - serialize()', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('retorna objeto con knobs (array) y rangeState', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    osc.createElement();
    const data = osc.serialize();
    assert.ok(Array.isArray(data.knobs), 'knobs debe ser array');
    assert.strictEqual(data.knobs.length, 7, 'debe tener 7 valores de knob');
    assert.ok(data.rangeState === 'hi' || data.rangeState === 'lo');
  });

  it('knobs son todos números', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    osc.createElement();
    const data = osc.serialize();
    for (const val of data.knobs) {
      assert.strictEqual(typeof val, 'number');
    }
  });
});

describe('SGME_Oscillator - deserialize()', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('restaura rangeState', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    document.body.appendChild(el);
    assert.strictEqual(osc.rangeState, 'hi');
    osc.deserialize({ rangeState: 'lo', knobs: [] });
    assert.strictEqual(osc.rangeState, 'lo');
  });

  it('restaura valores de knobs', () => {
    const osc = new SGME_Oscillator({
      id: 'osc-test',
      knobRange: { min: 0, max: 1, initial: 0, pixelsForFullRange: 150 }
    });
    const el = osc.createElement();
    document.body.appendChild(el);
    const testValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    osc.deserialize({ knobs: testValues, rangeState: 'hi' });
    for (let i = 0; i < 7; i++) {
      assert.ok(
        Math.abs(osc.knobs[i].getValue() - testValues[i]) < 0.01,
        `knob ${i} debería ser ~${testValues[i]}`
      );
    }
  });

  it('aplica rangeState ANTES de knobs', () => {
    let rangeAtFreqChange = null;
    const osc = new SGME_Oscillator({
      id: 'osc-test',
      knobRange: { min: 0, max: 1, initial: 0, pixelsForFullRange: 150 },
      knobOptions: Array.from({ length: 7 }, (_, i) => {
        if (i === 6) {
          return {
            onChange: () => { rangeAtFreqChange = osc.rangeState; }
          };
        }
        return {};
      })
    });
    const el = osc.createElement();
    document.body.appendChild(el);
    osc.deserialize({ rangeState: 'lo', knobs: [0, 0, 0, 0, 0, 0, 0.5] });
    // Cuando el knob de frequency recibió setValue, rangeState ya debía ser 'lo'
    assert.strictEqual(rangeAtFreqChange, 'lo',
      'rangeState debe aplicarse ANTES de los knobs');
  });

  it('serialize-deserialize roundtrip mantiene estado', () => {
    const osc = new SGME_Oscillator({
      id: 'osc-test',
      knobRange: { min: 0, max: 1, initial: 0, pixelsForFullRange: 150 }
    });
    const el = osc.createElement();
    document.body.appendChild(el);
    // Cambiar algunos valores
    osc.knobs[0].setValue(0.3);
    osc.knobs[6].setValue(0.8);
    osc.rangeState = 'lo';
    
    const data = osc.serialize();

    // Crear nueva instancia y restaurar
    const osc2 = new SGME_Oscillator({
      id: 'osc-test-2',
      knobRange: { min: 0, max: 1, initial: 0, pixelsForFullRange: 150 }
    });
    const el2 = osc2.createElement();
    document.body.appendChild(el2);
    osc2.deserialize(data);
    
    assert.strictEqual(osc2.rangeState, 'lo');
    assert.ok(Math.abs(osc2.knobs[0].getValue() - 0.3) < 0.01);
    assert.ok(Math.abs(osc2.knobs[6].getValue() - 0.8) < 0.01);
  });

  it('deserialize con null no lanza error', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    osc.createElement();
    osc.deserialize(null);
    assert.ok(true, 'No lanza excepción');
  });

  it('ignora rangeState inválido', () => {
    const osc = new SGME_Oscillator({ id: 'osc-test' });
    const el = osc.createElement();
    document.body.appendChild(el);
    osc.deserialize({ rangeState: 'invalid' });
    assert.strictEqual(osc.rangeState, 'hi', 'debe mantener estado original');
  });
});
