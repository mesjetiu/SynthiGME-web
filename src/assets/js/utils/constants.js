/**
 * Constantes globales de la aplicación.
 * Centraliza valores que se usan en múltiples lugares.
 * 
 * @module utils/constants
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DEL SINTETIZADOR
// ─────────────────────────────────────────────────────────────────────────────

/** Número de canales de salida lógicos del sintetizador */
export const OUTPUT_CHANNELS = 8;

/** Número de canales de entrada lógicos (input amplifiers) */
export const INPUT_CHANNELS = 8;

/** Número máximo de pistas de grabación */
export const MAX_RECORDING_TRACKS = 12;

/** Número de canales físicos por defecto (estéreo) */
export const DEFAULT_PHYSICAL_CHANNELS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// TIEMPOS Y ANIMACIONES
// ─────────────────────────────────────────────────────────────────────────────

/** Duración de animación al navegar a un panel (ms) */
export const PANEL_ANIMATION_DURATION = 1000;

/** Delay para double-tap en móvil (ms) */
export const DOUBLE_TAP_DELAY = 300;

/** Delay para salir del modo low-zoom (ms) */
export const LOW_ZOOM_EXIT_DELAY = 500;

/** Duración de pulsación larga para tooltip (ms) */
export const LONG_PRESS_DURATION = 400;

// ─────────────────────────────────────────────────────────────────────────────
// PREFIJO DE STORAGE
// ─────────────────────────────────────────────────────────────────────────────

/** Prefijo común para todas las claves de localStorage */
export const STORAGE_PREFIX = 'synthigme-';

// ─────────────────────────────────────────────────────────────────────────────
// CLAVES DE LOCALSTORAGE
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  // Idioma
  LANGUAGE: `${STORAGE_PREFIX}language`,
  
  // Audio
  AUDIO_ROUTING: `${STORAGE_PREFIX}audio-routing`,
  INPUT_ROUTING: `${STORAGE_PREFIX}input-routing`,
  STEREO_BUS_ROUTING: `${STORAGE_PREFIX}stereo-bus-routing`,
  OUTPUT_DEVICE: `${STORAGE_PREFIX}output-device`,
  INPUT_DEVICE: `${STORAGE_PREFIX}input-device`,
  MIC_PERMISSION_DENIED: `${STORAGE_PREFIX}mic-permission-denied`,
  
  // Grabación
  RECORDING_TRACKS: `${STORAGE_PREFIX}recording-tracks`,
  RECORDING_ROUTING: `${STORAGE_PREFIX}recording-routing`,
  
  // Sesión
  LAST_STATE: `${STORAGE_PREFIX}last-state`,
  
  // Ajustes generales
  RESOLUTION: `${STORAGE_PREFIX}resolution`,
  REMEMBER_RESOLUTION: `${STORAGE_PREFIX}remember-resolution`,
  AUTOSAVE_INTERVAL: `${STORAGE_PREFIX}autosave-interval`,
  SAVE_ON_EXIT: `${STORAGE_PREFIX}save-on-exit`,
  RESTORE_ON_START: `${STORAGE_PREFIX}restore-on-start`,
  ASK_BEFORE_RESTORE: `${STORAGE_PREFIX}ask-before-restore`,
  
  // Atajos de teclado
  KEYBOARD_SHORTCUTS: `${STORAGE_PREFIX}keyboard-shortcuts`,
  
  // Pantalla
  WAKE_LOCK_ENABLED: `${STORAGE_PREFIX}wake-lock-enabled`,
  
  // Visualización de matriz
  SHOW_INACTIVE_PINS: `${STORAGE_PREFIX}show-inactive-pins`,
  
  // Picture-in-Picture (paneles flotantes)
  PIP_STATE: `${STORAGE_PREFIX}pip-state`,
  PIP_REMEMBER: `${STORAGE_PREFIX}pip-remember`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Optimización de rendimiento
  // Cada optimización tiene un toggle enabled + un toggle debug opcional
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Debug global de optimizaciones (toasts para todas las optimizaciones) */
  OPTIMIZATIONS_DEBUG: `${STORAGE_PREFIX}optimizations-debug`,
  
  /** Dormancy: silencia módulos sin conexiones activas */
  DORMANCY_ENABLED: `${STORAGE_PREFIX}dormancy-enabled`,
  DORMANCY_DEBUG: `${STORAGE_PREFIX}dormancy-debug`,
  
  /** Filter Bypass: desconecta físicamente filtros LP/HP en posición neutral */
  FILTER_BYPASS_ENABLED: `${STORAGE_PREFIX}filter-bypass-enabled`,
  FILTER_BYPASS_DEBUG: `${STORAGE_PREFIX}filter-bypass-debug`,
  
  /** Latency Mode: 'playback' para móviles (estable), 'interactive' para desktop (baja latencia) */
  LATENCY_MODE: `${STORAGE_PREFIX}latency-mode`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Emulación de voltajes (Synthi 100 Cuenca/Datanomics 1982)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Soft clipping: saturación suave con tanh() cuando se exceden límites de entrada */
  VOLTAGE_SOFT_CLIP_ENABLED: `${STORAGE_PREFIX}voltage-soft-clip-enabled`,
  
  /** Pin tolerance: aplicar variación de ±0.5%/±10% según tipo de pin */
  VOLTAGE_PIN_TOLERANCE_ENABLED: `${STORAGE_PREFIX}voltage-pin-tolerance-enabled`,
  
  /** Thermal drift: deriva térmica lenta en osciladores (±0.1%) */
  VOLTAGE_THERMAL_DRIFT_ENABLED: `${STORAGE_PREFIX}voltage-thermal-drift-enabled`
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERVALOS DE AUTOSAVE
// ─────────────────────────────────────────────────────────────────────────────

/** Opciones de intervalo de autoguardado (clave → milisegundos) */
export const AUTOSAVE_INTERVALS = {
  '15s': 15000,
  '30s': 30000,
  '1m': 60000,
  '5m': 300000,
  'off': 0
};

/** Intervalo de autosave por defecto */
export const DEFAULT_AUTOSAVE_INTERVAL = '30s';

// ─────────────────────────────────────────────────────────────────────────────
// DETECCIÓN DE DISPOSITIVO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta si el dispositivo es móvil basándose en user agent y touch.
 * @returns {boolean}
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
         ('ontouchstart' in window && navigator.maxTouchPoints > 1);
}
