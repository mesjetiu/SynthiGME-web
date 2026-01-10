/**
 * Tests para panelBlueprints/panel2.config.js y panel3.config.js
 * 
 * Verifica la configuración del osciloscopio y osciladores.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel2Config from '../../src/assets/js/panelBlueprints/panel2.config.js';
import panel3Config from '../../src/assets/js/panelBlueprints/panel3.config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Panel 2 Config - Osciloscopio
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 2 Config - Oscilloscope', () => {
  it('tiene configuración de oscilloscope', () => {
    assert.ok(typeof panel2Config.oscilloscope === 'object');
  });

  describe('display config', () => {
    const { display } = panel2Config.oscilloscope;

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
    const { audio } = panel2Config.oscilloscope;

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
// Panel 3 Config - Osciladores
// ─────────────────────────────────────────────────────────────────────────────

describe('Panel 3 Config - Oscillators', () => {
  it('tiene schemaVersion definido', () => {
    assert.ok(typeof panel3Config.schemaVersion === 'number');
    assert.ok(panel3Config.schemaVersion >= 1);
  });

  it('tiene defaults definidos', () => {
    assert.ok(typeof panel3Config.defaults === 'object');
  });

  describe('defaults.knobs', () => {
    const { knobs } = panel3Config.defaults;

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
      assert.ok(knobs.frequency.min > 0, 'frequency min debe ser > 0');
      assert.ok(knobs.frequency.max > knobs.frequency.min);
    });

    it('todas las curvas son válidas', () => {
      const validCurves = ['linear', 'quadratic', 'exponential', 'logarithmic'];
      
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
  const { knobs } = panel3Config.defaults;

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
// Rango de frecuencia
// ─────────────────────────────────────────────────────────────────────────────

describe('Rango de frecuencia de osciladores', () => {
  const { frequency } = panel3Config.defaults.knobs;

  it('min es sub-audio (< 20 Hz para LFO)', () => {
    assert.ok(frequency.min < 20);
  });

  it('max cubre rango audible alto', () => {
    assert.ok(frequency.max >= 1000);
  });

  it('initial es valor razonable para pruebas', () => {
    // Típicamente un valor bajo para no ser molesto al cargar
    assert.ok(frequency.initial >= frequency.min);
    assert.ok(frequency.initial <= frequency.max);
  });
});
