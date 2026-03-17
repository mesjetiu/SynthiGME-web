/**
 * Tests para stateSerializer.js (R7)
 *
 * Verifica los contratos de serializeCurrentState() y applyPatch()
 * antes y después del refactor R7 (split de app.js).
 *
 * Estos tests definen la API esperada del módulo extraído:
 *   - serializeCurrentState(app)  → { modules: { ... } }
 *   - applyPatch(patchData, app, deps) → void (async)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mocks de entorno para la cadena de importaciones ─────────────────────────
import './mocks/localStorage.mock.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
}

// ─── Import del módulo bajo prueba ────────────────────────────────────────────
import {
  serializeCurrentState,
  applyPatch
} from '../src/assets/js/stateSerializer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers para construir mocks
// ─────────────────────────────────────────────────────────────────────────────

/** UI mock con serialize()/deserialize() rastreables. */
function mockUI(data = {}) {
  return {
    _serialized: data,
    _deserialized: null,
    serialize() { return { ...this._serialized }; },
    deserialize(d) { this._deserialized = d; }
  };
}

/** Módulo mock con getX/Y/RangeX/RangeY y setters rastreables. */
function mockJoystick(x = 0, y = 0, rangeX = 8, rangeY = 8) {
  return {
    _x: x, _y: y, _rangeX: rangeX, _rangeY: rangeY,
    _setPos: null, _setRX: null, _setRY: null,
    getX()    { return this._x; },
    getY()    { return this._y; },
    getRangeX() { return this._rangeX; },
    getRangeY() { return this._rangeY; },
    setPosition(x, y) { this._setPos = { x, y }; },
    setRangeX(v) { this._setRX = v; },
    setRangeY(v) { this._setRY = v; }
  };
}

/** Mock de sessionManager para inyección en applyPatch. */
function mockSessionManager() {
  const calls = [];
  return {
    calls,
    applyingPatch(v) { calls.push(v); }
  };
}

/** Crea un app mock completo con todos los módulos mínimos. */
function buildMinimalApp() {
  return {
    engine: { dspEnabled: false },
    ensureAudio: async () => {},
    dormancyManager: { flushPendingUpdate() {} },

    _oscillatorUIs:    { 'osc-1-module': mockUI({ freq: 440 }) },
    _noiseUIs:         { 'noise-1': mockUI({ colour: 0.5, level: 1.0 }) },
    _randomVoltageUIs: { 'rv-1': mockUI({ mean: 5, variance: 2 }) },
    _envelopeShaperUIs: { 'env-1': mockUI({ time: 0.1 }) },
    _panel1FilterUIs:  { 'filter-lp-module': mockUI({ freq: 1000 }) },
    _panel1ReverbUI:   mockUI({ mix: 0.3, level: 0.7 }),
    _panel1RingModUIs: { 'ring-1': mockUI({ level: 0.5 }) },
    _keyboardModules:  { left: mockUI({ pitchSpread: 5 }), right: mockUI({ pitchSpread: 3 }) },
    _pvcModule:        mockUI({ range: 2 }),
    _outputFadersModule: mockUI({ faders: [0.8] }),
    _inputAmplifierUIs: { 'inp-1': mockUI({ gain: 1.0 }) },
    largeMatrixAudio:  mockUI({ pins: [] }),
    largeMatrixControl: mockUI({ pins: [] }),
    _joystickModules:  { left: mockJoystick(1, 2, 8, 8), right: mockJoystick(-1, 0, 6, 6) },
    _sequencerModule:  {
      values:   { clockRate: 5, voltage1: 3 },
      switches: { gate1: 1 },
      _calls: [],
      setClockRate(v) { this._calls.push(['setClockRate', v]); },
      setKnob(n, v)   { this._calls.push(['setKnob', n, v]); },
      setSwitch(n, v) { this._calls.push(['setSwitch', n, v]); }
    },
    _panel2Data: {
      timeKnob:  { knobInstance: { _v: 0.5, getValue() { return this._v; }, setValue(v) { this._v = v; } } },
      ampKnob:   { knobInstance: { _v: 1.0, getValue() { return this._v; }, setValue(v) { this._v = v; } } },
      levelKnob: { knobInstance: { _v: 0.0, getValue() { return this._v; }, setValue(v) { this._v = v; } } },
      modeToggle: { _state: 'a', getState() { return this._state; }, setState(s) { this._state = s; } }
    },
    _panel4Data: { voltmeters: { 'vm-1': mockUI({ mode: 'signal' }) } }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// serializeCurrentState
// ═══════════════════════════════════════════════════════════════════════════════

describe('serializeCurrentState — estructura base', () => {
  it('devuelve un objeto con propiedad modules', () => {
    const state = serializeCurrentState(buildMinimalApp());
    assert.ok(state && typeof state === 'object');
    assert.ok('modules' in state);
    assert.ok(typeof state.modules === 'object');
  });
});

describe('serializeCurrentState — osciladores', () => {
  it('incluye oscillators con los datos de serialize()', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.oscillators, { 'osc-1-module': { freq: 440 } });
  });

  it('omite osciladores sin método serialize()', () => {
    const app = buildMinimalApp();
    app._oscillatorUIs['broken'] = { noSerialize: true };
    const state = serializeCurrentState(app);
    assert.ok(!('broken' in (state.modules.oscillators ?? {})));
  });

  it('no falla si _oscillatorUIs es undefined', () => {
    const app = buildMinimalApp();
    delete app._oscillatorUIs;
    assert.doesNotThrow(() => serializeCurrentState(app));
  });
});

