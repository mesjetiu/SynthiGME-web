/**
 * Tests para state/schema.js
 * 
 * Verifica:
 * - Constantes (FORMAT_VERSION, MODULE_IDS, PARAM_DESCRIPTORS)
 * - createEmptyPatch(): estructura correcta
 * - createDefaultPatch(): módulos con valores por defecto
 * - validatePatch(): detección de errores
 * - validateSerializedData(): validación contra schemas
 * - getParamDescriptor(): lookup de descriptores
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Mock de window para Node.js (schema.js usa window.__synthBuildVersion)
before(() => {
  globalThis.window = { __synthBuildVersion: 'test' };
});

import {
  FORMAT_VERSION,
  MODULE_IDS,
  PARAM_DESCRIPTORS,
  SERIALIZATION_SCHEMAS,
  createEmptyPatch,
  createDefaultPatch,
  validatePatch,
  validateSerializedData,
  getParamDescriptor
} from '../../src/assets/js/state/schema.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

describe('FORMAT_VERSION', () => {

  it('es un número positivo', () => {
    assert.ok(typeof FORMAT_VERSION === 'number');
    assert.ok(FORMAT_VERSION >= 1);
  });

});

describe('MODULE_IDS', () => {

  it('tiene 12 osciladores', () => {
    assert.equal(MODULE_IDS.oscillators.length, 12);
  });

  it('tiene 2 generadores de ruido', () => {
    assert.equal(MODULE_IDS.noise.length, 2);
  });

  it('tiene 2 random voltage', () => {
    assert.equal(MODULE_IDS.randomVoltage.length, 2);
  });

  it('tiene 8 input amplifiers', () => {
    assert.equal(MODULE_IDS.inputAmplifiers.length, 8);
  });

  it('tiene 4 output faders', () => {
    assert.equal(MODULE_IDS.outputFaders.length, 4);
  });

  it('tiene 1 osciloscopio', () => {
    assert.equal(MODULE_IDS.oscilloscope.length, 1);
  });

});

describe('PARAM_DESCRIPTORS', () => {

  it('tiene descriptores para oscillator', () => {
    assert.ok(PARAM_DESCRIPTORS.oscillator);
    assert.ok(PARAM_DESCRIPTORS.oscillator.frequency);
    assert.ok(PARAM_DESCRIPTORS.oscillator.pulseLevel);
  });

  it('tiene descriptores para noise', () => {
    assert.ok(PARAM_DESCRIPTORS.noise);
    assert.ok(PARAM_DESCRIPTORS.noise.colour);
    assert.ok(PARAM_DESCRIPTORS.noise.level);
  });

  it('tiene descriptores para inputAmplifier', () => {
    assert.ok(PARAM_DESCRIPTORS.inputAmplifier);
    assert.ok(PARAM_DESCRIPTORS.inputAmplifier.level);
  });

  it('tiene descriptores para outputFader', () => {
    assert.ok(PARAM_DESCRIPTORS.outputFader);
    assert.ok(PARAM_DESCRIPTORS.outputFader.levelLeft);
    assert.ok(PARAM_DESCRIPTORS.outputFader.pan);
  });

  it('tiene descriptores para oscilloscope', () => {
    assert.ok(PARAM_DESCRIPTORS.oscilloscope);
    assert.ok(PARAM_DESCRIPTORS.oscilloscope.mode);
    assert.equal(PARAM_DESCRIPTORS.oscilloscope.mode.type, 'enum');
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// createEmptyPatch
// ═══════════════════════════════════════════════════════════════════════════

describe('createEmptyPatch', () => {

  it('genera patch con formatVersion actual', () => {
    const patch = createEmptyPatch();
    assert.equal(patch.formatVersion, FORMAT_VERSION);
  });

  it('usa nombre por defecto "Init"', () => {
    const patch = createEmptyPatch();
    assert.equal(patch.name, 'Init');
  });

  it('permite nombre personalizado', () => {
    const patch = createEmptyPatch('My Patch');
    assert.equal(patch.name, 'My Patch');
  });

  it('incluye savedAt como ISO string', () => {
    const patch = createEmptyPatch();
    assert.ok(typeof patch.savedAt === 'string');
    assert.ok(patch.savedAt.includes('T')); // ISO format
  });

  it('incluye objeto modules vacío', () => {
    const patch = createEmptyPatch();
    assert.ok(typeof patch.modules === 'object');
  });

  it('incluye estructura de matrix', () => {
    const patch = createEmptyPatch();
    assert.ok(Array.isArray(patch.matrix.audio));
    assert.ok(Array.isArray(patch.matrix.control));
  });

  it('incluye estructura de routing', () => {
    const patch = createEmptyPatch();
    assert.ok(typeof patch.routing === 'object');
    assert.ok(typeof patch.routing.outputs === 'object');
    assert.ok(typeof patch.routing.inputs === 'object');
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// createDefaultPatch
// ═══════════════════════════════════════════════════════════════════════════

describe('createDefaultPatch', () => {

  it('genera patch con formatVersion actual', () => {
    const patch = createDefaultPatch();
    assert.equal(patch.formatVersion, FORMAT_VERSION);
  });

  it('incluye 12 osciladores con valores por defecto', () => {
    const patch = createDefaultPatch();
    const oscs = patch.modules.oscillators;
    assert.equal(Object.keys(oscs).length, 12);
    
    // Verificar estructura de un oscilador
    const osc1 = oscs.osc1;
    assert.ok(Array.isArray(osc1.knobs));
    assert.equal(osc1.knobs.length, 7);
    assert.equal(osc1.rangeState, 'hi');
  });

  it('incluye 2 generadores de ruido', () => {
    const patch = createDefaultPatch();
    const noise = patch.modules.noise;
    assert.equal(Object.keys(noise).length, 2);
    assert.ok('noise1' in noise);
    assert.ok('noise2' in noise);
  });

  it('incluye 2 random voltage', () => {
    const patch = createDefaultPatch();
    const rv = patch.modules.randomVoltage;
    assert.equal(Object.keys(rv).length, 2);
    assert.ok('random1' in rv);
  });

  it('incluye input amplifiers con 8 niveles', () => {
    const patch = createDefaultPatch();
    const inputs = patch.modules.inputAmplifiers['input-amplifiers'];
    assert.ok(Array.isArray(inputs.levels));
    assert.equal(inputs.levels.length, 8);
  });

  it('incluye output faders con 8 niveles', () => {
    const patch = createDefaultPatch();
    const outputs = patch.modules.outputFaders;
    assert.ok(Array.isArray(outputs.levels));
    assert.equal(outputs.levels.length, 8);
  });

  it('matrices vacías por defecto', () => {
    const patch = createDefaultPatch();
    assert.deepEqual(patch.modules.matrixAudio.connections, []);
    assert.deepEqual(patch.modules.matrixControl.connections, []);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// validatePatch
// ═══════════════════════════════════════════════════════════════════════════

describe('validatePatch', () => {

  it('patch válido pasa validación', () => {
    const patch = createEmptyPatch();
    const result = validatePatch(patch);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('null no es válido', () => {
    const result = validatePatch(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('Patch is not an object'));
  });

  it('undefined no es válido', () => {
    const result = validatePatch(undefined);
    assert.equal(result.valid, false);
  });

  it('string no es válido', () => {
    const result = validatePatch('not a patch');
    assert.equal(result.valid, false);
  });

  it('falta formatVersion', () => {
    const patch = { name: 'Test', modules: {}, matrix: {} };
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('formatVersion')));
  });

  it('formatVersion futuro no es válido', () => {
    const patch = createEmptyPatch();
    patch.formatVersion = FORMAT_VERSION + 100;
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('newer than supported')));
  });

  it('falta name', () => {
    const patch = { formatVersion: 1, modules: {}, matrix: {} };
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('name vacío no es válido', () => {
    const patch = { formatVersion: 1, name: '   ', modules: {}, matrix: {} };
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
  });

  it('falta modules', () => {
    const patch = { formatVersion: 1, name: 'Test', matrix: {} };
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('modules')));
  });

  it('falta matrix', () => {
    const patch = { formatVersion: 1, name: 'Test', modules: {} };
    const result = validatePatch(patch);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('matrix')));
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// validateSerializedData
// ═══════════════════════════════════════════════════════════════════════════

describe('validateSerializedData', () => {

  describe('validación de tipo number', () => {
    const schema = {
      value: { type: 'number', range: [0, 1] }
    };

    it('número válido pasa', () => {
      const result = validateSerializedData({ value: 0.5 }, schema);
      assert.equal(result.valid, true);
    });

    it('string no es válido', () => {
      const result = validateSerializedData({ value: '0.5' }, schema);
      assert.equal(result.valid, false);
    });

    it('NaN no es válido', () => {
      const result = validateSerializedData({ value: NaN }, schema);
      assert.equal(result.valid, false);
    });

    it('fuera de rango no es válido', () => {
      const result = validateSerializedData({ value: 1.5 }, schema);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('out of range')));
    });
  });

  describe('validación de tipo array', () => {
    const schema = {
      items: { type: 'array', length: 3 }
    };

    it('array con longitud correcta pasa', () => {
      const result = validateSerializedData({ items: [1, 2, 3] }, schema);
      assert.equal(result.valid, true);
    });

    it('longitud incorrecta falla', () => {
      const result = validateSerializedData({ items: [1, 2] }, schema);
      assert.equal(result.valid, false);
    });

    it('no-array falla', () => {
      const result = validateSerializedData({ items: 'not array' }, schema);
      assert.equal(result.valid, false);
    });
  });

  describe('validación de tipo enum', () => {
    const schema = {
      mode: { type: 'enum', values: ['yt', 'xy'] }
    };

    it('valor válido pasa', () => {
      const result = validateSerializedData({ mode: 'xy' }, schema);
      assert.equal(result.valid, true);
    });

    it('valor inválido falla', () => {
      const result = validateSerializedData({ mode: 'invalid' }, schema);
      assert.equal(result.valid, false);
    });
  });

  describe('validación de required', () => {
    const schema = {
      required: { type: 'number', required: true },
      optional: { type: 'number' }
    };

    it('campo requerido faltante falla', () => {
      const result = validateSerializedData({ optional: 1 }, schema);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('required')));
    });

    it('campo opcional faltante pasa', () => {
      const result = validateSerializedData({ required: 1 }, schema);
      assert.equal(result.valid, true);
    });
  });

  describe('SERIALIZATION_SCHEMAS predefinidos', () => {

    it('oscillator schema valida estado correcto', () => {
      const data = { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' };
      const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.oscillator);
      assert.equal(result.valid, true);
    });

    it('oscillator schema rechaza knobs de longitud incorrecta', () => {
      const data = { knobs: [0, 0.5], rangeState: 'hi' };
      const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.oscillator);
      assert.equal(result.valid, false);
    });

    it('oscillator schema rechaza rangeState inválido', () => {
      const data = { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'mid' };
      const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.oscillator);
      assert.equal(result.valid, false);
    });

    it('levels schema valida estado correcto', () => {
      const data = { levels: [0, 0.5, 0.3, 0, 0, 0, 0, 0] };
      const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.levels);
      assert.equal(result.valid, true);
    });

    it('matrix schema valida estado correcto', () => {
      const data = { connections: [[0, 5], [3, 12]] };
      const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.matrix);
      assert.equal(result.valid, true);
    });

  });

});

// ═══════════════════════════════════════════════════════════════════════════
// getParamDescriptor
// ═══════════════════════════════════════════════════════════════════════════

describe('getParamDescriptor', () => {

  it('devuelve descriptor para oscillator.frequency', () => {
    const desc = getParamDescriptor('oscillator', 'frequency');
    assert.ok(desc);
    assert.equal(desc.unit, 'Hz');
  });

  it('devuelve descriptor para noise.colour', () => {
    const desc = getParamDescriptor('noise', 'colour');
    assert.ok(desc);
    assert.deepEqual(desc.range, [0, 1]);
  });

  it('devuelve null para módulo inexistente', () => {
    const desc = getParamDescriptor('nonexistent', 'param');
    assert.equal(desc, null);
  });

  it('devuelve null para parámetro inexistente', () => {
    const desc = getParamDescriptor('oscillator', 'nonexistent');
    assert.equal(desc, null);
  });

});
