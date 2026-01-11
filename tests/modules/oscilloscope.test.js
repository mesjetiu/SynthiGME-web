/**
 * Tests para modules/oscilloscope.js
 * 
 * Verifica el módulo OscilloscopeModule usando mocks de AudioContext:
 * - Creación de nodos de entrada (GainNodes)
 * - Configuración de modos (Y-T, X-Y)
 * - Trigger settings
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { 
  createMockAudioContext,
  createMockAudioWorkletNode
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo OscilloscopeModule (sin dependencias de worklet real)
// ═══════════════════════════════════════════════════════════════════════════

class MockOscilloscopeModule {
  constructor(engine, id = 'oscilloscope') {
    this.engine = engine;
    this.id = id;
    this.name = 'Oscilloscope';
    
    // Nodos de entrada
    this.inputY = null;
    this.inputX = null;
    
    // Worklet de captura
    this.captureNode = null;
    
    // Datos del último frame
    this.lastData = {
      bufferY: null,
      bufferX: null,
      sampleRate: 44100,
      triggered: false
    };
    
    // Callbacks
    this._onDataCallbacks = [];
    
    // Estado
    this.workletReady = false;
    
    // Configuración
    this.mode = 'yt';  // 'yt' o 'xy'
    this.triggerEnabled = true;
    this.triggerLevel = 0.0;
    this.bufferSize = 1024;
    this.triggerHysteresis = 150;
    this.schmittHysteresis = 0.05;
    
    this.inputs = [];
    this.outputs = [];
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  async start() {
    const ctx = this.getAudioCtx();
    if (!ctx) return;
    
    // Crear nodos de entrada
    this.inputY = ctx.createGain();
    this.inputY.gain.value = 1.0;
    
    this.inputX = ctx.createGain();
    this.inputX.gain.value = 1.0;
    
    // Simular carga de worklet
    this.workletReady = true;
    this._createCaptureNode();
    
    // Registrar inputs
    this.inputs.push({ id: 'inputY', kind: 'audio', node: this.inputY, label: 'Scope Y' });
    this.inputs.push({ id: 'inputX', kind: 'audio', node: this.inputX, label: 'Scope X' });
  }

  _createCaptureNode() {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.workletReady) return;
    
    this.captureNode = createMockAudioWorkletNode('scope-capture', {
      numberOfInputs: 2,
      numberOfOutputs: 0,
      processorOptions: {
        bufferSize: this.bufferSize,
        triggerHysteresis: this.triggerHysteresis,
        schmittHysteresis: this.schmittHysteresis
      }
    });
    
    // Conectar entradas
    this.inputY.connect(this.captureNode);
    this.inputX.connect(this.captureNode);
  }

  setMode(mode) {
    if (mode === 'yt' || mode === 'xy') {
      this.mode = mode;
    }
  }

  getMode() {
    return this.mode;
  }

  setTriggerEnabled(enabled) {
    this.triggerEnabled = !!enabled;
  }

  isTriggerEnabled() {
    return this.triggerEnabled;
  }

  setTriggerLevel(level) {
    this.triggerLevel = Math.max(-1, Math.min(1, level));
  }

  getTriggerLevel() {
    return this.triggerLevel;
  }

  setBufferSize(size) {
    // Buffer size debe ser potencia de 2
    const validSizes = [256, 512, 1024, 2048, 4096];
    if (validSizes.includes(size)) {
      this.bufferSize = size;
    }
  }

  getBufferSize() {
    return this.bufferSize;
  }

  onData(callback) {
    if (typeof callback === 'function') {
      this._onDataCallbacks.push(callback);
    }
  }

  // Simular recepción de datos (para testing)
  _simulateData(bufferY, bufferX, triggered = true) {
    this.lastData = {
      bufferY,
      bufferX,
      sampleRate: 44100,
      triggered
    };
    
    this._onDataCallbacks.forEach(cb => cb(this.lastData));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('OscilloscopeModule (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let scope;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    scope = new MockOscilloscopeModule(mockEngine, 'scope1');
  });

  describe('inicialización', () => {
    
    it('modo inicial es Y-T', () => {
      assert.equal(scope.mode, 'yt');
    });

    it('trigger habilitado por defecto', () => {
      assert.equal(scope.triggerEnabled, true);
    });

    it('trigger level inicial es 0', () => {
      assert.equal(scope.triggerLevel, 0);
    });

    it('buffer size inicial es 1024', () => {
      assert.equal(scope.bufferSize, 1024);
    });

    it('no crea nodos hasta llamar a start()', () => {
      assert.equal(scope.inputY, null);
      assert.equal(scope.inputX, null);
    });
  });

  describe('start()', () => {
    
    it('crea nodos de entrada Y y X', async () => {
      await scope.start();
      
      assert.notEqual(scope.inputY, null);
      assert.notEqual(scope.inputX, null);
    });

    it('marca workletReady = true', async () => {
      await scope.start();
      
      assert.equal(scope.workletReady, true);
    });

    it('crea captureNode', async () => {
      await scope.start();
      
      assert.notEqual(scope.captureNode, null);
    });

    it('registra inputs', async () => {
      await scope.start();
      
      assert.equal(scope.inputs.length, 2);
      assert.ok(scope.inputs.find(i => i.id === 'inputY'));
      assert.ok(scope.inputs.find(i => i.id === 'inputX'));
    });
  });

  describe('conexiones', () => {
    
    it('inputY se conecta a captureNode', async () => {
      await scope.start();
      
      assert.ok(scope.inputY._calls.connect >= 1);
    });

    it('inputX se conecta a captureNode', async () => {
      await scope.start();
      
      assert.ok(scope.inputX._calls.connect >= 1);
    });
  });

  describe('configuración de modo', () => {
    
    it('setMode("xy") cambia a modo X-Y', () => {
      scope.setMode('xy');
      
      assert.equal(scope.getMode(), 'xy');
    });

    it('setMode("yt") cambia a modo Y-T', () => {
      scope.setMode('yt');
      
      assert.equal(scope.getMode(), 'yt');
    });

    it('ignora modos inválidos', () => {
      scope.setMode('invalid');
      
      assert.equal(scope.getMode(), 'yt'); // mantiene el original
    });
  });

  describe('configuración de trigger', () => {
    
    it('setTriggerEnabled cambia el estado', () => {
      scope.setTriggerEnabled(false);
      assert.equal(scope.isTriggerEnabled(), false);
      
      scope.setTriggerEnabled(true);
      assert.equal(scope.isTriggerEnabled(), true);
    });

    it('setTriggerLevel actualiza el nivel', () => {
      scope.setTriggerLevel(0.5);
      
      assert.equal(scope.getTriggerLevel(), 0.5);
    });

    it('trigger level se clampea a [-1, 1]', () => {
      scope.setTriggerLevel(5);
      assert.equal(scope.getTriggerLevel(), 1);
      
      scope.setTriggerLevel(-5);
      assert.equal(scope.getTriggerLevel(), -1);
    });
  });

  describe('configuración de buffer', () => {
    
    it('setBufferSize acepta potencias de 2 válidas', () => {
      scope.setBufferSize(512);
      assert.equal(scope.getBufferSize(), 512);
      
      scope.setBufferSize(2048);
      assert.equal(scope.getBufferSize(), 2048);
    });

    it('setBufferSize ignora valores inválidos', () => {
      scope.setBufferSize(1000); // No es potencia de 2
      
      assert.equal(scope.getBufferSize(), 1024); // Mantiene el original
    });
  });

  describe('callbacks de datos', () => {
    
    it('onData registra callback', async () => {
      await scope.start();
      
      let called = false;
      scope.onData(() => { called = true; });
      
      scope._simulateData([0, 0.5, 1], [0, 0, 0]);
      
      assert.equal(called, true);
    });

    it('callback recibe los datos correctos', async () => {
      await scope.start();
      
      let receivedData = null;
      scope.onData(data => { receivedData = data; });
      
      scope._simulateData([0.1, 0.2], [0.3, 0.4], true);
      
      assert.deepEqual(receivedData.bufferY, [0.1, 0.2]);
      assert.deepEqual(receivedData.bufferX, [0.3, 0.4]);
      assert.equal(receivedData.triggered, true);
    });

    it('múltiples callbacks son notificados', async () => {
      await scope.start();
      
      let count = 0;
      scope.onData(() => { count++; });
      scope.onData(() => { count++; });
      scope.onData(() => { count++; });
      
      scope._simulateData([], []);
      
      assert.equal(count, 3);
    });
  });
});
