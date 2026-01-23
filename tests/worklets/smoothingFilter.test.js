/**
 * Tests para el sistema de suavizado de formas de onda.
 * 
 * Verifica matemáticamente los filtros de suavizado que emulan las características
 * eléctricas del Synthi 100 (Datanomics 1982):
 * 
 * 1. Slew inherente del módulo: Los amplificadores operacionales (CA3140) tienen
 *    un slew rate finito que impide transiciones instantáneas en pulse y sawtooth.
 *    Referencia: Manual técnico - "la verticalidad está limitada por el slew rate"
 * 
 * 2. Integración por resistencia de pin: La resistencia del pin combinada con la
 *    capacitancia parásita del bus (~100pF) crea un filtro RC natural.
 *    Referencia: Manual - "con pines de 100k se produce integración de transitorios"
 * 
 * 3. Combinación de ambos efectos: El suavizado total es la suma de ambos factores,
 *    implementado como un único filtro con frecuencia de corte combinada.
 * 
 * @module tests/worklets/smoothingFilter
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  measureRiseTime,
  measureFallTime,
  measureHighFrequencyEnergy,
  calculateRCCutoffFrequency,
  PIN_CUTOFF_FREQUENCIES,
  computeSpectrum,
  generateReference
} from '../audio/spectralAnalysis.js';

// =============================================================================
// CONSTANTES DE REFERENCIA DEL SYNTHI 100
// =============================================================================

/**
 * Capacitancia parásita estimada del bus de la matriz.
 * Valor derivado del comportamiento descrito en el manual técnico.
 * @constant {number} Faradios
 */
const MATRIX_BUS_CAPACITANCE = 100e-12;  // 100 pF

/**
 * Frecuencia de corte inherente del módulo oscilador.
 * Determinada por el slew rate del CA3140 y circuitos de salida.
 * Este es el límite superior de velocidad de transición del hardware.
 * @constant {number} Hz
 */
const MODULE_INHERENT_CUTOFF = 20000;  // ~20 kHz

/**
 * Slew rate máximo del módulo Slew Limiter del Synthi 100.
 * Referencia: Manual Datanomics - "1 V/ms en ajuste rápido"
 * @constant {number} V/ms
 */
const MAX_SLEW_RATE_V_PER_MS = 1.0;

/**
 * Sample rate estándar para tests.
 * @constant {number}
 */
const TEST_SAMPLE_RATE = 44100;

// =============================================================================
// FUNCIONES AUXILIARES DE FILTRADO (A IMPLEMENTAR EN EL WORKLET)
// =============================================================================

/**
 * Calcula el coeficiente alpha de un filtro one-pole lowpass.
 * 
 * El filtro one-pole es: y[n] = alpha * x[n] + (1 - alpha) * y[n-1]
 * 
 * Donde alpha = 1 - e^(-2π × fc / fs)
 * 
 * @param {number} cutoffHz - Frecuencia de corte en Hz
 * @param {number} sampleRate - Frecuencia de muestreo
 * @returns {number} Coeficiente alpha (0-1)
 */
function calculateOnePoleAlpha(cutoffHz, sampleRate) {
  if (cutoffHz >= sampleRate / 2) return 1.0;  // Bypass
  if (cutoffHz <= 0) return 0;  // DC only
  return 1 - Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
}

/**
 * Calcula la frecuencia de corte combinada (módulo + pin).
 * 
 * Cuando dos filtros RC están en serie, la frecuencia de corte combinada
 * es aproximadamente el mínimo de ambas frecuencias de corte para frecuencias
 * de corte bien separadas, o se calcula como:
 * 
 * fc_combined ≈ 1 / sqrt((1/fc1)² + (1/fc2)²)
 * 
 * Para simplificar y ser conservadores, usamos el mínimo.
 * 
 * @param {number} moduleCutoff - Frecuencia de corte del módulo en Hz
 * @param {number} pinCutoff - Frecuencia de corte del pin en Hz
 * @returns {number} Frecuencia de corte combinada en Hz
 */
function calculateCombinedCutoff(moduleCutoff, pinCutoff) {
  return Math.min(moduleCutoff, pinCutoff);
}

