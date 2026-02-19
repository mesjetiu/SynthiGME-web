/**
 * GlowManager — Sistema centralizado de halo brillante pulsante
 * 
 * Gestiona el efecto glow/pulse en todos los controles interactivos
 * (knobs, sliders, pads, pines de matriz) cuando cambian de valor,
 * tanto por interacción del usuario como programáticamente (patch, OSC, reset).
 * 
 * Características:
 * - Glow más intenso y visible que la versión anterior
 * - Se activa en CUALQUIER cambio de valor (no solo hover/drag)
 * - Presets configurables: performance, sutil, apagado
 * - Intensidad, duración y color ajustables por preset
 * - Persistencia en localStorage
 * 
 * Uso pensado para performances en directo: el público ve qué controles
 * están variando en tiempo real.
 * 
 * @module ui/glowManager
 */

import { STORAGE_KEYS } from '../utils/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS DE GLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} GlowPreset
 * @property {string} id - Identificador del preset
 * @property {number} intensity - Multiplicador de intensidad del glow (0-3)
 * @property {number} spread - Radio de difusión en px
 * @property {number} duration - Duración del flash en ms (para cambios programáticos)
 * @property {number[]} color - Color base del glow [R, G, B] (0-255)
 * @property {number} opacity - Opacidad máxima del glow (0-1)
 * @property {boolean} pulseOnChange - Activar pulso cuando el valor cambia programáticamente
 */

/** Presets disponibles */
export const GLOW_PRESETS = {
  /** Performance: máxima visibilidad para shows en directo */
  performance: {
    id: 'performance',
    intensity: 2.5,
    spread: 18,
    duration: 600,
    color: [255, 215, 128],  // Ámbar dorado
    opacity: 0.95,
    pulseOnChange: true
  },
  /** Estándar: efecto visible pero no excesivo */
  standard: {
    id: 'standard',
    intensity: 1.6,
    spread: 14,
    duration: 500,
    color: [255, 215, 128],  // Ámbar cálido
    opacity: 0.8,
    pulseOnChange: true
  },
  /** Sutil: apenas visible, para uso personal */
  subtle: {
    id: 'subtle',
    intensity: 0.8,
    spread: 8,
    duration: 400,
    color: [255, 215, 128],  // Ámbar cálido
    opacity: 0.55,
    pulseOnChange: true
  },
  /** Apagado: sin efecto glow */
  off: {
    id: 'off',
    intensity: 0,
    spread: 0,
    duration: 0,
    color: [255, 215, 128],
    opacity: 0,
    pulseOnChange: false
  }
};

/** Preset por defecto */
const DEFAULT_PRESET = 'standard';

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────────────────────

/** @type {GlowPreset} */
let _currentPreset = GLOW_PRESETS[DEFAULT_PRESET];

/** @type {string} */
let _currentPresetId = DEFAULT_PRESET;

/** Timers activos de flash (para limpiar en batch) */
const _activeFlashTimers = new WeakMap();

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el GlowManager: carga preset desde localStorage y aplica CSS vars.
 */
export function initGlowManager() {
  const saved = localStorage.getItem(STORAGE_KEYS.GLOW_PRESET);
  if (saved && GLOW_PRESETS[saved]) {
    _currentPresetId = saved;
    _currentPreset = GLOW_PRESETS[saved];
  }
  _applyCSSVariables();
}

/**
 * Obtiene el preset actual.
 * @returns {string} ID del preset activo
 */
export function getGlowPreset() {
  return _currentPresetId;
}

/**
 * Cambia el preset de glow y persiste la preferencia.
 * @param {string} presetId - ID del preset ('performance' | 'standard' | 'subtle' | 'off')
 */
export function setGlowPreset(presetId) {
  if (!GLOW_PRESETS[presetId]) return;
  _currentPresetId = presetId;
  _currentPreset = GLOW_PRESETS[presetId];
  localStorage.setItem(STORAGE_KEYS.GLOW_PRESET, presetId);
  _applyCSSVariables();
  
  // Notificar cambio para que la UI de settings se actualice
  document.dispatchEvent(new CustomEvent('synth:settingChanged', {
    detail: { key: 'glowPreset', value: presetId }
  }));
}

/**
 * Obtiene todos los IDs de presets disponibles.
 * @returns {string[]}
 */
export function getGlowPresetIds() {
  return Object.keys(GLOW_PRESETS);
}

/**
 * Dispara un flash de glow en un elemento cuando su valor cambia
 * programáticamente (patch load, OSC, reset, etc).
 * 
 * No interfiere con el glow de hover/drag que ya existe.
 * Añade la clase .glow-flash que se auto-quita tras la duración.
 * 
 * @param {HTMLElement} element - El elemento DOM del control (knob, slider-wrap, pad, pin)
 */
