// Gestor de paneles Picture-in-Picture (PiP)
// Permite extraer paneles del viewport principal para verlos de forma flotante

import { createLogger } from '../utils/logger.js';
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

/** Z-index base para PiPs (por encima del viewport pero debajo de modales) */
const PIP_Z_INDEX_BASE = 1200;

/** Dimensiones mínimas del PiP */
const MIN_PIP_SIZE = 150;
// MAX_PIP_SIZE es dinámico: se calcula según el tamaño de la ventana

/** Tamaño de cabecera del PiP (24px botones + 12px padding + 1px border-bottom) */
const PIP_HEADER_HEIGHT = 37;

/** Espacio extra del contenedor PiP por bordes CSS (1px × 2 lados) */
const PIP_BORDER_SIZE = 2;

/** Límites de zoom */
const MIN_SCALE_ABSOLUTE = 0.1; // Mínimo absoluto de seguridad
const MAX_SCALE = 3.0;

/** Protección anti-zoom accidental en pinch (mismos valores que el canvas principal) */
const PIP_MIN_PINCH_DIST = 180;  // Distancia mínima para ratio estable
const PIP_MAX_ZOOM_DELTA = 0.12; // Cambio máximo de zoom por frame
const PIP_PINCH_EPSILON = 0.002; // Cambio mínimo para aplicar zoom

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

/**
 * Calcula el zoom mínimo para que el panel quepa completo en el viewport (contain).
 * El panel se ve entero; solo habrá margen en un eje (el que sobra), nunca en ambos.
 * @param {string} panelId - ID del panel
 * @returns {number} Escala mínima
 */
function getMinScale(panelId) {
  const state = activePips.get(panelId);
  if (!state) return MIN_SCALE_ABSOLUTE;
  
  const panelEl = document.getElementById(panelId);
  const panelWidth = panelEl?.offsetWidth || 760;
  const panelHeight = panelEl?.offsetHeight || 760;
  
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  const viewportWidth = viewport?.clientWidth || (state.width - PIP_BORDER_SIZE);
  const viewportHeight = viewport?.clientHeight || (state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE);
  
  // El zoom mínimo es el MENOR de los ratios (contain): el panel cabe completo
  // Solo habrá margen en un eje (donde sobra espacio), nunca en ambos
  const minScaleX = viewportWidth / panelWidth;
  const minScaleY = viewportHeight / panelHeight;
  const dynamicMin = Math.min(minScaleX, minScaleY);
  
  // Usar el mayor entre el dinámico y el mínimo absoluto
  return Math.max(MIN_SCALE_ABSOLUTE, dynamicMin);
}

/**
 * ID del PiP con foco (último interactuado). null = foco en canvas principal.
 * Se expone como window.__synthFocusedPip para que el bridge de zoom lo consulte.
 */
let focusedPipId = null;

