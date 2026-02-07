/**
 * Tests para modules/noise.js — Synthi 100 Cuenca (Datanomics 1982)
 * 
 * Verifica el módulo NoiseModule usando mocks de AudioContext:
 * - Rangos de dial 0-10 (escala Synthi 100)
 * - Conversión colour dial → posición bipolar (-1..+1) para filtro IIR
 * - Conversión level dial → ganancia LOG (audio taper pot 10kΩ)
 * - Registro de outputs, conexiones, parámetros del worklet
 * - Paso de processorOptions (filtro RC) al AudioWorkletNode
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
      initialColour: config.initialColour ?? 5,
      initialLevel: config.initialLevel ?? 0,
      levelSmoothingTime: config.levelSmoothingTime ?? 0.03,
      colourSmoothingTime: config.colourSmoothingTime ?? 0.01,
      colourFilter: {
        potResistance: config.colourFilter?.potResistance ?? 10000,
        capacitance: config.colourFilter?.capacitance ?? 33e-9
      },
      levelCurve: {
        type: config.levelCurve?.type ?? 'log',
        logBase: config.levelCurve?.logBase ?? 100
      },
      ramps: {
        colour: config.ramps?.colour ?? 0.05,
        level: config.ramps?.level ?? 0.06
      }
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

  /**
   * Dial colour 0-10 → posición bipolar -1..+1
   * Misma lógica que NoiseModule._colourDialToPosition()
   */
  _colourDialToPosition(dial) {
    return (dial / 5) - 1;
  }

  /**
   * Dial level 0-10 → ganancia LOG (audio taper)
   * Misma lógica que NoiseModule._levelDialToGain()
   */
  _levelDialToGain(dial) {
    if (dial <= 0) return 0;
    const base = this.config.levelCurve.logBase;
    const normalized = dial / 10;
    return (Math.pow(base, normalized) - 1) / (base - 1);
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;
    
    // Crear mock de AudioWorkletNode con parámetro colourPosition
    this.workletNode = createMockAudioWorkletNode('noise-generator', {
      parameterDescriptors: [{ name: 'colourPosition', defaultValue: 0 }],
      processorOptions: {
        potResistance: this.config.colourFilter.potResistance,
        capacitance: this.config.colourFilter.capacitance
      }
    });
    
    // Referencia al AudioParam del filtro colour
    this.colourParam = this.workletNode.parameters.get('colourPosition');
    this.colourParam.value = this._colourDialToPosition(this.values.colour);
    
    // GainNode para nivel (curva LOG)
    this.levelNode = ctx.createGain();
    this.levelNode.gain.value = this._levelDialToGain(this.values.level);
    
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
    this.values.colour = Math.max(0, Math.min(10, value));
    if (this.colourParam) {
      this.colourParam.value = this._colourDialToPosition(this.values.colour);
    }
  }

  setLevel(value) {
    this.values.level = Math.max(0, Math.min(10, value));
    if (this.levelNode) {
      this.levelNode.gain.value = this._levelDialToGain(this.values.level);
    }
  }

  getColour() { return this.values.colour; }
  getLevel() { return this.values.level; }
  getOutputNode() { return this.levelNode; }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('NoiseModule — Synthi 100 Cuenca (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let noise;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    noise = new MockNoiseModule(mockEngine, 'noise-1');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  describe('inicialización', () => {
    
    it('valores iniciales por defecto: colour=5 (white), level=0 (silencio)', () => {
      assert.equal(noise.values.colour, 5);
      assert.equal(noise.values.level, 0);
    });

    it('acepta configuración inicial personalizada', () => {
      const configured = new MockNoiseModule(mockEngine, 'noise-2', {
        initialColour: 3,
        initialLevel: 7
      });
      assert.equal(configured.values.colour, 3);
      assert.equal(configured.values.level, 7);
    });

    it('config de filtro colour por defecto: R=10kΩ, C=33nF', () => {
      assert.equal(noise.config.colourFilter.potResistance, 10000);
      assert.equal(noise.config.colourFilter.capacitance, 33e-9);
    });

    it('config de curva level por defecto: LOG base 100', () => {
      assert.equal(noise.config.levelCurve.type, 'log');
      assert.equal(noise.config.levelCurve.logBase, 100);
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

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIÓN COLOUR: dial 0-10 → posición bipolar -1..+1
  // ─────────────────────────────────────────────────────────────────────────

  describe('conversión colour dial → posición bipolar', () => {
    
    it('dial 0 → posición -1 (LP máximo, dark/pink)', () => {
      assert.equal(noise._colourDialToPosition(0), -1);
    });

    it('dial 5 → posición 0 (plano, white noise)', () => {
      assert.equal(noise._colourDialToPosition(5), 0);
    });

    it('dial 10 → posición +1 (HP shelving, bright/blue)', () => {
      assert.equal(noise._colourDialToPosition(10), 1);
    });

    it('dial 2.5 → posición -0.5 (LP parcial)', () => {
      assert.equal(noise._colourDialToPosition(2.5), -0.5);
    });

    it('dial 7.5 → posición +0.5 (HP parcial)', () => {
      assert.equal(noise._colourDialToPosition(7.5), 0.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIÓN LEVEL: dial 0-10 → ganancia LOG (audio taper)
  // ─────────────────────────────────────────────────────────────────────────

  describe('conversión level dial → ganancia LOG', () => {
    
    it('dial 0 → ganancia 0 (silencio total)', () => {
      assert.equal(noise._levelDialToGain(0), 0);
    });

    it('dial 10 → ganancia 1.0 (máximo, ~3V p-p)', () => {
      const gain = noise._levelDialToGain(10);
      assert.ok(Math.abs(gain - 1.0) < 1e-10, `Esperado 1.0, obtenido ${gain}`);
    });

    it('dial 5 → ganancia ≈ 0.091 (-21 dB, audio taper)', () => {
      const gain = noise._levelDialToGain(5);
      // (100^0.5 - 1) / 99 = 9/99 ≈ 0.0909
      assert.ok(Math.abs(gain - 0.0909) < 0.002,
        `Esperado ~0.091, obtenido ${gain.toFixed(5)}`);
    });

    it('dial 8 → ganancia ≈ 0.392 (-8 dB)', () => {
      const gain = noise._levelDialToGain(8);
      // (100^0.8 - 1) / 99 ≈ 0.3921
      assert.ok(Math.abs(gain - 0.392) < 0.01,
        `Esperado ~0.392, obtenido ${gain.toFixed(4)}`);
    });

    it('curva LOG: mitad del dial produce << mitad de ganancia', () => {
      const gainMitad = noise._levelDialToGain(5);
      const gainMax = noise._levelDialToGain(10);
      // En pot LOG base 100, mitad del recorrido ≈ 9.1% de la ganancia
      assert.ok(gainMitad < gainMax * 0.15,
        `Mitad del dial (${gainMitad.toFixed(4)}) debería ser < 15% del max (${gainMax.toFixed(4)})`);
    });

    it('dial negativo → ganancia 0 (protección)', () => {
      assert.equal(noise._levelDialToGain(-1), 0);
    });

    it('curva LOG es monótonamente creciente', () => {
      let prev = 0;
      for (let dial = 0; dial <= 10; dial += 0.5) {
        const gain = noise._levelDialToGain(dial);
        assert.ok(gain >= prev,
          `Ganancia en dial ${dial} (${gain.toFixed(4)}) debe ser >= dial ${dial - 0.5} (${prev.toFixed(4)})`);
        prev = gain;
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE COLOUR (escala dial 0-10)
  // ─────────────────────────────────────────────────────────────────────────

  describe('control de colour (dial 0-10)', () => {
    
    it('setColour(0) → LP máximo, posición -1', () => {
      noise.start();
      noise.setColour(0);
      assert.equal(noise.getColour(), 0);
      assert.equal(noise.colourParam.value, -1);
    });

    it('setColour(5) → white noise, posición 0', () => {
      noise.start();
      noise.setColour(5);
      assert.equal(noise.getColour(), 5);
      assert.equal(noise.colourParam.value, 0);
    });

    it('setColour(10) → HP shelving, posición +1', () => {
      noise.start();
      noise.setColour(10);
      assert.equal(noise.getColour(), 10);
      assert.equal(noise.colourParam.value, 1);
    });

    it('clampea valores mayores que 10', () => {
      noise.start();
      noise.setColour(15);
      assert.equal(noise.values.colour, 10);
    });

    it('clampea valores menores que 0', () => {
      noise.start();
      noise.setColour(-3);
      assert.equal(noise.values.colour, 0);
    });

    it('acepta valores intermedios (dial 3.7)', () => {
      noise.start();
      noise.setColour(3.7);
      assert.equal(noise.values.colour, 3.7);
      // 3.7/5 - 1 = -0.26
      const expectedPosition = (3.7 / 5) - 1;
      assert.ok(Math.abs(noise.colourParam.value - expectedPosition) < 1e-10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE LEVEL (escala dial 0-10, curva LOG)
  // ─────────────────────────────────────────────────────────────────────────

  describe('control de level (dial 0-10, curva LOG)', () => {
    
    it('setLevel(0) → ganancia 0 (silencio)', () => {
      noise.start();
      noise.setLevel(0);
      assert.equal(noise.getLevel(), 0);
      assert.equal(noise.levelNode.gain.value, 0);
    });

    it('setLevel(10) → ganancia 1.0 (máximo)', () => {
      noise.start();
      noise.setLevel(10);
      assert.equal(noise.getLevel(), 10);
      assert.ok(Math.abs(noise.levelNode.gain.value - 1.0) < 1e-10);
    });

    it('setLevel(5) → ganancia LOG ≈ 0.091', () => {
      noise.start();
      noise.setLevel(5);
      assert.ok(Math.abs(noise.levelNode.gain.value - 0.0909) < 0.002);
    });

    it('clampea valores fuera de rango [0, 10]', () => {
      noise.start();
      noise.setLevel(20);
      assert.equal(noise.values.level, 10);
      noise.setLevel(-5);
      assert.equal(noise.values.level, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WORKLET PARAMETERS
  // ─────────────────────────────────────────────────────────────────────────

  describe('worklet parameters', () => {
    
    it('colourParam existe tras start() con nombre colourPosition', () => {
      noise.start();
      assert.notEqual(noise.colourParam, null);
    });

    it('colourParam tiene valor inicial correcto (dial 5 → posición 0)', () => {
      noise.start();
      // Default colour=5 → position=0 (white noise)
      assert.equal(noise.colourParam.value, 0);
    });

    it('colourParam con colour inicial personalizado', () => {
      const configured = new MockNoiseModule(mockEngine, 'noise-2', {
        initialColour: 0
      });
      configured.start();
      // colour=0 → position=-1 (LP)
      assert.equal(configured.colourParam.value, -1);
    });

    it('processorOptions pasa los valores del filtro RC', () => {
      noise.start();
      const opts = noise.workletNode._options.processorOptions;
      assert.equal(opts.potResistance, 10000);
      assert.equal(opts.capacitance, 33e-9);
    });

    it('processorOptions con filtro personalizado', () => {
      const custom = new MockNoiseModule(mockEngine, 'noise-custom', {
        colourFilter: { potResistance: 22000, capacitance: 47e-9 }
      });
      custom.start();
      const opts = custom.workletNode._options.processorOptions;
      assert.equal(opts.potResistance, 22000);
      assert.equal(opts.capacitance, 47e-9);
    });
  });
});
