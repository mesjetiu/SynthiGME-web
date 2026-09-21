/**
 * Tests para modules/envelopeShaper.js — contra la clase real.
 *
 * Hasta septiembre de 2026 este fichero probaba una copia
 * (`TestEnvelopeShaperModule`) de la lógica del módulo. Ahora instancia
 * `EnvelopeShaperModule` con el AudioContext simulado de
 * `tests/mocks/audioContext.mock.js` y comprueba lo que de verdad hace: qué
 * nodos crea y cómo los cablea, qué salidas y entradas registra para la
 * matriz, qué mensajes manda al worklet, cómo recorta los valores de los
 * knobs y qué hace con el mensaje `active` del worklet (LED).
 *
 * Los Envelope Shapers no usan dormancy: están siempre despiertos gracias al
 * keepalive (GainNode a 0 hacia destination), que garantiza que Chrome ejecute
 * process() aunque ningún pin de la matriz esté conectado. Aquí se fija que
 * `setDormant()` no toca nada.
 *
 * Lo que ocurre dentro del worklet lo cubre
 * tests/worklets/envelopeShaper.worklet.test.js.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMockAudioContext,
  createMockAudioWorkletNode
} from '../mocks/audioContext.mock.js';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});

globalThis.AudioWorkletNode = class MockAudioWorkletNode {
  constructor(ctx, name, options) {
    return createMockAudioWorkletNode(name, options);
  }
};

const { EnvelopeShaperModule } = await import('../../src/assets/js/modules/envelopeShaper.js');
const { envelopeShaperConfig } = await import('../../src/assets/js/configs/index.js');

/** Valores de fábrica del módulo (los que manda al worklet nada más arrancar). */
const DEFAULTS = {
  mode: 2,
  delay: 0,
  attack: 0,
  decay: 5,
  sustain: 7,
  release: 3,
  envelopeLevel: 5,
  signalLevel: 0
};

function messages(mod) {
  return mod.workletNode.port._messages;
}

function messagesOfType(mod, type) {
  return messages(mod).filter(m => m.type === type);
}

function clearMessages(mod) {
  messages(mod).length = 0;
}

function fromWorklet(mod, data) {
  mod.workletNode.port.onmessage({ data });
}

