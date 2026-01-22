/**
 * Test básico para verificar que el harness de audio funciona
 */

import { test, expect } from '@playwright/test';

test.describe('Audio Harness Sanity Check', () => {

  test('Harness debe cargar y estar listo', async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    
    // Esperar a que el harness esté listo
    await page.waitForFunction(
      () => window.__AUDIO_HARNESS_READY__ === true,
      { timeout: 10000 }
    );
    
    const isReady = await page.evaluate(() => window.__AUDIO_HARNESS_READY__);
    expect(isReady).toBe(true);
  });

  test('OfflineAudioContext debe funcionar', async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    await page.waitForFunction(() => window.__AUDIO_HARNESS_READY__ === true);
    
    const result = await page.evaluate(async () => {
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length: 4410,  // 0.1 segundos
        sampleRate: 44100
      });
      
      // Crear un oscilador simple
      const osc = offline.createOscillator();
      osc.frequency.value = 440;
      osc.connect(offline.destination);
      osc.start();
      
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);
      
      // Verificar que hay señal
      let max = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }
      
      return {
        sampleCount: samples.length,
        peak: max,
        hasSignal: max > 0.5
      };
    });
    
    expect(result.hasSignal).toBe(true);
    expect(result.peak).toBeGreaterThan(0.9);
  });

  test('AudioWorklet debe cargarse correctamente', async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    await page.waitForFunction(() => window.__AUDIO_HARNESS_READY__ === true);
    
    const result = await page.evaluate(async () => {
      try {
        const offline = new OfflineAudioContext({
          numberOfChannels: 1,
          length: 4410,
          sampleRate: 44100
        });
        
        await offline.audioWorklet.addModule('/src/assets/js/worklets/synthOscillator.worklet.js');
        
        return { success: true, error: null };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    expect(result.success).toBe(true);
  });

  test('SynthOscillator worklet debe generar audio', async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    await page.waitForFunction(() => window.__AUDIO_HARNESS_READY__ === true);
    
    const result = await page.evaluate(async () => {
      try {
        const offline = new OfflineAudioContext({
          numberOfChannels: 1,
          length: 44100,  // 1 segundo
          sampleRate: 44100
        });
        
        await offline.audioWorklet.addModule('/src/assets/js/worklets/synthOscillator.worklet.js');
        
        const osc = new AudioWorkletNode(offline, 'synth-oscillator', {
          processorOptions: {
            mode: 'single',
            waveform: 'sine',
            sineShapeAttenuation: 0,
            sinePurity: 1.0
          }
        });
        
        osc.parameters.get('frequency').value = 440;
        osc.parameters.get('gain').value = 1.0;
        osc.connect(offline.destination);
        
        const buffer = await offline.startRendering();
        const samples = buffer.getChannelData(0);
        
        // Verificar que hay señal
        let max = 0;
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
          sum += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sum / samples.length);
        
        // Contar cruces por cero
        let crossings = 0;
        for (let i = 1; i < samples.length; i++) {
          if ((samples[i-1] < 0 && samples[i] >= 0)) {
            crossings++;
          }
        }
        const estimatedFreq = crossings;  // En 1 segundo = Hz
        
        return {
          success: true,
          peak: max,
          rms: rms,
          estimatedFreq: estimatedFreq,
          firstSamples: Array.from(samples.slice(0, 10))
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    
    expect(result.success).toBe(true);
    expect(result.peak).toBeGreaterThan(0.9);
    expect(result.estimatedFreq).toBeGreaterThan(430);
    expect(result.estimatedFreq).toBeLessThan(450);
  });
});