describe('serializeCurrentState — ruido', () => {
  it('incluye noise con los datos de serialize()', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.noise, { 'noise-1': { colour: 0.5, level: 1.0 } });
  });
});

describe('serializeCurrentState — random voltage', () => {
  it('incluye randomVoltage con los datos de serialize()', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.randomVoltage, { 'rv-1': { mean: 5, variance: 2 } });
  });
});

describe('serializeCurrentState — filtros Panel 1', () => {
  it('transforma el ID eliminando el sufijo -module', () => {
    const app = buildMinimalApp();
    // 'filter-lp-module' → 'filter-lp'
    const state = serializeCurrentState(app);
    assert.ok('filter-lp' in state.modules.filters, 'debe usar la clave sin -module');
    assert.ok(!('filter-lp-module' in state.modules.filters), 'no debe usar la clave con -module');
  });

  it('mantiene los datos del módulo al transformar el ID', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.filters['filter-lp'], { freq: 1000 });
  });
});

describe('serializeCurrentState — reverberación', () => {
  it('incluye reverberation con los datos de serialize()', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.reverberation, { mix: 0.3, level: 0.7 });
  });

  it('no falla si _panel1ReverbUI es undefined', () => {
    const app = buildMinimalApp();
    delete app._panel1ReverbUI;
    assert.doesNotThrow(() => serializeCurrentState(app));
  });
});

describe('serializeCurrentState — joysticks', () => {
  it('serializa como { x, y, rangeX, rangeY }', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.joysticks.left,  { x: 1, y: 2, rangeX: 8, rangeY: 8 });
    assert.deepEqual(state.modules.joysticks.right, { x: -1, y: 0, rangeX: 6, rangeY: 6 });
  });
});

describe('serializeCurrentState — secuenciador', () => {
  it('copia values y switches del módulo', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.sequencer.values,   { clockRate: 5, voltage1: 3 });
    assert.deepEqual(state.modules.sequencer.switches, { gate1: 1 });
  });

  it('la copia de values es independiente (no referencia)', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    state.modules.sequencer.values.clockRate = 99;
    assert.equal(app._sequencerModule.values.clockRate, 5, 'debe ser copia, no referencia');
  });
});

