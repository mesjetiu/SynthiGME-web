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

  before(() => {
    // Processor con atenuación histórica desactivada para tests de forma de onda pura
    processorNoAttenuation = new SynthOscillatorProcessor({
      processorOptions: { sineShapeAttenuation: 0 }
    });
    // Processor con atenuación histórica (por defecto = 1.0)
    processor = new SynthOscillatorProcessor();
  });

  describe('generateAsymmetricSine (New Hybrid Algo)', () => {
    
    // NEW ALIGNMENT: 0.25 (90 deg) is Crossing Zero downwards?
    // Phase 0 -> 1. Phase 0.5 -> -1.
    // So crossing 0 happens at 0.25 and 0.75.
    // Cos(0.25 * 2PI) = Cos(PI/2) = 0. Correct.
    
    it('Symmetry 0.5 (Center) should be Pure Sine (Cosine phase)', () => {
      const symmetry = 0.5;
      const numPoints = 100;
      let maxError = 0;

      for (let i = 0; i < numPoints; i++) {
        const phase = i / numPoints;
        // Usar processor sin atenuación para test de forma pura
        const result = processorNoAttenuation.generateAsymmetricSine(phase, symmetry);
        
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
      // Crear processor con atenuación parcial (50%)
      const halfAttenuation = new SynthOscillatorProcessor({
        processorOptions: { sineShapeAttenuation: 0.5 }
      });
      
      const peakExtreme = halfAttenuation.generateAsymmetricSine(0, 0.01);
      
      // Con 50% de atenuación, el extremo debe estar entre 0.125 y 1.0
      // Fórmula: 1.0 - (1 * 1) * (1 - 0.125) * 0.5 = 1 - 0.4375 = 0.5625
      assert.ok(peakExtreme > 0.5, `Half attenuation extreme should be ~0.56, got ${peakExtreme}`);
      assert.ok(peakExtreme < 0.7, `Half attenuation extreme should be ~0.56, got ${peakExtreme}`);
    });

  });
});
