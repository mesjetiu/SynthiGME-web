/**
 * PanelNotes - Notas estilo post-it arrastrables sobre paneles.
 *
 * Permite al usuario crear notas de texto posicionadas libremente dentro
 * de cada panel del sintetizador, o en el viewport (espacio libre fuera
 * de los paneles). Las notas NO se mueven entre paneles ni entre panel
 * y viewport: cada nota pertenece permanentemente a su contenedor.
 *
 * - Notas de panel: coordenadas en % relativo al panel (sobreviven a
 *   zoom, paneo y PiP). Pueden sobresalir visualmente del panel.
 * - Notas de viewport: coordenadas en px absolutos en viewportInner.
 *
 * Características:
 * - Texto editable con soporte para negrita/cursiva (contentEditable + innerHTML)
 * - Menú contextual propio: texto (cortar/copiar/pegar/negrita/cursiva)
 *   y nota (copiar nota/cortar nota/eliminar)
 * - Atajos de teclado: Ctrl+B (negrita), Ctrl+I (cursiva), Ctrl+C/X/V
 * - Botones +/- para cambiar tamaño de fuente
 * - Copiar/cortar/pegar notas entre paneles
 * - Eventos NO se propagan al panel (evita menú contextual del panel)
 *
 * Persistencia:
 * - Se guardan en localStorage (STORAGE_KEYS.PANEL_NOTES)
 * - Se incluyen en patches si la opción visual está activa
 * - Se restauran con la configuración visual
 *
 * @module ui/panelNotes
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('PanelNotes');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Colores de post-it disponibles */
const NOTE_COLORS = [
  { id: 'yellow',  bg: '#fef3b5', border: '#e6d570', text: '#5a4e00' },
  { id: 'pink',    bg: '#ffd6e0', border: '#e8a0b4', text: '#6b1a30' },
  { id: 'blue',    bg: '#d0e8ff', border: '#8cb8e6', text: '#1a3a5c' },
  { id: 'green',   bg: '#d4f5d4', border: '#8dce8d', text: '#1a4d1a' },
  { id: 'orange',  bg: '#ffe4c4', border: '#e6b87a', text: '#5a3600' },
  { id: 'purple',  bg: '#e8d5f5', border: '#b89cd4', text: '#3d1a5c' },
];

/** Color por defecto */
const DEFAULT_COLOR = 'yellow';

/** Tamaño por defecto de notas (en % del panel) */
const DEFAULT_WIDTH_PCT = 20;
const DEFAULT_HEIGHT_PCT = 15;

/** Tamaño de fuente por defecto y rango (px) */
const DEFAULT_FONT_SIZE = 11;
const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 1;

/** Intervalos para auto-repeat al mantener presionado A+/A- (ms) */
const FONT_REPEAT_DELAY = 400;
const FONT_REPEAT_INTERVAL = 80;

/** Tamaño mínimo en px para que la nota sea usable */
const MIN_SIZE_PX = 60;

/** ID especial para notas de viewport (no pertenecen a ningún panel) */
export const VIEWPORT_PANEL_ID = '__viewport__';

/** Z-index base de notas (por encima de controles del panel, por debajo de modales) */
const NOTE_Z_INDEX = 50;

/** Contador global para IDs únicos */
let noteIdCounter = 0;

/** Mapa global: panelId → Set<NoteElement> */
const panelNotesMap = new Map();

/** Flag para suprimir guardado durante restauración */
let _isRestoring = false;

/** Clipboard interno para copiar/cortar notas */
let _noteClipboard = null;

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de notas para todos los paneles existentes.
 * Debe llamarse después de que los paneles estén en el DOM.
 */
export function initPanelNotes() {
  const panels = document.querySelectorAll('.panel');
  panels.forEach(panel => {
    if (!panelNotesMap.has(panel.id)) {
      panelNotesMap.set(panel.id, new Set());
    }
  });
  
  // Inicializar set para notas del viewport (no pertenecen a ningún panel)
  if (!panelNotesMap.has(VIEWPORT_PANEL_ID)) {
    panelNotesMap.set(VIEWPORT_PANEL_ID, new Set());
  }
  
  // Configurar menú contextual en viewportInner (espacio vacío entre paneles)
  setupViewportContextMenu();
  
  // Restaurar notas guardadas
  restoreNotes();
  
  log.info('PanelNotes inicializado');
}

// ─────────────────────────────────────────────────────────────────────────────
// MENÚ CONTEXTUAL DE VIEWPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configura el menú contextual en el espacio vacío del viewport (viewportInner)
 * para permitir crear notas fuera de los paneles.
 */
