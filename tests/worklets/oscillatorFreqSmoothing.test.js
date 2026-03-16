/**
 * Tests para el suavizado per-sample (one-pole IIR) de TODOS los AudioParam
 * en synthOscillator.worklet.js
 * 
 * Verifica que:
 * 1. Todos los _smoothed* se inicializan correctamente
 * 2. _smoothAlpha se calcula con cutoff ~15Hz
 * 3. El one-pole produce convergencia exponencial (sin esquinas)
 * 4. Funciona en ambos modos: single y multi
 * 5. Gain, pulseWidth, symmetry, sineLevel, sawLevel, triLevel, pulseLevel se suavizan
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// MOCK GLOBAL ENV for AudioWorklet
if (!global.AudioWorkletProcessor) {
  global.AudioWorkletProcessor = class AudioWorkletProcessor { 
    constructor() { 
      this.port = { onmessage: null, postMessage() {} }; 
    }
  };
}
if (!global.sampleRate) {
  global.sampleRate = 48000;
}

let SynthOscillatorProcessor;

if (!global.registerProcessor) {
  global.registerProcessor = (name, cls) => {
    if (name === 'synth-oscillator') {
      SynthOscillatorProcessor = cls;
    }
  };
  await import('../../src/assets/js/worklets/synthOscillator.worklet.js');
} else {
  const origRegister = global.registerProcessor;
  global.registerProcessor = (name, cls) => {
    if (name === 'synth-oscillator') SynthOscillatorProcessor = cls;
    origRegister(name, cls);
  };
  await import('../../src/assets/js/worklets/synthOscillator.worklet.js');
  global.registerProcessor = origRegister;
}

/**
 * Helper: Procesa N bloques en modo single, devolviendo _smoothedFreq tras cada bloque.
 */
function processBlocks(processor, numBlocks, freqParamValue, blockSize = 128) {
  const results = [];
  for (let b = 0; b < numBlocks; b++) {
    const output = [new Float32Array(blockSize)];
    const parameters = {
      frequency: new Float32Array([freqParamValue]),
      detune: new Float32Array([0]),
      pulseWidth: new Float32Array([0.5]),
      symmetry: new Float32Array([0.5]),
      gain: new Float32Array([1.0])
    };
    processor.processSingle([output], [[]], parameters, blockSize);
    results.push(processor._smoothedFreq);
  }
  return results;
}

/**
 * Helper: Procesa N bloques en modo multi, devolviendo _smoothedFreq tras cada bloque.
 */
function processBlocksMulti(processor, numBlocks, freqParamValue, blockSize = 128) {
  const results = [];
  for (let b = 0; b < numBlocks; b++) {
    const output0 = [new Float32Array(blockSize)];
    const output1 = [new Float32Array(blockSize)];
    const parameters = {
      frequency: new Float32Array([freqParamValue]),
      detune: new Float32Array([0]),
      pulseWidth: new Float32Array([0.5]),
      symmetry: new Float32Array([0.5]),
      sineLevel: new Float32Array([1]),
      sawLevel: new Float32Array([0]),
      triLevel: new Float32Array([0]),
      pulseLevel: new Float32Array([0])
    };
    processor.processMulti([output0, output1], [[]], parameters, blockSize);
    results.push(processor._smoothedFreq);
  }
  return results;
}

// =============================================================================
// TESTS DE SUAVIZADO DE FRECUENCIA ONE-POLE IIR
// =============================================================================

