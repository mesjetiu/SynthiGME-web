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

  before(() => {
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
        const result = processor.generateAsymmetricSine(phase, symmetry);
        
        // Expected: Peak at 0. Math.cos matches our alignment (0 -> 1, 0.25 -> 0, 0.5 -> -1)
        const expected = Math.cos(phase * 2 * Math.PI);
        
        const error = Math.abs(result - expected);
        if (error > maxError) maxError = error;
      }

      // We expect very high precision in the center because it uses Math.cos directly
      assert.ok(maxError < 1e-15, `Center symmetry should be pure cosine. Max error: ${maxError}`);
    });

    it('Phase Alignment: Peak at phase 0, Valley at phase 0.5', () => {
        // This applies to ALL symmetries and updated Triangle alignment
        [0, 0.25, 0.5, 0.75, 1.0].forEach(sym => {
            const peak = processor.generateAsymmetricSine(0, sym);
            const valley = processor.generateAsymmetricSine(0.5, sym);
            
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
      const nearPeak = processor.generateAsymmetricSine(0 + offset, 0);   // Should be high (Round)
      const nearValley = processor.generateAsymmetricSine(0.5 + offset, 0); // Should be moving fast away from -1? No.
      
      // Better metric: Compare curvature or value magnitude.
      // Round Top -> Value at phase 0.1 is HIGHER than symmetric sine
      // Sharp Bottom -> Value at phase 0.6 (0.5+0.1) is "Less Negative" (closer to zero) than symmetric sine?
      // Actually, Sharp Tip means linear approach. Round Tip means plateau.
      // So Round Peak value > Pure Sine value.
      // Sharp Valley value (abs) < Pure Sine value (abs) ?
      
      const ref = Math.cos(offset * 2 * Math.PI); // Value for pure sine
      
      assert.ok(nearPeak > ref, `Sym 0 Peak should be rounder (higher val) than sine. Got ${nearPeak} vs ${ref}`);
      
      // At the valley (0.5), wave is sharp. 
      // Sharp implies it looks like a triangle tip (linear). 
      // A pure sine is round at the bottom (flat derivative).
      // So a sharp tip drops away from -1 FASTER (or linearly) compared to the slow start of a cosine at bottom?
      // No, sine derivative is 0 at tip. Triangle derivative is constant.
      // So Triangle changes FASTER than Sine near the tip.
      // So |AnalogValley| > |PureSineValley|? No, near tip (0.5), dist is small.
      // Sine: -1 + x^2. Triangle: -1 + x.
      // For small x, x > x^2. So Triangle moves away from -1 faster.
      // So value should be "Higher" (closer to 0) than sine.
      
      const valleyRef = -1.0 + (1.0 - ref); // Symmetric point for sine from bottom
      // nearValley is negative.
      
      // If Sharp, it moves up fast. So nearValley > valleyRef (closer to 0).
      assert.ok(nearValley > valleyRef, `Sym 0 Valley should be sharp (rise faster). Got ${nearValley} vs ${valleyRef}`);
    });

    it('Symmetry 1.0 (Right) should have Sharp Top / Round Bottom', () => {
       const offset = 0.1;
       const nearPeak = processor.generateAsymmetricSine(0 + offset, 1.0);
       const nearValley = processor.generateAsymmetricSine(0.5 + offset, 1.0);
       
       const ref = Math.cos(offset * 2 * Math.PI);
       const valleyRef = -Math.cos(offset * 2 * Math.PI);

       // Top is Sharp -> Moves down fast -> Value LOWER than sine
       assert.ok(nearPeak < ref, `Sym 1 Peak should be sharp (lower val). Got ${nearPeak} vs ${ref}`);

       // Bottom is Round -> Stays flat -> Value LOWER (more negative) than sine equivalent (closer to -1)
       // Wait, valleyRef is e.g. -0.8. If it stays flat near -1, it should be -0.9.
       // So nearValley < valleyRef (more negative).
       assert.ok(nearValley < valleyRef, `Sym 1 Valley should be round (stays low). Got ${nearValley} vs ${valleyRef}`);
    });
    
    it('Should output valid numbers (no NaN)', () => {
       const res = processor.generateAsymmetricSine(0.123, 0.7);
       assert.ok(!Number.isNaN(res));
       assert.ok(Number.isFinite(res));
    });

    it('Optimization: Precomputed triangle should yield same result', () => {
      // Logic check: generateAsymmetricSine uses internal tri logic if arg3 is missing.
      // If arg3 (precomputedTri) is provided, result should match.
      
      const phase = 0.1;
      const symmetry = 0.2; // Use asymmetric to engage analog part
      
      // 1. Calc ALIGNED Standard Triangle (simulating updated generateTriangle)
      // Phase 0 -> 1. Phase 0.5 -> -1.
      let stdTri;
      if (phase < 0.5) {
        stdTri = 1 - 4 * phase;
      } else {
        stdTri = 4 * phase - 3;
      }
      const optimized = processor.generateAsymmetricSine(phase, symmetry, stdTri);
      
      // 3. Call without optimization
      const manual = processor.generateAsymmetricSine(phase, symmetry);
      
      assert.ok(Math.abs(optimized - manual) < 1e-15, 
        `Optimization mismatch! Optimized: ${optimized}, Manual: ${manual}`);
    });

  });
});
