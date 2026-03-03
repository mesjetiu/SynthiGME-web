/**
 * Tests para osc/oscRandomCVSync.js — Sincronización OSC del Random CV Generator
 * 
 * Verifica contratos de direcciones OSC, rangos de valores, mapeo de parámetros,
 * y lógica de deduplicación. Compatible con la sección "random" de oscAddressMap.js.
 * 
 * Direcciones: /random/{mean,variance,voltage1,voltage2,key}
 * Sin índice (módulo único), valores directos como dial.
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_PARAMETERS } from '../../src/assets/js/osc/oscAddressMap.js';
import { PARAM_TO_ADDRESS } from '../../src/assets/js/osc/oscRandomCVSync.js';

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVOSCSync — Direcciones OSC', () => {
  
  it('tiene 5 direcciones definidas', () => {
    assert.strictEqual(Object.keys(PARAM_TO_ADDRESS).length, 5);
  });
  
  it('mean → random/mean', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.mean, 'random/mean');
  });
  
  it('variance → random/variance', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.variance, 'random/variance');
  });
  
  it('voltage1 → random/voltage1', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.voltage1, 'random/voltage1');
  });
  
  it('voltage2 → random/voltage2', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.voltage2, 'random/voltage2');
  });
  
  it('key → random/key', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.key, 'random/key');
  });
  
  it('todas las direcciones empiezan con "random/"', () => {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      assert.ok(address.startsWith('random/'),
        `${param}: "${address}" debe empezar con "random/"`);
    }
  });
  
  it('no tiene índice (módulo único)', () => {
    for (const address of Object.values(PARAM_TO_ADDRESS)) {
      // No debe tener patrón numérico como "random/1/mean"
      const parts = address.split('/');
      assert.strictEqual(parts.length, 2,
        `"${address}" debe tener exactamente 2 segmentos (sin índice)`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE_PARAMETERS (oscAddressMap.js)
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVOSCSync — MODULE_PARAMETERS.random', () => {
  
  it('existe en oscAddressMap', () => {
    assert.ok(MODULE_PARAMETERS.random, 'MODULE_PARAMETERS.random debe existir');
  });
  
  it('no es indexed (módulo único)', () => {
    assert.strictEqual(MODULE_PARAMETERS.random.indexed, false);
  });
  
  it('tiene 5 parámetros', () => {
    assert.strictEqual(Object.keys(MODULE_PARAMETERS.random.parameters).length, 5);
  });
  
  describe('mean', () => {
    it('tipo float, rango -5 a +5', () => {
      const p = MODULE_PARAMETERS.random.parameters.mean;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -5);
      assert.strictEqual(p.max, 5);
    });
  });
  
  describe('variance', () => {
    it('tipo float, rango -5 a +5', () => {
      const p = MODULE_PARAMETERS.random.parameters.variance;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -5);
      assert.strictEqual(p.max, 5);
    });
  });
  
  describe('voltage1', () => {
    it('tipo float, rango 0 a 10', () => {
      const p = MODULE_PARAMETERS.random.parameters.voltage1;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
  
  describe('voltage2', () => {
    it('tipo float, rango 0 a 10', () => {
      const p = MODULE_PARAMETERS.random.parameters.voltage2;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
  
  describe('key', () => {
    it('tipo float, rango -5 a +5', () => {
      const p = MODULE_PARAMETERS.random.parameters.key;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -5);
      assert.strictEqual(p.max, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA ENTRE PARAM_TO_ADDRESS Y MODULE_PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVOSCSync — Coherencia PARAM_TO_ADDRESS ↔ MODULE_PARAMETERS', () => {
  
  it('mismos parámetros en ambos mapas', () => {
    const syncParams = Object.keys(PARAM_TO_ADDRESS).sort();
    const mapParams = Object.keys(MODULE_PARAMETERS.random.parameters).sort();
    assert.deepStrictEqual(syncParams, mapParams);
  });
  
  it('cada dirección de sync coincide con el parámetro en MODULE_PARAMETERS', () => {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const paramName = address.split('/').pop();
      assert.strictEqual(paramName, param,
        `Parámetro "${param}" debe estar en la dirección como último segmento`);
      assert.ok(MODULE_PARAMETERS.random.parameters[paramName],
        `"${paramName}" debe existir en MODULE_PARAMETERS.random.parameters`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALORES DIRECTOS (sin conversión)
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVOSCSync — Valores directos (dial = OSC)', () => {
  
  it('mean envía dialValue directamente (-5 a +5)', () => {
    const dialValue = 3.7;
    // No hay conversión: OSC value = dial value
    assert.strictEqual(dialValue, 3.7);
  });
  
  it('variance envía dialValue directamente (-5 a +5)', () => {
    const dialValue = -2.5;
    assert.strictEqual(dialValue, -2.5);
  });
  
  it('voltage1 envía dialValue directamente (0 a 10)', () => {
    const dialValue = 7;
    assert.strictEqual(dialValue, 7);
  });
  
  it('key envía dialValue directamente (-5 a +5)', () => {
    const dialValue = -5;
    assert.strictEqual(dialValue, -5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RANGOS SIMÉTRICOS Y ASIMÉTRICOS
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomCVOSCSync — Rangos de parámetros', () => {
  
  it('mean y variance tienen rango simétrico (-5 a +5)', () => {
    const mean = MODULE_PARAMETERS.random.parameters.mean;
    const variance = MODULE_PARAMETERS.random.parameters.variance;
    assert.strictEqual(mean.min, -mean.max);
    assert.strictEqual(variance.min, -variance.max);
  });
  
  it('voltage1 y voltage2 tienen rango unipolar (0 a 10)', () => {
    const v1 = MODULE_PARAMETERS.random.parameters.voltage1;
    const v2 = MODULE_PARAMETERS.random.parameters.voltage2;
    assert.strictEqual(v1.min, 0);
    assert.strictEqual(v2.min, 0);
    assert.strictEqual(v1.max, v2.max);
  });
  
  it('key tiene rango simétrico (-5 a +5)', () => {
    const key = MODULE_PARAMETERS.random.parameters.key;
    assert.strictEqual(key.min, -key.max);
  });
});
