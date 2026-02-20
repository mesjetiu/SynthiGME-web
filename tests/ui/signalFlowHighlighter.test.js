/**
 * Tests para ui/signalFlowHighlighter.js — Resaltado visual de flujo de señal
 *
 * Cobertura:
 * 1. Constructor: valores por defecto, carga desde localStorage
 * 2. API pública: setEnabled/getEnabled, setRequireModifier/getRequireModifier, setModifierKey
 * 3. Persistencia: localStorage se actualiza correctamente
 * 4. getModuleElementIds: mapeo de descriptores a IDs de módulos DOM
 * 5. Highlight de módulo: clases CSS aplicadas y limpieza
 * 6. Highlight de pin: detección de matriz, clases CSS aplicadas
 * 7. Dual-role (source + dest): clase both aplicada cuando un módulo es ambos
 * 8. Click toggle: activa/desactiva highlight sin modificador
 * 9. Modifier key mode: requiere tecla para activar
 * 10. Desactivado: no resalta cuando enabled=false
 * 11. clearAllHighlights: limpieza completa
 * 12. destroy: limpia estado
 * 13. Integración CSS: reglas signal-flow-* presentes en main.css
 * 14. Settings UI: checkbox subordinado indentado y deshabilitado
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Paths ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CSS_PATH = resolve(ROOT, 'src/assets/css/main.css');

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

// ─── Import módulo bajo test ─────────────────────────────────────────────────
const { SignalFlowHighlighter } = await import('../../src/assets/js/ui/signalFlowHighlighter.js');
const { STORAGE_KEYS } = await import('../../src/assets/js/utils/constants.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crea un elemento DOM simulando un módulo del sintetizador.
 * @param {string} id - ID del módulo
 * @param {string} [className] - Clase CSS del módulo
 * @returns {HTMLElement}
 */
function createModuleElement(id, className = 'synth-module') {
  const el = document.createElement('div');
  el.id = id;
  el.className = className;
  document.body.appendChild(el);
  return el;
}

/**
 * Crea una tabla simulando una matriz con un pin.
 * @param {number} row
 * @param {number} col
 * @returns {{ table: HTMLTableElement, pinBtn: HTMLButtonElement }}
 */
function createMatrixWithPin(row, col) {
  const table = document.createElement('table');
  const btn = document.createElement('button');
  btn.className = 'pin-btn';
  btn.dataset.row = String(row);
  btn.dataset.col = String(col);
  table.appendChild(btn);
  document.body.appendChild(table);
  return { table, pinBtn: btn };
}

/**
 * Crea un routing mock con sourceMap, destMap y connections.
 * @param {Object[]} conns - Array de { row, col, source, dest }
 * @returns {Object}
 */
function createRouting(conns) {
  const connections = {};
  const sourceMap = new Map();
  const destMap = new Map();
  
  for (const c of conns) {
    connections[`${c.row}:${c.col}`] = true;
    sourceMap.set(c.row, c.source);
    destMap.set(c.col, c.dest);
  }
  
  return { connections, sourceMap, destMap };
}

/**
 * Crea una instancia de SignalFlowHighlighter con mocks mínimos.
 * @param {Object} [overrides]
 * @returns {SignalFlowHighlighter}
 */