describe('EnvelopeShaperModule', () => {
  let ctx;
  let mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    mod = new EnvelopeShaperModule({ audioCtx: ctx }, 'envelopeShaper1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Inicialización', () => {
    it('empieza parado, sin nodos, con gate manual apagado y modo 2', () => {
      assert.equal(mod.isStarted, false);
      assert.equal(mod.workletNode, null);
      assert.equal(mod.name, 'Envelope Shaper');
      assert.equal(mod.id, 'envelopeShaper1');
      assert.equal(mod._manualGateActive, false);
      assert.equal(mod.getMode(), 2);
      assert.deepEqual(mod.values, DEFAULTS);
    });

    it('sin config usa las rampas por defecto (60 ms nivel, 10 ms envolvente)', () => {
      assert.deepEqual(mod.config.ramps, { level: 0.06, envelope: 0.01 });
    });

    it('la config puede sobrescribir cada rampa por separado', () => {
      const custom = new EnvelopeShaperModule({ audioCtx: ctx }, 'es', { ramps: { level: 0.2 } });
      assert.deepEqual(custom.config.ramps, { level: 0.2, envelope: 0.01 });
    });

    it('start() crea el worklet "envelope-shaper" y marca isStarted', () => {
      mod.start();
      assert.equal(mod.isStarted, true);
      assert.equal(mod.workletNode._name, 'envelope-shaper');
    });

    it('start() es idempotente: no recrea nodos ni duplica salidas', () => {
      mod.start();
      const first = mod.workletNode;
      const gainCount = ctx._createdNodes.gain.length;
      mod.start();
      assert.strictEqual(mod.workletNode, first);
      assert.equal(ctx._createdNodes.gain.length, gainCount);
      assert.equal(mod.outputs.length, 2);
      assert.equal(mod.inputs.length, 2);
    });

    it('sin AudioContext, start() no hace nada y el módulo sigue parado', () => {
      const noCtx = new EnvelopeShaperModule({ audioCtx: null }, 'es');
      noCtx.start();
      assert.equal(noCtx.isStarted, false);
      assert.equal(noCtx.workletNode, null);
    });

    it('el worklet se crea con 1 entrada y 1 salida estéreo (audio+trigger / env+audio)', () => {
      mod.start();
      const opts = mod.workletNode._options;
      assert.equal(opts.numberOfInputs, 1);
      assert.equal(opts.numberOfOutputs, 1);
      assert.deepEqual(opts.outputChannelCount, [2]);
      assert.equal(opts.channelCount, 2);
      assert.equal(opts.channelCountMode, 'explicit');
    });

    it('pasa al worklet los parámetros de audio de envelopeShaper.config.js', () => {
      mod.start();
      const po = mod.workletNode._options.processorOptions;
      const audio = envelopeShaperConfig.audio;
      for (const key of ['minTimeMs', 'maxTimeMs', 'gateThreshold', 'gateLowThreshold',
        'gateBlankingTime', 'logBase']) {
        assert.equal(po[key], audio[key], key);
        assert.notEqual(po[key], undefined, `${key} sin definir en la config`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Cableado de audio', () => {
    beforeEach(() => mod.start());

    it('las dos entradas van al merger: señal al canal 0, trigger al canal 1', () => {
      assert.equal(mod.merger.numberOfInputs, 2);
      assert.deepEqual(mod.audioInputGain._connections, [
        { destination: mod.merger, outputIndex: 0, inputIndex: 0 }
      ]);
      assert.deepEqual(mod.triggerInputGain._connections, [
        { destination: mod.merger, outputIndex: 0, inputIndex: 1 }
      ]);
      assert.equal(mod.merger._calls.connect, 1); // merger → worklet
    });

    it('el worklet sale por un splitter de 2 canales hacia envGain y audioGain', () => {
      assert.equal(mod.splitter.numberOfOutputs, 2);
      assert.equal(mod.splitter._calls.connect, 2);
      // worklet → splitter y worklet → keepalive
      assert.equal(mod.workletNode._calls.connect, 2);
    });

    it('los gains de entrada y salida son puntos de conexión a ganancia 1', () => {
      for (const node of [mod.audioInputGain, mod.triggerInputGain, mod.envGain, mod.audioGain]) {
        assert.equal(node.gain.value, 1);
      }
    });

    it('mantiene un keepalive a ganancia 0 hacia destination', () => {
      assert.equal(mod._keepaliveGain.gain.value, 0);
      assert.deepEqual(mod._keepaliveGain._connections, [
        { destination: ctx.destination, outputIndex: undefined, inputIndex: undefined }
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Salidas y entradas para la matriz', () => {
    it('registra las salidas envelope (CV) y audio (VCA)', () => {
      mod.start();
      assert.deepEqual(mod.outputs.map(o => o.id), ['envelope', 'audio']);
      assert.ok(mod.outputs.every(o => o.kind === 'envelopeShaper'));
      assert.strictEqual(mod.outputs[0].node, mod.envGain);
      assert.strictEqual(mod.outputs[1].node, mod.audioGain);
    });

    it('registra las entradas signal y trigger', () => {
      mod.start();
      assert.deepEqual(mod.inputs.map(i => i.id), ['signal', 'trigger']);
      assert.strictEqual(mod.inputs[0].node, mod.audioInputGain);
      assert.strictEqual(mod.inputs[1].node, mod.triggerInputGain);
    });

    it('getOutputNode/getInputNode devuelven el nodo correcto y null para ids desconocidos', () => {
      mod.start();
      assert.strictEqual(mod.getOutputNode('envelope'), mod.envGain);
      assert.strictEqual(mod.getOutputNode('audio'), mod.audioGain);
      assert.strictEqual(mod.getInputNode('signal'), mod.audioInputGain);
      assert.strictEqual(mod.getInputNode('trigger'), mod.triggerInputGain);
      assert.equal(mod.getOutputNode('nope'), null);
      assert.equal(mod.getInputNode('nope'), null);
    });

    it('los getters de nodo inicializan el audio si aún no se ha arrancado', () => {
      assert.equal(mod.workletNode, null);
      const env = mod.getEnvelopeNode();
      assert.ok(env);
      assert.ok(mod.workletNode);
      assert.strictEqual(mod.getAudioNode(), mod.audioGain);
      assert.strictEqual(mod.getAudioInputNode(), mod.audioInputGain);
      assert.strictEqual(mod.getTriggerInputNode(), mod.triggerInputGain);
      // Inicializa los nodos, pero no cuenta como start()
      assert.equal(mod.isStarted, false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Estado inicial enviado al worklet', () => {
    it('al arrancar manda todos los valores de fábrica y el gate manual (false)', () => {
      mod.start();
      const expected = [
        { type: 'setMode', value: 2 },
        { type: 'setDelay', value: 0 },
        { type: 'setAttack', value: 0 },
        { type: 'setDecay', value: 5 },
        { type: 'setSustain', value: 7 },
        { type: 'setRelease', value: 3 },
        { type: 'setEnvelopeLevel', value: 5 },
        { type: 'setSignalLevel', value: 0 },
        { type: 'gate', value: false }
      ];
      assert.deepEqual(messages(mod), expected);
    });

    it('no manda ningún setDormant: el módulo no usa dormancy', () => {
      mod.start();
      assert.equal(messagesOfType(mod, 'setDormant').length, 0);
    });

    it('si el gate manual ya estaba activo antes de start(), lo manda activo', () => {
      mod.setGate(true);
      mod.start();
      const gate = messagesOfType(mod, 'gate');
      assert.deepEqual(gate, [{ type: 'gate', value: true }]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Knobs', () => {
    beforeEach(() => {
      mod.start();
      clearMessages(mod);
    });

    const KNOBS = [
      ['setDelay', 'getDelay', 'delay'],
      ['setAttack', 'getAttack', 'attack'],
      ['setDecay', 'getDecay', 'decay'],
      ['setSustain', 'getSustain', 'sustain'],
      ['setRelease', 'getRelease', 'release'],
      ['setSignalLevel', 'getSignalLevel', 'signalLevel']
    ];

    for (const [setter, getter, key] of KNOBS) {
      it(`${setter} guarda el valor, lo recorta a 0..10 y manda un solo mensaje`, () => {
        mod[setter](4.5);
        assert.equal(mod[getter](), 4.5);
        assert.equal(mod.values[key], 4.5);
        assert.deepEqual(messages(mod), [{ type: setter, value: 4.5 }]);

        mod[setter](-3);
        assert.equal(mod[getter](), 0);
        mod[setter](99);
        assert.equal(mod[getter](), 10);
        assert.equal(messages(mod).at(-1).value, 10);
      });
    }

    it('setEnvelopeLevel es bipolar: se recorta a -5..5', () => {
      mod.setEnvelopeLevel(-2.5);
      assert.equal(mod.getEnvelopeLevel(), -2.5);
      assert.deepEqual(messages(mod), [{ type: 'setEnvelopeLevel', value: -2.5 }]);
      mod.setEnvelopeLevel(-9);
      assert.equal(mod.getEnvelopeLevel(), -5);
      mod.setEnvelopeLevel(9);
      assert.equal(mod.getEnvelopeLevel(), 5);
    });

    it('setMode redondea al entero más cercano y se recorta a 0..4', () => {
      mod.setMode(1.4);
      assert.equal(mod.getMode(), 1);
      mod.setMode(2.6);
      assert.equal(mod.getMode(), 3);
      mod.setMode(-1);
      assert.equal(mod.getMode(), 0);
      mod.setMode(7);
      assert.equal(mod.getMode(), 4);
      assert.deepEqual(messagesOfType(mod, 'setMode').map(m => m.value), [1, 3, 0, 4]);
    });

    it('cada setter manda exactamente un mensaje al worklet', () => {
      mod.setMode(1);
      assert.equal(messages(mod).length, 1);
      assert.deepEqual(messages(mod)[0], { type: 'setMode', value: 1 });
    });

    it('los setters antes de start() guardan el valor sin reventar', () => {
      const fresh = new EnvelopeShaperModule({ audioCtx: ctx }, 'es');
      fresh.setAttack(7);
      fresh.setMode(0);
      assert.equal(fresh.getAttack(), 7);
      assert.equal(fresh.getMode(), 0);
      fresh.start();
      assert.deepEqual(messagesOfType(fresh, 'setAttack'), [{ type: 'setAttack', value: 7 }]);
      assert.deepEqual(messagesOfType(fresh, 'setMode'), [{ type: 'setMode', value: 0 }]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Gate manual', () => {
    it('setGate manda el gate directo al worklet y recuerda el estado', () => {
      mod.start();
      clearMessages(mod);
      mod.setGate(true);
      assert.equal(mod._manualGateActive, true);
      mod.setGate(false);
      assert.equal(mod._manualGateActive, false);
      assert.deepEqual(messages(mod), [
        { type: 'gate', value: true },
        { type: 'gate', value: false }
      ]);
    });

    it('setGate no toca las ganancias ni manda setDormant', () => {
      mod.start();
      mod.setGate(true);
      for (const node of [mod.audioInputGain, mod.triggerInputGain, mod.envGain, mod.audioGain]) {
        assert.equal(node.gain.value, 1);
        assert.equal(node.gain._calls.setTargetAtTime, 0);
      }
      assert.equal(messagesOfType(mod, 'setDormant').length, 0);
    });

    it('setGate antes de start() no revienta y guarda el estado', () => {
      assert.doesNotThrow(() => mod.setGate(true));
      assert.equal(mod._manualGateActive, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Worklet → UI (LED de actividad)', () => {
    beforeEach(() => mod.start());

    it('el mensaje active llama a onActiveChange con su valor', () => {
      const seen = [];
      mod.onActiveChange = v => seen.push(v);
      fromWorklet(mod, { type: 'active', value: true });
      fromWorklet(mod, { type: 'active', value: false });
      assert.deepEqual(seen, [true, false]);
    });

    it('sin callback, el mensaje active no revienta', () => {
      mod.onActiveChange = null;
      assert.doesNotThrow(() => fromWorklet(mod, { type: 'active', value: true }));
    });

    it('otros mensajes y mensajes vacíos se ignoran', () => {
      const seen = [];
      mod.onActiveChange = v => seen.push(v);
      fromWorklet(mod, { type: 'otro', value: true });
      fromWorklet(mod, null);
      fromWorklet(mod, undefined);
      assert.deepEqual(seen, []);
    });

    it('escenario: gate manual → el worklet responde active → LED encendido', () => {
      const seen = [];
      mod.onActiveChange = v => seen.push(v);
      mod.setGate(true);
      assert.equal(messagesOfType(mod, 'gate').at(-1).value, true);
      fromWorklet(mod, { type: 'active', value: true });
      assert.deepEqual(seen, [true]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Dormancy (no aplica)', () => {
    it('setDormant cambia la bandera pero no toca nodos ni manda nada al worklet', () => {
      mod.start();
      clearMessages(mod);
      mod.setDormant(true);
      assert.equal(mod.isDormant, true);
      assert.deepEqual(messages(mod), []);
      assert.equal(mod._keepaliveGain.gain.value, 0);
      assert.equal(mod.envGain.gain.value, 1);
      assert.equal(mod.audioGain.gain.value, 1);
      mod.setDormant(false);
      assert.equal(mod.isDormant, false);
      assert.deepEqual(messages(mod), []);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Stop y limpieza', () => {
    it('stop() manda stop, desconecta todo y vuelve al estado inicial', () => {
      mod.start();
      const worklet = mod.workletNode;
      const nodes = [mod.merger, mod.splitter, mod.envGain, mod.audioGain,
        mod.audioInputGain, mod.triggerInputGain, mod._keepaliveGain];
      clearMessages(mod);

      mod.stop();

      assert.deepEqual(worklet.port._messages, [{ type: 'stop' }]);
      assert.equal(worklet._calls.disconnect, 1);
      for (const node of nodes) assert.equal(node._calls.disconnect, 1);
      assert.equal(mod.isStarted, false);
      for (const key of ['workletNode', 'merger', 'splitter', 'envGain', 'audioGain',
        'audioInputGain', 'triggerInputGain', '_keepaliveGain']) {
        assert.equal(mod[key], null, key);
      }
      assert.equal(mod.outputs.length, 0);
      assert.equal(mod.inputs.length, 0);
    });

    it('stop() sin haber arrancado no hace nada', () => {
      assert.doesNotThrow(() => mod.stop());
      assert.equal(mod.isStarted, false);
    });

    it('stop() conserva los valores: al rearrancar los vuelve a mandar', () => {
      mod.start();
      mod.setAttack(8);
      mod.setGate(true);
      mod.stop();
      mod.start();
      assert.deepEqual(messagesOfType(mod, 'setAttack'), [{ type: 'setAttack', value: 8 }]);
      assert.deepEqual(messagesOfType(mod, 'gate'), [{ type: 'gate', value: true }]);
    });
  });
});
