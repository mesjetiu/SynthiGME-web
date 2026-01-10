/**
 * Tests para panelBlueprints configs
 * 
 * Verifica la estructura y consistencia de los archivos de configuración
 * de los paneles (audio y control).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel5Config from '../../src/assets/js/panelBlueprints/panel5.audio.config.js';
import panel6Config from '../../src/assets/js/panelBlueprints/panel6.control.config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Panel 5 Audio Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 5 Audio Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof panel5Config.schemaVersion === 'number');
    assert.ok(panel5Config.schemaVersion >= 1);
  });

  it('tiene configType "audio"', () => {
    assert.strictEqual(panel5Config.configType, 'audio');
  });

  it('tiene panelId correcto', () => {
    assert.strictEqual(panel5Config.panelId, 'panel-5');
  });

  it('tiene configuración de audio', () => {
    assert.ok(typeof panel5Config.audio === 'object');
  });

  describe('audio config', () => {
    const { audio } = panel5Config;

    it('tiene matrixGain definido', () => {
      assert.ok(typeof audio.matrixGain === 'number');
      assert.ok(audio.matrixGain > 0);
    });

    it('tiene gainRange con min y max', () => {
      assert.ok(typeof audio.gainRange === 'object');
      assert.ok(typeof audio.gainRange.min === 'number');
      assert.ok(typeof audio.gainRange.max === 'number');
      assert.ok(audio.gainRange.min <= audio.gainRange.max);
    });

    it('min es >= 0 (sin ganancia negativa)', () => {
      assert.ok(audio.gainRange.min >= 0);
    });

    it('tiene sumMode definido', () => {
      const validModes = ['direct', 'clip', 'softClip'];
      assert.ok(validModes.includes(audio.sumMode));
    });

    it('tiene maxSumGain definido', () => {
      assert.ok(typeof audio.maxSumGain === 'number');
      assert.ok(audio.maxSumGain > 0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel 6 Control Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 6 Control Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof panel6Config.schemaVersion === 'number');
    assert.ok(panel6Config.schemaVersion >= 1);
  });

  it('tiene configType "control"', () => {
    assert.strictEqual(panel6Config.configType, 'control');
  });

  it('tiene panelId correcto', () => {
    assert.strictEqual(panel6Config.panelId, 'panel-6');
  });

  it('tiene configuración de control', () => {
    assert.ok(typeof panel6Config.control === 'object');
  });

  describe('control config', () => {
    const { control } = panel6Config;

    it('tiene matrixGain definido', () => {
      assert.ok(typeof control.matrixGain === 'number');
      assert.ok(control.matrixGain > 0);
    });

    it('tiene gainRange con min y max', () => {
      assert.ok(typeof control.gainRange === 'object');
      assert.ok(typeof control.gainRange.min === 'number');
      assert.ok(typeof control.gainRange.max === 'number');
      assert.ok(control.gainRange.min <= control.gainRange.max);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consistencia entre paneles
// ─────────────────────────────────────────────────────────────────────────────

describe('Consistencia entre configs de paneles', () => {
  it('ambos tienen el mismo schemaVersion', () => {
    assert.strictEqual(panel5Config.schemaVersion, panel6Config.schemaVersion);
  });

  it('ambos tienen gainRange con estructura similar', () => {
    const audio = panel5Config.audio;
    const control = panel6Config.control;
    
    assert.ok('min' in audio.gainRange);
    assert.ok('max' in audio.gainRange);
    assert.ok('min' in control.gainRange);
    assert.ok('max' in control.gainRange);
  });

  it('ambos tienen matrixGain numérico', () => {
    assert.ok(typeof panel5Config.audio.matrixGain === 'number');
    assert.ok(typeof panel6Config.control.matrixGain === 'number');
  });

  it('configType distingue audio de control', () => {
    assert.notStrictEqual(panel5Config.configType, panel6Config.configType);
  });

  it('panelId es único por config', () => {
    assert.notStrictEqual(panel5Config.panelId, panel6Config.panelId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación de valores razonables
// ─────────────────────────────────────────────────────────────────────────────

describe('Valores razonables', () => {
  it('matrixGain por defecto es 1.0 (sin cambio)', () => {
    assert.strictEqual(panel5Config.audio.matrixGain, 1.0);
    assert.strictEqual(panel6Config.control.matrixGain, 1.0);
  });

  it('gainRange permite silencio (min = 0)', () => {
    assert.strictEqual(panel5Config.audio.gainRange.min, 0);
    assert.strictEqual(panel6Config.control.gainRange.min, 0);
  });

  it('gainRange.max es razonable (no extremo)', () => {
    // Típico: max entre 1 y 4 (0 a 12 dB)
    assert.ok(panel5Config.audio.gainRange.max >= 1);
    assert.ok(panel5Config.audio.gainRange.max <= 10);
    assert.ok(panel6Config.control.gainRange.max >= 1);
    assert.ok(panel6Config.control.gainRange.max <= 10);
  });

  it('maxSumGain es mayor que matrixGain', () => {
    assert.ok(panel5Config.audio.maxSumGain >= panel5Config.audio.matrixGain);
  });
});
