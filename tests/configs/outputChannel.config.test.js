/**
 * Tests para outputChannel.config.js
 * Verifican la estructura y valores de configuración de los Output Channels.
 * 
 * Incluye tests para el modelo VCA CEM 3330 (Cuenca/Datanomics 1982).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { outputChannelConfig } from '../../src/assets/js/configs/index.js';

describe('Output Channel Config', () => {
  
  describe('estructura básica', () => {
    it('debe tener schemaVersion 2 (cambio de escala fader)', () => {
      assert.equal(outputChannelConfig.schemaVersion, 2);
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
    it('debe tener configuración de level con escala 0-10', () => {
      const level = outputChannelConfig.faders.level;
      assert.ok(level);
      assert.equal(level.min, 0);
      assert.equal(level.max, 10, 'El fader debe usar escala 0-10 como el dial físico');
      assert.equal(level.initial, 0);
      assert.equal(level.step, 0.01, 'Paso de 0.01 para 1000 posiciones (mayor resolución)');
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
  
  // ─────────────────────────────────────────────────────────────────────────
  // Tests VCA CEM 3330 (Cuenca/Datanomics 1982)
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('vca (CEM 3330)', () => {
    
    it('debe existir la sección vca', () => {
      assert.ok(outputChannelConfig.vca, 'Debe existir configuración VCA');
    });
    
    describe('sensibilidad', () => {
      it('debe tener dbPerVolt = 10 (especificación CEM 3330)', () => {
        assert.equal(outputChannelConfig.vca.dbPerVolt, 10);
      });
    });
    
    describe('rango de voltaje del slider', () => {
      it('debe tener sliderVoltage.atMax = 0V (posición 10 del dial)', () => {
        assert.equal(outputChannelConfig.vca.sliderVoltage.atMax, 0);
      });
      
      it('debe tener sliderVoltage.atMin = -12V (posición 0 del dial)', () => {
        assert.equal(outputChannelConfig.vca.sliderVoltage.atMin, -12);
      });
      
      it('el rango de voltaje debe cubrir 120 dB (12V × 10 dB/V)', () => {
        const range = outputChannelConfig.vca.sliderVoltage.atMax - 
                     outputChannelConfig.vca.sliderVoltage.atMin;
        const dbRange = range * outputChannelConfig.vca.dbPerVolt;
        assert.equal(dbRange, 120, 'Rango dinámico debe ser 120 dB');
      });
    });
    
    describe('umbral de corte', () => {
      it('debe tener cutoffVoltage = -12V', () => {
        assert.equal(outputChannelConfig.vca.cutoffVoltage, -12);
      });
      
      it('cutoffVoltage debe coincidir con sliderVoltage.atMin', () => {
        assert.equal(
          outputChannelConfig.vca.cutoffVoltage,
          outputChannelConfig.vca.sliderVoltage.atMin,
          'El corte total ocurre en el mínimo del slider'
        );
      });
    });
    
    describe('saturación (CV positivo)', () => {
      it('debe tener parámetros de saturación', () => {
        const sat = outputChannelConfig.vca.saturation;
        assert.ok(sat, 'Debe existir configuración de saturación');
      });
      
      it('linearThreshold debe ser 0V (saturación empieza en CV positivo)', () => {
        assert.equal(outputChannelConfig.vca.saturation.linearThreshold, 0);
      });
      
      it('hardLimit debe ser 3V (raíl de alimentación efectivo)', () => {
        assert.equal(outputChannelConfig.vca.saturation.hardLimit, 3);
      });
      
      it('softness debe ser 2 (compresión moderada)', () => {
        assert.equal(outputChannelConfig.vca.saturation.softness, 2);
      });
      
      it('hardLimit debe ser mayor que linearThreshold', () => {
        const sat = outputChannelConfig.vca.saturation;
        assert.ok(
          sat.hardLimit > sat.linearThreshold,
          'El límite duro debe estar después del umbral lineal'
        );
      });
    });
    
    describe('coherencia con constantes globales', () => {
      // Importar constantes de voltageConstants.js para verificar coherencia
      it('los valores deben ser coherentes con VCA_* en voltageConstants.js', async () => {
        const { 
          VCA_DB_PER_VOLT, 
          VCA_SLIDER_VOLTAGE_AT_MAX,
          VCA_SLIDER_VOLTAGE_AT_MIN,
          VCA_CUTOFF_VOLTAGE 
        } = await import('../../src/assets/js/utils/voltageConstants.js');
        
        const vca = outputChannelConfig.vca;
        
        assert.equal(vca.dbPerVolt, VCA_DB_PER_VOLT, 
          'dbPerVolt debe coincidir con VCA_DB_PER_VOLT');
        assert.equal(vca.sliderVoltage.atMax, VCA_SLIDER_VOLTAGE_AT_MAX,
          'sliderVoltage.atMax debe coincidir con VCA_SLIDER_VOLTAGE_AT_MAX');
        assert.equal(vca.sliderVoltage.atMin, VCA_SLIDER_VOLTAGE_AT_MIN,
          'sliderVoltage.atMin debe coincidir con VCA_SLIDER_VOLTAGE_AT_MIN');
        assert.equal(vca.cutoffVoltage, VCA_CUTOFF_VOLTAGE,
          'cutoffVoltage debe coincidir con VCA_CUTOFF_VOLTAGE');
      });
    });
  });
});
