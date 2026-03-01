/**
 * Tests para Panel 5 (Audio) Blueprint
 * 
 * Verifica la configuración correcta de la matriz de audio:
 * - Estructura básica (schemaVersion, panelId, matrixId, grid)
 * - Sources: inputAmps, outputBuses, noise generators, oscillators
 * - Destinations: oscSync, outputBus, oscilloscope, oscPWM
 * - PWM destinations (columnas 59-64) solo para osciladores 0-5
 * - Coherencia y unicidad de coordenadas
 * 
 * @module tests/panelBlueprints/panel5Blueprint.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import blueprint from '../../src/assets/js/panelBlueprints/panel5.audio.blueprint.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint - Estructura básica', () => {

  it('tiene schemaVersion >= 1', () => {
    assert.ok(blueprint.schemaVersion >= 1);
  });

  it('tiene panelId "panel-5"', () => {
    assert.strictEqual(blueprint.panelId, 'panel-5');
  });

  it('tiene matrixId "audio"', () => {
    assert.strictEqual(blueprint.matrixId, 'audio');
  });

  it('tiene grid con rows y cols', () => {
    assert.ok(blueprint.grid);
    assert.strictEqual(typeof blueprint.grid.rows, 'number');
    assert.strictEqual(typeof blueprint.grid.cols, 'number');
    assert.ok(blueprint.grid.rows > 0);
    assert.ok(blueprint.grid.cols > 0);
  });

  it('tiene coordSystem con rowBase y colBase', () => {
    assert.ok(blueprint.grid.coordSystem);
    assert.strictEqual(typeof blueprint.grid.coordSystem.rowBase, 'number');
    assert.strictEqual(typeof blueprint.grid.coordSystem.colBase, 'number');
  });

  it('tiene ui con hiddenCols0 y hiddenRows0', () => {
    assert.ok(blueprint.ui);
    assert.ok(Array.isArray(blueprint.ui.hiddenCols0));
    assert.ok(Array.isArray(blueprint.ui.hiddenRows0));
  });

  it('tiene sources como array no vacío', () => {
    assert.ok(Array.isArray(blueprint.sources));
    assert.ok(blueprint.sources.length > 0);
  });

  it('tiene destinations como array no vacío', () => {
    assert.ok(Array.isArray(blueprint.destinations));
    assert.ok(blueprint.destinations.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint - Sources', () => {

  it('tiene 36 fuentes en total (8 inputAmp + 8 outputBus + 2 noise + 18 osc)', () => {
    assert.strictEqual(blueprint.sources.length, 36);
  });

  it('tiene 8 inputAmp', () => {
    const amps = blueprint.sources.filter(s => s.source.kind === 'inputAmp');
    assert.strictEqual(amps.length, 8);
  });

  it('inputAmp channels van de 0 a 7', () => {
    const channels = blueprint.sources
      .filter(s => s.source.kind === 'inputAmp')
      .map(s => s.source.channel)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(channels, [0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('tiene 8 outputBus', () => {
    const buses = blueprint.sources.filter(s => s.source.kind === 'outputBus');
    assert.strictEqual(buses.length, 8);
  });

  it('outputBus buses van de 1 a 8', () => {
    const buses = blueprint.sources
      .filter(s => s.source.kind === 'outputBus')
      .map(s => s.source.bus)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(buses, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('tiene 2 noiseGen', () => {
    const noise = blueprint.sources.filter(s => s.source.kind === 'noiseGen');
    assert.strictEqual(noise.length, 2);
  });

  it('tiene 18 panel3Osc (9 osciladores × 2 canales)', () => {
    const osc = blueprint.sources.filter(s => s.source.kind === 'panel3Osc');
    assert.strictEqual(osc.length, 18);
  });

  it('cada oscilador tiene canales sineSaw y triPulse', () => {
    const osc = blueprint.sources.filter(s => s.source.kind === 'panel3Osc');
    for (let i = 0; i < 9; i++) {
      const channels = osc
        .filter(s => s.source.oscIndex === i)
        .map(s => s.source.channelId)
        .sort();
      assert.deepStrictEqual(channels, ['sineSaw', 'triPulse'],
        `Oscilador ${i} debe tener sineSaw y triPulse`);
    }
  });

  it('todos los rowSynth son únicos', () => {
    const rows = blueprint.sources.map(s => s.rowSynth);
    const unique = new Set(rows);
    assert.strictEqual(rows.length, unique.size, 'rowSynth duplicados');
  });

  it('todos los sources tienen rowSynth numérico', () => {
    for (const s of blueprint.sources) {
      assert.strictEqual(typeof s.rowSynth, 'number', `rowSynth debe ser número`);
      assert.ok(s.rowSynth > 0, 'rowSynth debe ser positivo');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint - Destinations', () => {

  it('tiene 28 destinos en total', () => {
    assert.strictEqual(blueprint.destinations.length, 28);
  });

  it('tiene 12 oscSync', () => {
    const syncs = blueprint.destinations.filter(d => d.dest.kind === 'oscSync');
    assert.strictEqual(syncs.length, 12);
  });

  it('oscSync oscIndex va de 0 a 11', () => {
    const indices = blueprint.destinations
      .filter(d => d.dest.kind === 'oscSync')
      .map(d => d.dest.oscIndex)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('tiene 8 outputBus', () => {
    const buses = blueprint.destinations.filter(d => d.dest.kind === 'outputBus');
    assert.strictEqual(buses.length, 8);
  });

  it('tiene 2 oscilloscope (X e Y)', () => {
    const scope = blueprint.destinations.filter(d => d.dest.kind === 'oscilloscope');
    assert.strictEqual(scope.length, 2);
    const channels = scope.map(d => d.dest.channel).sort();
    assert.deepStrictEqual(channels, ['X', 'Y']);
  });

  it('tiene 6 oscPWM (solo osciladores 0-5)', () => {
    const pwm = blueprint.destinations.filter(d => d.dest.kind === 'oscPWM');
    assert.strictEqual(pwm.length, 6);
  });

  it('oscPWM oscIndex va de 0 a 5', () => {
    const indices = blueprint.destinations
      .filter(d => d.dest.kind === 'oscPWM')
      .map(d => d.dest.oscIndex)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(indices, [0, 1, 2, 3, 4, 5]);
  });

  it('oscPWM ocupa columnas 59-64', () => {
    const cols = blueprint.destinations
      .filter(d => d.dest.kind === 'oscPWM')
      .map(d => d.colSynth)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(cols, [59, 60, 61, 62, 63, 64]);
  });

  it('todos los colSynth son únicos', () => {
    const cols = blueprint.destinations.map(d => d.colSynth);
    const unique = new Set(cols);
    assert.strictEqual(cols.length, unique.size, 'colSynth duplicados');
  });

  it('todos los destinations tienen colSynth numérico positivo', () => {
    for (const d of blueprint.destinations) {
      assert.strictEqual(typeof d.colSynth, 'number');
      assert.ok(d.colSynth > 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UI — PINES OCULTOS
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint - Pines ocultos', () => {

  it('hiddenCols0 contiene índices 0-based válidos', () => {
    for (const col of blueprint.ui.hiddenCols0) {
      assert.strictEqual(typeof col, 'number');
      assert.ok(col >= 0 && col < blueprint.grid.cols,
        `hiddenCol ${col} fuera de rango [0, ${blueprint.grid.cols})`);
    }
  });

  it('hiddenRows0 contiene índices 0-based válidos', () => {
    for (const row of blueprint.ui.hiddenRows0) {
      assert.strictEqual(typeof row, 'number');
      assert.ok(row >= 0 && row < blueprint.grid.rows,
        `hiddenRow ${row} fuera de rango [0, ${blueprint.grid.rows})`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 5 Blueprint - Coherencia', () => {

  it('el número de sources + huecos de fila es consistente con grid.rows', () => {
    // Sources mapean a filas, pero pueden no cubrir todo el grid
    const sourceCount = blueprint.sources.length;
    const hiddenCount = blueprint.ui.hiddenRows0.length;
    assert.ok(sourceCount + hiddenCount <= blueprint.grid.rows,
      'Sources + huecos no deben exceder grid.rows');
  });

  it('el número de destinations + huecos de columna es consistente con grid.cols', () => {
    const destCount = blueprint.destinations.length;
    const hiddenCount = blueprint.ui.hiddenCols0.length;
    assert.ok(destCount + hiddenCount <= blueprint.grid.cols,
      'Destinations + huecos no deben exceder grid.cols');
  });

  it('todos los dest kinds son válidos', () => {
    const validKinds = new Set(['oscSync', 'outputBus', 'oscilloscope', 'oscPWM',
      'oscFreqCV', 'outputLevelCV']);
    for (const d of blueprint.destinations) {
      assert.ok(validKinds.has(d.dest.kind), `Kind inválido: ${d.dest.kind}`);
    }
  });

  it('todos los source kinds son válidos', () => {
    const validKinds = new Set(['inputAmp', 'outputBus', 'noiseGen', 'panel3Osc',
      'joystick', 'randomVoltage', 'envelope']);
    for (const s of blueprint.sources) {
      assert.ok(validKinds.has(s.source.kind), `Kind inválido: ${s.source.kind}`);
    }
  });
});
