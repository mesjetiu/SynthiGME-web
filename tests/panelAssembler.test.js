/**
 * Tests para panelAssembler.js (R7)
 *
 * Verifica que buildPanel1() y buildPanel2() crean la estructura DOM
 * esperada y populan las referencias de módulos en el objeto app.
 *
 * Usa JSDOM para DOM y un mock de AudioEngine (sin AudioContext real,
 * ya que los módulos crean nodos de audio de forma lazy en start()).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ─── Mocks de entorno ─────────────────────────────────────────────────────────
import './mocks/localStorage.mock.js';
import {
  createMockAudioContext,
  createMockAudioWorkletNode
} from './mocks/audioContext.mock.js';

// ─── JSDOM global ─────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window              = dom.window;
global.document            = dom.window.document;
global.HTMLElement         = dom.window.HTMLElement;
global.CustomEvent         = dom.window.CustomEvent;
global.SVGElement          = dom.window.SVGElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame  = (id) => clearTimeout(id);
// fetch silencioso para SVG que no estén en el mapa raster
global.fetch = async () => { throw new Error('fetch no disponible en tests'); };

// AudioWorkletNode global (requerido por módulos de audio)
global.AudioWorkletNode = function(ctx, name, opts) {
  return createMockAudioWorkletNode(name, opts);
};
global.AudioContext = function() { return createMockAudioContext(); };

// Mock de window con listeners (requerido por algunos módulos)
if (!global.window.addEventListener) {
  global.window.addEventListener    = () => {};
  global.window.removeEventListener = () => {};
}

// ─── Import del módulo bajo prueba ────────────────────────────────────────────
import { buildPanel1, buildPanel2 } from '../src/assets/js/panelAssembler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Factory de mock app
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un mock completo del objeto app para los panel builders.
 * El engine no necesita AudioContext real: los módulos crean nodos lazy en start().
 */