describe('Frequency One-Pole IIR Smoothing', () => {
  
  describe('Inicialización', () => {
    
    it('_smoothedFreq se inicializa con la frecuencia del processorOptions', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 880 }
      });
      assert.equal(proc._smoothedFreq, 880);
    });
    
    it('_smoothedFreq se inicializa en 440 por defecto', () => {
      const proc = new SynthOscillatorProcessor();
      assert.equal(proc._smoothedFreq, 440);
    });
    
    it('_smoothAlpha existe y es un número positivo pequeño', () => {
      const proc = new SynthOscillatorProcessor();
      assert.ok(typeof proc._smoothAlpha === 'number');
      assert.ok(proc._smoothAlpha > 0, 'alpha debe ser positivo');
      assert.ok(proc._smoothAlpha < 0.01, 'alpha debe ser pequeño (~0.00065 para 5Hz)');
    });
    
    it('_smoothAlpha corresponde a un cutoff de ~5Hz', () => {
      const proc = new SynthOscillatorProcessor();
      const expected = 1 - Math.exp(-2 * Math.PI * 5 / sampleRate);
      assert.ok(Math.abs(proc._smoothAlpha - expected) < 1e-10);
    });
    
    it('Todos los _smoothed* de nivel se inicializan en sus defaults', () => {
      const proc = new SynthOscillatorProcessor();
      assert.equal(proc._smoothedGain, 1.0);
      assert.equal(proc._smoothedPulseWidth, 0.5);
      assert.equal(proc._smoothedSymmetry, 0.5);
      assert.equal(proc._smoothedSineLevel, 0);
      assert.equal(proc._smoothedSawLevel, 0);
      assert.equal(proc._smoothedTriLevel, 0);
      assert.equal(proc._smoothedPulseLevel, 0);
    });
  });
  
  describe('Convergencia exponencial (modo single)', () => {
    
    it('Con frecuencia constante, _smoothedFreq converge al target', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, waveform: 'sine' }
      });
      
      // Ya estabilizado en 440 → procesar con 440 → no cambia
      const freqs = processBlocks(proc, 3, 440);
      assert.ok(Math.abs(freqs[2] - 440) < 0.01,
        `Debe mantenerse en 440, got ${freqs[2].toFixed(4)}`);
    });
    
    it('Salto de frecuencia: _smoothedFreq converge exponencialmente', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, waveform: 'sine' }
      });
      
      // Tras 1 bloque a 880Hz: convergencia parcial (~64% con alpha~0.008)
      const freqs = processBlocks(proc, 1, 880);
      assert.ok(freqs[0] > 440, 'Debe avanzar desde 440');
      assert.ok(freqs[0] < 880, 'No debe saltar instantáneamente a 880');
    });
    
    it('Convergencia es monótonamente creciente para salto ascendente', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 200, waveform: 'sine' }
      });
      
      const freqs = processBlocks(proc, 10, 800);
      for (let i = 1; i < freqs.length; i++) {
        assert.ok(freqs[i] > freqs[i - 1],
          `Bloque ${i + 1} (${freqs[i].toFixed(2)}) debe ser > bloque ${i} (${freqs[i - 1].toFixed(2)})`);
      }
    });
    
    it('Convergencia es monótonamente decreciente para salto descendente', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 800, waveform: 'sine' }
      });
      
      const freqs = processBlocks(proc, 10, 200);
      for (let i = 1; i < freqs.length; i++) {
        assert.ok(freqs[i] < freqs[i - 1],
          `Bloque ${i + 1} (${freqs[i].toFixed(2)}) debe ser < bloque ${i} (${freqs[i - 1].toFixed(2)})`);
      }
    });
    
    it('Full convergence: tras muchos bloques, _smoothedFreq ≈ target', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, waveform: 'sine' }
      });
      
      const freqs = processBlocks(proc, 200, 880);
      const last = freqs[freqs.length - 1];
      assert.ok(Math.abs(last - 880) < 0.1,
        `Tras 200 bloques: ${last.toFixed(4)} ≈ 880`);
    });
  });
  
  describe('Output suavizado (modo single)', () => {
    
    it('Cambio de frecuencia produce output diferente al salto instantáneo', () => {
      const procSmooth = new SynthOscillatorProcessor({
        processorOptions: { frequency: 200, waveform: 'sawtooth' }
      });
      const procStep = new SynthOscillatorProcessor({
        processorOptions: { frequency: 800, waveform: 'sawtooth' }
      });
      procSmooth.moduleSlewEnabled = false;
      procStep.moduleSlewEnabled = false;
      
      const blockSize = 128;
      
      const outputSmooth = [new Float32Array(blockSize)];
      procSmooth.processSingle([outputSmooth], [[]], {
        frequency: new Float32Array([800]),
        detune: new Float32Array([0]),
        pulseWidth: new Float32Array([0.5]),
        symmetry: new Float32Array([0.5]),
        gain: new Float32Array([1.0])
      }, blockSize);
      
      const outputStep = [new Float32Array(blockSize)];
      procStep.processSingle([outputStep], [[]], {
        frequency: new Float32Array([800]),
        detune: new Float32Array([0]),
        pulseWidth: new Float32Array([0.5]),
        symmetry: new Float32Array([0.5]),
        gain: new Float32Array([1.0])
      }, blockSize);
      
      let diffSum = 0;
      for (let i = 0; i < blockSize; i++) {
        diffSum += Math.abs(outputSmooth[0][i] - outputStep[0][i]);
      }
      assert.ok(diffSum > 0.1,
        `Smoothed vs step outputs must differ (diffSum=${diffSum.toFixed(4)})`);
    });
  });
  
  describe('Modo multi', () => {
    
    it('_smoothedFreq converge exponencialmente en modo multi', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 200, mode: 'multi' }
      });
      
      const freqs = processBlocksMulti(proc, 5, 800);
      
      // Convergencia monótonamente creciente
      for (let i = 1; i < freqs.length; i++) {
        assert.ok(freqs[i] > freqs[i - 1],
          `Multi bloque ${i + 1} (${freqs[i].toFixed(2)}) debe ser > bloque ${i} (${freqs[i - 1].toFixed(2)})`);
      }
      
      // No ha convergido del todo en 5 bloques pero avanzó significativamente
      assert.ok(freqs[4] > 200 && freqs[4] < 800,
        `Multi: ${freqs[4].toFixed(1)} entre 200 y 800`);
    });
    
    it('Modo multi produce audio con sine level=1', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, mode: 'multi' }
      });
      
      const blockSize = 128;
      const output0 = [new Float32Array(blockSize)];
      const output1 = [new Float32Array(blockSize)];
      
      proc.processMulti([output0, output1], [[]], {
        frequency: new Float32Array([440]),
        detune: new Float32Array([0]),
        pulseWidth: new Float32Array([0.5]),
        symmetry: new Float32Array([0.5]),
        sineLevel: new Float32Array([1]),
        sawLevel: new Float32Array([0]),
        triLevel: new Float32Array([0]),
        pulseLevel: new Float32Array([0])
      }, blockSize);
      
      let hasNonZero = false;
      for (let i = 0; i < blockSize; i++) {
        if (Math.abs(output0[0][i]) > 0.01) {
          hasNonZero = true;
          break;
        }
      }
      assert.ok(hasNonZero, 'Output debe contener audio');
    });
  });
  
  describe('Derivada continua (sin esquinas)', () => {
    
    it('One-pole no tiene salto de pendiente en fronteras de bloque', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, waveform: 'sine' }
      });
      
      // Procesar 3 bloques: estable → salto → continuación
      processBlocks(proc, 1, 440); // estabilizar
      
      // Bloque 2: salto a 880
      const smoothBefore = proc._smoothedFreq;
      processBlocks(proc, 1, 880);
      const smoothAfter1 = proc._smoothedFreq;
      
      // Bloque 3: sigue a 880 → debe seguir convergiendo, no saltar
      processBlocks(proc, 1, 880);
      const smoothAfter2 = proc._smoothedFreq;
      
      // La velocidad debe ir DECRECIENDO (exponencial, no lineal)
      const speed1 = smoothAfter1 - smoothBefore;
      const speed2 = smoothAfter2 - smoothAfter1;
      assert.ok(speed2 < speed1,
        `Velocidad decreciente: bloque2=${speed1.toFixed(2)}, bloque3=${speed2.toFixed(2)}`);
    });
  });

  describe('Suavizado de gain (modo single)', () => {
    
    it('_smoothedGain converge exponencialmente al cambiar gain', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, waveform: 'sine' }
      });
      // Estabilizar gain en 1.0
      processBlocks(proc, 3, 440);
      assert.ok(Math.abs(proc._smoothedGain - 1.0) < 0.01);
      
      // Cambiar gain a 0.0
      const blockSize = 128;
      const gains = [];
      for (let b = 0; b < 10; b++) {
        const output = [new Float32Array(blockSize)];
        proc.processSingle([output], [[]], {
          frequency: new Float32Array([440]),
          detune: new Float32Array([0]),
          pulseWidth: new Float32Array([0.5]),
          symmetry: new Float32Array([0.5]),
          gain: new Float32Array([0.0])
        }, blockSize);
        gains.push(proc._smoothedGain);
      }
      // Monótonamente decreciente
      for (let i = 1; i < gains.length; i++) {
        assert.ok(gains[i] < gains[i - 1],
          `Gain bloque ${i + 1} (${gains[i].toFixed(4)}) debe ser < bloque ${i} (${gains[i - 1].toFixed(4)})`);
      }
    });
  });

  describe('Suavizado de niveles (modo multi)', () => {
    
    it('_smoothedSineLevel converge exponencialmente', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, mode: 'multi' }
      });
      // sineLevel empieza en 0, cambiar a 1
      const blockSize = 128;
      const levels = [];
      for (let b = 0; b < 10; b++) {
        const output0 = [new Float32Array(blockSize)];
        const output1 = [new Float32Array(blockSize)];
        proc.processMulti([output0, output1], [[]], {
          frequency: new Float32Array([440]),
          detune: new Float32Array([0]),
          pulseWidth: new Float32Array([0.5]),
          symmetry: new Float32Array([0.5]),
          sineLevel: new Float32Array([1]),
          sawLevel: new Float32Array([0]),
          triLevel: new Float32Array([0]),
          pulseLevel: new Float32Array([0])
        }, blockSize);
        levels.push(proc._smoothedSineLevel);
      }
      // Monótonamente creciente hacia 1
      for (let i = 1; i < levels.length; i++) {
        assert.ok(levels[i] > levels[i - 1],
          `SineLevel bloque ${i + 1} (${levels[i].toFixed(4)}) debe ser > bloque ${i}`);
      }
      assert.ok(levels[0] > 0 && levels[0] < 1, 'No salto instantáneo');
    });
    
    it('_smoothedPulseWidth converge exponencialmente en modo multi', () => {
      const proc = new SynthOscillatorProcessor({
        processorOptions: { frequency: 440, mode: 'multi' }
      });
      // pulseWidth empieza en 0.5, cambiar a 0.9
      const blockSize = 128;
      const widths = [];
      for (let b = 0; b < 10; b++) {
        const output0 = [new Float32Array(blockSize)];
        const output1 = [new Float32Array(blockSize)];
        proc.processMulti([output0, output1], [[]], {
          frequency: new Float32Array([440]),
          detune: new Float32Array([0]),
          pulseWidth: new Float32Array([0.9]),
          symmetry: new Float32Array([0.5]),
          sineLevel: new Float32Array([0]),
          sawLevel: new Float32Array([0]),
          triLevel: new Float32Array([0]),
          pulseLevel: new Float32Array([1])
        }, blockSize);
        widths.push(proc._smoothedPulseWidth);
      }
      for (let i = 1; i < widths.length; i++) {
        assert.ok(widths[i] > widths[i - 1],
          `PulseWidth bloque ${i + 1} (${widths[i].toFixed(4)}) debe ser > bloque ${i}`);
      }
      assert.ok(widths[0] > 0.5 && widths[0] < 0.9, 'No salto instantáneo');
    });
  });
});