/**
 * Tests para osc/oscPitchToVoltageConverterSync.js — Sincronización OSC del PVC
 *
 * Verifica contratos de direcciones OSC, rangos de valores, mapeo de parámetros,
 * y lógica de deduplicación. Compatible con la sección "pvc" de oscAddressMap.js.
 *
 * Direcciones: /pvc/range
 * Sin índice (módulo único), valores directos como dial.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_PARAMETERS } from '../../src/assets/js/osc/oscAddressMap.js';
import { PARAM_TO_ADDRESS } from '../../src/assets/js/osc/oscPitchToVoltageConverterSync.js';

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('PVCOSCSync — Direcciones OSC', () => {

  it('tiene 1 dirección definida', () => {
    assert.strictEqual(Object.keys(PARAM_TO_ADDRESS).length, 1);
  });

  it('range → pvc/range', () => {
    assert.strictEqual(PARAM_TO_ADDRESS.range, 'pvc/range');
  });

  it('todas las direcciones empiezan con "pvc/"', () => {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      assert.ok(address.startsWith('pvc/'),
        `${param}: "${address}" debe empezar con "pvc/"`);
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

describe('PVCOSCSync — MODULE_PARAMETERS.pvc', () => {

  it('existe en oscAddressMap', () => {
    assert.ok(MODULE_PARAMETERS.pvc, 'MODULE_PARAMETERS.pvc debe existir');
  });

  it('no es indexed (módulo único)', () => {
    assert.strictEqual(MODULE_PARAMETERS.pvc.indexed, false);
  });

  it('tiene 1 parámetro', () => {
    assert.strictEqual(Object.keys(MODULE_PARAMETERS.pvc.parameters).length, 1);
  });

  describe('range', () => {
    it('tipo float, rango 0 a 10', () => {
      const p = MODULE_PARAMETERS.pvc.parameters.range;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA SYNC ↔ ADDRESS MAP
// ═══════════════════════════════════════════════════════════════════════════

describe('PVCOSCSync — Coherencia', () => {

  it('todos los params del sync tienen equivalente en oscAddressMap', () => {
    const mapParams = Object.keys(MODULE_PARAMETERS.pvc.parameters);
    for (const param of Object.keys(PARAM_TO_ADDRESS)) {
      assert.ok(mapParams.includes(param),
        `"${param}" del sync no está en MODULE_PARAMETERS.pvc`);
    }
  });

  it('todos los params del addressMap tienen equivalente en el sync', () => {
    const syncParams = Object.keys(PARAM_TO_ADDRESS);
    for (const param of Object.keys(MODULE_PARAMETERS.pvc.parameters)) {
      assert.ok(syncParams.includes(param),
        `"${param}" de MODULE_PARAMETERS.pvc no está en PARAM_TO_ADDRESS`);
    }
  });
});
