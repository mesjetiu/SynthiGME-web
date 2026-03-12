/**
 * Tests para envelopeShaper.config.js
 *
 * Verifica la configuración del Envelope Shaper del Synthi 100:
 * - Estructura y schema
 * - Filas/columnas de la matriz de control (Panel 6)
 * - Parámetros de audio (tiempos, voltajes)
 * - Definición de knobs (rangos, valores iniciales)
 * - Coherencia entre modos y labels
 *
 * @version 1.0.0
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';

import config, { ENV_MODES, ENV_MODE_NAMES }
  from '../../src/assets/js/configs/modules/envelopeShaper.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA GENERAL
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Estructura', () => {

  test('schemaVersion ≥ 1', () => {
    assert.ok(config.schemaVersion >= 1);
  });

  test('id es "envelopeShaper"', () => {
    assert.strictEqual(config.id, 'envelopeShaper');
  });

  test('title es "Envelope Shaper"', () => {
    assert.strictEqual(config.title, 'Envelope Shaper');
  });

  test('3 instancias', () => {
    assert.strictEqual(config.instances, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX ROWS (Panel 6) — SOURCES
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Matrix Rows (Panel 6 Sources)', () => {

  test('envelope1 = row 97', () => {
    assert.strictEqual(config.matrixRow.envelope1, 97);
  });

  test('envelope2 = row 98', () => {
    assert.strictEqual(config.matrixRow.envelope2, 98);
  });

  test('envelope3 = row 99', () => {
    assert.strictEqual(config.matrixRow.envelope3, 99);
  });

  test('rows are consecutive (97, 98, 99)', () => {
    const rows = Object.values(config.matrixRow);
    rows.sort((a, b) => a - b);
    assert.strictEqual(rows[0], 97);
    assert.strictEqual(rows[1], 98);
    assert.strictEqual(rows[2], 99);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX COLS (Panel 6) — DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Matrix Cols (Panel 6 Destinations)', () => {

  test('ES1: KEY=4, DELAY=5, ATTACK=6, DECAY=7, SUSTAIN=8, RELEASE=9', () => {
    const es1 = config.matrixCol.es1;
    assert.strictEqual(es1.key, 4);
    assert.strictEqual(es1.delay, 5);
    assert.strictEqual(es1.attack, 6);
    assert.strictEqual(es1.decay, 7);
    assert.strictEqual(es1.sustain, 8);
    assert.strictEqual(es1.release, 9);
  });

  test('ES2: KEY=10, DELAY=11, ATTACK=12, DECAY=13, SUSTAIN=14, RELEASE=15', () => {
    const es2 = config.matrixCol.es2;
    assert.strictEqual(es2.key, 10);
    assert.strictEqual(es2.delay, 11);
    assert.strictEqual(es2.attack, 12);
    assert.strictEqual(es2.decay, 13);
    assert.strictEqual(es2.sustain, 14);
    assert.strictEqual(es2.release, 15);
  });

  test('ES3: KEY=16, DELAY=17, ATTACK=18, DECAY=19, SUSTAIN=20, RELEASE=21', () => {
    const es3 = config.matrixCol.es3;
    assert.strictEqual(es3.key, 16);
    assert.strictEqual(es3.delay, 17);
    assert.strictEqual(es3.attack, 18);
    assert.strictEqual(es3.decay, 19);
    assert.strictEqual(es3.sustain, 20);
    assert.strictEqual(es3.release, 21);
  });

  test('18 columnas en total (6 params × 3 instancias)', () => {
    let count = 0;
    for (const es of Object.values(config.matrixCol)) {
      count += Object.keys(es).length;
    }
    assert.strictEqual(count, 18);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Parámetros de audio', () => {

  test('signal inputs: [9, 10, 11]', () => {
    assert.deepStrictEqual(config.audio.signalInputs, [9, 10, 11]);
  });

  test('signal triggers: [12, 13, 14]', () => {
    assert.deepStrictEqual(config.audio.signalTriggers, [12, 13, 14]);
  });

  test('shaper outputs: [118, 119, 120]', () => {
    assert.deepStrictEqual(config.audio.shaperOutputs, [118, 119, 120]);
  });

  test('minTimeMs = 1 (1ms por sección)', () => {
    assert.strictEqual(config.audio.minTimeMs, 1);
  });

  test('maxTimeMs = 20000 (20 segundos)', () => {
    assert.strictEqual(config.audio.maxTimeMs, 20000);
  });

  test('timeRatio = 20000', () => {
    assert.strictEqual(config.audio.timeRatio, 20000);
  });

  test('envelopeMaxVoltage = 5V', () => {
    assert.strictEqual(config.audio.envelopeMaxVoltage, 5.0);
  });

  test('audioMaxVpp = 3V', () => {
    assert.strictEqual(config.audio.audioMaxVpp, 3.0);
  });

  test('triggerThresholdV = 1V', () => {
    assert.strictEqual(config.audio.triggerThresholdV, 1.0);
  });

  test('triggerMinPulseMs = 20ms', () => {
    assert.strictEqual(config.audio.triggerMinPulseMs, 20);
  });

  test('dynamicRangeDb = 80', () => {
    assert.strictEqual(config.audio.dynamicRangeDb, 80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODOS DE OPERACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Modos', () => {

  test('5 modos definidos (0..4)', () => {
    assert.strictEqual(Object.keys(ENV_MODES).length, 5);
  });

  test('modos tienen los valores correctos', () => {
    assert.strictEqual(ENV_MODES.GATED_FR, 0);
    assert.strictEqual(ENV_MODES.FREE_RUN, 1);
    assert.strictEqual(ENV_MODES.GATED, 2);
    assert.strictEqual(ENV_MODES.TRIGGERED, 3);
    assert.strictEqual(ENV_MODES.HOLD, 4);
  });

  test('5 nombres de modo legibles', () => {
    assert.strictEqual(ENV_MODE_NAMES.length, 5);
  });

  test('nombres de modo corresponden al hardware', () => {
    assert.strictEqual(ENV_MODE_NAMES[0], 'Gated F/R');
    assert.strictEqual(ENV_MODE_NAMES[1], 'Free Run');
    assert.strictEqual(ENV_MODE_NAMES[2], 'Gated');
    assert.strictEqual(ENV_MODE_NAMES[3], 'Triggered');
    assert.strictEqual(ENV_MODE_NAMES[4], 'Hold');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Knobs', () => {

  test('mode: 0-4, initial 2 (GATED), 5 steps', () => {
    assert.strictEqual(config.knobs.mode.min, 0);
    assert.strictEqual(config.knobs.mode.max, 4);
    assert.strictEqual(config.knobs.mode.initial, 2);
    assert.strictEqual(config.knobs.mode.steps, 5);
  });

  test('delay: 0-10, initial 0', () => {
    assert.strictEqual(config.knobs.delay.min, 0);
    assert.strictEqual(config.knobs.delay.max, 10);
    assert.strictEqual(config.knobs.delay.initial, 0);
  });

  test('attack: 0-10, initial 0', () => {
    assert.strictEqual(config.knobs.attack.min, 0);
    assert.strictEqual(config.knobs.attack.max, 10);
    assert.strictEqual(config.knobs.attack.initial, 0);
  });

  test('decay: 0-10, initial 5', () => {
    assert.strictEqual(config.knobs.decay.min, 0);
    assert.strictEqual(config.knobs.decay.max, 10);
    assert.strictEqual(config.knobs.decay.initial, 5);
  });

  test('sustain: 0-10, initial 7', () => {
    assert.strictEqual(config.knobs.sustain.min, 0);
    assert.strictEqual(config.knobs.sustain.max, 10);
    assert.strictEqual(config.knobs.sustain.initial, 7);
  });

  test('release: 0-10, initial 3', () => {
    assert.strictEqual(config.knobs.release.min, 0);
    assert.strictEqual(config.knobs.release.max, 10);
    assert.strictEqual(config.knobs.release.initial, 3);
  });

  test('envelopeLevel: -5 to +5, initial 5', () => {
    assert.strictEqual(config.knobs.envelopeLevel.min, -5);
    assert.strictEqual(config.knobs.envelopeLevel.max, 5);
    assert.strictEqual(config.knobs.envelopeLevel.initial, 5);
  });

  test('signalLevel: 0-10, initial 0', () => {
    assert.strictEqual(config.knobs.signalLevel.min, 0);
    assert.strictEqual(config.knobs.signalLevel.max, 10);
    assert.strictEqual(config.knobs.signalLevel.initial, 0);
  });

  test('Time knobs use exponential curve', () => {
    for (const key of ['delay', 'attack', 'decay', 'release']) {
      assert.strictEqual(config.knobs[key].curve, 'exponential',
        `${key} should have exponential curve`);
    }
  });

  test('sustain uses linear curve', () => {
    assert.strictEqual(config.knobs.sustain.curve, 'linear');
  });

  test('signalLevel uses log curve', () => {
    assert.strictEqual(config.knobs.signalLevel.curve, 'log');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('EnvelopeShaper Config — Coherencia', () => {

  test('Signal level curve is LOG', () => {
    assert.strictEqual(config.signalLevelCurve.type, 'log');
    assert.strictEqual(config.signalLevelCurve.logBase, 100);
  });

  test('ramps definidas para level y envelope', () => {
    assert.ok(config.ramps.level > 0);
    assert.ok(config.ramps.envelope > 0);
  });

  test('frecuencia mínima del ciclo coincide con 250Hz', () => {
    const minTimeS = config.audio.minTimeMs / 1000;
    const minCycle = minTimeS * 4;
    const maxFreq = 1 / minCycle;
    assert.strictEqual(maxFreq, 250,
      `Max frequency as LFO: ${maxFreq} Hz, expected 250 Hz`);
  });
});
