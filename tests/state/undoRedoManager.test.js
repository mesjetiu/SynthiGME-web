/**
 * Tests para UndoRedoManager
 * 
 * Verifica el sistema de deshacer/rehacer global basado en snapshots:
 * - Gestión de pilas de undo/redo
 * - Deduplicación de snapshots idénticos
 * - Límite máximo de historial
 * - Limpieza de redo al crear nueva rama
 * - Listeners de cambio
 * - Flag _applying para evitar re-captura
 * 
 * @module tests/state/undoRedoManager.test
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { UndoRedoManager } from '../../src/assets/js/state/undoRedoManager.js';

describe('UndoRedoManager', () => {

  /** @type {UndoRedoManager} */
  let mgr;
  /** Estado simulado del sintetizador */
  let synthState;

  beforeEach(() => {
    mgr = new UndoRedoManager();
    synthState = { osc1: { freq: 440 }, osc2: { freq: 880 } };

    mgr.init(
      () => structuredClone(synthState),        // serialize
      (state) => { synthState = structuredClone(state); } // apply
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Estado inicial
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Estado inicial', () => {
    it('no debe tener undo disponible', () => {
      assert.strictEqual(mgr.canUndo, false);
      assert.strictEqual(mgr.undoCount, 0);
    });

    it('no debe tener redo disponible', () => {
      assert.strictEqual(mgr.canRedo, false);
      assert.strictEqual(mgr.redoCount, 0);
    });

    it('isApplying debe ser false', () => {
      assert.strictEqual(mgr.isApplying, false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // commitInteraction
  // ═══════════════════════════════════════════════════════════════════════════

  describe('commitInteraction', () => {
    it('registra un cambio en la pila de undo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      assert.strictEqual(mgr.canUndo, true);
      assert.strictEqual(mgr.undoCount, 1);
    });

    it('NO registra si el estado no cambió (deduplicación)', () => {
      // Sin cambiar nada
      mgr.commitInteraction();

      assert.strictEqual(mgr.canUndo, false);
      assert.strictEqual(mgr.undoCount, 0);
    });

    it('registra múltiples cambios consecutivos', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      synthState.osc1.freq = 600;
      mgr.commitInteraction();

      synthState.osc1.freq = 700;
      mgr.commitInteraction();

      assert.strictEqual(mgr.undoCount, 3);
    });

    it('limpia la pila de redo al registrar nuevo cambio', () => {
      // Crear historial
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      synthState.osc1.freq = 600;
      mgr.commitInteraction();

      // Hacer undo
      mgr.undo();
      assert.strictEqual(mgr.canRedo, true);

      // Nuevo cambio → redo se limpia
      synthState.osc1.freq = 999;
      mgr.commitInteraction();

      assert.strictEqual(mgr.canRedo, false);
      assert.strictEqual(mgr.redoCount, 0);
    });

    it('no registra si no se ha inicializado (sin serializeFn)', () => {
      const uninitMgr = new UndoRedoManager();
      // No llamar init()
      uninitMgr.commitInteraction();
      assert.strictEqual(uninitMgr.undoCount, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Límite de historial
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Límite de historial (MAX_HISTORY = 50)', () => {
    it('no supera 50 entradas en la pila de undo', () => {
      for (let i = 0; i < 60; i++) {
        synthState.osc1.freq = 440 + i;
        mgr.commitInteraction();
      }
      assert.strictEqual(mgr.undoCount, 50);
    });

    it('descarta los estados más antiguos primero (FIFO)', () => {
      // Llenar la pila
      for (let i = 0; i < 55; i++) {
        synthState.osc1.freq = 1000 + i;
        mgr.commitInteraction();
      }

      // Verificar que el estado actual se puede deshacer
      assert.strictEqual(mgr.undoCount, 50);

      // Deshacer varias veces y verificar que no se restaura freq=1000 (descartado)
      let undoCount = 0;
      while (mgr.undo()) undoCount++;

      assert.strictEqual(undoCount, 50);
      // Undo stack stores *previous* state before each change.
      // Change i (freq=1000+i) pushes freq=1000+(i-1) at iteration i.
      // After 55 changes, stack has 50 entries: the oldest surviving
      // is the one pushed at iteration 5 (push of freq=1004).
      assert.strictEqual(synthState.osc1.freq, 1004);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Undo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('undo()', () => {
    it('restaura el estado anterior', () => {
      const originalFreq = synthState.osc1.freq;
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, originalFreq);
    });

    it('retorna true cuando deshace algo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      assert.strictEqual(mgr.undo(), true);
    });

    it('retorna false cuando no hay nada que deshacer', () => {
      assert.strictEqual(mgr.undo(), false);
    });

    it('mueve el estado actual a la pila de redo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      mgr.undo();
      assert.strictEqual(mgr.canRedo, true);
      assert.strictEqual(mgr.redoCount, 1);
    });

    it('múltiples undos restauran estados correctamente', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      synthState.osc1.freq = 600;
      mgr.commitInteraction();
      synthState.osc1.freq = 700;
      mgr.commitInteraction();

      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, 600);

      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, 500);

      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, 440); // estado original
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Redo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('redo()', () => {
    it('restaura el estado deshecho', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      mgr.undo();

      mgr.redo();
      assert.strictEqual(synthState.osc1.freq, 500);
    });

    it('retorna true cuando rehace algo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      mgr.undo();

      assert.strictEqual(mgr.redo(), true);
    });

    it('retorna false cuando no hay nada que rehacer', () => {
      assert.strictEqual(mgr.redo(), false);
    });

    it('mueve el estado actual a la pila de undo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      mgr.undo();

      mgr.redo();
      assert.strictEqual(mgr.canUndo, true);
      assert.strictEqual(mgr.undoCount, 1);
    });

    it('múltiples redo tras múltiples undo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      synthState.osc1.freq = 600;
      mgr.commitInteraction();
      synthState.osc1.freq = 700;
      mgr.commitInteraction();

      mgr.undo(); // → 600
      mgr.undo(); // → 500
      mgr.undo(); // → 440

      mgr.redo(); // → 500
      assert.strictEqual(synthState.osc1.freq, 500);

      mgr.redo(); // → 600
      assert.strictEqual(synthState.osc1.freq, 600);

      mgr.redo(); // → 700
      assert.strictEqual(synthState.osc1.freq, 700);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Undo/Redo combinado
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Undo/Redo combinados', () => {
    it('undo + cambio nuevo descarta redo (nueva rama)', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      synthState.osc1.freq = 600;
      mgr.commitInteraction();

      mgr.undo(); // → 500
      assert.strictEqual(mgr.redoCount, 1);

      // Nueva rama: cambiar a 999
      synthState.osc1.freq = 999;
      mgr.commitInteraction();

      assert.strictEqual(mgr.canRedo, false);
      assert.strictEqual(mgr.undoCount, 2); // 440 y 500

      // Verificar que la rama vieja (600) se perdió
      mgr.undo(); // → 500
      assert.strictEqual(synthState.osc1.freq, 500);
      mgr.undo(); // → 440
      assert.strictEqual(synthState.osc1.freq, 440);
      assert.strictEqual(mgr.canUndo, false);
    });

    it('undo + redo ida y vuelta no pierde datos', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      // Ida y vuelta
      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, 440);
      mgr.redo();
      assert.strictEqual(synthState.osc1.freq, 500);
      mgr.undo();
      assert.strictEqual(synthState.osc1.freq, 440);
      mgr.redo();
      assert.strictEqual(synthState.osc1.freq, 500);

      // Las pilas deben estar coherentes
      assert.strictEqual(mgr.undoCount, 1);
      assert.strictEqual(mgr.redoCount, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // clear()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('clear()', () => {
    it('vacía ambas pilas', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      synthState.osc1.freq = 600;
      mgr.commitInteraction();
      mgr.undo();

      mgr.clear();

      assert.strictEqual(mgr.canUndo, false);
      assert.strictEqual(mgr.canRedo, false);
      assert.strictEqual(mgr.undoCount, 0);
      assert.strictEqual(mgr.redoCount, 0);
    });

    it('captura nuevo estado base tras limpiar', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      mgr.clear();

      // Sin cambiar nada → no debería registrar (misma base)
      mgr.commitInteraction();
      assert.strictEqual(mgr.undoCount, 0);

      // Cambiar → sí registra
      synthState.osc1.freq = 600;
      mgr.commitInteraction();
      assert.strictEqual(mgr.undoCount, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Flag _applying (protección contra re-captura)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Protección contra re-captura (_applying)', () => {
    it('commitInteraction se ignora mientras isApplying es true', () => {
      // Simular: applyFn dispara un evento que a su vez llama commitInteraction
      let reentrantCallDone = false;
      const mgr2 = new UndoRedoManager();
      let state2 = { val: 1 };

      mgr2.init(
        () => ({ ...state2 }),
        (s) => {
          state2 = { ...s };
          // Re-entrante: simular que algo llama commitInteraction durante apply
          state2.val = 9999; // cambio espurio
          mgr2.commitInteraction();
          reentrantCallDone = true;
        }
      );

      state2.val = 2;
      mgr2.commitInteraction();
      state2.val = 3;
      mgr2.commitInteraction();

      // Undo activa la re-entrada
      mgr2.undo();
      assert.ok(reentrantCallDone, 'la re-entrada debe haberse intentado');

      // Solo debería quedar 1 en undo (no 2 por la re-entrada)
      assert.strictEqual(mgr2.undoCount, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Listeners
  // ═══════════════════════════════════════════════════════════════════════════

  describe('onChange() listeners', () => {
    it('notifica al registrar cambio', () => {
      const calls = [];
      mgr.onChange((canUndo, canRedo) => calls.push({ canUndo, canRedo }));

      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].canUndo, true);
      assert.strictEqual(calls[0].canRedo, false);
    });

    it('notifica al hacer undo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      const calls = [];
      mgr.onChange((canUndo, canRedo) => calls.push({ canUndo, canRedo }));

      mgr.undo();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].canUndo, false);
      assert.strictEqual(calls[0].canRedo, true);
    });

    it('notifica al hacer redo', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      mgr.undo();

      const calls = [];
      mgr.onChange((canUndo, canRedo) => calls.push({ canUndo, canRedo }));

      mgr.redo();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].canUndo, true);
      assert.strictEqual(calls[0].canRedo, false);
    });

    it('unsubscribe detiene las notificaciones', () => {
      const calls = [];
      const unsub = mgr.onChange((canUndo, canRedo) => calls.push({ canUndo, canRedo }));

      synthState.osc1.freq = 500;
      mgr.commitInteraction();
      assert.strictEqual(calls.length, 1);

      unsub();

      synthState.osc1.freq = 600;
      mgr.commitInteraction();
      assert.strictEqual(calls.length, 1); // no cambió
    });

    it('notifica al hacer clear()', () => {
      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      const calls = [];
      mgr.onChange((canUndo, canRedo) => calls.push({ canUndo, canRedo }));

      mgr.clear();
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].canUndo, false);
      assert.strictEqual(calls[0].canRedo, false);
    });

    it('listener con error no rompe otros listeners', () => {
      let secondCalled = false;
      mgr.onChange(() => { throw new Error('fallo'); });
      mgr.onChange(() => { secondCalled = true; });

      synthState.osc1.freq = 500;
      mgr.commitInteraction();

      assert.ok(secondCalled, 'el segundo listener debe ejecutarse');
    });
  });
});
