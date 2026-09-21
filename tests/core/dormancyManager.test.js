/**
 * Tests para core/dormancyManager.js — contra la clase real.
 *
 * Hasta septiembre de 2026 este fichero (y dormancySequencer, dormancyRandomCV,
 * dormancyKeyboard y dormancyFilters) probaba una copia de la lógica escrita
 * dentro del test. Ahora se importa `DormancyManager` de `src/` y se le da
 * lo mínimo que necesita del navegador: `localStorage`, `requestAnimationFrame`
 * y un `document` de juguete para el toast de debug.
 *
 * Qué se verifica:
 * - Inicialización y persistencia en localStorage (claves reales)
 * - Qué conexión de Panel 5 / Panel 6 despierta a cada módulo
 * - Que una conexión solo despierta a los módulos que le tocan
 * - Agrupación de cambios por rAF y `flushPendingUpdate`
 * - Toast consolidado solo con debug activo
 * - `_findModule`, `isDormant`, `getStats`, `setEnabled`
 *
 * Los números de fila/columna de los mapas son los de este test: el manager
 * solo lee `sourceMap`/`destMap`, no conoce la numeración real de la matriz.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../mocks/localStorage.mock.js';
import { DormancyManager } from '../../src/assets/js/core/dormancyManager.js';
import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// Entorno mínimo de navegador
// ═══════════════════════════════════════════════════════════════════════════

// requestAnimationFrame controlable: los callbacks se acumulan y se ejecutan
// solo cuando el test llama a runFrames().
const pendingFrames = new Map();
let nextFrameId = 1;
globalThis.requestAnimationFrame = (cb) => {
  const id = nextFrameId++;
  pendingFrames.set(id, cb);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  pendingFrames.delete(id);
};
function runFrames() {
  const callbacks = [...pendingFrames.values()];
  pendingFrames.clear();
  callbacks.forEach(cb => cb(0));
}

// document de juguete: showToast solo necesita un elemento donde escribir.
// Se guardan los mensajes para poder comprobarlos.
const toastMessages = [];
const fakeToastElement = {
  id: 'appToast',
  className: '',
  classList: { add() {}, remove() {} },
  set textContent(value) { toastMessages.push(value); }
};
globalThis.document = {
  getElementById: () => fakeToastElement,
  createElement: () => fakeToastElement,
  body: { appendChild() {} }
};

// ═══════════════════════════════════════════════════════════════════════════
// Módulos y app simulados
// ═══════════════════════════════════════════════════════════════════════════

/** Módulo con setDormant que registra cada llamada. */
function createMockModule(id) {
  return {
    id,
    _isDormant: false,
    calls: [],
    setDormant(dormant) {
      this._isDormant = dormant;
      this.calls.push(dormant);
    }
  };
}

