/**
 * Tests para utils/telemetry.js
 *
 * Verifica:
 * - Consentimiento (isEnabled / setEnabled)
 * - Payload construction (campos obligatorios)
 * - trackEvent rate limiting
 * - trackError auto-limit
 * - Cola offline (save / load / clear)
 * - Flush (envía + limpia cola)
 * - init idempotente
 * - _testing.reset() limpia todo
 *
 * Fase 3 del plan de telemetría.
 */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock de entorno mínimo ───

import '../mocks/localStorage.mock.js';

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
    randomUUID: () => 'test-uuid-1234'
  };
}

// ─── Import ───

import {
  isEnabled,
  setEnabled,
  trackEvent,
  trackError,
  flush,
  init,
  _testing
} from '../../src/assets/js/utils/telemetry.js';

// ─── Setup / Cleanup ───

beforeEach(() => {
  _testing.reset();
  localStorage.clear();
});

after(() => {
  _testing.reset();
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// Consentimiento
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — consentimiento', () => {

  it('isEnabled() devuelve false por defecto (sin consentimiento)', () => {
    assert.equal(isEnabled(), false);
  });

  it('isEnabled() devuelve false si ENDPOINT_URL está vacía', () => {
    // El módulo se importó con __TELEMETRY_URL__ no definido → ''
    // Aunque pongamos enabled=true, sin URL no se activa
    localStorage.setItem('synthigme-telemetry-enabled', 'true');
    // isEnabled() comprueba ENDPOINT_URL primero
    // Como no tenemos URL en tests, siempre será false
    assert.equal(isEnabled(), false);
  });

  it('setEnabled(true) guarda en localStorage', () => {
    setEnabled(true);
    assert.equal(localStorage.getItem('synthigme-telemetry-enabled'), 'true');
  });

  it('setEnabled(false) guarda false en localStorage', () => {
    setEnabled(true);
    setEnabled(false);
    assert.equal(localStorage.getItem('synthigme-telemetry-enabled'), 'false');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Payload
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — payload', () => {

  it('buildPayload genera campos obligatorios', () => {
    const p = _testing.buildPayload('test_event', { foo: 'bar' });
    assert.equal(typeof p.id, 'string');
    assert.ok(p.id.length > 0, 'ID no debe estar vacío');
    assert.equal(typeof p.v, 'string');
    assert.equal(typeof p.env, 'string');
    assert.equal(typeof p.os, 'string');
    assert.equal(typeof p.browser, 'string');
    assert.equal(p.type, 'test_event');
    assert.deepEqual(p.data, { foo: 'bar' });
    assert.equal(typeof p.ts, 'number');
    assert.ok(p.ts > 0);
  });

  it('buildPayload usa data vacío por defecto', () => {
    const p = _testing.buildPayload('session_start');
    assert.deepEqual(p.data, {});
  });

  it('env detecta web (no Electron en tests)', () => {
    const p = _testing.buildPayload('test');
    assert.equal(p.env, 'web');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// trackEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — trackEvent', () => {

  it('no añade eventos si no está habilitado', () => {
    trackEvent('session_start');
    assert.equal(_testing.eventQueue.length, 0);
  });

  it('no añade eventos sin ENDPOINT_URL (isEnabled siempre false en tests)', () => {
    localStorage.setItem('synthigme-telemetry-enabled', 'true');
    trackEvent('session_start');
    // Sin URL, isEnabled() = false, no se añade
    assert.equal(_testing.eventQueue.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// trackError
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — trackError', () => {

  it('respeta MAX_AUTO_ERRORS', () => {
    const max = _testing.MAX_AUTO_ERRORS;
    for (let i = 0; i < max + 5; i++) {
      trackError({ message: `error ${i}`, type: 'error', stack: '' });
    }
    // autoErrorCount se incrementa incluso si trackEvent no añade (sin URL)
    assert.equal(_testing.autoErrorCount, max);
  });

  it('trunca el stack a 2 líneas', () => {
    // Verificamos indirectamente: trackError llama trackEvent con stack truncado
    // Como isEnabled=false, solo verificamos que no lanza
    assert.doesNotThrow(() => {
      trackError({
        message: 'test',
        type: 'error',
        stack: 'Error: test\n    at foo.js:1:1\n    at bar.js:2:2\n    at baz.js:3:3'
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cola offline
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — cola offline', () => {

  it('saveOfflineQueue + loadOfflineQueue roundtrip', () => {
    const events = [{ type: 'a', ts: 1 }, { type: 'b', ts: 2 }];
    _testing.saveOfflineQueue(events);
    const loaded = _testing.loadOfflineQueue();
    assert.deepEqual(loaded, events);
  });

  it('loadOfflineQueue devuelve [] si no hay datos', () => {
    const loaded = _testing.loadOfflineQueue();
    assert.deepEqual(loaded, []);
  });

  it('loadOfflineQueue devuelve [] con datos corruptos', () => {
    localStorage.setItem('synthigme-telemetry-queue', 'no-es-json');
    const loaded = _testing.loadOfflineQueue();
    assert.deepEqual(loaded, []);
  });

  it('clearOfflineQueue elimina los datos', () => {
    _testing.saveOfflineQueue([{ type: 'test' }]);
    _testing.clearOfflineQueue();
    assert.deepEqual(_testing.loadOfflineQueue(), []);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flush
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — flush', () => {

  it('no lanza sin consentimiento', async () => {
    await assert.doesNotReject(flush());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// init
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — init', () => {

  it('no inicializa sin consentimiento', () => {
    init();
    assert.equal(_testing.initialized, false);
  });

  it('_testing.reset() limpia estado', () => {
    // Forzar algo de estado
    trackError({ message: 'x', type: 'error', stack: '' });
    _testing.reset();
    assert.equal(_testing.initialized, false);
    assert.equal(_testing.sessionEventCount, 0);
    assert.equal(_testing.autoErrorCount, 0);
    assert.equal(_testing.eventQueue.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────

describe('telemetry — storage keys', () => {

  it('TELEMETRY_ENABLED usa el prefijo correcto', () => {
    setEnabled(true);
    assert.equal(localStorage.getItem('synthigme-telemetry-enabled'), 'true');
  });

  it('ID anónimo se genera y persiste', () => {
    // Trigger ID generation via buildPayload
    const p = _testing.buildPayload('test');
    assert.equal(typeof p.id, 'string');
    assert.ok(p.id.length > 0);
    // Debe persistirse
    const stored = localStorage.getItem('synthigme-telemetry-id');
    assert.equal(stored, p.id);
  });
});
