/**
 * Tests de midi/midiAccess.js y midi/midiLearnManager.js — contra el código real.
 *
 * Hasta septiembre de 2026 este fichero "replicaba" el parsing de mensajes,
 * la construcción de claves, la conversión de valores y la gestión de
 * mappings en funciones locales, con la excusa de que los módulos tenían
 * efectos de navegador. Pasaba aunque el código real cambiara.
 *
 * Ahora importa los dos singletons de verdad. Lo único que hace falta es un
 * `document` mínimo (dispatchEvent, getElementById), `CustomEvent`, un
 * `navigator.requestMIDIAccess` falso y el `localStorage` en memoria de
 * tests/mocks. La app se simula con `_findModuleById`, que es lo único que
 * el manager le pide.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import '../mocks/localStorage.mock.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENTORNO MÍNIMO DE NAVEGADOR
// ─────────────────────────────────────────────────────────────────────────────

/** Eventos despachados en `document` durante el test actual. */
const events = [];

globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

globalThis.document = {
  dispatchEvent(ev) { events.push(ev); return true; },
  getElementById() { return null; },
  createElement() { throw new Error('createElement no debería usarse en estos tests'); }
};

function eventsOfType(type) {
  return events.filter(e => e.type === type);
}

function lastEvent(type) {
  return eventsOfType(type).at(-1);
}

const { midiAccess } = await import('../../src/assets/js/midi/midiAccess.js');
const { midiLearnManager } = await import('../../src/assets/js/midi/midiLearnManager.js');
const { STORAGE_KEYS } = await import('../../src/assets/js/utils/constants.js');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Elemento DOM falso: solo la classList que usan el manager y flashGlow. */
function fakeEl() {
  const classes = new Set();
  return {
    offsetWidth: 0,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c)
    },
    has: c => classes.has(c)
  };
}

function fakeKnob(min, max) {
  const knob = { min, max, value: min, rootEl: fakeEl(), calls: [] };
  knob.setValue = v => { knob.value = v; knob.calls.push(v); };
  return knob;
}

/**
 * App simulada con un módulo de cada tipo que sabe resolver el manager.
 * Devuelve la app y los controles para poder inspeccionarlos.
 */
function createFakeApp() {
  const osc = { knobs: [fakeKnob(0, 10), fakeKnob(0, 10), fakeKnob(-5, 5)] };
  const noise = { knobs: { colour: fakeKnob(0, 10), level: fakeKnob(0, 10) } };
  const output = {
    slider: { min: '0', max: '10' },
    _sliderWrapEl: fakeEl(),
    level: null,
    deserialize(state) { output.level = state.level; },
    filterKnobUI: fakeKnob(-5, 5),
    panKnobUI: fakeKnob(-1, 1),
    powerSwitch: { element: fakeEl(), state: 'a', setState(s) { this.state = s; } }
  };
  const joystickModule = { element: fakeEl(), positions: [], setPosition(x, y) { this.positions.push([x, y]); } };
  const joystick = { module: joystickModule, knobs: { rangeX: { knobInstance: fakeKnob(0, 10) } } };
  const scope = {
    timeKnob: { knobInstance: fakeKnob(0, 10) },
    ampKnob: { knobInstance: fakeKnob(0, 10) },
    levelKnob: null,
    modeToggle: { element: fakeEl(), toggles: 0, toggle() { this.toggles++; } }
  };

  const modules = {
    'panel1-osc-1': { type: 'oscillator', ui: osc },
    'noise-1': { type: 'noise', ui: noise },
    'output-1': { type: 'outputChannel', ui: output },
    'joystick-left': { type: 'joystick', ui: joystick },
    'keyboard-upper': { type: 'keyboard', ui: null },
    'scope': { type: 'oscilloscope', ui: scope }
  };

  return {
    app: { _findModuleById: id => modules[id] || null },
    osc, noise, output, joystickModule, joystick, scope
  };
}

/** Mensaje MIDI ya parseado, tal como lo entrega midiAccess. */
function msg(overrides) {
  return { channel: 0, deviceId: 'dev-1', deviceName: 'Test Controller', ...overrides };
}

const cc = (number, value, extra) => msg({ type: 'cc', cc: number, value, ...extra });
const noteOn = (note, velocity, extra) => msg({ type: 'noteon', note, velocity, ...extra });
const noteOff = (note, extra) => msg({ type: 'noteoff', note, velocity: 0, ...extra });
const bend = (value, extra) => msg({ type: 'pitchbend', value, ...extra });

/** Evento MIDIMessageEvent crudo para midiAccess. */
function rawEvent(bytes, port = { id: 'dev-1', name: 'Test Controller' }) {
  return { data: Uint8Array.from(bytes), target: port };
}

/** Mete un mensaje parseado directamente en el manager (sin pasar por midiAccess). */
function feed(m) {
  midiLearnManager._onMIDIMessage(m);
}

