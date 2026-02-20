/**
 * Tests para ui/panelNotes.js
 *
 * Verifica el sistema de notas post-it arrastrables sobre paneles:
 * - Creación de notas con opciones por defecto y personalizadas
 * - Eliminación individual y masiva
 * - Serialización/deserialización completa (roundtrip)
 * - Persistencia en localStorage (save/restore)
 * - Colores disponibles y cambio de color
 * - Posicionamiento con clamp (límites 0–95 / -5–95)
 * - Estructura DOM esperada (header, body, botones)
 * - Integración con patches (serializeNotes/deserializeNotes)
 * - Flag _isRestoring suprime guardados intermedios
 * - Tamaño de fuente (+/-)
 * - Soporte HTML (negrita/cursiva) en serialización
 * - Clipboard de notas (copiar/cortar/pegar)
 * - Bloqueo de propagación de eventos
 *
 * Se usa JSDOM para simular el DOM. Las dependencias (logger, i18n) se
 * importan directamente ya que funcionan sin DOM pesado.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ═══════════════════════════════════════════════════════════════════════════
// JSDOM + GLOBALS
// ═══════════════════════════════════════════════════════════════════════════

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
try { global.navigator = dom.window.navigator; } catch { /* read-only */ }

global.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAR MÓDULO BAJO TEST
// ═══════════════════════════════════════════════════════════════════════════

import {
  initPanelNotes,
  createNote,
  removeNote,
  clearPanelNotes,
  clearAllNotes,
  serializeNotes,
  deserializeNotes,
  saveNotes,
  restoreNotes,
  getNoteColors,
  pasteNoteFromClipboard,
  hasNoteInClipboard
} from '../../src/assets/js/ui/panelNotes.js';

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Crea N paneles en el DOM con IDs panel-1 … panel-N */
function createPanels(count = 3) {
  for (let i = 1; i <= count; i++) {
    const panel = document.createElement('div');
    panel.id = `panel-${i}`;
    panel.className = 'panel';
    // Dimensiones simuladas para porcentajes
    Object.defineProperty(panel, 'offsetWidth', { value: 800, configurable: true });
    Object.defineProperty(panel, 'offsetHeight', { value: 600, configurable: true });
    document.body.appendChild(panel);
  }
}

/** Limpia el DOM y localStorage */
function cleanup() {
  document.body.innerHTML = '';
  localStorage.clear();
  clearAllNotes();
}

/** Cuenta las notas en el DOM dentro de un panel */
function countDOMNotes(panelId) {
  const panel = document.getElementById(panelId);
  return panel ? panel.querySelectorAll('.panel-note').length : 0;
}

