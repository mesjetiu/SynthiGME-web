/**
 * Detección de capacidad GPU y gestión del modo de renderizado.
 *
 * Tres modos disponibles:
 * - 'auto'        → detecta automáticamente la GPU; aplica optimizaciones si es débil
 * - 'quality'     → máxima calidad visual (comportamiento original, GPU compositing)
 * - 'performance' → optimizaciones activas: sin box-shadow, backdrop-filter, will-change dinámico
 *
 * La detección usa WEBGL_debug_renderer_info para leer el renderer de la GPU.
 * GPUs débiles: software renderers (SwiftShader, llvmpipe, Mesa Software),
 * Intel HD 2000/3000/4000, Microsoft Basic Render Driver, o WebGL no disponible.
 *
 * @module utils/gpuDetect
 */

import { STORAGE_KEYS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('GpuDetect');

// ─────────────────────────────────────────────────────────────────────────────
// GPU TIER DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {'strong'|'weak'|'unknown'} GpuTier */

/**
 * Patrones de renderers conocidos como software o GPU muy antigua.
 * Se prueban contra el string UNMASKED_RENDERER_WEBGL (case-insensitive).
 * @type {RegExp[]}
 */
const WEAK_GPU_PATTERNS = [
  /SwiftShader/i,
  /llvmpipe/i,
  /Mesa Software/i,
  /Microsoft Basic Render Driver/i,
  /Intel.*HD.*(?:2\d{3}|3\d{3}|4\d{3})\b/i,   // Intel HD 2000–4999
  /Intel.*(?:G41|G45|Q45|B43|GMA)\b/i,           // Intel GMA y chipsets antiguos
  /Mesa DRI Intel.*(?:Sandybridge|Ivybridge|Haswell|Bay Trail)\b/i,
  /Google Inc\.\s*Google/i                        // Headless Chrome (virtual GPU)
];

/** Resultado de detección (singleton, se calcula una sola vez) */
let cachedResult = null;

/**
 * Detecta el tier de la GPU del dispositivo via WebGL.
 *
 * @returns {{ tier: GpuTier, renderer: string, vendor: string }}
 */
export function detectGpuTier() {
  if (cachedResult) return cachedResult;

  /** @type {{ tier: GpuTier, renderer: string, vendor: string }} */
  const result = { tier: 'unknown', renderer: '', vendor: '' };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      result.tier = 'weak';
      log.warn('WebGL no disponible — tier: weak');
      cachedResult = result;
      exposeDebug(result);
      return result;
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      result.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
      result.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';
    } else {
      result.renderer = gl.getParameter(gl.RENDERER) || '';
      result.vendor = gl.getParameter(gl.VENDOR) || '';
    }

    // Clasificar
    const isWeak = WEAK_GPU_PATTERNS.some(re => re.test(result.renderer));
    result.tier = isWeak ? 'weak' : 'strong';

    // Liberar contexto
    const loseCtx = gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();

  } catch (e) {
    log.warn('Error detectando GPU:', e.message);
    result.tier = 'unknown';
  }

  cachedResult = result;
  exposeDebug(result);
  log.info(`GPU: ${result.renderer || '(desconocido)'} → tier: ${result.tier}`);

  return result;
}

/**
 * Devuelve el resultado cacheado sin re-detectar.
 * @returns {{ tier: GpuTier, renderer: string, vendor: string } | null}
 */
export function getCachedGpuTier() {
  return cachedResult;
}

/**
 * Expone resultado para debug en consola: window.__synthGpuTier
 * @param {{ tier: GpuTier, renderer: string, vendor: string }} result
 */
