/**
 * Tests para modules/oscillator.js
 * 
 * Verifica el módulo OscillatorModule usando mocks de AudioContext:
 * - Inicialización de nodos de audio
 * - Conexión de oscilador a amplificador
 * - Control de frecuencia y ganancia
 * - Registro de inputs/outputs
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { 
  createMockAudioContext,
  createMockOscillatorNode,
  createMockGainNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo OscillatorModule (sin DOM)
// ═══════════════════════════════════════════════════════════════════════════
// Replicamos la lógica de audio sin dependencias de UI

class MockOscillatorModule {
  constructor(engine, id, baseFreq) {
    this.engine = engine;
    this.id = id;
    this.name = 'Osc ' + id;
    this.baseFreq = baseFreq;
    this.osc = null;
    this.amp = null;
    this.outputs = [];
    this.inputs = [];
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.osc) return;
    
    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = 0;
    
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    
    this.osc.connect(this.amp);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: this.name + ' OUT' });
    this.inputs.push({ id: 'freqCV', kind: 'cv', param: this.osc.frequency, label: this.name + ' FREQ' });
    this.inputs.push({ id: 'ampCV', kind: 'cv', param: this.amp.gain, label: this.name + ' AMP' });
  }

  start() {
    this._initAudioNodes();
    const t = this.getAudioCtx().currentTime + 0.05;
    try { this.osc.start(t); } catch (error) {
      // ignore multiple starts
    }
  }

  stop(time) {
    if (!this.osc) return;
    try { this.osc.stop(time); } catch (error) {
      // ignore multiple stops
    }
  }

  setFrequency(value) {
    if (this.osc?.frequency) {
      this.osc.frequency.value = value;
    }
  }

  setLevel(value) {
    if (this.amp?.gain) {
      this.amp.gain.value = value;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('OscillatorModule (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let oscillator;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    oscillator = new MockOscillatorModule(mockEngine, 1, 440);
  });

  describe('inicialización', () => {
    
    it('no crea nodos hasta llamar a start()', () => {
      assert.equal(oscillator.osc, null);
      assert.equal(oscillator.amp, null);
    });

    it('start() crea oscilador y amplificador', () => {
      oscillator.start();
      
      assert.notEqual(oscillator.osc, null);
      assert.notEqual(oscillator.amp, null);
    });

    it('oscilador es tipo sine por defecto', () => {
      oscillator.start();
      
      assert.equal(oscillator.osc.type, 'sine');
    });

    it('frecuencia inicial es 0', () => {
      oscillator.start();
      
      assert.equal(oscillator.osc.frequency.value, 0);
    });

    it('ganancia inicial es 0', () => {
      oscillator.start();
      
      assert.equal(oscillator.amp.gain.value, 0);
    });
  });

  describe('conexiones', () => {
    
    it('oscilador se conecta al amplificador', () => {
      oscillator.start();
      
      assert.ok(oscillator.osc._calls.connect >= 1);
    });

    it('registra output de audio', () => {
      oscillator.start();
      
      const audioOut = oscillator.outputs.find(o => o.id === 'audioOut');
      assert.ok(audioOut);
      assert.equal(audioOut.kind, 'audio');
      assert.equal(audioOut.node, oscillator.amp);
    });

    it('registra input de frecuencia CV', () => {
      oscillator.start();
      
      const freqCV = oscillator.inputs.find(i => i.id === 'freqCV');
      assert.ok(freqCV);
      assert.equal(freqCV.kind, 'cv');
      assert.equal(freqCV.param, oscillator.osc.frequency);
    });

    it('registra input de amplitud CV', () => {
      oscillator.start();
      
      const ampCV = oscillator.inputs.find(i => i.id === 'ampCV');
      assert.ok(ampCV);
      assert.equal(ampCV.kind, 'cv');
      assert.equal(ampCV.param, oscillator.amp.gain);
    });
  });

  describe('control de parámetros', () => {
    
    it('setFrequency cambia la frecuencia', () => {
      oscillator.start();
      
      oscillator.setFrequency(440);
      
      assert.equal(oscillator.osc.frequency.value, 440);
    });

    it('setLevel cambia la ganancia', () => {
      oscillator.start();
      
      oscillator.setLevel(0.8);
      
      assert.equal(oscillator.amp.gain.value, 0.8);
    });
  });

  describe('start/stop', () => {
    
    it('start() llama a osc.start()', () => {
      oscillator.start();
      
      assert.equal(oscillator.osc._calls.start, 1);
    });

    it('múltiples start() no fallan', () => {
      oscillator.start();
      oscillator.start();
      oscillator.start();
      
      // No debe lanzar error
      assert.ok(true);
    });

    it('stop() llama a osc.stop()', () => {
      oscillator.start();
      oscillator.stop(0);
      
      assert.equal(oscillator.osc._calls.stop, 1);
    });

    it('stop() sin start() no falla', () => {
      oscillator.stop(0);
      
      // No debe lanzar error
      assert.ok(true);
    });
  });

  describe('sin AudioContext', () => {
    
    it('_initAudioNodes no hace nada sin contexto', () => {
      const orphan = new MockOscillatorModule(null, 1, 440);
      orphan._initAudioNodes();
      
      assert.equal(orphan.osc, null);
      assert.equal(orphan.amp, null);
    });
  });
});
