// Gestor de paneles Picture-in-Picture (PiP)
// Permite extraer paneles del viewport principal para verlos de forma flotante

import { createLogger } from '../utils/logger.js';
import { t, onLocaleChange } from '../i18n/index.js';
import { STORAGE_KEYS } from '../utils/constants.js';

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

/** Z-index base para PiPs (por encima del viewport pero debajo de modales) */
const PIP_Z_INDEX_BASE = 1200;

/** Dimensiones mínimas del PiP */
const MIN_PIP_SIZE = 150;
// MAX_PIP_SIZE es dinámico: se calcula según el tamaño de la ventana

/** Tamaño de cabecera del PiP */
const PIP_HEADER_HEIGHT = 32;

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
    width: contentSize,
    height: contentSize + PIP_HEADER_HEIGHT,
    scale: contentSize / panelSize
  };
}

/**
 * Calcula el zoom mínimo para que el panel llene el viewport.
 * El lado más corto del viewport debe coincidir con el panel.
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
  const viewportWidth = viewport?.clientWidth || state.width;
  const viewportHeight = viewport?.clientHeight || (state.height - 32);
  
  // El zoom mínimo es el mayor de los ratios (para que el panel llene el viewport)
  const minScaleX = viewportWidth / panelWidth;
  const minScaleY = viewportHeight / panelHeight;
  const dynamicMin = Math.max(minScaleX, minScaleY);
  
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

/** Menú contextual activo */
let activeContextMenu = null;

/** Duración del long press en ms para activar menú contextual (iOS Safari) */
const LONG_PRESS_DURATION = 500;

/** Estado del long press por panel */
const longPressTimers = new Map();

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activePips.size > 0) {
      const now = Date.now();
      if (now - lastEscapeTime < 400) {
        // Doble Escape: cerrar todos los PiPs
        closeAllPips();
      }
      lastEscapeTime = now;
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
      // Solo mostrar si el panel no está ya en PiP
      if (activePips.has(panelEl.id)) return;
      
      e.preventDefault();
      showPanelContextMenu(panelEl.id, e.clientX, e.clientY);
    });
    
    // Long press para dispositivos táctiles (iOS Safari no dispara contextmenu)
    panelEl.addEventListener('touchstart', (e) => {
      if (activePips.has(panelEl.id)) return;
      
      // Cancelar timer previo si existe
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
      }
      
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      
      const timer = setTimeout(() => {
        longPressTimers.delete(panelEl.id);
        // Vibrar si está disponible (feedback háptico)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        showPanelContextMenu(panelEl.id, startX, startY);
      }, LONG_PRESS_DURATION);
      
      longPressTimers.set(panelEl.id, timer);
    }, { passive: true });
    
    // Cancelar long press si el dedo se mueve
    panelEl.addEventListener('touchmove', (e) => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
    }, { passive: true });
    
    // Cancelar long press si el dedo se levanta
    panelEl.addEventListener('touchend', () => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
    }, { passive: true });
    
    panelEl.addEventListener('touchcancel', () => {
      if (longPressTimers.has(panelEl.id)) {
        clearTimeout(longPressTimers.get(panelEl.id));
        longPressTimers.delete(panelEl.id);
      }
    }, { passive: true });
  });
}

/**
 * Muestra el menú contextual para un panel.
 * @param {string} panelId - ID del panel
 * @param {number} x - Posición X
 * @param {number} y - Posición Y
 */
