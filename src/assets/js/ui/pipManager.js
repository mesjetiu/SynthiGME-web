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

/** Dimensiones por defecto del PiP */
const DEFAULT_PIP_WIDTH = 320;
const DEFAULT_PIP_HEIGHT = 320;
const MIN_PIP_SIZE = 200;
const MAX_PIP_SIZE = 800;

/** Panel actualmente siendo arrastrado */
let draggingPip = null;
let dragOffset = { x: 0, y: 0 };
let dragPointerId = null;

/** Panel actualmente siendo redimensionado */
let resizingPip = null;
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
let resizePointerId = null;

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
 */
function setupPanelContextMenus() {
  const panels = document.querySelectorAll('.panel');
  log.info(`Configurando menú contextual en ${panels.length} paneles`);
  
  panels.forEach(panelEl => {
    panelEl.addEventListener('contextmenu', (e) => {
      // Solo mostrar si el panel no está ya en PiP
      if (activePips.has(panelEl.id)) return;
      
      e.preventDefault();
      showPanelContextMenu(panelEl.id, e.clientX, e.clientY);
    });
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
  
  // Opción: Devolver todos (solo si hay PiPs abiertos)
  if (activePips.size > 0) {
    const attachAllItem = document.createElement('button');
    attachAllItem.className = 'pip-context-menu__item';
    attachAllItem.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <path d="M9 9v12"/>
      </svg>
      <span>${t('pip.attachAll', 'Devolver todos')}</span>
    `;
    attachAllItem.addEventListener('click', () => {
      hideContextMenu();
      closeAllPips();
    });
    menu.appendChild(attachAllItem);
  }
  
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
function getInitialPipPosition(panelId) {
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
  const x = marginLeft + (pos.col * cellWidth) + (cellWidth - DEFAULT_PIP_WIDTH) / 2;
  const y = marginTop + (pos.row * cellHeight) + (cellHeight - DEFAULT_PIP_HEIGHT) / 2;
  
  return {
    x: Math.max(marginLeft, Math.min(x, window.innerWidth - DEFAULT_PIP_WIDTH - marginRight)),
    y: Math.max(marginTop, Math.min(y, window.innerHeight - DEFAULT_PIP_HEIGHT - marginBottom))
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
  
  // Posición inicial basada en la posición del panel en el grid del Synthi
  const initialPos = getInitialPipPosition(panelId);
  
  pipContainer.style.left = `${initialPos.x}px`;
  pipContainer.style.top = `${initialPos.y}px`;
  pipContainer.style.width = `${DEFAULT_PIP_WIDTH}px`;
  pipContainer.style.height = `${DEFAULT_PIP_HEIGHT}px`;
  
  // Barra de título
  const header = document.createElement('div');
  header.className = 'pip-header';
  header.innerHTML = `
    <span class="pip-title">${getPanelTitle(panelId)}</span>
    <div class="pip-controls">
      <button type="button" class="pip-zoom-out" aria-label="${t('pip.zoomOut', 'Alejar')}">−</button>
      <button type="button" class="pip-zoom-in" aria-label="${t('pip.zoomIn', 'Acercar')}">+</button>
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
    width: DEFAULT_PIP_WIDTH,
    height: DEFAULT_PIP_HEIGHT,
    scale: 0.4 // El panel de 760px se escala para caber
  };
  
  activePips.set(panelId, state);
  
  // Aplicar escala inicial
  updatePipScale(panelId, state.scale);
  
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
  const zoomInBtn = pipContainer.querySelector('.pip-zoom-in');
  const zoomOutBtn = pipContainer.querySelector('.pip-zoom-out');
  const resizeHandle = pipContainer.querySelector('.pip-resize-handle');
  
  // Cerrar
  closeBtn.addEventListener('click', () => closePip(panelId));
  
  // Zoom
  zoomInBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (state) {
      updatePipScale(panelId, Math.min(state.scale + 0.1, 1.5));
    }
  });
  
  zoomOutBtn.addEventListener('click', () => {
    const state = activePips.get(panelId);
    if (state) {
      updatePipScale(panelId, Math.max(state.scale - 0.1, 0.2));
    }
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
    e.preventDefault();
    e.stopPropagation();
    resizingPip = panelId;
    resizePointerId = e.pointerId;
    resizeHandle.setPointerCapture(e.pointerId);
    const state = activePips.get(panelId);
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: state.width,
      h: state.height
    };
    pipContainer.classList.add('pip-container--resizing');
    bringToFront(panelId);
  });
  
  // Click para traer al frente + bloquear propagación al viewport subyacente
  pipContainer.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    bringToFront(panelId);
  });
  
  // Bloquear doble tap/click para que no haga zoom en el panel de debajo
  pipContainer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  // Bloquear touchend doble tap
  let lastTapTime = 0;
  pipContainer.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      e.preventDefault();
      e.stopPropagation();
    }
    lastTapTime = now;
  }, { passive: false });
  
  // Scroll con rueda para zoom
  pipContainer.querySelector('.pip-content').addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const state = activePips.get(panelId);
      if (state) {
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        updatePipScale(panelId, Math.max(0.2, Math.min(1.5, state.scale + delta)));
      }
    }
  }, { passive: false });
  
  // Guardar estado cuando el usuario hace scroll dentro del viewport
  const viewport = pipContainer.querySelector('.pip-viewport');
  if (viewport) {
    let scrollSaveTimeout = null;
    viewport.addEventListener('scroll', () => {
      // Debounce para no guardar en cada pixel de scroll
      if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
      scrollSaveTimeout = setTimeout(() => {
        savePipState();
      }, 300);
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
    
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_PIP_SIZE, Math.min(MAX_PIP_SIZE, resizeStart.w + dx));
    const newH = Math.max(MIN_PIP_SIZE, Math.min(MAX_PIP_SIZE, resizeStart.h + dy));
    
    state.width = newW;
    state.height = newH;
    state.pipContainer.style.width = `${newW}px`;
    state.pipContainer.style.height = `${newH}px`;
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
 * Trae un PiP al frente (mayor z-index).
 * @param {string} panelId - ID del panel
 */
function bringToFront(panelId) {
  const maxZ = Math.max(PIP_Z_INDEX_BASE, ...Array.from(activePips.values()).map(s => parseInt(s.pipContainer.style.zIndex) || PIP_Z_INDEX_BASE));
  const state = activePips.get(panelId);
  if (state) {
    state.pipContainer.style.zIndex = maxZ + 1;
  }
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
  
  // Aplicar escala al panel
  panelEl.style.transform = `scale(${newScale})`;
  panelEl.style.transformOrigin = '0 0';
  
  // Actualizar tamaño del contenedor interno para que el scroll funcione
  // El contenedor interno debe tener el tamaño escalado del panel
  const viewportInner = state.pipContainer.querySelector('.pip-viewport-inner');
  if (viewportInner) {
    viewportInner.style.width = `${panelWidth * newScale}px`;
    viewportInner.style.height = `${panelHeight * newScale}px`;
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
      zIndex: parseInt(state.pipContainer.style.zIndex) || PIP_Z_INDEX_BASE
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
        state.x = Math.max(0, Math.min(maxX, x));
        state.y = Math.max(0, Math.min(maxY, y));
        state.width = Math.max(MIN_PIP_SIZE, Math.min(MAX_PIP_SIZE, width));
        state.height = Math.max(MIN_PIP_SIZE, Math.min(MAX_PIP_SIZE, height));
        state.scale = Math.max(0.2, Math.min(1.5, scale));
        
        // Aplicar al DOM
        state.pipContainer.style.left = `${state.x}px`;
        state.pipContainer.style.top = `${state.y}px`;
        state.pipContainer.style.width = `${state.width}px`;
        state.pipContainer.style.height = `${state.height}px`;
        state.pipContainer.style.zIndex = zIndex || PIP_Z_INDEX_BASE;
        
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
