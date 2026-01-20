/**
 * Tests para outputChannel.config.js
 * Verifican la estructura y valores de configuración de los Output Channels.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { outputChannelConfig } from '../../src/assets/js/configs/index.js';

describe('Output Channel Config', () => {
  
  describe('estructura básica', () => {
    it('debe tener schemaVersion', () => {
      assert.equal(outputChannelConfig.schemaVersion, 1);
    });
    
    it('debe tener count = 8', () => {
      assert.equal(outputChannelConfig.count, 8);
    });
  });
  
  describe('knobs', () => {
    it('debe tener configuración de filter', () => {
      const filter = outputChannelConfig.knobs.filter;
      assert.ok(filter);
      assert.equal(filter.min, -1);
      assert.equal(filter.max, 1);
      assert.equal(filter.initial, 0);
      assert.equal(filter.pixelsForFullRange, 900);
    });
    
    it('debe tener configuración de pan', () => {
      const pan = outputChannelConfig.knobs.pan;
      assert.ok(pan);
      assert.equal(pan.min, -1);
      assert.equal(pan.max, 1);
      assert.equal(pan.initial, 0);
      assert.equal(pan.pixelsForFullRange, 900);
    });
  });
  
  describe('faders', () => {
    it('debe tener configuración de level', () => {
      const level = outputChannelConfig.faders.level;
      assert.ok(level);
      assert.equal(level.min, 0);
      assert.equal(level.max, 1);
      assert.equal(level.initial, 0);
      assert.equal(level.step, 0.001);
    });
  });
  
  describe('switches', () => {
    it('debe tener configuración de power', () => {
      const power = outputChannelConfig.switches.power;
      assert.ok(power);
      assert.equal(power.initial, true);
    });
  });
  
  describe('audio', () => {
    it('debe tener tiempos de suavizado', () => {
      const audio = outputChannelConfig.audio;
      assert.ok(audio);
      assert.equal(audio.levelSmoothingTime, 0.06);
      assert.equal(audio.panSmoothingTime, 0.03);
      assert.equal(audio.filterSmoothingTime, 0.03);
    });
    
    it('debe tener configuración de filtro', () => {
      const filter = outputChannelConfig.audio.filter;
      assert.ok(filter);
      assert.ok(filter.lowpassFreq);
      assert.ok(filter.highpassFreq);
      assert.equal(filter.Q, 0.707);
    });
  });
});
