/**
 * @module keyboardWindow
 * @description Ventana flotante PiP (Picture-in-Picture) para los teclados del Synthi 100.
 *
 * Muestra los dos teclados de 5 octavas (C2–C7) en una ventana sin marco,
 * arrastrable desde la madera/cuero (no desde las teclas), redimensionable
 * con aspect-ratio fijo, y con menú contextual para cerrar.
 *
 * Las teclas responden visualmente a pulsación (mousedown/touchstart).
 * El estado abierto/cerrado y la posición se persisten en localStorage
 * y en patches (campo `keyboardVisible`).
 *
 * @fires synth:keyboardToggle  – cuando se abre/cierra el teclado
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { t } from '../i18n/index.js';

// ─── Constantes ─────────────────────────────────────────────────────────────

/** Aspect ratio del SVG (viewBox 968 × 338) */
const ASPECT_RATIO = 968 / 338;

/** Tamaño por defecto (px) */
const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = Math.round(DEFAULT_WIDTH / ASPECT_RATIO);

/** Tamaño mínimo (px) */
const MIN_WIDTH = 300;
const MIN_HEIGHT = Math.round(MIN_WIDTH / ASPECT_RATIO);

/** Z-index base (por encima de PiP panels = 1200, debajo de quickbar = 1500) */
const Z_INDEX = 1350;

/** Selectores de regiones arrastrables (IDs de grupos SVG del housing) */
const DRAG_SELECTORS = [
  '#rail-left', '#rail-right',
  '#leather-strip',
  '#cheeks-and-step',
  '#front-panel',
  '#step-top', '#step-shadow'
];

/** Selectores de teclas (para feedback visual, NO arrastrables) */
const KEY_SELECTOR = '.white-key, .black-key';

// ─── Estado del módulo ──────────────────────────────────────────────────────

/** @type {HTMLDivElement|null} */
let container = null;

/** @type {boolean} */
let isOpen = false;

/** Posición y tamaño actuales */
let state = {
  x: 100,
  y: 100,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT
};

/** Flag para evitar saves durante restore */
let _isRestoring = false;

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de teclado flotante.
 * Crea el contenedor (oculto) y restaura el estado guardado.
 */
export function initKeyboardWindow() {
  _createContainer();
  _restoreState();
}

/**
 * Abre el teclado flotante.
 */
export function openKeyboard() {
  if (isOpen) return;
  isOpen = true;
  container.style.display = '';
  _applyPosition();
  _saveState();
  _dispatchToggle();
}

/**
 * Cierra el teclado flotante.
 */
export function closeKeyboard() {
  if (!isOpen) return;
  isOpen = false;
  container.style.display = 'none';
  _saveState();
  _dispatchToggle();
}

/**
 * Alterna la visibilidad del teclado flotante.
 */
export function toggleKeyboard() {
  if (isOpen) closeKeyboard();
  else openKeyboard();
}

/**
 * Devuelve si el teclado está abierto.
 * @returns {boolean}
 */
export function isKeyboardOpen() {
  return isOpen;
}

/**
 * Serializa el estado del teclado para inclusión en patches.
 * @returns {{ visible: boolean, x: number, y: number, width: number, height: number }}
 */
export function serializeKeyboardState() {
  return {
    visible: isOpen,
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height
  };
}

/**
 * Restaura el estado del teclado desde un patch.
 * @param {{ visible?: boolean, x?: number, y?: number, width?: number, height?: number }} data
 */
export function restoreKeyboardState(data) {
  if (!data) return;
  _isRestoring = true;

  if (typeof data.x === 'number') state.x = data.x;
  if (typeof data.y === 'number') state.y = data.y;
  if (typeof data.width === 'number') {
    state.width = Math.max(MIN_WIDTH, data.width);
    state.height = Math.round(state.width / ASPECT_RATIO);
  }
  _applyPosition();

  if (data.visible) openKeyboard();
  else closeKeyboard();

  _isRestoring = false;
}

// ─── Creación del DOM ───────────────────────────────────────────────────────