function setupViewportContextMenu() {
  const vi = document.getElementById('viewportInner');
  if (!vi) return;
  
  vi.addEventListener('contextmenu', (e) => {
    // Solo si el clic fue directamente en viewportInner (no en un hijo como panel o nota)
    if (e.target !== vi) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Calcular posición en px dentro de viewportInner (con corrección de zoom)
    const viRect = vi.getBoundingClientRect();
    const scale = vi.offsetWidth > 0 ? viRect.width / vi.offsetWidth : 1;
    const xPx = (e.clientX - viRect.left) / scale;
    const yPx = (e.clientY - viRect.top) / scale;
    
    showViewportContextMenu(e.clientX, e.clientY, xPx, yPx);
  });
}

/**
 * Muestra un menú contextual para el viewport con opciones de notas.
 * @param {number} screenX - Posición X en pantalla (para posicionar el menú)
 * @param {number} screenY - Posición Y en pantalla (para posicionar el menú)
 * @param {number} xPx - Posición X en px dentro de viewportInner
 * @param {number} yPx - Posición Y en px dentro de viewportInner
 */
function showViewportContextMenu(screenX, screenY, xPx, yPx) {
  hideNoteContextMenu();
  
  const menu = document.createElement('div');
  menu.className = 'panel-note__context-menu';
  menu.setAttribute('data-prevent-pan', 'true');
  
  // Añadir nota
  menu.appendChild(createNoteMenuItem(t('notes.add'), () => {
    hideNoteContextMenu();
    createNote(VIEWPORT_PANEL_ID, { xPx, yPx });
  }));
  
  // Pegar nota (solo si hay nota en clipboard)
  if (hasNoteInClipboard()) {
    menu.appendChild(createNoteMenuSeparator());
    menu.appendChild(createNoteMenuItem(t('notes.ctx.pasteNote'), () => {
      hideNoteContextMenu();
      // Preservar tamaño original de la nota
      createNote(VIEWPORT_PANEL_ID, {
        xPx,
        yPx,
        wPx: _noteClipboard.wPx,
        hPx: _noteClipboard.hPx,
        html: _noteClipboard.html,
        color: _noteClipboard.color,
        fontSize: _noteClipboard.fontSize,
      });
    }));
  }
  
  document.body.appendChild(menu);
  _activeNoteCtxMenu = menu;
  
  positionContextMenu(menu, screenX, screenY);
  setupNoteCtxMenuClose(menu);
}

// ─────────────────────────────────────────────────────────────────────────────
// CREAR NOTAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una nota post-it en un panel.
 *
 * @param {string} panelId - ID del panel contenedor
 * @param {Object} [options] - Opciones de la nota
 * @param {number} [options.xPct] - Posición X en % del panel (0-100)
 * @param {number} [options.yPct] - Posición Y en % del panel (0-100)
 * @param {number} [options.wPct] - Ancho en % del panel
 * @param {number} [options.hPct] - Alto en % del panel
 * @param {string} [options.text] - Texto de la nota
 * @param {string} [options.color] - ID de color (yellow, pink, blue, green, orange, purple)
 * @param {string} [options.id] - ID existente (para restauración)
 * @returns {HTMLElement|null} Elemento de la nota creada
 */
