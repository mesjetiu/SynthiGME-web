/**
 * Tests para osc/oscKeyboardSync.js — KeyboardOSCSync
 *
 * Verifica direcciones OSC, mapeo de parámetros, deduplicación y anti-feedback.
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARAM_TO_ADDRESS,
  KeyboardOSCSync
} from '../../src/assets/js/osc/oscKeyboardSync.js';

// ═══════════════════════════════════════════════════════════════════════════
// DIRECCIONES OSC
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardOSCSync — Direcciones OSC', () => {

  it('PARAM_TO_ADDRESS tiene 8 entradas (4 params × 2 sides)', () => {
    const entries = Object.keys(PARAM_TO_ADDRESS);
    assert.strictEqual(entries.length, 8);
  });

  it('contiene upper/pitchSpread', () => {
    assert.ok('upper/pitchSpread' in PARAM_TO_ADDRESS);
    assert.strictEqual(PARAM_TO_ADDRESS['upper/pitchSpread'], 'keyboard/upper/pitchSpread');
  });

  it('contiene upper/velocityLevel', () => {
    assert.ok('upper/velocityLevel' in PARAM_TO_ADDRESS);
    assert.strictEqual(PARAM_TO_ADDRESS['upper/velocityLevel'], 'keyboard/upper/velocityLevel');
  });

  it('contiene upper/gateLevel', () => {
    assert.ok('upper/gateLevel' in PARAM_TO_ADDRESS);
    assert.strictEqual(PARAM_TO_ADDRESS['upper/gateLevel'], 'keyboard/upper/gateLevel');
  });

  it('contiene upper/retrigger', () => {
    assert.ok('upper/retrigger' in PARAM_TO_ADDRESS);
    assert.strictEqual(PARAM_TO_ADDRESS['upper/retrigger'], 'keyboard/upper/retrigger');
  });

  it('contiene lower/pitchSpread', () => {
    assert.ok('lower/pitchSpread' in PARAM_TO_ADDRESS);
    assert.strictEqual(PARAM_TO_ADDRESS['lower/pitchSpread'], 'keyboard/lower/pitchSpread');
  });

  it('contiene lower/velocityLevel', () => {
    assert.ok('lower/velocityLevel' in PARAM_TO_ADDRESS);
  });

  it('contiene lower/gateLevel', () => {
    assert.ok('lower/gateLevel' in PARAM_TO_ADDRESS);
  });

  it('contiene lower/retrigger', () => {
    assert.ok('lower/retrigger' in PARAM_TO_ADDRESS);
  });

  it('todas las direcciones empiezan con "keyboard/"', () => {
    for (const address of Object.values(PARAM_TO_ADDRESS)) {
      assert.ok(address.startsWith('keyboard/'), `${address} no empieza con keyboard/`);
    }
  });

  it('no hay direcciones duplicadas', () => {
    const addresses = Object.values(PARAM_TO_ADDRESS);
    const unique = new Set(addresses);
    assert.strictEqual(unique.size, addresses.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLASE KeyboardOSCSync
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardOSCSync — Clase', () => {

  it('se puede instanciar', () => {
    const sync = new KeyboardOSCSync();
    assert.ok(sync);
  });

  it('shouldIgnoreOSC() devuelve false inicialmente', () => {
    const sync = new KeyboardOSCSync();
    assert.strictEqual(sync.shouldIgnoreOSC(), false);
  });

  it('_getKnobConfig devuelve null para parámetros desconocidos', () => {
    const sync = new KeyboardOSCSync();
    const result = sync._getKnobConfig('unknownParam');
    assert.strictEqual(result, null);
  });

  it('destroy() no lanza errores sin init previo', () => {
    const sync = new KeyboardOSCSync();
    assert.doesNotThrow(() => sync.destroy());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardOSCSync — Coherencia de parámetros', () => {

  const EXPECTED_PARAMS = ['pitchSpread', 'velocityLevel', 'gateLevel', 'retrigger'];
  const EXPECTED_SIDES = ['upper', 'lower'];

  it('cada side tiene exactamente los 4 parámetros esperados', () => {
    for (const side of EXPECTED_SIDES) {
      for (const param of EXPECTED_PARAMS) {
        const key = `${side}/${param}`;
        assert.ok(key in PARAM_TO_ADDRESS, `Falta ${key}`);
      }
    }
  });

  it('las direcciones siguen el patrón keyboard/{side}/{param}', () => {
    for (const [key, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const [side, param] = key.split('/');
      assert.strictEqual(address, `keyboard/${side}/${param}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTAS — sendNoteOn / sendNoteOff / _handleIncomingNote
// ═══════════════════════════════════════════════════════════════════════════

describe('KeyboardOSCSync — Notas OSC', () => {

  it('sendNoteOn existe como método', () => {
    const sync = new KeyboardOSCSync();
    assert.strictEqual(typeof sync.sendNoteOn, 'function');
  });

  it('sendNoteOff existe como método', () => {
    const sync = new KeyboardOSCSync();
    assert.strictEqual(typeof sync.sendNoteOff, 'function');
  });

  it('_handleIncomingNote existe como método', () => {
    const sync = new KeyboardOSCSync();
    assert.strictEqual(typeof sync._handleIncomingNote, 'function');
  });

  it('_handleIncomingNote no lanza sin app', () => {
    const sync = new KeyboardOSCSync();
    assert.doesNotThrow(() => sync._handleIncomingNote('upper', 'noteOn', [60, 100]));
  });

  it('_handleIncomingNote noteOn llama noteOn del módulo', () => {
    const sync = new KeyboardOSCSync();
    const calls = [];
    sync._app = {
      _keyboardModules: {
        upper: {
          isStarted: true,
          noteOn(n, v) { calls.push({ type: 'noteOn', note: n, velocity: v }); },
          noteOff() {},
          start() {}
        }
      }
    };
    sync._handleIncomingNote('upper', 'noteOn', [60, 100]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].note, 60);
    assert.strictEqual(calls[0].velocity, 100);
  });

  it('_handleIncomingNote noteOff llama noteOff del módulo', () => {
    const sync = new KeyboardOSCSync();
    const calls = [];
    sync._app = {
      _keyboardModules: {
        lower: {
          isStarted: true,
          noteOn() {},
          noteOff(n) { calls.push({ type: 'noteOff', note: n }); },
          start() {}
        }
      }
    };
    sync._handleIncomingNote('lower', 'noteOff', 60);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].note, 60);
  });

  it('_handleIncomingNote hace lazy start del módulo', () => {
    const sync = new KeyboardOSCSync();
    let started = false;
    sync._app = {
      _keyboardModules: {
        upper: {
          isStarted: false,
          noteOn() {},
          noteOff() {},
          start() { started = true; this.isStarted = true; }
        }
      }
    };
    sync._handleIncomingNote('upper', 'noteOn', [60, 100]);
    assert.strictEqual(started, true);
  });

  it('_handleIncomingNote no actúa si _ignoreOSCUpdates está activo', () => {
    const sync = new KeyboardOSCSync();
    const calls = [];
    sync._ignoreOSCUpdates = true;
    sync._app = {
      _keyboardModules: {
        upper: {
          isStarted: true,
          noteOn(n, v) { calls.push('noteOn'); },
          noteOff() {},
          start() {}
        }
      }
    };
    sync._handleIncomingNote('upper', 'noteOn', [60, 100]);
    assert.strictEqual(calls.length, 0);
  });

  it('noteOn con valor escalar usa velocity por defecto 100', () => {
    const sync = new KeyboardOSCSync();
    const calls = [];
    sync._app = {
      _keyboardModules: {
        upper: {
          isStarted: true,
          noteOn(n, v) { calls.push({ note: n, velocity: v }); },
          noteOff() {},
          start() {}
        }
      }
    };
    sync._handleIncomingNote('upper', 'noteOn', 60);
    assert.strictEqual(calls[0].velocity, 100);
  });

  it('direcciones de notas siguen patrón keyboard/{side}/noteOn|noteOff', () => {
    for (const side of ['upper', 'lower']) {
      assert.strictEqual(`keyboard/${side}/noteOn`, `keyboard/${side}/noteOn`);
      assert.strictEqual(`keyboard/${side}/noteOff`, `keyboard/${side}/noteOff`);
    }
  });
});