function _createContainer() {
  container = document.createElement('div');
  container.id = 'keyboardWindow';
  container.className = 'keyboard-window';
  container.style.display = 'none';
  container.style.zIndex = Z_INDEX;

  // Cargar el SVG inline a través de fetch
  fetch('./assets/panels/keyboards.svg')
    .then(r => r.text())
    .then(svgText => {
      container.innerHTML = svgText;
      const svg = container.querySelector('svg');
      if (svg) {
        // Eliminar dimensiones fijas en mm y dejar que CSS controle
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
      }
      _setupDrag();
      _setupKeyFeedback();
      _setupContextMenu();
      _setupResize();
    })
    .catch(err => console.warn('[KeyboardWindow] Failed to load keyboards.svg:', err));

  document.body.appendChild(container);
}

// ─── Drag (solo desde housing, no teclas) ───────────────────────────────────

function _setupDrag() {
  const svg = container.querySelector('svg');
  if (!svg) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  /**
   * Comprueba si el target del evento está dentro de una zona arrastrable.
   * @param {Element} target
   * @returns {boolean}
   */
  function isDragRegion(target) {
    // Si es una tecla, no arrastrar
    if (target.closest(KEY_SELECTOR)) return false;
    // Si es una zona de housing, arrastrar
    for (const sel of DRAG_SELECTORS) {
      if (target.closest(sel)) return true;
    }
    return false;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;               // solo botón primario (left-click)
    if (!isDragRegion(e.target)) return;
    dragging = true;
    offsetX = e.clientX - state.x;
    offsetY = e.clientY - state.y;
    container.classList.add('keyboard-window--dragging');
    container.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    state.x = _clamp(e.clientX - offsetX, 0, window.innerWidth - state.width);
    state.y = _clamp(e.clientY - offsetY, 0, window.innerHeight - state.height);
    _applyPosition();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    container.classList.remove('keyboard-window--dragging');
    container.releasePointerCapture(e.pointerId);
    _saveState();
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
}

// ─── Feedback visual de teclas ──────────────────────────────────────────────

function _setupKeyFeedback() {
  const svg = container.querySelector('svg');
  if (!svg) return;

  /** @type {Map<number, Element>} pointerId → tecla actualmente pulsada */
  const activePointers = new Map();

  function pressKey(key) {
    key.classList.add('key-pressed');
  }

  function releaseKey(key) {
    key.classList.remove('key-pressed');
  }

  svg.addEventListener('pointerdown', (e) => {
    const key = e.target.closest(KEY_SELECTOR);
    if (!key) return;
    if (e.button !== 0) return;                 // solo botón primario
    e.preventDefault();
    activePointers.set(e.pointerId, key);
    pressKey(key);
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    const prevKey = activePointers.get(e.pointerId);
    if (!prevKey) return;
    // Detectar si se ha movido a otra tecla
    const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
    const newKey = elemUnder?.closest(KEY_SELECTOR);
    if (newKey !== prevKey) {
      releaseKey(prevKey);
      if (newKey) {
        pressKey(newKey);
        activePointers.set(e.pointerId, newKey);
      } else {
        activePointers.delete(e.pointerId);
      }
    }
  });

  svg.addEventListener('pointerup', (e) => {
    const key = activePointers.get(e.pointerId);
    if (key) {
      releaseKey(key);
      activePointers.delete(e.pointerId);
    }
    svg.releasePointerCapture(e.pointerId);
  });

  svg.addEventListener('pointercancel', (e) => {
    const key = activePointers.get(e.pointerId);
    if (key) {
      releaseKey(key);
      activePointers.delete(e.pointerId);
    }
  });

  // Evitar selección de texto al arrastrar sobre teclas
  svg.addEventListener('selectstart', e => e.preventDefault());
}

// ─── Menú contextual ────────────────────────────────────────────────────────

function _setupContextMenu() {
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    _showContextMenu(e.clientX, e.clientY);
  });
}

/** @type {HTMLDivElement|null} */
let contextMenu = null;

