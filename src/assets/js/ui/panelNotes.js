/**
 * PanelNotes - Notas estilo post-it arrastrables sobre paneles.
 *
 * Permite al usuario crear notas de texto posicionadas libremente dentro
 * de cada panel del sintetizador. Las coordenadas se almacenan en porcentaje
 * relativo al panel para que sobrevivan a zoom, paneo y PiP sin recalcular.
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
const DEFAULT_WIDTH_PCT = 12;
const DEFAULT_HEIGHT_PCT = 10;

/** Tamaño de fuente por defecto y rango (px) */
const DEFAULT_FONT_SIZE = 11;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 24;
const FONT_SIZE_STEP = 1;

/** Tamaño mínimo en px para que la nota sea usable */
const MIN_SIZE_PX = 60;

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
  
  // Restaurar notas guardadas
  restoreNotes();
  
  log.info('PanelNotes inicializado');
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
  const panel = document.getElementById(panelId);
  if (!panel) {
    log.warn('Panel no encontrado:', panelId);
    return null;
  }
  
  const noteId = options.id || `note-${Date.now()}-${++noteIdCounter}`;
  const colorDef = NOTE_COLORS.find(c => c.id === (options.color || DEFAULT_COLOR)) || NOTE_COLORS[0];
  
  const xPct = clamp(options.xPct ?? 50, 0, 95);
  const yPct = clamp(options.yPct ?? 50, 0, 95);
  const wPct = options.wPct ?? DEFAULT_WIDTH_PCT;
  const hPct = options.hPct ?? DEFAULT_HEIGHT_PCT;
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
  
  // ── Crear DOM ──
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.id = noteId;
  note.dataset.noteColor = colorDef.id;
  note.dataset.panelId = panelId;
  note.dataset.fontSize = String(fontSize);
  note.setAttribute('data-prevent-pan', 'true');
  
  // Posición y tamaño en %
  note.style.left = `${xPct}%`;
  note.style.top = `${yPct}%`;
  note.style.width = `${wPct}%`;
  note.style.minHeight = `${hPct}%`;
  note.style.fontSize = `${fontSize}px`;
  applyNoteColor(note, colorDef);
  
  // ── Bloquear propagación de TODOS los eventos relevantes ──
  // Evita que el menú contextual del panel se dispare sobre la nota
  const stopEvents = ['contextmenu', 'pointerdown', 'pointerup', 'click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchend'];
  for (const evtName of stopEvents) {
    note.addEventListener(evtName, (e) => {
      e.stopPropagation();
    }, true);
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
  
  // Botón reducir fuente (A-)
  const fontDownBtn = document.createElement('button');
  fontDownBtn.className = 'panel-note__btn panel-note__btn--font-down';
  fontDownBtn.innerHTML = 'A<small>−</small>';
  fontDownBtn.title = t('notes.fontDown');
  fontDownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    changeFontSize(note, -FONT_SIZE_STEP);
  });
  actions.appendChild(fontDownBtn);
  
  // Botón aumentar fuente (A+)
  const fontUpBtn = document.createElement('button');
  fontUpBtn.className = 'panel-note__btn panel-note__btn--font-up';
  fontUpBtn.innerHTML = 'A<small>+</small>';
  fontUpBtn.title = t('notes.fontUp');
  fontUpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    changeFontSize(note, FONT_SIZE_STEP);
  });
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
  
  note.appendChild(body);
  
  // ── Drag & Drop (ratón + touch) ──
  setupNoteDrag(note, header, panel);
  
  // ── Insertar en el panel ──
  panel.appendChild(note);
  
  // Registrar
  if (!panelNotesMap.has(panelId)) {
    panelNotesMap.set(panelId, new Set());
  }
  panelNotesMap.get(panelId).add(note);
  
  if (!_isRestoring) {
    saveNotes();
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
  _noteClipboard = {
    html: body?.innerHTML || '',
    text: body?.textContent || '',
    color: noteEl.dataset.noteColor || DEFAULT_COLOR,
    fontSize: parseInt(noteEl.dataset.fontSize, 10) || DEFAULT_FONT_SIZE,
    wPct: parseFloat(noteEl.style.width) || DEFAULT_WIDTH_PCT,
    hPct: parseFloat(noteEl.style.minHeight) || DEFAULT_HEIGHT_PCT,
  };
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
  return createNote(panelId, {
    xPct,
    yPct,
    wPct: _noteClipboard.wPct,
    hPct: _noteClipboard.hPct,
    html: _noteClipboard.html,
    color: _noteClipboard.color,
    fontSize: _noteClipboard.fontSize,
  });
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
  
  // Posicionar junto al botón
  noteEl.appendChild(picker);
  
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
 * Posiciona usando porcentajes relativos al panel.
 *
 * @param {HTMLElement} noteEl - Elemento de la nota
 * @param {HTMLElement} handleEl - Elemento que actúa como drag handle
 * @param {HTMLElement} panelEl - Panel contenedor
 */
function setupNoteDrag(noteEl, handleEl, panelEl) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeftPx = 0;
  let startTopPx = 0;
  let pointerId = null;
  
  function getPanelRect() {
    return panelEl.getBoundingClientRect();
  }
  
  function onPointerDown(e) {
    // Solo el drag handle inicia arrastre
    if (!e.target.closest('.panel-note__header')) return;
    // Ignorar si se pulsó un botón
    if (e.target.closest('.panel-note__btn')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDragging = true;
    pointerId = e.pointerId;
    handleEl.setPointerCapture(e.pointerId);
    
    startX = e.clientX;
    startY = e.clientY;
    startLeftPx = noteEl.offsetLeft;
    startTopPx = noteEl.offsetTop;
    
    noteEl.classList.add('panel-note--dragging');
  }
  
  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const panelRect = getPanelRect();
    // Calcular escala del panel (transform scale en PiP)
    const scaleX = panelRect.width / panelEl.offsetWidth;
    const scaleY = panelRect.height / panelEl.offsetHeight;
    
    const newLeftPx = startLeftPx + dx / scaleX;
    const newTopPx = startTopPx + dy / scaleY;
    
    // Convertir a %
    const xPct = (newLeftPx / panelEl.offsetWidth) * 100;
    const yPct = (newTopPx / panelEl.offsetHeight) * 100;
    
    noteEl.style.left = `${clamp(xPct, -5, 95)}%`;
    noteEl.style.top = `${clamp(yPct, -5, 95)}%`;
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
    for (const note of set) {
      const body = note.querySelector('.panel-note__body');
      notes.push({
        id: note.id,
        panelId,
        xPct: parseFloat(note.style.left) || 0,
        yPct: parseFloat(note.style.top) || 0,
        wPct: parseFloat(note.style.width) || DEFAULT_WIDTH_PCT,
        hPct: parseFloat(note.style.minHeight) || DEFAULT_HEIGHT_PCT,
        text: body?.textContent || '',
        html: body?.innerHTML || '',
        color: note.dataset.noteColor || DEFAULT_COLOR,
        fontSize: parseInt(note.dataset.fontSize, 10) || DEFAULT_FONT_SIZE
      });
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
  // Solo permitir tags de formato inline seguros
  return html.replace(/<(?!\/?(?:b|i|strong|em|br|span|u)\b)[^>]*>/gi, '');
}
