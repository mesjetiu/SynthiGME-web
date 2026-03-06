// Gestor de paneles Picture-in-Picture (PiP)
// Permite extraer paneles del viewport principal para verlos de forma flotante

import { createLogger } from '../utils/logger.js';
import { perfMonitor } from '../utils/perfMonitor.js';
import { t, onLocaleChange } from '../i18n/index.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { showContextMenu, hideContextMenu } from './contextMenuManager.js';

const log = createLogger('PipManager');

/**
 * @typedef {Object} PipPanelState
 * @property {string} panelId - ID del panel
 * @property {HTMLElement} originalParent - Contenedor original del panel
 * @property {number} originalIndex - Índice original en el DOM
 * @property {HTMLElement} pipContainer - Contenedor PiP creado
 * @property {number} x - Posición X del PiP
 * @property {number} y - Posición Y del PiP
 * @property {number} width - Ancho del PiP
 * @property {number} height - Alto del PiP
 * @property {number} scale - Zoom del panel dentro del PiP
 */

/** Mapa de paneles actualmente en modo PiP */
const activePips = new Map();

/** Contenedor de todos los PiPs */
let pipLayer = null;

/** Flag para evitar guardar estado durante la restauración */
let _isRestoring = false;

/** Flag: los locks del canvas fueron activados automáticamente al abrir la primera PiP.
 *  Se invalida si el usuario cambia los locks manualmente. */
let _autoLockedByPip = false;

/** Z-index base para PiPs (por encima del viewport pero debajo de modales) */
const PIP_Z_INDEX_BASE = 1200;

/** Dimensiones mínimas del PiP */
const MIN_PIP_SIZE = 150;
// MAX_PIP_SIZE es dinámico: se calcula según el tamaño de la ventana

/** Tamaño de cabecera del PiP: modo sin marco, sin barra visible */
const PIP_HEADER_HEIGHT = 0;

/** Espacio extra del contenedor PiP por bordes CSS en modo sin marco */
const PIP_BORDER_SIZE = 0;

/** Factores multiplicativos de zoom aplicados por tick de rueda en PiP */
const PIP_WHEEL_ZOOM_IN_FACTOR = 1.18;
const PIP_WHEEL_ZOOM_OUT_FACTOR = 1.32;

/** Factor de pan aplicado a deltas de rueda/touchpad normalizados a píxeles CSS */
const PIP_WHEEL_PAN_FACTOR = 1;

/** Debounce para persistir estado PiP tras interacciones continuas */
const PIP_SAVE_DEBOUNCE_MS = 180;

/** Tiempo sin interacción antes de restaurar el panel vivo en PiP */
const PIP_PREVIEW_IDLE_MS = 220;

/** Delay antes de activar rasterización nítida en PiP tras quedar idle */
const PIP_RASTERIZE_DELAY_MS = 200;

/** Límite de zoom nítido seguro para PiP */
const PIP_MAX_SHARP_ZOOM = 3;

/** Escala mínima a partir de la que merece la pena re-rasterizar */
const PIP_MIN_SHARP_SCALE = 1.05;

/** Máxima dimensión de raster seguro para el compositor */
const PIP_MAX_RASTER_DIMENSION = 16384;

/** Máx frames difiriendo el commit nítido si sigue entrando input */
const PIP_MAX_SHARP_DEFER_FRAMES = 10;

/** Debounce antes de refrescar el snapshot visual del preview PiP */
const PIP_PREVIEW_REFRESH_DEBOUNCE_MS = 120;

/** Timeout máximo para tareas idle de prewarm/refresco del preview PiP */
const PIP_PREVIEW_IDLE_TIMEOUT_MS = 800;

/** Límites de zoom */
const MIN_SCALE_ABSOLUTE = 0.1; // Mínimo absoluto de seguridad
const MAX_SCALE = 3.0;

/** Protección anti-zoom accidental en pinch (mismos valores que el canvas principal) */
const PIP_MIN_PINCH_DIST = 180;  // Distancia mínima para ratio estable
const PIP_MAX_ZOOM_DELTA = 0.12; // Cambio máximo de zoom por frame
const PIP_PINCH_EPSILON = 0.002; // Cambio mínimo para aplicar zoom

let _pipStateSaveTimer = null;
const pipPreviewRefreshTimers = new Map();
const pipPreviewIdleJobs = new Map();
let pipSharpRasterizeEnabled = localStorage.getItem(STORAGE_KEYS.SHARP_RASTERIZE_ENABLED) === 'true';

const PIP_PREVIEW_REMOVE_SELECTORS = [
  '.knob-label',
  '.knob-value',
  '.synth-toggle__label',
  '.rotary-switch__label',
  '.matrix-container',
  '.routing-matrix-container',
  '.recording-settings-matrix-container',
  '.pin-btn',
  '.pip-detach-btn',
  '.knob-tooltip',
  '.tooltip',
  '.joystick-pad',
  '.panel7-joystick-pad',
  '.joystick-handle',
  '.panel-note',
  '.panel-notes-layer',
  '.note-editor-toolbar',
  '.scope-screen',
  '.oscilloscope',
  'canvas',
  'video',
  'iframe',
  '[contenteditable="true"]',
  '[id="vd-counter"]'
].join(', ');

const PIP_PREVIEW_SNAPSHOT_SELECTORS = [
  '.knob-wrapper',
  '.synth-toggle',
  '.rotary-switch',
  '.output-channel__slider-wrap',
  '.output-channel__switch-wrap'
].join(', ');

function runWhenBrowserIdle(callback, timeout = PIP_PREVIEW_IDLE_TIMEOUT_MS) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout });
  }
  return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 32);
}

function cancelBrowserIdleJob(id) {
  if (!id) return;
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
}

function clearScheduledPipPreviewRefresh(panelId) {
  const timerId = pipPreviewRefreshTimers.get(panelId);
  if (timerId) {
    clearTimeout(timerId);
    pipPreviewRefreshTimers.delete(panelId);
  }

  const idleJobId = pipPreviewIdleJobs.get(panelId);
  if (idleJobId) {
    cancelBrowserIdleJob(idleJobId);
    pipPreviewIdleJobs.delete(panelId);
  }
}

function ensurePipPreviewLayer(panelEl) {
  if (!panelEl) return null;

  let previewEl = panelEl.querySelector(':scope > .pip-panel-preview');
  if (previewEl) return previewEl;

  previewEl = document.createElement('div');
  previewEl.className = 'pip-panel-preview';
  previewEl.setAttribute('aria-hidden', 'true');

  const inlineBg = panelEl.querySelector(':scope > .panel-inline-bg');
  if (inlineBg?.nextSibling) {
    panelEl.insertBefore(previewEl, inlineBg.nextSibling);
  } else if (inlineBg) {
    panelEl.appendChild(previewEl);
  } else {
    panelEl.insertBefore(previewEl, panelEl.firstChild);
  }

  return previewEl;
}

function sanitizePipPreviewTree(root) {
  if (!root) return;

  root.querySelectorAll(PIP_PREVIEW_REMOVE_SELECTORS).forEach(el => el.remove());

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let current = root;

  while (current) {
    if (current.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      current.removeAttribute('id');
      current.removeAttribute('for');
      current.removeAttribute('aria-labelledby');
      current.removeAttribute('aria-describedby');
      current.removeAttribute('tabindex');
      current.removeAttribute('contenteditable');
      current.removeAttribute('data-tooltip');
      current.removeAttribute('title');
      current.classList?.remove('is-tooltip-active', 'tooltip-visible', 'glow-flash', 'glow-flash-pin');
      if (typeof current.style?.removeProperty === 'function') {
        current.style.removeProperty('cursor');
      }
    }

    if (current instanceof HTMLButtonElement || current instanceof HTMLInputElement || current instanceof HTMLSelectElement || current instanceof HTMLTextAreaElement) {
      current.disabled = true;
    }

    current = walker.nextNode();
  }
}

function destroyPipPreviewLayer(panelId) {
  const panelEl = document.getElementById(panelId);
  const previewEl = panelEl?.querySelector(':scope > .pip-panel-preview');
  previewEl?.remove();
}

function rebuildPipPreviewLayer(panelId) {
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return false;

  const previewEl = ensurePipPreviewLayer(panelEl);
  if (!previewEl) return false;

  const state = activePips.get(panelId);
  const panelScale = state?.scale || 1;
  const invPanelScale = panelScale > 0 ? 1 / panelScale : 1;
  const panelRect = panelEl.getBoundingClientRect();
  const fragment = document.createDocumentFragment();
  const controls = panelEl.querySelectorAll(PIP_PREVIEW_SNAPSHOT_SELECTORS);

  for (const control of controls) {
    if (control.closest('.pip-panel-preview')) continue;
    if (control.closest('.matrix-container')) continue;

    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    const item = document.createElement('div');
    item.className = 'pip-panel-preview__item';
    item.style.left = `${(rect.left - panelRect.left) * invPanelScale}px`;
    item.style.top = `${(rect.top - panelRect.top) * invPanelScale}px`;
    item.style.width = `${rect.width * invPanelScale}px`;
    item.style.height = `${rect.height * invPanelScale}px`;

    const clone = control.cloneNode(true);
    sanitizePipPreviewTree(clone);
    item.appendChild(clone);
    fragment.appendChild(item);
  }

  previewEl.replaceChildren(fragment);

  if (state) {
    state.previewReady = true;
    state.previewDirty = false;
  }

  return true;
}

function schedulePipPreviewRefresh(panelId, { immediate = false } = {}) {
  clearScheduledPipPreviewRefresh(panelId);

  const run = () => {
    pipPreviewIdleJobs.delete(panelId);
    rebuildPipPreviewLayer(panelId);
  };

  if (immediate) {
    run();
    return;
  }

  const timerId = setTimeout(() => {
    pipPreviewRefreshTimers.delete(panelId);
    const idleJobId = runWhenBrowserIdle(run);
    pipPreviewIdleJobs.set(panelId, idleJobId);
  }, PIP_PREVIEW_REFRESH_DEBOUNCE_MS);

  pipPreviewRefreshTimers.set(panelId, timerId);
}

/**
 * Calcula las dimensiones iniciales del PiP para que el panel se vea
 * como en el canvas principal a zoom mínimo.
 * @returns {{width: number, height: number, scale: number}}
 */
function getInitialPipDimensions() {
  const mainMinScale = window.__synthNavState?.getMinScale?.() || 0.4;
  const panelSize = 760; // Tamaño estándar de los paneles
  
  // Tamaño del panel a zoom mínimo del canvas
  let contentSize = Math.round(panelSize * mainMinScale);
  
  // Acotar: al menos MIN_PIP_SIZE, como máximo 50% de la pantalla
  const maxDim = Math.min(window.innerWidth * 0.5, (window.innerHeight - PIP_HEADER_HEIGHT) * 0.5);
  contentSize = Math.max(MIN_PIP_SIZE, Math.min(maxDim, contentSize));
  
  return {
    width: contentSize + PIP_BORDER_SIZE,
    height: contentSize + PIP_HEADER_HEIGHT + PIP_BORDER_SIZE,
    scale: contentSize / panelSize
  };
}

function ensurePanelMetrics(state) {
  if (!state) {
    return { panelWidth: 760, panelHeight: 760 };
  }

  const panelEl = state.panelEl || document.getElementById(state.panelId);
  if (panelEl) {
    state.panelEl = panelEl;
    state.panelWidth = panelEl.offsetWidth || state.panelWidth || 760;
    state.panelHeight = panelEl.offsetHeight || state.panelHeight || 760;
  }

  return {
    panelWidth: state.panelWidth || 760,
    panelHeight: state.panelHeight || 760
  };
}

