/**
 * Tests para pitchToVoltageConverter.config.js — Pitch to Voltage Converter
 * 
 * Verifica la configuración del convertidor pitch-a-voltaje:
 * - Estructura del esquema (schemaVersion, id, title)
 * - Columna de la matriz de audio (Panel 5): input en columna 50
 * - Fila de la matriz de control (Panel 6): output en fila 121
 * - Parámetros de audio (rango de frecuencias, umbral, etc.)
 * - Rangos y valores iniciales del knob Range (vernier)
 * - Coherencia entre parámetros
 * 
 * Referencia: Placa PC-25, plano D100-25 C1 (Cuenca/Datanomics 1982)
 * 
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pitchToVoltageConverterConfig } from '../../src/assets/js/configs/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Estructura', () => {
  
  it('tiene schemaVersion >= 1', () => {
    assert.ok(typeof pitchToVoltageConverterConfig.schemaVersion === 'number');
    assert.ok(pitchToVoltageConverterConfig.schemaVersion >= 1);
  });
  
  it('tiene id "pitch-to-voltage-converter"', () => {
    assert.strictEqual(pitchToVoltageConverterConfig.id, 'pitch-to-voltage-converter');
  });
  
  it('tiene title "Pitch to Voltage Converter"', () => {
    assert.strictEqual(pitchToVoltageConverterConfig.title, 'Pitch to Voltage Converter');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX COLUMN (Panel 5) — Entrada de audio
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Matrix column (Panel 5)', () => {
  
  it('tiene matrixCol definido', () => {
    assert.ok(pitchToVoltageConverterConfig.matrixCol);
  });
  
  it('input está en columna 50', () => {
    assert.strictEqual(pitchToVoltageConverterConfig.matrixCol.input, 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRIX ROW (Panel 6) — Salida de voltaje de control
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Matrix row (Panel 6)', () => {
  
  it('tiene matrixRow definido', () => {
    assert.ok(pitchToVoltageConverterConfig.matrixRow);
  });
  
  it('voltage está en fila 121', () => {
    assert.strictEqual(pitchToVoltageConverterConfig.matrixRow.voltage, 121);
  });
  
  it('fila es posterior a las de los joysticks (117-120)', () => {
    const row = pitchToVoltageConverterConfig.matrixRow.voltage;
    assert.ok(row > 120, `Fila ${row} debe ser > 120 (última fila joystick)`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Parámetros de audio', () => {
  
  it('tiene sección audio', () => {
    assert.ok(pitchToVoltageConverterConfig.audio);
  });
  
  it('minFreq es >= 200 Hz (límite inferior del PVC)', () => {
    assert.ok(pitchToVoltageConverterConfig.audio.minFreq >= 200);
  });
  
  it('maxFreq permite rango útil (al menos 4000 Hz)', () => {
    assert.ok(pitchToVoltageConverterConfig.audio.maxFreq >= 4000);
  });
  
  it('tiene umbral de amplitud para track-and-hold', () => {
    assert.ok(typeof pitchToVoltageConverterConfig.audio.amplitudeThreshold === 'number');
    assert.ok(pitchToVoltageConverterConfig.audio.amplitudeThreshold > 0);
    assert.ok(pitchToVoltageConverterConfig.audio.amplitudeThreshold < 1);
  });

  it('tiene voltaje por octava (1V/Oct estándar)', () => {
    assert.ok(typeof pitchToVoltageConverterConfig.audio.voltsPerOctave === 'number');
    assert.ok(pitchToVoltageConverterConfig.audio.voltsPerOctave > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIEMPOS DE RAMPA
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Ramps', () => {
  
  it('tiene ramps definido', () => {
    assert.ok(pitchToVoltageConverterConfig.ramps);
  });
  
  it('tiene rampa de level para suavizado de salida', () => {
    assert.ok(typeof pitchToVoltageConverterConfig.ramps.level === 'number');
    assert.ok(pitchToVoltageConverterConfig.ramps.level > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Knobs', () => {
  
  it('tiene sección knobs', () => {
    assert.ok(pitchToVoltageConverterConfig.knobs);
  });
  
  it('tiene knob range (Pitch Spread)', () => {
    const range = pitchToVoltageConverterConfig.knobs.range;
    assert.ok(range);
    assert.strictEqual(range.min, 0);
    assert.strictEqual(range.max, 10);
    assert.ok(typeof range.initial === 'number');
    assert.ok(range.initial >= range.min && range.initial <= range.max);
  });
  
  it('range initial es ~7 (1:1 oct tracking según manual)', () => {
    // Posición ~7 da seguimiento 1:1 (1 oct input → 1 oct output)
    assert.strictEqual(pitchToVoltageConverterConfig.knobs.range.initial, 7);
  });
  
  it('range tiene label', () => {
    assert.ok(typeof pitchToVoltageConverterConfig.knobs.range.label === 'string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COHERENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('PitchToVoltageConverter Config — Coherencia', () => {
  
  it('minFreq < maxFreq', () => {
    assert.ok(pitchToVoltageConverterConfig.audio.minFreq < pitchToVoltageConverterConfig.audio.maxFreq);
  });
  
  it('knob range es un vernier (0-10)', () => {
    const range = pitchToVoltageConverterConfig.knobs.range;
    assert.strictEqual(range.min, 0);
    assert.strictEqual(range.max, 10);
  });
});
