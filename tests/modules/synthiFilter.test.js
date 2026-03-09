import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockAudioContext,
  createMockAudioWorkletNode
} from '../mocks/audioContext.mock.js';

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
  }
});

globalThis.AudioWorkletNode = class MockAudioWorkletNode {
  constructor(ctx, name, options) {
    return createMockAudioWorkletNode(name, options);
  }
};

const { SynthiFilterModule } = await import('../../src/assets/js/modules/synthiFilter.js');

describe('SynthiFilterModule', () => {
  let ctx;
  let engine;
  let module;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    module = new SynthiFilterModule(engine, 'flp1', {
      mode: 'lowpass',
      index: 1,
      sourceKind: 'filterLP'
    });
  });

  it('inicializa valores por defecto del banco 1982', () => {
    assert.deepEqual(module.values, {
      frequency: 5,
      response: 0,
      level: 0
    });
  });

  it('convierte dial 5 a control 0 (320 Hz de referencia)', () => {
    assert.equal(module._frequencyDialToControl(5), 0);
  });

  it('cada 0.7 divisiones equivalen a 0.1375 unidades digitales (0.55 V/oct)', () => {
    const step = module._frequencyDialToControl(5.7) - module._frequencyDialToControl(5);
    assert.ok(Math.abs(step - 0.1375) < 1e-9);
  });

  it('dial de nivel 10 equivale a ganancia unitaria', () => {
    assert.equal(module._levelDialToGain(10), 1);
  });

  it('el nivel usa ley logarítmica de entrada', () => {
    assert.ok(module._levelDialToGain(5) < 0.1);
  });

  it('start() crea input, worklet y output', () => {
    module.start();
    assert.ok(module.inputGain);
    assert.ok(module.workletNode);
    assert.ok(module.outputGain);
    assert.equal(module.inputGain.gain.value, 0);
    assert.equal(module.outputGain.gain.value, 1);
    assert.equal(module.outputs.length, 1);
  });

  it('expone AudioParam de cutoff CV', () => {
    module.start();
    assert.ok(module.getCutoffCVParam());
  });

  it('setFrequency actualiza el parámetro cutoffControl', () => {
    module.start();
    module.setFrequency(6.4);
    const param = module.workletNode.parameters.get('cutoffControl');
    assert.ok(param.value > 0);
  });

  it('setResponse actualiza el parámetro response', () => {
    module.start();
    module.setResponse(7.5);
    const param = module.workletNode.parameters.get('response');
    assert.equal(param.value, 7.5);
  });

  it('setLevel actualiza la ganancia de entrada', () => {
    module.start();
    module.setLevel(4);
    assert.ok(module.inputGain.gain.value > 0);
    assert.ok(module.inputGain.gain.value < 0.1);
  });

  it('getInputNode y getOutputNode hacen lazy init', () => {
    assert.ok(module.getInputNode());
    assert.ok(module.getOutputNode());
  });

  it('dormancy silencia la salida y al despertar restaura level', () => {
    module.start();
    module.setLevel(8);
    module.setDormant(true);
    assert.equal(module.outputGain.gain.value, 0);
    module.setDormant(false);
    assert.equal(module.outputGain.gain.value, 1);
    assert.ok(module.inputGain.gain.value > 0.3);
  });
});
