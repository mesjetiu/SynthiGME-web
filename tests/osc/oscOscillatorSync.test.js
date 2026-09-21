/**
 * Tests de OscillatorOSCSync real (src/assets/js/osc/oscOscillatorSync.js).
 *
 * Hasta septiembre de 2026 este fichero copiaba los dos mapas de knobs y las
 * fórmulas de conversión y los probaba a sí mismos. Ahora se ejercita la
 * clase de verdad sobre el `oscBridge` real: `window.oscAPI.send` es un stub
 * que graba lo que sale, y lo que entra se inyecta por
 * `oscBridge._notifyListeners`, que es lo que llamaría el receptor UDP.
 *
 * Cubre: mapas knob ↔ clave OSC, envío con conversión UI→OSC y
 * deduplicación, envío del rango, recepción (knob + audio + anti-loop),
 * recepción del rango, y destroy().
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Entorno mínimo de navegador ───────────────────────────────────────────
globalThis.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const windowEvents = [];
let querySelectorResult = null;
globalThis.window ??= {};
Object.assign(globalThis.window, {
  addEventListener() {},
  dispatchEvent(ev) { windowEvents.push(ev); return true; }
});
globalThis.document ??= {};
Object.assign(globalThis.document, {
  addEventListener() {},
  querySelector() { return querySelectorResult; }
});

const { oscBridge } = await import('../../src/assets/js/osc/oscBridge.js');
const {
  OscillatorOSCSync,
  oscillatorOSCSync,
  KNOB_INDEX_TO_OSC_KEY,
  OSC_KEY_TO_KNOB_INDEX
} = await import('../../src/assets/js/osc/oscOscillatorSync.js');
const { MODULE_PARAMETERS } = await import('../../src/assets/js/osc/oscAddressMap.js');

// ─── Helpers ───────────────────────────────────────────────────────────────

const PREFIX = '/SynthiGME/';

/** Mensajes OSC salientes capturados en window.oscAPI.send */
let sent = [];

function connectBridge() {
  globalThis.window.oscAPI = {
    send(address, args) { sent.push({ address, args }); return true; }
  };
  oscBridge.connected = true;
  oscBridge.config.sendEnabled = true;
}

function disconnectBridge() {
  oscBridge.connected = false;
}

/** Simula un mensaje entrante ya con prefijo, como lo entrega el receptor. */
function receive(address, value) {
  oscBridge._notifyListeners(PREFIX + address, value, '127.0.0.1');
}

function fakeKnob() {
  return { value: null, calls: [], setValue(v) { this.value = v; this.calls.push(v); } };
}

