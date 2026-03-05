/**
 * Tests para panel6.control.blueprint — filas de Keyboard (111-116)
 *
 * Verifica la correcta definición de sources de teclado en la matriz de control.
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel6Blueprint from '../../src/assets/js/panelBlueprints/panel6.control.blueprint.js';
import keyboardConfig from '../../src/assets/js/configs/modules/keyboard.config.js';

const sources = panel6Blueprint.sources;

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD UPPER (filas 111-113)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Keyboard Upper sources', () => {
  const upperSources = sources.filter(s => s.source?.kind === 'keyboardUpper');

  it('hay exactamente 3 sources para keyboardUpper', () => {
    assert.strictEqual(upperSources.length, 3);
  });

  it('pitch está en fila 111', () => {
    const s = upperSources.find(s => s.source.output === 'pitch');
    assert.ok(s, 'Falta source pitch');
    assert.strictEqual(s.rowSynth, 111);
  });

  it('velocity está en fila 112', () => {
    const s = upperSources.find(s => s.source.output === 'velocity');
    assert.ok(s, 'Falta source velocity');
    assert.strictEqual(s.rowSynth, 112);
  });

  it('gate está en fila 113', () => {
    const s = upperSources.find(s => s.source.output === 'gate');
    assert.ok(s, 'Falta source gate');
    assert.strictEqual(s.rowSynth, 113);
  });

  it('filas son consecutivas 111-113', () => {
    const rows = upperSources.map(s => s.rowSynth).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [111, 112, 113]);
  });

  it('outputs son exactamente pitch, velocity, gate', () => {
    const outputs = upperSources.map(s => s.source.output).sort();
    assert.deepStrictEqual(outputs, ['gate', 'pitch', 'velocity']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD LOWER (filas 114-116)
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Keyboard Lower sources', () => {
  const lowerSources = sources.filter(s => s.source?.kind === 'keyboardLower');

  it('hay exactamente 3 sources para keyboardLower', () => {
    assert.strictEqual(lowerSources.length, 3);
  });

  it('pitch está en fila 114', () => {
    const s = lowerSources.find(s => s.source.output === 'pitch');
    assert.ok(s, 'Falta source pitch');
    assert.strictEqual(s.rowSynth, 114);
  });

  it('velocity está en fila 115', () => {
    const s = lowerSources.find(s => s.source.output === 'velocity');
    assert.ok(s, 'Falta source velocity');
    assert.strictEqual(s.rowSynth, 115);
  });

  it('gate está en fila 116', () => {
    const s = lowerSources.find(s => s.source.output === 'gate');
    assert.ok(s, 'Falta source gate');
    assert.strictEqual(s.rowSynth, 116);
  });

  it('filas son consecutivas 114-116', () => {
    const rows = lowerSources.map(s => s.rowSynth).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [114, 115, 116]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA CON CONFIG
// ═══════════════════════════════════════════════════════════════════════════

describe('Panel 6 Blueprint — Coherencia con keyboard.config.js', () => {

  it('fila pitch upper coincide con config.matrixRow.upper.pitch', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardUpper' && s.source.output === 'pitch'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.upper.pitch);
  });

  it('fila velocity upper coincide con config.matrixRow.upper.velocity', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardUpper' && s.source.output === 'velocity'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.upper.velocity);
  });

  it('fila gate upper coincide con config.matrixRow.upper.gate', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardUpper' && s.source.output === 'gate'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.upper.gate);
  });

  it('fila pitch lower coincide con config.matrixRow.lower.pitch', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardLower' && s.source.output === 'pitch'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.lower.pitch);
  });

  it('fila velocity lower coincide con config.matrixRow.lower.velocity', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardLower' && s.source.output === 'velocity'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.lower.velocity);
  });

  it('fila gate lower coincide con config.matrixRow.lower.gate', () => {
    const s = sources.find(s =>
      s.source?.kind === 'keyboardLower' && s.source.output === 'gate'
    );
    assert.strictEqual(s.rowSynth, keyboardConfig.matrixRow.lower.gate);
  });

  it('no hay filas de teclado duplicadas en el blueprint', () => {
    const kbSources = sources.filter(s =>
      s.source?.kind === 'keyboardUpper' || s.source?.kind === 'keyboardLower'
    );
    const rows = kbSources.map(s => s.rowSynth);
    const unique = new Set(rows);
    assert.strictEqual(unique.size, rows.length, 'Hay filas duplicadas');
  });
});
