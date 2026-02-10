/**
 * Tests para ModuleFrame - Marco reutilizable de módulos
 * 
 * Verifica:
 * - Creación de elementos DOM con estructura correcta
 * - Aplicación de clases CSS (synth-module + className)
 * - Tamaño fijo vía size { width, height }
 * - Header condicional (showHeader / title)
 * - Áreas de contenido, controles y header
 * - Métodos appendTo* 
 * 
 * @version 1.0.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Setup DOM antes de importar ModuleFrame
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;

import { ModuleFrame } from '../../src/assets/js/ui/moduleFrame.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE CREACIÓN BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Creación básica', () => {

  it('createElement() devuelve un div', () => {
    const frame = new ModuleFrame({ id: 'test-1', title: 'Test' });
    const el = frame.createElement();
    assert.strictEqual(el.tagName, 'DIV');
  });

  it('aplica clase base synth-module', () => {
    const frame = new ModuleFrame({ id: 'test-2', title: 'Test' });
    const el = frame.createElement();
    assert.ok(el.classList.contains('synth-module'), 'debe tener clase synth-module');
  });

  it('aplica className adicional', () => {
    const frame = new ModuleFrame({ id: 'test-3', title: 'Test', className: 'panel7-placeholder' });
    const el = frame.createElement();
    assert.ok(el.classList.contains('synth-module'), 'debe tener synth-module');
    assert.ok(el.classList.contains('panel7-placeholder'), 'debe tener className adicional');
  });

  it('establece el id del elemento', () => {
    const frame = new ModuleFrame({ id: 'my-module', title: 'Test' });
    const el = frame.createElement();
    assert.strictEqual(el.id, 'my-module');
  });

  it('genera id automático si no se proporciona', () => {
    const frame = new ModuleFrame({ title: 'Test' });
    const el = frame.createElement();
    assert.ok(el.id.startsWith('module-'), 'debe generar id con prefijo module-');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE TAMAÑO (size)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Size', () => {

  it('aplica width y height cuando se pasa size', () => {
    const frame = new ModuleFrame({ id: 'sized', title: 'Test', size: { width: 160, height: 180 } });
    const el = frame.createElement();
    assert.strictEqual(el.style.width, '160px');
    assert.strictEqual(el.style.height, '180px');
  });

  it('no establece width/height si size es null', () => {
    const frame = new ModuleFrame({ id: 'unsized', title: 'Test' });
    const el = frame.createElement();
    assert.strictEqual(el.style.width, '');
    assert.strictEqual(el.style.height, '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE HEADER
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Header', () => {

  it('crea header cuando se pasa title', () => {
    const frame = new ModuleFrame({ id: 'h1', title: 'Joystick Left' });
    frame.createElement();
    assert.ok(frame.headerArea, 'headerArea debe existir');
    assert.strictEqual(frame.headerArea.textContent, 'Joystick Left');
    assert.ok(frame.headerArea.classList.contains('synth-module__header'));
  });

  it('no crea header si title es null', () => {
    const frame = new ModuleFrame({ id: 'h2' });
    frame.createElement();
    assert.strictEqual(frame.headerArea, null, 'headerArea debe ser null sin title');
  });

  it('no crea header si showHeader es false', () => {
    const frame = new ModuleFrame({ id: 'h3', title: 'Test', showHeader: false });
    frame.createElement();
    assert.strictEqual(frame.headerArea, null, 'headerArea debe ser null con showHeader=false');
  });

  it('crea header si showHeader es true (explícito)', () => {
    const frame = new ModuleFrame({ id: 'h4', title: 'Test', showHeader: true });
    frame.createElement();
    assert.ok(frame.headerArea, 'headerArea debe existir con showHeader=true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ÁREAS INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Áreas internas', () => {

  it('siempre crea contentArea', () => {
    const frame = new ModuleFrame({ id: 'a1', title: 'Test' });
    frame.createElement();
    assert.ok(frame.contentArea, 'contentArea debe existir');
    assert.ok(frame.contentArea.classList.contains('synth-module__content'));
  });

  it('siempre crea controlsArea', () => {
    const frame = new ModuleFrame({ id: 'a2', title: 'Test' });
    frame.createElement();
    assert.ok(frame.controlsArea, 'controlsArea debe existir');
    assert.ok(frame.controlsArea.classList.contains('synth-module__controls'));
  });

  it('estructura DOM: header → content → controls (en ese orden)', () => {
    const frame = new ModuleFrame({ id: 'a3', title: 'Test' });
    const el = frame.createElement();
    const children = [...el.children];
    
    assert.strictEqual(children.length, 3, 'debe tener 3 hijos (header, content, controls)');
    assert.ok(children[0].classList.contains('synth-module__header'));
    assert.ok(children[1].classList.contains('synth-module__content'));
    assert.ok(children[2].classList.contains('synth-module__controls'));
  });

  it('sin header: content → controls (2 hijos)', () => {
    const frame = new ModuleFrame({ id: 'a4' });
    const el = frame.createElement();
    const children = [...el.children];
    
    assert.strictEqual(children.length, 2, 'debe tener 2 hijos (content, controls)');
    assert.ok(children[0].classList.contains('synth-module__content'));
    assert.ok(children[1].classList.contains('synth-module__controls'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÉTODOS appendTo*
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Métodos appendTo*', () => {

  it('appendToContent() añade al área de contenido', () => {
    const frame = new ModuleFrame({ id: 'ap1', title: 'Test' });
    frame.createElement();
    const child = document.createElement('span');
    child.textContent = 'test content';
    frame.appendToContent(child);
    assert.strictEqual(frame.contentArea.children.length, 1);
    assert.strictEqual(frame.contentArea.children[0], child);
  });

  it('appendToControls() añade al área de controles', () => {
    const frame = new ModuleFrame({ id: 'ap2', title: 'Test' });
    frame.createElement();
    const child = document.createElement('button');
    frame.appendToControls(child);
    assert.strictEqual(frame.controlsArea.children.length, 1);
    assert.strictEqual(frame.controlsArea.children[0], child);
  });

  it('appendToHeader() añade al header', () => {
    const frame = new ModuleFrame({ id: 'ap3', title: 'Test' });
    frame.createElement();
    const badge = document.createElement('span');
    frame.appendToHeader(badge);
    // Header tiene texto + badge
    assert.ok(frame.headerArea.contains(badge));
  });

  it('appendToHeader() no falla si no hay header', () => {
    const frame = new ModuleFrame({ id: 'ap4' });
    frame.createElement();
    const badge = document.createElement('span');
    // No debe lanzar error
    frame.appendToHeader(badge);
    assert.strictEqual(frame.headerArea, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE GETTERS
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Getters', () => {

  it('getContentArea() devuelve contentArea', () => {
    const frame = new ModuleFrame({ id: 'g1', title: 'Test' });
    frame.createElement();
    assert.strictEqual(frame.getContentArea(), frame.contentArea);
  });

  it('getControlsArea() devuelve controlsArea', () => {
    const frame = new ModuleFrame({ id: 'g2', title: 'Test' });
    frame.createElement();
    assert.strictEqual(frame.getControlsArea(), frame.controlsArea);
  });

  it('getHeaderArea() devuelve headerArea', () => {
    const frame = new ModuleFrame({ id: 'g3', title: 'Test' });
    frame.createElement();
    assert.strictEqual(frame.getHeaderArea(), frame.headerArea);
  });

  it('getHeaderArea() devuelve null sin header', () => {
    const frame = new ModuleFrame({ id: 'g4' });
    frame.createElement();
    assert.strictEqual(frame.getHeaderArea(), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE USO EN PANEL 7 (escenarios reales)
// ─────────────────────────────────────────────────────────────────────────────

describe('ModuleFrame - Escenarios Panel 7', () => {

  it('crea placeholder de Joystick Left con tamaño fijo', () => {
    const frame = new ModuleFrame({
      id: 'joystick-left',
      title: 'Joystick Left',
      className: 'panel7-placeholder',
      size: { width: 160, height: 180 }
    });
    const el = frame.createElement();

    assert.strictEqual(el.id, 'joystick-left');
    assert.ok(el.classList.contains('panel7-placeholder'));
    assert.strictEqual(el.style.width, '160px');
    assert.strictEqual(el.style.height, '180px');
    assert.strictEqual(frame.headerArea.textContent, 'Joystick Left');
  });

  it('crea placeholder de Sequencer con tamaño mayor', () => {
    const frame = new ModuleFrame({
      id: 'sequencer-control',
      title: 'Sequencer',
      className: 'panel7-placeholder',
      size: { width: 420, height: 180 }
    });
    const el = frame.createElement();

    assert.strictEqual(el.style.width, '420px');
    assert.strictEqual(frame.headerArea.textContent, 'Sequencer');
  });

  it('output channel module (sin tamaño fijo, clase diferente)', () => {
    const frame = new ModuleFrame({
      id: 'output-channel-1',
      title: 'Out 1',
      className: 'output-channel-module'
    });
    const el = frame.createElement();

    assert.ok(el.classList.contains('output-channel-module'));
    assert.strictEqual(el.style.width, '', 'sin size, no debe tener width');
  });
});
