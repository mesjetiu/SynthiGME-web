/**
 * Tests para contextMenuManager
 *
 * Cobertura de cierre robusto del menú contextual:
 * - Escape
 * - pointerdown fuera del menú (captura)
 *
 * Y la posición: que el menú no se salga de la ventana ni quede con top
 * negativo cuando es más alto que la pantalla (móvil).
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

// Esperar a que todos los timers pendientes se ejecuten.
// showContextMenu usa setTimeout(cb, closeDelay) para registrar listeners de cierre.
// En JSDOM, 'ontouchstart' in window === true → closeDelay = 300ms (rama táctil).
// Necesitamos esperar más de 300ms para que los listeners estén registrados.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CLOSE_LISTENER_DELAY = 350; // > 300ms del setTimeout interno de showContextMenu en modo touch

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

    await wait(CLOSE_LISTENER_DELAY);
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

    await wait(CLOSE_LISTENER_DELAY);
    outside.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));

    assert.strictEqual(document.querySelector('.pip-context-menu'), null,
      'menú debe cerrarse al pointerdown fuera');
  });
});

// ─── Posición dentro de la ventana ───────────────────────────────────────────
//
// showContextMenu coloca el menú en (x, y) y, en el siguiente rAF, lo recoloca
// si se sale por la derecha o por abajo. JSDOM no mide nada
// (getBoundingClientRect devuelve ceros), así que se le da al menú un tamaño
// a mano antes de que corra ese rAF.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/assets/css/main.css');
const { VIEWPORT_MARGIN } = await import('../../src/assets/js/ui/contextMenuManager.js');

function openMenuOfSize({ x, y, width, height }) {
  const panel = document.createElement('div');
  panel.id = 'panel-1';
  panel.className = 'panel';
  document.body.appendChild(panel);
  showContextMenu({ x, y, panelId: 'panel-1', isPipped: false, target: panel });
  const menu = document.querySelector('.pip-context-menu');
  menu.getBoundingClientRect = () => {
    const left = parseFloat(menu.style.left);
    const top = parseFloat(menu.style.top);
    return { left, top, width, height, right: left + width, bottom: top + height };
  };
  return menu;
}

const px = v => parseFloat(v);

describe('ContextMenuManager - posición dentro de la ventana', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideContextMenu();
    window.innerWidth = 1200;
    window.innerHeight = 800;
  });

  it('si cabe, se queda donde se pidió', async () => {
    const menu = openMenuOfSize({ x: 100, y: 100, width: 200, height: 300 });
    await wait(10);
    assert.equal(px(menu.style.left), 100);
    assert.equal(px(menu.style.top), 100);
  });

  it('si se sale por abajo o por la derecha, se abre hacia arriba / hacia la izquierda', async () => {
    const menu = openMenuOfSize({ x: 1100, y: 700, width: 200, height: 300 });
    await wait(10);
    assert.equal(px(menu.style.left), 1100 - 200);
    assert.equal(px(menu.style.top), 700 - 300);
  });

  it('en una pantalla más baja que el menú, no queda con top negativo: se pega al margen', async () => {
    // Móvil apaisado: 360px de alto; el menú con módulo, control y MIDI mide más.
    window.innerHeight = 360;
    const menu = openMenuOfSize({ x: 50, y: 200, width: 200, height: 500 });
    await wait(10);
    assert.equal(px(menu.style.top), VIEWPORT_MARGIN,
      'antes quedaba en 200-500 = -300px y las primeras opciones eran inalcanzables');
    assert.ok(px(menu.style.top) >= 0);
  });

  it('lo mismo hacia la izquierda si el menú es más ancho que la ventana', async () => {
    window.innerWidth = 320;
    const menu = openMenuOfSize({ x: 300, y: 10, width: 400, height: 100 });
    await wait(10);
    assert.equal(px(menu.style.left), VIEWPORT_MARGIN);
  });

  it('el CSS limita la altura al viewport con el mismo margen y da scroll (menú de pines y menú de paneles)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    const block = sel => {
      const m = css.match(new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{([^}]*)\\}'));
      assert.ok(m, `falta ${sel} en main.css`);
      return m[1];
    };

    const ctx = block('.pip-context-menu');
    assert.match(ctx, new RegExp(`max-height: calc\\(100dvh - ${2 * VIEWPORT_MARGIN}px\\)`),
      'el margen del CSS y VIEWPORT_MARGIN tienen que ir a juego');
    assert.match(ctx, /max-height: calc\(100vh - /, 'fallback en vh para navegadores sin dvh');
    assert.match(ctx, /overflow-y: auto/);

    // El desplegable de paneles flotantes de la barra cuelga de la barra superior.
    const pipMenu = block('.pip-menu');
    assert.match(pipMenu, /max-height: calc\(100dvh - \d+px - env\(safe-area-inset-top/);
    assert.match(pipMenu, /overflow-y: auto/);
  });
});
