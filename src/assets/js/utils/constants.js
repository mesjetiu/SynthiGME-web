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
export const MAX_RECORDING_TRACKS = 8;

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
  OUTPUT_DEVICE: `${STORAGE_PREFIX}output-device`,
  INPUT_DEVICE: `${STORAGE_PREFIX}input-device`,
  
  // Grabación
  RECORDING_TRACKS: `${STORAGE_PREFIX}recording-tracks`,
  RECORDING_ROUTING: `${STORAGE_PREFIX}recording-routing`,
  
  // Sesión
  LAST_STATE: `${STORAGE_PREFIX}last-state`,
  
  // Ajustes generales
  RESOLUTION: `${STORAGE_PREFIX}resolution`,
  AUTOSAVE_INTERVAL: `${STORAGE_PREFIX}autosave-interval`,
  SAVE_ON_EXIT: `${STORAGE_PREFIX}save-on-exit`,
  RESTORE_ON_START: `${STORAGE_PREFIX}restore-on-start`,
  ASK_BEFORE_RESTORE: `${STORAGE_PREFIX}ask-before-restore`,
  
  // Atajos de teclado
  KEYBOARD_SHORTCUTS: `${STORAGE_PREFIX}keyboard-shortcuts`,
  
  // Pantalla
  WAKE_LOCK_ENABLED: `${STORAGE_PREFIX}wake-lock-enabled`
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
