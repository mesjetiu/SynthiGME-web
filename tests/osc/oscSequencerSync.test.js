/**
 * Tests para OSC Sequencer Sync — Sincronización OSC del Digital Sequencer 1000
 *
 * Verifica la sincronización OSC del secuenciador:
 * - Direcciones OSC correctas (seq/{param})
 * - Parámetros de knob con audioMethod
 * - Parámetros de switch con audioMethod
 * - Parámetros de button como trigger
 * - Coherencia parámetros ↔ config
 * - Coherencia parámetros ↔ oscAddressMap
 *
 * Módulo único (sin índice). Direcciones: /seq/{param}
 *
 * @module tests/osc/oscSequencerSync.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOB_PARAMETERS,
  SWITCH_PARAMETERS,
  BUTTON_PARAMETERS
} from '../../src/assets/js/osc/oscSequencerSync.js';
import { MODULE_PARAMETERS as ADDRESS_MAP } from '../../src/assets/js/osc/oscAddressMap.js';
import config from '../../src/assets/js/configs/modules/sequencer.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Estructura', () => {

  it('exporta KNOB_PARAMETERS', () => {
    assert.ok(KNOB_PARAMETERS, 'Debe exportar KNOB_PARAMETERS');
    assert.strictEqual(typeof KNOB_PARAMETERS, 'object');
  });

  it('exporta SWITCH_PARAMETERS', () => {
    assert.ok(SWITCH_PARAMETERS, 'Debe exportar SWITCH_PARAMETERS');
    assert.strictEqual(typeof SWITCH_PARAMETERS, 'object');
  });

  it('exporta BUTTON_PARAMETERS', () => {
    assert.ok(BUTTON_PARAMETERS, 'Debe exportar BUTTON_PARAMETERS');
    assert.strictEqual(typeof BUTTON_PARAMETERS, 'object');
  });

  it('tiene 11 parámetros de knob (clockRate + 6 voltages + 4 keys)', () => {
    assert.strictEqual(Object.keys(KNOB_PARAMETERS).length, 11);
  });

  it('tiene 8 parámetros de switch', () => {
    assert.strictEqual(Object.keys(SWITCH_PARAMETERS).length, 8);
  });

  it('tiene 8 parámetros de button', () => {
    assert.strictEqual(Object.keys(BUTTON_PARAMETERS).length, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC — KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Direcciones de knobs', () => {

  const expectedKnobs = [
    'clockRate',
    'voltageA', 'voltageB', 'voltageC', 'voltageD', 'voltageE', 'voltageF',
    'key1', 'key2', 'key3', 'key4'
  ];

  for (const param of expectedKnobs) {
    it(`tiene knob "${param}"`, () => {
      assert.ok(KNOB_PARAMETERS[param], `Debe tener knob ${param}`);
    });
  }

  it('todas las direcciones de knob empiezan con "seq/"', () => {
    for (const [param, def] of Object.entries(KNOB_PARAMETERS)) {
      assert.ok(def.address.startsWith('seq/'),
        `${param}: "${def.address}" debe empezar con "seq/"`);
    }
  });

  it('direcciones de knob tienen exactamente 2 segmentos (sin índice)', () => {
    for (const [param, def] of Object.entries(KNOB_PARAMETERS)) {
      const parts = def.address.split('/');
      assert.strictEqual(parts.length, 2,
        `${param}: "${def.address}" debe tener 2 segmentos`);
    }
  });

  it('clockRate → seq/clockRate', () => {
    assert.strictEqual(KNOB_PARAMETERS.clockRate.address, 'seq/clockRate');
  });

  it('voltageA → seq/voltageA', () => {
    assert.strictEqual(KNOB_PARAMETERS.voltageA.address, 'seq/voltageA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC — SWITCHES
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Direcciones de switches', () => {

  const expectedSwitches = [
    'abKey1', 'b', 'cdKey2', 'd', 'efKey3', 'f', 'key4', 'runClock'
  ];

  for (const sw of expectedSwitches) {
    it(`tiene switch "${sw}"`, () => {
      assert.ok(SWITCH_PARAMETERS[sw], `Debe tener switch ${sw}`);
    });
  }

  it('todas las direcciones de switch empiezan con "seq/"', () => {
    for (const [sw, def] of Object.entries(SWITCH_PARAMETERS)) {
      assert.ok(def.address.startsWith('seq/'),
        `${sw}: "${def.address}" debe empezar con "seq/"`);
    }
  });

  it('runClock → seq/runClock', () => {
    assert.strictEqual(SWITCH_PARAMETERS.runClock.address, 'seq/runClock');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC — BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Direcciones de buttons', () => {

  const expectedButtons = [
    'masterReset', 'runForward', 'runReverse', 'stop',
    'resetSequence', 'stepForward', 'stepReverse', 'testOP'
  ];

  for (const btn of expectedButtons) {
    it(`tiene button "${btn}"`, () => {
      assert.ok(BUTTON_PARAMETERS[btn], `Debe tener button ${btn}`);
    });
  }

  it('todas las direcciones de button empiezan con "seq/"', () => {
    for (const [btn, def] of Object.entries(BUTTON_PARAMETERS)) {
      assert.ok(def.address.startsWith('seq/'),
        `${btn}: "${def.address}" debe empezar con "seq/"`);
    }
  });

  it('masterReset → seq/masterReset', () => {
    assert.strictEqual(BUTTON_PARAMETERS.masterReset.address, 'seq/masterReset');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO METHODS — KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — audioMethod de knobs', () => {

  it('todos los knobs tienen audioMethod', () => {
    for (const [param, def] of Object.entries(KNOB_PARAMETERS)) {
      assert.ok(def.audioMethod, `Knob "${param}" debe tener audioMethod`);
    }
  });

  it('clockRate usa setClockRate', () => {
    assert.strictEqual(KNOB_PARAMETERS.clockRate.audioMethod, 'setClockRate');
  });

  it('voltages usan setKnob', () => {
    for (const v of ['voltageA', 'voltageB', 'voltageC', 'voltageD', 'voltageE', 'voltageF']) {
      assert.strictEqual(KNOB_PARAMETERS[v].audioMethod, 'setKnob',
        `${v} debe usar setKnob`);
    }
  });

  it('keys usan setKnob', () => {
    for (const k of ['key1', 'key2', 'key3', 'key4']) {
      assert.strictEqual(KNOB_PARAMETERS[k].audioMethod, 'setKnob',
        `${k} debe usar setKnob`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO METHODS — SWITCHES
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — audioMethod de switches', () => {

  it('todos los switches usan setSwitch', () => {
    for (const [sw, def] of Object.entries(SWITCH_PARAMETERS)) {
      assert.strictEqual(def.audioMethod, 'setSwitch',
        `Switch "${sw}" debe usar setSwitch`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO METHODS — BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — audioMethod de buttons', () => {

  it('todos los buttons usan pressButton', () => {
    for (const [btn, def] of Object.entries(BUTTON_PARAMETERS)) {
      assert.strictEqual(def.audioMethod, 'pressButton',
        `Button "${btn}" debe usar pressButton`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA CON CONFIG
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Coherencia con config', () => {

  it('cada knob OSC tiene un knob correspondiente en config', () => {
    for (const param of Object.keys(KNOB_PARAMETERS)) {
      assert.ok(config.knobs[param],
        `Knob OSC "${param}" debe tener knob en config`);
    }
  });

  it('cada switch OSC tiene un switch correspondiente en config', () => {
    for (const sw of Object.keys(SWITCH_PARAMETERS)) {
      assert.ok(config.switches[sw],
        `Switch OSC "${sw}" debe tener switch en config`);
    }
  });

  it('cada button OSC tiene un button correspondiente en config', () => {
    for (const btn of Object.keys(BUTTON_PARAMETERS)) {
      assert.ok(config.buttons[btn],
        `Button OSC "${btn}" debe tener button en config`);
    }
  });

  it('clockRate tiene rango 0-10', () => {
    assert.strictEqual(config.knobs.clockRate.min, 0);
    assert.strictEqual(config.knobs.clockRate.max, 10);
  });

  it('voltages tienen rango 0-10', () => {
    for (const v of ['voltageA', 'voltageB', 'voltageC', 'voltageD', 'voltageE', 'voltageF']) {
      assert.strictEqual(config.knobs[v].min, 0, `${v}: min debe ser 0`);
      assert.strictEqual(config.knobs[v].max, 10, `${v}: max debe ser 10`);
    }
  });

  it('keys tienen rango bipolar -5 a 5', () => {
    for (const k of ['key1', 'key2', 'key3', 'key4']) {
      assert.strictEqual(config.knobs[k].min, -5, `${k}: min debe ser -5`);
      assert.strictEqual(config.knobs[k].max, 5, `${k}: max debe ser 5`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA CON oscAddressMap.js
// ═══════════════════════════════════════════════════════════════════════════

describe('SequencerOSCSync — Coherencia con oscAddressMap', () => {

  it('existe entrada "seq" en ADDRESS_MAP', () => {
    assert.ok(ADDRESS_MAP.seq, 'MODULE_PARAMETERS.seq debe existir');
  });

  it('no es indexed (módulo único)', () => {
    assert.strictEqual(ADDRESS_MAP.seq.indexed, false);
  });

  it('cada dirección de knob tiene equivalente en address map', () => {
    const mapParams = ADDRESS_MAP.seq.parameters;
    for (const [param, def] of Object.entries(KNOB_PARAMETERS)) {
      const addrParam = def.address.split('/').pop();
      assert.ok(mapParams[addrParam],
        `Knob "${param}" (dirección "${addrParam}") debe existir en ADDRESS_MAP.seq.parameters`);
    }
  });

  it('switches están en address map', () => {
    const mapParams = ADDRESS_MAP.seq.parameters;
    for (const [sw, def] of Object.entries(SWITCH_PARAMETERS)) {
      const addrParam = def.address.split('/').pop();
      assert.ok(mapParams[addrParam],
        `Switch "${sw}" (dirección "${addrParam}") debe existir en ADDRESS_MAP.seq.parameters`);
    }
  });

  it('buttons están en address map como trigger', () => {
    const mapParams = ADDRESS_MAP.seq.parameters;
    for (const [btn, def] of Object.entries(BUTTON_PARAMETERS)) {
      const addrParam = def.address.split('/').pop();
      assert.ok(mapParams[addrParam],
        `Button "${btn}" (dirección "${addrParam}") debe existir en ADDRESS_MAP.seq.parameters`);
      assert.strictEqual(mapParams[addrParam].type, 'trigger',
        `Button "${btn}" debe ser tipo trigger en address map`);
    }
  });
});
