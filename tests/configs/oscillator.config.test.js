/**
 * Tests para oscilloscope.config.js y oscillator.config.js
 * 
 * Verifica la configuración del osciloscopio y osciladores.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { oscilloscopeConfig, oscillatorConfig } from '../../src/assets/js/configs/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Oscilloscope Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Oscilloscope Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof oscilloscopeConfig.schemaVersion === 'number');
    assert.ok(oscilloscopeConfig.schemaVersion >= 1);
  });

  describe('display config', () => {
    const { display } = oscilloscopeConfig;

    it('tiene dimensiones internas definidas', () => {
      assert.ok(typeof display.internalWidth === 'number');
      assert.ok(typeof display.internalHeight === 'number');
      assert.ok(display.internalWidth > 0);
      assert.ok(display.internalHeight > 0);
    });

    it('tiene colores definidos', () => {
      assert.ok(typeof display.lineColor === 'string');
      assert.ok(typeof display.bgColor === 'string');
      assert.ok(typeof display.gridColor === 'string');
    });

    it('lineColor es un color CSS válido', () => {
      // Acepta #hex o rgb()
      assert.ok(
        display.lineColor.startsWith('#') || display.lineColor.startsWith('rgb'),
        'lineColor debería ser hex o rgb'
      );
    });

    it('tiene lineWidth razonable (1-10)', () => {
      assert.ok(display.lineWidth >= 1);
      assert.ok(display.lineWidth <= 10);
    });

    it('tiene glowBlur definido', () => {
      assert.ok(typeof display.glowBlur === 'number');
      assert.ok(display.glowBlur >= 0);
    });

    it('tiene flags de UI booleanos', () => {
      assert.ok(typeof display.showGrid === 'boolean');
      assert.ok(typeof display.showTriggerIndicator === 'boolean');
    });
  });

  describe('audio config', () => {
    const { audio } = oscilloscopeConfig;

    it('tiene bufferSize como potencia de 2', () => {
      const validSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
      assert.ok(validSizes.includes(audio.bufferSize));
    });

    it('tiene triggerLevel en rango válido (-1 a 1)', () => {
      assert.ok(audio.triggerLevel >= -1);
      assert.ok(audio.triggerLevel <= 1);
    });

    it('tiene mode válido', () => {
      const validModes = ['yt', 'xy'];
      assert.ok(validModes.includes(audio.mode));
    });

    it('tiene triggerEnabled booleano', () => {
      assert.ok(typeof audio.triggerEnabled === 'boolean');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Oscillator Config
// ─────────────────────────────────────────────────────────────────────────────

describe('Oscillator Config', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof oscillatorConfig.schemaVersion === 'number');
    assert.ok(oscillatorConfig.schemaVersion >= 1);
  });

  it('tiene defaults definidos', () => {
    assert.ok(typeof oscillatorConfig.defaults === 'object');
  });

  describe('defaults.knobs', () => {
    const { knobs } = oscillatorConfig.defaults;

    it('tiene configuración de pulseLevel', () => {
      assert.ok(typeof knobs.pulseLevel === 'object');
      assert.ok('min' in knobs.pulseLevel);
      assert.ok('max' in knobs.pulseLevel);
      assert.ok('initial' in knobs.pulseLevel);
    });

    it('tiene configuración de pulseWidth', () => {
      assert.ok(typeof knobs.pulseWidth === 'object');
      assert.ok(knobs.pulseWidth.min > 0, 'pulseWidth min debe ser > 0');
      assert.ok(knobs.pulseWidth.max < 1, 'pulseWidth max debe ser < 1');
    });

    it('tiene configuración de frequency', () => {
      assert.ok(typeof knobs.frequency === 'object');
      // El nuevo modelo Synthi 100 usa dial 0-10, por lo que min puede ser 0
      assert.ok(typeof knobs.frequency.min === 'number', 'frequency debe tener min');
      assert.ok(knobs.frequency.max > knobs.frequency.min);
    });

    it('todas las curvas son válidas', () => {
      // El nuevo modelo añade 'synthi100' como curva especial para frecuencia
      const validCurves = ['linear', 'quadratic', 'exponential', 'logarithmic', 'synthi100'];
      
      for (const [param, config] of Object.entries(knobs)) {
        if (config.curve) {
          assert.ok(
            validCurves.includes(config.curve),
            `${param}.curve "${config.curve}" no es válida`
          );
        }
      }
    });

    it('todos los initial están dentro del rango', () => {
      for (const [param, config] of Object.entries(knobs)) {
        if ('initial' in config && 'min' in config && 'max' in config) {
          assert.ok(
            config.initial >= config.min && config.initial <= config.max,
            `${param}.initial ${config.initial} fuera de rango [${config.min}, ${config.max}]`
          );
        }
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validación de knobs de oscilador
// ─────────────────────────────────────────────────────────────────────────────

describe('Knobs de oscilador - valores esperados', () => {
  const { knobs } = oscillatorConfig.defaults;

  it('pulseLevel: rango 0-1', () => {
    assert.strictEqual(knobs.pulseLevel.min, 0);
    assert.strictEqual(knobs.pulseLevel.max, 1);
  });

  it('pulseWidth: rango 0.01-0.99 (evita silencio)', () => {
    assert.ok(knobs.pulseWidth.min > 0);
    assert.ok(knobs.pulseWidth.max < 1);
  });

  it('sineLevel: rango 0-1', () => {
    assert.strictEqual(knobs.sineLevel.min, 0);
    assert.strictEqual(knobs.sineLevel.max, 1);
  });

  it('sineSymmetry: initial 0.5 (seno puro)', () => {
    assert.strictEqual(knobs.sineSymmetry.initial, 0.5);
  });

  it('triangleLevel: rango 0-1', () => {
    assert.strictEqual(knobs.triangleLevel.min, 0);
    assert.strictEqual(knobs.triangleLevel.max, 1);
  });

  it('sawtoothLevel: rango 0-1', () => {
    assert.strictEqual(knobs.sawtoothLevel.min, 0);
    assert.strictEqual(knobs.sawtoothLevel.max, 1);
  });

  it('frequency: usa curva no-lineal para mejor control', () => {
    // La frecuencia típicamente usa quadratic o exponential
    assert.ok(
      knobs.frequency.curve !== 'linear',
      'frequency debería usar curva no-lineal para mejor control en graves'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rango de frecuencia (modelo Synthi 100 - dial 0-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('Rango de frecuencia de osciladores', () => {
  const { frequency } = oscillatorConfig.defaults.knobs;

  it('usa el modelo Synthi 100 (dial 0-10)', () => {
    // El nuevo modelo usa posiciones de dial (0-10) en lugar de Hz directamente
    assert.strictEqual(frequency.min, 0, 'dial min debe ser 0');
    assert.strictEqual(frequency.max, 10, 'dial max debe ser 10');
  });

  it('dial initial es posición central (5)', () => {
    // Posición 5 = 261 Hz (Do central) en el modelo Synthi 100
    assert.strictEqual(frequency.initial, 5);
  });

  it('usa curva synthi100 para conversión a Hz', () => {
    assert.strictEqual(frequency.curve, 'synthi100');
  });
});