function createMockApp() {
  // Panel 5 (audio): filas = fuentes, columnas = destinos
  const panel5SourceMap = new Map([
    [22, { kind: 'noiseGen', index: 0 }],
    [23, { kind: 'noiseGen', index: 1 }],
    [24, { kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' }],
    [25, { kind: 'panel3Osc', oscIndex: 0, channelId: 'triPulse' }],
    [26, { kind: 'panel3Osc', oscIndex: 1, channelId: 'sineSaw' }],
    [27, { kind: 'panel3Osc', oscIndex: 1, channelId: 'triPulse' }],
    [30, { kind: 'inputAmp', channel: 0 }],
    [31, { kind: 'inputAmp', channel: 1 }],
    [43, { kind: 'filterLP', index: 0 }],
    [44, { kind: 'filterLP', index: 1 }],
    [45, { kind: 'filterLP', index: 2 }],
    [46, { kind: 'filterLP', index: 3 }],
    [47, { kind: 'filterHP', index: 0 }],
    [48, { kind: 'filterHP', index: 1 }],
    [49, { kind: 'filterHP', index: 2 }],
    [50, { kind: 'filterHP', index: 3 }],
    [60, { kind: 'reverberation', index: 0 }],
    [61, { kind: 'octaveFilterBank' }],
    [62, { kind: 'ringModulator', index: 0 }],
    [63, { kind: 'ringModulator', index: 1 }],
    [64, { kind: 'ringModulator', index: 2 }],
    [87, { kind: 'sequencer', channel: 0 }],
    [88, { kind: 'sequencer', channel: 1 }]
  ]);

  const panel5DestMap = new Map([
    [8, { kind: 'pitchToVoltageConverterInput' }],
    [10, { kind: 'reverbInput', index: 0 }],
    [11, { kind: 'octaveFilterBankInput' }],
    [12, { kind: 'ringModInputA', index: 0 }],
    [13, { kind: 'ringModInputB', index: 0 }],
    [14, { kind: 'filterLPInput', index: 0 }],
    [15, { kind: 'filterLPInput', index: 1 }],
    [16, { kind: 'filterLPInput', index: 2 }],
    [17, { kind: 'filterLPInput', index: 3 }],
    [18, { kind: 'filterHPInput', index: 0 }],
    [19, { kind: 'filterHPInput', index: 1 }],
    [20, { kind: 'filterHPInput', index: 2 }],
    [21, { kind: 'filterHPInput', index: 3 }],
    [36, { kind: 'outputBus', bus: 1 }],
    [37, { kind: 'outputBus', bus: 2 }],
    [38, { kind: 'outputBus', bus: 3 }],
    [39, { kind: 'outputBus', bus: 4 }],
    [40, { kind: 'outputBus', bus: 5 }],
    [41, { kind: 'outputBus', bus: 6 }],
    [42, { kind: 'outputBus', bus: 7 }],
    [43, { kind: 'outputBus', bus: 8 }],
    [51, { kind: 'sequencerControl', controlType: 'clock' }],
    [52, { kind: 'sequencerControl', controlType: 'reset' }],
    [56, { kind: 'oscilloscope', channel: 'X' }],
    [57, { kind: 'oscilloscope', channel: 'Y' }]
  ]);

  // Panel 6 (control)
  const panel6SourceMap = new Map([
    [89, { kind: 'randomCV', output: 'key' }],
    [90, { kind: 'randomCV', output: 'voltage1' }],
    [91, { kind: 'randomCV', output: 'voltage2' }],
    [92, { kind: 'keyboardUpper', output: 'pitch' }],
    [93, { kind: 'keyboardUpper', output: 'velocity' }],
    [94, { kind: 'keyboardUpper', output: 'gate' }],
    [95, { kind: 'keyboardLower', output: 'pitch' }],
    [96, { kind: 'keyboardLower', output: 'velocity' }],
    [97, { kind: 'keyboardLower', output: 'gate' }],
    [100, { kind: 'sequencer', output: 'voltageA' }],
    [102, { kind: 'sequencer', output: 'key1' }],
    [110, { kind: 'sequencer', output: 'clockRate' }],
    [111, { kind: 'joystick', side: 'left', axis: 'x' }],
    [112, { kind: 'joystick', side: 'left', axis: 'y' }],
    [113, { kind: 'joystick', side: 'right', axis: 'x' }],
    [114, { kind: 'joystick', side: 'right', axis: 'y' }],
    [115, { kind: 'pitchToVoltageConverter', output: 'pitch' }]
  ]);

  const panel6DestMap = new Map([
    [21, { kind: 'filterLPCutoffCV', index: 0 }],
    [22, { kind: 'filterLPCutoffCV', index: 1 }],
    [23, { kind: 'filterLPCutoffCV', index: 2 }],
    [24, { kind: 'filterLPCutoffCV', index: 3 }],
    [25, { kind: 'filterHPCutoffCV', index: 0 }],
    [26, { kind: 'filterHPCutoffCV', index: 1 }],
    [27, { kind: 'filterHPCutoffCV', index: 2 }],
    [28, { kind: 'filterHPCutoffCV', index: 3 }],
    [29, { kind: 'reverbMixCV', index: 0 }],
    [30, { kind: 'oscFreqCV', oscIndex: 0 }],
    [31, { kind: 'oscFreqCV', oscIndex: 1 }],
    [42, { kind: 'outputBus', bus: 1 }],
    [43, { kind: 'outputBus', bus: 2 }],
    [44, { kind: 'outputBus', bus: 3 }],
    [45, { kind: 'outputBus', bus: 4 }],
    [56, { kind: 'oscilloscope', channel: 'X' }],
    [57, { kind: 'oscilloscope', channel: 'Y' }],
    [60, { kind: 'sequencerInput', inputType: 'voltageACE' }],
    [61, { kind: 'sequencerInput', inputType: 'voltageBDF' }],
    [62, { kind: 'sequencerInput', inputType: 'key' }]
  ]);

  const octaveFilterBank = createMockModule('panel2-octave-filter-bank');

  return {
    _panel3Routing: { connections: {}, sourceMap: panel5SourceMap, destMap: panel5DestMap },
    _panel6Routing: { connections: {}, sourceMap: panel6SourceMap, destMap: panel6DestMap },
    // Solo 3 osciladores construidos: osc-3..8 no existen en esta app
    _panelAudios: {
      3: { nodes: [createMockModule('osc-0'), createMockModule('osc-1'), createMockModule('osc-2')] }
    },
    _panel3LayoutData: {
      noiseAudioModules: { noise1: createMockModule('noise-1'), noise2: createMockModule('noise-2') },
      randomCVAudio: createMockModule('random-cv')
    },
    _keyboardModules: { upper: createMockModule('keyboard-upper'), lower: createMockModule('keyboard-lower') },
    _panel1FilterModules: {
      flp1: createMockModule('filter-lp-1'), flp2: createMockModule('filter-lp-2'),
      flp3: createMockModule('filter-lp-3'), flp4: createMockModule('filter-lp-4'),
      fhp1: createMockModule('filter-hp-1'), fhp2: createMockModule('filter-hp-2'),
      fhp3: createMockModule('filter-hp-3'), fhp4: createMockModule('filter-hp-4')
    },
    _panel1ReverbModule: createMockModule('spring-reverb'),
    _panel1RingModModules: [createMockModule('ring-mod-1'), createMockModule('ring-mod-2'), createMockModule('ring-mod-3')],
    _joystickModules: { left: createMockModule('joystick-left'), right: createMockModule('joystick-right') },
    _sequencerModule: createMockModule('sequencer'),
    _pvcModule: createMockModule('pitch-to-voltage-converter'),
    oscilloscope: createMockModule('oscilloscope'),
    inputAmplifiers: createMockModule('input-amplifiers'),
    engine: {
      outputBuses: Array.from({ length: 8 }, (_, i) => createMockModule(`output-channel-${i + 1}`)),
      // El OFB no tiene gancho propio en _findModule: llega por engine.findModule
      findModule: (id) => (id === 'panel2-octave-filter-bank' ? octaveFilterBank : null)
    }
  };
}

/** Todos los módulos con estado registrado que NO están dormant. */
function activeModules(manager) {
  return [...manager._moduleStates.entries()]
    .filter(([, state]) => !state.isDormant)
    .map(([id]) => id)
    .sort();
}

/** Módulos con estado registrado: 3 osc + 2 noise + RCV + 2 teclados + 8 filtros
 *  + reverb + OFB + 3 ring mod + input amps + scope + 8 salidas + 2 joysticks
 *  + sequencer + PVC. */
const TOTAL_TRACKED = 35;

function freshManager() {
  localStorage.clear();
  pendingFrames.clear();
  toastMessages.length = 0;
  const app = createMockApp();
  const manager = new DormancyManager(app);
  return { app, manager };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DormancyManager — inicialización y persistencia', () => {
  beforeEach(() => { localStorage.clear(); });

  it('está habilitado por defecto y sin debug', () => {
    const manager = new DormancyManager(createMockApp());
    assert.equal(manager.isEnabled(), true);
    assert.equal(manager.hasDebugIndicators(), false);
  });

  it('lee enabled=false de localStorage con la clave real', () => {
    localStorage.setItem(STORAGE_KEYS.DORMANCY_ENABLED, 'false');
    const manager = new DormancyManager(createMockApp());
    assert.equal(manager.isEnabled(), false);
  });

  it('lee debug=true de localStorage con la clave real', () => {
    localStorage.setItem(STORAGE_KEYS.DORMANCY_DEBUG, 'true');
    const manager = new DormancyManager(createMockApp());
    assert.equal(manager.hasDebugIndicators(), true);
  });

  it('setEnabled persiste el valor', () => {
    const manager = new DormancyManager(createMockApp());
    manager.setEnabled(false);
    assert.equal(localStorage.getItem(STORAGE_KEYS.DORMANCY_ENABLED), 'false');
    manager.setEnabled(true);
    assert.equal(localStorage.getItem(STORAGE_KEYS.DORMANCY_ENABLED), 'true');
  });

  it('setEnabled con el mismo valor no escribe nada', () => {
    const manager = new DormancyManager(createMockApp());
    manager.setEnabled(true); // ya estaba a true
    assert.equal(localStorage.getItem(STORAGE_KEYS.DORMANCY_ENABLED), null);
  });

  it('setDebugIndicators persiste el valor', () => {
    const manager = new DormancyManager(createMockApp());
    manager.setDebugIndicators(true);
    assert.equal(localStorage.getItem(STORAGE_KEYS.DORMANCY_DEBUG), 'true');
  });
});

describe('DormancyManager — sin conexiones', () => {
  it('todos los módulos existentes duermen', () => {
    const { manager } = freshManager();
    manager.updateAllStates();
    assert.deepEqual(activeModules(manager), []);
    assert.deepEqual(manager.getStats(), { total: TOTAL_TRACKED, dormant: TOTAL_TRACKED, active: 0 });
  });

  it('cada módulo recibe setDormant(true) una sola vez', () => {
    const { app, manager } = freshManager();
    manager.updateAllStates();
    manager.updateAllStates();
    assert.deepEqual(app._panelAudios[3].nodes[0].calls, [true]);
    assert.deepEqual(app.engine.outputBuses[7].calls, [true]);
    assert.deepEqual(app._sequencerModule.calls, [true]);
  });

  it('los osciladores no construidos (osc-3..8) se omiten', () => {
    const { manager } = freshManager();
    manager.updateAllStates();
    assert.equal(manager._moduleStates.has('osc-2'), true);
    assert.equal(manager._moduleStates.has('osc-3'), false);
    assert.equal(manager.isDormant('osc-8'), false);
  });

  it('un módulo sin setDormant registra estado sin fallar', () => {
    const { app, manager } = freshManager();
    // Como InputAmplifiers real, que no implementa setDormant
    app.inputAmplifiers = {};
    assert.doesNotThrow(() => manager.updateAllStates());
    assert.equal(manager.isDormant('input-amplifiers'), true);
  });
});

describe('DormancyManager — qué conexión despierta a cada módulo', () => {
  // [módulo, panel, 'fila:columna', descripción]
  const CASES = [
    ['osc-0', 5, '24:36', 'salida sineSaw del osc 0 → output 1'],
    ['osc-0', 5, '25:56', 'salida triPulse del osc 0 → scope X'],
    ['osc-1', 5, '27:37', 'salida triPulse del osc 1 → output 2'],
    ['noise-1', 5, '22:36', 'noise 1 → output 1'],
    ['noise-2', 5, '23:38', 'noise 2 → output 3'],
    ['input-amplifiers', 5, '30:36', 'input amp 1 → output 1'],
    ['input-amplifiers', 5, '31:37', 'input amp 2 → output 2'],
    ['oscilloscope', 5, '24:56', 'audio → scope X (Panel 5)'],
    ['oscilloscope', 5, '22:57', 'audio → scope Y (Panel 5)'],
    ['oscilloscope', 6, '89:56', 'control → scope X (Panel 6)'],
    ['output-channel-1', 5, '24:36', 'audio → output 1'],
    ['output-channel-8', 5, '22:43', 'audio → output 8'],
    ['output-channel-1', 6, '89:42', 'voltage input del output 1 (Panel 6)'],
    ['output-channel-4', 6, '111:45', 'voltage input del output 4 (Panel 6)'],
    ['random-cv', 6, '89:30', 'RCV key → CV'],
    ['random-cv', 6, '90:30', 'RCV voltage 1 → CV'],
    ['random-cv', 6, '91:31', 'RCV voltage 2 → CV'],
    ['keyboard-upper', 6, '92:30', 'teclado superior: pitch'],
    ['keyboard-upper', 6, '94:30', 'teclado superior: gate'],
    ['keyboard-lower', 6, '95:30', 'teclado inferior: pitch'],
    ['keyboard-lower', 6, '97:31', 'teclado inferior: gate'],
    ['filter-lp-1', 5, '43:36', 'salida del LP 1'],
    ['filter-lp-4', 5, '46:36', 'salida del LP 4'],
    ['filter-hp-2', 5, '24:19', 'entrada de audio del HP 2'],
    ['filter-lp-3', 6, '90:23', 'CV de cutoff del LP 3'],
    ['filter-hp-4', 6, '90:28', 'CV de cutoff del HP 4'],
    ['spring-reverb', 5, '60:36', 'salida de la reverb'],
    ['spring-reverb', 5, '24:10', 'entrada de la reverb'],
    ['spring-reverb', 6, '89:29', 'CV de mix de la reverb'],
    ['panel2-octave-filter-bank', 5, '61:36', 'salida del OFB'],
    ['panel2-octave-filter-bank', 5, '24:11', 'entrada del OFB'],
    ['ring-mod-1', 5, '62:36', 'salida del ring mod 1'],
    ['ring-mod-1', 5, '24:12', 'entrada A del ring mod 1'],
    ['ring-mod-1', 5, '24:13', 'entrada B del ring mod 1'],
    ['ring-mod-3', 5, '64:36', 'salida del ring mod 3'],
    ['joystick-left', 6, '111:30', 'joystick izquierdo, eje X'],
    ['joystick-left', 6, '112:30', 'joystick izquierdo, eje Y'],
    ['joystick-right', 6, '114:31', 'joystick derecho, eje Y'],
    ['sequencer', 5, '87:36', 'DAC 1 del secuenciador → output'],
    ['sequencer', 5, '88:37', 'DAC 2 del secuenciador → output'],
    ['sequencer', 5, '24:51', 'entrada clock del secuenciador'],
    ['sequencer', 5, '22:52', 'entrada reset del secuenciador'],
    ['sequencer', 6, '100:30', 'voltage A del secuenciador → CV'],
    ['sequencer', 6, '110:30', 'clock rate del secuenciador → CV'],
    ['sequencer', 6, '89:60', 'entrada voltage ACE del secuenciador'],
    ['sequencer', 6, '92:62', 'entrada key del secuenciador'],
    ['pitch-to-voltage-converter', 5, '24:8', 'audio → entrada del PVC'],
    ['pitch-to-voltage-converter', 6, '115:30', 'salida del PVC → CV']
  ];

  for (const [moduleId, panel, key, description] of CASES) {
    it(`${moduleId} despierta con ${description} (P${panel} ${key})`, () => {
      const { app, manager } = freshManager();
      const routing = panel === 5 ? app._panel3Routing : app._panel6Routing;
      routing.connections[key] = {};
      manager.updateAllStates();
      assert.equal(manager.isDormant(moduleId), false);
      assert.equal(manager._findModule(moduleId)._isDormant, false);
    });
  }

  it('una conexión solo despierta a los módulos implicados', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
    manager.updateAllStates();
    assert.deepEqual(activeModules(manager), ['osc-0', 'output-channel-1']);
  });

  it('una conexión de Panel 6 no despierta módulos de audio', () => {
    const { manager, app } = freshManager();
    app._panel6Routing.connections['92:30'] = {}; // teclado superior → osc freq CV
    manager.updateAllStates();
    assert.deepEqual(activeModules(manager), ['keyboard-upper']);
  });

  it('una conexión sin fuente ni destino conocidos no despierta nada', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['1:1'] = {};
    app._panel6Routing.connections['1:1'] = {};
    manager.updateAllStates();
    assert.deepEqual(activeModules(manager), []);
  });

  it('varias conexiones acumulan módulos activos', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {}; // osc-0 → output-1
    app._panel3Routing.connections['22:37'] = {}; // noise-1 → output-2
    app._panel6Routing.connections['111:30'] = {}; // joystick izq → CV
    manager.updateAllStates();
    assert.deepEqual(activeModules(manager),
      ['joystick-left', 'noise-1', 'osc-0', 'output-channel-1', 'output-channel-2']);
  });
});

