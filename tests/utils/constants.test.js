/**
 * Tests para utils/constants.js
 * 
 * Verifica que las constantes estén definidas correctamente
 * y tengan valores coherentes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTPUT_CHANNELS,
  INPUT_CHANNELS,
  MAX_RECORDING_TRACKS,
  DEFAULT_PHYSICAL_CHANNELS,
  PANEL_ANIMATION_DURATION,
  DOUBLE_TAP_DELAY,
  LOW_ZOOM_EXIT_DELAY,
  LONG_PRESS_DURATION,
  STORAGE_PREFIX,
  STORAGE_KEYS,
  AUTOSAVE_INTERVALS,
  DEFAULT_AUTOSAVE_INTERVAL
} from '../../src/assets/js/utils/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración del sintetizador
// ─────────────────────────────────────────────────────────────────────────────

describe('Configuración del sintetizador', () => {
  it('OUTPUT_CHANNELS es 8', () => {
    assert.strictEqual(OUTPUT_CHANNELS, 8);
  });

  it('INPUT_CHANNELS es 8', () => {
    assert.strictEqual(INPUT_CHANNELS, 8);
  });

  it('MAX_RECORDING_TRACKS es 12', () => {
    assert.strictEqual(MAX_RECORDING_TRACKS, 12);
  });

  it('DEFAULT_PHYSICAL_CHANNELS es 2 (estéreo)', () => {
    assert.strictEqual(DEFAULT_PHYSICAL_CHANNELS, 2);
  });

  it('OUTPUT e INPUT tienen el mismo número de canales', () => {
    assert.strictEqual(OUTPUT_CHANNELS, INPUT_CHANNELS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tiempos y animaciones
// ─────────────────────────────────────────────────────────────────────────────

describe('Tiempos y animaciones', () => {
  it('PANEL_ANIMATION_DURATION es un número positivo', () => {
    assert.ok(typeof PANEL_ANIMATION_DURATION === 'number');
    assert.ok(PANEL_ANIMATION_DURATION > 0);
  });

  it('DOUBLE_TAP_DELAY es razonable (200-500ms)', () => {
    assert.ok(DOUBLE_TAP_DELAY >= 200);
    assert.ok(DOUBLE_TAP_DELAY <= 500);
  });

  it('LOW_ZOOM_EXIT_DELAY es un número positivo', () => {
    assert.ok(typeof LOW_ZOOM_EXIT_DELAY === 'number');
    assert.ok(LOW_ZOOM_EXIT_DELAY > 0);
  });

  it('LONG_PRESS_DURATION es razonable (300-600ms)', () => {
    assert.ok(LONG_PRESS_DURATION >= 300);
    assert.ok(LONG_PRESS_DURATION <= 600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

describe('STORAGE_PREFIX', () => {
  it('es un string no vacío', () => {
    assert.ok(typeof STORAGE_PREFIX === 'string');
    assert.ok(STORAGE_PREFIX.length > 0);
  });

  it('termina en guión para separar de la clave', () => {
    assert.ok(STORAGE_PREFIX.endsWith('-'));
  });
});

describe('STORAGE_KEYS', () => {
  it('es un objeto con claves', () => {
    assert.ok(typeof STORAGE_KEYS === 'object');
    assert.ok(Object.keys(STORAGE_KEYS).length > 0);
  });

  it('todas las claves usan el STORAGE_PREFIX', () => {
    for (const [key, value] of Object.entries(STORAGE_KEYS)) {
      assert.ok(
        value.startsWith(STORAGE_PREFIX),
        `${key} debería empezar con "${STORAGE_PREFIX}"`
      );
    }
  });

  it('tiene claves esenciales definidas', () => {
    const requiredKeys = [
      'LANGUAGE',
      'AUDIO_ROUTING',
      'INPUT_DEVICE',
      'OUTPUT_DEVICE',
      'LAST_STATE',
      'LATENCY_MODE',
      'AUDIO_LATENCY',
      'CONFIRM_SYNTH_RESET',
      'GLOW_PRESET',
      'KNOB_STYLE'
    ];
    for (const key of requiredKeys) {
      assert.ok(key in STORAGE_KEYS, `Falta clave requerida: ${key}`);
    }
  });

  it('ninguna clave tiene valor duplicado', () => {
    const values = Object.values(STORAGE_KEYS);
    const uniqueValues = new Set(values);
    assert.strictEqual(values.length, uniqueValues.size, 'Hay claves duplicadas');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Autosave
// ─────────────────────────────────────────────────────────────────────────────

describe('AUTOSAVE_INTERVALS', () => {
  it('es un objeto con intervalos', () => {
    assert.ok(typeof AUTOSAVE_INTERVALS === 'object');
    assert.ok(Object.keys(AUTOSAVE_INTERVALS).length > 0);
  });

  it('todos los valores son números >= 0', () => {
    for (const [key, value] of Object.entries(AUTOSAVE_INTERVALS)) {
      assert.ok(
        typeof value === 'number' && value >= 0,
        `${key} debería ser un número >= 0`
      );
    }
  });

  it('tiene opción "off" con valor 0', () => {
    assert.strictEqual(AUTOSAVE_INTERVALS['off'], 0);
  });

  it('los intervalos están ordenados de menor a mayor (excepto off)', () => {
    const entries = Object.entries(AUTOSAVE_INTERVALS)
      .filter(([k]) => k !== 'off')
      .map(([, v]) => v);
    
    for (let i = 1; i < entries.length; i++) {
      assert.ok(
        entries[i] >= entries[i - 1],
        'Los intervalos deberían estar ordenados'
      );
    }
  });
});

describe('DEFAULT_AUTOSAVE_INTERVAL', () => {
  it('es una clave válida de AUTOSAVE_INTERVALS', () => {
    assert.ok(
      DEFAULT_AUTOSAVE_INTERVAL in AUTOSAVE_INTERVALS,
      `"${DEFAULT_AUTOSAVE_INTERVAL}" no está en AUTOSAVE_INTERVALS`
    );
  });

  it('no es "off" por defecto', () => {
    assert.notStrictEqual(DEFAULT_AUTOSAVE_INTERVAL, 'off');
  });
});
