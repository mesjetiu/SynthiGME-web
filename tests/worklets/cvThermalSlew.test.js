/**
 * @fileoverview Tests para cvThermalSlew.worklet.js
 * 
 * Verifica el comportamiento de la inercia térmica asimétrica que emula
 * el Synthi 100 (Datanomics/Cuenca 1982).
 * 
 * Comportamiento esperado según Manual Técnico:
 * - Saltos grandes de CV (>2kHz equivalente) producen "portamento" térmico
 * - El efecto es bidireccional (subir Y bajar frecuencia)
 * - Asimétrico: calentamiento (subida) más rápido que enfriamiento (bajada)
 * - Tiempo de estabilización: "unos pocos segundos"
 * 
 * Ejecutar con: npm test -- tests/worklets/cvThermalSlew.test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK GLOBAL ENV for AudioWorklet
// ─────────────────────────────────────────────────────────────────────────────
global.AudioWorkletProcessor = class AudioWorkletProcessor { 
  constructor() { 
    this.port = { onmessage: null }; 
  }
};
global.sampleRate = 44100;

let CVThermalSlewProcessor;

// Capturar la clase cuando se registra
global.registerProcessor = (name, cls) => {
  if (name === 'cv-thermal-slew') {
    CVThermalSlewProcessor = cls;
  }
};

// Importar el worklet
await import('../../src/assets/js/worklets/cvThermalSlew.worklet.js');

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de test
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simula el procesamiento de un bloque de audio.
 * @param {CVThermalSlewProcessor} processor - Instancia del procesador
 * @param {Float32Array} inputSamples - Muestras de entrada
 * @param {Object} params - Parámetros del procesador
 * @returns {Float32Array} - Muestras de salida
 */
function processBlock(processor, inputSamples, params = {}) {
  const blockSize = inputSamples.length;
  const output = new Float32Array(blockSize);
  
  const inputs = [[inputSamples]];
  const outputs = [[output]];
  
  const parameters = {
    riseRate: new Float32Array([params.riseRate ?? 0.15]),
    fallRate: new Float32Array([params.fallRate ?? 0.03]),
    threshold: new Float32Array([params.threshold ?? 0.5]),
    enabled: new Float32Array([params.enabled ?? 1])
  };
  
  processor.process(inputs, outputs, parameters);
  return output;
}

/**
 * Genera un salto de CV (step function).
 * @param {number} blockSize - Tamaño del bloque
 * @param {number} startValue - Valor inicial
 * @param {number} endValue - Valor final
 * @param {number} stepSample - Muestra donde ocurre el salto
 * @returns {Float32Array}
 */
