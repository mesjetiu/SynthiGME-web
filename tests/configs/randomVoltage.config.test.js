/**
 * Tests para randomVoltage.config.js — Random Control Voltage Generator
 * 
 * Verifica la configuración del generador de voltaje de control aleatorio:
 * - Estructura del esquema (schemaVersion, id, title)
 * - Filas de la matriz de control (Panel 6): key=89, V1=90, V2=91
 * - Parámetros de audio (frecuencias, ancho de pulso, voltajes, CV)
 * - Curva logarítmica del potenciómetro de nivel
 * - Rangos y valores iniciales de los 5 knobs
 * - Coherencia entre parámetros de audio y configuración de knobs
 * 
 * Referencia: Placa PC-21, plano D100-21 C1 (Cuenca/Datanomics 1982)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { randomVoltageConfig } from '../../src/assets/js/configs/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Estructura', () => {
  
  it('tiene schemaVersion >= 1', () => {
    assert.ok(typeof randomVoltageConfig.schemaVersion === 'number');
    assert.ok(randomVoltageConfig.schemaVersion >= 1);
  });
  
  it('tiene id "panel3-random-cv"', () => {
    assert.strictEqual(randomVoltageConfig.id, 'panel3-random-cv');
  });
  
  it('tiene title "Random Control Voltage"', () => {
    assert.strictEqual(randomVoltageConfig.title, 'Random Control Voltage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX ROWS (Panel 6)
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Matrix rows (Panel 6)', () => {
  
  it('tiene matrixRow definido con 3 salidas', () => {
    assert.ok(randomVoltageConfig.matrixRow);
    assert.strictEqual(Object.keys(randomVoltageConfig.matrixRow).length, 3);
  });
  
  it('key está en fila 89', () => {
    assert.strictEqual(randomVoltageConfig.matrixRow.key, 89);
  });
  
  it('voltage1 está en fila 90', () => {
    assert.strictEqual(randomVoltageConfig.matrixRow.voltage1, 90);
  });
  
  it('voltage2 está en fila 91', () => {
    assert.strictEqual(randomVoltageConfig.matrixRow.voltage2, 91);
  });
  
  it('filas son consecutivas empezando en 89', () => {
    const rows = Object.values(randomVoltageConfig.matrixRow).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [89, 90, 91]);
  });
  
  it('filas son posteriores a las de los osciladores 10-12 (83-88)', () => {
    const minRow = Math.min(...Object.values(randomVoltageConfig.matrixRow));
    assert.ok(minRow > 88, `Fila mínima ${minRow} debe ser > 88 (última fila osc)`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Parámetros de audio', () => {
  
  const { audio } = randomVoltageConfig;
  
  it('tiene sección audio definida', () => {
    assert.ok(audio, 'debe tener sección audio');
  });
  
  it('minFreq = 0.2 Hz (un evento cada 5 segundos)', () => {
    assert.strictEqual(audio.minFreq, 0.2);
  });
  
  it('maxFreq = 20 Hz (50 ms por evento)', () => {
    assert.strictEqual(audio.maxFreq, 20);
  });
  
  it('ratio de frecuencias = 100 (≈6.6 octavas)', () => {
    const ratio = audio.maxFreq / audio.minFreq;
    assert.strictEqual(ratio, 100);
  });
  
  it('keyPulseWidth = 5 ms', () => {
    assert.strictEqual(audio.keyPulseWidth, 0.005);
  });
  
  it('maxVoltage = ±2.5V (5V pico a pico)', () => {
    assert.strictEqual(audio.maxVoltage, 2.5);
  });
  
  it('keyMaxVoltage = ±5V', () => {
    assert.strictEqual(audio.keyMaxVoltage, 5.0);
  });
  
  it('voltsPerOctave = 0.55 (sensibilidad CV del circuito real)', () => {
    assert.strictEqual(audio.voltsPerOctave, 0.55);
  });
  
  it('keyMaxVoltage es el doble de maxVoltage', () => {
    assert.strictEqual(audio.keyMaxVoltage, audio.maxVoltage * 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CURVA LOGARÍTMICA DE NIVEL
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Curva LOG de nivel', () => {
  
  it('tipo es "log"', () => {
    assert.strictEqual(randomVoltageConfig.levelCurve.type, 'log');
  });
  
  it('base logarítmica = 100 (potenciómetro 10K LOG)', () => {
    assert.strictEqual(randomVoltageConfig.levelCurve.logBase, 100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIEMPOS DE RAMPA
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Ramps', () => {
  
  it('rampa de nivel = 60 ms', () => {
    assert.strictEqual(randomVoltageConfig.ramps.level, 0.06);
  });
  
  it('rampa de mean = 50 ms', () => {
    assert.strictEqual(randomVoltageConfig.ramps.mean, 0.05);
  });
  
  it('rampas son positivas y menores a 1 segundo', () => {
    for (const [name, value] of Object.entries(randomVoltageConfig.ramps)) {
      assert.ok(value > 0, `rampa ${name} debe ser positiva`);
      assert.ok(value < 1, `rampa ${name} debe ser < 1s`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS — RANGOS Y VALORES INICIALES
// ═══════════════════════════════════════════════════════════════════════════

describe('RandomVoltage Config — Knobs', () => {
  
  const { knobs } = randomVoltageConfig;
  
  it('tiene exactamente 5 knobs', () => {
    assert.strictEqual(Object.keys(knobs).length, 5);
  });
  
  it('nombres de knobs son mean, variance, voltage1, voltage2, key', () => {
    const expected = ['mean', 'variance', 'voltage1', 'voltage2', 'key'];
    assert.deepStrictEqual(Object.keys(knobs).sort(), expected.sort());
  });
  
  describe('mean (frecuencia del reloj, -5 a +5)', () => {
    it('rango -5 a +5', () => {
      assert.strictEqual(knobs.mean.min, -5);
      assert.strictEqual(knobs.mean.max, 5);
    });
    
    it('valor inicial = 0 (centro del rango)', () => {
      assert.strictEqual(knobs.mean.initial, 0);
    });
    
    it('curva lineal', () => {
      assert.strictEqual(knobs.mean.curve, 'linear');
    });
  });
  
  describe('variance (varianza temporal, -5 a +5)', () => {
    it('rango -5 a +5', () => {
      assert.strictEqual(knobs.variance.min, -5);
      assert.strictEqual(knobs.variance.max, 5);
    });
    
    it('valor inicial = 0 (50% varianza)', () => {
      assert.strictEqual(knobs.variance.initial, 0);
    });
    
    it('curva lineal', () => {
      assert.strictEqual(knobs.variance.curve, 'linear');
    });
  });
  
  describe('voltage1 (nivel de salida V1, 0 a 10)', () => {
    it('rango 0 a 10', () => {
      assert.strictEqual(knobs.voltage1.min, 0);
      assert.strictEqual(knobs.voltage1.max, 10);
    });
    
    it('valor inicial = 0 (silencio)', () => {
      assert.strictEqual(knobs.voltage1.initial, 0);
    });
  });
  
  describe('voltage2 (nivel de salida V2, 0 a 10)', () => {
    it('rango 0 a 10', () => {
      assert.strictEqual(knobs.voltage2.min, 0);
      assert.strictEqual(knobs.voltage2.max, 10);
    });
    
    it('valor inicial = 0 (silencio)', () => {
      assert.strictEqual(knobs.voltage2.initial, 0);
    });
  });
  
  describe('key (amplitud del pulso, -5 a +5)', () => {
    it('rango -5 a +5', () => {
      assert.strictEqual(knobs.key.min, -5);
      assert.strictEqual(knobs.key.max, 5);
    });
    
    it('valor inicial = 0 (sin pulso)', () => {
      assert.strictEqual(knobs.key.initial, 0);
    });
  });
  
  describe('coherencia', () => {
    it('todos los knobs tienen min, max, initial y curve', () => {
      for (const [name, cfg] of Object.entries(knobs)) {
        assert.ok(typeof cfg.min === 'number', `${name}.min debe ser number`);
        assert.ok(typeof cfg.max === 'number', `${name}.max debe ser number`);
        assert.ok(typeof cfg.initial === 'number', `${name}.initial debe ser number`);
        assert.ok(typeof cfg.curve === 'string', `${name}.curve debe ser string`);
      }
    });
    
    it('todos los valores iniciales están dentro del rango', () => {
      for (const [name, cfg] of Object.entries(knobs)) {
        assert.ok(cfg.initial >= cfg.min,
          `${name}.initial (${cfg.initial}) >= min (${cfg.min})`);
        assert.ok(cfg.initial <= cfg.max,
          `${name}.initial (${cfg.initial}) <= max (${cfg.max})`);
      }
    });
    
    it('min < max en todos los knobs', () => {
      for (const [name, cfg] of Object.entries(knobs)) {
        assert.ok(cfg.min < cfg.max,
          `${name}: min (${cfg.min}) < max (${cfg.max})`);
      }
    });
    
    it('voltage1 y voltage2 tienen el mismo rango', () => {
      assert.strictEqual(knobs.voltage1.min, knobs.voltage2.min);
      assert.strictEqual(knobs.voltage1.max, knobs.voltage2.max);
    });
    
    it('mean y variance tienen el mismo rango simétrico', () => {
      assert.strictEqual(knobs.mean.min, -knobs.mean.max);
      assert.strictEqual(knobs.variance.min, -knobs.variance.max);
      assert.strictEqual(knobs.mean.min, knobs.variance.min);
    });
    
    it('key tiene rango simétrico', () => {
      assert.strictEqual(knobs.key.min, -knobs.key.max);
    });
  });
});
