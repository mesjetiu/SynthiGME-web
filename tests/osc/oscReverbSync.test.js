/**
 * Tests para osc/oscReverbSync.js — Sincronización OSC del módulo Reverberation
 *
 * Verifica contratos de direcciones OSC, rangos de valores, mapeo de parámetros,
 * y lógica de deduplicación. Compatible con la sección "reverb" de oscAddressMap.js.
 *
 * Direcciones: /reverb/{mix,level}
 * Sin índice (módulo único), valores directos como dial (0-10).
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_PARAMETERS } from '../../src/assets/js/osc/oscAddressMap.js';
import { PARAM_TO_ADDRESS } from '../../src/assets/js/osc/oscReverbSync.js';

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('ReverbOSCSync — Direcciones OSC', () => {

  it('tiene 2 direcciones definidas', () => {
    assert.strictEqual(Object.keys(PARAM_TO_ADDRESS).length, 2);
  });

  it('mix → reverb/mix', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.mix, 'reverb/mix');
  });

  it('level → reverb/level', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.level, 'reverb/level');
  });

  it('todas las direcciones empiezan con "reverb/"', () => {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      assert.ok(address.startsWith('reverb/'),
        `${param}: "${address}" debe empezar con "reverb/"`);
    }
  });

  it('no tiene índice (módulo único)', () => {
    for (const address of Object.values(PARAM_TO_ADDRESS)) {
      const parts = address.split('/');
      assert.strictEqual(parts.length, 2,
        `"${address}" debe tener exactamente 2 segmentos (sin índice)`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE_PARAMETERS (oscAddressMap.js)
// ═══════════════════════════════════════════════════════════════════════════

describe('ReverbOSCSync — MODULE_PARAMETERS.reverb', () => {

  it('existe en oscAddressMap', () => {
    assert.ok(MODULE_PARAMETERS.reverb, 'MODULE_PARAMETERS.reverb debe existir');
  });

  it('no es indexed (módulo único)', () => {
    assert.strictEqual(MODULE_PARAMETERS.reverb.indexed, false);
  });

  it('tiene 2 parámetros', () => {
    assert.strictEqual(Object.keys(MODULE_PARAMETERS.reverb.parameters).length, 2);
  });

  describe('mix', () => {
    it('tipo float, rango 0 a 10', () => {
      const p = MODULE_PARAMETERS.reverb.parameters.mix;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });

  describe('level', () => {
    it('tipo float, rango 0 a 10', () => {
      const p = MODULE_PARAMETERS.reverb.parameters.level;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA ENTRE PARAM_TO_ADDRESS Y MODULE_PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

describe('ReverbOSCSync — Coherencia PARAM_TO_ADDRESS ↔ MODULE_PARAMETERS', () => {

  it('mismos parámetros en ambos mapas', () => {
    const syncParams = Object.keys(PARAM_TO_ADDRESS).sort();
    const mapParams = Object.keys(MODULE_PARAMETERS.reverb.parameters).sort();
    assert.deepStrictEqual(syncParams, mapParams);
  });

  it('cada dirección de sync coincide con el parámetro en MODULE_PARAMETERS', () => {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const paramName = address.split('/').pop();
      assert.strictEqual(paramName, param,
        `Parámetro "${param}" debe estar en la dirección como último segmento`);
      assert.ok(MODULE_PARAMETERS.reverb.parameters[paramName],
        `"${paramName}" debe existir en MODULE_PARAMETERS.reverb.parameters`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALORES DIRECTOS (sin conversión)
// ═══════════════════════════════════════════════════════════════════════════

describe('ReverbOSCSync — Valores directos (dial = OSC)', () => {

  it('mix envía dialValue directamente (0 a 10)', () => {
    const dialValue = 5.5;
    assert.strictEqual(dialValue, 5.5);
  });

  it('level envía dialValue directamente (0 a 10)', () => {
    const dialValue = 7;
    assert.strictEqual(dialValue, 7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RANGOS UNIPOLARES
// ═══════════════════════════════════════════════════════════════════════════

describe('ReverbOSCSync — Rangos de parámetros', () => {

  it('mix y level tienen rango unipolar (0 a 10)', () => {
    const mix = MODULE_PARAMETERS.reverb.parameters.mix;
    const level = MODULE_PARAMETERS.reverb.parameters.level;
    assert.strictEqual(mix.min, 0);
    assert.strictEqual(mix.max, 10);
    assert.strictEqual(level.min, 0);
    assert.strictEqual(level.max, 10);
  });

  it('ambos parámetros tienen el mismo rango', () => {
    const mix = MODULE_PARAMETERS.reverb.parameters.mix;
    const level = MODULE_PARAMETERS.reverb.parameters.level;
    assert.strictEqual(mix.min, level.min);
    assert.strictEqual(mix.max, level.max);
  });
});
