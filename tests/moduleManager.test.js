/**
 * Tests para moduleManager.js (R7)
 *
 * Verifica findModuleById(), getModulesForPanel(), resetModule(),
 * reflowOscillatorPanel() y resetToDefaults() extraídas de app.js.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import './mocks/localStorage.mock.js';

// Stub DOM globals requeridos por showToast (llamado desde resetToDefaults)
if (typeof globalThis.document === 'undefined') {
  const fakeEl = { classList: { add: () => {}, remove: () => {} }, textContent: '', style: {} };
  globalThis.document = {
    createElement: () => fakeEl,
    getElementById: () => null,
    body: { appendChild: () => {}, removeChild: () => {} },
    querySelector: () => null,
  };
}

import {
  findModuleById,
  getModulesForPanel,
  reflowOscillatorPanel,
  resetModule,
  resetToDefaults,
} from '../src/assets/js/moduleManager.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockUI = (extra = {}) => ({
  serialize: () => ({}),
  deserialize: () => {},
  ...extra
});

function buildMockApp(overrides = {}) {
  return {
    _oscillatorUIs:      {},
    _noiseUIs:           {},
    _randomVoltageUIs:   {},
    _envelopeShaperUIs:  {},
    _panel1FilterUIs:    {},
    _panel1ReverbUI:     null,
    _panel1RingModUIs:   {},
    _panel2Data:         null,
    _inputAmplifierUIs:  {},
    _outputFadersModule: null,
    _joystickUIs:        {},
    _keyboardModules:    {},
    _sequencerModule:    null,
    _pvcModule:          null,
    _panel4Data:         null,
    _panel5Data:         null,
    _panel6Data:         null,
    _panel3LayoutData:   null,
    _panel5LayoutData:   null,
    _panel6LayoutData:   null,
    ...overrides
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// findModuleById
// ─────────────────────────────────────────────────────────────────────────────

describe('findModuleById — osciladores', () => {
  it('devuelve {type:"oscillator", ui} si el id está en _oscillatorUIs', () => {
    const ui = mockUI();
    const app = buildMockApp({ _oscillatorUIs: { 'panel3-osc-0': ui } });
    const result = findModuleById('panel3-osc-0', app);
    assert.ok(result);
    assert.equal(result.type, 'oscillator');
    assert.equal(result.ui, ui);
  });

  it('devuelve null si el id no existe en ningún mapa', () => {
    const app = buildMockApp();
    const result = findModuleById('no-existe', app);
    assert.equal(result, null);
  });
});

describe('findModuleById — noise', () => {
  it('devuelve {type:"noise", ui} para IDs en _noiseUIs', () => {
    const ui = mockUI();
    const app = buildMockApp({ _noiseUIs: { 'panel3-noise-0': ui } });
    const result = findModuleById('panel3-noise-0', app);
    assert.equal(result.type, 'noise');
    assert.equal(result.ui, ui);
  });
});

describe('findModuleById — reverb, ringMod, filtros', () => {
  it('devuelve {type:"reverberation"} para reverberation1-module', () => {
    const ui = mockUI();
    const app = buildMockApp({ _panel1ReverbUI: ui });
    const result = findModuleById('reverberation1-module', app);
    assert.equal(result.type, 'reverberation');
    assert.equal(result.ui, ui);
  });

  it('devuelve null para reverberation1-module si _panel1ReverbUI es null', () => {
    const app = buildMockApp({ _panel1ReverbUI: null });
    const result = findModuleById('reverberation1-module', app);
    assert.equal(result, null);
  });

  it('devuelve {type:"ringModulator"} para ids en _panel1RingModUIs', () => {
    const ui = mockUI();
    const app = buildMockApp({ _panel1RingModUIs: { 'ringmod-1-module': ui } });
    const result = findModuleById('ringmod-1-module', app);
    assert.equal(result.type, 'ringModulator');
  });

  it('devuelve {type:"filter"} para ids en _panel1FilterUIs', () => {
    const ui = mockUI();
    const app = buildMockApp({ _panel1FilterUIs: { 'filter-lp-1-module': ui } });
    const result = findModuleById('filter-lp-1-module', app);
    assert.equal(result.type, 'filter');
  });
});

describe('findModuleById — sequencer y joystick', () => {
  it('devuelve {type:"sequencer"} para id "sequencer" si _sequencerModule existe', () => {
    const ui = mockUI();
    const app = buildMockApp({ _sequencerModule: ui });
    const result = findModuleById('sequencer', app);
    assert.equal(result.type, 'sequencer');
  });

  it('devuelve null para id "sequencer" si _sequencerModule es null', () => {
    const app = buildMockApp({ _sequencerModule: null });
    const result = findModuleById('sequencer', app);
    assert.equal(result, null);
  });

  it('devuelve {type:"joystick"} para ids en _joystickUIs', () => {
    const ui = mockUI();
    const app = buildMockApp({ _joystickUIs: { 'joystick-left': ui } });
    const result = findModuleById('joystick-left', app);
    assert.equal(result.type, 'joystick');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getModulesForPanel
// ─────────────────────────────────────────────────────────────────────────────

describe('getModulesForPanel — panel-1', () => {
  it('devuelve array con módulos de filtro para panel-1', () => {
    const app = buildMockApp({
      _panel1FilterUIs: {
        'filter-lp-1-module': mockUI(),
        'filter-lp-2-module': mockUI()
      }
    });
    const modules = getModulesForPanel('panel-1', app);
    assert.ok(Array.isArray(modules));
    assert.equal(modules.length, 2);
    assert.ok(modules.every(m => m.type === 'filter'));
  });

  it('devuelve array vacío si no hay filtros en panel-1', () => {
    const app = buildMockApp({ _panel1FilterUIs: {} });
    const modules = getModulesForPanel('panel-1', app);
    assert.equal(modules.length, 0);
  });
});

describe('getModulesForPanel — panel-3', () => {
  it('devuelve osciladores, noise y randomVoltage de panel-3', () => {
    const app = buildMockApp({
      _oscillatorUIs:    { 'panel3-osc-0': mockUI(), 'panel3-osc-1': mockUI() },
      _noiseUIs:         { 'panel3-noise-0': mockUI() },
      _randomVoltageUIs: { 'panel3-random-0': mockUI() },
      _envelopeShaperUIs: {}
    });
    const modules = getModulesForPanel('panel-3', app);
    assert.equal(modules.filter(m => m.type === 'oscillator').length, 2);
    assert.equal(modules.filter(m => m.type === 'noise').length, 1);
    assert.equal(modules.filter(m => m.type === 'randomVoltage').length, 1);
  });
});

describe('getModulesForPanel — panel-2', () => {
  it('incluye oscilloscope si _panel2Data existe', () => {
    const app = buildMockApp({ _panel2Data: mockUI(), _inputAmplifierUIs: {} });
    const modules = getModulesForPanel('panel-2', app);
    assert.ok(modules.some(m => m.type === 'oscilloscope'));
  });
});

describe('getModulesForPanel — panel desconocido', () => {
  it('devuelve array vacío para panelId desconocido', () => {
    const app = buildMockApp();
    const modules = getModulesForPanel('panel-99', app);
    assert.ok(Array.isArray(modules));
    assert.equal(modules.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reflowOscillatorPanel
// ─────────────────────────────────────────────────────────────────────────────

describe('reflowOscillatorPanel', () => {
  it('no lanza si no hay layoutData para el panel', () => {
    const app = buildMockApp({ _panel3LayoutData: null });
    global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    global.cancelAnimationFrame  = (id) => clearTimeout(id);
    assert.doesNotThrow(() => reflowOscillatorPanel(3, app));
  });

  it('cancela RAF previos si existen y hay layoutData', () => {
    let cancelled = null;
    global.cancelAnimationFrame = (id) => { cancelled = id; };
    global.requestAnimationFrame = (cb) => { setTimeout(cb, 16); return 99; };
    // Necesita layoutData para no salir early
    const fakeData = { host: null, layout: {}, oscillatorSlots: [], oscComponents: [] };
    const app = buildMockApp({ _panel3LayoutData: fakeData, _panel3LayoutRaf: 42 });
    reflowOscillatorPanel(3, app);
    assert.equal(cancelled, 42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetModule
// ─────────────────────────────────────────────────────────────────────────────

describe('resetModule — null ui', () => {
  it('no lanza si ui es null o undefined', () => {
    const app = buildMockApp({ _defaultValues: {} });
    assert.doesNotThrow(() => resetModule('filter', null, app));
    assert.doesNotThrow(() => resetModule('filter', undefined, app));
  });
});

describe('resetModule — tipo genérico con deserialize', () => {
  it('llama deserialize con el valor de defaults para filtros', () => {
    let deserialized = null;
    const ui = { deserialize: (val) => { deserialized = val; } };
    const defaults = { filters: { freq: 440 } };
    const app = buildMockApp({ _defaultValues: defaults });
    resetModule('filter', ui, app);
    assert.deepEqual(deserialized, { freq: 440 });
  });

  it('no lanza si defaults no tiene clave para el tipo', () => {
    const ui = { deserialize: () => {} };
    const app = buildMockApp({ _defaultValues: {} });
    assert.doesNotThrow(() => resetModule('unknownType', ui, app));
  });
});

describe('resetModule — joystick', () => {
  it('llama module.setPosition(0, 0) para joystick', () => {
    let posX = null, posY = null;
    const ui = {
      module: { getX: () => 5, getY: () => 3, setPosition: (x, y) => { posX = x; posY = y; }, setRangeX: () => {}, setRangeY: () => {} },
      knobs: {},
      padEl: null,
      config: { knobs: { rangeX: { initial: 0, max: 10 }, rangeY: { initial: 0, max: 10 } } }
    };
    const app = buildMockApp();
    resetModule('joystick', ui, app);
    assert.equal(posX, 0);
    assert.equal(posY, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetToDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe('resetToDefaults', () => {
  it('llama deserialize en todos los osciladores', async () => {
    const deserialized = [];
    const ui = { deserialize: (v) => deserialized.push(v) };
    const app = buildMockApp({
      _oscillatorUIs: { 'osc-0': ui, 'osc-1': ui },
      _noiseUIs: {},
      _randomVoltageUIs: {},
      _envelopeShaperUIs: {},
      _panel1FilterUIs: {},
      _panel1RingModUIs: {},
      _inputAmplifierUIs: {},
      _joystickUIs: {},
      _keyboardModules: {},
      _outputFadersModule: null,
      _sequencerModule: null,
      _pvcModule: null,
      _defaultValues: { oscillator: { gain: 1 }, noise: {}, randomVoltage: {}, envelopeShaper: {}, filter: {}, ringModulator: {}, inputAmplifier: {}, oscilloscope: {} },
      _panel2Data: null,
      _largeMatrixAudio: null,
      _largeMatrixControl: null,
    });
    // Mock sessionManager and undoRedoManager on app
    app._sessionManager = { applyingPatch: () => {} };
    app._undoRedoManager = { clearHistory: () => {} };
    await resetToDefaults(app);
    assert.ok(deserialized.length >= 2, 'deserialize llamado para cada oscilador');
  });
});
