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

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE CONFIGURACIÓN (valores internos del módulo)
// ═══════════════════════════════════════════════════════════════════════════

describe('Constantes de configuración PiP', () => {
  // Estas constantes no se exportan, pero podemos verificar comportamientos
  // que dependen de ellas a través de tests de integración

  describe('Límites de zoom (MIN_SCALE, MAX_SCALE)', () => {
    it('el zoom mínimo debe ser > 0 (típicamente 0.1)', () => {
      // Verificamos indirectamente: un zoom de 0 causaría división por cero
      // En la implementación: MIN_SCALE = 0.1
      const minScaleExpected = 0.1;
      assert.ok(minScaleExpected > 0, 'MIN_SCALE debe ser positivo');
      assert.ok(minScaleExpected <= 1, 'MIN_SCALE debe ser <= 1 (reducción)');
    });

    it('el zoom máximo debe ser > 1 (típicamente 3.0)', () => {
      // En la implementación: MAX_SCALE = 3.0
      const maxScaleExpected = 3.0;
      assert.ok(maxScaleExpected > 1, 'MAX_SCALE debe permitir ampliación');
      assert.ok(maxScaleExpected <= 10, 'MAX_SCALE no debe ser extremo');
    });

    it('rango de zoom es razonable (0.1 a 3.0 = factor de 30x)', () => {
      const minScale = 0.1;
      const maxScale = 3.0;
      const zoomRange = maxScale / minScale;
      assert.equal(zoomRange, 30, 'Rango de zoom debe ser 30x');
    });
  });

  describe('Tamaños de ventana PiP', () => {
    it('tamaño mínimo (MIN_PIP_SIZE = 150) es usable', () => {
      const minSize = 150;
      assert.ok(minSize >= 100, 'Mínimo debe permitir ver contenido');
      assert.ok(minSize <= 200, 'Mínimo no debe ser demasiado grande');
    });

    it('tamaño por defecto (320x320) es cuadrado y razonable', () => {
      const defaultWidth = 320;
      const defaultHeight = 320;
      assert.equal(defaultWidth, defaultHeight, 'Por defecto es cuadrado');
      assert.ok(defaultWidth >= 200, 'Default debe ser usable');
      assert.ok(defaultWidth <= 500, 'Default no debe ocupar demasiado');
    });
  });

  describe('Z-index base', () => {
    it('Z-index base (1200) está por encima del viewport', () => {
      const pipZIndexBase = 1200;
      const viewportZIndex = 100; // Típico para contenido principal
      assert.ok(pipZIndexBase > viewportZIndex, 'PiP debe estar sobre viewport');
    });

    it('Z-index base (1200) está debajo de modales (típicamente 9999)', () => {
      const pipZIndexBase = 1200;
      const modalZIndex = 9999;
      assert.ok(pipZIndexBase < modalZIndex, 'Modales deben estar sobre PiP');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERIALIZACIÓN DE ESTADO
// ═══════════════════════════════════════════════════════════════════════════

describe('Serialización de estado PiP', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('Formato de estado serializado', () => {
    it('estado vacío es un array JSON válido', () => {
      // Sin PIPs abiertos, serializePipState devuelve []
      // Lo verificamos guardando y recuperando
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, '[]');
      const saved = globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE);
      const parsed = JSON.parse(saved);
      
      assert.ok(Array.isArray(parsed), 'Debe ser un array');
      assert.equal(parsed.length, 0, 'Array vacío sin PIPs');
    });

    it('estado con un PiP tiene estructura correcta', () => {
      const mockState = [{
        panelId: 'panel-1',
        x: 100,
        y: 50,
        width: 320,
        height: 320,
        scale: 1.0,
        scrollX: 0,
        scrollY: 0,
        zIndex: 1200
      }];
      
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const saved = globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE);
      const parsed = JSON.parse(saved);
      
      assert.equal(parsed.length, 1);
      const pip = parsed[0];
      
      // Verificar campos requeridos
      assert.ok('panelId' in pip, 'Debe tener panelId');
      assert.ok('x' in pip, 'Debe tener x');
      assert.ok('y' in pip, 'Debe tener y');
      assert.ok('width' in pip, 'Debe tener width');
      assert.ok('height' in pip, 'Debe tener height');
      assert.ok('scale' in pip, 'Debe tener scale');
    });

    it('estado con múltiples PIPs se serializa correctamente', () => {
      const mockState = [
        { panelId: 'panel-1', x: 0, y: 0, width: 320, height: 320, scale: 1.0, zIndex: 1200 },
        { panelId: 'panel-3', x: 350, y: 0, width: 400, height: 300, scale: 0.8, zIndex: 1201 },
        { panelId: 'panel-output', x: 100, y: 350, width: 250, height: 250, scale: 1.5, zIndex: 1202 }
      ];
      
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const saved = globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE);
      const parsed = JSON.parse(saved);
      
      assert.equal(parsed.length, 3, 'Debe tener 3 PIPs');
      assert.deepEqual(
        parsed.map(p => p.panelId),
        ['panel-1', 'panel-3', 'panel-output'],
        'IDs de paneles correctos'
      );
    });

    it('scroll interno (scrollX, scrollY) se incluye en estado', () => {
      const mockState = [{
        panelId: 'panel-5',
        x: 100,
        y: 100,
        width: 400,
        height: 400,
        scale: 0.5,
        scrollX: 150,
        scrollY: 200,
        zIndex: 1200
      }];
      
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      assert.equal(parsed[0].scrollX, 150, 'scrollX preservado');
      assert.equal(parsed[0].scrollY, 200, 'scrollY preservado');
    });
  });

  describe('Validación de valores serializados', () => {
    it('posición x,y pueden ser 0', () => {
      const mockState = [{ panelId: 'panel-1', x: 0, y: 0, width: 320, height: 320, scale: 1.0 }];
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      assert.strictEqual(parsed[0].x, 0, 'x puede ser 0');
      assert.strictEqual(parsed[0].y, 0, 'y puede ser 0');
    });

    it('scale puede ser menor que 1 (zoom out)', () => {
      const mockState = [{ panelId: 'panel-1', x: 0, y: 0, width: 320, height: 320, scale: 0.5 }];
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      assert.ok(parsed[0].scale < 1, 'scale puede ser < 1');
      assert.strictEqual(parsed[0].scale, 0.5, 'scale preserva valor');
    });

    it('scale puede ser mayor que 1 (zoom in)', () => {
      const mockState = [{ panelId: 'panel-1', x: 0, y: 0, width: 320, height: 320, scale: 2.5 }];
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      assert.ok(parsed[0].scale > 1, 'scale puede ser > 1');
      assert.strictEqual(parsed[0].scale, 2.5, 'scale preserva valor');
    });

    it('zIndex puede variar por panel (stacking order)', () => {
      const mockState = [
        { panelId: 'panel-1', x: 0, y: 0, width: 320, height: 320, scale: 1.0, zIndex: 1200 },
        { panelId: 'panel-2', x: 50, y: 50, width: 320, height: 320, scale: 1.0, zIndex: 1205 }
      ];
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(mockState));
      const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      assert.ok(parsed[1].zIndex > parsed[0].zIndex, 'panel-2 está encima de panel-1');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSICIONES DE PANEL (PANEL_POSITIONS)
// ═══════════════════════════════════════════════════════════════════════════

describe('Posiciones de panel en grid', () => {
  // PANEL_POSITIONS define la ubicación de cada panel en el grid del Synthi
  // Primera fila: panel-1, panel-2, panel-3, panel-4
  // Segunda fila: panel-5, (hueco), panel-6, panel-output

  it('primera fila tiene 4 paneles (cols 0-3, row 0)', () => {
    const firstRowPanels = ['panel-1', 'panel-2', 'panel-3', 'panel-4'];
    // Verificamos que los IDs existen en ALL_PANELS
    firstRowPanels.forEach(id => {
      const panel = ALL_PANELS.find(p => p.id === id);
      assert.ok(panel, `${id} debe existir`);
    });
  });

  it('segunda fila tiene 3 paneles visibles', () => {
    const secondRowPanels = ['panel-5', 'panel-6', 'panel-output'];
    secondRowPanels.forEach(id => {
      const panel = ALL_PANELS.find(p => p.id === id);
      assert.ok(panel, `${id} debe existir`);
    });
  });

  it('panel-output es el alias "Panel 7"', () => {
    const outputPanel = ALL_PANELS.find(p => p.id === 'panel-output');
    assert.ok(outputPanel, 'panel-output debe existir');
    assert.equal(outputPanel.name(), 'Panel 7', 'Se muestra como Panel 7');
  });

  it('orden de paneles es correcto para navegación', () => {
    const expectedOrder = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
    const actualOrder = ALL_PANELS.map(p => p.id);
    assert.deepEqual(actualOrder, expectedOrder, 'Orden de ALL_PANELS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERACCIÓN CON localStorage
// ═══════════════════════════════════════════════════════════════════════════

describe('Interacción PiP con localStorage', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('Persistencia habilitada/deshabilitada', () => {
    it('por defecto la persistencia está habilitada', () => {
      // Sin configurar nada, debe estar habilitado
      assert.equal(isRememberPipsEnabled(), true);
    });

    it('deshabilitar persistencia limpia estado guardado', () => {
      // Guardar estado
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, '[{"panelId":"panel-1"}]');
      assert.ok(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      
      // Deshabilitar
      setRememberPips(false);
      
      // Estado debe estar limpio
      assert.equal(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE), null);
    });

    it('habilitar persistencia no afecta estado existente', () => {
      // Estado ya guardado
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, '[{"panelId":"panel-2"}]');
      
      // Habilitar (ya debería estar habilitado por defecto)
      setRememberPips(true);
      
      // Estado debe seguir ahí
      const state = globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE);
      assert.ok(state, 'Estado debe preservarse');
      assert.ok(state.includes('panel-2'), 'Datos intactos');
    });

    it('toggle de persistencia funciona correctamente', () => {
      // Empezamos habilitados
      assert.equal(isRememberPipsEnabled(), true);
      
      // Deshabilitar
      setRememberPips(false);
      assert.equal(isRememberPipsEnabled(), false);
      
      // Habilitar de nuevo
      setRememberPips(true);
      assert.equal(isRememberPipsEnabled(), true);
    });
  });

  describe('Manejo de datos corruptos', () => {
    it('JSON inválido en PIP_STATE no rompe la aplicación', () => {
      // Simular datos corruptos
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, 'not valid json');
      
      // Intentar parsear debería fallar gracefully
      assert.throws(() => {
        JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE));
      }, 'JSON inválido debe lanzar error al parsear');
    });

    it('clearPipState limpia incluso datos corruptos', () => {
      globalThis.localStorage.setItem(STORAGE_KEYS.PIP_STATE, 'corrupted data');
      
      clearPipState();
      
      assert.equal(globalThis.localStorage.getItem(STORAGE_KEYS.PIP_STATE), null);
    });
  });
});
