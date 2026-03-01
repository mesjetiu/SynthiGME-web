/**
 * Tests para ModuleUI — clase base para módulos con knobs
 * 
 * Verifica la creación de DOM, serialización/deserialización
 * y configuración de layout (gap, offsets).
 * 
 * @module tests/ui/moduleUI.test
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

const { ModuleUI } = await import('../../src/assets/js/ui/moduleUI.js');

const KNOB_DEFS = [
  { key: 'param1', label: 'Param 1' },
  { key: 'param2', label: 'Param 2' },
  { key: 'param3', label: 'Param 3' }
];

describe('ModuleUI - Constructor y valores por defecto', () => {

  it('tiene valores por defecto sensatos', () => {
    const m = new ModuleUI();
    assert.strictEqual(m.id, 'module');
    assert.strictEqual(m.title, 'Module');
    assert.strictEqual(m.cssClass, 'module-ui');
    assert.deepStrictEqual(m.knobDefs, []);
    assert.strictEqual(m.knobSize, 40);
  });

  it('acepta opciones personalizadas', () => {
    const m = new ModuleUI({
      id: 'noise-1',
      title: 'Noise Generator',
      cssClass: 'noise-generator',
      knobDefs: KNOB_DEFS,
      knobSize: 50
    });
    assert.strictEqual(m.id, 'noise-1');
    assert.strictEqual(m.title, 'Noise Generator');
    assert.strictEqual(m.cssClass, 'noise-generator');
    assert.strictEqual(m.knobDefs.length, 3);
    assert.strictEqual(m.knobSize, 50);
  });

  it('knobGap numérico se convierte a array uniforme', () => {
    const m = new ModuleUI({ knobDefs: KNOB_DEFS, knobGap: 12 });
    assert.ok(Array.isArray(m.knobGap));
    assert.strictEqual(m.knobGap.length, 2); // N-1 gaps para 3 knobs
    assert.strictEqual(m.knobGap[0], 12);
    assert.strictEqual(m.knobGap[1], 12);
  });

  it('knobGap array se usa directamente', () => {
    const m = new ModuleUI({ knobDefs: KNOB_DEFS, knobGap: [5, 10] });
    assert.deepStrictEqual(m.knobGap, [5, 10]);
  });
});

describe('ModuleUI - createElement()', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('crea elemento con ID y clase CSS correctos', () => {
    const m = new ModuleUI({
      id: 'my-module',
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS
    });
    const el = m.createElement();
    assert.strictEqual(el.id, 'my-module');
    assert.ok(el.classList.contains('test-module'));
  });

  it('crea header con título', () => {
    const m = new ModuleUI({
      title: 'My Title',
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS
    });
    const el = m.createElement();
    const header = el.querySelector('.test-module__header');
    assert.ok(header, 'debe crear header');
    assert.strictEqual(header.textContent, 'My Title');
  });

  it('crea un shell por cada knobDef', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS
    });
    const el = m.createElement();
    const shells = el.querySelectorAll('.test-module__knob-shell');
    assert.strictEqual(shells.length, 3);
  });

  it('cada shell tiene label, knob y value', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS
    });
    const el = m.createElement();
    const shells = el.querySelectorAll('.test-module__knob-shell');
    
    shells.forEach((shell, idx) => {
      const label = shell.querySelector('.test-module__knob-label');
      assert.ok(label, `shell ${idx} debe tener label`);
      assert.strictEqual(label.textContent, KNOB_DEFS[idx].label);
      
      const knob = shell.querySelector('.knob');
      assert.ok(knob, `shell ${idx} debe tener knob`);
      
      const value = shell.querySelector('.knob-value');
      assert.ok(value, `shell ${idx} debe tener value`);
    });
  });

  it('aplica CSS custom properties para tamaño', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobSize: 55,
      knobInnerPct: 80
    });
    const el = m.createElement();
    assert.strictEqual(el.style.getPropertyValue('--module-knob-size'), '55px');
    assert.strictEqual(el.style.getPropertyValue('--module-knob-inner-pct'), '80%');
  });

  it('aplica knobRowOffset como transform', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobRowOffsetX: 10,
      knobRowOffsetY: -5
    });
    const el = m.createElement();
    const knobsRow = el.querySelector('.test-module__knobs');
    assert.strictEqual(knobsRow.style.transform, 'translate(10px, -5px)');
  });

  it('aplica color de centro cuando knobDef tiene color', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'freq', label: 'Freq', color: '#FF0000' }]
    });
    const el = m.createElement();
    const center = el.querySelector('.knob-center');
    assert.strictEqual(
      center.style.getPropertyValue('--knob-center-color'),
      '#FF0000'
    );
  });
});

describe('ModuleUI - getValue / setValue', () => {

  it('getValue retorna valor del knob', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'vol', label: 'Vol' }],
      knobOptions: { vol: { initial: 0.5 } }
    });
    m.createElement();
    const val = m.getValue('vol');
    assert.ok(typeof val === 'number');
  });

  it('setValue cambia el valor del knob', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'vol', label: 'Vol' }],
      knobOptions: { vol: { min: 0, max: 1, initial: 0 } }
    });
    m.createElement();
    m.setValue('vol', 0.7);
    const val = m.getValue('vol');
    assert.ok(Math.abs(val - 0.7) < 0.01, `Valor debería ser ~0.7, es ${val}`);
  });

  it('getValue con clave inexistente retorna 0', () => {
    const m = new ModuleUI({ cssClass: 'test-module', knobDefs: [] });
    m.createElement();
    assert.strictEqual(m.getValue('noExiste'), 0);
  });
});

describe('ModuleUI - serialize / deserialize', () => {

  it('serialize retorna objeto clave-valor con todos los knobs', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobOptions: {
        param1: { initial: 0.3 },
        param2: { initial: 0.6 },
        param3: { initial: 0.9 }
      }
    });
    m.createElement();
    const data = m.serialize();
    assert.strictEqual(typeof data, 'object');
    assert.ok('param1' in data);
    assert.ok('param2' in data);
    assert.ok('param3' in data);
  });

  it('deserialize restaura valores de knobs', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobOptions: {
        param1: { min: 0, max: 1, initial: 0 },
        param2: { min: 0, max: 1, initial: 0 },
        param3: { min: 0, max: 1, initial: 0 }
      }
    });
    m.createElement();
    m.deserialize({ param1: 0.5, param2: 0.8, param3: 0.2 });
    assert.ok(Math.abs(m.getValue('param1') - 0.5) < 0.01);
    assert.ok(Math.abs(m.getValue('param2') - 0.8) < 0.01);
    assert.ok(Math.abs(m.getValue('param3') - 0.2) < 0.01);
  });

  it('serialize → deserialize roundtrip mantiene valores', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobOptions: {
        param1: { min: 0, max: 1, initial: 0.4 },
        param2: { min: 0, max: 1, initial: 0.7 },
        param3: { min: 0, max: 1, initial: 0.1 }
      }
    });
    m.createElement();
    const data = m.serialize();

    // Crear nueva instancia y deserializar
    const m2 = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: KNOB_DEFS,
      knobOptions: {
        param1: { min: 0, max: 1, initial: 0 },
        param2: { min: 0, max: 1, initial: 0 },
        param3: { min: 0, max: 1, initial: 0 }
      }
    });
    m2.createElement();
    m2.deserialize(data);

    for (const key of ['param1', 'param2', 'param3']) {
      assert.ok(
        Math.abs(m2.getValue(key) - data[key]) < 0.01,
        `roundtrip fallido para ${key}`
      );
    }
  });

  it('deserialize ignora null', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'vol', label: 'Vol' }]
    });
    m.createElement();
    m.deserialize(null); // no debe lanzar error
    assert.ok(true, 'No lanza excepción');
  });

  it('deserialize ignora claves inexistentes', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'vol', label: 'Vol' }]
    });
    m.createElement();
    m.deserialize({ noExiste: 0.5 }); // no debe lanzar
    assert.ok(true, 'No lanza excepción');
  });

  it('deserialize ignora valores no numéricos', () => {
    const m = new ModuleUI({
      cssClass: 'test-module',
      knobDefs: [{ key: 'vol', label: 'Vol' }],
      knobOptions: { vol: { min: 0, max: 1, initial: 0.3 } }
    });
    m.createElement();
    const before = m.getValue('vol');
    m.deserialize({ vol: 'hola' }); // no debe cambiar
    assert.ok(Math.abs(m.getValue('vol') - before) < 0.01);
  });
});
