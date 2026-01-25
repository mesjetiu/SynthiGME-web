/**
 * Tests para state/index.js (versión v2 - UI values)
 * 
 * El sistema de patches v2 guarda valores de UI (0-1), no valores de audio.
 * La serialización real se hace en app.js llamando ui.serialize().
 * 
 * Este archivo testea:
 * - Funciones de schema (createEmptyPatch, validatePatch)
 * - FORMAT_VERSION
 * - Re-exports correctos
 */

import { describe, it } from 'node:test';
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
  FORMAT_VERSION,
  MODULE_IDS,
  createEmptyPatch,
  validatePatch,
  knobToPhysical,
  physicalToKnob,
  dialToFrequency,
  frequencyToDial
} from '../../src/assets/js/state/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// TESTS - SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMAT_VERSION', () => {
  it('es versión 2 (UI values)', () => {
    assert.equal(FORMAT_VERSION, 2);
  });
});

describe('MODULE_IDS', () => {
  it('tiene IDs de osciladores', () => {
    assert.ok(Array.isArray(MODULE_IDS.oscillators));
    assert.equal(MODULE_IDS.oscillators.length, 12);
    assert.equal(MODULE_IDS.oscillators[0], 'osc1');
  });

  it('tiene IDs de noise', () => {
    assert.ok(Array.isArray(MODULE_IDS.noise));
    assert.equal(MODULE_IDS.noise.length, 2);
  });

  it('tiene IDs de input amplifiers', () => {
    assert.ok(Array.isArray(MODULE_IDS.inputAmplifiers));
    assert.equal(MODULE_IDS.inputAmplifiers.length, 8);
  });
});

describe('createEmptyPatch()', () => {
  it('retorna estructura de patch válida', () => {
    const patch = createEmptyPatch('Test');
    
    assert.equal(patch.name, 'Test');
    assert.equal(patch.formatVersion, FORMAT_VERSION);
    assert.ok(patch.modules);
    assert.ok(patch.matrix);
    assert.ok(patch.routing);
  });

  it('usa nombre por defecto "Init"', () => {
    const patch = createEmptyPatch();
    assert.equal(patch.name, 'Init');
  });

  it('incluye timestamp', () => {
    const patch = createEmptyPatch('Test');
    assert.ok(patch.savedAt);
    // Verificar que es ISO string válido
    const date = new Date(patch.savedAt);
    assert.ok(!isNaN(date.getTime()));
  });

  it('inicializa matriz vacía', () => {
    const patch = createEmptyPatch('Test');
    assert.deepEqual(patch.matrix.audio, []);
    assert.deepEqual(patch.matrix.control, []);
  });
});

describe('validatePatch()', () => {
  it('rechaza null', () => {
    const result = validatePatch(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rechaza objetos sin formatVersion', () => {
    const result = validatePatch({ name: 'Test' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('formatVersion')));
  });

  it('acepta patch válido', () => {
    const patch = createEmptyPatch('Valid');
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('acepta patch con módulos vacíos', () => {
    const patch = createEmptyPatch('Empty');
    patch.modules = {};
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS - CONVERSIONES (disponibles pero no usadas en patches)
// ═══════════════════════════════════════════════════════════════════════════

describe('Conversiones (para displays, no para patches)', () => {
  it('knobToPhysical es exportada', () => {
    assert.equal(typeof knobToPhysical, 'function');
  });

  it('physicalToKnob es exportada', () => {
    assert.equal(typeof physicalToKnob, 'function');
  });

  it('dialToFrequency es exportada', () => {
    assert.equal(typeof dialToFrequency, 'function');
  });

  it('frequencyToDial es exportada', () => {
    assert.equal(typeof frequencyToDial, 'function');
  });

  it('knobToPhysical convierte correctamente (linear)', () => {
    const config = { min: 0, max: 100, curve: 'linear' };
    assert.equal(knobToPhysical(0, config), 0);
    assert.equal(knobToPhysical(1, config), 100);
    assert.equal(knobToPhysical(0.5, config), 50);
  });

  it('physicalToKnob invierte correctamente', () => {
    const config = { min: 0, max: 100, curve: 'linear' };
    assert.equal(physicalToKnob(0, config), 0);
    assert.equal(physicalToKnob(100, config), 1);
    assert.equal(physicalToKnob(50, config), 0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS - FORMATO DE PATCH v2 (UI values)
// ═══════════════════════════════════════════════════════════════════════════

describe('Patch Format v2 (UI values)', () => {
  it('osciladores usan formato knob array', () => {
    // El formato v2 guarda array de knob values [0-1]
    const patch = createEmptyPatch('Test');
    
    // Simular datos de oscilador en formato v2
    patch.modules.oscillators = {
      'panel3-osc-1': {
        knobs: [0, 0.5, 0, 0.5, 0, 0, 0.5],  // Valores UI 0-1
        rangeState: 'hi'
      }
    };
    
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
    
    // Verificar estructura
    const oscState = patch.modules.oscillators['panel3-osc-1'];
    assert.ok(Array.isArray(oscState.knobs));
    assert.equal(oscState.knobs.length, 7);
    assert.ok(oscState.knobs.every(v => v >= 0 && v <= 1));
  });

  it('noise usa formato objeto clave-valor', () => {
    const patch = createEmptyPatch('Test');
    
    patch.modules.noise = {
      'panel3-noise-1': {
        colour: 0.3,  // Valor UI 0-1
        level: 0.7    // Valor UI 0-1
      }
    };
    
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
    
    const noiseState = patch.modules.noise['panel3-noise-1'];
    assert.ok(noiseState.colour >= 0 && noiseState.colour <= 1);
    assert.ok(noiseState.level >= 0 && noiseState.level <= 1);
  });

  it('matriz guarda coordenadas con color opcional', () => {
    const patch = createEmptyPatch('Test');
    
    // Formato: [row, col] o [row, col, pinColor]
    patch.modules.matrixAudio = {
      connections: [
        [0, 5],           // Sin color
        [3, 12, 'GREEN']  // Con color
      ]
    };
    
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
    
    const conn = patch.modules.matrixAudio.connections;
    assert.equal(conn[0].length, 2);
    assert.equal(conn[1].length, 3);
    assert.equal(conn[1][2], 'GREEN');
  });
});
