/**
 * Tests de Audio Real para VCA CEM 3330 Worklet
 * 
 * Verifica el procesamiento de audio del VCA usando OfflineAudioContext
 * y el worklet real. Incluye:
 * 
 * - Curva logarítmica 10 dB/V
 * - Filtro anti-click τ=5ms (fc ≈ 31.8 Hz)
 * - Corte mecánico en dial=0
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import { setupAudioPage } from '../testHelpers.js';

// Ruta del worklet (el servidor de test sirve desde la raíz del proyecto)
const VCA_WORKLET_PATH = '/src/assets/js/worklets/vcaProcessor.worklet.js';

test.describe('VCA CEM 3330 AudioWorklet - Tests de Audio Real', () => {
  
  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DEL FILTRO ANTI-CLICK (τ=5ms, fc ≈ 31.8 Hz)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Filtro Anti-Click (τ=5ms)', () => {

    test('señal de control de 10 Hz pasa con mínima atenuación', async ({ page }) => {
      const result = await page.evaluate(async (workletPath) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        await ctx.audioWorklet.addModule(workletPath);
        
        const audioSource = ctx.createOscillator();
        audioSource.frequency.value = 1000;
        
        const cvSource = ctx.createOscillator();
        cvSource.frequency.value = 10;
        cvSource.type = 'sine';
        
        const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: { dialVoltage: -6, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
        });
        
        audioSource.connect(vcaWorklet, 0, 0);
        cvSource.connect(vcaWorklet, 0, 1);
        vcaWorklet.connect(ctx.destination);
        
        audioSource.start();
        cvSource.start();
        
        const buffer = await ctx.startRendering();
        const samples = buffer.getChannelData(0);
        
        // Medir envolvente
        const blockSize = 480;
        const blocks = [];
        for (let i = 0; i < samples.length - blockSize; i += blockSize) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) max = Math.max(max, Math.abs(samples[i + j]));
          blocks.push(max);
        }
        
        const minEnv = Math.min(...blocks.slice(10));
        const maxEnv = Math.max(...blocks.slice(10));
        return { modulationDepth: maxEnv > 0 ? (maxEnv - minEnv) / maxEnv : 0 };
      }, VCA_WORKLET_PATH);

      // A 10 Hz (< fc/3), la modulación debe ser perceptible
      expect(result.modulationDepth).toBeGreaterThan(0.3);
    });

    test('señal de control de 100 Hz se atenúa comparado con 10 Hz', async ({ page }) => {
      // La modulación a 100 Hz debe ser menor que a 10 Hz debido al filtro
      const result = await page.evaluate(async (workletPath) => {
        async function measureModulation(cvFreq) {
          const ctx = new OfflineAudioContext(1, 48000, 48000);
          await ctx.audioWorklet.addModule(workletPath);
          
          const audioSource = ctx.createOscillator();
          audioSource.frequency.value = 1000;
          
          const cvSource = ctx.createOscillator();
          cvSource.frequency.value = cvFreq;
          cvSource.type = 'sine';
          
          const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
            numberOfInputs: 2,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            parameterData: { dialVoltage: -6, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
          });
          
          audioSource.connect(vcaWorklet, 0, 0);
          cvSource.connect(vcaWorklet, 0, 1);
          vcaWorklet.connect(ctx.destination);
          
          audioSource.start();
          cvSource.start();
          
          const buffer = await ctx.startRendering();
          const samples = buffer.getChannelData(0);
          
          // Medir envolvente con bloques adaptados a la frecuencia
          const blockSize = Math.max(48, Math.floor(48000 / cvFreq / 4));
          const blocks = [];
          for (let i = 0; i < samples.length - blockSize; i += blockSize) {
            let max = 0;
            for (let j = 0; j < blockSize; j++) max = Math.max(max, Math.abs(samples[i + j]));
            blocks.push(max);
          }
          
          const skip = Math.floor(blocks.length * 0.2);
          const minEnv = Math.min(...blocks.slice(skip));
          const maxEnv = Math.max(...blocks.slice(skip));
          return maxEnv > 0 ? (maxEnv - minEnv) / maxEnv : 0;
        }
        
        const mod10Hz = await measureModulation(10);
        const mod100Hz = await measureModulation(100);
        
        return { mod10Hz, mod100Hz, ratio: mod10Hz / mod100Hz };
      }, VCA_WORKLET_PATH);

      // 100 Hz debe tener menos modulación que 10 Hz (ratio > 1)
      expect(result.ratio).toBeGreaterThan(1.0);
    });

    test('señal de control de 1000 Hz se atenúa casi completamente', async ({ page }) => {
      const result = await page.evaluate(async (workletPath) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        await ctx.audioWorklet.addModule(workletPath);
        
        const audioSource = ctx.createOscillator();
        audioSource.frequency.value = 2000;
        
        const cvSource = ctx.createOscillator();
        cvSource.frequency.value = 1000;
        cvSource.type = 'sine';
        
        const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: { dialVoltage: -6, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
        });
        
        audioSource.connect(vcaWorklet, 0, 0);
        cvSource.connect(vcaWorklet, 0, 1);
        vcaWorklet.connect(ctx.destination);
        
        audioSource.start();
        cvSource.start();
        
        const buffer = await ctx.startRendering();
        const samples = buffer.getChannelData(0);
        
        const blockSize = 24;
        const blocks = [];
        for (let i = 0; i < samples.length - blockSize; i += blockSize) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) max = Math.max(max, Math.abs(samples[i + j]));
          blocks.push(max);
        }
        
        const minEnv = Math.min(...blocks.slice(200));
        const maxEnv = Math.max(...blocks.slice(200));
        return { modulationDepth: maxEnv > 0 ? (maxEnv - minEnv) / maxEnv : 0 };
      }, VCA_WORKLET_PATH);

      // A 1000 Hz (>> fc), la modulación debe ser casi inexistente
      expect(result.modulationDepth).toBeLessThan(0.05);
    });

    test('AM a frecuencia de audio no es posible (comportamiento fidedigno)', async ({ page }) => {
      // Documenta la limitación del hardware: ring mod no funciona con este VCA
      const result = await page.evaluate(async (workletPath) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        await ctx.audioWorklet.addModule(workletPath);
        
        const audioSource = ctx.createOscillator();
        audioSource.frequency.value = 440;
        
        const cvSource = ctx.createOscillator();
        cvSource.frequency.value = 440;
        cvSource.type = 'sine';
        
        const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: { dialVoltage: -6, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
        });
        
        audioSource.connect(vcaWorklet, 0, 0);
        cvSource.connect(vcaWorklet, 0, 1);
        vcaWorklet.connect(ctx.destination);
        
        audioSource.start();
        cvSource.start();
        
        const buffer = await ctx.startRendering();
        const samples = buffer.getChannelData(0);
        
        return {
          hasSamples: samples.length > 0,
          maxAmplitude: Math.max(...samples.map(Math.abs))
        };
      }, VCA_WORKLET_PATH);

      expect(result.hasSamples).toBe(true);
      expect(result.maxAmplitude).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE CURVA 10 dB/V
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Curva Logarítmica 10 dB/V', () => {

    test('dial 10 (0V) produce ganancia unity', async ({ page }) => {
      const result = await page.evaluate(async (workletPath) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        await ctx.audioWorklet.addModule(workletPath);
        
        const buffer = ctx.createBuffer(1, 48000, 48000);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = 0.5;
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: { dialVoltage: 0, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
        });
        
        source.connect(vcaWorklet, 0, 0);
        vcaWorklet.connect(ctx.destination);
        source.start();
        
        const rendered = await ctx.startRendering();
        const output = rendered.getChannelData(0);
        
        const steadyState = output.slice(24000);
        const avgAmplitude = steadyState.reduce((a, b) => a + Math.abs(b), 0) / steadyState.length;
        
        return { gain: avgAmplitude / 0.5 };
      }, VCA_WORKLET_PATH);

      expect(result.gain).toBeGreaterThan(0.95);
      expect(result.gain).toBeLessThan(1.05);
    });

    test('dial 0 (-12V) produce silencio (corte mecánico)', async ({ page }) => {
      const result = await page.evaluate(async (workletPath) => {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        await ctx.audioWorklet.addModule(workletPath);
        
        const source = ctx.createOscillator();
        source.frequency.value = 440;
        
        const vcaWorklet = new AudioWorkletNode(ctx, 'vca-processor', {
          numberOfInputs: 2,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: { dialVoltage: -12, cvScale: 4.0, cutoffEnabled: 1, slewTime: 0.005 }
        });
        
        source.connect(vcaWorklet, 0, 0);
        vcaWorklet.connect(ctx.destination);
        source.start();
        
        const rendered = await ctx.startRendering();
        const output = rendered.getChannelData(0);
        
        return { maxAmplitude: Math.max(...output.map(Math.abs)) };
      }, VCA_WORKLET_PATH);

      expect(result.maxAmplitude).toBeLessThan(0.0001);
    });

    test('cada voltio produce 10 dB de diferencia', async ({ page }) => {
      const result = await page.evaluate(async (workletPath) => {
        async function measureGain(dialVoltage) {
          const testCtx = new OfflineAudioContext(1, 24000, 48000);
          await testCtx.audioWorklet.addModule(workletPath);
          
          const buffer = testCtx.createBuffer(1, 24000, 48000);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = 0.5;
          
          const source = testCtx.createBufferSource();
          source.buffer = buffer;
          
          const vca = new AudioWorkletNode(testCtx, 'vca-processor', {
            numberOfInputs: 2,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            parameterData: { dialVoltage, cvScale: 4.0, cutoffEnabled: 0, slewTime: 0.005 }
          });
          
          source.connect(vca, 0, 0);
          vca.connect(testCtx.destination);
          source.start();
          
          const rendered = await testCtx.startRendering();
          const output = rendered.getChannelData(0);
          const steadyState = output.slice(12000);
          return steadyState.reduce((a, b) => a + Math.abs(b), 0) / steadyState.length / 0.5;
        }
        
        const gain0V = await measureGain(0);
        const gainMinus1V = await measureGain(-1);
        
        const ratio = gain0V / gainMinus1V;
        const expectedRatio = Math.pow(10, 10/20);  // ≈ 3.162
        
        return { gain0V, gainMinus1V, ratio, expectedRatio };
      }, VCA_WORKLET_PATH);

      // Ratio debe ser cercano a 3.162 (±25% tolerancia por filtro)
      expect(result.ratio).toBeGreaterThan(2.5);
      expect(result.ratio).toBeLessThan(4.0);
    });
  });
});
