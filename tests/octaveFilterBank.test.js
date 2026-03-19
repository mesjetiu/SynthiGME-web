/**
 * Tests para OctaveFilterBankModule
 *
 * Verifica la estructura y comportamiento del banco de filtros de 8 octavas.
 * Sin worklet — usa BiquadFilterNode nativos de Web Audio API.
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// 1. STATIC SOURCE INSPECTION
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');
const moduleSource = readFileSync(resolve(ROOT, 'src/assets/js/modules/octaveFilterBank.js'), 'utf-8');
const configSource = readFileSync(resolve(ROOT, 'src/assets/js/configs/modules/octaveFilterBank.config.js'), 'utf-8');
const panel5Source = readFileSync(resolve(ROOT, 'src/assets/js/panelBlueprints/panel5.audio.blueprint.js'), 'utf-8');
const routingSource = readFileSync(resolve(ROOT, 'src/assets/js/panelRouting.js'), 'utf-8');

describe('OctaveFilterBank — static source inspection', () => {

  it('módulo extiende Module', () => {
    assert.match(moduleSource, /extends\s+Module/);
  });

  it('no usa AudioWorkletNode (usa BiquadFilter nativos)', () => {
    assert.doesNotMatch(moduleSource, /AudioWorkletNode/);
    assert.match(moduleSource, /createBiquadFilter/);
  });

  it('crea 8 filtros bandpass', () => {
    assert.match(moduleSource, /bandpass/);
    assert.match(moduleSource, /BAND_COUNT/);
    assert.match(moduleSource, /CENTER_FREQUENCIES.*=.*\[63.*125.*250.*500.*1000.*2000.*4000.*8000\]/);
  });

  it('usa Q ≈ √2 para ancho de banda de 1 octava', () => {
    assert.match(moduleSource, /1\.414/);
  });

  it('tiene ganancia de compensación (makeup gain) de 10 dB', () => {
    assert.match(moduleSource, /MAKEUP_GAIN_DB\s*=\s*10/);
  });

  it('implementa setBandLevel con clamp 0-10', () => {
    assert.match(moduleSource, /setBandLevel\s*\(\s*bandIndex\s*,\s*value\s*\)/);
    assert.match(moduleSource, /clamp\(value,\s*0,\s*10\)/);
  });

  it('implementa start, stop, getInputNode, getOutputNode', () => {
    assert.match(moduleSource, /start\s*\(\s*\)/);
    assert.match(moduleSource, /stop\s*\(\s*\)/);
    assert.match(moduleSource, /getInputNode\s*\(\s*\)/);
    assert.match(moduleSource, /getOutputNode\s*\(\s*\)/);
  });

  it('implementa _onDormancyChange', () => {
    assert.match(moduleSource, /_onDormancyChange\s*\(\s*dormant\s*\)/);
  });

  it('registra output con kind octaveFilterBank', () => {
    assert.match(moduleSource, /kind:\s*this\.sourceKind/);
  });

  // Config
  it('config tiene las 8 frecuencias centrales', () => {
    assert.match(configSource, /centerFrequencies.*\[63.*125.*250.*500.*1000.*2000.*4000.*8000\]/);
  });

  it('config define matrix panel5 con fila 109 y columna 23', () => {
    assert.match(configSource, /rowSynth:\s*109/);
    assert.match(configSource, /colSynth:\s*23/);
  });

  it('config no tiene conexiones en panel 6', () => {
    assert.doesNotMatch(configSource, /panel6/);
  });

  // Blueprint panel5
  it('panel5 blueprint registra fila 109 como octaveFilterBank', () => {
    assert.match(panel5Source, /rowSynth:\s*109.*kind:\s*'octaveFilterBank'/);
  });

  it('panel5 blueprint registra columna 23 como octaveFilterBankInput', () => {
    assert.match(panel5Source, /colSynth:\s*23.*kind:\s*'octaveFilterBankInput'/);
  });

  // Routing
  it('panelRouting.js maneja octaveFilterBankInput (destino)', () => {
    assert.match(routingSource, /dest\.kind\s*===\s*'octaveFilterBankInput'/);
  });

  it('panelRouting.js maneja octaveFilterBank como source (salida)', () => {
    assert.match(routingSource, /source\.kind\s*===\s*'octaveFilterBank'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. UNIT TESTS (con mock de Web Audio API)
// ─────────────────────────────────────────────────────────────────────────────

// Mock mínimo de Web Audio
function createMockGainNode() {
  return {
    gain: { value: 0, setTargetAtTime: mock.fn(), cancelScheduledValues: mock.fn() },
    connect: mock.fn(),
    disconnect: mock.fn()
  };
}

function createMockBiquadFilter() {
  return {
    type: '',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: mock.fn(),
    disconnect: mock.fn()
  };
}

function createMockAudioCtx() {
  return {
    currentTime: 0,
    createGain: mock.fn(() => createMockGainNode()),
    createBiquadFilter: mock.fn(() => createMockBiquadFilter())
  };
}

function createMockEngine(ctx) {
  return {
    audioCtx: ctx,
    getAudioCtx: () => ctx,
    addModule: mock.fn(),
    removeModule: mock.fn()
  };
}

// Importar después de los mocks
import './mocks/localStorage.mock.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { ontouchstart: undefined };
}

const { OctaveFilterBankModule } = await import('../src/assets/js/modules/octaveFilterBank.js');

describe('OctaveFilterBankModule — unit tests', () => {
  let ctx, engine, ofb;

  beforeEach(() => {
    ctx = createMockAudioCtx();
    engine = createMockEngine(ctx);
    ofb = new OctaveFilterBankModule(engine, 'ofb-test', {
      sourceKind: 'octaveFilterBank'
    });
  });

  describe('constructor', () => {
    it('inicializa 8 bandas a 0', () => {
      assert.equal(ofb.values.bands.length, 8);
      assert.ok(ofb.values.bands.every(v => v === 0));
    });

    it('no inicia los nodos de audio', () => {
      assert.equal(ofb.filters, null);
      assert.equal(ofb.isStarted, false);
    });

    it('usa sourceKind del config', () => {
      assert.equal(ofb.sourceKind, 'octaveFilterBank');
    });
  });

  describe('start()', () => {
    it('crea 8 BiquadFilters y 8 GainNodes', () => {
      ofb.start();
      assert.equal(ofb.filters.length, 8);
      assert.equal(ofb.bandGains.length, 8);
      assert.equal(ofb.isStarted, true);
    });

    it('crea 8 filtros bandpass con las frecuencias correctas', () => {
      ofb.start();
      const expectedFreqs = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
      for (let i = 0; i < 8; i++) {
        assert.equal(ofb.filters[i].type, 'bandpass');
        assert.equal(ofb.filters[i].frequency.value, expectedFreqs[i]);
      }
    });

    it('configura Q = √2 en cada filtro', () => {
      ofb.start();
      for (let i = 0; i < 8; i++) {
        assert.ok(Math.abs(ofb.filters[i].Q.value - 1.414) < 0.001);
      }
    });

    it('crea sumNode con makeup gain (10 dB ≈ 3.162)', () => {
      ofb.start();
      const expectedGain = Math.pow(10, 10 / 20);
      assert.ok(Math.abs(ofb.sumNode.gain.value - expectedGain) < 0.01);
    });

    it('registra una salida con kind octaveFilterBank', () => {
      ofb.start();
      assert.equal(ofb.outputs.length, 1);
      assert.equal(ofb.outputs[0].kind, 'octaveFilterBank');
      assert.equal(ofb.outputs[0].id, 'audio');
    });

    it('no reinicializa si ya está iniciado', () => {
      ofb.start();
      const filters1 = ofb.filters;
      ofb.start();
      assert.strictEqual(ofb.filters, filters1);
    });
  });

  describe('stop()', () => {
    it('limpia todos los nodos', () => {
      ofb.start();
      ofb.stop();
      assert.equal(ofb.filters, null);
      assert.equal(ofb.bandGains, null);
      assert.equal(ofb.sumNode, null);
      assert.equal(ofb.outputGain, null);
      assert.equal(ofb.inputGain, null);
      assert.equal(ofb.isStarted, false);
      assert.equal(ofb.outputs.length, 0);
    });

    it('no falla si no estaba iniciado', () => {
      assert.doesNotThrow(() => ofb.stop());
    });
  });

  describe('setBandLevel()', () => {
    it('actualiza el valor de la banda (clamp 0-10)', () => {
      ofb.setBandLevel(3, 7.5);
      assert.equal(ofb.values.bands[3], 7.5);
    });

    it('clampea valores fuera de rango', () => {
      ofb.setBandLevel(0, -5);
      assert.equal(ofb.values.bands[0], 0);
      ofb.setBandLevel(0, 15);
      assert.equal(ofb.values.bands[0], 10);
    });

    it('ignora índices fuera de rango', () => {
      ofb.setBandLevel(-1, 5);
      ofb.setBandLevel(8, 5);
      assert.ok(ofb.values.bands.every(v => v === 0));
    });

    it('aplica gain al bandGain cuando está iniciado', () => {
      ofb.start();
      ofb.setBandLevel(2, 8);
      assert.equal(ofb.values.bands[2], 8);
      // El gain se aplica vía setParamSmooth → setTargetAtTime
    });
  });

  describe('getInputNode() / getOutputNode()', () => {
    it('inicializa los nodos lazy si no están creados', () => {
      assert.equal(ofb.inputGain, null);
      const input = ofb.getInputNode();
      assert.ok(input !== null);
      assert.equal(ofb.isStarted, false); // start() no se llama, pero nodos se crean
    });

    it('devuelve el nodo de salida', () => {
      const output = ofb.getOutputNode();
      assert.ok(output !== null);
    });
  });

  describe('curva logarítmica de potenciómetros (spec: 10K LOG)', () => {
    it('dial 0 → ganancia 0 (silencio absoluto)', () => {
      assert.equal(ofb._bandDialToGain(0), 0);
    });

    it('dial 10 → ganancia 1.0 (máximo)', () => {
      assert.ok(Math.abs(ofb._bandDialToGain(10) - 1.0) < 0.001);
    });

    it('dial 5 → ganancia << 0.5 (curva log, no lineal)', () => {
      const gain5 = ofb._bandDialToGain(5);
      assert.ok(gain5 > 0, 'debe ser mayor que 0');
      assert.ok(gain5 < 0.15, `debe ser << 0.5 para curva log (actual: ${gain5})`);
    });

    it('la curva es monótonamente creciente', () => {
      let prev = 0;
      for (let d = 1; d <= 10; d++) {
        const g = ofb._bandDialToGain(d);
        assert.ok(g > prev, `dial ${d} (${g}) debe ser > dial ${d - 1} (${prev})`);
        prev = g;
      }
    });
  });

  describe('spec: todos los mandos al máximo → señal inalterada + 10 dB', () => {
    it('con todos los knobs a 10, cada bandGain = 1.0', () => {
      ofb.start();
      for (let i = 0; i < 8; i++) {
        ofb.values.bands[i] = 10;
        ofb.bandGains[i].gain.value = ofb._bandDialToGain(10);
      }
      for (let i = 0; i < 8; i++) {
        assert.ok(Math.abs(ofb.bandGains[i].gain.value - 1.0) < 0.001,
          `banda ${i} gain debe ser 1.0`);
      }
    });

    it('sumNode mantiene makeup gain = 10 dB (3.162×)', () => {
      ofb.start();
      const expected = Math.pow(10, 10 / 20); // ~3.162
      assert.ok(Math.abs(ofb.sumNode.gain.value - expected) < 0.01);
    });
  });

  describe('spec: no controlado por voltaje', () => {
    it('no tiene getMixCVParam ni getFreqCVParam', () => {
      assert.equal(typeof ofb.getMixCVParam, 'undefined');
      assert.equal(typeof ofb.getFreqCVParam, 'undefined');
    });
  });

  describe('dormancy', () => {
    it('_onDormancyChange(true) pone sumNode.gain a 0', () => {
      ofb.start();
      ofb._onDormancyChange(true);
      // setTargetAtTime se llama con target 0
      const calls = ofb.sumNode.gain.setTargetAtTime.mock.calls;
      assert.ok(calls.length > 0);
      assert.equal(calls[calls.length - 1].arguments[0], 0);
    });

    it('_onDormancyChange(false) restaura makeup gain', () => {
      ofb.start();
      ofb._onDormancyChange(false);
      const expected = Math.pow(10, 10 / 20);
      const calls = ofb.sumNode.gain.setTargetAtTime.mock.calls;
      assert.ok(calls.length > 0);
      assert.ok(Math.abs(calls[0].arguments[0] - expected) < 0.01);
    });

    it('setBandLevel no aplica audio cuando dormant', () => {
      ofb.start();
      ofb._isDormant = true;
      const prevCalls = ofb.bandGains[0].gain.setTargetAtTime.mock.calls.length;
      ofb.setBandLevel(0, 7);
      assert.equal(ofb.values.bands[0], 7); // valor actualizado
      assert.equal(ofb.bandGains[0].gain.setTargetAtTime.mock.calls.length, prevCalls); // audio no tocado
    });
  });

  describe('conexiones de audio (connect calls)', () => {
    it('input se conecta a los 8 filtros', () => {
      ofb.start();
      assert.equal(ofb.inputGain.connect.mock.calls.length, 8);
    });

    it('cada filtro se conecta a su bandGain', () => {
      ofb.start();
      for (let i = 0; i < 8; i++) {
        assert.equal(ofb.filters[i].connect.mock.calls.length, 1);
      }
    });

    it('cada bandGain se conecta al sumNode', () => {
      ofb.start();
      for (let i = 0; i < 8; i++) {
        assert.equal(ofb.bandGains[i].connect.mock.calls.length, 1);
      }
    });

    it('sumNode se conecta al outputGain', () => {
      ofb.start();
      assert.equal(ofb.sumNode.connect.mock.calls.length, 1);
    });
  });
});
