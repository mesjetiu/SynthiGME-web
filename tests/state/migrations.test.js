/**
 * Tests para state/migrations.js
 * 
 * Verifica:
 * - needsMigration(): detección de patches que requieren migración
 * - getMigrationInfo(): información sobre migración necesaria
 * - migratePatch(): aplicación de migraciones secuenciales
 * - Patches actuales no se modifican innecesariamente
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FORMAT_VERSION } from '../../src/assets/js/state/schema.js';
import {
  migratePatch,
  needsMigration,
  getMigrationInfo
} from '../../src/assets/js/state/migrations.js';

// ═══════════════════════════════════════════════════════════════════════════
// needsMigration
// ═══════════════════════════════════════════════════════════════════════════

describe('needsMigration', () => {

  it('patch con versión actual no necesita migración', () => {
    const patch = { formatVersion: FORMAT_VERSION, name: 'Test' };
    assert.equal(needsMigration(patch), false);
  });

  it('patch con versión anterior necesita migración', () => {
    const patch = { formatVersion: FORMAT_VERSION - 1, name: 'Test' };
    // Solo aplica si FORMAT_VERSION > 1
    if (FORMAT_VERSION > 1) {
      assert.equal(needsMigration(patch), true);
    }
  });

  it('patch sin formatVersion (v1 implícito) se evalúa correctamente', () => {
    const patch = { name: 'Old Patch' };
    // Si FORMAT_VERSION es 1, no necesita migración
    // Si FORMAT_VERSION > 1, sí necesita
    const expected = FORMAT_VERSION > 1;
    assert.equal(needsMigration(patch), expected);
  });

  it('patch con versión futura no necesita migración', () => {
    const patch = { formatVersion: FORMAT_VERSION + 10, name: 'Future' };
    assert.equal(needsMigration(patch), false);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// getMigrationInfo
// ═══════════════════════════════════════════════════════════════════════════

describe('getMigrationInfo', () => {

  it('devuelve info correcta para patch actual', () => {
    const patch = { formatVersion: FORMAT_VERSION, name: 'Test' };
    const info = getMigrationInfo(patch);
    
    assert.equal(info.needsMigration, false);
    assert.equal(info.fromVersion, FORMAT_VERSION);
    assert.equal(info.toVersion, FORMAT_VERSION);
  });

  it('devuelve info correcta para patch antiguo', () => {
    const patch = { formatVersion: 1, name: 'Old' };
    const info = getMigrationInfo(patch);
    
    assert.equal(info.fromVersion, 1);
    assert.equal(info.toVersion, FORMAT_VERSION);
    assert.equal(info.needsMigration, FORMAT_VERSION > 1);
  });

  it('patch sin formatVersion se trata como v1', () => {
    const patch = { name: 'Legacy' };
    const info = getMigrationInfo(patch);
    
    assert.equal(info.fromVersion, 1);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// migratePatch
// ═══════════════════════════════════════════════════════════════════════════

describe('migratePatch', () => {

  it('patch con versión actual no se modifica', () => {
    const original = { 
      formatVersion: FORMAT_VERSION, 
      name: 'Test',
      modules: { osc1: { knobs: [0, 0.5, 0, 0.5, 0, 0, 0] } }
    };
    const result = migratePatch(original);
    
    assert.equal(result.migrated, false);
    assert.equal(result.fromVersion, FORMAT_VERSION);
    assert.deepEqual(result.patch.modules, original.modules);
  });

  it('devuelve fromVersion correcta', () => {
    const patch = { formatVersion: 1, name: 'Test' };
    const result = migratePatch(patch);
    
    assert.equal(result.fromVersion, 1);
  });

  it('patch sin formatVersion se trata como v1', () => {
    const patch = { name: 'Legacy' };
    const result = migratePatch(patch);
    
    assert.equal(result.fromVersion, 1);
  });

  it('preserva datos del patch original', () => {
    const original = { 
      formatVersion: FORMAT_VERSION,
      name: 'My Patch',
      modules: { 
        oscillators: { osc1: { knobs: [1, 0.5, 0, 0.5, 0, 0, 0.3] } }
      },
      matrix: { audio: [[0, 5]], control: [] }
    };
    const result = migratePatch(original);
    
    assert.equal(result.patch.name, 'My Patch');
    assert.deepEqual(result.patch.matrix.audio, [[0, 5]]);
  });

  it('no muta el patch original', () => {
    const original = { formatVersion: FORMAT_VERSION, name: 'Test' };
    const originalCopy = JSON.parse(JSON.stringify(original));
    
    migratePatch(original);
    
    assert.deepEqual(original, originalCopy);
  });

  // Test para cuando haya migraciones reales
  it('actualiza formatVersion al migrar', () => {
    // Simular patch de versión antigua
    if (FORMAT_VERSION > 1) {
      const patch = { formatVersion: 1, name: 'Old' };
      const result = migratePatch(patch);
      
      assert.equal(result.patch.formatVersion, FORMAT_VERSION);
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// CASOS DE REGRESIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('regresión: patches válidos no se rompen', () => {

  it('patch minimal válido sobrevive migración', () => {
    const patch = { 
      formatVersion: FORMAT_VERSION,
      name: 'Minimal',
      modules: {},
      matrix: { audio: [], control: [] }
    };
    
    const result = migratePatch(patch);
    
    assert.equal(result.patch.name, 'Minimal');
    assert.equal(result.migrated, false);
  });

  it('patch completo con osciladores sobrevive', () => {
    const patch = { 
      formatVersion: FORMAT_VERSION,
      name: 'Full',
      modules: {
        oscillators: {
          osc1: { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' },
          osc12: { knobs: [1, 0.3, 0.8, 0.2, 0.5, 0.7, 0.9], rangeState: 'lo' }
        },
        noise: {
          noise1: { colour: 0.5, level: 0.3 }
        }
      },
      matrix: { 
        audio: [[0, 5], [3, 12], [7, 45]], 
        control: [[1, 2]] 
      }
    };
    
    const result = migratePatch(patch);
    
    // Verificar que los datos se preservan
    assert.equal(result.patch.modules.oscillators.osc1.rangeState, 'hi');
    assert.equal(result.patch.modules.oscillators.osc12.knobs[0], 1);
    assert.equal(result.patch.modules.noise.noise1.colour, 0.5);
    assert.equal(result.patch.matrix.audio.length, 3);
  });

});
