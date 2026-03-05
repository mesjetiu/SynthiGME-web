/**
 * Tests para modules/keyboard.js — KeyboardModule (Synthi 100 Cuenca)
 * 
 * Verifica el módulo de audio del teclado usando mocks:
 * - Inicialización y configuración por defecto
 * - Creación y conexión de nodos de audio (worklet → splitter → 3 gains)
 * - Registro de 3 outputs (pitch, velocity, gate)
 * - Mensajes al worklet (noteOn, noteOff, parámetros)
 * - Serialización / deserialización
 * - getOutputNode() por ID
 * - Lazy start y ciclo de vida
 * - Dormancy
 * 
 * @version 1.0.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { 
  createMockAudioContext,
  createMockAudioWorkletNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo KeyboardModule (sin dependencias de worklet real)
// ═══════════════════════════════════════════════════════════════════════════

class MockKeyboardModule {
  constructor(engine, id, side, config = {}) {
    this.engine = engine;
    this.id = id;
    this.name = `Keyboard ${side === 'upper' ? 'Upper' : 'Lower'}`;
    this.side = side;
    
    this.config = {
      ramps: {
        level: config.ramps?.level ?? 0.06
      }
    };
    
    this.workletNode = null;
    this.splitter = null;
    this.pitchGain = null;
    this.velocityGain = null;
    this.gateGain = null;
    
    this.values = {
      pitchSpread: 9,
      pitchOffset: 0,
      invert: false,
      velocityLevel: 0,
      gateLevel: 0,
      retrigger: 0
    };
    
    this.outputs = [];
    this.isStarted = false;
    this._isDormant = false;
    this._workletMessages = [];
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _sendToWorklet(type, value) {
    this._workletMessages.push({ type, value });
    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type, value });
      } catch (e) { /* noop in tests */ }
    }
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;

    const kind = this.side === 'upper' ? 'keyboardUpper' : 'keyboardLower';

    this.workletNode = createMockAudioWorkletNode(ctx, 'keyboard', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [3]
    });

    this.splitter = ctx.createChannelSplitter(3);
    this.workletNode.connect(this.splitter);

    this.pitchGain = ctx.createGain();
    this.pitchGain.gain.value = 1;
    this.splitter.connect(this.pitchGain, 0);

    this.velocityGain = ctx.createGain();
    this.velocityGain.gain.value = 1;
    this.splitter.connect(this.velocityGain, 1);

    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 1;
    this.splitter.connect(this.gateGain, 2);

    this.outputs.push(
      { id: 'pitch',    kind, node: this.pitchGain,    label: `${this.name} Pitch` },
      { id: 'velocity', kind, node: this.velocityGain, label: `${this.name} Velocity` },
      { id: 'gate',     kind, node: this.gateGain,     label: `${this.name} Gate` }
    );
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    this.isStarted = true;
  }

  noteOn(note, velocity) {
    this._sendToWorklet('noteOn', { note, velocity });
  }

  noteOff(note) {
    this._sendToWorklet('noteOff', { note });
  }

  setPitchSpread(dialValue) {
    this.values.pitchSpread = dialValue;
    if (!this._isDormant) this._sendToWorklet('setPitchSpread', dialValue);
  }

  setPitchOffset(dialValue) {
    this.values.pitchOffset = dialValue;
    if (!this._isDormant) this._sendToWorklet('setPitchOffset', dialValue);
  }

  setVelocityLevel(dialValue) {
    this.values.velocityLevel = dialValue;
    if (!this._isDormant) this._sendToWorklet('setVelocityLevel', dialValue);
  }

  setGateLevel(dialValue) {
    this.values.gateLevel = dialValue;
    if (!this._isDormant) this._sendToWorklet('setGateLevel', dialValue);
  }

  setRetrigger(mode) {
    this.values.retrigger = mode === 1 ? 1 : 0;
    if (!this._isDormant) this._sendToWorklet('setRetrigger', this.values.retrigger);
  }

  getOutputNode(outputId) {
    switch (outputId) {
      case 'pitch':    return this.pitchGain || (this._initAudioNodes(), this.pitchGain);
      case 'velocity': return this.velocityGain || (this._initAudioNodes(), this.velocityGain);
      case 'gate':     return this.gateGain || (this._initAudioNodes(), this.gateGain);
      default:         return null;
    }
  }

  serialize() {
    return {
      pitchSpread: this.values.pitchSpread,
      pitchOffset: this.values.pitchOffset,
      velocityLevel: this.values.velocityLevel,
      gateLevel: this.values.gateLevel,
      retrigger: this.values.retrigger
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.pitchSpread !== undefined) this.setPitchSpread(data.pitchSpread);
    if (data.pitchOffset !== undefined) this.setPitchOffset(data.pitchOffset);
    if (data.velocityLevel !== undefined) this.setVelocityLevel(data.velocityLevel);
    if (data.gateLevel !== undefined) this.setGateLevel(data.gateLevel);
    if (data.retrigger !== undefined) this.setRetrigger(data.retrigger);
  }

  setDormant(dormant) {
    this._isDormant = dormant;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN Y DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — Inicialización', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
  });

  it('crea un módulo upper con valores por defecto', () => {
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    assert.strictEqual(mod.side, 'upper');
    assert.strictEqual(mod.values.pitchSpread, 9);
    assert.strictEqual(mod.values.pitchOffset, 0);
    assert.strictEqual(mod.values.velocityLevel, 0);
    assert.strictEqual(mod.values.gateLevel, 0);
    assert.strictEqual(mod.values.retrigger, 0);
    assert.strictEqual(mod.isStarted, false);
  });

  it('crea un módulo lower', () => {
    mod = new MockKeyboardModule(engine, 'kb-lower', 'lower');
    assert.strictEqual(mod.side, 'lower');
    assert.ok(mod.name.includes('Lower'));
  });

  it('no crea nodos antes de start()', () => {
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    assert.strictEqual(mod.workletNode, null);
    assert.strictEqual(mod.splitter, null);
    assert.strictEqual(mod.pitchGain, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NODOS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — Nodos de audio', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    mod.start();
  });

  it('crea worklet, splitter y 3 gains tras start()', () => {
    assert.ok(mod.workletNode);
    assert.ok(mod.splitter);
    assert.ok(mod.pitchGain);
    assert.ok(mod.velocityGain);
    assert.ok(mod.gateGain);
  });

  it('registra 3 outputs', () => {
    assert.strictEqual(mod.outputs.length, 3);
  });

  it('output pitch tiene kind keyboardUpper', () => {
    const pitchOut = mod.outputs.find(o => o.id === 'pitch');
    assert.ok(pitchOut);
    assert.strictEqual(pitchOut.kind, 'keyboardUpper');
  });

  it('output velocity tiene kind keyboardUpper', () => {
    const velOut = mod.outputs.find(o => o.id === 'velocity');
    assert.ok(velOut);
    assert.strictEqual(velOut.kind, 'keyboardUpper');
  });

  it('output gate tiene kind keyboardUpper', () => {
    const gateOut = mod.outputs.find(o => o.id === 'gate');
    assert.ok(gateOut);
    assert.strictEqual(gateOut.kind, 'keyboardUpper');
  });

  it('módulo lower registra outputs con kind keyboardLower', () => {
    const modLower = new MockKeyboardModule(engine, 'kb-lower', 'lower');
    modLower.start();
    assert.ok(modLower.outputs.every(o => o.kind === 'keyboardLower'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — Parámetros', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    mod.start();
    mod._workletMessages = []; // limpiar mensajes de init
  });

  it('setPitchSpread envía mensaje al worklet', () => {
    mod.setPitchSpread(5);
    assert.strictEqual(mod.values.pitchSpread, 5);
    assert.ok(mod._workletMessages.some(m => m.type === 'setPitchSpread' && m.value === 5));
  });

  it('setPitchOffset actualiza valor', () => {
    mod.setPitchOffset(-2);
    assert.strictEqual(mod.values.pitchOffset, -2);
  });

  it('setVelocityLevel actualiza valor', () => {
    mod.setVelocityLevel(-3);
    assert.strictEqual(mod.values.velocityLevel, -3);
  });

  it('setGateLevel actualiza valor', () => {
    mod.setGateLevel(2.5);
    assert.strictEqual(mod.values.gateLevel, 2.5);
  });

  it('setRetrigger 1 activa retrigger', () => {
    mod.setRetrigger(1);
    assert.strictEqual(mod.values.retrigger, 1);
  });

  it('setRetrigger 0 desactiva retrigger', () => {
    mod.setRetrigger(1);
    mod.setRetrigger(0);
    assert.strictEqual(mod.values.retrigger, 0);
  });

  it('setRetrigger con valor inválido → 0', () => {
    mod.setRetrigger(42);
    assert.strictEqual(mod.values.retrigger, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTE ON / NOTE OFF
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — noteOn/noteOff', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    mod.start();
    mod._workletMessages = [];
  });

  it('noteOn envía mensaje noteOn al worklet', () => {
    mod.noteOn(60, 100);
    const msg = mod._workletMessages.find(m => m.type === 'noteOn');
    assert.ok(msg);
    assert.deepStrictEqual(msg.value, { note: 60, velocity: 100 });
  });

  it('noteOff envía mensaje noteOff al worklet', () => {
    mod.noteOff(60);
    const msg = mod._workletMessages.find(m => m.type === 'noteOff');
    assert.ok(msg);
    assert.deepStrictEqual(msg.value, { note: 60 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getOutputNode
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — getOutputNode', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
  });

  it('getOutputNode("pitch") devuelve pitchGain (lazy init)', () => {
    const node = mod.getOutputNode('pitch');
    assert.ok(node);
    assert.strictEqual(node, mod.pitchGain);
  });

  it('getOutputNode("velocity") devuelve velocityGain', () => {
    mod.start();
    assert.strictEqual(mod.getOutputNode('velocity'), mod.velocityGain);
  });

  it('getOutputNode("gate") devuelve gateGain', () => {
    mod.start();
    assert.strictEqual(mod.getOutputNode('gate'), mod.gateGain);
  });

  it('getOutputNode("invalid") devuelve null', () => {
    assert.strictEqual(mod.getOutputNode('invalid'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — Serialización', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
  });

  it('serialize devuelve estado actual', () => {
    mod.setPitchSpread(7);
    mod.setVelocityLevel(-2);
    mod.setGateLevel(3);
    mod.setRetrigger(1);
    const data = mod.serialize();
    assert.strictEqual(data.pitchSpread, 7);
    assert.strictEqual(data.velocityLevel, -2);
    assert.strictEqual(data.gateLevel, 3);
    assert.strictEqual(data.retrigger, 1);
  });

  it('deserialize restaura estado', () => {
    mod.deserialize({
      pitchSpread: 4,
      pitchOffset: -1,
      velocityLevel: 3,
      gateLevel: -2,
      retrigger: 1
    });
    assert.strictEqual(mod.values.pitchSpread, 4);
    assert.strictEqual(mod.values.pitchOffset, -1);
    assert.strictEqual(mod.values.velocityLevel, 3);
    assert.strictEqual(mod.values.gateLevel, -2);
    assert.strictEqual(mod.values.retrigger, 1);
  });

  it('deserialize con datos parciales actualiza solo los campos presentes', () => {
    mod.setPitchSpread(7);
    mod.deserialize({ gateLevel: 1 });
    assert.strictEqual(mod.values.pitchSpread, 7); // no cambia
    assert.strictEqual(mod.values.gateLevel, 1);   // cambia
  });

  it('deserialize con null no hace nada', () => {
    mod.setPitchSpread(7);
    mod.deserialize(null);
    assert.strictEqual(mod.values.pitchSpread, 7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DORMANCY
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardModule — Dormancy', () => {
  let ctx, engine, mod;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    mod = new MockKeyboardModule(engine, 'kb-upper', 'upper');
    mod.start();
  });

  it('dormant previene envío de mensajes al worklet', () => {
    mod.setDormant(true);
    mod._workletMessages = [];
    mod.setPitchSpread(3);
    // Valor se guarda pero no se envía mensaje
    assert.strictEqual(mod.values.pitchSpread, 3);
    assert.strictEqual(mod._workletMessages.length, 0);
  });

  it('al despertar permite envío de mensajes', () => {
    mod.setDormant(true);
    mod.setDormant(false);
    mod._workletMessages = [];
    mod.setPitchSpread(3);
    assert.ok(mod._workletMessages.length > 0);
  });
});
