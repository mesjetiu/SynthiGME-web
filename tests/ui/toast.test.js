/**
 * Tests para ui/toast.js
 * 
 * Verifica el sistema unificado de toasts con niveles de severidad:
 * - Creación dinámica del elemento toast
 * - Soporte para duración numérica (backwards compatible)
 * - Soporte para objeto de opciones { duration, level }
 * - Clases CSS por nivel (success, warning, error)
 * - Reemplazo de toast anterior al mostrar uno nuevo
 * 
 * NOTA: No se mockea setTimeout/clearTimeout para no romper el test runner.
 * En su lugar, verificamos el comportamiento observable (DOM, clases CSS).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock mínimo de DOM (solo si no existe) ───
if (typeof globalThis.document === 'undefined') {
  const elements = {};
  
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        _classes: new Set(),
        classList: {
          add(...classes) { classes.forEach(c => el._classes.add(c)); },
          remove(...classes) { classes.forEach(c => el._classes.delete(c)); },
          contains(c) { return el._classes.has(c); }
        }
      };
      return el;
    },
    body: {
      appendChild(el) {
        if (el.id) elements[el.id] = el;
      }
    }
  };
}

// ─── Importar toast ───
import { showToast } from '../../src/assets/js/ui/toast.js';

// ─── Helpers ───
function getToastElement() {
  return globalThis.document.getElementById('appToast');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('showToast — sistema unificado', () => {
  
  it('debe crear el elemento toast si no existe', () => {
    showToast('Hola');
    const toast = getToastElement();
    assert.ok(toast, 'Elemento toast debe existir');
    assert.equal(toast.id, 'appToast');
  });
  
  it('debe mostrar el mensaje en el toast', () => {
    showToast('Mensaje de prueba');
    const toast = getToastElement();
    assert.equal(toast.textContent, 'Mensaje de prueba');
  });
  
  it('debe añadir la clase visible', () => {
    showToast('Visible');
    const toast = getToastElement();
    assert.ok(toast._classes.has('toast--visible'), 'Debe tener clase toast--visible');
  });
  
  describe('backwards compatible — duración numérica', () => {
    it('debe aceptar duración como número sin lanzar error', () => {
      assert.doesNotThrow(() => showToast('Test', 3000));
    });
    
    it('debe funcionar sin segundo argumento', () => {
      assert.doesNotThrow(() => showToast('Test'));
    });
  });
  
  describe('opciones de objeto', () => {
    it('debe aceptar { duration, level } sin lanzar error', () => {
      assert.doesNotThrow(() => showToast('Test', { duration: 5000, level: 'error' }));
    });
    
    it('debe aceptar solo { level }', () => {
      assert.doesNotThrow(() => showToast('Test', { level: 'warning' }));
    });
  });
  
  describe('niveles de severidad', () => {
    it('info: sin clase de nivel extra', () => {
      showToast('Info', { level: 'info' });
      const toast = getToastElement();
      assert.ok(!toast._classes.has('toast--success'));
      assert.ok(!toast._classes.has('toast--warning'));
      assert.ok(!toast._classes.has('toast--error'));
    });
    
    it('success: clase toast--success', () => {
      showToast('OK', { level: 'success' });
      const toast = getToastElement();
      assert.ok(toast._classes.has('toast--success'));
    });
    
    it('warning: clase toast--warning', () => {
      showToast('Cuidado', { level: 'warning' });
      const toast = getToastElement();
      assert.ok(toast._classes.has('toast--warning'));
    });
    
    it('error: clase toast--error', () => {
      showToast('Fallo', { level: 'error' });
      const toast = getToastElement();
      assert.ok(toast._classes.has('toast--error'));
    });
    
    it('debe limpiar clases de nivel previas', () => {
      showToast('Error', { level: 'error' });
      const toast = getToastElement();
      assert.ok(toast._classes.has('toast--error'));
      
      showToast('Info');
      assert.ok(!toast._classes.has('toast--error'), 'Clase error debe desaparecer');
    });
    
    it('debe cambiar de nivel correctamente', () => {
      showToast('Success', { level: 'success' });
      const toast = getToastElement();
      assert.ok(toast._classes.has('toast--success'));
      
      showToast('Warning', { level: 'warning' });
      assert.ok(!toast._classes.has('toast--success'), 'Success debe desaparecer');
      assert.ok(toast._classes.has('toast--warning'), 'Warning debe aparecer');
    });
    
    it('nivel desconocido no añade clase extra', () => {
      showToast('Test', { level: 'unknown' });
      const toast = getToastElement();
      assert.ok(!toast._classes.has('toast--success'));
      assert.ok(!toast._classes.has('toast--warning'));
      assert.ok(!toast._classes.has('toast--error'));
    });
  });
  
  describe('reemplazo de toast', () => {
    it('debe actualizar el texto al mostrar un nuevo toast', () => {
      showToast('Primero');
      showToast('Segundo');
      const toast = getToastElement();
      assert.equal(toast.textContent, 'Segundo');
    });
  });
});
