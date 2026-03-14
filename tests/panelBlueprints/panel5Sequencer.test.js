/**
 * Tests para Panel 5 (Audio) Blueprint — Entradas del Secuenciador
 *
 * Verifica las adiciones del secuenciador a la matriz de audio:
 * - Sources: Sequencer DAC 1 (fila 87) y DAC 2 (fila 88)
 * - Destinations: Control inputs (cols 51-55: clock, reset, fwd, rev, stop)
 * - Coherencia con la estructura existente del blueprint
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import blueprint from '../../src/assets/js/panelBlueprints/panel5.audio.blueprint.js';

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENCER SOURCES (filas 87-88)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint — Sequencer sources', () => {

  it('tiene 2 fuentes sequencer (DAC 1, Clock)', () => {
    const seqSources = blueprint.sources.filter(s => s.source.kind === 'sequencer');
    assert.strictEqual(seqSources.length, 2);
  });

  it('DAC 1 está en fila 87', () => {
    const dac1 = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'dac1'
    );
    assert.ok(dac1, 'DAC 1 (output dac1) debe existir');
    assert.strictEqual(dac1.rowSynth, 87);
  });

  it('Clock está en fila 88', () => {
    const clock = blueprint.sources.find(
      s => s.source.kind === 'sequencer' && s.source.output === 'clock'
    );
    assert.ok(clock, 'Clock (output clock) debe existir');
    assert.strictEqual(clock.rowSynth, 88);
  });

  it('filas 87-88 no colisionan con otras fuentes', () => {
    const rowsUsed = blueprint.sources
      .filter(s => s.source.kind !== 'sequencer')
      .map(s => s.rowSynth);
    assert.ok(!rowsUsed.includes(87), 'fila 87 no debe estar usada por otro módulo');
    assert.ok(!rowsUsed.includes(88), 'fila 88 no debe estar usada por otro módulo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENCER CONTROL DESTINATIONS (columnas 51-55)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint — Sequencer control destinations', () => {

  it('tiene 5 destinos de control del secuenciador', () => {
    const seqDests = blueprint.destinations.filter(
      d => d.dest.kind === 'sequencerControl'
    );
    assert.strictEqual(seqDests.length, 5);
  });

  it('clock en columna 51', () => {
    const clock = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerControl' && d.dest.controlType === 'clock'
    );
    assert.ok(clock);
    assert.strictEqual(clock.colSynth, 51);
  });

  it('reset en columna 52', () => {
    const reset = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerControl' && d.dest.controlType === 'reset'
    );
    assert.ok(reset);
    assert.strictEqual(reset.colSynth, 52);
  });

  it('forward en columna 53', () => {
    const fwd = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerControl' && d.dest.controlType === 'forward'
    );
    assert.ok(fwd);
    assert.strictEqual(fwd.colSynth, 53);
  });

  it('reverse en columna 54', () => {
    const rev = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerControl' && d.dest.controlType === 'reverse'
    );
    assert.ok(rev);
    assert.strictEqual(rev.colSynth, 54);
  });

  it('stop en columna 55', () => {
    const stop = blueprint.destinations.find(
      d => d.dest.kind === 'sequencerControl' && d.dest.controlType === 'stop'
    );
    assert.ok(stop);
    assert.strictEqual(stop.colSynth, 55);
  });

  it('columnas 51-55 son consecutivas', () => {
    const seqCols = blueprint.destinations
      .filter(d => d.dest.kind === 'sequencerControl')
      .map(d => d.colSynth)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(seqCols, [51, 52, 53, 54, 55]);
  });

  it('columnas 51-55 no colisionan con otros destinos', () => {
    const otherCols = blueprint.destinations
      .filter(d => d.dest.kind !== 'sequencerControl')
      .map(d => d.colSynth);
    for (let col = 51; col <= 55; col++) {
      assert.ok(!otherCols.includes(col), `columna ${col} no debe estar usada por otro módulo`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNICIDAD DE COORDENADAS (incluyendo secuenciador)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint — Unicidad con sequencer', () => {

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