describe('DormancyManager — transiciones', () => {
  it('solo llama a setDormant cuando el estado cambia', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    manager.updateAllStates();
    const osc0 = app._panelAudios[3].nodes[0];
    assert.deepEqual(osc0.calls, [false]);

    app._panel3Routing.connections['22:37'] = {}; // otra conexión, osc-0 sigue activo
    manager.updateAllStates();
    assert.deepEqual(osc0.calls, [false]);
    assert.deepEqual(app._panel3LayoutData.noiseAudioModules.noise1.calls, [true, false]);
  });

  it('el módulo vuelve a dormir al desconectar', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    manager.updateAllStates();
    assert.equal(manager.isDormant('osc-0'), false);

    delete app._panel3Routing.connections['24:36'];
    manager.updateAllStates();
    assert.equal(manager.isDormant('osc-0'), true);
    assert.deepEqual(app._panelAudios[3].nodes[0].calls, [false, true]);
  });

  it('un módulo con varias conexiones sigue activo mientras quede una', () => {
    const { manager, app } = freshManager();
    app._panel6Routing.connections['89:30'] = {};
    app._panel6Routing.connections['90:31'] = {};
    manager.updateAllStates();
    delete app._panel6Routing.connections['89:30'];
    manager.updateAllStates();
    assert.equal(manager.isDormant('random-cv'), false);
    delete app._panel6Routing.connections['90:31'];
    manager.updateAllStates();
    assert.equal(manager.isDormant('random-cv'), true);
  });

  it('reset → patch: pasa por dormant y vuelve a activo', () => {
    const { manager, app } = freshManager();
    const noise1 = app._panel3LayoutData.noiseAudioModules.noise1;
    app._panel3Routing.connections['22:36'] = {};
    manager.updateAllStates();
    delete app._panel3Routing.connections['22:36']; // reset
    manager.updateAllStates();
    assert.equal(noise1._isDormant, true);
    app._panel3Routing.connections['22:37'] = {}; // patch nuevo
    manager.updateAllStates();
    assert.equal(noise1._isDormant, false);
    assert.deepEqual(noise1.calls, [false, true, false]);
  });

  it('isDormant es false para un módulo sin estado registrado', () => {
    const { manager } = freshManager();
    assert.equal(manager.isDormant('osc-0'), false);
    assert.equal(manager.isDormant('lo-que-sea'), false);
  });
});

