/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE API - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * API pública para el sistema de patches/estados del sintetizador.
 * 
 * Este módulo proporciona:
 * - Serialización del estado actual a patch (valores físicos)
 * - Deserialización de patch a estado (aplicar a módulos)
 * - CRUD de patches en IndexedDB
 * - Gestión del último estado de sesión
 * - Import/Export de archivos
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Re-exportar funciones de módulos internos
export { FORMAT_VERSION, MODULE_IDS, createEmptyPatch, validatePatch } from './schema.js';
export { knobToPhysical, physicalToKnob } from './conversions.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('State');
export { migratePatch, needsMigration, getMigrationInfo } from './migrations.js';
export {
  savePatch,
  loadPatch,
  listPatches,
  deletePatch,
  renamePatch,
  saveLastState,
  loadLastState,
  clearLastState,
  hasLastState,
  exportPatchToFile,
  importPatchFromFile
} from './storage.js';

import { createEmptyPatch, validatePatch } from './schema.js';
import { migratePatch } from './migrations.js';
import { savePatch, loadPatch, saveLastState, loadLastState, importPatchFromFile } from './storage.js';

/**
 * Referencia al engine global (se configura en init).
 * @type {Object|null}
 */
let engineRef = null;

/**
 * Timer para autoguardado.
 * @type {number|null}
 */
let autoSaveTimer = null;

/**
 * Configuración de autoguardado.
 */
const autoSaveConfig = {
  enabled: false,
  intervalMs: 30000  // 30 segundos por defecto
};

/**
 * Inicializa el sistema de estado con referencia al engine.
 * @param {Object} engine - Instancia del AudioEngine
 */
export function initStateSystem(engine) {
  engineRef = engine;
  log.info(' System initialized');
}

/**
 * Serializa el estado actual del sintetizador a un patch.
 * Captura todos los valores físicos de los módulos activos.
 * 
 * @param {string} name - Nombre del patch
 * @param {Object} [options] - Opciones
 * @param {string} [options.category] - Categoría del patch
 * @returns {Object} Patch serializado con valores físicos
 */
export function serializeCurrentState(name = 'Untitled', options = {}) {
  const patch = createEmptyPatch(name);
  
  if (options.category) {
    patch.category = options.category;
  }
  
  if (!engineRef) {
    log.warn(' Engine not initialized, returning empty patch');
    return patch;
  }
  
  // Serializar módulos registrados en el engine
  const modules = engineRef.getModules?.() || [];
  
  for (const module of modules) {
    const moduleState = serializeModule(module);
    if (moduleState) {
      patch.modules[module.id] = moduleState;
    }
  }
  
  // Serializar matriz (si está disponible)
  const matrix = engineRef.getMatrix?.();
  if (matrix) {
    patch.matrix = serializeMatrix(matrix);
  }
  
  // Serializar routing de audio
  const routing = engineRef.getRouting?.();
  if (routing) {
    patch.routing = routing;
  }
  
  return patch;
}

/**
 * Serializa un módulo individual a su representación en el patch.
 * @param {Object} module - Instancia del módulo
 * @returns {Object|null} Estado del módulo o null si no serializable
 */
function serializeModule(module) {
  if (!module || !module.id) return null;
  
  // Los módulos deben implementar getState() para ser serializables
  if (typeof module.getState === 'function') {
    return module.getState();
  }
  
  // Fallback: intentar extraer parámetros comunes
  const state = {};
  
  // Detectar tipo de módulo y serializar según corresponda
  if (module.id.startsWith('osc')) {
    return serializeOscillator(module);
  } else if (module.id.startsWith('noise')) {
    return serializeNoise(module);
  } else if (module.id.startsWith('input')) {
    return serializeInputAmplifier(module);
  }
  
  return Object.keys(state).length > 0 ? state : null;
}

/**
 * Serializa un oscilador.
 * @see TODO.md - "Osciladores: exponer valores para serialización"
 */
function serializeOscillator(osc) {
  // Pendiente: osciladores deben exponer currentValues
  return {
    frequency: osc.currentValues?.frequency ?? 10,
    pulseLevel: osc.currentValues?.pulseLevel ?? 0,
    pulseWidth: osc.currentValues?.pulseWidth ?? 0.5,
    sineLevel: osc.currentValues?.sineLevel ?? 0,
    sineSymmetry: osc.currentValues?.sineSymmetry ?? 0.5,
    triangleLevel: osc.currentValues?.triangleLevel ?? 0,
    sawtoothLevel: osc.currentValues?.sawtoothLevel ?? 0
  };
}

/**
 * Serializa un módulo de ruido.
 */
function serializeNoise(noise) {
  return {
    colour: noise.currentValues?.colour ?? 0,
    level: noise.currentValues?.level ?? 0
  };
}

/**
 * Serializa los input amplifiers.
 */
function serializeInputAmplifier(input) {
  return {
    levels: input.currentValues?.levels ?? [0, 0, 0, 0, 0, 0, 0, 0]
  };
}

/**
 * Serializa la matriz de conexiones.
 * @see TODO.md - "Matriz: exponer estado para serialización"
 */
