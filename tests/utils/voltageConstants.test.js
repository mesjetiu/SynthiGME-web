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
  
  // Constantes VCA CEM 3330
  VCA_DB_PER_VOLT,
  VCA_SLIDER_VOLTAGE_AT_MAX,
  VCA_SLIDER_VOLTAGE_AT_MIN,
  VCA_CUTOFF_DB,
  VCA_CUTOFF_VOLTAGE,
  
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
  calculateMatrixPinGain,
  applyResistanceTolerance,
  applySoftClip,
  calculateVirtualEarthSum,
  createSoftClipCurve,
  createHybridClipCurve,
  
  // Funciones VCA
  vcaDialToVoltage,
  vcaVoltageToGain,
  vcaCalculateGain,
  
  // Defaults
  VOLTAGE_DEFAULTS
} from '../../src/assets/js/utils/voltageConstants.js';

// Importar config de osciladores para verificar integración
import { oscillatorConfig } from '../../src/assets/js/configs/index.js';

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
// Ganancia de Pin de Matriz (high-level)
// ─────────────────────────────────────────────────────────────────────────────

describe('voltageConstants - calculateMatrixPinGain()', () => {
  
  it('calcula ganancia unitaria con pin gris y Rf estándar', () => {
    const gain = calculateMatrixPinGain('GREY');
    assert.equal(gain, 1.0);
  });
  
  it('calcula ganancia unitaria con pin blanco y Rf estándar', () => {
    const gain = calculateMatrixPinGain('WHITE');
    assert.equal(gain, 1.0);
  });
  
  it('calcula ganancia ~37× con pin rojo', () => {
    const gain = calculateMatrixPinGain('RED');
    assert.ok(Math.abs(gain - 37.037) < 0.01);
  });
  
  it('calcula ganancia ~1.47× con pin verde', () => {
    const gain = calculateMatrixPinGain('GREEN');
    assert.ok(Math.abs(gain - 1.47) < 0.01);
  });
  
  it('usa Rf personalizada cuando se especifica', () => {
    // Pin blanco (100k) con Rf = 200k → ganancia 2.0
    const gain = calculateMatrixPinGain('WHITE', 200000);
    assert.equal(gain, 2.0);
  });
  
  it('aplica tolerancia reproducible con mismo seed', () => {
    const gain1 = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed: 42 });
    const gain2 = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed: 42 });
    assert.equal(gain1, gain2);
  });
  
  it('produce ganancias diferentes con seeds diferentes', () => {
    const gain1 = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed: 42 });
    const gain2 = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed: 43 });
    assert.notEqual(gain1, gain2);
  });
  
  it('pin gris tiene menor variación que pin blanco con tolerancia', () => {
    // GREY: ±0.5%, WHITE: ±10%
    // Con 100 seeds, la desviación de GREY debe ser ~20× menor que WHITE
    let greyMin = Infinity, greyMax = -Infinity;
    let whiteMin = Infinity, whiteMax = -Infinity;
    
    for (let seed = 0; seed < 100; seed++) {
      const grey = calculateMatrixPinGain('GREY', 100000, { applyTolerance: true, seed });
      const white = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: true, seed });
      greyMin = Math.min(greyMin, grey);
      greyMax = Math.max(greyMax, grey);
      whiteMin = Math.min(whiteMin, white);
      whiteMax = Math.max(whiteMax, white);
    }
    
    const greyRange = greyMax - greyMin;
    const whiteRange = whiteMax - whiteMin;
    
    // La variación de white debe ser al menos 5× mayor que grey
    assert.ok(whiteRange > greyRange * 5, 
      `White range (${whiteRange.toFixed(4)}) debería ser >5× grey range (${greyRange.toFixed(4)})`);
  });
  
  it('devuelve fallback seguro para pin ORANGE (peligroso)', () => {
    const gain = calculateMatrixPinGain('ORANGE');
    assert.equal(gain, 1.0);
  });
  
  it('devuelve ganancia de GREY para tipo de pin desconocido', () => {
    const gain = calculateMatrixPinGain('UNKNOWN');
    assert.equal(gain, 1.0);
  });
  
  it('sin tolerancia, gris y blanco dan mismo resultado', () => {
    const grey = calculateMatrixPinGain('GREY', 100000, { applyTolerance: false });
    const white = calculateMatrixPinGain('WHITE', 100000, { applyTolerance: false });
    assert.equal(grey, white);
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
// oscillator.config.js - Configuración de Voltaje de Osciladores
// ─────────────────────────────────────────────────────────────────────────────
//
// Basado en el esquema electrónico D100-02 C1 y Manual Técnico de Datanomics (1982).
// Los valores finales en la matriz dependen de la ganancia del amplificador de suma:
// - I/C 6 (Rf=100k): Seno + Sierra → ganancia ×1.0
// - I/C 7 (Rf=300k): Pulso + Triángulo → ganancia ×3.0
//
// ─────────────────────────────────────────────────────────────────────────────

describe('oscillator.config.js - Configuración de Voltaje', () => {
  
  it('tiene sección voltage en defaults', () => {
    assert.ok(oscillatorConfig.defaults.voltage !== undefined);
  });
  
  it('define niveles de salida por forma de onda según manual técnico', () => {
    const { outputLevels } = oscillatorConfig.defaults.voltage;
    // Sine: 8V p-p (referencia de calibración del sistema)
    assert.equal(outputLevels.sine, 8.0);
    // Sawtooth: 5-7.4V p-p (promedio ~6.2V, ganancia ×1.0)
    assert.ok(outputLevels.sawtooth >= 5.0 && outputLevels.sawtooth <= 7.4, 
      `sawtooth debe estar en rango 5.0-7.4V, actual: ${outputLevels.sawtooth}`);
    // Pulse: ~8.1V p-p (nativo ~2.7V × ganancia ×3.0)
    assert.ok(Math.abs(outputLevels.pulse - 8.1) < 0.2,
      `pulse debe ser ~8.1V, actual: ${outputLevels.pulse}`);
    // Triangle: ~8.1V p-p (nativo ~2.7V × ganancia ×3.0)
    assert.ok(Math.abs(outputLevels.triangle - 8.1) < 0.2,
      `triangle debe ser ~8.1V, actual: ${outputLevels.triangle}`);
    // Cusp: 0.5V p-p (atenuación 8:1 del seno deformado)
    assert.equal(outputLevels.cusp, 0.5);
  });
  
  it('define resistencias de realimentación internas', () => {
    const { feedbackResistance } = oscillatorConfig.defaults.voltage;
    assert.equal(feedbackResistance.sineSawtooth, 100000);
    assert.equal(feedbackResistance.pulseTriangle, 300000);
  });
  
  it('define límite de entrada para soft clipping', () => {
    assert.equal(oscillatorConfig.defaults.voltage.inputLimit, 8.0);
  });
  
  it('define parámetros de deriva térmica', () => {
    const { thermalDrift } = oscillatorConfig.defaults.voltage;
    assert.equal(thermalDrift.maxDeviation, 0.001);
    assert.equal(thermalDrift.periodSeconds, 120);
    assert.equal(thermalDrift.enabledByDefault, true);
  });
  
  it('incluye valores históricos de Belgrado', () => {
    const { legacyBelgrado } = oscillatorConfig.defaults.voltage;
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

// =============================================================================
// createHybridClipCurve - Curva de saturación suave para WaveShaperNode
// =============================================================================
//
// Genera una curva para WaveShaperNode que:
// - Es lineal (ganancia 1:1) para el 95% del rango [-1, +1]
// - Aplica saturación suave (tanh) en el 5% extremo para evitar clicks
// - Opera en rango Web Audio estándar [-1, +1]
//
// Los parámetros (linearThreshold, softThreshold, hardLimit, softness) se
// mantienen por compatibilidad de API pero la curva usa umbral fijo de 0.95.
// =============================================================================

describe('voltageConstants - createHybridClipCurve()', () => {
  
  // ─────────────────────────────────────────────────────────────────────────
  // Estructura básica de la curva
  // ─────────────────────────────────────────────────────────────────────────
  
  it('retorna un Float32Array con el número de muestras especificado', () => {
    const curve = createHybridClipCurve(512);
    assert.ok(curve instanceof Float32Array);
    assert.equal(curve.length, 512);
  });
  
  it('es simétrica respecto al origen (bipolar)', () => {
    // Usar número impar de muestras para tener un centro exacto
    const samples = 257;
    const curve = createHybridClipCurve(samples);
    const center = Math.floor(samples / 2);  // 128
    
    // Verificar simetría: curve[center + n] ≈ -curve[center - n]
    for (let n = 1; n <= center; n++) {
      const positive = curve[center + n];
      const negative = curve[center - n];
      assert.ok(
        Math.abs(positive + negative) < 0.001,
        `Asimetría en n=${n}: +${positive} vs -${negative}`
      );
    }
  });
  
  it('pasa por el origen (0 entrada → 0 salida)', () => {
    // Usar número impar de muestras para tener un centro exacto
    const samples = 257;
    const curve = createHybridClipCurve(samples);
    const center = Math.floor(samples / 2);  // 128
    assert.ok(Math.abs(curve[center]) < 0.001, `Centro no es cero: ${curve[center]}`);
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zona Lineal (≤ 0.95)
  // ─────────────────────────────────────────────────────────────────────────
  
  it('es lineal (ganancia 1:1) por debajo del umbral de saturación (0.95)', () => {
    const samples = 1024;
    const curve = createHybridClipCurve(samples);
    
    // Muestrear puntos en la zona lineal (< 0.95)
    // El WaveShaper mapea índice 0-samples a entrada -1 a +1
    const testInputs = [0.0, 0.1, 0.3, 0.5, 0.7, 0.9];
    
    for (const x of testInputs) {
      // Convertir entrada a índice de curva: índice = (x + 1) / 2 * (samples - 1)
      const index = Math.round((x + 1) / 2 * (samples - 1));
      const output = curve[index];
      
      // En zona lineal: output ≈ input
      assert.ok(
        Math.abs(output - x) < 0.01,
        `En zona lineal (x=${x}): esperado ~${x}, obtenido ${output}`
      );
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zona de Saturación (> 0.95)
  // ─────────────────────────────────────────────────────────────────────────
  
  it('aplica saturación suave cerca de ±1', () => {
    const samples = 1024;
    const curve = createHybridClipCurve(samples);
    
    // En el extremo (índice samples-1 = entrada +1), la salida debe estar
    // cerca de 1 pero ligeramente comprimida por tanh
    const maxOutput = curve[samples - 1];
    const minOutput = curve[0];
    
    // Los extremos deben estar muy cerca de ±1 (la compresión es mínima)
    assert.ok(
      maxOutput > 0.99 && maxOutput <= 1.0,
      `Extremo positivo debe estar cerca de 1: ${maxOutput}`
    );
    assert.ok(
      minOutput < -0.99 && minOutput >= -1.0,
      `Extremo negativo debe estar cerca de -1: ${minOutput}`
    );
  });
  
  it('nunca supera ±1 (límite Web Audio)', () => {
    const curve = createHybridClipCurve(1024);
    
    for (let i = 0; i < curve.length; i++) {
      assert.ok(
        Math.abs(curve[i]) <= 1.0 + 0.001,
        `Índice ${i} supera ±1: ${curve[i]}`
      );
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Continuidad de la curva
  // ─────────────────────────────────────────────────────────────────────────
  
  it('es continua sin saltos abruptos', () => {
    const curve = createHybridClipCurve(1024);
    
    // Con 1024 muestras en rango [-1, +1], cada paso es ~2/1023 ≈ 0.002
    // La pendiente máxima en zona lineal es 1, así que max delta ≈ 0.002
    // En zona de saturación, la pendiente es menor
    const maxJump = 0.01;
    
    for (let i = 1; i < curve.length; i++) {
      const delta = Math.abs(curve[i] - curve[i - 1]);
      assert.ok(
        delta < maxJump,
        `Salto abrupto en índice ${i}: delta=${delta} (max=${maxJump})`
      );
    }
  });
  
  it('es monótonamente creciente', () => {
    const curve = createHybridClipCurve(1024);
    
    for (let i = 1; i < curve.length; i++) {
      assert.ok(
        curve[i] >= curve[i - 1] - 0.0001,
        `No monótona en índice ${i}: ${curve[i]} < ${curve[i - 1]}`
      );
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Parámetros de softness
  // ─────────────────────────────────────────────────────────────────────────
  
  it('softness afecta la compresión en zona de saturación', () => {
    // softness controla qué tan rápido satura la zona de transición
    const curveLow = createHybridClipCurve(1024, 2.25, 2.875, 3.0, 0.5);
    const curveHigh = createHybridClipCurve(1024, 2.25, 2.875, 3.0, 5.0);
    
    // En el extremo, ambas deben saturar pero con diferentes curvas
    // Con softness alto, tanh satura más rápido (se acerca más a 1)
    const extremeHigh = curveHigh[1023];
    const extremeLow = curveLow[1023];
    
    // Ambas deben estar razonablemente cerca de 1 (> 0.97)
    assert.ok(extremeHigh > 0.97, `Softness alto debe saturar cerca de 1: ${extremeHigh}`);
    assert.ok(extremeLow > 0.97, `Softness bajo debe saturar cerca de 1: ${extremeLow}`);
    
    // La diferencia puede ser mínima pero high debería estar más cerca de 1
    assert.ok(
      extremeHigh >= extremeLow - 0.001,
      `Softness alto debe saturar más rápido: high=${extremeHigh}, low=${extremeLow}`
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Validación para WaveShaperNode
  // ─────────────────────────────────────────────────────────────────────────
  
  it('es válida para uso en WaveShaperNode (sin NaN ni Infinity)', () => {
    const curve = createHybridClipCurve(1024);
    
    for (let i = 0; i < curve.length; i++) {
      assert.ok(
        Number.isFinite(curve[i]),
        `Índice ${i} tiene valor no finito: ${curve[i]}`
      );
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Compatibilidad de API
  // ─────────────────────────────────────────────────────────────────────────
  
  it('acepta parámetros legacy sin fallar', () => {
    // Los parámetros originales (linearThreshold, softThreshold, hardLimit)
    // se mantienen por compatibilidad aunque la curva usa umbral fijo interno
    const curve = createHybridClipCurve(1024, 2.25, 2.875, 3.0, 2.0);
    
    assert.ok(curve instanceof Float32Array);
    assert.equal(curve.length, 1024);
    
    // Debe seguir siendo lineal en la zona central
    const centerIndex = 512;
    const output = curve[centerIndex];
    const expectedInput = 2 * (512 / 1023) - 1;  // ≈ 0.001
    assert.ok(
      Math.abs(output - expectedInput) < 0.01,
      `Centro debe ser lineal: esperado ${expectedInput}, obtenido ${output}`
    );
  });
});

// =============================================================================
// VCA CEM 3330 - Constantes (Output Channels versión Cuenca 1982)
// =============================================================================

describe('voltageConstants - Constantes VCA CEM 3330', () => {
  
  it('tiene sensibilidad de 10 dB por voltio', () => {
    assert.equal(VCA_DB_PER_VOLT, 10);
  });
  
  it('tiene voltaje 0V en posición máxima del dial (10)', () => {
    assert.equal(VCA_SLIDER_VOLTAGE_AT_MAX, 0);
  });
  
  it('tiene voltaje -12V en posición mínima del dial (0)', () => {
    assert.equal(VCA_SLIDER_VOLTAGE_AT_MIN, -12);
  });
  
  it('tiene umbral de corte en -120 dB', () => {
    assert.equal(VCA_CUTOFF_DB, -120);
  });
  
  it('tiene voltaje de corte en -12V', () => {
    assert.equal(VCA_CUTOFF_VOLTAGE, -12);
  });
  
  it('coherencia: 12V × 10 dB/V = 120 dB', () => {
    const dbRange = Math.abs(VCA_SLIDER_VOLTAGE_AT_MIN) * VCA_DB_PER_VOLT;
    assert.equal(dbRange, Math.abs(VCA_CUTOFF_DB));
  });
});

// =============================================================================
// VCA CEM 3330 - Función vcaDialToVoltage
// =============================================================================

describe('voltageConstants - vcaDialToVoltage', () => {
  
  it('posición 10 (máximo) → 0V', () => {
    const voltage = vcaDialToVoltage(10);
    assert.equal(voltage, 0);
  });
  
  it('posición 5 (centro) → -6V', () => {
    const voltage = vcaDialToVoltage(5);
    assert.equal(voltage, -6);
  });
  
  it('posición 0 (mínimo) → -12V', () => {
    const voltage = vcaDialToVoltage(0);
    assert.equal(voltage, -12);
  });
  
  it('posición 7.5 → -3V (interpolación lineal)', () => {
    const voltage = vcaDialToVoltage(7.5);
    assert.equal(voltage, -3);
  });
  
  it('posición 2.5 → -9V (interpolación lineal)', () => {
    const voltage = vcaDialToVoltage(2.5);
    assert.equal(voltage, -9);
  });
  
  it('clampea valores fuera de rango: -5 → -12V', () => {
    const voltage = vcaDialToVoltage(-5);
    assert.equal(voltage, -12);
  });
  
  it('clampea valores fuera de rango: 15 → 0V', () => {
    const voltage = vcaDialToVoltage(15);
    assert.equal(voltage, 0);
  });
  
  it('acepta configuración personalizada de voltajes', () => {
    const config = { voltageAtMax: 0, voltageAtMin: -10 };
    const voltage = vcaDialToVoltage(5, config);
    assert.equal(voltage, -5);  // Mitad del rango 0 a -10
  });
});

// =============================================================================
// VCA CEM 3330 - Función vcaVoltageToGain
// =============================================================================

describe('voltageConstants - vcaVoltageToGain', () => {
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zona de corte total
  // ─────────────────────────────────────────────────────────────────────────
  
  it('voltaje ≤ -12V → ganancia 0 (corte total)', () => {
    assert.equal(vcaVoltageToGain(-12), 0);
    assert.equal(vcaVoltageToGain(-15), 0);
    assert.equal(vcaVoltageToGain(-100), 0);
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zona normal (logarítmica 10 dB/V)
  // ─────────────────────────────────────────────────────────────────────────
  
  it('voltaje 0V → ganancia 1.0 (0 dB, unidad)', () => {
    const gain = vcaVoltageToGain(0);
    assert.ok(
      Math.abs(gain - 1.0) < 0.001,
      `0V debe dar ganancia 1.0, obtenido: ${gain}`
    );
  });
  
  it('voltaje -6V → ganancia ~0.001 (-60 dB)', () => {
    // -60 dB = 10^(-60/20) = 10^-3 = 0.001
    const gain = vcaVoltageToGain(-6);
    const expectedGain = Math.pow(10, -60 / 20);  // 0.001
    assert.ok(
      Math.abs(gain - expectedGain) < 0.0001,
      `-6V debe dar ganancia ~0.001, obtenido: ${gain}`
    );
  });
  
  it('voltaje -3V → ganancia ~0.0316 (-30 dB)', () => {
    // -30 dB = 10^(-30/20) ≈ 0.0316
    const gain = vcaVoltageToGain(-3);
    const expectedGain = Math.pow(10, -30 / 20);
    assert.ok(
      Math.abs(gain - expectedGain) < 0.001,
      `-3V debe dar ganancia ~0.0316, obtenido: ${gain}`
    );
  });
  
  it('voltaje -11V → ganancia muy pequeña pero no cero', () => {
    // -110 dB = 10^(-110/20) ≈ 3.16e-6
    const gain = vcaVoltageToGain(-11);
    assert.ok(gain > 0, 'Debe ser mayor que 0');
    assert.ok(gain < 0.00001, `Debe ser muy pequeño: ${gain}`);
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Zona de saturación (CV positivo)
  // ─────────────────────────────────────────────────────────────────────────
  
  it('voltaje +1V → ganancia > 1.0 (amplificación)', () => {
    const gain = vcaVoltageToGain(1);
    assert.ok(
      gain > 1.0,
      `+1V debe amplificar (ganancia > 1), obtenido: ${gain}`
    );
  });
  
  it('voltaje +2V → ganancia saturada (no llega a 10 dB × 2V)', () => {
    // Sin saturación: +20 dB = 10^(20/20) = 10.0
    // Con saturación debe ser significativamente menor
    const gain = vcaVoltageToGain(2);
    const unsaturatedGain = Math.pow(10, 20 / 20);  // 10.0
    
    assert.ok(gain > 1.0, 'Debe amplificar');
    assert.ok(
      gain < unsaturatedGain,
      `+2V debe saturar (ganancia < ${unsaturatedGain}), obtenido: ${gain}`
    );
  });
  
  it('voltaje +3V (hard limit) → ganancia máxima saturada', () => {
    const gain = vcaVoltageToGain(3);
    // No debe ser infinito ni excesivo
    assert.ok(Number.isFinite(gain), 'Debe ser finito');
    assert.ok(gain < 100, `Ganancia debe estar limitada: ${gain}`);
  });
  
  it('voltaje +10V → no explota, se mantiene en límite', () => {
    const gain = vcaVoltageToGain(10);
    const gainAt3V = vcaVoltageToGain(3);
    
    assert.ok(Number.isFinite(gain), 'Debe ser finito');
    // Ganancia a +10V no debe ser mucho mayor que a +3V (saturación)
    assert.ok(
      gain < gainAt3V * 2,
      `Saturación debe limitar: +10V=${gain}, +3V=${gainAt3V}`
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Configuración personalizada
  // ─────────────────────────────────────────────────────────────────────────
  
  it('acepta configuración personalizada de dbPerVolt', () => {
    const config = { dbPerVolt: 20 };  // 20 dB/V en vez de 10
    const gain = vcaVoltageToGain(-3, config);
    // -3V × 20 dB/V = -60 dB = 0.001
    const expectedGain = Math.pow(10, -60 / 20);
    assert.ok(
      Math.abs(gain - expectedGain) < 0.0001,
      `Config custom: -3V a 20dB/V debe dar ~0.001, obtenido: ${gain}`
    );
  });
});

// =============================================================================
// VCA CEM 3330 - Función vcaCalculateGain (función de alto nivel)
// =============================================================================

describe('voltageConstants - vcaCalculateGain', () => {
  
  // ─────────────────────────────────────────────────────────────────────────
  // Solo fader, sin CV externo
  // ─────────────────────────────────────────────────────────────────────────
  
  it('dial 10, sin CV → ganancia 1.0', () => {
    const gain = vcaCalculateGain(10);
    assert.ok(
      Math.abs(gain - 1.0) < 0.001,
      `Dial 10 debe dar ganancia 1.0, obtenido: ${gain}`
    );
  });
  
  it('dial 5, sin CV → ganancia ~0.001 (-60 dB)', () => {
    const gain = vcaCalculateGain(5);
    const expectedGain = Math.pow(10, -60 / 20);
    assert.ok(
      Math.abs(gain - expectedGain) < 0.0001,
      `Dial 5 debe dar ~0.001, obtenido: ${gain}`
    );
  });
  
  it('dial 0, sin CV → ganancia 0 (corte total)', () => {
    const gain = vcaCalculateGain(0);
    assert.equal(gain, 0);
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Fader + CV externo
  // ─────────────────────────────────────────────────────────────────────────
  
  it('dial 5 + CV +3V → ganancia > dial 5 solo', () => {
    const gainWithoutCV = vcaCalculateGain(5, 0);
    const gainWithCV = vcaCalculateGain(5, 3);
    
    assert.ok(
      gainWithCV > gainWithoutCV,
      `CV positivo debe aumentar ganancia: sin=${gainWithoutCV}, con=${gainWithCV}`
    );
  });
  
  it('dial 5 + CV -3V → ganancia < dial 5 solo', () => {
    const gainWithoutCV = vcaCalculateGain(5, 0);
    const gainWithCV = vcaCalculateGain(5, -3);
    
    assert.ok(
      gainWithCV < gainWithoutCV,
      `CV negativo debe reducir ganancia: sin=${gainWithoutCV}, con=${gainWithCV}`
    );
  });
  
  it('dial 7 + CV +6V → satura en vez de ganancia lineal', () => {
    // dial 7 → -3.6V, +6V CV → suma = +2.4V
    // Sin saturación: +24 dB = ganancia ~16
    // Con saturación: debe ser significativamente menor
    const gain = vcaCalculateGain(7, 6);
    const unsaturatedGain = Math.pow(10, 24 / 20);  // ~15.85
    
    assert.ok(
      gain < unsaturatedGain,
      `Debe saturar: obtenido ${gain}, sin saturar sería ${unsaturatedGain}`
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // CASO CRÍTICO: Corte mecánico en posición 0
  // El fader en posición 0 desconecta físicamente, ignorando CV
  // ─────────────────────────────────────────────────────────────────────────
  
  it('dial 0 + CV +5V → sigue siendo 0 (corte mecánico)', () => {
    const gain = vcaCalculateGain(0, 5);
    assert.equal(
      gain,
      0,
      'Dial en 0 debe ignorar CV externo (corte mecánico)'
    );
  });
  
  it('dial 0 + CV +100V → sigue siendo 0 (corte mecánico)', () => {
    const gain = vcaCalculateGain(0, 100);
    assert.equal(
      gain,
      0,
      'Dial en 0 debe ignorar cualquier CV (corte mecánico)'
    );
  });
  
  it('dial ligeramente > 0 + CV → funciona normal', () => {
    // dial 0.1 → voltaje ≈ -11.88V
    // Con CV +11V → suma ≈ -0.88V → ganancia pequeña pero no cero
    const gain = vcaCalculateGain(0.1, 11);
    assert.ok(
      gain > 0,
      'Dial > 0 debe permitir CV externo'
    );
  });
});

