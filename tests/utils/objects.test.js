/**
 * Tests para utils/objects.js
 * 
 * Verifica:
 * - deepMerge(): fusión recursiva de objetos
 * - Arrays se reemplazan (no concatenan)
 * - No muta objetos originales
 * - Manejo de valores null/undefined
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deepMerge } from '../../src/assets/js/utils/objects.js';

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - casos básicos
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - casos básicos', () => {

  it('fusiona objetos planos', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result, { a: 1, b: 3, c: 4 });
  });

  it('source vacío devuelve copia del target', () => {
    const target = { a: 1, b: 2 };
    const result = deepMerge(target, {});
    
    assert.deepEqual(result, { a: 1, b: 2 });
  });

  it('target vacío devuelve copia del source', () => {
    const source = { a: 1, b: 2 };
    const result = deepMerge({}, source);
    
    assert.deepEqual(result, { a: 1, b: 2 });
  });

  it('ambos vacíos devuelve objeto vacío', () => {
    const result = deepMerge({}, {});
    
    assert.deepEqual(result, {});
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - fusión recursiva
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - fusión recursiva', () => {

  it('fusiona objetos anidados', () => {
    const target = { 
      level1: { a: 1, b: 2 } 
    };
    const source = { 
      level1: { b: 3, c: 4 } 
    };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result, { 
      level1: { a: 1, b: 3, c: 4 } 
    });
  });

  it('fusiona múltiples niveles de profundidad', () => {
    const target = { 
      l1: { 
        l2: { 
          a: 1, b: 2 
        } 
      } 
    };
    const source = { 
      l1: { 
        l2: { 
          b: 3, c: 4 
        },
        l2b: { x: 10 }
      } 
    };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result, { 
      l1: { 
        l2: { a: 1, b: 3, c: 4 },
        l2b: { x: 10 }
      } 
    });
  });

  it('crea ramas nuevas si no existen en target', () => {
    const target = { existing: { a: 1 } };
    const source = { newBranch: { x: 10, y: 20 } };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result, { 
      existing: { a: 1 },
      newBranch: { x: 10, y: 20 }
    });
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - arrays
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - arrays', () => {

  it('arrays se reemplazan, no se concatenan', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result.items, [4, 5]);
  });

  it('array vacío reemplaza array existente', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [] };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result.items, []);
  });

  it('array con objetos se reemplaza completo', () => {
    const target = { items: [{ a: 1 }, { b: 2 }] };
    const source = { items: [{ c: 3 }] };
    const result = deepMerge(target, source);
    
    assert.deepEqual(result.items, [{ c: 3 }]);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - inmutabilidad
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - inmutabilidad', () => {

  it('no muta el target', () => {
    const target = { a: 1, nested: { b: 2 } };
    const targetCopy = JSON.parse(JSON.stringify(target));
    
    deepMerge(target, { a: 99, nested: { c: 3 } });
    
    assert.deepEqual(target, targetCopy);
  });

  it('no muta el source', () => {
    const source = { a: 1, nested: { b: 2 } };
    const sourceCopy = JSON.parse(JSON.stringify(source));
    
    deepMerge({ x: 10 }, source);
    
    assert.deepEqual(source, sourceCopy);
  });

  it('resultado es un nuevo objeto', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const result = deepMerge(target, source);
    
    assert.notEqual(result, target);
    assert.notEqual(result, source);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - valores especiales
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - valores especiales', () => {

  it('null en source sobrescribe valor en target', () => {
    const target = { a: { b: 1 } };
    const source = { a: null };
    const result = deepMerge(target, source);
    
    assert.equal(result.a, null);
  });

  it('undefined en source sobrescribe valor en target', () => {
    const target = { a: 1 };
    const source = { a: undefined };
    const result = deepMerge(target, source);
    
    assert.equal(result.a, undefined);
  });

  it('string sobrescribe objeto', () => {
    const target = { config: { nested: true } };
    const source = { config: 'simple' };
    const result = deepMerge(target, source);
    
    assert.equal(result.config, 'simple');
  });

  it('número sobrescribe objeto', () => {
    const target = { value: { complex: true } };
    const source = { value: 42 };
    const result = deepMerge(target, source);
    
    assert.equal(result.value, 42);
  });

  it('booleano sobrescribe objeto', () => {
    const target = { flag: { nested: 'value' } };
    const source = { flag: false };
    const result = deepMerge(target, source);
    
    assert.equal(result.flag, false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// deepMerge - casos de uso reales
// ═══════════════════════════════════════════════════════════════════════════

describe('deepMerge - casos de uso reales', () => {

  it('merge de configuración de módulo con defaults', () => {
    const defaults = {
      frequency: { min: 1, max: 10000, curve: 'quadratic' },
      pulseWidth: { min: 0.01, max: 0.99, curve: 'linear' },
      level: { min: 0, max: 1 }
    };
    const override = {
      frequency: { max: 5000 },
      newParam: { custom: true }
    };
    
    const result = deepMerge(defaults, override);
    
    // Override parcial funciona
    assert.equal(result.frequency.min, 1);
    assert.equal(result.frequency.max, 5000);
    assert.equal(result.frequency.curve, 'quadratic');
    
    // Valores no tocados se preservan
    assert.deepEqual(result.pulseWidth, { min: 0.01, max: 0.99, curve: 'linear' });
    
    // Nuevos valores se añaden
    assert.deepEqual(result.newParam, { custom: true });
  });

  it('merge de estado de patch parcial', () => {
    const currentState = {
      oscillators: {
        osc1: { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' },
        osc2: { knobs: [1, 0.3, 0, 0.5, 0, 0, 0.5], rangeState: 'lo' }
      },
      noise: { noise1: { colour: 0.5 } }
    };
    const update = {
      oscillators: {
        osc1: { rangeState: 'lo' }
      }
    };
    
    const result = deepMerge(currentState, update);
    
    // Update parcial funciona
    assert.equal(result.oscillators.osc1.rangeState, 'lo');
    assert.deepEqual(result.oscillators.osc1.knobs, [0, 0.5, 0, 0.5, 0, 0, 0]);
    
    // Otros osciladores no tocados
    assert.deepEqual(result.oscillators.osc2, currentState.oscillators.osc2);
    
    // Otras secciones no tocadas
    assert.deepEqual(result.noise, currentState.noise);
  });

});
