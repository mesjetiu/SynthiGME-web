/**
 * Tests para oscMatrixSync
 * 
 * Verifica las funciones puras exportadas del módulo de sincronización
 * OSC para matrices de audio (Panel 5) y control (Panel 6):
 * - sourceToOSCSegment: descriptor de fuente → segmento OSC
 * - destToOSCSegment: descriptor de destino → segmento OSC
 * - parsePinValue: valor OSC → acción de pin
 * - VALID_PIN_COLORS: colores válidos
 * 
 * @module tests/osc/oscMatrixSync.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sourceToOSCSegment,
  destToOSCSegment,
  parsePinValue,
  VALID_PIN_COLORS
} from '../../src/assets/js/osc/oscMatrixSync.js';

// ═══════════════════════════════════════════════════════════════════════════
// sourceToOSCSegment
// ═══════════════════════════════════════════════════════════════════════════

describe('sourceToOSCSegment', () => {

  describe('inputAmp', () => {
    it('canal 0 → in/1 (0-based a 1-based)', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'inputAmp', channel: 0 }), 'in/1');
    });

    it('canal 7 → in/8', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'inputAmp', channel: 7 }), 'in/8');
    });

    it('sin channel usa default 0 → in/1', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'inputAmp' }), 'in/1');
    });
  });

  describe('outputBus', () => {
    it('bus 1 → bus/1 (ya 1-indexed)', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'outputBus', bus: 1 }), 'bus/1');
    });

    it('bus 8 → bus/8', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'outputBus', bus: 8 }), 'bus/8');
    });
  });

  describe('noiseGen', () => {
    it('index 0 → noise/1 (0-based a 1-based)', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'noiseGen', index: 0 }), 'noise/1');
    });

    it('index 1 → noise/2', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'noiseGen', index: 1 }), 'noise/2');
    });
  });

  describe('panel3Osc', () => {
    it('oscIndex 0, sineSaw → osc/1/sinSaw', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' }),
        'osc/1/sinSaw'
      );
    });

    it('oscIndex 11, sineSaw → osc/12/sinSaw', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'panel3Osc', oscIndex: 11, channelId: 'sineSaw' }),
        'osc/12/sinSaw'
      );
    });

    it('oscIndex 0, triPulse → osc/1/triPul', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'panel3Osc', oscIndex: 0, channelId: 'triPulse' }),
        'osc/1/triPul'
      );
    });

    it('oscIndex 5, triPulse → osc/6/triPul', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'panel3Osc', oscIndex: 5, channelId: 'triPulse' }),
        'osc/6/triPul'
      );
    });
  });

  describe('joystick', () => {
    it('left, y → joy/L/y', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'joystick', side: 'left', axis: 'y' }),
        'joy/L/y'
      );
    });

    it('right, x → joy/R/x', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'joystick', side: 'right', axis: 'x' }),
        'joy/R/x'
      );
    });

    it('left, x → joy/L/x', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'joystick', side: 'left', axis: 'x' }),
        'joy/L/x'
      );
    });

    it('right, y → joy/R/y', () => {
      assert.strictEqual(
        sourceToOSCSegment({ kind: 'joystick', side: 'right', axis: 'y' }),
        'joy/R/y'
      );
    });
  });

  describe('Casos inválidos', () => {
    it('null retorna null', () => {
      assert.strictEqual(sourceToOSCSegment(null), null);
    });

    it('undefined retorna null', () => {
      assert.strictEqual(sourceToOSCSegment(undefined), null);
    });

    it('kind desconocido retorna null', () => {
      assert.strictEqual(sourceToOSCSegment({ kind: 'unknown' }), null);
    });

    it('objeto sin kind retorna null', () => {
      assert.strictEqual(sourceToOSCSegment({ channel: 0 }), null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// destToOSCSegment
// ═══════════════════════════════════════════════════════════════════════════

describe('destToOSCSegment', () => {

  describe('outputBus', () => {
    it('bus 1 → Out/1', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'outputBus', bus: 1 }), 'Out/1');
    });

    it('bus 8 → Out/8', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'outputBus', bus: 8 }), 'Out/8');
    });
  });

  describe('oscSync', () => {
    it('oscIndex 0 → Sync/1 (0-based a 1-based)', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscSync', oscIndex: 0 }), 'Sync/1');
    });

    it('oscIndex 11 → Sync/12', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscSync', oscIndex: 11 }), 'Sync/12');
    });
  });

  describe('oscilloscope', () => {
    it('channel Y → Scope/Y', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscilloscope', channel: 'Y' }), 'Scope/Y');
    });

    it('channel X → Scope/X', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscilloscope', channel: 'X' }), 'Scope/X');
    });
  });

  describe('oscFreqCV', () => {
    it('oscIndex 0 → Freq/1', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscFreqCV', oscIndex: 0 }), 'Freq/1');
    });

    it('oscIndex 6 → Freq/7', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscFreqCV', oscIndex: 6 }), 'Freq/7');
    });
  });

  describe('outputLevelCV', () => {
    it('busIndex 0 → Level/1', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'outputLevelCV', busIndex: 0 }), 'Level/1');
    });

    it('busIndex 7 → Level/8', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'outputLevelCV', busIndex: 7 }), 'Level/8');
    });
  });

  describe('oscPWM', () => {
    it('oscIndex 0 → PWM/1 (0-based a 1-based)', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscPWM', oscIndex: 0 }), 'PWM/1');
    });

    it('oscIndex 5 → PWM/6', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscPWM', oscIndex: 5 }), 'PWM/6');
    });

    it('sin oscIndex usa default 0 → PWM/1', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'oscPWM' }), 'PWM/1');
    });
  });

  describe('Casos inválidos', () => {
    it('null retorna null', () => {
      assert.strictEqual(destToOSCSegment(null), null);
    });

    it('undefined retorna null', () => {
      assert.strictEqual(destToOSCSegment(undefined), null);
    });

    it('kind desconocido retorna null', () => {
      assert.strictEqual(destToOSCSegment({ kind: 'unknown' }), null);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parsePinValue
// ═══════════════════════════════════════════════════════════════════════════

describe('parsePinValue', () => {

  describe('Desconexión (valor 0)', () => {
    it('número 0 → disconnect', () => {
      const result = parsePinValue(0);
      assert.strictEqual(result.action, 'disconnect');
      assert.strictEqual(result.pinColor, null);
    });

    it('string "0" → disconnect', () => {
      const result = parsePinValue('0');
      assert.strictEqual(result.action, 'disconnect');
    });
  });

  describe('Color string', () => {
    for (const color of ['WHITE', 'GREY', 'GREEN', 'RED', 'BLUE', 'YELLOW', 'CYAN', 'PURPLE']) {
      it(`"${color}" → connect con pinColor=${color}`, () => {
        const result = parsePinValue(color);
        assert.strictEqual(result.action, 'connect');
        assert.strictEqual(result.pinColor, color);
      });
    }

    it('minúsculas "white" se convierten a mayúsculas', () => {
      const result = parsePinValue('white');
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'WHITE');
    });

    it('mixtas "Red" se convierten a mayúsculas', () => {
      const result = parsePinValue('Red');
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'RED');
    });

    it('color inválido no conecta', () => {
      const result = parsePinValue('ORANGE');
      assert.strictEqual(result.action, 'disconnect');
    });
  });

  describe('Array [ganancia, tolerancia]', () => {
    it('[1.0, 0.1] → connect con ganancia 1.0', () => {
      const result = parsePinValue([1.0, 0.1]);
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.gain, 1.0);
      assert.strictEqual(result.tolerance, 0.1);
      assert.ok(result.pinColor !== null, 'debe tener color asignado');
    });

    it('[0, 0] → disconnect', () => {
      const result = parsePinValue([0, 0]);
      assert.strictEqual(result.action, 'disconnect');
    });

    it('[37, 0.5] → connect (ganancia alta, debería ser RED)', () => {
      const result = parsePinValue([37, 0.5]);
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'RED');
    });

    it('[0.1, 0.01] → connect (ganancia baja, debería ser PURPLE)', () => {
      const result = parsePinValue([0.1, 0.01]);
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'PURPLE');
    });
  });

  describe('Valor numérico positivo (sin color)', () => {
    it('número > 0 → connect con WHITE por defecto', () => {
      const result = parsePinValue(1);
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'WHITE');
    });

    it('número 0.5 → connect con WHITE', () => {
      const result = parsePinValue(0.5);
      assert.strictEqual(result.action, 'connect');
      assert.strictEqual(result.pinColor, 'WHITE');
    });
  });

  describe('Valores inválidos', () => {
    it('undefined → disconnect', () => {
      const result = parsePinValue(undefined);
      assert.strictEqual(result.action, 'disconnect');
    });

    it('null → disconnect', () => {
      const result = parsePinValue(null);
      assert.strictEqual(result.action, 'disconnect');
    });

    it('número negativo → disconnect', () => {
      const result = parsePinValue(-1);
      assert.strictEqual(result.action, 'disconnect');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// VALID_PIN_COLORS
// ═══════════════════════════════════════════════════════════════════════════

describe('VALID_PIN_COLORS', () => {
  it('contiene exactamente 8 colores', () => {
    assert.strictEqual(VALID_PIN_COLORS.size, 8);
  });

  it('contiene los colores esperados del Synthi 100', () => {
    const expected = ['WHITE', 'GREY', 'GREEN', 'RED', 'BLUE', 'YELLOW', 'CYAN', 'PURPLE'];
    for (const color of expected) {
      assert.ok(VALID_PIN_COLORS.has(color), `debe contener ${color}`);
    }
  });

  it('no contiene colores inválidos', () => {
    assert.ok(!VALID_PIN_COLORS.has('ORANGE'));
    assert.ok(!VALID_PIN_COLORS.has('BLACK'));
    assert.ok(!VALID_PIN_COLORS.has('PINK'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Coherencia source/dest (convención minúsculas/Mayúsculas)
// ═══════════════════════════════════════════════════════════════════════════

describe('Convenciones de formato de dirección OSC', () => {
  it('fuentes usan minúsculas (in, bus, noise, osc, joy)', () => {
    const sources = [
      sourceToOSCSegment({ kind: 'inputAmp', channel: 0 }),
      sourceToOSCSegment({ kind: 'outputBus', bus: 1 }),
      sourceToOSCSegment({ kind: 'noiseGen', index: 0 }),
      sourceToOSCSegment({ kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' }),
      sourceToOSCSegment({ kind: 'joystick', side: 'left', axis: 'y' })
    ];

    for (const seg of sources) {
      // El primer carácter del primer segmento debe ser minúscula
      const firstChar = seg.charAt(0);
      assert.strictEqual(
        firstChar, firstChar.toLowerCase(),
        `Source "${seg}" debe empezar en minúscula`
      );
    }
  });

  it('destinos usan Mayúscula inicial (Out, Sync, Scope, Freq, Level, PWM)', () => {
    const dests = [
      destToOSCSegment({ kind: 'outputBus', bus: 1 }),
      destToOSCSegment({ kind: 'oscSync', oscIndex: 0 }),
      destToOSCSegment({ kind: 'oscilloscope', channel: 'Y' }),
      destToOSCSegment({ kind: 'oscFreqCV', oscIndex: 0 }),
      destToOSCSegment({ kind: 'outputLevelCV', busIndex: 0 }),
      destToOSCSegment({ kind: 'oscPWM', oscIndex: 0 })
    ];

    for (const seg of dests) {
      const firstChar = seg.charAt(0);
      assert.strictEqual(
        firstChar, firstChar.toUpperCase(),
        `Dest "${seg}" debe empezar en Mayúscula`
      );
    }
  });
});
