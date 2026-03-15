/**
 * Tests para modules/pitchToVoltageConverter.js
 *
 * Verifica:
 * - Inicialización de nodos de audio (worklet, gains, etc.)
 * - Registro de 1 input (audio) y 1 output (voltage)
 * - Control del parámetro Range (dial → worklet)
 * - Serialización / deserialización
 * - Dormancy (silenciar/restaurar)
 * - Ciclo de vida (start, stop)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockAudioContext,
  createMockAudioWorkletNode,
  createMockGainNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE — Réplica de PitchToVoltageConverterModule
// ═══════════════════════════════════════════════════════════════════════════

class TestPVCModule {
  constructor(engine, id, config = {}) {
    this.engine = engine;
    this.id = id;
    this.name = 'Pitch to Voltage Converter';
    this.inputs = [];
    this.outputs = [];
    this._isDormant = false;

    this.workletNode = null;
    this.inputGain = null;
    this.outputGain = null;
    this._keepaliveGain = null;

    this.values = {
      range: config.range ?? 7
    };

    this.config = {
      ramps: {
        level: config.ramps?.level ?? 0.06
      }
    };

    this.isStarted = false;
  }

  getAudioCtx() {
    return this.engine.audioCtx;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    this.workletNode = createMockAudioWorkletNode('pitch-to-voltage-converter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });

    // GainNode de entrada (punto de conexión para la matriz, Panel 5)
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = 1;

    // GainNode de salida (punto de conexión para la matriz, Panel 6)
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;

    // Conexiones: inputGain → worklet → outputGain
    // (en mock no conectamos realmente pero registramos)

    // Keepalive
    this._keepaliveGain = ctx.createGain();
    this._keepaliveGain.gain.value = 0;

    // Registrar input
    this.inputs.push({
      id: 'audio',
      kind: 'pitchToVoltageConverterInput',
      node: this.inputGain,
      label: 'PVC Audio In'
    });

    // Registrar output
    this.outputs.push({
      id: 'voltage',
      kind: 'pitchToVoltageConverter',
      node: this.outputGain,
      label: 'PVC Voltage Out'
    });

    // Enviar estado inicial al worklet
    this._sendToWorklet('setRange', this.values.range);
  }

  setRange(dialValue) {
    this.values.range = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setRange', this.values.range);
  }

  serialize() {
    return { range: this.values.range };
  }

  deserialize(data) {
    if (!data) return;
    if (data.range !== undefined) this.setRange(data.range);
  }

  getOutputNode(outputId) {
    if (outputId === 'voltage') {
      if (!this.outputGain) this._initAudioNodes();
      return this.outputGain;
    }
    return null;
  }

  getInputNode(inputId) {
    if (inputId === 'audio') {
      if (!this.inputGain) this._initAudioNodes();
      return this.inputGain;
    }
    return null;
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
  }

  stop() {
    if (!this.isStarted || !this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'stop' });

    this.workletNode = null;
    this.inputGain = null;
    this.outputGain = null;
    this._keepaliveGain = null;
    this.outputs.length = 0;
    this.inputs.length = 0;
    this.isStarted = false;
  }

  setDormant(dormant) {
    this._isDormant = dormant;
    this._onDormancyChange(dormant);
  }

  _onDormancyChange(dormant) {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'setDormant', dormant });
    }
    const ctx = this.getAudioCtx();
    if (!ctx) return;

    if (dormant) {
      this.outputGain.gain.value = 0;
      this.inputGain.gain.value = 0;
    } else {
      this.outputGain.gain.value = 1;
      this.inputGain.gain.value = 1;
      this._sendToWorklet('setRange', this.values.range);
    }
  }

  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type, value });
    } catch { /* ignore */ }
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

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverterModule', () => {
  let mockCtx;
  let mockEngine;
  let pvc;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    pvc = new TestPVCModule(mockEngine, 'panel4-pvc');
  });

  // ───────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ───────────────────────────────────────────────────────────────────────

  describe('inicialización', () => {
    it('empieza con range=7 (unity)', () => {
      assert.equal(pvc.values.range, 7);
    });

    it('start() crea workletNode y marca isStarted', () => {
      pvc.start();
      assert.notEqual(pvc.workletNode, null);
      assert.equal(pvc.isStarted, true);
    });

    it('start() no se ejecuta dos veces', () => {
      pvc.start();
      const firstNode = pvc.workletNode;
      pvc.start();
      assert.strictEqual(pvc.workletNode, firstNode);
    });

    it('tras start() inputGain.value = 1', () => {
      pvc.start();
      assert.equal(pvc.inputGain.gain.value, 1);
    });

    it('tras start() outputGain.value = 1', () => {
      pvc.start();
      assert.equal(pvc.outputGain.gain.value, 1);
    });

    it('start() envía setRange al worklet con valor inicial', () => {
      pvc.start();
      const rangeMsg = getMessagesByType(pvc, 'setRange');
      assert.equal(rangeMsg.length, 1);
      assert.equal(rangeMsg[0].value, 7);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // INPUTS Y OUTPUTS
  // ───────────────────────────────────────────────────────────────────────

  describe('inputs y outputs', () => {
    beforeEach(() => pvc.start());

    it('registra 1 input (audio)', () => {
      assert.equal(pvc.inputs.length, 1);
      assert.equal(pvc.inputs[0].id, 'audio');
      assert.equal(pvc.inputs[0].kind, 'pitchToVoltageConverterInput');
    });

    it('registra 1 output (voltage)', () => {
      assert.equal(pvc.outputs.length, 1);
      assert.equal(pvc.outputs[0].id, 'voltage');
      assert.equal(pvc.outputs[0].kind, 'pitchToVoltageConverter');
    });

    it('getInputNode("audio") devuelve inputGain', () => {
      assert.strictEqual(pvc.getInputNode('audio'), pvc.inputGain);
    });

    it('getOutputNode("voltage") devuelve outputGain', () => {
      assert.strictEqual(pvc.getOutputNode('voltage'), pvc.outputGain);
    });

    it('getInputNode con id no válido devuelve null', () => {
      assert.equal(pvc.getInputNode('invalid'), null);
    });

    it('getOutputNode con id no válido devuelve null', () => {
      assert.equal(pvc.getOutputNode('invalid'), null);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // CONTROL DE RANGE
  // ───────────────────────────────────────────────────────────────────────

  describe('Range', () => {
    beforeEach(() => {
      pvc.start();
      clearMessages(pvc);
    });

    it('setRange(5) actualiza values.range', () => {
      pvc.setRange(5);
      assert.equal(pvc.values.range, 5);
    });

    it('setRange(5) envía setRange al worklet', () => {
      pvc.setRange(5);
      const msgs = getMessagesByType(pvc, 'setRange');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 5);
    });

    it('setRange clamps a [0, 10]', () => {
      pvc.setRange(-2);
      assert.equal(pvc.values.range, 0);
      pvc.setRange(15);
      assert.equal(pvc.values.range, 10);
    });

    it('setRange en dormancy actualiza valor pero no envía al worklet', () => {
      pvc.setDormant(true);
      clearMessages(pvc);
      pvc.setRange(3);
      assert.equal(pvc.values.range, 3);
      const msgs = getMessagesByType(pvc, 'setRange');
      assert.equal(msgs.length, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SERIALIZACIÓN
  // ───────────────────────────────────────────────────────────────────────

  describe('serialización', () => {
    it('serialize() devuelve range', () => {
      pvc.values.range = 4;
      const data = pvc.serialize();
      assert.deepEqual(data, { range: 4 });
    });

    it('deserialize() restaura range', () => {
      pvc.start();
      clearMessages(pvc);
      pvc.deserialize({ range: 8 });
      assert.equal(pvc.values.range, 8);
      const msgs = getMessagesByType(pvc, 'setRange');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 8);
    });

    it('deserialize(null) no lanza error', () => {
      assert.doesNotThrow(() => pvc.deserialize(null));
    });

    it('deserialize({}) no cambia range', () => {
      pvc.values.range = 7;
      pvc.start();
      clearMessages(pvc);
      pvc.deserialize({});
      assert.equal(pvc.values.range, 7);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // DORMANCY
  // ───────────────────────────────────────────────────────────────────────

  describe('dormancy', () => {
    beforeEach(() => pvc.start());

    it('setDormant(true) silencia output gain', () => {
      pvc.setDormant(true);
      assert.equal(pvc.outputGain.gain.value, 0);
    });

    it('setDormant(true) silencia input gain', () => {
      pvc.setDormant(true);
      assert.equal(pvc.inputGain.gain.value, 0);
    });

    it('setDormant(true) envía setDormant al worklet', () => {
      clearMessages(pvc);
      pvc.setDormant(true);
      const msgs = getMessages(pvc).filter(m => m.type === 'setDormant');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].dormant, true);
    });

    it('setDormant(false) restaura ganancias a 1', () => {
      pvc.setDormant(true);
      pvc.setDormant(false);
      assert.equal(pvc.outputGain.gain.value, 1);
      assert.equal(pvc.inputGain.gain.value, 1);
    });

    it('despertar re-envía setRange al worklet', () => {
      pvc.setRange(3);
      pvc.setDormant(true);
      clearMessages(pvc);
      pvc.setDormant(false);
      const msgs = getMessagesByType(pvc, 'setRange');
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].value, 3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // CICLO DE VIDA
  // ───────────────────────────────────────────────────────────────────────

  describe('ciclo de vida', () => {
    it('stop() envía stop al worklet', () => {
      pvc.start();
      const msgs = pvc.workletNode.port._messages;
      pvc.stop();
      const stopMsgs = msgs.filter(m => m.type === 'stop');
      assert.equal(stopMsgs.length, 1);
    });

    it('stop() limpia nodos y arrays', () => {
      pvc.start();
      pvc.stop();
      assert.equal(pvc.workletNode, null);
      assert.equal(pvc.inputGain, null);
      assert.equal(pvc.outputGain, null);
      assert.equal(pvc.isStarted, false);
      assert.equal(pvc.outputs.length, 0);
      assert.equal(pvc.inputs.length, 0);
    });

    it('stop() sin start() no lanza error', () => {
      assert.doesNotThrow(() => pvc.stop());
    });

    it('config personalizada en constructor', () => {
      const custom = new TestPVCModule(mockEngine, 'pvc2', { range: 5 });
      assert.equal(custom.values.range, 5);
    });
  });
});
