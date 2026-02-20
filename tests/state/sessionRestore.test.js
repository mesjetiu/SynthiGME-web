/**
 * Tests para protección de session restore en sessionManager.js
 * 
 * Verifica que:
 * - restoreLastState() captura errores del callback sin propagarlos
 * - Estado corrupto se limpia automáticamente tras error
 * - La restauración normal sigue funcionando correctamente
 * 
 * Fase 2 del plan de telemetría.
 */
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock de localStorage ───
import '../mocks/localStorage.mock.js';

// ─── Mock de window (para logger) ───
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

// ─── Importar sessionManager ───
import { sessionManager } from '../../src/assets/js/state/sessionManager.js';

// ─── Helpers ───
const STORAGE_KEY = 'synthigme-last-state';

function setStoredState(state, timestamp = Date.now()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    state,
    timestamp,
    isAutoSave: true
  }));
}

function clearStorage() {
  localStorage.clear();
}

/**
 * Espera a que el setTimeout interno de restoreLastState se ejecute.
 * restoreLastState usa setTimeout(fn, 500), esperamos un poco más.
 */
function waitForRestore(ms = 600) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('sessionManager.restoreLastState — protección de errores', () => {
  
  beforeEach(() => {
    clearStorage();
  });
  
  it('no debe lanzar error cuando el callback falla', async () => {
    setStoredState({ modules: { osc: { freq: 440 } } });
    
    sessionManager.setRestoreCallback(async () => {
      throw new Error('callback explosivo');
    });
    
    // No debe lanzar
    await sessionManager.restoreLastState();
    await waitForRestore();
    
    // Si llegamos aquí, no explotó
    assert.ok(true, 'No lanzó excepción');
  });
  
  it('debe limpiar el estado tras error del callback', async () => {
    setStoredState({ modules: { osc: { freq: 440 } } });
    
    sessionManager.setRestoreCallback(async () => {
      throw new Error('estado corrupto');
    });
    
    await sessionManager.restoreLastState();
    await waitForRestore();
    
    // El estado debe haberse limpiado
    const remaining = localStorage.getItem(STORAGE_KEY);
    assert.equal(remaining, null, 'Estado corrupto debe haberse eliminado');
  });
  
  it('restauración exitosa no limpia el estado', async () => {
    const testState = { modules: { osc: { freq: 880 } } };
    setStoredState(testState);
    
    let receivedPatch = null;
    sessionManager.setRestoreCallback(async (patch) => {
      receivedPatch = patch;
    });
    
    await sessionManager.restoreLastState();
    await waitForRestore();
    
    // Callback recibió los datos
    assert.ok(receivedPatch, 'Callback debe recibir el patch');
    assert.deepEqual(receivedPatch.modules, testState.modules);
    
    // Estado se mantiene (no se limpió)
    const remaining = localStorage.getItem(STORAGE_KEY);
    assert.ok(remaining, 'Estado debe mantenerse tras restauración exitosa');
  });
  
  it('no hace nada sin callback configurado', async () => {
    setStoredState({ modules: {} });
    
    sessionManager.setRestoreCallback(null);
    
    // No debe lanzar
    await sessionManager.restoreLastState();
    assert.ok(true, 'No lanzó sin callback');
  });
  
  it('no hace nada sin estado guardado', async () => {
    let called = false;
    sessionManager.setRestoreCallback(async () => {
      called = true;
    });
    
    await sessionManager.restoreLastState();
    await waitForRestore();
    
    assert.ok(!called, 'Callback no debe ejecutarse sin estado');
  });
});