function showPanelContextMenu(panelId, x, y) {
  hideContextMenu();
  
  const menu = document.createElement('div');
  menu.className = 'pip-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  // Opción: Separar este panel
  const detachItem = document.createElement('button');
  detachItem.className = 'pip-context-menu__item';
  detachItem.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
      <path d="M14 9l3 3-3 3"/>
    </svg>
    <span>${t('pip.detach', 'Separar panel')}</span>
  `;
  detachItem.addEventListener('click', () => {
    hideContextMenu();
    openPip(panelId);
  });
  menu.appendChild(detachItem);
  
  document.body.appendChild(menu);
  activeContextMenu = menu;
  
  // Ajustar posición si se sale de la pantalla
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  });
  
  // Cerrar al hacer click fuera (sin consumir eventos para permitir abrir otro menú)
  const closeHandler = (e) => {
    if (activeContextMenu && activeContextMenu.contains(e.target)) return;
    hideContextMenu();
    document.removeEventListener('click', closeHandler);
    document.removeEventListener('contextmenu', closeOnContextMenu);
  };
  
  const closeOnContextMenu = (e) => {
    // Si el click derecho es en un panel, dejar que se abra el nuevo menú
    if (e.target.closest?.('.panel')) {
      document.removeEventListener('click', closeHandler);
      document.removeEventListener('contextmenu', closeOnContextMenu);
      return;
    }
    hideContextMenu();
    document.removeEventListener('click', closeHandler);
    document.removeEventListener('contextmenu', closeOnContextMenu);
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeOnContextMenu);
  }, 10);
}

/**
 * Oculta el menú contextual activo.
 */
function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
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
 */
export function openPip(panelId) {
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
      <span class="pip-placeholder__hint">${t('pip.placeholderHint', 'Click para restaurar')}</span>
    </div>
  `;
  
  // Insertar placeholder donde estaba el panel
  panelEl.parentElement.insertBefore(placeholder, panelEl);
  
  // Click en placeholder cierra el PiP
  placeholder.addEventListener('click', () => {
    closePip(panelId);
  });
  
  // Crear contenedor PiP
  const pipContainer = document.createElement('div');
  pipContainer.className = 'pip-container';
  pipContainer.dataset.panelId = panelId;
  pipContainer.style.zIndex = PIP_Z_INDEX_BASE + activePips.size;
  
  // Dimensiones iniciales: panel al tamaño del zoom mínimo del canvas
  const pipDims = getInitialPipDimensions();
  const initialPos = getInitialPipPosition(panelId, pipDims.width, pipDims.height);
  
  pipContainer.style.left = `${initialPos.x}px`;
  pipContainer.style.top = `${initialPos.y}px`;
  pipContainer.style.width = `${pipDims.width}px`;
  pipContainer.style.height = `${pipDims.height}px`;
  
  // Barra de título
  const header = document.createElement('div');
  header.className = 'pip-header';
  header.innerHTML = `
    <span class="pip-title">${getPanelTitle(panelId)}</span>
    <div class="pip-controls">
      <button type="button" class="pip-minimize" aria-label="${t('pip.minimize', 'Minimizar')}">−</button>
      <button type="button" class="pip-maximize" aria-label="${t('pip.maximize', 'Maximizar')}">+</button>
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
  
  // Handle de resize
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'pip-resize-handle';
  pipContainer.appendChild(resizeHandle);

  pipLayer.appendChild(pipContainer);
  
  // Estado inicial
  const state = {
    panelId,
    originalParent,
    originalIndex,
    pipContainer,
    x: initialPos.x,
    y: initialPos.y,
    width: pipDims.width,
    height: pipDims.height,
    scale: pipDims.scale,
    defaultWidth: pipDims.width,
    defaultHeight: pipDims.height,
    locked: false,
    isMaximized: false
  };
  
  activePips.set(panelId, state);
  
  // Aplicar escala inicial
  updatePipScale(panelId, state.scale);
  
  // Centrar el scroll en el panel (después de que se haya calculado el tamaño del viewport-inner con padding)
  const pipViewport = pipContainer.querySelector('.pip-viewport');
  if (pipViewport) {
    const vw = pipViewport.clientWidth;
    const vh = pipViewport.clientHeight;
    const panelW = (panelEl?.offsetWidth || 760) * state.scale;
    const panelH = (panelEl?.offsetHeight || 760) * state.scale;
    const minVisX = Math.min(vw, panelW) * (2 / 3);
    const minVisY = Math.min(vh, panelH) * (2 / 3);
    const padX = Math.max(0, vw - minVisX);
    const padY = Math.max(0, vh - minVisY);
    // Scroll para que el centro del panel escalado quede en el centro del viewport
    pipViewport.scrollLeft = padX + panelW / 2 - vw / 2;
    pipViewport.scrollTop = padY + panelH / 2 - vh / 2;
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
  
  // Resize
  resizeHandle.addEventListener('pointerdown', (e) => {
    const state = activePips.get(panelId);
    if (state?.locked) return;
    e.preventDefault();
    e.stopPropagation();
    resizingPip = panelId;
    resizePointerId = e.pointerId;
    resizeHandle.setPointerCapture(e.pointerId);
    const viewport = pipContainer.querySelector('.pip-viewport');
    const viewportW = viewport ? viewport.clientWidth : state.width;
    const viewportH = viewport ? viewport.clientHeight : state.height - 32;
    // Calcular qué punto del panel está en el centro de la vista
    const scrollX = viewport ? viewport.scrollLeft : 0;
    const scrollY = viewport ? viewport.scrollTop : 0;
    // Leer el padding real del viewport-inner
    const viewportInner = pipContainer.querySelector('.pip-viewport-inner');
    const paddingX = parseFloat(viewportInner?.style.paddingLeft) || 0;
    const paddingY = parseFloat(viewportInner?.style.paddingTop) || 0;
    // Centro de la vista en coordenadas del viewport-inner: scrollX + viewportW/2
    // Eso corresponde al punto del panel escalado: (scrollX + viewportW/2) - paddingX
    // En coordenadas del panel ORIGINAL (sin escalar): ((scrollX + viewportW/2) - paddingX) / scale
    const viewCenterOnPanelX = (scrollX + viewportW / 2 - paddingX) / state.scale;
    const viewCenterOnPanelY = (scrollY + viewportH / 2 - paddingY) / state.scale;
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: state.width,
      h: state.height,
      scale: state.scale,
      // Punto del panel ORIGINAL que está en el centro de la vista
      viewCenterX: viewCenterOnPanelX,
      viewCenterY: viewCenterOnPanelY
    };
    pipContainer.classList.add('pip-container--resizing');
    bringToFront(panelId);
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
  
  // Bloquear menú contextual del navegador en el contenido PiP
  pipContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
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
  const pipViewportInner = pipContainer.querySelector('.pip-viewport-inner');
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
        
        const oldPaddingX = parseFloat(pipViewportInner.style.paddingLeft) || 0;
        const oldPaddingY = parseFloat(pipViewportInner.style.paddingTop) || 0;
        
        const panelPointX = (pipViewport.scrollLeft + cursorX - oldPaddingX) / oldScale;
        const panelPointY = (pipViewport.scrollTop + cursorY - oldPaddingY) / oldScale;
        
        updatePipScale(panelId, newScale);
        
        const newPaddingX = parseFloat(pipViewportInner.style.paddingLeft) || 0;
        const newPaddingY = parseFloat(pipViewportInner.style.paddingTop) || 0;
        
        const newScrollX = panelPointX * newScale + newPaddingX - cursorX;
        const newScrollY = panelPointY * newScale + newPaddingY - cursorY;
        
        pipViewport.scrollLeft = Math.max(0, newScrollX);
        pipViewport.scrollTop = Math.max(0, newScrollY);
      }
    } else {
      // Pan manual con límites: al menos 2/3 del panel visible en cada eje
      const viewportW = pipViewport.clientWidth;
      const viewportH = pipViewport.clientHeight;
      
      const panelEl = document.getElementById(panelId);
      const scaledW = (panelEl?.offsetWidth || 760) * state.scale;
      const scaledH = (panelEl?.offsetHeight || 760) * state.scale;
      
      const minVisX = Math.min(viewportW, scaledW) * (2 / 3);
      const minVisY = Math.min(viewportH, scaledH) * (2 / 3);
      
      const paddingX = Math.max(0, viewportW - minVisX);
      const paddingY = Math.max(0, viewportH - minVisY);
      
      const minScrollX = Math.max(0, paddingX + minVisX - viewportW);
      const maxScrollX = paddingX + scaledW - minVisX;
      const minScrollY = Math.max(0, paddingY + minVisY - viewportH);
      const maxScrollY = paddingY + scaledH - minVisY;
      
      const panFactor = state.scale * state.scale;
      const newScrollX = pipViewport.scrollLeft + (e.deltaX || 0) * panFactor;
      const newScrollY = pipViewport.scrollTop + (e.deltaY || 0) * panFactor;
      
      pipViewport.scrollLeft = Math.max(minScrollX, Math.min(maxScrollX, newScrollX));
      pipViewport.scrollTop = Math.max(minScrollY, Math.min(maxScrollY, newScrollY));
    }
  }, { passive: false });
  
  // Pinch zoom táctil dentro del PiP (centrado en el punto de pellizco)
  // Usa enfoque frame-by-frame con protección anti-jitter (como el canvas principal)
  const content = pipContainer.querySelector('.pip-content');
  const viewport = pipContainer.querySelector('.pip-viewport');
  let lastPinchDist = 0;
  let pinchCenterX = 0; // Relativo al panel (sin padding)
  let pinchCenterY = 0;
  
  content.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const state = activePips.get(panelId);
      if (state?.locked) return;
      e.preventDefault();
      gestureInProgress = true;
      window.__synthPipGestureActive = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
      const currentScale = state ? state.scale : 0.4;
      
      // Calcular centro del pinch relativo al contenido del PANEL (no al viewport con padding)
      const rect = viewport.getBoundingClientRect();
      const viewportInner = pipContainer.querySelector('.pip-viewport-inner');
      
      // Leer el padding REAL del viewportInner (puede diferir en X e Y)
      const currentPaddingX = parseFloat(viewportInner?.style.paddingLeft) || 0;
      const currentPaddingY = parseFloat(viewportInner?.style.paddingTop) || 0;
      
      // Centro del pinch en coordenadas del viewport (posición de scroll + offset en pantalla)
      const scrollPosX = viewport.scrollLeft;
      const scrollPosY = viewport.scrollTop;
      const touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      // Centro relativo al panel en coordenadas ORIGINALES (sin escalar)
      pinchCenterX = (scrollPosX + touchMidX - currentPaddingX) / currentScale;
      pinchCenterY = (scrollPosY + touchMidY - currentPaddingY) / currentScale;
    }
  }, { passive: false });
  
  content.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && lastPinchDist > 0) {
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
      const viewportInner = pipContainer.querySelector('.pip-viewport-inner');
      const newPaddingX = parseFloat(viewportInner?.style.paddingLeft) || 0;
      const newPaddingY = parseFloat(viewportInner?.style.paddingTop) || 0;
      
      const scaledPinchX = pinchCenterX * currentScale;
      const scaledPinchY = pinchCenterY * currentScale;
      
      const rect = viewport.getBoundingClientRect();
      const touchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const touchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      const newScrollX = scaledPinchX + newPaddingX - touchMidX;
      const newScrollY = scaledPinchY + newPaddingY - touchMidY;
      
      viewport.scrollLeft = Math.max(0, newScrollX);
      viewport.scrollTop = Math.max(0, newScrollY);
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
  }, { passive: true });
  
  // Bloquear scroll interno cuando está bloqueado
  if (viewport) {
    let lastScrollLeft = 0;
    let lastScrollTop = 0;
    viewport.addEventListener('scroll', () => {
      const state = activePips.get(panelId);
      if (state?.locked) {
        // Restaurar posición previa para bloquear el scroll
        viewport.scrollLeft = lastScrollLeft;
        viewport.scrollTop = lastScrollTop;
        return;
      }
      lastScrollLeft = viewport.scrollLeft;
      lastScrollTop = viewport.scrollTop;
    }, { passive: true });
  }
  
  // Guardar estado cuando el usuario hace scroll dentro del viewport
  if (viewport) {
    let scrollSaveTimeout = null;
    viewport.addEventListener('scroll', () => {
      const state = activePips.get(panelId);
      if (state?.locked) return;
      // Ignorar durante gestos activos para evitar ciclos de layout en Samsung
      if (gestureInProgress) return;
      // Debounce más largo para evitar lecturas de layout durante momentum scroll
      if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
      scrollSaveTimeout = setTimeout(() => {
        // Verificar de nuevo por si el gesto empezó durante el timeout
        if (!gestureInProgress) {
          savePipState();
        }
      }, 500);
    }, { passive: true });
  }
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
    
    // Límites dinámicos basados en la pantalla
    const maxW = window.innerWidth - state.x;
    const maxH = window.innerHeight - state.y;
    
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_PIP_SIZE, Math.min(maxW, resizeStart.w + dx));
    const newH = Math.max(MIN_PIP_SIZE, Math.min(maxH, resizeStart.h + dy));
    
    // Calcular factor de escala basado en el cambio de tamaño
    // Usamos el promedio de ambos ejes para zoom uniforme
    const scaleFactorW = newW / resizeStart.w;
    const scaleFactorH = newH / resizeStart.h;
    const scaleFactor = (scaleFactorW + scaleFactorH) / 2;
    
    // Nueva escala proporcional al cambio de tamaño (con límite dinámico)
    const baseScale = resizeStart.scale || state.scale;
    const minScale = getMinScale(resizingPip);
    const newScale = Math.max(minScale, Math.min(MAX_SCALE, baseScale * scaleFactor));
    
    state.width = newW;
    state.height = newH;
    state.pipContainer.style.width = `${newW}px`;
    state.pipContainer.style.height = `${newH}px`;
    
    // Actualizar escala proporcionalmente (sin persistir, se guarda al soltar)
    updatePipScale(resizingPip, newScale, false);
    
    // Ajustar scroll para mantener el mismo punto del panel en el centro de la vista
    const viewport = state.pipContainer.querySelector('.pip-viewport');
    if (viewport && resizeStart.viewCenterX !== undefined) {
      const newViewportW = viewport.clientWidth;
      const newViewportH = viewport.clientHeight;
      // Leer el padding real calculado por updatePipScale
      const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
      const newPaddingX = parseFloat(viewportInner?.style.paddingLeft) || 0;
      const newPaddingY = parseFloat(viewportInner?.style.paddingTop) || 0;
      // El punto del panel original (viewCenterX/Y) ahora está en posición escalada:
      // posición en viewport-inner = newPadding + viewCenterX * newScale
      // Queremos que esa posición esté en el centro del viewport:
      // newScrollX + newViewportW/2 = newPadding + viewCenterX * newScale
      // newScrollX = newPadding + viewCenterX * newScale - newViewportW/2
      const newScrollX = newPaddingX + resizeStart.viewCenterX * newScale - newViewportW / 2;
      const newScrollY = newPaddingY + resizeStart.viewCenterY * newScale - newViewportH / 2;
      viewport.scrollLeft = Math.max(0, newScrollX);
      viewport.scrollTop = Math.max(0, newScrollY);
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
      // Liberar pointer capture
      const resizeHandle = state.pipContainer.querySelector('.pip-resize-handle');
      if (resizeHandle && resizePointerId !== null) {
        try { resizeHandle.releasePointerCapture(resizePointerId); } catch (_) { /* ignore */ }
      }
      stateChanged = true;
    }
    resizingPip = null;
    resizePointerId = null;
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
  
  // Proporción actual de la ventana
  const currentRatio = state.width / state.height;
  
  // Calcular tamaño máximo manteniendo proporción
  let newW, newH;
  if (currentRatio >= maxW / maxH) {
    // Limitado por ancho
    newW = maxW;
    newH = Math.round(newW / currentRatio);
  } else {
    // Limitado por alto
    newH = maxH;
    newW = Math.round(newH * currentRatio);
  }
  
  // Centrar en pantalla
  const newX = Math.round((window.innerWidth - newW) / 2);
  const newY = Math.round((window.innerHeight - newH) / 2);
  
  // Calcular nueva escala proporcional al cambio de tamaño
  // Para que se vea la misma porción de panel, la escala escala con el tamaño
  const oldW = state.width;
  const sizeFactor = newW / oldW;
  const oldScale = state.scale;
  const minScale = getMinScale(panelId);
  const newScale = Math.max(minScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
  // Guardar centro visible del panel antes del cambio
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
  let viewCenterX = 0, viewCenterY = 0;
  if (viewport && viewportInner) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const padX = parseFloat(viewportInner.style.paddingLeft) || 0;
    const padY = parseFloat(viewportInner.style.paddingTop) || 0;
    viewCenterX = (viewport.scrollLeft + vw / 2 - padX) / oldScale;
    viewCenterY = (viewport.scrollTop + vh / 2 - padY) / oldScale;
  }
  
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
  
  // Actualizar escala proporcionalmente al cambio de tamaño
  updatePipScale(panelId, newScale, false);
  
  // Restaurar centro visible con la nueva escala
  if (viewport && viewportInner) {
    const newVw = viewport.clientWidth;
    const newVh = viewport.clientHeight;
    const newPadX = parseFloat(viewportInner.style.paddingLeft) || 0;
    const newPadY = parseFloat(viewportInner.style.paddingTop) || 0;
    viewport.scrollLeft = Math.max(0, viewCenterX * newScale + newPadX - newVw / 2);
    viewport.scrollTop = Math.max(0, viewCenterY * newScale + newPadY - newVh / 2);
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
  
  // Proporción actual de la ventana
  const currentRatio = state.width / state.height;
  
  // Dimensiones por defecto
  const defW = state.defaultWidth;
  const defH = state.defaultHeight;
  
  // Ajustar tamaño por defecto a la proporción actual
  let newW, newH;
  const defaultRatio = defW / defH;
  if (currentRatio >= defaultRatio) {
    // Más ancha que el default: usar ancho por defecto
    newW = defW;
    newH = Math.round(newW / currentRatio);
    // Si queda demasiado bajo, usar alto mínimo
    if (newH < MIN_PIP_SIZE) {
      newH = MIN_PIP_SIZE;
      newW = Math.round(newH * currentRatio);
    }
  } else {
    // Más alta que el default: usar alto por defecto
    newH = defH;
    newW = Math.round(newH * currentRatio);
    // Si queda demasiado estrecho, usar ancho mínimo
    if (newW < MIN_PIP_SIZE) {
      newW = MIN_PIP_SIZE;
      newH = Math.round(newW / currentRatio);
    }
  }
  
  // Calcular nueva escala proporcional al cambio de tamaño
  const oldW = state.width;
  const sizeFactor = newW / oldW;
  const oldScale = state.scale;
  const minScale = getMinScale(panelId);
  const newScale = Math.max(minScale, Math.min(MAX_SCALE, oldScale * sizeFactor));
  
  // Guardar centro visible del panel antes del cambio
  const viewport = state.pipContainer.querySelector('.pip-viewport');
  const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
  let viewCenterX = 0, viewCenterY = 0;
  if (viewport && viewportInner) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const padX = parseFloat(viewportInner.style.paddingLeft) || 0;
    const padY = parseFloat(viewportInner.style.paddingTop) || 0;
    viewCenterX = (viewport.scrollLeft + vw / 2 - padX) / oldScale;
    viewCenterY = (viewport.scrollTop + vh / 2 - padY) / oldScale;
  }
  
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
  
  // Actualizar escala proporcionalmente al cambio de tamaño
  updatePipScale(panelId, newScale, false);
  
  // Restaurar centro visible con la nueva escala
  if (viewport && viewportInner) {
    const newVw = viewport.clientWidth;
    const newVh = viewport.clientHeight;
    const newPadX = parseFloat(viewportInner.style.paddingLeft) || 0;
    const newPadY = parseFloat(viewportInner.style.paddingTop) || 0;
    viewport.scrollLeft = Math.max(0, viewCenterX * newScale + newPadX - newVw / 2);
    viewport.scrollTop = Math.max(0, viewCenterY * newScale + newPadY - newVh / 2);
  }
  
  savePipState();
  log.debug(`PiP ${panelId} restaurado a ${newW}x${newH} (escala ${oldScale.toFixed(2)} → ${newScale.toFixed(2)})`);
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
  const viewportWidth = viewport ? viewport.clientWidth : state.width;
  const viewportHeight = viewport ? viewport.clientHeight : state.height - 32;
  
  // Padding limitado para que al menos 2/3 del panel (o viewport) sea siempre visible
  const minVisibleX = Math.min(viewportWidth, scaledWidth) * (2 / 3);
  const minVisibleY = Math.min(viewportHeight, scaledHeight) * (2 / 3);
  const paddingX = Math.max(0, viewportWidth - minVisibleX);
  const paddingY = Math.max(0, viewportHeight - minVisibleY);
  
  // Actualizar tamaño del contenedor interno
  // El panel escalado está en (paddingX, paddingY) y ocupa (scaledWidth, scaledHeight)
  // El contenedor debe ser: paddingX + scaledWidth + paddingX = 2*paddingX + scaledWidth
  // Usamos box-sizing: border-box implícito, el width/height es el total scrollable
  const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
  if (viewportInner) {
    // Tamaño total del área scrollable
    const totalWidth = paddingX + scaledWidth + paddingX;
    const totalHeight = paddingY + scaledHeight + paddingY;
    viewportInner.style.width = `${totalWidth}px`;
    viewportInner.style.height = `${totalHeight}px`;
    viewportInner.style.paddingLeft = `${paddingX}px`;
    viewportInner.style.paddingTop = `${paddingY}px`;
    viewportInner.style.paddingRight = `${paddingX}px`;
    viewportInner.style.paddingBottom = `${paddingY}px`;
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
    
    // Restaurar cada PiP con su configuración guardada
    for (const savedState of states) {
      const { panelId, x, y, width, height, scale, zIndex } = savedState;
      
      // Verificar que el panel existe
      const panelEl = document.getElementById(panelId);
      if (!panelEl) {
        log.warn('Panel no encontrado para restaurar:', panelId);
        continue;
      }
      
      // Abrir el PiP
      openPip(panelId);
      
      // Aplicar configuración guardada
      const state = activePips.get(panelId);
      if (state) {
        // Ajustar posición (asegurar que esté dentro de la ventana)
        const maxX = window.innerWidth - width;
        const maxY = window.innerHeight - 40;
        const maxW = window.innerWidth - Math.max(0, x);
        const maxH = window.innerHeight - Math.max(0, y);
        state.x = Math.max(0, Math.min(maxX, x));
        state.y = Math.max(0, Math.min(maxY, y));
        state.width = Math.max(MIN_PIP_SIZE, Math.min(maxW, width));
        state.height = Math.max(MIN_PIP_SIZE, Math.min(maxH, height));
        
        // Usar límite dinámico después de establecer dimensiones
        const minScale = getMinScale(panelId);
        state.scale = Math.max(minScale, Math.min(MAX_SCALE, scale));
        
        // Aplicar al DOM
        state.pipContainer.style.left = `${state.x}px`;
        state.pipContainer.style.top = `${state.y}px`;
        state.pipContainer.style.width = `${state.width}px`;
        state.pipContainer.style.height = `${state.height}px`;
        state.pipContainer.style.zIndex = zIndex || PIP_Z_INDEX_BASE;
        
        // Restaurar estado de bloqueo
        if (savedState.locked) {
          state.locked = true;
          state.pipContainer.classList.add('pip-container--locked');
        }
        state.isMaximized = savedState.isMaximized || false;
        if (savedState.defaultWidth) state.defaultWidth = savedState.defaultWidth;
        if (savedState.defaultHeight) state.defaultHeight = savedState.defaultHeight;
        
        // No persistir durante restauración (evitar loop)
        updatePipScale(panelId, state.scale, false);
        
        // Restaurar posición del scroll interno
        if (savedState.scrollX !== undefined || savedState.scrollY !== undefined) {
          const viewport = state.pipContainer.querySelector('.pip-viewport');
          if (viewport) {
            // Usar setTimeout para asegurar que el layout esté calculado
            setTimeout(() => {
              viewport.scrollLeft = savedState.scrollX || 0;
              viewport.scrollTop = savedState.scrollY || 0;
            }, 50);
          }
        }
      }
    }
  } catch (e) {
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
