import { createLogger } from '../utils/logger.js';
import { FORMAT_VERSION } from './schema.js';

const log = createLogger('Storage');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE STORAGE - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Almacenamiento de patches usando IndexedDB para patches del usuario
 * y localStorage para el último estado de sesión.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DB_NAME = 'synthigme-patches';
const DB_VERSION = 1;
const STORE_NAME = 'patches';
const LAST_STATE_KEY = 'synthigme-last-state';

/** @type {IDBDatabase|null} */
let db = null;

/**
 * Abre/inicializa la base de datos IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
async function openDB() {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      log.error(' Error opening IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Store de patches
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Índices para búsqueda
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCHES EN INDEXEDDB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guarda un nuevo patch o actualiza uno existente.
 * @param {Object} patch - Patch a guardar
 * @param {number} [existingId] - ID del patch existente (para actualizar)
 * @returns {Promise<number>} ID del patch guardado
 */
export async function savePatch(patch, existingId = null) {
  const database = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const patchData = {
      ...patch,
      formatVersion: patch.formatVersion ?? FORMAT_VERSION,
      appVersion: patch.appVersion || window.__synthBuildVersion || 'dev',
      savedAt: new Date().toISOString()
    };
    
    if (existingId !== null) {
      patchData.id = existingId;
    }
    
    const request = existingId !== null 
      ? store.put(patchData)
      : store.add(patchData);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carga un patch por su ID.
 * @param {number} id - ID del patch
 * @returns {Promise<Object|null>}
 */
export async function loadPatch(id) {
  const database = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lista todos los patches guardados.
 * @param {Object} [options] - Opciones de filtrado/ordenación
 * @param {string} [options.sortBy='savedAt'] - Campo por el que ordenar
 * @param {boolean} [options.descending=true] - Orden descendente
 * @returns {Promise<Array<{id: number, name: string, savedAt: string, category?: string}>>}
 */
export async function listPatches(options = {}) {
  const { sortBy = 'savedAt', descending = true } = options;
  const database = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      let patches = request.result.map(p => ({
        id: p.id,
        name: p.name,
        savedAt: p.savedAt,
        category: p.category,
        formatVersion: p.formatVersion,
        appVersion: p.appVersion,
        hasVisualState: (Array.isArray(p.pipState) && p.pipState.length > 0) || p.viewportState != null
      }));
      
      // Ordenar
      patches.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return descending ? -cmp : cmp;
      });
      
      resolve(patches);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Elimina un patch por su ID.
 * @param {number} id - ID del patch
 * @returns {Promise<void>}
 */
export async function deletePatch(id) {
  const database = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Renombra un patch existente.
 * @param {number} id - ID del patch
 * @param {string} newName - Nuevo nombre
 * @returns {Promise<void>}
 */
export async function renamePatch(id, newName) {
  const patch = await loadPatch(id);
  if (!patch) {
    throw new Error(`Patch with id ${id} not found`);
  }
  
  patch.name = newName;
  await savePatch(patch, id);
}

// ═══════════════════════════════════════════════════════════════════════════
// ÚLTIMO ESTADO (LOCALSTORAGE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guarda el último estado de la sesión.
 * @param {Object} state - Estado de la app a guardar
 * @param {Object} [metadata={}] - Metadatos opcionales (isAutoSave, savedOnExit, etc.)
 */
export function saveLastState(state, metadata = {}) {
  try {
    const data = {
      state,
      timestamp: Date.now(),
      savedAt: new Date().toISOString(),
      ...metadata
    };
    localStorage.setItem(LAST_STATE_KEY, JSON.stringify(data));
  } catch (err) {
    log.error(' Error saving last state:', err);
  }
}

/**
 * Carga el último estado de la sesión.
 * @returns {{ state: Object, timestamp: number, savedAt: string, isAutoSave?: boolean, savedOnExit?: boolean }|null}
 */
export function loadLastState() {
  try {
    const data = localStorage.getItem(LAST_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    log.error(' Error loading last state:', err);
    return null;
  }
}

/**
 * Elimina el último estado guardado.
 */
export function clearLastState() {
  localStorage.removeItem(LAST_STATE_KEY);
}

/**
 * Verifica si hay un último estado guardado.
 * @returns {boolean}
 */
export function hasLastState() {
  return localStorage.getItem(LAST_STATE_KEY) !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE GRABACIÓN (LOCALSTORAGE)
// ═══════════════════════════════════════════════════════════════════════════

import { STORAGE_KEYS } from '../utils/constants.js';

/** Número de pistas por defecto */
const DEFAULT_RECORDING_TRACKS = 2;
/** Formato de grabación por defecto */
const DEFAULT_RECORDING_FORMAT = 'webm-opus';
/** Bitrate por defecto (192 kbps) */
const DEFAULT_RECORDING_BITRATE = 192000;

/**
 * Carga el número de pistas de grabación desde localStorage.
 * @param {number} maxTracks - Máximo permitido (para validación)
 * @returns {number}
 */
export function loadRecordingTracks(maxTracks) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECORDING_TRACKS);
    if (stored) {
      const count = parseInt(stored, 10);
      if (count >= 1 && count <= maxTracks) return count;
    }
  } catch { /* Ignorar */ }
  return DEFAULT_RECORDING_TRACKS;
}

/**
 * Persiste el número de pistas de grabación.
 * @param {number} count
 */
export function saveRecordingTracks(count) {
  localStorage.setItem(STORAGE_KEYS.RECORDING_TRACKS, String(count));
}

/**
 * Carga el formato de grabación desde localStorage.
 * @param {Object} validFormats - Mapa de formatos válidos { [key]: {...} }
 * @returns {string}
 */
export function loadRecordingFormat(validFormats) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECORDING_FORMAT);
    if (stored && validFormats[stored]) return stored;
  } catch { /* Ignorar */ }
  return DEFAULT_RECORDING_FORMAT;
}

