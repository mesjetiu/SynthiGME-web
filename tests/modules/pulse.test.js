/**
 * Tests para modules/pulse.js
 * 
 * Verifica el módulo PulseModule usando mocks de AudioContext:
 * - Inicialización de nodos de audio
 * - Control de frecuencia, nivel y pulse width
 * - Actualización de forma de onda
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createMockAudioContext } from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo PulseModule (sin DOM ni waveforms)
// ═══════════════════════════════════════════════════════════════════════════

class MockPulseModule {
  constructor(engine, id, baseFreq) {
    this.engine = engine;
    this.id = id;
    this.name = 'Pulso ' + id;
    this.baseFreq = baseFreq;
    this.osc = null;
    this.amp = null;
    this.pw = 0.5; // Pulse width 50% por defecto
    this.outputs = [];
    this.inputs = [];
    this._waveUpdates = []; // Track wave updates for testing
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _updatePulseWave(duty) {
    if (!this.osc) return;
    // En el mock, solo registramos que se actualizó
    this._waveUpdates.push(duty);
    this.pw = duty;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.osc) return;
    
    this.osc = ctx.createOscillator();
    this.osc.frequency.value = 0;
    
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    
    this.osc.connect(this.amp);
    this._updatePulseWave(this.pw);

    this.outputs.push({ id: 'audioOut', kind: 'audio', node: this.amp, label: this.name + ' OUT' });
    this.inputs.push({ id: 'freqCV', kind: 'cv', param: this.osc.frequency, label: this.name + ' FREQ' });
    this.inputs.push({ id: 'ampCV', kind: 'cv', param: this.amp.gain, label: this.name + ' AMP' });
  }

  start() {
    this._initAudioNodes();
    const t = this.getAudioCtx().currentTime + 0.05;
    try { this.osc.start(t); } catch (error) {
      // ignore repeated starts
    }
  }

  stop(time) {
    if (!this.osc) return;
    try { this.osc.stop(time); } catch (error) {
      // ignore repeated stops
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

  setPulseWidth(value) {
    this.pw = value;
    this._updatePulseWave(value);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('PulseModule (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let pulse;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    pulse = new MockPulseModule(mockEngine, 1, 440);
  });

  describe('inicialización', () => {
    
    it('pulse width inicial es 0.5 (50%)', () => {
      assert.equal(pulse.pw, 0.5);
    });

    it('start() crea oscilador y amplificador', () => {
      pulse.start();
      
      assert.notEqual(pulse.osc, null);
      assert.notEqual(pulse.amp, null);
    });

    it('start() aplica pulse wave inicial', () => {
      pulse.start();
      
      assert.ok(pulse._waveUpdates.includes(0.5));
    });
  });

  describe('conexiones', () => {
    
    it('oscilador se conecta al amplificador', () => {
      pulse.start();
      
      assert.ok(pulse.osc._calls.connect >= 1);
    });

    it('registra output de audio', () => {
      pulse.start();
      
      const audioOut = pulse.outputs.find(o => o.id === 'audioOut');
      assert.ok(audioOut);
      assert.equal(audioOut.kind, 'audio');
    });

    it('registra inputs de CV', () => {
      pulse.start();
      
      assert.equal(pulse.inputs.length, 2);
      assert.ok(pulse.inputs.find(i => i.id === 'freqCV'));
      assert.ok(pulse.inputs.find(i => i.id === 'ampCV'));
    });
  });

  describe('control de pulse width', () => {
    
    it('setPulseWidth actualiza el valor', () => {
      pulse.start();
      
      pulse.setPulseWidth(0.25);
      
      assert.equal(pulse.pw, 0.25);
    });

    it('setPulseWidth llama a _updatePulseWave', () => {
      pulse.start();
      
      pulse.setPulseWidth(0.75);
      
      assert.ok(pulse._waveUpdates.includes(0.75));
    });

    it('valores de PW válidos: 0 a 1', () => {
      pulse.start();
      
      pulse.setPulseWidth(0);
      assert.equal(pulse.pw, 0);
      
      pulse.setPulseWidth(1);
      assert.equal(pulse.pw, 1);
    });
  });

  describe('control de frecuencia y nivel', () => {
    
    it('setFrequency cambia la frecuencia', () => {
      pulse.start();
      
      pulse.setFrequency(880);
      
      assert.equal(pulse.osc.frequency.value, 880);
    });

    it('setLevel cambia la ganancia', () => {
      pulse.start();
      
      pulse.setLevel(0.6);
      
      assert.equal(pulse.amp.gain.value, 0.6);
    });
  });

  describe('start/stop', () => {
    
    it('start() llama a osc.start()', () => {
      pulse.start();
      
      assert.equal(pulse.osc._calls.start, 1);
    });

    it('stop() llama a osc.stop()', () => {
      pulse.start();
      pulse.stop(0);
      
      assert.equal(pulse.osc._calls.stop, 1);
    });
  });
});
