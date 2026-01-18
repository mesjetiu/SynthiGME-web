/**
 * @fileoverview Tests para el módulo voltageConstants.js
 * 
 * Ejecutar con: npm test -- tests/utils/voltageConstants.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  // Constantes globales
  DIGITAL_TO_VOLTAGE,
  MAX_VOLTAGE_PP,
  VOLTS_PER_OCTAVE,
  KEYBOARD_MAX_VOLTAGE,
  SUPPLY_VOLTAGE,
  
  // Resistencias de pin
  PIN_RESISTANCES,
  DEFAULT_PIN_TYPE,
  
  // Resistencia de realimentación
  STANDARD_FEEDBACK_RESISTANCE,
  
  // Límites
  DEFAULT_INPUT_VOLTAGE_LIMIT,
  DEFAULT_OUTPUT_LEVEL,
  
  // Funciones
  digitalToVoltage,
  voltageToDigital,
  calculatePinGain,
  applyResistanceTolerance,
  applySoftClip,
  calculateVirtualEarthSum,
  createSoftClipCurve,
  
  // Defaults
  VOLTAGE_DEFAULTS
} from '../../src/assets/js/utils/voltageConstants.js';

// Importar config de osciladores para verificar integración
import panel3Config from '../../src/assets/js/panelBlueprints/panel3.config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes Globales
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - Constantes Globales', () => {
  
  it('tiene factor de conversión correcto (1.0 digital = 4V)', () => {
    assert.equal(DIGITAL_TO_VOLTAGE, 4.0);
  });
  
  it('tiene voltaje p-p máximo de 8V', () => {
    assert.equal(MAX_VOLTAGE_PP, 8.0);
  });
  
  it('usa estándar 1V/Octava', () => {
    assert.equal(VOLTS_PER_OCTAVE, 1.0);
  });
  
  it('tiene voltaje de alimentación de 12V', () => {
    assert.equal(SUPPLY_VOLTAGE, 12.0);
  });
  
  it('tiene voltaje máximo de teclado de 5V', () => {
    assert.equal(KEYBOARD_MAX_VOLTAGE, 5.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resistencias de Pin
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - Resistencias de Pin', () => {
  
  it('tiene pin blanco con 100kΩ y tolerancia 10%', () => {
    assert.equal(PIN_RESISTANCES.WHITE.value, 100000);
    assert.equal(PIN_RESISTANCES.WHITE.tolerance, 0.10);
  });
  
  it('tiene pin gris con 100kΩ y tolerancia 0.5%', () => {
    assert.equal(PIN_RESISTANCES.GREY.value, 100000);
    assert.equal(PIN_RESISTANCES.GREY.tolerance, 0.005);
  });
  
  it('tiene pin rojo con 2.7kΩ', () => {
    assert.equal(PIN_RESISTANCES.RED.value, 2700);
  });
  
  it('tiene pin verde con 68kΩ', () => {
    assert.equal(PIN_RESISTANCES.GREEN.value, 68000);
  });
  
  it('tiene pin naranja marcado como peligroso', () => {
    assert.equal(PIN_RESISTANCES.ORANGE.value, 0);
    assert.equal(PIN_RESISTANCES.ORANGE.dangerous, true);
  });
  
  it('usa pin gris como defecto', () => {
    assert.equal(DEFAULT_PIN_TYPE, 'GREY');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de Conversión
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - digitalToVoltage()', () => {
  
  it('convierte 1.0 → 4.0V', () => {
    assert.equal(digitalToVoltage(1.0), 4.0);
  });
  
  it('convierte -1.0 → -4.0V', () => {
    assert.equal(digitalToVoltage(-1.0), -4.0);
  });
  
  it('convierte 0.5 → 2.0V', () => {
    assert.equal(digitalToVoltage(0.5), 2.0);
  });
  
  it('convierte 0 → 0V', () => {
    assert.equal(digitalToVoltage(0), 0);
  });
});

describe('voltageConstants - voltageToDigital()', () => {
  
  it('convierte 4.0V → 1.0', () => {
    assert.equal(voltageToDigital(4.0), 1.0);
  });
  
  it('convierte -4.0V → -1.0', () => {
    assert.equal(voltageToDigital(-4.0), -1.0);
  });
  
  it('convierte 2.0V → 0.5', () => {
    assert.equal(voltageToDigital(2.0), 0.5);
  });
  
  it('es inversa de digitalToVoltage', () => {
    const original = 0.75;
    assert.equal(voltageToDigital(digitalToVoltage(original)), original);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de Ganancia de Pin
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - calculatePinGain()', () => {
  
  it('calcula ganancia unitaria con pin blanco y Rf estándar', () => {
    const gain = calculatePinGain(100000, 100000);
    assert.equal(gain, 1.0);
  });
  
  it('calcula ganancia ~37× con pin rojo y Rf estándar', () => {
    const gain = calculatePinGain(100000, 2700);
    assert.ok(Math.abs(gain - 37.037) < 0.01);
  });
  
  it('calcula ganancia ~1.47× con pin verde y Rf estándar', () => {
    const gain = calculatePinGain(100000, 68000);
    assert.ok(Math.abs(gain - 1.47) < 0.01);
  });
  
  it('devuelve Infinity con pin de 0Ω (cortocircuito)', () => {
    const gain = calculatePinGain(100000, 0);
    assert.equal(gain, Infinity);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tolerancia de Resistencia
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - applyResistanceTolerance()', () => {
  
  it('aplica tolerancia reproducible con el mismo seed', () => {
    const result1 = applyResistanceTolerance(100000, 0.10, 12345);
    const result2 = applyResistanceTolerance(100000, 0.10, 12345);
    assert.equal(result1, result2);
  });
  
  it('produce valores diferentes con seeds diferentes', () => {
    const result1 = applyResistanceTolerance(100000, 0.10, 12345);
    const result2 = applyResistanceTolerance(100000, 0.10, 12346);
    assert.notEqual(result1, result2);
  });
  
  it('mantiene el valor dentro de la tolerancia especificada', () => {
    const nominal = 100000;
    const tolerance = 0.10;
    
    for (let seed = 0; seed < 100; seed++) {
      const result = applyResistanceTolerance(nominal, tolerance, seed);
      const minExpected = nominal * (1 - tolerance);
      const maxExpected = nominal * (1 + tolerance);
      assert.ok(result >= minExpected, `seed ${seed}: ${result} < ${minExpected}`);
      assert.ok(result <= maxExpected, `seed ${seed}: ${result} > ${maxExpected}`);
    }
  });
  
  it('con tolerancia 0, devuelve valor nominal exacto', () => {
    const result = applyResistanceTolerance(100000, 0, 12345);
    assert.equal(result, 100000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Soft Clipping
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - applySoftClip()', () => {
  
  it('no afecta significativamente voltajes dentro del límite', () => {
    const result = applySoftClip(2.0, 8.0);
    assert.ok(Math.abs(result - 2.0) < 0.5);
  });
  
  it('satura suavemente voltajes que superan el límite', () => {
    const result = applySoftClip(10.0, 8.0);
    assert.ok(result < 10.0, 'Debe reducir voltaje de entrada');
    assert.ok(result > 0, 'Debe ser positivo');
  });
  
  it('converge hacia el límite con voltajes muy altos', () => {
    const result = applySoftClip(100.0, 8.0);
    assert.ok(result < 5.0); // tanh → ~1.0, escalado a halfMax
  });
  
  it('funciona simétricamente con voltajes negativos', () => {
    const positive = applySoftClip(10.0, 8.0);
    const negative = applySoftClip(-10.0, 8.0);
    assert.ok(Math.abs(Math.abs(positive) - Math.abs(negative)) < 0.0001);
  });
  
  it('respeta parámetro de suavidad', () => {
    const soft = applySoftClip(6.0, 8.0, 0.5);
    const hard = applySoftClip(6.0, 8.0, 2.0);
    // Ambos deben ser valores válidos saturados
    assert.ok(soft > 0 && soft < 10);
    assert.ok(hard > 0 && hard < 10);
    // Diferentes valores de softness producen resultados diferentes
    assert.notEqual(soft, hard);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suma de Tierra Virtual
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - calculateVirtualEarthSum()', () => {
  
  it('suma dos fuentes iguales correctamente', () => {
    const sources = [
      { voltage: 4, resistance: 100000 },
      { voltage: 4, resistance: 100000 }
    ];
    const result = calculateVirtualEarthSum(sources, 100000);
    assert.equal(result, 8.0);
  });
  
  it('aplica ganancia según resistencia de pin', () => {
    const sources = [{ voltage: 1, resistance: 2700 }];
    const result = calculateVirtualEarthSum(sources, 100000);
    assert.ok(Math.abs(result - 37.037) < 0.01);
  });
  
  it('suma múltiples fuentes con diferentes resistencias', () => {
    const sources = [
      { voltage: 4, resistance: 100000 },
      { voltage: 2, resistance: 100000 }
    ];
    const result = calculateVirtualEarthSum(sources, 100000);
    assert.ok(Math.abs(result - 6.0) < 0.0001, `Esperado ~6.0, obtenido ${result}`);
  });
  
  it('aplica soft clipping si se especifica límite', () => {
    const sources = [
      { voltage: 4, resistance: 100000 },
      { voltage: 4, resistance: 100000 },
      { voltage: 4, resistance: 100000 }
    ];
    const result = calculateVirtualEarthSum(sources, 100000, 8.0);
    // Sin clipping sería 12V, con clipping debe ser menor
    assert.ok(result < 12.0, 'Debe aplicar saturación');
    assert.ok(result > 0, 'Debe ser positivo');
  });
  
  it('ignora fuentes con resistencia 0', () => {
    const sources = [
      { voltage: 4, resistance: 100000 },
      { voltage: 100, resistance: 0 }
    ];
    const result = calculateVirtualEarthSum(sources, 100000);
    assert.equal(result, 4.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// panel3.config.js - Configuración de Voltaje de Osciladores
// ─────────────────────────────────────────────────────────────────────────────

describe('panel3.config.js - Configuración de Voltaje', () => {
  
  it('tiene sección voltage en defaults', () => {
    assert.ok(panel3Config.defaults.voltage !== undefined);
  });
  
  it('define niveles de salida por forma de onda', () => {
    const { outputLevels } = panel3Config.defaults.voltage;
    assert.equal(outputLevels.sine, 8.0);
    assert.equal(outputLevels.sawtooth, 8.0);
    assert.equal(outputLevels.pulse, 8.0);
    assert.equal(outputLevels.triangle, 8.0);
    assert.equal(outputLevels.cusp, 0.5);
  });
  
  it('define resistencias de realimentación internas', () => {
    const { feedbackResistance } = panel3Config.defaults.voltage;
    assert.equal(feedbackResistance.sineSawtooth, 100000);
    assert.equal(feedbackResistance.pulseTriangle, 300000);
  });
  
  it('define límite de entrada para soft clipping', () => {
    assert.equal(panel3Config.defaults.voltage.inputLimit, 8.0);
  });
  
  it('define parámetros de deriva térmica', () => {
    const { thermalDrift } = panel3Config.defaults.voltage;
    assert.equal(thermalDrift.maxDeviation, 0.001);
    assert.equal(thermalDrift.periodSeconds, 120);
    assert.equal(thermalDrift.enabledByDefault, true);
  });
  
  it('incluye valores históricos de Belgrado', () => {
    const { legacyBelgrado } = panel3Config.defaults.voltage;
    assert.equal(legacyBelgrado.sine, 4.0);
    assert.equal(legacyBelgrado.noise, 3.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOLTAGE_DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

describe('VOLTAGE_DEFAULTS - Configuración por defecto', () => {
  
  it('usa pin gris por defecto', () => {
    assert.equal(VOLTAGE_DEFAULTS.defaultPinType, 'GREY');
  });
  
  it('tiene tolerancia de pin activada por defecto', () => {
    assert.equal(VOLTAGE_DEFAULTS.applyPinTolerance, true);
  });
  
  it('tiene deriva térmica activada por defecto', () => {
    assert.equal(VOLTAGE_DEFAULTS.applyThermalDrift, true);
  });
  
  it('tiene soft clipping activado por defecto', () => {
    assert.equal(VOLTAGE_DEFAULTS.softClipEnabled, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSoftClipCurve - Curva para WaveShaperNode
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - createSoftClipCurve()', () => {
  
  it('devuelve Float32Array con el número de muestras especificado', () => {
    const curve = createSoftClipCurve(256);
    assert.ok(curve instanceof Float32Array);
    assert.equal(curve.length, 256);
  });
  
  it('genera curva simétrica (punto medio = 0)', () => {
    const curve = createSoftClipCurve(256);
    // El punto medio (índice 128) debe ser ~0
    assert.ok(Math.abs(curve[128]) < 0.01);
  });
  
  it('genera curva antisimétrica (f(-x) = -f(x))', () => {
    const curve = createSoftClipCurve(256);
    // Comparar puntos simétricos alrededor del centro
    for (let i = 1; i < 128; i++) {
      const left = curve[128 - i];
      const right = curve[128 + i];
      assert.ok(Math.abs(left + right) < 0.01, `Índices ${128-i} y ${128+i} no son antisimétricos`);
    }
  });
  
  it('satura hacia inputLimit con valores extremos', () => {
    const inputLimit = 2.0;
    const curve = createSoftClipCurve(256, inputLimit);
    
    // El valor máximo debe estar cerca pero por debajo del inputLimit
    const maxValue = curve[255];
    const minValue = curve[0];
    
    assert.ok(maxValue > 0 && maxValue <= inputLimit);
    assert.ok(minValue < 0 && minValue >= -inputLimit);
  });
  
  it('con inputLimit=1, los extremos se acercan a ±1', () => {
    const curve = createSoftClipCurve(256, 1.0);
    
    // tanh(1) ≈ 0.76, así que con inputLimit=1 el máximo será ~0.76
    assert.ok(Math.abs(curve[255]) > 0.5);
    assert.ok(Math.abs(curve[255]) < 1.0);
  });
  
  it('softness afecta la pendiente de saturación', () => {
    const curveSoft = createSoftClipCurve(256, 1.0, 0.5);  // Más agresivo
    const curveNormal = createSoftClipCurve(256, 1.0, 1.0);
    
    // Con menor softness, el valor en un punto intermedio será mayor
    // (satura más rápido hacia el límite)
    const midPoint = 192; // ~0.5 en el rango de entrada
    assert.ok(Math.abs(curveSoft[midPoint]) >= Math.abs(curveNormal[midPoint]) * 0.9);
  });
  
  it('es válida para uso en WaveShaperNode (sin NaN ni Infinity)', () => {
    const curve = createSoftClipCurve(512, 2.0, 0.5);
    
    for (let i = 0; i < curve.length; i++) {
      assert.ok(Number.isFinite(curve[i]), `Índice ${i} tiene valor no finito: ${curve[i]}`);
    }
  });
});