function refreshPipViewportMetrics(state) {
  if (!state) {
    return { viewportWidth: 0, viewportHeight: 0 };
  }

  const viewport = state.viewportEl || state.pipContainer?.querySelector('.pip-viewport');
  const viewportInner = state.viewportInnerEl || state.pipContainer?.querySelector('.pip-viewport-inner');

  if (viewport) {
    state.viewportEl = viewport;
    state.viewportWidth = viewport.clientWidth || (state.width - PIP_BORDER_SIZE);
    state.viewportHeight = viewport.clientHeight || (state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE);
  } else {
    state.viewportWidth = state.width - PIP_BORDER_SIZE;
    state.viewportHeight = state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  }

  if (viewportInner) {
    state.viewportInnerEl = viewportInner;
  }

  return {
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight
  };
}

function startPipWindowDrag(panelId, pointerEvent, dragSurface) {
  const state = activePips.get(panelId);
  if (!state || state.locked) return false;

  pointerEvent.preventDefault();
  pointerEvent.stopPropagation();
  setPipPreviewMode(panelId, true);
  draggingPip = panelId;
  dragPointerId = pointerEvent.pointerId;
  dragCaptureEl = dragSurface || null;

  if (dragSurface?.setPointerCapture) {
    try {
      dragSurface.setPointerCapture(pointerEvent.pointerId);
    } catch (_) { /* ignore */ }
  }

  const rect = state.pipContainer.getBoundingClientRect();
  dragOffset.x = pointerEvent.clientX - rect.left;
  dragOffset.y = pointerEvent.clientY - rect.top;
  dragStartPosition.x = rect.left;
  dragStartPosition.y = rect.top;
  state.pipContainer.classList.add('pip-container--dragging');
  bringToFront(panelId);
  return true;
}

function clampPipScroll(state, scrollLeft, scrollTop, scale = state?.scale || 1) {
  const { panelWidth, panelHeight } = ensurePanelMetrics(state);
  const { viewportWidth, viewportHeight } = refreshPipViewportMetrics(state);
  const maxScrollX = Math.max(0, panelWidth * scale - viewportWidth);
  const maxScrollY = Math.max(0, panelHeight * scale - viewportHeight);

  return {
    scrollLeft: Math.max(0, Math.min(maxScrollX, scrollLeft)),
    scrollTop: Math.max(0, Math.min(maxScrollY, scrollTop)),
    maxScrollX,
    maxScrollY
  };
}

function cancelPendingPipInteraction(state) {
  if (!state) return;
  if (state.pendingWheelRaf) {
    cancelAnimationFrame(state.pendingWheelRaf);
    state.pendingWheelRaf = null;
  }
  cancelPipRasterize(state);
  if (state.previewTimer) {
    clearTimeout(state.previewTimer);
    state.previewTimer = null;
  }
  state.previewMode = false;
  state.previewDirty = true;
  state.panelEl?.classList?.remove('panel--pip-preview');
  state.pipContainer?.classList?.remove('pip-container--preview');
  state.pendingWheelPanX = 0;
  state.pendingWheelPanY = 0;
  state.pendingWheelMoveX = 0;
  state.pendingWheelMoveY = 0;
  state.pendingWheelZoomSteps = 0;
  state.pendingWheelClientX = null;
  state.pendingWheelClientY = null;
}

function setPipPreviewMode(panelId, active = true) {
  const state = activePips.get(panelId);
  if (!state) return;

  const panelEl = state.panelEl || document.getElementById(panelId);
  if (panelEl) state.panelEl = panelEl;

  if (!panelEl || !state.pipContainer) return;

  if (state.previewTimer) {
    clearTimeout(state.previewTimer);
    state.previewTimer = null;
  }

  if (!active) {
    state.previewMode = false;
    panelEl.classList.remove('panel--pip-preview');
    state.pipContainer.classList.remove('pip-container--preview');
    if (state.previewDirty) {
      schedulePipPreviewRefresh(panelId);
    }
    schedulePipRasterize(panelId);
    return;
  }

  cancelPipRasterize(state);
  panelEl.style.zoom = '';
  updatePipScale(panelId, state.scale, false);

  if (!state.previewReady || state.previewDirty) {
    schedulePipPreviewRefresh(panelId, { immediate: !state.previewReady });
  }

  state.previewMode = true;
  panelEl.classList.add('panel--pip-preview');
  state.pipContainer.classList.add('pip-container--preview');
  state.previewTimer = setTimeout(() => {
    state.previewTimer = null;
    state.previewMode = false;
    state.panelEl?.classList?.remove('panel--pip-preview');
    state.pipContainer?.classList?.remove('pip-container--preview');
    schedulePipRasterize(panelId);
  }, PIP_PREVIEW_IDLE_MS);
}

function schedulePipStateSave() {
  if (_isRestoring) return;
  if (_pipStateSaveTimer) clearTimeout(_pipStateSaveTimer);
  _pipStateSaveTimer = setTimeout(() => {
    _pipStateSaveTimer = null;
    savePipState();
  }, PIP_SAVE_DEBOUNCE_MS);
}

function cancelPipSharpCommit(state) {
  if (!state?.sharpCommitRaf) return;
  cancelAnimationFrame(state.sharpCommitRaf);
  state.sharpCommitRaf = null;
  state.sharpDeferCount = 0;
}

function cancelPipRasterize(state) {
  if (!state) return;
  if (state.rasterizeTimer) {
    clearTimeout(state.rasterizeTimer);
    state.rasterizeTimer = null;
  }
  cancelPipSharpCommit(state);
  state.sharpMode = false;
  state.sharpZoomFactor = 1;
}

function requestPipSharpCommit(panelId) {
  const state = activePips.get(panelId);
  if (!state) return;
  cancelPipSharpCommit(state);
  state.sharpDeferCount = 0;
  state.sharpCommitRaf = requestAnimationFrame(() => commitPipSharpMode(panelId));
}

function commitPipSharpMode(panelId) {
  const state = activePips.get(panelId);
  if (!state) return;

  state.sharpCommitRaf = null;
  if (state.sharpZoomFactor <= 1) return;

  const hasPendingInput = typeof navigator?.scheduling?.isInputPending === 'function'
    && navigator.scheduling.isInputPending({ includeContinuous: true });

  if (hasPendingInput && state.sharpDeferCount < PIP_MAX_SHARP_DEFER_FRAMES) {
    state.sharpDeferCount++;
    state.sharpCommitRaf = requestAnimationFrame(() => commitPipSharpMode(panelId));
    return;
  }

  state.sharpMode = true;
  updatePipScale(panelId, state.scale, false);
}

function enterPipSharpMode(panelId) {
  const state = activePips.get(panelId);
  if (!state || !pipSharpRasterizeEnabled) return;

  const target = Math.min(state.scale, PIP_MAX_SHARP_ZOOM);
  if (target < PIP_MIN_SHARP_SCALE) {
    if (state.activeZoom > 1) {
      state.activeZoom = 1;
      state.panelEl?.style?.setProperty('zoom', '');
      updatePipScale(panelId, state.scale, false);
    }
    return;
  }

  const { panelWidth, panelHeight } = ensurePanelMetrics(state);
  const maxByW = PIP_MAX_RASTER_DIMENSION / Math.max(panelWidth, 1);
  const maxByH = PIP_MAX_RASTER_DIMENSION / Math.max(panelHeight, 1);
  const safeZoom = Math.min(target, maxByW, maxByH);
  if (safeZoom < PIP_MIN_SHARP_SCALE) return;

  state.sharpZoomFactor = Math.round(safeZoom * 100) / 100;
  requestPipSharpCommit(panelId);
}

function schedulePipRasterize(panelId) {
  const state = activePips.get(panelId);
  if (!state || !pipSharpRasterizeEnabled) return;
  cancelPipRasterize(state);
  state.rasterizeTimer = setTimeout(() => {
    state.rasterizeTimer = null;
    enterPipSharpMode(panelId);
  }, PIP_RASTERIZE_DELAY_MS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLTIPS PARA BOTONES PIP (estilo quickbar)
// ═══════════════════════════════════════════════════════════════════════════════

/** Tiempo de pulsación larga para mostrar tooltip en táctil (ms) */
const PIP_LONG_PRESS_DURATION = 400;

/** Tooltip PiP activo actualmente */
let _pipTooltipBtn = null;
let _pipLongPressTimer = null;

/**
 * Oculta el tooltip PiP activo.
 */
function hidePipTooltip() {
  if (_pipTooltipBtn) {
    _pipTooltipBtn.classList.remove('tooltip-visible');
    _pipTooltipBtn = null;
  }
  if (_pipLongPressTimer) {
    clearTimeout(_pipLongPressTimer);
    _pipLongPressTimer = null;
  }
}

/**
 * Configura long-press tooltip en un botón PiP individual.
 * @param {HTMLElement} btn - Botón a configurar
 */
function setupPipBtnLongPress(btn) {
  let startX = 0, startY = 0, shown = false;

  btn.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    shown = false;
    _pipLongPressTimer = setTimeout(() => {
      hidePipTooltip();
      btn.classList.add('tooltip-visible');
      _pipTooltipBtn = btn;
      shown = true;
      if (navigator.vibrate) navigator.vibrate(15);
    }, PIP_LONG_PRESS_DURATION);
  }, { passive: true });

  btn.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
      hidePipTooltip();
    }
  }, { passive: true });

  btn.addEventListener('touchend', (e) => {
    if (shown) {
      e.preventDefault();
      setTimeout(hidePipTooltip, 1500);
    } else {
      hidePipTooltip();
    }
  });

  btn.addEventListener('touchcancel', () => hidePipTooltip(), { passive: true });
}

/**
 * Configura tooltips long-press para todos los botones de un contenedor PiP.
 * @param {HTMLElement} pipContainer - Contenedor PiP
 */
function setupPipLongPressTooltips(pipContainer) {
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) return;
  const buttons = pipContainer.querySelectorAll('.pip-controls button[data-tooltip]');
  buttons.forEach(btn => setupPipBtnLongPress(btn));
}

function getPipCoverScale(viewportWidth, viewportHeight, panelWidth, panelHeight) {
  const scaleX = viewportWidth / panelWidth;
  const scaleY = viewportHeight / panelHeight;
  return Math.max(MIN_SCALE_ABSOLUTE, Math.max(scaleX, scaleY));
}

/**
 * Calcula la escala mínima para que el panel cubra por completo el viewport.
 * Nunca debe quedar espacio en blanco dentro del PiP: si el marco crece,
 * el panel crece con él y el exceso se resuelve con scroll.
 * @param {string} panelId - ID del panel
 * @returns {number} Escala mínima
 */
function getMinScale(panelId) {
  const state = activePips.get(panelId);
  if (!state) return MIN_SCALE_ABSOLUTE;

  const { panelWidth, panelHeight } = ensurePanelMetrics(state);
  return Math.max(
    MIN_SCALE_ABSOLUTE,
    MIN_PIP_SIZE / Math.max(panelWidth, 1),
    MIN_PIP_SIZE / Math.max(panelHeight, 1)
  );
}