describe('DormancyManager — setEnabled', () => {
  it('deshabilitar despierta todo y vacía los estados', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    manager.updateAllStates();
    assert.equal(manager.isDormant('osc-1'), true);

    manager.setEnabled(false);
    assert.equal(app._panelAudios[3].nodes[1]._isDormant, false);
    assert.equal(app.engine.outputBuses[3]._isDormant, false);
    assert.deepEqual(manager.getStats(), { total: 0, dormant: 0, active: 0 });
    // osc-0 ya estaba activo: no recibe otra llamada
    assert.deepEqual(app._panelAudios[3].nodes[0].calls, [false]);
  });

  it('deshabilitado, updateAllStates y onConnectionChange no hacen nada', () => {
    const { manager, app } = freshManager();
    manager.setEnabled(false);
    manager.updateAllStates();
    manager.onConnectionChange();
    manager.flushPendingUpdate();
    assert.equal(pendingFrames.size, 0);
    assert.deepEqual(app._panelAudios[3].nodes[0].calls, []);
    assert.deepEqual(manager.getStats(), { total: 0, dormant: 0, active: 0 });
  });

  it('volver a habilitar recalcula el estado', () => {
    const { manager, app } = freshManager();
    manager.setEnabled(false);
    app._panel3Routing.connections['24:36'] = {};
    manager.setEnabled(true);
    assert.deepEqual(activeModules(manager), ['osc-0', 'output-channel-1']);
    assert.equal(manager.isDormant('osc-1'), true);
  });
});

