/**
 * Tests para modules/envelopeShaper.js — Always-awake & Gate
 *
 * Verifica que los Envelope Shapers funcionan siempre despiertos
 * (dormancia desactivada) y que el gate envía mensajes directamente
 * al worklet sin intermediarios de dormancia.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockAudioContext,
  createMockAudioWorkletNode,
  createMockGainNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE — Réplica exacta de la lógica de EnvelopeShaperModule
// ═══════════════════════════════════════════════════════════════════════════
// Se copia la lógica real de src/assets/js/modules/envelopeShaper.js para
// poder testar sin las dependencias de browser (engine.js, logger, etc.).
// Cualquier cambio en el módulo real debe reflejarse aquí.
// ═══════════════════════════════════════════════════════════════════════════

class TestEnvelopeShaperModule {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.name = 'Envelope Shaper';
    this.inputs = [];
    this.outputs = [];

    // — Nodos de audio —
    this.workletNode = null;
    this.merger = null;
    this.splitter = null;
    this.envGain = null;
    this.audioGain = null;
    this.audioInputGain = null;
    this.triggerInputGain = null;

    this.onActiveChange = null;

    // — Dormancy desactivada (idéntica al módulo real) —
    this._hasCriticalConnections = false;
    this._manualGateActive = false;
    this._workletCycling = false;
    this._isDormant = false;   // siempre despierto

    this.values = {
      mode: 2,          // GATED
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

  // ——— _initAudioNodes (simplificado para test) ———
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

    // Escuchar mensajes del worklet (igual que el módulo real)
    this.workletNode.port.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === 'active' && this.onActiveChange) {
        this.onActiveChange(msg.value);
      } else if (msg?.type === 'cycling') {
        this._workletCycling = !!msg.value;
        this._evaluateDormancy();
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

    // Enviar parámetros (idéntico al módulo real)
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

  // ——— Control de parámetros (iguales al módulo real) ———

  setMode(value) {
    this.values.mode = Math.max(0, Math.min(4, Math.round(value)));
    this._sendToWorklet('setMode', this.values.mode);
    this._evaluateDormancy();
  }

  setGate(active) {
    this._manualGateActive = !!active;
    this._sendToWorklet('gate', active);
  }

  // ——— Ciclo de vida (idéntico al módulo real) ———

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
    this._isDormant = false;
  }

  // ——— Dormancy (idéntica al módulo real) ———

  setDormant(dormant) {
    this._hasCriticalConnections = !dormant;
    this._evaluateDormancy();
  }

  _evaluateDormancy() {
    return; // Dormancia desactivada
    // eslint-disable-next-line no-unreachable
    if (!this.isStarted) return;

    const shouldBeAwake =
      this._hasCriticalConnections ||
      this.values.mode === 1 ||     // MODE_FREE_RUN
      this._manualGateActive ||
      this._workletCycling;

    const shouldBeDormant = !shouldBeAwake;
    if (this._isDormant === shouldBeDormant) return;
    this._isDormant = shouldBeDormant;
    this._applyDormancy(shouldBeDormant);
  }

  _applyDormancy(dormant) {
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'setDormant', dormant });
      } catch (e) { /* ignore */ }
    }

    const ctx = this.getAudioCtx();
    if (!ctx) return;

    const rampTime = 0.01;
    const now = ctx.currentTime;

    if (dormant) {
      this._rampGain(this.envGain, 0, now, rampTime);
      this._rampGain(this.audioGain, 0, now, rampTime);
    } else {
      this._rampGain(this.envGain, 1, now, rampTime);
      this._rampGain(this.audioGain, 1, now, rampTime);
      // Restaurar parámetros
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
  }

  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    try {
      this.workletNode.port.postMessage({ type, value });
    } catch (e) { /* ignore */ }
  }

  _rampGain(gainNode, targetGain, now, rampTime) {
    if (!gainNode) return;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(targetGain, now, rampTime);
    } catch (e) { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Filtra mensajes del worklet por tipo */
function getMessages(module) {
  return module.workletNode.port._messages;
}

function getMessagesByType(module, type) {
  return getMessages(module).filter(m => m.type === type);
}

function clearMessages(module) {
  module.workletNode.port._messages.length = 0;
}

/** Simula que el worklet envía un mensaje al módulo (como port.onmessage) */
function simulateWorkletMessage(module, data) {
  if (module.workletNode.port.onmessage) {
    module.workletNode.port.onmessage({ data });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaperModule — Always-awake & Gate', () => {
  let mockCtx;
  let mockEngine;
  let esModule;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    esModule = new TestEnvelopeShaperModule(mockEngine, 'es1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Inicialización — siempre despierto
  // ─────────────────────────────────────────────────────────────────────────

  describe('inicialización', () => {
    it('empieza con _isDormant=false (siempre despierto)', () => {
      assert.equal(esModule._isDormant, false);
    });

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

    it('tras start() permanece despierto (_isDormant=false)', () => {
      esModule.start();
      assert.equal(esModule._isDormant, false);
    });

    it('tras start() NO envía setDormant al worklet', () => {
      esModule.start();
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0, 'no debe enviar setDormant');
    });

    it('tras start() ganancias permanecen en 1', () => {
      esModule.start();
      assert.equal(esModule.envGain.gain.value, 1);
      assert.equal(esModule.audioGain.gain.value, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Gate → directo al worklet
  // ─────────────────────────────────────────────────────────────────────────

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
      assert.equal(gateMsgs.length, 1, 'exactamente 1 gate message');
      assert.equal(gateMsgs[0].value, true);
    });

    it('setGate(false) envía gate:false al worklet', () => {
      esModule.setGate(true);
      clearMessages(esModule);
      esModule.setGate(false);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate');
      assert.equal(gateMsgs.length, 1, 'exactamente 1 gate message');
      assert.equal(gateMsgs[0].value, false);
    });

    it('gate NO genera mensajes de dormancy', () => {
      esModule.setGate(true);
      esModule.setGate(false);
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0, 'no debe enviar setDormant');
    });

    it('módulo permanece despierto durante todo el ciclo gate', () => {
      esModule.setGate(true);
      assert.equal(esModule._isDormant, false);
      esModule.setGate(false);
      assert.equal(esModule._isDormant, false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Dormancy desactivada — infraestructura intacta pero inerte
  // ─────────────────────────────────────────────────────────────────────────

  describe('dormancy desactivada', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('setDormant() del DormancyManager es no-op', () => {
      esModule.setDormant(true);
      assert.equal(esModule._isDormant, false, 'sigue despierto');
      assert.equal(esModule._hasCriticalConnections, false, 'registra el estado');
    });

    it('setDormant(false) registra conexiones pero no transita', () => {
      esModule.setDormant(false);
      assert.equal(esModule._hasCriticalConnections, true);
      assert.equal(esModule._isDormant, false, 'ya estaba despierto');
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0, 'no envía setDormant al worklet');
    });

    it('cycling:false del worklet no causa transición', () => {
      simulateWorkletMessage(esModule, { type: 'cycling', value: true });
      simulateWorkletMessage(esModule, { type: 'cycling', value: false });
      assert.equal(esModule._isDormant, false, 'sigue despierto');
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0);
    });

    it('setMode no causa transición de dormancy', () => {
      esModule.setMode(1); // FREE_RUN
      esModule.setMode(2); // GATED
      assert.equal(esModule._isDormant, false, 'sigue despierto');
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. LED (onActiveChange)
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Escenario: "abro la app, pulso gate"
  // ─────────────────────────────────────────────────────────────────────────

  describe('escenario: app fresh + pulso gate', () => {
    it('start → setGate(true) → worklet recibe gate:true directamente', () => {
      // 1. ensureAudio() inicia el módulo
      esModule.start();
      assert.equal(esModule.isStarted, true);
      assert.equal(esModule._isDormant, false, 'tras start: despierto');

      // 2. NO debe haber setDormant en init
      const initMsgs = getMessages(esModule);
      const dormantInInit = initMsgs.filter(m => m.type === 'setDormant');
      assert.equal(dormantInInit.length, 0, 'sin dormancy en init');

      clearMessages(esModule);

      // 3. setGate(true) — usuario pulsa gate
      esModule.setGate(true);

      // 4. Worklet recibe exactamente gate:true, sin setDormant
      const msgs = getMessages(esModule);
      const gateMsgs = msgs.filter(m => m.type === 'gate');
      const dormantMsgs = msgs.filter(m => m.type === 'setDormant');
      assert.equal(gateMsgs.length, 1, 'exactamente 1 gate');
      assert.equal(gateMsgs[0].value, true);
      assert.equal(dormantMsgs.length, 0, 'sin dormancy');

      // 5. Ganancias a 1
      assert.equal(esModule.envGain.gain.value, 1);
      assert.equal(esModule.audioGain.gain.value, 1);
    });

    it('gate press + release → no dormancy, solo gate on/off', () => {
      esModule.start();
      clearMessages(esModule);

      esModule.setGate(true);
      esModule.setGate(false);

      const msgs = getMessages(esModule);
      const gateMsgs = msgs.filter(m => m.type === 'gate');
      const dormantMsgs = msgs.filter(m => m.type === 'setDormant');

      assert.equal(gateMsgs.length, 2, 'gate on + gate off');
      assert.equal(gateMsgs[0].value, true);
      assert.equal(gateMsgs[1].value, false);
      assert.equal(dormantMsgs.length, 0, 'sin dormancy');
      assert.equal(esModule._isDormant, false, 'sigue despierto');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Guards y edge cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('guards y edge cases', () => {
    it('setGate antes de start → manualGateActive se registra', () => {
      esModule.setGate(true);
      assert.equal(esModule._manualGateActive, true);
    });

    it('start() no re-ejecuta si ya está iniciado', () => {
      esModule.start();
      const msgCount = getMessages(esModule).length;
      esModule.start(); // segunda llamada
      assert.equal(getMessages(esModule).length, msgCount, 'no debe enviar más mensajes');
    });

    it('múltiples setGate(true) envían cada uno su mensaje', () => {
      esModule.start();
      clearMessages(esModule);
      esModule.setGate(true);
      esModule.setGate(true);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate');
      assert.equal(gateMsgs.length, 2, 'un gate por cada llamada');
      assert.ok(gateMsgs.every(m => m.value === true));
    });
  });
});