export function createNote(panelId, options = {}) {
  const isViewport = panelId === VIEWPORT_PANEL_ID;
  const container = isViewport
    ? document.getElementById('viewportInner')
    : document.getElementById(panelId);
  if (!container) {
    log.warn('Container no encontrado:', panelId);
    return null;
  }
  
  const noteId = options.id || `note-${Date.now()}-${++noteIdCounter}`;
  const colorDef = NOTE_COLORS.find(c => c.id === (options.color || DEFAULT_COLOR)) || NOTE_COLORS[0];
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  
  // ── Crear DOM ──
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.id = noteId;
  note.dataset.noteColor = colorDef.id;
  note.dataset.panelId = panelId;
  note.dataset.fontSize = String(fontSize);
  note.setAttribute('data-prevent-pan', 'true');
  
  // Posición y tamaño
  if (isViewport) {
    // Notas de viewport usan px absolutos en viewportInner
    note.style.left = `${options.xPx ?? 100}px`;
    note.style.top = `${options.yPx ?? 100}px`;
    note.style.width = `${options.wPx ?? 200}px`;
    note.style.height = `${options.hPx ?? 100}px`;
  } else {
    // Notas de panel usan % relativos al panel
    const xPct = clamp(options.xPct ?? 50, 0, 95);
    const yPct = clamp(options.yPct ?? 50, 0, 95);
    const wPct = options.wPct ?? DEFAULT_WIDTH_PCT;
    const hPct = options.hPct ?? DEFAULT_HEIGHT_PCT;
    note.style.left = `${xPct}%`;
    note.style.top = `${yPct}%`;
    note.style.width = `${wPct}%`;
    note.style.height = `${hPct}%`;
  }
  note.style.fontSize = `${fontSize}px`;
  applyNoteColor(note, colorDef);
  
  // ── Bloquear propagación de eventos al panel (fase de burbujeo) ──
  // Usando bubbling (no capture) para que los handlers internos
  // (botones, drag, menús contextuales) se ejecuten primero.
  const stopEvents = ['contextmenu', 'pointerdown', 'pointerup', 'click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchend'];
  for (const evtName of stopEvents) {
    note.addEventListener(evtName, (e) => {
      e.stopPropagation();
    });
  }
  
  // ── Barra de título (drag handle + acciones) ──
  const header = document.createElement('div');
  header.className = 'panel-note__header';
  
  const dragHandle = document.createElement('div');
  dragHandle.className = 'panel-note__drag';
  dragHandle.innerHTML = '⋮⋮';
  header.appendChild(dragHandle);
  
  const actions = document.createElement('div');
  actions.className = 'panel-note__actions';
  
  // Botón reducir fuente (A-) — soporta press-and-hold para repetición
  const fontDownBtn = document.createElement('button');
  fontDownBtn.className = 'panel-note__btn panel-note__btn--font-down';
  fontDownBtn.innerHTML = 'A<small>−</small>';
  fontDownBtn.title = t('notes.fontDown');
  setupFontButton(fontDownBtn, note, -FONT_SIZE_STEP);
  actions.appendChild(fontDownBtn);
  
  // Botón aumentar fuente (A+) — soporta press-and-hold para repetición
  const fontUpBtn = document.createElement('button');
  fontUpBtn.className = 'panel-note__btn panel-note__btn--font-up';
  fontUpBtn.innerHTML = 'A<small>+</small>';
  fontUpBtn.title = t('notes.fontUp');
  setupFontButton(fontUpBtn, note, FONT_SIZE_STEP);
  actions.appendChild(fontUpBtn);
  
  // Botón de color
  const colorBtn = document.createElement('button');
  colorBtn.className = 'panel-note__btn panel-note__btn--color';
  colorBtn.innerHTML = '●';
  colorBtn.style.color = colorDef.border;
  colorBtn.title = t('notes.color');
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPicker(note, colorBtn);
  });
  actions.appendChild(colorBtn);
  
  // Botón de eliminar
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'panel-note__btn panel-note__btn--delete';
  deleteBtn.innerHTML = '×';
  deleteBtn.title = t('notes.delete');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeNote(noteId);
  });
  actions.appendChild(deleteBtn);
  
  header.appendChild(actions);
  note.appendChild(header);
  
  // ── Menú contextual propio del header/nota (copiar nota, cortar nota, eliminar) ──
  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showNoteContextMenu(note, e.clientX, e.clientY);
  });
  
  // ── Área de texto ──
  const body = document.createElement('div');
  body.className = 'panel-note__body';
  body.contentEditable = 'true';
  body.spellcheck = false;
  
  // Restaurar HTML (soporta negrita/cursiva)
  if (options.html) {
    body.innerHTML = sanitizeNoteHTML(options.html);
  } else if (options.text) {
    body.textContent = options.text;
  }
  
  // Placeholder
  if (!options.text && !options.html) {
    body.dataset.placeholder = t('notes.placeholder');
  }
  
  body.addEventListener('input', () => {
    if (body.textContent.trim()) {
      delete body.dataset.placeholder;
    } else {
      body.dataset.placeholder = t('notes.placeholder');
    }
    saveNotes();
  });
  
  // ── Atajos de teclado en el body ──
  body.addEventListener('keydown', (e) => {
    e.stopPropagation();
    
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    
    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        document.execCommand('bold', false, null);
        saveNotes();
        break;
      case 'i':
        e.preventDefault();
        document.execCommand('italic', false, null);
        saveNotes();
        break;
      // Ctrl+C/X/V los dejamos pasar al navegador (comportamiento nativo)
    }
  });
  
  // ── Menú contextual de texto ──
  body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTextContextMenu(note, body, e.clientX, e.clientY);
  });
  
  // ── Al perder el foco, deshacer selección visual ──
  body.addEventListener('blur', () => {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) {
      sel.removeAllRanges();
    }
  });
  
  note.appendChild(body);
  
  // ── Drag & Drop (ratón + touch) ──
  setupNoteDrag(note, header);
  
  // ── Insertar en el contenedor (panel o viewportInner) ──
  container.appendChild(note);
  
  // ── Observar resize del usuario (CSS resize: both) ──
  if (typeof ResizeObserver !== 'undefined') {
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      if (_isRestoring) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => saveNotes(), 400);
    });
    ro.observe(note);
  }
  
  // Registrar
  if (!panelNotesMap.has(panelId)) {
    panelNotesMap.set(panelId, new Set());
  }
  panelNotesMap.get(panelId).add(note);
  
  if (!_isRestoring) {
    saveNotes();
    // Dar foco al cuerpo para que el usuario escriba directamente
    body.focus();
  }
  
  log.debug('Nota creada:', noteId, 'en', panelId);
  return note;
}

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR NOTAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Elimina una nota por ID.
 * @param {string} noteId - ID del elemento de nota
 */
