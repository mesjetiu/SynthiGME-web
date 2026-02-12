/**
 * Tests para utils/errorHandler.js
 * 
 * Verifica el sistema de captura global de errores:
 * - Ring buffer con límite de capacidad
 * - Deduplicación por hash con cooldown
 * - Notificación a listeners suscritos
 * - API pública (getErrorBuffer, getErrorCount, reportError, onError)
 */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// Mock mínimo de window para que initErrorHandler() pueda funcionar
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    onerror: null,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

import {
  initErrorHandler,
  onError,
  getErrorBuffer,
  getErrorCount,
  reportError,
  _testing
} from '../../src/assets/js/utils/errorHandler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _testing.reset();
});

// Limpieza final: asegurar que el setInterval de cleanupHashes se cancele
// para que el child process de node --test pueda terminar
after(() => {
  _testing.reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// initErrorHandler
// ─────────────────────────────────────────────────────────────────────────────

describe('initErrorHandler', () => {
  it('debe marcar como inicializado tras la primera llamada', () => {
    assert.equal(_testing.initialized, false);
    initErrorHandler();
    assert.equal(_testing.initialized, true);
  });

  it('debe ser idempotente (no reinicializar)', () => {
    initErrorHandler();
    assert.equal(_testing.initialized, true);
    // Segunda llamada no debe lanzar
    initErrorHandler();
    assert.equal(_testing.initialized, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reportError (API manual)
// ─────────────────────────────────────────────────────────────────────────────

describe('reportError', () => {
  it('debe añadir un error al buffer', () => {
    reportError('Test error');
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].message, 'Test error');
    assert.equal(buffer[0].type, 'manual');
  });

  it('debe incrementar el contador de errores', () => {
    assert.equal(getErrorCount(), 0);
    reportError('Error 1');
    assert.equal(getErrorCount(), 1);
    // Segundo error diferente
    reportError('Error 2');
    assert.equal(getErrorCount(), 2);
  });

  it('debe aceptar detalles opcionales', () => {
    reportError('Error con detalles', {
      stack: 'at foo.js:1:1',
      source: 'testModule',
      type: 'custom'
    });
    const entry = getErrorBuffer()[0];
    assert.equal(entry.stack, 'at foo.js:1:1');
    assert.equal(entry.source, 'testModule');
    assert.equal(entry.type, 'custom');
  });

  it('debe incluir timestamp y hash', () => {
    const before = Date.now();
    reportError('Error timestamped');
    const entry = getErrorBuffer()[0];
    assert.ok(entry.ts >= before);
    assert.ok(entry.ts <= Date.now());
    assert.ok(typeof entry.hash === 'string');
    assert.ok(entry.hash.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ring buffer
// ─────────────────────────────────────────────────────────────────────────────

describe('Ring buffer', () => {
  it(`debe limitar el buffer a ${_testing.MAX_BUFFER_SIZE} entradas`, () => {
    // Insertar más errores que el límite (cada uno diferente para evitar dedup)
    for (let i = 0; i < _testing.MAX_BUFFER_SIZE + 20; i++) {
      reportError(`Error único ${i}`, { stack: `stack-${i}` });
    }
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, _testing.MAX_BUFFER_SIZE);
    // El primer error debe ser el 20 (los primeros 20 fueron eliminados)
    assert.equal(buffer[0].message, 'Error único 20');
  });

  it('debe retornar una copia del buffer (inmutable)', () => {
    reportError('Error original');
    const buf1 = getErrorBuffer();
    buf1.push({ message: 'intruso' });
    const buf2 = getErrorBuffer();
    assert.equal(buf2.length, 1);
    assert.equal(buf2[0].message, 'Error original');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deduplicación
// ─────────────────────────────────────────────────────────────────────────────

describe('Deduplicación', () => {
  it('debe ignorar errores idénticos dentro del cooldown', () => {
    reportError('Error repetido', { stack: 'same-stack' });
    reportError('Error repetido', { stack: 'same-stack' });
    reportError('Error repetido', { stack: 'same-stack' });
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1, 'Solo el primer error debe estar en el buffer');
    // Pero el counter total sí aumenta
    assert.equal(getErrorCount(), 3);
  });

  it('debe aceptar errores con diferente stack como distintos', () => {
    reportError('Error A', { stack: 'stack-A' });
    reportError('Error A', { stack: 'stack-B' });
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Listeners (onError)
// ─────────────────────────────────────────────────────────────────────────────

describe('onError listeners', () => {
  it('debe notificar a listeners cuando se reporta un error', () => {
    const received = [];
    onError((entry) => received.push(entry));
    
    reportError('Listener test');
    
    assert.equal(received.length, 1);
    assert.equal(received[0].message, 'Listener test');
  });

  it('debe soportar múltiples listeners', () => {
    let count1 = 0, count2 = 0;
    onError(() => count1++);
    onError(() => count2++);
    
    reportError('Multi listener');
    
    assert.equal(count1, 1);
    assert.equal(count2, 1);
  });

  it('debe permitir desuscribirse', () => {
    let count = 0;
    const unsub = onError(() => count++);
    
    reportError('Antes de unsub');
    assert.equal(count, 1);
    
    unsub();
    reportError('Después de unsub', { stack: 'different' });
    assert.equal(count, 1, 'No debe recibir más después de unsub');
  });

  it('un listener roto no debe romper otros listeners', () => {
    const received = [];
    onError(() => { throw new Error('listener roto'); });
    onError((entry) => received.push(entry));
    
    // No debe lanzar
    reportError('Survives broken listener');
    assert.equal(received.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleWindowError (handler de window.onerror)
// ─────────────────────────────────────────────────────────────────────────────

describe('handleWindowError', () => {
  it('debe capturar errores con formato window.onerror', () => {
    _testing.handleWindowError(
      'Uncaught TypeError: x is not a function',
      'app.js',
      42,
      10,
      new TypeError('x is not a function')
    );
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].type, 'error');
    assert.equal(buffer[0].source, 'app.js');
    assert.equal(buffer[0].line, 42);
    assert.equal(buffer[0].col, 10);
    assert.ok(buffer[0].stack.length > 0);
  });

  it('debe funcionar sin objeto Error (solo string)', () => {
    _testing.handleWindowError('Script error.', '', 0, 0, null);
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].message, 'Script error.');
    assert.equal(buffer[0].stack, '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleUnhandledRejection
// ─────────────────────────────────────────────────────────────────────────────

describe('handleUnhandledRejection', () => {
  it('debe capturar rejections con Error', () => {
    const error = new Error('Promise failed');
    _testing.handleUnhandledRejection({ reason: error });
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].type, 'unhandledrejection');
    assert.equal(buffer[0].message, 'Promise failed');
    assert.ok(buffer[0].stack.length > 0);
  });

  it('debe capturar rejections con string', () => {
    _testing.handleUnhandledRejection({ reason: 'Simple rejection' });
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].message, 'Simple rejection');
  });

  it('debe capturar rejections sin reason', () => {
    _testing.handleUnhandledRejection({ reason: undefined });
    
    const buffer = getErrorBuffer();
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].message, 'Promise rejection');
  });
});
