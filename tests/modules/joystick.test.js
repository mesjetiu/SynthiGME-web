/**
 * Tests para modules/joystick.js
 * 
 * Verifica el módulo JoystickModule usando mocks de AudioContext:
 * - Creación de ConstantSourceNodes para X e Y
 * - GainNodes de rango para X e Y
 * - Control de posición (-1 a +1)
 * - Control de rango (dial 0-10 → gain 0-1)
 * - Clamp de valores
 * - Dormancy (silenciar/restaurar)
 * - Getters de output nodes para matriz
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createMockAudioContext } from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo JoystickModule (sin DOM, replica la lógica de audio)
// ═══════════════════════════════════════════════════════════════════════════

class MockJoystickModule {
  constructor(engine, id, config = {}) {
    this.engine = engine;
    this.id = id;
    this.name = 'Joystick';
    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.x = 0;
    this.y = 0;
    this._rangeX = 5;
    this._rangeY = 5;
    this._isDormant = false;
    this.isStarted = false;
    this._preDormantRangeX = null;
    this._preDormantRangeY = null;
    this.outputs = [];
    this.config = {
      ramps: {
        position: config.ramps?.position ?? 0.01,
        range: config.ramps?.range ?? 0.05
      }
    };
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _rangeDialToGain(dial) {
    return Math.max(0, Math.min(1, dial / 10));
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.xConst) return;
    
    this.xConst = ctx.createConstantSource();
    this.xConst.offset.value = 0;
    this.xGain = ctx.createGain();
    this.xGain.gain.value = this._rangeDialToGain(this._rangeX);
    this.xConst.connect(this.xGain);

    this.yConst = ctx.createConstantSource();
    this.yConst.offset.value = 0;
    this.yGain = ctx.createGain();
    this.yGain.gain.value = this._rangeDialToGain(this._rangeY);
    this.yConst.connect(this.yGain);
    
    this.outputs.push(
      { id: 'xOut', kind: 'cv', node: this.xGain, label: `${this.name} X` },
      { id: 'yOut', kind: 'cv', node: this.yGain, label: `${this.name} Y` }
    );
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    try { this.xConst.start(t); } catch { /* ya iniciado */ }
    try { this.yConst.start(t); } catch { /* ya iniciado */ }
    this.isStarted = true;
  }

  stop(time) {
    if (!this.isStarted || !this.xConst) return;
    try {
      this.xConst.stop(time);
      this.yConst.stop(time);
      this.xConst.disconnect();
      this.yConst.disconnect();
      if (this.xGain) this.xGain.disconnect();
      if (this.yGain) this.yGain.disconnect();
    } catch { /* error deteniendo */ }
    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.isStarted = false;
  }

  setPosition(nx, ny) {
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    this.x = x;
    this.y = y;
    if (this._isDormant) return;
    const ctx = this.getAudioCtx();
    if (!ctx || !this.xConst || !this.yConst) return;
    this.xConst.offset.value = x;
    this.yConst.offset.value = y;
  }

  setRangeX(value) {
    this._rangeX = Math.max(0, Math.min(10, value));
    if (this._isDormant) return;
    if (!this.xGain) return;
    this.xGain.gain.value = this._rangeDialToGain(this._rangeX);
  }

  setRangeY(value) {
    this._rangeY = Math.max(0, Math.min(10, value));
    if (this._isDormant) return;
    if (!this.yGain) return;
    this.yGain.gain.value = this._rangeDialToGain(this._rangeY);
  }

  getX() { return this.x; }
  getY() { return this.y; }
  getRangeX() { return this._rangeX; }
  getRangeY() { return this._rangeY; }

  getOutputNodeX() {
    if (!this.xGain) this._initAudioNodes();
    return this.xGain;
  }

  getOutputNodeY() {
    if (!this.yGain) this._initAudioNodes();
    return this.yGain;
  }

  setDormant(dormant) {
    if (this._isDormant === dormant) return;
    this._isDormant = dormant;
    this._onDormancyChange(dormant);
  }

  _onDormancyChange(dormant) {
    if (!this.xGain || !this.yGain) return;
    if (dormant) {
      this._preDormantRangeX = this._rangeX;
      this._preDormantRangeY = this._rangeY;
      this.xGain.gain.value = 0;
      this.yGain.gain.value = 0;
    } else {
      this.xGain.gain.value = this._rangeDialToGain(this._rangeX);
      this.yGain.gain.value = this._rangeDialToGain(this._rangeY);
      if (this.xConst && this.yConst) {
        this.xConst.offset.value = this.x;
        this.yConst.offset.value = this.y;
      }
    }
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
    joystick = new MockJoystickModule(mockEngine, 'joystick-left');
  });

  describe('inicialización', () => {
    
    it('posición inicial es (0, 0)', () => {
      assert.equal(joystick.x, 0);
      assert.equal(joystick.y, 0);
    });

    it('rango inicial es 5 para ambos ejes', () => {
      assert.equal(joystick.getRangeX(), 5);
      assert.equal(joystick.getRangeY(), 5);
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

    it('gains iniciales corresponden al rango por defecto (5/10 = 0.5)', () => {
      joystick.start();
      
      assert.equal(joystick.xGain.gain.value, 0.5);
      assert.equal(joystick.yGain.gain.value, 0.5);
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

    it('no aplica a nodos sin AudioContext', () => {
      const orphan = new MockJoystickModule(null, 'orphan');
      orphan.setPosition(0.5, 0.5);
      
      // Posición se guarda pero no se aplica a nodos
      assert.equal(orphan.x, 0.5);
      assert.equal(orphan.y, 0.5);
    });
  });

  describe('setRangeX / setRangeY', () => {
    
    it('setRangeX cambia la ganancia del eje X', () => {
      joystick.start();
      
      joystick.setRangeX(10);
      assert.equal(joystick.xGain.gain.value, 1.0);
      
      joystick.setRangeX(0);
      assert.equal(joystick.xGain.gain.value, 0);
    });

    it('setRangeY cambia la ganancia del eje Y', () => {
      joystick.start();
      
      joystick.setRangeY(8);
      assert.equal(joystick.yGain.gain.value, 0.8);
    });

    it('clampea dial a 0-10', () => {
      joystick.start();
      
      joystick.setRangeX(15);
      assert.equal(joystick.getRangeX(), 10);
      assert.equal(joystick.xGain.gain.value, 1.0);
      
      joystick.setRangeX(-5);
      assert.equal(joystick.getRangeX(), 0);
      assert.equal(joystick.xGain.gain.value, 0);
    });

    it('conversión dial→gain es lineal', () => {
      joystick.start();
      
      for (let d = 0; d <= 10; d++) {
        joystick.setRangeX(d);
        assert.equal(joystick.xGain.gain.value, d / 10);
      }
    });
  });

  describe('getOutputNodeX / getOutputNodeY', () => {
    
    it('getOutputNodeX devuelve GainNode (inicializa si necesario)', () => {
      const node = joystick.getOutputNodeX();
      assert.notEqual(node, null);
      assert.equal(node, joystick.xGain);
    });

    it('getOutputNodeY devuelve GainNode', () => {
      const node = joystick.getOutputNodeY();
      assert.notEqual(node, null);
      assert.equal(node, joystick.yGain);
    });
  });

  describe('dormancy', () => {
    
    it('al dormir, las ganancias caen a 0', () => {
      joystick.start();
      joystick.setRangeX(8);
      joystick.setRangeY(6);
      
      joystick.setDormant(true);
      
      assert.equal(joystick.xGain.gain.value, 0);
      assert.equal(joystick.yGain.gain.value, 0);
    });

    it('al despertar, las ganancias se restauran', () => {
      joystick.start();
      joystick.setRangeX(8);
      joystick.setRangeY(6);
      
      joystick.setDormant(true);
      joystick.setDormant(false);
      
      assert.equal(joystick.xGain.gain.value, 0.8);
      assert.equal(joystick.yGain.gain.value, 0.6);
    });

    it('setPosition durante dormancy guarda pero no aplica', () => {
      joystick.start();
      joystick.setDormant(true);
      
      joystick.setPosition(0.9, -0.7);
      
      // Posición guardada
      assert.equal(joystick.x, 0.9);
      assert.equal(joystick.y, -0.7);
      // Offset NO actualizado (sigue en 0 del start())
      assert.equal(joystick.xConst.offset.value, 0);
      assert.equal(joystick.yConst.offset.value, 0);
    });

    it('al despertar restaura posición actualizada durante dormancy', () => {
      joystick.start();
      joystick.setDormant(true);
      joystick.setPosition(0.9, -0.7);
      
      joystick.setDormant(false);
      
      assert.equal(joystick.xConst.offset.value, 0.9);
      assert.equal(joystick.yConst.offset.value, -0.7);
    });

    it('setRange durante dormancy guarda valor para restaurar', () => {
      joystick.start();
      joystick.setDormant(true);
      
      joystick.setRangeX(10);
      joystick.setRangeY(3);
      
      // Gain sigue en 0 (dormant)
      assert.equal(joystick.xGain.gain.value, 0);
      assert.equal(joystick.yGain.gain.value, 0);
      
      // Pero el estado interno se guardó
      assert.equal(joystick.getRangeX(), 10);
      assert.equal(joystick.getRangeY(), 3);
      
      // Al despertar, se restaura
      joystick.setDormant(false);
      assert.equal(joystick.xGain.gain.value, 1.0);
      assert.equal(joystick.yGain.gain.value, 0.3);
    });
  });

  describe('start/stop', () => {
    
    it('start() llama a xConst.start() e yConst.start()', () => {
      joystick.start();
      
      assert.equal(joystick.xConst._calls.start, 1);
      assert.equal(joystick.yConst._calls.start, 1);
    });

    it('stop() limpia todos los nodos', () => {
      joystick.start();
      joystick.stop(0);
      
      assert.equal(joystick.xConst, null);
      assert.equal(joystick.yConst, null);
      assert.equal(joystick.xGain, null);
      assert.equal(joystick.yGain, null);
      assert.equal(joystick.isStarted, false);
    });

    it('múltiples start() no fallan (idempotente)', () => {
      joystick.start();
      joystick.start();
      
      assert.equal(joystick.isStarted, true);
      // No debe lanzar error
      assert.ok(true);
    });

    it('stop() sin start() no falla', () => {
      joystick.stop(0);
      assert.ok(true);
    });
  });

  describe('conversión rangeDialToGain', () => {
    
    it('dial 0 → gain 0', () => {
      assert.equal(joystick._rangeDialToGain(0), 0);
    });

    it('dial 5 → gain 0.5', () => {
      assert.equal(joystick._rangeDialToGain(5), 0.5);
    });

    it('dial 10 → gain 1', () => {
      assert.equal(joystick._rangeDialToGain(10), 1);
    });

    it('valores negativos clampeados a 0', () => {
      assert.equal(joystick._rangeDialToGain(-5), 0);
    });

    it('valores > 10 clampeados a 1', () => {
      assert.equal(joystick._rangeDialToGain(20), 1);
    });
  });
});
