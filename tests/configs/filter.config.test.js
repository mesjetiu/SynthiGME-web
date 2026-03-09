import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { filterConfig } from '../../src/assets/js/configs/index.js';

describe('Filter Config — estructura 1982', () => {
  it('expone schemaVersion y processor', () => {
    assert.equal(filterConfig.schemaVersion, 1);
    assert.equal(filterConfig.processor, 'synthi-filter');
  });

  it('usa arquitectura CEM 3320 de 4 polos', () => {
    assert.equal(filterConfig.audio.chip, 'CEM3320');
    assert.equal(filterConfig.audio.topology, '4-pole');
    assert.equal(filterConfig.audio.slopeDbPerOctave, 24);
  });

  it('rango general de corte llega hasta 20 kHz', () => {
    assert.equal(filterConfig.audio.minCutoffHz, 3);
    assert.equal(filterConfig.audio.maxCutoffHz, 20000);
  });

  it('posición 5 del dial equivale a 320 Hz', () => {
    assert.equal(filterConfig.audio.referenceDial, 5);
    assert.equal(filterConfig.audio.referenceCutoffHz, 320);
  });

  it('cada 0.7 divisiones equivale a una octava', () => {
    assert.equal(filterConfig.audio.octaveDialSpan, 0.7);
  });

  it('tracking de frecuencia usa 0.55 V por octava', () => {
    assert.equal(filterConfig.audio.voltsPerOctave, 0.55);
  });

  it('tracking por teclado: 4 octavas precisas, 5 aceptables', () => {
    assert.equal(filterConfig.audio.preciseTrackingOctaves, 4);
    assert.equal(filterConfig.audio.acceptableTrackingOctaves, 5);
  });

  it('auto-oscilación arranca sobre response ≈ 5.5 y Q máximo 20', () => {
    assert.equal(filterConfig.audio.selfOscillationThresholdDial, 5.5);
    assert.equal(filterConfig.audio.maxQ, 20);
  });
});

describe('Filter Config — knobs', () => {
  const { knobs } = filterConfig;

  it('define frequency, response y level', () => {
    assert.deepEqual(Object.keys(knobs).sort(), ['frequency', 'level', 'response']);
  });

  it('frequency usa escala 0-10 con valor inicial 5', () => {
    assert.equal(knobs.frequency.min, 0);
    assert.equal(knobs.frequency.max, 10);
    assert.equal(knobs.frequency.initial, 5);
  });

  it('response usa escala 0-10 con valor inicial 0', () => {
    assert.equal(knobs.response.min, 0);
    assert.equal(knobs.response.max, 10);
    assert.equal(knobs.response.initial, 0);
  });

  it('level usa escala 0-10 con valor inicial 0', () => {
    assert.equal(knobs.level.min, 0);
    assert.equal(knobs.level.max, 10);
    assert.equal(knobs.level.initial, 0);
  });
});

describe('Filter Config — matrices', () => {
  it('LP usa columnas 15-18, filas 110-113 y CV 22-25', () => {
    assert.deepEqual(filterConfig.lowPass.matrix.audioInputs, [15, 16, 17, 18]);
    assert.deepEqual(filterConfig.lowPass.matrix.audioOutputs, [110, 111, 112, 113]);
    assert.deepEqual(filterConfig.lowPass.matrix.controlInputs, [22, 23, 24, 25]);
    assert.equal(filterConfig.lowPass.minCutoffHz, 3);
  });

  it('HP usa columnas 19-22, filas 114-117 y CV 26-29', () => {
    assert.deepEqual(filterConfig.highPass.matrix.audioInputs, [19, 20, 21, 22]);
    assert.deepEqual(filterConfig.highPass.matrix.audioOutputs, [114, 115, 116, 117]);
    assert.deepEqual(filterConfig.highPass.matrix.controlInputs, [26, 27, 28, 29]);
    assert.equal(filterConfig.highPass.minCutoffHz, 4);
  });

  it('define 4 filtros LP y 4 HP', () => {
    assert.equal(filterConfig.lowPass.count, 4);
    assert.equal(filterConfig.highPass.count, 4);
    assert.deepEqual(filterConfig.lowPass.ids, ['flp1', 'flp2', 'flp3', 'flp4']);
    assert.deepEqual(filterConfig.highPass.ids, ['fhp1', 'fhp2', 'fhp3', 'fhp4']);
  });
});