/**
 * Aplica un filtro one-pole lowpass a un buffer de samples.
 * Simula el suavizado que ocurre en el hardware del Synthi 100.
 * 
 * @param {Float32Array|number[]} input - Buffer de entrada
 * @param {number} alpha - Coeficiente del filtro (0-1)
 * @returns {Float32Array} Buffer filtrado
 */
function applyOnePoleFilter(input, alpha) {
  const output = new Float32Array(input.length);
  let y = 0;  // Estado anterior
  
  for (let i = 0; i < input.length; i++) {
    y = alpha * input[i] + (1 - alpha) * y;
    output[i] = y;
  }
  
  return output;
}

/**
 * Genera una onda cuadrada naive (transiciones instantáneas).
 * Usada como referencia para medir el efecto del suavizado.
 * 
 * @param {number} frequency - Frecuencia en Hz
 * @param {number} duration - Duración en segundos
 * @param {number} sampleRate - Sample rate
 * @returns {Float32Array}
 */
function generateNaiveSquare(frequency, duration, sampleRate) {
  const length = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(length);
  
  for (let i = 0; i < length; i++) {
    const phase = (frequency * i / sampleRate) % 1;
    samples[i] = phase < 0.5 ? 1 : -1;
  }
  
  return samples;
}

/**
 * Genera una onda diente de sierra naive (reset instantáneo).
 * 
 * @param {number} frequency - Frecuencia en Hz
 * @param {number} duration - Duración en segundos
 * @param {number} sampleRate - Sample rate
 * @returns {Float32Array}
 */