function applyPipWheelZoom(panelId, targetScale, clientX = null, clientY = null) {
  const state = activePips.get(panelId);
  if (!state) return false;

  const oldScale = state.scale || 1;
  if (oldScale <= 0) return false;

  refreshPipViewportMetrics(state);
  const viewport = state.viewportEl;
  if (!viewport) return false;

  const { panelWidth, panelHeight } = ensurePanelMetrics(state);
  const requestedScale = Math.max(MIN_SCALE_ABSOLUTE, Math.min(MAX_SCALE, targetScale));
  const containerRect = state.pipContainer.getBoundingClientRect();

  const anchorClientX = clientX == null ? (containerRect.left + state.width / 2) : clientX;
  const anchorClientY = clientY == null ? (containerRect.top + state.height / 2) : clientY;
  const anchorRatioX = state.width > 0 ? (anchorClientX - containerRect.left) / state.width : 0.5;
  const anchorRatioY = state.height > 0 ? (anchorClientY - containerRect.top) / state.height : 0.5;
  const finalScale = Math.max(getMinScale(panelId), requestedScale);
  const newWidth = Math.max(MIN_PIP_SIZE, Math.round(panelWidth * finalScale) + PIP_BORDER_SIZE);
  const newHeight = Math.max(MIN_PIP_SIZE, Math.round(panelHeight * finalScale) + PIP_HEADER_HEIGHT + PIP_BORDER_SIZE);

  let newX = anchorClientX - anchorRatioX * newWidth;
  let newY = anchorClientY - anchorRatioY * newHeight;

  state.width = newWidth;
  state.height = newHeight;
  state.x = newX;
  state.y = newY;
  state.pipContainer.style.width = `${newWidth}px`;
  state.pipContainer.style.height = `${newHeight}px`;
  state.pipContainer.style.left = `${newX}px`;
  state.pipContainer.style.top = `${newY}px`;

  updatePipScale(panelId, finalScale, false);
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
  state.lastScrollLeft = 0;
  state.lastScrollTop = 0;

  return finalScale !== oldScale || newWidth !== containerRect.width || newHeight !== containerRect.height;
}

function flushPipWheelInteraction(panelId) {
  const state = activePips.get(panelId);
  if (!state) return;

  state.pendingWheelRaf = null;
  refreshPipViewportMetrics(state);
  const viewport = state.viewportEl;
  if (!viewport) return;

  let didChange = false;

  if (state.pendingWheelZoomSteps !== 0) {
    const zoomSteps = state.pendingWheelZoomSteps;
    const clientX = state.pendingWheelClientX;
    const clientY = state.pendingWheelClientY;
    state.pendingWheelZoomSteps = 0;
    state.pendingWheelClientX = null;
    state.pendingWheelClientY = null;

    const oldScale = state.scale;
    const minScale = getMinScale(panelId);
    const zoomFactor = zoomSteps > 0
      ? (PIP_WHEEL_ZOOM_IN_FACTOR ** zoomSteps)
      : (1 / (PIP_WHEEL_ZOOM_OUT_FACTOR ** Math.abs(zoomSteps)));
    const newScale = Math.max(minScale, Math.min(MAX_SCALE, oldScale * zoomFactor));

    if (newScale !== oldScale) {
      setPipPreviewMode(panelId, true);
      didChange = applyPipWheelZoom(panelId, newScale, clientX, clientY) || didChange;
    }
  }

  if (state.pendingWheelPanX !== 0 || state.pendingWheelPanY !== 0) {
    const deltaX = state.pendingWheelPanX;
    const deltaY = state.pendingWheelPanY;
    state.pendingWheelPanX = 0;
    state.pendingWheelPanY = 0;
    setPipPreviewMode(panelId, true);

    const clampedScroll = clampPipScroll(
      state,
      viewport.scrollLeft + deltaX * PIP_WHEEL_PAN_FACTOR,
      viewport.scrollTop + deltaY * PIP_WHEEL_PAN_FACTOR
    );
    viewport.scrollLeft = clampedScroll.scrollLeft;
    viewport.scrollTop = clampedScroll.scrollTop;
    didChange = true;
  }

  if (state.pendingWheelMoveX !== 0 || state.pendingWheelMoveY !== 0) {
    const moveX = state.pendingWheelMoveX;
    const moveY = state.pendingWheelMoveY;
    state.pendingWheelMoveX = 0;
    state.pendingWheelMoveY = 0;
    setPipPreviewMode(panelId, true);

    state.x -= moveX;
    state.y -= moveY;
    state.pipContainer.style.left = `${state.x}px`;
    state.pipContainer.style.top = `${state.y}px`;
    didChange = true;
  }

  if (didChange) {
    state.lastScrollLeft = viewport.scrollLeft;
    state.lastScrollTop = viewport.scrollTop;
    schedulePipStateSave();
  }
}

function schedulePipWheelInteraction(panelId) {
  const state = activePips.get(panelId);
  if (!state || state.pendingWheelRaf) return;
  state.pendingWheelRaf = requestAnimationFrame(() => flushPipWheelInteraction(panelId));
}

/**
 * ID del PiP con foco (último interactuado). null = foco en canvas principal.
 * Se expone como window.__synthFocusedPip para que el bridge de zoom lo consulte.
 */
let focusedPipId = null;

/** Panel actualmente siendo arrastrado */
let draggingPip = null;
let dragOffset = { x: 0, y: 0 };
let dragStartPosition = { x: 0, y: 0 };
let dragPointerId = null;
let dragCaptureEl = null;

/** Panel actualmente siendo redimensionado */
let resizingPip = null;
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
let resizePointerId = null;
/** Borde que se está redimensionando: 'corner' | 'right' | 'bottom' | 'left' | 'top' */
let resizeEdge = 'corner';

/** Panel actualmente siendo paneado con ratón */
let panningPip = null;
let panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };
let panPointerId = null;

/** Flag para indicar que hay un gesto táctil activo (evita ciclos de layout en Samsung) */
let gestureInProgress = false;

/** Posiciones aproximadas de cada panel en el layout del Synthi (relativas a la ventana) */
const PANEL_POSITIONS = {
  'panel-1': { col: 0, row: 0 },
  'panel-2': { col: 1, row: 0 },
  'panel-3': { col: 2, row: 0 },
  'panel-4': { col: 3, row: 0 },
  'panel-5': { col: 0, row: 1 },
  'panel-6': { col: 2, row: 1 },
  'panel-output': { col: 3, row: 1 },
  'panel-7': { col: 3, row: 1 } // alias
};

/** Orden correcto de paneles en el grid (para restaurar posición al cerrar PiP) */
const PANEL_ORDER = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];

/** Lista de todos los paneles disponibles */
export const ALL_PANELS = [
  { id: 'panel-1', name: () => 'Panel 1' },
  { id: 'panel-2', name: () => 'Panel 2' },
  { id: 'panel-3', name: () => 'Panel 3' },
  { id: 'panel-4', name: () => 'Panel 4' },
  { id: 'panel-5', name: () => 'Panel 5' },
  { id: 'panel-6', name: () => 'Panel 6' },
  { id: 'panel-output', name: () => 'Panel 7' }
];

/** Duración del long press en ms para activar menú contextual (iOS Safari) */
const LONG_PRESS_DURATION = 500;

/** Estado del long press por panel */
const longPressTimers = new Map();

/** Tracking de long-press disparados (para prevenir click sintético en touchend) */
const longPressFired = new Map();

/** Flag para suprimir el contextmenu nativo que el browser dispara tras un long-press táctil */
let suppressNextContextMenu = false;

/**
 * Inicializa el sistema PiP creando el layer contenedor.
 */
export function initPipManager() {
  if (pipLayer) return;
  
  pipLayer = document.createElement('div');
  pipLayer.id = 'pipLayer';
  pipLayer.className = 'pip-layer';
  document.body.appendChild(pipLayer);
  
  // Listeners globales para drag y resize
  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp);
  document.addEventListener('pointercancel', handlePointerUp);
  
  // Invalidar auto-lock si el usuario cambia los locks manualmente
  // (cualquier cambio que no venga del propio pipAutoLock)
  const invalidateAutoLock = (e) => {
    if (_autoLockedByPip && e.detail?.source !== 'pipAutoLock') {
      _autoLockedByPip = false;
    }
  };
  document.addEventListener('synth:panLockChange', invalidateAutoLock);
  document.addEventListener('synth:zoomLockChange', invalidateAutoLock);

  document.addEventListener('synth:userInteraction', () => {
    for (const panelId of activePips.keys()) {
      const state = activePips.get(panelId);
      if (!state) continue;
      state.previewDirty = true;
      if (!state.previewMode) {
        schedulePipPreviewRefresh(panelId);
      }
    }
  });

  document.addEventListener('synth:sharpRasterizeChange', (event) => {
    pipSharpRasterizeEnabled = Boolean(event.detail?.enabled);
    for (const [panelId, state] of activePips) {
      if (!pipSharpRasterizeEnabled) {
        cancelPipRasterize(state);
        state.panelEl?.style?.setProperty('zoom', '');
      }
      updatePipScale(panelId, state.scale, false);
      if (pipSharpRasterizeEnabled && !state.previewMode && !state.locked) {
        schedulePipRasterize(panelId);
      }
    }
  });
  
  // Shortcut para cerrar todos los PiPs: Escape doble
  let lastEscapeTime = 0;
  // Click en el canvas principal → quitar foco del PiP
  const viewportOuter = document.getElementById('viewportOuter');
  if (viewportOuter) {
    viewportOuter.addEventListener('pointerdown', () => {
      focusedPipId = null;
      window.__synthFocusedPip = null;
    });
  }

  // Exponer función de zoom para PiP enfocado (usada por electronMenuBridge)
  window.__synthZoomFocusedPip = (direction) => {
    if (!focusedPipId || !activePips.has(focusedPipId)) return false;
    const state = activePips.get(focusedPipId);
    if (!state) return false;
    // Bloquear zoom externo cuando está bloqueado
    if (state.locked) return true;
    const minScale = getMinScale(focusedPipId);
    let nextScale = state.scale;
    if (direction === 'in') {
      nextScale = Math.min(state.scale * PIP_WHEEL_ZOOM_IN_FACTOR, MAX_SCALE);
    } else if (direction === 'out') {
      nextScale = Math.max(state.scale / PIP_WHEEL_ZOOM_OUT_FACTOR, minScale);
    } else if (direction === 'reset') {
      nextScale = minScale;
    }
    applyPipWheelZoom(focusedPipId, nextScale);
    schedulePipStateSave();
    return true;
  };

  // Exponer función de paneo con flechas para PiP enfocado
  window.__synthPanFocusedPip = (dirX, dirY) => {
    if (!focusedPipId || !activePips.has(focusedPipId)) return false;
    const state = activePips.get(focusedPipId);
    if (!state || state.locked) return true; // Absorber pero no actuar si bloqueado
    const stepX = state.width * 0.15;
    const stepY = state.height * 0.15;
    state.x += dirX * stepX;
    state.y += dirY * stepY;
    state.pipContainer.style.left = `${state.x}px`;
    state.pipContainer.style.top = `${state.y}px`;
    schedulePipStateSave();
    return true;
  };
  
  window.__synthPipDebug = {
    open: openPip,
    close: closePip,
    openAll: openAllPips,
    closeAll: closeAllPips,
    focus: focusPip,
    list() {
      return Array.from(activePips.entries()).map(([panelId, pipState]) => ({
        panelId,
        scale: pipState.scale,
        x: pipState.x,
        y: pipState.y,
        width: pipState.width,
        height: pipState.height,
        locked: pipState.locked
      }));
    }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activePips.size > 0) {
      const now = Date.now();
      if (now - lastEscapeTime < 400) {
        // Doble Escape: cerrar todos los PiPs
        closeAllPips();
      }
      lastEscapeTime = now;
    }
    
    // Shortcuts +/- (sin Ctrl) para redimensionar PiP enfocado
    // Ctrl+/- se usa para zoom del contenido (viewportNavigation)
    if (focusedPipId && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const state = activePips.get(focusedPipId);
      if (!state || state.locked) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        maximizePip(focusedPipId);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        restorePipSize(focusedPipId);
      } else if (e.key === '0') {
        e.preventDefault();
        fitPanelToSquare(focusedPipId);
      }
    }
  });
  
  // Configurar menú contextual en paneles
  setupPanelContextMenus();
  
  log.info('PipManager inicializado');
}

/**
 * Configura el menú contextual en todos los paneles.
 * Incluye soporte para long press en dispositivos táctiles (iOS Safari).
 */
