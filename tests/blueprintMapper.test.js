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

  // ─────────────────────────────────────────────────────────────────────────
  // Tests de FILAS (sources)
  // El sourceMap usa índices secuenciales 0-based (orden de aparición)
  // ─────────────────────────────────────────────────────────────────────────

  // Input Amps: índices 0–7
  it('inputAmp canal 0 debe estar en índice 0', () => {
    const source = result.sourceMap.get(0);
    assert.ok(source, 'No hay source en índice 0');
    assert.equal(source.kind, 'inputAmp');
    assert.equal(source.channel, 0);
  });

  it('inputAmp canal 7 debe estar en índice 7', () => {
    const source = result.sourceMap.get(7);
    assert.ok(source, 'No hay source en índice 7');
    assert.equal(source.kind, 'inputAmp');
    assert.equal(source.channel, 7);
  });

  // Output buses como sources: índices 8–15
  it('outputBus 1 (source) debe estar en índice 8', () => {
    const source = result.sourceMap.get(8);
    assert.ok(source, 'No hay source en índice 8');
    assert.equal(source.kind, 'outputBus');
    assert.equal(source.bus, 1);
  });

  it('outputBus 8 (source) debe estar en índice 15', () => {
    const source = result.sourceMap.get(15);
    assert.ok(source, 'No hay source en índice 15');
    assert.equal(source.kind, 'outputBus');
    assert.equal(source.bus, 8);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Tests de FILAS (sources)
  // El sourceMap usa índices secuenciales 0-based (orden de aparición)
  // ─────────────────────────────────────────────────────────────────────────

  // Input Amps: índices 0–7
  it('inputAmp canal 0 debe estar en índice 0', () => {
    const source = result.sourceMap.get(0);
    assert.ok(source, 'No hay source en índice 0');
    assert.equal(source.kind, 'inputAmp');
    assert.equal(source.channel, 0);
  });

  it('inputAmp canal 7 debe estar en índice 7', () => {
    const source = result.sourceMap.get(7);
    assert.ok(source, 'No hay source en índice 7');
    assert.equal(source.kind, 'inputAmp');
    assert.equal(source.channel, 7);
  });

  // Output buses como sources: índices 8–15
  it('outputBus 1 (source) debe estar en índice 8', () => {
    const source = result.sourceMap.get(8);
    assert.ok(source, 'No hay source en índice 8');
    assert.equal(source.kind, 'outputBus');
    assert.equal(source.bus, 1);
  });

  it('outputBus 8 (source) debe estar en índice 15', () => {
    const source = result.sourceMap.get(15);
    assert.ok(source, 'No hay source en índice 15');
    assert.equal(source.kind, 'outputBus');
    assert.equal(source.bus, 8);
  });

  // Generadores de ruido: índices 22–23
  it('noiseGen 0 debe estar en índice 22', () => {
    const source = result.sourceMap.get(22);
    assert.ok(source, 'No hay source en índice 22');
    assert.equal(source.kind, 'noiseGen');
    assert.equal(source.index, 0);
  });

  it('noiseGen 1 debe estar en índice 23', () => {
    const source = result.sourceMap.get(23);
    assert.ok(source, 'No hay source en índice 23');
    assert.equal(source.kind, 'noiseGen');
    assert.equal(source.index, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HARD SYNC: columnas Synthi 24–35 → Osc 1–12 sync inputs
  // ─────────────────────────────────────────────────────────────────────────
  // La señal conectada a estas columnas resetea la fase del oscilador destino
  // en cada flanco positivo (hard sync clásico de síntesis analógica).
  //
  // Mapeo (colBase=1):
  //   colSynth 24 → ordinal 23 → col física 23 → oscIndex 0 (Osc 1)
  //   colSynth 33 → ordinal 32 → col física 32 → oscIndex 9 (Osc 10)
  //   colSynth 34 → ordinal 33 → pero hay hueco en 33, salta a 34 → oscIndex 10 (Osc 11)
  //   colSynth 35 → ordinal 34 → col física 35 → oscIndex 11 (Osc 12)
  //
  // IMPORTANTE: La columna física 33 está en hiddenCols0 (es un hueco visual).

  it('oscSync para Osc 1 debe estar en columna física 23 (Synthi 24)', () => {
    const dest = result.destMap.get(23);
    assert.ok(dest, 'No hay destino en columna 23 (Osc 1 Sync)');
    assert.equal(dest.kind, 'oscSync');
    assert.equal(dest.oscIndex, 0);
  });

  it('oscSync para Osc 6 debe estar en columna física 28 (Synthi 29)', () => {
    const dest = result.destMap.get(28);
    assert.ok(dest, 'No hay destino en columna 28 (Osc 6 Sync)');
    assert.equal(dest.kind, 'oscSync');
    assert.equal(dest.oscIndex, 5);
  });

  it('oscSync para Osc 10 debe estar en columna física 32 (Synthi 33)', () => {
    // Columna Synthi 33 está ANTES del hueco físico 33
    const dest = result.destMap.get(32);
    assert.ok(dest, 'No hay destino en columna 32 (Osc 10 Sync)');
    assert.equal(dest.kind, 'oscSync');
    assert.equal(dest.oscIndex, 9);
  });

  it('oscSync para Osc 11 salta a columna física 34 (Synthi 34, hueco en 33)', () => {
    // El hueco está en índice físico 33, así que Synthi 34 → físico 34
    const dest = result.destMap.get(34);
    assert.ok(dest, 'No hay destino en columna 34 (Osc 11 Sync)');
    assert.equal(dest.kind, 'oscSync');
    assert.equal(dest.oscIndex, 10);
  });

  it('oscSync para Osc 12 debe estar en columna física 35 (Synthi 35)', () => {
    const dest = result.destMap.get(35);
    assert.ok(dest, 'No hay destino en columna 35 (Osc 12 Sync)');
    assert.equal(dest.kind, 'oscSync');
    assert.equal(dest.oscIndex, 11);
  });

  it('debe haber 12 destinos oscSync (uno por oscilador)', () => {
    let syncCount = 0;
    for (const [, dest] of result.destMap) {
      if (dest.kind === 'oscSync') {
        syncCount++;
      }
    }
    assert.equal(syncCount, 12, 'Debe haber exactamente 12 destinos oscSync');
  });

  it('los oscIndex de oscSync deben ser consecutivos 0–11', () => {
    const syncIndices = [];
    for (const [, dest] of result.destMap) {
      if (dest.kind === 'oscSync') {
        syncIndices.push(dest.oscIndex);
      }
    }
    syncIndices.sort((a, b) => a - b);
    assert.deepEqual(
      syncIndices,
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      'Los oscIndex deben cubrir 0–11'
    );
  });

});