/** Panel actualmente siendo arrastrado */
let draggingPip = null;
let dragOffset = { x: 0, y: 0 };
let dragPointerId = null;

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
    if (direction === 'in') {
      updatePipScale(focusedPipId, Math.min(state.scale * 1.25, MAX_SCALE));
    } else if (direction === 'out') {
      updatePipScale(focusedPipId, Math.max(state.scale * 0.8, minScale));
    } else if (direction === 'reset') {
      updatePipScale(focusedPipId, minScale);
    }
    return true;
  };

  // Exponer función de paneo con flechas para PiP enfocado
  window.__synthPanFocusedPip = (dirX, dirY) => {
    if (!focusedPipId || !activePips.has(focusedPipId)) return false;
    const state = activePips.get(focusedPipId);
    if (!state || state.locked) return true; // Absorber pero no actuar si bloqueado
    const viewport = state.pipContainer.querySelector('.pip-viewport');
    if (!viewport) return false;
    const stepX = viewport.clientWidth * 0.15;
    const stepY = viewport.clientHeight * 0.15;
    viewport.scrollLeft += dirX * stepX;
    viewport.scrollTop += dirY * stepY;
    return true;
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
  pipContainer.className = 'pip-container';
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
      <button type="button" class="pip-minimize" aria-label="${t('pip.minimize', 'Minimizar')}">−</button>
      <button type="button" class="pip-maximize" aria-label="${t('pip.maximize', 'Maximizar')}">+</button>
      <button type="button" class="pip-fit" aria-label="${t('pip.fitPanel', 'Ajustar panel')}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 3v18M3 9h18"/>
        </svg>
      </button>
      <button type="button" class="pip-lock" aria-label="${t('pip.lock', 'Bloquear')}">
        <svg class="pip-lock__icon-unlocked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0"/>
        </svg>
        <svg class="pip-lock__icon-locked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </button>
      <button type="button" class="pip-close" aria-label="${t('pip.close', 'Cerrar')}">&times;</button>
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
  
  // Handles de resize: bordes (un solo eje) + esquina (proporcional)
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
    x: initX,
    y: initY,
    width: initW,
    height: initH,
    scale: initScale,
    defaultWidth: restoredConfig?.defaultWidth || initW,
    defaultHeight: restoredConfig?.defaultHeight || initH,
    locked: false, // El lock se aplica después del scroll en restauración
    isMaximized: restoredConfig?.isMaximized || false,
    // Última posición de scroll conocida (usada por el lock listener para revertir)
    // Pre-inicializar con valores guardados para que el lock no revierta a 0
    lastScrollLeft: restoredConfig?.scrollX || 0,
    lastScrollTop: restoredConfig?.scrollY || 0
  };
  
  activePips.set(panelId, state);
  
  if (restoredConfig) {
    // ── RESTAURACIÓN: aplicar escala guardada directamente ──
    // Forzar reflow para que viewport tenga dimensiones correctas
    // eslint-disable-next-line no-unused-expressions
    pipContainer.offsetHeight;
    
    // Clampear escala al mínimo permitido por el tamaño real del viewport
    const minScale = getMinScale(panelId);
    state.scale = Math.max(minScale, Math.min(MAX_SCALE, initScale));
    updatePipScale(panelId, state.scale, false);
    
    log.debug(`PiP ${panelId} restaurado: scale=${state.scale.toFixed(3)} (saved=${initScale}, min=${minScale.toFixed(3)}), size=${initW}x${initH}`);
    
    // Restaurar scroll y lock en rAF (necesita layout con el nuevo scale/padding)
    const savedScrollX = restoredConfig.scrollX || 0;
    const savedScrollY = restoredConfig.scrollY || 0;
    const shouldLock = restoredConfig.locked || false;
    const appliedScale = state.scale;
    
    requestAnimationFrame(() => {
      // Re-aplicar escala con layout definitivo
      updatePipScale(panelId, appliedScale, false);
      
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
        }, 0);
      }
    });
  } else {
    // ── NUEVO PIP: calcular escala y centrar ──
    updatePipScale(panelId, state.scale);
    
    // Recalcular escala con dimensiones reales del viewport
    const fitScale = getMinScale(panelId);
    if (fitScale !== state.scale) {
      state.scale = fitScale;
      updatePipScale(panelId, fitScale);
    }
    
    // Centrar el scroll en el panel (sin padding, el contenido empieza en 0,0)
    const pipViewport = pipContainer.querySelector('.pip-viewport');
    if (pipViewport) {
      const vw = pipViewport.clientWidth;
      const vh = pipViewport.clientHeight;
      const panelW = (panelEl?.offsetWidth || 760) * state.scale;
      const panelH = (panelEl?.offsetHeight || 760) * state.scale;
      // Centrar en el eje que desborda; el eje que encaja justo tendrá scroll 0
      pipViewport.scrollLeft = Math.max(0, (panelW - vw) / 2);
      pipViewport.scrollTop = Math.max(0, (panelH - vh) / 2);
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
  // Cuando se pasa de 0 a 1 PiP (y no es restauración de sesión),
  // zoom out al mínimo y bloquear paneo+zoom del canvas principal.
  // El usuario puede desbloquear manualmente después.
  if (activePips.size === 1 && !_isRestoring) {
    // 1. Zoom out a vista general (animado)
    if (typeof window.__synthAnimateToPanel === 'function') {
      window.__synthAnimateToPanel(null, 600);
    }
    // 2. Bloquear paneo y zoom
    const navLocks = window.__synthNavLocks || (window.__synthNavLocks = { zoomLocked: false, panLocked: false });
    if (!navLocks.panLocked) {
      navLocks.panLocked = true;
      document.dispatchEvent(new CustomEvent('synth:panLockChange', {
        detail: { enabled: true }
      }));
    }
    if (!navLocks.zoomLocked) {
      navLocks.zoomLocked = true;
      document.dispatchEvent(new CustomEvent('synth:zoomLockChange', {
        detail: { enabled: true }
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
  
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return;
  
  // Resetear escala del panel
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
    lockBtn.setAttribute('aria-label', state.locked ? t('pip.unlock', 'Desbloquear') : t('pip.lock', 'Bloquear'));
    savePipState();
  });
  
  // Drag del header
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    draggingPip = panelId;
    dragPointerId = e.pointerId;
    header.setPointerCapture(e.pointerId);
    const rect = pipContainer.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    pipContainer.classList.add('pip-container--dragging');
    bringToFront(panelId);
  });
  
  // Resize — función compartida para esquina y bordes
  const startResize = (e, edge) => {
    const state = activePips.get(panelId);
    if (state?.locked) return;
    e.preventDefault();
    e.stopPropagation();
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
  
  // Edge handles (un solo eje)
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
      onAttach: closePip
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
    
    // Bloquear zoom y pan cuando está bloqueado
    if (state.locked) {
      if (e.ctrlKey) e.preventDefault();
      return;
    }
    
    if (e.ctrlKey) {
      // Zoom centrado en el cursor — necesita preventDefault
      e.preventDefault();
      
      const oldScale = state.scale;
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const minScale = getMinScale(panelId);
      const newScale = Math.max(minScale, Math.min(MAX_SCALE, oldScale + delta));
      
      if (newScale !== oldScale) {
        const rect = pipViewport.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        // Sin padding: el panel empieza en (0,0) del viewport-inner
        const panelPointX = (pipViewport.scrollLeft + cursorX) / oldScale;
        const panelPointY = (pipViewport.scrollTop + cursorY) / oldScale;
        
        updatePipScale(panelId, newScale);
        
        const newScrollX = panelPointX * newScale - cursorX;
        const newScrollY = panelPointY * newScale - cursorY;
        
        pipViewport.scrollLeft = Math.max(0, newScrollX);
        pipViewport.scrollTop = Math.max(0, newScrollY);
      }
    } else {
      // Pan manual: scroll limitado al desbordamiento real del contenido
      const viewportW = pipViewport.clientWidth;
      const viewportH = pipViewport.clientHeight;
      
      const panelEl = document.getElementById(panelId);
      const scaledW = (panelEl?.offsetWidth || 760) * state.scale;
      const scaledH = (panelEl?.offsetHeight || 760) * state.scale;
      
      // Sin padding: scroll de 0 al máximo desbordamiento
      const maxScrollX = Math.max(0, scaledW - viewportW);
      const maxScrollY = Math.max(0, scaledH - viewportH);
      
      const panFactor = state.scale * state.scale;
      const newScrollX = pipViewport.scrollLeft + (e.deltaX || 0) * panFactor;
      const newScrollY = pipViewport.scrollTop + (e.deltaY || 0) * panFactor;
      
      pipViewport.scrollLeft = Math.max(0, Math.min(maxScrollX, newScrollX));
      pipViewport.scrollTop = Math.max(0, Math.min(maxScrollY, newScrollY));
    }
  }, { passive: false });
  
  // Helper: detectar si un elemento es un control interactivo (knobs, pines, etc.)
  const isInteractivePipTarget = (el) => {
    if (!el) return false;
    const selector = '.knob, .knob-inner, .pin-btn, .joystick-pad, .panel7-joystick-pad, .joystick-handle, .output-fader, button, input, select, textarea';
    if (el.closest('[data-prevent-pan="true"]')) return true;
    return !!el.closest(selector);
  };
  
  // Gestos táctiles dentro del PiP:
  // - 1 dedo: pan (scroll del viewport)
  // - 2 dedos: pinch-zoom centrado en el punto de pellizco
  // Usa enfoque frame-by-frame con protección anti-jitter (como el canvas principal)
  const content = pipContainer.querySelector('.pip-content');
  const viewport = pipContainer.querySelector('.pip-viewport');
  let lastPinchDist = 0;
  let pinchCenterX = 0; // Relativo al panel (sin padding)
  let pinchCenterY = 0;
  // Estado para pan táctil de 1 dedo
  let touchPanId = null;        // touch identifier activo
  let touchPanStartX = 0;
  let touchPanStartY = 0;
  let touchPanScrollX = 0;
  let touchPanScrollY = 0;
  
  content.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // ── Pinch con 2 dedos: cancelar pan de 1 dedo si estaba activo ──
      touchPanId = null;
      const state = activePips.get(panelId);
      if (state?.locked) return;
      e.preventDefault();
      gestureInProgress = true;
      window.__synthPipGestureActive = true;
      // Ocultar tooltips de controles interactivos (ej. joystick pad)
      // para que cancelen drag y no muevan el handle durante el pinch
      document.dispatchEvent(new Event('synth:dismissTooltips'));
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
      const currentScale = state ? state.scale : 0.4;
      
      // Calcular centro del pinch relativo al contenido del PANEL (sin padding)
      const rect = viewport.getBoundingClientRect();
      
      // Centro del pinch en coordenadas del viewport (posición de scroll + offset en pantalla)
      const scrollPosX = viewport.scrollLeft;
      const scrollPosY = viewport.scrollTop;
      const touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      // Centro relativo al panel en coordenadas ORIGINALES (sin escalar)
      pinchCenterX = (scrollPosX + touchMidX) / currentScale;
      pinchCenterY = (scrollPosY + touchMidY) / currentScale;
    } else if (e.touches.length === 1 && touchPanId === null) {
      // ── Pan con 1 dedo: mismo mecanismo que el de 2 dedos ──
      const state = activePips.get(panelId);
      if (state?.locked) return;
      // No iniciar pan si el target es un control interactivo
      if (isInteractivePipTarget(e.touches[0].target)) return;
      touchPanId = e.touches[0].identifier;
      touchPanStartX = e.touches[0].clientX;
      touchPanStartY = e.touches[0].clientY;
      touchPanScrollX = viewport.scrollLeft;
      touchPanScrollY = viewport.scrollTop;
    }
  }, { passive: false });
  
  content.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && lastPinchDist > 0) {
      // ── Pinch-zoom con 2 dedos ──
      const state = activePips.get(panelId);
      if (state?.locked) return;
      e.preventDefault();
      e.stopPropagation();
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
        const minScale = getMinScale(panelId);
        const newScale = Math.max(minScale, Math.min(MAX_SCALE, state.scale * clampedFactor));
        updatePipScale(panelId, newScale);
      }
      
      // Reposicionar scroll para que el punto de pinch siga bajo los dedos
      const currentScale = state.scale;
      
      const scaledPinchX = pinchCenterX * currentScale;
      const scaledPinchY = pinchCenterY * currentScale;
      
      const rect = viewport.getBoundingClientRect();
      const touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      const newScrollX = scaledPinchX - touchMidX;
      const newScrollY = scaledPinchY - touchMidY;
      
      viewport.scrollLeft = Math.max(0, newScrollX);
      viewport.scrollTop = Math.max(0, newScrollY);
    } else if (e.touches.length === 1 && touchPanId !== null) {
      // ── Pan con 1 dedo ──
      // Buscar el touch activo por su identifier
      const touch = Array.from(e.touches).find(t => t.identifier === touchPanId);
      if (!touch) return;
      e.preventDefault();
      const dx = touch.clientX - touchPanStartX;
      const dy = touch.clientY - touchPanStartY;
      viewport.scrollLeft = touchPanScrollX - dx;
      viewport.scrollTop = touchPanScrollY - dy;
    }
  }, { passive: false });
  
  content.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      lastPinchDist = 0;
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
  
  // Bloquear scroll interno cuando está bloqueado
  if (viewport) {
    viewport.addEventListener('scroll', () => {
      const state = activePips.get(panelId);
      if (state?.locked) {
        // Restaurar posición previa para bloquear el scroll
        viewport.scrollLeft = state.lastScrollLeft;
        viewport.scrollTop = state.lastScrollTop;
        return;
      }
      state.lastScrollLeft = viewport.scrollLeft;
      state.lastScrollTop = viewport.scrollTop;
    }, { passive: true });
  }
  
  // Guardar estado cuando el usuario hace scroll dentro del viewport
  if (viewport) {
    let scrollSaveTimeout = null;
    viewport.addEventListener('scroll', () => {
      const state = activePips.get(panelId);
      if (state?.locked) return;
      // Ignorar durante restauración (el scroll de openPip no debe persistirse)
      if (_isRestoring) return;
      // Ignorar durante gestos activos para evitar ciclos de layout en Samsung
      if (gestureInProgress) return;
      // Debounce más largo para evitar lecturas de layout durante momentum scroll
      if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
      scrollSaveTimeout = setTimeout(() => {
        // Verificar de nuevo por si el gesto o restauración empezó durante el timeout
        if (!gestureInProgress && !_isRestoring) {
          savePipState();
        }
      }, 500);
    }, { passive: true });
  }
  
  // ── Paneo con arrastre del ratón dentro del contenido ──
  // Solo ratón: click izquierdo en fondo no interactivo o click central → pan
  // El paneo táctil se gestiona con touch events (arriba) para evitar conflictos con pines y controles.
  
  content.addEventListener('pointerdown', (e) => {
    // Solo ratón — el touch ya se gestiona con touchstart/touchmove
    if (e.pointerType === 'touch') return;
    const state = activePips.get(panelId);
    if (!state || state.locked) return;
    // Botón central siempre panea; botón izquierdo solo si no es un control interactivo
    const isMiddle = e.button === 1;
    const isLeft = e.button === 0;
    if (!isMiddle && !isLeft) return;
    if (isLeft && isInteractivePipTarget(e.target)) return;
    
    e.preventDefault();
    panningPip = panelId;
    panPointerId = e.pointerId;
    content.setPointerCapture(e.pointerId);
    panStart.x = e.clientX;
    panStart.y = e.clientY;
    panStart.scrollX = viewport.scrollLeft;
    panStart.scrollY = viewport.scrollTop;
    content.style.cursor = 'grabbing';
  });
  
  content.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (panningPip !== panelId || e.pointerId !== panPointerId) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    viewport.scrollLeft = panStart.scrollX - dx;
    viewport.scrollTop = panStart.scrollY - dy;
  });
  
  const endPan = (e) => {
    if (e.pointerType === 'touch') return;
    if (panningPip !== panelId || e.pointerId !== panPointerId) return;
    try { content.releasePointerCapture(panPointerId); } catch (_) { /* ignore */ }
    panningPip = null;
    panPointerId = null;
    content.style.cursor = '';
  };
  content.addEventListener('pointerup', endPan);
  content.addEventListener('pointercancel', endPan);
}

