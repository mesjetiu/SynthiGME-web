/**
 * Gestor de sesión y autoguardado.
 * 
 * Maneja el ciclo de vida de la sesión del usuario:
 * - Tracking de cambios (dirty/clean state)
 * - Autoguardado periódico
 * - Guardado al cerrar la aplicación
 * - Restauración del último estado
 * 
 * @module state/sessionManager
 */

import { createLogger } from '../utils/logger.js';
import { STORAGE_KEYS } from '../utils/constants.js';

const log = createLogger('SessionManager');

/**
 * Gestor de sesión singleton.
 */
class SessionManager {
  constructor() {
    /** @private */
    this._dirty = false;
    /** @private */
    this._autoSaveTimer = null;
    /** @private */
    this._applyingPatch = false;
    /** @private @type {Function|null} */
    this._serializeCallback = null;
  }

  /**
   * Configura el callback para serializar el estado actual.
   * @param {Function} callback - Función que retorna el estado serializado
   */
  setSerializeCallback(callback) {
    this._serializeCallback = callback;
  }

  /**
   * Configura el autoguardado periódico.
   * @param {number} intervalMs - Intervalo en milisegundos (0 = desactivado)
   */
  configureAutoSave(intervalMs) {
    // Limpiar timer anterior
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    
    if (intervalMs > 0) {
      this._autoSaveTimer = setInterval(() => {
        this._performAutoSave();
      }, intervalMs);
      log.info(` Autosave configured: every ${intervalMs / 1000}s`);
    } else {
      log.info(' Autosave disabled');
    }
  }

  /**
   * Realiza el autoguardado del estado actual.
   * Solo guarda si la sesión tiene cambios pendientes.
   * @private
   */
  _performAutoSave() {
    if (!this._dirty || !this._serializeCallback) {
      return;
    }
    
    try {
      const state = this._serializeCallback();
      localStorage.setItem(STORAGE_KEYS.LAST_STATE, JSON.stringify({
        timestamp: Date.now(),
        state,
        isAutoSave: true
      }));
      log.info(' State auto-saved');
    } catch (err) {
      log.warn(' Autosave failed:', err);
    }
  }

  /**
   * Guarda el estado al cerrar la aplicación.
   * Solo guarda si hay cambios pendientes.
   */
  saveOnExit() {
    if (!this._dirty || !this._serializeCallback) {
      log.info(' No changes to save on exit');
      return;
    }
    
    try {
      const state = this._serializeCallback();
      localStorage.setItem(STORAGE_KEYS.LAST_STATE, JSON.stringify({
        timestamp: Date.now(),
        state,
        savedOnExit: true,
        isAutoSave: true
      }));
      log.info(' State saved on exit');
    } catch (err) {
      log.warn(' Save on exit failed:', err);
    }
  }

  /**
   * Marca la sesión como "dirty" (con cambios pendientes).
   * Se ignora durante la aplicación de un patch.
   */
  markDirty() {
    if (this._applyingPatch) return;
    
    if (!this._dirty) {
      this._dirty = true;
      log.info(' Session marked as dirty');
    }
  }

  /**
   * Marca la sesión como "clean" (sin cambios pendientes).
   */
  markClean() {
    this._dirty = false;
    log.info(' Session marked as clean');
  }

  /**
   * Indica si la sesión tiene cambios pendientes.
   * @returns {boolean}
   */
  isDirty() {
    return this._dirty;
  }

  /**
   * Indica/controla si se está aplicando un patch.
   * @param {boolean} [value] - Nuevo valor (si se omite, retorna el actual)
   * @returns {boolean}
   */
  applyingPatch(value) {
    if (value !== undefined) {
      this._applyingPatch = value;
    }
    return this._applyingPatch;
  }

  /**
   * Limpia el estado de autoguardado completamente.
   */
  clearLastState() {
    localStorage.removeItem(STORAGE_KEYS.LAST_STATE);
    this._dirty = false;
    log.info(' Last state cleared');
  }

  /**
   * Obtiene el último estado guardado.
   * @returns {{state: Object, timestamp: number, isAutoSave: boolean}|null}
   */
  getLastState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.LAST_STATE);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (err) {
      log.warn(' Error reading last state:', err);
      return null;
    }
  }

  /**
   * Verifica si hay un estado guardado pendiente de restaurar.
   * @returns {boolean}
   */
  hasLastState() {
    return !!localStorage.getItem(STORAGE_KEYS.LAST_STATE);
  }

  /**
   * Configura el callback para aplicar un patch restaurado.
   * @param {Function} callback - Función async que recibe el patch a aplicar
   */
  setRestoreCallback(callback) {
    this._restoreCallback = callback;
  }

  /**
   * Restaura el último estado guardado.
   * Requiere que se haya configurado el callback con setRestoreCallback.
   */
  async restoreLastState() {
    const lastState = this.getLastState();
    if (!lastState?.state || !this._restoreCallback) return;
    
    const { state, timestamp } = lastState;
    
    // Delay para que la UI esté lista
    setTimeout(async () => {
      try {
        await this._restoreCallback({ modules: state.modules || state });
        log.info(` Previous state restored (saved at ${new Date(timestamp).toLocaleString()})`);
      } catch (err) {
        log.error('Error restaurando estado previo:', err);
        // Limpiar estado corrupto para que no vuelva a fallar en el próximo inicio
        this.clearLastState();
      }
    }, 500);
  }

  /**
   * Pregunta al usuario si quiere restaurar el último estado.
   * @param {Object} options - Opciones de configuración
   * @param {Function} options.getAskBeforeRestore - Función que retorna si debe preguntar
   * @param {Function} options.setAskBeforeRestore - Función para actualizar preferencia
   * @param {Function} options.showConfirmDialog - Función para mostrar diálogo de confirmación
   * @param {Function} options.getRememberedChoice - Función para obtener elección recordada
   */
  async maybeRestoreLastState(options) {
    const { getAskBeforeRestore, setAskBeforeRestore, showConfirmDialog, getRememberedChoice } = options;
    
    const parsedData = this.getLastState();
    if (!parsedData?.state) return;
    
    // Solo preguntar si fue autoguardado
    const isAutoSave = parsedData.isAutoSave !== false;
    if (!isAutoSave) {
      this.restoreLastState();
      return;
    }
    
    const shouldAsk = getAskBeforeRestore();
    
    if (!shouldAsk) {
      const { skip, choice } = getRememberedChoice('restore-last-session');
      if (skip) {
        if (choice) {
          this.restoreLastState();
        }
        return;
      }
      this.restoreLastState();
      return;
    }
    
    const result = await showConfirmDialog();
    
    if (result.remember) {
      setAskBeforeRestore(false);
    }
    
    if (result.confirmed) {
      this.restoreLastState();
    } else {
      this.clearLastState();
    }
  }
}

// Singleton
export const sessionManager = new SessionManager();
