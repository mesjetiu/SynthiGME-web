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
global.window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
// fetch silencioso para SVG que no estén en el mapa raster
global.fetch = async () => { throw new Error('fetch no disponible en tests'); };

// AudioWorkletNode global (requerido por módulos de audio)
global.AudioWorkletNode = function(ctx, name, opts) {
  return createMockAudioWorkletNode(name, opts);
};
global.AudioContext = function() { return createMockAudioContext(); };

// Mock canvas.getContext('2d') — JSDOM no implementa canvas nativamente
dom.window.HTMLCanvasElement.prototype.getContext = function(type) {
  if (type === '2d') {
    return {
      canvas: this,
      clearRect:   () => {},
      fillRect:    () => {},
      strokeRect:  () => {},
      beginPath:   () => {},
      closePath:   () => {},
      moveTo:      () => {},
      lineTo:      () => {},
      arc:         () => {},
      fill:        () => {},
      stroke:      () => {},
      save:        () => {},
      restore:     () => {},
      translate:   () => {},
      scale:       () => {},
      rotate:      () => {},
      drawImage:   () => {},
      setTransform: () => {},
      measureText: () => ({ width: 0 }),
      fillText:    () => {},
      strokeText:  () => {},
      createLinearGradient: () => ({
        addColorStop: () => {}
      }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {}
    };
  }
  return null;
};

// Mock de window con listeners (requerido por algunos módulos)
if (!global.window.addEventListener) {
  global.window.addEventListener    = () => {};
  global.window.removeEventListener = () => {};
}

// ─── Import del módulo bajo prueba ────────────────────────────────────────────
import {
  buildPanel1, buildPanel2,
  buildPanel4, buildOscillatorPanel,
  setupOutputFaders, buildLargeMatrices,
  initSignalFlowHighlighter
} from '../src/assets/js/panelAssembler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Factory de mock app
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un mock completo del objeto app para los panel builders.
 * El engine no necesita AudioContext real: los módulos crean nodos lazy en start().
 */
// Crea un panel mock con element DOM real
function makePanel(id) {
  const el = dom.window.document.createElement('div');
  el.id = id;
  return {
    element:       el,
    appendElement: (child) => { el.appendChild(child); return child; },
    addSection:    ({ id: sectionId, type } = {}) => {
      if (type === 'matrix') {
        const wrapper = dom.window.document.createElement('div');
        wrapper.className = 'matrix-container';
        const table = dom.window.document.createElement('table');
        if (sectionId) table.id = sectionId;
        table.className = 'matrix';
        wrapper.appendChild(table);
        el.appendChild(wrapper);
        return table;
      }
      const section = dom.window.document.createElement('div');
      if (sectionId) section.id = sectionId;
      el.appendChild(section);
      return section;
    }
  };
}

function buildMockApp() {
  const mockEngine = {
    audioCtx:           null,
    dspEnabled:         true,
    modules:            [],
    outputChannels:     8,
    outputNodes:        [],
    addModule()         {},
    ensureAudio:        async () => {},
    getOutputLevel:     () => 0,
    setOutputLevel:     () => {},
    setOutputMute:      () => {},
    getOutputMute:      () => false,
    setOutputSolo:      () => {},
    getOutputSolo:      () => false,
    start:              () => {}
  };

  // outputChannelsSection: sección DOM del panel de salida
  const outputSectionEl = dom.window.document.createElement('div');
  outputSectionEl.id = 'outputChannelsSection';
  outputSectionEl.className = 'output-channels-section';

  return {
    engine:  mockEngine,
    panel1:  makePanel('panel-1'),
    panel2:  makePanel('panel-2'),
    panel3:  makePanel('panel-3'),
    panel4:  makePanel('panel-4'),
    panel5:  makePanel('panel-5'),
    panel6:  makePanel('panel-6'),
    outputPanel: makePanel('panel-output'),
    outputChannelsSection: outputSectionEl,

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

    // Referencias para buildOscillatorPanel
    _oscillatorUIs:         {},
    _noiseUIs:              {},
    _randomVoltageUIs:      {},
    _panel3Audio:           { nodes: [] },

    // Referencias para buildPanel4
    _panel4Data:            null,
    _pvcModule:             null,
    _pvcKnobs:              {},
    _pvcVernierInstance:    null,
    _sequencerModule:       null,
    _sequencerDisplayUpdate: null,
    _sequencerDisplayRender: null,
    _sequencerKnobs:        {},
    _setSeqDisplayFormat:   null,
    _keyboardModules:       {},
    _keyboardUIs:           {},
    _keyboardKnobs:         {},

    // Referencias para setupOutputFaders
    _outputFadersModule:    null,
    _outputChannelsPanel:   null,
    _joystickModules:       {},
    _joystickUIs:           {},
    _joystickKnobs:         {},
    _sequencerSwitchUIs:    {},

    // Referencias para buildLargeMatrices
    largeMatrixAudio:       null,
    largeMatrixControl:     null,

    // Referencias para initSignalFlowHighlighter
    _signalFlowHighlighter: null,

    // Métodos de soporte
    ensureAudio:            async () => {},
    _defaultValues:         {},

    // Métodos requeridos por buildOscillatorPanel
    _getPanelKnobOptions:   () => ({}),
    _onOscRangeChange:      () => {},
    _syncOscillatorStateFromUI: () => {},
    _reflowOscillatorPanel: () => {},

    // Métodos requeridos por buildLargeMatrices
    _getPanel5PinGain:      () => 1,
    _getPanel6PinGain:      () => 1,
    _panel3Routing:         { connections: {}, destMap: new Map() },
    _panel6Routing:         { connections: {}, destMap: new Map() },

    // Métodos requeridos por setupOutputFaders
    _getJoystickRangeTooltipInfo: () => null
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

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel4 — DOM
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel4 — DOM', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel4(app);
  });

  it('crea el contenedor #panel4Layout en panel4.element', () => {
    const layout = app.panel4.element.querySelector('#panel4Layout');
    assert.ok(layout !== null, '#panel4Layout debe existir en panel4.element');
  });

  it('#panel4Layout tiene clase panel4-layout', () => {
    const layout = app.panel4.element.querySelector('#panel4Layout');
    assert.ok(layout.classList.contains('panel4-layout'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel4 — _panel4Data
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel4 — _panel4Data', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel4(app);
  });

  it('popula _panel4Data', () => {
    assert.ok(app._panel4Data !== null, '_panel4Data no debe ser null');
  });

  it('_panel4Data tiene voltmeters', () => {
    assert.ok(app._panel4Data.voltmeters !== undefined, 'debe tener voltmeters');
    assert.ok(typeof app._panel4Data.voltmeters === 'object');
  });

  it('_panel4Data tiene al menos 1 voltímetro', () => {
    const count = Object.keys(app._panel4Data.voltmeters).length;
    assert.ok(count > 0, `debe haber al menos 1 voltímetro, obtenidos ${count}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildPanel4 — módulos
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildPanel4 — módulos', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildPanel4(app);
  });

  it('popula _pvcModule', () => {
    assert.ok(app._pvcModule !== null, '_pvcModule debe estar asignado');
  });

  it('_sequencerDisplayUpdate es una función', () => {
    assert.strictEqual(typeof app._sequencerDisplayUpdate, 'function',
      '_sequencerDisplayUpdate debe ser una función');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildOscillatorPanel — osciladores
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildOscillatorPanel — osciladores', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildOscillatorPanel(3, app.panel3, app._panel3Audio, app);
  });

  it('popula _oscillatorUIs con al menos 1 entrada', () => {
    const count = Object.keys(app._oscillatorUIs).length;
    assert.ok(count > 0, `_oscillatorUIs debe tener al menos 1 oscilador, obtenidos ${count}`);
  });

  it('popula _noiseUIs', () => {
    const count = Object.keys(app._noiseUIs).length;
    assert.ok(count > 0, `_noiseUIs debe tener al menos 1 entrada, obtenidos ${count}`);
  });

  it('popula _randomVoltageUIs', () => {
    const count = Object.keys(app._randomVoltageUIs).length;
    assert.ok(count > 0, `_randomVoltageUIs debe tener al menos 1 entrada, obtenidos ${count}`);
  });

  it('las UIs de oscilador tienen serialize()', () => {
    for (const ui of Object.values(app._oscillatorUIs)) {
      assert.strictEqual(typeof ui.serialize, 'function', 'ui de oscilador debe tener serialize()');
    }
  });

  it('crea el contenedor #panel3Layout en panel3.element', () => {
    const layout = app.panel3.element.querySelector('#panel3Layout');
    assert.ok(layout !== null, '#panel3Layout debe existir en panel3.element');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupOutputFaders — módulos
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupOutputFaders — módulos', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    // outputChannelsSection debe ser hijo de outputPanel.element para que
    // panel7Layout.insertBefore(upperRowEl, outputChannelsSection) funcione
    app.outputPanel.element.appendChild(app.outputChannelsSection);
    setupOutputFaders(app);
  });

  it('asigna _outputFadersModule', () => {
    assert.ok(app._outputFadersModule !== null, '_outputFadersModule debe estar asignado');
  });

  it('asigna _outputChannelsPanel', () => {
    assert.ok(app._outputChannelsPanel !== null, '_outputChannelsPanel debe estar asignado');
  });

  it('asigna _joystickModules con left y right', () => {
    assert.ok(app._joystickModules.left !== undefined, 'debe tener joystick izquierdo');
    assert.ok(app._joystickModules.right !== undefined, 'debe tener joystick derecho');
  });

  it('asigna _sequencerModule', () => {
    assert.ok(app._sequencerModule !== null, '_sequencerModule debe estar asignado');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildLargeMatrices
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildLargeMatrices', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    buildLargeMatrices(app);
  });

  it('asigna largeMatrixAudio', () => {
    assert.ok(app.largeMatrixAudio !== null, 'largeMatrixAudio debe estar asignado');
  });

  it('asigna largeMatrixControl', () => {
    assert.ok(app.largeMatrixControl !== null, 'largeMatrixControl debe estar asignado');
  });

  it('largeMatrixAudio tiene setToggleHandler()', () => {
    assert.strictEqual(typeof app.largeMatrixAudio.setToggleHandler, 'function');
  });

  it('largeMatrixControl tiene setToggleHandler()', () => {
    assert.strictEqual(typeof app.largeMatrixControl.setToggleHandler, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// initSignalFlowHighlighter
// ═══════════════════════════════════════════════════════════════════════════════

describe('initSignalFlowHighlighter', () => {
  it('asigna _signalFlowHighlighter', () => {
    const app = buildMockApp();
    initSignalFlowHighlighter(app);
    assert.ok(app._signalFlowHighlighter !== null, '_signalFlowHighlighter debe estar asignado');
  });
});