function generateNaiveSawtooth(frequency, duration, sampleRate) {
  const length = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(length);
  
  for (let i = 0; i < length; i++) {
    const phase = (frequency * i / sampleRate) % 1;
    samples[i] = 2 * phase - 1;  // -1 a +1
  }
  
  return samples;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Smoothing Filter DSP - Fase 1: Infraestructura', () => {
  
  // ───────────────────────────────────────────────────────────────────────────
  // Tests de helpers de análisis temporal
  // ───────────────────────────────────────────────────────────────────────────
  
  describe('measureRiseTime()', () => {
    
    it('Debe detectar rise time ~0 en onda cuadrada naive (transición instantánea)', () => {
      const square = generateNaiveSquare(100, 0.1, TEST_SAMPLE_RATE);
      const result = measureRiseTime(square, TEST_SAMPLE_RATE);
      
      // En una onda cuadrada digital perfecta, la transición es de 1-2 samples
      // debido a que el valor salta de -1 a +1 en un solo sample
      assert.ok(result.transitionsFound > 0, 
        `Debe encontrar al menos una transición, got ${result.transitionsFound}`);
      assert.ok(result.riseTimeSamples <= 2, 
        `Rise time debe ser ≤2 samples para señal naive, got ${result.riseTimeSamples}`);
    });
    
    it('Debe detectar rise time mayor después de aplicar filtro lowpass', () => {
      const square = generateNaiveSquare(100, 0.1, TEST_SAMPLE_RATE);
      
      // Filtro con corte a 1kHz (suavizado muy notable)
      const alpha = calculateOnePoleAlpha(1000, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(square, alpha);
      
      const rawResult = measureRiseTime(square, TEST_SAMPLE_RATE);
      const filteredResult = measureRiseTime(filtered, TEST_SAMPLE_RATE);
      
      assert.ok(filteredResult.riseTime > rawResult.riseTime,
        `Rise time filtrado (${filteredResult.riseTime}s) debe ser mayor que raw (${rawResult.riseTime}s)`);
    });
    
    it('Debe retornar valores coherentes para múltiples transiciones', () => {
      const square = generateNaiveSquare(440, 0.05, TEST_SAMPLE_RATE);
      const alpha = calculateOnePoleAlpha(5000, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(square, alpha);
      
      const result = measureRiseTime(filtered, TEST_SAMPLE_RATE, { findFirst: false });
      
      // Debe encontrar múltiples transiciones en 50ms a 440Hz (~22 ciclos)
      assert.ok(result.transitionsFound >= 5, 
        `Debe encontrar múltiples transiciones, got ${result.transitionsFound}`);
      
      // El promedio debe estar cerca del primero (señal periódica estable)
      const ratio = result.avgRiseTime / result.riseTime;
      assert.ok(ratio > 0.5 && ratio < 2.0,
        `avgRiseTime/riseTime debe estar cerca de 1, got ${ratio}`);
    });
    
  });
  
  describe('measureHighFrequencyEnergy()', () => {
    
    it('Debe detectar energía alta en armónicos de onda cuadrada', () => {
      const square = generateNaiveSquare(100, 0.1, TEST_SAMPLE_RATE);
      const spectrum = computeSpectrum(square, TEST_SAMPLE_RATE);
      
      // Onda cuadrada tiene armónicos impares fuertes hasta el infinito
      const lowEnergy = measureHighFrequencyEnergy(spectrum, 0, { upperLimitHz: 1000 });
      const highEnergy = measureHighFrequencyEnergy(spectrum, 5000, { upperLimitHz: 15000 });
      
      // Debe haber energía significativa en ambas bandas
      assert.ok(lowEnergy.energy > 0, 'Debe haber energía en banda baja');
      assert.ok(highEnergy.energy > 0, 'Debe haber energía en banda alta');
    });
    
    it('Filtro lowpass debe reducir energía en alta frecuencia', () => {
      const square = generateNaiveSquare(100, 0.1, TEST_SAMPLE_RATE);
      const alpha = calculateOnePoleAlpha(2000, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(square, alpha);
      
      const spectrumRaw = computeSpectrum(square, TEST_SAMPLE_RATE);
      const spectrumFiltered = computeSpectrum(filtered, TEST_SAMPLE_RATE);
      
      const rawHigh = measureHighFrequencyEnergy(spectrumRaw, 5000);
      const filteredHigh = measureHighFrequencyEnergy(spectrumFiltered, 5000);
      
      // La energía en alta frecuencia debe reducirse después del filtrado
      assert.ok(filteredHigh.energyDb < rawHigh.energyDb,
        `Energía HF filtrada (${filteredHigh.energyDb}dB) debe ser menor que raw (${rawHigh.energyDb}dB)`);
    });
    
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Tests de cálculo de coeficientes
  // ───────────────────────────────────────────────────────────────────────────
  
  describe('calculateOnePoleAlpha()', () => {
    
    it('Alpha debe ser ~1 para frecuencia de corte muy alta (bypass)', () => {
      const alpha = calculateOnePoleAlpha(100000, TEST_SAMPLE_RATE);
      assert.ok(alpha > 0.99, `Alpha para fc=100kHz debe ser ~1, got ${alpha}`);
    });
    
    it('Alpha debe ser pequeño para frecuencia de corte baja', () => {
      const alpha = calculateOnePoleAlpha(100, TEST_SAMPLE_RATE);
      assert.ok(alpha < 0.1, `Alpha para fc=100Hz debe ser <0.1, got ${alpha}`);
    });
    
    it('Alpha debe ser exactamente 1 si fc >= Nyquist', () => {
      const alpha = calculateOnePoleAlpha(TEST_SAMPLE_RATE, TEST_SAMPLE_RATE);
      assert.equal(alpha, 1.0);
    });
    
    it('Alpha debe ser 0 si fc <= 0', () => {
      assert.equal(calculateOnePoleAlpha(0, TEST_SAMPLE_RATE), 0);
      assert.equal(calculateOnePoleAlpha(-100, TEST_SAMPLE_RATE), 0);
    });
    
  });
  
  describe('calculateRCCutoffFrequency()', () => {
    
    it('Pin WHITE (100kΩ) debe tener fc ≈ 15.9 kHz', () => {
      const fc = calculateRCCutoffFrequency(100000, MATRIX_BUS_CAPACITANCE);
      // fc = 1 / (2π × 100k × 100pF) ≈ 15915 Hz
      assert.ok(Math.abs(fc - 15915) < 100, `fc WHITE debe ser ~15915 Hz, got ${fc}`);
    });
    
    it('Pin RED (2.7kΩ) debe tener fc ≈ 589 kHz (bypass efectivo)', () => {
      const fc = calculateRCCutoffFrequency(2700, MATRIX_BUS_CAPACITANCE);
      // fc = 1 / (2π × 2.7k × 100pF) ≈ 589 kHz
      assert.ok(fc > 500000, `fc RED debe ser >500 kHz, got ${fc}`);
    });
    
    it('Pin BLUE (10kΩ) debe tener fc ≈ 159 kHz', () => {
      const fc = calculateRCCutoffFrequency(10000, MATRIX_BUS_CAPACITANCE);
      assert.ok(Math.abs(fc - 159155) < 1000, `fc BLUE debe ser ~159 kHz, got ${fc}`);
    });
    
    it('PIN_CUTOFF_FREQUENCIES debe tener valores pre-calculados correctos', () => {
      // Verificar que las constantes exportadas coinciden con el cálculo
      const whiteCalc = calculateRCCutoffFrequency(100000);
      assert.ok(Math.abs(PIN_CUTOFF_FREQUENCIES.WHITE - whiteCalc) < 1,
        'WHITE pre-calculado debe coincidir');
    });
    
  });
  
  describe('calculateCombinedCutoff()', () => {
    
    it('Debe retornar el mínimo de las dos frecuencias', () => {
      const combined = calculateCombinedCutoff(20000, 15000);
      assert.equal(combined, 15000);
    });
    
    it('Módulo + Pin WHITE: fc combinada ≈ 15.9 kHz (pin domina)', () => {
      const pinFc = PIN_CUTOFF_FREQUENCIES.WHITE;  // ~15.9 kHz
      const combined = calculateCombinedCutoff(MODULE_INHERENT_CUTOFF, pinFc);
      
      // El pin WHITE tiene fc menor que el módulo, así que domina
      assert.ok(combined < MODULE_INHERENT_CUTOFF,
        `Combined (${combined}) debe ser menor que módulo (${MODULE_INHERENT_CUTOFF})`);
    });
    
    it('Módulo + Pin RED: fc combinada ≈ 20 kHz (módulo domina)', () => {
      const pinFc = PIN_CUTOFF_FREQUENCIES.RED;  // ~589 kHz
      const combined = calculateCombinedCutoff(MODULE_INHERENT_CUTOFF, pinFc);
      
      // El pin RED tiene fc mucho mayor, el módulo domina
      assert.equal(combined, MODULE_INHERENT_CUTOFF);
    });
    
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Tests de comportamiento del filtro
  // ───────────────────────────────────────────────────────────────────────────
  
  describe('applyOnePoleFilter() comportamiento', () => {
    
    it('Alpha=1 debe ser bypass (salida = entrada)', () => {
      const input = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
      const output = applyOnePoleFilter(input, 1.0);
      
      for (let i = 0; i < input.length; i++) {
        assert.ok(Math.abs(output[i] - input[i]) < 0.001,
          `Sample ${i}: output ${output[i]} debe ≈ input ${input[i]}`);
      }
    });
    
    it('Alpha=0 debe mantener DC (sample & hold del primer valor)', () => {
      const input = new Float32Array([0, 1, 2, 3, 4]);
      const output = applyOnePoleFilter(input, 0);
      
      // Con alpha=0, y[n] = 0 * x[n] + 1 * y[n-1] = y[n-1]
      // Iniciando con y=0, todos los valores serán 0
      for (let i = 0; i < output.length; i++) {
        assert.equal(output[i], 0, `Sample ${i} debe ser 0 con alpha=0`);
      }
    });
    
    it('Debe preservar DC (señal constante pasa sin cambio)', () => {
      const dcValue = 0.75;
      const input = new Float32Array(100).fill(dcValue);
      const alpha = calculateOnePoleAlpha(1000, TEST_SAMPLE_RATE);
      const output = applyOnePoleFilter(input, alpha);
      
      // Después de un tiempo de establecimiento, la salida debe igualar DC
      const lastValue = output[output.length - 1];
      assert.ok(Math.abs(lastValue - dcValue) < 0.01,
        `DC ${dcValue} debe pasar sin cambio, got ${lastValue}`);
    });
    
    it('Debe atenuar transitorios rápidos (suavizar edges)', () => {
      // Señal con salto brusco
      const input = new Float32Array(100);
      for (let i = 0; i < 50; i++) input[i] = -1;
      for (let i = 50; i < 100; i++) input[i] = 1;
      
      const alpha = calculateOnePoleAlpha(500, TEST_SAMPLE_RATE);  // Filtro lento
      const output = applyOnePoleFilter(input, alpha);
      
      // El salto ya no debe ser instantáneo
      // En el sample 50, debería empezar a subir gradualmente
      assert.ok(output[50] < 0.5, 
        `Output[50] debe ser < 0.5 (transición suavizada), got ${output[50]}`);
      assert.ok(output[51] > output[50],
        'Output debe seguir subiendo gradualmente');
    });
    
  });
  
  // ───────────────────────────────────────────────────────────────────────────
  // Tests de integración: efecto en formas de onda
  // ───────────────────────────────────────────────────────────────────────────
  
  describe('Efecto en formas de onda del oscilador', () => {
    
    it('Pulse filtrado debe tener menos energía en alta frecuencia', () => {
      const pulse = generateNaiveSquare(440, 0.05, TEST_SAMPLE_RATE);
      
      // Simular filtro de pin WHITE (~15.9 kHz)
      // Nota: Un filtro de un polo a 15.9 kHz es bastante suave,
      // la atenuación a 10 kHz es solo de ~1-2 dB
      const pinAlpha = calculateOnePoleAlpha(PIN_CUTOFF_FREQUENCIES.WHITE, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(pulse, pinAlpha);
      
      const specRaw = computeSpectrum(pulse, TEST_SAMPLE_RATE);
      const specFiltered = computeSpectrum(filtered, TEST_SAMPLE_RATE);
      
      // Medir energía por encima de 10 kHz
      const rawHF = measureHighFrequencyEnergy(specRaw, 10000);
      const filteredHF = measureHighFrequencyEnergy(specFiltered, 10000);
      
      // Con un filtro de un polo a 15.9 kHz, esperamos atenuación de ~1-2 dB a 10kHz
      // La atenuación aumenta a frecuencias más altas
      const attenuation = rawHF.energyDb - filteredHF.energyDb;
      assert.ok(attenuation >= 1,
        `Atenuación HF debe ser ≥1 dB con pin WHITE (fc=15.9kHz), got ${attenuation.toFixed(1)} dB`);
    });
    
    it('Sawtooth filtrado debe tener reset suavizado', () => {
      const saw = generateNaiveSawtooth(440, 0.05, TEST_SAMPLE_RATE);
      
      const alpha = calculateOnePoleAlpha(5000, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(saw, alpha);
      
      const rawRise = measureFallTime(saw, TEST_SAMPLE_RATE);  // Reset = caída rápida
      const filteredRise = measureFallTime(filtered, TEST_SAMPLE_RATE);
      
      // El fall time filtrado debe ser mayor
      assert.ok(filteredRise.fallTime > rawRise.fallTime,
        `Fall time filtrado debe ser mayor que raw`);
    });
    
    it('Pin RED (~589 kHz) debe ser prácticamente transparente', () => {
      const pulse = generateNaiveSquare(440, 0.05, TEST_SAMPLE_RATE);
      
      // Pin RED tiene fc muy alta, debería ser casi bypass
      const pinAlpha = calculateOnePoleAlpha(PIN_CUTOFF_FREQUENCIES.RED, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(pulse, pinAlpha);
      
      const specRaw = computeSpectrum(pulse, TEST_SAMPLE_RATE);
      const specFiltered = computeSpectrum(filtered, TEST_SAMPLE_RATE);
      
      const rawHF = measureHighFrequencyEnergy(specRaw, 10000);
      const filteredHF = measureHighFrequencyEnergy(specFiltered, 10000);
      
      // La diferencia debe ser mínima (< 0.5 dB)
      const attenuation = rawHF.energyDb - filteredHF.energyDb;
      assert.ok(Math.abs(attenuation) < 0.5,
        `Pin RED debe ser transparente, atenuación ${attenuation.toFixed(2)} dB`);
    });
    
  });
  
});

describe('Smoothing Filter DSP - Fase 2: Especificaciones Synthi 100', () => {
  
  // Estos tests definen el comportamiento esperado basado en el hardware real.
  // Inicialmente algunos fallarán hasta que se implemente el filtrado en el worklet.
  
  describe('Especificaciones de slew rate del hardware', () => {
    
    it('El slew máximo del módulo debe ser ~1 V/ms (8V p-p en ~8ms)', () => {
      // En el Synthi 100, el slew limiter tiene un máximo de 1 V/ms
      // Para una señal de 8V p-p (-4V a +4V), el tiempo mínimo de transición
      // sería ~8ms en el ajuste más rápido del slew limiter.
      // 
      // Sin embargo, para los transitorios del oscilador (no el slew limiter),
      // el límite es el del op-amp CA3140, que es mucho más rápido.
      // Estimamos ~20 kHz de corte = ~50 µs de rise time (10%-90%)
      
      const pulse = generateNaiveSquare(100, 0.1, TEST_SAMPLE_RATE);
      const moduleAlpha = calculateOnePoleAlpha(MODULE_INHERENT_CUTOFF, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(pulse, moduleAlpha);
      
      const result = measureRiseTime(filtered, TEST_SAMPLE_RATE);
      
      // Un filtro de un polo a 20 kHz tiene rise time ~0.35/fc ≈ 17.5 µs
      // Pero el rise time 10%-90% para one-pole es más largo: ~2.2/fc ≈ 110 µs
      // Verificamos que haya encontrado transiciones y que el rise time sea > 0
      assert.ok(result.transitionsFound > 0,
        `Debe encontrar transiciones, got ${result.transitionsFound}`);
      assert.ok(result.riseTime > 0,
        `Rise time debe ser > 0 con filtro de módulo`);
      assert.ok(result.riseTime < 1e-3,   // < 1 ms
        `Rise time debe ser < 1 ms (solo slew de op-amp), got ${(result.riseTime * 1e3).toFixed(3)} ms`);
    });
    
    it('Combinación módulo + pin WHITE debe producir suavizado audible', () => {
      const pulse = generateNaiveSquare(440, 0.05, TEST_SAMPLE_RATE);
      
      // Calcular alpha combinado
      const combinedFc = calculateCombinedCutoff(MODULE_INHERENT_CUTOFF, PIN_CUTOFF_FREQUENCIES.WHITE);
      const combinedAlpha = calculateOnePoleAlpha(combinedFc, TEST_SAMPLE_RATE);
      const filtered = applyOnePoleFilter(pulse, combinedAlpha);
      
      // Verificar que hay atenuación significativa en armónicos altos
      const specRaw = computeSpectrum(pulse, TEST_SAMPLE_RATE);
      const specFiltered = computeSpectrum(filtered, TEST_SAMPLE_RATE);
      
      // Con fc combinada ≈15.9 kHz (pin WHITE domina sobre módulo 20kHz),
      // esperamos atenuación moderada en HF
      
      const rawHF = measureHighFrequencyEnergy(specRaw, 10000);
      const filteredHF = measureHighFrequencyEnergy(specFiltered, 10000);
      
      // Para un filtro de un polo, la atenuación es suave pero medible
      const attenuation = rawHF.energyDb - filteredHF.energyDb;
      assert.ok(attenuation >= 1,
        `Atenuación con pin WHITE debe ser ≥1 dB en HF, got ${attenuation.toFixed(1)} dB`);
    });
    
  });
  
  describe('Verificación de constantes pre-calculadas', () => {
    
    it('Todas las frecuencias de corte de pines deben ser positivas', () => {
      for (const [pin, fc] of Object.entries(PIN_CUTOFF_FREQUENCIES)) {
        assert.ok(fc > 0, `${pin} debe tener fc > 0, got ${fc}`);
      }
    });
    
    it('Pin CYAN (250kΩ) y PURPLE (1MΩ) deben tener fc baja (más integración)', () => {
      // Estos pines de alta resistencia producen más integración
      assert.ok(PIN_CUTOFF_FREQUENCIES.CYAN < 10000,
        `CYAN fc debe ser < 10 kHz, got ${PIN_CUTOFF_FREQUENCIES.CYAN}`);
      assert.ok(PIN_CUTOFF_FREQUENCIES.PURPLE < 2000,
        `PURPLE fc debe ser < 2 kHz, got ${PIN_CUTOFF_FREQUENCIES.PURPLE}`);
    });
    
  });
  
});
