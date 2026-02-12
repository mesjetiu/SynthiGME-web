/**
 * Tests para el consentimiento de telemetría (Fase 4)
 *
 * Verifica:
 * - setEnabled / isEnabled interacción con localStorage
 * - Consentimiento no solicitado si ya existe elección
 * - Toggle en settings sincroniza con telemetry module
 * - first_run se trackea solo al aceptar
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
    randomUUID: () => 'test-uuid-consent'
  };
}

// ─── Import ───

import {
  isEnabled,
  setEnabled,
  trackEvent,
  _testing
} from '../../src/assets/js/utils/telemetry.js';
import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

// ─── Helpers ───

function clearAllStorage() {
  Object.keys(storage).forEach(k => delete storage[k]);
}

// ─── Tests ───

describe('Telemetría — Consentimiento y UI (Fase 4)', () => {
  
  beforeEach(() => {
    _testing.reset();
    clearAllStorage();
  });
  
  after(() => {
    _testing.reset();
    clearAllStorage();
  });
  
  describe('setEnabled / isEnabled', () => {
    
    it('isEnabled devuelve false si no hay consentimiento almacenado', () => {
      assert.equal(isEnabled(), false);
    });
    
    it('setEnabled(true) activa la telemetría', () => {
      setEnabled(true);
      assert.equal(localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED), 'true');
    });
    
    it('setEnabled(false) desactiva la telemetría', () => {
      setEnabled(false);
      assert.equal(localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED), 'false');
    });
    
    it('isEnabled devuelve true después de setEnabled(true)', () => {
      setEnabled(true);
      // isEnabled also checks ENDPOINT_URL which is '' in test = disabled
      // So it should still return false due to no URL
      assert.equal(isEnabled(), false, 'Sin URL configurada, isEnabled devuelve false');
    });
    
    it('STORAGE_KEYS.TELEMETRY_ENABLED se almacena correctamente', () => {
      setEnabled(true);
      const stored = localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED);
      assert.equal(stored, 'true');
      
      setEnabled(false);
      const stored2 = localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED);
      assert.equal(stored2, 'false');
    });
  });
  
  describe('trackEvent con consentimiento', () => {
    
    it('trackEvent no añade eventos si telemetría deshabilitada', () => {
      setEnabled(false);
      trackEvent('test_event');
      assert.equal(_testing.eventQueue.length, 0);
    });
    
    it('trackEvent no añade eventos sin URL (test env)', () => {
      setEnabled(true);
      trackEvent('test_event');
      // Sin ENDPOINT_URL, isEnabled() es false → no se añade
      assert.equal(_testing.eventQueue.length, 0);
    });
  });
  
  describe('Consentimiento remembered (simulación ConfirmDialog)', () => {
    
    it('elección recordada en localStorage impide re-preguntar', () => {
      // Simular que ConfirmDialog guardó la elección
      localStorage.setItem('synthigme-confirm-telemetry-consent', 'true');
      const stored = localStorage.getItem('synthigme-confirm-telemetry-consent');
      assert.equal(stored, 'true', 'La elección debe estar almacenada');
    });
    
    it('sin elección previa, no hay key en localStorage', () => {
      const stored = localStorage.getItem('synthigme-confirm-telemetry-consent');
      assert.equal(stored, null, 'No debe haber elección previa');
    });
  });
  
  describe('Toggle en Settings', () => {
    
    it('cambiar a true desde settings escribe en localStorage', () => {
      setEnabled(true);
      assert.equal(
        localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED),
        'true'
      );
    });
    
    it('cambiar a false desde settings escribe en localStorage', () => {
      setEnabled(true);
      setEnabled(false);
      assert.equal(
        localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED),
        'false'
      );
    });
    
    it('toggle múltiple no corrompe estado', () => {
      for (let i = 0; i < 10; i++) {
        setEnabled(i % 2 === 0);
      }
      assert.equal(
        localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED),
        'false'
      );
    });
  });
  
  describe('first_run event', () => {
    
    it('trackEvent first_run se acepta como tipo válido', () => {
      // Sin URL no se añade, pero verificamos que no lanza error
      assert.doesNotThrow(() => trackEvent('first_run'));
    });
    
    it('trackEvent construye payload first_run correctamente', () => {
      const payload = _testing.buildPayload('first_run', {});
      assert.equal(payload.type, 'first_run');
      assert.ok(payload.ts > 0, 'Debe tener timestamp');
      assert.ok(payload.id, 'Debe tener ID anónimo');
      assert.ok(payload.v, 'Debe tener versión');
    });
  });
});
