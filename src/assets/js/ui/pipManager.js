// Gestor de paneles Picture-in-Picture (PiP)
// Permite extraer paneles del viewport principal para verlos de forma flotante

import { createLogger } from '../utils/logger.js';
import { t, onLocaleChange } from '../i18n/index.js';

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

/** Panel actualmente siendo redimensionado */
let resizingPip = null;
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

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
  
  log.info('PipManager inicializado');
}

/**
 * Añade el botón de detach a un panel.
 * @param {HTMLElement} panelEl - Elemento del panel
 */
export function addDetachButton(panelEl) {
  if (!panelEl || panelEl.querySelector('.pip-detach-btn')) return;
  
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pip-detach-btn';
  btn.setAttribute('aria-label', t('pip.detach', 'Extraer panel'));
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <path d="M9 3v18"/>
      <path d="M14 9l3 3-3 3"/>
    </svg>
  `;
  
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePip(panelEl.id);
  });
  
  // Tooltip en hover
  btn.addEventListener('mouseenter', () => {
    const isPipped = activePips.has(panelEl.id);
    btn.setAttribute('aria-label', isPipped ? t('pip.attach', 'Devolver panel') : t('pip.detach', 'Extraer panel'));
  });
  
  panelEl.appendChild(btn);
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
 * Extrae un panel a modo PiP.
 * @param {string} panelId - ID del panel
 */
export function openPip(panelId) {
  const panelEl = document.getElementById(panelId);
  if (!panelEl || activePips.has(panelId)) return;
  
  const originalParent = panelEl.parentElement;
  const siblings = Array.from(originalParent.children);
  const originalIndex = siblings.indexOf(panelEl);
  
  // Crear contenedor PiP
  const pipContainer = document.createElement('div');
  pipContainer.className = 'pip-container';
  pipContainer.dataset.panelId = panelId;
  pipContainer.style.zIndex = PIP_Z_INDEX_BASE + activePips.size;
  
  // Posición inicial: esquina superior derecha con offset según cantidad de PIPs
  const offsetMultiplier = activePips.size;
  const initialX = window.innerWidth - DEFAULT_PIP_WIDTH - 20 - (offsetMultiplier * 30);
  const initialY = 20 + (offsetMultiplier * 30);
  
  pipContainer.style.left = `${Math.max(20, initialX)}px`;
  pipContainer.style.top = `${initialY}px`;
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
  
  // Viewport interno para el panel
  const viewport = document.createElement('div');
  viewport.className = 'pip-viewport';
  
  // Mover el panel al PiP
  viewport.appendChild(panelEl);
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
    x: parseInt(pipContainer.style.left),
    y: parseInt(pipContainer.style.top),
    width: DEFAULT_PIP_WIDTH,
    height: DEFAULT_PIP_HEIGHT,
    scale: 0.4 // El panel de 760px se escala para caber
  };
  
  activePips.set(panelId, state);
  
  // Aplicar escala inicial
  updatePipScale(panelId, state.scale);
  
  // Event listeners del PiP
  setupPipEvents(pipContainer, panelId);
  
  // Actualizar icono del botón detach
  const detachBtn = panelEl.querySelector('.pip-detach-btn');
  if (detachBtn) {
    detachBtn.classList.add('pip-detach-btn--active');
  }
  
  // Marcar panel como pipped para CSS
  panelEl.classList.add('panel--pipped');
  
  log.info(`Panel ${panelId} extraído a PiP`);
  
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
  
  // Devolver panel a su posición original
  const { originalParent, originalIndex, pipContainer } = state;
  const siblings = Array.from(originalParent.children);
  
  if (originalIndex >= siblings.length) {
    originalParent.appendChild(panelEl);
  } else {
    originalParent.insertBefore(panelEl, siblings[originalIndex]);
  }
  
  // Eliminar contenedor PiP
  pipContainer.remove();
  
  // Actualizar icono del botón detach
  const detachBtn = panelEl.querySelector('.pip-detach-btn');
  if (detachBtn) {
    detachBtn.classList.remove('pip-detach-btn--active');
  }
  
  activePips.delete(panelId);
  
  log.info(`Panel ${panelId} devuelto a viewport`);
  
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
    draggingPip = panelId;
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
  
  // Click para traer al frente
  pipContainer.addEventListener('pointerdown', () => {
    bringToFront(panelId);
  });
  
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
 */
function handlePointerUp() {
  if (draggingPip) {
    const state = activePips.get(draggingPip);
    if (state) {
      state.pipContainer.classList.remove('pip-container--dragging');
    }
    draggingPip = null;
  }
  
  if (resizingPip) {
    const state = activePips.get(resizingPip);
    if (state) {
      state.pipContainer.classList.remove('pip-container--resizing');
    }
    resizingPip = null;
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
 */
function updatePipScale(panelId, newScale) {
  const state = activePips.get(panelId);
  if (!state) return;
  
  state.scale = newScale;
  const panelEl = document.getElementById(panelId);
  if (panelEl) {
    panelEl.style.transform = `scale(${newScale})`;
    panelEl.style.transformOrigin = '0 0';
  }
}

/**
 * Obtiene un título legible para el panel.
 * @param {string} panelId - ID del panel
 * @returns {string} Título
 */
function getPanelTitle(panelId) {
  const titles = {
    'panel-1': t('panel.oscillators1', 'Osciladores 1-3'),
    'panel-2': t('panel.oscilloscope', 'Osciloscopio'),
    'panel-3': t('panel.oscillators2', 'Osciladores 4-6'),
    'panel-4': t('panel.oscillators3', 'Osciladores 7-9'),
    'panel-5': t('panel.audioMatrix', 'Matriz Audio'),
    'panel-6': t('panel.controlMatrix', 'Matriz Control'),
    'panel-7': t('panel.output', 'Salida'),
    'panel-output': t('panel.output', 'Salida')
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
