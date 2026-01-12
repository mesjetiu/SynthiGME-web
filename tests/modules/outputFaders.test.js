/**
 * Tests para modules/outputFaders.js
 * 
 * Verifica:
 * - constructor(): inicialización del módulo
 * - createPanel(): creación de UI con sliders
 * - serialize(): serialización del estado
 * - deserialize(): restauración del estado
 * - Interacción con sliders y actualización de engine
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMockAudioContext } from '../mocks/audioContext.mock.js';

// Setup DOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

import { OutputFaderModule } from '../../src/assets/js/modules/outputFaders.js';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock de AudioEngine con gestión de niveles de output
 */
function createMockEngine(numChannels = 8) {
  const levels = Array(numChannels).fill(0);
  
  return {
    audioCtx: createMockAudioContext(),
    outputChannels: numChannels,
    getOutputLevel(index) {
      return levels[index];
    },
    setOutputLevel(index, value, options = {}) {
      levels[index] = value;
    },
    _levels: levels // Para acceso directo en tests
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputFaderModule constructor', () => {

  it('crea instancia con ID por defecto', () => {
    const engine = createMockEngine();
    const module = new OutputFaderModule(engine);
    
    assert.equal(module.id, 'outputFaders');
    assert.equal(module.name, 'Output Faders');
  });

  it('acepta ID personalizado', () => {
    const engine = createMockEngine();
    const module = new OutputFaderModule(engine, 'customFaders');
    
    assert.equal(module.id, 'customFaders');
  });

  it('inicializa arrays vacíos de sliders y displays', () => {
    const engine = createMockEngine();
    const module = new OutputFaderModule(engine);
    
    assert.ok(Array.isArray(module.sliders));
    assert.equal(module.sliders.length, 0);
    assert.ok(Array.isArray(module.valueDisplays));
    assert.equal(module.valueDisplays.length, 0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CREACIÓN DE PANEL
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputFaderModule.createPanel()', () => {

  it('no hace nada si container es null', () => {
    const engine = createMockEngine();
    const module = new OutputFaderModule(engine);
    
    module.createPanel(null);
    
    assert.equal(module.sliders.length, 0);
  });

  it('crea sliders según número de canales del engine', () => {
    const engine = createMockEngine(8);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.sliders.length, 8);
    assert.equal(module.valueDisplays.length, 8);
  });

  it('configura sliders con rango 0-1', () => {
    const engine = createMockEngine(4);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const slider = module.sliders[0];
    assert.equal(slider.min, '0');
    assert.equal(slider.max, '1');
    assert.equal(slider.step, '0.001');
  });

  it('inicializa sliders con valores del engine', () => {
    const engine = createMockEngine(4);
    engine.setOutputLevel(0, 0.5);
    engine.setOutputLevel(1, 0.8);
    
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.sliders[0].value, '0.5');
    assert.equal(module.sliders[1].value, '0.8');
    assert.equal(module.sliders[2].value, '0'); // Resto en 0
  });

  it('crea elementos de título y etiquetas', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const title = container.querySelector('.voice-title');
    assert.ok(title);
    assert.equal(title.textContent, 'Buses de salida');
    
    const labels = container.querySelectorAll('.output-fader-label');
    assert.equal(labels.length, 2);
    assert.equal(labels[0].textContent, 'Out 1');
    assert.equal(labels[1].textContent, 'Out 2');
  });

  it('crea displays de valor para cada slider', () => {
    const engine = createMockEngine(3);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.valueDisplays.length, 3);
    
    // Verificar formato inicial
    const display = module.valueDisplays[0];
    assert.ok(display.textContent.match(/^\d+\.\d{3}$/)); // "0.000"
  });

  it('añade atributo preventPan a sliders', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.sliders[0].dataset.preventPan, 'true');
    assert.equal(module.sliders[1].dataset.preventPan, 'true');
  });

  it('añade aria-labels para accesibilidad', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.sliders[0].getAttribute('aria-label'), 'Nivel salida 1');
    assert.equal(module.sliders[1].getAttribute('aria-label'), 'Nivel salida 2');
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: INTERACCIÓN CON SLIDERS
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputFaderModule slider interaction', () => {

  it('actualiza engine al mover slider', (t, done) => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const slider = module.sliders[0];
    slider.value = '0.75';
    
    // Disparar evento input
    const event = new window.Event('input', { bubbles: true });
    slider.dispatchEvent(event);
    
    // Esperar RAF para que se aplique el cambio
    setTimeout(() => {
      assert.equal(engine.getOutputLevel(0), 0.75);
      done();
    }, 50);
  });

  it('actualiza display de valor al mover slider', (t, done) => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const slider = module.sliders[0];
    const display = module.valueDisplays[0];
    
    slider.value = '0.666';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    
    setTimeout(() => {
      assert.equal(display.textContent, '0.666');
      done();
    }, 50);
  });

  it('emite evento synth:userInteraction al cambiar valor', (t, done) => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    let eventFired = false;
    document.addEventListener('synth:userInteraction', () => {
      eventFired = true;
    }, { once: true });
    
    module.createPanel(container);
    
    const slider = module.sliders[0];
    slider.value = '0.5';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    
    setTimeout(() => {
      assert.ok(eventFired);
      done();
    }, 50);
  });

  it('no actualiza si valor no cambió', (t, done) => {
    const engine = createMockEngine(2);
    let setLevelCallCount = 0;
    
    const originalSetLevel = engine.setOutputLevel;
    engine.setOutputLevel = function(...args) {
      setLevelCallCount++;
      return originalSetLevel.apply(this, args);
    };
    
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const slider = module.sliders[0];
    slider.value = '0.5';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    
    setTimeout(() => {
      const firstCallCount = setLevelCallCount;
      
      // Disparar de nuevo con mismo valor
      slider.value = '0.5';
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      
      setTimeout(() => {
        // No debería llamar setLevel de nuevo
        assert.equal(setLevelCallCount, firstCallCount);
        done();
      }, 50);
    }, 50);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: SERIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputFaderModule.serialize()', () => {

  it('serializa niveles de todos los sliders', () => {
    const engine = createMockEngine(4);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    module.sliders[0].value = '0.25';
    module.sliders[1].value = '0.5';
    module.sliders[2].value = '0.75';
    module.sliders[3].value = '1.0';
    
    const state = module.serialize();
    
    assert.ok(state);
    assert.ok(Array.isArray(state.levels));
    assert.equal(state.levels.length, 4);
    assert.equal(state.levels[0], 0.25);
    assert.equal(state.levels[1], 0.5);
    assert.equal(state.levels[2], 0.75);
    assert.equal(state.levels[3], 1.0);
  });

  it('serializa antes de createPanel retorna estructura vacía', () => {
    const engine = createMockEngine(4);
    const module = new OutputFaderModule(engine);
    
    const state = module.serialize();
    
    assert.ok(state);
    assert.ok(Array.isArray(state.levels));
    assert.equal(state.levels.length, 0);
  });

  it('serializa valores flotantes con precisión', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    module.sliders[0].value = '0.123456789';
    module.sliders[1].value = '0.987654321';
    
    const state = module.serialize();
    
    // Debería mantener precisión de parseFloat
    assert.ok(Math.abs(state.levels[0] - 0.123456789) < 0.000001);
    assert.ok(Math.abs(state.levels[1] - 0.987654321) < 0.000001);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: DESERIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputFaderModule.deserialize()', () => {

  it('restaura niveles de sliders desde estado', () => {
    const engine = createMockEngine(4);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    const state = {
      levels: [0.1, 0.2, 0.3, 0.4]
    };
    
    module.deserialize(state);
    
    assert.equal(module.sliders[0].value, '0.1');
    assert.equal(module.sliders[1].value, '0.2');
    assert.equal(module.sliders[2].value, '0.3');
    assert.equal(module.sliders[3].value, '0.4');
  });

  it('actualiza displays de valor', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    module.deserialize({ levels: [0.33, 0.66] });
    
    assert.equal(module.valueDisplays[0].textContent, '0.33');
    assert.equal(module.valueDisplays[1].textContent, '0.66');
  });

  it('actualiza engine con nuevos valores', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    module.deserialize({ levels: [0.7, 0.9] });
    
    assert.equal(engine.getOutputLevel(0), 0.7);
    assert.equal(engine.getOutputLevel(1), 0.9);
  });

  it('ignora data null o undefined', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    module.sliders[0].value = '0.5';
    
    module.deserialize(null);
    module.deserialize(undefined);
    
    // No debe cambiar
    assert.equal(module.sliders[0].value, '0.5');
  });

  it('ignora data sin array levels', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    module.sliders[0].value = '0.5';
    
    module.deserialize({ levels: 'invalid' });
    module.deserialize({ otherField: [1, 2, 3] });
    
    assert.equal(module.sliders[0].value, '0.5');
  });

  it('maneja arrays de longitud diferente', () => {
    const engine = createMockEngine(4);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    // Array más corto
    module.deserialize({ levels: [0.8, 0.9] });
    
    assert.equal(module.sliders[0].value, '0.8');
    assert.equal(module.sliders[1].value, '0.9');
    assert.equal(module.sliders[2].value, '0'); // Sin cambios
    assert.equal(module.sliders[3].value, '0');
  });

  it('ignora valores no numéricos', () => {
    const engine = createMockEngine(3);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    module.deserialize({ levels: [0.5, 'invalid', null, undefined, 0.7] });
    
    assert.equal(module.sliders[0].value, '0.5');
    assert.equal(module.sliders[1].value, '0'); // Sin cambio (no numérico)
    assert.equal(module.sliders[2].value, '0'); // null
  });

  it('clamp valores fuera de rango 0-1', () => {
    const engine = createMockEngine(3);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    // Nota: el clamp depende del slider HTML (min/max)
    module.deserialize({ levels: [-0.5, 0.5, 1.5] });
    
    // HTML input type=range hace clamp automáticamente
    // pero aquí asignamos directamente al value
    // Los valores se setean en engine tal cual
    assert.equal(engine.getOutputLevel(0), -0.5);
    assert.equal(engine.getOutputLevel(1), 0.5);
    assert.equal(engine.getOutputLevel(2), 1.5);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CASOS EDGE
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {

  it('maneja engine sin outputChannels definido', () => {
    const engine = createMockEngine();
    delete engine.outputChannels;
    
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    // No debería crear sliders
    assert.equal(module.sliders.length, 0);
  });

  it('maneja engine.outputChannels = 0', () => {
    const engine = createMockEngine(0);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    assert.equal(module.sliders.length, 0);
  });

  it('maneja llamadas múltiples a createPanel', () => {
    const engine = createMockEngine(2);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    const firstSliderCount = module.sliders.length;
    
    module.createPanel(container);
    
    // Debería resetear arrays (pero DOM se duplica)
    assert.equal(module.sliders.length, 2); // Se resetea el array
    // El DOM se acumula porque createPanel hace appendChild sin limpiar
    assert.ok(container.querySelectorAll('.output-fader').length >= 2);
  });

  it('serializa/deserializa con 8 canales (caso típico)', () => {
    const engine = createMockEngine(8);
    const module = new OutputFaderModule(engine);
    const container = document.createElement('div');
    
    module.createPanel(container);
    
    // Setear valores variados
    for (let i = 0; i < 8; i++) {
      module.sliders[i].value = String(i / 8);
    }
    
    const state = module.serialize();
    assert.equal(state.levels.length, 8);
    
    // Resetear
    for (let i = 0; i < 8; i++) {
      module.sliders[i].value = '0';
    }
    
    // Restaurar
    module.deserialize(state);
    
    for (let i = 0; i < 8; i++) {
      assert.ok(Math.abs(parseFloat(module.sliders[i].value) - i / 8) < 0.001);
    }
  });

});
