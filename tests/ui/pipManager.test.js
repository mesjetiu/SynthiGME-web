/**
 * Tests para ui/pipManager.js
 * 
 * Verifica el funcionamiento del sistema de paneles flotantes (PiP):
 * - Constantes exportadas (ALL_PANELS, PANEL_ORDER)
 * - Funciones de estado (getOpenPips, isPipped, getActivePips)
 * - Funciones de persistencia (serializePipState, isRememberPipsEnabled)
 * - Lógica de apertura/cierre (sin DOM real)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DE localStorage (necesario antes de importar pipManager)
// ═══════════════════════════════════════════════════════════════════════════

globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

import {
  ALL_PANELS,
  getOpenPips,
  isPipped,
  getActivePips,
  isRememberPipsEnabled,
  setRememberPips,
  clearPipState
} from '../../src/assets/js/ui/pipManager.js';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES EXPORTADAS
// ═══════════════════════════════════════════════════════════════════════════

describe('Constantes de PipManager', () => {
  describe('ALL_PANELS', () => {
    it('contiene 7 paneles', () => {
      assert.equal(ALL_PANELS.length, 7);
    });

    it('cada panel tiene id y name()', () => {
      ALL_PANELS.forEach(panel => {
        assert.ok(panel.id, 'Panel debe tener id');
        assert.ok(typeof panel.name === 'function', 'Panel debe tener name como función');
      });
    });

    it('incluye panel-1 a panel-6 y panel-output', () => {
      const ids = ALL_PANELS.map(p => p.id);
      assert.ok(ids.includes('panel-1'), 'Debería incluir panel-1');
      assert.ok(ids.includes('panel-2'), 'Debería incluir panel-2');
      assert.ok(ids.includes('panel-3'), 'Debería incluir panel-3');
      assert.ok(ids.includes('panel-4'), 'Debería incluir panel-4');
      assert.ok(ids.includes('panel-5'), 'Debería incluir panel-5');
      assert.ok(ids.includes('panel-6'), 'Debería incluir panel-6');
      assert.ok(ids.includes('panel-output'), 'Debería incluir panel-output');
    });

    it('los nombres son "Panel X" (sin descripciones)', () => {
      const names = ALL_PANELS.map(p => p.name());
      assert.equal(names[0], 'Panel 1');
      assert.equal(names[1], 'Panel 2');
      assert.equal(names[6], 'Panel 7'); // panel-output
    });

    it('panel-output se muestra como Panel 7', () => {
      const outputPanel = ALL_PANELS.find(p => p.id === 'panel-output');
      assert.equal(outputPanel.name(), 'Panel 7');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ESTADO (sin DOM)
// ═══════════════════════════════════════════════════════════════════════════

describe('Funciones de estado PiP', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('getOpenPips()', () => {
    it('devuelve un array', () => {
      const result = getOpenPips();
      assert.ok(Array.isArray(result), 'Debería devolver un array');
    });

    it('inicialmente está vacío (no hay PIPs abiertos)', () => {
      const result = getOpenPips();
      assert.equal(result.length, 0, 'Sin inicialización no hay PIPs');
    });
  });

  describe('isPipped()', () => {
    it('devuelve false para paneles no extraídos', () => {
      assert.equal(isPipped('panel-1'), false);
      assert.equal(isPipped('panel-5'), false);
      assert.equal(isPipped('panel-output'), false);
    });

    it('devuelve false para IDs inválidos', () => {
      assert.equal(isPipped('invalid-panel'), false);
      assert.equal(isPipped(''), false);
      assert.equal(isPipped(null), false);
    });
  });

  describe('getActivePips()', () => {
    it('devuelve un array', () => {
      const result = getActivePips();
      assert.ok(Array.isArray(result), 'Debería devolver un array');
    });

    it('es equivalente a getOpenPips()', () => {
      const open = getOpenPips();
      const active = getActivePips();
      assert.deepEqual(open, active);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE PERSISTENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Persistencia de PiP', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('isRememberPipsEnabled()', () => {
    it('devuelve true por defecto', () => {
      assert.equal(isRememberPipsEnabled(), true);
    });

    it('devuelve false si está deshabilitado', () => {
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_REMEMBER, 'false');
      assert.equal(isRememberPipsEnabled(), false);
    });

    it('devuelve true si está explícitamente habilitado', () => {
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_REMEMBER, 'true');
      assert.equal(isRememberPipsEnabled(), true);
    });
  });

  describe('setRememberPips()', () => {
    it('guarda true en localStorage', () => {
      setRememberPips(true);
      assert.equal(
        globalThis.localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER),
        'true'
      );
    });

    it('guarda false en localStorage', () => {
      setRememberPips(false);
      assert.equal(
        globalThis.localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER),
        'false'
      );
    });

    it('al deshabilitar, limpia el estado guardado', () => {
      // Simular estado guardado
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, '[]');
      
      setRememberPips(false);
      
      // Debería haber llamado clearPipState()
      assert.equal(
        globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE),
        null
      );
    });
  });

  describe('clearPipState()', () => {
    it('elimina el estado guardado de localStorage', () => {
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, '[{"panelId":"panel-1"}]');
      
      clearPipState();
      
      assert.equal(
        globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE),
        null
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE_KEYS RELACIONADOS
// ═══════════════════════════════════════════════════════════════════════════

describe('STORAGE_KEYS para PiP', () => {
  it('PIP_STATE existe y tiene formato correcto', () => {
    assert.ok(STORAGE_KEYS.PIP_STATE, 'Debería existir PIP_STATE');
    assert.ok(
      STORAGE_KEYS.PIP_STATE.startsWith('synthigme-'),
      'Debería tener prefijo synthigme-'
    );
  });

  it('PIP_REMEMBER existe y tiene formato correcto', () => {
    assert.ok(STORAGE_KEYS.PIP_REMEMBER, 'Debería existir PIP_REMEMBER');
    assert.ok(
      STORAGE_KEYS.PIP_REMEMBER.startsWith('synthigme-'),
      'Debería tener prefijo synthigme-'
    );
  });
});
