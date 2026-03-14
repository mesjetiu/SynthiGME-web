/**
 * Tests para sequencer.config.js — Digital Sequencer 1000 + Clock
 *
 * Verifica la configuración del secuenciador digital:
 * - Estructura del esquema (schemaVersion, id, title)
 * - Filas de la matriz de audio (Panel 5): DAC 1=87, DAC 2=88
 * - Columnas de control (Panel 5): clock=51, reset=52, fwd=53, rev=54, stop=55
 * - Filas de la matriz de control (Panel 6): voltajes A-F, keys 1-4, clock
 * - Columnas de entrada de voltaje (Panel 6): A·C·E=60, B·D·F=61, key=62
 * - Parámetros de audio (memoria, resolución, voltajes, clock)
 * - Rangos de los 11 knobs (clockRate + 6 voltajes + 4 keys)
 * - Switches de grabación (8 toggles) y buttons de transporte (8)
 *
 * Referencia: Digital Sequencer 1000 (Cuenca/Datanomics 1982)
 *
 * @version 1.0.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sequencerConfig } from '../../src/assets/js/configs/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ESTRUCTURA BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Estructura', () => {

  it('tiene schemaVersion >= 1', () => {
    assert.ok(typeof sequencerConfig.schemaVersion === 'number');
    assert.ok(sequencerConfig.schemaVersion >= 1);
  });

  it('tiene id "sequencer"', () => {
    assert.strictEqual(sequencerConfig.id, 'sequencer');
  });

  it('tiene title "Digital Sequencer 1000"', () => {
    assert.strictEqual(sequencerConfig.title, 'Digital Sequencer 1000');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO MATRIX (Panel 5) — filas de salida
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Audio matrix rows (Panel 5)', () => {

  it('tiene audioMatrixRow con DAC1 y Clock', () => {
    assert.ok(sequencerConfig.audioMatrixRow);
    assert.strictEqual(Object.keys(sequencerConfig.audioMatrixRow).length, 2);
  });

  it('DAC 1 en fila 87', () => {
    assert.strictEqual(sequencerConfig.audioMatrixRow.dac1, 87);
  });

  it('Clock en fila 88', () => {
    assert.strictEqual(sequencerConfig.audioMatrixRow.clock, 88);
  });

  it('las filas de audio son consecutivas (87-88)', () => {
    const rows = Object.values(sequencerConfig.audioMatrixRow).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [87, 88]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO MATRIX (Panel 5) — columnas de control
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Audio matrix cols (Panel 5 control)', () => {

  it('tiene audioMatrixCol con 5 controles', () => {
    assert.ok(sequencerConfig.audioMatrixCol);
    assert.strictEqual(Object.keys(sequencerConfig.audioMatrixCol).length, 5);
  });

  it('clock en columna 51', () => {
    assert.strictEqual(sequencerConfig.audioMatrixCol.clock, 51);
  });

  it('reset en columna 52', () => {
    assert.strictEqual(sequencerConfig.audioMatrixCol.reset, 52);
  });

  it('forward en columna 53', () => {
    assert.strictEqual(sequencerConfig.audioMatrixCol.forward, 53);
  });

  it('reverse en columna 54', () => {
    assert.strictEqual(sequencerConfig.audioMatrixCol.reverse, 54);
  });

  it('stop en columna 55', () => {
    assert.strictEqual(sequencerConfig.audioMatrixCol.stop, 55);
  });

  it('columnas de control son consecutivas (51-55)', () => {
    const cols = Object.values(sequencerConfig.audioMatrixCol).sort((a, b) => a - b);
    assert.deepStrictEqual(cols, [51, 52, 53, 54, 55]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL MATRIX (Panel 6) — filas de salida CV
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Control matrix rows (Panel 6)', () => {

  it('tiene controlMatrixRow con 11 salidas', () => {
    assert.ok(sequencerConfig.controlMatrixRow);
    assert.strictEqual(Object.keys(sequencerConfig.controlMatrixRow).length, 11);
  });

  // Layer 1
  it('voltageA en fila 100', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageA, 100);
  });
  it('voltageB en fila 101', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageB, 101);
  });
  it('key1 en fila 102', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.key1, 102);
  });

  // Layer 2
  it('voltageC en fila 103', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageC, 103);
  });
  it('voltageD en fila 104', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageD, 104);
  });
  it('key2 en fila 105', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.key2, 105);
  });

  // Layer 3
  it('voltageE en fila 106', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageE, 106);
  });
  it('voltageF en fila 107', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.voltageF, 107);
  });
  it('key3 en fila 108', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.key3, 108);
  });

  // Master Key + Clock
  it('key4 en fila 109', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.key4, 109);
  });
  it('clockRate en fila 110', () => {
    assert.strictEqual(sequencerConfig.controlMatrixRow.clockRate, 110);
  });

  it('filas son consecutivas (100-110)', () => {
    const rows = Object.values(sequencerConfig.controlMatrixRow).sort((a, b) => a - b);
    assert.deepStrictEqual(rows, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  });

  it('no hay conflicto con keyboards (filas 111+)', () => {
    const maxRow = Math.max(...Object.values(sequencerConfig.controlMatrixRow));
    assert.ok(maxRow < 111, `fila máxima ${maxRow} debe ser < 111`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL MATRIX (Panel 6) — columnas de entrada de voltaje
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Control matrix cols (Panel 6 voltage input)', () => {

  it('tiene controlMatrixCol con 3 entradas', () => {
    assert.ok(sequencerConfig.controlMatrixCol);
    assert.strictEqual(Object.keys(sequencerConfig.controlMatrixCol).length, 3);
  });

  it('A·C·E en columna 60', () => {
    assert.strictEqual(sequencerConfig.controlMatrixCol.voltageACE, 60);
  });

  it('B·D·F en columna 61', () => {
    assert.strictEqual(sequencerConfig.controlMatrixCol.voltageBDF, 61);
  });

  it('Key en columna 62', () => {
    assert.strictEqual(sequencerConfig.controlMatrixCol.key, 62);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Audio params', () => {

  it('máximo 1024 eventos', () => {
    assert.strictEqual(sequencerConfig.audio.maxEvents, 1024);
  });

  it('8 bytes por evento', () => {
    assert.strictEqual(sequencerConfig.audio.bytesPerEvent, 8);
  });

  it('resolución analógica de 8 bits', () => {
    assert.strictEqual(sequencerConfig.audio.analogResolutionBits, 8);
  });

  it('rango analógico 0-7V', () => {
    assert.strictEqual(sequencerConfig.audio.analogVoltageRange, 7);
  });

  it('voltaje de key activa +5V', () => {
    assert.strictEqual(sequencerConfig.audio.keyOnVoltage, 5);
  });

  it('umbral Schmitt trigger 0.6V', () => {
    assert.strictEqual(sequencerConfig.audio.keyThreshold, 0.6);
  });

  it('máx. frecuencia clock externo 500 Hz', () => {
    assert.strictEqual(sequencerConfig.audio.externalClockMaxHz, 500);
  });

  it('umbral de detección clock externo 1V (Schmitt trigger Z80)', () => {
    assert.strictEqual(sequencerConfig.audio.externalClockThreshold, 1.0);
  });

  it('memoria total coherente: maxEvents × bytesPerEvent <= 8192', () => {
    const totalBytes = sequencerConfig.audio.maxEvents * sequencerConfig.audio.bytesPerEvent;
    assert.ok(totalBytes <= 8192, `${totalBytes} bytes excede 8K RAM`);
    assert.strictEqual(totalBytes, 8192);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KNOBS
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Knobs', () => {

  it('tiene 11 knobs definidos', () => {
    assert.strictEqual(Object.keys(sequencerConfig.knobs).length, 11);
  });

  describe('Clock Rate (Panel 7)', () => {
    const k = () => sequencerConfig.knobs.clockRate;

    it('rango 0-10', () => {
      assert.strictEqual(k().min, 0);
      assert.strictEqual(k().max, 10);
    });

    it('valor inicial 5 (centro)', () => {
      assert.strictEqual(k().initial, 5);
    });

    it('curva exponencial', () => {
      assert.strictEqual(k().curve, 'exponential');
    });
  });

  describe('Voltajes A-F (Panel 4)', () => {
    const voltageKnobs = ['voltageA', 'voltageB', 'voltageC', 'voltageD', 'voltageE', 'voltageF'];

    for (const name of voltageKnobs) {
      it(`${name} tiene rango 0-10`, () => {
        const k = sequencerConfig.knobs[name];
        assert.ok(k, `knob ${name} debe existir`);
        assert.strictEqual(k.min, 0);
        assert.strictEqual(k.max, 10);
      });

      it(`${name} tiene valor inicial 5`, () => {
        assert.strictEqual(sequencerConfig.knobs[name].initial, 5);
      });

      it(`${name} tiene curva lineal`, () => {
        assert.strictEqual(sequencerConfig.knobs[name].curve, 'linear');
      });
    }
  });

  describe('Keys 1-4 (Panel 4)', () => {
    const keyKnobs = ['key1', 'key2', 'key3', 'key4'];

    for (const name of keyKnobs) {
      it(`${name} tiene rango bipolar -5 a +5`, () => {
        const k = sequencerConfig.knobs[name];
        assert.ok(k, `knob ${name} debe existir`);
        assert.strictEqual(k.min, -5);
        assert.strictEqual(k.max, 5);
      });

      it(`${name} tiene valor inicial 0 (centro)`, () => {
        assert.strictEqual(sequencerConfig.knobs[name].initial, 0);
      });

      it(`${name} tiene curva lineal`, () => {
        assert.strictEqual(sequencerConfig.knobs[name].curve, 'linear');
      });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SWITCHES DE GRABACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Switches de grabación', () => {

  it('tiene 8 switches definidos', () => {
    assert.strictEqual(Object.keys(sequencerConfig.switches).length, 8);
  });

  it('todos empiezan desactivados excepto runClock', () => {
    for (const [name, sw] of Object.entries(sequencerConfig.switches)) {
      if (name === 'runClock') {
        assert.strictEqual(sw.initial, true, 'runClock debe iniciar activo');
      } else {
        assert.strictEqual(sw.initial, false, `${name} debe iniciar desactivado`);
      }
    }
  });

  it('abKey1 graba A, B + key1', () => {
    const sw = sequencerConfig.switches.abKey1;
    assert.deepStrictEqual(sw.records.analog, ['A', 'B']);
    assert.deepStrictEqual(sw.records.digital, ['key1']);
  });

  it('b solo graba B', () => {
    const sw = sequencerConfig.switches.b;
    assert.deepStrictEqual(sw.records.analog, ['B']);
    assert.deepStrictEqual(sw.records.digital, []);
  });

  it('cdKey2 graba C, D + key2', () => {
    const sw = sequencerConfig.switches.cdKey2;
    assert.deepStrictEqual(sw.records.analog, ['C', 'D']);
    assert.deepStrictEqual(sw.records.digital, ['key2']);
  });

  it('efKey3 graba E, F + key3', () => {
    const sw = sequencerConfig.switches.efKey3;
    assert.deepStrictEqual(sw.records.analog, ['E', 'F']);
    assert.deepStrictEqual(sw.records.digital, ['key3']);
  });

  it('key4 solo graba key4 (digital)', () => {
    const sw = sequencerConfig.switches.key4;
    assert.deepStrictEqual(sw.records.analog, []);
    assert.deepStrictEqual(sw.records.digital, ['key4']);
  });

  it('runClock no tiene records (es control de clock)', () => {
    assert.ok(!sequencerConfig.switches.runClock.records);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUTTONS DE TRANSPORTE
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Buttons de transporte', () => {

  it('tiene 8 buttons definidos', () => {
    assert.strictEqual(Object.keys(sequencerConfig.buttons).length, 8);
  });

  const expectedButtons = [
    'masterReset', 'runForward', 'runReverse', 'stop',
    'resetSequence', 'stepForward', 'stepReverse', 'testOP'
  ];

  for (const name of expectedButtons) {
    it(`button "${name}" está definido con label`, () => {
      assert.ok(sequencerConfig.buttons[name], `button ${name} debe existir`);
      assert.ok(sequencerConfig.buttons[name].label, `button ${name} debe tener label`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMPS
// ═══════════════════════════════════════════════════════════════════════════

describe('Sequencer Config — Ramps', () => {

  it('tiene ramps definido', () => {
    assert.ok(sequencerConfig.ramps);
  });

  it('outputLevel positivo y pequeño', () => {
    assert.ok(sequencerConfig.ramps.outputLevel > 0);
    assert.ok(sequencerConfig.ramps.outputLevel < 0.1);
  });
});
