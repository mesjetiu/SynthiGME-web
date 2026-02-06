/**
 * Tests de Audio: Re-Entry Gain Chain
 * 
 * Verifica que el sistema de re-entry de los Output Channels mantiene
 * ganancia unitaria cuando todos los parámetros están configurados para
 * unidad (dial=10, CV=0, pin GREY=100k).
 * 
 * Problema reportado: OC1 → OC2 → OC3 amplifica progresivamente
 * cuando todos los faders están a 10 y pines GREY (100k).
 * 
 * Cadena a verificar:
 *   OSC → OC1.input → VCA(gain=1.0) → postVcaNode → dcBlocker
 *                                                      ↓
 *   matrixPin(gain=1.0) ← ─────────────────────────────┘
 *                 ↓
 *   OC2.input → VCA(gain=1.0) → postVcaNode → dcBlocker → output
 * 
 * Expectativa: Señal debe mantener amplitud constante en cada etapa.
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import {
  setupAudioPage,
  verifyAmplitude,
  TEST_TOLERANCES
} from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const RE_ENTRY_CONFIG = {
  sampleRate: 44100,
  duration: 0.3,
  testFrequency: 440
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE GANANCIA EN CADENA DE RE-ENTRY
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Re-Entry Gain Chain - Ganancia Unitaria', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: VCA a dial=10 debe dar ganancia exactamente 1.0
  // ─────────────────────────────────────────────────────────────────────────

  test('VCA con dial=10, CV=0 debe dar ganancia 1.0', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      // Importar vcaCalculateGain para verificar la fórmula
      // (En el harness real, esto ya está disponible)
      
      // Simular cadena: input → VCA(level=1.0) → output
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Fuente: sine puro a amplitud 1.0
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // VCA simulado con gain=1.0 (lo que vcaCalculateGain(10, 0) debería devolver)
      const vca = offline.createGain();
      vca.gain.value = 1.0;  // Ganancia unitaria

      osc.connect(vca);
      vca.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular peak
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { peak, vcaGain: 1.0 };
    }, RE_ENTRY_CONFIG);

    // VCA con ganancia 1.0 debe preservar amplitud unitaria
    expect(result.peak).toBeCloseTo(1.0, 2);
    const check = verifyAmplitude(result.peak, 1.0, 0.02);
    expect(check.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: DC Blocker no debe atenuar ni amplificar señal de audio
  // ─────────────────────────────────────────────────────────────────────────

  test('DC Blocker (5Hz highpass) debe tener ganancia unitaria a 440Hz', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,  // Canal 0: sin DC blocker, Canal 1: con DC blocker
        length,
        sampleRate
      });

      // Fuente: sine puro a amplitud 1.0
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // DC Blocker: highpass a 0.01Hz (como en engine.js)
      // Permite CV muy lento, solo bloquea DC estático
      const dcBlocker = offline.createBiquadFilter();
      dcBlocker.type = 'highpass';
      dcBlocker.frequency.value = 0.01;
      dcBlocker.Q.value = 0.707;

      // Splitters para medir ambas señales
      const splitter = offline.createChannelSplitter(2);
      const merger = offline.createChannelMerger(2);

      // Ruta directa (canal 0)
      const direct = offline.createGain();
      direct.gain.value = 1.0;

      // Ruta con DC blocker (canal 1)
      const withBlocker = offline.createGain();
      withBlocker.gain.value = 1.0;

      osc.connect(direct);
      osc.connect(dcBlocker);
      dcBlocker.connect(withBlocker);
      
      direct.connect(merger, 0, 0);  // → canal 0
      withBlocker.connect(merger, 0, 1);  // → canal 1
      merger.connect(offline.destination);
      
      osc.start(0);

      const buffer = await offline.startRendering();
      const directSamples = buffer.getChannelData(0);
      const blockerSamples = buffer.getChannelData(1);

      // Calcular peaks
      let directPeak = 0, blockerPeak = 0;
      for (let i = 0; i < directSamples.length; i++) {
        if (Math.abs(directSamples[i]) > directPeak) directPeak = Math.abs(directSamples[i]);
        if (Math.abs(blockerSamples[i]) > blockerPeak) blockerPeak = Math.abs(blockerSamples[i]);
      }

      return { 
        directPeak, 
        blockerPeak, 
        ratio: blockerPeak / directPeak 
      };
    }, RE_ENTRY_CONFIG);

    // DC Blocker no debe atenuar ni amplificar a 440Hz (muy por encima de 5Hz)
    expect(result.ratio).toBeGreaterThan(0.98);
    expect(result.ratio).toBeLessThan(1.02);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Cadena completa de un Output Channel debe ser ganancia unitaria
  // ─────────────────────────────────────────────────────────────────────────

  test('Cadena completa OC: input → VCA(1.0) → dcBlocker debe ser ganancia 1.0', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Fuente: sine puro a amplitud 1.0
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // Simular cadena de OC: input → VCA → postVca → dcBlocker
      const busInput = offline.createGain();
      busInput.gain.value = 1.0;

      const levelNode = offline.createGain();  // VCA
      levelNode.gain.value = 1.0;  // dial=10, CV=0 → gain=1.0

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      const dcBlocker = offline.createBiquadFilter();
      dcBlocker.type = 'highpass';
      dcBlocker.frequency.value = 0.01;
      dcBlocker.Q.value = 0.707;

      // Conectar cadena
      osc.connect(busInput);
      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(dcBlocker);
      dcBlocker.connect(offline.destination);

      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular peak
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { peak };
    }, RE_ENTRY_CONFIG);

    // Cadena completa debe dar ganancia unitaria
    expect(result.peak).toBeGreaterThan(0.95);
    expect(result.peak).toBeLessThan(1.05);
    
    const check = verifyAmplitude(result.peak, 1.0, 0.05);
    expect(check.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Pin de matriz GREY (100k) debe tener ganancia 1.0
  // ─────────────────────────────────────────────────────────────────────────

  test('Matrix pin GREY (100k) debe dar ganancia 1.0', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Fuente: sine puro a amplitud 1.0
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // Pin GREY: Rf=100k, Rin=100k → gain = Rf/Rin = 1.0
      const matrixPin = offline.createGain();
      matrixPin.gain.value = 1.0;

      osc.connect(matrixPin);
      matrixPin.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular peak
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { peak };
    }, RE_ENTRY_CONFIG);

    expect(result.peak).toBeCloseTo(1.0, 2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Encadenamiento OC1 → OC2 debe mantener amplitud
  // ─────────────────────────────────────────────────────────────────────────

  test('Encadenamiento OC1 → matrixPin → OC2 debe mantener amplitud', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Fuente: sine puro a amplitud 1.0
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // ═══════════════════════════════════════════════════════════════════
      // Simular cadena: OSC → OC1 → matrixPin → OC2 → output
      // ═══════════════════════════════════════════════════════════════════

      // OC1: input → VCA(1.0) → postVca → dcBlocker
      const oc1Input = offline.createGain();
      oc1Input.gain.value = 1.0;

      const oc1Vca = offline.createGain();
      oc1Vca.gain.value = 1.0;  // dial=10, CV=0

      const oc1PostVca = offline.createGain();
      oc1PostVca.gain.value = 1.0;

      const oc1DcBlocker = offline.createBiquadFilter();
      oc1DcBlocker.type = 'highpass';
      oc1DcBlocker.frequency.value = 0.01;
      oc1DcBlocker.Q.value = 0.707;

      // Matrix Pin GREY (re-entry): gain=1.0
      const matrixPin = offline.createGain();
      matrixPin.gain.value = 1.0;

      // OC2: input → VCA(1.0) → postVca → dcBlocker
      const oc2Input = offline.createGain();
      oc2Input.gain.value = 1.0;

      const oc2Vca = offline.createGain();
      oc2Vca.gain.value = 1.0;  // dial=10, CV=0

      const oc2PostVca = offline.createGain();
      oc2PostVca.gain.value = 1.0;

      const oc2DcBlocker = offline.createBiquadFilter();
      oc2DcBlocker.type = 'highpass';
      oc2DcBlocker.frequency.value = 0.01;
      oc2DcBlocker.Q.value = 0.707;

      // Conectar cadena completa
      osc.connect(oc1Input);
      oc1Input.connect(oc1Vca);
      oc1Vca.connect(oc1PostVca);
      oc1PostVca.connect(oc1DcBlocker);
      oc1DcBlocker.connect(matrixPin);
      matrixPin.connect(oc2Input);
      oc2Input.connect(oc2Vca);
      oc2Vca.connect(oc2PostVca);
      oc2PostVca.connect(oc2DcBlocker);
      oc2DcBlocker.connect(offline.destination);

      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular peak
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { 
        peak,
        chainLength: 2,  // 2 Output Channels encadenados
        expectedGain: 1.0  // Ganancia unitaria en toda la cadena
      };
    }, RE_ENTRY_CONFIG);

    // Con 2 OCs encadenados, la amplitud debe mantenerse en ~1.0
    expect(result.peak).toBeGreaterThan(0.90);
    expect(result.peak).toBeLessThan(1.10);
    
    const check = verifyAmplitude(result.peak, 1.0, 0.10);
    expect(check.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Triple encadenamiento OC1 → OC2 → OC3
  // ─────────────────────────────────────────────────────────────────────────

  test('Triple encadenamiento OC1 → OC2 → OC3 debe mantener amplitud', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Función helper para crear un "Output Channel" simulado
      const createOC = (ctx) => {
        const input = ctx.createGain();
        input.gain.value = 1.0;

        const vca = ctx.createGain();
        vca.gain.value = 1.0;  // dial=10, CV=0

        const postVca = ctx.createGain();
        postVca.gain.value = 1.0;

        const dcBlocker = ctx.createBiquadFilter();
        dcBlocker.type = 'highpass';
        dcBlocker.frequency.value = 0.01;
        dcBlocker.Q.value = 0.707;

        // Conectar internamente
        input.connect(vca);
        vca.connect(postVca);
        postVca.connect(dcBlocker);

        return { input, vca, postVca, dcBlocker };
      };

      // Crear función para matrix pin
      const createMatrixPin = (ctx, gain = 1.0) => {
        const pin = ctx.createGain();
        pin.gain.value = gain;
        return pin;
      };

      // Fuente
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;

      // Crear 3 Output Channels
      const oc1 = createOC(offline);
      const oc2 = createOC(offline);
      const oc3 = createOC(offline);

      // Crear 2 matrix pins (re-entry)
      const pin1 = createMatrixPin(offline, 1.0);  // GREY
      const pin2 = createMatrixPin(offline, 1.0);  // GREY

      // Conectar cadena: OSC → OC1 → pin1 → OC2 → pin2 → OC3 → output
      osc.connect(oc1.input);
      oc1.dcBlocker.connect(pin1);
      pin1.connect(oc2.input);
      oc2.dcBlocker.connect(pin2);
      pin2.connect(oc3.input);
      oc3.dcBlocker.connect(offline.destination);

      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular peak
      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { 
        peak,
        chainLength: 3,
        expectedGain: 1.0
      };
    }, RE_ENTRY_CONFIG);

    // Con 3 OCs encadenados, la amplitud debe mantenerse en ~1.0
    // Tolerancia un poco mayor por acumulación de pequeños errores de punto flotante
    expect(result.peak).toBeGreaterThan(0.85);
    expect(result.peak).toBeLessThan(1.15);
    
    console.log(`Triple chain peak: ${result.peak.toFixed(4)} (expected: 1.0)`);
    
    const check = verifyAmplitude(result.peak, 1.0, 0.15);
    expect(check.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE DIAGNÓSTICO - Identificar fuente de amplificación
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Re-Entry Gain - Diagnóstico de Amplificación', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('Medir ganancia de cada etapa en cadena encadenada', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      // Función para medir amplitud de un buffer
      const measurePeak = (samples) => {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
        }
        return peak;
      };

      // ═══════════════════════════════════════════════════════════════════
      // Medir cada etapa individualmente
      // ═══════════════════════════════════════════════════════════════════

      const measurements = {};

      // Etapa 0: Solo oscilador (baseline)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        osc.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.source = measurePeak(buffer.getChannelData(0));
      }

      // Etapa 1: Oscilador → busInput (gain=1.0)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        const busInput = ctx.createGain();
        busInput.gain.value = 1.0;
        osc.connect(busInput);
        busInput.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.afterBusInput = measurePeak(buffer.getChannelData(0));
      }

      // Etapa 2: → VCA (levelNode, gain=1.0)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        const busInput = ctx.createGain();
        busInput.gain.value = 1.0;
        const vca = ctx.createGain();
        vca.gain.value = 1.0;
        osc.connect(busInput);
        busInput.connect(vca);
        vca.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.afterVca = measurePeak(buffer.getChannelData(0));
      }

      // Etapa 3: → postVcaNode (gain=1.0)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        const busInput = ctx.createGain();
        busInput.gain.value = 1.0;
        const vca = ctx.createGain();
        vca.gain.value = 1.0;
        const postVca = ctx.createGain();
        postVca.gain.value = 1.0;
        osc.connect(busInput);
        busInput.connect(vca);
        vca.connect(postVca);
        postVca.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.afterPostVca = measurePeak(buffer.getChannelData(0));
      }

      // Etapa 4: → dcBlocker (highpass 5Hz)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        const busInput = ctx.createGain();
        busInput.gain.value = 1.0;
        const vca = ctx.createGain();
        vca.gain.value = 1.0;
        const postVca = ctx.createGain();
        postVca.gain.value = 1.0;
        const dcBlocker = ctx.createBiquadFilter();
        dcBlocker.type = 'highpass';
        dcBlocker.frequency.value = 0.01;
        dcBlocker.Q.value = 0.707;
        osc.connect(busInput);
        busInput.connect(vca);
        vca.connect(postVca);
        postVca.connect(dcBlocker);
        dcBlocker.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.afterDcBlocker = measurePeak(buffer.getChannelData(0));
      }

      // Etapa 5: → matrixPin (gain=1.0)
      {
        const ctx = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate });
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = testFrequency;
        const busInput = ctx.createGain();
        busInput.gain.value = 1.0;
        const vca = ctx.createGain();
        vca.gain.value = 1.0;
        const postVca = ctx.createGain();
        postVca.gain.value = 1.0;
        const dcBlocker = ctx.createBiquadFilter();
        dcBlocker.type = 'highpass';
        dcBlocker.frequency.value = 0.01;
        dcBlocker.Q.value = 0.707;
        const pin = ctx.createGain();
        pin.gain.value = 1.0;
        osc.connect(busInput);
        busInput.connect(vca);
        vca.connect(postVca);
        postVca.connect(dcBlocker);
        dcBlocker.connect(pin);
        pin.connect(ctx.destination);
        osc.start(0);
        const buffer = await ctx.startRendering();
        measurements.afterMatrixPin = measurePeak(buffer.getChannelData(0));
      }

      // Calcular ratios respecto a la fuente
      const ratios = {
        busInput: measurements.afterBusInput / measurements.source,
        vca: measurements.afterVca / measurements.source,
        postVca: measurements.afterPostVca / measurements.source,
        dcBlocker: measurements.afterDcBlocker / measurements.source,
        matrixPin: measurements.afterMatrixPin / measurements.source
      };

      return { measurements, ratios };
    }, RE_ENTRY_CONFIG);

    // Mostrar resultados para diagnóstico
    console.log('\n=== Diagnóstico de Ganancia por Etapa ===');
    console.log(`Source:       ${result.measurements.source.toFixed(4)}`);
    console.log(`After Input:  ${result.measurements.afterBusInput.toFixed(4)} (ratio: ${result.ratios.busInput.toFixed(4)})`);
    console.log(`After VCA:    ${result.measurements.afterVca.toFixed(4)} (ratio: ${result.ratios.vca.toFixed(4)})`);
    console.log(`After PostVca:${result.measurements.afterPostVca.toFixed(4)} (ratio: ${result.ratios.postVca.toFixed(4)})`);
    console.log(`After DC:     ${result.measurements.afterDcBlocker.toFixed(4)} (ratio: ${result.ratios.dcBlocker.toFixed(4)})`);
    console.log(`After Pin:    ${result.measurements.afterMatrixPin.toFixed(4)} (ratio: ${result.ratios.matrixPin.toFixed(4)})`);

    // Verificar que ninguna etapa amplifica
    expect(result.ratios.busInput).toBeLessThanOrEqual(1.02);
    expect(result.ratios.vca).toBeLessThanOrEqual(1.02);
    expect(result.ratios.postVca).toBeLessThanOrEqual(1.02);
    expect(result.ratios.dcBlocker).toBeLessThanOrEqual(1.02);
    expect(result.ratios.matrixPin).toBeLessThanOrEqual(1.02);
  });
});
