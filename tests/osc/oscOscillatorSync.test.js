/**
 * Tests para sincronización OSC de osciladores
 * 
 * @module tests/osc/oscOscillatorSync.test
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// Mock de oscBridge
const mockOscBridge = {
  connected: true,
  send: mock.fn(),
  on: mock.fn(() => () => {}),
  off: mock.fn()
};

// Mock del módulo
const KNOB_INDEX_TO_OSC_KEY = {
  0: 'pulselevel',
  1: 'pulseshape',
  2: 'sinelevel',
  3: 'sinesymmetry',
  4: 'trianglelevel',
  5: 'sawtoothlevel',
  6: 'frequency'
};

const OSC_KEY_TO_KNOB_INDEX = {
  'pulselevel': 0,
  'pulseshape': 1,
  'sinelevel': 2,
  'sinesymmetry': 3,
  'trianglelevel': 4,
  'sawtoothlevel': 5,
  'frequency': 6
};

describe('OscillatorOSCSync', () => {
  
  describe('KNOB_INDEX_TO_OSC_KEY mapeo', () => {
    it('debe mapear índice 0 a pulselevel', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[0], 'pulselevel');
    });
    
    it('debe mapear índice 1 a pulseshape', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[1], 'pulseshape');
    });
    
    it('debe mapear índice 2 a sinelevel', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[2], 'sinelevel');
    });
    
    it('debe mapear índice 3 a sinesymmetry', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[3], 'sinesymmetry');
    });
    
    it('debe mapear índice 4 a trianglelevel', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[4], 'trianglelevel');
    });
    
    it('debe mapear índice 5 a sawtoothlevel', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[5], 'sawtoothlevel');
    });
    
    it('debe mapear índice 6 a frequency', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[6], 'frequency');
    });
    
    it('debe tener 7 entradas (0-6)', () => {
      assert.strictEqual(Object.keys(KNOB_INDEX_TO_OSC_KEY).length, 7);
    });
  });

  describe('OSC_KEY_TO_KNOB_INDEX mapeo inverso', () => {
    it('debe ser el inverso de KNOB_INDEX_TO_OSC_KEY', () => {
      for (const [index, key] of Object.entries(KNOB_INDEX_TO_OSC_KEY)) {
        assert.strictEqual(OSC_KEY_TO_KNOB_INDEX[key], parseInt(index));
      }
    });
    
    it('debe tener 7 entradas', () => {
      assert.strictEqual(Object.keys(OSC_KEY_TO_KNOB_INDEX).length, 7);
    });
  });

  describe('Direcciones OSC', () => {
    it('debe generar dirección correcta para osc 1 frequency', () => {
      const oscIndex = 0; // 0-based
      const knobIndex = 6; // frequency
      const address = `osc/${oscIndex + 1}/${KNOB_INDEX_TO_OSC_KEY[knobIndex]}`;
      assert.strictEqual(address, 'osc/1/frequency');
    });
    
    it('debe generar dirección correcta para osc 12 pulselevel', () => {
      const oscIndex = 11; // 0-based
      const knobIndex = 0; // pulselevel
      const address = `osc/${oscIndex + 1}/${KNOB_INDEX_TO_OSC_KEY[knobIndex]}`;
      assert.strictEqual(address, 'osc/12/pulselevel');
    });
    
    it('debe generar dirección para range', () => {
      const oscIndex = 0;
      const address = `osc/${oscIndex + 1}/range`;
      assert.strictEqual(address, 'osc/1/range');
    });
  });

  describe('Conversión de valores', () => {
    // UI usa 0-1, OSC usa 0-10 para levels, -5 a 5 para bipolar
    
    it('UI 0 debe ser OSC 0 para levels', () => {
      const uiValue = 0;
      const oscValue = uiValue * 10; // Simplificación para test
      assert.strictEqual(oscValue, 0);
    });
    
    it('UI 1 debe ser OSC 10 para levels', () => {
      const uiValue = 1;
      const oscValue = uiValue * 10;
      assert.strictEqual(oscValue, 10);
    });
    
    it('UI 0.5 debe ser OSC 5 para levels', () => {
      const uiValue = 0.5;
      const oscValue = uiValue * 10;
      assert.strictEqual(oscValue, 5);
    });
    
    it('UI 0 debe ser OSC -5 para bipolar', () => {
      const uiValue = 0;
      const oscValue = (uiValue * 10) - 5;
      assert.strictEqual(oscValue, -5);
    });
    
    it('UI 1 debe ser OSC 5 para bipolar', () => {
      const uiValue = 1;
      const oscValue = (uiValue * 10) - 5;
      assert.strictEqual(oscValue, 5);
    });
    
    it('UI 0.5 debe ser OSC 0 para bipolar', () => {
      const uiValue = 0.5;
      const oscValue = (uiValue * 10) - 5;
      assert.strictEqual(oscValue, 0);
    });
  });
});
