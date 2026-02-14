/**
 * Tests para contextMenuManager
 *
 * Cobertura de cierre robusto del menú contextual:
 * - Escape
 * - pointerdown fuera del menú (captura)
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

global.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

const { showContextMenu, hideContextMenu } = await import('../../src/assets/js/ui/contextMenuManager.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ContextMenuManager - cierre del menú', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideContextMenu();
  });

  it('cierra al pulsar Escape', async () => {
    const panel = document.createElement('div');
    panel.id = 'panel-1';
    panel.className = 'panel';
    document.body.appendChild(panel);

    showContextMenu({
      x: 20,
      y: 20,
      panelId: 'panel-1',
      isPipped: true,
      target: panel,
      onDetach: () => {},
      onAttach: () => {}
    });

    assert.ok(document.querySelector('.pip-context-menu'), 'menú debe estar visible');

    await wait(20);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    assert.strictEqual(document.querySelector('.pip-context-menu'), null, 'menú debe cerrarse con Escape');
  });

  it('cierra al hacer pointerdown fuera', async () => {
    const panel = document.createElement('div');
    panel.id = 'panel-1';
    panel.className = 'panel';
    document.body.appendChild(panel);

    const outside = document.createElement('div');
    outside.className = 'outside-click-target';
    document.body.appendChild(outside);

    showContextMenu({
      x: 30,
      y: 30,
      panelId: 'panel-1',
      isPipped: false,
      target: panel,
      onDetach: () => {},
      onAttach: () => {}
    });

    assert.ok(document.querySelector('.pip-context-menu'), 'menú debe estar visible');

    await wait(20);
    outside.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));

    assert.strictEqual(document.querySelector('.pip-context-menu'), null,
      'menú debe cerrarse al pointerdown fuera');
  });
});
