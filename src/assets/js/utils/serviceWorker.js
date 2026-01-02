// Módulo de registro del Service Worker
// Gestiona actualizaciones y prompts al usuario

import { t } from '../i18n/index.js';

/** Referencia al registro del SW */
let swRegistration = null;

/** Worker en espera de activación */
let waitingWorker = null;

/** Evita recargas múltiples */
let refreshing = false;

/** Callbacks para notificar cuando hay actualización disponible */
const updateCallbacks = [];

/**
 * Registra un callback para ser notificado cuando hay actualización disponible
 * @param {Function} callback
 * @returns {Function} Función para cancelar la suscripción
 */
export function onUpdateAvailable(callback) {
  updateCallbacks.push(callback);
  // Si ya hay una actualización pendiente, notificar inmediatamente
  if (waitingWorker || swRegistration?.waiting) {
    callback(true);
  }
  return () => {
    const idx = updateCallbacks.indexOf(callback);
    if (idx >= 0) updateCallbacks.splice(idx, 1);
  };
}

/**
 * Notifica a todos los listeners que hay actualización
 */
function notifyUpdateAvailable() {
  updateCallbacks.forEach(cb => {
    try { cb(true); } catch (e) { console.error('[SW] Error en callback:', e); }
  });
}

/**
 * Registra el Service Worker y gestiona actualizaciones.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const promptUserToRefresh = worker => {
    if (!worker || !navigator.serviceWorker.controller) return;
    waitingWorker = worker;
    notifyUpdateAvailable();
    
    const shouldUpdate = window.confirm(t('update.available'));
    if (shouldUpdate) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => {
      swRegistration = registration;
      
      if (registration.update) {
        registration.update().catch(() => {});
      }

      if (registration.waiting) {
        waitingWorker = registration.waiting;
        notifyUpdateAvailable();
        promptUserToRefresh(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            promptUserToRefresh(newWorker);
          }
        });
      });
    })
    .catch(error => {
      console.error('No se pudo registrar el service worker.', error);
    });
}

/**
 * Busca actualizaciones manualmente.
 * @returns {Promise<{found: boolean, waiting: boolean, error?: string}>}
 */
export async function checkForUpdates() {
  if (!swRegistration) {
    return { found: false, waiting: false, error: 'no-sw' };
  }
  
  try {
    await swRegistration.update();
    
    // Dar tiempo para que el SW pase a "installed" si hay actualización
    await new Promise(r => setTimeout(r, 1000));
    
    const hasWaiting = !!swRegistration.waiting;
    if (hasWaiting) {
      waitingWorker = swRegistration.waiting;
      notifyUpdateAvailable();
    }
    
    return { found: hasWaiting, waiting: hasWaiting };
  } catch (err) {
    console.error('[SW] Error checking for updates:', err);
    return { found: false, waiting: false, error: err.message };
  }
}

/**
 * Aplica una actualización pendiente (si existe).
 * @returns {boolean} true si había un SW waiting
 */
export function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }
  
  if (swRegistration?.waiting) {
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }
  
  return false;
}

/**
 * Verifica si hay una actualización pendiente.
 * @returns {boolean}
 */
export function hasWaitingUpdate() {
  return !!(waitingWorker || swRegistration?.waiting);
}

