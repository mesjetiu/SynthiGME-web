/**
 * Tests para springReverb.js — Módulo de Reverberación de Muelle
 *
 * Verifica: constructor, audio nodes chain, setMix, setLevel,
 * getInputNode, getOutputNode, getMixCVParam, dormancy, start/stop.
 *
 * @version 1.0.0
 */

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

const { SpringReverbModule } = await import('../../src/assets/js/modules/springReverb.js');

describe('SpringReverbModule', () => {
  let ctx;
  let engine;
  let module;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    module = new SpringReverbModule(engine, 'reverb1', {
      index: 1,
      sourceKind: 'reverberation'
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR / VALORES POR DEFECTO
  // ═══════════════════════════════════════════════════════════════════════

  it('inicializa valores por defecto: mix=0, level=0', () => {
    assert.deepEqual(module.values, {
      mix: 0,
      level: 0
    });
  });

  it('almacena sourceKind correctamente', () => {
    assert.equal(module.sourceKind, 'reverberation');
  });

  it('almacena index correctamente', () => {
    assert.equal(module.index, 1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LEVEL CURVE (logarítmica base 100)
  // ═══════════════════════════════════════════════════════════════════════

  it('dial de nivel 10 equivale a ganancia unitaria', () => {
    assert.equal(module._levelDialToGain(10), 1);
  });

  it('dial de nivel 0 equivale a ganancia 0', () => {
    assert.equal(module._levelDialToGain(0), 0);
  });

  it('el nivel usa ley logarítmica (dial 5 < 0.1)', () => {
    assert.ok(module._levelDialToGain(5) < 0.1,
      `Level 5 → ${module._levelDialToGain(5)}, esperado < 0.1`);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // START / AUDIO NODE CHAIN
  // ═══════════════════════════════════════════════════════════════════════

  it('start() crea inputGain, worklet y outputGain', () => {
    module.start();
    assert.ok(module.inputGain, 'inputGain debe existir');
    assert.ok(module.workletNode, 'workletNode debe existir');
    assert.ok(module.outputGain, 'outputGain debe existir');
  });

  it('inputGain se inicializa a 1', () => {
    module.start();
    assert.equal(module.inputGain.gain.value, 1);
  });

  it('outputGain se inicializa a 0 (level = 0)', () => {
    module.start();
    assert.equal(module.outputGain.gain.value, 0);
  });

  it('outputs tiene una entrada con kind reverberation', () => {
    module.start();
    assert.equal(module.outputs.length, 1);
    assert.equal(module.outputs[0].kind, 'reverberation');
  });

  it('workletNode se registra con nombre spring-reverb', () => {
    module.start();
    assert.equal(module.workletNode._name, 'spring-reverb');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SETTERS
  // ═══════════════════════════════════════════════════════════════════════

  it('setMix actualiza values.mix', () => {
    module.start();
    module.setMix(6.5);
    assert.equal(module.values.mix, 6.5);
  });

  it('setMix envía mensaje al worklet via postMessage', () => {
    module.start();
    const messages = [];
    module.workletNode.port.postMessage = (msg) => messages.push(msg);
    module.setMix(7);
    const mixMsg = messages.find(m => m.type === 'setMix');
    assert.ok(mixMsg, 'debe enviar mensaje setMix');
    assert.equal(mixMsg.value, 7);
  });

  it('setMix clampea a [0, 10]', () => {
    module.setMix(-5);
    assert.equal(module.values.mix, 0);
    module.setMix(15);
    assert.equal(module.values.mix, 10);
  });

  it('setLevel actualiza la ganancia de salida', () => {
    module.start();
    module.setLevel(4);
    assert.ok(module.outputGain.gain.value > 0);
    assert.ok(module.outputGain.gain.value < 0.1);
  });

  it('setLevel clampea a [0, 10]', () => {
    module.setLevel(-5);
    assert.equal(module.values.level, 0);
    module.setLevel(15);
    assert.equal(module.values.level, 10);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ACCESSORS (lazy init)
  // ═══════════════════════════════════════════════════════════════════════

  it('getInputNode hace lazy init', () => {
    assert.ok(module.getInputNode(), 'getInputNode debe devolver nodo');
  });

  it('getOutputNode hace lazy init', () => {
    assert.ok(module.getOutputNode(), 'getOutputNode debe devolver nodo');
  });

  it('getMixCVParam devuelve AudioParam de mixControl', () => {
    module.start();
    const param = module.getMixCVParam();
    assert.ok(param, 'getMixCVParam debe devolver AudioParam');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DORMANCY
  // ═══════════════════════════════════════════════════════════════════════

  it('dormancy silencia la salida', () => {
    module.start();
    module.setLevel(8);
    module.setDormant(true);
    assert.equal(module.outputGain.gain.value, 0);
  });

  it('dormir y despertar restaura level', () => {
    module.start();
    module.setLevel(8);
    module.setDormant(true);
    assert.equal(module.outputGain.gain.value, 0);
    module.setDormant(false);
    assert.ok(module.outputGain.gain.value > 0.3,
      `Tras wake, level 8 → gain ${module.outputGain.gain.value}`);
  });

  it('setMix no envía mensaje al worklet durante dormancy', () => {
    module.start();
    module.setDormant(true);
    const messages = [];
    module.workletNode.port.postMessage = (msg) => messages.push(msg);
    module.setMix(5);
    const mixMsg = messages.find(m => m.type === 'setMix');
    assert.ok(!mixMsg, 'No debe enviar setMix durante dormancy');
  });

  it('wake restaura mix al worklet', () => {
    module.start();
    module.setMix(7);
    module.setDormant(true);
    const messages = [];
    module.workletNode.port.postMessage = (msg) => messages.push(msg);
    module.setDormant(false);
    const mixMsg = messages.find(m => m.type === 'setMix');
    assert.ok(mixMsg, 'Wake debe restaurar mix');
    assert.equal(mixMsg.value, 7);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STOP
  // ═══════════════════════════════════════════════════════════════════════

  it('stop() limpia nodos y outputs', () => {
    module.start();
    module.stop();
    assert.equal(module.inputGain, null);
    assert.equal(module.workletNode, null);
    assert.equal(module.outputGain, null);
    assert.equal(module.outputs.length, 0);
    assert.equal(module.isStarted, false);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // INPUT/OUTPUT GAIN INDEPENDENCIA
  // ═══════════════════════════════════════════════════════════════════════

  it('inputGain permanece en 1 independientemente del level', () => {
    module.start();
    for (const level of [0, 2, 5, 8, 10]) {
      module.setLevel(level);
      assert.equal(module.inputGain.gain.value, 1,
        `inputGain debe ser 1 con level=${level}`);
    }
  });
});
