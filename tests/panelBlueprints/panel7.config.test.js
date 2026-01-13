/**
 * Tests para panel7.config.js y panel7.blueprint.js
 * Verifican la estructura y valores de configuración de los Output Channels.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import panel7Config from '../../src/assets/js/panelBlueprints/panel7.config.js';
import panel7Blueprint from '../../src/assets/js/panelBlueprints/panel7.blueprint.js';

describe('Panel 7 Config', () => {
  
  describe('estructura básica', () => {
    it('debe tener schemaVersion', () => {
      assert.equal(panel7Config.schemaVersion, 1);
    });
    
    it('debe tener panelId correcto', () => {
      assert.equal(panel7Config.panelId, 'panel-7');
    });
    
    it('debe tener configuración de outputChannels', () => {
      assert.ok(panel7Config.outputChannels);
    });
  });
  
  describe('outputChannels', () => {
    const oc = panel7Config.outputChannels;
    
    it('debe tener count = 8', () => {
      assert.equal(oc.count, 8);
    });
    
    describe('knobs', () => {
      it('debe tener configuración de filter', () => {
        const filter = oc.knobs.filter;
        assert.ok(filter);
        assert.equal(filter.min, -1);
        assert.equal(filter.max, 1);
        assert.equal(filter.initial, 0);
        assert.equal(filter.pixelsForFullRange, 900);
      });
      
      it('debe tener configuración de pan', () => {
        const pan = oc.knobs.pan;
        assert.ok(pan);
        assert.equal(pan.min, -1);
        assert.equal(pan.max, 1);
        assert.equal(pan.initial, 0);
        assert.equal(pan.pixelsForFullRange, 900);
      });
    });
    
    describe('faders', () => {
      it('debe tener configuración de level', () => {
        const level = oc.faders.level;
        assert.ok(level);
        assert.equal(level.min, 0);
        assert.equal(level.max, 1);
        assert.equal(level.initial, 0);
        assert.equal(level.step, 0.001);
      });
    });
    
    describe('switches', () => {
      it('debe tener configuración de power', () => {
        const power = oc.switches.power;
        assert.ok(power);
        assert.equal(power.initial, true);
      });
    });
    
    describe('audio', () => {
      it('debe tener tiempos de suavizado', () => {
        const audio = oc.audio;
        assert.ok(audio);
        assert.equal(audio.levelSmoothingTime, 0.06);
        assert.equal(audio.panSmoothingTime, 0.03);
        assert.equal(audio.filterSmoothingTime, 0.03);
      });
      
      it('debe tener configuración de filtro', () => {
        const filter = oc.audio.filter;
        assert.ok(filter);
        assert.ok(filter.lowpassFreq);
        assert.ok(filter.highpassFreq);
        assert.equal(filter.Q, 0.707);
      });
    });
  });
});

describe('Panel 7 Blueprint', () => {
  
  describe('estructura básica', () => {
    it('debe tener schemaVersion', () => {
      assert.equal(panel7Blueprint.schemaVersion, 1);
    });
    
    it('debe tener panelId correcto', () => {
      assert.equal(panel7Blueprint.panelId, 'panel-7');
    });
  });
  
  describe('layout', () => {
    it('debe tener padding', () => {
      assert.ok(panel7Blueprint.layout.padding);
    });
    
    it('debe tener sección outputChannels', () => {
      assert.ok(panel7Blueprint.layout.sections.outputChannels);
    });
    
    it('sección outputChannels debe tener marginBottom', () => {
      assert.equal(panel7Blueprint.layout.sections.outputChannels.marginBottom, 10);
    });
    
    it('sección outputChannels debe tener heightRatio', () => {
      assert.equal(panel7Blueprint.layout.sections.outputChannels.heightRatio, 0.60);
    });
    
    it('debe tener configuración de channelsRow', () => {
      const row = panel7Blueprint.layout.channelsRow;
      assert.ok(row);
      assert.equal(row.gap, 8);
      assert.ok(row.padding);
      assert.equal(row.padding.bottom, 12);
    });
    
    it('debe tener configuración de slider', () => {
      const slider = panel7Blueprint.layout.slider;
      assert.ok(slider);
      assert.equal(slider.height, 250);
      assert.equal(slider.shellHeight, 270);
      assert.equal(slider.width, 24);
    });
    
    it('debe tener configuración de channel', () => {
      const channel = panel7Blueprint.layout.channel;
      assert.ok(channel);
      assert.equal(channel.minWidth, 80);
      assert.equal(channel.maxWidth, 120);
    });
  });
  
  describe('modules', () => {
    const oc = panel7Blueprint.modules.outputChannels;
    
    it('debe tener módulo outputChannels', () => {
      assert.ok(oc);
      assert.equal(oc.id, 'output-channels');
      assert.equal(oc.type, 'outputChannelsPanel');
    });
    
    it('debe tener 8 canales', () => {
      assert.equal(oc.channelCount, 8);
    });
    
    it('debe tener 4 controles por canal', () => {
      assert.equal(oc.channelLayout.controls.length, 4);
      assert.equal(oc.channelLayout.controls[0].id, 'filter');
      assert.equal(oc.channelLayout.controls[1].id, 'pan');
      assert.equal(oc.channelLayout.controls[2].id, 'power');
      assert.equal(oc.channelLayout.controls[3].id, 'level');
    });
  });
  
  describe('routing', () => {
    it('debe tener 8 inputs desde output buses', () => {
      assert.equal(panel7Blueprint.routing.inputs.length, 8);
      panel7Blueprint.routing.inputs.forEach((input, idx) => {
        assert.equal(input.channelIndex, idx);
        assert.equal(input.source.kind, 'outputBus');
        assert.equal(input.source.bus, idx + 1);
      });
    });
    
    it('debe enviar a salida física', () => {
      assert.equal(panel7Blueprint.routing.outputs.destination, 'physicalOutput');
    });
  });
});
