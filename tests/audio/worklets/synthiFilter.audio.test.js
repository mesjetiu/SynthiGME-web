import { test, expect } from '@playwright/test';
import { setupAudioPage } from '../testHelpers.js';

const FILTER_WORKLET_PATH = '/src/assets/js/worklets/synthiFilter.worklet.js';

test.describe('Synthi Filter AudioWorklet — audio real', () => {
  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('low-pass a 320 Hz atenúa 5 kHz mucho más que 100 Hz', async ({ page }) => {
    const result = await page.evaluate(async (workletPath) => {
      async function renderTone(frequency) {
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(1, sampleRate * 0.5, sampleRate);
        await offline.audioWorklet.addModule(workletPath);

        const osc = offline.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency;

        const filter = new AudioWorkletNode(offline, 'synthi-filter', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: {
            cutoffControl: 0,
            response: 0
          },
          processorOptions: { mode: 'lowpass' }
        });

        osc.connect(filter);
        filter.connect(offline.destination);
        osc.start(0);

        const buffer = await offline.startRendering();
        const samples = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4096; i < samples.length; i++) {
          sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / (samples.length - 4096));
      }

      const low = await renderTone(100);
      const high = await renderTone(5000);
      return { low, high, ratio: high / low };
    }, FILTER_WORKLET_PATH);

    expect(result.low).toBeGreaterThan(result.high * 3);
    expect(result.ratio).toBeLessThan(0.33);
  });

  test('high-pass a 320 Hz atenúa 100 Hz mucho más que 5 kHz', async ({ page }) => {
    const result = await page.evaluate(async (workletPath) => {
      async function renderTone(frequency) {
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(1, sampleRate * 0.5, sampleRate);
        await offline.audioWorklet.addModule(workletPath);

        const osc = offline.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency;

        const filter = new AudioWorkletNode(offline, 'synthi-filter', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: {
            cutoffControl: 0,
            response: 0
          },
          processorOptions: { mode: 'highpass' }
        });

        osc.connect(filter);
        filter.connect(offline.destination);
        osc.start(0);

        const buffer = await offline.startRendering();
        const samples = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4096; i < samples.length; i++) {
          sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / (samples.length - 4096));
      }

      const low = await renderTone(100);
      const high = await renderTone(5000);
      return { low, high, ratio: high / low };
    }, FILTER_WORKLET_PATH);

    expect(result.high).toBeGreaterThan(result.low * 3);
    expect(result.ratio).toBeGreaterThan(3);
  });

  test('low-pass en auto-oscilación genera tono cercano a 320 Hz con silencio de entrada', async ({ page }) => {
    const result = await page.evaluate(async (workletPath) => {
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(1, sampleRate * 1.2, sampleRate);
      await offline.audioWorklet.addModule(workletPath);

      const filter = new AudioWorkletNode(offline, 'synthi-filter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        parameterData: {
          cutoffControl: 0,
          response: 8
        },
        processorOptions: { mode: 'lowpass' }
      });

      filter.connect(offline.destination);
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0).slice(sampleRate * 0.2);

      let zeroCrossings = 0;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i - 1] < 0 && samples[i] >= 0) {
          zeroCrossings++;
        }
      }

      const duration = samples.length / sampleRate;
      return {
        peak: Math.max(...samples.map(Math.abs)),
        frequency: zeroCrossings / duration
      };
    }, FILTER_WORKLET_PATH);

    expect(result.peak).toBeGreaterThan(0.001);
    expect(result.frequency).toBeGreaterThan(220);
    expect(result.frequency).toBeLessThan(450);
  });

  test('cutoffControl sigue 0.55 V/oct: +0.1375 digital sube aproximadamente una octava', async ({ page }) => {
    const result = await page.evaluate(async (workletPath) => {
      async function renderFrequency(cutoffControl) {
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(1, sampleRate * 1.2, sampleRate);
        await offline.audioWorklet.addModule(workletPath);

        const filter = new AudioWorkletNode(offline, 'synthi-filter', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: {
            cutoffControl,
            response: 8
          },
          processorOptions: { mode: 'lowpass' }
        });

        filter.connect(offline.destination);
        const buffer = await offline.startRendering();
        const samples = buffer.getChannelData(0).slice(sampleRate * 0.2);

        let zeroCrossings = 0;
        for (let i = 1; i < samples.length; i++) {
          if (samples[i - 1] < 0 && samples[i] >= 0) {
            zeroCrossings++;
          }
        }

        return zeroCrossings / (samples.length / sampleRate);
      }

      const base = await renderFrequency(0);
      const octaveUp = await renderFrequency(0.1375);
      return {
        base,
        octaveUp,
        ratio: octaveUp / base
      };
    }, FILTER_WORKLET_PATH);

    expect(result.base).toBeGreaterThan(220);
    expect(result.base).toBeLessThan(450);
    expect(result.octaveUp).toBeGreaterThan(430);
    expect(result.octaveUp).toBeLessThan(900);
    expect(result.ratio).toBeGreaterThan(1.75);
    expect(result.ratio).toBeLessThan(2.25);
  });

  test('high-pass auto-oscilado es armónicamente más rugoso que low-pass', async ({ page }) => {
    const result = await page.evaluate(async (workletPath) => {
      async function render(mode) {
        const sampleRate = 44100;
        const offline = new OfflineAudioContext(1, sampleRate * 1.2, sampleRate);
        await offline.audioWorklet.addModule(workletPath);

        const filter = new AudioWorkletNode(offline, 'synthi-filter', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          parameterData: {
            cutoffControl: 0,
            response: 8
          },
          processorOptions: { mode }
        });

        filter.connect(offline.destination);
        const buffer = await offline.startRendering();
        const samples = buffer.getChannelData(0).slice(sampleRate * 0.2);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const value = Math.abs(samples[i]);
          sum += samples[i] * samples[i];
          if (value > peak) peak = value;
        }

        return {
          rms: Math.sqrt(sum / samples.length),
          peak
        };
      }

      const lp = await render('lowpass');
      const hp = await render('highpass');
      return {
        lpCrest: lp.peak / lp.rms,
        hpCrest: hp.peak / hp.rms
      };
    }, FILTER_WORKLET_PATH);

    expect(result.hpCrest).toBeGreaterThan(result.lpCrest);
  });
});
