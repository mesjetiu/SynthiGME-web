/**
 * Tests para Toggle — switch de dos estados reutilizable
 * 
 * Verifica la lógica de estados, creación de DOM,
 * callbacks y rendering.
 * 
 * @module tests/ui/toggle.test
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

const { Toggle } = await import('../../src/assets/js/ui/toggle.js');

describe('Toggle - Constructor y valores por defecto', () => {

  it('estado inicial por defecto es "a"', () => {
    const t = new Toggle({ id: 'test-toggle', labelA: 'HI', labelB: 'LO' });
    assert.strictEqual(t.getState(), 'a');
  });

  it('acepta estado inicial "b"', () => {
    const t = new Toggle({ id: 'test-toggle', labelA: 'HI', labelB: 'LO', initial: 'b' });
    assert.strictEqual(t.getState(), 'b');
  });

  it('getLabel retorna label del estado actual', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    assert.strictEqual(t.getLabel(), 'HI');
  });

  it('getLabel retorna labelB cuando estado es "b"', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO', initial: 'b' });
    assert.strictEqual(t.getLabel(), 'LO');
  });

  it('usa labels por defecto "A" y "B" si no se proporcionan', () => {
    const t = new Toggle({});
    assert.strictEqual(t.labelA, 'A');
    assert.strictEqual(t.labelB, 'B');
  });
});

describe('Toggle - toggle()', () => {

  it('alterna de "a" a "b"', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    t.createElement();
    const newState = t.toggle();
    assert.strictEqual(newState, 'b');
    assert.strictEqual(t.getState(), 'b');
  });

  it('alterna de "b" a "a"', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO', initial: 'b' });
    t.createElement();
    const newState = t.toggle();
    assert.strictEqual(newState, 'a');
    assert.strictEqual(t.getState(), 'a');
  });

  it('llama onChange con estado y label', () => {
    let receivedState = null;
    let receivedLabel = null;
    const t = new Toggle({
      labelA: 'HI', labelB: 'LO',
      onChange: (state, label) => {
        receivedState = state;
        receivedLabel = label;
      }
    });
    t.createElement();
    t.toggle();
    assert.strictEqual(receivedState, 'b');
    assert.strictEqual(receivedLabel, 'LO');
  });

  it('doble toggle vuelve al estado original', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    t.createElement();
    t.toggle();
    t.toggle();
    assert.strictEqual(t.getState(), 'a');
  });
});

describe('Toggle - setState()', () => {

  it('cambia estado a "b"', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    t.createElement();
    t.setState('b');
    assert.strictEqual(t.getState(), 'b');
  });

  it('no cambia si ya está en el estado pedido', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    t.createElement();
    t.setState('a'); // ya está en 'a'
    assert.strictEqual(t.getState(), 'a');
  });

  it('ignora estados inválidos', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    t.createElement();
    t.setState('x');
    assert.strictEqual(t.getState(), 'a');
  });
});

describe('Toggle - createElement()', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('crea elemento con clase synth-toggle', () => {
    const t = new Toggle({ id: 'my-toggle', labelA: 'HI', labelB: 'LO' });
    const el = t.createElement();
    assert.ok(el.classList.contains('synth-toggle'));
  });

  it('aplica el ID proporcionado', () => {
    const t = new Toggle({ id: 'my-toggle', labelA: 'HI', labelB: 'LO' });
    const el = t.createElement();
    assert.strictEqual(el.id, 'my-toggle');
  });

  it('contiene labels A y B', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    const el = t.createElement();
    const labelA = el.querySelector('.synth-toggle__label-a');
    const labelB = el.querySelector('.synth-toggle__label-b');
    assert.ok(labelA, 'debe tener label A');
    assert.ok(labelB, 'debe tener label B');
    assert.strictEqual(labelA.textContent, 'HI');
    assert.strictEqual(labelB.textContent, 'LO');
  });

  it('contiene track y thumb', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO' });
    const el = t.createElement();
    assert.ok(el.querySelector('.synth-toggle__track'), 'debe tener track');
    assert.ok(el.querySelector('.synth-toggle__thumb'), 'debe tener thumb');
  });

  it('aplica data-state según estado inicial', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO', initial: 'b' });
    const el = t.createElement();
    assert.strictEqual(el.getAttribute('data-state'), 'b');
    assert.ok(el.classList.contains('is-b'));
  });

  it('estado "a" no tiene clase is-b', () => {
    const t = new Toggle({ labelA: 'HI', labelB: 'LO', initial: 'a' });
    const el = t.createElement();
    assert.ok(!el.classList.contains('is-b'));
    assert.strictEqual(el.getAttribute('data-state'), 'a');
  });
});