function buildMockApp() {
  const mockEngine = {
    audioCtx:     null,
    dspEnabled:   true,
    modules:      [],
    addModule()   {},
    // Módulos de salida que los builders pueden necesitar para routing
    outputNodes:  []
  };

  // Crear un panel mock con element DOM real
  function makePanel(id) {
    const el = dom.window.document.createElement('div');
    el.id = id;
    return {
      element:       el,
      appendElement: (child) => { el.appendChild(child); return child; }
    };
  }

  return {
    engine:  mockEngine,
    panel1:  makePanel('panel-1'),
    panel2:  makePanel('panel-2'),
    panel4:  makePanel('panel-4'),

    // Referencias que los builders populan (inicializadas en el constructor de App)
    _panel1FilterUIs:       {},
    _panel1FilterModules:   {},
    _panel1ReverbUI:        null,
    _panel1ReverbModule:    null,
    _panel1RingModUIs:      {},
    _panel1RingModModules:  [],
    _envelopeShaperUIs:     {},
    _envelopeShaperModules: [],
    _panel1Data:            null,

    _inputAmplifierUIs:     {},
    _panel2Data:            null,
    _panel2ScopeStarted:    false,

    // Referencias opcionales usadas por algunos builders
    _defaultValues: {}
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — DOM
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — DOM', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel1(app);
  });

  it('crea el contenedor #panel1Layout en panel1.element', () => {
    const layout = app.panel1.element.querySelector('#panel1Layout');
    assert.ok(layout !== null, '#panel1Layout debe existir en panel1.element');
  });

  it('#panel1Layout tiene clase panel1-layout', () => {
    const layout = app.panel1.element.querySelector('#panel1Layout');
    assert.ok(layout.classList.contains('panel1-layout'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — Filtros
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — filtros', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel1(app);
  });

  it('popula _panel1FilterUIs con 8 filtros (4 LP + 4 HP)', () => {
    const ids = Object.keys(app._panel1FilterUIs);
    assert.strictEqual(ids.length, 8, `esperados 8 filtros, obtenidos ${ids.length}`);
  });

  it('popula _panel1FilterModules con 8 módulos', () => {
    const ids = Object.keys(app._panel1FilterModules);
    assert.strictEqual(ids.length, 8);
  });

  it('las UIs de filtro tienen id con sufijo -module', () => {
    const ids = Object.keys(app._panel1FilterUIs);
    for (const id of ids) {
      assert.ok(id.endsWith('-module'), `el id ${id} debe terminar en -module`);
    }
  });

  it('las UIs de filtro tienen método serialize()', () => {
    for (const ui of Object.values(app._panel1FilterUIs)) {
      assert.strictEqual(typeof ui.serialize, 'function', 'ui debe tener serialize()');
    }
  });

  it('las UIs de filtro tienen método deserialize()', () => {
    for (const ui of Object.values(app._panel1FilterUIs)) {
      assert.strictEqual(typeof ui.deserialize, 'function', 'ui debe tener deserialize()');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — Reverberación
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — reverberación', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel1(app);
  });

  it('popula _panel1ReverbUI', () => {
    assert.ok(app._panel1ReverbUI !== null, '_panel1ReverbUI no debe ser null');
  });

  it('_panel1ReverbUI tiene serialize()', () => {
    assert.strictEqual(typeof app._panel1ReverbUI.serialize, 'function');
  });

  it('popula _panel1ReverbModule', () => {
    assert.ok(app._panel1ReverbModule !== null, '_panel1ReverbModule no debe ser null');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — Ring Modulators
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — ring modulators', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel1(app);
  });

  it('popula _panel1RingModUIs con 3 entradas', () => {
    const count = Object.keys(app._panel1RingModUIs).length;
    assert.strictEqual(count, 3, `esperados 3 ring mods, obtenidos ${count}`);
  });

  it('las UIs de ring mod tienen serialize()', () => {
    for (const ui of Object.values(app._panel1RingModUIs)) {
      assert.strictEqual(typeof ui.serialize, 'function');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — Envelope Shapers
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — envelope shapers', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel1(app);
  });

  it('popula _envelopeShaperUIs con 3 entradas', () => {
    const count = Object.keys(app._envelopeShaperUIs).length;
    assert.strictEqual(count, 3, `esperados 3 envelope shapers, obtenidos ${count}`);
  });

  it('las UIs de envelope shaper tienen serialize()', () => {
    for (const ui of Object.values(app._envelopeShaperUIs)) {
      assert.strictEqual(typeof ui.serialize, 'function');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel1 — _panel1Data
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel1 — _panel1Data', () => {
  it('popula _panel1Data con referencias de host y filas', () => {
    const app = buildMockApp();
    buildPanel1(app);
    assert.ok(app._panel1Data !== null, '_panel1Data no debe ser null');
    assert.ok(app._panel1Data.host, 'debe tener host');
    assert.ok(app._panel1Data.filtersRow, 'debe tener filtersRow');
    assert.ok(app._panel1Data.bottomRow, 'debe tener bottomRow');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel2 — DOM
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel2 — DOM', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel2(app);
  });

  it('crea un contenedor de panel2 en panel2.element', () => {
    // El panel2 debe tener algún contenido después del build
    assert.ok(app.panel2.element.children.length > 0, 'panel2.element debe tener hijos');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel2 — _panel2Data
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel2 — _panel2Data', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel2(app);
  });

  it('popula _panel2Data', () => {
    assert.ok(app._panel2Data !== null, '_panel2Data no debe ser null');
  });

  it('_panel2Data tiene scopeModule', () => {
    assert.ok(app._panel2Data.scopeModule !== undefined, 'debe tener scopeModule');
  });

  it('_panel2Data tiene los knobs del osciloscopio', () => {
    assert.ok(app._panel2Data.timeKnob  !== undefined, 'debe tener timeKnob');
    assert.ok(app._panel2Data.ampKnob   !== undefined, 'debe tener ampKnob');
    assert.ok(app._panel2Data.levelKnob !== undefined, 'debe tener levelKnob');
  });

  it('_panel2Data tiene modeToggle', () => {
    assert.ok(app._panel2Data.modeToggle !== undefined, 'debe tener modeToggle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel2 — Input Amplifiers
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel2 — input amplifiers', () => {
  it('popula _inputAmplifierUIs', () => {
    const app = buildMockApp();
    buildPanel2(app);
    const count = Object.keys(app._inputAmplifierUIs).length;
    assert.ok(count > 0, '_inputAmplifierUIs debe tener al menos una entrada');
  });
});