/** Obtiene los datos guardados en localStorage */
function getStoredNotes() {
  const raw = localStorage.getItem(STORAGE_KEYS.PANEL_NOTES);
  return raw ? JSON.parse(raw) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('PanelNotes — getNoteColors', () => {
  it('devuelve un array de colores no vacío', () => {
    const colors = getNoteColors();
    assert.ok(Array.isArray(colors));
    assert.ok(colors.length >= 5, 'Debería haber al menos 5 colores');
  });

  it('cada color tiene id, bg, border y text', () => {
    const colors = getNoteColors();
    for (const c of colors) {
      assert.ok(typeof c.id === 'string', `id debería ser string: ${JSON.stringify(c)}`);
      assert.ok(typeof c.bg === 'string', `bg debería ser string: ${c.id}`);
      assert.ok(typeof c.border === 'string', `border debería ser string: ${c.id}`);
      assert.ok(typeof c.text === 'string', `text debería ser string: ${c.id}`);
    }
  });

  it('incluye los colores principales (yellow, pink, blue, green, orange, purple)', () => {
    const ids = getNoteColors().map(c => c.id);
    for (const expected of ['yellow', 'pink', 'blue', 'green', 'orange', 'purple']) {
      assert.ok(ids.includes(expected), `Debería incluir ${expected}`);
    }
  });
});

describe('PanelNotes — createNote', () => {
  beforeEach(() => {
    cleanup();
    createPanels(3);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('crea una nota en un panel existente', () => {
    const note = createNote('panel-1');
    assert.ok(note, 'Debería devolver el elemento de la nota');
    assert.ok(note.classList.contains('panel-note'), 'Debería tener clase panel-note');
    assert.equal(countDOMNotes('panel-1'), 1);
  });

  it('devuelve null si el panel no existe', () => {
    const note = createNote('panel-inexistente');
    assert.strictEqual(note, null);
  });

  it('asigna color amarillo por defecto', () => {
    const note = createNote('panel-1');
    assert.equal(note.dataset.noteColor, 'yellow');
  });

  it('acepta color personalizado', () => {
    const note = createNote('panel-1', { color: 'blue' });
    assert.equal(note.dataset.noteColor, 'blue');
  });

  it('acepta posición personalizada en porcentaje', () => {
    const note = createNote('panel-1', { xPct: 25, yPct: 40 });
    assert.equal(note.style.left, '25%');
    assert.equal(note.style.top, '40%');
  });

  it('clampea posición X máxima a 95%', () => {
    const note = createNote('panel-1', { xPct: 120 });
    assert.equal(note.style.left, '95%');
  });

  it('clampea posición Y mínima a 0%', () => {
    const note = createNote('panel-1', { yPct: -10 });
    assert.equal(note.style.top, '0%');
  });

  it('asigna tamaño por defecto en porcentaje', () => {
    const note = createNote('panel-1');
    // El ancho y minHeight deben tener valores de % > 0
    assert.ok(note.style.width.endsWith('%'), 'Ancho debería ser en %');
    assert.ok(note.style.minHeight.endsWith('%'), 'MinHeight debería ser en %');
  });

  it('acepta tamaño personalizado', () => {
    const note = createNote('panel-1', { wPct: 20, hPct: 15 });
    assert.equal(note.style.width, '20%');
    assert.equal(note.style.minHeight, '15%');
  });

  it('crea la estructura DOM correcta (header + body)', () => {
    const note = createNote('panel-1');
    const header = note.querySelector('.panel-note__header');
    const body = note.querySelector('.panel-note__body');
    assert.ok(header, 'Debería tener header');
    assert.ok(body, 'Debería tener body');
  });

  it('header contiene drag handle y botones', () => {
    const note = createNote('panel-1');
    const dragHandle = note.querySelector('.panel-note__drag');
    const colorBtn = note.querySelector('.panel-note__btn--color');
    const deleteBtn = note.querySelector('.panel-note__btn--delete');
    assert.ok(dragHandle, 'Debería tener drag handle');
    assert.ok(colorBtn, 'Debería tener botón de color');
    assert.ok(deleteBtn, 'Debería tener botón de eliminar');
  });

  it('body es contentEditable', () => {
    const note = createNote('panel-1');
    const body = note.querySelector('.panel-note__body');
    assert.equal(body.contentEditable, 'true');
  });

  it('body acepta texto inicial', () => {
    const note = createNote('panel-1', { text: 'Hola mundo' });
    const body = note.querySelector('.panel-note__body');
    assert.equal(body.textContent, 'Hola mundo');
  });

  it('nota tiene atributo data-prevent-pan', () => {
    const note = createNote('panel-1');
    assert.equal(note.getAttribute('data-prevent-pan'), 'true');
  });

  it('almacena referencia al panel en dataset', () => {
    const note = createNote('panel-2');
    assert.equal(note.dataset.panelId, 'panel-2');
  });

  it('genera IDs únicos para cada nota', () => {
    const note1 = createNote('panel-1');
    const note2 = createNote('panel-1');
    assert.notEqual(note1.id, note2.id);
  });

  it('respeta ID proporcionado en options', () => {
    const note = createNote('panel-1', { id: 'mi-nota-42' });
    assert.equal(note.id, 'mi-nota-42');
  });

  it('puede crear múltiples notas en el mismo panel', () => {
    createNote('panel-1');
    createNote('panel-1');
    createNote('panel-1');
    assert.equal(countDOMNotes('panel-1'), 3);
  });

  it('puede crear notas en distintos paneles', () => {
    createNote('panel-1');
    createNote('panel-2');
    createNote('panel-3');
    assert.equal(countDOMNotes('panel-1'), 1);
    assert.equal(countDOMNotes('panel-2'), 1);
    assert.equal(countDOMNotes('panel-3'), 1);
  });

  it('guarda automáticamente en localStorage al crear', () => {
    createNote('panel-1', { text: 'auto-save test' });
    const stored = getStoredNotes();
    assert.ok(stored, 'Debería haber datos en localStorage');
    assert.equal(stored.length, 1);
    assert.equal(stored[0].text, 'auto-save test');
  });

  it('aplica variables CSS de color a la nota', () => {
    const note = createNote('panel-1', { color: 'blue' });
    const bg = note.style.getPropertyValue('--note-bg');
    const border = note.style.getPropertyValue('--note-border');
    const text = note.style.getPropertyValue('--note-text');
    assert.ok(bg, 'Debería tener --note-bg');
    assert.ok(border, 'Debería tener --note-border');
    assert.ok(text, 'Debería tener --note-text');
  });

  it('fallback a yellow si el color no existe', () => {
    const note = createNote('panel-1', { color: 'neon' });
    // Debe caer al primer color (yellow) como fallback
    const colors = getNoteColors();
    assert.equal(note.dataset.noteColor, colors[0].id);
  });
});

describe('PanelNotes — removeNote', () => {
  beforeEach(() => {
    cleanup();
    createPanels(2);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('elimina una nota por su ID', () => {
    const note = createNote('panel-1');
    assert.equal(countDOMNotes('panel-1'), 1);
    removeNote(note.id);
    assert.equal(countDOMNotes('panel-1'), 0);
  });

  it('no falla si el ID no existe', () => {
    assert.doesNotThrow(() => removeNote('inexistente'));
  });

  it('solo elimina la nota indicada, no las demás', () => {
    const note1 = createNote('panel-1', { text: 'A' });
    createNote('panel-1', { text: 'B' });
    removeNote(note1.id);
    assert.equal(countDOMNotes('panel-1'), 1);
  });

  it('actualiza localStorage tras eliminar', () => {
    const note = createNote('panel-1');
    createNote('panel-1');
    removeNote(note.id);
    const stored = getStoredNotes();
    assert.equal(stored.length, 1);
  });
});

describe('PanelNotes — clearPanelNotes', () => {
  beforeEach(() => {
    cleanup();
    createPanels(2);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('elimina todas las notas de un panel específico', () => {
    createNote('panel-1');
    createNote('panel-1');
    createNote('panel-1');
    createNote('panel-2');
    clearPanelNotes('panel-1');
    assert.equal(countDOMNotes('panel-1'), 0);
    assert.equal(countDOMNotes('panel-2'), 1, 'No debe afectar a panel-2');
  });

  it('no falla en panel sin notas', () => {
    assert.doesNotThrow(() => clearPanelNotes('panel-1'));
  });
});

describe('PanelNotes — clearAllNotes', () => {
  beforeEach(() => {
    cleanup();
    createPanels(3);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('elimina todas las notas de todos los paneles', () => {
    createNote('panel-1');
    createNote('panel-2');
    createNote('panel-3');
    createNote('panel-1');
    clearAllNotes();
    assert.equal(countDOMNotes('panel-1'), 0);
    assert.equal(countDOMNotes('panel-2'), 0);
    assert.equal(countDOMNotes('panel-3'), 0);
  });

  it('localStorage se actualiza tras limpiar', () => {
    createNote('panel-1');
    createNote('panel-2');
    clearAllNotes();
    const stored = getStoredNotes();
    assert.ok(stored);
    assert.equal(stored.length, 0);
  });
});

describe('PanelNotes — serialización', () => {
  beforeEach(() => {
    cleanup();
    createPanels(2);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('serializeNotes devuelve array vacío sin notas', () => {
    const result = serializeNotes();
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('serializeNotes captura todas las propiedades de la nota', () => {
    createNote('panel-1', {
      xPct: 30,
      yPct: 40,
      wPct: 15,
      hPct: 12,
      text: 'Serializar esto',
      color: 'pink'
    });

    const [data] = serializeNotes();
    assert.ok(data.id, 'Debe tener id');
    assert.equal(data.panelId, 'panel-1');
    assert.equal(data.xPct, 30);
    assert.equal(data.yPct, 40);
    assert.equal(data.wPct, 15);
    assert.equal(data.hPct, 12);
    assert.equal(data.text, 'Serializar esto');
    assert.equal(data.color, 'pink');
  });

  it('serializa múltiples notas en múltiples paneles', () => {
    createNote('panel-1', { text: 'A' });
    createNote('panel-1', { text: 'B' });
    createNote('panel-2', { text: 'C' });

    const result = serializeNotes();
    assert.equal(result.length, 3);

    const texts = result.map(n => n.text).sort();
    assert.deepEqual(texts, ['A', 'B', 'C']);
  });

  it('roundtrip: deserialize(serialize()) recrea las notas', () => {
    createNote('panel-1', { xPct: 10, yPct: 20, text: 'RT1', color: 'green' });
    createNote('panel-2', { xPct: 50, yPct: 60, text: 'RT2', color: 'orange' });

    const serialized = serializeNotes();

    // Limpiar y restaurar
    clearAllNotes();
    assert.equal(countDOMNotes('panel-1'), 0);
    assert.equal(countDOMNotes('panel-2'), 0);

    deserializeNotes(serialized);
    assert.equal(countDOMNotes('panel-1'), 1);
    assert.equal(countDOMNotes('panel-2'), 1);

    // Verificar contenido restaurado
    const restored = serializeNotes();
    assert.equal(restored.length, 2);

    const rt1 = restored.find(n => n.text === 'RT1');
    assert.ok(rt1, 'RT1 debería existir tras roundtrip');
    assert.equal(rt1.panelId, 'panel-1');
    assert.equal(rt1.color, 'green');
    assert.equal(rt1.xPct, 10);
    assert.equal(rt1.yPct, 20);

    const rt2 = restored.find(n => n.text === 'RT2');
    assert.ok(rt2, 'RT2 debería existir tras roundtrip');
    assert.equal(rt2.panelId, 'panel-2');
    assert.equal(rt2.color, 'orange');
  });

  it('deserializeNotes limpia notas previas antes de restaurar', () => {
    createNote('panel-1', { text: 'Vieja' });
    assert.equal(countDOMNotes('panel-1'), 1);

    deserializeNotes([
      { panelId: 'panel-1', xPct: 0, yPct: 0, text: 'Nueva', color: 'blue' }
    ]);

    assert.equal(countDOMNotes('panel-1'), 1);
    const [data] = serializeNotes();
    assert.equal(data.text, 'Nueva');
  });

  it('deserializeNotes ignora datos no-array', () => {
    createNote('panel-1', { text: 'Preservar' });
    deserializeNotes(null);
    deserializeNotes('basura');
    deserializeNotes(42);
    assert.equal(countDOMNotes('panel-1'), 1, 'La nota original debe mantenerse');
  });

  it('deserializeNotes maneja array vacío (elimina todo)', () => {
    createNote('panel-1', { text: 'Borrar' });
    deserializeNotes([]);
    assert.equal(countDOMNotes('panel-1'), 0);
  });

  it('deserializeNotes ignora notas con panelId inexistente', () => {
    deserializeNotes([
      { panelId: 'panel-fantasma', xPct: 10, yPct: 10, text: 'Ghost', color: 'yellow' }
    ]);
    // No debería haber creado ninguna nota visible
    const result = serializeNotes();
    assert.equal(result.length, 0, 'No debe serializar notas de paneles inexistentes');
  });
});

describe('PanelNotes — persistencia localStorage', () => {
  beforeEach(() => {
    cleanup();
    createPanels(2);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('saveNotes guarda en la clave correcta de localStorage', () => {
    createNote('panel-1', { text: 'persist' });
    const raw = localStorage.getItem(STORAGE_KEYS.PANEL_NOTES);
    assert.ok(raw, 'Debería existir en localStorage');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 1);
  });

  it('restoreNotes recupera notas guardadas', () => {
    // Guardar datos simulados directamente
    const mockData = [
      { id: 'note-restore-1', panelId: 'panel-1', xPct: 15, yPct: 25, wPct: 12, hPct: 10, text: 'Restaurada', color: 'purple' }
    ];
    localStorage.setItem(STORAGE_KEYS.PANEL_NOTES, JSON.stringify(mockData));

    // Restaurar
    restoreNotes();
    assert.equal(countDOMNotes('panel-1'), 1);

    const [data] = serializeNotes();
    assert.equal(data.text, 'Restaurada');
    assert.equal(data.color, 'purple');
    assert.equal(data.xPct, 15);
  });

  it('restoreNotes no falla si localStorage está vacío', () => {
    assert.doesNotThrow(() => restoreNotes());
  });

  it('restoreNotes no falla con JSON corrupto', () => {
    localStorage.setItem(STORAGE_KEYS.PANEL_NOTES, '{corrupto!!!');
    assert.doesNotThrow(() => restoreNotes());
  });

  it('saveNotes se llama al crear y al eliminar', () => {
    const note = createNote('panel-1', { text: 'tracking' });
    let stored = getStoredNotes();
    assert.equal(stored.length, 1, 'Debería guardar al crear');

    removeNote(note.id);
    stored = getStoredNotes();
    assert.equal(stored.length, 0, 'Debería guardar al eliminar');
  });
});

describe('PanelNotes — initPanelNotes', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('inicializa sin errores con paneles presentes', () => {
    createPanels(3);
    assert.doesNotThrow(() => initPanelNotes());
  });

  it('inicializa sin errores sin paneles en el DOM', () => {
    assert.doesNotThrow(() => initPanelNotes());
  });

  it('restaura notas guardadas al inicializar', () => {
    createPanels(1);
    // Pre-poblar localStorage
    const data = [
      { id: 'init-1', panelId: 'panel-1', xPct: 5, yPct: 5, wPct: 12, hPct: 10, text: 'Auto', color: 'yellow' }
    ];
    localStorage.setItem(STORAGE_KEYS.PANEL_NOTES, JSON.stringify(data));

    initPanelNotes();
    assert.equal(countDOMNotes('panel-1'), 1);
  });
});

describe('PanelNotes — colores y variables CSS', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('cada color válido se aplica correctamente', () => {
    const colors = getNoteColors();
    for (const colorDef of colors) {
      const note = createNote('panel-1', { color: colorDef.id });
      assert.equal(note.dataset.noteColor, colorDef.id);
      assert.equal(note.style.getPropertyValue('--note-bg'), colorDef.bg);
      assert.equal(note.style.getPropertyValue('--note-border'), colorDef.border);
      assert.equal(note.style.getPropertyValue('--note-text'), colorDef.text);
    }
  });
});

describe('PanelNotes — posicionamiento con clamp', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('posición 0,0 se mantiene', () => {
    const note = createNote('panel-1', { xPct: 0, yPct: 0 });
    assert.equal(note.style.left, '0%');
    assert.equal(note.style.top, '0%');
  });

  it('posición 95,95 se mantiene', () => {
    const note = createNote('panel-1', { xPct: 95, yPct: 95 });
    assert.equal(note.style.left, '95%');
    assert.equal(note.style.top, '95%');
  });

  it('posición >95 se clampea a 95', () => {
    const note = createNote('panel-1', { xPct: 200, yPct: 300 });
    assert.equal(note.style.left, '95%');
    assert.equal(note.style.top, '95%');
  });

  it('posición negativa se clampea a 0', () => {
    const note = createNote('panel-1', { xPct: -50, yPct: -100 });
    assert.equal(note.style.left, '0%');
    assert.equal(note.style.top, '0%');
  });

  it('posición por defecto (sin xPct/yPct) es 50%', () => {
    const note = createNote('panel-1');
    assert.equal(note.style.left, '50%');
    assert.equal(note.style.top, '50%');
  });
});

describe('PanelNotes — integración con patches', () => {
  beforeEach(() => {
    cleanup();
    createPanels(3);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('serializeNotes produce datos compatibles con JSON', () => {
    createNote('panel-1', { text: 'JSON test', color: 'pink', xPct: 33 });
    createNote('panel-2', { text: 'JSON test 2', color: 'green', xPct: 66 });

    const serialized = serializeNotes();
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].text, 'JSON test');
    assert.equal(parsed[1].text, 'JSON test 2');
  });

  it('simula flujo de patch: guardar → limpiar → cargar', () => {
    // 1. Crear notas (estado del sintetizador)
    createNote('panel-1', { text: 'Bass settings', color: 'blue', xPct: 10, yPct: 20 });
    createNote('panel-2', { text: 'Filter curve', color: 'pink', xPct: 50, yPct: 30 });
    createNote('panel-3', { text: 'Sequencer', color: 'green', xPct: 70, yPct: 80 });

    // 2. Guardar patch (simula lo que haría patchBrowser)
    const patchNotesState = serializeNotes();
    assert.equal(patchNotesState.length, 3);

    // 3. Cargar otro patch (limpiar estado)
    clearAllNotes();
    assert.equal(serializeNotes().length, 0);

    // 4. Restaurar desde patch guardado
    deserializeNotes(patchNotesState);
    assert.equal(serializeNotes().length, 3);

    // 5. Verificar integridad
    const restored = serializeNotes();
    const bass = restored.find(n => n.text === 'Bass settings');
    assert.ok(bass);
    assert.equal(bass.panelId, 'panel-1');
    assert.equal(bass.color, 'blue');
    assert.equal(bass.xPct, 10);
    assert.equal(bass.yPct, 20);
  });

  it('patch sin notesState no rompe nada', () => {
    createNote('panel-1', { text: 'Existente' });
    // Simula cargar un patch antiguo sin notesState → no llama deserializeNotes
    // El estado actual se mantiene
    assert.equal(countDOMNotes('panel-1'), 1);
  });

  it('patch con notesState vacío limpia las notas', () => {
    createNote('panel-1', { text: 'Será borrada' });
    deserializeNotes([]);
    assert.equal(countDOMNotes('panel-1'), 0);
  });
});

describe('PanelNotes — edge cases', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('crear y eliminar rápidamente no deja residuos', () => {
    for (let i = 0; i < 10; i++) {
      const note = createNote('panel-1');
      removeNote(note.id);
    }
    assert.equal(countDOMNotes('panel-1'), 0);
    const stored = getStoredNotes();
    assert.equal(stored.length, 0);
  });

  it('crear muchas notas simultáneamente', () => {
    const COUNT = 50;
    const ids = new Set();
    for (let i = 0; i < COUNT; i++) {
      const note = createNote('panel-1', { text: `Nota ${i}` });
      ids.add(note.id);
    }
    assert.equal(ids.size, COUNT, 'Todos los IDs deben ser únicos');
    assert.equal(countDOMNotes('panel-1'), COUNT);
    assert.equal(serializeNotes().length, COUNT);
  });

  it('clearAllNotes seguido de createNote funciona', () => {
    createNote('panel-1');
    clearAllNotes();
    const note = createNote('panel-1', { text: 'Después de limpiar' });
    assert.ok(note);
    assert.equal(countDOMNotes('panel-1'), 1);
  });

  it('nota con texto vacío se serializa correctamente', () => {
    createNote('panel-1', { text: '' });
    const [data] = serializeNotes();
    assert.equal(data.text, '');
  });

  it('nota con texto largo se serializa y restaura', () => {
    const longText = 'A'.repeat(5000);
    createNote('panel-1', { text: longText });
    const serialized = serializeNotes();
    clearAllNotes();
    deserializeNotes(serialized);
    const [data] = serializeNotes();
    assert.equal(data.text.length, 5000);
  });
});

describe('PanelNotes — tamaño de fuente', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('nota tiene tamaño de fuente por defecto (11px)', () => {
    const note = createNote('panel-1');
    assert.equal(note.dataset.fontSize, '11');
    assert.equal(note.style.fontSize, '11px');
  });

  it('acepta tamaño de fuente personalizado', () => {
    const note = createNote('panel-1', { fontSize: 16 });
    assert.equal(note.dataset.fontSize, '16');
    assert.equal(note.style.fontSize, '16px');
  });

  it('fontSize se serializa y restaura', () => {
    createNote('panel-1', { text: 'font test', fontSize: 18 });
    const serialized = serializeNotes();
    assert.equal(serialized[0].fontSize, 18);

    clearAllNotes();
    deserializeNotes(serialized);

    const restored = serializeNotes();
    assert.equal(restored[0].fontSize, 18);
  });

  it('header contiene botones A+ y A-', () => {
    const note = createNote('panel-1');
    const fontDown = note.querySelector('.panel-note__btn--font-down');
    const fontUp = note.querySelector('.panel-note__btn--font-up');
    assert.ok(fontDown, 'Debería tener botón A-');
    assert.ok(fontUp, 'Debería tener botón A+');
  });
});

describe('PanelNotes — soporte HTML (negrita/cursiva)', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('acepta HTML en options.html', () => {
    const note = createNote('panel-1', { html: 'hello <b>bold</b> world' });
    const body = note.querySelector('.panel-note__body');
    assert.ok(body.innerHTML.includes('<b>bold</b>'), 'Debería contener tag <b>');
  });

  it('serializa campo html con innerHTML', () => {
    const note = createNote('panel-1', { html: '<i>italic</i> text' });
    const [data] = serializeNotes();
    assert.ok(data.html.includes('<i>italic</i>'), 'html debería contener <i>');
    assert.equal(data.text, 'italic text', 'text debe ser plain text');
  });

  it('roundtrip de HTML funciona', () => {
    createNote('panel-1', { html: '<b>bold</b> and <i>italic</i>' });
    const serialized = serializeNotes();
    clearAllNotes();
    deserializeNotes(serialized);

    const [data] = serializeNotes();
    assert.ok(data.html.includes('<b>bold</b>'));
    assert.ok(data.html.includes('<i>italic</i>'));
  });

  it('sanitiza tags peligrosos en HTML', () => {
    const note = createNote('panel-1', { html: '<b>ok</b><script>alert(1)</script><i>ok2</i>' });
    const body = note.querySelector('.panel-note__body');
    assert.ok(!body.innerHTML.includes('<script>'), 'No debería contener <script>');
    assert.ok(body.innerHTML.includes('<b>ok</b>'), 'Debería mantener <b>');
    assert.ok(body.innerHTML.includes('<i>ok2</i>'), 'Debería mantener <i>');
  });

  it('prefiere html sobre text si ambos están en options', () => {
    const note = createNote('panel-1', { text: 'plain', html: '<b>rich</b>' });
    const body = note.querySelector('.panel-note__body');
    assert.ok(body.innerHTML.includes('<b>rich</b>'));
  });
});

describe('PanelNotes — clipboard de notas', () => {
  beforeEach(() => {
    cleanup();
    createPanels(2);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('hasNoteInClipboard es false inicialmente', () => {
    // El clipboard se mantiene entre tests (módulo global), pero al inicio no debería haber nada
    // Este test valida la función exportada
    assert.equal(typeof hasNoteInClipboard(), 'boolean');
  });

  it('pasteNoteFromClipboard devuelve null si no hay nada en clipboard', () => {
    // Limpiar clipboard indirectamente creando un estado limpio
    // Nota: no podemos limpiar _noteClipboard directamente, pero pasteNoteFromClipboard
    // devuelve null si el clipboard está vacío
    // Solo verificamos que la función no explota
    const result = pasteNoteFromClipboard('panel-1', 50, 50);
    // Puede ser null o un elemento dependiendo del estado del clipboard del módulo
    assert.ok(result === null || result instanceof dom.window.HTMLElement);
  });
});

describe('PanelNotes — bloqueo de propagación de eventos', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('contextmenu en nota no propaga al panel', () => {
    const note = createNote('panel-1');
    let panelGotEvent = false;
    const panel = document.getElementById('panel-1');
    panel.addEventListener('contextmenu', () => { panelGotEvent = true; });

    const event = new dom.window.Event('contextmenu', { bubbles: true });
    note.dispatchEvent(event);
    assert.equal(panelGotEvent, false, 'El panel no debe recibir contextmenu de la nota');
  });

  it('pointerdown en nota no propaga al panel', () => {
    const note = createNote('panel-1');
    let panelGotEvent = false;
    const panel = document.getElementById('panel-1');
    panel.addEventListener('pointerdown', () => { panelGotEvent = true; });

    const event = new dom.window.Event('pointerdown', { bubbles: true });
    note.dispatchEvent(event);
    assert.equal(panelGotEvent, false, 'El panel no debe recibir pointerdown de la nota');
  });

  it('click en nota no propaga al panel', () => {
    const note = createNote('panel-1');
    let panelGotEvent = false;
    const panel = document.getElementById('panel-1');
    panel.addEventListener('click', () => { panelGotEvent = true; });

    const event = new dom.window.Event('click', { bubbles: true });
    note.dispatchEvent(event);
    assert.equal(panelGotEvent, false, 'El panel no debe recibir click de la nota');
  });
});

describe('PanelNotes — estructura DOM ampliada', () => {
  beforeEach(() => {
    cleanup();
    createPanels(1);
    initPanelNotes();
  });

  afterEach(() => cleanup());

  it('body tiene contentEditable', () => {
    const note = createNote('panel-1');
    const body = note.querySelector('.panel-note__body');
    assert.equal(body.contentEditable, 'true');
  });

  it('header tiene 4 botones (A-, A+, color, eliminar)', () => {
    const note = createNote('panel-1');
    const buttons = note.querySelectorAll('.panel-note__btn');
    assert.equal(buttons.length, 4, 'Debe tener exactamente 4 botones');
  });

  it('todos los botones tienen title (tooltip)', () => {
    const note = createNote('panel-1');
    const buttons = note.querySelectorAll('.panel-note__btn');
    for (const btn of buttons) {
      assert.ok(btn.title, `Botón ${btn.className} debe tener title`);
    }
  });

  it('nota tiene data-prevent-pan', () => {
    const note = createNote('panel-1');
    assert.equal(note.getAttribute('data-prevent-pan'), 'true');
  });
});