function serializeMatrix(matrix) {
  // Pendiente: matriz debe exponer conexiones activas
  return {
    audio: [],
    control: []
  };
}

/**
 * Deserializa y aplica un patch al sintetizador.
 * Convierte valores físicos a posiciones de knob y los aplica.
 * 
 * @param {Object} patch - Patch a aplicar
 * @param {Object} [options] - Opciones
 * @param {boolean} [options.merge=false] - Fusionar con estado actual (no resetear)
 * @returns {{success: boolean, errors: string[], migrated: boolean}}
 */
export function applyPatch(patch, options = {}) {
  const { merge = false } = options;
  const errors = [];
  
  // Validar patch
  const validation = validatePatch(patch);
  if (!validation.valid) {
    return { success: false, errors: validation.errors, migrated: false };
  }
  
  // Migrar si es necesario
  const { patch: migratedPatch, migrated } = migratePatch(patch);
  
  if (!engineRef) {
    return { success: false, errors: ['Engine not initialized'], migrated };
  }
  
  // Aplicar módulos
  for (const [moduleId, moduleState] of Object.entries(migratedPatch.modules || {})) {
    try {
      applyModuleState(moduleId, moduleState);
    } catch (err) {
      errors.push(`Module ${moduleId}: ${err.message}`);
    }
  }
  
  // Aplicar matriz
  if (migratedPatch.matrix) {
    try {
      applyMatrixState(migratedPatch.matrix);
    } catch (err) {
      errors.push(`Matrix: ${err.message}`);
    }
  }
  
  // Aplicar routing
  if (migratedPatch.routing) {
    try {
      applyRoutingState(migratedPatch.routing);
    } catch (err) {
      errors.push(`Routing: ${err.message}`);
    }
  }
  
  return {
    success: errors.length === 0,
    errors,
    migrated
  };
}

/**
 * Aplica el estado a un módulo individual.
 */
function applyModuleState(moduleId, state) {
  const module = engineRef.getModule?.(moduleId);
  
  if (!module) {
    log.warn(` Module ${moduleId} not found`);
    return;
  }
  
  // Los módulos deben implementar setState() para recibir estado
  if (typeof module.setState === 'function') {
    module.setState(state);
  } else {
    log.warn(` Module ${moduleId} does not support setState`);
  }
}

/**
 * Aplica el estado de la matriz.
 */
function applyMatrixState(matrixState) {
  const matrix = engineRef.getMatrix?.();
  if (!matrix || typeof matrix.setState !== 'function') {
    return;
  }
  matrix.setState(matrixState);
}

/**
 * Aplica el estado de routing.
 */
function applyRoutingState(routingState) {
  const router = engineRef.getRouter?.();
  if (!router || typeof router.setState !== 'function') {
    return;
  }
  router.setState(routingState);
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERACIONES DE ALTO NIVEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Guarda el estado actual como nuevo patch.
 * @param {string} name - Nombre del patch
 * @param {Object} [options] - Opciones adicionales
 * @returns {Promise<number>} ID del patch guardado
 */
export async function saveCurrentAsNewPatch(name, options = {}) {
  const patch = serializeCurrentState(name, options);
  return await savePatch(patch);
}

/**
 * Carga y aplica un patch por su ID.
 * @param {number} id - ID del patch
 * @returns {Promise<{success: boolean, errors: string[], patch?: Object}>}
 */
export async function loadAndApplyPatch(id) {
  const patch = await loadPatch(id);
  
  if (!patch) {
    return { success: false, errors: [`Patch ${id} not found`] };
  }
  
  const result = applyPatch(patch);
  return { ...result, patch };
}

/**
 * Importa un patch desde archivo y lo aplica.
 * @returns {Promise<{success: boolean, errors: string[], patch?: Object}>}
 */
export async function importAndApplyPatch() {
  try {
    const patch = await importPatchFromFile();
    const result = applyPatch(patch);
    return { ...result, patch };
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTOGUARDADO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configura el autoguardado del último estado.
 * @param {Object} options
 * @param {boolean} options.enabled - Activar/desactivar
 * @param {number} [options.intervalMs=30000] - Intervalo en ms
 */
export function configureAutoSave(options) {
  const { enabled, intervalMs = 30000 } = options;
  
  // Limpiar timer anterior
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  
  autoSaveConfig.enabled = enabled;
  autoSaveConfig.intervalMs = intervalMs;
  
  if (enabled) {
    autoSaveTimer = setInterval(() => {
      const state = serializeCurrentState('__autosave__');
      saveLastState(state);
    }, intervalMs);
    log.info(` Auto-save enabled (every ${intervalMs / 1000}s)`);
  } else {
    log.info(' Auto-save disabled');
  }
}

/**
 * Fuerza un guardado inmediato del estado actual.
 */
export function saveStateNow() {
  const state = serializeCurrentState('__lastsession__');
  saveLastState(state);
}

/**
 * Restaura el último estado guardado.
 * @returns {{success: boolean, errors: string[]}}
 */
export function restoreLastState() {
  const state = loadLastState();
  
  if (!state) {
    return { success: false, errors: ['No saved state found'] };
  }
  
  return applyPatch(state);
}
