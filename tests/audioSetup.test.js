/**
 * Tests para audioSetup.js (R7)
 *
 * Verifica ensureAudio(), activateMultichannelOutput(),
 * activateMultichannelInput(), deactivateMultichannelOutput(),
 * deactivateMultichannelInput(), ensureSystemAudioInput().
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import './mocks/localStorage.mock.js';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { powerAPI: null, ontouchstart: undefined };
}

import {
  ensureAudio,
  activateMultichannelOutput,
  activateMultichannelInput,
  deactivateMultichannelOutput,
  deactivateMultichannelInput,
} from '../src/assets/js/audioSetup.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMockEngine(overrides = {}) {
  return {
    dspEnabled: true,
    audioCtx: null,
    workletReady: false,
    start: () => {},
    ensureWorkletReady: async () => {},
    ...overrides,
  };
}

function buildMockApp(overrides = {}) {
  return {
    engine: buildMockEngine(),
    _ensureAudioPromise: null,
    _envelopeShaperModules: [],
    _sequencerModule: null,
    _panel2ScopeStarted: false,
    _ensurePanel2ScopeStarted: () => {},
    _restoreMultichannelIfSaved: async () => {},
    _outputFadersModule: null,
    _inputAmplifierUIs: {},
    _panel2Data: null,
    _multichannel: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureAudio
// ─────────────────────────────────────────────────────────────────────────────

describe('ensureAudio — dsp deshabilitado', () => {
  it('devuelve false inmediatamente si dspEnabled es false', async () => {
    const app = buildMockApp({
      engine: buildMockEngine({ dspEnabled: false }),
    });
    const result = await ensureAudio(app);
    assert.equal(result, false);
  });
});

describe('ensureAudio — dsp habilitado', () => {
  it('llama engine.start() cuando dsp está habilitado', async () => {
    let started = false;
    const app = buildMockApp({
      engine: buildMockEngine({
        dspEnabled: true,
        start: () => { started = true; },
        ensureWorkletReady: async () => {},
        audioCtx: null,
        workletReady: false,
      }),
    });
    await ensureAudio(app);
    assert.ok(started, 'engine.start() debe llamarse');
  });

  it('devuelve false si workletReady es false tras iniciar', async () => {
    const app = buildMockApp({
      engine: buildMockEngine({
        dspEnabled: true,
        start: () => {},
        ensureWorkletReady: async () => {},
        workletReady: false,
      }),
    });
    const result = await ensureAudio(app);
    assert.equal(result, false);
  });

  it('evita llamadas concurrentes (reutiliza la promesa en curso)', async () => {
    let startCount = 0;
    const app = buildMockApp({
      engine: buildMockEngine({
        dspEnabled: true,
        start: () => { startCount++; },
        ensureWorkletReady: async () => {},
        workletReady: false,
      }),
    });
    // Llamar dos veces concurrentemente
    await Promise.all([ensureAudio(app), ensureAudio(app)]);
    assert.equal(startCount, 1, 'engine.start() solo debe llamarse una vez');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// activateMultichannelOutput
// ─────────────────────────────────────────────────────────────────────────────

describe('activateMultichannelOutput', () => {
  it('devuelve success:false si no hay multichannelAPI (browser mode)', async () => {
    const app = buildMockApp({
      engine: buildMockEngine({ audioCtx: null }),
    });
    const result = await activateMultichannelOutput(app);
    assert.ok(typeof result === 'object');
    assert.equal(result.success, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// activateMultichannelInput
// ─────────────────────────────────────────────────────────────────────────────

describe('activateMultichannelInput', () => {
  it('devuelve success:false si no hay multichannelAPI (browser mode)', async () => {
    const app = buildMockApp({
      engine: buildMockEngine({ audioCtx: null }),
    });
    const result = await activateMultichannelInput(app);
    assert.ok(typeof result === 'object');
    assert.equal(result.success, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deactivateMultichannelOutput / Input
// ─────────────────────────────────────────────────────────────────────────────

describe('deactivateMultichannelOutput', () => {
  it('no lanza si no hay configuración multicanal', async () => {
    const app = buildMockApp({ _multichannel: null });
    await assert.doesNotReject(() => deactivateMultichannelOutput(app));
  });
});

describe('deactivateMultichannelInput', () => {
  it('no lanza si no hay configuración multicanal', async () => {
    const app = buildMockApp({ _multichannel: null });
    await assert.doesNotReject(() => deactivateMultichannelInput(app));
  });
});
