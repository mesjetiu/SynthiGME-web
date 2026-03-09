/**
 * Tests funcionales de runtime para PipManager.
 *
 * Complementan los tests estáticos verificando el comportamiento real en JSDOM:
 * apertura/cierre, foco, locks, serialización, restauración y atajos básicos.
 */

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Node = dom.window.Node;

const storage = new Map();
global.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  }
};

Object.defineProperty(window, 'localStorage', { value: global.localStorage, configurable: true });
Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true });
Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true, writable: true });
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  })
});

Object.defineProperty(global, 'requestAnimationFrame', {
  configurable: true,
  value: (cb) => setTimeout(() => cb(performance.now()), 0)
});
Object.defineProperty(global, 'cancelAnimationFrame', {
  configurable: true,
  value: (id) => clearTimeout(id)
});

window.__synthNavState = {
  getMinScale: () => 0.4
};

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

let pip;
let pipLayerEl;

function definePanelMetrics(el, { left = 20, top = 20, width = 760, height = 760 } = {}) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => height });
  el.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  });
}

function resetDom() {
  document.body.innerHTML = '';
  if (pipLayerEl) {
    document.body.appendChild(pipLayerEl);
    pipLayerEl.innerHTML = '';
  }

  const viewportOuter = document.createElement('div');
  viewportOuter.id = 'viewportOuter';
  document.body.appendChild(viewportOuter);

  const grid = document.createElement('div');
  grid.id = 'panelGrid';
  viewportOuter.appendChild(grid);
  return { viewportOuter, grid };
}

function addPanel(grid, id, metrics = {}) {
  const panel = document.createElement('section');
  panel.id = id;
  panel.className = 'panel';
  panel.textContent = id;
  panel.style.setProperty('--panel-col', '1');
  panel.style.setProperty('--panel-row', '1');
  definePanelMetrics(panel, metrics);
  grid.appendChild(panel);
  return panel;
}

before(async () => {
  pip = await import('../../src/assets/js/ui/pipManager.js');
  pip.initPipManager();
  pipLayerEl = document.getElementById('pipLayer');
});

beforeEach(async () => {
  pip.closeAllPips();
  await tick(5);
  pip.clearPipState();
  localStorage.clear();
  resetDom();
});

after(async () => {
  if (pip) {
    pip.closeAllPips();
    await tick(250);
    pip.clearPipState();
  }
  localStorage.clear();
  dom.window.close();
});

describe('PipManager runtime funcional', () => {
  it('openPip extrae el panel y closePip lo devuelve al grid', async () => {
    const { grid } = resetDom();
    const panel = addPanel(grid, 'panel-1', { left: 50, top: 70, width: 760, height: 760 });

    pip.openPip('panel-1');
    await tick(5);

    assert.equal(pip.isPipped('panel-1'), true);
    assert.deepEqual(pip.getOpenPips(), ['panel-1']);
    assert.ok(document.getElementById('pip-placeholder-panel-1'));
    assert.ok(pipLayerEl.querySelector('.pip-container[data-panel-id="panel-1"]'));
    assert.ok(panel.classList.contains('panel--pipped'));

    pip.closePip('panel-1');
    await tick(5);

    assert.equal(pip.isPipped('panel-1'), false);
    assert.equal(document.getElementById('pip-placeholder-panel-1'), null);
    assert.equal(pipLayerEl.querySelector('.pip-container[data-panel-id="panel-1"]'), null);
    assert.equal(panel.parentElement, grid);
    assert.ok(!panel.classList.contains('panel--pipped'));
  });

  it('focus, locks y serialización funcionan sobre el PiP activo', async () => {
    const { grid } = resetDom();
    addPanel(grid, 'panel-1');

    pip.openPip('panel-1');
    await tick(5);

    assert.equal(pip.focusPip('panel-1'), true);
    assert.equal(pip.focusPip('panel-2'), false);
    assert.equal(pip.setFocusedPipPanLocked(true), true);
    assert.equal(pip.setFocusedPipZoomLocked(true), true);

    const lockState = pip.getFocusedPipLockState();
    assert.deepEqual(lockState, {
      panelId: 'panel-1',
      hasFocusedPip: true,
      panLocked: true,
      zoomLocked: true,
      locked: true
    });

    const [state] = pip.serializePipState();
    assert.equal(state.panelId, 'panel-1');
    assert.equal(state.panLocked, true);
    assert.equal(state.zoomLocked, true);
    assert.equal(state.locked, true);
    assert.ok(state.defaultWidth > 0);
    assert.ok(state.defaultHeight > 0);
  });

  it('el zoom externo no puede reducir el PiP por debajo de su tamaño de origen', async () => {
    const { grid } = resetDom();
    addPanel(grid, 'panel-1');

    pip.openPip('panel-1', {
      panelId: 'panel-1',
      x: 40,
      y: 40,
      width: 608,
      height: 608,
      scale: 0.8,
      defaultWidth: 304,
      defaultHeight: 304
    });
    await tick(5);

    for (let i = 0; i < 12; i += 1) {
      window.__synthZoomFocusedPip('out');
    }

    const [state] = window.__synthPipDebug.list();
    assert.equal(state.panelId, 'panel-1');
    assert.ok(state.width >= 304, `width final ${state.width} < 304`);
    assert.ok(state.height >= 304, `height final ${state.height} < 304`);
    assert.ok(state.scale >= 0.4, `scale final ${state.scale} < 0.4`);
  });

  it('el atajo 0 ajusta a cuadrado el PiP enfocado', async () => {
    const { grid } = resetDom();
    addPanel(grid, 'panel-1', { width: 760, height: 500 });

    pip.openPip('panel-1', {
      panelId: 'panel-1',
      x: 40,
      y: 40,
      width: 500,
      height: 330,
      scale: 0.65,
      defaultWidth: 304,
      defaultHeight: 200
    });
    await tick(5);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true }));
    await tick(5);

    const [state] = window.__synthPipDebug.list();
    assert.ok(Math.abs(state.width - state.height) <= 1, `${state.width}x${state.height} no es cuadrado`);
  });

  it('restorePipState reabre paneles y restituye locks guardados', async () => {
    const { grid } = resetDom();
    addPanel(grid, 'panel-1');

    localStorage.setItem('synthigme-remember-visual-layout', 'true');
    pip.openPip('panel-1');
    await tick(5);
    pip.setFocusedPipPanLocked(true);
    pip.setFocusedPipZoomLocked(true);
    pip.savePipState();
    const savedRaw = localStorage.getItem('synthigme-pip-state');
    assert.ok(savedRaw, 'debe guardar estado PiP en localStorage');

    pip.closeAllPips();
    await tick(5);
    assert.equal(pip.isPipped('panel-1'), false);
    localStorage.setItem('synthigme-pip-state', savedRaw);

    pip.restorePipState();
    await tick(20);

    assert.equal(pip.isPipped('panel-1'), true);
    assert.equal(pip.focusPip('panel-1'), true);
    const lockState = pip.getFocusedPipLockState();
    assert.equal(lockState.panLocked, true);
    assert.equal(lockState.zoomLocked, true);
    assert.equal(lockState.locked, true);
  });
});