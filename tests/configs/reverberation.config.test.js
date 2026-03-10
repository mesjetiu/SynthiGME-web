/**
 * Tests para reverberation.config.js — Spring Reverb (Voltage Controlled Reverberation Unit)
 *
 * Verifica la configuración de la unidad de reverberación de muelle:
 * - Estructura del esquema (schemaVersion, id, title)
 * - Posiciones en matrices: Panel 5 (col 1 entrada, fila 124 salida), Panel 6 (col 1 mix CV)
 * - Parámetros de audio (delays de muelle, RT60, damping, saturación)
 * - Curva logarítmica del potenciómetro de nivel
 * - Rangos y valores iniciales de los 2 knobs (Mix, Level)
 * - Kinds para routing (sourceKind, inputKind, mixCVKind)
 *
 * Referencia: Placa PC-16, plano D100-16 C1 (Cuenca/Datanomics 1982)
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reverberationConfig } from '../../src/assets/js/configs/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Estructura', () => {

  it('tiene schemaVersion >= 1', () => {
    assert.ok(typeof reverberationConfig.schemaVersion === 'number');
    assert.ok(reverberationConfig.schemaVersion >= 1);
  });

  it('tiene id "panel1-reverberation1"', () => {
    assert.strictEqual(reverberationConfig.id, 'panel1-reverberation1');
  });

  it('tiene title "Reverberation"', () => {
    assert.strictEqual(reverberationConfig.title, 'Reverberation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POSICIONES EN MATRICES
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Matrices', () => {

  it('tiene sección matrix con panel5 y panel6', () => {
    assert.ok(reverberationConfig.matrix);
    assert.ok(reverberationConfig.matrix.panel5);
    assert.ok(reverberationConfig.matrix.panel6);
  });

  it('Panel 5: entrada audio en columna 1', () => {
    assert.strictEqual(reverberationConfig.matrix.panel5.input.colSynth, 1);
  });

  it('Panel 5: salida audio en fila 124', () => {
    assert.strictEqual(reverberationConfig.matrix.panel5.output.rowSynth, 124);
  });

  it('Panel 6: mix CV en columna 1', () => {
    assert.strictEqual(reverberationConfig.matrix.panel6.mixCV.colSynth, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KINDS PARA ROUTING
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Kinds', () => {

  it('sourceKind es "reverberation"', () => {
    assert.strictEqual(reverberationConfig.sourceKind, 'reverberation');
  });

  it('inputKind es "reverbInput"', () => {
    assert.strictEqual(reverberationConfig.inputKind, 'reverbInput');
  });

  it('mixCVKind es "reverbMixCV"', () => {
    assert.strictEqual(reverberationConfig.mixCVKind, 'reverbMixCV');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO (DSP del muelle)
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Parámetros de audio', () => {

  const { audio } = reverberationConfig;

  it('tiene sección audio definida', () => {
    assert.ok(audio, 'debe tener sección audio');
  });

  it('muelle 1: retardo de 35 ms', () => {
    assert.strictEqual(audio.spring1DelayMs, 35);
  });

  it('muelle 2: retardo de 40 ms', () => {
    assert.strictEqual(audio.spring2DelayMs, 40);
  });

  it('delays son diferentes (dispersión tímbrica)', () => {
    assert.notStrictEqual(audio.spring1DelayMs, audio.spring2DelayMs);
  });

  it('delay total (75 ms) divide RT60 en ciclos razonables', () => {
    const totalDelayS = (audio.spring1DelayMs + audio.spring2DelayMs) / 1000;
    const cycles = audio.maxReverbTimeS / totalDelayS;
    assert.ok(cycles >= 20, `ciclos RT60 (${cycles}) deben ser >= 20`);
    assert.ok(cycles <= 100, `ciclos RT60 (${cycles}) deben ser <= 100`);
  });

  it('RT60 máximo de 2.4 s (según manual)', () => {
    assert.strictEqual(audio.maxReverbTimeS, 2.4);
  });

  it('frecuencia de damping ~4.5 kHz', () => {
    assert.ok(audio.dampingFreqHz >= 3000, 'damping debe ser >= 3 kHz');
    assert.ok(audio.dampingFreqHz <= 6000, 'damping debe ser <= 6 kHz');
  });

  it('coeficiente allpass entre 0.5 y 0.8', () => {
    assert.ok(audio.allpassCoeff >= 0.5);
    assert.ok(audio.allpassCoeff <= 0.8);
  });

  it('factor de saturación de entrada > 1 (soft clip activo)', () => {
    assert.ok(audio.inputClipDrive > 1);
  });

  it('entrada máxima sin distorsión: 2 V p-p', () => {
    assert.strictEqual(audio.maxInputVpp, 2.0);
  });

  it('base logarítmica de nivel = 100', () => {
    assert.strictEqual(audio.levelLogBase, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CURVA DE LEVEL
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Curva de Level', () => {

  it('tiene curva logarítmica', () => {
    assert.strictEqual(reverberationConfig.levelCurve.type, 'log');
  });

  it('base logarítmica = 100', () => {
    assert.strictEqual(reverberationConfig.levelCurve.logBase, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMPS
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Ramps', () => {

  it('tiene ramp de level', () => {
    assert.ok(typeof reverberationConfig.ramps.level === 'number');
    assert.ok(reverberationConfig.ramps.level > 0);
  });

  it('tiene ramp de mix', () => {
    assert.ok(typeof reverberationConfig.ramps.mix === 'number');
    assert.ok(reverberationConfig.ramps.mix > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Knobs', () => {

  const { knobs } = reverberationConfig;

  it('define exactamente 2 knobs: mix y level', () => {
    assert.deepStrictEqual(Object.keys(knobs).sort(), ['level', 'mix']);
  });

  it('mix: rango 0-10, inicial 0', () => {
    assert.strictEqual(knobs.mix.min, 0);
    assert.strictEqual(knobs.mix.max, 10);
    assert.strictEqual(knobs.mix.initial, 0);
  });

  it('level: rango 0-10, inicial 0', () => {
    assert.strictEqual(knobs.level.min, 0);
    assert.strictEqual(knobs.level.max, 10);
    assert.strictEqual(knobs.level.initial, 0);
  });

  it('mix es lineal (crossfader directo)', () => {
    assert.strictEqual(knobs.mix.curve, 'linear');
  });

  it('level es lineal en dial (curva LOG aplicada en módulo)', () => {
    assert.strictEqual(knobs.level.curve, 'linear');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Reverberation Config — Coherencia', () => {

  it('levelLogBase en audio coincide con levelCurve.logBase', () => {
    assert.strictEqual(
      reverberationConfig.audio.levelLogBase,
      reverberationConfig.levelCurve.logBase
    );
  });

  it('todos los knobs tienen pixelsForFullRange > 0', () => {
    for (const [key, knob] of Object.entries(reverberationConfig.knobs)) {
      assert.ok(knob.pixelsForFullRange > 0,
        `knob ${key} debe tener pixelsForFullRange > 0`);
    }
  });

  it('todos los ramps son < 1 segundo', () => {
    for (const [key, ramp] of Object.entries(reverberationConfig.ramps)) {
      assert.ok(ramp < 1, `ramp ${key} (${ramp}) debe ser < 1s`);
    }
  });
});
