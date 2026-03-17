/**
 * Tests para modules/randomCV.js — RandomCVModule (Synthi 100 Cuenca)
 * 
 * Verifica el módulo de audio del Random Control Voltage Generator usando mocks:
 * - Inicialización y configuración por defecto
 * - Conversión level dial → ganancia LOG (10K pot)
 * - Conversión key dial → ganancia bipolar (-1 a +1)
 * - Creación y conexión de nodos de audio (worklet → splitter → 3 gains)
 * - Registro de 3 outputs (voltage1, voltage2, key)
 * - Clamping de parámetros
 * - Lazy start y ciclo de vida
 * - Mensajes al worklet (setMean, setVariance)
 * - getOutputNode() por ID
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
// MOCK del módulo RandomCVModule (sin dependencias de worklet real)
// ═══════════════════════════════════════════════════════════════════════════

class MockRandomCVModule {
  constructor(engine, id, config = {}) {
    this.engine = engine;
    this.id = id;
    this.name = 'Random CV';
    
    this.config = {
      levelCurve: {
        logBase: config.levelCurve?.logBase ?? 100
      },
      ramps: {
        level: config.ramps?.level ?? 0.06,
        mean: config.ramps?.mean ?? 0.05
      }
    };
    
    this.workletNode = null;
    this.splitter = null;
    this.voltage1Gain = null;
    this.voltage2Gain = null;
    this.keyGain = null;
    
    this.values = {
      mean: 0,
      variance: 0,
      voltage1: 0,
      voltage2: 0,
      key: 0
    };
    
    this.outputs = [];
    this.isStarted = false;
    this._isDormant = false;
    this._workletMessages = [];
  }

  getAudioCtx() {
    return this.engine?.audioCtx || null;
  }

  /**
   * Dial nivel (0-10) → ganancia LOG escalada a unidades digitales.
   * Misma lógica que RandomCVModule._levelDialToGain()
   * ±2.5V pico → gain [0, 0.625]
   */
  _levelDialToGain(dial) {
    if (dial <= 0) return 0;
    const base = this.config.levelCurve.logBase;
    const normalized = dial / 10;
    const logGain = (Math.pow(base, normalized) - 1) / (base - 1);
    return logGain * 2.5 / 4.0; // VOLTAGE_PEAK / DIGITAL_TO_VOLTAGE
  }

  /**
   * Dial key (-5 a +5) → ganancia bipolar en unidades digitales.
   * Misma lógica que RandomCVModule._keyDialToGain()
   * ±5V pico → gain [-1.25, +1.25]
   */
  _keyDialToGain(dial) {
    return dial * 5.0 / (5 * 4.0); // KEY_VOLTAGE_PEAK / (5 * DIGITAL_TO_VOLTAGE)
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;
    
    this.workletNode = createMockAudioWorkletNode('random-cv', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [3]
    });
    
    // Interceptar postMessage para tracking
    const origPostMessage = this.workletNode.port.postMessage;
    this.workletNode.port.postMessage = (msg) => {
      this._workletMessages.push(msg);
      origPostMessage.call(this.workletNode.port, msg);
    };
    
    this.splitter = ctx.createChannelSplitter(3);
    this.workletNode.connect(this.splitter);
    
    this.voltage1Gain = ctx.createGain();
    this.voltage1Gain.gain.value = this._levelDialToGain(this.values.voltage1);
    // splitter.connect(voltage1Gain, 0) — mock no tiene canal real
    
    this.voltage2Gain = ctx.createGain();
    this.voltage2Gain.gain.value = this._levelDialToGain(this.values.voltage2);
    
    this.keyGain = ctx.createGain();
    this.keyGain.gain.value = this._keyDialToGain(this.values.key);
    
    this.outputs.push(
      { id: 'voltage1', kind: 'randomCV', node: this.voltage1Gain, label: 'Random CV V1' },
      { id: 'voltage2', kind: 'randomCV', node: this.voltage2Gain, label: 'Random CV V2' },
      { id: 'key',      kind: 'randomCV', node: this.keyGain,      label: 'Random CV Key' }
    );
    
    this._sendToWorklet('setMean', this.values.mean);
    this._sendToWorklet('setVariance', this.values.variance);
  }

  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    this.isStarted = true;
  }

  setMean(dialValue) {
    this.values.mean = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setMean', this.values.mean);
  }

  setVariance(dialValue) {
    this.values.variance = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    this._sendToWorklet('setVariance', this.values.variance);
  }

  setVoltage1Level(dialValue) {
    this.values.voltage1 = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    if (this.voltage1Gain) {
      this.voltage1Gain.gain.value = this._levelDialToGain(this.values.voltage1);
    }
  }

  setVoltage2Level(dialValue) {
    this.values.voltage2 = Math.max(0, Math.min(10, dialValue));
    if (this._isDormant) return;
    if (this.voltage2Gain) {
      this.voltage2Gain.gain.value = this._levelDialToGain(this.values.voltage2);
    }
  }

  setKeyLevel(dialValue) {
    this.values.key = Math.max(-5, Math.min(5, dialValue));
    if (this._isDormant) return;
    if (this.keyGain) {
      this.keyGain.gain.value = this._keyDialToGain(this.values.key);
    }
  }

  getOutputNode(outputId) {
    switch (outputId) {
      case 'voltage1': return this.voltage1Gain;
      case 'voltage2': return this.voltage2Gain;
      case 'key':      return this.keyGain;
      default:         return null;
    }
  }

  getMean()     { return this.values.mean; }
  getVariance() { return this.values.variance; }

  _sendToWorklet(type, value) {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type, value });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVModule — Synthi 100 Cuenca (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let rcv;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = { audioCtx: mockCtx };
    rcv = new MockRandomCVModule(mockEngine, 'panel3-random-cv');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  describe('inicialización', () => {
    
    it('valores iniciales por defecto: todo a 0', () => {
      assert.equal(rcv.values.mean, 0);
      assert.equal(rcv.values.variance, 0);
      assert.equal(rcv.values.voltage1, 0);
      assert.equal(rcv.values.voltage2, 0);
      assert.equal(rcv.values.key, 0);
    });

    it('config de curva level por defecto: LOG base 100', () => {
      assert.equal(rcv.config.levelCurve.logBase, 100);
    });

    it('config de ramps por defecto: level=0.06, mean=0.05', () => {
      assert.equal(rcv.config.ramps.level, 0.06);
      assert.equal(rcv.config.ramps.mean, 0.05);
    });

    it('acepta configuración personalizada', () => {
      const custom = new MockRandomCVModule(mockEngine, 'custom', {
        levelCurve: { logBase: 50 },
        ramps: { level: 0.1, mean: 0.02 }
      });
      assert.equal(custom.config.levelCurve.logBase, 50);
      assert.equal(custom.config.ramps.level, 0.1);
      assert.equal(custom.config.ramps.mean, 0.02);
    });

    it('no crea nodos hasta llamar a start()', () => {
      assert.equal(rcv.workletNode, null);
      assert.equal(rcv.splitter, null);
      assert.equal(rcv.voltage1Gain, null);
      assert.equal(rcv.voltage2Gain, null);
      assert.equal(rcv.keyGain, null);
    });

    it('start() crea todos los nodos', () => {
      rcv.start();
      assert.notEqual(rcv.workletNode, null);
      assert.notEqual(rcv.splitter, null);
      assert.notEqual(rcv.voltage1Gain, null);
      assert.notEqual(rcv.voltage2Gain, null);
      assert.notEqual(rcv.keyGain, null);
    });

    it('start() marca isStarted = true', () => {
      assert.equal(rcv.isStarted, false);
      rcv.start();
      assert.equal(rcv.isStarted, true);
    });

    it('start() doble no crea nodos duplicados', () => {
      rcv.start();
      const firstNode = rcv.workletNode;
      rcv.start();
      assert.equal(rcv.workletNode, firstNode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONEXIONES Y OUTPUTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('conexiones y outputs', () => {
    
    it('registra 3 outputs tras start()', () => {
      rcv.start();
      assert.equal(rcv.outputs.length, 3);
    });

    it('outputs tienen kind "randomCV"', () => {
      rcv.start();
      for (const output of rcv.outputs) {
        assert.equal(output.kind, 'randomCV');
      }
    });

    it('output voltage1 apunta al voltage1Gain', () => {
      rcv.start();
      const out = rcv.outputs.find(o => o.id === 'voltage1');
      assert.ok(out);
      assert.equal(out.node, rcv.voltage1Gain);
    });

    it('output voltage2 apunta al voltage2Gain', () => {
      rcv.start();
      const out = rcv.outputs.find(o => o.id === 'voltage2');
      assert.ok(out);
      assert.equal(out.node, rcv.voltage2Gain);
    });

    it('output key apunta al keyGain', () => {
      rcv.start();
      const out = rcv.outputs.find(o => o.id === 'key');
      assert.ok(out);
      assert.equal(out.node, rcv.keyGain);
    });

    it('workletNode se conecta al splitter', () => {
      rcv.start();
      assert.ok(rcv.workletNode._calls.connect >= 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIÓN LEVEL: dial 0-10 → ganancia LOG
  // ─────────────────────────────────────────────────────────────────────────

  describe('conversión level dial → ganancia LOG', () => {
    
    it('dial 0 → ganancia 0 (silencio total)', () => {
      assert.equal(rcv._levelDialToGain(0), 0);
    });

    it('dial 10 → ganancia 0.625 (máximo: ±2.5V = ±0.625 digital)', () => {
      const gain = rcv._levelDialToGain(10);
      assert.ok(Math.abs(gain - 0.625) < 1e-10, `Esperado 0.625, obtenido ${gain}`);
    });

    it('dial 5 → ganancia ≈ 0.0568 (audio taper, escalada)', () => {
      const gain = rcv._levelDialToGain(5);
      // (100^0.5 - 1) / 99 × 0.625 ≈ 0.0909 × 0.625 ≈ 0.0568
      assert.ok(Math.abs(gain - 0.0568) < 0.002,
        `Esperado ~0.0568, obtenido ${gain.toFixed(5)}`);
    });

    it('dial 8 → ganancia ≈ 0.245', () => {
      const gain = rcv._levelDialToGain(8);
      assert.ok(Math.abs(gain - 0.245) < 0.01,
        `Esperado ~0.245, obtenido ${gain.toFixed(4)}`);
    });

    it('curva LOG: mitad del dial produce << mitad de ganancia', () => {
      const gainMitad = rcv._levelDialToGain(5);
      const gainMax = rcv._levelDialToGain(10);
      assert.ok(gainMitad < gainMax * 0.15,
        `Mitad del dial (${gainMitad.toFixed(4)}) debería ser < 15% del max`);
    });

    it('dial negativo → ganancia 0 (protección)', () => {
      assert.equal(rcv._levelDialToGain(-1), 0);
    });

    it('monótonamente creciente', () => {
      let prev = 0;
      for (let dial = 0; dial <= 10; dial += 0.5) {
        const gain = rcv._levelDialToGain(dial);
        assert.ok(gain >= prev,
          `Ganancia en dial ${dial} (${gain.toFixed(4)}) debe ser >= ${prev.toFixed(4)}`);
        prev = gain;
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSIÓN KEY: dial -5/+5 → ganancia bipolar
  // ─────────────────────────────────────────────────────────────────────────

  describe('conversión key dial → ganancia bipolar', () => {
    
    it('dial -5 → ganancia -1.25 (pulso invertido, -5V)', () => {
      assert.ok(Math.abs(rcv._keyDialToGain(-5) - (-1.25)) < 1e-10);
    });

    it('dial 0 → ganancia 0 (sin pulso)', () => {
      assert.equal(rcv._keyDialToGain(0), 0);
    });

    it('dial +5 → ganancia +1.25 (pulso +5V)', () => {
      assert.ok(Math.abs(rcv._keyDialToGain(5) - 1.25) < 1e-10);
    });

    it('dial +2.5 → ganancia +0.625 (pulso +2.5V)', () => {
      assert.ok(Math.abs(rcv._keyDialToGain(2.5) - 0.625) < 1e-10);
    });

    it('lineal y simétrico', () => {
      for (let dial = -5; dial <= 5; dial += 0.5) {
        const gain = rcv._keyDialToGain(dial);
        const expected = dial / 4; // dial * KEY_VOLTAGE_PEAK / (5 * DIGITAL_TO_VOLTAGE)
        assert.ok(Math.abs(gain - expected) < 1e-10,
          `dial ${dial}: gain ${gain} ≠ expected ${expected}`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  describe('control de parámetros', () => {

    it('setMean() actualiza el valor y envía al worklet', () => {
      rcv.start();
      rcv._workletMessages = [];
      rcv.setMean(3.0);
      assert.equal(rcv.getMean(), 3.0);
      const msg = rcv._workletMessages.find(m => m.type === 'setMean');
      assert.ok(msg, 'Debe enviar setMean al worklet');
      assert.equal(msg.value, 3.0);
    });

    it('setVariance() actualiza el valor y envía al worklet', () => {
      rcv.start();
      rcv._workletMessages = [];
      rcv.setVariance(-2.0);
      assert.equal(rcv.getVariance(), -2.0);
      const msg = rcv._workletMessages.find(m => m.type === 'setVariance');
      assert.ok(msg, 'Debe enviar setVariance al worklet');
      assert.equal(msg.value, -2.0);
    });

    it('setVoltage1Level() actualiza ganancia LOG', () => {
      rcv.start();
      rcv.setVoltage1Level(8);
      assert.equal(rcv.values.voltage1, 8);
      const expectedGain = rcv._levelDialToGain(8);
      assert.ok(Math.abs(rcv.voltage1Gain.gain.value - expectedGain) < 0.01);
    });

    it('setVoltage2Level() actualiza ganancia LOG', () => {
      rcv.start();
      rcv.setVoltage2Level(5);
      assert.equal(rcv.values.voltage2, 5);
      const expectedGain = rcv._levelDialToGain(5);
      assert.ok(Math.abs(rcv.voltage2Gain.gain.value - expectedGain) < 0.01);
    });

    it('setKeyLevel() actualiza ganancia bipolar', () => {
      rcv.start();
      rcv.setKeyLevel(-3);
      assert.equal(rcv.values.key, -3);
      const expectedGain = rcv._keyDialToGain(-3);
      assert.ok(Math.abs(rcv.keyGain.gain.value - expectedGain) < 0.01);
    });

    it('start() envía setMean y setVariance iniciales al worklet', () => {
      rcv.start();
      const meanMsg = rcv._workletMessages.find(m => m.type === 'setMean');
      const varMsg = rcv._workletMessages.find(m => m.type === 'setVariance');
      assert.ok(meanMsg, 'Debe enviar setMean inicial');
      assert.ok(varMsg, 'Debe enviar setVariance inicial');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CLAMPING DE PARÁMETROS
  // ─────────────────────────────────────────────────────────────────────────

  describe('clamping de parámetros', () => {

    it('mean se clampea a [-5, +5]', () => {
      rcv.setMean(10);
      assert.equal(rcv.values.mean, 5);
      rcv.setMean(-10);
      assert.equal(rcv.values.mean, -5);
    });

    it('variance se clampea a [-5, +5]', () => {
      rcv.setVariance(100);
      assert.equal(rcv.values.variance, 5);
      rcv.setVariance(-100);
      assert.equal(rcv.values.variance, -5);
    });

    it('voltage1 se clampea a [0, 10]', () => {
      rcv.setVoltage1Level(15);
      assert.equal(rcv.values.voltage1, 10);
      rcv.setVoltage1Level(-5);
      assert.equal(rcv.values.voltage1, 0);
    });

    it('voltage2 se clampea a [0, 10]', () => {
      rcv.setVoltage2Level(20);
      assert.equal(rcv.values.voltage2, 10);
      rcv.setVoltage2Level(-1);
      assert.equal(rcv.values.voltage2, 0);
    });

    it('key se clampea a [-5, +5]', () => {
      rcv.setKeyLevel(50);
      assert.equal(rcv.values.key, 5);
      rcv.setKeyLevel(-50);
      assert.equal(rcv.values.key, -5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getOutputNode()
  // ─────────────────────────────────────────────────────────────────────────

  describe('getOutputNode()', () => {

    it('"voltage1" devuelve voltage1Gain', () => {
      rcv.start();
      assert.equal(rcv.getOutputNode('voltage1'), rcv.voltage1Gain);
    });

    it('"voltage2" devuelve voltage2Gain', () => {
      rcv.start();
      assert.equal(rcv.getOutputNode('voltage2'), rcv.voltage2Gain);
    });

    it('"key" devuelve keyGain', () => {
      rcv.start();
      assert.equal(rcv.getOutputNode('key'), rcv.keyGain);
    });

    it('id inválido devuelve null', () => {
      rcv.start();
      assert.equal(rcv.getOutputNode('invalid'), null);
      assert.equal(rcv.getOutputNode(''), null);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DORMANCY (nivel módulo)
  // ─────────────────────────────────────────────────────────────────────────

  describe('dormancy', () => {
    
    it('dormant: setMean no envía al worklet', () => {
      rcv.start();
      rcv._isDormant = true;
      rcv._workletMessages = [];
      rcv.setMean(3);
      assert.equal(rcv.values.mean, 3, 'El valor se guarda');
      const msgs = rcv._workletMessages.filter(m => m.type === 'setMean');
      assert.equal(msgs.length, 0, 'No debe enviar al worklet durante dormancy');
    });

    it('dormant: setVoltage1Level no actualiza ganancia', () => {
      rcv.start();
      rcv.voltage1Gain.gain.value = 0;
      rcv._isDormant = true;
      rcv.setVoltage1Level(10);
      assert.equal(rcv.values.voltage1, 10, 'El valor se guarda');
      assert.equal(rcv.voltage1Gain.gain.value, 0, 'Ganancia no cambia durante dormancy');
    });

    it('dormant: setKeyLevel no actualiza ganancia', () => {
      rcv.start();
      rcv.keyGain.gain.value = 0;
      rcv._isDormant = true;
      rcv.setKeyLevel(5);
      assert.equal(rcv.values.key, 5, 'El valor se guarda');
      assert.equal(rcv.keyGain.gain.value, 0, 'Ganancia no cambia durante dormancy');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REAL MODULE — Tests de dormancy usando la implementación real de RandomCVModule
// ═══════════════════════════════════════════════════════════════════════════

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});

const { RandomCVModule } = await import('../../src/assets/js/modules/randomCV.js');

describe('RandomCVModule (real) — dormancy', () => {
  let ctx;
  let engine;
  let rcv;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    rcv = new RandomCVModule(engine, 'rcv-1');
    rcv.start();
  });

  it('setDormant(true) envía setDormant=true al worklet', () => {
    rcv.setDormant(true);
    const msgs = rcv.workletNode.port._messages.filter(m => m.type === 'setDormant');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].dormant, true);
  });

  it('setDormant(true) silencia las 3 salidas', () => {
    rcv.setVoltage1Level(8);
    rcv.setVoltage2Level(8);
    rcv.setDormant(true);
    assert.equal(rcv.voltage1Gain.gain.value, 0);
    assert.equal(rcv.voltage2Gain.gain.value, 0);
    assert.equal(rcv.keyGain.gain.value, 0);
  });

  it('setDormant(false) restaura ganancias desde values', () => {
    rcv.setVoltage1Level(10);
    rcv.setDormant(true);
    rcv.setDormant(false);
    assert.ok(rcv.voltage1Gain.gain.value > 0,
      `voltage1Gain.gain tras wake debe ser > 0, fue ${rcv.voltage1Gain.gain.value}`);
  });

  it('setDormant(false) re-envía setMean y setVariance al worklet', () => {
    rcv.setMean(3);
    rcv.setVariance(2);
    rcv.setDormant(true);
    rcv.workletNode.port._messages.length = 0;
    rcv.setDormant(false);
    const msgs = rcv.workletNode.port._messages;
    assert.ok(msgs.some(m => m.type === 'setMean' && m.value === 3),
      'wake debe re-enviar setMean');
    assert.ok(msgs.some(m => m.type === 'setVariance' && m.value === 2),
      'wake debe re-enviar setVariance');
  });
});
