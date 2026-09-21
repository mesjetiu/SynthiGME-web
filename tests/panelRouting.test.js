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

// ─────────────────────────────────────────────────────────────────────────────
// Dormancy de osciladores: entry.setDormant que crea ensurePanelNodes
// ─────────────────────────────────────────────────────────────────────────────
// Es lo que DormancyManager llama para 'panelN-oscM'. Sin test hasta
// septiembre de 2026. Se usa el AudioEngine real con AudioContext mock y un
// AudioWorkletNode falso que expone los AudioParams del worklet, para que
// createMultiOscillator() construya el oscilador de verdad.
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach } from 'node:test';
import { AudioEngine } from '../src/assets/js/core/engine.js';
import { createMockAudioContext, createMockAudioParam } from './mocks/audioContext.mock.js';

const OSC_PARAMS = ['frequency', 'pulseWidth', 'symmetry', 'sineLevel', 'sawLevel', 'triLevel', 'pulseLevel', 'detune', 'threshold'];

class ParamAwareWorkletNode {
  constructor(ctx, name, options) {
    this._name = name;
    this._options = options;
    this.parameters = new Map(OSC_PARAMS.map(p => {
      const param = createMockAudioParam(0);
      const original = param.setTargetAtTime.bind(param);
      param.setTargetAtTime = (value, startTime, timeConstant) => {
        param._lastTimeConstant = timeConstant;
        return original(value, startTime, timeConstant);
      };
      return [p, param];
    }));
    this.port = { _messages: [], onmessage: null, postMessage(m) { this._messages.push(m); } };
    this._connections = [];
  }
  connect(dest, output = 0, input = 0) { this._connections.push({ dest, output, input }); return dest; }
  disconnect() { this._connections = []; }
  addEventListener() {}
}
globalThis.AudioWorkletNode = ParamAwareWorkletNode;

