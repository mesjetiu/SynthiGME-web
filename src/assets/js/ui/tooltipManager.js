/**
 * Tooltip Manager
 * 
 * Gestiona la ocultación global de tooltips ante eventos comunes:
 * - Zoom/pan del viewport (gesto de navegación)
 * - Toque/click fuera del tooltip actual
 * 
 * También proporciona una API para mostrar tooltips estilizados (knob-tooltip)
 * en cualquier elemento (switches, botones, toggles) con hover.
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

  // Permitir cierres globales explícitos desde otros subsistemas (viewport, PiP, etc.)
  document.addEventListener('synth:dismissTooltips', () => {
    hideAllTooltips();
  });
  
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
    
    // Si el toque es en un knob, pin, slider, toggle, switch o pad de joystick, dejar que su propio handler decida
    if (target?.closest?.('.knob, .knob-inner, .pin-btn, .output-channel__slider, .panel7-joystick-pad, .synth-toggle, .rotary-switch, .output-channel__switch, .panel7-seq-switch-toggle, .panel7-seq-button')) {
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

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL TOOLTIP — tooltip estilizado para switches, toggles, botones
// ─────────────────────────────────────────────────────────────────────────────

const _controlTooltipMap = new WeakMap();

/**
 * Muestra un tooltip estilizado (knob-tooltip) sobre un elemento.
 * @param {HTMLElement} element - Elemento al que anclar el tooltip
 * @param {string} content - Texto del tooltip (se escapa como texto)
 */
export function showControlTooltip(element, content) {
  hideControlTooltip(element);
  hideOtherTooltips(_getControlHideCallback(element));

  const tip = document.createElement('div');
  tip.className = 'knob-tooltip';
  tip.textContent = content;
  document.body.appendChild(tip);
  _controlTooltipMap.set(element, tip);

  _positionControlTooltip(element, tip);
  tip.offsetHeight; // reflow
  tip.classList.add('is-visible');
}

/**
 * Oculta el tooltip estilizado de un elemento.
 * @param {HTMLElement} element
 */
export function hideControlTooltip(element) {
  const tip = _controlTooltipMap.get(element);
  if (!tip) return;
  tip.classList.remove('is-visible');
  setTimeout(() => { tip.remove(); }, 150);
  _controlTooltipMap.delete(element);
}

function _positionControlTooltip(element, tip) {
  const rect = element.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let top = rect.top - tipRect.height - 8;
  if (left < 4) left = 4;
  if (left + tipRect.width > window.innerWidth - 4) left = window.innerWidth - tipRect.width - 4;
  if (top < 4) top = rect.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// Callback de hide por elemento, cacheado para que hideOtherTooltips lo pueda excluir
const _controlHideCallbackMap = new WeakMap();
function _getControlHideCallback(element) {
  let cb = _controlHideCallbackMap.get(element);
  if (!cb) {
    cb = () => hideControlTooltip(element);
    _controlHideCallbackMap.set(element, cb);
    registerTooltipHideCallback(cb);
  }
  return cb;
}

/**
 * Conecta hover tooltip estilizado a un elemento.
 * Devuelve una función update(content) para actualizar el texto.
 * @param {HTMLElement} element - Elemento al que conectar
 * @param {string} initialContent - Texto inicial del tooltip
 * @returns {{ update: (content: string) => void }}
 */
export function attachControlTooltip(element, initialContent) {
  let content = initialContent;
  let hovered = false;

  element.addEventListener('pointerenter', () => {
    hovered = true;
    showControlTooltip(element, content);
  });
  element.addEventListener('pointerleave', () => {
    hovered = false;
    hideControlTooltip(element);
  });

  return {
    update(newContent) {
      content = newContent;
      if (hovered) {
        showControlTooltip(element, content);
      }
    }
  };
}
