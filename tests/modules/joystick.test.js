/**
 * Tests para modules/joystick.js
 * 
 * Verifica el módulo JoystickModule usando mocks de AudioContext:
 * - Creación de ConstantSourceNodes para X e Y
 * - Control de posición (-1 a +1)
 * - Clamp de valores
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createMockAudioContext } from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo JoystickModule (sin DOM)
// ═══════════════════════════════════════════════════════════════════════════

class MockJoystickModule {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.name = 'Stick';
    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.x = 0;
    this.y = 0;
    this.outputs = [];
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.xConst) return;
    
    this.xConst = ctx.createConstantSource();
    this.yConst = ctx.createConstantSource();
    this.xConst.offset.value = 0;
    this.yConst.offset.value = 0;
    
    this.xGain = ctx.createGain();
    this.yGain = ctx.createGain();
    
    this.xConst.connect(this.xGain);
    this.yConst.connect(this.yGain);
    
    this.outputs.push({ id: 'xOut', kind: 'cv', node: this.xGain, label: 'Stick X' });
    this.outputs.push({ id: 'yOut', kind: 'cv', node: this.yGain, label: 'Stick Y' });
  }

  start() {
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    const t = ctx.currentTime + 0.05;
    try { this.xConst.start(t); } catch { /* ya iniciado */ }
    try { this.yConst.start(t); } catch { /* ya iniciado */ }
  }

  stop(time) {
    if (!this.xConst || !this.yConst) return;
    try { this.xConst.stop(time); } catch { /* ya detenido */ }
    try { this.yConst.stop(time); } catch { /* ya detenido */ }
  }

  setPosition(nx, ny) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.xConst || !this.yConst) return;
    
    // Clamp valores a [-1, 1]
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    this.x = x;
    this.y = y;
    
    // Aplicar a los offsets
    this.xConst.offset.value = x;
    this.yConst.offset.value = y;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('JoystickModule (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let joystick;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    joystick = new MockJoystickModule(mockEngine, 'stick1');
  });

  describe('inicialización', () => {
    
    it('posición inicial es (0, 0)', () => {
      assert.equal(joystick.x, 0);
      assert.equal(joystick.y, 0);
    });

    it('no crea nodos hasta llamar a start()', () => {
      assert.equal(joystick.xConst, null);
      assert.equal(joystick.yConst, null);
    });

    it('start() crea ConstantSourceNodes para X e Y', () => {
      joystick.start();
      
      assert.notEqual(joystick.xConst, null);
      assert.notEqual(joystick.yConst, null);
    });

    it('start() crea GainNodes para X e Y', () => {
      joystick.start();
      
      assert.notEqual(joystick.xGain, null);
      assert.notEqual(joystick.yGain, null);
    });

    it('offsets iniciales son 0', () => {
      joystick.start();
      
      assert.equal(joystick.xConst.offset.value, 0);
      assert.equal(joystick.yConst.offset.value, 0);
    });
  });

  describe('conexiones', () => {
    
    it('xConst se conecta a xGain', () => {
      joystick.start();
      
      assert.ok(joystick.xConst._calls.connect >= 1);
    });

    it('yConst se conecta a yGain', () => {
      joystick.start();
      
      assert.ok(joystick.yConst._calls.connect >= 1);
    });

    it('registra output X de CV', () => {
      joystick.start();
      
      const xOut = joystick.outputs.find(o => o.id === 'xOut');
      assert.ok(xOut);
      assert.equal(xOut.kind, 'cv');
      assert.equal(xOut.node, joystick.xGain);
    });

    it('registra output Y de CV', () => {
      joystick.start();
      
      const yOut = joystick.outputs.find(o => o.id === 'yOut');
      assert.ok(yOut);
      assert.equal(yOut.kind, 'cv');
      assert.equal(yOut.node, joystick.yGain);
    });
  });

  describe('setPosition', () => {
    
    it('actualiza posición X e Y', () => {
      joystick.start();
      
      joystick.setPosition(0.5, -0.3);
      
      assert.equal(joystick.x, 0.5);
      assert.equal(joystick.y, -0.3);
    });

    it('aplica valores a los offsets de ConstantSource', () => {
      joystick.start();
      
      joystick.setPosition(0.7, 0.2);
      
      assert.equal(joystick.xConst.offset.value, 0.7);
      assert.equal(joystick.yConst.offset.value, 0.2);
    });

    it('clampea valores mayores que 1', () => {
      joystick.start();
      
      joystick.setPosition(5, 10);
      
      assert.equal(joystick.x, 1);
      assert.equal(joystick.y, 1);
    });

    it('clampea valores menores que -1', () => {
      joystick.start();
      
      joystick.setPosition(-5, -10);
      
      assert.equal(joystick.x, -1);
      assert.equal(joystick.y, -1);
    });

    it('valores en rango se mantienen exactos', () => {
      joystick.start();
      
      joystick.setPosition(-1, 1);
      assert.equal(joystick.x, -1);
      assert.equal(joystick.y, 1);
      
      joystick.setPosition(0, 0);
      assert.equal(joystick.x, 0);
      assert.equal(joystick.y, 0);
    });

    it('no hace nada sin AudioContext', () => {
      const orphan = new MockJoystickModule(null, 'orphan');
      orphan.setPosition(0.5, 0.5);
      
      // No debe cambiar porque no hay contexto
      assert.equal(orphan.x, 0);
      assert.equal(orphan.y, 0);
    });
  });

  describe('start/stop', () => {
    
    it('start() llama a xConst.start() e yConst.start()', () => {
      joystick.start();
      
      assert.equal(joystick.xConst._calls.start, 1);
      assert.equal(joystick.yConst._calls.start, 1);
    });

    it('stop() llama a xConst.stop() e yConst.stop()', () => {
      joystick.start();
      joystick.stop(0);
      
      assert.equal(joystick.xConst._calls.stop, 1);
      assert.equal(joystick.yConst._calls.stop, 1);
    });

    it('múltiples start() no fallan', () => {
      joystick.start();
      joystick.start();
      
      // No debe lanzar error
      assert.ok(true);
    });
  });
});
