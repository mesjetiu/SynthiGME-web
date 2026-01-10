/**
 * Tests de regresión para compilePanelBlueprintMappings
 * Objetivo: asegurar que la conversión Synthi → índice físico
 * salta correctamente los huecos (hiddenCols0 / hiddenRows0).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compilePanelBlueprintMappings } from '../src/assets/js/core/blueprintMapper.js';
import panel5AudioBlueprint from '../src/assets/js/panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from '../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

describe('compilePanelBlueprintMappings – Panel 6', () => {

  const result = compilePanelBlueprintMappings(panel6ControlBlueprint);

  it('debe generar destMap y sourceMap', () => {
    assert.ok(result.destMap instanceof Map, 'destMap debe ser un Map');
    assert.ok(result.sourceMap instanceof Map, 'sourceMap debe ser un Map');
  });

  it('ninguna clave de destMap debe caer en hiddenCols0', () => {
    const hiddenCols = new Set(panel6ControlBlueprint.hiddenCols0 ?? []);
    for (const [colIndex] of result.destMap) {
      assert.ok(
        !hiddenCols.has(colIndex),
        `destMap contiene columna oculta ${colIndex}`
      );
    }
  });

  it('ninguna clave de sourceMap debe caer en hiddenRows0', () => {
    const hiddenRows = new Set(panel6ControlBlueprint.hiddenRows0 ?? []);
    for (const [rowIndex] of result.sourceMap) {
      assert.ok(
        !hiddenRows.has(rowIndex),
        `sourceMap contiene fila oculta ${rowIndex}`
      );
    }
  });

  it('el osciloscopio Y debe estar en columna física 63 (Synthi 63)', () => {
    // Synthi 63 → físico 63 (el hueco está antes, en 33)
    const dest = result.destMap.get(63);
    assert.ok(dest, 'No hay destino en columna 63');
    assert.equal(dest.kind, 'oscilloscope');
    assert.equal(dest.channel, 'Y');
  });

  it('el osciloscopio X debe estar en columna física 64 (Synthi 64)', () => {
    const dest = result.destMap.get(64);
    assert.ok(dest, 'No hay destino en columna 64');
    assert.equal(dest.kind, 'oscilloscope');
    assert.equal(dest.channel, 'X');
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// PANEL 5 (AUDIO) – Tests de regresión
// ═══════════════════════════════════════════════════════════════════════════

describe('compilePanelBlueprintMappings – Panel 5', () => {

  const result = compilePanelBlueprintMappings(panel5AudioBlueprint);

  it('debe generar destMap y sourceMap', () => {
    assert.ok(result.destMap instanceof Map, 'destMap debe ser un Map');
    assert.ok(result.sourceMap instanceof Map, 'sourceMap debe ser un Map');
  });

  it('ninguna clave de destMap debe caer en hiddenCols0', () => {
    const hiddenCols = new Set(panel5AudioBlueprint.hiddenCols0 ?? []);
    for (const [colIndex] of result.destMap) {
      assert.ok(
        !hiddenCols.has(colIndex),
        `destMap contiene columna oculta ${colIndex}`
      );
    }
  });

  it('ninguna clave de sourceMap debe caer en hiddenRows0', () => {
    const hiddenRows = new Set(panel5AudioBlueprint.hiddenRows0 ?? []);
    for (const [rowIndex] of result.sourceMap) {
      assert.ok(
        !hiddenRows.has(rowIndex),
        `sourceMap contiene fila oculta ${rowIndex}`
      );
    }
  });

  // Output buses: columnas Synthi 36–43 → físico 36–43 (el hueco está en 33)
  it('output bus 1 debe estar en columna física 36', () => {
    const dest = result.destMap.get(36);
    assert.ok(dest, 'No hay destino en columna 36');
    assert.equal(dest.kind, 'outputBus');
    assert.equal(dest.bus, 1);
  });

  it('output bus 8 debe estar en columna física 43', () => {
    const dest = result.destMap.get(43);
    assert.ok(dest, 'No hay destino en columna 43');
    assert.equal(dest.kind, 'outputBus');
    assert.equal(dest.bus, 8);
  });

  // Osciloscopio: columnas Synthi 57–58
  it('el osciloscopio Y debe estar en columna física 57 (Synthi 57)', () => {
    const dest = result.destMap.get(57);
    assert.ok(dest, 'No hay destino en columna 57');
    assert.equal(dest.kind, 'oscilloscope');
    assert.equal(dest.channel, 'Y');
  });

  it('el osciloscopio X debe estar en columna física 58 (Synthi 58)', () => {
    const dest = result.destMap.get(58);
    assert.ok(dest, 'No hay destino en columna 58');
    assert.equal(dest.kind, 'oscilloscope');
    assert.equal(dest.channel, 'X');
  });

});
