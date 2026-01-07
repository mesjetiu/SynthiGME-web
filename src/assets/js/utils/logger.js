/**
 * Sistema de logging centralizado con niveles configurables.
 * Permite desactivar logs en producción mientras mantiene el formato consistente.
 * 
 * @module utils/logger
 * 
 * ## Niveles disponibles:
 * - NONE (0): Sin logs
 * - ERROR (1): Solo errores
 * - WARN (2): Errores y advertencias  
 * - INFO (3): Info general (por defecto en desarrollo)
 * - DEBUG (4): Todo, incluyendo debug detallado
 * 
 * ## Configuración:
 * - En desarrollo (localhost): usa INFO por defecto
 * - En producción (build): usa ERROR (configurado en scripts/build.mjs)
 * - Override en runtime: window.__LOG_LEVEL__ = 4 (para activar DEBUG)
 */

/**
 * Niveles de log disponibles (de menor a mayor verbosidad)
 */
export const LogLevel = {
  NONE: 0,    // Sin logs
  ERROR: 1,   // Solo errores
  WARN: 2,    // Errores y advertencias
  INFO: 3,    // Info general (por defecto en desarrollo)
  DEBUG: 4    // Todo, incluyendo debug detallado
};

/**
 * Nivel de log inyectado en build (producción = ERROR).
 * En desarrollo (sin build), __LOG_LEVEL__ no existe y usamos INFO.
 */
const BUILD_LOG_LEVEL = typeof __LOG_LEVEL__ !== 'undefined' ? __LOG_LEVEL__ : LogLevel.INFO;

/**
 * Nivel actual de logging.
 * Se inicializa desde BUILD_LOG_LEVEL pero puede cambiarse en runtime.
 */
let currentLevel = BUILD_LOG_LEVEL;

/**
 * Establece el nivel de logging global.
 * @param {number} level - Uno de los valores de LogLevel
 */
export function setLogLevel(level) {
  if (typeof level === 'number' && level >= LogLevel.NONE && level <= LogLevel.DEBUG) {
    currentLevel = level;
  }
}

/**
 * Obtiene el nivel de logging actual.
 * @returns {number}
 */
export function getLogLevel() {
  // Permitir override desde window para debugging
  if (typeof window !== 'undefined' && typeof window.__LOG_LEVEL__ === 'number') {
    return window.__LOG_LEVEL__;
  }
  return currentLevel;
}

/**
 * Crea un logger con prefijo para un módulo específico.
 * 
 * @param {string} prefix - Nombre del módulo (se mostrará como [Prefix])
 * @returns {Object} Logger con métodos debug, log, info, warn, error
 * 
 * @example
 * const log = createLogger('AudioEngine');
 * log.info('Initialized'); // [AudioEngine] Initialized
 * log.warn('Low latency'); // [AudioEngine] Low latency
 */
export function createLogger(prefix) {
  const tag = `[${prefix}]`;

  return {
    /**
     * Log de debug (solo en desarrollo o con LOG_LEVEL >= DEBUG)
     */
    debug(...args) {
      if (getLogLevel() >= LogLevel.DEBUG) {
        console.log(tag, ...args);
      }
    },

    /**
     * Log informativo general
     */
    log(...args) {
      if (getLogLevel() >= LogLevel.INFO) {
        console.log(tag, ...args);
      }
    },

    /**
     * Alias de log para consistencia semántica
     */
    info(...args) {
      if (getLogLevel() >= LogLevel.INFO) {
        console.log(tag, ...args);
      }
    },

    /**
     * Advertencia (siempre visible excepto en NONE/ERROR)
     */
    warn(...args) {
      if (getLogLevel() >= LogLevel.WARN) {
        console.warn(tag, ...args);
      }
    },

    /**
     * Error (siempre visible excepto en NONE)
     */
    error(...args) {
      if (getLogLevel() >= LogLevel.ERROR) {
        console.error(tag, ...args);
      }
    }
  };
}

/**
 * Logger por defecto para uso rápido sin crear instancia.
 * Usa 'App' como prefijo.
 */
export const logger = createLogger('App');
