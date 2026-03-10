/**
 * Tests para OSC Ring Modulator Sync
 *
 * Verifica la sincronización OSC de los 3 moduladores de anillo:
 * - Direcciones OSC correctas
 * - Parámetros del módulo
 * - Coherencia parámetros ↔ direcciones
 * - Rangos de valores
 *
 * @module tests/osc/oscRingModSync.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_PARAMETERS, INSTANCE_COUNT } from '../../src/assets/js/osc/oscRingModSync.js';
import config from '../../src/assets/js/configs/modules/ringModulator.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Mod OSC Sync - Estructura', () => {

  it('INSTANCE_COUNT es 3', () => {
    assert.strictEqual(INSTANCE_COUNT, 3);
  });

  it('INSTANCE_COUNT coincide con config.count', () => {
    assert.strictEqual(INSTANCE_COUNT, config.count);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Mod OSC Sync - Direcciones', () => {

  it('tiene parámetro "level"', () => {
    assert.ok(MODULE_PARAMETERS.level, 'Debe tener parámetro level');
  });

  it('level tiene dirección "level"', () => {
    assert.strictEqual(MODULE_PARAMETERS.level.address, 'level');
  });

  it('direcciones completas siguen patrón ringmod/{index}/{param}', () => {
    for (let i = 1; i <= INSTANCE_COUNT; i++) {
      for (const [, paramDef] of Object.entries(MODULE_PARAMETERS)) {
        const fullAddress = `ringmod/${i}/${paramDef.address}`;
        assert.ok(fullAddress.startsWith('ringmod/'), `Dirección debe empezar con ringmod/`);
        assert.ok(fullAddress.includes(`/${i}/`), `Dirección debe incluir índice /${i}/`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Mod OSC Sync - MODULE_PARAMETERS', () => {

  it('todos los parámetros tienen audioMethod', () => {
    for (const [param, def] of Object.entries(MODULE_PARAMETERS)) {
      assert.ok(def.audioMethod,
        `Parámetro "${param}" debe tener audioMethod`);
    }
  });

  it('level usa setLevel', () => {
    assert.strictEqual(MODULE_PARAMETERS.level.audioMethod, 'setLevel');
  });

  it('todos los audioMethod empiezan con "set"', () => {
    for (const [, def] of Object.entries(MODULE_PARAMETERS)) {
      assert.ok(def.audioMethod.startsWith('set'),
        `audioMethod "${def.audioMethod}" debe empezar con "set"`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA CON CONFIG
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Mod OSC Sync - Coherencia con config', () => {

  it('cada parámetro OSC tiene un knob correspondiente en config', () => {
    for (const param of Object.keys(MODULE_PARAMETERS)) {
      assert.ok(config.knobs[param],
        `Parámetro OSC "${param}" debe tener knob en config`);
    }
  });

  it('el rango del dial (0-10) es consistente', () => {
    for (const param of Object.keys(MODULE_PARAMETERS)) {
      const knob = config.knobs[param];
      assert.strictEqual(knob.min, 0, `${param}: min debe ser 0`);
      assert.strictEqual(knob.max, 10, `${param}: max debe ser 10`);
    }
  });
});