describe('serializeCurrentState — osciloscopio', () => {
  it('serializa timeScale/ampScale/triggerLevel/mode', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.oscilloscope, {
      timeScale:    0.5,
      ampScale:     1.0,
      triggerLevel: 0.0,
      mode:         'a'
    });
  });

  it('usa valores por defecto cuando faltan knobs', () => {
    const app = buildMinimalApp();
    app._panel2Data.timeKnob = null;
    app._panel2Data.modeToggle = null;
    const state = serializeCurrentState(app);
    assert.equal(state.modules.oscilloscope.timeScale, 1.0, 'timeScale default 1.0');
    assert.equal(state.modules.oscilloscope.mode, 'a', "mode default 'a'");
  });
});

describe('serializeCurrentState — matrices', () => {
  it('serializa matrixAudio y matrixControl', () => {
    const app = buildMinimalApp();
    const state = serializeCurrentState(app);
    assert.deepEqual(state.modules.matrixAudio,   { pins: [] });
    assert.deepEqual(state.modules.matrixControl, { pins: [] });
  });
});

describe('serializeCurrentState — pvcModule y outputFaders', () => {
  it('serializa pitchToVoltageConverter', () => {
    const state = serializeCurrentState(buildMinimalApp());
    assert.deepEqual(state.modules.pitchToVoltageConverter, { range: 2 });
  });

  it('serializa outputFaders', () => {
    const state = serializeCurrentState(buildMinimalApp());
    assert.deepEqual(state.modules.outputFaders, { faders: [0.8] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// applyPatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyPatch — seguridad con datos inválidos', () => {
  it('no lanza si patchData es null', async () => {
    const sm = mockSessionManager();
    await assert.doesNotReject(applyPatch(null, buildMinimalApp(), { sessionManager: sm }));
  });

  it('no lanza si patchData.modules falta', async () => {
    const sm = mockSessionManager();
    await assert.doesNotReject(applyPatch({}, buildMinimalApp(), { sessionManager: sm }));
  });
});

describe('applyPatch — sessionManager', () => {
  it('llama applyingPatch(true) al inicio y applyingPatch(false) al final', async () => {
    const sm = mockSessionManager();
    const patch = { modules: {} };
    await applyPatch(patch, buildMinimalApp(), { sessionManager: sm });
    assert.deepEqual(sm.calls, [true, false]);
  });

  it('llama applyingPatch(false) incluso cuando hay módulos a restaurar', async () => {
    const sm = mockSessionManager();
    const patch = { modules: { oscillators: { 'osc-1-module': { freq: 880 } } } };
    await applyPatch(patch, buildMinimalApp(), { sessionManager: sm });
    assert.equal(sm.calls[sm.calls.length - 1], false);
  });
});

describe('applyPatch — osciladores', () => {
  it('llama deserialize() en la UI del oscilador correspondiente', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { oscillators: { 'osc-1-module': { freq: 880 } } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._oscillatorUIs['osc-1-module']._deserialized, { freq: 880 });
  });

  it('ignora osciladores cuya UI no existe', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await assert.doesNotReject(applyPatch(
      { modules: { oscillators: { 'osc-99-module': { freq: 440 } } } },
      app,
      { sessionManager: sm }
    ));
  });
});

describe('applyPatch — filtros Panel 1', () => {
  it('usa ID con sufijo -module para buscar la UI', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    // patch usa 'filter-lp' (sin -module), la UI existe como 'filter-lp-module'
    await applyPatch(
      { modules: { filters: { 'filter-lp': { freq: 2000 } } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._panel1FilterUIs['filter-lp-module']._deserialized, { freq: 2000 });
  });
});

describe('applyPatch — reverberación', () => {
  it('llama deserialize() en _panel1ReverbUI', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { reverberation: { mix: 0.9, level: 0.1 } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._panel1ReverbUI._deserialized, { mix: 0.9, level: 0.1 });
  });
});

describe('applyPatch — joysticks', () => {
  it('restaura rangos antes que la posición', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { joysticks: { left: { x: 3, y: -2, rangeX: 10, rangeY: 10 } } } },
      app,
      { sessionManager: sm }
    );
    const j = app._joystickModules.left;
    assert.equal(j._setRX, 10, 'rangeX restaurado');
    assert.equal(j._setRY, 10, 'rangeY restaurado');
    assert.deepEqual(j._setPos, { x: 3, y: -2 }, 'posición restaurada');
  });

  it('no falla si rangeX/rangeY/x/y no están en el patch', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await assert.doesNotReject(applyPatch(
      { modules: { joysticks: { left: {} } } },
      app,
      { sessionManager: sm }
    ));
  });
});