/**
 * Persiste el formato de grabación.
 * @param {string} format
 */
export function saveRecordingFormat(format) {
  localStorage.setItem(STORAGE_KEYS.RECORDING_FORMAT, format);
}

/**
 * Carga el bitrate de grabación desde localStorage.
 * @returns {number}
 */
export function loadRecordingBitrate() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECORDING_BITRATE);
    if (stored) {
      const val = parseInt(stored, 10);
      if (val > 0) return val;
    }
  } catch { /* Ignorar */ }
  return DEFAULT_RECORDING_BITRATE;
}

/**
 * Persiste el bitrate de grabación.
 * @param {number} bitrate
 */
export function saveRecordingBitrate(bitrate) {
  localStorage.setItem(STORAGE_KEYS.RECORDING_BITRATE, String(bitrate));
}

/**
 * Carga la matriz de routing de grabación desde localStorage.
 * @returns {Array[]|null} Matriz si es válida, null si no hay o está corrupta
 */
export function loadRecordingRouting() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECORDING_ROUTING);
    if (stored) {
      const matrix = JSON.parse(stored);
      if (Array.isArray(matrix)) return matrix;
    }
  } catch { /* Ignorar */ }
  return null;
}

/**
 * Persiste la matriz de routing de grabación.
 * @param {Array[]} matrix
 */
export function saveRecordingRouting(matrix) {
  localStorage.setItem(STORAGE_KEYS.RECORDING_ROUTING, JSON.stringify(matrix));
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT/EXPORT DE ARCHIVOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exporta un patch a un archivo JSON descargable.
 * @param {Object} patch - Patch a exportar
 * @param {string} [filename] - Nombre del archivo (sin extensión)
 */
export function exportPatchToFile(patch, filename) {
  const name = filename || patch.name || 'patch';
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_');
  const json = JSON.stringify(patch, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.sgme.json`;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  // Usar setTimeout para asegurar que el DOM procese el link
  // antes de hacer click (evita problemas con modales abiertos)
  setTimeout(() => {
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * Importa un patch desde un archivo JSON.
 * @returns {Promise<Object>} Patch importado
 */
export function importPatchFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.sgme.json';
    
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      
      try {
        const text = await file.text();
        const patch = JSON.parse(text);
        resolve(patch);
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };
    
    input.click();
  });
}
