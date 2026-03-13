/**
 * Tests para Panel 6 (Control) Blueprint — Salidas del Secuenciador
 *
 * Verifica las adiciones del secuenciador a la matriz de control:
 * - Sources: Voltajes A-F (filas 100-101, 103-104, 106-107),
 *            Keys 1-3 (filas 102, 105, 108), Key 4 (109), Clock Rate (110)
 * - Destinations: Voltage inputs A·C·E (col 60), B·D·F (col 61), Key (col 62)
 * - Coherencia con la estructura existente (no conflicto con keyboards 111+)
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENCER CV SOURCES (filas 100-110)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Sequencer CV sources', () => {

  it('tiene 11 fuentes sequencer', () => {
    const seqSources = blueprint.sources.filter(s => s.source.kind === 'sequencer');
    assert.strictEqual(seqSources.length, 11);
  });

  // ─── Layer 1 ───────────────────────────────────────────────────────────

  it('Voltage A en fila 100', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageA'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 100);
  });

  it('Voltage B en fila 101', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageB'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 101);
  });

  it('Key 1 en fila 102', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'key1'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 102);
  });

  // ─── Layer 2 ───────────────────────────────────────────────────────────

  it('Voltage C en fila 103', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageC'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 103);
  });

  it('Voltage D en fila 104', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageD'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 104);
  });

  it('Key 2 en fila 105', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'key2'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 105);
  });

  // ─── Layer 3 ───────────────────────────────────────────────────────────

  it('Voltage E en fila 106', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageE'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 106);
  });

  it('Voltage F en fila 107', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'voltageF'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 107);
  });

  it('Key 3 en fila 108', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'key3'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 108);
  });

  // ─── Master Key & Clock ────────────────────────────────────────────────

  it('Key 4 en fila 109', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'key4'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 109);
  });

  it('Clock Rate en fila 110', () => {
    const src = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'clockRate'
    );
    assert.ok(src);
    assert.strictEqual(src.rowSynth, 110);
  });

  it('filas son consecutivas 100-110', () => {
    const seqRows = blueprint.sources
      .filter(s => s.source.kind === 'sequencer')
      .map(s => s.rowSynth)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(seqRows, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  });

  it('no hay conflicto con keyboards (filas 111+)', () => {
    const maxSeqRow = Math.max(
      ...blueprint.sources.filter(s => s.source.kind === 'sequencer').map(s => s.rowSynth)
    );
    assert.ok(maxSeqRow < 111, `fila máxima sequencer ${maxSeqRow} debe ser < 111`);
  });

  it('no hay conflicto con envelope shapers (filas 97-99)', () => {
    const minSeqRow = Math.min(
      ...blueprint.sources.filter(s => s.source.kind === 'sequencer').map(s => s.rowSynth)
    );
    assert.ok(minSeqRow > 99, `fila mínima sequencer ${minSeqRow} debe ser > 99`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENCER VOLTAGE INPUT DESTINATIONS (columnas 60-62)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Sequencer voltage input destinations', () => {

  it('tiene 3 destinos de entrada de voltaje', () => {
    const seqDests = blueprint.destinations.filter(
      d => d.dest.kind === 'sequencerInput'
    );
    assert.strictEqual(seqDests.length, 3);
  });

  it('A·C·E en columna 60', () => {
    const dest = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerInput' && d.dest.inputType === 'voltageACE'
    );
    assert.ok(dest);
    assert.strictEqual(dest.colSynth, 60);
  });

  it('B·D·F en columna 61', () => {
    const dest = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerInput' && d.dest.inputType === 'voltageBDF'
    );
    assert.ok(dest);
    assert.strictEqual(dest.colSynth, 61);
  });

  it('Key en columna 62', () => {
    const dest = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerInput' && d.dest.inputType === 'key'
    );
    assert.ok(dest);
    assert.strictEqual(dest.colSynth, 62);
  });

  it('columnas 60-62 son consecutivas', () => {
    const seqCols = blueprint.destinations
      .filter(d => d.dest.kind === 'sequencerInput')
      .map(d => d.colSynth)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(seqCols, [60, 61, 62]);
  });

  it('columnas 60-62 no colisionan con otros destinos', () => {
    const otherCols = blueprint.destinations
      .filter(d => d.dest.kind !== 'sequencerInput')
      .map(d => d.colSynth);
    for (let col = 60; col <= 62; col++) {
      assert.ok(!otherCols.includes(col), `columna ${col} no debe estar usada por otro módulo`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICIDAD DE COORDENADAS (incluyendo secuenciador)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Unicidad con sequencer', () => {

  it('todas las filas source son únicas', () => {
    const rows = blueprint.sources.map(s => s.rowSynth);
    const unique = new Set(rows);
    assert.strictEqual(unique.size, rows.length, 'filas duplicadas detectadas');
  });

  it('todas las columnas destination son únicas', () => {
    const cols = blueprint.destinations.map(d => d.colSynth);
    const unique = new Set(cols);
    assert.strictEqual(unique.size, cols.length, 'columnas duplicadas detectadas');
  });
});