/** Completa un learn de principio a fin: startLearn + primer mensaje. */
async function learn(target, m) {
  await midiLearnManager.startLearn(target);
  feed(m);
  return midiLearnManager.getMappingForControl(target);
}

/** Deja el singleton como recién construido. */
function resetManager() {
  midiLearnManager.destroy();
  midiLearnManager._mappings.clear();
  midiLearnManager._controlIndex.clear();
  clearTimeout(midiLearnManager._antiFeedbackTimer);
  midiLearnManager._ignoreMIDIUpdates = false;
}

const OSC_KNOB_1 = { moduleId: 'panel1-osc-1', controlType: 'knob', knobIndex: 1, label: 'Osc 1 Level' };
const OSC_VERNIER = { moduleId: 'panel1-osc-1', controlType: 'knob', knobIndex: 0 };
const NOISE_COLOUR = { moduleId: 'noise-1', controlType: 'knob', controlKey: 'colour' };
const OUTPUT_SLIDER = { moduleId: 'output-1', controlType: 'slider' };
const OUTPUT_SWITCH = { moduleId: 'output-1', controlType: 'switch' };
const JOY_PAD = { moduleId: 'joystick-left', controlType: 'pad' };
const KEYBOARD = { moduleId: 'keyboard-upper', controlType: 'keyboard' };
const SCOPE_TOGGLE = { moduleId: 'scope', controlType: 'toggle' };

// ═════════════════════════════════════════════════════════════════════════════
// midiAccess
// ═════════════════════════════════════════════════════════════════════════════

describe('midiAccess — parsing de mensajes crudos', () => {
  const parse = bytes => midiAccess._parseMessage(rawEvent(bytes));

  it('Control Change: canal, número y valor', () => {
    assert.deepEqual(parse([0xB0, 7, 100]), {
      channel: 0, deviceId: 'dev-1', deviceName: 'Test Controller', type: 'cc', cc: 7, value: 100
    });
    assert.equal(parse([0xBF, 1, 0]).channel, 15);
    assert.equal(parse([0xB3, 1, 127]).value, 127);
  });

  it('Note On con velocidad', () => {
    const m = parse([0x90, 60, 100]);
    assert.equal(m.type, 'noteon');
    assert.equal(m.note, 60);
    assert.equal(m.velocity, 100);
    assert.equal(parse([0x99, 36, 1]).channel, 9);
  });

  it('Note On con velocidad 0 es Note Off (convención MIDI)', () => {
    assert.deepEqual(parse([0x90, 60, 0]), msg({ type: 'noteoff', note: 60, velocity: 0 }));
  });

  it('Note Off explícito', () => {
    const m = parse([0x80, 60, 64]);
    assert.equal(m.type, 'noteoff');
    assert.equal(m.note, 60);
  });

  it('Pitch Bend junta LSB y MSB en 14 bits', () => {
    assert.equal(parse([0xE0, 0x00, 0x40]).value, 8192);
    assert.equal(parse([0xE0, 0x00, 0x00]).value, 0);
    assert.equal(parse([0xE0, 0x7F, 0x7F]).value, 16383);
    assert.equal(parse([0xE5, 0x00, 0x40]).channel, 5);
    assert.equal(parse([0xE0, 0x00, 0x40]).type, 'pitchbend');
  });

  it('ignora Program Change, aftertouch y datos vacíos', () => {
    assert.equal(parse([0xC0, 5]), null);
    assert.equal(parse([0xD0, 64]), null);
    assert.equal(parse([]), null);
    assert.equal(midiAccess._parseMessage({ data: null }), null);
  });

  it('sin puerto origen usa un dispositivo genérico', () => {
    const m = midiAccess._parseMessage({ data: Uint8Array.from([0xB0, 1, 1]), target: null });
    assert.equal(m.deviceId, 'unknown');
    assert.equal(m.deviceName, 'MIDI Device');
  });
});

describe('midiAccess — callbacks', () => {
  afterEach(() => midiAccess.destroy());

  it('onMessage recibe los mensajes parseados y devuelve una función para desuscribirse', () => {
    const seen = [];
    const off = midiAccess.onMessage(m => seen.push(m));
    midiAccess._onMIDIMessage(rawEvent([0xB0, 7, 64]));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].cc, 7);
    off();
    midiAccess._onMIDIMessage(rawEvent([0xB0, 7, 65]));
    assert.equal(seen.length, 1);
  });

  it('los mensajes no parseables no llegan a los callbacks', () => {
    const seen = [];
    midiAccess.onMessage(m => seen.push(m));
    midiAccess._onMIDIMessage(rawEvent([0xC0, 1]));
    assert.equal(seen.length, 0);
  });

  it('un callback que revienta no impide que el resto reciba el mensaje', () => {
    const seen = [];
    midiAccess.onMessage(() => { throw new Error('boom'); });
    midiAccess.onMessage(m => seen.push(m));
    assert.doesNotThrow(() => midiAccess._onMIDIMessage(rawEvent([0x90, 60, 100])));
    assert.equal(seen.length, 1);
  });
});

