/**
 * Módulo de telemetría anónima mínima.
 *
 * Envía eventos agregados (errores, sesiones) a un endpoint configurable
 * (Google Apps Script) respetando estrictamente el consentimiento del usuario.
 *
 * Principios:
 * - **Opt-in explícito**: no envía nada sin consentimiento almacenado
 * - **Sin datos personales**: ID anónimo (randomUUID), sin IP, sin contenido
 * - **Offline-first**: cola local en localStorage, flush al reconectar
 * - **Rate limited**: máximo N eventos por sesión para evitar floods
 * - **sendBeacon en cierre**: último intento al cerrar pestaña / app
 *
 * La URL del endpoint se inyecta en build como `__TELEMETRY_URL__`.
 * Si está vacía, el módulo se desactiva silenciosamente.
 *
 * @module utils/telemetry
 */

import { createLogger } from './logger.js';
import { STORAGE_KEYS } from './constants.js';
import { onError } from './errorHandler.js';

const log = createLogger('Telemetry');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** URL del endpoint (inyectada en build, vacía = desactivado) */
const ENDPOINT_URL = typeof __TELEMETRY_URL__ !== 'undefined' ? __TELEMETRY_URL__ : '';

/** Versión de la app (inyectada en build) */
const APP_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';

/** Máximo de eventos por sesión (rate limit) */
const MAX_EVENTS_PER_SESSION = 20;

/** Intervalo de flush automático (ms) */
const FLUSH_INTERVAL_MS = 30_000;

/** Máximo de eventos en cola offline */
const MAX_OFFLINE_QUEUE = 50;

/** Máximo de errores auto-reportados por sesión */
const MAX_AUTO_ERRORS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Estado interno
// ─────────────────────────────────────────────────────────────────────────────

/** Cola de eventos en memoria pendientes de envío */
let eventQueue = [];

/** Contador de eventos enviados esta sesión */
let sessionEventCount = 0;

/** Contador de errores auto-reportados esta sesión */
let autoErrorCount = 0;

/** ID del intervalo de flush */
let flushIntervalId = null;

/** Flag de inicialización */
let initialized = false;

/** Función para desuscribirse de errorHandler */
let unsubError = null;

// ─────────────────────────────────────────────────────────────────────────────
// Detección de entorno
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta el entorno de ejecución.
 * @returns {'electron'|'web'}
 */
function detectEnv() {
  if (typeof window !== 'undefined' && window.electronAPI) return 'electron';
  return 'web';
}

/**
 * Detecta el SO del usuario (sin versión, solo familia).
 * @returns {string}
 */
function detectOS() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'unknown';
}

/**
 * Detecta el navegador (familia sin versión exacta).
 * @returns {string}
 */
function detectBrowser() {
  if (typeof navigator === 'undefined') return 'unknown';
  if (detectEnv() === 'electron') return 'Electron';
  const ua = navigator.userAgent || '';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// ID anónimo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene o genera un ID anónimo persistente.
 * @returns {string}
 */
function getAnonymousId() {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.TELEMETRY_ID);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEYS.TELEMETRY_ID, id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consentimiento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comprueba si la telemetría está habilitada (consentimiento + URL configurada).
 * @returns {boolean}
 */
export function isEnabled() {
  if (!ENDPOINT_URL) return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED) === 'true';
  } catch {
    return false;
  }
}

/**
 * Establece el estado de consentimiento.
 * @param {boolean} enabled
 */
