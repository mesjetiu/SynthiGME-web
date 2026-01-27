/**
 * Tests para oscAddressMap
 * 
 * Verifica el mapeo correcto entre direcciones OSC y controles UI
 * 
 * @module tests/osc/oscAddressMap.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  parseOSCAddress,
  buildOSCAddress,
  uiToOSCValue,
  oscToUIValue,
  getParameterInfo,
  MODULE_PARAMETERS
} from '../../src/assets/js/osc/oscAddressMap.js';

describe('oscAddressMap', () => {
  
  describe('parseOSCAddress', () => {
    it('debe parsear direcciones con índice', () => {
      const result = parseOSCAddress('/SynthiGME/osc/1/frequency');
      assert.deepStrictEqual(result, {
        moduleType: 'osc',
        moduleIndex: 0, // 1-based a 0-based
        parameter: 'frequency'
      });
    });

    it('debe parsear direcciones sin índice', () => {
      const result = parseOSCAddress('/SynthiGME/reverb/mix');
      assert.deepStrictEqual(result, {
        moduleType: 'reverb',
        moduleIndex: null,
        parameter: 'mix'
      });
    });

    it('debe manejar parámetros compuestos', () => {
      const result = parseOSCAddress('/SynthiGME/osc/1/pulselevel');
      assert.deepStrictEqual(result, {
        moduleType: 'osc',
        moduleIndex: 0,
        parameter: 'pulselevel'
      });
    });

    it('debe funcionar con prefijo personalizado', () => {
      const result = parseOSCAddress('/Custom/osc/2/frequency', '/Custom/');
      assert.deepStrictEqual(result, {
        moduleType: 'osc',
        moduleIndex: 1,
        parameter: 'frequency'
      });
    });

    it('debe parsear patchbay', () => {
      const result = parseOSCAddress('/SynthiGME/patchA/91/36');
      assert.strictEqual(result.moduleType, 'patchA');
      assert.strictEqual(result.moduleIndex, 90); // 91 -> 90
      assert.strictEqual(result.parameter, '36');
    });

    it('debe retornar null para direcciones inválidas', () => {
      const result = parseOSCAddress('/SynthiGME/');
      assert.strictEqual(result, null);
    });

    it('debe manejar direcciones sin prefijo', () => {
      const result = parseOSCAddress('osc/1/frequency');
      assert.deepStrictEqual(result, {
        moduleType: 'osc',
        moduleIndex: 0,
        parameter: 'frequency'
      });
    });
  });

  describe('buildOSCAddress', () => {
    it('debe construir direcciones con índice', () => {
      const address = buildOSCAddress('osc', 0, 'frequency');
      assert.strictEqual(address, '/SynthiGME/osc/1/frequency');
    });

    it('debe construir direcciones sin índice', () => {
      const address = buildOSCAddress('reverb', null, 'mix');
      assert.strictEqual(address, '/SynthiGME/reverb/mix');
    });

    it('debe usar prefijo personalizado', () => {
      const address = buildOSCAddress('osc', 0, 'frequency', '/Custom/');
      assert.strictEqual(address, '/Custom/osc/1/frequency');
    });

    it('debe convertir índice 0-based a 1-based', () => {
      const address = buildOSCAddress('filter', 2, 'response');
      assert.strictEqual(address, '/SynthiGME/filter/3/response');
    });
  });

  describe('Conversión de valores UI <-> OSC', () => {
    it('uiToOSCValue: debe convertir 0-1 a rango 0-10', () => {
      assert.strictEqual(uiToOSCValue(0, 'osc', 'frequency'), 0);
      assert.strictEqual(uiToOSCValue(0.5, 'osc', 'frequency'), 5);
      assert.strictEqual(uiToOSCValue(1, 'osc', 'frequency'), 10);
    });

    it('uiToOSCValue: debe convertir 0-1 a rango bipolar -5 a 5', () => {
      assert.strictEqual(uiToOSCValue(0, 'osc', 'pulseshape'), -5);
      assert.strictEqual(uiToOSCValue(0.5, 'osc', 'pulseshape'), 0);
      assert.strictEqual(uiToOSCValue(1, 'osc', 'pulseshape'), 5);
    });

    it('oscToUIValue: debe convertir rango 0-10 a 0-1', () => {
      assert.strictEqual(oscToUIValue(0, 'osc', 'frequency'), 0);
      assert.strictEqual(oscToUIValue(5, 'osc', 'frequency'), 0.5);
      assert.strictEqual(oscToUIValue(10, 'osc', 'frequency'), 1);
    });

    it('oscToUIValue: debe convertir rango bipolar -5 a 5 a 0-1', () => {
      assert.strictEqual(oscToUIValue(-5, 'osc', 'pulseshape'), 0);
      assert.strictEqual(oscToUIValue(0, 'osc', 'pulseshape'), 0.5);
      assert.strictEqual(oscToUIValue(5, 'osc', 'pulseshape'), 1);
    });

    it('debe retornar valor original si módulo no existe', () => {
      assert.strictEqual(uiToOSCValue(0.5, 'unknown', 'param'), 0.5);
      assert.strictEqual(oscToUIValue(5, 'unknown', 'param'), 5);
    });

    it('debe retornar valor original si parámetro no es float', () => {
      // 'gate' es tipo 'trigger', no float
      assert.strictEqual(uiToOSCValue(0.5, 'env', 'gate'), 0.5);
    });
  });

  describe('getParameterInfo', () => {
    it('debe retornar info de parámetro existente', () => {
      const info = getParameterInfo('osc', 'frequency');
      assert.deepStrictEqual(info, { type: 'float', min: 0, max: 10 });
    });

    it('debe retornar info de parámetro bipolar', () => {
      const info = getParameterInfo('invertor', 'gain');
      assert.deepStrictEqual(info, { type: 'float', min: -5, max: 5 });
    });

    it('debe retornar null para módulo inexistente', () => {
      const info = getParameterInfo('unknown', 'param');
      assert.strictEqual(info, null);
    });

    it('debe retornar null para parámetro inexistente', () => {
      const info = getParameterInfo('osc', 'unknown');
      assert.strictEqual(info, null);
    });
  });

  describe('MODULE_PARAMETERS', () => {
    it('debe tener todos los módulos principales', () => {
      const expectedModules = [
        'osc', 'patchA', 'patchV', 'out', 'in', 'return', 'env',
        'ring', 'noise', 'random', 'slew', 'filter', 'filterBank',
        'reverb', 'echo', 'oscilloscope', 'keyboard', 'invertor'
      ];
      
      for (const mod of expectedModules) {
        assert.ok(MODULE_PARAMETERS[mod], `Módulo ${mod} debe existir`);
      }
    });

    it('osciladores deben tener 12 instancias', () => {
      assert.strictEqual(MODULE_PARAMETERS.osc.count, 12);
      assert.strictEqual(MODULE_PARAMETERS.osc.indexed, true);
    });

    it('reverb debe ser único (no indexado)', () => {
      assert.strictEqual(MODULE_PARAMETERS.reverb.indexed, false);
      assert.strictEqual(MODULE_PARAMETERS.reverb.count, undefined);
    });

    it('filtros deben tener 3 instancias', () => {
      assert.strictEqual(MODULE_PARAMETERS.filter.count, 3);
    });
  });
});