function generateStep(blockSize, startValue, endValue, stepSample = 0) {
  const input = new Float32Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    input[i] = i < stepSample ? startValue : endValue;
  }
  return input;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('CVThermalSlewProcessor', () => {
  let processor;
  
  beforeEach(() => {
    processor = new CVThermalSlewProcessor({
      processorOptions: {
        riseTimeConstant: 0.15,   // 150ms
        fallTimeConstant: 0.5    // 500ms
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Bypass y casos básicos
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Bypass y casos básicos', () => {
    
    it('pasa señal sin modificar cuando está deshabilitado', () => {
      const input = new Float32Array([0, 0.5, 1.0, 1.5, 2.0]);
      const output = processBlock(processor, input, { enabled: 0 });
      
      for (let i = 0; i < input.length; i++) {
        assert.equal(output[i], input[i], `Muestra ${i} debe pasar sin cambio`);
      }
    });
    
    it('sigue señal instantáneamente cuando delta < threshold', () => {
      // Cambio pequeño: 0 → 0.3 (delta = 0.3 < threshold 0.5)
      const input = generateStep(128, 0, 0.3, 0);
      const output = processBlock(processor, input, { threshold: 0.5 });
      
      // Debe seguir instantáneamente
      assert.ok(
        Math.abs(output[127] - 0.3) < 0.01,
        `Cambio pequeño debe ser instantáneo: ${output[127]}`
      );
    });
    
    it('retorna ceros cuando no hay entrada', () => {
      const inputs = [[]];
      const outputs = [[new Float32Array(128)]];
      const parameters = {
        riseRate: new Float32Array([0.15]),
        fallRate: new Float32Array([0.03]),
        threshold: new Float32Array([0.5]),
        enabled: new Float32Array([1])
      };
      
      processor.process(inputs, outputs, parameters);
      
      for (let i = 0; i < 128; i++) {
        assert.equal(outputs[0][0][i], 0, `Muestra ${i} debe ser 0`);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Slew asimétrico (comportamiento térmico)
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Slew asimétrico (inercia térmica)', () => {
    
    it('aplica slew cuando delta > threshold (salto grande)', () => {
      // Salto grande: 0 → 2.0 (delta = 2.0 > threshold 0.5)
      const input = generateStep(128, 0, 2.0, 0);
      const output = processBlock(processor, input, { threshold: 0.5 });
      
      // La salida NO debe alcanzar el target inmediatamente
      assert.ok(
        output[0] < 2.0,
        `Primera muestra no debe alcanzar target: ${output[0]}`
      );
      
      // Debe estar acercándose al target
      assert.ok(
        output[127] > output[0],
        `Debe acercarse al target: inicio=${output[0]}, fin=${output[127]}`
      );
    });
    
    it('subida (calentamiento) es más rápida que bajada (enfriamiento)', () => {
      const blockSize = 1024;  // ~23ms a 44100Hz
      
      // Test subida: 0 → 2.0
      const inputUp = generateStep(blockSize, 0, 2.0, 0);
      const processorUp = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.15, fallTimeConstant: 0.5 }
      });
      const outputUp = processBlock(processorUp, inputUp, { threshold: 0.5 });
      const progressUp = outputUp[blockSize - 1] / 2.0;  // % del target
      
      // Test bajada: 2.0 → 0
      const inputDown = generateStep(blockSize, 2.0, 0, 0);
      const processorDown = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.15, fallTimeConstant: 0.5 }
      });
      // Inicializar el estado interno a 2.0
      processorDown.currentValue = 2.0;
      const outputDown = processBlock(processorDown, inputDown, { threshold: 0.5 });
      const progressDown = 1 - (outputDown[blockSize - 1] / 2.0);  // % del target (inverso)
      
      // La subida debe haber progresado MÁS que la bajada
      assert.ok(
        progressUp > progressDown,
        `Subida (${(progressUp * 100).toFixed(1)}%) debe ser más rápida que bajada (${(progressDown * 100).toFixed(1)}%)`
      );
    });
    
    it('el efecto es bidireccional (afecta subidas Y bajadas)', () => {
      const blockSize = 256;
      
      // Salto hacia arriba
      const processorUp = new CVThermalSlewProcessor();
      const inputUp = generateStep(blockSize, 0, 2.0, 0);
      const outputUp = processBlock(processorUp, inputUp, { threshold: 0.5 });
      
      // Salto hacia abajo
      const processorDown = new CVThermalSlewProcessor();
      processorDown.currentValue = 2.0;  // Empezar alto
      const inputDown = generateStep(blockSize, 2.0, 0, 0);
      const outputDown = processBlock(processorDown, inputDown, { threshold: 0.5 });
      
      // Ambos deben mostrar slew (no alcanzar target instantáneamente)
      assert.ok(
        outputUp[blockSize - 1] < 2.0,
        `Subida debe tener slew: final=${outputUp[blockSize - 1]} < 2.0`
      );
      assert.ok(
        outputDown[blockSize - 1] > 0,
        `Bajada debe tener slew: final=${outputDown[blockSize - 1]} > 0`
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Constantes de tiempo
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Constantes de tiempo', () => {
    
    it('riseTimeConstant controla velocidad de subida', () => {
      const blockSize = 4410;  // 100ms a 44100Hz
      
      // Procesador rápido (50ms)
      const processorFast = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.05, fallTimeConstant: 0.5 }
      });
      const inputUp = generateStep(blockSize, 0, 2.0, 0);
      const outputFast = processBlock(processorFast, inputUp, { 
        threshold: 0.5, riseRate: processorFast.computedRiseRate 
      });
      
      // Procesador lento (300ms)
      const processorSlow = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.3, fallTimeConstant: 0.5 }
      });
      const outputSlow = processBlock(processorSlow, inputUp, { 
        threshold: 0.5, riseRate: processorSlow.computedRiseRate 
      });
      
      // El rápido debe haber progresado más
      assert.ok(
        outputFast[blockSize - 1] > outputSlow[blockSize - 1],
        `Rápido (${outputFast[blockSize - 1].toFixed(3)}) > Lento (${outputSlow[blockSize - 1].toFixed(3)})`
      );
    });
    
    it('fallTimeConstant controla velocidad de bajada', () => {
      const blockSize = 4410;  // 100ms
      
      // Procesador con enfriamiento rápido (100ms)
      const processorFast = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.15, fallTimeConstant: 0.1 }
      });
      processorFast.currentValue = 2.0;
      const inputDown = generateStep(blockSize, 2.0, 0, 0);
      const outputFast = processBlock(processorFast, inputDown, {
        threshold: 0.5, fallRate: processorFast.computedFallRate
      });
      
      // Procesador con enfriamiento lento (1s)
      const processorSlow = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.15, fallTimeConstant: 1.0 }
      });
      processorSlow.currentValue = 2.0;
      const outputSlow = processBlock(processorSlow, inputDown, {
        threshold: 0.5, fallRate: processorSlow.computedFallRate
      });
      
      // El rápido debe haber bajado más (valor más cercano a 0)
      assert.ok(
        outputFast[blockSize - 1] < outputSlow[blockSize - 1],
        `Rápido (${outputFast[blockSize - 1].toFixed(3)}) < Lento (${outputSlow[blockSize - 1].toFixed(3)})`
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Umbral de activación
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Umbral de activación', () => {
    
    it('threshold=0 activa slew para cualquier cambio', () => {
      const input = generateStep(128, 0, 0.1, 0);  // Cambio muy pequeño
      const output = processBlock(processor, input, { threshold: 0 });
      
      // Con threshold=0, incluso cambios pequeños tienen slew
      assert.ok(
        output[0] < 0.1,
        `Con threshold=0, debe haber slew: ${output[0]}`
      );
    });
    
    it('threshold alto permite cambios moderados sin slew', () => {
      const input = generateStep(128, 0, 1.0, 0);  // Cambio de 1 octava
      const output = processBlock(processor, input, { threshold: 1.5 });
      
      // Con threshold=1.5, un cambio de 1.0 es instantáneo
      assert.ok(
        Math.abs(output[127] - 1.0) < 0.01,
        `Con threshold=1.5, cambio de 1.0 debe ser instantáneo: ${output[127]}`
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Convergencia
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Convergencia al target', () => {
    
    it('converge al valor target después de suficientes muestras', () => {
      const processor = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.01, fallTimeConstant: 0.01 }  // Rápido
      });
      
      // Procesar múltiples bloques
      let lastValue = 0;
      const target = 2.0;
      const input = generateStep(128, 0, target, 0);
      
      for (let i = 0; i < 50; i++) {  // ~145ms
        const output = processBlock(processor, input, { threshold: 0.5 });
        lastValue = output[127];
      }
      
      // Debe haber convergido muy cerca del target
      assert.ok(
        Math.abs(lastValue - target) < 0.01,
        `Debe converger a ${target}: valor final = ${lastValue}`
      );
    });
    
    it('señal constante no cambia después de estabilizarse', () => {
      // Usar constantes de tiempo MUY cortas para que estabilice en pocas muestras
      // Con τ = 0.0001s y fs = 44100: rate = 1 - exp(-1/(0.0001*44100)) = 1 - exp(-0.227) ≈ 0.2
      // Después de 128 muestras: convergencia de ~(1-0.2)^128 ≈ 10^-12 (prácticamente completo)
      const processor = new CVThermalSlewProcessor({
        processorOptions: { riseTimeConstant: 0.0001, fallTimeConstant: 0.0001 }
      });
      const constantInput = new Float32Array(128).fill(1.5);
      
      // Primer bloque: puede haber transición desde 0
      processBlock(processor, constantInput, { threshold: 0 });
      
      // Segundo bloque: ya estabilizado
      const output = processBlock(processor, constantInput, { threshold: 0 });
      
      // Todas las muestras deben ser muy cercanas al input
      for (let i = 0; i < 128; i++) {
        assert.ok(
          Math.abs(output[i] - 1.5) < 0.01,
          `Muestra ${i} debe estar estabilizada: ${output[i]}`
        );
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // Escenario Synthi 100: salto de 2kHz
  // ─────────────────────────────────────────────────────────────────────────
  
  describe('Escenario Synthi 100: salto de 2kHz', () => {
    
    it('salto equivalente a >2kHz activa el efecto de portamento', () => {
      // En el sistema Synthi 100:
      // - 1V = 1 octava
      // - Salto de 250Hz → 2250Hz ≈ 3.17 octavas ≈ 3.17V
      // - En unidades digitales (÷4): ~0.79
      // Con threshold=0.5, un salto de 0.79 activa el slew
      
      const cvJump = 0.8;  // ~3.2 octavas de salto
      const input = generateStep(256, 0, cvJump, 0);
      const output = processBlock(processor, input, { threshold: 0.5 });
      
      // Debe haber slew visible
      const immediateProgress = output[0] / cvJump;
      assert.ok(
        immediateProgress < 0.5,
        `Salto grande debe tener slew: progreso inmediato = ${(immediateProgress * 100).toFixed(1)}%`
      );
    });
    
    it('salto pequeño (~1 semitono) es instantáneo', () => {
      // 1 semitono = 1/12 octava ≈ 0.083V
      // En unidades digitales: ~0.02
      
      const cvJump = 0.02;
      const input = generateStep(128, 0, cvJump, 0);
      const output = processBlock(processor, input, { threshold: 0.5 });
      
      // Debe ser instantáneo (muy cercano al target)
      assert.ok(
        Math.abs(output[127] - cvJump) < 0.001,
        `Salto pequeño debe ser instantáneo: ${output[127]} vs ${cvJump}`
      );
    });
  });
});