export function setEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEYS.TELEMETRY_ENABLED, String(!!enabled));
    if (enabled && !initialized) {
      init();
    }
  } catch {
    // localStorage no disponible
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cola offline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga la cola offline desde localStorage.
 * @returns {Array}
 */
function loadOfflineQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TELEMETRY_QUEUE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Guarda la cola offline en localStorage.
 * @param {Array} queue
 */
function saveOfflineQueue(queue) {
  try {
    const trimmed = queue.slice(-MAX_OFFLINE_QUEUE);
    localStorage.setItem(STORAGE_KEYS.TELEMETRY_QUEUE, JSON.stringify(trimmed));
  } catch {
    // Storage lleno o no disponible
  }
}

/**
 * Limpia la cola offline.
 */
function clearOfflineQueue() {
  try {
    localStorage.removeItem(STORAGE_KEYS.TELEMETRY_QUEUE);
  } catch {
    // Ignorar
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envío de eventos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye el payload base de un evento.
 * @param {string} type - Tipo de evento
 * @param {Object} [data] - Datos específicos del evento
 * @returns {Object}
 */
function buildPayload(type, data = {}) {
  return {
    id: getAnonymousId(),
    v: APP_VERSION,
    env: detectEnv(),
    os: detectOS(),
    browser: detectBrowser(),
    type,
    data,
    ts: Date.now()
  };
}

/**
 * Envía un lote de payloads al endpoint.
 * @param {Array<Object>} payloads
 * @returns {Promise<boolean>} true si se envió correctamente
 */
async function sendBatch(payloads) {
  if (!ENDPOINT_URL || payloads.length === 0) return false;

  try {
    const response = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: payloads }),
      // No enviar cookies ni credenciales
      credentials: 'omit'
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Envío best-effort con sendBeacon (para cierre de pestaña).
 * @param {Array<Object>} payloads
 */
function sendBeaconBatch(payloads) {
  if (!ENDPOINT_URL || payloads.length === 0) return;
  try {
    const blob = new Blob(
      [JSON.stringify({ events: payloads })],
      { type: 'application/json' }
    );
    navigator.sendBeacon(ENDPOINT_URL, blob);
  } catch {
    // Best effort — no hay fallback
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flush
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envía todos los eventos pendientes (memoria + offline).
 * @returns {Promise<void>}
 */
export async function flush() {
  if (!isEnabled()) return;

  // Combinar cola offline + cola en memoria
  const offlineEvents = loadOfflineQueue();
  const allEvents = [...offlineEvents, ...eventQueue];
  eventQueue = [];

  if (allEvents.length === 0) return;

  const success = await sendBatch(allEvents);
  if (success) {
    clearOfflineQueue();
    log.debug(`Flush: ${allEvents.length} eventos enviados`);
  } else {
    // Guardar todo en offline para reintentar
    saveOfflineQueue(allEvents);
    log.debug('Flush fallido, eventos guardados offline');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra un evento de telemetría.
 * @param {string} type - Tipo de evento (session_start, error, worklet_fail, etc.)
 * @param {Object} [data] - Datos adicionales del evento
 */
export function trackEvent(type, data = {}) {
  if (!isEnabled()) return;
  if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return;

  const payload = buildPayload(type, data);
  eventQueue.push(payload);
  sessionEventCount++;

  // Si estamos offline, persistir inmediatamente
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    saveOfflineQueue([...loadOfflineQueue(), ...eventQueue]);
    eventQueue = [];
  }
}

/**
 * Registra un error para telemetría (llamado desde errorHandler vía onError).
 * @param {Object} errorEntry - ErrorEntry del errorHandler
 */
export function trackError(errorEntry) {
  if (autoErrorCount >= MAX_AUTO_ERRORS) return;
  autoErrorCount++;

  trackEvent('error', {
    message: errorEntry.message,
    type: errorEntry.type,
    source: errorEntry.source || '',
    // No enviar stack completo (puede contener paths del usuario)
    // Solo las primeras 2 líneas del stack para contexto
    stack: (errorEntry.stack || '').split('\n').slice(0, 2).join('\n')
  });
}

/**
 * Inicializa el sistema de telemetría.
 * Conecta con errorHandler, configura flush periódico y listeners de ciclo de vida.
 * Seguro llamar múltiples veces (idempotente).
 */
export function init() {
  if (initialized) return;
  if (!isEnabled()) return;

  initialized = true;

  // Suscribirse a errores globales
  unsubError = onError(trackError);

  // Flush periódico
  flushIntervalId = setInterval(flush, FLUSH_INTERVAL_MS);

  // Flush al perder visibilidad (usuario cambia de pestaña / cierra)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // sendBeacon es más fiable que fetch cuando se cierra la pestaña
        const offlineEvents = loadOfflineQueue();
        const allEvents = [...offlineEvents, ...eventQueue];
        eventQueue = [];
        if (allEvents.length > 0) {
          sendBeaconBatch(allEvents);
          clearOfflineQueue();
        }
      }
    });
  }

  // Flush cuando se recupera la conexión
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flush().catch(() => {});
    });
  }

  log.info('Telemetría inicializada');
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports para testing
// ─────────────────────────────────────────────────────────────────────────────

/** @internal Solo para tests */
export const _testing = {
  get initialized() { return initialized; },
  get sessionEventCount() { return sessionEventCount; },
  get autoErrorCount() { return autoErrorCount; },
  get eventQueue() { return eventQueue; },
  get ENDPOINT_URL() { return ENDPOINT_URL; },
  get MAX_EVENTS_PER_SESSION() { return MAX_EVENTS_PER_SESSION; },
  get MAX_AUTO_ERRORS() { return MAX_AUTO_ERRORS; },
  buildPayload,
  sendBatch,
  loadOfflineQueue,
  saveOfflineQueue,
  clearOfflineQueue,
  reset() {
    if (flushIntervalId !== null) {
      clearInterval(flushIntervalId);
      flushIntervalId = null;
    }
    if (unsubError) {
      unsubError();
      unsubError = null;
    }
    initialized = false;
    eventQueue = [];
    sessionEventCount = 0;
    autoErrorCount = 0;
  }
};
