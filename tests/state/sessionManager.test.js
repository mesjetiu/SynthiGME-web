/**
 * Tests para state/sessionManager.js — operaciones localStorage.
 *
 * Cubre las escrituras/lecturas directas a localStorage que serán
 * centralizadas en el refactor R6. Sirven de contrato para verificar
 * que el comportamiento se mantiene después del refactor.
 *
 * Los tests de restoreLastState() están en sessionRestore.test.js.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock de localStorage ───
import '../mocks/localStorage.mock.js';

// ─── Mock mínimo de window (requerido por logger) ───
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
}

// ─── Import del módulo real ───
import { sessionManager } from '../../src/assets/js/state/sessionManager.js';
import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

const KEY = STORAGE_KEYS.LAST_STATE;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clearStorage() {
  localStorage.clear();
}

function resetManager() {
  sessionManager.markClean();
  sessionManager.setSerializeCallback(null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('sessionManager — clearLastState', () => {
  beforeEach(() => {
    clearStorage();
    resetManager();
  });

  it('elimina el estado de localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ state: {}, timestamp: Date.now() }));

    sessionManager.clearLastState();

    assert.equal(localStorage.getItem(KEY), null);
  });

  it('no lanza si no hay estado guardado', () => {
    assert.doesNotThrow(() => sessionManager.clearLastState());
  });

  it('marca la sesión como clean', () => {
    sessionManager.markDirty();
    sessionManager.clearLastState();
    assert.equal(sessionManager.isDirty(), false);
  });
});

describe('sessionManager — getLastState', () => {
  beforeEach(() => {
    clearStorage();
    resetManager();
  });

  it('retorna null cuando no hay nada en localStorage', () => {
    assert.equal(sessionManager.getLastState(), null);
  });

  it('retorna el objeto parseado desde localStorage', () => {
    const payload = { state: { modules: { osc: 1 } }, timestamp: 12345, isAutoSave: true };
    localStorage.setItem(KEY, JSON.stringify(payload));

    const result = sessionManager.getLastState();
    assert.deepEqual(result, payload);
  });

  it('retorna null si el JSON está corrupto', () => {
    localStorage.setItem(KEY, 'no-es-json');
    assert.equal(sessionManager.getLastState(), null);
  });
});

describe('sessionManager — hasLastState', () => {
  beforeEach(() => {
    clearStorage();
    resetManager();
  });

  it('retorna false cuando no hay estado', () => {
    assert.equal(sessionManager.hasLastState(), false);
  });

  it('retorna true cuando hay estado guardado', () => {
    localStorage.setItem(KEY, JSON.stringify({ state: {}, timestamp: 0 }));
    assert.equal(sessionManager.hasLastState(), true);
  });

  it('retorna false después de clearLastState', () => {
    localStorage.setItem(KEY, JSON.stringify({ state: {}, timestamp: 0 }));
    sessionManager.clearLastState();
    assert.equal(sessionManager.hasLastState(), false);
  });
});

describe('sessionManager — _performAutoSave (escritura a localStorage)', () => {
  beforeEach(() => {
    clearStorage();
    resetManager();
  });

  it('no escribe si la sesión no está dirty', () => {
    sessionManager.setSerializeCallback(() => ({ modules: {} }));
    sessionManager._performAutoSave();

    assert.equal(localStorage.getItem(KEY), null);
  });

  it('no escribe si no hay serializeCallback', () => {
    sessionManager.markDirty();
    sessionManager._performAutoSave();

    assert.equal(localStorage.getItem(KEY), null);
  });

  it('escribe a localStorage cuando dirty y hay callback', () => {
    const state = { modules: { osc: { freq: 440 } } };
    sessionManager.setSerializeCallback(() => state);
    sessionManager.markDirty();
    sessionManager._performAutoSave();

    const raw = localStorage.getItem(KEY);
    assert.ok(raw, 'debe haber datos en localStorage');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.state, state);
    assert.ok(parsed.isAutoSave, 'debe marcar isAutoSave: true');
    assert.ok(parsed.timestamp > 0, 'debe incluir timestamp');
  });
});

describe('sessionManager — saveOnExit (escritura a localStorage)', () => {
  beforeEach(() => {
    clearStorage();
    resetManager();
  });

  it('no escribe si la sesión no está dirty', () => {
    sessionManager.setSerializeCallback(() => ({ modules: {} }));
    sessionManager.saveOnExit();

    assert.equal(localStorage.getItem(KEY), null);
  });

  it('no escribe si no hay serializeCallback', () => {
    sessionManager.markDirty();
    sessionManager.saveOnExit();

    assert.equal(localStorage.getItem(KEY), null);
  });

  it('escribe a localStorage cuando dirty y hay callback', () => {
    const state = { modules: { osc: { freq: 880 } } };
    sessionManager.setSerializeCallback(() => state);
    sessionManager.markDirty();
    sessionManager.saveOnExit();

    const raw = localStorage.getItem(KEY);
    assert.ok(raw, 'debe haber datos en localStorage');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.state, state);
    assert.ok(parsed.savedOnExit, 'debe marcar savedOnExit: true');
    assert.ok(parsed.timestamp > 0, 'debe incluir timestamp');
  });
});
