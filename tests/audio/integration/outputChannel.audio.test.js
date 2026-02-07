/**
 * Tests de Audio: Output Channel Signal Chain
 * 
 * Verifica la cadena de señal completa del Output Channel según
 * especificaciones Cuenca/Datanomics 1982:
 * 
 * busInput → [clipper] → levelNode (VCA) → postVcaNode → [crossfade] → muteNode → channelGains
 *                                               │
 *                                               ├─→ filterGain → filterNode (RC worklet) ─┬─→ muteNode
 *                                               └─→ bypassGain ──────────────────────────┘
 *                                               └─→ (re-entry a matriz)
 * 
 * Tests críticos:
 * - Cadena de señal básica (señal pasa correctamente)
 * - VCA (levelNode) atenúa según especificación
 * - Mute (muteNode) silencia sin afectar re-entry
 * - Re-entry (postVcaNode) es POST-VCA, PRE-filtro, PRE-mute
 * - Filter bypass crossfade (sin clicks)
 * - Filtro LP/HP atenúa frecuencias correctamente
 * 
 * NOTA: Los tests de crossfade y LP/HP usan BiquadFilter nativo como proxy
 * para validar la topología de crossfade, ya que AudioWorklet no es fácilmente
 * testable en OfflineAudioContext. Los tests del modelo RC exacto están en
 * outputChannel.test.js (verificación matemática de coeficientes).
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import {
  setupAudioPage,
  DEFAULT_TEST_CONFIG
} from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const OUTPUT_CHANNEL_CONFIG = {
  sampleRate: 44100,
  duration: 0.3,           // 300ms suficiente para análisis
  shortDuration: 0.1,      // 100ms para tests rápidos
  crossfadeDuration: 0.15, // 150ms para capturar crossfade de 50ms
  testFrequency: 440,      // A4 - frecuencia de prueba
  lowFrequency: 100,       // Para tests de HP
  highFrequency: 5000      // Para tests de LP
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS ESPECÍFICOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula RMS de un buffer de audio.
 */
function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Calcula peak absoluto de un buffer.
 */
function calculatePeak(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
  }
  return max;
}

/**
 * Detecta clicks/pops en transiciones buscando saltos bruscos.
 * @param {Float32Array} samples - Buffer de audio
 * @param {number} threshold - Umbral de salto (default 0.1)
 * @returns {{ hasClicks: boolean, maxJump: number, clickPositions: number[] }}
 */
