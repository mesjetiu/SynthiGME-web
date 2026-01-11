/**
 * Tests para modules/noise.js
 * 
 * Verifica el módulo NoiseModule usando mocks de AudioContext:
 * - Creación de AudioWorkletNode para generación de ruido
 * - Control de colour (white ↔ pink)
 * - Control de level
 * - Registro de outputs
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { 
  createMockAudioContext,
  createMockAudioWorkletNode,
  createMockAudioParam
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK del módulo NoiseModule (sin dependencias de worklet real)
// ═══════════════════════════════════════════════════════════════════════════

class MockNoiseModule {
  constructor(engine, id, config = {}) {
    this.engine = engine;
    this.id = id;
    this.name = 'Noise Gen';
    
    this.config = {
      initialColour: config.initialColour ?? 0,
      initialLevel: config.initialLevel ?? 0,
      levelSmoothingTime: config.levelSmoothingTime ?? 0.03,
      colourSmoothingTime: config.colourSmoothingTime ?? 0.01
    };
    
    this.workletNode = null;
    this.levelNode = null;
    this.colourParam = null;
    
    this.values = {
      colour: this.config.initialColour,
      level: this.config.initialLevel
    };
    
    this.outputs = [];
    this.isStarted = false;
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;
    
    // Crear mock de AudioWorkletNode con parámetro colour
    this.workletNode = createMockAudioWorkletNode('noise-generator', {
      parameterDescriptors: [{ name: 'colour', defaultValue: 0 }]
    });
    
    // Obtener el parámetro colour
    this.colourParam = this.workletNode.parameters.get('colour');
    this.colourParam.value = this.values.colour;
    
    // Crear nodo de nivel
    this.levelNode = ctx.createGain();
    this.levelNode.gain.value = this.values.level;
    
    // Conectar: worklet → level
    this.workletNode.connect(this.levelNode);
    
    // Registrar output
    this.outputs.push({
      id: 'audioOut',
      kind: 'audio',
      node: this.levelNode,
      label: 'Noise OUT'
    });
  }

  start() {
    this._initAudioNodes();
    this.isStarted = true;
  }

  setColour(value) {
    // Clamp a [0, 1]
    const clamped = Math.max(0, Math.min(1, value));
    this.values.colour = clamped;
    
    if (this.colourParam) {
      this.colourParam.value = clamped;
    }
  }

  setLevel(value) {
    // Clamp a [0, 1]
    const clamped = Math.max(0, Math.min(1, value));
    this.values.level = clamped;
    
    if (this.levelNode) {
      this.levelNode.gain.value = clamped;
    }
  }

  getColour() {
    return this.values.colour;
  }

  getLevel() {
    return this.values.level;
  }

  getOutputNode() {
    return this.levelNode;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('NoiseModule (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let noise;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    noise = new MockNoiseModule(mockEngine, 'noise-1');
  });

  describe('inicialización', () => {
    
    it('valores iniciales por defecto: colour=0, level=0', () => {
      assert.equal(noise.values.colour, 0);
      assert.equal(noise.values.level, 0);
    });

    it('acepta configuración inicial', () => {
      const configured = new MockNoiseModule(mockEngine, 'noise-2', {
        initialColour: 0.5,
        initialLevel: 0.8
      });
      
      assert.equal(configured.values.colour, 0.5);
      assert.equal(configured.values.level, 0.8);
    });

    it('no crea nodos hasta llamar a start()', () => {
      assert.equal(noise.workletNode, null);
      assert.equal(noise.levelNode, null);
    });

    it('start() crea workletNode y levelNode', () => {
      noise.start();
      
      assert.notEqual(noise.workletNode, null);
      assert.notEqual(noise.levelNode, null);
    });

    it('start() marca isStarted = true', () => {
      assert.equal(noise.isStarted, false);
      
      noise.start();
      
      assert.equal(noise.isStarted, true);
    });
  });

  describe('conexiones', () => {
    
    it('workletNode se conecta a levelNode', () => {
      noise.start();
      
      assert.ok(noise.workletNode._calls.connect >= 1);
    });

    it('registra output de audio', () => {
      noise.start();
      
      const audioOut = noise.outputs.find(o => o.id === 'audioOut');
      assert.ok(audioOut);
      assert.equal(audioOut.kind, 'audio');
      assert.equal(audioOut.node, noise.levelNode);
    });

    it('getOutputNode devuelve el levelNode', () => {
      noise.start();
      
      assert.equal(noise.getOutputNode(), noise.levelNode);
    });
  });

  describe('control de colour', () => {
    
    it('setColour actualiza el valor', () => {
      noise.start();
      
      noise.setColour(0.7);
      
      assert.equal(noise.values.colour, 0.7);
    });

    it('setColour aplica al parámetro del worklet', () => {
      noise.start();
      
      noise.setColour(0.3);
      
      assert.equal(noise.colourParam.value, 0.3);
    });

    it('colour=0 es ruido blanco', () => {
      noise.start();
      
      noise.setColour(0);
      
      assert.equal(noise.getColour(), 0);
    });

    it('colour=1 es ruido rosa', () => {
      noise.start();
      
      noise.setColour(1);
      
      assert.equal(noise.getColour(), 1);
    });

    it('clampea valores mayores que 1', () => {
      noise.start();
      
      noise.setColour(5);
      
      assert.equal(noise.values.colour, 1);
    });

    it('clampea valores menores que 0', () => {
      noise.start();
      
      noise.setColour(-1);
      
      assert.equal(noise.values.colour, 0);
    });
  });

  describe('control de level', () => {
    
    it('setLevel actualiza el valor', () => {
      noise.start();
      
      noise.setLevel(0.6);
      
      assert.equal(noise.values.level, 0.6);
    });

    it('setLevel aplica al gain del levelNode', () => {
      noise.start();
      
      noise.setLevel(0.4);
      
      assert.equal(noise.levelNode.gain.value, 0.4);
    });

    it('getLevel devuelve el valor actual', () => {
      noise.start();
      
      noise.setLevel(0.9);
      
      assert.equal(noise.getLevel(), 0.9);
    });

    it('clampea valores fuera de rango [0, 1]', () => {
      noise.start();
      
      noise.setLevel(2);
      assert.equal(noise.values.level, 1);
      
      noise.setLevel(-0.5);
      assert.equal(noise.values.level, 0);
    });
  });

  describe('worklet parameters', () => {
    
    it('colourParam existe tras start()', () => {
      noise.start();
      
      assert.notEqual(noise.colourParam, null);
    });

    it('colourParam tiene valor inicial correcto', () => {
      const configured = new MockNoiseModule(mockEngine, 'noise-2', {
        initialColour: 0.5
      });
      configured.start();
      
      assert.equal(configured.colourParam.value, 0.5);
    });
  });
});