function createHighlighter(overrides = {}) {
  return new SignalFlowHighlighter({
    panel5Routing: overrides.panel5Routing || { connections: {}, sourceMap: new Map(), destMap: new Map() },
    panel6Routing: overrides.panel6Routing || { connections: {}, sourceMap: new Map(), destMap: new Map() },
    matrixAudio: overrides.matrixAudio || { table: null },
    matrixControl: overrides.matrixControl || { table: null },
    ...overrides
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTRUCTOR — valores por defecto
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Constructor', () => {

  beforeEach(() => {
    localStorage.clear();
  });

  it('está habilitado por defecto', () => {
    const h = createHighlighter();
    assert.strictEqual(h.getEnabled(), true);
  });

  it('no requiere modificador por defecto', () => {
    const h = createHighlighter();
    assert.strictEqual(h.getRequireModifier(), false);
  });

  it('usa Control como tecla modificadora por defecto', () => {
    const h = createHighlighter();
    assert.strictEqual(h._modifierKey, 'Control');
  });

  it('lee enabled=false desde localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.SIGNAL_FLOW_ENABLED, 'false');
    const h = createHighlighter();
    assert.strictEqual(h.getEnabled(), false);
  });

  it('lee enabled=true desde localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.SIGNAL_FLOW_ENABLED, 'true');
    const h = createHighlighter();
    assert.strictEqual(h.getEnabled(), true);
  });

  it('lee requireModifier=true desde localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER, 'true');
    const h = createHighlighter();
    assert.strictEqual(h.getRequireModifier(), true);
  });

  it('lee requireModifier=false desde localStorage', () => {
    localStorage.setItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER, 'false');
    const h = createHighlighter();
    assert.strictEqual(h.getRequireModifier(), false);
  });

  it('inicializa sets vacíos para elementos resaltados', () => {
    const h = createHighlighter();
    assert.strictEqual(h._highlightedElements.size, 0);
    assert.strictEqual(h._highlightedPins.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. API PÚBLICA — setEnabled / getEnabled
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — setEnabled/getEnabled', () => {

  beforeEach(() => {
    localStorage.clear();
  });

  it('setEnabled(true) activa el resaltado', () => {
    const h = createHighlighter();
    h.setEnabled(false);
    h.setEnabled(true);
    assert.strictEqual(h.getEnabled(), true);
  });

  it('setEnabled(false) desactiva el resaltado', () => {
    const h = createHighlighter();
    h.setEnabled(false);
    assert.strictEqual(h.getEnabled(), false);
  });

  it('setEnabled persiste en localStorage', () => {
    const h = createHighlighter();
    h.setEnabled(false);
    assert.strictEqual(localStorage.getItem(STORAGE_KEYS.SIGNAL_FLOW_ENABLED), 'false');
    h.setEnabled(true);
    assert.strictEqual(localStorage.getItem(STORAGE_KEYS.SIGNAL_FLOW_ENABLED), 'true');
  });

  it('setEnabled(false) limpia highlights activos', () => {
    const h = createHighlighter();
    const el = document.createElement('div');
    el.classList.add('signal-flow-source');
    h._highlightedElements.add(el);
    
    h.setEnabled(false);
    assert.strictEqual(h._highlightedElements.size, 0);
    assert.ok(!el.classList.contains('signal-flow-source'));
  });

  it('setEnabled(false) resetea modifierKeyPressed', () => {
    const h = createHighlighter();
    h._modifierKeyPressed = true;
    h.setEnabled(false);
    assert.strictEqual(h._modifierKeyPressed, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. API PÚBLICA — setRequireModifier / getRequireModifier
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — setRequireModifier/getRequireModifier', () => {

  beforeEach(() => {
    localStorage.clear();
  });

  it('setRequireModifier(true) activa el requisito', () => {
    const h = createHighlighter();
    h.setRequireModifier(true);
    assert.strictEqual(h.getRequireModifier(), true);
  });

  it('setRequireModifier(false) desactiva el requisito', () => {
    const h = createHighlighter();
    h.setRequireModifier(true);
    h.setRequireModifier(false);
    assert.strictEqual(h.getRequireModifier(), false);
  });

  it('setRequireModifier persiste en localStorage', () => {
    const h = createHighlighter();
    h.setRequireModifier(true);
    assert.strictEqual(localStorage.getItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER), 'true');
    h.setRequireModifier(false);
    assert.strictEqual(localStorage.getItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER), 'false');
  });

  it('setRequireModifier(true) limpia highlights y resetea modifier', () => {
    const h = createHighlighter();
    h._modifierKeyPressed = true;
    const el = document.createElement('div');
    el.classList.add('signal-flow-dest');
    h._highlightedElements.add(el);
    
    h.setRequireModifier(true);
    assert.strictEqual(h._modifierKeyPressed, false);
    assert.strictEqual(h._highlightedElements.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. API PÚBLICA — setModifierKey
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — setModifierKey', () => {

  it('cambia la tecla modificadora', () => {
    const h = createHighlighter();
    h.setModifierKey('Alt');
    assert.strictEqual(h._modifierKey, 'Alt');
  });

  it('acepta cualquier nombre de tecla', () => {
    const h = createHighlighter();
    h.setModifierKey('Shift');
    assert.strictEqual(h._modifierKey, 'Shift');
    h.setModifierKey('Meta');
    assert.strictEqual(h._modifierKey, 'Meta');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. HIGHLIGHT DE MÓDULO — clases CSS
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Highlight de módulo', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('resalta módulo fuente con signal-flow-source', () => {
    // Osc1 envía a Output1
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0,
      col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(oscEl);
    
    // El módulo fuente debe tener SOURCE_GLOW y ACTIVE
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    assert.ok(oscEl.classList.contains('signal-flow-active'));
    // El destino debe tener DEST_GLOW
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('resalta módulo destino con signal-flow-dest', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0,
      col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(outEl);
    
    // El módulo destino debe tener DEST_GLOW y ACTIVE
    assert.ok(outEl.classList.contains('signal-flow-dest'));
    assert.ok(outEl.classList.contains('signal-flow-active'));
    // La fuente debe tener SOURCE_GLOW
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('no resalta módulo sin conexiones', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter();
    h._highlightModule(oscEl);
    
    assert.ok(!oscEl.classList.contains('signal-flow-source'));
    assert.ok(!oscEl.classList.contains('signal-flow-dest'));
    assert.ok(!oscEl.classList.contains('signal-flow-active'));
  });

  it('no resalta módulo sin id', () => {
    const el = document.createElement('div');
    el.className = 'synth-module';
    document.body.appendChild(el);
    
    const h = createHighlighter();
    h._highlightModule(el);
    
    assert.strictEqual(h._highlightedElements.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. DUAL-ROLE — módulo que es fuente Y destino (both)
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Dual-role (both)', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('aplica signal-flow-both cuando módulo es fuente y destino', () => {
    const osc1 = createModuleElement('panel3-osc-1', 'sgme-osc');
    const osc2 = createModuleElement('panel3-osc-2', 'sgme-osc');
    
    const routing = createRouting([
      {
        row: 0, col: 0,
        source: { kind: 'panel3Osc', oscIndex: 0 },
        dest: { kind: 'panel3Osc', oscIndex: 1 }
      },
      {
        row: 1, col: 1,
        source: { kind: 'panel3Osc', oscIndex: 1 },
        dest: { kind: 'panel3Osc', oscIndex: 0 }
      }
    ]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(osc1);
    
    // Osc1 envía a osc2 y recibe de osc2 → both
    assert.ok(osc1.classList.contains('signal-flow-both'));
    assert.ok(osc1.classList.contains('signal-flow-active'));
    // Osc2 también recibe de y envía a osc1 → both
    assert.ok(osc2.classList.contains('signal-flow-both'));
  });

  it('_applyGlowToModule convierte source+dest en both', () => {
    const el = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter();
    h._applyGlowToModule('panel3-osc-1', 'signal-flow-source');
    h._applyGlowToModule('panel3-osc-1', 'signal-flow-dest');
    
    assert.ok(el.classList.contains('signal-flow-both'));
    assert.ok(!el.classList.contains('signal-flow-source'));
    assert.ok(!el.classList.contains('signal-flow-dest'));
  });

  it('_applyGlowToModule no duplica both si ya está', () => {
    const el = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter();
    h._applyGlowToModule('panel3-osc-1', 'signal-flow-source');
    h._applyGlowToModule('panel3-osc-1', 'signal-flow-dest');
    h._applyGlowToModule('panel3-osc-1', 'signal-flow-source'); // otra vez
    
    assert.ok(el.classList.contains('signal-flow-both'));
    assert.strictEqual(h._highlightedElements.size, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. HIGHLIGHT DE PIN
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Highlight de pin', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('resalta módulos fuente y destino desde un pin', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    
    h._highlightPin(pinBtn);
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    assert.ok(outEl.classList.contains('signal-flow-dest'));
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
    assert.ok(h._highlightedPins.has(pinBtn));
  });

  it('no resalta si el pin no tiene coordenadas válidas', () => {
    const btn = document.createElement('button');
    btn.className = 'pin-btn';
    // Sin data-row ni data-col
    document.body.appendChild(btn);
    
    const h = createHighlighter();
    h._highlightPin(btn);
    
    assert.strictEqual(h._highlightedElements.size, 0);
    assert.strictEqual(h._highlightedPins.size, 0);
  });

  it('no resalta si el pin no está en una tabla', () => {
    const btn = document.createElement('button');
    btn.className = 'pin-btn';
    btn.dataset.row = '0';
    btn.dataset.col = '0';
    document.body.appendChild(btn);
    
    const h = createHighlighter();
    h._highlightPin(btn);
    
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('detecta correctamente la matriz de audio', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    
    h._highlightPin(pinBtn);
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('detecta correctamente la matriz de control', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'panel3Osc', oscIndex: 1 }
    }]);
    createModuleElement('panel3-osc-2', 'sgme-osc');
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel6Routing: routing,
      matrixControl: { table }
    });
    
    h._highlightPin(pinBtn);
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('pin sin source/dest en routing no resalta módulos', () => {
    const { table, pinBtn } = createMatrixWithPin(5, 5);
    const routing = createRouting([]); // Sin conexiones
    
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    
    h._highlightPin(pinBtn);
    
    // Solo el pin se marca como active
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
    assert.strictEqual(h._highlightedElements.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. GLOW EN PINES DE MATRIZ
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Glow en pines (_applyGlowToPin)', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('aplica clase CSS al pin de la matriz', () => {
    const { table, pinBtn } = createMatrixWithPin(2, 3);
    
    const h = createHighlighter({ matrixAudio: { table } });
    h._applyGlowToPin({ table }, 2, 3, 'signal-flow-pin-source');
    
    assert.ok(pinBtn.classList.contains('signal-flow-pin-source'));
    assert.ok(h._highlightedPins.has(pinBtn));
  });

  it('no falla si la tabla es null', () => {
    const h = createHighlighter();
    // No debe lanzar error
    h._applyGlowToPin(null, 0, 0, 'signal-flow-pin-source');
    h._applyGlowToPin({ table: null }, 0, 0, 'signal-flow-pin-source');
    assert.strictEqual(h._highlightedPins.size, 0);
  });

  it('no falla si el pin no existe en la tabla', () => {
    const { table } = createMatrixWithPin(0, 0);
    const h = createHighlighter();
    // Buscar pin en coordenadas que no existen
    h._applyGlowToPin({ table }, 99, 99, 'signal-flow-pin-dest');
    assert.strictEqual(h._highlightedPins.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. CLEAR ALL HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — clearAllHighlights', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('elimina todas las clases de glow de módulos', () => {
    const el = document.createElement('div');
    el.classList.add('signal-flow-source', 'signal-flow-active');
    
    const h = createHighlighter();
    h._highlightedElements.add(el);
    h._clearAllHighlights();
    
    assert.ok(!el.classList.contains('signal-flow-source'));
    assert.ok(!el.classList.contains('signal-flow-active'));
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('elimina todas las clases de glow de pines', () => {
    const pin = document.createElement('button');
    pin.classList.add('signal-flow-pin-source', 'signal-flow-active');
    
    const h = createHighlighter();
    h._highlightedPins.add(pin);
    h._clearAllHighlights();
    
    assert.ok(!pin.classList.contains('signal-flow-pin-source'));
    assert.ok(!pin.classList.contains('signal-flow-active'));
    assert.strictEqual(h._highlightedPins.size, 0);
  });

  it('limpia both, source, dest y active de módulos', () => {
    const el = document.createElement('div');
    el.classList.add('signal-flow-both', 'signal-flow-source', 'signal-flow-dest', 'signal-flow-active');
    
    const h = createHighlighter();
    h._highlightedElements.add(el);
    h._clearAllHighlights();
    
    assert.ok(!el.classList.contains('signal-flow-both'));
    assert.ok(!el.classList.contains('signal-flow-source'));
    assert.ok(!el.classList.contains('signal-flow-dest'));
    assert.ok(!el.classList.contains('signal-flow-active'));
  });

  it('limpia source-pin y dest-pin de pines', () => {
    const pin = document.createElement('button');
    pin.classList.add('signal-flow-pin-source', 'signal-flow-pin-dest', 'signal-flow-active');
    
    const h = createHighlighter();
    h._highlightedPins.add(pin);
    h._clearAllHighlights();
    
    assert.ok(!pin.classList.contains('signal-flow-pin-source'));
    assert.ok(!pin.classList.contains('signal-flow-pin-dest'));
    assert.ok(!pin.classList.contains('signal-flow-active'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. DESACTIVADO — no resalta cuando enabled=false
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Desactivado', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('_handleMouseOver no resalta si está desactivado', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h.setEnabled(false);
    
    h._handleMouseOver({ target: oscEl });
    
    assert.ok(!oscEl.classList.contains('signal-flow-source'));
    assert.ok(!oscEl.classList.contains('signal-flow-active'));
  });

  it('_handleClick no resalta si está desactivado', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter();
    h.setEnabled(false);
    
    h._handleClick({ target: oscEl });
    
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('_handleMouseOver trackea hoveredElement incluso desactivado', () => {
    const el = document.createElement('div');
    
    const h = createHighlighter();
    h.setEnabled(false);
    
    h._handleMouseOver({ target: el });
    assert.strictEqual(h._hoveredElement, el);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. MODIFIER KEY MODE
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Modifier key mode', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('no resalta en hover sin modifier key cuando requireModifier=true', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h.setRequireModifier(true);
    
    h._handleMouseOver({ target: oscEl });
    assert.ok(!oscEl.classList.contains('signal-flow-source'));
  });

  it('keydown activa highlight cuando hoveredElement existe y requireModifier=true', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h.setRequireModifier(true);
    h._hoveredElement = oscEl;
    
    h._handleKeyDown({ key: 'Control', repeat: false });
    
    assert.ok(h._modifierKeyPressed);
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('keyup limpia highlights y resetea modifier', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h.setRequireModifier(true);
    h._hoveredElement = oscEl;
    h._handleKeyDown({ key: 'Control', repeat: false });
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    
    h._handleKeyUp({ key: 'Control' });
    
    assert.ok(!oscEl.classList.contains('signal-flow-source'));
    assert.strictEqual(h._modifierKeyPressed, false);
  });

  it('keydown ignora repeat', () => {
    const h = createHighlighter();
    h.setRequireModifier(true);
    
    h._handleKeyDown({ key: 'Control', repeat: true });
    assert.strictEqual(h._modifierKeyPressed, false);
  });

  it('keydown ignora si no es la tecla configurada', () => {
    const h = createHighlighter();
    h.setRequireModifier(true);
    
    h._handleKeyDown({ key: 'Shift', repeat: false });
    assert.strictEqual(h._modifierKeyPressed, false);
  });

  it('keydown no hace nada si requireModifier=false', () => {
    const h = createHighlighter();
    h._requireModifier = false;
    
    h._handleKeyDown({ key: 'Control', repeat: false });
    assert.strictEqual(h._modifierKeyPressed, false);
  });

  it('keydown con pin bajo cursor resalta pin', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h.setRequireModifier(true);
    // Simular que el cursor está sobre el pin
    h._hoveredElement = pinBtn;
    
    h._handleKeyDown({ key: 'Control', repeat: false });
    
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. CLICK TOGGLE (modo sin modificador)
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Click toggle', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('click en módulo activa highlight', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h._requireModifier = false;
    
    h._handleClick({ target: oscEl });
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('click en pin activa highlight', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h._requireModifier = false;
    
    // Simular que e.target.closest devuelve el pinBtn
    h._handleClick({ target: pinBtn });
    
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('segundo click en pin ya resaltado limpia highlights', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h._requireModifier = false;
    
    // Primer click
    h._handleClick({ target: pinBtn });
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
    
    // Segundo click → toggle off
    // Necesitamos que el pin tenga la clase de destino para detectar el toggle
    pinBtn.classList.add('signal-flow-pin-source');
    h._handleClick({ target: pinBtn });
    assert.ok(!pinBtn.classList.contains('signal-flow-active'));
  });

  it('click fuera de módulo/pin limpia highlights', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const h = createHighlighter({ panel5Routing: routing });
    h._requireModifier = false;
    
    // Activar primero
    h._handleClick({ target: oscEl });
    assert.ok(h._highlightedElements.size > 0);
    
    // Click en body (fuera)
    const outsideEl = document.createElement('span');
    document.body.appendChild(outsideEl);
    h._handleClick({ target: outsideEl });
    
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('click no funciona si requireModifier=true', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter();
    h.setRequireModifier(true);
    
    h._handleClick({ target: oscEl });
    assert.strictEqual(h._highlightedElements.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. BLUR — limpieza al perder foco
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Blur', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('blur limpia todo el estado', () => {
    const el = document.createElement('div');
    el.classList.add('signal-flow-source');
    
    const h = createHighlighter();
    h._modifierKeyPressed = true;
    h._hoveredElement = el;
    h._highlightedElements.add(el);
    
    h._handleBlur();
    
    assert.strictEqual(h._modifierKeyPressed, false);
    assert.strictEqual(h._hoveredElement, null);
    assert.strictEqual(h._highlightedElements.size, 0);
    assert.ok(!el.classList.contains('signal-flow-source'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. DESTROY
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — destroy', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('destroy limpia highlights', () => {
    const el = document.createElement('div');
    el.classList.add('signal-flow-source', 'signal-flow-active');
    
    const h = createHighlighter();
    h._highlightedElements.add(el);
    h.init();
    h.destroy();
    
    assert.strictEqual(h._highlightedElements.size, 0);
    assert.ok(!el.classList.contains('signal-flow-source'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. getModuleElementIds — mapeo de descriptores
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — getModuleElementIds (indirecto)', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('panel3Osc con oscIndex=0 resuelve a panel3-osc-1', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(oscEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('panel3Osc con oscIndex=5 resuelve a panel3-osc-6', () => {
    const oscEl = createModuleElement('panel3-osc-6', 'sgme-osc');
    const outEl = createModuleElement('output-channel-2', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 5 },
      dest: { kind: 'outputBus', bus: 2 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(oscEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('noiseGen con index=0 resuelve a panel3-noise-1', () => {
    const noiseEl = createModuleElement('panel3-noise-1', 'noise-generator');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'noiseGen', index: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(noiseEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('inputAmp resuelve a input-amplifiers', () => {
    const inputEl = createModuleElement('input-amplifiers', 'input-amplifier-module');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'inputAmp' },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(inputEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('joystick left resuelve a joystick-left', () => {
    const joyEl = createModuleElement('joystick-left', 'panel7-joystick');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'joystick', side: 'left' },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(joyEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('joystick right resuelve a joystick-right', () => {
    const joyEl = createModuleElement('joystick-right', 'panel7-joystick');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'joystick', side: 'right' },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(joyEl);
    
    assert.ok(outEl.classList.contains('signal-flow-dest'));
  });

  it('oscilloscope resuelve a oscilloscope-module', () => {
    const oscEl = createModuleElement('oscilloscope-module', 'synth-module');
    const outEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'oscilloscope' }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(oscEl);
    
    assert.ok(outEl.classList.contains('signal-flow-source'));
  });

  it('outputLevelCV resuelve a output-channel-N', () => {
    const outEl = createModuleElement('output-channel-3', 'output-channel-module');
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputLevelCV', busIndex: 2 }
    }]);
    
    const h = createHighlighter({ panel6Routing: routing });
    h._highlightModule(outEl);
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('descriptor desconocido no resuelve ningún módulo', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'unknownKind' }
    }]);
    
    const h = createHighlighter({ panel5Routing: routing });
    h._highlightModule(oscEl);
    
    // Solo el oscilador se marca como fuente, no hay destino resuelto
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });

  it('descriptor null retorna sin error', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const sourceMap = new Map();
    sourceMap.set(0, { kind: 'panel3Osc', oscIndex: 0 });
    const destMap = new Map();
    destMap.set(0, null);
    
    const routing = { connections: { '0:0': true }, sourceMap, destMap };
    
    const h = createHighlighter({ panel5Routing: routing });
    // No debe lanzar error
    h._highlightModule(oscEl);
    assert.ok(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. ROUTING VACÍO O INVÁLIDO
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Routing vacío o inválido', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('routing null no lanza error', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter({
      panel5Routing: null,
      panel6Routing: null
    });
    
    h._highlightModule(oscEl);
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('routing sin sourceMap no lanza error', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter({
      panel5Routing: { connections: { '0:0': true }, sourceMap: null, destMap: new Map() }
    });
    
    h._highlightModule(oscEl);
    assert.strictEqual(h._highlightedElements.size, 0);
  });

  it('routing sin connections no lanza error', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    
    const h = createHighlighter({
      panel5Routing: { connections: null, sourceMap: new Map(), destMap: new Map() }
    });
    
    h._highlightModule(oscEl);
    assert.strictEqual(h._highlightedElements.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. BÚSQUEDA EN AMBAS MATRICES
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Búsqueda en ambas matrices', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('busca conexiones en Panel 5 (audio) y Panel 6 (control)', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    const outEl = createModuleElement('output-channel-1', 'output-channel-module');
    const osc2El = createModuleElement('panel3-osc-2', 'sgme-osc');
    
    const audioRouting = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const controlRouting = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'panel3Osc', oscIndex: 1 }
    }]);
    
    const h = createHighlighter({
      panel5Routing: audioRouting,
      panel6Routing: controlRouting
    });
    
    h._highlightModule(oscEl);
    
    // Destino en audio
    assert.ok(outEl.classList.contains('signal-flow-dest'));
    // Destino en control
    assert.ok(osc2El.classList.contains('signal-flow-dest'));
    // Oscilador es fuente en ambas → source
    assert.ok(oscEl.classList.contains('signal-flow-source'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. PINES SIN ESTADO .active — hover/tap siempre funciona
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Pines sin .active (hover/tap siempre)', () => {

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('pin sin clase active se resalta en hover (modo sin modificador)', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    // El pin NO tiene la clase .active
    assert.ok(!pinBtn.classList.contains('active'));
    
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h._requireModifier = false;
    
    h._handleMouseOver({ target: pinBtn });
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
  });

  it('pin sin clase active se resalta en click (modo sin modificador)', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    assert.ok(!pinBtn.classList.contains('active'));
    
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h._requireModifier = false;
    
    h._handleClick({ target: pinBtn });
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
  });

  it('pin sin clase active se resalta con modifier key', () => {
    const oscEl = createModuleElement('panel3-osc-1', 'sgme-osc');
    createModuleElement('output-channel-1', 'output-channel-module');
    
    const routing = createRouting([{
      row: 0, col: 0,
      source: { kind: 'panel3Osc', oscIndex: 0 },
      dest: { kind: 'outputBus', bus: 1 }
    }]);
    
    const { table, pinBtn } = createMatrixWithPin(0, 0);
    assert.ok(!pinBtn.classList.contains('active'));
    
    const h = createHighlighter({
      panel5Routing: routing,
      matrixAudio: { table }
    });
    h.setRequireModifier(true);
    h._hoveredElement = pinBtn;
    
    h._handleKeyDown({ key: 'Control', repeat: false });
    
    assert.ok(oscEl.classList.contains('signal-flow-source'));
    assert.ok(pinBtn.classList.contains('signal-flow-active'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. INTEGRACIÓN CSS — reglas signal-flow-* en main.css
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — CSS estático (main.css)', () => {
  let css;

  before(() => {
    css = readFileSync(CSS_PATH, 'utf-8');
  });

  it('define variables CSS de signal flow en :root', () => {
    assert.ok(css.includes('--signal-flow-source-color'), 'falta --signal-flow-source-color');
    assert.ok(css.includes('--signal-flow-dest-color'), 'falta --signal-flow-dest-color');
    assert.ok(css.includes('--signal-flow-glow-spread'), 'falta --signal-flow-glow-spread');
    assert.ok(css.includes('--signal-flow-glow-blur'), 'falta --signal-flow-glow-blur');
    assert.ok(css.includes('--signal-flow-glow-opacity'), 'falta --signal-flow-glow-opacity');
    assert.ok(css.includes('--signal-flow-transition'), 'falta --signal-flow-transition');
  });

  it('tiene regla .signal-flow-source', () => {
    assert.ok(css.includes('.signal-flow-source'), 'falta .signal-flow-source');
  });

  it('tiene regla .signal-flow-dest', () => {
    assert.ok(css.includes('.signal-flow-dest'), 'falta .signal-flow-dest');
  });

  it('tiene regla .signal-flow-both', () => {
    assert.ok(css.includes('.signal-flow-both'), 'falta .signal-flow-both');
  });

  it('tiene regla .signal-flow-active', () => {
    assert.ok(css.includes('.signal-flow-active'), 'falta .signal-flow-active');
  });

  it('tiene regla .signal-flow-pin-source', () => {
    assert.ok(css.includes('.signal-flow-pin-source'), 'falta .signal-flow-pin-source');
  });

  it('tiene regla .signal-flow-pin-dest', () => {
    assert.ok(css.includes('.signal-flow-pin-dest'), 'falta .signal-flow-pin-dest');
  });

  it('tiene animación @keyframes signal-flow-alternate', () => {
    assert.ok(css.includes('@keyframes signal-flow-alternate'), 'falta keyframes signal-flow-alternate');
  });

  it('signal-flow-both usa la animación signal-flow-alternate', () => {
    const bothMatch = css.match(/\.signal-flow-both\s*\{[^}]*signal-flow-alternate/s);
    assert.ok(bothMatch, '.signal-flow-both no referencia signal-flow-alternate');
  });

  it('tiene regla .settings-row--indent para opción subordinada', () => {
    assert.ok(css.includes('.settings-row--indent'), 'falta .settings-row--indent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. STORAGE KEYS — claves de localStorage
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalFlowHighlighter — Storage keys', () => {

  it('SIGNAL_FLOW_ENABLED existe en STORAGE_KEYS', () => {
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_ENABLED, 'falta SIGNAL_FLOW_ENABLED');
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_ENABLED.includes('signal-flow-enabled'));
  });

  it('SIGNAL_FLOW_REQUIRE_MODIFIER existe en STORAGE_KEYS', () => {
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER, 'falta SIGNAL_FLOW_REQUIRE_MODIFIER');
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER.includes('signal-flow-require-modifier'));
  });

  it('ambas claves tienen el prefijo synthigme-', () => {
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_ENABLED.startsWith('synthigme-'));
    assert.ok(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER.startsWith('synthigme-'));
  });
});
