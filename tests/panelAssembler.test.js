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
// unref(): los bucles de render (voltímetros, osciloscopio) se re-encolan sin
// fin y, sin esto, el proceso de test nunca termina.
global.requestAnimationFrame = (cb) => setTimeout(cb, 16).unref();
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

  return {
    engine:  mockEngine,
    panel1:  makePanel('panel-1'),
    panel2:  makePanel('panel-2'),
    panel3:  makePanel('panel-3'),
    panel4:  makePanel('panel-4'),
    panel5:  makePanel('panel-5'),
    panel6:  makePanel('panel-6'),
    outputPanel: makePanel('panel-output'),

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

  it('cada módulo cuelga del panel en su caja, sin filas intermedias', () => {
    const layout = app.panel1.element.querySelector('#panel1Layout');
    assert.strictEqual(layout.style.transform, '', 'el contenedor ya no se desplaza (antes y 40)');
    assert.strictEqual(layout.style.display, '', 'el contenedor ya no es flex');
    assert.strictEqual(layout.style.padding, '', 'el contenedor ya no tiene padding');
    const byId = id => [...layout.children].find(el => el.id === id);
    const flp1 = byId('flp1-module');
    assert.ok(flp1, 'FLP 1 es hijo directo de #panel1Layout');
    assert.strictEqual(flp1.style.left, '6.25px');
    assert.strictEqual(flp1.style.top, '50px');
    assert.strictEqual(flp1.style.width, '93px');
    assert.strictEqual(flp1.style.height, '287.25px');
    assert.strictEqual(byId('fhp4-module').style.left, '660px');
    const es3 = byId('envelopeShaper3-module');
    assert.strictEqual(es3.style.position, 'absolute', 'la caja no la pisa el position:relative de antes');
    assert.strictEqual(es3.style.top, '544px');
    assert.strictEqual(byId('ringModulator2-module').style.left, '112px');
    assert.strictEqual(byId('reverberation1-module').style.width, '146.5px');
    assert.strictEqual(byId('echoADL-module').style.width, '280.5px');
    // 16 módulos, todos en left/top (sin translate)
    const modules = [...layout.children].filter(el => el.classList.contains('synth-module'));
    assert.strictEqual(modules.length, 16);
    for (const el of modules) {
      assert.strictEqual(el.style.transform, '', el.id);
      assert.strictEqual(el.style.position, 'absolute', el.id);
    }
    for (const cls of ['panel1-filters-row', 'panel1-bottom-row']) {
      assert.strictEqual(layout.querySelector(`.${cls}`), null, `.${cls} ya no existe`);
    }
  });

  it('cada mando, por su centro, en una capa que cubre la caja de su módulo', () => {
    const flp1 = app.panel1.element.querySelector('#flp1-module');
    const layers = flp1.querySelectorAll('.panel1-controls');
    assert.strictEqual(layers.length, 1);
    assert.strictEqual(layers[0].style.inset, '-1px');
    const knobs = layers[0].querySelectorAll(':scope > .knob-wrapper');
    assert.strictEqual(knobs.length, 3);
    // Frequency: centro (46.75, 72.25), mando de 65 px
    assert.strictEqual(knobs[0].style.position, 'absolute');
    assert.strictEqual(knobs[0].style.left, '14.25px');
    assert.strictEqual(knobs[0].style.top, '39.75px');
    assert.strictEqual(knobs[0].style.width, '65px');
    for (const id of ['envelopeShaper2', 'ringModulator3', 'reverberation1', 'echoADL']) {
      const wrappers = app.panel1.element.querySelectorAll(`#${id}-module .panel1-controls > .knob-wrapper`);
      assert.ok(wrappers.length > 0, id);
      for (const w of wrappers) assert.strictEqual(w.style.position, 'absolute', id);
    }
  });

  it('el gate y el LED de cada envolvente, por su centro, en la capa de mandos', () => {
    const es1 = app.panel1.element.querySelector('#envelopeShaper1-module');
    const led = es1.querySelector('.panel1-controls > .envelope-shaper__led');
    const gate = es1.querySelector('.panel1-controls > .envelope-shaper__gate-btn');
    assert.ok(led && gate);
    // LED: centro (187, 26.5); 10 px más 1 px de borde por lado
    assert.strictEqual(led.style.left, '181px');
    assert.strictEqual(led.style.top, '20.5px');
    assert.strictEqual(led.style.width, '10px');
    // Gate: centro (90, 88), 19 px: el pulsador negro de la foto, sin rótulo
    assert.strictEqual(gate.style.left, '80.5px');
    assert.strictEqual(gate.style.top, '78.5px');
    assert.strictEqual(gate.style.width, '19px');
    assert.strictEqual(gate.textContent, '');
    assert.strictEqual(gate.getAttribute('aria-label'), 'Gate');
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
  it('popula _panel1Data con el host y los marcos de la fila inferior', () => {
    const app = buildMockApp();
    buildPanel1(app);
    assert.ok(app._panel1Data !== null, '_panel1Data no debe ser null');
    assert.ok(app._panel1Data.host, 'debe tener host');
    assert.deepStrictEqual(Object.keys(app._panel1Data.bottomFrames).sort(),
      ['echoADL', 'reverberation1', 'ringModulator1', 'ringModulator2', 'ringModulator3']);
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

  it('cada módulo cuelga del panel en su caja, sin filas ni columnas intermedias', () => {
    const layout = app.panel4.element.querySelector('#panel4Layout');
    assert.strictEqual(layout.style.transform, '', 'el contenedor ya no se desplaza');
    assert.strictEqual(layout.style.display, '', 'el contenedor ya no es flex');
    assert.strictEqual(layout.style.padding, '', 'el contenedor ya no tiene padding');
    const byId = id => [...layout.children].find(el => el.id === id);
    const vm1 = byId('voltmeter1-module');
    assert.ok(vm1, 'voltímetro 1 es hijo directo de #panel4Layout');
    assert.strictEqual(vm1.style.left, '45.75px');
    assert.strictEqual(vm1.style.top, '179px');
    assert.strictEqual(vm1.style.width, '82.75px');
    assert.strictEqual(byId('voltmeter8-module').style.left, '625.75px');
    assert.strictEqual(byId('sequencerEventTime-module').style.top, '299.5px');
    const upper = byId('upperKeyboard-module');
    assert.ok(upper, 'teclado superior es hijo directo de #panel4Layout');
    assert.strictEqual(upper.style.left, '142.75px');
    assert.strictEqual(upper.style.height, '366.75px');
    assert.strictEqual(byId('key4-module').style.top, '555.75px');
    assert.strictEqual(byId('option1-module').style.top, '644.75px');
    // 23 módulos (8 voltímetros + 15), todos en left/top (sin translate)
    const modules = [...layout.children].filter(el => el.classList.contains('synth-module'));
    assert.strictEqual(modules.length, 23);
    for (const el of modules) assert.strictEqual(el.style.transform, '', el.id);
    // Cada mando, por su centro dentro de la caja: Key Velocity del teclado
    // superior (knob de 45 px) en (47, 141,75) → esquina en (24,5, 119,25)
    const kv = upper.querySelector('[data-knob="velocityLevel"]');
    assert.strictEqual(kv.style.position, 'absolute');
    assert.strictEqual(kv.style.left, '24.5px');
    assert.strictEqual(kv.style.top, '119.25px');
    assert.strictEqual(upper.querySelector('.panel4-controls').style.inset, '-1px');
    for (const cls of ['panel4-logo-area', 'panel4-voltmeters-row', 'panel4-keyboard-output-range',
      'panel4-kor-column', 'panel4-sequencer-section', 'panel4-seq-row1', 'panel4-seq-row2']) {
      assert.strictEqual(layout.querySelector(`.${cls}`), null, `.${cls} ya no existe`);
    }
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

  it('enlaza los 10 mandos del secuenciador por su nombre', () => {
    assert.deepStrictEqual(Object.keys(app._sequencerKnobs).sort(), [
      'key1', 'key2', 'key3', 'key4',
      'voltageA', 'voltageB', 'voltageC', 'voltageD', 'voltageE', 'voltageF'
    ]);
    const key4 = app.panel4.element.querySelector('#key4-module');
    assert.strictEqual(key4.dataset.moduleName, 'Sequencer');
    const inv = app.panel4.element.querySelector('#invertorBuffer-module');
    assert.strictEqual(inv.dataset.moduleName, undefined, 'Invertor/Buffer no es del secuenciador');
  });

  it('enlaza los mandos de los dos teclados y el Range del PVC', () => {
    for (const side of ['upper', 'lower']) {
      assert.deepStrictEqual(Object.keys(app._keyboardKnobs[side]).sort(),
        ['gateLevel', 'pitchSpread', 'retrigger', 'velocityLevel'], side);
    }
    assert.ok(app._pvcKnobs.range, 'Range del PVC enlazado');
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

  it('cada módulo cuelga del panel en su caja, sin fila intermedia ni reflow', () => {
    const layout = app.panel3.element.querySelector('#panel3Layout');
    const byId = id => [...layout.children].find(el => el.id === id);
    // Osc 5: y = 431,5 cabe en la rejilla de 1/64 px → top
    const osc5 = byId('panel3-osc-5');
    assert.ok(osc5, 'osc 5 es hijo directo de #panel3Layout');
    assert.strictEqual(osc5.style.left, '5px');
    assert.strictEqual(osc5.style.top, '431.5px');
    assert.strictEqual(osc5.style.width, '375px');
    // Osc 8: y = 121,6 no cabe → translate
    const osc8 = byId('panel3-osc-8');
    assert.strictEqual(osc8.style.left, '380px');
    assert.strictEqual(osc8.style.transform, 'translate(0px, 121.6px)');
    // Fila inferior, con su relleno interior
    const noise2 = byId('panel3-noise-2');
    assert.ok(noise2, 'noise 2 es hijo directo de #panel3Layout');
    assert.strictEqual(noise2.style.left, '174.5px');
    assert.strictEqual(noise2.style.transform, 'translate(0px, 638.1px)');
    assert.strictEqual(noise2.style.padding, '0px 4px');
    assert.ok(byId('panel3-random-cv'), 'random CV es hijo directo de #panel3Layout');
    assert.strictEqual(layout.querySelector('.panel3-reserved-row'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupOutputFaders — módulos
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupOutputFaders — módulos', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
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

  it('cada módulo cuelga del panel en su caja, sin filas intermedias', () => {
    const layout = app.outputPanel.element.querySelector('#panel7Layout');
    assert.ok(layout, '#panel7Layout debe existir en outputPanel.element');
    assert.strictEqual(layout.style.transform, '', 'el contenedor ya no se desplaza');
    assert.strictEqual(layout.style.display, '', 'el contenedor ya no es flex');
    const byId = id => [...layout.children].find(el => el.id === id);
    const joyL = byId('joystick-left');
    assert.ok(joyL, 'joystick izquierdo es hijo directo de #panel7Layout');
    assert.strictEqual(joyL.style.left, '37px');
    assert.strictEqual(joyL.style.top, '89px');
    assert.strictEqual(joyL.style.width, '215px');
    assert.strictEqual(byId('sequencer-control').style.left, '254px');
    assert.strictEqual(byId('joystick-right').style.left, '508px');
    // Canales: x = 38,25 + n × 85,5 cabe en la rejilla de 1/64 px → left
    const oc1 = byId('output-channel-1');
    assert.ok(oc1, 'canal 1 es hijo directo de #panel7Layout');
    assert.strictEqual(oc1.style.left, '38.25px');
    assert.strictEqual(oc1.style.top, '329px');
    assert.strictEqual(oc1.style.height, '425px');
    assert.strictEqual(oc1.style.transform, '');
    assert.strictEqual(byId('output-channel-8').style.left, '636.75px');
    assert.strictEqual(layout.querySelector('.panel7-upper-row'), null);
    assert.strictEqual(layout.querySelector('#outputChannelsSection'), null);
  });

  it('las medidas interiores de los canales no se heredan al secuenciador', () => {
    const layout = app.outputPanel.element.querySelector('#panel7Layout');
    const oc1 = layout.querySelector('#output-channel-1');
    assert.strictEqual(oc1.style.getPropertyValue('--oc-button-scale'), '0.85');
    assert.strictEqual(layout.style.getPropertyValue('--oc-button-scale'), '');
    assert.strictEqual(layout.querySelector('#sequencer-control').style.getPropertyValue('--oc-button-scale'), '');
  });

  it('el secuenciador pone cada mando en su caja, relativa al módulo', () => {
    const layout = app.outputPanel.element.querySelector('#panel7Layout');
    const seq = layout.querySelector('#sequencer-control');
    const sw = seq.querySelectorAll('.panel7-seq-switch');
    assert.strictEqual(sw.length, 8);
    // tuerca del interruptor 1 en (269,3, 152,5): caja 13 × 23,25 desde (254, 89)
    assert.strictEqual(sw[0].style.getPropertyValue('--p7-x'), '8.8px');
    assert.strictEqual(sw[0].style.getPropertyValue('--p7-y'), '51.875px');
    assert.strictEqual(sw[0].style.getPropertyValue('--p7-w'), '13px');
    assert.ok(sw[0].classList.contains('p7-placed'));
    assert.strictEqual(seq.querySelectorAll('.panel7-seq-button.p7-placed').length, 8);
    const clock = seq.querySelector('.panel7-seq-clock-knob');
    assert.strictEqual(clock.style.getPropertyValue('--p7-x'), '98.5px');
    assert.strictEqual(clock.style.getPropertyValue('--p7-y'), '173px');
    assert.strictEqual(clock.style.getPropertyValue('--p7-w'), '55px');
  });

  it('cada canal pone su fader en la escala del fondo (raya del 10 en y 583,7)', () => {
    const layout = app.outputPanel.element.querySelector('#panel7Layout');
    for (const id of ['output-channel-1', 'output-channel-8']) {
      const st = layout.querySelector(`#${id}`).style;
      assert.strictEqual(st.getPropertyValue('--oc-fader-left'), '24.5px');
      assert.strictEqual(st.getPropertyValue('--oc-fader-top'), '254.7px');
      assert.strictEqual(st.getPropertyValue('--oc-fader-length'), '143.6px');
      assert.strictEqual(st.getPropertyValue('--oc-fader-cap-h'), '30.1px');
    }
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