function setupPanelContextMenus() {
  const panels = document.querySelectorAll('.panel');
  log.info(`Configurando menú contextual en ${panels.length} paneles`);
  
  panels.forEach(panelEl => {
    // Evento contextmenu estándar (click derecho en desktop)
    panelEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Si el long-press timer ya abrió el menú, suprimir el contextmenu nativo duplicado
      if (suppressNextContextMenu) {
        suppressNextContextMenu = false;
        return;
      }
      // Solo mostrar si el panel no está ya en PiP
      if (activePips.has(panelEl.id)) return;
      
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        panelId: panelEl.id,
        isPipped: false,
        target: e.target,
        onDetach: openPip
      });
    });
    
    // Long press para dispositivos táctiles (iOS Safari no dispara contextmenu)
    panelEl.addEventListener('touchstart', (e) => {
      if (activePips.has(panelEl.id)) return;
      
      // Cancelar timer previo si existe
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
      }
      longPressFired.delete(panelEl.id);
      
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      
      const timer = setTimeout(() => {
        longPressTimers.delete(panelEl.id);
        longPressFired.set(panelEl.id, true);
        // Suprimir el contextmenu nativo que el browser puede disparar tras el long-press
        suppressNextContextMenu = true;
        // Vibrar si está disponible (feedback háptico)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        showContextMenu({
          x: startX,
          y: startY,
          panelId: panelEl.id,
          isPipped: false,
          target: e.target,
          onDetach: openPip
        });
      }, LONG_PRESS_DURATION);
      
      longPressTimers.set(panelEl.id, timer);
    }, { passive: true });
    
    // Cancelar long press si el dedo se mueve
    panelEl.addEventListener('touchmove', (e) => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
      longPressFired.delete(panelEl.id);
    }, { passive: true });
    
    // Cancelar long press si el dedo se levanta
    panelEl.addEventListener('touchend', (e) => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
      // Prevenir click sintético tras long-press (cerraría el menú contextual)
      if (longPressFired.has(panelEl.id)) {
        e.preventDefault();
        longPressFired.delete(panelEl.id);
      }
    }, { passive: false });
    
    panelEl.addEventListener('touchcancel', () => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
      longPressFired.delete(panelEl.id);
    }, { passive: true });
  });
}

/**
 * Calcula la posición inicial de un PiP basada en su posición en el grid del Synthi.
 * @param {string} panelId - ID del panel
 * @returns {{x: number, y: number}} Posición inicial
 */
function getInitialPipPosition(panelId, pipWidth, pipHeight) {
  const pos = PANEL_POSITIONS[panelId] || { col: 0, row: 0 };
  const cols = 4;
  const rows = 2;
  
  // Calcular posición proporcional en la ventana
  // Dejamos margen para la quickbar (derecha) y bordes
  const marginTop = 60;
  const marginRight = 80;
  const marginBottom = 40;
  const marginLeft = 20;
  
  const availableWidth = window.innerWidth - marginLeft - marginRight;
  const availableHeight = window.innerHeight - marginTop - marginBottom;
  
  const cellWidth = availableWidth / cols;
  const cellHeight = availableHeight / rows;
  
  // Centro de la celda menos la mitad del tamaño del PiP
  const x = marginLeft + (pos.col * cellWidth) + (cellWidth - pipWidth) / 2;
  const y = marginTop + (pos.row * cellHeight) + (cellHeight - pipHeight) / 2;
  
  return {
    x: Math.max(marginLeft, Math.min(x, window.innerWidth - pipWidth - marginRight)),
    y: Math.max(marginTop, Math.min(y, window.innerHeight - pipHeight - marginBottom))
  };
}

/**
 * Alterna el estado PiP de un panel.
 * @param {string} panelId - ID del panel
 */
export function togglePip(panelId) {
  if (activePips.has(panelId)) {
    closePip(panelId);
  } else {
    openPip(panelId);
  }
}

/**
 * Obtiene los IDs de los paneles actualmente en modo PiP.
 * @returns {string[]} Array de IDs de paneles abiertos como PiP
 */
export function getOpenPips() {
  return Array.from(activePips.keys());
}

/**
 * Trae un PiP al frente y le da foco.
 * Usado por los atajos de teclado (1-7) cuando el panel está en PiP.
 * @param {string} panelId - ID del panel
 * @returns {boolean} true si el panel estaba en PiP y se enfocó
 */
export function focusPip(panelId) {
  if (!activePips.has(panelId)) return false;
  bringToFront(panelId);
  return true;
}

/**
 * Extrae un panel a modo PiP.
 * @param {string} panelId - ID del panel
 * @param {Object} [restoredConfig] - Configuración guardada para restaurar (posición, tamaño, zoom, scroll, lock)
 */
export function openPip(panelId, restoredConfig = null) {
  const panelEl = document.getElementById(panelId);
  if (!panelEl || activePips.has(panelId)) return;
  
  const originalParent = panelEl.parentElement;
  const siblings = Array.from(originalParent.children);
  const originalIndex = siblings.indexOf(panelEl);
  
  // Crear placeholder que ocupa el lugar del panel en el grid
  const placeholder = document.createElement('div');
  placeholder.className = 'pip-placeholder';
  placeholder.id = `pip-placeholder-${panelId}`;
  
  // Copiar la posición de grid del panel original
  const panelCol = panelEl.style.getPropertyValue('--panel-col');
  const panelRow = panelEl.style.getPropertyValue('--panel-row');
  if (panelCol) placeholder.style.setProperty('--panel-col', panelCol);
  if (panelRow) placeholder.style.setProperty('--panel-row', panelRow);
  
  placeholder.innerHTML = `
    <div class="pip-placeholder__content">
      <span class="pip-placeholder__title">${getPanelTitle(panelId)}</span>
      <span class="pip-placeholder__hint">${t('pip.placeholderHint', 'Mantener pulsado para opciones')}</span>
    </div>
  `;
  
  // Insertar placeholder donde estaba el panel
  panelEl.parentElement.insertBefore(placeholder, panelEl);
  
  // Menú contextual en placeholder: right-click (desktop) + long-press (touch).
  // Unificar lógica de suppressNextContextMenu y preventDefault como en paneles principales
  placeholder.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressNextContextMenu) {
      suppressNextContextMenu = false;
      return;
    }
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      panelId,
      isPipped: true,
      target: e.target,
      onAttach: closePip
    });
  });

  // Long press para dispositivos táctiles (iOS Safari no dispara contextmenu)
  let phLongPressTimer = null;
  let phLongPressFired = false;

  placeholder.addEventListener('touchstart', (e) => {
    if (phLongPressTimer) clearTimeout(phLongPressTimer);
    phLongPressFired = false;
    const touch = e.touches[0];
    const sx = touch.clientX;
    const sy = touch.clientY;

    phLongPressTimer = setTimeout(() => {
      phLongPressTimer = null;
      phLongPressFired = true;
      suppressNextContextMenu = true;
      if (navigator.vibrate) navigator.vibrate(50);
      showContextMenu({
        x: sx, y: sy,
        panelId,
        isPipped: true,
        target: e.target,
        onAttach: closePip
      });
    }, LONG_PRESS_DURATION);
  }, { passive: true });

  placeholder.addEventListener('touchmove', () => {
    if (phLongPressTimer) { clearTimeout(phLongPressTimer); phLongPressTimer = null; }
    phLongPressFired = false;
  }, { passive: true });

  placeholder.addEventListener('touchend', (e) => {
    if (phLongPressTimer) { clearTimeout(phLongPressTimer); phLongPressTimer = null; }
    // Prevenir click sintético tras long-press
    if (phLongPressFired) {
      e.preventDefault();
      phLongPressFired = false;
    }
  }, { passive: false });

  placeholder.addEventListener('touchcancel', () => {
    if (phLongPressTimer) { clearTimeout(phLongPressTimer); phLongPressTimer = null; }
    phLongPressFired = false;
  }, { passive: true });
  
  // Crear contenedor PiP
  const pipContainer = document.createElement('div');
  pipContainer.className = 'pip-container pip-container--frameless';
  pipContainer.dataset.panelId = panelId;
  
  // ── Dimensiones y posición: usar config restaurada o calcular iniciales ──
  let initX, initY, initW, initH, initScale;
  
  if (restoredConfig) {
    // Ajustar posición a los límites de la ventana actual
    const maxX = window.innerWidth - restoredConfig.width;
    const maxY = window.innerHeight - 40;
    const maxW = window.innerWidth - Math.max(0, restoredConfig.x);
    const maxH = window.innerHeight - Math.max(0, restoredConfig.y);
    initX = Math.max(0, Math.min(maxX, restoredConfig.x));
    initY = Math.max(0, Math.min(maxY, restoredConfig.y));
    initW = Math.max(MIN_PIP_SIZE, Math.min(maxW, restoredConfig.width));
    initH = Math.max(MIN_PIP_SIZE, Math.min(maxH, restoredConfig.height));
    initScale = restoredConfig.scale; // Se clampeará después del reflow
    pipContainer.style.zIndex = restoredConfig.zIndex || PIP_Z_INDEX_BASE + activePips.size;
  } else {
    const pipDims = getInitialPipDimensions();
    const initialPos = getInitialPipPosition(panelId, pipDims.width, pipDims.height);
    initX = initialPos.x;
    initY = initialPos.y;
    initW = pipDims.width;
    initH = pipDims.height;
    initScale = pipDims.scale;
    pipContainer.style.zIndex = PIP_Z_INDEX_BASE + activePips.size;
  }
  
  pipContainer.style.left = `${initX}px`;
  pipContainer.style.top = `${initY}px`;
  pipContainer.style.width = `${initW}px`;
  pipContainer.style.height = `${initH}px`;
  
  // Barra de título
  const header = document.createElement('div');
  header.className = 'pip-header';
  header.innerHTML = `
    <span class="pip-title">${getPanelTitle(panelId)}</span>
    <div class="pip-controls">
      <button type="button" class="pip-minimize" aria-label="${t('pip.minimize', 'Minimizar')}" data-tooltip="${t('pip.minimize', 'Minimizar')}">−</button>
      <button type="button" class="pip-maximize" aria-label="${t('pip.maximize', 'Maximizar')}" data-tooltip="${t('pip.maximize', 'Maximizar')}">+</button>
      <button type="button" class="pip-fit" aria-label="${t('pip.fitPanel', 'Ajustar panel')}" data-tooltip="${t('pip.fitPanel', 'Ajustar panel')}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 3v18M3 9h18"/>
        </svg>
      </button>
      <button type="button" class="pip-lock" aria-label="${t('pip.lock', 'Bloquear')}" data-tooltip="${t('pip.lock', 'Bloquear')}">
        <svg class="pip-lock__icon-unlocked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0"/>
        </svg>
        <svg class="pip-lock__icon-locked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>
      <button type="button" class="pip-close" aria-label="${t('pip.close', 'Cerrar')}" data-tooltip="${t('pip.close', 'Cerrar')}">&times;</button>
    </div>
  `;
  
  // Contenedor del contenido con scroll/zoom
  const content = document.createElement('div');
  content.className = 'pip-content';
  
  // Viewport interno para el panel (este hace scroll)
  const viewport = document.createElement('div');
  viewport.className = 'pip-viewport';
  
  // Contenedor interno que mantiene el tamaño escalado del panel
  const viewportInner = document.createElement('div');
  viewportInner.className = 'pip-viewport-inner';
  
  // Mover el panel al contenedor interno
  viewportInner.appendChild(panelEl);
  viewport.appendChild(viewportInner);
  content.appendChild(viewport);
  pipContainer.appendChild(header);
  pipContainer.appendChild(content);
  
  // Handles de resize: todos preservan proporción de panel detached
  for (const edge of ['right', 'bottom', 'left', 'top']) {
    const edgeHandle = document.createElement('div');
    edgeHandle.className = `pip-resize-edge pip-resize-edge--${edge}`;
    edgeHandle.dataset.edge = edge;
    pipContainer.appendChild(edgeHandle);
  }
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pip-resize-handle';
  resizeHandle.dataset.edge = 'corner';
  pipContainer.appendChild(resizeHandle);

  pipLayer.appendChild(pipContainer);
  
  // Estado inicial
  const state = {
    panelId,
    originalParent,
    originalIndex,
    pipContainer,
    panelEl,
    contentEl: content,
    viewportEl: viewport,
    viewportInnerEl: viewportInner,
    x: initX,
    y: initY,
    width: initW,
    height: initH,
    scale: initScale,
    panelWidth: panelEl.offsetWidth || 760,
    panelHeight: panelEl.offsetHeight || 760,
    viewportWidth: 0,
    viewportHeight: 0,
    previewMode: false,
    previewReady: false,
    previewDirty: true,
    activeZoom: 1,
    sharpMode: false,
    sharpZoomFactor: 1,
    rasterizeTimer: null,
    sharpCommitRaf: null,
    sharpDeferCount: 0,
    previewTimer: null,
    defaultWidth: restoredConfig?.defaultWidth || initW,
    defaultHeight: restoredConfig?.defaultHeight || initH,
    locked: false, // El lock se aplica después del scroll en restauración
    isMaximized: restoredConfig?.isMaximized || false,
    // El contenido del panel detached no debe desplazarse dentro del viewport.
    lastScrollLeft: 0,
    lastScrollTop: 0,
    pendingWheelRaf: null,
    pendingWheelPanX: 0,
    pendingWheelPanY: 0,
    pendingWheelMoveX: 0,
    pendingWheelMoveY: 0,
    pendingWheelZoomSteps: 0,
    pendingWheelClientX: null,
    pendingWheelClientY: null
  };

  refreshPipViewportMetrics(state);
  activePips.set(panelId, state);
  schedulePipPreviewRefresh(panelId, { immediate: true });
  schedulePipRasterize(panelId);
  if (perfMonitor.isEnabled()) {
    perfMonitor.incrementCounter('pip.open');
    perfMonitor.mark('pip:open', { panelId, restored: !!restoredConfig });
  }
  
  if (restoredConfig) {
    // ── RESTAURACIÓN: aplicar escala guardada directamente ──
    // Forzar reflow para que viewport tenga dimensiones correctas
    // eslint-disable-next-line no-unused-expressions
    pipContainer.offsetHeight;
    
    state.scale = Math.max(getMinScale(panelId), Math.min(MAX_SCALE, initScale));
    applyPipWheelZoom(panelId, state.scale);
    
    log.debug(`PiP ${panelId} restaurado: scale=${state.scale.toFixed(3)} (saved=${initScale}), size=${initW}x${initH}`);
    
    // Restaurar scroll y lock en rAF (necesita layout con el nuevo scale/padding)
    const savedScrollX = 0;
    const savedScrollY = 0;
    const shouldLock = restoredConfig.locked || false;
    const appliedScale = state.scale;
    
    requestAnimationFrame(() => {
      // Re-aplicar escala/tamaño con layout definitivo
      applyPipWheelZoom(panelId, appliedScale);
      
      // Restaurar scroll y actualizar referencia de lock directamente
      viewport.scrollLeft = savedScrollX;
      viewport.scrollTop = savedScrollY;
      state.lastScrollLeft = savedScrollX;
      state.lastScrollTop = savedScrollY;
      
      log.debug(`PiP ${panelId} rAF: scroll=${viewport.scrollLeft},${viewport.scrollTop} (target=${savedScrollX},${savedScrollY})`);
      
      // Diferir el lock al siguiente macrotask: los scroll events de las
      // asignaciones anteriores se despachan asíncronamente. Si aplicamos
      // el lock aquí, el listener revertirá el scroll a lastScroll (viejo).
      // Con setTimeout(0), los scroll events ya habrán actualizado lastScroll.
      if (shouldLock) {
        setTimeout(() => {
          state.locked = true;
          pipContainer.classList.add('pip-container--locked');
          const lockBtn = pipContainer.querySelector('.pip-lock');
          if (lockBtn) {
            const label = t('pip.unlock', 'Desbloquear');
            lockBtn.setAttribute('aria-label', label);
            lockBtn.setAttribute('data-tooltip', label);
          }
        }, 0);
      }
    });
  } else {
    // ── NUEVO PIP: calcular escala y centrar ──
    applyPipWheelZoom(panelId, state.scale);
    
    // Mantener scroll interno neutralizado
    const pipViewport = pipContainer.querySelector('.pip-viewport');
    if (pipViewport) {
      pipViewport.scrollLeft = 0;
      pipViewport.scrollTop = 0;
    }
  }
  
  // Event listeners del PiP
  setupPipEvents(pipContainer, panelId);
  
  // Marcar panel como pipped para CSS
  panelEl.classList.add('panel--pipped');
  
  log.info(`Panel ${panelId} extraído a PiP`);
  
  // Guardar estado
  savePipState();
  
  // Emitir evento
  window.dispatchEvent(new CustomEvent('pip:open', { detail: { panelId } }));
  
  // ── Auto-lock al abrir la primera PiP ──
  // Cuando se pasa de 0 a 1 PiP (y no es restauración),
  // zoom out al mínimo y bloquear paneo+zoom del canvas principal.
  // El usuario puede desbloquear manualmente después.
  // Se omite si restoredConfig (restauración de patch) o _isRestoring (sesión).
  if (activePips.size === 1 && !_isRestoring && !restoredConfig) {
    // 1. Zoom out a vista general (animado)
    if (typeof window.__synthAnimateToPanel === 'function') {
      window.__synthAnimateToPanel(null, 600);
    }
    // 2. Bloquear paneo y zoom
    const navLocks = window.__synthNavLocks || (window.__synthNavLocks = { zoomLocked: false, panLocked: false });
    _autoLockedByPip = true;
    if (!navLocks.panLocked) {
      navLocks.panLocked = true;
      document.dispatchEvent(new CustomEvent('synth:panLockChange', {
        detail: { enabled: true, source: 'pipAutoLock' }
      }));
    }
    if (!navLocks.zoomLocked) {
      navLocks.zoomLocked = true;
      document.dispatchEvent(new CustomEvent('synth:zoomLockChange', {
        detail: { enabled: true, source: 'pipAutoLock' }
      }));
    }
  }
}

