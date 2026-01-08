/**
 * Gestor de Wake Lock para mantener la pantalla encendida.
 * Usa la Screen Wake Lock API cuando está disponible.
 * 
 * @module utils/wakeLock
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 */

import { createLogger } from './logger.js';

const log = createLogger('WakeLock');

/**
 * Gestiona el Screen Wake Lock para evitar que la pantalla se apague.
 * 
 * Características:
 * - Se re-adquiere automáticamente cuando la página vuelve a ser visible
 * - Maneja errores gracefully (batería baja, modo ahorro de energía)
 * - Persiste la preferencia del usuario en localStorage
 */
export class WakeLockManager {
  /**
   * @param {Object} options
   * @param {string} options.storageKey - Clave para persistir en localStorage
   * @param {Function} [options.onStateChange] - Callback cuando cambia el estado del lock
   */
  constructor({ storageKey, onStateChange }) {
    this.storageKey = storageKey;
    this.onStateChange = onStateChange;
    
    /** @type {WakeLockSentinel|null} */
    this.sentinel = null;
    
    /** @type {boolean} Si el usuario quiere mantener la pantalla encendida */
    this.enabled = this._loadPreference();
    
    /** @type {boolean} Si el lock está actualmente activo */
    this.isActive = false;
    
    // Configurar listener de visibilidad para re-adquirir el lock
    this._setupVisibilityHandler();
    
    // Si está habilitado por defecto, intentar adquirir al crear
    if (this.enabled && WakeLockManager.isSupported()) {
      this._acquire();
    }
  }
  
  /**
   * Comprueba si la Wake Lock API está soportada en el navegador actual.
   * @returns {boolean}
   */
  static isSupported() {
    return 'wakeLock' in navigator;
  }
  
  /**
   * Habilita el wake lock (mantener pantalla encendida).
   * @returns {Promise<boolean>} true si se adquirió correctamente
   */
  async enable() {
    this.enabled = true;
    this._savePreference(true);
    
    if (!WakeLockManager.isSupported()) {
      log.warn('Wake Lock API not supported');
      return false;
    }
    
    return this._acquire();
  }
  
  /**
   * Deshabilita el wake lock (permite que la pantalla se apague).
   * @returns {Promise<void>}
   */
  async disable() {
    this.enabled = false;
    this._savePreference(false);
    return this._release();
  }
  
  /**
   * Obtiene si el wake lock está habilitado por el usuario.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }
  
  /**
   * Obtiene si el wake lock está actualmente activo.
   * @returns {boolean}
   */
  isLockActive() {
    return this.isActive;
  }
  
  /**
   * Adquiere el wake lock.
   * @private
   * @returns {Promise<boolean>}
   */
  async _acquire() {
    if (!WakeLockManager.isSupported() || !this.enabled) {
      return false;
    }
    
    // No intentar si el documento no está visible
    if (document.visibilityState !== 'visible') {
      return false;
    }
    
    // Ya tenemos un lock activo
    if (this.sentinel && !this.sentinel.released) {
      return true;
    }
    
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.isActive = true;
      
      log.info('Wake lock acquired');
      
      // Escuchar cuando el sistema libera el lock
      this.sentinel.addEventListener('release', () => {
        this.isActive = false;
        log.info('Wake lock released by system');
        this.onStateChange?.(false);
      });
      
      this.onStateChange?.(true);
      return true;
    } catch (err) {
      // Puede fallar por batería baja, modo ahorro de energía, etc.
      this.isActive = false;
      log.warn('Failed to acquire wake lock:', err.message);
      return false;
    }
  }
  
  /**
   * Libera el wake lock.
   * @private
   * @returns {Promise<void>}
   */
  async _release() {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
        log.info('Wake lock released');
      } catch (err) {
        log.warn('Error releasing wake lock:', err.message);
      }
      this.sentinel = null;
      this.isActive = false;
      this.onStateChange?.(false);
    }
  }
  
  /**
   * Configura el listener para re-adquirir el lock cuando la página vuelve a ser visible.
   * @private
   */
  _setupVisibilityHandler() {
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && this.enabled) {
        await this._acquire();
      }
    });
  }
  
  /**
   * Carga la preferencia del usuario desde localStorage.
   * Por defecto está habilitado (true).
   * @private
   * @returns {boolean}
   */
  _loadPreference() {
    const saved = localStorage.getItem(this.storageKey);
    // Por defecto habilitado (true) si no hay valor guardado
    return saved === null ? true : saved === 'true';
  }
  
  /**
   * Guarda la preferencia del usuario en localStorage.
   * @private
   * @param {boolean} enabled
   */
  _savePreference(enabled) {
    localStorage.setItem(this.storageKey, String(enabled));
  }
  
  /**
   * Limpia recursos (para cleanup).
   */
  destroy() {
    this._release();
  }
}
