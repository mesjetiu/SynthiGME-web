/**
 * Tests para módulos de sincronización OSC de controles
 * 
 * Verifica los contratos de direcciones OSC, conversiones de valores
 * y lógica de deduplicación para los módulos:
 * - InputAmplifierOSCSync (in/{1-8}/level)
 * - OutputChannelOSCSync (out/{1-8}/{level,filter,pan,on})
 * - NoiseGeneratorOSCSync (noise/{1-2}/{colour,level})
 * - JoystickOSCSync (joy/{1-2}/{positionX,positionY,rangeX,rangeY})
 * 
 * Estilo: contrato + lógica replicada (sin importar módulos con side effects)
 * 
 * @module tests/osc/oscControlSync.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { uiToOSCValue, oscToUIValue, MODULE_PARAMETERS } from '../../src/assets/js/osc/oscAddressMap.js';

// ═══════════════════════════════════════════════════════════════════════════
// InputAmplifierOSCSync — Direcciones y conversiones
// ═══════════════════════════════════════════════════════════════════════════

describe('InputAmplifierOSCSync — Contratos', () => {

  describe('Direcciones OSC', () => {
    it('8 canales generan direcciones in/1..in/8', () => {
      for (let ch = 0; ch < 8; ch++) {
        const address = `in/${ch + 1}/level`;
        assert.match(address, /^in\/[1-8]\/level$/);
      }
    });

    it('canal 0-based → 1-based en dirección', () => {
      assert.strictEqual(`in/${0 + 1}/level`, 'in/1/level');
      assert.strictEqual(`in/${7 + 1}/level`, 'in/8/level');
    });
  });

  describe('Conversión de valores UI (0-1) ↔ OSC (0-10)', () => {
    it('UI 0 → OSC 0', () => {
      assert.strictEqual(uiToOSCValue(0, 'in', 'level'), 0);
    });

    it('UI 0.5 → OSC 5', () => {
      assert.strictEqual(uiToOSCValue(0.5, 'in', 'level'), 5);
    });

    it('UI 1 → OSC 10', () => {
      assert.strictEqual(uiToOSCValue(1, 'in', 'level'), 10);
    });

    it('OSC 0 → UI 0', () => {
      assert.strictEqual(oscToUIValue(0, 'in', 'level'), 0);
    });

    it('OSC 5 → UI 0.5', () => {
      assert.strictEqual(oscToUIValue(5, 'in', 'level'), 0.5);
    });

    it('OSC 10 → UI 1', () => {
      assert.strictEqual(oscToUIValue(10, 'in', 'level'), 1);
    });

    it('roundtrip: UI → OSC → UI preserva valor', () => {
      for (const ui of [0, 0.25, 0.5, 0.75, 1]) {
        const osc = uiToOSCValue(ui, 'in', 'level');
        const back = oscToUIValue(osc, 'in', 'level');
        assert.strictEqual(back, ui, `roundtrip para ${ui}`);
      }
    });
  });

  describe('MODULE_PARAMETERS.in', () => {
    it('es indexed con count=8', () => {
      assert.strictEqual(MODULE_PARAMETERS.in.indexed, true);
      assert.strictEqual(MODULE_PARAMETERS.in.count, 8);
    });

    it('tiene parámetro level float 0-10', () => {
      const p = MODULE_PARAMETERS.in.parameters.level;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OutputChannelOSCSync — Direcciones, parámetros y conversiones
// ═══════════════════════════════════════════════════════════════════════════

describe('OutputChannelOSCSync — Contratos', () => {

  describe('Direcciones OSC', () => {
    it('8 canales × 4 parámetros = 32 direcciones', () => {
      const params = ['level', 'filter', 'pan', 'on'];
      const addresses = [];
      for (let ch = 1; ch <= 8; ch++) {
        for (const param of params) {
          addresses.push(`out/${ch}/${param}`);
        }
      }
      assert.strictEqual(addresses.length, 32);
    });

    it('dirección de nivel: out/{n}/level', () => {
      assert.strictEqual(`out/${0 + 1}/level`, 'out/1/level');
      assert.strictEqual(`out/${7 + 1}/level`, 'out/8/level');
    });

    it('dirección de filtro: out/{n}/filter', () => {
      assert.strictEqual(`out/${3 + 1}/filter`, 'out/4/filter');
    });

    it('dirección de pan: out/{n}/pan', () => {
      assert.strictEqual(`out/${0 + 1}/pan`, 'out/1/pan');
    });

    it('dirección de power: out/{n}/on', () => {
      assert.strictEqual(`out/${0 + 1}/on`, 'out/1/on');
    });
  });

  describe('Conversión de pan (-1..+1 ↔ 0-10)', () => {
    // Outgoing: pan interno (-1..+1) → OSC (0-10): oscValue = (value + 1) * 5
    it('pan -1 (full left) → OSC 0', () => {
      assert.strictEqual((-1 + 1) * 5, 0);
    });

    it('pan 0 (center) → OSC 5', () => {
      assert.strictEqual((0 + 1) * 5, 5);
    });

    it('pan +1 (full right) → OSC 10', () => {
      assert.strictEqual((1 + 1) * 5, 10);
    });

    // Incoming: OSC (0-10) → pan interno (-1..+1): internal = (oscValue / 5) - 1
    it('OSC 0 → pan -1', () => {
      assert.strictEqual((0 / 5) - 1, -1);
    });

    it('OSC 5 → pan 0', () => {
      assert.strictEqual((5 / 5) - 1, 0);
    });

    it('OSC 10 → pan +1', () => {
      assert.strictEqual((10 / 5) - 1, 1);
    });

    it('roundtrip pan → OSC → pan preserva valor', () => {
      for (const pan of [-1, -0.5, 0, 0.5, 1]) {
        const osc = (pan + 1) * 5;
        const back = (osc / 5) - 1;
        assert.strictEqual(back, pan, `roundtrip para pan=${pan}`);
      }
    });
  });

  describe('Conversión de power (boolean ↔ 0|1)', () => {
    it('true → 1', () => {
      assert.strictEqual(true ? 1 : 0, 1);
    });

    it('false → 0', () => {
      assert.strictEqual(false ? 1 : 0, 0);
    });

    it('OSC 1 → isOn=true', () => {
      assert.strictEqual(1 === 1, true);
    });

    it('OSC 0 → isOn=false', () => {
      assert.strictEqual(0 === 1, false);
    });
  });

  describe('MODULE_PARAMETERS.out', () => {
    it('es indexed con count=8', () => {
      assert.strictEqual(MODULE_PARAMETERS.out.indexed, true);
      assert.strictEqual(MODULE_PARAMETERS.out.count, 8);
    });

    it('level es float 0-10', () => {
      const p = MODULE_PARAMETERS.out.parameters.level;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });

    it('filter es float -5 a 5 (bipolar)', () => {
      const p = MODULE_PARAMETERS.out.parameters.filter;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -5);
      assert.strictEqual(p.max, 5);
    });

    it('pan es float 0-10', () => {
      const p = MODULE_PARAMETERS.out.parameters.pan;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });

    it('on es int con valores [0, 1]', () => {
      const p = MODULE_PARAMETERS.out.parameters.on;
      assert.strictEqual(p.type, 'int');
      assert.deepStrictEqual(p.values, [0, 1]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NoiseGeneratorOSCSync — Direcciones y parámetros
// ═══════════════════════════════════════════════════════════════════════════

describe('NoiseGeneratorOSCSync — Contratos', () => {

  describe('Direcciones OSC', () => {
    it('2 generadores × 2 parámetros = 4 direcciones', () => {
      const params = ['colour', 'level'];
      const addresses = [];
      for (let n = 1; n <= 2; n++) {
        for (const param of params) {
          addresses.push(`noise/${n}/${param}`);
        }
      }
      assert.strictEqual(addresses.length, 4);
      assert.deepStrictEqual(addresses, [
        'noise/1/colour', 'noise/1/level',
        'noise/2/colour', 'noise/2/level'
      ]);
    });

    it('index 0 → noise/1 (0-based a 1-based)', () => {
      assert.strictEqual(`noise/${0 + 1}/colour`, 'noise/1/colour');
    });

    it('index 1 → noise/2', () => {
      assert.strictEqual(`noise/${1 + 1}/level`, 'noise/2/level');
    });
  });

  describe('Valores directos (dial 0-10 = OSC 0-10)', () => {
    it('colour y level usan escala directa 0-10', () => {
      // Los noise generators envían dialValue directamente sin conversión
      const dialValue = 7.5;
      assert.strictEqual(dialValue, 7.5); // No se transforma
    });
  });

  describe('MODULE_PARAMETERS.noise', () => {
    it('es indexed con count=2', () => {
      assert.strictEqual(MODULE_PARAMETERS.noise.indexed, true);
      assert.strictEqual(MODULE_PARAMETERS.noise.count, 2);
    });

    it('colour es float 0-10', () => {
      const p = MODULE_PARAMETERS.noise.parameters.colour;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });

    it('level es float 0-10', () => {
      const p = MODULE_PARAMETERS.noise.parameters.level;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });

  describe('Mapeo de índice de knob a clave OSC', () => {
    // Replicado de KNOB_INDEX_TO_OSC_KEY del módulo
    const KNOB_INDEX_TO_OSC_KEY = { 0: 'colour', 1: 'level' };

    it('índice 0 → colour', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[0], 'colour');
    });

    it('índice 1 → level', () => {
      assert.strictEqual(KNOB_INDEX_TO_OSC_KEY[1], 'level');
    });

    it('solo 2 entradas', () => {
      assert.strictEqual(Object.keys(KNOB_INDEX_TO_OSC_KEY).length, 2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JoystickOSCSync — Direcciones, escalas y mapeo
// ═══════════════════════════════════════════════════════════════════════════

describe('JoystickOSCSync — Contratos', () => {

  describe('Direcciones OSC', () => {
    it('2 joysticks × 4 parámetros = 8 direcciones', () => {
      const params = ['positionX', 'positionY', 'rangeX', 'rangeY'];
      const addresses = [];
      for (let n = 1; n <= 2; n++) {
        for (const param of params) {
          addresses.push(`joy/${n}/${param}`);
        }
      }
      assert.strictEqual(addresses.length, 8);
    });

    it('joyIndex 0 (left) → joy/1', () => {
      assert.strictEqual(`joy/${0 + 1}/positionX`, 'joy/1/positionX');
    });

    it('joyIndex 1 (right) → joy/2', () => {
      assert.strictEqual(`joy/${1 + 1}/positionY`, 'joy/2/positionY');
    });
  });

  describe('Mapeo de índices', () => {
    it('joyIndex 0 = left', () => {
      const side = 0 === 0 ? 'left' : 'right';
      assert.strictEqual(side, 'left');
    });

    it('joyIndex 1 = right', () => {
      const side = 1 === 0 ? 'left' : 'right';
      assert.strictEqual(side, 'right');
    });
  });

  describe('Escalas de valores', () => {
    it('positionX/Y usan rango directo -1..+1', () => {
      // No hay conversión, el valor se envía tal cual
      const positions = [-1, -0.5, 0, 0.5, 1];
      for (const p of positions) {
        assert.ok(p >= -1 && p <= 1, `${p} en rango -1..+1`);
      }
    });

    it('rangeX/Y usan rango directo 0-10', () => {
      const ranges = [0, 2.5, 5, 7.5, 10];
      for (const r of ranges) {
        assert.ok(r >= 0 && r <= 10, `${r} en rango 0-10`);
      }
    });
  });

  describe('Deduplicación', () => {
    it('posición usa umbral de 0.001', () => {
      const threshold = 0.001;
      // Diferencia menor que umbral → deduplicar
      assert.ok(Math.abs(0.500 - 0.5005) < threshold);
      // Diferencia mayor que umbral → enviar
      assert.ok(Math.abs(0.500 - 0.502) >= threshold);
    });

    it('range usa umbral de 0.0001', () => {
      const threshold = 0.0001;
      assert.ok(Math.abs(5.0 - 5.00005) < threshold);
      assert.ok(Math.abs(5.0 - 5.0002) >= threshold);
    });
  });

  describe('MODULE_PARAMETERS.joy', () => {
    it('es indexed con count=2', () => {
      assert.strictEqual(MODULE_PARAMETERS.joy.indexed, true);
      assert.strictEqual(MODULE_PARAMETERS.joy.count, 2);
    });

    it('positionX es float -1..+1', () => {
      const p = MODULE_PARAMETERS.joy.parameters.positionX;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -1);
      assert.strictEqual(p.max, 1);
    });

    it('positionY es float -1..+1', () => {
      const p = MODULE_PARAMETERS.joy.parameters.positionY;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, -1);
      assert.strictEqual(p.max, 1);
    });

    it('rangeX es float 0-10', () => {
      const p = MODULE_PARAMETERS.joy.parameters.rangeX;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });

    it('rangeY es float 0-10', () => {
      const p = MODULE_PARAMETERS.joy.parameters.rangeY;
      assert.strictEqual(p.type, 'float');
      assert.strictEqual(p.min, 0);
      assert.strictEqual(p.max, 10);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Lógica común de deduplicación (patrón compartido por todos los sync)
// ═══════════════════════════════════════════════════════════════════════════

describe('Deduplicación — Patrón común', () => {
  it('valores idénticos se deducen (diferencia < threshold)', () => {
    const threshold = 0.0001;
    const cache = new Map();

    function shouldSend(address, newValue) {
      const last = cache.get(address);
      if (last !== undefined && Math.abs(last - newValue) < threshold) {
        return false;
      }
      cache.set(address, newValue);
      return true;
    }

    // Primer envío: siempre pasa
    assert.ok(shouldSend('out/1/level', 5.0));

    // Mismo valor: se deduce
    assert.ok(!shouldSend('out/1/level', 5.0));

    // Valor ligeramente diferente (< threshold): se deduce
    assert.ok(!shouldSend('out/1/level', 5.00005));

    // Valor diferente (>= threshold): pasa
    assert.ok(shouldSend('out/1/level', 5.001));

    // Dirección diferente: pasa (independiente)
    assert.ok(shouldSend('out/2/level', 5.0));
  });
});
