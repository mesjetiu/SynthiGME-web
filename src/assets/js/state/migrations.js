/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STATE MIGRATIONS - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Funciones para migrar patches de versiones anteriores al formato actual.
 * Cuando cambie FORMAT_VERSION, añadir la migración correspondiente.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { FORMAT_VERSION } from './schema.js';

/**
 * Mapa de funciones de migración.
 * Cada función recibe un patch de versión N y lo devuelve en versión N+1.
 * @type {Object<number, Function>}
 */
const migrations = {
  // Ejemplo de migración v1 → v2 (cuando sea necesario):
  // 1: (patch) => {
  //   // Añadir nuevo campo
  //   patch.newField = patch.oldField || 'default';
  //   delete patch.oldField;
  //   patch.formatVersion = 2;
  //   return patch;
  // }
};

/**
 * Migra un patch a la versión actual del formato.
 * Aplica migraciones secuenciales si es necesario.
 * 
 * @param {Object} patch - Patch a migrar
 * @returns {{patch: Object, migrated: boolean, fromVersion: number}}
 */
export function migratePatch(patch) {
  const fromVersion = patch.formatVersion || 1;
  let currentPatch = { ...patch };
  let migrated = false;
  
  // Aplicar migraciones secuenciales
  for (let v = fromVersion; v < FORMAT_VERSION; v++) {
    const migrationFn = migrations[v];
    if (migrationFn) {
      console.log(`[Migrations] Migrating patch from v${v} to v${v + 1}`);
      currentPatch = migrationFn(currentPatch);
      migrated = true;
    } else {
      // Si no hay migración definida, simplemente actualizar versión
      currentPatch.formatVersion = v + 1;
    }
  }
  
  return {
    patch: currentPatch,
    migrated,
    fromVersion
  };
}

/**
 * Verifica si un patch necesita migración.
 * @param {Object} patch - Patch a verificar
 * @returns {boolean}
 */
export function needsMigration(patch) {
  const version = patch.formatVersion || 1;
  return version < FORMAT_VERSION;
}

/**
 * Obtiene información sobre la migración necesaria.
 * @param {Object} patch - Patch a analizar
 * @returns {{needsMigration: boolean, fromVersion: number, toVersion: number}}
 */
export function getMigrationInfo(patch) {
  const fromVersion = patch.formatVersion || 1;
  return {
    needsMigration: fromVersion < FORMAT_VERSION,
    fromVersion,
    toVersion: FORMAT_VERSION
  };
}