function _showContextMenu(x, y) {
  _hideContextMenu();

  contextMenu = document.createElement('div');
  contextMenu.className = 'keyboard-context-menu';

  const closeItem = document.createElement('div');
  closeItem.className = 'keyboard-context-menu__item';
  closeItem.textContent = t('keyboard.close', 'Cerrar teclado');
  closeItem.addEventListener('click', () => {
    _hideContextMenu();
    closeKeyboard();
  });
  contextMenu.appendChild(closeItem);

  // Posicionar
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  document.body.appendChild(contextMenu);

  // Cerrar al hacer click fuera
  const onClickOut = (e) => {
    if (!contextMenu?.contains(e.target)) {
      _hideContextMenu();
      document.removeEventListener('pointerdown', onClickOut, true);
    }
  };
  // Usar setTimeout para evitar que el mismo click cierre el menú
  setTimeout(() => document.addEventListener('pointerdown', onClickOut, true), 0);
}

function _hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

// ─── Resize con aspect ratio fijo ───────────────────────────────────────────

function _setupResize() {
  // Crear handles de resize en las 4 esquinas y 4 lados
  const handles = [
    { cls: 'nw', cursor: 'nwse-resize' },
    { cls: 'ne', cursor: 'nesw-resize' },
    { cls: 'sw', cursor: 'nesw-resize' },
    { cls: 'se', cursor: 'nwse-resize' },
    { cls: 'n',  cursor: 'ns-resize' },
    { cls: 's',  cursor: 'ns-resize' },
    { cls: 'e',  cursor: 'ew-resize' },
    { cls: 'w',  cursor: 'ew-resize' }
  ];

  for (const h of handles) {
    const handle = document.createElement('div');
    handle.className = `keyboard-resize-handle keyboard-resize-handle--${h.cls}`;
    handle.style.cursor = h.cursor;

    let startX, startY, startW, startH, startLeft, startTop;

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = state.width;
      startH = state.height;
      startLeft = state.x;
      startTop = state.y;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newW = startW;
        let newH = startH;
        let newX = startLeft;
        let newY = startTop;

        // Calcular nuevo tamaño según el handle
        if (h.cls.includes('e')) newW = startW + dx;
        if (h.cls.includes('w')) { newW = startW - dx; newX = startLeft + dx; }
        if (h.cls.includes('s')) newH = startH + dy;
        if (h.cls.includes('n')) { newH = startH - dy; newY = startTop + dy; }

        // Mantener aspect ratio: usar la dimensión dominante
        if (h.cls === 'n' || h.cls === 's') {
          newW = Math.round(newH * ASPECT_RATIO);
        } else {
          newH = Math.round(newW / ASPECT_RATIO);
        }

        // Aplicar mínimos
        if (newW < MIN_WIDTH) {
          newW = MIN_WIDTH;
          newH = MIN_HEIGHT;
        }

        // Ajustar posición para handles que mueven el origen
        if (h.cls.includes('w')) newX = startLeft + (startW - newW);
        if (h.cls.includes('n')) newY = startTop + (startH - newH);

        state.width = newW;
        state.height = newH;
        state.x = _clamp(newX, 0, window.innerWidth - newW);
        state.y = _clamp(newY, 0, window.innerHeight - newH);
        _applyPosition();
      };

      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        _saveState();
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });

    container.appendChild(handle);
  }
}

// ─── Utilidades internas ────────────────────────────────────────────────────

function _applyPosition() {
  if (!container) return;
  container.style.left = `${state.x}px`;
  container.style.top = `${state.y}px`;
  container.style.width = `${state.width}px`;
  container.style.height = `${state.height}px`;
}

function _clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function _saveState() {
  if (_isRestoring) return;
  try {
    localStorage.setItem(STORAGE_KEYS.KEYBOARD_STATE, JSON.stringify({
      visible: isOpen,
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height
    }));
  } catch { /* quota exceeded — ignore */ }
}

function _restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.KEYBOARD_STATE);
    if (!raw) return;
    const data = JSON.parse(raw);
    _isRestoring = true;
    restoreKeyboardState(data);
    _isRestoring = false;
  } catch { /* corrupted — ignore */ }
}

function _dispatchToggle() {
  document.dispatchEvent(new CustomEvent('synth:keyboardToggle', {
    detail: { visible: isOpen }
  }));
}
