/**
 * Tooltip Manager
 * 
 * Gestiona la ocultación global de tooltips ante eventos comunes:
 * - Zoom/pan del viewport (gesto de navegación)
 * - Toque/click fuera del tooltip actual
 * 
 * Los tooltips se registran aquí para ser ocultados automáticamente
 * cuando ocurren estos eventos globales.
 * 
 * @module ui/tooltipManager
 */

// Conjunto de callbacks de ocultación de tooltips registrados
const _hideCallbacks = new Set();

// Estado del gestor
let _initialized = false;

/**
 * Registra un callback que se llamará cuando se deba ocultar el tooltip.
 * @param {Function} hideCallback - Función a llamar para ocultar el tooltip
 * @returns {Function} Función para desregistrar el callback
 */
export function registerTooltipHideCallback(hideCallback) {
  _hideCallbacks.add(hideCallback);
  _ensureInitialized();
  
  return () => {
    _hideCallbacks.delete(hideCallback);
  };
}

/**
 * Oculta todos los tooltips registrados.
 */
export function hideAllTooltips() {
  _hideCallbacks.forEach(callback => {
    try {
      callback();
    } catch (e) {
      console.warn('[TooltipManager] Error hiding tooltip:', e);
    }
  });
}

/**
 * Oculta todos los tooltips excepto el identificado por excludeCallback.
 * Útil para que al mostrar un tooltip se oculten los demás sin afectar al propio.
 * @param {Function} excludeCallback - Callback a excluir (el del tooltip que se va a mostrar)
 */
export function hideOtherTooltips(excludeCallback) {
  _hideCallbacks.forEach(callback => {
    if (callback === excludeCallback) return;
    try {
      callback();
    } catch (e) {
      console.warn('[TooltipManager] Error hiding tooltip:', e);
    }
  });
}

/**
 * Inicializa los listeners globales una sola vez.
 */
function _ensureInitialized() {
  if (_initialized) return;
  if (typeof document === 'undefined') return; // SSR/tests safety
  _initialized = true;
  
  // Ocultar tooltips cuando se inicia un gesto de navegación (zoom/pan)
  // Usamos pointerdown con múltiples touches como indicador de gesto
  document.addEventListener('pointerdown', (ev) => {
    // Si es touch y ya hay otro pointer activo, es probable un gesto de pinch
    if (ev.pointerType === 'touch' && ev.isPrimary === false) {
      hideAllTooltips();
    }
  }, { passive: true, capture: true });
  
  // También ocultar en touchmove cuando hay múltiples toques (pinch/pan)
  document.addEventListener('touchmove', (ev) => {
    if (ev.touches.length >= 2) {
      hideAllTooltips();
    }
  }, { passive: true, capture: true });
  
  // Ocultar tooltips en cualquier touchstart fuera de tooltips y controles
  document.addEventListener('touchstart', (ev) => {
    // Si el toque es en un elemento tooltip, no ocultar
    const target = ev.target;
    if (target?.closest?.('.knob-tooltip, .matrix-tooltip')) {
      return;
    }
    
    // Si el toque es en un knob, pin, slider o pad de joystick, dejar que su propio handler decida
    if (target?.closest?.('.knob, .knob-inner, .pin-btn, .output-channel__slider, .panel7-joystick-pad')) {
      return;
    }
    
    // Cualquier otro toque oculta todos los tooltips
    hideAllTooltips();
  }, { passive: true, capture: true });
  
  // También ocultar en scroll del viewport
  document.addEventListener('scroll', () => {
    hideAllTooltips();
  }, { passive: true, capture: true });
  
  // Ocultar en wheel (zoom con rueda)
  document.addEventListener('wheel', () => {
    hideAllTooltips();
  }, { passive: true });
}
