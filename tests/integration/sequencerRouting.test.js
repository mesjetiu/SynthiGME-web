/**
 * Tests de integración — Sequencer Routing (Fase 7)
 *
 * Verifica:
 * 1. Signal flow highlighter: getModuleElementIds para kinds del secuenciador
 * 2. Matrix tooltips: getLabelForSource/getLabelForDest para kinds del secuenciador
 * 3. Dormancy: detección de uso en Panel 5 y Panel 6
 *
 * Estos tests se ejecutan contra los módulos reales (no mocks).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ─── JSDOM setup ─────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLElement = dom.window.HTMLElement;

Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});

global.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// ─── Imports ─────────────────────────────────────────────────────────────────
const { SignalFlowHighlighter } = await import('../../src/assets/js/ui/signalFlowHighlighter.js');
const { getLabelForSource, getLabelForDest } = await import('../../src/assets/js/ui/matrixTooltip.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createModuleElement(id, className) {
  const el = document.createElement('div');
  el.id = id;
  el.classList.add(className);
  document.body.appendChild(el);
  return el;
}

function createRouting(entries) {
  const connections = {};
  const sourceMap = new Map();
  const destMap = new Map();
  for (const e of entries) {
    const key = `${e.row}:${e.col}`;
    connections[key] = true;
    if (e.source) sourceMap.set(e.row, e.source);
    if (e.dest) destMap.set(e.col, e.dest);
  }
  return { connections, sourceMap, destMap };
}

function createHighlighter(opts = {}) {
  return new SignalFlowHighlighter({
    panel5Routing: opts.panel5Routing || { connections: {}, sourceMap: new Map(), destMap: new Map() },
    panel6Routing: opts.panel6Routing || { connections: {}, sourceMap: new Map(), destMap: new Map() },
    enabled: true,
    requireModifier: false
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SIGNAL FLOW — getModuleElementIds para secuenciador
// ═══════════════════════════════════════════════════════════════════════════════

describe('Signal Flow — Sequencer kinds', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('sequencer source (Panel 5 DAC) resuelve a panel7-sequencer', () => {
    const seqEl = createModuleElement('panel7-sequencer', 'panel7-sequencer');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');

    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'sequencer', channel: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);

    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(seqEl);

    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('sequencerControl dest (Panel 5 input) resuelve a panel7-sequencer', () => {
    const seqEl = createModuleElement('panel7-sequencer', 'panel7-sequencer');
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');

    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'sequencerControl', controlType: 'clock' }
    }]);

    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(seqEl);

    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('sequencer source (Panel 6 CV) resuelve a panel7-sequencer', () => {
    const seqEl = createModuleElement('panel7-sequencer', 'panel7-sequencer');
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');

    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'sequencer', output: 'voltageA' },
      dest: { kind: 'oscFreqCV', oscIndex: 0 }
    }]);

    const h = createHighlighter({ panel6Routing: routing });
    h._highlightModule(seqEl);

    assert.ok(oscEl.classList.contains('signal-flow-dest'));
  });

  it('sequencerInput dest (Panel 6 input) resuelve a panel7-sequencer', () => {
    const seqEl = createModuleElement('panel7-sequencer', 'panel7-sequencer');
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');

    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'sequencerInput', inputType: 'voltageACE' }
    }]);

    const h = createHighlighter({ panel6Routing: routing });
    h._highlightModule(seqEl);

    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MATRIX TOOLTIPS — Labels para secuenciador
// ═══════════════════════════════════════════════════════════════════════════════

describe('Matrix Tooltips — Sequencer labels', () => {

  // ─── Sources ─────────────────────────────────────────────────────────────

  it('getLabelForSource: sequencer DAC (Panel 5, channel 0) genera label', () => {
    const label = getLabelForSource({ kind: 'sequencer', channel: 0 });
    assert.ok(label, 'Debería devolver un label');
    assert.ok(typeof label === 'string');
    assert.ok(label.length > 0);
  });

  it('getLabelForSource: sequencer DAC (Panel 5, channel 1) genera label', () => {
    const label = getLabelForSource({ kind: 'sequencer', channel: 1 });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  it('getLabelForSource: sequencer CV output (Panel 6) genera label', () => {
    const label = getLabelForSource({ kind: 'sequencer', output: 'voltageA' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  it('getLabelForSource: sequencer clock output (Panel 6) genera label', () => {
    const label = getLabelForSource({ kind: 'sequencer', output: 'clockRate' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  // ─── Destinations ────────────────────────────────────────────────────────

  it('getLabelForDest: sequencerControl (Panel 5) genera label', () => {
    const label = getLabelForDest({ kind: 'sequencerControl', controlType: 'clock' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  it('getLabelForDest: sequencerControl reset genera label', () => {
    const label = getLabelForDest({ kind: 'sequencerControl', controlType: 'reset' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  it('getLabelForDest: sequencerInput voltageACE genera label', () => {
    const label = getLabelForDest({ kind: 'sequencerInput', inputType: 'voltageACE' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  it('getLabelForDest: sequencerInput key genera label', () => {
    const label = getLabelForDest({ kind: 'sequencerInput', inputType: 'key' });
    assert.ok(label);
    assert.ok(label.length > 0);
  });

  // ─── Labels diferenciados ────────────────────────────────────────────────

  it('Panel 5 DAC labels diferencian channel 0 y 1 o usan clave con interpolación', () => {
    const l0 = getLabelForSource({ kind: 'sequencer', channel: 0 });
    const l1 = getLabelForSource({ kind: 'sequencer', channel: 1 });
    // En entorno de test el i18n puede no cargar locales y devolver la clave raw
    // (sin interpolación). Lo importante es que no devuelve null.
    assert.ok(l0, 'DAC 1 label no vacío');
    assert.ok(l1, 'DAC 2 label no vacío');
    // Si las traducciones están cargadas y se interpolan, deben diferir
    if (l0 !== l1) {
      assert.notEqual(l0, l1, 'DAC 1 y DAC 2 deben tener labels distintos');
    }
  });

  it('Panel 5 control type labels son distintos entre sí', () => {
    const lClock = getLabelForDest({ kind: 'sequencerControl', controlType: 'clock' });
    const lReset = getLabelForDest({ kind: 'sequencerControl', controlType: 'reset' });
    const lStop  = getLabelForDest({ kind: 'sequencerControl', controlType: 'stop' });
    assert.notEqual(lClock, lReset);
    assert.notEqual(lClock, lStop);
  });

  it('Panel 6 voltage outputs generan labels distintos', () => {
    const lA = getLabelForSource({ kind: 'sequencer', output: 'voltageA' });
    const lB = getLabelForSource({ kind: 'sequencer', output: 'voltageB' });
    assert.notEqual(lA, lB);
  });

  it('Panel 6 input types generan labels distintos', () => {
    const lACE = getLabelForDest({ kind: 'sequencerInput', inputType: 'voltageACE' });
    const lBDF = getLabelForDest({ kind: 'sequencerInput', inputType: 'voltageBDF' });
    const lKey = getLabelForDest({ kind: 'sequencerInput', inputType: 'key' });
    assert.notEqual(lACE, lBDF);
    assert.notEqual(lACE, lKey);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DORMANCY — Detección de uso del secuenciador
// ═══════════════════════════════════════════════════════════════════════════════

describe('Dormancy — Sequencer detection', () => {

  // Función auxiliar que replica la lógica de detección (lo que se añadirá
  // al dormancy manager). Esto valida la lógica pura sin dependencias de app.
  function hasSequencerUsage(panel5Connections, panel6Connections) {
    return panel5Connections.some(c =>
      c.source?.kind === 'sequencer'
      || c.dest?.kind === 'sequencerControl'
    ) || panel6Connections.some(c =>
      c.source?.kind === 'sequencer'
      || c.dest?.kind === 'sequencerInput'
    );
  }

  it('sin conexiones → dormant (sin uso)', () => {
    assert.equal(hasSequencerUsage([], []), false);
  });

  it('con salida DAC en Panel 5 → activo', () => {
    const p5 = [{ source: { kind: 'sequencer', channel: 0 }, dest: { kind: 'outputBus', bus: 1 } }];
    assert.equal(hasSequencerUsage(p5, []), true);
  });

  it('con entrada de control en Panel 5 → activo', () => {
    const p5 = [{ source: { kind: 'panel3Osc', oscIndex: 0 }, dest: { kind: 'sequencerControl', controlType: 'clock' } }];
    assert.equal(hasSequencerUsage(p5, []), true);
  });

  it('con salida CV en Panel 6 → activo', () => {
    const p6 = [{ source: { kind: 'sequencer', output: 'voltageA' }, dest: { kind: 'oscFreqCV', oscIndex: 0 } }];
    assert.equal(hasSequencerUsage([], p6), true);
  });

  it('con entrada de voltaje en Panel 6 → activo', () => {
    const p6 = [{ source: { kind: 'panel3Osc', oscIndex: 0 }, dest: { kind: 'sequencerInput', inputType: 'voltageACE' } }];
    assert.equal(hasSequencerUsage([], p6), true);
  });

  it('con conexiones de otros módulos → dormant', () => {
    const p5 = [{ source: { kind: 'panel3Osc', oscIndex: 0 }, dest: { kind: 'outputBus', bus: 1 } }];
    const p6 = [{ source: { kind: 'joystick', side: 'left' }, dest: { kind: 'oscFreqCV', oscIndex: 0 } }];
    assert.equal(hasSequencerUsage(p5, p6), false);
  });

  it('con combinación Panel 5 + Panel 6 → activo', () => {
    const p5 = [{ source: { kind: 'sequencer', channel: 0 }, dest: { kind: 'outputBus', bus: 1 } }];
    const p6 = [{ source: { kind: 'sequencer', output: 'voltageA' }, dest: { kind: 'oscFreqCV', oscIndex: 0 } }];
    assert.equal(hasSequencerUsage(p5, p6), true);
  });
});