function createFakeApp() {
  const app = { audio: [], _oscillatorUIs: {} };
  for (let n = 1; n <= 12; n++) {
    app._oscillatorUIs[`panel3-osc-${n}`] = {
      knobs: Array.from({ length: 7 }, fakeKnob),
      rangeState: 'hi',
      renders: [],
      _renderRange(el) { this.renders.push(el); }
    };
  }
  const record = name => (...args) => app.audio.push([name, ...args]);
  app._updatePanelPulseVolume = record('pulseVolume');
  app._updatePanelPulseWidth = record('pulseWidth');
  app._updatePanelOscVolume = record('sineVolume');
  app._updatePanelSineSymmetry = record('sineSymmetry');
  app._updatePanelTriVolume = record('triVolume');
  app._updatePanelSawVolume = record('sawVolume');
  app._updatePanelOscFreq = record('freq');
  app._onOscRangeChange = record('rangeChange');
  return app;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

let sync;
let app;
let silencedLog;

beforeEach(() => {
  sent = [];
  windowEvents.length = 0;
  querySelectorResult = null;
  // oscBridge.send() hace console.log cuando está desconectado: fuera ruido
  silencedLog = console.log;
  console.log = () => {};
  oscBridge._listeners.clear();
  connectBridge();
  app = createFakeApp();
  sync = new OscillatorOSCSync();
});

afterEach(() => {
  sync.destroy();
  console.log = silencedLog;
  disconnectBridge();
});

// ═══════════════════════════════════════════════════════════════════════════

describe('OscillatorOSCSync', () => {
  describe('Mapas knob ↔ clave OSC', () => {
    it('los 7 knobs del oscilador, en el orden del panel', () => {
      assert.deepEqual(KNOB_INDEX_TO_OSC_KEY, {
        0: 'pulselevel', 1: 'pulseshape', 2: 'sinelevel', 3: 'sinesymmetry',
        4: 'trianglelevel', 5: 'sawtoothlevel', 6: 'frequency'
      });
    });

    it('el mapa inverso es exactamente el inverso', () => {
      assert.equal(Object.keys(OSC_KEY_TO_KNOB_INDEX).length, 7);
      for (const [idx, key] of Object.entries(KNOB_INDEX_TO_OSC_KEY)) {
        assert.equal(OSC_KEY_TO_KNOB_INDEX[key], Number(idx));
      }
    });

    it('todas las claves existen como parámetros "osc" en oscAddressMap', () => {
      for (const key of Object.values(KNOB_INDEX_TO_OSC_KEY)) {
        assert.ok(MODULE_PARAMETERS.osc.parameters[key], key);
      }
    });

    it('expone un singleton ya construido', () => {
      assert.ok(oscillatorOSCSync instanceof OscillatorOSCSync);
      assert.equal(oscillatorOSCSync.shouldIgnoreOSC(), false);
    });
  });

  describe('sendKnobChange', () => {
    it('no envía nada si el bridge no está conectado', () => {
      disconnectBridge();
      sync.sendKnobChange(0, 0, 0.5);
      assert.deepEqual(sent, []);
    });

    it('ignora índices de knob que no existen', () => {
      sync.sendKnobChange(0, 7, 0.5);
      sync.sendKnobChange(0, -1, 0.5);
      assert.deepEqual(sent, []);
    });

    it('levels: UI 0..1 → OSC 0..10, dirección osc/{n}/{param} 1-based con prefijo', () => {
      sync.sendKnobChange(0, 0, 0.5);
      assert.deepEqual(sent, [{ address: '/SynthiGME/osc/1/pulselevel', args: [5] }]);
      sync.sendKnobChange(11, 2, 1);
      assert.deepEqual(sent[1], { address: '/SynthiGME/osc/12/sinelevel', args: [10] });
      sync.sendKnobChange(3, 4, 0);
      assert.deepEqual(sent[2], { address: '/SynthiGME/osc/4/trianglelevel', args: [0] });
    });

    it('bipolares (pulseshape, sinesymmetry): UI 0..1 → OSC −5..5', () => {
      sync.sendKnobChange(0, 1, 0);
      sync.sendKnobChange(0, 1, 0.5);
      sync.sendKnobChange(0, 1, 1);
      sync.sendKnobChange(0, 3, 0.25);
      assert.deepEqual(sent.map(m => m.args[0]), [-5, 0, 5, -2.5]);
      assert.ok(sent.every((m, i) => m.address === (i < 3 ? '/SynthiGME/osc/1/pulseshape' : '/SynthiGME/osc/1/sinesymmetry')));
    });

    it('frequency ya viene en escala 0..10 y se manda tal cual', () => {
      sync.sendKnobChange(4, 6, 7.3);
      assert.deepEqual(sent, [{ address: '/SynthiGME/osc/5/frequency', args: [7.3] }]);
    });

    it('deduplica: el mismo valor (±0.0001) no se reenvía; uno distinto sí', () => {
      sync.sendKnobChange(0, 0, 0.5);
      sync.sendKnobChange(0, 0, 0.5);
      sync.sendKnobChange(0, 0, 0.500001);
      assert.equal(sent.length, 1);
      sync.sendKnobChange(0, 0, 0.6);
      assert.equal(sent.length, 2);
      assert.equal(sent[1].args[0], 6);
    });

    it('la deduplicación es por dirección: mismo valor en otro oscilador o knob sí sale', () => {
      sync.sendKnobChange(0, 0, 0.5);
      sync.sendKnobChange(1, 0, 0.5);
      sync.sendKnobChange(0, 2, 0.5);
      assert.equal(sent.length, 3);
    });

    it('cada envío emite un evento osc:message de salida en window (para el log OSC)', () => {
      sync.sendKnobChange(0, 0, 0.5);
      const ev = windowEvents.find(e => e.type === 'osc:message');
      assert.ok(ev);
      assert.equal(ev.detail.direction, 'out');
      assert.equal(ev.detail.address, '/SynthiGME/osc/1/pulselevel');
    });
  });

  describe('sendRangeChange', () => {
    it('manda "hi"/"lo" a osc/{n}/range', () => {
      sync.sendRangeChange(0, 'lo');
      assert.deepEqual(sent, [{ address: '/SynthiGME/osc/1/range', args: ['lo'] }]);
    });

    it('deduplica por estado', () => {
      sync.sendRangeChange(2, 'lo');
      sync.sendRangeChange(2, 'lo');
      sync.sendRangeChange(2, 'hi');
      assert.deepEqual(sent.map(m => m.args[0]), ['lo', 'hi']);
    });

    it('no envía sin conexión', () => {
      disconnectBridge();
      sync.sendRangeChange(0, 'lo');
      assert.deepEqual(sent, []);
    });
  });

  describe('init() y suscripciones', () => {
    it('se suscribe a los 7 parámetros + range de los 12 osciladores (96 direcciones)', () => {
      sync.init(app);
      assert.equal(sync._unsubscribers.size, 96);
      assert.equal(oscBridge._listeners.size, 96);
      assert.ok(oscBridge._listeners.has('/SynthiGME/osc/1/pulselevel'));
      assert.ok(oscBridge._listeners.has('/SynthiGME/osc/12/range'));
    });

    it('init() repetido no duplica listeners', () => {
      sync.init(app);
      sync.init(app);
      assert.equal(oscBridge._listeners.size, 96);
      for (const set of oscBridge._listeners.values()) assert.equal(set.size, 1);
    });

    it('destroy() quita todas las suscripciones y suelta la app', () => {
      sync.init(app);
      sync.destroy();
      assert.equal(sync._unsubscribers.size, 0);
      assert.equal(oscBridge._listeners.size, 0);
      assert.equal(sync._app, null);
      receive('osc/1/pulselevel', 5);
      assert.deepEqual(app.audio, []);
    });
  });

  describe('Recepción de knobs', () => {
    beforeEach(() => sync.init(app));

    it('level entrante OSC 0..10 → knob 0..1, y aplica al audio del panel 3', () => {
      receive('osc/1/pulselevel', 5);
      const ui = app._oscillatorUIs['panel3-osc-1'];
      assert.deepEqual(ui.knobs[0].calls, [0.5]);
      assert.deepEqual(app.audio, [['pulseVolume', 3, 0, 0.5]]);
    });

    it('cada knob va a su handler de audio', async () => {
      // Entre mensaje y mensaje hay que dejar pasar el anti-loop (10 ms)
      receive('osc/2/pulseshape', 5);      // bipolar: 5 → 1
      await wait(15);
      receive('osc/2/sinelevel', 10);
      await wait(15);
      receive('osc/2/sinesymmetry', -5);   // bipolar: −5 → 0
      await wait(15);
      receive('osc/2/trianglelevel', 2.5);
      await wait(15);
      receive('osc/2/sawtoothlevel', 7.5);
      assert.deepEqual(app.audio, [
        ['pulseWidth', 3, 1, 1],
        ['sineVolume', 3, 1, 1],
        ['sineSymmetry', 3, 1, 0],
        ['triVolume', 3, 1, 0.25],
        ['sawVolume', 3, 1, 0.75]
      ]);
    });

    it('frequency no se convierte y lleva el estado hi/lo del oscilador', async () => {
      receive('osc/3/frequency', 4.2);
      assert.deepEqual(app.audio, [['freq', 3, 2, 4.2, false]]);
      await wait(15);
      app._oscillatorUIs['panel3-osc-4'].rangeState = 'lo';
      receive('osc/4/frequency', 1);
      assert.deepEqual(app.audio[1], ['freq', 3, 3, 1, true]);
    });

    it('las direcciones llegan al oscilador correcto (12 = último)', () => {
      receive('osc/12/sawtoothlevel', 10);
      assert.deepEqual(app._oscillatorUIs['panel3-osc-12'].knobs[5].calls, [1]);
      assert.deepEqual(app._oscillatorUIs['panel3-osc-1'].knobs[5].calls, []);
    });

    it('si el oscilador no tiene UI, no toca el audio', () => {
      delete app._oscillatorUIs['panel3-osc-5'];
      assert.doesNotThrow(() => receive('osc/5/sinelevel', 5));
      assert.deepEqual(app.audio, []);
    });

    it('sin app no hace nada', () => {
      sync.destroy();
      const s = new OscillatorOSCSync();
      assert.doesNotThrow(() => s._handleIncomingKnob(0, 'sinelevel', 5));
    });

    it('anti-loop: mientras procesa un mensaje ignora los siguientes durante ~10 ms', async () => {
      receive('osc/1/pulselevel', 5);
      assert.equal(sync.shouldIgnoreOSC(), true);
      receive('osc/1/pulselevel', 8);
      assert.equal(app.audio.length, 1, 'el segundo mensaje se ignora');
      await wait(20);
      assert.equal(sync.shouldIgnoreOSC(), false);
      receive('osc/1/pulselevel', 8);
      assert.equal(app.audio.length, 2);
    });

    it('anti-loop: el flag se libera aunque el knob lance', async () => {
      app._oscillatorUIs['panel3-osc-1'].knobs[0].setValue = () => { throw new Error('boom'); };
      // oscBridge atrapa el error del listener y lo loguea por console.error
      const origError = console.error;
      console.error = () => {};
      try {
        receive('osc/1/pulselevel', 5);
      } finally {
        console.error = origError;
      }
      await wait(20);
      assert.equal(sync.shouldIgnoreOSC(), false);
    });

    it('un mensaje OSC entrante no genera eco de salida', () => {
      receive('osc/1/pulselevel', 5);
      assert.deepEqual(sent, []);
    });
  });

  describe('Recepción del rango', () => {
    beforeEach(() => sync.init(app));

    it('"lo" y "LO" → lo; cualquier otra cosa → hi', async () => {
      const ui = app._oscillatorUIs['panel3-osc-1'];
      receive('osc/1/range', 'lo');
      assert.equal(ui.rangeState, 'lo');
      await wait(20);
      receive('osc/1/range', 'LO');
      assert.equal(ui.rangeState, 'lo');
      await wait(20);
      receive('osc/1/range', 'hi');
      assert.equal(ui.rangeState, 'hi');
      await wait(20);
      receive('osc/1/range', 'cualquiera');
      assert.equal(ui.rangeState, 'hi');
    });

    it('recalcula la frecuencia vía _onOscRangeChange(3, idx, rango)', () => {
      receive('osc/7/range', 'lo');
      assert.deepEqual(app.audio, [['rangeChange', 3, 6, 'lo']]);
    });

    it('si el switch está en el DOM, lo redibuja', () => {
      const el = { classList: { contains: () => false, add() {}, remove() {} } };
      querySelectorResult = el;
      receive('osc/1/range', 'lo');
      assert.deepEqual(app._oscillatorUIs['panel3-osc-1'].renders, [el]);
    });

    it('sin switch en el DOM, cambia el estado igualmente', () => {
      receive('osc/1/range', 'lo');
      assert.equal(app._oscillatorUIs['panel3-osc-1'].rangeState, 'lo');
      assert.deepEqual(app._oscillatorUIs['panel3-osc-1'].renders, []);
    });

    it('oscilador sin UI: no toca nada', () => {
      delete app._oscillatorUIs['panel3-osc-9'];
      assert.doesNotThrow(() => receive('osc/9/range', 'lo'));
      assert.deepEqual(app.audio, []);
    });

    it('también respeta el anti-loop', async () => {
      receive('osc/1/range', 'lo');
      receive('osc/1/range', 'hi');
      assert.equal(app._oscillatorUIs['panel3-osc-1'].rangeState, 'lo');
      await wait(20);
      receive('osc/1/range', 'hi');
      assert.equal(app._oscillatorUIs['panel3-osc-1'].rangeState, 'hi');
    });
  });

  describe('Ida y vuelta', () => {
    it('lo que sale por sendKnobChange, recibido de vuelta, deja el knob donde estaba', () => {
      sync.init(app);
      for (const [knobIndex, key] of Object.entries(KNOB_INDEX_TO_OSC_KEY)) {
        if (key === 'frequency') continue;
        sent = [];
        sync.sendKnobChange(0, Number(knobIndex), 0.3);
        const [msg] = sent;
        // Otra instancia recibe el mensaje (sin flag anti-loop activo)
        sync._ignoreOSCUpdates = false;
        oscBridge._notifyListeners(msg.address, msg.args[0], 'peer');
        const knob = app._oscillatorUIs['panel3-osc-1'].knobs[knobIndex];
        assert.ok(Math.abs(knob.value - 0.3) < 1e-12, `${key}: ${knob.value}`);
      }
    });
  });
});