/**
 * Devuelve un panel PiP a su posición original.
 * @param {string} panelId - ID del panel
 */
export function closePip(panelId) {
  const state = activePips.get(panelId);
  if (!state) return;
  cancelPendingPipInteraction(state);
  cancelPipRasterize(state);
  clearScheduledPipPreviewRefresh(panelId);
  
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return;
  destroyPipPreviewLayer(panelId);
  
  // Resetear escala del panel
  panelEl.style.zoom = '';
  panelEl.style.transform = '';
  panelEl.classList.remove('panel--pipped');
  
  // El placeholder está en la posición correcta - reemplazarlo por el panel
  const placeholder = document.getElementById(`pip-placeholder-${panelId}`);
  if (placeholder && placeholder.parentElement) {
    placeholder.parentElement.insertBefore(panelEl, placeholder);
    placeholder.remove();
  } else {
    // Fallback: calcular posición si no hay placeholder
    const { originalParent } = state;
    const currentElements = Array.from(originalParent.children);
    const targetIndex = PANEL_ORDER.indexOf(panelId);
    
    let insertBefore = null;
    for (const existing of currentElements) {
      // Considerar tanto paneles como placeholders
      const existingId = existing.id.replace('pip-placeholder-', '');
      const existingIndex = PANEL_ORDER.indexOf(existingId);
      if (existingIndex > targetIndex) {
        insertBefore = existing;
        break;
      }
    }
    
    if (insertBefore) {
      originalParent.insertBefore(panelEl, insertBefore);
    } else {
      originalParent.appendChild(panelEl);
    }
  }
  
  // Eliminar contenedor PiP
  const { pipContainer } = state;
  pipContainer.remove();
  
  activePips.delete(panelId);
  if (perfMonitor.isEnabled()) {
    perfMonitor.incrementCounter('pip.close');
    perfMonitor.mark('pip:close', { panelId });
  }
  
  // Si el PiP cerrado tenía el foco, devolver foco al canvas principal
  if (focusedPipId === panelId) {
    focusedPipId = null;
    window.__synthFocusedPip = null;
  }
  
  log.info(`Panel ${panelId} devuelto a viewport`);
  
  // Guardar estado
  savePipState();
  
  // Emitir evento
  window.dispatchEvent(new CustomEvent('pip:close', { detail: { panelId } }));
  
  // ── Auto-unlock al cerrar la última PiP ──
  // Si los locks fueron activados por auto-lock y el usuario no los cambió
  // manualmente, desbloquear al volver a 0 PiPs.
  if (activePips.size === 0 && _autoLockedByPip) {
    _autoLockedByPip = false;
    const navLocks = window.__synthNavLocks;
    if (navLocks) {
      if (navLocks.panLocked) {
        navLocks.panLocked = false;
        document.dispatchEvent(new CustomEvent('synth:panLockChange', {
          detail: { enabled: false, source: 'pipAutoLock' }
        }));
      }
      if (navLocks.zoomLocked) {
        navLocks.zoomLocked = false;
        document.dispatchEvent(new CustomEvent('synth:zoomLockChange', {
          detail: { enabled: false, source: 'pipAutoLock' }
        }));
      }
    }
  }
}

/**
 * Cierra todos los PIPs activos.
 */
export function closeAllPips() {
  for (const panelId of activePips.keys()) {
    closePip(panelId);
  }
}

/**
 * Abre todos los paneles como PiP.
 */
export function openAllPips() {
  for (const panel of ALL_PANELS) {
    if (!activePips.has(panel.id)) {
      openPip(panel.id);
    }
  }
}

/**
 * Configura los eventos de un contenedor PiP.
 * @param {HTMLElement} pipContainer - Contenedor PiP
 * @param {string} panelId - ID del panel
 */