export function removeNote(noteId) {
  const note = document.getElementById(noteId);
  if (!note) return;
  
  const panelId = note.dataset.panelId;
  const set = panelNotesMap.get(panelId);
  if (set) set.delete(note);
  
  note.remove();
  saveNotes();
  
  log.debug('Nota eliminada:', noteId);
}

/**
 * Elimina todas las notas de un panel.
 * @param {string} panelId - ID del panel
 */
export function clearPanelNotes(panelId) {
  const set = panelNotesMap.get(panelId);
  if (!set) return;
  
  for (const note of set) {
    note.remove();
  }
  set.clear();
  saveNotes();
}

/**
 * Elimina todas las notas de todos los paneles.
 */
export function clearAllNotes() {
  for (const [, set] of panelNotesMap) {
    for (const note of set) {
      note.remove();
    }
    set.clear();
  }
  saveNotes();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAMAÑO DE FUENTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configura un botón de fuente con soporte para clic simple y press-and-hold.
 * Al mantener presionado, repite el cambio de tamaño con aceleración.
 * @param {HTMLElement} btn - Botón A+ o A-
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {number} delta - Incremento (+) o decremento (-) en px
 */
function setupFontButton(btn, noteEl, delta) {
  let repeatTimeout = null;
  let repeatInterval = null;
  
  function startRepeat() {
    stopRepeat();
    changeFontSize(noteEl, delta);
    repeatTimeout = setTimeout(() => {
      repeatInterval = setInterval(() => {
        changeFontSize(noteEl, delta);
      }, FONT_REPEAT_INTERVAL);
    }, FONT_REPEAT_DELAY);
  }
  
  function stopRepeat() {
    if (repeatTimeout) { clearTimeout(repeatTimeout); repeatTimeout = null; }
    if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
  }
  
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    startRepeat();
  });
  
  btn.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    stopRepeat();
  });
  
  btn.addEventListener('pointercancel', (e) => {
    stopRepeat();
  });
  
  btn.addEventListener('pointerleave', (e) => {
    stopRepeat();
  });
  
  // Prevenir click redundante (ya se maneja con pointerdown)
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

/**
 * Cambia el tamaño de fuente de una nota.
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {number} delta - Incremento (+) o decremento (-) en px
 */
function changeFontSize(noteEl, delta) {
  const current = parseInt(noteEl.dataset.fontSize, 10) || DEFAULT_FONT_SIZE;
  const next = clamp(current + delta, MIN_FONT_SIZE, MAX_FONT_SIZE);
  noteEl.dataset.fontSize = String(next);
  noteEl.style.fontSize = `${next}px`;
  saveNotes();
}

// ─────────────────────────────────────────────────────────────────────────────
// MENÚ CONTEXTUAL DE TEXTO (dentro del body de la nota)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muestra menú contextual para texto seleccionado dentro de una nota.
 * Opciones: Cortar, Copiar, Pegar, Negrita, Cursiva.
 *
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {HTMLElement} bodyEl - Elemento .panel-note__body
 * @param {number} x - clientX
 * @param {number} y - clientY
 */
