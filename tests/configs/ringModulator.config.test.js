/**
 * Tests para Ring Modulator Config
 *
 * Verifica la configuración del modulador de anillo del Synthi 100:
 * - Estructura (schemaVersion, id, título)
 * - 3 instancias
 * - Posiciones en matriz Panel 5 (audio): entradas A/B y salidas
 * - Sin conexiones en Panel 6 (control)
 * - Kinds para routing
 * - Parámetros de audio (soft-clip, breakthrough)
 * - Curva de nivel logarítmica
 * - Knobs (Level)
 * - Coherencia
 *
 * @module tests/configs/ringModulator.config.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import config from '../../src/assets/js/configs/modules/ringModulator.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Estructura', () => {

  it('tiene schemaVersion >= 1', () => {
    assert.ok(config.schemaVersion >= 1);
  });

  it('tiene id "ringModulator"', () => {
    assert.strictEqual(config.id, 'ringModulator');
  });

  it('tiene título "Ring Modulator"', () => {
    assert.strictEqual(config.title, 'Ring Modulator');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCIAS
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Instancias', () => {

  it('tiene count = 3', () => {
    assert.strictEqual(config.count, 3);
  });

  it('tiene 3 IDs de instancia', () => {
    assert.strictEqual(config.ids.length, 3);
  });

  it('los IDs siguen el patrón ringModulator1/2/3', () => {
    assert.deepStrictEqual(config.ids, [
      'ringModulator1', 'ringModulator2', 'ringModulator3'
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX POSITIONS (Panel 5)
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Posiciones en Panel 5', () => {

  it('tiene posiciones de entrada A para Panel 5', () => {
    assert.ok(Array.isArray(config.matrix.panel5.inputsA));
    assert.strictEqual(config.matrix.panel5.inputsA.length, 3);
  });

  it('entradas A en columnas 3, 5, 7', () => {
    assert.deepStrictEqual(config.matrix.panel5.inputsA, [3, 5, 7]);
  });

  it('tiene posiciones de entrada B para Panel 5', () => {
    assert.ok(Array.isArray(config.matrix.panel5.inputsB));
    assert.strictEqual(config.matrix.panel5.inputsB.length, 3);
  });

  it('entradas B en columnas 4, 6, 8', () => {
    assert.deepStrictEqual(config.matrix.panel5.inputsB, [4, 6, 8]);
  });

  it('entradas A y B se alternan en columnas consecutivas', () => {
    for (let i = 0; i < 3; i++) {
      assert.strictEqual(
        config.matrix.panel5.inputsB[i] - config.matrix.panel5.inputsA[i], 1,
        `RM${i + 1}: entrada B debe ser entrada A + 1`
      );
    }
  });

  it('tiene posiciones de salida para Panel 5', () => {
    assert.ok(Array.isArray(config.matrix.panel5.outputs));
    assert.strictEqual(config.matrix.panel5.outputs.length, 3);
  });

  it('salidas en filas 121, 122, 123', () => {
    assert.deepStrictEqual(config.matrix.panel5.outputs, [121, 122, 123]);
  });

  it('número de entradas A coincide con count', () => {
    assert.strictEqual(config.matrix.panel5.inputsA.length, config.count);
  });

  it('número de entradas B coincide con count', () => {
    assert.strictEqual(config.matrix.panel5.inputsB.length, config.count);
  });

  it('número de salidas coincide con count', () => {
    assert.strictEqual(config.matrix.panel5.outputs.length, config.count);
  });
});

describe('Ring Modulator Config - Sin conexiones Panel 6', () => {

  it('no tiene sección panel6 en matrix', () => {
    assert.ok(!config.matrix.panel6, 'Ring Modulator no debe tener conexiones Panel 6');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KINDS
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Kinds', () => {

  it('sourceKind es "ringModulator"', () => {
    assert.strictEqual(config.sourceKind, 'ringModulator');
  });

  it('inputAKind es "ringModInputA"', () => {
    assert.strictEqual(config.inputAKind, 'ringModInputA');
  });

  it('inputBKind es "ringModInputB"', () => {
    assert.strictEqual(config.inputBKind, 'ringModInputB');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Audio', () => {

  it('maxInputVpp es 8 (V p-p)', () => {
    assert.strictEqual(config.audio.maxInputVpp, 8);
  });

  it('breakthroughDb es <= -60 (rechazo de fuga)', () => {
    assert.ok(config.audio.breakthroughDb <= -60,
      `Breakthrough debe ser <= -60dB, got ${config.audio.breakthroughDb}`);
  });

  it('softClipThreshold está entre 0 y 1', () => {
    assert.ok(config.audio.softClipThreshold > 0);
    assert.ok(config.audio.softClipThreshold <= 1);
  });

  it('softClipThreshold es 0.8 (8V/10V)', () => {
    assert.strictEqual(config.audio.softClipThreshold, 0.8);
  });

  it('levelLogBase es 100', () => {
    assert.strictEqual(config.audio.levelLogBase, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CURVA DE NIVEL
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Level Curve', () => {

  it('tiene curva de tipo logarítmico', () => {
    assert.strictEqual(config.levelCurve.type, 'log');
  });

  it('logBase coincide con audio.levelLogBase', () => {
    assert.strictEqual(config.levelCurve.logBase, config.audio.levelLogBase);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMPS
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Ramps', () => {

  it('tiene rampa de level', () => {
    assert.strictEqual(typeof config.ramps.level, 'number');
    assert.ok(config.ramps.level > 0);
  });

  it('level ramp es 0.06', () => {
    assert.strictEqual(config.ramps.level, 0.06);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Knobs', () => {

  it('tiene exactamente 1 knob (level)', () => {
    const knobKeys = Object.keys(config.knobs);
    assert.strictEqual(knobKeys.length, 1);
    assert.ok(knobKeys.includes('level'));
  });

  it('level: rango 0-10', () => {
    assert.strictEqual(config.knobs.level.min, 0);
    assert.strictEqual(config.knobs.level.max, 10);
  });

  it('level: valor inicial 0 (silencio al arrancar)', () => {
    assert.strictEqual(config.knobs.level.initial, 0);
  });

  it('level: curva linear (el dial es lineal, la conversión a gain es log)', () => {
    assert.strictEqual(config.knobs.level.curve, 'linear');
  });

  it('level: pixelsForFullRange definido', () => {
    assert.strictEqual(typeof config.knobs.level.pixelsForFullRange, 'number');
    assert.ok(config.knobs.level.pixelsForFullRange > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Modulator Config - Coherencia', () => {

  it('todas las posiciones de matriz son números positivos', () => {
    for (const col of config.matrix.panel5.inputsA) {
      assert.strictEqual(typeof col, 'number');
      assert.ok(col > 0, `inputA colSynth ${col} debe ser positivo`);
    }
    for (const col of config.matrix.panel5.inputsB) {
      assert.strictEqual(typeof col, 'number');
      assert.ok(col > 0, `inputB colSynth ${col} debe ser positivo`);
    }
    for (const row of config.matrix.panel5.outputs) {
      assert.strictEqual(typeof row, 'number');
      assert.ok(row > 0, `output rowSynth ${row} debe ser positivo`);
    }
  });

  it('no hay colisiones entre entradas A y B', () => {
    const allInputCols = [...config.matrix.panel5.inputsA, ...config.matrix.panel5.inputsB];
    const unique = new Set(allInputCols);
    assert.strictEqual(allInputCols.length, unique.size, 'Columnas de entrada duplicadas');
  });

  it('filas de salida son únicas', () => {
    const unique = new Set(config.matrix.panel5.outputs);
    assert.strictEqual(config.matrix.panel5.outputs.length, unique.size);
  });

  it('el módulo solo tiene un control manual (level)', () => {
    // El ring modulator del Synthi 100 solo tiene potenciómetro de nivel de salida
    assert.strictEqual(Object.keys(config.knobs).length, 1);
    assert.ok(config.knobs.level);
  });
});