function setupPipEvents(pipContainer, panelId) {
  const header = pipContainer.querySelector('.pip-header');
  const closeBtn = pipContainer.querySelector('.pip-close');
  const maximizeBtn = pipContainer.querySelector('.pip-maximize');
  const minimizeBtn = pipContainer.querySelector('.pip-minimize');
  const fitBtn = pipContainer.querySelector('.pip-fit');
  const lockBtn = pipContainer.querySelector('.pip-lock');
  const resizeHandle = pipContainer.querySelector('.pip-resize-handle');
  
  // Configurar tooltips long-press para táctil en todos los botones del PiP
  setupPipLongPressTooltips(pipContainer);
  
  // Cerrar
  closeBtn.addEventListener('click', () => closePip(panelId));
  
  // Maximizar ventana (crece proporcionalmente hasta borde de pantalla)
  maximizeBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (!state || state.locked) return;
    maximizePip(panelId);
  });
  
  // Minimizar ventana (vuelve al tamaño por defecto manteniendo proporción)
  minimizeBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (!state || state.locked) return;
    restorePipSize(panelId);
  });
  
  // Ajustar a cuadrado mostrando panel completo
  fitBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (!state || state.locked) return;
    fitPanelToSquare(panelId);
  });
  
  // Bloquear/desbloquear
  lockBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (!state) return;
    state.locked = !state.locked;
    pipContainer.classList.toggle('pip-container--locked', state.locked);
    const lockLabel = state.locked ? t('pip.unlock', 'Desbloquear') : t('pip.lock', 'Bloquear');
    lockBtn.setAttribute('aria-label', lockLabel);
    lockBtn.setAttribute('data-tooltip', lockLabel);
    savePipState();
  });
  
  // Fallback: si la cabecera reaparece en otro modo, sigue permitiendo arrastre.
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    startPipWindowDrag(panelId, e, header);
  });
  
  // Resize — todos los handles mantienen proporción del panel
  const startResize = (e, edge) => {
    const state = activePips.get(panelId);
    if (state?.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setPipPreviewMode(panelId, true);
    resizingPip = panelId;
    resizeEdge = edge;
    resizePointerId = e.pointerId;
    e.target.setPointerCapture(e.pointerId);
    const viewport = pipContainer.querySelector('.pip-viewport');
    const viewportW = viewport ? viewport.clientWidth : (state.width - PIP_BORDER_SIZE);
    const viewportH = viewport ? viewport.clientHeight : (state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE);
    const scrollX = viewport ? viewport.scrollLeft : 0;
    const scrollY = viewport ? viewport.scrollTop : 0;
    // Sin padding: el panel empieza en (0,0)
    const viewCenterOnPanelX = (scrollX + viewportW / 2) / state.scale;
    const viewCenterOnPanelY = (scrollY + viewportH / 2) / state.scale;
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: state.width,
      h: state.height,
      pipX: state.x,
      pipY: state.y,
      scale: state.scale,
      aspectRatio: state.width / state.height,
      viewCenterX: viewCenterOnPanelX,
      viewCenterY: viewCenterOnPanelY,
      scrollX,
      scrollY
    };
    pipContainer.classList.add('pip-container--resizing');
    bringToFront(panelId);
  };
  
  // Corner handle (proporcional)
  resizeHandle.addEventListener('pointerdown', (e) => startResize(e, 'corner'));
  
  // Edge handles (también proporcionales)
  pipContainer.querySelectorAll('.pip-resize-edge').forEach(edgeEl => {
    edgeEl.addEventListener('pointerdown', (e) => startResize(e, edgeEl.dataset.edge));
  });
  
  // ==========================================================================
  // BLOQUEO DE PROPAGACIÓN AL VIEWPORT GENERAL
  // - Pointer events: fase de BURBUJEO (para que drag/resize funcionen via document)
  // - Touch/dblclick: fase de CAPTURA (para interceptar antes que el viewport)
  // ==========================================================================
  
  // Pointer events en fase de burbujeo
  pipContainer.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    bringToFront(panelId);
  });
  
  // Durante drag/resize, permitir que los eventos lleguen al document
  pipContainer.addEventListener('pointermove', (e) => {
    if (!draggingPip && !resizingPip) e.stopPropagation();
  });
  
  pipContainer.addEventListener('pointerup', (e) => {
    if (!draggingPip && !resizingPip) e.stopPropagation();
  });
  
  pipContainer.addEventListener('pointercancel', (e) => {
    if (!draggingPip && !resizingPip) e.stopPropagation();
  });
  
  pipContainer.addEventListener('click', (e) => e.stopPropagation());
  
  // Mouse events legacy: bloquear propagación al canvas principal
  pipContainer.addEventListener('mousedown', (e) => e.stopPropagation());
  pipContainer.addEventListener('mouseup', (e) => e.stopPropagation());
  pipContainer.addEventListener('mousemove', (e) => e.stopPropagation());
  
  // Menú contextual personalizado en el contenido PiP (devolver panel + reset)
  pipContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      panelId,
      isPipped: true,
      target: e.target,
      onAttach: closePip,
      pipActions: {
        isLocked: () => Boolean(activePips.get(panelId)?.locked),
        toggleLock: () => {
          const state = activePips.get(panelId);
          if (!state) return;
          state.locked = !state.locked;
          pipContainer.classList.toggle('pip-container--locked', state.locked);
          const lockLabel = state.locked ? t('pip.unlock', 'Desbloquear') : t('pip.lock', 'Bloquear');
          lockBtn.setAttribute('aria-label', lockLabel);
          lockBtn.setAttribute('data-tooltip', lockLabel);
          savePipState();
        },
        maximize: () => maximizePip(panelId),
        restore: () => restorePipSize(panelId),
        fit: () => fitPanelToSquare(panelId)
      }
    });
  });
  
  // dblclick y touch en fase de CAPTURA para interceptar antes que el viewport
  pipContainer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true });
  
  // Touch events: fase de BURBUJA para que primero los maneje el content (pinch zoom)
  // y luego pipContainer solo hace stopPropagation() para evitar que llegue al canvas global.
  // El preventDefault() para evitar zoom de página se hace en el content, no aquí.
  pipContainer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  pipContainer.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
  
  pipContainer.addEventListener('touchcancel', (e) => e.stopPropagation(), { capture: true, passive: true });
  
  // touchend: bloquear propagación + detectar doble tap
  // IMPORTANTE: fase de BURBUJA (no captura) para que primero se ejecute
  // el touchend del content (que resetea gestureInProgress/__synthPipGestureActive)
  let lastTapTime = 0;
  pipContainer.addEventListener('touchend', (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapTime < 300) {
      e.preventDefault();
    }
    lastTapTime = now;
  }, { passive: false });
  
  // wheel: bloquear propagación al viewport
  pipContainer.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  
  // Wheel para pan/zoom en el PiP
  // Un solo handler: preventDefault solo en Ctrl+wheel (zoom), pan es pasivo de hecho
  // NOTA: passive:false es necesario porque Ctrl+wheel necesita preventDefault().
  // Chrome reporta Violation pero es intencional y necesario para evitar el zoom del navegador.
  const pipViewport = pipContainer.querySelector('.pip-viewport');
  pipContainer.querySelector('.pip-content').addEventListener('wheel', (e) => {
    const state = activePips.get(panelId);
    if (!state) return;
    bringToFront(panelId);
    
    // Bloquear zoom y pan cuando está bloqueado
    if (state.locked) {
      if (e.ctrlKey) e.preventDefault();
      return;
    }
    
    if (e.ctrlKey) {
      if (perfMonitor.isEnabled()) {
        perfMonitor.incrementCounter(`pip.wheel.zoom.${panelId}`);
      }
      // Zoom centrado en el cursor — necesita preventDefault
      e.preventDefault();

      state.pendingWheelZoomSteps += e.deltaY > 0 ? -1 : 1;
      state.pendingWheelClientX = e.clientX;
      state.pendingWheelClientY = e.clientY;
      schedulePipWheelInteraction(panelId);
    } else {
      if (perfMonitor.isEnabled()) {
        perfMonitor.incrementCounter(`pip.wheel.pan.${panelId}`);
      }
      const lineHeight = 16;
      const deltaUnit = e.deltaMode === 1
        ? lineHeight
        : (e.deltaMode === 2 ? (pipViewport?.clientHeight || state.viewportHeight || 1) : 1);
      e.preventDefault();
      state.pendingWheelMoveX += (e.deltaX || 0) * deltaUnit;
      state.pendingWheelMoveY += (e.deltaY || 0) * deltaUnit;
      schedulePipWheelInteraction(panelId);
    }
  }, { passive: false });
  
  // Helper: detectar si un elemento es un control interactivo (knobs, pines, etc.)
  const isInteractivePipTarget = (el) => {
    if (!el) return false;
    const selector = [
      '.knob',
      '.knob-inner',
      '.knob-wrapper',
      '.pin-btn',
      '.joystick-pad',
      '.panel7-joystick-pad',
      '.joystick-handle',
      '.output-fader',
      '.output-channel__slider-wrap',
      '.output-channel__switch-wrap',
      '.synth-toggle',
      '.rotary-switch',
      '.toggle-svg-container',
      '.panel-note',
      '.note-editor-toolbar',
      'button',
      'input',
      'select',
      'textarea',
      '[contenteditable="true"]'
    ].join(', ');
    if (el.closest('[data-prevent-pan="true"]')) return true;
    return !!el.closest(selector);
  };
  
  // Gestos táctiles dentro del PiP:
  // - 1 dedo: mover la ventana completa
  // - 2 dedos: pinch-zoom centrado en el punto de pellizco
  // Usa enfoque frame-by-frame con protección anti-jitter (como el canvas principal)
  const content = pipContainer.querySelector('.pip-content');
  const viewport = pipContainer.querySelector('.pip-viewport');
  let lastPinchDist = 0;
  // Estado para drag táctil de 1 dedo
  let touchPanId = null;        // touch identifier activo
  let touchPanStartX = 0;
  let touchPanStartY = 0;
  let touchPanWindowX = 0;
  let touchPanWindowY = 0;
  
  content.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // ── Pinch con 2 dedos: cancelar pan de 1 dedo si estaba activo ──
      touchPanId = null;
      const state = activePips.get(panelId);
      if (state?.locked) return;
      e.preventDefault();
      setPipPreviewMode(panelId, true);
      gestureInProgress = true;
      window.__synthPipGestureActive = true;
      // Ocultar tooltips de controles interactivos (ej. joystick pad)
      // para que cancelen drag y no muevan el handle durante el pinch
      document.dispatchEvent(new Event('synth:dismissTooltips'));
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
    } else if (e.touches.length === 1 && touchPanId === null) {
      // ── Drag de ventana con 1 dedo ──
      const state = activePips.get(panelId);
      if (state?.locked) return;
      // No iniciar pan si el target es un control interactivo
      if (isInteractivePipTarget(e.touches[0].target)) return;
      touchPanId = e.touches[0].identifier;
      touchPanStartX = e.touches[0].clientX;
      touchPanStartY = e.touches[0].clientY;
      touchPanWindowX = state.x;
      touchPanWindowY = state.y;
    }
  }, { passive: false });
  
  content.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && lastPinchDist > 0) {
      // ── Pinch-zoom con 2 dedos ──
      const state = activePips.get(panelId);
      if (state?.locked) return;
      e.preventDefault();
      e.stopPropagation();
      setPipPreviewMode(panelId, true);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      
      // Protección: estabilizar ratio cuando los dedos están muy juntos
      // (evita zoom aleatorio por micro-movimientos al hacer pan con dos dedos)
      const effectiveLastDist = Math.max(lastPinchDist, PIP_MIN_PINCH_DIST);
      const effectiveDist = Math.max(currentDist, PIP_MIN_PINCH_DIST);
      const zoomFactor = effectiveDist / effectiveLastDist;
      
      // Limitar cambio máximo de zoom por frame
      const clampedFactor = Math.max(1 - PIP_MAX_ZOOM_DELTA, Math.min(1 + PIP_MAX_ZOOM_DELTA, zoomFactor));
      
      lastPinchDist = currentDist;
      
      if (!state) return;
      
      // Solo aplicar zoom si el cambio es significativo
      if (Math.abs(clampedFactor - 1) > PIP_PINCH_EPSILON) {
        const newScale = Math.max(getMinScale(panelId), Math.min(MAX_SCALE, state.scale * clampedFactor));
        const pinchClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const pinchClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        applyPipWheelZoom(panelId, newScale, pinchClientX, pinchClientY);
        schedulePipStateSave();
      }
    } else if (e.touches.length === 1 && touchPanId !== null) {
      // ── Drag de ventana con 1 dedo ──
      // Buscar el touch activo por su identifier
      const touch = Array.from(e.touches).find(t => t.identifier === touchPanId);
      if (!touch) return;
      const state = activePips.get(panelId);
      if (!state || state.locked) return;
      e.preventDefault();
      setPipPreviewMode(panelId, true);
      const dx = touch.clientX - touchPanStartX;
      const dy = touch.clientY - touchPanStartY;
      state.x = touchPanWindowX + dx;
      state.y = touchPanWindowY + dy;
      state.pipContainer.style.left = `${state.x}px`;
      state.pipContainer.style.top = `${state.y}px`;
      schedulePipStateSave();
    }
  }, { passive: false });
  
  content.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      lastPinchDist = 0;
      setPipPreviewMode(panelId, false);
      // Desactivar flag con delay para que el momentum scroll termine
      setTimeout(() => {
        gestureInProgress = false;
        window.__synthPipGestureActive = false;
      }, 500);
    }
    // Resetear pan de 1 dedo si el touch que se levantó es el que estaba paneando
    if (touchPanId !== null) {
      const still = Array.from(e.touches).find(t => t.identifier === touchPanId);
      if (!still) touchPanId = null;
    }
  }, { passive: true });
  
  // Neutralizar cualquier scroll interno residual
  if (viewport) {
    viewport.addEventListener('scroll', () => {
      const state = activePips.get(panelId);
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      if (!state) return;
      state.lastScrollLeft = 0;
      state.lastScrollTop = 0;
    }, { passive: true });
  }
  
  // Guardar estado cuando el usuario arrastra la ventana en táctil
  if (viewport) {
    let scrollSaveTimeout = null;
    viewport.addEventListener('scroll', () => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
      if (_isRestoring || gestureInProgress) return;
      if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
      scrollSaveTimeout = setTimeout(() => {
        if (!gestureInProgress && !_isRestoring) {
          savePipState();
        }
      }, 500);
    }, { passive: true });
  }
  
  // ── Ratón/pen dentro del contenido ──
  // Click izquierdo en fondo no interactivo o click central → mover la ventana flotante.
  // El drag táctil se gestiona con touch events (arriba) para evitar conflictos con pines y controles.
  
  content.addEventListener('pointerdown', (e) => {
    // Solo ratón/pen — el touch ya se gestiona con touchstart/touchmove
    if (e.pointerType === 'touch') return;
    const state = activePips.get(panelId);
    if (!state || state.locked) return;

    const targetIsInteractive = isInteractivePipTarget(e.target);
    const isMiddle = e.button === 1;
    const isLeft = e.button === 0;
    if (!isMiddle && !isLeft) return;

    const wantsWindowDrag = isMiddle || (isLeft && !targetIsInteractive);

    if (!wantsWindowDrag) return;
    if (wantsWindowDrag) {
      startPipWindowDrag(panelId, e, content);
      return;
    }
  });
}