function detectClicks(samples, threshold = 0.1) {
  const clickPositions = [];
  let maxJump = 0;
  
  for (let i = 1; i < samples.length; i++) {
    const jump = Math.abs(samples[i] - samples[i - 1]);
    if (jump > maxJump) maxJump = jump;
    if (jump > threshold) {
      clickPositions.push(i);
    }
  }
  
  return {
    hasClicks: clickPositions.length > 0,
    maxJump,
    clickPositions
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE CADENA DE SEÑAL BÁSICA
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Cadena de Señal Básica', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('Señal pasa correctamente por la cadena completa', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Crear cadena de Output Channel simplificada
      // busInput → levelNode (VCA) → postVcaNode → bypassGain → muteNode → output
      const busInput = offline.createGain();
      busInput.gain.value = 1.0;
      
      const levelNode = offline.createGain();  // VCA
      levelNode.gain.value = 1.0;
      
      const postVcaNode = offline.createGain();  // Split point
      postVcaNode.gain.value = 1.0;
      
      const bypassGain = offline.createGain();  // Bypass (filtros bypaseados)
      bypassGain.gain.value = 1.0;
      
      const muteNode = offline.createGain();  // Mute
      muteNode.gain.value = 1.0;

      // Conectar cadena
      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);
      muteNode.connect(offline.destination);

      // Fuente: oscilador nativo
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      // Renderizar
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Calcular métricas
      let sum = 0, max = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }
      const rms = Math.sqrt(sum / samples.length);

      return { rms, peak: max, sampleCount: samples.length };
    }, OUTPUT_CHANNEL_CONFIG);

    // Verificar que la señal pasa
    expect(result.peak).toBeGreaterThan(0.9);
    expect(result.peak).toBeLessThanOrEqual(1.0);
    expect(result.rms).toBeGreaterThan(0.6);  // Sine RMS ≈ 0.707
  });

  test('Orden correcto: VCA antes de filtros', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,  // Canal 0: después de VCA, Canal 1: salida final
        length,
        sampleRate
      });

      // Crear cadena completa con filtro activo
      const busInput = offline.createGain();
      busInput.gain.value = 1.0;
      
      const levelNode = offline.createGain();  // VCA al 50%
      levelNode.gain.value = 0.5;
      
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      
      const filterGain = offline.createGain();
      filterGain.gain.value = 1.0;
      
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 500;  // Filtro LP activo en 500Hz
      filterLP.Q.value = 0.707;
      
      const filterHP = offline.createBiquadFilter();
      filterHP.type = 'highpass';
      filterHP.frequency.value = 20;
      filterHP.Q.value = 0.707;
      
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      // Conectar cadena
      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(filterGain);
      filterGain.connect(filterLP);
      filterLP.connect(filterHP);
      filterHP.connect(muteNode);

      // Splitter para capturar en dos puntos
      const splitter = offline.createChannelMerger(2);
      
      // Canal 0: señal en postVcaNode (POST-VCA, PRE-filtro)
      postVcaNode.connect(splitter, 0, 0);
      
      // Canal 1: señal final (después de filtros)
      muteNode.connect(splitter, 0, 1);
      
      splitter.connect(offline.destination);

      // Fuente: onda con armónicos (sierra) para que el filtro tenga efecto
      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const postVcaSamples = buffer.getChannelData(0);
      const outputSamples = buffer.getChannelData(1);

      // Calcular RMS de cada punto
      let sumPostVca = 0, sumOutput = 0;
      for (let i = 0; i < postVcaSamples.length; i++) {
        sumPostVca += postVcaSamples[i] * postVcaSamples[i];
        sumOutput += outputSamples[i] * outputSamples[i];
      }
      const rmsPostVca = Math.sqrt(sumPostVca / postVcaSamples.length);
      const rmsOutput = Math.sqrt(sumOutput / outputSamples.length);

      return {
        rmsPostVca,
        rmsOutput,
        ratio: rmsOutput / rmsPostVca
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // postVcaNode debe tener señal atenuada por VCA (0.5)
    expect(result.rmsPostVca).toBeGreaterThan(0.2);
    expect(result.rmsPostVca).toBeLessThan(0.5);
    
    // Salida debe estar más atenuada que postVca debido al filtro LP
    // (el filtro corta armónicos, reduciendo energía)
    expect(result.rmsOutput).toBeLessThan(result.rmsPostVca);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE VCA (levelNode)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - VCA (levelNode)', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('VCA en 0 silencia la salida', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 0;  // VCA en 0
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(muteNode);
      muteNode.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let max = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }

      return { peak: max };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.peak).toBeLessThan(0.0001);  // Prácticamente silencio
  });

  test('VCA en 1 = ganancia unitaria', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0;  // VCA al máximo
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(muteNode);
      muteNode.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let max = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }

      return { peak: max };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.peak).toBeGreaterThan(0.99);
    expect(result.peak).toBeLessThanOrEqual(1.0);
  });

  test('VCA atenúa proporcionalmente (0.5 = -6dB)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 0.5;  // -6dB
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(muteNode);
      muteNode.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let max = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }

      return { peak: max };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.peak).toBeGreaterThan(0.48);
    expect(result.peak).toBeLessThan(0.52);
  });

  test('VCA con rampa suave no produce clicks', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, testFrequency } = config;
      const duration = 0.2;  // 200ms
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0;
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(muteNode);
      muteNode.connect(offline.destination);

      // Rampa de 1 a 0 con setTargetAtTime (como hace el engine)
      const rampTime = 0.03;  // 30ms
      levelNode.gain.setTargetAtTime(0, 0.05, rampTime);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Buscar saltos bruscos (clicks)
      const clickPositions = [];
      let maxJump = 0;
      for (let i = 1; i < samples.length; i++) {
        const jump = Math.abs(samples[i] - samples[i - 1]);
        if (jump > maxJump) maxJump = jump;
        // Un click sería un salto > 0.1 en un sample
        if (jump > 0.1) clickPositions.push(i);
      }

      return {
        maxJump,
        clickCount: clickPositions.length,
        hasClicks: clickPositions.length > 0
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // No debe haber clicks (saltos bruscos mayores a 0.1)
    expect(result.hasClicks).toBe(false);
    // El salto máximo debe ser pequeño (transición suave)
    expect(result.maxJump).toBeLessThan(0.08);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE MUTE Y RE-ENTRY
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Mute y Re-entry', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('Mute silencia la salida externa', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0;
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      const muteNode = offline.createGain();
      muteNode.gain.value = 0;  // MUTEADO

      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(muteNode);
      muteNode.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let max = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > max) max = Math.abs(samples[i]);
      }

      return { peak: max };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.peak).toBeLessThan(0.0001);  // Silencio
  });

  test('Re-entry (postVcaNode) no es afectada por mute', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,  // Canal 0: re-entry, Canal 1: salida
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0;
      const postVcaNode = offline.createGain();  // RE-ENTRY POINT
      postVcaNode.gain.value = 1.0;
      const bypassGain = offline.createGain();
      bypassGain.gain.value = 1.0;
      const muteNode = offline.createGain();
      muteNode.gain.value = 0;  // MUTEADO

      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);

      // Capturar ambos puntos
      const merger = offline.createChannelMerger(2);
      postVcaNode.connect(merger, 0, 0);  // Re-entry
      muteNode.connect(merger, 0, 1);      // Salida
      merger.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const reEntrySamples = buffer.getChannelData(0);
      const outputSamples = buffer.getChannelData(1);

      let maxReEntry = 0, maxOutput = 0;
      for (let i = 0; i < reEntrySamples.length; i++) {
        if (Math.abs(reEntrySamples[i]) > maxReEntry) maxReEntry = Math.abs(reEntrySamples[i]);
        if (Math.abs(outputSamples[i]) > maxOutput) maxOutput = Math.abs(outputSamples[i]);
      }

      return {
        reEntryPeak: maxReEntry,
        outputPeak: maxOutput
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // Re-entry debe tener señal (el mute no la afecta)
    expect(result.reEntryPeak).toBeGreaterThan(0.9);
    // Salida debe estar silenciada
    expect(result.outputPeak).toBeLessThan(0.0001);
  });

  test('Re-entry es POST-VCA (atenuada por VCA)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,  // Canal 0: antes VCA, Canal 1: re-entry (después VCA)
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      busInput.gain.value = 1.0;
      const levelNode = offline.createGain();
      levelNode.gain.value = 0.25;  // VCA al 25%
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);

      const merger = offline.createChannelMerger(2);
      busInput.connect(merger, 0, 0);     // Antes del VCA
      postVcaNode.connect(merger, 0, 1);  // Re-entry (después VCA)
      merger.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const beforeVcaSamples = buffer.getChannelData(0);
      const reEntrySamples = buffer.getChannelData(1);

      let maxBefore = 0, maxReEntry = 0;
      for (let i = 0; i < beforeVcaSamples.length; i++) {
        if (Math.abs(beforeVcaSamples[i]) > maxBefore) maxBefore = Math.abs(beforeVcaSamples[i]);
        if (Math.abs(reEntrySamples[i]) > maxReEntry) maxReEntry = Math.abs(reEntrySamples[i]);
      }

      return {
        beforeVcaPeak: maxBefore,
        reEntryPeak: maxReEntry,
        ratio: maxReEntry / maxBefore
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // Antes del VCA: señal completa
    expect(result.beforeVcaPeak).toBeGreaterThan(0.9);
    // Re-entry: atenuada al 25%
    expect(result.reEntryPeak).toBeGreaterThan(0.23);
    expect(result.reEntryPeak).toBeLessThan(0.27);
    // Ratio ~0.25
    expect(result.ratio).toBeGreaterThan(0.23);
    expect(result.ratio).toBeLessThan(0.27);
  });

  test('Re-entry es PRE-filtro (no coloreada por filtro)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,
        length,
        sampleRate
      });

      const busInput = offline.createGain();
      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0;
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      
      // Filtro LP agresivo en 200Hz (cortará mucha energía de la sierra)
      const filterGain = offline.createGain();
      filterGain.gain.value = 1.0;
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 200;
      filterLP.Q.value = 0.707;
      
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(filterGain);
      filterGain.connect(filterLP);
      filterLP.connect(muteNode);

      const merger = offline.createChannelMerger(2);
      postVcaNode.connect(merger, 0, 0);  // Re-entry (PRE-filtro)
      muteNode.connect(merger, 0, 1);     // Salida (POST-filtro)
      merger.connect(offline.destination);

      // Fuente con muchos armónicos para que el filtro tenga efecto
      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 440;
      osc.connect(busInput);
      osc.start(0);

      const buffer = await offline.startRendering();
      const reEntrySamples = buffer.getChannelData(0);
      const outputSamples = buffer.getChannelData(1);

      // Calcular RMS (mejor para comparar energía con armónicos)
      let sumReEntry = 0, sumOutput = 0;
      for (let i = 0; i < reEntrySamples.length; i++) {
        sumReEntry += reEntrySamples[i] * reEntrySamples[i];
        sumOutput += outputSamples[i] * outputSamples[i];
      }
      const rmsReEntry = Math.sqrt(sumReEntry / reEntrySamples.length);
      const rmsOutput = Math.sqrt(sumOutput / outputSamples.length);

      return {
        rmsReEntry,
        rmsOutput,
        energyRatio: rmsOutput / rmsReEntry
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // Re-entry debe tener más energía (no filtrada)
    expect(result.rmsReEntry).toBeGreaterThan(result.rmsOutput);
    // El filtro LP en 200Hz con sierra a 440Hz debería quitar mucha energía
    expect(result.energyRatio).toBeLessThan(0.5);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE FILTER BYPASS CROSSFADE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Filter Bypass Crossfade', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('Crossfade bypass→filtros no produce clicks', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, testFrequency } = config;
      const duration = 0.2;  // 200ms
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      
      // Ruta filtros
      const filterGain = offline.createGain();
      filterGain.gain.value = 0;  // Empieza en bypass
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 1000;
      filterLP.Q.value = 0.707;
      
      // Ruta bypass
      const bypassGain = offline.createGain();
      bypassGain.gain.value = 1;  // Empieza activo
      
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      // Conectar ambas rutas
      postVcaNode.connect(filterGain);
      filterGain.connect(filterLP);
      filterLP.connect(muteNode);
      
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);
      
      muteNode.connect(offline.destination);

      // Crossfade: bypass→filtros en t=0.05s con rampa de 50ms
      const crossfadeTime = 0.05;
      const crossfadeStart = 0.05;
      filterGain.gain.setTargetAtTime(1, crossfadeStart, crossfadeTime);
      bypassGain.gain.setTargetAtTime(0, crossfadeStart, crossfadeTime);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(postVcaNode);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Buscar clicks en la zona de transición
      const transitionStart = Math.floor(crossfadeStart * sampleRate);
      const transitionEnd = Math.floor((crossfadeStart + crossfadeTime * 5) * sampleRate);
      
      let maxJump = 0;
      const clickPositions = [];
      for (let i = transitionStart + 1; i < transitionEnd && i < samples.length; i++) {
        const jump = Math.abs(samples[i] - samples[i - 1]);
        if (jump > maxJump) maxJump = jump;
        if (jump > 0.1) clickPositions.push(i);
      }

      return {
        maxJump,
        clickCount: clickPositions.length,
        hasClicks: clickPositions.length > 0
      };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.hasClicks).toBe(false);
    expect(result.maxJump).toBeLessThan(0.08);
  });

  test('Crossfade filtros→bypass no produce clicks', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, testFrequency } = config;
      const duration = 0.2;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      
      const filterGain = offline.createGain();
      filterGain.gain.value = 1;  // Empieza con filtros activos
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 1000;
      filterLP.Q.value = 0.707;
      
      const bypassGain = offline.createGain();
      bypassGain.gain.value = 0;  // Empieza desactivado
      
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      postVcaNode.connect(filterGain);
      filterGain.connect(filterLP);
      filterLP.connect(muteNode);
      
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);
      
      muteNode.connect(offline.destination);

      // Crossfade: filtros→bypass
      const crossfadeTime = 0.05;
      const crossfadeStart = 0.05;
      filterGain.gain.setTargetAtTime(0, crossfadeStart, crossfadeTime);
      bypassGain.gain.setTargetAtTime(1, crossfadeStart, crossfadeTime);

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(postVcaNode);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      const transitionStart = Math.floor(crossfadeStart * sampleRate);
      const transitionEnd = Math.floor((crossfadeStart + crossfadeTime * 5) * sampleRate);
      
      let maxJump = 0;
      const clickPositions = [];
      for (let i = transitionStart + 1; i < transitionEnd && i < samples.length; i++) {
        const jump = Math.abs(samples[i] - samples[i - 1]);
        if (jump > maxJump) maxJump = jump;
        if (jump > 0.1) clickPositions.push(i);
      }

      return {
        maxJump,
        clickCount: clickPositions.length,
        hasClicks: clickPositions.length > 0
      };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.hasClicks).toBe(false);
    expect(result.maxJump).toBeLessThan(0.08);
  });

  test('Crossfade rápido ida-vuelta no produce clicks', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, testFrequency } = config;
      const duration = 0.4;  // 400ms para dos transiciones
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;
      
      const filterGain = offline.createGain();
      filterGain.gain.value = 0;
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 2000;  // Filtro suave para no cambiar mucho el timbre
      filterLP.Q.value = 0.707;
      
      const bypassGain = offline.createGain();
      bypassGain.gain.value = 1;
      
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      postVcaNode.connect(filterGain);
      filterGain.connect(filterLP);
      filterLP.connect(muteNode);
      
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);
      
      muteNode.connect(offline.destination);

      const crossfadeTime = 0.05;  // 50ms como en el engine
      
      // Primera transición: bypass→filtros en t=0.05
      filterGain.gain.setTargetAtTime(1, 0.05, crossfadeTime);
      bypassGain.gain.setTargetAtTime(0, 0.05, crossfadeTime);
      
      // Segunda transición: filtros→bypass en t=0.2
      filterGain.gain.setTargetAtTime(0, 0.2, crossfadeTime);
      bypassGain.gain.setTargetAtTime(1, 0.2, crossfadeTime);

      // Usar sine para evitar discontinuidades naturales de sawtooth
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = testFrequency;
      osc.connect(postVcaNode);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Buscar clicks en todo el buffer - umbral alto para doble transición con sawtooth
      let maxJump = 0;
      const clickPositions = [];
      for (let i = 1; i < samples.length; i++) {
        const jump = Math.abs(samples[i] - samples[i - 1]);
        if (jump > maxJump) maxJump = jump;
        // Umbral más tolerante: sawtooth tiene discontinuidades naturales ~0.04
        // El filtro LP puede amplificar diferencias en transiciones
        if (jump > 0.25) clickPositions.push(i);
      }

      return {
        maxJump,
        clickCount: clickPositions.length,
        hasClicks: clickPositions.length > 0
      };
    }, OUTPUT_CHANNEL_CONFIG);

    expect(result.hasClicks).toBe(false);
    expect(result.maxJump).toBeLessThan(0.15);  // Tolerancia para doble crossfade con sawtooth
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE FILTROS LP/HP
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Filtros LP/HP', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  test('Filtro en posición neutral no colorea la señal', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration, testFrequency } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,  // Canal 0: bypass, Canal 1: a través de filtros
        length,
        sampleRate
      });

      const source = offline.createGain();
      source.gain.value = 1.0;
      
      // Ruta bypass
      const bypassOut = offline.createGain();
      bypassOut.gain.value = 1.0;
      
      // Ruta filtros (configurados para pasar todo = neutral)
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 20000;  // Pasa todo
      filterLP.Q.value = 0.707;
      
      const filterHP = offline.createBiquadFilter();
      filterHP.type = 'highpass';
      filterHP.frequency.value = 20;  // Pasa todo
      filterHP.Q.value = 0.707;
      
      const filterOut = offline.createGain();
      filterOut.gain.value = 1.0;

      source.connect(bypassOut);
      source.connect(filterLP);
      filterLP.connect(filterHP);
      filterHP.connect(filterOut);

      const merger = offline.createChannelMerger(2);
      bypassOut.connect(merger, 0, 0);
      filterOut.connect(merger, 0, 1);
      merger.connect(offline.destination);

      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = testFrequency;
      osc.connect(source);
      osc.start(0);

      const buffer = await offline.startRendering();
      const bypassSamples = buffer.getChannelData(0);
      const filterSamples = buffer.getChannelData(1);

      // Comparar RMS
      let sumBypass = 0, sumFilter = 0;
      for (let i = 0; i < bypassSamples.length; i++) {
        sumBypass += bypassSamples[i] * bypassSamples[i];
        sumFilter += filterSamples[i] * filterSamples[i];
      }
      const rmsBypass = Math.sqrt(sumBypass / bypassSamples.length);
      const rmsFilter = Math.sqrt(sumFilter / filterSamples.length);

      return {
        rmsBypass,
        rmsFilter,
        ratio: rmsFilter / rmsBypass
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // Deben ser prácticamente iguales (>95%)
    expect(result.ratio).toBeGreaterThan(0.95);
    expect(result.ratio).toBeLessThan(1.05);
  });

  test('LP activo atenúa frecuencias altas', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,
        length,
        sampleRate
      });

      const source = offline.createGain();
      source.gain.value = 1.0;
      
      // Sin filtro
      const noFilterOut = offline.createGain();
      noFilterOut.gain.value = 1.0;
      
      // Con LP en 500Hz
      const filterLP = offline.createBiquadFilter();
      filterLP.type = 'lowpass';
      filterLP.frequency.value = 500;
      filterLP.Q.value = 0.707;
      
      source.connect(noFilterOut);
      source.connect(filterLP);

      const merger = offline.createChannelMerger(2);
      noFilterOut.connect(merger, 0, 0);
      filterLP.connect(merger, 0, 1);
      merger.connect(offline.destination);

      // Sine alta (5kHz) para asegurar atenuación fuerte en LP 500Hz
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 5000;
      osc.connect(source);
      osc.start(0);

      const buffer = await offline.startRendering();
      const noFilterSamples = buffer.getChannelData(0);
      const filteredSamples = buffer.getChannelData(1);

      let sumNoFilter = 0, sumFiltered = 0;
      for (let i = 0; i < noFilterSamples.length; i++) {
        sumNoFilter += noFilterSamples[i] * noFilterSamples[i];
        sumFiltered += filteredSamples[i] * filteredSamples[i];
      }
      const rmsNoFilter = Math.sqrt(sumNoFilter / noFilterSamples.length);
      const rmsFiltered = Math.sqrt(sumFiltered / filteredSamples.length);

      return {
        rmsNoFilter,
        rmsFiltered,
        attenuation: 1 - (rmsFiltered / rmsNoFilter)
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // El filtro debe atenuar significativamente
    expect(result.rmsFiltered).toBeLessThan(result.rmsNoFilter);
    expect(result.attenuation).toBeGreaterThan(0.5);  // >50% atenuación
  });

  test('HP activo atenúa frecuencias bajas', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, duration } = config;
      const length = Math.ceil(sampleRate * duration);
      
      const offline = new OfflineAudioContext({
        numberOfChannels: 2,
        length,
        sampleRate
      });

      const source = offline.createGain();
      source.gain.value = 1.0;
      
      const noFilterOut = offline.createGain();
      noFilterOut.gain.value = 1.0;
      
      // HP en 2000Hz (cortará fundamental de 200Hz)
      const filterHP = offline.createBiquadFilter();
      filterHP.type = 'highpass';
      filterHP.frequency.value = 2000;
      filterHP.Q.value = 0.707;
      
      source.connect(noFilterOut);
      source.connect(filterHP);

      const merger = offline.createChannelMerger(2);
      noFilterOut.connect(merger, 0, 0);
      filterHP.connect(merger, 0, 1);
      merger.connect(offline.destination);

      // Señal a 200Hz
      const osc = offline.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 200;
      osc.connect(source);
      osc.start(0);

      const buffer = await offline.startRendering();
      const noFilterSamples = buffer.getChannelData(0);
      const filteredSamples = buffer.getChannelData(1);

      let sumNoFilter = 0, sumFiltered = 0;
      for (let i = 0; i < noFilterSamples.length; i++) {
        sumNoFilter += noFilterSamples[i] * noFilterSamples[i];
        sumFiltered += filteredSamples[i] * filteredSamples[i];
      }
      const rmsNoFilter = Math.sqrt(sumNoFilter / noFilterSamples.length);
      const rmsFiltered = Math.sqrt(sumFiltered / filteredSamples.length);

      return {
        rmsNoFilter,
        rmsFiltered,
        attenuation: 1 - (rmsFiltered / rmsNoFilter)
      };
    }, OUTPUT_CHANNEL_CONFIG);

    // HP debe atenuar la fundamental
    expect(result.rmsFiltered).toBeLessThan(result.rmsNoFilter);
    expect(result.attenuation).toBeGreaterThan(0.5);  // >50% atenuación
  });

});
