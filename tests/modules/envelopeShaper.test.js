/**
 * Tests para modules/envelopeShaper.js — Gate & LED (sin dormancy)
 *
 * Los Envelope Shapers no usan dormancy. Siempre despiertos gracias al
 * keepalive GainNode (gain=0 al destination), que garantiza process().
 * Coste negligible (~3 mult/sample en IDLE).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockAudioContext,
  createMockAudioWorkletNode,
  createMockGainNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE — Réplica de la lógica de EnvelopeShaperModule (sin dormancy)
// ═══════════════════════════════════════════════════════════════════════════

class TestEnvelopeShaperModule {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.name = 'Envelope Shaper';
    this.inputs = [];
    this.outputs = [];

    this.workletNode = null;
    this.merger = null;
    this.splitter = null;
    this.envGain = null;
    this.audioGain = null;
    this.audioInputGain = null;
    this.triggerInputGain = null;

    this.onActiveChange = null;
    this._manualGateActive = false;

    this.values = {
      mode: 2,
      delay: 0,
      attack: 0,
      decay: 5,
      sustain: 7,
      release: 3,
      envelopeLevel: 5,
      signalLevel: 0
    };

    this.isStarted = false;
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    this.workletNode = createMockAudioWorkletNode('envelope-shaper', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit'
    });

    this.workletNode.port.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === 'active' && this.onActiveChange) {
        this.onActiveChange(msg.value);
      }
    };

    this.merger = ctx.createChannelMerger(2);
    this.splitter = ctx.createChannelSplitter(2);
    this.envGain = ctx.createGain();
    this.audioGain = ctx.createGain();
    this.audioInputGain = ctx.createGain();
    this.triggerInputGain = ctx.createGain();

    this.outputs.push(
      { id: 'envelope', kind: 'envelopeShaper', node: this.envGain, label: 'Envelope CV' },
      { id: 'audio',    kind: 'envelopeShaper', node: this.audioGain, label: 'Envelope Audio' }
    );
    this.inputs.push(
      { id: 'signal',  kind: 'envelopeShaper', node: this.audioInputGain,   label: 'Signal In' },
      { id: 'trigger', kind: 'envelopeShaper', node: this.triggerInputGain,  label: 'Trigger In' }
    );

    this._sendToWorklet('setMode', this.values.mode);
    this._sendToWorklet('setDelay', this.values.delay);
    this._sendToWorklet('setAttack', this.values.attack);
    this._sendToWorklet('setDecay', this.values.decay);
    this._sendToWorklet('setSustain', this.values.sustain);
    this._sendToWorklet('setRelease', this.values.release);
    this._sendToWorklet('setEnvelopeLevel', this.values.envelopeLevel);
    this._sendToWorklet('setSignalLevel', this.values.signalLevel);
    this._sendToWorklet('gate', this._manualGateActive);
  }

  setMode(value) {
    this.values.mode = Math.max(0, Math.min(4, Math.round(value)));
    this._sendToWorklet('setMode', this.values.mode);
  }

  setGate(active) {
    this._manualGateActive = !!active;
    this._sendToWorklet('gate', active);
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
  }

  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type, value });
    } catch (e) { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getMessages(module) {
  return module.workletNode.port._messages;
}

function getMessagesByType(module, type) {
  return getMessages(module).filter(m => m.type === type);
}

function clearMessages(module) {
  module.workletNode.port._messages.length = 0;
}

function simulateWorkletMessage(module, data) {
  if (module.workletNode.port.onmessage) {
    module.workletNode.port.onmessage({ data });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaperModule — Gate & LED (sin dormancy)', () => {
  let mockCtx;
  let mockEngine;
  let esModule;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    esModule = new TestEnvelopeShaperModule(mockEngine, 'es1');
  });

  describe('inicialización', () => {
    it('empieza con gate desactivado', () => {
      assert.equal(esModule._manualGateActive, false);
    });

    it('empieza en modo GATED (mode=2)', () => {
      assert.equal(esModule.values.mode, 2);
    });

    it('start() crea workletNode y marca isStarted', () => {
      esModule.start();
      assert.notEqual(esModule.workletNode, null);
      assert.equal(esModule.isStarted, true);
    });

    it('tras start() ganancias permanecen en 1 (sin dormancy)', () => {
      esModule.start();
      assert.equal(esModule.envGain.gain.value, 1);
      assert.equal(esModule.audioGain.gain.value, 1);
    });

    it('tras start() no envía setDormant al worklet', () => {
      esModule.start();
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0);
    });
  });

  describe('gate → directo al worklet', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('setGate(true) pone _manualGateActive = true', () => {
      esModule.setGate(true);
      assert.equal(esModule._manualGateActive, true);
    });

    it('setGate(true) envía gate:true al worklet', () => {
      esModule.setGate(true);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate');
      assert.equal(gateMsgs.length, 1);
      assert.equal(gateMsgs[0].value, true);
    });

    it('setGate(false) envía gate:false al worklet', () => {
      esModule.setGate(true);
      clearMessages(esModule);
      esModule.setGate(false);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate');
      assert.equal(gateMsgs.length, 1);
      assert.equal(gateMsgs[0].value, false);
    });

    it('gate no genera mensajes de dormancy', () => {
      esModule.setGate(true);
      esModule.setGate(false);
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0);
    });
  });

  describe('LED — onActiveChange', () => {
    it('worklet active:true invoca callback', () => {
      esModule.start();
      let ledState = null;
      esModule.onActiveChange = (active) => { ledState = active; };
      simulateWorkletMessage(esModule, { type: 'active', value: true });
      assert.equal(ledState, true);
    });

    it('worklet active:false invoca callback', () => {
      esModule.start();
      let ledState = null;
      esModule.onActiveChange = (active) => { ledState = active; };
      simulateWorkletMessage(esModule, { type: 'active', value: true });
      simulateWorkletMessage(esModule, { type: 'active', value: false });
      assert.equal(ledState, false);
    });
  });

  describe('escenario: app fresh + gate', () => {
    it('start → gate:true → worklet recibe gate directamente', () => {
      esModule.start();
      clearMessages(esModule);

      esModule.setGate(true);

      const msgs = getMessages(esModule);
      const gateMsgs = msgs.filter(m => m.type === 'gate');
      assert.equal(gateMsgs.length, 1);
      assert.equal(gateMsgs[0].value, true);
      assert.equal(esModule.envGain.gain.value, 1);
      assert.equal(esModule.audioGain.gain.value, 1);
    });

    it('gate on + off → solo mensajes gate, sin dormancy', () => {
      esModule.start();
      clearMessages(esModule);

      esModule.setGate(true);
      esModule.setGate(false);

      const msgs = getMessages(esModule);
      assert.equal(msgs.filter(m => m.type === 'gate').length, 2);
      assert.equal(msgs.filter(m => m.type === 'setDormant').length, 0);
    });
  });

  describe('guards', () => {
    it('setGate antes de start registra estado', () => {
      esModule.setGate(true);
      assert.equal(esModule._manualGateActive, true);
    });

    it('start() no re-ejecuta si ya iniciado', () => {
      esModule.start();
      const msgCount = getMessages(esModule).length;
      esModule.start();
      assert.equal(getMessages(esModule).length, msgCount);
    });

    it('setMode envía al worklet sin evaluar dormancy', () => {
      esModule.start();
      clearMessages(esModule);
      esModule.setMode(1);
      const msgs = getMessages(esModule);
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].type, 'setMode');
      assert.equal(msgs[0].value, 1);
    });
  });
});
