/**
 * Tests básicos para state/index.js (versión simplificada)
 * 
 * Solo tests síncronos sin storage ni timers
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock window
globalThis.window = { __synthBuildVersion: '0.3.0-test' };

// Mock localStorage mínimo
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

// Mock document mínimo  
globalThis.document = {
  createElement: () => ({ click: () => {}, style: {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
  dispatchEvent: () => {}
};

import {
  initStateSystem,
  serializeCurrentState,
  applyPatch
} from '../../src/assets/js/state/index.js';

import { createEmptyPatch, FORMAT_VERSION } from '../../src/assets/js/state/schema.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockMatrix() {
  let connections = { audio: [], control: [] };
  return {
    setState(state) { connections = { ...state }; },
    getState() { return { ...connections }; }
  };
}

function createMockRouter() {
  let routing = { stereoBuses: [], individualOutputs: [] };
  return {
    setState(state) { routing = { ...state }; },
    getState() { return { ...routing }; }
  };
}

function createMockEngine() {
  const modules = new Map();
  const matrix = createMockMatrix();
  const router = createMockRouter();

  return {
    getModules: () => Array.from(modules.values()),
    getModule: (id) => modules.get(id),
    registerModule: (module) => modules.set(module.id, module),
    getMatrix: () => matrix,
    getRouter: () => router,
    getRouting: () => router.getState()
  };
}

function createMockOscillator(id, frequency = 440) {
  return {
    id,
    currentValues: { frequency, pulseLevel: 0.5, sineLevel: 0.8 },
    getState() { return { ...this.currentValues }; },
    setState(state) { Object.assign(this.currentValues, state); }
  };
}

function createMockNoise(id) {
  return {
    id,
    currentValues: { colour: 0.5, level: 0.7 },
    getState() { return { ...this.currentValues }; },
    setState(state) { Object.assign(this.currentValues, state); }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('initStateSystem()', () => {
  it('almacena referencia al engine', () => {
    const engine = createMockEngine();
    initStateSystem(engine);
    
    const patch = serializeCurrentState('Test');
    assert.ok(patch);
    assert.equal(patch.name, 'Test');
  });
});

describe('serializeCurrentState()', () => {
  let engine;

  beforeEach(() => {
    engine = createMockEngine();
    initStateSystem(engine);
  });

  it('retorna estructura de patch válida', () => {
    const patch = serializeCurrentState('Test');
    
    assert.equal(patch.name, 'Test');
    assert.equal(patch.formatVersion, FORMAT_VERSION);
    assert.ok(patch.modules);
  });

  it('serializa nombre y categoría', () => {
    const patch = serializeCurrentState('Test Patch', { category: 'Bass' });
    
    assert.equal(patch.name, 'Test Patch');
    assert.equal(patch.category, 'Bass');
  });

  it('serializa osciladores', () => {
    engine.registerModule(createMockOscillator('osc1', 110));
    engine.registerModule(createMockOscillator('osc2', 220));
    
    const patch = serializeCurrentState('Oscillators');
    
    assert.ok(patch.modules.osc1);
    assert.equal(patch.modules.osc1.frequency, 110);
    assert.ok(patch.modules.osc2);
    assert.equal(patch.modules.osc2.frequency, 220);
  });

  it('serializa módulos de ruido', () => {
    engine.registerModule(createMockNoise('noise1'));
    
    const patch = serializeCurrentState('Noise');
    
    assert.ok(patch.modules.noise1);
    assert.equal(patch.modules.noise1.colour, 0.5);
    assert.equal(patch.modules.noise1.level, 0.7);
  });

  it('serializa múltiples tipos de módulos', () => {
    engine.registerModule(createMockOscillator('osc1', 440));
    engine.registerModule(createMockNoise('noise1'));
    
    const patch = serializeCurrentState('Complete');
    
    assert.equal(Object.keys(patch.modules).length, 2);
    assert.ok(patch.modules.osc1);
    assert.ok(patch.modules.noise1);
  });

  it('serializa matriz si disponible', () => {
    const matrix = engine.getMatrix();
    matrix.setState({ audio: [[0, 1]], control: [[2, 3]] });
    
    const patch = serializeCurrentState('With Matrix');
    
    assert.ok(patch.matrix);
    assert.ok(Array.isArray(patch.matrix.audio));
    assert.ok(Array.isArray(patch.matrix.control));
  });

  it('serializa routing si disponible', () => {
    const router = engine.getRouter();
    router.setState({
      stereoBuses: [{ pan: 0.5, level: 0.8 }],
      individualOutputs: [{ enabled: false }]
    });
    
    const patch = serializeCurrentState('With Routing');
    
    assert.ok(patch.routing);
    assert.ok(patch.routing.stereoBuses);
  });
});

describe('applyPatch()', () => {
  let engine;

  beforeEach(() => {
    engine = createMockEngine();
    initStateSystem(engine);
  });

  it('rechaza patches inválidos', () => {
    const result = applyPatch({});
    
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
  });

  it('aplica patch válido', () => {
    const osc = createMockOscillator('osc1', 100);
    engine.registerModule(osc);
    
    const patch = createEmptyPatch('Test');
    patch.modules.osc1 = { frequency: 880 };
    
    const result = applyPatch(patch);
    
    assert.equal(result.success, true);
    assert.equal(osc.currentValues.frequency, 880);
  });

  it('aplica estado a múltiples módulos', () => {
    const osc1 = createMockOscillator('osc1', 100);
    const osc2 = createMockOscillator('osc2', 200);
    const noise = createMockNoise('noise1');
    
    engine.registerModule(osc1);
    engine.registerModule(osc2);
    engine.registerModule(noise);
    
    const patch = createEmptyPatch('Multi');
    patch.modules.osc1 = { frequency: 440 };
    patch.modules.osc2 = { frequency: 880 };
    patch.modules.noise1 = { colour: 0.8, level: 0.9 };
    
    const result = applyPatch(patch);
    
    assert.equal(result.success, true);
    assert.equal(osc1.currentValues.frequency, 440);
    assert.equal(osc2.currentValues.frequency, 880);
    assert.equal(noise.currentValues.colour, 0.8);
  });

  it('aplica estado de matriz', () => {
    const matrix = engine.getMatrix();
    
    const patch = createEmptyPatch('Matrix');
    patch.matrix = { audio: [[0, 5]], control: [[10, 15]] };
    
    const result = applyPatch(patch);
    
    assert.equal(result.success, true);
    const matrixState = matrix.getState();
    assert.deepEqual(matrixState.audio, [[0, 5]]);
  });

  it('aplica estado de routing', () => {
    const router = engine.getRouter();
    
    const patch = createEmptyPatch('Routing');
    patch.routing = {
      stereoBuses: [{ pan: -0.5, level: 0.6 }],
      individualOutputs: [{ enabled: false }]
    };
    
    const result = applyPatch(patch);
    
    assert.equal(result.success, true);
    const routingState = router.getState();
    assert.equal(routingState.stereoBuses[0].pan, -0.5);
  });

  it('maneja módulos faltantes sin fallar', () => {
    const osc1 = createMockOscillator('osc1');
    engine.registerModule(osc1);
    
    const patch = createEmptyPatch('Partial');
    patch.modules.osc1 = { frequency: 440 };
    patch.modules.osc_nonexistent = { frequency: 880 };
    
    const result = applyPatch(patch);
    
    // osc1 debería aplicarse
    assert.equal(osc1.currentValues.frequency, 440);
  });

  it('retorna error si engine no inicializado', () => {
    initStateSystem(null);
    
    const patch = createEmptyPatch('Test');
    const result = applyPatch(patch);
    
    assert.equal(result.success, false);
    assert.ok(result.errors.includes('Engine not initialized'));
  });
});

describe('Edge cases', () => {
  it('maneja engine sin getModules', () => {
    const minimalEngine = {};
    initStateSystem(minimalEngine);
    
    const patch = serializeCurrentState('Minimal');
    
    assert.ok(patch);
    assert.equal(Object.keys(patch.modules).length, 0);
  });

  it('serializa con módulos sin currentValues', () => {
    const engine = createMockEngine();
    const moduleWithoutValues = {
      id: 'osc1',
      getState: () => ({})
    };
    engine.registerModule(moduleWithoutValues);
    initStateSystem(engine);
    
    const patch = serializeCurrentState('NoValues');
    
    assert.ok(patch.modules.osc1);
  });
});
