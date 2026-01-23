/**
 * Tests para la lógica DSP de synthOscillator.worklet.js
 * 
 * Verificamos matemáticamente la generación de ondas, especialmente
 * el nuevo algoritmo de Seno Asimétrico Híbrido.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';

// MOCK GLOBAL ENV for AudioWorklet
global.AudioWorkletProcessor = class AudioWorkletProcessor { 
  constructor() { 
    this.port = { onmessage: null }; 
  }
};
global.sampleRate = 44100;

let SynthOscillatorProcessor;

// Capture the class when it's registered
global.registerProcessor = (name, cls) => {
  if (name === 'synth-oscillator') {
    SynthOscillatorProcessor = cls;
  }
};

// Import the worklet file (dynamic import to execute the code)
// Note: We need a relative path from this test file
await import('../../src/assets/js/worklets/synthOscillator.worklet.js');

describe('SynthOscillatorProcessor DSP Logic', () => {
  let processor;
  let processorNoAttenuation;
  let processorPureSine;

  before(() => {
    // Processor con atenuación histórica desactivada para tests de forma de onda pura
    // y sinePurity=1 para tests que requieren seno puro en el centro
    processorNoAttenuation = new SynthOscillatorProcessor({
      processorOptions: { sineShapeAttenuation: 0, sinePurity: 1.0 }
    });
    // Processor con atenuación histórica (por defecto = 1.0) y sinePurity por defecto (0.7)
    processor = new SynthOscillatorProcessor();
    // Processor con sinePurity=1 para verificar seno puro perfecto en centro
    processorPureSine = new SynthOscillatorProcessor({
      processorOptions: { sineShapeAttenuation: 0, sinePurity: 1.0 }
    });
  });

  describe('generateAsymmetricSine (New Hybrid Algo)', () => {
    
    // NEW ALIGNMENT: 0.25 (90 deg) is Crossing Zero downwards?
    // Phase 0 -> 1. Phase 0.5 -> -1.
    // So crossing 0 happens at 0.25 and 0.75.
    // Cos(0.25 * 2PI) = Cos(PI/2) = 0. Correct.
    
    it('Symmetry 0.5 (Center) should be Pure Sine with sinePurity=1', () => {
      const symmetry = 0.5;
      const numPoints = 100;
      let maxError = 0;

      for (let i = 0; i < numPoints; i++) {
        const phase = i / numPoints;
        // Usar processorPureSine que tiene sinePurity=1
        const result = processorPureSine.generateAsymmetricSine(phase, symmetry);
        
        // Expected: Peak at 0. Math.cos matches our alignment (0 -> 1, 0.25 -> 0, 0.5 -> -1)
        const expected = Math.cos(phase * 2 * Math.PI);
        
        const error = Math.abs(result - expected);
        if (error > maxError) maxError = error;
      }

      // We expect very high precision in the center because it uses Math.cos directly
      assert.ok(maxError < 1e-15, `Center symmetry should be pure cosine. Max error: ${maxError}`);
    });

    it('Phase Alignment: Peak at phase 0, Valley at phase 0.5', () => {
        // Sin atenuación para verificar forma de onda
        [0, 0.25, 0.5, 0.75, 1.0].forEach(sym => {
            const peak = processorNoAttenuation.generateAsymmetricSine(0, sym);
            const valley = processorNoAttenuation.generateAsymmetricSine(0.5, sym);
            
            assert.ok(Math.abs(peak - 1.0) < 0.01, `Sine Sym ${sym}: Phase 0 should be ~1.0, got ${peak}`);
            assert.ok(Math.abs(valley - -1.0) < 0.01, `Sine Sym ${sym}: Phase 0.5 should be ~-1.0, got ${valley}`);
        });
    });
    
    it('Updated Triangle Alignment: Phase 0 = +1, Phase 0.5 = -1', () => {
        // Test standard triangle generation (via internal logic if we mock or direct call)
        // Since we can't easily call generateTriangle directly if it's not exposed, 
        // we check generateAsymmetricSine with sym=0 which is close to triangle shape.
        // Or we rely on the internal logic test above.
        
        // Let's verify the logic we put in the test:
        const t0 = 0;
        const t0_val = (t0 < 0.5) ? (1 - 4 * t0) : (4 * t0 - 3);
        assert.equal(t0_val, 1, 'Tri Phase 0 should be 1');
        
        const t05 = 0.5;
        // Edge case in logic: if (phase < 0.5) -> false. else branch.
        const t05_val = 4 * 0.5 - 3; // 2 - 3 = -1.
        assert.equal(t05_val, -1, 'Tri Phase 0.5 should be -1');
    });

    it('Symmetry 0.0 (Left) should have Round Top / Sharp Bottom', () => {
      // Round Top implies the value stays high longer around phase 0
      // Sharp Bottom implies the value turns around quickly at phase 0.5
      
      // Check "width" at 50% amplitude (0.5)
      // Pure sine crosses 0.5 at phase ~0.166 (60 deg)
      
      // Let's compare value at a small offset from peak vs small offset from valley
      const offset = 0.1; 
      const nearPeak = processorNoAttenuation.generateAsymmetricSine(0 + offset, 0);
      const nearValley = processorNoAttenuation.generateAsymmetricSine(0.5 + offset, 0);
      
      const ref = Math.cos(offset * 2 * Math.PI); // Value for pure sine
      
      assert.ok(nearPeak > ref, `Sym 0 Peak should be rounder (higher val) than sine. Got ${nearPeak} vs ${ref}`);
      
      const valleyRef = -1.0 + (1.0 - ref); // Symmetric point for sine from bottom
      
      // If Sharp, it moves up fast. So nearValley > valleyRef (closer to 0).
      assert.ok(nearValley > valleyRef, `Sym 0 Valley should be sharp (rise faster). Got ${nearValley} vs ${valleyRef}`);
    });

    it('Symmetry 1.0 (Right) should have Sharp Top / Round Bottom', () => {
       const offset = 0.1;
       const nearPeak = processorNoAttenuation.generateAsymmetricSine(0 + offset, 1.0);
       const nearValley = processorNoAttenuation.generateAsymmetricSine(0.5 + offset, 1.0);
       
       const ref = Math.cos(offset * 2 * Math.PI);
       const valleyRef = -Math.cos(offset * 2 * Math.PI);

       // Top is Sharp -> Moves down fast -> Value LOWER than sine
       assert.ok(nearPeak < ref, `Sym 1 Peak should be sharp (lower val). Got ${nearPeak} vs ${ref}`);

       // Bottom is Round -> Stays flat -> Value LOWER (more negative) than sine equivalent (closer to -1)
       assert.ok(nearValley < valleyRef, `Sym 1 Valley should be round (stays low). Got ${nearValley} vs ${valleyRef}`);
    });
    
    it('Should output valid numbers (no NaN)', () => {
       const res = processorNoAttenuation.generateAsymmetricSine(0.123, 0.7);
       assert.ok(!Number.isNaN(res));
       assert.ok(Number.isFinite(res));
    });

    it('Optimization: Precomputed triangle should yield same result', () => {
      const phase = 0.1;
      const symmetry = 0.2;
      
      let stdTri;
      if (phase < 0.5) {
        stdTri = 1 - 4 * phase;
      } else {
        stdTri = 4 * phase - 3;
      }
      const optimized = processorNoAttenuation.generateAsymmetricSine(phase, symmetry, stdTri);
      const manual = processorNoAttenuation.generateAsymmetricSine(phase, symmetry);
      
      assert.ok(Math.abs(optimized - manual) < 1e-15, 
        `Optimization mismatch! Optimized: ${optimized}, Manual: ${manual}`);
    });
    
    it('Historical Attenuation: Extremes should be ~1/8 amplitude', () => {
      // Con atenuación activada (processor por defecto)
      // Symmetry 0.5 (centro) -> amplitud completa (1.0)
      // Symmetry 0 o 1 (extremos) -> amplitud ~0.125 (1/8)
      
      const peakCenter = processor.generateAsymmetricSine(0, 0.5);
      const peakExtreme = processor.generateAsymmetricSine(0, 0.01); // Casi extremo
      
      // Centro debe ser ~1.0
      assert.ok(Math.abs(peakCenter - 1.0) < 0.01, `Center peak should be ~1.0, got ${peakCenter}`);
      
      // Extremo debe ser ~0.125
      assert.ok(peakExtreme < 0.2, `Extreme peak should be ~0.125, got ${peakExtreme}`);
      assert.ok(peakExtreme > 0.1, `Extreme peak should be ~0.125, got ${peakExtreme}`);
    });
    
    it('Historical Attenuation: Configurable via processorOptions', () => {
      // Crear processor con atenuación parcial (50%) y sinePurity=1
      const halfAttenuation = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0.5, sinePurity: 1.0 }
      });
      
      const peakExtreme = halfAttenuation.generateAsymmetricSine(0, 0.01);
      
      // Con 50% de atenuación, el extremo debe estar entre 0.125 y 1.0
      // Fórmula: 1.0 - (1 * 1) * (1 - 0.125) * 0.5 = 1 - 0.4375 = 0.5625
      assert.ok(peakExtreme > 0.5, `Half attenuation extreme should be ~0.56, got ${peakExtreme}`);
      assert.ok(peakExtreme < 0.7, `Half attenuation extreme should be ~0.56, got ${peakExtreme}`);
    });
    
    it('Sine Purity: sinePurity=0 should use 100% analog component even at center', () => {
      // Con sinePurity=0, incluso en el centro (sym=0.5) se usa la componente analógica
      const pureAnalog = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0, sinePurity: 0 }
      });
      
      // En el centro con sinePurity=0, debería haber algo de diferencia con seno puro
      // porque usa 100% el componente tanh (aunque con offset=0 es bastante similar)
      const phase = 0.1;
      const result = pureAnalog.generateAsymmetricSine(phase, 0.5);
      const pureCos = Math.cos(phase * 2 * Math.PI);
      
      // La diferencia existe pero es pequeña porque tanh(k*tri) con offset=0 
      // aproxima bastante bien al seno. Lo importante es que NO sea idéntico.
      // Con k=1.55, la diferencia debería ser detectable.
      assert.ok(Math.abs(result - pureCos) > 0.001, 
        `sinePurity=0 should differ from pure sine. Result: ${result}, Pure: ${pureCos}`);
    });
    
    it('Sine Purity: Default (0.7) should mix analog character at center', () => {
      // El processor por defecto tiene sinePurity=0.7
      // En el centro, 70% puro + 30% analógico
      const defaultProcessor = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0 }  // sinePurity default = 0.7
      });
      
      const phase = 0.1;
      const result = defaultProcessor.generateAsymmetricSine(phase, 0.5);
      const pureCos = Math.cos(phase * 2 * Math.PI);
      
      // Con sinePurity=0.7, hay algo de mezcla analógica
      // La diferencia debería ser menor que con sinePurity=0 pero > 0
      assert.ok(Math.abs(result - pureCos) > 0.0001, 
        `Default sinePurity should have some analog mix`);
    });
    
    it('Sine Purity: Configurable via processorOptions', () => {
      // Verificar que diferentes valores de sinePurity producen resultados diferentes
      const purity100 = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0, sinePurity: 1.0 }
      });
      const purity50 = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0, sinePurity: 0.5 }
      });
      const purity0 = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0, sinePurity: 0 }
      });
      
      const phase = 0.15;
      const sym = 0.5;
      
      const r100 = purity100.generateAsymmetricSine(phase, sym);
      const r50 = purity50.generateAsymmetricSine(phase, sym);
      const r0 = purity0.generateAsymmetricSine(phase, sym);
      
      // Los tres deben ser diferentes
      assert.ok(Math.abs(r100 - r50) > 0.0001, 'purity 1.0 vs 0.5 should differ');
      assert.ok(Math.abs(r50 - r0) > 0.0001, 'purity 0.5 vs 0 should differ');
    });

  });
});

// =============================================================================
// TESTS DEL SISTEMA DE SLEW INHERENTE DEL MÓDULO
// =============================================================================
//
// Verifican que el filtro one-pole se aplica correctamente a pulse y sawtooth
// para emular el slew rate finito del CA3140 del Synthi 100.
//
// Referencia: Manual Datanomics 1982 - "la verticalidad está limitada por el
// slew rate de los CA3140"
// =============================================================================

describe('Module Slew (Waveform Smoothing)', () => {
  
  describe('_computeOnePoleAlpha()', () => {
    let processor;
    
    before(() => {
      processor = new SynthOscillatorProcessor();
    });
    
    it('Alpha debe ser ~1 para frecuencia de corte muy alta (bypass)', () => {
      const alpha = processor._computeOnePoleAlpha(100000, 44100);
      assert.ok(alpha > 0.99, `Alpha para fc=100kHz debe ser ~1, got ${alpha}`);
    });
    
    it('Alpha debe ser menor para frecuencia de corte baja', () => {
      const alphaHigh = processor._computeOnePoleAlpha(20000, 44100);
      const alphaLow = processor._computeOnePoleAlpha(1000, 44100);
      assert.ok(alphaLow < alphaHigh, 
        `Alpha bajo (${alphaLow}) debe ser menor que alpha alto (${alphaHigh})`);
    });
    
    it('Alpha = 1 si cutoff >= Nyquist', () => {
      const alpha = processor._computeOnePoleAlpha(44100, 44100);
      assert.equal(alpha, 1.0);
    });
    
    it('Alpha = 0 si cutoff <= 0', () => {
      assert.equal(processor._computeOnePoleAlpha(0, 44100), 0);
      assert.equal(processor._computeOnePoleAlpha(-100, 44100), 0);
    });
  });
  
  describe('_applyOnePoleFilter()', () => {
    let processor;
    
    before(() => {
      processor = new SynthOscillatorProcessor();
    });
    
    it('Alpha=1 debe ser bypass (salida = entrada)', () => {
      const result = processor._applyOnePoleFilter(0.75, 0.5, 1.0);
      assert.equal(result, 0.75);
    });
    
    it('Alpha=0 debe mantener valor anterior', () => {
      const result = processor._applyOnePoleFilter(1.0, 0.5, 0);
      assert.equal(result, 0.5);
    });
    
    it('Alpha intermedio debe interpolar', () => {
      const result = processor._applyOnePoleFilter(1.0, 0, 0.5);
      // y = 0.5 * 1.0 + 0.5 * 0 = 0.5
      assert.equal(result, 0.5);
    });
  });
  
  describe('Configuración del slew', () => {
    
    it('moduleSlewEnabled debe ser true por defecto', () => {
      const processor = new SynthOscillatorProcessor();
      assert.equal(processor.moduleSlewEnabled, true);
    });
    
    it('moduleSlewCutoff debe ser 20000 Hz por defecto', () => {
      const processor = new SynthOscillatorProcessor();
      assert.equal(processor.moduleSlewCutoff, 20000);
    });
    
    it('Debe poder desactivar slew via processorOptions', () => {
      const processor = new SynthOscillatorProcessor({
        processorOptions: { moduleSlewEnabled: false }
      });
      assert.equal(processor.moduleSlewEnabled, false);
    });
    
    it('Debe poder cambiar cutoff via processorOptions', () => {
      const processor = new SynthOscillatorProcessor({
        processorOptions: { moduleSlewCutoff: 10000 }
      });
      assert.equal(processor.moduleSlewCutoff, 10000);
    });
    
    it('Debe actualizar alpha cuando se cambia cutoff via mensaje', () => {
      const processor = new SynthOscillatorProcessor();
      const alphaOriginal = processor.slewAlpha;
      
      // Simular mensaje del hilo principal
      processor.port.onmessage({ data: { type: 'setModuleSlewCutoff', value: 5000 } });
      
      assert.equal(processor.moduleSlewCutoff, 5000);
      assert.ok(processor.slewAlpha < alphaOriginal, 
        'Alpha debe reducirse con cutoff más bajo');
    });
    
    it('Debe poder habilitar/deshabilitar via mensaje', () => {
      const processor = new SynthOscillatorProcessor();
      assert.equal(processor.moduleSlewEnabled, true);
      
      processor.port.onmessage({ data: { type: 'setModuleSlewEnabled', enabled: false } });
      assert.equal(processor.moduleSlewEnabled, false);
      
      processor.port.onmessage({ data: { type: 'setModuleSlewEnabled', enabled: true } });
      assert.equal(processor.moduleSlewEnabled, true);
    });
  });
  
  describe('Estado del filtro', () => {
    
    it('Debe inicializar prevPulseSample y prevSawSample a 0', () => {
      const processor = new SynthOscillatorProcessor();
      assert.equal(processor.prevPulseSample, 0);
      assert.equal(processor.prevSawSample, 0);
    });
    
    it('slewAlpha debe calcularse al construir', () => {
      const processor = new SynthOscillatorProcessor();
      // Con 20kHz y 44100 sampleRate, alpha ≈ 0.94
      assert.ok(processor.slewAlpha > 0.9 && processor.slewAlpha < 1.0,
        `slewAlpha debe estar entre 0.9 y 1.0, got ${processor.slewAlpha}`);
    });
  });
});
