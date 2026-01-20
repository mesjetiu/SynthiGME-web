/**
 * Tests para configs de matrices (audio y control)
 * 
 * Verifica la estructura y consistencia de los archivos de configuración
 * de las matrices de routing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { audioMatrixConfig, controlMatrixConfig } from '../../src/assets/js/configs/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Audio Matrix Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Audio Matrix Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof audioMatrixConfig.schemaVersion === 'number');
    assert.ok(audioMatrixConfig.schemaVersion >= 1);
  });

  it('tiene configType "audio"', () => {
    assert.strictEqual(audioMatrixConfig.configType, 'audio');
  });

  it('tiene configuración de audio', () => {
    assert.ok(typeof audioMatrixConfig.audio === 'object');
  });

  describe('audio config', () => {
    const { audio } = audioMatrixConfig;

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
// Control Matrix Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Control Matrix Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof controlMatrixConfig.schemaVersion === 'number');
    assert.ok(controlMatrixConfig.schemaVersion >= 1);
  });

  it('tiene configType "control"', () => {
    assert.strictEqual(controlMatrixConfig.configType, 'control');
  });

  it('tiene configuración de control', () => {
    assert.ok(typeof controlMatrixConfig.control === 'object');
  });

  describe('control config', () => {
    const { control } = controlMatrixConfig;

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
// Consistencia entre matrices
// ─────────────────────────────────────────────────────────────────────────────

describe('Consistencia entre configs de matrices', () => {
  it('ambos tienen el mismo schemaVersion', () => {
    assert.strictEqual(audioMatrixConfig.schemaVersion, controlMatrixConfig.schemaVersion);
  });

  it('ambos tienen gainRange con estructura similar', () => {
    const audio = audioMatrixConfig.audio;
    const control = controlMatrixConfig.control;
    
    assert.ok('min' in audio.gainRange);
    assert.ok('max' in audio.gainRange);
    assert.ok('min' in control.gainRange);
    assert.ok('max' in control.gainRange);
  });

  it('ambos tienen matrixGain numérico', () => {
    assert.ok(typeof audioMatrixConfig.audio.matrixGain === 'number');
    assert.ok(typeof controlMatrixConfig.control.matrixGain === 'number');
  });

  it('configType distingue audio de control', () => {
    assert.notStrictEqual(audioMatrixConfig.configType, controlMatrixConfig.configType);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación de valores razonables
// ─────────────────────────────────────────────────────────────────────────────

describe('Valores razonables', () => {
  it('matrixGain por defecto es 1.0 (sin cambio)', () => {
    assert.strictEqual(audioMatrixConfig.audio.matrixGain, 1.0);
    assert.strictEqual(controlMatrixConfig.control.matrixGain, 1.0);
  });

  it('gainRange permite silencio (min = 0)', () => {
    assert.strictEqual(audioMatrixConfig.audio.gainRange.min, 0);
    assert.strictEqual(controlMatrixConfig.control.gainRange.min, 0);
  });

  it('gainRange.max es razonable (no extremo)', () => {
    // Típico: max entre 1 y 4 (0 a 12 dB)
    assert.ok(audioMatrixConfig.audio.gainRange.max >= 1);
    assert.ok(audioMatrixConfig.audio.gainRange.max <= 10);
    assert.ok(controlMatrixConfig.control.gainRange.max >= 1);
    assert.ok(controlMatrixConfig.control.gainRange.max <= 10);
  });

  it('maxSumGain es mayor que matrixGain', () => {
    assert.ok(audioMatrixConfig.audio.maxSumGain >= audioMatrixConfig.audio.matrixGain);
  });
});
