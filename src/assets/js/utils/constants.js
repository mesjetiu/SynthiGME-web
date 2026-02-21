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
  
  // Audio (DSP)
  DSP_ENABLED: `${STORAGE_PREFIX}dsp-enabled`,
  DSP_START_ENABLED: `${STORAGE_PREFIX}dsp-start-enabled`,
  
  // Audio (routing)
  AUDIO_ROUTING: `${STORAGE_PREFIX}audio-routing`,
  AUDIO_ROUTING_MULTICHANNEL: `${STORAGE_PREFIX}audio-routing-multichannel`,
  INPUT_ROUTING: `${STORAGE_PREFIX}input-routing`,
  INPUT_ROUTING_MULTICHANNEL: `${STORAGE_PREFIX}input-routing-multichannel`,
  STEREO_BUS_ROUTING: `${STORAGE_PREFIX}stereo-bus-routing`,
  STEREO_BUS_ROUTING_MULTICHANNEL: `${STORAGE_PREFIX}stereo-bus-routing-multichannel`,
  OUTPUT_MODE: `${STORAGE_PREFIX}output-mode`,
  OUTPUT_DEVICE: `${STORAGE_PREFIX}output-device`,
  INPUT_DEVICE: `${STORAGE_PREFIX}input-device`,
  MIC_PERMISSION_DENIED: `${STORAGE_PREFIX}mic-permission-denied`,
  AUDIO_LATENCY: `${STORAGE_PREFIX}audio-latency`,
  
  // Grabación
  RECORDING_TRACKS: `${STORAGE_PREFIX}recording-tracks`,
  RECORDING_ROUTING: `${STORAGE_PREFIX}recording-routing`,
  RECORDING_FORMAT: `${STORAGE_PREFIX}recording-format`,
  RECORDING_BITRATE: `${STORAGE_PREFIX}recording-bitrate`,
  
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
  
  // Rasterización adaptativa (nitidez de zoom)
  SHARP_RASTERIZE_ENABLED: `${STORAGE_PREFIX}sharp-rasterize-enabled`,
  
  // Patches: incluir configuración visual (paneles flotantes + vista)
  PATCH_INCLUDE_VISUAL: `${STORAGE_PREFIX}patch-include-visual`,
  
  // Disposición visual: paneles flotantes + posición del canvas
  PIP_STATE: `${STORAGE_PREFIX}pip-state`,
  VIEWPORT_STATE: `${STORAGE_PREFIX}viewport-state`,
  REMEMBER_VISUAL_LAYOUT: `${STORAGE_PREFIX}remember-visual-layout`,
  
  // Notas post-it en paneles
  PANEL_NOTES: `${STORAGE_PREFIX}panel-notes`,
  
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
  VOLTAGE_THERMAL_DRIFT_ENABLED: `${STORAGE_PREFIX}voltage-thermal-drift-enabled`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Faders de Output Channels
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Respuesta lineal de faders: el slider controla ganancia directamente en vez de voltaje */
  FADER_LINEAR_RESPONSE: `${STORAGE_PREFIX}fader-linear-response`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Tooltips de parámetros (knobs)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Mostrar valores de voltaje en tooltips de knobs */
  TOOLTIP_SHOW_VOLTAGE: `${STORAGE_PREFIX}tooltip-show-voltage`,
  
  /** Mostrar valores de audio (frecuencia, ganancia) en tooltips de knobs */
  TOOLTIP_SHOW_AUDIO_VALUES: `${STORAGE_PREFIX}tooltip-show-audio-values`,

  // ─────────────────────────────────────────────────────────────────────────
  // Interacción táctil
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Multitouch en controles: permite mover varios knobs/faders simultáneamente */
  MULTITOUCH_CONTROLS: `${STORAGE_PREFIX}multitouch-controls`,
  
  /** Pan con un dedo: arrastrar el canvas con un dedo en dispositivos táctiles */
  SINGLE_FINGER_PAN: `${STORAGE_PREFIX}single-finger-pan`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Quickbar (barra de acciones rápidas)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Visibilidad del quickbar (en Electron se puede ocultar porque el menú nativo lo reemplaza) */
  QUICKBAR_VISIBLE: `${STORAGE_PREFIX}quickbar-visible`,
  
  /** Pedir confirmación al reiniciar el sintetizador (default: true) */
  CONFIRM_SYNTH_RESET: `${STORAGE_PREFIX}confirm-synth-reset`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // OSC (Open Sound Control) - Comunicación peer-to-peer
  // ─────────────────────────────────────────────────────────────────────────
  
  /** OSC habilitado */
  OSC_ENABLED: `${STORAGE_PREFIX}osc-enabled`,
  
  /** Modo OSC: 'peer' (bidireccional), 'master' (solo envía), 'slave' (solo recibe) */
  OSC_MODE: `${STORAGE_PREFIX}osc-mode`,
  
  /** Prefijo de direcciones OSC (por defecto /SynthiGME/) */
  OSC_PREFIX: `${STORAGE_PREFIX}osc-prefix`,
  
  /** Lista de targets unicast en formato JSON */
  OSC_UNICAST_TARGETS: `${STORAGE_PREFIX}osc-unicast-targets`,
  
  /** Enviar OSC a SuperCollider */
  OSC_SUPERCOLLIDER_SEND: `${STORAGE_PREFIX}osc-supercollider-send`,
  
  /** Puerto de SuperCollider (default: 57120) */
  OSC_SUPERCOLLIDER_PORT: `${STORAGE_PREFIX}osc-supercollider-port`,
  
  /** Puerto de escucha OSC (default: 57121) */
  OSC_PORT: `${STORAGE_PREFIX}osc-port`,
  
  /** Recibir OSC desde SuperCollider */
  OSC_SUPERCOLLIDER_RECEIVE: `${STORAGE_PREFIX}osc-supercollider-receive`,
  
  /** Mostrar ventana de log OSC */
  OSC_LOG_VISIBLE: `${STORAGE_PREFIX}osc-log-visible`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Telemetría anónima
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Consentimiento de telemetría (true/false) */
  TELEMETRY_ENABLED: `${STORAGE_PREFIX}telemetry-enabled`,
  
  /** ID anónimo persistente (UUID) */
  TELEMETRY_ID: `${STORAGE_PREFIX}telemetry-id`,
  
  /** Cola de eventos offline (JSON array) */
  TELEMETRY_QUEUE: `${STORAGE_PREFIX}telemetry-queue`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Efecto glow (halo brillante en controles)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Preset de glow: 'performance', 'standard', 'subtle', 'off' */
  GLOW_PRESET: `${STORAGE_PREFIX}glow-preset`,
  
  // ─────────────────────────────────────────────────────────────────────────
  // Signal Flow Highlighter (resaltado visual de flujo de señal)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Activar/desactivar resaltado de flujo de señal */
  SIGNAL_FLOW_ENABLED: `${STORAGE_PREFIX}signal-flow-enabled`,

  /** Requerir tecla modificadora para activar el resaltado de flujo de señal */
  SIGNAL_FLOW_REQUIRE_MODIFIER: `${STORAGE_PREFIX}signal-flow-require-modifier`
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