function exposeDebug(result) {
  try {
    window.__synthGpuTier = Object.freeze({ ...result });
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER MODE RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {'auto'|'quality'|'performance'} RenderMode */

/** Valor por defecto cuando no hay preferencia guardada */
const DEFAULT_RENDER_MODE = 'auto';

/** Modos válidos */
const VALID_MODES = ['auto', 'quality', 'performance'];

/**
 * Lee la preferencia del usuario desde localStorage.
 * @returns {RenderMode}
 */
export function getSavedRenderMode() {
  const saved = localStorage.getItem(STORAGE_KEYS.RENDER_MODE);
  return VALID_MODES.includes(saved) ? saved : DEFAULT_RENDER_MODE;
}

/**
 * Resuelve el modo efectivo combinando la preferencia del usuario
 * con la detección de hardware y prefers-reduced-motion.
 *
 * - 'quality'     → siempre calidad máxima (backward compatible)
 * - 'performance' → siempre optimizaciones activas
 * - 'auto'        → depende de GPU tier + prefers-reduced-motion
 *
 * @returns {'quality'|'performance'}
 */
export function resolveRenderMode() {
  const pref = getSavedRenderMode();

  if (pref === 'quality') return 'quality';
  if (pref === 'performance') return 'performance';

  // Auto: consultar GPU + accesibilidad
  const { tier } = detectGpuTier();

  if (tier === 'weak') return 'performance';

  // prefers-reduced-motion como señal adicional
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 'performance';
    }
  } catch { /* ignore */ }

  return 'quality';
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLY RENDER MODE
// ─────────────────────────────────────────────────────────────────────────────

/** CSS class que activa las optimizaciones de rendimiento */
const PERFORMANCE_CLASS = 'render-performance';

/** Último modo efectivo aplicado */
let currentEffectiveMode = null;

/**
 * Aplica el modo de renderizado al DOM (clase en <body>).
 * Sigue el mismo patrón que _applyKnobStyle() en settingsModal.js.
 *
 * @param {'quality'|'performance'} [effectiveMode] - Si no se pasa, se resuelve automáticamente
 * @returns {'quality'|'performance'} El modo aplicado
 */
export function applyRenderMode(effectiveMode) {
  if (!effectiveMode) {
    effectiveMode = resolveRenderMode();
  }

  if (effectiveMode === 'performance') {
    document.body.classList.add(PERFORMANCE_CLASS);
  } else {
    document.body.classList.remove(PERFORMANCE_CLASS);
  }

  currentEffectiveMode = effectiveMode;

  // Exponer para debug y perfMonitor
  try {
    window.__synthRenderMode = effectiveMode;
  } catch { /* ignore */ }

  log.info(`Modo de renderizado: ${effectiveMode}`);
  return effectiveMode;
}

/**
 * Devuelve el modo efectivo actualmente aplicado.
 * @returns {'quality'|'performance'|null}
 */
export function getCurrentRenderMode() {
  return currentEffectiveMode;
}

/**
 * Guarda la preferencia del usuario y aplica el modo resultante.
 * Emite evento 'synth:renderModeChange' para que otros sistemas reaccionen.
 *
 * @param {RenderMode} mode - 'auto', 'quality' o 'performance'
 * @returns {'quality'|'performance'} El modo efectivo aplicado
 */
export function setRenderMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    log.warn(`Modo inválido: ${mode}, usando '${DEFAULT_RENDER_MODE}'`);
    mode = DEFAULT_RENDER_MODE;
  }

  localStorage.setItem(STORAGE_KEYS.RENDER_MODE, mode);
  const effective = applyRenderMode();

  document.dispatchEvent(new CustomEvent('synth:renderModeChange', {
    detail: { preference: mode, effective }
  }));

  return effective;
}

/**
 * Comprueba si el modo performance está activo.
 * Útil para condicionales rápidos en código de renderizado.
 * @returns {boolean}
 */
export function isPerformanceMode() {
  return currentEffectiveMode === 'performance';
}

/**
 * Inicializa el sistema de detección y aplica el modo al arranque.
 * Debe llamarse una vez tras DOMContentLoaded.
 * @returns {'quality'|'performance'}
 */
export function initRenderMode() {
  detectGpuTier();
  return applyRenderMode();
}

// Para testing: permite resetear el cache
export function _resetForTesting() {
  cachedResult = null;
  currentEffectiveMode = null;
  try {
    delete window.__synthGpuTier;
    delete window.__synthRenderMode;
  } catch { /* ignore */ }
}
