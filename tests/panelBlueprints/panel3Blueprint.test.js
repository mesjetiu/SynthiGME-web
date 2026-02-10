/**
 * Tests para el blueprint del Panel 3 (Oscillators + Noise + Random CV)
 * 
 * Verifica la configuración correcta de:
 * - Estructura básica (schemaVersion, panelId, showFrames)
 * - Layout de osciladores (grid 2×6, tamaños, gap)
 * - Layout de modulesRow (noiseSize, randomCVSize)
 * - Defaults visuales de osciladores (oscillatorUI)
 * - Defaults visuales de módulos de ruido (noiseUI) y random CV (randomCVUI)
 * - Slots de osciladores (12 slots, distribución correcta)
 * - Módulos declarados (noise1, noise2, randomCV)
 * - Separación blueprint/config (ausencia de propiedades de audio)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel3Blueprint from '../../src/assets/js/panelBlueprints/panel3.blueprint.js';

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE ESTRUCTURA BÁSICA
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion definido', () => {
    assert.ok(panel3Blueprint.schemaVersion >= 1, 'schemaVersion debe ser >= 1');
  });

  it('tiene panelId "panel-3"', () => {
    assert.strictEqual(panel3Blueprint.panelId, 'panel-3');
  });

  it('tiene showFrames como booleano', () => {
    assert.strictEqual(typeof panel3Blueprint.showFrames, 'boolean');
  });

  it('tiene layout definido', () => {
    assert.ok(panel3Blueprint.layout, 'debe tener layout');
  });

  it('tiene oscillatorUI definido', () => {
    assert.ok(panel3Blueprint.oscillatorUI, 'debe tener oscillatorUI');
  });

  it('tiene noiseUI definido', () => {
    assert.ok(panel3Blueprint.noiseUI, 'debe tener noiseUI');
  });

  it('tiene randomCVUI definido', () => {
    assert.ok(panel3Blueprint.randomCVUI, 'debe tener randomCVUI');
  });

  it('tiene oscillatorSlots definido', () => {
    assert.ok(Array.isArray(panel3Blueprint.oscillatorSlots), 'oscillatorSlots debe ser array');
  });

  it('tiene modules definido', () => {
    assert.ok(panel3Blueprint.modules, 'debe tener modules');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT - OSCILADORES
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Layout osciladores', () => {
  const osc = panel3Blueprint.layout.oscillators;

  it('tiene grid de 2 columnas', () => {
    assert.strictEqual(osc.columns, 2);
  });

  it('tiene 6 filas por columna', () => {
    assert.strictEqual(osc.rowsPerColumn, 6);
  });

  it('tiene oscSize con width y height positivos', () => {
    assert.ok(osc.oscSize, 'debe tener oscSize');
    assert.ok(osc.oscSize.width > 0, 'width positivo');
    assert.ok(osc.oscSize.height > 0, 'height positivo');
  });

  it('tiene gap con x e y numéricos', () => {
    assert.ok(osc.gap, 'debe tener gap');
    assert.strictEqual(typeof osc.gap.x, 'number');
    assert.strictEqual(typeof osc.gap.y, 'number');
  });

  it('tiene reservedHeight para fila de módulos', () => {
    assert.strictEqual(typeof osc.reservedHeight, 'number');
    assert.ok(osc.reservedHeight > 0, 'reservedHeight debe ser positivo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE LAYOUT - FILA DE MÓDULOS (Noise + Random CV)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Layout modulesRow', () => {
  const row = panel3Blueprint.layout.modulesRow;

  it('tiene gap numérico', () => {
    assert.strictEqual(typeof row.gap, 'number');
  });

  it('tiene noiseSize con width y height', () => {
    assert.ok(row.noiseSize, 'debe tener noiseSize');
    assert.ok(row.noiseSize.width > 0);
    assert.ok(row.noiseSize.height > 0);
  });

  it('tiene randomCVSize con width y height', () => {
    assert.ok(row.randomCVSize, 'debe tener randomCVSize');
    assert.ok(row.randomCVSize.width > 0);
    assert.ok(row.randomCVSize.height > 0);
  });

  it('randomCV es más ancho que noise (tiene 5 knobs vs 2)', () => {
    assert.ok(
      row.randomCVSize.width > row.noiseSize.width,
      'randomCVSize.width debe ser mayor que noiseSize.width'
    );
  });

  it('tiene padding con 4 lados', () => {
    const p = row.padding;
    assert.ok(p, 'debe tener padding');
    assert.strictEqual(typeof p.top, 'number');
    assert.strictEqual(typeof p.right, 'number');
    assert.strictEqual(typeof p.bottom, 'number');
    assert.strictEqual(typeof p.left, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE oscillatorUI (DEFAULTS VISUALES)
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - oscillatorUI', () => {
  const ui = panel3Blueprint.oscillatorUI;

  it('tiene knobSize numérico positivo', () => {
    assert.strictEqual(typeof ui.knobSize, 'number');
    assert.ok(ui.knobSize > 0);
  });

  it('tiene knobInnerPct entre 0 y 100', () => {
    assert.ok(ui.knobInnerPct > 0 && ui.knobInnerPct <= 100);
  });

  it('knobGap es array de 6 elementos (huecos entre 7 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap), 'knobGap debe ser array');
    assert.strictEqual(ui.knobGap.length, 6,
      `knobGap debe tener 6 elementos (7 knobs - 1), tiene ${ui.knobGap.length}`);
    ui.knobGap.forEach((g, i) => {
      assert.strictEqual(typeof g, 'number', `knobGap[${i}] debe ser número`);
    });
  });

  it('knobOffsets es array de 7 elementos (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets), 'knobOffsets debe ser array');
    assert.strictEqual(ui.knobOffsets.length, 7,
      `knobOffsets debe tener 7 elementos, tiene ${ui.knobOffsets.length}`);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY numéricos', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });

  it('tiene switchOffset con leftPercent y topPx', () => {
    assert.ok(ui.switchOffset, 'debe tener switchOffset');
    assert.strictEqual(typeof ui.switchOffset.leftPercent, 'number');
    assert.strictEqual(typeof ui.switchOffset.topPx, 'number');
  });

  it('tiene slotOffset con x e y', () => {
    assert.ok(ui.slotOffset, 'debe tener slotOffset');
    assert.strictEqual(typeof ui.slotOffset.x, 'number');
    assert.strictEqual(typeof ui.slotOffset.y, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE noiseUI Y randomCVUI
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - noiseUI', () => {
  const ui = panel3Blueprint.noiseUI;

  it('tiene knobSize numérico positivo', () => {
    assert.ok(ui.knobSize > 0);
  });

  it('knobGap es array (1 hueco para 2 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap));
    assert.strictEqual(ui.knobGap.length, 1,
      'Noise tiene 2 knobs → 1 hueco');
  });

  it('knobOffsets es array de 2 (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets));
    assert.strictEqual(ui.knobOffsets.length, 2);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });
});

describe('Panel 3 Blueprint - randomCVUI', () => {
  const ui = panel3Blueprint.randomCVUI;

  it('tiene knobSize numérico positivo', () => {
    assert.ok(ui.knobSize > 0);
  });

  it('knobGap es array de 4 (huecos entre 5 knobs)', () => {
    assert.ok(Array.isArray(ui.knobGap));
    assert.strictEqual(ui.knobGap.length, 4,
      'Random CV tiene 5 knobs → 4 huecos');
  });

  it('knobOffsets es array de 5 (1 por knob)', () => {
    assert.ok(Array.isArray(ui.knobOffsets));
    assert.strictEqual(ui.knobOffsets.length, 5);
  });

  it('tiene knobRowOffsetX y knobRowOffsetY', () => {
    assert.strictEqual(typeof ui.knobRowOffsetX, 'number');
    assert.strictEqual(typeof ui.knobRowOffsetY, 'number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SLOTS DE OSCILADORES
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - oscillatorSlots', () => {
  const slots = panel3Blueprint.oscillatorSlots;

  it('tiene 12 slots (osciladores 1-12)', () => {
    assert.strictEqual(slots.length, 12);
  });

  it('cada slot tiene oscIndex, col y row', () => {
    slots.forEach((slot, i) => {
      assert.strictEqual(typeof slot.oscIndex, 'number', `slot[${i}].oscIndex debe ser número`);
      assert.strictEqual(typeof slot.col, 'number', `slot[${i}].col debe ser número`);
      assert.strictEqual(typeof slot.row, 'number', `slot[${i}].row debe ser número`);
    });
  });

  it('oscIndex cubre 0-11 sin repetir', () => {
    const indices = slots.map(s => s.oscIndex).sort((a, b) => a - b);
    assert.deepStrictEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('usa 2 columnas (0 y 1)', () => {
    const cols = new Set(slots.map(s => s.col));
    assert.deepStrictEqual([...cols].sort(), [0, 1]);
  });

  it('usa 6 filas por columna (0-5)', () => {
    const rows = new Set(slots.map(s => s.row));
    assert.deepStrictEqual([...rows].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  });

  it('6 osciladores por columna', () => {
    const col0 = slots.filter(s => s.col === 0);
    const col1 = slots.filter(s => s.col === 1);
    assert.strictEqual(col0.length, 6, 'columna izquierda: 6 osciladores');
    assert.strictEqual(col1.length, 6, 'columna derecha: 6 osciladores');
  });

  it('distribución intercalada: impares a la izquierda, pares a la derecha', () => {
    // Columna 0: osc 1,3,5,7,9,11 (oscIndex 0,2,4,6,8,10)
    const col0Indices = slots.filter(s => s.col === 0).map(s => s.oscIndex).sort((a, b) => a - b);
    assert.deepStrictEqual(col0Indices, [0, 2, 4, 6, 8, 10], 'col 0: índices pares (osc impares)');

    // Columna 1: osc 2,4,6,8,10,12 (oscIndex 1,3,5,7,9,11)
    const col1Indices = slots.filter(s => s.col === 1).map(s => s.oscIndex).sort((a, b) => a - b);
    assert.deepStrictEqual(col1Indices, [1, 3, 5, 7, 9, 11], 'col 1: índices impares (osc pares)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Módulos', () => {
  const modules = panel3Blueprint.modules;

  it('tiene noise1', () => {
    assert.ok('noise1' in modules, 'debe tener módulo noise1');
  });

  it('tiene noise2', () => {
    assert.ok('noise2' in modules, 'debe tener módulo noise2');
  });

  it('tiene randomCV', () => {
    assert.ok('randomCV' in modules, 'debe tener módulo randomCV');
  });

  it('tiene exactamente 3 módulos', () => {
    const keys = Object.keys(modules);
    assert.strictEqual(keys.length, 3,
      `debe haber 3 módulos, hay ${keys.length}: ${keys.join(', ')}`);
  });

  it('cada módulo es un objeto (puede tener ui overrides)', () => {
    for (const [key, mod] of Object.entries(modules)) {
      assert.strictEqual(typeof mod, 'object', `modules.${key} debe ser objeto`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTS DE SEPARACIÓN BLUEPRINT / CONFIG
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Blueprint - Separación blueprint/config', () => {

  it('NO tiene sources ni destinations (no es matrix blueprint)', () => {
    assert.strictEqual(panel3Blueprint.sources, undefined);
    assert.strictEqual(panel3Blueprint.destinations, undefined);
  });

  it('NO tiene grid (eso es de matrix blueprints)', () => {
    assert.strictEqual(panel3Blueprint.grid, undefined);
  });

  it('NO tiene matrixId (no es matrix blueprint)', () => {
    assert.strictEqual(panel3Blueprint.matrixId, undefined);
  });

  it('NO tiene routing', () => {
    assert.strictEqual(panel3Blueprint.routing, undefined);
  });

  it('NO tiene parámetros de audio en oscillatorUI', () => {
    const ui = panel3Blueprint.oscillatorUI;
    // Estos pertenecen a oscillator.config.js
    assert.strictEqual(ui.frequency, undefined, 'no debe tener frequency');
    assert.strictEqual(ui.range, undefined, 'no debe tener range');
    assert.strictEqual(ui.waveform, undefined, 'no debe tener waveform');
  });

  it('NO tiene matrixMapping (eliminado en refactoring)', () => {
    assert.strictEqual(panel3Blueprint.matrixMapping, undefined);
  });
});