describe('DormancyManager — agrupación por requestAnimationFrame', () => {
  it('onConnectionChange difiere la actualización a un frame', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    manager.onConnectionChange();
    assert.equal(manager.getStats().total, 0);
    runFrames();
    assert.deepEqual(activeModules(manager), ['osc-0', 'output-channel-1']);
  });

  it('varios cambios seguidos se agrupan en un solo frame', () => {
    const { manager, app } = freshManager();
    manager.onConnectionChange();
    manager.onConnectionChange();
    manager.onConnectionChange();
    assert.equal(pendingFrames.size, 1);
    runFrames();
    assert.deepEqual(app._panelAudios[3].nodes[0].calls, [true]);
    // Tras el frame se puede volver a programar
    manager.onConnectionChange();
    assert.equal(pendingFrames.size, 1);
  });

  it('flushPendingUpdate cancela el frame y actualiza en el acto', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['22:36'] = {};
    manager.onConnectionChange();
    manager.flushPendingUpdate();
    assert.equal(pendingFrames.size, 0);
    assert.equal(manager.isDormant('noise-1'), false);
    // El frame cancelado no vuelve a aplicar nada
    runFrames();
    assert.deepEqual(app._panel3LayoutData.noiseAudioModules.noise1.calls, [false]);
  });

  it('flushPendingUpdate sin frame pendiente también actualiza', () => {
    const { manager } = freshManager();
    manager.flushPendingUpdate();
    assert.equal(manager.getStats().total, TOTAL_TRACKED);
  });
});