describe('midiAccess — init con Web MIDI API', () => {
  let originalNavigator;
  let inputs;
  let access;

  function fakeInput(id, name, state = 'connected') {
    return { id, name, manufacturer: 'Fake', state, connection: 'closed', onmidimessage: null,
      opened: 0, async open() { this.opened++; this.connection = 'open'; } };
  }

  beforeEach(() => {
    events.length = 0;
    originalNavigator = globalThis.navigator;
    inputs = new Map([
      ['in-1', fakeInput('in-1', 'Keyboard A')],
      ['in-2', fakeInput('in-2', 'Pads B')],
      ['in-3', fakeInput('in-3', 'Desconectado', 'disconnected')]
    ]);
    access = { inputs, onstatechange: null };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true, writable: true,
      value: { requestMIDIAccess: async () => access }
    });
  });

  afterEach(() => {
    midiAccess.destroy();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: originalNavigator });
  });

  it('sin requestMIDIAccess: no soportado, init devuelve false', async () => {
    globalThis.navigator = {};
    assert.equal(await midiAccess.init(), false);
    assert.equal(midiAccess.supported, false);
    assert.equal(midiAccess.initialized, false);
    assert.deepEqual(midiAccess.getInputs(), []);
  });

  it('con soporte: abre y vincula solo los puertos conectados y avisa por document', async () => {
    assert.equal(await midiAccess.init(), true);
    assert.equal(midiAccess.supported, true);
    assert.equal(midiAccess.initialized, true);
    assert.equal(inputs.get('in-1').opened, 1);
    assert.equal(typeof inputs.get('in-1').onmidimessage, 'function');
    assert.equal(inputs.get('in-3').opened, 0);
    assert.equal(inputs.get('in-3').onmidimessage, null);

    const status = lastEvent('midi:statusChanged');
    assert.ok(status);
    assert.equal(status.detail.supported, true);
    assert.deepEqual(status.detail.inputs.map(i => i.id), ['in-1', 'in-2', 'in-3']);
  });

  it('init() es idempotente una vez inicializado', async () => {
    await midiAccess.init();
    await midiAccess.init();
    assert.equal(inputs.get('in-1').opened, 1);
  });

  it('los mensajes de un puerto vinculado llegan parseados a los callbacks', async () => {
    await midiAccess.init();
    const seen = [];
    midiAccess.onMessage(m => seen.push(m));
    const port = inputs.get('in-2');
    port.onmidimessage({ data: Uint8Array.from([0xB1, 10, 99]), target: port });
    assert.deepEqual(seen, [{ channel: 1, deviceId: 'in-2', deviceName: 'Pads B', type: 'cc', cc: 10, value: 99 }]);
  });

  it('si requestMIDIAccess falla, init devuelve false y no queda inicializado', async () => {
    globalThis.navigator = { requestMIDIAccess: async () => { throw new Error('denegado'); } };
    assert.equal(await midiAccess.init(), false);
    assert.equal(midiAccess.supported, true);
    assert.equal(midiAccess.initialized, false);
  });

  it('un puerto que no se puede abrir no tumba al resto', async () => {
    inputs.get('in-1').open = async () => { throw new Error('ocupado'); };
    assert.equal(await midiAccess.init(), true);
    assert.equal(inputs.get('in-1').onmidimessage, null);
    assert.equal(typeof inputs.get('in-2').onmidimessage, 'function');
  });

  it('conectar un dispositivo nuevo lo vincula y avisa; desconectarlo lo suelta', async () => {
    await midiAccess.init();
    events.length = 0;
    const nuevo = fakeInput('in-9', 'Nuevo');
    nuevo.type = 'input';
    inputs.set('in-9', nuevo);
    access.onstatechange({ port: nuevo });
    await Promise.resolve();
    assert.equal(nuevo.opened, 1);
    assert.equal(typeof nuevo.onmidimessage, 'function');
    assert.equal(eventsOfType('midi:statusChanged').length, 1);

    nuevo.state = 'disconnected';
    access.onstatechange({ port: nuevo });
    assert.equal(nuevo.onmidimessage, null);
    assert.equal(midiAccess._activeInputs.has('in-9'), false);
    assert.equal(eventsOfType('midi:statusChanged').length, 2);
  });

  it('los cambios de estado de puertos de salida se ignoran', async () => {
    await midiAccess.init();
    events.length = 0;
    access.onstatechange({ port: { type: 'output', state: 'connected', id: 'out-1', name: 'Out' } });
    assert.equal(eventsOfType('midi:statusChanged').length, 0);
  });

  it('destroy() suelta los puertos, los callbacks y el acceso', async () => {
    await midiAccess.init();
    midiAccess.onMessage(() => {});
    midiAccess.destroy();
    assert.equal(inputs.get('in-1').onmidimessage, null);
    assert.equal(midiAccess.initialized, false);
    assert.equal(midiAccess._messageCallbacks.size, 0);
    assert.deepEqual(midiAccess.getInputs(), []);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// midiLearnManager
// ═════════════════════════════════════════════════════════════════════════════

describe('midiLearnManager', () => {
  let fake;

  beforeEach(() => {
    events.length = 0;
    localStorage.clear();
    resetManager();
    midiAccess.destroy();
    fake = createFakeApp();
    midiLearnManager.init(fake.app);
    events.length = 0;
  });

  afterEach(() => {
    resetManager();
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('init y enabled', () => {
    it('arranca activo, sin mappings, escuchando a midiAccess', () => {
      assert.equal(midiLearnManager.enabled, true);
      assert.equal(midiLearnManager.mappingCount, 0);
      assert.equal(midiLearnManager.isLearning, false);
      assert.equal(midiAccess._messageCallbacks.size, 1);
    });

    it('respeta MIDI_ENABLED="false" guardado en localStorage', () => {
      resetManager();
      localStorage.setItem(STORAGE_KEYS.MIDI_ENABLED, 'false');
      midiLearnManager.init(fake.app);
      assert.equal(midiLearnManager.enabled, false);
    });

    it('setEnabled persiste el estado y avisa por document', () => {
      midiLearnManager.setEnabled(false);
      assert.equal(midiLearnManager.enabled, false);
      assert.equal(localStorage.getItem(STORAGE_KEYS.MIDI_ENABLED), 'false');
      assert.deepEqual(lastEvent('midi:enabledChanged').detail, { enabled: false });
    });

    it('desactivado, los mensajes MIDI se ignoran pero los mappings se conservan', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      midiLearnManager.setEnabled(false);
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, []);
      assert.equal(midiLearnManager.mappingCount, 1);
      midiLearnManager.setEnabled(true);
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, [10]);
    });

    it('destroy() cancela el learn, se desuscribe y desactiva', async () => {
      await midiLearnManager.startLearn(OSC_KNOB_1);
      midiLearnManager.destroy();
      assert.equal(midiLearnManager.isLearning, false);
      assert.equal(midiLearnManager.enabled, false);
      assert.equal(midiAccess._messageCallbacks.size, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('modo learn', () => {
    it('startLearn marca el control, avisa con el número de dispositivos y espera', async () => {
      await midiLearnManager.startLearn(OSC_KNOB_1);
      assert.equal(midiLearnManager.isLearning, true);
      assert.ok(fake.osc.knobs[1].rootEl.has('midi-learn-target'));
      const ev = lastEvent('midi:learnStart');
      assert.deepEqual(ev.detail.target, OSC_KNOB_1);
      assert.equal(ev.detail.deviceCount, 0);
    });

    it('cancelLearn quita la marca y avisa; sin learn activo no hace nada', async () => {
      await midiLearnManager.startLearn(OSC_KNOB_1);
      midiLearnManager.cancelLearn();
      assert.equal(midiLearnManager.isLearning, false);
      assert.equal(fake.osc.knobs[1].rootEl.has('midi-learn-target'), false);
      assert.equal(eventsOfType('midi:learnCancel').length, 1);
      midiLearnManager.cancelLearn();
      assert.equal(eventsOfType('midi:learnCancel').length, 1);
    });

    it('un segundo startLearn cancela el anterior', async () => {
      await midiLearnManager.startLearn(OSC_KNOB_1);
      await midiLearnManager.startLearn(NOISE_COLOUR);
      assert.equal(fake.osc.knobs[1].rootEl.has('midi-learn-target'), false);
      assert.ok(fake.noise.knobs.colour.rootEl.has('midi-learn-target'));
      assert.equal(eventsOfType('midi:learnCancel').length, 1);
    });

    it('el primer mensaje completa el learn: mapping, índice, clases y evento', async () => {
      await midiLearnManager.startLearn(OSC_KNOB_1);
      feed(cc(7, 64));
      assert.equal(midiLearnManager.isLearning, false);
      const mapping = midiLearnManager.getMappingForControl(OSC_KNOB_1);
      assert.deepEqual(mapping, {
        midiKey: 'dev-1:0:cc:7', deviceId: 'dev-1', deviceName: 'Test Controller',
        channel: 0, type: 'cc', number: 7, target: OSC_KNOB_1
      });
      const el = fake.osc.knobs[1].rootEl;
      assert.equal(el.has('midi-learn-target'), false);
      assert.ok(el.has('midi-mapped'));
      const ev = lastEvent('midi:learnComplete');
      assert.equal(ev.detail.sourceLabel, 'CC 7 (Ch 1)');
      assert.equal(ev.detail.targetLabel, 'Osc 1 Level');
      assert.strictEqual(ev.detail.mapping, midiLearnManager.getAllMappings()[0]);
    });

    it('el mensaje que completa el learn no se aplica al control', async () => {
      await learn(OSC_KNOB_1, cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, []);
    });

    it('note off aprende con la misma clave que note on; el nombre de nota va en la etiqueta', async () => {
      const m = await learn(OSC_KNOB_1, noteOff(61));
      assert.equal(m.midiKey, 'dev-1:0:noteon:61');
      assert.equal(m.type, 'noteon');
      assert.equal(lastEvent('midi:learnComplete').detail.sourceLabel, 'Note C#4 (Ch 1)');
    });

    it('pitch bend aprende con número 0', async () => {
      const m = await learn(OSC_KNOB_1, bend(8192, { channel: 3 }));
      assert.equal(m.midiKey, 'dev-1:3:pitchbend:0');
      assert.equal(m.number, 0);
      assert.equal(lastEvent('midi:learnComplete').detail.sourceLabel, 'Pitch Bend (Ch 4)');
    });

    it('un teclado aprende el dispositivo+canal entero, no una nota', async () => {
      const m = await learn(KEYBOARD, noteOn(60, 100, { channel: 2 }));
      assert.equal(m.midiKey, 'dev-1:2:keyboard:0');
      assert.equal(m.type, 'keyboard');
      assert.equal(lastEvent('midi:learnComplete').detail.sourceLabel, 'Keyboard (Ch 3)');
    });

    it('sin label, la etiqueta del destino es su controlId', async () => {
      await learn(OSC_VERNIER, cc(1, 0));
      assert.equal(lastEvent('midi:learnComplete').detail.targetLabel, 'panel1-osc-1:knob:0');
    });

    it('si midiAccess no está inicializado, startLearn lo reintenta', async () => {
      const original = globalThis.navigator;
      let asked = 0;
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true, writable: true,
        value: { requestMIDIAccess: async () => { asked++; return { inputs: new Map(), onstatechange: null }; } }
      });
      try {
        await midiLearnManager.startLearn(OSC_KNOB_1);
        assert.equal(asked, 1);
        assert.equal(midiAccess.initialized, true);
      } finally {
        Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: original });
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('gestión de mappings', () => {
    it('reasignar el mismo CC a otro control sustituye al primero', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      await learn(NOISE_COLOUR, cc(7, 0));
      assert.equal(midiLearnManager.mappingCount, 1);
      assert.equal(midiLearnManager.getMappingForControl(OSC_KNOB_1), null);
      assert.equal(midiLearnManager.getMappingForControl(NOISE_COLOUR).midiKey, 'dev-1:0:cc:7');
      assert.equal(fake.osc.knobs[1].rootEl.has('midi-mapped'), false);
      assert.ok(fake.noise.knobs.colour.rootEl.has('midi-mapped'));
    });

    it('reasignar el mismo control a otro CC descarta el CC anterior', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      await learn(OSC_KNOB_1, cc(8, 0));
      assert.equal(midiLearnManager.mappingCount, 1);
      assert.equal(midiLearnManager.getMappingForControl(OSC_KNOB_1).number, 8);
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, []);
    });

    it('el mismo CC en dispositivos distintos son mappings distintos', async () => {
      await learn(OSC_KNOB_1, cc(7, 0, { deviceId: 'dev-1' }));
      await learn(NOISE_COLOUR, cc(7, 0, { deviceId: 'dev-2' }));
      assert.equal(midiLearnManager.mappingCount, 2);
    });

    it('el mismo CC en canales distintos son mappings distintos', async () => {
      await learn(OSC_KNOB_1, cc(7, 0, { channel: 0 }));
      await learn(NOISE_COLOUR, cc(7, 0, { channel: 1 }));
      assert.equal(midiLearnManager.mappingCount, 2);
    });

    it('controlKey manda sobre knobIndex al identificar un control', async () => {
      await learn({ moduleId: 'noise-1', controlKey: 'colour', knobIndex: 5 }, cc(1, 0));
      assert.ok(midiLearnManager.getMappingForControl({ moduleId: 'noise-1', controlKey: 'colour' }));
    });

    it('removeMappingForControl borra, limpia la clase, guarda y avisa', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      events.length = 0;
      assert.equal(midiLearnManager.removeMappingForControl(OSC_KNOB_1), true);
      assert.equal(midiLearnManager.mappingCount, 0);
      assert.equal(fake.osc.knobs[1].rootEl.has('midi-mapped'), false);
      assert.equal(eventsOfType('midi:mappingChanged').length, 1);
      assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEYS.MIDI_MAPPINGS)).mappingCount, 0);
      assert.equal(midiLearnManager.removeMappingForControl(OSC_KNOB_1), false);
    });

    it('removeMappingByKey borra por clave MIDI', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      assert.equal(midiLearnManager.removeMappingByKey('dev-1:0:cc:7'), true);
      assert.equal(midiLearnManager.getMappingForControl(OSC_KNOB_1), null);
      assert.equal(midiLearnManager.removeMappingByKey('dev-1:0:cc:7'), false);
    });

    it('clearAllMappings vacía todo y quita las clases', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      await learn(NOISE_COLOUR, cc(8, 0));
      midiLearnManager.clearAllMappings();
      assert.equal(midiLearnManager.mappingCount, 0);
      assert.deepEqual(midiLearnManager.getAllMappings(), []);
      assert.equal(fake.osc.knobs[1].rootEl.has('midi-mapped'), false);
      assert.equal(fake.noise.knobs.colour.rootEl.has('midi-mapped'), false);
    });

    it('applyVisualIndicators marca los controles con mapping', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      fake.osc.knobs[1].rootEl.classList.remove('midi-mapped');
      midiLearnManager.applyVisualIndicators();
      assert.ok(fake.osc.knobs[1].rootEl.has('midi-mapped'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('persistencia, exportar e importar', () => {
    it('cada learn queda guardado en localStorage y se recupera en init()', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      await learn(KEYBOARD, noteOn(60, 1, { channel: 2 }));
      resetManager();
      midiLearnManager.init(fake.app);
      assert.equal(midiLearnManager.mappingCount, 2);
      const m = midiLearnManager.getMappingForControl(OSC_KNOB_1);
      assert.equal(m.midiKey, 'dev-1:0:cc:7');
      assert.equal(m.deviceId, 'dev-1');
      assert.equal(midiLearnManager.getMappingForControl(KEYBOARD).midiKey, 'dev-1:2:keyboard:0');
      // Y funciona: el CC guardado mueve el knob
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, [10]);
    });

    it('un localStorage corrupto no impide arrancar', () => {
      resetManager();
      localStorage.setItem(STORAGE_KEYS.MIDI_MAPPINGS, '{no es json');
      assert.doesNotThrow(() => midiLearnManager.init(fake.app));
      assert.equal(midiLearnManager.mappingCount, 0);
    });

    it('exportMappings produce el formato versionado sin deviceId suelto', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      const data = midiLearnManager.exportMappings();
      assert.equal(data.version, 1);
      assert.equal(data.mappingCount, 1);
      assert.ok(!Number.isNaN(Date.parse(data.exportDate)));
      assert.deepEqual(data.mappings[0], {
        midiKey: 'dev-1:0:cc:7', deviceName: 'Test Controller', channel: 0, type: 'cc', number: 7,
        target: { moduleId: 'panel1-osc-1', controlType: 'knob', controlKey: undefined, knobIndex: 1, label: 'Osc 1 Level' }
      });
    });

    it('importMappings reemplaza los actuales y hace round-trip con el export', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      const data = JSON.parse(JSON.stringify(midiLearnManager.exportMappings()));
      await learn(NOISE_COLOUR, cc(9, 0));
      events.length = 0;

      assert.deepEqual(midiLearnManager.importMappings(data), { success: true, count: 1 });
      assert.equal(midiLearnManager.mappingCount, 1);
      assert.equal(midiLearnManager.getMappingForControl(NOISE_COLOUR), null);
      assert.equal(midiLearnManager.getMappingForControl(OSC_KNOB_1).midiKey, 'dev-1:0:cc:7');
      assert.ok(fake.osc.knobs[1].rootEl.has('midi-mapped'));
      assert.ok(eventsOfType('midi:mappingChanged').length >= 1);
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, [10]);
    });

    it('importMappings rechaza formatos inválidos y versiones desconocidas', () => {
      assert.deepEqual(midiLearnManager.importMappings(null), { success: false, count: 0, error: 'Formato inválido' });
      assert.deepEqual(midiLearnManager.importMappings({ version: 1 }), { success: false, count: 0, error: 'Formato inválido' });
      assert.deepEqual(midiLearnManager.importMappings({ version: 2, mappings: [] }),
        { success: false, count: 0, error: 'Versión no soportada: 2' });
    });

    it('importMappings salta entradas sin destino y rellena el dispositivo que falte', () => {
      const r = midiLearnManager.importMappings({
        version: 1,
        mappings: [
          { channel: 0, type: 'cc', number: 3, target: { moduleId: 'noise-1', controlKey: 'level' } },
          { channel: 0, type: 'cc', number: 4 },
          { channel: 0, type: 'cc', number: 5, target: {} }
        ]
      });
      assert.deepEqual(r, { success: true, count: 1 });
      const m = midiLearnManager.getAllMappings()[0];
      assert.equal(m.deviceId, 'any');
      assert.equal(m.deviceName, 'Imported');
      assert.equal(m.midiKey, 'any:0:cc:3');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('aplicar mappings a los controles', () => {
    it('CC → knob: 0 y 127 cubren min..max, 64 queda cerca del centro', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      feed(cc(7, 0));
      feed(cc(7, 127));
      feed(cc(7, 64));
      const [lo, hi, mid] = fake.osc.knobs[1].calls;
      assert.equal(lo, 0);
      assert.equal(hi, 10);
      assert.ok(Math.abs(mid - 5) < 0.05);
    });

    it('CC → knob bipolar (-5..+5) cubre el rango completo', async () => {
      const target = { moduleId: 'panel1-osc-1', knobIndex: 2 };
      await learn(target, cc(20, 0));
      feed(cc(20, 0));
      feed(cc(20, 127));
      assert.deepEqual(fake.osc.knobs[2].calls, [-5, 5]);
    });

    it('el knob 0 del oscilador se trata como vernier y también recibe el valor', async () => {
      await learn(OSC_VERNIER, cc(1, 0));
      feed(cc(1, 127));
      assert.deepEqual(fake.osc.knobs[0].calls, [10]);
    });

    it('pitch bend → knob usa los 14 bits (0, 8192, 16383)', async () => {
      await learn(OSC_KNOB_1, bend(0));
      feed(bend(0));
      feed(bend(16383));
      feed(bend(8192));
      const [lo, hi, mid] = fake.osc.knobs[1].calls;
      assert.equal(lo, 0);
      assert.equal(hi, 10);
      assert.ok(Math.abs(mid - 5) < 0.001);
    });

    it('note on → knob usa la velocidad; note off vale 0', async () => {
      await learn(OSC_KNOB_1, noteOn(60, 1));
      feed(noteOn(60, 127));
      feed(noteOff(60));
      assert.deepEqual(fake.osc.knobs[1].calls, [10, 0]);
    });

    it('CC → slider de Output Channel escala al rango real del slider (0..10)', async () => {
      await learn(OUTPUT_SLIDER, cc(7, 0));
      feed(cc(7, 127));
      assert.equal(fake.output.level, 10);
      feed(cc(7, 0));
      assert.equal(fake.output.level, 0);
      feed(cc(7, 64));
      assert.ok(Math.abs(fake.output.level - 5.04) < 0.01);
      feed(bend(16383));
    });

    it('slider sin elemento asume 0..10', async () => {
      fake.output.slider = null;
      await learn(OUTPUT_SLIDER, cc(7, 0));
      feed(cc(7, 127));
      assert.equal(fake.output.level, 10);
    });

    it('switch con setState: note on → b, note off → a, CC > 63 → b, bend > 8191 → b', async () => {
      await learn(OUTPUT_SWITCH, cc(30, 0));
      const sw = fake.output.powerSwitch;
      feed(cc(30, 64)); assert.equal(sw.state, 'b');
      feed(cc(30, 63)); assert.equal(sw.state, 'a');
      feed(cc(30, 127)); assert.equal(sw.state, 'b');
      feed(cc(30, 0)); assert.equal(sw.state, 'a');

      await learn(OUTPUT_SWITCH, noteOn(40, 1));
      feed(noteOn(40, 100)); assert.equal(sw.state, 'b');
      feed(noteOff(40)); assert.equal(sw.state, 'a');
      feed(noteOn(40, 0)); assert.equal(sw.state, 'a');

      await learn(OUTPUT_SWITCH, bend(0));
      feed(bend(8192)); assert.equal(sw.state, 'b');
      feed(bend(8191)); assert.equal(sw.state, 'a');
    });

    it('toggle sin setState pero con toggle(): alterna solo al encender', async () => {
      await learn(SCOPE_TOGGLE, cc(31, 0));
      feed(cc(31, 127));
      feed(cc(31, 0));
      feed(cc(31, 100));
      assert.equal(fake.scope.modeToggle.toggles, 2);
    });

    it('pad del joystick: CC par mueve X, CC impar mueve Y, en -1..+1', async () => {
      await learn(JOY_PAD, cc(16, 0));
      feed(cc(16, 127));
      feed(cc(16, 0));
      assert.deepEqual(fake.joystickModule.positions, [[1, undefined], [-1, undefined]]);
      await learn(JOY_PAD, cc(17, 0));
      fake.joystickModule.positions.length = 0;
      feed(cc(17, 127));
      assert.deepEqual(fake.joystickModule.positions, [[undefined, 1]]);
    });

    it('teclado: reenvía notas, CC y pitch bend del mismo dispositivo+canal como synth:keyboardMIDI', async () => {
      await learn(KEYBOARD, noteOn(60, 100, { channel: 2 }));
      events.length = 0;
      feed(noteOn(64, 90, { channel: 2 }));
      feed(noteOff(64, { channel: 2 }));
      feed(cc(1, 50, { channel: 2 }));
      feed(bend(9000, { channel: 2 }));
      const kb = eventsOfType('synth:keyboardMIDI').map(e => e.detail);
      assert.equal(kb.length, 4);
      assert.deepEqual(kb[0], { keyboardId: 'keyboard-upper', type: 'noteon', note: 64, velocity: 90, channel: 2, cc: undefined, value: undefined });
      assert.equal(kb[1].type, 'noteoff');
      assert.equal(kb[2].cc, 1);
      assert.equal(kb[3].value, 9000);
      // Otro canal no entra
      feed(noteOn(64, 90, { channel: 3 }));
      assert.equal(eventsOfType('synth:keyboardMIDI').length, 4);
    });

    it('un mapping exacto tiene prioridad sobre el teclado del mismo dispositivo+canal', async () => {
      await learn(KEYBOARD, noteOn(60, 100));
      await learn(OSC_KNOB_1, cc(7, 0));
      events.length = 0;
      feed(cc(7, 127));
      assert.deepEqual(fake.osc.knobs[1].calls, [10]);
      assert.equal(eventsOfType('synth:keyboardMIDI').length, 0);
    });

    it('mensajes sin mapping y mappings a controles que ya no existen no hacen nada', async () => {
      assert.doesNotThrow(() => feed(cc(99, 1)));
      await learn(OSC_KNOB_1, cc(7, 0));
      fake.osc.knobs.length = 0;
      assert.doesNotThrow(() => feed(cc(7, 127)));
      assert.equal(midiLearnManager.shouldIgnoreMIDI(), false);
    });

    it('resuelve knobs de noise por controlKey o, si no, por índice', async () => {
      await learn({ moduleId: 'noise-1', knobIndex: 1 }, cc(2, 0));
      feed(cc(2, 127));
      assert.deepEqual(fake.noise.knobs.level.calls, [10]);
    });

    it('output channel: knobs de filtro y pan por controlKey', async () => {
      await learn({ moduleId: 'output-1', controlType: 'knob', controlKey: 'filter' }, cc(40, 0));
      await learn({ moduleId: 'output-1', controlType: 'knob', controlKey: 'pan' }, cc(41, 0));
      feed(cc(40, 127));
      feed(cc(41, 0));
      assert.deepEqual(fake.output.filterKnobUI.calls, [5]);
      assert.deepEqual(fake.output.panKnobUI.calls, [-1]);
    });

    it('joystick: knobs de rango por controlKey; osciloscopio: knobs por índice', async () => {
      await learn({ moduleId: 'joystick-left', controlType: 'knob', controlKey: 'rangeX' }, cc(50, 0));
      await learn({ moduleId: 'scope', controlType: 'knob', knobIndex: 1 }, cc(51, 0));
      feed(cc(50, 127));
      feed(cc(51, 127));
      assert.deepEqual(fake.joystick.knobs.rangeX.knobInstance.calls, [10]);
      assert.deepEqual(fake.scope.ampKnob.knobInstance.calls, [10]);
      // Un knob del osciloscopio que no existe no se puede aprender
      await midiLearnManager.startLearn({ moduleId: 'scope', controlType: 'knob', knobIndex: 2 });
      feed(cc(52, 0));
      feed(cc(52, 127));
      assert.equal(midiLearnManager.mappingCount, 3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('anti-feedback', () => {
    it('una ráfaga nunca pierde mensajes: se aplican todos y gana el último', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      const burst = [0, 13, 26, 39, 52, 65, 78, 91, 104, 117, 127];
      for (const v of burst) feed(cc(7, v));
      assert.equal(fake.osc.knobs[1].calls.length, burst.length);
      assert.equal(fake.osc.knobs[1].value, 10);
    });

    it('el flag queda activo justo después de aplicar (para que el onChange no rebote)…', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      feed(cc(7, 64));
      assert.equal(midiLearnManager.shouldIgnoreMIDI(), true);
    });

    it('…y se apaga solo pasados unos milisegundos', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      feed(cc(7, 64));
      await new Promise(r => setTimeout(r, 30));
      assert.equal(midiLearnManager.shouldIgnoreMIDI(), false);
    });

    it('el flag se levanta aunque el control reviente al recibir el valor', async () => {
      await learn(OSC_KNOB_1, cc(7, 0));
      fake.osc.knobs[1].setValue = () => { throw new Error('boom'); };
      assert.throws(() => feed(cc(7, 64)));
      assert.equal(midiLearnManager.shouldIgnoreMIDI(), true);
      await new Promise(r => setTimeout(r, 30));
      assert.equal(midiLearnManager.shouldIgnoreMIDI(), false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('formateo', () => {
    it('nombres de nota: C4 es el Do central, A4 el La 440', () => {
      const name = n => midiLearnManager._noteNumberToName(n);
      assert.equal(name(60), 'C4');
      assert.equal(name(69), 'A4');
      assert.equal(name(0), 'C-1');
      assert.equal(name(127), 'G9');
      assert.equal(name(61), 'C#4');
      assert.equal(name(66), 'F#4');
    });

    it('_formatMIDISource muestra el canal en base 1 y un fallback para tipos raros', () => {
      const fmt = m => midiLearnManager._formatMIDISource(m);
      assert.equal(fmt({ type: 'cc', number: 74, channel: 0 }), 'CC 74 (Ch 1)');
      assert.equal(fmt({ type: 'noteon', number: 69, channel: 9 }), 'Note A4 (Ch 10)');
      assert.equal(fmt({ type: 'pitchbend', number: 0, channel: 15 }), 'Pitch Bend (Ch 16)');
      assert.equal(fmt({ type: 'keyboard', number: 0, channel: 0 }), 'Keyboard (Ch 1)');
      assert.equal(fmt({ type: 'sysex', number: 0, channel: 0 }), 'MIDI sysex (Ch 1)');
    });
  });
});