/**
 * Maneja el movimiento del puntero para drag/resize.
 * @param {PointerEvent} e
 */
function handlePointerMove(e) {
  if (draggingPip) {
    const state = activePips.get(draggingPip);
    if (!state) return;
    setPipPreviewMode(draggingPip, true);

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    state.pendingDragX = newX;
    state.pendingDragY = newY;
    state.pipContainer.style.transform = `translate3d(${newX - dragStartPosition.x}px, ${newY - dragStartPosition.y}px, 0)`;
  }
  
  if (resizingPip) {
    const state = activePips.get(resizingPip);
    if (!state) return;
    setPipPreviewMode(resizingPip, true);
    
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    
    let newW = resizeStart.w;
    let newH = resizeStart.h;
    let newX = resizeStart.pipX;
    let newY = resizeStart.pipY;
    const ar = resizeStart.aspectRatio;
    
    if (resizeEdge === 'corner') {
      // Esquina: resize proporcional (aspect ratio bloqueado)
      // Usar el eje con mayor desplazamiento para guiar la proporción
      const candidateW = resizeStart.w + dx;
      const candidateH = resizeStart.h + dy;
      // Elegir la dimensión dominante
      if (Math.abs(dx) * (resizeStart.h / resizeStart.w) >= Math.abs(dy)) {
        newW = candidateW;
        newH = newW / ar;
      } else {
        newH = candidateH;
        newW = newH * ar;
      }
    } else if (resizeEdge === 'right') {
      newW = resizeStart.w + dx;
      newH = newW / ar;
    } else if (resizeEdge === 'bottom') {
      newH = resizeStart.h + dy;
      newW = newH * ar;
    } else if (resizeEdge === 'left') {
      newW = resizeStart.w - dx;
      newH = newW / ar;
      newX = resizeStart.pipX + resizeStart.w - newW;
    } else if (resizeEdge === 'top') {
      newH = resizeStart.h - dy;
      newW = newH * ar;
      newY = resizeStart.pipY + resizeStart.h - newH;
    }
    
    if (newW < MIN_PIP_SIZE) {
      newW = MIN_PIP_SIZE;
      newH = newW / ar;
      if (resizeEdge === 'left') {
        newX = resizeStart.pipX + resizeStart.w - newW;
      }
    }
    if (newH < MIN_PIP_SIZE) {
      newH = MIN_PIP_SIZE;
      newW = newH * ar;
      if (resizeEdge === 'top') {
        newY = resizeStart.pipY + resizeStart.h - newH;
      }
    }
    
    state.width = newW;
    state.height = newH;
    state.x = newX;
    state.y = newY;
    state.pipContainer.style.width = `${newW}px`;
    state.pipContainer.style.height = `${newH}px`;
    state.pipContainer.style.left = `${newX}px`;
    state.pipContainer.style.top = `${newY}px`;
    
    const viewport = state.pipContainer.querySelector('.pip-viewport');
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
    
    const scaleFactor = newW / resizeStart.w;
    const baseScale = resizeStart.scale || state.scale;
    const minScale = getMinScale(resizingPip);
    const newScale = Math.max(minScale, Math.min(MAX_SCALE, baseScale * scaleFactor));

    updatePipScale(resizingPip, newScale, false);

    // El panel detached se reescala completo; sin paneo interno.
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }
}

/**
 * Finaliza drag/resize.
 * @param {PointerEvent} e
 */
function handlePointerUp(e) {
  let stateChanged = false;
  
  if (draggingPip) {
    const state = activePips.get(draggingPip);
    if (state) {
      state.pipContainer.classList.remove('pip-container--dragging');
      const finalX = state.pendingDragX ?? state.x;
      const finalY = state.pendingDragY ?? state.y;
      state.x = finalX;
      state.y = finalY;
      state.pipContainer.style.left = `${finalX}px`;
      state.pipContainer.style.top = `${finalY}px`;
      state.pipContainer.style.transform = '';
      state.pendingDragX = null;
      state.pendingDragY = null;
      setPipPreviewMode(state.panelId, false);
      // Liberar pointer capture
      if (dragPointerId !== null && dragCaptureEl) {
        try { dragCaptureEl.releasePointerCapture(dragPointerId); } catch (_) { /* ignore */ }
      }
      stateChanged = true;
    }
    draggingPip = null;
    dragPointerId = null;
    dragCaptureEl = null;
  }
  
  if (resizingPip) {
    const state = activePips.get(resizingPip);
    if (state) {
      state.pipContainer.classList.remove('pip-container--resizing');
      setPipPreviewMode(resizingPip, false);
      // Liberar pointer capture del handle activo (esquina o borde)
      if (resizePointerId !== null) {
        try {
          const activeEl = state.pipContainer.querySelector(`[data-edge="${resizeEdge}"]`);
          if (activeEl) activeEl.releasePointerCapture(resizePointerId);
        } catch (_) { /* ignore */ }
      }
      stateChanged = true;
    }
    resizingPip = null;
    resizePointerId = null;
    resizeEdge = 'corner';
  }
  
  // Guardar estado después de drag/resize
  if (stateChanged) {
    savePipState();
  }
}

/**
 * Maximiza la ventana PiP proporcionalmente hasta que un eje alcance el borde de la pantalla.
 * Mantiene la proporción de lados actual del usuario.
 * @param {string} panelId - ID del panel
 */