describe('Dormancy de osciladores (ensurePanelNodes → entry.setDormant)', () => {
  const realLog = console.log;
  const realWarn = console.warn;
  let engine, panelAudio;

  function buildRealApp() {
    engine = new AudioEngine({ outputChannels: 8 });
    engine.start({ audioContext: createMockAudioContext({ maxChannelCount: 2 }) });
    engine.workletReady = true;
    panelAudio = { nodes: [], state: [] };
    return {
      engine,
      _getPanelAudio: () => panelAudio,
      _getOscConfig: () => ({}),
      _scheduleWorkletRetry: () => {},
    };
  }

  function levelsOf(multiOsc) {
    return ['sineLevel', 'sawLevel', 'triLevel', 'pulseLevel'].map(p => multiOsc.parameters.get(p).value);
  }

  beforeEach(() => { console.log = () => {}; console.warn = () => {}; });
  afterEach(() => { console.log = realLog; console.warn = realWarn; });

  it('la entrada creada tiene setDormant y arranca activa', () => {
    const app = buildRealApp();
    const entry = ensurePanelNodes(3, 0, app);
    assert.ok(entry, 'ensurePanelNodes debe crear la entrada con el worklet listo');
    assert.equal(entry.multiOsc._name, 'synth-oscillator');
    assert.equal(typeof entry.setDormant, 'function');
    assert.equal(entry._isDormant, false);
    assert.equal(panelAudio.nodes[0], entry);
  });

  it('dormant avisa al worklet (early exit) y lleva los cuatro niveles a 0 con rampa de 10 ms', () => {
    const app = buildRealApp();
    panelAudio.state[2] = { freq: 100, oscLevel: 0.8, sawLevel: 0.6, triLevel: 0.4, pulseLevel: 0.2 };
    const entry = ensurePanelNodes(3, 2, app);
    assert.deepEqual(levelsOf(entry.multiOsc), [0.8, 0.6, 0.4, 0.2], 'niveles iniciales desde el estado');

    const sine = entry.multiOsc.parameters.get('sineLevel');
    const before = sine._calls.setTargetAtTime;
    entry.setDormant(true);

    assert.equal(entry._isDormant, true);
    assert.deepEqual(entry.multiOsc.port._messages.at(-1), { type: 'setDormant', dormant: true });
    assert.deepEqual(levelsOf(entry.multiOsc), [0, 0, 0, 0]);
    assert.equal(sine._calls.setTargetAtTime, before + 1);
    assert.equal(sine._lastTimeConstant, 0.01);
  });

  it('activar restaura los niveles del estado del oscilador y avisa al worklet', () => {
    const app = buildRealApp();
    panelAudio.state[1] = { freq: 100, oscLevel: 0.8, sawLevel: 0.6, triLevel: 0.4, pulseLevel: 0.2 };
    const entry = ensurePanelNodes(3, 1, app);
    entry.setDormant(true);
    entry.setDormant(false);

    assert.equal(entry._isDormant, false);
    assert.deepEqual(entry.multiOsc.port._messages.at(-1), { type: 'setDormant', dormant: false });
    assert.deepEqual(levelsOf(entry.multiOsc), [0.8, 0.6, 0.4, 0.2]);
  });

  it('al despertar recoge el nivel que el usuario cambió en el estado mientras dormía', () => {
    const app = buildRealApp();
    panelAudio.state[0] = { freq: 100, oscLevel: 0.5, sawLevel: 0, triLevel: 0, pulseLevel: 0 };
    const entry = ensurePanelNodes(3, 0, app);
    entry.setDormant(true);
    panelAudio.state[0].oscLevel = 0.9;
    panelAudio.state[0].pulseLevel = 0.3;
    entry.setDormant(false);
    assert.deepEqual(levelsOf(entry.multiOsc), [0.9, 0, 0, 0.3]);
  });

  it('al despertar ignora los niveles que no sean números finitos', () => {
    const app = buildRealApp();
    panelAudio.state[0] = { freq: 100, oscLevel: 0.5, sawLevel: 0.5, triLevel: 0.5, pulseLevel: 0.5 };
    const entry = ensurePanelNodes(3, 0, app);
    entry.setDormant(true);
    panelAudio.state[0].oscLevel = NaN;
    panelAudio.state[0].sawLevel = undefined;
    panelAudio.state[0].triLevel = 'alto';
    entry.setDormant(false);
    assert.deepEqual(levelsOf(entry.multiOsc), [0, 0, 0, 0.5], 'solo pulseLevel vuelve; los demás se quedan en 0');
  });

  it('sin estado guardado, despertar deja los niveles a 0 pero avisa al worklet', () => {
    const app = buildRealApp();
    const entry = ensurePanelNodes(3, 0, app);
    entry.setDormant(true);
    panelAudio.state[0] = null;
    entry.setDormant(false);
    assert.deepEqual(levelsOf(entry.multiOsc), [0, 0, 0, 0]);
    assert.deepEqual(entry.multiOsc.port._messages.at(-1), { type: 'setDormant', dormant: false });
  });

  it('repetir el mismo estado es un no-op (ni mensajes ni rampas)', () => {
    const app = buildRealApp();
    const entry = ensurePanelNodes(3, 0, app);
    const sine = entry.multiOsc.parameters.get('sineLevel');
    const msgs = entry.multiOsc.port._messages.length;
    const ramps = sine._calls.setTargetAtTime;
    entry.setDormant(false);
    assert.equal(entry.multiOsc.port._messages.length, msgs);
    assert.equal(sine._calls.setTargetAtTime, ramps);
    entry.setDormant(true);
    const afterSleep = entry.multiOsc.port._messages.length;
    entry.setDormant(true);
    assert.equal(entry.multiOsc.port._messages.length, afterSleep);
  });

  it('un puerto que falla no impide silenciar el oscilador', () => {
    const app = buildRealApp();
    panelAudio.state[0] = { freq: 100, oscLevel: 0.7, sawLevel: 0, triLevel: 0, pulseLevel: 0 };
    const entry = ensurePanelNodes(3, 0, app);
    entry.multiOsc.port.postMessage = () => { throw new Error('port closed'); };
    assert.doesNotThrow(() => entry.setDormant(true));
    assert.equal(entry._isDormant, true);
    assert.deepEqual(levelsOf(entry.multiOsc), [0, 0, 0, 0]);
  });

  it('cada oscilador del panel duerme por separado', () => {
    const app = buildRealApp();
    panelAudio.state[0] = { freq: 100, oscLevel: 0.5, sawLevel: 0, triLevel: 0, pulseLevel: 0 };
    panelAudio.state[1] = { freq: 100, oscLevel: 0.6, sawLevel: 0, triLevel: 0, pulseLevel: 0 };
    const a = ensurePanelNodes(3, 0, app);
    const b = ensurePanelNodes(3, 1, app);
    a.setDormant(true);
    assert.equal(a._isDormant, true);
    assert.equal(b._isDormant, false);
    assert.deepEqual(levelsOf(a.multiOsc), [0, 0, 0, 0]);
    assert.deepEqual(levelsOf(b.multiOsc), [0.6, 0, 0, 0]);
    assert.equal(b.multiOsc.port._messages.filter(m => m.type === 'setDormant').length, 0);
  });

  it('la entrada se reutiliza: volver a pedirla devuelve el mismo setDormant y estado', () => {
    const app = buildRealApp();
    const entry = ensurePanelNodes(3, 0, app);
    entry.setDormant(true);
    const again = ensurePanelNodes(3, 0, app);
    assert.equal(again, entry);
    assert.equal(again._isDormant, true);
  });
});
