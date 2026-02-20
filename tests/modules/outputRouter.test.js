/**
 * Tests para modules/outputRouter.js
 * 
 * Verifica:
 * - constructor(): inicialización del módulo
 * - start(): creación de inputs CV para buses
 * - Registro de entradas para routing de audio
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import '../mocks/localStorage.mock.js';
import { createMockAudioContext } from '../mocks/audioContext.mock.js';

import { OutputRouterModule } from '../../src/assets/js/modules/outputRouter.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock de AudioEngine con buses modulables
 */
function createMockEngine() {
  const ctx = createMockAudioContext();
  
  return {
    audioCtx: ctx,
    bus1Mod: ctx.createGain(),
    bus2Mod: ctx.createGain()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputRouterModule constructor', () => {

  it('crea instancia con ID proporcionado', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'outputRouter1');
    
    assert.equal(module.id, 'outputRouter1');
    assert.equal(module.name, 'Output Router');
  });

  it('hereda de Module', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    assert.equal(module.engine, engine);
    assert.ok(Array.isArray(module.inputs));
    assert.ok(Array.isArray(module.outputs));
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: START
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputRouterModule.start()', () => {

  it('crea inputs para bus1 y bus2', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    assert.equal(module.inputs.length, 2);
  });

  it('configura input para bus1LevelCV', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    const bus1Input = module.inputs.find(i => i.id === 'bus1LevelCV');
    assert.ok(bus1Input);
    assert.equal(bus1Input.kind, 'cv');
    assert.equal(bus1Input.label, 'Output Ch Level 1');
    assert.equal(bus1Input.param, engine.bus1Mod.gain);
  });

  it('configura input para bus2LevelCV', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    const bus2Input = module.inputs.find(i => i.id === 'bus2LevelCV');
    assert.ok(bus2Input);
    assert.equal(bus2Input.kind, 'cv');
    assert.equal(bus2Input.label, 'Output Ch Level 2');
    assert.equal(bus2Input.param, engine.bus2Mod.gain);
  });

  it('no crea inputs duplicados en múltiples llamadas', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    const firstCount = module.inputs.length;
    
    module.start();
    
    assert.equal(module.inputs.length, firstCount);
  });

  it('no crea inputs si audioCtx no está disponible', () => {
    const engine = createMockEngine();
    delete engine.audioCtx;
    
    const module = new OutputRouterModule(engine, 'router');
    module.start();
    
    assert.equal(module.inputs.length, 0);
  });

  it('no crea inputs si bus1Mod no está disponible', () => {
    const engine = createMockEngine();
    delete engine.bus1Mod;
    
    const module = new OutputRouterModule(engine, 'router');
    module.start();
    
    assert.equal(module.inputs.length, 0);
  });

  it('no crea inputs si bus2Mod no está disponible', () => {
    const engine = createMockEngine();
    delete engine.bus2Mod;
    
    const module = new OutputRouterModule(engine, 'router');
    module.start();
    
    assert.equal(module.inputs.length, 0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CASOS EDGE
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {

  it('maneja engine con buses nulos', () => {
    const engine = createMockEngine();
    engine.bus1Mod = null;
    engine.bus2Mod = null;
    
    const module = new OutputRouterModule(engine, 'router');
    module.start();
    
    assert.equal(module.inputs.length, 0);
  });

  it('maneja llamadas a start() antes de audioCtx', () => {
    const engine = { audioCtx: null };
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    // No debe fallar
    assert.equal(module.inputs.length, 0);
  });

  it('puede inicializar después de configurar engine', () => {
    const ctx = createMockAudioContext();
    const engine = { audioCtx: null };
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    assert.equal(module.inputs.length, 0);
    
    // Configurar engine
    engine.audioCtx = ctx;
    engine.bus1Mod = ctx.createGain();
    engine.bus2Mod = ctx.createGain();
    
    module.start();
    
    assert.equal(module.inputs.length, 2);
  });

  it('inputs apuntan a AudioParams reales', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    const bus1Input = module.inputs[0];
    const bus2Input = module.inputs[1];
    
    // Verificar que son AudioParams (mock)
    assert.ok(bus1Input.param);
    assert.ok(bus2Input.param);
    assert.equal(typeof bus1Input.param.value, 'number');
    assert.equal(typeof bus2Input.param.value, 'number');
  });

  it('puede modificar gain de buses via inputs', () => {
    const engine = createMockEngine();
    const module = new OutputRouterModule(engine, 'router');
    
    module.start();
    
    const bus1Param = module.inputs[0].param;
    const bus2Param = module.inputs[1].param;
    
    bus1Param.value = 0.5;
    bus2Param.value = 0.8;
    
    assert.equal(engine.bus1Mod.gain.value, 0.5);
    assert.equal(engine.bus2Mod.gain.value, 0.8);
  });

});