describe('applyPatch — secuenciador', () => {
  it('restaura switches llamando setSwitch()', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { sequencer: { switches: { gate1: 0, gate2: 1 }, values: {} } } },
      app,
      { sessionManager: sm }
    );
    const calls = app._sequencerModule._calls;
    assert.ok(calls.some(c => c[0] === 'setSwitch' && c[1] === 'gate1' && c[2] === 0));
    assert.ok(calls.some(c => c[0] === 'setSwitch' && c[1] === 'gate2' && c[2] === 1));
  });

  it('restaura clockRate llamando setClockRate()', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { sequencer: { switches: {}, values: { clockRate: 7 } } } },
      app,
      { sessionManager: sm }
    );
    assert.ok(app._sequencerModule._calls.some(c => c[0] === 'setClockRate' && c[1] === 7));
  });

  it('restaura knobs llamando setKnob()', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { sequencer: { switches: {}, values: { voltage1: 8 } } } },
      app,
      { sessionManager: sm }
    );
    assert.ok(app._sequencerModule._calls.some(c => c[0] === 'setKnob' && c[1] === 'voltage1' && c[2] === 8));
  });
});

describe('applyPatch — osciloscopio', () => {
  it('actualiza los valores de los knobs', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { oscilloscope: { timeScale: 0.8, ampScale: 2.0, triggerLevel: 0.3, mode: 'b' } } },
      app,
      { sessionManager: sm }
    );
    const p2 = app._panel2Data;
    assert.equal(p2.timeKnob.knobInstance._v,  0.8);
    assert.equal(p2.ampKnob.knobInstance._v,   2.0);
    assert.equal(p2.levelKnob.knobInstance._v, 0.3);
    assert.equal(p2.modeToggle._state, 'b');
  });

  it('no falla si los knobs son null', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    app._panel2Data.timeKnob  = null;
    app._panel2Data.ampKnob   = null;
    app._panel2Data.levelKnob = null;
    app._panel2Data.modeToggle = null;
    await assert.doesNotReject(applyPatch(
      { modules: { oscilloscope: { timeScale: 1, ampScale: 1, triggerLevel: 0, mode: 'a' } } },
      app,
      { sessionManager: sm }
    ));
  });
});

describe('applyPatch — voltímetros', () => {
  it('llama deserialize() en cada voltímetro', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { voltmeters: { 'vm-1': { mode: 'control' } } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._panel4Data.voltmeters['vm-1']._deserialized, { mode: 'control' });
  });
});

describe('applyPatch — matrices', () => {
  it('llama deserialize() en largeMatrixAudio', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { matrixAudio: { pins: [{ r: 0, c: 0 }] } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app.largeMatrixAudio._deserialized, { pins: [{ r: 0, c: 0 }] });
  });

  it('llama deserialize() en largeMatrixControl', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { matrixControl: { pins: [{ r: 1, c: 1 }] } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app.largeMatrixControl._deserialized, { pins: [{ r: 1, c: 1 }] });
  });
});

describe('applyPatch — pvcModule y outputFaders', () => {
  it('llama deserialize() en _pvcModule', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { pitchToVoltageConverter: { range: 5 } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._pvcModule._deserialized, { range: 5 });
  });

  it('llama deserialize() en _outputFadersModule', async () => {
    const sm = mockSessionManager();
    const app = buildMinimalApp();
    await applyPatch(
      { modules: { outputFaders: { faders: [0.5, 0.5] } } },
      app,
      { sessionManager: sm }
    );
    assert.deepEqual(app._outputFadersModule._deserialized, { faders: [0.5, 0.5] });
  });
});