/**
 * Maneja el movimiento del puntero para drag/resize.
 * @param {PointerEvent} e
 */
function handlePointerMove(e) {
  if (draggingPip) {
    const state = activePips.get(draggingPip);
    if (!state) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - state.width, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y));
    
    state.x = newX;
    state.y = newY;
    state.pipContainer.style.left = `${newX}px`;
    state.pipContainer.style.top = `${newY}px`;
  }
  
  if (resizingPip) {
    const state = activePips.get(resizingPip);
    if (!state) return;
    
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    
    let newW = resizeStart.w;
    let newH = resizeStart.h;
    let newX = resizeStart.pipX;
    let newY = resizeStart.pipY;
    
    if (resizeEdge === 'corner') {
      // Esquina: resize proporcional (aspect ratio bloqueado)
      // Usar el eje con mayor desplazamiento para guiar la proporción
      const ar = resizeStart.aspectRatio;
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
    } else if (resizeEdge === 'bottom') {
      newH = resizeStart.h + dy;
    } else if (resizeEdge === 'left') {
      newW = resizeStart.w - dx;
      newX = resizeStart.pipX + dx;
    } else if (resizeEdge === 'top') {
      newH = resizeStart.h - dy;
      newY = resizeStart.pipY + dy;
    }
    
    // Límites dinámicos basados en la pantalla
    const maxW = window.innerWidth - newX;
    const maxH = window.innerHeight - newY;
    newW = Math.max(MIN_PIP_SIZE, Math.min(maxW, newW));
    newH = Math.max(MIN_PIP_SIZE, Math.min(maxH, newH));
    
    // Para left/top: asegurar que no se salga de pantalla
    if (resizeEdge === 'left') {
      newX = resizeStart.pipX + resizeStart.w - newW;
      newX = Math.max(0, newX);
      newW = resizeStart.pipX + resizeStart.w - newX;
    }
    if (resizeEdge === 'top') {
      newY = resizeStart.pipY + resizeStart.h - newH;
      newY = Math.max(0, newY);
      newH = resizeStart.pipY + resizeStart.h - newY;
    }
    
    state.width = newW;
    state.height = newH;
    state.x = newX;
    state.y = newY;
    state.pipContainer.style.width = `${newW}px`;
    state.pipContainer.style.height = `${newH}px`;
    state.pipContainer.style.left = `${newX}px`;
    state.pipContainer.style.top = `${newY}px`;
    
    // Para bordes left/top: compensar scroll para anclar el contenido
    // al lado opuesto (derecha/abajo). Si el viewport encoge ΔH,
    // para que el borde inferior visible quede fijo:
    //   newScroll = oldScroll - ΔH  (ΔH < 0 al encoger → scroll sube)
    if (resizeEdge === 'left' || resizeEdge === 'top') {
      const viewport = state.pipContainer.querySelector('.pip-viewport');
      if (viewport) {
        if (resizeEdge === 'left') {
          const widthDelta = newW - resizeStart.w;
          viewport.scrollLeft = Math.max(0, resizeStart.scrollX - widthDelta);
        }
        if (resizeEdge === 'top') {
          const heightDelta = newH - resizeStart.h;
          viewport.scrollTop = Math.max(0, resizeStart.scrollY - heightDelta);
        }
      }
    }
    
    if (resizeEdge === 'corner') {
      // Esquina: escalar proporcionalmente al cambio de tamaño
      const scaleFactor = newW / resizeStart.w;
      const baseScale = resizeStart.scale || state.scale;
      const minScale = getMinScale(resizingPip);
      const newScale = Math.max(minScale, Math.min(MAX_SCALE, baseScale * scaleFactor));
      
      updatePipScale(resizingPip, newScale, false);
      
      // Ajustar scroll para mantener el mismo punto del panel en el centro de la vista
      const viewport = state.pipContainer.querySelector('.pip-viewport');
      if (viewport && resizeStart.viewCenterX !== undefined) {
        const newViewportW = viewport.clientWidth;
        const newViewportH = viewport.clientHeight;
        const newScrollX = resizeStart.viewCenterX * newScale - newViewportW / 2;
        const newScrollY = resizeStart.viewCenterY * newScale - newViewportH / 2;
        viewport.scrollLeft = Math.max(0, newScrollX);
        viewport.scrollTop = Math.max(0, newScrollY);
      }
    } else {
      // Bordes: recalcular escala mínima (contain) para que el contenido
      // siempre se vea completo sin cortes
      const minScale = getMinScale(resizingPip);
      if (state.scale < minScale) {
        updatePipScale(resizingPip, minScale, false);
      } else {
        // Aunque la escala sea suficiente, actualizar viewport-inner
        // para reflejar las nuevas dimensiones del contenedor
        updatePipScale(resizingPip, state.scale, false);
      }
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
      // Liberar pointer capture
      const header = state.pipContainer.querySelector('.pip-header');
      if (header && dragPointerId !== null) {
        try { header.releasePointerCapture(dragPointerId); } catch (_) { /* ignore */ }
      }
      stateChanged = true;
    }
    draggingPip = null;
    dragPointerId = null;
  }
  
  if (resizingPip) {
    const state = activePips.get(resizingPip);
    if (state) {
      state.pipContainer.classList.remove('pip-container--resizing');
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
  // Contain: el panel debe caber completamente visible (Math.min)
  const containScale = Math.max(MIN_SCALE_ABSOLUTE, Math.min(newViewportW / panelWidth, newViewportH / panelHeight));
  // La escala crece proporcionalmente, pero nunca por debajo del contain
  const newScale = Math.max(containScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
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
  
  // Actualizar escala — usar contain para que se vea completo
  updatePipScale(panelId, newScale, false);
  
  // Panel completo visible: centrar scroll
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    const scaledW = panelWidth * newScale;
    const scaledH = panelHeight * newScale;
    viewport.scrollLeft = Math.max(0, (scaledW - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (scaledH - viewport.clientHeight) / 2);
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
  // Contain: el panel debe caber completamente visible (Math.min)
  const containScale = Math.max(MIN_SCALE_ABSOLUTE, Math.min(newViewportW / panelWidth, newViewportH / panelHeight));
  const newScale = Math.max(containScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
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
  
  // Panel completo visible: centrar scroll
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    const scaledW = panelWidth * newScale;
    const scaledH = panelHeight * newScale;
    viewport.scrollLeft = Math.max(0, (scaledW - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (scaledH - viewport.clientHeight) / 2);
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
  
  // El cuadrado tendrá lado = smallestAxis (para garantizar que cabe en pantalla)
  // Pero necesitamos que el PANEL (que puede no ser cuadrado) quepa entero.
  // Escala contain: el panel cabe completo dentro del cuadrado
  const containScale = Math.min(smallestAxis / panelWidth, smallestAxis / panelHeight);
  
  // Tamaño de la ventana PiP: cuadrado basado en el panel escalado
  const scaledSize = Math.max(panelWidth, panelHeight) * containScale;
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
  
  // Escala: el panel debe caber completo (contain)
  const finalViewportW = newW - PIP_BORDER_SIZE;
  const finalViewportH = newH - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE;
  const fitScale = Math.max(MIN_SCALE_ABSOLUTE, Math.min(finalViewportW / panelWidth, finalViewportH / panelHeight));
  
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
  const state = activePips.get(panelId);
  if (!state) return;
  
  state.scale = newScale;
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return;
  
  // Obtener tamaño real del panel (760x760 normalmente)
  const panelWidth = panelEl.offsetWidth || 760;
  const panelHeight = panelEl.offsetHeight || 760;
  
  // Tamaño escalado del panel
  const scaledWidth = panelWidth * newScale;
  const scaledHeight = panelHeight * newScale;
  
  // Aplicar escala al panel
  panelEl.style.transform = `scale(${newScale})`;
  panelEl.style.transformOrigin = '0 0';
  
  // Obtener tamaño del viewport (contenido visible)
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  const viewportWidth = viewport ? viewport.clientWidth : (state.width - PIP_BORDER_SIZE);
  const viewportHeight = viewport ? viewport.clientHeight : (state.height - PIP_HEADER_HEIGHT - PIP_BORDER_SIZE);
  
  // Sin padding: el panel se alinea al borde del viewport (cover behavior).
  // El eje más próximo queda a ras, el otro puede desbordar con scroll.
  const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
  if (viewportInner) {
    viewportInner.style.width = `${scaledWidth}px`;
    viewportInner.style.height = `${scaledHeight}px`;
    viewportInner.style.padding = '0';
    viewportInner.style.boxSizing = 'border-box';
  }
  
  // Guardar estado después de cambiar zoom
  if (persist) {
    savePipState();
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
    // Obtener scroll del viewport interno
    const viewport = state.pipContainer.querySelector('.pip-viewport');
    const scrollX = viewport ? viewport.scrollLeft : 0;
    const scrollY = viewport ? viewport.scrollTop : 0;
    
    states.push({
      panelId,
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      scale: state.scale,
      scrollX,
      scrollY,
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
  // No guardar durante restauración (openPip llama a savePipState con datos iniciales)
  if (_isRestoring) return;
  
  // Verificar si está habilitado recordar PiPs
  const remember = localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER);
  if (remember === 'false') return;
  
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
  // Verificar si está habilitado recordar PiPs
  const remember = localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER);
  if (remember === 'false') return;
  
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
 * Verifica si está habilitado recordar PiPs entre sesiones.
 * @returns {boolean}
 */
export function isRememberPipsEnabled() {
  const saved = localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER);
  // Por defecto true (habilitado)
  return saved !== 'false';
}

/**
 * Establece si se deben recordar los PiPs entre sesiones.
 * @param {boolean} enabled
 */
export function setRememberPips(enabled) {
  localStorage.setItem(STORAGE_KEYS.PIP_REMEMBER, String(enabled));
  if (!enabled) {
    clearPipState();
  }
}
