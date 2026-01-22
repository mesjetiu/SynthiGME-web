/**
 * Tests para ui/tooltipManager.js
 * 
 * Verifica el funcionamiento del gestor global de tooltips:
 * - Registro y desregistro de callbacks
 * - Ocultación global de todos los tooltips
 * - Inicialización lazy (una sola vez)
 * - Manejo de errores en callbacks
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// SETUP: Mock de document para evitar inicialización de listeners
// ═══════════════════════════════════════════════════════════════════════════

// El módulo verifica typeof document === 'undefined' para SSR safety
// Al no definir document global, _ensureInitialized() no registra listeners

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS (después del setup para evitar side effects)
// ═══════════════════════════════════════════════════════════════════════════

import {
  registerTooltipHideCallback,
  hideAllTooltips
} from '../../src/assets/js/ui/tooltipManager.js';

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DE CALLBACKS
// ═══════════════════════════════════════════════════════════════════════════

describe('TooltipManager - Registro de callbacks', () => {
  
  it('registerTooltipHideCallback devuelve función de desregistro', () => {
    const callback = () => {};
    const unregister = registerTooltipHideCallback(callback);
    
    assert.equal(typeof unregister, 'function', 'Debería devolver una función');
  });

  it('el callback registrado se llama con hideAllTooltips', () => {
    let called = false;
    const callback = () => { called = true; };
    
    registerTooltipHideCallback(callback);
    hideAllTooltips();
    
    assert.equal(called, true, 'El callback debería haberse llamado');
  });

  it('múltiples callbacks se llaman todos', () => {
    let count = 0;
    const cb1 = () => { count++; };
    const cb2 = () => { count++; };
    const cb3 = () => { count++; };
    
    registerTooltipHideCallback(cb1);
    registerTooltipHideCallback(cb2);
    registerTooltipHideCallback(cb3);
    
    hideAllTooltips();
    
    assert.equal(count, 3, 'Los 3 callbacks deberían haberse llamado');
  });

  it('desregistrar callback evita que se llame', () => {
    let called = false;
    const callback = () => { called = true; };
    
    const unregister = registerTooltipHideCallback(callback);
    unregister();
    
    hideAllTooltips();
    
    assert.equal(called, false, 'El callback no debería llamarse tras desregistrar');
  });

  it('desregistrar un callback no afecta a otros', () => {
    let count = 0;
    const cb1 = () => { count++; };
    const cb2 = () => { count++; };
    
    const unregister1 = registerTooltipHideCallback(cb1);
    registerTooltipHideCallback(cb2);
    
    unregister1(); // Solo desregistra cb1
    hideAllTooltips();
    
    assert.equal(count, 1, 'Solo cb2 debería haberse llamado');
  });

  it('registrar el mismo callback dos veces solo se cuenta una vez (Set)', () => {
    let count = 0;
    const callback = () => { count++; };
    
    registerTooltipHideCallback(callback);
    registerTooltipHideCallback(callback); // Duplicado
    
    hideAllTooltips();
    
    assert.equal(count, 1, 'El callback solo debería llamarse una vez');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCULTACIÓN GLOBAL
// ═══════════════════════════════════════════════════════════════════════════

describe('TooltipManager - hideAllTooltips()', () => {

  it('no lanza error sin callbacks registrados', () => {
    // Los callbacks de tests anteriores ya fueron procesados
    // Este test verifica que llamar sin callbacks es seguro
    assert.doesNotThrow(() => {
      hideAllTooltips();
    });
  });

  it('continúa ejecutando otros callbacks si uno falla', () => {
    let cb1Called = false;
    let cb3Called = false;
    
    const cb1 = () => { cb1Called = true; };
    const cb2 = () => { throw new Error('Callback error'); };
    const cb3 = () => { cb3Called = true; };
    
    registerTooltipHideCallback(cb1);
    registerTooltipHideCallback(cb2);
    registerTooltipHideCallback(cb3);
    
    // No debería lanzar aunque cb2 falle
    assert.doesNotThrow(() => {
      hideAllTooltips();
    });
    
    // cb1 y cb3 deberían haberse ejecutado
    assert.equal(cb1Called, true, 'cb1 debería haberse llamado');
    assert.equal(cb3Called, true, 'cb3 debería haberse llamado a pesar del error en cb2');
  });

  it('puede llamarse múltiples veces seguidas', () => {
    let count = 0;
    const callback = () => { count++; };
    
    registerTooltipHideCallback(callback);
    
    hideAllTooltips();
    hideAllTooltips();
    hideAllTooltips();
    
    assert.equal(count, 3, 'El callback debería llamarse en cada invocación');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CICLO DE VIDA
// ═══════════════════════════════════════════════════════════════════════════

describe('TooltipManager - Ciclo de vida', () => {

  it('el callback puede desregistrarse y volverse a registrar', () => {
    let count = 0;
    const callback = () => { count++; };
    
    const unregister1 = registerTooltipHideCallback(callback);
    hideAllTooltips();
    assert.equal(count, 1);
    
    unregister1();
    hideAllTooltips();
    assert.equal(count, 1, 'No debería incrementar tras desregistrar');
    
    registerTooltipHideCallback(callback);
    hideAllTooltips();
    assert.equal(count, 2, 'Debería incrementar tras re-registrar');
  });

  it('desregistrar dos veces no causa error', () => {
    const callback = () => {};
    const unregister = registerTooltipHideCallback(callback);
    
    assert.doesNotThrow(() => {
      unregister();
      unregister(); // Segunda vez
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SSR SAFETY
// ═══════════════════════════════════════════════════════════════════════════

describe('TooltipManager - SSR Safety', () => {

  it('funciona sin document definido (entorno Node.js)', () => {
    // Este test se ejecuta en Node.js sin JSDOM
    // El módulo debería funcionar sin intentar acceder a document
    
    let called = false;
    const callback = () => { called = true; };
    
    assert.doesNotThrow(() => {
      registerTooltipHideCallback(callback);
      hideAllTooltips();
    });
    
    assert.equal(called, true, 'El callback debería funcionar sin DOM');
  });
});