export function flashGlow(element) {
  if (!element || !_currentPreset.pulseOnChange) return;
  if (_currentPreset.intensity === 0) return;
  
  // Si ya tiene el glow de hover/tooltip activo, no sobreponer
  if (element.classList.contains('is-tooltip-active')) return;
  
  // Cancelar flash previo si existe
  const prevTimer = _activeFlashTimers.get(element);
  if (prevTimer) {
    clearTimeout(prevTimer);
    element.classList.remove('glow-flash');
    // Forzar reflow para reiniciar animación
    void element.offsetWidth;
  }
  
  element.classList.add('glow-flash');
  
  const timer = setTimeout(() => {
    element.classList.remove('glow-flash');
    _activeFlashTimers.delete(element);
  }, _currentPreset.duration);
  
  _activeFlashTimers.set(element, timer);
}

/**
 * Dispara un flash de glow en un pin de matriz.
 * Usa clase diferente porque los pines tienen scale() en su animación.
 * 
 * @param {HTMLElement} pinBtn - El botón del pin (.pin-btn)
 */
export function flashPinGlow(pinBtn) {
  if (!pinBtn || !_currentPreset.pulseOnChange) return;
  if (_currentPreset.intensity === 0) return;
  
  // Si ya tiene tooltip target activo, no sobreponer
  if (pinBtn.classList.contains('is-tooltip-target')) return;
  
  const prevTimer = _activeFlashTimers.get(pinBtn);
  if (prevTimer) {
    clearTimeout(prevTimer);
    pinBtn.classList.remove('glow-flash-pin');
    void pinBtn.offsetWidth;
  }
  
  pinBtn.classList.add('glow-flash-pin');
  
  const timer = setTimeout(() => {
    pinBtn.classList.remove('glow-flash-pin');
    _activeFlashTimers.delete(pinBtn);
  }, _currentPreset.duration);
  
  _activeFlashTimers.set(pinBtn, timer);
}

/**
 * Verifica si el glow está habilitado (preset no es 'off').
 * @returns {boolean}
 */
export function isGlowEnabled() {
  return _currentPresetId !== 'off';
}

// ─────────────────────────────────────────────────────────────────────────────
// APLICAR VARIABLES CSS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica las variables CSS del preset actual al documento.
 * Las animaciones CSS leen estas variables para ajustar el efecto.
 */
function _applyCSSVariables() {
  const root = document.documentElement;
  const p = _currentPreset;
  const [r, g, b] = p.color;
  
  /** Genera cadena rgba con la opacidad indicada */
  const rgba = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
  
  // Propiedades básicas
  root.style.setProperty('--glow-intensity', p.intensity);
  root.style.setProperty('--glow-spread', `${p.spread}px`);
  root.style.setProperty('--glow-opacity', p.opacity);
  root.style.setProperty('--glow-duration', `${p.duration}ms`);
  
  // Knob glow
  const kSpread = Math.round(p.spread * p.intensity);
  const kBlur = Math.round(kSpread * 0.8);
  root.style.setProperty('--glow-knob-shadow',
    `0 0 ${kBlur}px ${kSpread}px ${rgba(p.opacity)}`);
  root.style.setProperty('--glow-knob-shadow-idle',
    `0 0 ${Math.round(kBlur * 0.4)}px ${Math.round(kSpread * 0.3)}px ${rgba(p.opacity * 0.4)}`);
  
  // Slider glow
  const sSpread = Math.round(p.spread * p.intensity * 0.85);
  const sBlur = Math.round(sSpread * 0.7);
  root.style.setProperty('--glow-slider-shadow',
    `0 0 ${sBlur}px ${sSpread}px ${rgba(p.opacity * 0.85)}`);
  root.style.setProperty('--glow-slider-shadow-idle',
    `0 0 0 0 ${rgba(p.opacity * 0.4)}`);
  
  // Joystick pad glow
  const jSpread = Math.round(p.spread * p.intensity * 0.9);
  const jBlur = Math.round(jSpread * 0.85);
  root.style.setProperty('--glow-pad-shadow',
    `inset 0 0 10px rgba(0,0,0,0.6), 0 0 ${jBlur}px ${jSpread}px ${rgba(p.opacity * 0.85)}`);
  root.style.setProperty('--glow-pad-shadow-idle',
    `inset 0 0 10px rgba(0,0,0,0.6), 0 0 0 0 ${rgba(p.opacity * 0.3)}`);
  
  // Pin pulse glow
  const pSpread = Math.round(p.spread * p.intensity * 0.7);
  const pBlur = Math.round(pSpread * 0.6);
  root.style.setProperty('--glow-pin-shadow',
    `0 0 ${pBlur}px ${pSpread}px ${rgba(p.opacity * 0.9)}`);
  root.style.setProperty('--glow-pin-shadow-idle',
    `0 0 0 0 ${rgba(p.opacity * 0.5)}`);
  
  // Flash (cambio programático) — animación más rápida y directa
  const fSpread = Math.round(p.spread * p.intensity * 1.2);
  const fBlur = Math.round(fSpread * 0.9);
  root.style.setProperty('--glow-flash-shadow',
    `0 0 ${fBlur}px ${fSpread}px ${rgba(p.opacity)}`);
  
  // Si está apagado, desactivar animaciones
  root.classList.toggle('glow-disabled', p.intensity === 0);
}
