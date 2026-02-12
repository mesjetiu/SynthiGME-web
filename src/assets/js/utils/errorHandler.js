/**
 * Manejador global de errores no capturados.
 * 
 * Instala `window.onerror` y `unhandledrejection` para recolectar errores
 * que escapan de los try/catch locales. Almacena un ring buffer en memoria
 * con deduplicación y cooldown para evitar floods.
 * 
 * Este módulo NO muestra nada al usuario — solo recolecta. Los consumidores
 * (telemetría, UI) se suscriben vía `onError()`.
 * 
 * @module utils/errorHandler
 */

import { createLogger } from './logger.js';

const log = createLogger('ErrorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Máximo de errores almacenados en el ring buffer */
const MAX_BUFFER_SIZE = 50;

/** Cooldown mínimo entre errores idénticos (ms) */
const DEDUP_COOLDOWN_MS = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Estado interno
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Array<ErrorEntry>} Ring buffer de errores */
const errorBuffer = [];

/** @type {Map<string, number>} Hash → timestamp del último reporte (dedup) */
const recentHashes = new Map();

/** @type {Set<function>} Suscriptores de errores */
const listeners = new Set();

/** Total de errores capturados (incluyendo deduplicados) */
let totalErrorCount = 0;

/** Flag para evitar doble inicialización */
let initialized = false;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ErrorEntry
 * @property {number} ts - Timestamp (Date.now())
 * @property {string} message - Mensaje del error
 * @property {string} [stack] - Stack trace (si disponible)
 * @property {string} [source] - Archivo fuente
 * @property {number} [line] - Línea del error
 * @property {number} [col] - Columna del error
 * @property {string} type - 'error' | 'unhandledrejection'
 * @property {string} hash - Hash para deduplicación
 */

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades internas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un hash simple a partir de un string para deduplicación.
 * No necesita ser criptográficamente seguro.
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convertir a entero de 32 bits
  }
  return hash.toString(36);
}

/**
 * Extrae un hash de deduplicación de un error.
 * Usa el stack si está disponible, o mensaje + fuente + línea.
 * @param {string} message
 * @param {string} [stack]
 * @param {string} [source]
 * @param {number} [line]
 * @returns {string}
 */
function getErrorHash(message, stack, source, line) {
  const key = stack || `${message}:${source || ''}:${line || ''}`;
  return simpleHash(key);
}

/**
 * Comprueba si un error con este hash fue reportado recientemente.
 * @param {string} hash
 * @returns {boolean} true si debe ignorarse (dedup)
 */
function isDuplicate(hash) {
  const lastTime = recentHashes.get(hash);
  if (lastTime && (Date.now() - lastTime) < DEDUP_COOLDOWN_MS) {
    return true;
  }
  recentHashes.set(hash, Date.now());
  return false;
}

/**
 * Limpia hashes antiguos para evitar crecimiento ilimitado del Map.
 * Se ejecuta periódicamente.
 */
function cleanupHashes() {
  const now = Date.now();
  for (const [hash, time] of recentHashes) {
    if (now - time > DEDUP_COOLDOWN_MS * 10) {
      recentHashes.delete(hash);
    }
  }
}

/**
 * Añade un error al ring buffer y notifica a listeners.
 * @param {ErrorEntry} entry
 */
function pushError(entry) {
  // Ring buffer: eliminar el más antiguo si lleno
  if (errorBuffer.length >= MAX_BUFFER_SIZE) {
    errorBuffer.shift();
  }
  errorBuffer.push(entry);

  // Notificar a suscriptores
  for (const cb of listeners) {
    try {
      cb(entry);
    } catch (e) {
      // Evitar que un listener roto rompa el handler de errores
      console.error('[ErrorHandler] Error en listener:', e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers globales
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler para window.onerror (errores JS síncronos no capturados).
 * @param {string} message
 * @param {string} source
 * @param {number} line
 * @param {number} col
 * @param {Error} error
 */
function handleWindowError(message, source, line, col, error) {
  totalErrorCount++;

  const stack = error?.stack || '';
  const hash = getErrorHash(message, stack, source, line);

  if (isDuplicate(hash)) return;

  const entry = {
    ts: Date.now(),
    message: String(message),
    stack,
    source,
    line,
    col,
    type: 'error',
    hash
  };

  log.error('Error no capturado:', message, source ? `(${source}:${line}:${col})` : '');
  pushError(entry);
}

/**
 * Handler para unhandledrejection (Promises rechazadas sin catch).
 * @param {PromiseRejectionEvent} event
 */
function handleUnhandledRejection(event) {
  totalErrorCount++;

  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason || 'Promise rejection');
  const stack = reason instanceof Error ? reason.stack : '';
  const hash = getErrorHash(message, stack);

  if (isDuplicate(hash)) return;

  const entry = {
    ts: Date.now(),
    message,
    stack,
    source: '',
    line: 0,
    col: 0,
    type: 'unhandledrejection',
    hash
  };

  log.error('Promise no capturada:', message);
  pushError(entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa los handlers globales de errores.
 * Seguro llamar múltiples veces (idempotente).
 */
export function initErrorHandler() {
  if (initialized) return;
  if (typeof window === 'undefined') return; // SSR/tests sin DOM

  window.onerror = handleWindowError;
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  // Limpieza periódica del mapa de dedup
  setInterval(cleanupHashes, DEDUP_COOLDOWN_MS * 20);

  initialized = true;
  log.info('Handlers globales de errores instalados');
}

/**
 * Suscribe un callback que será invocado con cada error nuevo.
 * Usado por el módulo de telemetría para enviar errores.
 * @param {function(ErrorEntry): void} callback
 * @returns {function} Función para desuscribirse
 */
export function onError(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Retorna una copia del ring buffer de errores.
 * @returns {Array<ErrorEntry>}
 */
export function getErrorBuffer() {
  return [...errorBuffer];
}

/**
 * Retorna el total de errores capturados desde el inicio
 * (incluyendo los filtrados por dedup).
 * @returns {number}
 */
export function getErrorCount() {
  return totalErrorCount;
}

/**
 * Registra un error manualmente (desde código que ya captura errores
 * pero quiere alimentar el ring buffer / telemetría).
 * Útil para processorerror de worklets, fallos de audio, etc.
 * 
 * @param {string} message - Descripción del error
 * @param {Object} [details] - Detalles adicionales
 * @param {string} [details.stack] - Stack trace
 * @param {string} [details.source] - Módulo o archivo origen
 * @param {string} [details.type] - Tipo de error (default: 'manual')
 */
export function reportError(message, details = {}) {
  totalErrorCount++;

  const stack = details.stack || '';
  const source = details.source || '';
  const hash = getErrorHash(message, stack, source);

  if (isDuplicate(hash)) return;

  const entry = {
    ts: Date.now(),
    message: String(message),
    stack,
    source,
    line: 0,
    col: 0,
    type: details.type || 'manual',
    hash
  };

  pushError(entry);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports para testing
// ─────────────────────────────────────────────────────────────────────────────

/** @internal Solo para tests */
export const _testing = {
  get initialized() { return initialized; },
  reset() {
    initialized = false;
    errorBuffer.length = 0;
    recentHashes.clear();
    listeners.clear();
    totalErrorCount = 0;
  },
  handleWindowError,
  handleUnhandledRejection,
  MAX_BUFFER_SIZE,
  DEDUP_COOLDOWN_MS
};
