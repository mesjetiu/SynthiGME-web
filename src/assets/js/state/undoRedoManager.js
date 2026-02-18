// ═══════════════════════════════════════════════════════════════════════════
// UndoRedoManager - Deshacer/Rehacer basado en snapshots del estado completo
// ═══════════════════════════════════════════════════════════════════════════
//
// Captura el estado completo del sintetizador al finalizar cada gesto del
// usuario (pointerup/click). Los estados intermedios durante un arrastre
// se ignoran: solo se guarda el estado previo al gesto y el posterior.
//
// Estrategia:
//   - Al iniciar un gesto (pointerdown) se captura el estado "antes"
//   - Al finalizar el gesto (synth:userInteraction) se empuja el snapshot
//     previo a la pila de undo
//   - Undo restaura el snapshot anterior y mueve el actual a redo
//   - Redo restaura el snapshot siguiente y mueve el actual a undo
//
// ═══════════════════════════════════════════════════════════════════════════

import { createLogger } from '../utils/logger.js';

const log = createLogger('UndoRedo');

/** Máximo de estados en el historial (evita consumo excesivo de memoria) */
const MAX_HISTORY = 50;

/**
 * Comparación rápida de dos snapshots serializados.
 * Usa JSON.stringify para comparar (los objetos son puros datos).
 */
function snapshotsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class UndoRedoManager {
  constructor() {
    /** @type {Array<string>} Pila de undo (JSON strings para eficiencia) */
    this._undoStack = [];
    
    /** @type {Array<string>} Pila de redo (JSON strings) */
    this._redoStack = [];
    
    /** @type {string|null} Snapshot actual (JSON) - estado base de referencia */
    this._currentSnapshot = null;
    
    /** @type {Function|null} Callback para serializar el estado completo */
    this._serializeFn = null;
    
    /** @type {Function|null} Callback para aplicar un estado completo */
    this._applyFn = null;
    
    /** @type {boolean} True mientras se aplica un undo/redo (evita re-captura) */
    this._applying = false;
    
    /** @type {Set<Function>} Listeners de cambio de estado */
    this._listeners = new Set();
  }
  
  /**
   * Configura las funciones de serialización y aplicación.
   * @param {Function} serializeFn - () => Object (estado actual del synth)
   * @param {Function} applyFn - (Object) => void (aplica un estado)
   */
  init(serializeFn, applyFn) {
    this._serializeFn = serializeFn;
    this._applyFn = applyFn;
    
    // Capturar estado inicial como referencia
    this._captureCurrentAsBase();
    
    log.info('Inicializado con estado base');
  }
  
  /**
   * Captura el estado actual como base de referencia.
   * Se llama al inicializar y después de cargar un patch.
   */
  _captureCurrentAsBase() {
    if (!this._serializeFn) return;
    try {
      this._currentSnapshot = JSON.stringify(this._serializeFn());
    } catch (e) {
      log.error('Error capturando estado base:', e);
    }
  }
  
  /**
   * Llamar cuando el usuario completa un gesto (synth:userInteraction).
   * Compara con el snapshot base y, si hay cambio, empuja a undo.
   */
  commitInteraction() {
    if (this._applying) return;
    if (!this._serializeFn) return;
    
    try {
      const newSnapshot = JSON.stringify(this._serializeFn());
      
      // Solo registrar si hubo cambio real
      if (this._currentSnapshot && this._currentSnapshot !== newSnapshot) {
        // Empujar el estado previo a undo
        this._undoStack.push(this._currentSnapshot);
        
        // Limitar tamaño de la pila
        if (this._undoStack.length > MAX_HISTORY) {
          this._undoStack.shift();
        }
        
        // Limpiar redo (nueva rama de cambios)
        this._redoStack.length = 0;
        
        log.info(`Cambio registrado (undo: ${this._undoStack.length})`);
      }
      
      // Actualizar referencia al estado actual
      this._currentSnapshot = newSnapshot;
      this._notifyListeners();
    } catch (e) {
      log.error('Error registrando interacción:', e);
    }
  }
  
  /**
   * Deshace el último cambio.
   * @returns {boolean} true si se deshizo algo
   */
  undo() {
    if (!this.canUndo || !this._applyFn) return false;
    
    this._applying = true;
    try {
      // Guardar estado actual en redo
      this._redoStack.push(this._currentSnapshot);
      
      // Restaurar estado anterior
      const previousSnapshot = this._undoStack.pop();
      this._currentSnapshot = previousSnapshot;
      
      const state = JSON.parse(previousSnapshot);
      this._applyFn(state);
      
      log.info(`Undo aplicado (undo: ${this._undoStack.length}, redo: ${this._redoStack.length})`);
      this._notifyListeners();
      return true;
    } catch (e) {
      log.error('Error en undo:', e);
      return false;
    } finally {
      this._applying = false;
    }
  }
  
  /**
   * Rehace el último cambio deshecho.
   * @returns {boolean} true si se rehizo algo
   */
  redo() {
    if (!this.canRedo || !this._applyFn) return false;
    
    this._applying = true;
    try {
      // Guardar estado actual en undo
      this._undoStack.push(this._currentSnapshot);
      
      // Restaurar estado siguiente
      const nextSnapshot = this._redoStack.pop();
      this._currentSnapshot = nextSnapshot;
      
      const state = JSON.parse(nextSnapshot);
      this._applyFn(state);
      
      log.info(`Redo aplicado (undo: ${this._undoStack.length}, redo: ${this._redoStack.length})`);
      this._notifyListeners();
      return true;
    } catch (e) {
      log.error('Error en redo:', e);
      return false;
    } finally {
      this._applying = false;
    }
  }
  
  /** @returns {boolean} true si hay acciones para deshacer */
  get canUndo() {
    return this._undoStack.length > 0;
  }
  
  /** @returns {boolean} true si hay acciones para rehacer */
  get canRedo() {
    return this._redoStack.length > 0;
  }
  
  /** @returns {number} Cantidad de estados en undo */
  get undoCount() {
    return this._undoStack.length;
  }
  
  /** @returns {number} Cantidad de estados en redo */
  get redoCount() {
    return this._redoStack.length;
  }
  
  /**
   * Limpia todo el historial. Se llama al cargar un patch o resetear.
   */
  clear() {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._captureCurrentAsBase();
    this._notifyListeners();
    log.info('Historial limpiado');
  }
  
  /**
   * Suscribirse a cambios en la disponibilidad de undo/redo.
   * @param {Function} callback - (canUndo, canRedo) => void
   * @returns {Function} Función para desuscribirse
   */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
  
  /**
   * Notifica a los listeners del cambio de estado.
   */
  _notifyListeners() {
    const canUndo = this.canUndo;
    const canRedo = this.canRedo;
    this._listeners.forEach(cb => {
      try {
        cb(canUndo, canRedo);
      } catch (e) {
        log.error('Error en listener:', e);
      }
    });
  }
  
  /** @returns {boolean} True si se está aplicando un undo/redo */
  get isApplying() {
    return this._applying;
  }
}

/** Instancia singleton */
export const undoRedoManager = new UndoRedoManager();