function showTextContextMenu(noteEl, bodyEl, x, y) {
  hideNoteContextMenu();
  
  const menu = document.createElement('div');
  menu.className = 'panel-note__context-menu';
  menu.setAttribute('data-prevent-pan', 'true');
  
  const sel = window.getSelection();
  const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed;
  
  // Cortar
  const cutItem = createNoteMenuItem(t('notes.ctx.cut'), () => {
    document.execCommand('cut');
    hideNoteContextMenu();
    saveNotes();
  });
  cutItem.disabled = !hasSelection;
  menu.appendChild(cutItem);
  
  // Copiar
  const copyItem = createNoteMenuItem(t('notes.ctx.copy'), () => {
    document.execCommand('copy');
    hideNoteContextMenu();
  });
  copyItem.disabled = !hasSelection;
  menu.appendChild(copyItem);
  
  // Pegar
  menu.appendChild(createNoteMenuItem(t('notes.ctx.paste'), () => {
    document.execCommand('paste');
    hideNoteContextMenu();
    saveNotes();
  }));
  
  // Separador
  menu.appendChild(createNoteMenuSeparator());
  
  // Negrita
  menu.appendChild(createNoteMenuItem(t('notes.ctx.bold'), () => {
    document.execCommand('bold', false, null);
    hideNoteContextMenu();
    saveNotes();
  }));
  
  // Cursiva
  menu.appendChild(createNoteMenuItem(t('notes.ctx.italic'), () => {
    document.execCommand('italic', false, null);
    hideNoteContextMenu();
    saveNotes();
  }));
  
  // Separador (alineación)
  menu.appendChild(createNoteMenuSeparator());
  
  // Alinear izquierda
  menu.appendChild(createNoteMenuItem(t('notes.ctx.alignLeft'), () => {
    document.execCommand('justifyLeft', false, null);
    hideNoteContextMenu();
    saveNotes();
  }));
  
  // Centrar
  menu.appendChild(createNoteMenuItem(t('notes.ctx.alignCenter'), () => {
    document.execCommand('justifyCenter', false, null);
    hideNoteContextMenu();
    saveNotes();
  }));
  
  // Alinear derecha
  menu.appendChild(createNoteMenuItem(t('notes.ctx.alignRight'), () => {
    document.execCommand('justifyRight', false, null);
    hideNoteContextMenu();
    saveNotes();
  }));
  
  document.body.appendChild(menu);
  _activeNoteCtxMenu = menu;
  
  positionContextMenu(menu, x, y);
  setupNoteCtxMenuClose(menu);
}

// ─────────────────────────────────────────────────────────────────────────────
// MENÚ CONTEXTUAL DE NOTA (en el header / zona no-texto)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muestra menú contextual para la nota completa.
 * Opciones: Copiar nota, Cortar nota, Eliminar nota.
 *
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {number} x - clientX
 * @param {number} y - clientY
 */
function showNoteContextMenu(noteEl, x, y) {
  hideNoteContextMenu();
  
  const menu = document.createElement('div');
  menu.className = 'panel-note__context-menu';
  menu.setAttribute('data-prevent-pan', 'true');
  
  // Copiar nota
  menu.appendChild(createNoteMenuItem(t('notes.ctx.copyNote'), () => {
    copyNoteToClipboard(noteEl, false);
    hideNoteContextMenu();
  }));
  
  // Cortar nota
  menu.appendChild(createNoteMenuItem(t('notes.ctx.cutNote'), () => {
    copyNoteToClipboard(noteEl, true);
    hideNoteContextMenu();
  }));
  
  // Separador
  menu.appendChild(createNoteMenuSeparator());
  
  // Eliminar
  menu.appendChild(createNoteMenuItem(t('notes.delete'), () => {
    removeNote(noteEl.id);
    hideNoteContextMenu();
  }));
  
  document.body.appendChild(menu);
  _activeNoteCtxMenu = menu;
  
  positionContextMenu(menu, x, y);
  setupNoteCtxMenuClose(menu);
}

/** Menú contextual de nota activo */
let _activeNoteCtxMenu = null;

/** Oculta el menú contextual de nota activo */
function hideNoteContextMenu() {
  if (_activeNoteCtxMenu) {
    _activeNoteCtxMenu.remove();
    _activeNoteCtxMenu = null;
  }
}

/**
 * Posiciona un menú contextual ajustándolo a los bordes de la pantalla.
 */
function positionContextMenu(menu, x, y) {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  });
}

/**
 * Configura cierre automático del menú contextual de nota.
 */
function setupNoteCtxMenuClose(menu) {
  const close = (e) => {
    if (menu.contains(e.target)) return;
    hideNoteContextMenu();
    cleanup();
  };
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      hideNoteContextMenu();
      cleanup();
    }
  };
  const cleanup = () => {
    document.removeEventListener('pointerdown', close, true);
    document.removeEventListener('keydown', closeOnEscape);
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', closeOnEscape);
  }, 50);
}

/**
 * Crea un elemento de menú contextual de nota.
 */
function createNoteMenuItem(text, onClick) {
  const item = document.createElement('button');
  item.className = 'panel-note__ctx-item';
  item.textContent = text;
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return item;
}

/**
 * Crea un separador de menú contextual de nota.
 */