function maximizePip(panelId) {
  const state = activePips.get(panelId);
  if (!state || state.locked) return;
  
  const margin = 20; // Margen en píxeles desde los bordes
  const maxW = window.innerWidth - margin * 2;
  const maxH = window.innerHeight - margin * 2;
  
  // Proporción del VIEWPORT (sin header ni bordes) para preservar la forma real
  const vpW = state.width - PIP_BORDER_SIZE;
  const vpH = state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const vpRatio = vpW / vpH; // 1.0 si es cuadrado
  
  // Espacio disponible para el viewport dentro del contenedor máximo
  const maxVpW = maxW - PIP_BORDER_SIZE;
  const maxVpH = maxH - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  
  // Calcular viewport máximo manteniendo proporción
  let newVpW, newVpH;
  if (vpRatio >= maxVpW / maxVpH) {
    newVpW = maxVpW;
    newVpH = Math.round(newVpW / vpRatio);
  } else {
    newVpH = maxVpH;
    newVpW = Math.round(newVpH * vpRatio);
  }
  
  // Reconstruir dimensiones del contenedor desde el viewport
  let newW = newVpW + PIP_BORDER_SIZE;
  let newH = newVpH + PIP_HEADER_HEIGHT + PIP_BORDER_SIZE;
  
  // Mantener posición actual pero ajustar si se sale de pantalla
  let newX = state.x;
  let newY = state.y;
  if (newX + newW > window.innerWidth) newX = Math.max(0, window.innerWidth - newW);
  if (newY + newH > window.innerHeight) newY = Math.max(0, window.innerHeight - newH);
  if (newX < 0) newX = 0;
  if (newY < 0) newY = 0;
  
  // Calcular nueva escala proporcional al cambio de tamaño
  // Para que se vea la misma porción de panel, la escala escala con el tamaño
  const oldW = state.width;
  const sizeFactor = newW / oldW;
  const oldScale = state.scale;
  // Calcular minScale con las NUEVAS dimensiones del viewport (no las actuales)
  const panelEl = document.getElementById(panelId);
  const panelWidth = panelEl?.offsetWidth || 760;
  const panelHeight = panelEl?.offsetHeight || 760;
  const newViewportW = newW - PIP_BORDER_SIZE;
  const newViewportH = newH - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  // Cover: el marco nunca puede superar al panel visible sin que este crezca.
  const coverScale = getPipCoverScale(newViewportW, newViewportH, panelWidth, panelHeight);
  const newScale = Math.max(coverScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
  // Aplicar nuevo tamaño y posición
  state.width = newW;
  state.height = newH;
  state.x = newX;
  state.y = newY;
  state.isMaximized = true;
  state.pipContainer.style.width = `${newW}px`;
  state.pipContainer.style.height = `${newH}px`;
  state.pipContainer.style.left = `${newX}px`;
  state.pipContainer.style.top = `${newY}px`;
  
  // Actualizar escala — usar cover para evitar espacios en blanco
  updatePipScale(panelId, newScale, false);
  
  // Sin paneo interno: mantener scroll a cero
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  
  savePipState();
  log.debug(`PiP ${panelId} maximizado a ${newW}x${newH} (escala ${oldScale.toFixed(2)} → ${newScale.toFixed(2)})`);
}

/**
 * Restaura la ventana PiP a su tamaño por defecto, manteniendo la proporción actual.
 * @param {string} panelId - ID del panel
 */
function restorePipSize(panelId) {
  const state = activePips.get(panelId);
  if (!state || state.locked) return;
  
  // Proporción del VIEWPORT (sin header ni bordes) para preservar la forma real
  const vpW = state.width - PIP_BORDER_SIZE;
  const vpH = state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const vpRatio = vpW / vpH; // 1.0 si es cuadrado
  
  // Dimensiones por defecto del viewport
  const defVpW = state.defaultWidth - PIP_BORDER_SIZE;
  const defVpH = state.defaultHeight - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const defVpRatio = defVpW / defVpH;
  
  // Ajustar viewport por defecto a la proporción actual
  let newVpW, newVpH;
  if (vpRatio >= defVpRatio) {
    newVpW = defVpW;
    newVpH = Math.round(newVpW / vpRatio);
    if (newVpH < MIN_PIP_SIZE - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE) {
      newVpH = MIN_PIP_SIZE - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
      newVpW = Math.round(newVpH * vpRatio);
    }
  } else {
    newVpH = defVpH;
    newVpW = Math.round(newVpH * vpRatio);
    if (newVpW < MIN_PIP_SIZE - PIP_BORDER_SIZE) {
      newVpW = MIN_PIP_SIZE - PIP_BORDER_SIZE;
      newVpH = Math.round(newVpW / vpRatio);
    }
  }
  
  // Reconstruir dimensiones del contenedor desde el viewport
  let newW = newVpW + PIP_BORDER_SIZE;
  let newH = newVpH + PIP_HEADER_HEIGHT + PIP_BORDER_SIZE;
  
  // Calcular nueva escala proporcional al cambio de tamaño
  const oldW = state.width;
  const sizeFactor = newW / oldW;
  const oldScale = state.scale;
  // Calcular minScale con las NUEVAS dimensiones del viewport (no las actuales)
  const panelEl = document.getElementById(panelId);
  const panelWidth = panelEl?.offsetWidth || 760;
  const panelHeight = panelEl?.offsetHeight || 760;
  const newViewportW = newW - PIP_BORDER_SIZE;
  const newViewportH = newH - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const coverScale = getPipCoverScale(newViewportW, newViewportH, panelWidth, panelHeight);
  const newScale = Math.max(coverScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
  // Mantener posición pero ajustar si se sale de pantalla
  let newX = state.x;
  let newY = state.y;
  if (newX + newW > window.innerWidth) newX = Math.max(0, window.innerWidth - newW);
  if (newY + newH > window.innerHeight) newY = Math.max(0, window.innerHeight - newH);
  
  // Aplicar nuevo tamaño
  state.width = newW;
  state.height = newH;
  state.x = newX;
  state.y = newY;
  state.isMaximized = false;
  state.pipContainer.style.width = `${newW}px`;
  state.pipContainer.style.height = `${newH}px`;
  state.pipContainer.style.left = `${newX}px`;
  state.pipContainer.style.top = `${newY}px`;
  
  // Actualizar escala — usar contain para que se vea completo
  updatePipScale(panelId, newScale, false);
  
  // Sin paneo interno: mantener scroll a cero
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  
  savePipState();
  log.debug(`PiP ${panelId} restaurado a ${newW}x${newH} (escala ${oldScale.toFixed(2)} → ${newScale.toFixed(2)})`);
}

/**
 * Ajusta la ventana PiP a un cuadrado que muestre el panel completo,
 * usando el eje más pequeño actual como referencia para caber en pantalla.
 * @param {string} panelId - ID del panel
 */
function fitPanelToSquare(panelId) {
  const state = activePips.get(panelId);
  if (!state || state.locked) return;
  
  const panelEl = document.getElementById(panelId);
  const panelWidth = panelEl?.offsetWidth || 760;
  const panelHeight = panelEl?.offsetHeight || 760;
  
  // Usar el eje más pequeño actual como referencia
  const viewportW = state.width - PIP_BORDER_SIZE;
  const viewportH = state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const smallestAxis = Math.min(viewportW, viewportH);
  
  // El cuadrado usa el eje menor actual como referencia y el panel cubre completamente.
  const coverScale = getPipCoverScale(smallestAxis, smallestAxis, panelWidth, panelHeight);
  
  // Tamaño de la ventana PiP: cuadrado basado en el panel escalado
  const scaledSize = Math.max(panelWidth, panelHeight) * coverScale;
  const newW = Math.max(MIN_PIP_SIZE, Math.round(scaledSize) + PIP_BORDER_SIZE);
  const newH = Math.max(MIN_PIP_SIZE, Math.round(scaledSize) + PIP_HEADER_HEIGHT + PIP_BORDER_SIZE);
  
  // Centrar en la posición actual
  let newX = state.x + (state.width - newW) / 2;
  let newY = state.y + (state.height - newH) / 2;
  
  // Asegurar que no se sale de pantalla
  newX = Math.max(0, Math.min(newX, window.innerWidth - newW));
  newY = Math.max(0, Math.min(newY, window.innerHeight - newH));
  
  // Aplicar nuevo tamaño
  const oldScale = state.scale;
  state.width = newW;
  state.height = newH;
  state.x = newX;
  state.y = newY;
  state.pipContainer.style.width = `${newW}px`;
  state.pipContainer.style.height = `${newH}px`;
  state.pipContainer.style.left = `${newX}px`;
  state.pipContainer.style.top = `${newY}px`;
  
  // Escala: el panel debe cubrir el viewport completo
  const finalViewportW = newW - PIP_BORDER_SIZE;
  const finalViewportH = newH - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const fitScale = getPipCoverScale(finalViewportW, finalViewportH, panelWidth, panelHeight);
  
  updatePipScale(panelId, fitScale, false);
  
  // Centrar scroll (el panel es más pequeño que el viewport, scroll = 0)
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  
  savePipState();
  log.debug(`PiP ${panelId} ajustado a cuadrado ${newW}x${newH} (escala ${oldScale.toFixed(2)} → ${fitScale.toFixed(2)})`);
}

/**
 * Trae un PiP al frente (mayor z-index).
 * @param {string} panelId - ID del panel
 */
function bringToFront(panelId) {
  const maxZ = Math.max(PIP_Z_INDEX_BASE, ...Array.from(activePips.values()).map(s => parseInt(s.pipContainer.style.zIndex) || PIP_Z_INDEX_BASE));
  const state = activePips.get(panelId);
  if (state) {
    state.pipContainer.style.zIndex = maxZ + 1;
  }
  // Registrar como PiP con foco (para zoom global con Ctrl+/-)
  focusedPipId = panelId;
  window.__synthFocusedPip = panelId;
}

/**
 * Actualiza la escala del panel dentro del PiP.
 * @param {string} panelId - ID del panel
 * @param {number} newScale - Nueva escala
 * @param {boolean} [persist=true] - Si se debe guardar el estado
 */
function updatePipScale(panelId, newScale, persist = true) {
  const t0 = perfMonitor.isEnabled() ? performance.now() : 0;
  const state = activePips.get(panelId);
  if (!state) return;

  const previousScale = state.scale || 1;
  state.scale = newScale;
  const panelEl = state.panelEl || document.getElementById(panelId);
  if (!panelEl) return;

  state.panelEl = panelEl;

  if (Math.abs(newScale - previousScale) > 0.0001) {
    state.sharpMode = false;
    state.activeZoom = 1;
    panelEl.style.zoom = '';
  }

  // Obtener tamaño real del panel (760x760 normalmente)
  const { panelWidth, panelHeight } = ensurePanelMetrics(state);

  let effectiveZoom = 1;
  if (pipSharpRasterizeEnabled && state.sharpMode && !state.previewMode) {
    effectiveZoom = Math.min(state.sharpZoomFactor || 1, Math.max(1, newScale));
  }
  const visualScale = newScale / effectiveZoom;
  
  // Tamaño escalado del panel
  const scaledWidth = panelWidth * newScale;
  const scaledHeight = panelHeight * newScale;
  
  // Aplicar escala al panel
  panelEl.style.zoom = effectiveZoom > 1 ? String(effectiveZoom) : '';
  panelEl.style.transform = `scale(${visualScale})`;
  panelEl.style.transformOrigin = '0 0';
  
  // Obtener tamaño del viewport (contenido visible)
  refreshPipViewportMetrics(state);
  
  // Sin padding: el panel se alinea al borde del viewport (cover behavior).
  // El eje más próximo queda a ras, el otro puede desbordar con scroll.
  const viewportInner = state.viewportInnerEl || state.pipContainer.querySelector('.pip-viewport-inner');
  if (viewportInner) {
    state.viewportInnerEl = viewportInner;
    viewportInner.style.width = `${scaledWidth}px`;
    viewportInner.style.height = `${scaledHeight}px`;
    viewportInner.style.padding = '0';
    viewportInner.style.boxSizing = 'border-box';
  }
  
  // Guardar estado después de cambiar zoom
  if (persist) {
    schedulePipStateSave();
  }

  if (perfMonitor.isEnabled()) {
    perfMonitor.incrementCounter('pip.updateScale');
    perfMonitor.recordDuration('pip.updateScale', performance.now() - t0, {
      panelId,
      newScale,
      effectiveZoom,
      scaledWidth,
      scaledHeight,
      persist
    });
  }
}

/**
 * Obtiene un título legible para el panel.
 * @param {string} panelId - ID del panel
 * @returns {string} Título
 */
function getPanelTitle(panelId) {
  const titles = {
    'panel-1': 'Panel 1',
    'panel-2': 'Panel 2',
    'panel-3': 'Panel 3',
    'panel-4': 'Panel 4',
    'panel-5': 'Panel 5',
    'panel-6': 'Panel 6',
    'panel-7': 'Panel 7',
    'panel-output': 'Panel 7'
  };
  return titles[panelId] || panelId;
}

/**
 * Verifica si un panel está en modo PiP.
 * @param {string} panelId - ID del panel
 * @returns {boolean}
 */
export function isPipped(panelId) {
  return activePips.has(panelId);
}

/**
 * Obtiene los IDs de todos los paneles en modo PiP.
 * @returns {string[]}
 */
export function getActivePips() {
  return Array.from(activePips.keys());
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCIA DE ESTADO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serializa el estado actual de todos los PiPs para guardarlo.
 * @returns {Array} Array de objetos con el estado de cada PiP
 */
export function serializePipState() {
  const states = [];
  for (const [panelId, state] of activePips) {
    states.push({
      panelId,
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      scale: state.scale,
      scrollX: 0,
      scrollY: 0,
      zIndex: parseInt(state.pipContainer.style.zIndex) || PIP_Z_INDEX_BASE,
      locked: state.locked || false,
      isMaximized: state.isMaximized || false,
      defaultWidth: state.defaultWidth,
      defaultHeight: state.defaultHeight
    });
  }
  return states;
}

/**
 * Guarda el estado de los PiPs en localStorage.
 */
export function savePipState() {
  if (_pipStateSaveTimer) {
    clearTimeout(_pipStateSaveTimer);
    _pipStateSaveTimer = null;
  }
  // No guardar durante restauración (openPip llama a savePipState con datos iniciales)
  if (_isRestoring) return;
  
  // Verificar si está habilitado recordar disposición visual
  const remember = localStorage.getItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT);
  if (remember !== 'true') return;
  
  const state = serializePipState();
  try {
    localStorage.setItem(STORAGE_KEYS.PIP_STATE, JSON.stringify(state));
    log.debug('Estado PiP guardado:', state.length, 'paneles');
  } catch (e) {
    log.warn('No se pudo guardar estado PiP:', e);
  }
}

/**
 * Restaura el estado de los PiPs desde localStorage.
 * Debe llamarse después de que los paneles estén en el DOM.
 */
export function restorePipState() {
  // Verificar si está habilitado recordar disposición visual
  const remember = localStorage.getItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT);
  if (remember !== 'true') return;
  
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PIP_STATE);
    if (!saved) return;
    
    const states = JSON.parse(saved);
    if (!Array.isArray(states) || states.length === 0) return;
    
    log.info('Restaurando', states.length, 'paneles PiP');
    
    // Bloquear saves intermedios durante la restauración
    _isRestoring = true;
    
    for (const savedState of states) {
      const panelEl = document.getElementById(savedState.panelId);
      if (!panelEl) {
        log.warn('Panel no encontrado para restaurar:', savedState.panelId);
        continue;
      }
      
      // Abrir PiP directamente con la configuración guardada
      // (openPip se encarga de aplicar dimensiones, escala, scroll y lock)
      openPip(savedState.panelId, savedState);
    }
    
    // Desbloquear saves después de que los rAF de restauración terminen
    // Doble rAF: el primero es el de openPip (scale+scroll+lock),
    // el segundo garantiza que ya terminó
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _isRestoring = false;
        savePipState();
        log.debug('PiP restore completado, estado guardado');
      });
    });
    
  } catch (e) {
    _isRestoring = false;
    log.warn('Error restaurando estado PiP:', e);
  }
}

/**
 * Limpia el estado guardado de PiPs.
 */
export function clearPipState() {
  localStorage.removeItem(STORAGE_KEYS.PIP_STATE);
}

/**
 * Verifica si está habilitado recordar la disposición visual entre sesiones.
 * @returns {boolean}
 */
export function isRememberPipsEnabled() {
  const saved = localStorage.getItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT);
  // Por defecto false (deshabilitado)
  return saved === 'true';
}

/**
 * Establece si se debe recordar la disposición visual entre sesiones.
 * @param {boolean} enabled
 */
export function setRememberPips(enabled) {
  localStorage.setItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT, String(enabled));
  if (!enabled) {
    clearPipState();
  }
}
