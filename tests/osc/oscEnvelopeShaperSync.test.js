/**
 * Tests para OSC Envelope Shaper Sync
 *
 * Verifica la sincronización OSC de los 3 envelope shapers:
 * - Direcciones OSC correctas (env/{1-3}/{param})
 * - Parámetros del módulo con audioMethod
 * - Coherencia parámetros ↔ oscAddressMap
 * - Rangos de valores según config
 * - Gate como parámetro especial (trigger)
 *
 * @module tests/osc/oscEnvelopeShaperSync.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MODULE_PARAMETERS,
  INSTANCE_COUNT,
  GATE_PARAMETER
} from '../../src/assets/js/osc/oscEnvelopeShaperSync.js';
import { MODULE_PARAMETERS as ADDRESS_MAP } from '../../src/assets/js/osc/oscAddressMap.js';
import config from '../../src/assets/js/configs/modules/envelopeShaper.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper OSC Sync - Estructura', () => {

  it('INSTANCE_COUNT es 3', () => {
    assert.strictEqual(INSTANCE_COUNT, 3);
  });

  it('INSTANCE_COUNT coincide con config.instances', () => {
    assert.strictEqual(INSTANCE_COUNT, config.instances);
  });

  it('tiene 8 parámetros de knob', () => {
    assert.strictEqual(Object.keys(MODULE_PARAMETERS).length, 8);
  });

  it('tiene parámetro especial de gate', () => {
    assert.ok(GATE_PARAMETER, 'Debe exportar GATE_PARAMETER');
    assert.strictEqual(GATE_PARAMETER.address, 'gate');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper OSC Sync - Direcciones', () => {

  const expectedParams = [
    'mode', 'delay', 'attack', 'decay',
    'sustain', 'release', 'envelopeLevel', 'signalLevel'
  ];

  for (const param of expectedParams) {
    it(`tiene parámetro "${param}"`, () => {
      assert.ok(MODULE_PARAMETERS[param],
        `Debe tener parámetro ${param}`);
    });
  }

  it('mode usa dirección "selector" (nombre OSC del Synthi)', () => {
    assert.strictEqual(MODULE_PARAMETERS.mode.address, 'selector');
  });

  it('delay usa dirección "delay"', () => {
    assert.strictEqual(MODULE_PARAMETERS.delay.address, 'delay');
  });

  it('attack usa dirección "attack"', () => {
    assert.strictEqual(MODULE_PARAMETERS.attack.address, 'attack');
  });

  it('decay usa dirección "decay"', () => {
    assert.strictEqual(MODULE_PARAMETERS.decay.address, 'decay');
  });

  it('sustain usa dirección "sustain"', () => {
    assert.strictEqual(MODULE_PARAMETERS.sustain.address, 'sustain');
  });

  it('release usa dirección "release"', () => {
    assert.strictEqual(MODULE_PARAMETERS.release.address, 'release');
  });

  it('envelopeLevel usa dirección "envelopeLevel"', () => {
    assert.strictEqual(MODULE_PARAMETERS.envelopeLevel.address, 'envelopeLevel');
  });

  it('signalLevel usa dirección "signalLevel"', () => {
    assert.strictEqual(MODULE_PARAMETERS.signalLevel.address, 'signalLevel');
  });

  it('direcciones completas siguen patrón env/{index}/{param}', () => {
    for (let i = 1; i <= INSTANCE_COUNT; i++) {
      for (const [, paramDef] of Object.entries(MODULE_PARAMETERS)) {
        const fullAddress = `env/${i}/${paramDef.address}`;
        assert.ok(fullAddress.startsWith('env/'),
          `Dirección debe empezar con env/`);
        assert.ok(fullAddress.includes(`/${i}/`),
          `Dirección debe incluir índice /${i}/`);
      }
    }
  });

  it('gate sigue patrón env/{index}/gate', () => {
    for (let i = 1; i <= INSTANCE_COUNT; i++) {
      const fullAddress = `env/${i}/${GATE_PARAMETER.address}`;
      assert.strictEqual(fullAddress, `env/${i}/gate`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE_PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper OSC Sync - MODULE_PARAMETERS', () => {

  it('todos los parámetros tienen audioMethod', () => {
    for (const [param, def] of Object.entries(MODULE_PARAMETERS)) {
      assert.ok(def.audioMethod,
        `Parámetro "${param}" debe tener audioMethod`);
    }
  });

  const expectedMethods = {
    mode: 'setMode',
    delay: 'setDelay',
    attack: 'setAttack',
    decay: 'setDecay',
    sustain: 'setSustain',
    release: 'setRelease',
    envelopeLevel: 'setEnvelopeLevel',
    signalLevel: 'setSignalLevel'
  };

  for (const [param, method] of Object.entries(expectedMethods)) {
    it(`${param} usa ${method}`, () => {
      assert.strictEqual(MODULE_PARAMETERS[param].audioMethod, method);
    });
  }

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

describe('EnvelopeShaper OSC Sync - Coherencia con config', () => {

  it('cada parámetro OSC tiene un knob correspondiente en config', () => {
    for (const param of Object.keys(MODULE_PARAMETERS)) {
      assert.ok(config.knobs[param],
        `Parámetro OSC "${param}" debe tener knob en config`);
    }
  });

  it('los rangos del dial coinciden con config', () => {
    for (const param of Object.keys(MODULE_PARAMETERS)) {
      const knob = config.knobs[param];
      assert.strictEqual(typeof knob.min, 'number',
        `${param}: min debe ser número`);
      assert.strictEqual(typeof knob.max, 'number',
        `${param}: max debe ser número`);
    }
  });

  it('mode tiene rango 0-4 (5 posiciones)', () => {
    const knob = config.knobs.mode;
    assert.strictEqual(knob.min, 0);
    assert.strictEqual(knob.max, 4);
  });

  it('tiempos (delay, attack, decay, release) tienen rango 0-10', () => {
    for (const param of ['delay', 'attack', 'decay', 'release']) {
      const knob = config.knobs[param];
      assert.strictEqual(knob.min, 0, `${param}: min debe ser 0`);
      assert.strictEqual(knob.max, 10, `${param}: max debe ser 10`);
    }
  });

  it('sustain tiene rango 0-10', () => {
    assert.strictEqual(config.knobs.sustain.min, 0);
    assert.strictEqual(config.knobs.sustain.max, 10);
  });

  it('envelopeLevel tiene rango bipolar -5 a 5', () => {
    assert.strictEqual(config.knobs.envelopeLevel.min, -5);
    assert.strictEqual(config.knobs.envelopeLevel.max, 5);
  });

  it('signalLevel tiene rango 0-10', () => {
    assert.strictEqual(config.knobs.signalLevel.min, 0);
    assert.strictEqual(config.knobs.signalLevel.max, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA CON oscAddressMap.js
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper OSC Sync - Coherencia con oscAddressMap', () => {

  it('existe entrada "env" en MODULE_PARAMETERS del address map', () => {
    assert.ok(ADDRESS_MAP.env, 'MODULE_PARAMETERS.env debe existir');
  });

  it('es indexed con count 3', () => {
    assert.strictEqual(ADDRESS_MAP.env.indexed, true);
    assert.strictEqual(ADDRESS_MAP.env.count, 3);
  });

  it('cada dirección OSC del sync tiene equivalente en address map', () => {
    const mapParams = ADDRESS_MAP.env.parameters;
    for (const [, paramDef] of Object.entries(MODULE_PARAMETERS)) {
      assert.ok(mapParams[paramDef.address],
        `Dirección "${paramDef.address}" debe existir en oscAddressMap.env.parameters`);
    }
  });

  it('gate existe en address map como trigger', () => {
    assert.ok(ADDRESS_MAP.env.parameters.gate);
    assert.strictEqual(ADDRESS_MAP.env.parameters.gate.type, 'trigger');
  });

  it('selector existe en address map', () => {
    assert.ok(ADDRESS_MAP.env.parameters.selector);
  });
});