function createNoteMenuSeparator() {
  const sep = document.createElement('div');
  sep.className = 'panel-note__ctx-separator';
  return sep;
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAPAPELES DE NOTAS (copiar/cortar/pegar notas entre paneles)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copia (o corta) una nota al clipboard interno.
 * @param {HTMLElement} noteEl - Nota a copiar
 * @param {boolean} cut - Si es true, elimina la nota tras copiar
 */
function copyNoteToClipboard(noteEl, cut = false) {
  const body = noteEl.querySelector('.panel-note__body');
  const srcIsViewport = noteEl.dataset.panelId === VIEWPORT_PANEL_ID;
  const clipData = {
    html: body?.innerHTML || '',
    text: body?.textContent || '',
    color: noteEl.dataset.noteColor || DEFAULT_COLOR,
    fontSize: parseInt(noteEl.dataset.fontSize, 10) || DEFAULT_FONT_SIZE,
    srcIsViewport,
  };
  if (srcIsViewport) {
    // Viewport: dimensiones en px
    clipData.wPx = noteEl.offsetWidth > 0 ? noteEl.offsetWidth : (parseFloat(noteEl.style.width) || 200);
    clipData.hPx = noteEl.offsetHeight > 0 ? noteEl.offsetHeight : (parseFloat(noteEl.style.height) || 100);
  } else {
    // Panel: dimensiones en % — calcular desde computed si es posible
    const panelEl = document.getElementById(noteEl.dataset.panelId);
    const pw = panelEl?.offsetWidth || 0;
    const ph = panelEl?.offsetHeight || 0;
    const useComputed = pw > 0 && ph > 0 && noteEl.offsetWidth > 0;
    clipData.wPct = useComputed ? (noteEl.offsetWidth / pw) * 100 : (parseFloat(noteEl.style.width) || DEFAULT_WIDTH_PCT);
    clipData.hPct = useComputed ? (noteEl.offsetHeight / ph) * 100 : (parseFloat(noteEl.style.height) || DEFAULT_HEIGHT_PCT);
    // Guardar también px para paste cross-context (panel→viewport)
    clipData.wPx = noteEl.offsetWidth > 0 ? noteEl.offsetWidth : 200;
    clipData.hPx = noteEl.offsetHeight > 0 ? noteEl.offsetHeight : 100;
  }
  _noteClipboard = clipData;
  if (cut) {
    removeNote(noteEl.id);
  }
  log.debug('Nota', cut ? 'cortada' : 'copiada', 'al clipboard');
}

/**
 * Pega una nota del clipboard interno en un panel.
 * @param {string} panelId - ID del panel destino
 * @param {number} xPct - Posición X en %
 * @param {number} yPct - Posición Y en %
 * @returns {HTMLElement|null}
 */
export function pasteNoteFromClipboard(panelId, xPct, yPct) {
  if (!_noteClipboard) return null;
  const opts = {
    xPct,
    yPct,
    html: _noteClipboard.html,
    color: _noteClipboard.color,
    fontSize: _noteClipboard.fontSize,
  };
  if (_noteClipboard.wPct != null) {
    // Source was a panel note — use pct directly
    opts.wPct = _noteClipboard.wPct;
    opts.hPct = _noteClipboard.hPct;
  } else {
    // Source was a viewport note (px only) — convert to % of target panel
    const panelEl = document.getElementById(panelId);
    const pw = panelEl?.offsetWidth || 0;
    const ph = panelEl?.offsetHeight || 0;
    if (pw > 0 && ph > 0) {
      opts.wPct = (_noteClipboard.wPx / pw) * 100;
      opts.hPct = (_noteClipboard.hPx / ph) * 100;
    }
    // else: defaults from createNote
  }
  return createNote(panelId, opts);
}

/**
 * Comprueba si hay una nota en el clipboard interno.
 * @returns {boolean}
 */
export function hasNoteInClipboard() {
  return _noteClipboard !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE COLOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muestra el selector de color junto al botón.
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {HTMLElement} anchorEl - Botón de color
 */
function showColorPicker(noteEl, anchorEl) {
  // Cerrar picker previo si existe
  const existing = document.querySelector('.panel-note__color-picker');
  if (existing) existing.remove();
  
  const picker = document.createElement('div');
  picker.className = 'panel-note__color-picker';
  picker.setAttribute('data-prevent-pan', 'true');
  
  NOTE_COLORS.forEach(colorDef => {
    const swatch = document.createElement('button');
    swatch.className = 'panel-note__color-swatch';
    if (colorDef.id === noteEl.dataset.noteColor) {
      swatch.classList.add('is-active');
    }
    swatch.style.background = colorDef.bg;
    swatch.style.borderColor = colorDef.border;
    swatch.title = t(`notes.color.${colorDef.id}`);
    
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      applyNoteColor(noteEl, colorDef);
      noteEl.dataset.noteColor = colorDef.id;
      // Actualizar botón de color
      const btn = noteEl.querySelector('.panel-note__btn--color');
      if (btn) btn.style.color = colorDef.border;
      picker.remove();
      saveNotes();
    });
    
    picker.appendChild(swatch);
  });
  
  // Posicionar junto al botón (en body para evitar overflow:hidden)
  document.body.appendChild(picker);
  const btnRect = anchorEl.getBoundingClientRect();
  picker.style.left = `${btnRect.left}px`;
  picker.style.top = `${btnRect.bottom + 2}px`;
  
  // Ajustar si se sale de la pantalla
  requestAnimationFrame(() => {
    const rect = picker.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      picker.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      picker.style.top = `${btnRect.top - rect.height - 2}px`;
    }
  });
  
  // Cerrar al hacer click fuera
  const close = (e) => {
    if (!picker.contains(e.target) && e.target !== anchorEl) {
      picker.remove();
      document.removeEventListener('pointerdown', close, true);
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', close, true);
  }, 50);
}

