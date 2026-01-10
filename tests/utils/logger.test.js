/**
 * Tests para utils/logger.js
 * 
 * Verifica el sistema de logging centralizado.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  LogLevel,
  setLogLevel,
  getLogLevel,
  createLogger
} from '../../src/assets/js/utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Setup: Mock de console para capturar logs
// ─────────────────────────────────────────────────────────────────────────────

let capturedLogs = [];
let capturedWarns = [];
let capturedErrors = [];

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

before(() => {
  console.log = (...args) => capturedLogs.push(args);
  console.warn = (...args) => capturedWarns.push(args);
  console.error = (...args) => capturedErrors.push(args);
});

after(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

beforeEach(() => {
  capturedLogs = [];
  capturedWarns = [];
  capturedErrors = [];
  setLogLevel(LogLevel.INFO); // Reset a nivel default
});

// ─────────────────────────────────────────────────────────────────────────────
// LogLevel constantes
// ─────────────────────────────────────────────────────────────────────────────

describe('LogLevel', () => {
  it('NONE es 0', () => {
    assert.strictEqual(LogLevel.NONE, 0);
  });

  it('ERROR es 1', () => {
    assert.strictEqual(LogLevel.ERROR, 1);
  });

  it('WARN es 2', () => {
    assert.strictEqual(LogLevel.WARN, 2);
  });

  it('INFO es 3', () => {
    assert.strictEqual(LogLevel.INFO, 3);
  });

  it('DEBUG es 4', () => {
    assert.strictEqual(LogLevel.DEBUG, 4);
  });

  it('los niveles están ordenados de menor a mayor verbosidad', () => {
    assert.ok(LogLevel.NONE < LogLevel.ERROR);
    assert.ok(LogLevel.ERROR < LogLevel.WARN);
    assert.ok(LogLevel.WARN < LogLevel.INFO);
    assert.ok(LogLevel.INFO < LogLevel.DEBUG);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setLogLevel / getLogLevel
// ─────────────────────────────────────────────────────────────────────────────

describe('setLogLevel / getLogLevel', () => {
  it('setLogLevel cambia el nivel', () => {
    setLogLevel(LogLevel.DEBUG);
    assert.strictEqual(getLogLevel(), LogLevel.DEBUG);
  });

  it('acepta todos los niveles válidos', () => {
    for (const level of [LogLevel.NONE, LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG]) {
      setLogLevel(level);
      assert.strictEqual(getLogLevel(), level);
    }
  });

  it('ignora valores fuera de rango (negativos)', () => {
    setLogLevel(LogLevel.INFO);
    setLogLevel(-1);
    assert.strictEqual(getLogLevel(), LogLevel.INFO);
  });

  it('ignora valores fuera de rango (mayores que DEBUG)', () => {
    setLogLevel(LogLevel.INFO);
    setLogLevel(100);
    assert.strictEqual(getLogLevel(), LogLevel.INFO);
  });

  it('ignora valores no numéricos', () => {
    setLogLevel(LogLevel.INFO);
    setLogLevel('debug');
    assert.strictEqual(getLogLevel(), LogLevel.INFO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createLogger
// ─────────────────────────────────────────────────────────────────────────────

describe('createLogger', () => {
  it('retorna un objeto con métodos de logging', () => {
    const log = createLogger('Test');
    assert.ok(typeof log.debug === 'function');
    assert.ok(typeof log.log === 'function');
    assert.ok(typeof log.info === 'function');
    assert.ok(typeof log.warn === 'function');
    assert.ok(typeof log.error === 'function');
  });

  it('info() incluye el prefijo en corchetes', () => {
    const log = createLogger('MyModule');
    log.info('mensaje');
    
    assert.strictEqual(capturedLogs.length, 1);
    assert.strictEqual(capturedLogs[0][0], '[MyModule]');
    assert.strictEqual(capturedLogs[0][1], 'mensaje');
  });

  it('log() es alias de info()', () => {
    const log = createLogger('Test');
    log.log('mensaje via log');
    
    assert.strictEqual(capturedLogs.length, 1);
    assert.strictEqual(capturedLogs[0][1], 'mensaje via log');
  });

  it('warn() usa console.warn', () => {
    const log = createLogger('Test');
    log.warn('advertencia');
    
    assert.strictEqual(capturedWarns.length, 1);
    assert.strictEqual(capturedWarns[0][0], '[Test]');
    assert.strictEqual(capturedWarns[0][1], 'advertencia');
  });

  it('error() usa console.error', () => {
    const log = createLogger('Test');
    log.error('error crítico');
    
    assert.strictEqual(capturedErrors.length, 1);
    assert.strictEqual(capturedErrors[0][0], '[Test]');
    assert.strictEqual(capturedErrors[0][1], 'error crítico');
  });

  it('acepta múltiples argumentos', () => {
    const log = createLogger('Test');
    log.info('valor1', 'valor2', 123);
    
    assert.strictEqual(capturedLogs[0].length, 4); // tag + 3 args
    assert.strictEqual(capturedLogs[0][1], 'valor1');
    assert.strictEqual(capturedLogs[0][2], 'valor2');
    assert.strictEqual(capturedLogs[0][3], 123);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado por nivel
// ─────────────────────────────────────────────────────────────────────────────

describe('Filtrado por nivel', () => {
  it('nivel NONE no muestra nada', () => {
    setLogLevel(LogLevel.NONE);
    const log = createLogger('Test');
    
    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');
    
    assert.strictEqual(capturedLogs.length, 0);
    assert.strictEqual(capturedWarns.length, 0);
    assert.strictEqual(capturedErrors.length, 0);
  });

  it('nivel ERROR solo muestra errores', () => {
    setLogLevel(LogLevel.ERROR);
    const log = createLogger('Test');
    
    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');
    
    assert.strictEqual(capturedLogs.length, 0);
    assert.strictEqual(capturedWarns.length, 0);
    assert.strictEqual(capturedErrors.length, 1);
  });

  it('nivel WARN muestra warn y error', () => {
    setLogLevel(LogLevel.WARN);
    const log = createLogger('Test');
    
    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');
    
    assert.strictEqual(capturedLogs.length, 0);
    assert.strictEqual(capturedWarns.length, 1);
    assert.strictEqual(capturedErrors.length, 1);
  });

  it('nivel INFO muestra info, warn y error', () => {
    setLogLevel(LogLevel.INFO);
    const log = createLogger('Test');
    
    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');
    
    assert.strictEqual(capturedLogs.length, 1);
    assert.strictEqual(capturedWarns.length, 1);
    assert.strictEqual(capturedErrors.length, 1);
  });

  it('nivel DEBUG muestra todo', () => {
    setLogLevel(LogLevel.DEBUG);
    const log = createLogger('Test');
    
    log.debug('debug');
    log.info('info');
    log.warn('warn');
    log.error('error');
    
    assert.strictEqual(capturedLogs.length, 2); // debug + info
    assert.strictEqual(capturedWarns.length, 1);
    assert.strictEqual(capturedErrors.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Múltiples loggers
// ─────────────────────────────────────────────────────────────────────────────

describe('Múltiples loggers', () => {
  it('cada logger tiene su propio prefijo', () => {
    const log1 = createLogger('Module1');
    const log2 = createLogger('Module2');
    
    log1.info('desde 1');
    log2.info('desde 2');
    
    assert.strictEqual(capturedLogs[0][0], '[Module1]');
    assert.strictEqual(capturedLogs[1][0], '[Module2]');
  });

  it('comparten el mismo nivel de log global', () => {
    const log1 = createLogger('A');
    const log2 = createLogger('B');
    
    setLogLevel(LogLevel.ERROR);
    
    log1.info('no aparece');
    log2.info('tampoco');
    log1.error('sí aparece');
    log2.error('también');
    
    assert.strictEqual(capturedLogs.length, 0);
    assert.strictEqual(capturedErrors.length, 2);
  });
});
