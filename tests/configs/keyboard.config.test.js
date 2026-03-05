/**
 * Tests para keyboard.config.js — Teclados duales Synthi 100
 * 
 * Verifica la configuración del módulo de teclado:
 * - Estructura del esquema (schemaVersion, id, title)
 * - Filas de la matriz de control (Panel 6): upper 111-113, lower 114-116
 * - Parámetros de audio (pivotNote, spreadUnity, velocityRangeV, retriggerGapMs)
 * - Rangos y valores iniciales de los 4 knobs
 * - Configuración de switches (retrigger)
 * - Coherencia entre parámetros
 * 
 * Referencia: Datanomics 1982, teclados duales del Synthi 100 de Cuenca
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { keyboardConfig } from '../../src/assets/js/configs/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Estructura', () => {
  
  it('tiene schemaVersion >= 1', () => {
    assert.ok(typeof keyboardConfig.schemaVersion === 'number');
    assert.ok(keyboardConfig.schemaVersion >= 1);
  });
  
  it('tiene id "keyboard"', () => {
    assert.strictEqual(keyboardConfig.id, 'keyboard');
  });
  
  it('tiene title "Keyboard"', () => {
    assert.strictEqual(keyboardConfig.title, 'Keyboard');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX ROWS (Panel 6)
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Matrix rows (Panel 6)', () => {
  
  it('tiene matrixRow definido para upper y lower', () => {
    assert.ok(keyboardConfig.matrixRow);
    assert.ok(keyboardConfig.matrixRow.upper);
    assert.ok(keyboardConfig.matrixRow.lower);
  });
  
  it('upper tiene 3 outputs (pitch, velocity, gate)', () => {
    const upper = keyboardConfig.matrixRow.upper;
    assert.strictEqual(Object.keys(upper).length, 3);
    assert.ok('pitch' in upper);
    assert.ok('velocity' in upper);
    assert.ok('gate' in upper);
  });
  
  it('lower tiene 3 outputs (pitch, velocity, gate)', () => {
    const lower = keyboardConfig.matrixRow.lower;
    assert.strictEqual(Object.keys(lower).length, 3);
    assert.ok('pitch' in lower);
    assert.ok('velocity' in lower);
    assert.ok('gate' in lower);
  });
  
  it('upper pitch está en fila 111', () => {
    assert.strictEqual(keyboardConfig.matrixRow.upper.pitch, 111);
  });
  
  it('upper velocity está en fila 112', () => {
    assert.strictEqual(keyboardConfig.matrixRow.upper.velocity, 112);
  });
  
  it('upper gate está en fila 113', () => {
    assert.strictEqual(keyboardConfig.matrixRow.upper.gate, 113);
  });
  
  it('lower pitch está en fila 114', () => {
    assert.strictEqual(keyboardConfig.matrixRow.lower.pitch, 114);
  });
  
  it('lower velocity está en fila 115', () => {
    assert.strictEqual(keyboardConfig.matrixRow.lower.velocity, 115);
  });
  
  it('lower gate está en fila 116', () => {
    assert.strictEqual(keyboardConfig.matrixRow.lower.gate, 116);
  });
  
  it('filas upper (111-113) y lower (114-116) no se solapan', () => {
    const u = keyboardConfig.matrixRow.upper;
    const l = keyboardConfig.matrixRow.lower;
    const upperRows = new Set([u.pitch, u.velocity, u.gate]);
    const lowerRows = new Set([l.pitch, l.velocity, l.gate]);
    for (const row of upperRows) {
      assert.ok(!lowerRows.has(row), `Fila ${row} compartida entre upper y lower`);
    }
  });
  
  it('filas upper son consecutivas 111, 112, 113', () => {
    const u = keyboardConfig.matrixRow.upper;
    assert.strictEqual(u.velocity - u.pitch, 1);
    assert.strictEqual(u.gate - u.velocity, 1);
  });
  
  it('filas lower son consecutivas 114, 115, 116', () => {
    const l = keyboardConfig.matrixRow.lower;
    assert.strictEqual(l.velocity - l.pitch, 1);
    assert.strictEqual(l.gate - l.velocity, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Audio params', () => {
  
  it('pivotNote es 66 (F#3)', () => {
    assert.strictEqual(keyboardConfig.audio.pivotNote, 66);
  });
  
  it('spreadUnity es 9 (1V/Oct)', () => {
    assert.strictEqual(keyboardConfig.audio.spreadUnity, 9);
  });
  
  it('velocityRangeV es 7 (±3.5V)', () => {
    assert.strictEqual(keyboardConfig.audio.velocityRangeV, 7);
  });
  
  it('retriggerGapMs es 2', () => {
    assert.strictEqual(keyboardConfig.audio.retriggerGapMs, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Knobs', () => {
  
  it('tiene 4 knobs definidos', () => {
    const knobs = keyboardConfig.knobs;
    assert.ok(knobs);
    assert.strictEqual(Object.keys(knobs).length, 4);
  });
  
  describe('pitchSpread', () => {
    
    it('rango 0 a 10', () => {
      assert.strictEqual(keyboardConfig.knobs.pitchSpread.min, 0);
      assert.strictEqual(keyboardConfig.knobs.pitchSpread.max, 10);
    });
    
    it('valor inicial 9 (1V/Oct)', () => {
      assert.strictEqual(keyboardConfig.knobs.pitchSpread.initial, 9);
    });
    
    it('initial coincide con spreadUnity', () => {
      assert.strictEqual(
        keyboardConfig.knobs.pitchSpread.initial,
        keyboardConfig.audio.spreadUnity
      );
    });
  });
  
  describe('pitchOffset', () => {
    
    it('rango -5 a 5', () => {
      assert.strictEqual(keyboardConfig.knobs.pitchOffset.min, -5);
      assert.strictEqual(keyboardConfig.knobs.pitchOffset.max, 5);
    });
    
    it('valor inicial 0 (sin desplazamiento)', () => {
      assert.strictEqual(keyboardConfig.knobs.pitchOffset.initial, 0);
    });
  });
  
  describe('velocityLevel', () => {
    
    it('rango -5 a 5', () => {
      assert.strictEqual(keyboardConfig.knobs.velocityLevel.min, -5);
      assert.strictEqual(keyboardConfig.knobs.velocityLevel.max, 5);
    });
    
    it('valor inicial 5 (pleno efecto positivo)', () => {
      assert.strictEqual(keyboardConfig.knobs.velocityLevel.initial, 5);
    });
  });
  
  describe('gateLevel', () => {
    
    it('rango -5 a 5', () => {
      assert.strictEqual(keyboardConfig.knobs.gateLevel.min, -5);
      assert.strictEqual(keyboardConfig.knobs.gateLevel.max, 5);
    });
    
    it('valor inicial 5 (+5V gate)', () => {
      assert.strictEqual(keyboardConfig.knobs.gateLevel.initial, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SWITCHES
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Switches', () => {
  
  it('tiene switch de retrigger', () => {
    assert.ok(keyboardConfig.switches);
    assert.ok(keyboardConfig.switches.retrigger);
  });
  
  it('retrigger initial es 0 (key release / Kbd)', () => {
    assert.strictEqual(keyboardConfig.switches.retrigger.initial, 0);
  });
  
  it('retrigger labels son Kbd y On', () => {
    assert.strictEqual(keyboardConfig.switches.retrigger.labelA, 'Kbd');
    assert.strictEqual(keyboardConfig.switches.retrigger.labelB, 'On');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMPS
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Config — Ramps', () => {
  
  it('tiene ramp de level definido', () => {
    assert.ok(keyboardConfig.ramps);
    assert.ok(typeof keyboardConfig.ramps.level === 'number');
    assert.ok(keyboardConfig.ramps.level > 0);
  });
});