/**
 * Aplica un color a una nota.
 * @param {HTMLElement} noteEl
 * @param {Object} colorDef
 */
function applyNoteColor(noteEl, colorDef) {
  noteEl.style.setProperty('--note-bg', colorDef.bg);
  noteEl.style.setProperty('--note-border', colorDef.border);
  noteEl.style.setProperty('--note-text', colorDef.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAG & DROP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configura arrastre de una nota (ratón + touch).
 * Las notas se mueven SOLO dentro de su contenedor:
 * - Notas de panel: arrastre en % relativo al panel (pueden sobresalir visualmente)
 * - Notas de viewport: arrastre en px dentro de viewportInner
 * No hay arrastre entre paneles ni entre panel y viewport.
 *
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {HTMLElement} handleEl - Elemento que actúa como drag handle
 */
function setupNoteDrag(noteEl, handleEl) {
  let isDragging = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeftPx = 0;
  let startTopPx = 0;
  let isViewportNote = false;
  
  function onPointerDown(e) {
    if (!e.target.closest('.panel-note__header')) return;
    if (e.target.closest('.panel-note__btn')) return;
    // Solo arrastrar con botón izquierdo; clic derecho → menú contextual
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDragging = true;
    pointerId = e.pointerId;
    handleEl.setPointerCapture(e.pointerId);
    
    startX = e.clientX;
    startY = e.clientY;
    
    isViewportNote = noteEl.dataset.panelId === VIEWPORT_PANEL_ID;
    
    if (isViewportNote) {
      // ── Nota de viewport: arrastrar en px ──
      startLeftPx = parseFloat(noteEl.style.left) || 0;
      startTopPx = parseFloat(noteEl.style.top) || 0;
    } else {
      // ── Nota de panel: arrastrar en-panel ──
      startLeftPx = noteEl.offsetLeft;
      startTopPx = noteEl.offsetTop;
    }
    
    noteEl.classList.add('panel-note--dragging');
  }
  
  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    if (isViewportNote) {
      // Arrastre en espacio viewportInner (px con corrección de zoom)
      const vi = document.getElementById('viewportInner');
      const viRect = vi?.getBoundingClientRect();
      const scale = (vi && vi.offsetWidth > 0) ? viRect.width / vi.offsetWidth : 1;
      noteEl.style.left = `${startLeftPx + dx / scale}px`;
      noteEl.style.top = `${startTopPx + dy / scale}px`;
    } else {
      // Arrastre en-panel (% relativo al panel padre)
      const parentEl = noteEl.closest('.panel') || noteEl.parentElement;
      const parentRect = parentEl.getBoundingClientRect();
      const scaleX = parentRect.width / parentEl.offsetWidth;
      const scaleY = parentRect.height / parentEl.offsetHeight;
      
      const newLeftPx = startLeftPx + dx / scaleX;
      const newTopPx = startTopPx + dy / scaleY;
      
      const xPct = (newLeftPx / parentEl.offsetWidth) * 100;
      const yPct = (newTopPx / parentEl.offsetHeight) * 100;
      
      // Clamp para que la barra de título siempre quede visible dentro del panel
      noteEl.style.left = `${clamp(xPct, -5, 95)}%`;
      noteEl.style.top = `${clamp(yPct, 0, 95)}%`;
    }
  }
  
  function onPointerUp(e) {
    if (!isDragging || e.pointerId !== pointerId) return;
    
    isDragging = false;
    pointerId = null;
    noteEl.classList.remove('panel-note--dragging');
    
    try {
      handleEl.releasePointerCapture(e.pointerId);
    } catch { /* ya released */ }
    
    saveNotes();
  }
  
  handleEl.addEventListener('pointerdown', onPointerDown);
  handleEl.addEventListener('pointermove', onPointerMove);
  handleEl.addEventListener('pointerup', onPointerUp);
  handleEl.addEventListener('pointercancel', onPointerUp);
  
  // Prevenir scroll/pan del viewport mientras se arrastra
  noteEl.addEventListener('touchmove', (e) => {
    if (isDragging) e.preventDefault();
  }, { passive: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serializa todas las notas a un array para persistencia.
 * @returns {Array<Object>} Array de estados de notas
 */
export function serializeNotes() {
  const notes = [];
  
  for (const [panelId, set] of panelNotesMap) {
    const isViewport = panelId === VIEWPORT_PANEL_ID;
    const panelEl = isViewport ? null : document.getElementById(panelId);
    const pw = panelEl?.offsetWidth || 0;
    const ph = panelEl?.offsetHeight || 0;
    for (const note of set) {
      const body = note.querySelector('.panel-note__body');
      
      if (isViewport) {
        // Notas de viewport: coordenadas en px
        notes.push({
          id: note.id,
          panelId: VIEWPORT_PANEL_ID,
          xPx: parseFloat(note.style.left) || 0,
          yPx: parseFloat(note.style.top) || 0,
          wPx: note.offsetWidth > 0 ? note.offsetWidth : (parseFloat(note.style.width) || 200),
          hPx: note.offsetHeight > 0 ? note.offsetHeight : (parseFloat(note.style.height) || 100),
          text: body?.textContent || '',
          html: body?.innerHTML || '',
          color: note.dataset.noteColor || DEFAULT_COLOR,
          fontSize: parseInt(note.dataset.fontSize, 10) || DEFAULT_FONT_SIZE
        });
      } else {
        // Notas de panel: coordenadas en % del panel
        // Usar dimensiones computadas si están disponibles (navegador real),
        // fallback a estilos inline (jsdom/tests)
        const useComputed = pw > 0 && ph > 0 && note.offsetWidth > 0;
        notes.push({
          id: note.id,
          panelId,
          xPct: parseFloat(note.style.left) || 0,
          yPct: parseFloat(note.style.top) || 0,
          wPct: useComputed ? (note.offsetWidth / pw) * 100 : (parseFloat(note.style.width) || DEFAULT_WIDTH_PCT),
          hPct: useComputed ? (note.offsetHeight / ph) * 100 : (parseFloat(note.style.height) || DEFAULT_HEIGHT_PCT),
          text: body?.textContent || '',
          html: body?.innerHTML || '',
          color: note.dataset.noteColor || DEFAULT_COLOR,
          fontSize: parseInt(note.dataset.fontSize, 10) || DEFAULT_FONT_SIZE
        });
      }
    }
  }
  
  return notes;
}

/**
 * Restaura notas desde un array serializado.
 * @param {Array<Object>} notesData - Array de estados de notas
 */
export function deserializeNotes(notesData) {
  if (!Array.isArray(notesData)) return;
  
  _isRestoring = true;
  
  // Limpiar notas existentes
  clearAllNotes();
  
  for (const data of notesData) {
    if (data.panelId === VIEWPORT_PANEL_ID) {
      createNote(VIEWPORT_PANEL_ID, {
        id: data.id,
        xPx: data.xPx,
        yPx: data.yPx,
        wPx: data.wPx,
        hPx: data.hPx,
        html: data.html,
        color: data.color,
        fontSize: data.fontSize
      });
    } else {
      createNote(data.panelId, {
        id: data.id,
        xPct: data.xPct,
        yPct: data.yPct,
        wPct: data.wPct,
        hPct: data.hPct,
        text: data.text,
        html: data.html,
        color: data.color,
        fontSize: data.fontSize
      });
    }
  }
  
  _isRestoring = false;
  log.info('Notas restauradas:', notesData.length);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCIA (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda las notas en localStorage.
 */
export function saveNotes() {
  if (_isRestoring) return;
  
  try {
    const data = serializeNotes();
    localStorage.setItem(STORAGE_KEYS.PANEL_NOTES, JSON.stringify(data));
    log.debug('Notas guardadas:', data.length);
  } catch (e) {
    log.warn('Error guardando notas:', e);
  }
}

/**
 * Restaura notas desde localStorage.
 */
export function restoreNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PANEL_NOTES);
    if (!raw) return;
    
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length > 0) {
      deserializeNotes(data);
    }
  } catch (e) {
    log.warn('Error restaurando notas:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLORES (exports para menú contextual)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los colores disponibles.
 * @returns {Array<{id: string, bg: string, border: string, text: string}>}
 */
export function getNoteColors() {
  return NOTE_COLORS;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Limita un valor a un rango.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

/**
 * Sanitiza HTML de nota, permitiendo solo tags seguros (b, i, strong, em, br, span).
 * @param {string} html
 * @returns {string}
 */
function sanitizeNoteHTML(html) {
  if (!html) return '';
  // Solo permitir tags de formato inline seguros (+ div/p para justificación)
  return html.replace(/<(?!\/?(?:b|i|strong|em|br|span|u|div|p)\b)[^>]*>/gi, '');
}