describe('DormancyManager — toast de debug', () => {
  it('sin debug no muestra ningún toast', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    manager.updateAllStates();
    assert.deepEqual(toastMessages, []);
  });

  it('con debug muestra un toast consolidado con despiertos y dormidos', () => {
    const { manager, app } = freshManager();
    manager.setDebugIndicators(true);
    toastMessages.length = 0; // setDebugIndicators ya muestra el estado actual
    app._panel3Routing.connections['24:36'] = {};
    manager.updateAllStates();
    assert.equal(toastMessages.length, 1);
    const [message] = toastMessages;
    assert.match(message, /🔊 osc-0, output-channel-1/);
    assert.match(message, /💤 .*osc-1/);
    assert.match(message, /💤 .*sequencer/);
    assert.equal(manager._pendingChanges, null);
  });

  it('con debug y sin cambios no muestra toast', () => {
    const { manager } = freshManager();
    manager.setDebugIndicators(true);
    manager.updateAllStates();
    toastMessages.length = 0;
    manager.updateAllStates();
    assert.deepEqual(toastMessages, []);
  });

  it('activar debug muestra el resumen del estado actual', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    app._panel3Routing.connections['22:56'] = {};
    manager.setDebugIndicators(true);
    assert.equal(toastMessages.length, 1);
    assert.match(toastMessages[0], /OSCs: 1\/9/);
    assert.match(toastMessages[0], /Outputs: 1\/8/);
    assert.match(toastMessages[0], /Scope/);
    assert.match(toastMessages[0], /Noise/);
  });
});

