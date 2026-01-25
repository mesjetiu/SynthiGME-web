/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE API - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * API pública para el sistema de patches/estados del sintetizador.
 * 
 * ARQUITECTURA DE PATCHES (v2)
 * ────────────────────────────
 * Los patches guardan VALORES DE UI (posiciones de knobs 0-1, estados de 
 * switches, conexiones de matriz), NO valores de audio (Hz, ms, etc.).
 * 
 * Esto simplifica el sistema:
 * - No hay conversiones knob↔audio en el sistema de patches
 * - Las conversiones ocurren en tiempo real en los callbacks onChange de knobs
 * - Cambiar fórmulas de conversión no rompe patches existentes
 * - El formato es más compacto y legible
 * 
 * La serialización se realiza en app.js llamando a ui.serialize() de cada
 * módulo UI. Este archivo solo provee utilidades de storage y schema.
 * 
 * Funciones de conversión (knobToPhysical, dialToFrequency, etc.) están
 * disponibles en ./conversions.js para uso en displays y módulos de audio,
 * pero NO se usan en la persistencia de patches.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Re-exportar funciones de módulos internos
export { FORMAT_VERSION, MODULE_IDS, createEmptyPatch, validatePatch } from './schema.js';

// Conversiones disponibles para displays y módulos de audio (NO para patches)
export { 
  knobToPhysical, 
  physicalToKnob,
  dialToFrequency,
  frequencyToDial 
} from './conversions.js';

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
