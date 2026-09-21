/**
 * Tests para modules/sequencerModule.js — contra la clase real.
 *
 * Hasta septiembre de 2026 este fichero probaba una copia (`TestSequencerModule`)
 * de la lógica del módulo. Ahora instancia `SequencerModule` con el
 * AudioContext simulado de `tests/mocks/audioContext.mock.js` y comprueba lo
 * que de verdad hace: qué nodos crea, qué salidas y entradas registra para la
 * matriz, qué mensajes manda al worklet y cómo reparte los del worklet a la UI.
 *
 * Lo que ocurre dentro del worklet lo cubre tests/worklets/sequencer.worklet.test.js.
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

const { SequencerModule } = await import('../../src/assets/js/modules/sequencerModule.js');
const { sequencerConfig } = await import('../../src/assets/js/configs/index.js');

const OUTPUT_IDS = [
  'dac1', 'dac2',
  'voltageA', 'voltageB', 'key1',
  'voltageC', 'voltageD', 'key2',
  'voltageE', 'voltageF', 'key3',
  'key4', 'clock'
];

const INPUT_IDS = [
  'clock', 'reset', 'forward', 'reverse', 'stop',
  'voltageACE', 'voltageBDF', 'key'
];

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

describe('SequencerModule', () => {
  let ctx;
  let mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    mod = new SequencerModule({ audioCtx: ctx }, 'sequencer');
  });

  describe('Inicialización', () => {
    it('empieza parado, sin nodos y con nombre del módulo', () => {
      assert.equal(mod.isStarted, false);
      assert.equal(mod.workletNode, null);
      assert.equal(mod.name, 'Digital Sequencer 1000');
      assert.equal(mod.id, 'sequencer');
    });

    it('start() crea el worklet "sequencer" y marca isStarted', () => {
      mod.start();
      assert.equal(mod.isStarted, true);
      assert.equal(mod.workletNode._name, 'sequencer');
    });

    it('start() es idempotente: no recrea nodos', () => {
      mod.start();
      const first = mod.workletNode;
      mod.start();
      assert.strictEqual(mod.workletNode, first);
      assert.equal(mod.outputs.length, 13);
    });

    it('el worklet se crea con 1 entrada de 8 canales y 1 salida de 13', () => {
      mod.start();
      const opts = mod.workletNode._options;
      assert.equal(opts.numberOfInputs, 1);
      assert.equal(opts.numberOfOutputs, 1);
      assert.deepEqual(opts.outputChannelCount, [13]);
      assert.equal(opts.channelCount, 8);
      assert.equal(opts.channelCountMode, 'explicit');
    });

    it('pasa al worklet los parámetros de audio de sequencer.config.js', () => {
      mod.start();
      const po = mod.workletNode._options.processorOptions;
      const audio = sequencerConfig.audio;
      for (const key of ['clockMinFreq', 'clockMaxFreq', 'clockPulseWidth', 'extClockThreshold',
        'extClockLowThreshold', 'extClockBlankingTime', 'analogVoltageRange', 'keyOnVoltage', 'keyThreshold']) {
        assert.equal(po[key], audio[key], key);
      }
    });

    it('sin AudioContext, start() no hace nada', () => {
      const orphan = new SequencerModule({ audioCtx: null }, 'sequencer');
      orphan.start();
      assert.equal(orphan.isStarted, false);
      assert.equal(orphan.workletNode, null);
    });
  });

  describe('Salidas (13 canales)', () => {
    beforeEach(() => mod.start());

    it('registra 13 salidas de kind sequencer con los IDs en orden', () => {
      assert.equal(mod.outputs.length, 13);
      assert.deepEqual(mod.outputs.map(o => o.id), OUTPUT_IDS);
      assert.ok(mod.outputs.every(o => o.kind === 'sequencer'));
    });

    it('cada salida es un GainNode a 1 colgado del splitter', () => {
      for (const out of mod.outputs) {
        assert.equal(out.node.gain.value, 1);
      }
      assert.equal(mod.splitter._calls.connect, 13);
    });

    it('getOutputNode devuelve el nodo de cada ID y null si no existe', () => {
      assert.strictEqual(mod.getOutputNode('dac1'), mod.outputs[0].node);
      assert.strictEqual(mod.getOutputNode('clock'), mod.outputs[12].node);
      assert.equal(mod.getOutputNode('noExiste'), null);
    });

    it('getOutputNode antes de start() inicializa los nodos', () => {
      const lazy = new SequencerModule({ audioCtx: createMockAudioContext() }, 'sequencer');
      const node = lazy.getOutputNode('voltageA');
      assert.ok(node);
      assert.ok(lazy.workletNode);
      assert.equal(lazy.isStarted, false); // start() sigue siendo quien lo marca
    });
  });

  describe('Entradas (8 canales)', () => {
    beforeEach(() => mod.start());

    it('registra 8 entradas de kind sequencer con los IDs en orden', () => {
      assert.equal(mod.inputs.length, 8);
      assert.deepEqual(mod.inputs.map(i => i.id), INPUT_IDS);
      assert.ok(mod.inputs.every(i => i.kind === 'sequencer'));
    });

    it('cada entrada es un GainNode a 1 que entra al merger por su canal', () => {
      mod.inputs.forEach((input, i) => {
        assert.equal(input.node.gain.value, 1);
        const [conn] = input.node._connections;
        assert.strictEqual(conn.destination, mod.merger);
        assert.equal(conn.inputIndex, i);
      });
    });

    it('getInputNode devuelve el nodo de cada ID y null si no existe', () => {
      assert.strictEqual(mod.getInputNode('clock'), mod.inputs[0].node);
      assert.strictEqual(mod.getInputNode('key'), mod.inputs[7].node);
      assert.equal(mod.getInputNode('noExiste'), null);
    });
  });

  describe('Keepalive', () => {
    it('cuelga el worklet del destination con ganancia 0', () => {
      mod.start();
      assert.equal(mod._keepaliveGain.gain.value, 0);
      const [conn] = mod._keepaliveGain._connections;
      assert.strictEqual(conn.destination, ctx.destination);
    });
  });

  describe('Estado inicial al worklet', () => {
    beforeEach(() => mod.start());

    it('manda el clock rate inicial (5)', () => {
      assert.deepEqual(messagesOfType(mod, 'setClockRate'), [{ type: 'setClockRate', value: 5 }]);
    });

    it('manda los 7 switches y runClock', () => {
      const switches = messagesOfType(mod, 'setSwitch');
      assert.deepEqual(switches.map(m => m.switch).sort(),
        ['abKey1', 'b', 'cdKey2', 'd', 'efKey3', 'f', 'key4']);
      assert.ok(switches.every(m => m.value === false));
      assert.deepEqual(messagesOfType(mod, 'setRunClock'), [{ type: 'setRunClock', value: true }]);
    });
  });

  describe('Knobs → worklet', () => {
    beforeEach(() => { mod.start(); clearMessages(mod); });

    it('setClockRate manda el valor y lo guarda', () => {
      mod.setClockRate(7.5);
      assert.deepEqual(messages(mod), [{ type: 'setClockRate', value: 7.5 }]);
      assert.equal(mod.values.clockRate, 7.5);
    });

    it('setClockRate recorta a 0..10', () => {
      mod.setClockRate(15);
      mod.setClockRate(-3);
      assert.deepEqual(messages(mod).map(m => m.value), [10, 0]);
      assert.equal(mod.values.clockRate, 0);
    });

    it('setKnob manda setKnob con el nombre del knob', () => {
      mod.setKnob('voltageA', 3.3);
      mod.setKnob('key1', 1);
      assert.deepEqual(messages(mod), [
        { type: 'setKnob', value: 3.3, knob: 'voltageA' },
        { type: 'setKnob', value: 1, knob: 'key1' }
      ]);
      assert.equal(mod.values.voltageA, 3.3);
      assert.equal(mod.values.key1, 1);
    });

    it('setKnob con un nombre desconocido no manda nada ni lo guarda', () => {
      mod.setKnob('noExiste', 1);
      assert.deepEqual(messages(mod), []);
      assert.equal('noExiste' in mod.values, false);
    });
  });

  describe('Switches → worklet', () => {
    beforeEach(() => { mod.start(); clearMessages(mod); });

    it('setSwitch manda setSwitch con el nombre y el valor como booleano', () => {
      mod.setSwitch('abKey1', 1);
      assert.deepEqual(messages(mod), [{ type: 'setSwitch', value: true, switch: 'abKey1' }]);
      assert.equal(mod.switches.abKey1, true);
    });

    it('runClock va como setRunClock, sin campo switch', () => {
      mod.setSwitch('runClock', false);
      assert.deepEqual(messages(mod), [{ type: 'setRunClock', value: false }]);
      assert.equal(mod.switches.runClock, false);
    });

    it('setSwitch con un nombre desconocido no manda nada', () => {
      mod.setSwitch('noExiste', true);
      assert.deepEqual(messages(mod), []);
    });
  });

  describe('Botones → worklet', () => {
    beforeEach(() => { mod.start(); clearMessages(mod); });

    it('pressButton manda button con el nombre', () => {
      mod.pressButton('runForward');
      mod.pressButton('masterReset');
      assert.deepEqual(messages(mod), [
        { type: 'button', value: 'runForward' },
        { type: 'button', value: 'masterReset' }
      ]);
    });
  });

  describe('Worklet → UI', () => {
    beforeEach(() => mod.start());

    it('counter → onCounterChange(value, text)', () => {
      const seen = [];
      mod.onCounterChange = (value, text) => seen.push([value, text]);
      fromWorklet(mod, { type: 'counter', value: 42, text: '042' });
      assert.deepEqual(seen, [[42, '042']]);
    });

    it('overflow → onOverflow(value)', () => {
      const seen = [];
      mod.onOverflow = (v) => seen.push(v);
      fromWorklet(mod, { type: 'overflow', value: true });
      assert.deepEqual(seen, [true]);
    });

    it('reset → onReset(value, text)', () => {
      const seen = [];
      mod.onReset = (value, text) => seen.push([value, text]);
      fromWorklet(mod, { type: 'reset', value: 0, text: '000' });
      assert.deepEqual(seen, [[0, '000']]);
    });

    it('testMode → onTestMode(value)', () => {
      const seen = [];
      mod.onTestMode = (v) => seen.push(v);
      fromWorklet(mod, { type: 'testMode', value: 2 });
      assert.deepEqual(seen, [2]);
    });

    it('sin callbacks, mensajes desconocidos o vacíos, no falla', () => {
      assert.doesNotThrow(() => {
        fromWorklet(mod, { type: 'counter', value: 1, text: '001' });
        fromWorklet(mod, { type: 'loQueSea' });
        fromWorklet(mod, null);
      });
    });
  });

  describe('Stop y limpieza', () => {
    it('stop() manda stop al worklet y desconecta todo', () => {
      mod.start();
      const worklet = mod.workletNode;
      const merger = mod.merger;
      const splitter = mod.splitter;
      const keepalive = mod._keepaliveGain;
      const gains = [...mod.outputs.map(o => o.node), ...mod.inputs.map(i => i.node)];
      mod.stop();
      assert.deepEqual(worklet.port._messages.at(-1), { type: 'stop' });
      for (const node of [worklet, merger, splitter, keepalive, ...gains]) {
        assert.ok(node._calls.disconnect >= 1);
      }
    });

    it('stop() deja el módulo como recién construido', () => {
      mod.start();
      mod.stop();
      assert.equal(mod.isStarted, false);
      assert.equal(mod.workletNode, null);
      assert.equal(mod.merger, null);
      assert.equal(mod.splitter, null);
      assert.equal(mod._keepaliveGain, null);
      assert.equal(mod.outputs.length, 0);
      assert.equal(mod.inputs.length, 0);
    });

    it('stop() sin start() no falla; start() tras stop() vuelve a crear nodos', () => {
      assert.doesNotThrow(() => mod.stop());
      mod.start();
      const first = mod.workletNode;
      mod.stop();
      mod.start();
      assert.notStrictEqual(mod.workletNode, first);
      assert.equal(mod.outputs.length, 13);
    });
  });

  describe('Dormancy', () => {
    beforeEach(() => { mod.start(); clearMessages(mod); });

    it('setDormant(true/false) manda setDormant al worklet', () => {
      mod.setDormant(true);
      mod.setDormant(false);
      assert.deepEqual(messages(mod), [
        { type: 'setDormant', value: true },
        { type: 'setDormant', value: false }
      ]);
      assert.equal(mod.isDormant, false);
    });

    it('setDormant con el mismo valor no reenvía', () => {
      mod.setDormant(true);
      mod.setDormant(true);
      assert.equal(messagesOfType(mod, 'setDormant').length, 1);
      assert.equal(mod.isDormant, true);
    });

    it('setDormant antes de start() no falla (no hay worklet)', () => {
      const idle = new SequencerModule({ audioCtx: ctx }, 'sequencer');
      assert.doesNotThrow(() => idle.setDormant(true));
      assert.equal(idle.isDormant, true);
    });
  });
});