describe('DormancyManager — _findModule', () => {
  it('resuelve cada tipo de módulo a su objeto en la app', () => {
    const { manager, app } = freshManager();
    const expected = {
      'osc-0': app._panelAudios[3].nodes[0],
      'osc-2': app._panelAudios[3].nodes[2],
      'noise-1': app._panel3LayoutData.noiseAudioModules.noise1,
      'noise-2': app._panel3LayoutData.noiseAudioModules.noise2,
      'random-cv': app._panel3LayoutData.randomCVAudio,
      'keyboard-upper': app._keyboardModules.upper,
      'keyboard-lower': app._keyboardModules.lower,
      'filter-lp-1': app._panel1FilterModules.flp1,
      'filter-lp-4': app._panel1FilterModules.flp4,
      'filter-hp-2': app._panel1FilterModules.fhp2,
      'spring-reverb': app._panel1ReverbModule,
      'ring-mod-1': app._panel1RingModModules[0],
      'ring-mod-3': app._panel1RingModModules[2],
      'oscilloscope': app.oscilloscope,
      'input-amplifiers': app.inputAmplifiers,
      'output-channel-1': app.engine.outputBuses[0],
      'output-channel-8': app.engine.outputBuses[7],
      'joystick-left': app._joystickModules.left,
      'joystick-right': app._joystickModules.right,
      'sequencer': app._sequencerModule,
      'pitch-to-voltage-converter': app._pvcModule,
      'panel2-octave-filter-bank': app.engine.findModule('panel2-octave-filter-bank')
    };
    for (const [id, module] of Object.entries(expected)) {
      assert.strictEqual(manager._findModule(id), module, id);
    }
  });

  it('devuelve null o undefined para lo que no existe', () => {
    const { manager, app } = freshManager();
    assert.equal(manager._findModule('unknown-module'), null);
    assert.equal(manager._findModule('osc-7'), undefined);
    assert.equal(manager._findModule('filter-lp-9'), null);
    delete app._sequencerModule;
    assert.equal(manager._findModule('sequencer'), null);
  });

  it('funciona con una app a medio construir', () => {
    localStorage.clear();
    const manager = new DormancyManager({});
    assert.doesNotThrow(() => manager.updateAllStates());
    assert.equal(manager._findModule('osc-0'), undefined);
    assert.equal(manager._findModule('output-channel-1'), undefined);
    assert.equal(manager._findModule('spring-reverb'), null);
    assert.equal(manager._findModule('panel2-octave-filter-bank'), null);
  });
});

describe('DormancyManager — getStats', () => {
  it('cuenta dormidos y activos', () => {
    const { manager, app } = freshManager();
    app._panel3Routing.connections['24:36'] = {};
    app._panel6Routing.connections['89:30'] = {};
    manager.updateAllStates();
    assert.deepEqual(manager.getStats(),
      { total: TOTAL_TRACKED, dormant: TOTAL_TRACKED - 3, active: 3 });
  });
});
