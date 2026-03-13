/**
 * Tests para modules/sequencerModule.js — Module class (Fase 5)
 *
 * Verifica la clase del módulo de audio main-thread del secuenciador:
 * - Creación e inicialización de nodos de audio
 * - 13 salidas (6 voltajes + 4 keys + 2 DAC + clock)
 * - 8 entradas (clock, reset, fwd, rev, stop, voltageACE, voltageBDF, key)
 * - Forwarding de knobs/switches/buttons al worklet vía postMessage
 * - Keepalive connection (proceso siempre vivo)
 * - Callbacks de worklet → UI (counter, overflow, reset, testMode)
 * - Ciclo de vida start/stop
 * - Dormancy (setDormant → postMessage)
 * - getOutputNode / getInputNode
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockAudioContext,
  createMockAudioWorkletNode,
  createMockGainNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE — Réplica de la lógica de SequencerModule
// ═══════════════════════════════════════════════════════════════════════════

const TOTAL_OUTPUT_CHANNELS = 13;
const TOTAL_INPUT_CHANNELS  = 8;

// IDs de salida (matching worklet channel indices)
const OUTPUT_IDS = [
  'dac1', 'dac2',
  'voltageA', 'voltageB', 'key1',
  'voltageC', 'voltageD', 'key2',
  'voltageE', 'voltageF', 'key3',
  'key4', 'clock'
];

// IDs de entrada (matching worklet input indices)
const INPUT_IDS = [
  'clock', 'reset', 'forward', 'reverse', 'stop',
  'voltageACE', 'voltageBDF', 'key'
];

class TestSequencerModule {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.name = 'Digital Sequencer 1000';
    this.inputs = [];
    this.outputs = [];
    this._isDormant = false;

    this.workletNode = null;
    this.splitter = null;
    this.merger = null;
    this._keepaliveGain = null;

    // 13 output GainNodes (one per splitter channel)
    this._outputGains = [];
    // 8 input GainNodes (one per merger channel)
    this._inputGains = [];

    // Callbacks para mensajes del worklet → UI
    this.onCounterChange = null;
    this.onOverflow = null;
    this.onReset = null;
    this.onTestMode = null;

    // Valores actuales de controles
    this.values = {
      clockRate: 5,
      voltageA: 5, voltageB: 5, voltageC: 5,
      voltageD: 5, voltageE: 5, voltageF: 5,
      key1: 0, key2: 0, key3: 0, key4: 0
    };

    this.switches = {
      abKey1: false, b: false, cdKey2: false, d: false,
      efKey3: false, f: false, key4: false, runClock: true
    };

    this.isStarted = false;
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    // Worklet: 1 input (8 canales merged), 1 output (13 canales)
    this.workletNode = createMockAudioWorkletNode('sequencer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [TOTAL_OUTPUT_CHANNELS],
      channelCount: TOTAL_INPUT_CHANNELS,
      channelCountMode: 'explicit'
    });

    // Handle worklet messages
    this.workletNode.port.onmessage = (e) => {
      this._handleWorkletMessage(e.data);
    };

    // Merger: 8 mono inputs → 1 output con 8 canales
    this.merger = ctx.createChannelMerger(TOTAL_INPUT_CHANNELS);
    this.merger.connect(this.workletNode);

    // 8 input GainNodes → merger
    for (let i = 0; i < TOTAL_INPUT_CHANNELS; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(this.merger, 0, i);
      this._inputGains.push(gain);
    }

    // Splitter: worklet output → 13 canales separados
    this.splitter = ctx.createChannelSplitter(TOTAL_OUTPUT_CHANNELS);
    this.workletNode.connect(this.splitter);

    // 13 output GainNodes ← splitter
    for (let i = 0; i < TOTAL_OUTPUT_CHANNELS; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      this.splitter.connect(gain, i);
      this._outputGains.push(gain);
    }

    // Registrar salidas para el sistema de ruteo
    for (let i = 0; i < TOTAL_OUTPUT_CHANNELS; i++) {
      this.outputs.push({
        id: OUTPUT_IDS[i],
        kind: 'sequencer',
        node: this._outputGains[i],
        label: OUTPUT_IDS[i]
      });
    }

    // Registrar entradas
    for (let i = 0; i < TOTAL_INPUT_CHANNELS; i++) {
      this.inputs.push({
        id: INPUT_IDS[i],
        kind: 'sequencer',
        node: this._inputGains[i],
        label: INPUT_IDS[i]
      });
    }

    // Keepalive: ganancia 0 al destination (mantiene process() vivo)
    this._keepaliveGain = ctx.createGain();
    this._keepaliveGain.gain.value = 0;
    this.workletNode.connect(this._keepaliveGain);
    this._keepaliveGain.connect(ctx.destination);

    // Enviar estado inicial al worklet
    this._sendToWorklet('setClockRate', this.values.clockRate);
    for (const [sw, val] of Object.entries(this.switches)) {
      if (sw === 'runClock') {
        this._sendToWorklet('setRunClock', val);
      } else {
        this._sendToWorklet('setSwitch', val, sw);
      }
    }
  }

  _handleWorkletMessage(msg) {
    if (!msg) return;
    switch (msg.type) {
      case 'counter':
        if (this.onCounterChange) this.onCounterChange(msg.value, msg.text);
        break;
      case 'overflow':
        if (this.onOverflow) this.onOverflow(msg.value);
        break;
      case 'reset':
        if (this.onReset) this.onReset(msg.value, msg.text);
        break;
      case 'testMode':
        if (this.onTestMode) this.onTestMode(msg.value);
        break;
    }
  }

  // ─── Knobs ──────────────────────────────────────────────────────────────

  setClockRate(value) {
    this.values.clockRate = Math.max(0, Math.min(10, value));
    this._sendToWorklet('setClockRate', this.values.clockRate);
  }

  setKnob(knob, value) {
    if (knob in this.values) {
      this.values[knob] = value;
      this._sendToWorklet('setKnob', value, knob);
    }
  }

  // ─── Switches ──────────────────────────────────────────────────────────

  setSwitch(name, value) {
    if (name in this.switches) {
      this.switches[name] = !!value;
      if (name === 'runClock') {
        this._sendToWorklet('setRunClock', !!value);
      } else {
        this._sendToWorklet('setSwitch', !!value, name);
      }
    }
  }

  // ─── Buttons ───────────────────────────────────────────────────────────

  pressButton(button) {
    this._sendToWorklet('button', button);
  }

  // ─── Output/Input Node Access ──────────────────────────────────────────

  getOutputNode(outputId) {
    const idx = OUTPUT_IDS.indexOf(outputId);
    return idx >= 0 ? this._outputGains[idx] : null;
  }

  getInputNode(inputId) {
    const idx = INPUT_IDS.indexOf(inputId);
    return idx >= 0 ? this._inputGains[idx] : null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
  }

  stop() {
    if (!this.isStarted || !this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'stop' });
    this.workletNode.disconnect();
    if (this.merger) this.merger.disconnect();
    if (this.splitter) this.splitter.disconnect();
    for (const g of this._outputGains) g.disconnect();
    for (const g of this._inputGains) g.disconnect();
    if (this._keepaliveGain) this._keepaliveGain.disconnect();

    this.workletNode = null;
    this.merger = null;
    this.splitter = null;
    this._outputGains = [];
    this._inputGains = [];
    this._keepaliveGain = null;
    this.outputs.length = 0;
    this.inputs.length = 0;
    this.isStarted = false;
  }

  // ─── Dormancy ──────────────────────────────────────────────────────────

  setDormant(dormant) {
    if (this._isDormant === dormant) return;
    this._isDormant = dormant;
    this._sendToWorklet('setDormant', dormant);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  _sendToWorklet(type, value, extra) {
    if (!this.workletNode) return;
    try {
      const msg = { type, value };
      if (extra !== undefined) {
        // For setSwitch: { type: 'setSwitch', value: true, switch: 'abKey1' }
        // For setKnob: { type: 'setKnob', value: 5, knob: 'voltageA' }
        if (type === 'setSwitch') msg.switch = extra;
        else if (type === 'setKnob') msg.knob = extra;
      }
      this.workletNode.port.postMessage(msg);
    } catch (e) { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getMessages(mod) {
  return mod.workletNode.port._messages;
}

function getMessagesByType(mod, type) {
  return getMessages(mod).filter(m => m.type === type);
}

function clearMessages(mod) {
  mod.workletNode.port._messages.length = 0;
}

function simulateWorkletMessage(mod, data) {
  if (mod.workletNode.port.onmessage) {
    mod.workletNode.port.onmessage({ data });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerModule — Fase 5', () => {
  let mockCtx;
  let mockEngine;
  let seq;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    seq = new TestSequencerModule(mockEngine, 'sequencer');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 1: Inicialización y nodos de audio
  // ─────────────────────────────────────────────────────────────────────────

  describe('Inicialización', () => {
    it('empieza con isStarted = false', () => {
      assert.equal(seq.isStarted, false);
    });

    it('empieza sin workletNode', () => {
      assert.equal(seq.workletNode, null);
    });

    it('start() crea workletNode y marca isStarted', () => {
      seq.start();
      assert.notEqual(seq.workletNode, null);
      assert.equal(seq.isStarted, true);
    });

    it('start() idempotente — no recrea nodos', () => {
      seq.start();
      const node1 = seq.workletNode;
      seq.start();
      assert.equal(seq.workletNode, node1);
    });

    it('nombre del módulo es correcto', () => {
      assert.equal(seq.name, 'Digital Sequencer 1000');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 2: Salidas (13 canales)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Salidas (13 canales)', () => {
    beforeEach(() => seq.start());

    it('registra 13 salidas', () => {
      assert.equal(seq.outputs.length, TOTAL_OUTPUT_CHANNELS);
    });

    it('todas las salidas tienen kind = sequencer', () => {
      for (const out of seq.outputs) {
        assert.equal(out.kind, 'sequencer');
      }
    });

    it('IDs de salida son correctos', () => {
      const ids = seq.outputs.map(o => o.id);
      assert.deepEqual(ids, OUTPUT_IDS);
    });

    it('cada salida tiene un GainNode con gain=1', () => {
      for (const out of seq.outputs) {
        assert.notEqual(out.node, null);
        assert.equal(out.node.gain.value, 1);
      }
    });

    it('getOutputNode devuelve el nodo correcto por ID', () => {
      for (const id of OUTPUT_IDS) {
        const node = seq.getOutputNode(id);
        assert.notEqual(node, null, `output ${id} debe existir`);
        assert.equal(node.gain.value, 1);
      }
    });

    it('getOutputNode devuelve null para ID inexistente', () => {
      assert.equal(seq.getOutputNode('noExiste'), null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 3: Entradas (8 canales)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Entradas (8 canales)', () => {
    beforeEach(() => seq.start());

    it('registra 8 entradas', () => {
      assert.equal(seq.inputs.length, TOTAL_INPUT_CHANNELS);
    });

    it('todas las entradas tienen kind = sequencer', () => {
      for (const inp of seq.inputs) {
        assert.equal(inp.kind, 'sequencer');
      }
    });

    it('IDs de entrada son correctos', () => {
      const ids = seq.inputs.map(i => i.id);
      assert.deepEqual(ids, INPUT_IDS);
    });

    it('cada entrada tiene un GainNode con gain=1', () => {
      for (const inp of seq.inputs) {
        assert.notEqual(inp.node, null);
        assert.equal(inp.node.gain.value, 1);
      }
    });

    it('getInputNode devuelve el nodo correcto por ID', () => {
      for (const id of INPUT_IDS) {
        const node = seq.getInputNode(id);
        assert.notEqual(node, null, `input ${id} debe existir`);
      }
    });

    it('getInputNode devuelve null para ID inexistente', () => {
      assert.equal(seq.getInputNode('noExiste'), null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 4: Keepalive
  // ─────────────────────────────────────────────────────────────────────────

  describe('Keepalive', () => {
    it('keepalive GainNode se crea con gain=0', () => {
      seq.start();
      assert.notEqual(seq._keepaliveGain, null);
      assert.equal(seq._keepaliveGain.gain.value, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 5: Forwarding de Knobs al worklet
  // ─────────────────────────────────────────────────────────────────────────

  describe('Knobs → worklet postMessage', () => {
    beforeEach(() => {
      seq.start();
      clearMessages(seq);
    });

    it('setClockRate envía setClockRate al worklet', () => {
      seq.setClockRate(8);
      const msgs = getMessagesByType(seq, 'setClockRate');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 8);
    });

    it('setClockRate clampea valor a 0-10', () => {
      seq.setClockRate(15);
      assert.equal(seq.values.clockRate, 10);
      seq.setClockRate(-3);
      assert.equal(seq.values.clockRate, 0);
    });

    it('setKnob voltageA envía setKnob al worklet', () => {
      seq.setKnob('voltageA', 7);
      const msgs = getMessagesByType(seq, 'setKnob');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 7);
      assert.equal(msgs[0].knob, 'voltageA');
    });

    it('setKnob key1 envía setKnob al worklet', () => {
      seq.setKnob('key1', -3);
      const msgs = getMessagesByType(seq, 'setKnob');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, -3);
      assert.equal(msgs[0].knob, 'key1');
    });

    it('setKnob con nombre inválido no envía nada', () => {
      seq.setKnob('noExiste', 5);
      const msgs = getMessagesByType(seq, 'setKnob');
      assert.equal(msgs.length, 0);
    });

    it('setKnob actualiza values local', () => {
      seq.setKnob('voltageC', 3.5);
      assert.equal(seq.values.voltageC, 3.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 6: Forwarding de Switches al worklet
  // ─────────────────────────────────────────────────────────────────────────

  describe('Switches → worklet postMessage', () => {
    beforeEach(() => {
      seq.start();
      clearMessages(seq);
    });

    it('setSwitch abKey1 envía setSwitch al worklet', () => {
      seq.setSwitch('abKey1', true);
      const msgs = getMessagesByType(seq, 'setSwitch');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, true);
      assert.equal(msgs[0].switch, 'abKey1');
    });

    it('setSwitch runClock envía setRunClock al worklet', () => {
      seq.setSwitch('runClock', false);
      const msgs = getMessagesByType(seq, 'setRunClock');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, false);
    });

    it('setSwitch actualiza switches local', () => {
      seq.setSwitch('b', true);
      assert.equal(seq.switches.b, true);
    });

    it('setSwitch con nombre inválido no envía nada', () => {
      const before = getMessages(seq).length;
      seq.setSwitch('noExiste', true);
      assert.equal(getMessages(seq).length, before);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 7: Forwarding de Buttons al worklet
  // ─────────────────────────────────────────────────────────────────────────

  describe('Buttons → worklet postMessage', () => {
    beforeEach(() => {
      seq.start();
      clearMessages(seq);
    });

    it('pressButton runForward envía button al worklet', () => {
      seq.pressButton('runForward');
      const msgs = getMessagesByType(seq, 'button');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 'runForward');
    });

    it('pressButton masterReset envía button al worklet', () => {
      seq.pressButton('masterReset');
      const msgs = getMessagesByType(seq, 'button');
      assert.equal(msgs[0].value, 'masterReset');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 8: Callbacks de worklet → UI
  // ─────────────────────────────────────────────────────────────────────────

  describe('Worklet → UI callbacks', () => {
    beforeEach(() => seq.start());

    it('counter message dispara onCounterChange', () => {
      let received = null;
      seq.onCounterChange = (value, text) => { received = { value, text }; };
      simulateWorkletMessage(seq, { type: 'counter', value: 42, text: '002A' });
      assert.deepEqual(received, { value: 42, text: '002A' });
    });

    it('overflow message dispara onOverflow', () => {
      let received = null;
      seq.onOverflow = (value) => { received = value; };
      simulateWorkletMessage(seq, { type: 'overflow', value: true });
      assert.equal(received, true);
    });

    it('reset message dispara onReset', () => {
      let received = null;
      seq.onReset = (value, text) => { received = { value, text }; };
      simulateWorkletMessage(seq, { type: 'reset', value: 0, text: '0000' });
      assert.deepEqual(received, { value: 0, text: '0000' });
    });

    it('testMode message dispara onTestMode', () => {
      let received = null;
      seq.onTestMode = (value) => { received = value; };
      simulateWorkletMessage(seq, { type: 'testMode', value: true });
      assert.equal(received, true);
    });

    it('sin callback no lanza error', () => {
      assert.doesNotThrow(() => {
        simulateWorkletMessage(seq, { type: 'counter', value: 0, text: '0000' });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 9: Ciclo de vida (stop)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Stop y limpieza', () => {
    it('stop() envía stop al worklet', () => {
      seq.start();
      const port = seq.workletNode.port;
      seq.stop();
      const msgs = port._messages.filter(m => m.type === 'stop');
      assert.equal(msgs.length, 1);
    });

    it('stop() desconecta y limpia nodos', () => {
      seq.start();
      seq.stop();
      assert.equal(seq.workletNode, null);
      assert.equal(seq.merger, null);
      assert.equal(seq.splitter, null);
      assert.equal(seq._keepaliveGain, null);
      assert.equal(seq._outputGains.length, 0);
      assert.equal(seq._inputGains.length, 0);
    });

    it('stop() vacía outputs e inputs', () => {
      seq.start();
      seq.stop();
      assert.equal(seq.outputs.length, 0);
      assert.equal(seq.inputs.length, 0);
    });

    it('stop() marca isStarted = false', () => {
      seq.start();
      seq.stop();
      assert.equal(seq.isStarted, false);
    });

    it('stop() sin start() no lanza error', () => {
      assert.doesNotThrow(() => seq.stop());
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 10: Dormancy
  // ─────────────────────────────────────────────────────────────────────────

  describe('Dormancy', () => {
    beforeEach(() => {
      seq.start();
      clearMessages(seq);
    });

    it('setDormant true envía setDormant al worklet', () => {
      seq.setDormant(true);
      const msgs = getMessagesByType(seq, 'setDormant');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, true);
    });

    it('setDormant false envía setDormant al worklet', () => {
      seq.setDormant(true);
      clearMessages(seq);
      seq.setDormant(false);
      const msgs = getMessagesByType(seq, 'setDormant');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, false);
    });

    it('setDormant idempotente — no reenvía si no cambia', () => {
      seq.setDormant(true);
      clearMessages(seq);
      seq.setDormant(true);
      const msgs = getMessagesByType(seq, 'setDormant');
      assert.equal(msgs.length, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARTE 11: Estado inicial al worklet
  // ─────────────────────────────────────────────────────────────────────────

  describe('Estado inicial al worklet', () => {
    it('start() envía setClockRate con valor inicial', () => {
      seq.start();
      const msgs = getMessagesByType(seq, 'setClockRate');
      assert.ok(msgs.length >= 1, 'debe enviar setClockRate');
      assert.equal(msgs[0].value, 5);
    });

    it('start() envía switches iniciales al worklet', () => {
      seq.start();
      const switchMsgs = getMessagesByType(seq, 'setSwitch');
      const runClockMsgs = getMessagesByType(seq, 'setRunClock');
      // 7 recording switches + 1 runClock
      assert.ok(switchMsgs.length >= 7, `debe enviar 7 setSwitch, got ${switchMsgs.length}`);
      assert.ok(runClockMsgs.length >= 1, 'debe enviar setRunClock');
    });
  });
});
