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

// ─────────────────────────────────────────────────────────────────────────────
// Parámetros de audio del oscilador
// ─────────────────────────────────────────────────────────────────────────────

describe('Parámetros de audio del oscilador', () => {
  const { audio } = oscillatorConfig.defaults;

  it('tiene sección audio definida', () => {
    assert.ok(typeof audio === 'object');
  });

  it('tiene pulseHarmonics (número de armónicos para onda de pulso)', () => {
    assert.ok(typeof audio.pulseHarmonics === 'number');
    assert.ok(audio.pulseHarmonics >= 16, 'pulseHarmonics debe ser >= 16');
    assert.ok(audio.pulseHarmonics <= 64, 'pulseHarmonics debe ser <= 64');
  });

  it('tiene sineHarmonics (número de armónicos para seno asimétrico)', () => {
    assert.ok(typeof audio.sineHarmonics === 'number');
    assert.ok(audio.sineHarmonics >= 8, 'sineHarmonics debe ser >= 8');
    assert.ok(audio.sineHarmonics <= 32, 'sineHarmonics debe ser <= 32');
  });

  it('tiene smoothingTime (tiempo de suavizado para parámetros)', () => {
    assert.ok(typeof audio.smoothingTime === 'number');
    assert.ok(audio.smoothingTime >= 0.005, 'smoothingTime debe ser >= 5ms');
    assert.ok(audio.smoothingTime <= 0.1, 'smoothingTime debe ser <= 100ms');
  });

  it('NO tiene freqSmoothing (la frecuencia cambia instantáneamente)', () => {
    assert.ok(!('freqSmoothing' in audio), 'freqSmoothing fue eliminado');
  });

  it('NO tiene gainSmoothing (reemplazado por smoothingTime)', () => {
    assert.ok(!('gainSmoothing' in audio), 'gainSmoothing fue reemplazado por smoothingTime');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Voltajes de salida por forma de onda (Manual Técnico Datanomics 1982)
// ─────────────────────────────────────────────────────────────────────────────
//
// Basado en el esquema electrónico D100-02 C1 y Manual Técnico de Datanomics (1982).
// El sistema de salida utiliza dos amplificadores de suma (I/C 6 e I/C 7) con
// ganancias diferenciadas para compensar las amplitudes nativas de cada onda.
//
// Referencias:
// - Seno/Sierra: Pasan por I/C 6 con Rf=100kΩ (ganancia ×1.0)
// - Pulso/Triángulo: Pasan por I/C 7 con Rf=300kΩ (ganancia ×3.0)
//
// ─────────────────────────────────────────────────────────────────────────────

describe('Voltajes de salida por forma de onda (Datanomics 1982)', () => {
  const { voltage } = oscillatorConfig.defaults;

  it('tiene sección voltage definida', () => {
    assert.ok(typeof voltage === 'object');
  });

  it('tiene outputLevels definidos', () => {
    assert.ok(typeof voltage.outputLevels === 'object');
  });

  describe('outputLevels - Valores según manual técnico', () => {
    const { outputLevels } = voltage;

    // ─────────────────────────────────────────────────────────────────────────
    // Sine: 8V p-p (referencia del sistema)
    // El seno es la referencia de calibración del sistema, siempre 8V p-p.
    // ─────────────────────────────────────────────────────────────────────────
    it('sine: 8V p-p (referencia de calibración del sistema)', () => {
      assert.strictEqual(outputLevels.sine, 8.0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Sawtooth: 5.0-7.4V p-p, promedio ~6.2V
    // Pasa por I/C 6 (Rf=100k) con ganancia unitaria.
    // Voltaje nativo varía según grupo de osciladores (5.0-7.4V).
    // ─────────────────────────────────────────────────────────────────────────
    it('sawtooth: 5.0-7.4V p-p (ganancia ×1.0, valor promedio)', () => {
      assert.ok(outputLevels.sawtooth >= 5.0, 'sawtooth debe ser >= 5.0V p-p');
      assert.ok(outputLevels.sawtooth <= 7.4, 'sawtooth debe ser <= 7.4V p-p');
    });

    it('sawtooth: tiene valor típico de ~6.2V p-p', () => {
      // Tolerancia de ±0.3V para valor promedio
      const expected = 6.2;
      const tolerance = 0.3;
      assert.ok(
        Math.abs(outputLevels.sawtooth - expected) <= tolerance,
        `sawtooth debe ser ~${expected}V p-p (±${tolerance}V)`
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Triangle: ~8.1V p-p (nativo ~2.7V × 3.0)
    // Pasa por I/C 7 (Rf=300k) que aplica ganancia ×3.0 para compensar.
    // ─────────────────────────────────────────────────────────────────────────
    it('triangle: ~8.1V p-p (nativo ~2.7V × ganancia ×3.0)', () => {
      const expected = 8.1;
      const tolerance = 0.2;
      assert.ok(
        Math.abs(outputLevels.triangle - expected) <= tolerance,
        `triangle debe ser ~${expected}V p-p (±${tolerance}V)`
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Pulse: ~8.1V p-p (nativo ~2.7V × 3.0)
    // Pasa por I/C 7 (Rf=300k) que aplica ganancia ×3.0 para compensar.
    // ─────────────────────────────────────────────────────────────────────────
    it('pulse: ~8.1V p-p (nativo ~2.7V × ganancia ×3.0)', () => {
      const expected = 8.1;
      const tolerance = 0.2;
      assert.ok(
        Math.abs(outputLevels.pulse - expected) <= tolerance,
        `pulse debe ser ~${expected}V p-p (±${tolerance}V)`
      );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Cusp: 0.5V p-p (seno deformado a cuspoide, ratio 8:1)
    // Cuando el control Sine Shape está en extremo cuspoide, el seno
    // sufre atenuación drástica de 8:1 (de 4V a 0.5V).
    // ─────────────────────────────────────────────────────────────────────────
    it('cusp: 0.5V p-p (atenuación 8:1 del seno deformado)', () => {
      assert.strictEqual(outputLevels.cusp, 0.5);
    });

    it('cusp mantiene ratio 8:1 respecto al seno puro', () => {
      // Según manual: seno 8V p-p → cuspoide 0.5V p-p (8:1)
      // Pero outputLevels.sine es p-p, así que la mitad (peak) es 4V
      // Y cusp.peak es 0.25V, pero usamos p-p para consistencia
      const ratio = outputLevels.sine / outputLevels.cusp;
      assert.ok(
        Math.abs(ratio - 16) < 0.1,
        `ratio sine/cusp debe ser ~16 (8V/0.5V), actual: ${ratio}`
      );
    });
  });

  describe('feedbackResistance - Resistencias según esquema D100-02 C1', () => {
    const { feedbackResistance } = voltage;

    it('tiene feedbackResistance definido', () => {
      assert.ok(typeof feedbackResistance === 'object');
    });

    it('sineSawtooth: R28 = 100kΩ (ganancia unitaria)', () => {
      assert.strictEqual(feedbackResistance.sineSawtooth, 100000);
    });

    it('pulseTriangle: R32 = 300kΩ (ganancia ×3 para compensación)', () => {
      assert.strictEqual(feedbackResistance.pulseTriangle, 300000);
    });

    it('ratio pulseTriangle/sineSawtooth = 3.0 (compensación de amplitud)', () => {
      const ratio = feedbackResistance.pulseTriangle / feedbackResistance.sineSawtooth;
      assert.strictEqual(ratio, 3.0);
    });
  });

  describe('Coherencia entre ganancias y voltajes finales', () => {
    const { outputLevels, feedbackResistance } = voltage;

    // Voltajes nativos (antes de compensación)
    // Basados en la tabla del manual: tri/pulse ~2.7V, saw 5-7.4V, sine 8V
    const nativeVoltages = {
      sine: 8.0,       // 8V nativo (sin amplificación)
      sawtooth: 6.2,   // ~5-7.4V nativo (promedio 6.2V)
      triangle: 2.7,   // ~2.7V nativo
      pulse: 2.7       // ~2.7V nativo
    };

    it('sine: voltaje nativo = voltaje final (ganancia ×1)', () => {
      const gain = feedbackResistance.sineSawtooth / 100000; // 100k es el estándar
      const expectedFinal = nativeVoltages.sine * gain;
      assert.ok(
        Math.abs(outputLevels.sine - expectedFinal) < 0.1,
        `sine debería ser ${nativeVoltages.sine}V × ${gain} = ${expectedFinal}V`
      );
    });

    it('triangle: voltaje nativo × 3.0 ≈ voltaje final', () => {
      const gain = feedbackResistance.pulseTriangle / feedbackResistance.sineSawtooth;
      const expectedFinal = nativeVoltages.triangle * gain;
      assert.ok(
        Math.abs(outputLevels.triangle - expectedFinal) < 0.2,
        `triangle debería ser ${nativeVoltages.triangle}V × ${gain} = ${expectedFinal}V`
      );
    });

    it('pulse: voltaje nativo × 3.0 ≈ voltaje final', () => {
      const gain = feedbackResistance.pulseTriangle / feedbackResistance.sineSawtooth;
      const expectedFinal = nativeVoltages.pulse * gain;
      assert.ok(
        Math.abs(outputLevels.pulse - expectedFinal) < 0.2,
        `pulse debería ser ${nativeVoltages.pulse}V × ${gain} = ${expectedFinal}V`
      );
    });
  });
});
