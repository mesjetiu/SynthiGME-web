/**
 * Tests para instrumentación de eventos de telemetría (Fase 4)
 *
 * Verifica que los payloads de los eventos instrumentados
 * tienen la estructura correcta:
 * - worklet_fail
 * - worklet_crash
 * - audio_fail
 * - export_fail
 * - session_start
 * - first_run
 */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock de entorno mínimo ───

const storage = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem(key) { return storage[key] ?? null; },
    setItem(key, val) { storage[key] = String(val); },
    removeItem(key) { delete storage[key]; },
    clear() { Object.keys(storage).forEach(k => delete storage[k]); }
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {
    userAgent: 'Node.js Test Runner',
    onLine: true,
    sendBeacon: () => true
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: 'visible'
  };
}

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => 'test-uuid-events'
  };
}

// ─── Import ───

import { _testing } from '../../src/assets/js/utils/telemetry.js';

const { buildPayload } = _testing;

// ─── Helpers ───

function clearAllStorage() {
  Object.keys(storage).forEach(k => delete storage[k]);
}

// ─── Tests ───

describe('Telemetría — Payloads de eventos instrumentados (Fase 4)', () => {
  
  beforeEach(() => {
    _testing.reset();
    clearAllStorage();
  });
  
  after(() => {
    _testing.reset();
    clearAllStorage();
  });
  
  describe('session_start', () => {
    it('tiene la estructura correcta', () => {
      const payload = buildPayload('session_start');
      assert.equal(payload.type, 'session_start');
      assert.equal(typeof payload.id, 'string');
      assert.equal(typeof payload.v, 'string');
      assert.equal(typeof payload.ts, 'number');
      assert.ok(['electron', 'web'].includes(payload.env));
      assert.ok(payload.os);
      assert.ok(payload.browser);
    });
  });
  
  describe('first_run', () => {
    it('tiene la estructura correcta', () => {
      const payload = buildPayload('first_run', {});
      assert.equal(payload.type, 'first_run');
      assert.deepStrictEqual(payload.data, {});
    });
  });
  
  describe('worklet_fail', () => {
    it('incluye message en data', () => {
      const payload = buildPayload('worklet_fail', {
        message: 'DOMException: Failed to load AudioWorklet module'
      });
      assert.equal(payload.type, 'worklet_fail');
      assert.equal(payload.data.message, 'DOMException: Failed to load AudioWorklet module');
    });
  });
  
  describe('worklet_crash', () => {
    it('incluye processor en data', () => {
      const payload = buildPayload('worklet_crash', {
        processor: 'synth-oscillator[single]'
      });
      assert.equal(payload.type, 'worklet_crash');
      assert.equal(payload.data.processor, 'synth-oscillator[single]');
    });
  });
  
  describe('audio_fail', () => {
    it('incluye message en data', () => {
      const payload = buildPayload('audio_fail', {
        message: 'NotAllowedError: AudioContext not allowed'
      });
      assert.equal(payload.type, 'audio_fail');
      assert.equal(payload.data.message, 'NotAllowedError: AudioContext not allowed');
    });
  });
  
  describe('export_fail', () => {
    it('incluye message en data', () => {
      const payload = buildPayload('export_fail', {
        message: 'RangeError: Invalid array length'
      });
      assert.equal(payload.type, 'export_fail');
      assert.equal(payload.data.message, 'RangeError: Invalid array length');
    });
  });
  
  describe('Campos comunes a todos los payloads', () => {
    const eventTypes = ['session_start', 'first_run', 'worklet_fail', 'worklet_crash', 'audio_fail', 'export_fail', 'error'];
    
    for (const type of eventTypes) {
      it(`${type}: tiene id, v, env, os, browser, ts`, () => {
        const payload = buildPayload(type, {});
        assert.ok(payload.id, 'id presente');
        assert.ok(payload.v, 'v (version) presente');
        assert.ok(payload.env, 'env presente');
        assert.ok(payload.os, 'os presente');
        assert.ok(payload.browser, 'browser presente');
        assert.ok(payload.ts > 0, 'ts > 0');
      });
    }
  });
});
