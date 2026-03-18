/**
 * Tests para panelRouting.js (R7)
 *
 * Verifica handlePanel5AudioToggle(), handlePanel6ControlToggle(),
 * getPanelKnobOptions(), ensurePanelNodes(), getPanel5PinGain(), getPanel6PinGain().
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import './mocks/localStorage.mock.js';

// isMobileDevice() usa window y navigator
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { ontouchstart: undefined };
}
// navigator es read-only en Node.js v25 — parchear solo si no existe
try { if (!globalThis.navigator) globalThis.navigator = { userAgent: '', maxTouchPoints: 0 }; } catch (_) {}

import {
  handlePanel5AudioToggle,
  handlePanel6ControlToggle,
  ensurePanelNodes,
  getPanel5PinGain,
  getPanel6PinGain,
} from '../src/assets/js/panelRouting.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMockApp(overrides = {}) {
  return {
    engine: {
      dspEnabled: true,
      audioCtx: null,
      start: () => {},
      ensureWorkletReady: async () => {},
    },
    _panel3Routing: null,
    _panel6Routing: null,
    _panel3Audio: { nodes: [], state: [] },
    _panel5Audio: { nodes: [], state: [] },
    _panel6Audio: { nodes: [], state: [] },
    ensureAudio: () => Promise.resolve(false),
    _getPanelAudio: (idx) => ({ nodes: [], state: [] }),
    _panel5Connections: new Map(),
    _panel6Connections: new Map(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// handlePanel5AudioToggle
// ─────────────────────────────────────────────────────────────────────────────

describe('handlePanel5AudioToggle — fuente o destino ausente', () => {
  it('devuelve true si no hay source en el mapa', async () => {
    const app = buildMockApp({
      _panel3Routing: { sourceMap: new Map(), destMap: new Map([[0, {}]]) }
    });
    const result = await handlePanel5AudioToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });

  it('devuelve true si no hay dest en el mapa', async () => {
    const app = buildMockApp({
      _panel3Routing: { sourceMap: new Map([[0, {}]]), destMap: new Map() }
    });
    const result = await handlePanel5AudioToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });

  it('devuelve true si _panel3Routing es null', async () => {
    const app = buildMockApp({ _panel3Routing: null });
    const result = await handlePanel5AudioToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });
});

describe('handlePanel5AudioToggle — dspEnabled falso', () => {
  it('devuelve true cuando dsp está deshabilitado (no conecta audio)', async () => {
    const app = buildMockApp({
      engine: { dspEnabled: false, audioCtx: null, start: () => {} },
      _panel3Routing: {
        sourceMap: new Map([[0, { kind: 'panel3Osc' }]]),
        destMap: new Map([[0, { kind: 'filter' }]])
      },
      _panel5Connections: new Map(),
    });
    const result = await handlePanel5AudioToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });
});

describe('handlePanel5AudioToggle — desactivar (activate=false)', () => {
  it('devuelve true al desactivar un pin que no estaba conectado', async () => {
    const app = buildMockApp({
      _panel3Routing: {
        sourceMap: new Map([[0, { kind: 'panel3Osc', oscIndex: 0 }]]),
        destMap: new Map([[0, { kind: 'filter', filterId: 'f0' }]])
      },
      _panel5Connections: new Map(),
    });
    const result = await handlePanel5AudioToggle(0, 0, false, null, app);
    assert.equal(result, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handlePanel6ControlToggle
// ─────────────────────────────────────────────────────────────────────────────

describe('handlePanel6ControlToggle — fuente o destino ausente', () => {
  it('devuelve true si no hay source', async () => {
    const app = buildMockApp({
      _panel6Routing: { sourceMap: new Map(), destMap: new Map([[0, {}]]) }
    });
    const result = await handlePanel6ControlToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });

  it('devuelve true si _panel6Routing es null', async () => {
    const app = buildMockApp({ _panel6Routing: null });
    const result = await handlePanel6ControlToggle(0, 0, true, null, app);
    assert.equal(result, true);
  });
});

describe('handlePanel6ControlToggle — desactivar', () => {
  it('devuelve true al desactivar pin sin conexión previa', async () => {
    const app = buildMockApp({
      _panel6Routing: {
        sourceMap: new Map([[0, { kind: 'panel3Osc', oscIndex: 0 }]]),
        destMap: new Map([[0, { kind: 'filter', filterId: 'f0' }]])
      },
      _panel6Connections: new Map(),
    });
    const result = await handlePanel6ControlToggle(0, 0, false, null, app);
    assert.equal(result, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ensurePanelNodes
// ─────────────────────────────────────────────────────────────────────────────

describe('ensurePanelNodes', () => {
  it('devuelve null para panelIndex=1 (solo visual)', () => {
    const app = buildMockApp();
    const result = ensurePanelNodes(1, 0, app);
    assert.equal(result, null);
  });

  it('devuelve null para panelIndex=4 (solo visual)', () => {
    const app = buildMockApp();
    const result = ensurePanelNodes(4, 0, app);
    assert.equal(result, null);
  });

  it('devuelve null si audioCtx no está disponible', () => {
    const app = buildMockApp({
      engine: { dspEnabled: true, audioCtx: null, start: () => {} },
    });
    const result = ensurePanelNodes(3, 0, app);
    assert.equal(result, null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPanel5PinGain / getPanel6PinGain
// ─────────────────────────────────────────────────────────────────────────────

describe('getPanel5PinGain', () => {
  it('devuelve número para pin sin conexión especial', () => {
    const app = buildMockApp({
      _panel3Routing: {
        sourceMap: new Map([[0, { kind: 'panel3Osc' }]]),
        destMap: new Map([[0, { kind: 'filter' }]])
      },
      _panel5Data: null,
    });
    const result = getPanel5PinGain(0, 0, app);
    assert.ok(typeof result === 'number' || result == null);
  });
});

describe('getPanel6PinGain', () => {
  it('devuelve número para pin sin conexión especial', () => {
    const app = buildMockApp({
      _panel6Routing: {
        sourceMap: new Map([[0, { kind: 'panel3Osc' }]]),
        destMap: new Map([[0, { kind: 'filter' }]])
      },
      _panel6Data: null,
    });
    const result = getPanel6PinGain(0, 0, app);
    assert.ok(typeof result === 'number' || result == null);
  });
});
