/**
 * Tests para ringModulator.js — Módulo de Modulador de Anillo
 *
 * Verifica: constructor, audio nodes chain, setLevel,
 * getInputNode(A/B), getOutputNode, dormancy, start/stop.
 *
 * El Ring Modulator del Synthi 100 es un multiplicador de precisión
 * con 2 entradas de audio (A, B) y 1 salida.
 * El único control manual es el nivel de salida (10K LOG).
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

const { RingModulatorModule } = await import('../../src/assets/js/modules/ringModulator.js');

describe('RingModulatorModule', () => {
  let ctx;
  let engine;
  let module;

  beforeEach(() => {
    ctx = createMockAudioContext();
    engine = { audioCtx: ctx };
    module = new RingModulatorModule(engine, 'ringmod-1', {
      index: 1,
      sourceKind: 'ringModulator'
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR / VALORES POR DEFECTO
  // ═══════════════════════════════════════════════════════════════════════

  it('inicializa valores por defecto: level=0', () => {
    assert.deepEqual(module.values, { level: 0 });
  });

  it('almacena sourceKind correctamente', () => {
    assert.equal(module.sourceKind, 'ringModulator');
  });

  it('almacena index correctamente', () => {
    assert.equal(module.index, 1);
  });

  it('nombre incluye el índice', () => {
    assert.equal(module.name, 'Ring Mod 1');
  });

  it('no tiene nodos de audio antes de start()', () => {
    assert.equal(module.inputGainA, null);
    assert.equal(module.inputGainB, null);
    assert.equal(module.workletNode, null);
    assert.equal(module.outputGain, null);
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

  it('la curva es monótona creciente', () => {
    let prev = 0;
    for (let d = 0.5; d <= 10; d += 0.5) {
      const gain = module._levelDialToGain(d);
      assert.ok(gain > prev, `gain(${d}) = ${gain} debe ser > gain(${d - 0.5}) = ${prev}`);
      prev = gain;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // START / AUDIO NODE CHAIN
  // ═══════════════════════════════════════════════════════════════════════

  it('start() crea inputGainA, inputGainB, worklet y outputGain', () => {
    module.start();
    assert.ok(module.inputGainA, 'inputGainA debe existir');
    assert.ok(module.inputGainB, 'inputGainB debe existir');
    assert.ok(module.workletNode, 'workletNode debe existir');
    assert.ok(module.outputGain, 'outputGain debe existir');
  });

  it('inputGainA se inicializa a 1', () => {
    module.start();
    assert.equal(module.inputGainA.gain.value, 1);
  });

  it('inputGainB se inicializa a 1', () => {
    module.start();
    assert.equal(module.inputGainB.gain.value, 1);
  });

  it('outputGain se inicializa a 0 (level inicial = 0)', () => {
    module.start();
    assert.equal(module.outputGain.gain.value, 0);
  });

  it('outputs tiene una entrada con kind ringModulator', () => {
    module.start();
    assert.equal(module.outputs.length, 1);
    assert.equal(module.outputs[0].kind, 'ringModulator');
  });

  it('workletNode se registra con nombre ring-modulator', () => {
    module.start();
    assert.equal(module.workletNode._name, 'ring-modulator');
  });

  it('workletNode tiene 2 entradas de audio', () => {
    module.start();
    assert.equal(module.workletNode._options?.numberOfInputs, 2);
  });

  it('workletNode tiene 1 salida mono', () => {
    module.start();
    assert.equal(module.workletNode._options?.numberOfOutputs, 1);
    assert.deepEqual(module.workletNode._options?.outputChannelCount, [1]);
  });

  it('start() es idempotente', () => {
    module.start();
    const firstWorklet = module.workletNode;
    module.start();
    assert.equal(module.workletNode, firstWorklet, 'No debe recrear nodos');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SETTERS
  // ═══════════════════════════════════════════════════════════════════════

  it('setLevel actualiza values.level', () => {
    module.setLevel(7);
    assert.equal(module.values.level, 7);
  });

  it('setLevel actualiza la ganancia de salida', () => {
    module.start();
    module.setLevel(4);
    assert.ok(module.outputGain.gain.value > 0);
    assert.ok(module.outputGain.gain.value < 0.1);
  });

  it('setLevel(10) → ganancia 1', () => {
    module.start();
    module.setLevel(10);
    assert.equal(module.outputGain.gain.value, 1);
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

  it('getInputNode("A") hace lazy init y devuelve inputGainA', () => {
    const nodeA = module.getInputNode('A');
    assert.ok(nodeA, 'getInputNode(A) debe devolver nodo');
    assert.equal(nodeA, module.inputGainA);
  });

  it('getInputNode("B") hace lazy init y devuelve inputGainB', () => {
    const nodeB = module.getInputNode('B');
    assert.ok(nodeB, 'getInputNode(B) debe devolver nodo');
    assert.equal(nodeB, module.inputGainB);
  });

  it('getInputNode con inputId inválido devuelve null', () => {
    const node = module.getInputNode('C');
    assert.equal(node, null);
  });

  it('getOutputNode hace lazy init', () => {
    const node = module.getOutputNode();
    assert.ok(node, 'getOutputNode debe devolver nodo');
    assert.equal(node, module.outputGain);
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

  it('setLevel no modifica ganancia durante dormancy pero guarda valor', () => {
    module.start();
    module.setLevel(8);
    module.setDormant(true);
    module.setLevel(5);
    assert.equal(module.values.level, 5, 'Valor debe guardarse');
    assert.equal(module.outputGain.gain.value, 0, 'Ganancia debe ser 0 durante dormancy');
  });

  it('envía setDormant al worklet', () => {
    module.start();
    const messages = [];
    module.workletNode.port.postMessage = (msg) => messages.push(msg);
    module.setDormant(true);
    const dormMsg = messages.find(m => m.type === 'setDormant');
    assert.ok(dormMsg, 'Debe enviar setDormant al worklet');
    assert.equal(dormMsg.dormant, true);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // STOP
  // ═══════════════════════════════════════════════════════════════════════

  it('stop() limpia todos los nodos y outputs', () => {
    module.start();
    module.stop();
    assert.equal(module.inputGainA, null);
    assert.equal(module.inputGainB, null);
    assert.equal(module.workletNode, null);
    assert.equal(module.outputGain, null);
    assert.equal(module.outputs.length, 0);
    assert.equal(module.isStarted, false);
  });

  it('stop() envía mensaje stop al worklet', () => {
    module.start();
    const messages = [];
    module.workletNode.port.postMessage = (msg) => messages.push(msg);
    module.stop();
    const stopMsg = messages.find(m => m.type === 'stop');
    assert.ok(stopMsg, 'Debe enviar stop al worklet');
  });

  it('stop() es seguro si no se ha iniciado', () => {
    assert.doesNotThrow(() => module.stop());
  });

  // ═══════════════════════════════════════════════════════════════════════
  // INPUT GAIN INDEPENDENCIA
  // ═══════════════════════════════════════════════════════════════════════

  it('inputGainA permanece en 1 independientemente del level', () => {
    module.start();
    for (const level of [0, 2, 5, 8, 10]) {
      module.setLevel(level);
      assert.equal(module.inputGainA.gain.value, 1,
        `inputGainA debe ser 1 con level=${level}`);
    }
  });

  it('inputGainB permanece en 1 independientemente del level', () => {
    module.start();
    for (const level of [0, 2, 5, 8, 10]) {
      module.setLevel(level);
      assert.equal(module.inputGainB.gain.value, 1,
        `inputGainB debe ser 1 con level=${level}`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MÚLTIPLES INSTANCIAS
  // ═══════════════════════════════════════════════════════════════════════

  it('se pueden crear 3 instancias independientes', () => {
    const modules = [];
    for (let i = 1; i <= 3; i++) {
      const m = new RingModulatorModule(engine, `ringmod-${i}`, {
        index: i,
        sourceKind: 'ringModulator'
      });
      m.start();
      modules.push(m);
    }

    assert.equal(modules.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.equal(modules[i].index, i + 1);
      assert.equal(modules[i].outputs[0].index, i);
      assert.equal(modules[i].outputs[0].kind, 'ringModulator');
    }
  });

  it('instancias independientes no comparten nodos', () => {
    const m1 = new RingModulatorModule(engine, 'rm1', { index: 1 });
    const m2 = new RingModulatorModule(engine, 'rm2', { index: 2 });
    m1.start();
    m2.start();
    assert.notEqual(m1.workletNode, m2.workletNode);
    assert.notEqual(m1.outputGain, m2.outputGain);
    assert.notEqual(m1.inputGainA, m2.inputGainA);
  });

  it('setLevel en una instancia no afecta a otra', () => {
    const m1 = new RingModulatorModule(engine, 'rm1', { index: 1 });
    const m2 = new RingModulatorModule(engine, 'rm2', { index: 2 });
    m1.start();
    m2.start();
    m1.setLevel(10);
    assert.equal(m1.outputGain.gain.value, 1);
    assert.equal(m2.outputGain.gain.value, 0);
  });
});
