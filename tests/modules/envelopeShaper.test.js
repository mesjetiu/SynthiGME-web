/**
 * Tests para modules/envelopeShaper.js — Dormancy & Gate
 *
 * Verifica la lógica de dormancia autogestionada y el flujo gate→ciclo
 * usando mocks de AudioContext. Replica la lógica exacta del módulo real
 * para detectar bugs en el flujo de mensajes al worklet.
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

    // — Dormancy autogestionada (idéntica al módulo real) —
    this._hasCriticalConnections = false;
    this._manualGateActive = false;
    this._workletCycling = false;
    this._isDormant = true;   // override base default

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
    if (active) {
      this._evaluateDormancy();
    }
  }

  // ——— Ciclo de vida (idéntico al módulo real) ———

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    if (!this.workletNode) return;
    this.isStarted = true;
    this._isDormant = true;
    this._evaluateDormancy();
    if (this._isDormant) {
      this._applyDormancy(true);
    }
  }

  // ——— Dormancy (idéntica al módulo real) ———

  setDormant(dormant) {
    this._hasCriticalConnections = !dormant;
    this._evaluateDormancy();
  }

  _evaluateDormancy() {
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

describe('EnvelopeShaperModule — Dormancy & Gate', () => {
  let mockCtx;
  let mockEngine;
  let esModule;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    esModule = new TestEnvelopeShaperModule(mockEngine, 'es1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Inicialización y estado por defecto
  // ─────────────────────────────────────────────────────────────────────────

  describe('inicialización', () => {
    it('empieza como dormido (_isDormant=true)', () => {
      assert.equal(esModule._isDormant, true);
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

    it('tras start() sin condiciones de wake, permanece dormido', () => {
      esModule.start();
      assert.equal(esModule._isDormant, true);
    });

    it('tras start() dormido, envía setDormant:true al worklet', () => {
      esModule.start();
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.ok(dormantMsgs.length >= 1, 'debe enviar al menos un setDormant');
      assert.equal(dormantMsgs[dormantMsgs.length - 1].dormant, true);
    });

    it('tras start() dormido, rampas de ganancia a 0', () => {
      esModule.start();
      assert.equal(esModule.envGain.gain.value, 0);
      assert.equal(esModule.audioGain.gain.value, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Gate despierta el módulo
  // ─────────────────────────────────────────────────────────────────────────

  describe('gate → despertar módulo', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('setGate(true) pone _manualGateActive = true', () => {
      esModule.setGate(true);
      assert.equal(esModule._manualGateActive, true);
    });

    it('setGate(true) despierta módulo dormido (_isDormant → false)', () => {
      assert.equal(esModule._isDormant, true, 'precondición: dormido');
      esModule.setGate(true);
      assert.equal(esModule._isDormant, false, 'debe despertar');
    });

    it('setGate(true) envía gate:true AL WORKLET', () => {
      esModule.setGate(true);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate');
      assert.ok(gateMsgs.length >= 1, 'debe enviar gate al worklet');
      // Al menos uno de los mensajes gate debe ser true
      assert.ok(gateMsgs.some(m => m.value === true), 'al menos un gate:true');
    });

    it('setGate(true) envía setDormant:false al worklet', () => {
      esModule.setGate(true);
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.ok(dormantMsgs.length >= 1, 'debe enviar setDormant');
      assert.equal(dormantMsgs[dormantMsgs.length - 1].dormant, false,
        'último setDormant debe ser false (despertar)');
    });

    it('setGate(true) rampa ganancias a 1', () => {
      esModule.setGate(true);
      assert.equal(esModule.envGain.gain.value, 1, 'envGain debe ir a 1');
      assert.equal(esModule.audioGain.gain.value, 1, 'audioGain debe ir a 1');
    });

    it('secuencia de mensajes: gate:true ANTES de setDormant:false', () => {
      esModule.setGate(true);
      const msgs = getMessages(esModule);
      const gateIdx = msgs.findIndex(m => m.type === 'gate' && m.value === true);
      const wakeIdx = msgs.findIndex(m => m.type === 'setDormant' && m.dormant === false);
      assert.ok(gateIdx >= 0, 'debe haber gate:true');
      assert.ok(wakeIdx >= 0, 'debe haber setDormant:false');
      assert.ok(gateIdx < wakeIdx,
        `gate:true (idx ${gateIdx}) debe llegar antes que setDormant:false (idx ${wakeIdx})`);
    });

    it('_applyDormancy(false) re-envía gate:true al worklet', () => {
      esModule.setGate(true);
      const gateMsgs = getMessages(esModule).filter(m => m.type === 'gate' && m.value === true);
      // setGate envía uno + _applyDormancy envía otro = al menos 2
      assert.ok(gateMsgs.length >= 2,
        `debe haber al menos 2 gate:true (hay ${gateMsgs.length})`);
    });

    it('módulo ya despierto: setGate(true) no re-transita', () => {
      esModule.setGate(true); // despierta
      clearMessages(esModule);
      esModule.setGate(false);
      esModule.setGate(true); // ya estaba despierto
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      // No debe haber transición (ya estaba despierto porque _workletCycling aún no cambió)
      // BUT: after setGate(false), _manualGateActive is false. If _workletCycling is also false,
      // _evaluateDormancy is NOT called (only called on active=true). So module stays awake
      // because _evaluateDormancy was never called on release.
      // Then setGate(true) calls _evaluateDormancy but _isDormant is already false → no transition.
      assert.equal(dormantMsgs.length, 0, 'no debe haber transición si ya despierto');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Gate release y cycling
  // ─────────────────────────────────────────────────────────────────────────

  describe('gate release → worklet cycling → dormir', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('setGate(false) no evalúa dormancy (deja que worklet decida)', () => {
      esModule.setGate(true); // despierta
      clearMessages(esModule);
      esModule.setGate(false);
      // No debe haber setDormant al soltar gate
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.equal(dormantMsgs.length, 0,
        'soltar gate no debe enviar setDormant (worklet aún ciclando)');
    });

    it('setGate(false) pone _manualGateActive = false', () => {
      esModule.setGate(true);
      esModule.setGate(false);
      assert.equal(esModule._manualGateActive, false);
    });

    it('cycling:false del worklet duerme el módulo', () => {
      esModule.setGate(true); // despierta
      esModule.setGate(false); // suelta
      clearMessages(esModule);

      // Simular que worklet notifica fin de ciclo
      simulateWorkletMessage(esModule, { type: 'cycling', value: false });

      assert.equal(esModule._isDormant, true, 'debe dormir tras cycling:false');
      const dormantMsgs = getMessagesByType(esModule, 'setDormant');
      assert.ok(dormantMsgs.length >= 1, 'debe enviar setDormant:true');
      assert.equal(dormantMsgs[dormantMsgs.length - 1].dormant, true);
    });

    it('cycling:true mantiene módulo despierto aunque gate se suelte', () => {
      esModule.setGate(true); // despierta
      simulateWorkletMessage(esModule, { type: 'cycling', value: true });
      esModule.setGate(false); // suelta

      // _evaluateDormancy no se llama en setGate(false), pero incluso si se llamara:
      // _workletCycling=true → shouldBeAwake=true → no duerme
      assert.equal(esModule._isDormant, false, 'debe seguir despierto');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. DormancyManager (conexiones críticas)
  // ─────────────────────────────────────────────────────────────────────────

  describe('DormancyManager → setDormant()', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('setDormant(false) despierta módulo (conexión crítica)', () => {
      esModule.setDormant(false);
      assert.equal(esModule._hasCriticalConnections, true);
      assert.equal(esModule._isDormant, false);
    });

    it('setDormant(true) duerme módulo si no hay otras razones de wake', () => {
      esModule.setDormant(false); // despierta
      clearMessages(esModule);
      esModule.setDormant(true); // quita conexiones
      assert.equal(esModule._isDormant, true);
    });

    it('setDormant(true) no duerme si gate está activo', () => {
      esModule.setGate(true); // despierta por gate
      esModule.setDormant(false); // también por conexión
      clearMessages(esModule);
      esModule.setDormant(true); // quita conexión pero gate sigue
      assert.equal(esModule._isDormant, false, 'gate activo impide dormir');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Modo FREE_RUN
  // ─────────────────────────────────────────────────────────────────────────

  describe('modo FREE_RUN', () => {
    beforeEach(() => {
      esModule.start();
      clearMessages(esModule);
    });

    it('cambiar a FREE_RUN (mode=1) despierta módulo', () => {
      esModule.setMode(1);
      assert.equal(esModule._isDormant, false);
    });

    it('FREE_RUN mantiene despierto incluso sin gate ni conexiones', () => {
      esModule.setMode(1);
      assert.equal(esModule._isDormant, false);
      assert.equal(esModule._manualGateActive, false);
      assert.equal(esModule._hasCriticalConnections, false);
    });

    it('salir de FREE_RUN duerme si no hay otra razón', () => {
      esModule.setMode(1); // despierta
      clearMessages(esModule);
      esModule.setMode(2); // GATED
      assert.equal(esModule._isDormant, true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Escenario completo: "abro la app, pulso gate"
  // ─────────────────────────────────────────────────────────────────────────

  describe('escenario: app fresh + pulso gate', () => {
    it('simula el flujo completo de UI: ensureAudio → start → setGate', () => {
      // 1. ensureAudio() inicia el módulo
      esModule.start();
      assert.equal(esModule.isStarted, true);
      assert.equal(esModule._isDormant, true, 'tras start: dormido');

      // 2. Verificar que el worklet tiene setDormant:true
      const initMsgs = getMessages(esModule);
      const lastDormant = [...initMsgs].reverse().find(m => m.type === 'setDormant');
      assert.ok(lastDormant, 'debe tener setDormant en init');
      assert.equal(lastDormant.dormant, true);

      clearMessages(esModule);

      // 3. setGate(true) — usuario pulsa gate
      esModule.setGate(true);

      // 4. Verificar: módulo despierto
      assert.equal(esModule._isDormant, false, 'tras gate: despierto');

      // 5. Verificar: worklet recibe gate:true Y setDormant:false
      const msgs = getMessages(esModule);
      const hasGateTrue = msgs.some(m => m.type === 'gate' && m.value === true);
      const hasWake = msgs.some(m => m.type === 'setDormant' && m.dormant === false);
      assert.ok(hasGateTrue, 'worklet debe recibir gate:true');
      assert.ok(hasWake, 'worklet debe recibir setDormant:false');

      // 6. Verificar: ganancias restauradas
      assert.equal(esModule.envGain.gain.value, 1);
      assert.equal(esModule.audioGain.gain.value, 1);
    });

    it('gate press + hold + release → ciclo completo', () => {
      esModule.start();
      clearMessages(esModule);

      // Press
      esModule.setGate(true);
      assert.equal(esModule._isDormant, false, 'debe despertar al pulsar');

      // Worklet empieza a ciclar
      simulateWorkletMessage(esModule, { type: 'cycling', value: true });
      assert.equal(esModule._workletCycling, true);

      // Release
      esModule.setGate(false);
      // Sigue despierto por _workletCycling
      assert.equal(esModule._isDormant, false, 'sigue despierto: worklet ciclando');

      clearMessages(esModule);

      // Worklet termina ciclo
      simulateWorkletMessage(esModule, { type: 'cycling', value: false });
      assert.equal(esModule._isDormant, true, 'duerme al terminar ciclo');
      assert.equal(esModule.envGain.gain.value, 0, 'gains a 0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. LED (onActiveChange)
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
  // 8. Guards y edge cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('guards y edge cases', () => {
    it('setGate antes de start → no evalúa dormancy', () => {
      // Module not started, so _evaluateDormancy should return early
      esModule.setGate(true);
      assert.equal(esModule._manualGateActive, true);
      assert.equal(esModule._isDormant, true, 'sin start, no transita');
    });

    it('start() no re-ejecuta si ya está iniciado', () => {
      esModule.start();
      const msgCount = getMessages(esModule).length;
      esModule.start(); // segunda llamada
      assert.equal(getMessages(esModule).length, msgCount, 'no debe enviar más mensajes');
    });

    it('setGate antes de start + luego start → evalúa con gate activo', () => {
      esModule._manualGateActive = true; // pre-set gate
      esModule.start();
      // _evaluateDormancy en start() debería ver _manualGateActive=true → despertar
      assert.equal(esModule._isDormant, false, 'debe despertar si gate ya activo al start');
    });

    it('múltiples setGate(true) no acumulan transiciones', () => {
      esModule.start();
      clearMessages(esModule);
      esModule.setGate(true);
      const firstWakeMsgs = getMessagesByType(esModule, 'setDormant').length;
      esModule.setGate(true); // ya despierto
      const secondWakeMsgs = getMessagesByType(esModule, 'setDormant').length;
      assert.equal(firstWakeMsgs, secondWakeMsgs,
        'segunda llamada no debe generar más transiciones');
    });
  });
});
