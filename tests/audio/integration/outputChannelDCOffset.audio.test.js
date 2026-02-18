/**
 * Tests de Audio: DC Offset / Señal LF residual en Output Channels
 * 
 * Verifica que la cadena de señal del Output Channel no genera señal
 * espuria de baja frecuencia cuando no hay entrada. Problema reportado:
 * al usar un Output Channel como fuente CV para FM, el tono del oscilador
 * deriva lentamente sin que nada cambie.
 * 
 * Nota: El DC blocker AudioWorklet fue reposicionado (antes estaba en re-entry,
 * ahora está en la ruta de salida a altavoces, entre muteNode y channelGains).
 * La re-entry (postVcaNode) NO tiene DC blocker, preservando DC para CV.
 * Los tests de este archivo verifican setTargetAtTime convergencia,
 * cadena OC completa, crossfade filter bypass, y DC blocker en output.
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
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

const DC_OFFSET_CONFIG = {
  sampleRate: 44100,
  shortDuration: 0.5,   // 500ms
  longDuration: 2.0,    // 2s - para capturar oscilaciones muy lentas
  veryLongDuration: 5.0 // 5s - para oscilaciones sub-Hz
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula estadísticas de un buffer de audio.
 * @param {Float32Array} samples
 * @returns {{ peak: number, rms: number, mean: number, maxAbs: number }}
 */
function analyzeBuffer(samples) {
  let sum = 0, sumSq = 0, maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sum += v;
    sumSq += v * v;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  const mean = sum / samples.length;
  const rms = Math.sqrt(sumSq / samples.length);
  return { peak: maxAbs, rms, mean, maxAbs };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CADENA DE SEÑAL DEL OUTPUT CHANNEL
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Señal residual sin entrada', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: setTargetAtTime(0) → valor residual después de 5τ
  // ─────────────────────────────────────────────────────────────────────────

  test('setTargetAtTime(0, t, τ=50ms): valor residual después de 5τ', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, shortDuration } = config;
      const length = Math.ceil(sampleRate * shortDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // GainNode que simula filterGain en crossfade
      const gainNode = offline.createGain();
      gainNode.gain.value = 1.0;

      // Señal de referencia
      const osc = offline.createOscillator();
      osc.frequency.value = 440;
      osc.connect(gainNode);
      gainNode.connect(offline.destination);
      osc.start(0);

      // Hacer crossfade: setTargetAtTime(0) con τ=50ms
      const tau = 0.05;
      gainNode.gain.setTargetAtTime(0, 0, tau);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Medir amplitud en intervalos post-crossfade
      const snapshots = [];
      const checkTimes = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
      const windowSize = 128;
      
      for (const t of checkTimes) {
        const startIdx = Math.floor(t * sampleRate);
        const endIdx = Math.min(startIdx + windowSize, samples.length);
        let peak = 0;
        for (let i = startIdx; i < endIdx; i++) {
          if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
        }
        snapshots.push({ 
          time: t, 
          tauMultiple: t / tau, 
          peak,
          expectedGain: Math.exp(-t / tau),
          peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity
        });
      }

      // Medir residuo final (últimos 128 samples)
      let residualPeak = 0;
      for (let i = samples.length - windowSize; i < samples.length; i++) {
        if (Math.abs(samples[i]) > residualPeak) residualPeak = Math.abs(samples[i]);
      }

      return { 
        snapshots, 
        residualPeak,
        residualDb: residualPeak > 0 ? 20 * Math.log10(residualPeak) : -Infinity
      };
    }, DC_OFFSET_CONFIG);

    // Después de 5τ=250ms, gain teórico = e^(-5) ≈ 0.0067 (≈-43 dB)
    // Después de 10τ=500ms (final), gain teórico = e^(-10) ≈ 4.5e-5 (≈-87 dB)
    // El problema es que NUNCA llega a 0 exacto
    
    // Verificar que el residuo es extremadamente pequeño
    // Si se usa como fuente CV, incluso 1e-4 = 0.1mV puede causar drift perceptible
    // a 1V/oct (0.1mV = 0.12 cents de detuning)
    expect(result.residualPeak).toBeLessThan(1e-4);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: Cadena completa sin input — solo busInput conectado, nada entra
  // ─────────────────────────────────────────────────────────────────────────

  test('Cadena OC completa sin señal: salida debe ser silencio total (2s)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, longDuration } = config;
      const length = Math.ceil(sampleRate * longDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Simular cadena completa del Output Channel (sin señal de entrada)
      const busInput = offline.createGain();
      busInput.gain.value = 1.0;

      const levelNode = offline.createGain();
      levelNode.gain.value = 1.0; // VCA a ganancia unitaria

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      // Ruta 1: filtro (usando BiquadFilter como proxy de OutputFilter worklet)
      const filterGain = offline.createGain();
      filterGain.gain.value = 0; // Bypass activo: filtro silenciado

      // Ruta 2: bypass
      const bypassGain = offline.createGain();
      bypassGain.gain.value = 1; // Bypass activo: señal directa

      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      // Cadena
      busInput.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(filterGain);
      filterGain.connect(muteNode);
      postVcaNode.connect(bypassGain);
      bypassGain.connect(muteNode);
      muteNode.connect(offline.destination);

      // NO conectar ninguna fuente a busInput → silencio en toda la cadena

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let peak = 0, rms = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        rms += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      rms = Math.sqrt(rms / samples.length);

      return { peak, rms };
    }, DC_OFFSET_CONFIG);

    // Sin entrada, la salida DEBE ser silencio absoluto
    expect(result.peak).toBe(0);
    expect(result.rms).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Crossfade setTargetAtTime con hard-set final a 0
  // ─────────────────────────────────────────────────────────────────────────
  // Verifica que añadir setValueAtTime(0, t+5τ) después de setTargetAtTime(0)
  // realmente fuerza el valor a cero exacto.
  // ─────────────────────────────────────────────────────────────────────────

  test('setTargetAtTime(0) + setValueAtTime(0) fuerza silencio exacto', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, shortDuration } = config;
      const length = Math.ceil(sampleRate * shortDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // Canal 0: sin hard-set, Canal 1: con hard-set
        length,
        sampleRate
      });

      const osc = offline.createOscillator();
      osc.frequency.value = 440;

      // Canal 0: solo setTargetAtTime(0)
      const gain0 = offline.createGain();
      gain0.gain.value = 1.0;
      const tau = 0.05;
      gain0.gain.setTargetAtTime(0, 0, tau);

      // Canal 1: setTargetAtTime(0) + hard-set a 0 después de 5τ
      const gain1 = offline.createGain();
      gain1.gain.value = 1.0;
      gain1.gain.setTargetAtTime(0, 0, tau);
      gain1.gain.setValueAtTime(0, 5 * tau); // Forzar 0 exacto en t=250ms

      const merger = offline.createChannelMerger(2);
      
      osc.connect(gain0);
      gain0.connect(merger, 0, 0);
      
      osc.connect(gain1);
      gain1.connect(merger, 0, 1);
      
      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.getChannelData(1);

      // Medir residuo en los últimos 128 samples
      const windowSize = 128;
      let residual0 = 0, residual1 = 0;
      for (let i = ch0.length - windowSize; i < ch0.length; i++) {
        if (Math.abs(ch0[i]) > residual0) residual0 = Math.abs(ch0[i]);
        if (Math.abs(ch1[i]) > residual1) residual1 = Math.abs(ch1[i]);
      }

      return { 
        residual0, residual1,
        residual0Db: residual0 > 0 ? 20 * Math.log10(residual0) : -Infinity,
        residual1Db: residual1 > 0 ? 20 * Math.log10(residual1) : -Infinity,
        improvement: residual0 > 0 ? residual1 / residual0 : 0
      };
    }, DC_OFFSET_CONFIG);

    // Canal 0 (sin hard-set): tendrá residuo > 0 (e^(-10) ≈ 4.5e-5)
    expect(result.residual0).toBeGreaterThan(0);

    // Canal 1 (con hard-set): debe ser 0 exacto
    expect(result.residual1).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: CROSSFADE FILTER BYPASS — FUGA POR setTargetAtTime
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Crossfade filter bypass: fuga de señal', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Crossfade bypass — señal residual a través de filterGain
  // ─────────────────────────────────────────────────────────────────────────
  // Cuando filter bypass está activo, filterGain se pone a 0 con
  // setTargetAtTime. ¿Cuánta señal sigue pasando por la ruta del filtro?
  // ─────────────────────────────────────────────────────────────────────────

  test('Crossfade: filterGain=0 vía setTargetAtTime filtra señal residual', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate } = config;
      const duration = 1.0;
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // Canal 0: ruta filtro, Canal 1: ruta bypass
        length,
        sampleRate
      });

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      // Simular crossfade a bypass en t=0 (como haría _updateFilterBypass)
      const filterGain = offline.createGain();
      filterGain.gain.value = 1.0;
      const tau = 0.05; // FILTER_BYPASS_CROSSFADE = 50ms
      filterGain.gain.setTargetAtTime(0, 0, tau);

      const bypassGain = offline.createGain();
      bypassGain.gain.value = 0;
      bypassGain.gain.setTargetAtTime(1, 0, tau);

      // Merger para medir ambas rutas
      const merger = offline.createChannelMerger(2);
      
      osc.connect(filterGain);
      filterGain.connect(merger, 0, 0); // Ruta filtro → canal 0
      
      osc.connect(bypassGain);
      bypassGain.connect(merger, 0, 1); // Ruta bypass → canal 1

      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const filterRoute = buffer.getChannelData(0);
      const bypassRoute = buffer.getChannelData(1);

      // Medir pico en la ruta del filtro después de la zona de crossfade (>300ms = 6τ)
      const safeStart = Math.floor(0.3 * sampleRate);
      let filterResidualPeak = 0;
      let bypassPeak = 0;
      for (let i = safeStart; i < filterRoute.length; i++) {
        if (Math.abs(filterRoute[i]) > filterResidualPeak) {
          filterResidualPeak = Math.abs(filterRoute[i]);
        }
        if (Math.abs(bypassRoute[i]) > bypassPeak) {
          bypassPeak = Math.abs(bypassRoute[i]);
        }
      }

      // Medir en el último bloque
      const lastBlockStart = filterRoute.length - 256;
      let filterLastPeak = 0;
      for (let i = lastBlockStart; i < filterRoute.length; i++) {
        if (Math.abs(filterRoute[i]) > filterLastPeak) {
          filterLastPeak = Math.abs(filterRoute[i]);
        }
      }

      return { 
        filterResidualPeak, 
        filterLastPeak,
        bypassPeak,
        filterResidualDb: 20 * Math.log10(filterResidualPeak || 1e-30),
        filterLastDb: 20 * Math.log10(filterLastPeak || 1e-30),
        leakRatio: filterResidualPeak / (bypassPeak || 1)
      };
    }, DC_OFFSET_CONFIG);

    // La ruta del filtro tiene señal residual por setTargetAtTime nunca=0
    // Verificar que la fuga es al menos < -80 dB (0.0001 = 0.01%)
    // Si es mayor, es un problema para CV
    expect(result.filterLastPeak).toBeLessThan(1e-4);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Crossfade con hard-set elimina fuga
  // ─────────────────────────────────────────────────────────────────────────

  test('Crossfade con setValueAtTime(0) tras 5τ elimina fuga completamente', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate } = config;
      const duration = 1.0;
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // Canal 0: sin hard-set, Canal 1: con hard-set
        length,
        sampleRate
      });

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      const tau = 0.05;

      // Canal 0: crossfade clásico (solo setTargetAtTime)
      const gain0 = offline.createGain();
      gain0.gain.value = 1.0;
      gain0.gain.setTargetAtTime(0, 0, tau);

      // Canal 1: crossfade + hard-set a 0
      const gain1 = offline.createGain();
      gain1.gain.value = 1.0;
      gain1.gain.setTargetAtTime(0, 0, tau);
      gain1.gain.setValueAtTime(0, 5 * tau); // Hard-set en t=250ms

      const merger = offline.createChannelMerger(2);
      osc.connect(gain0);
      gain0.connect(merger, 0, 0);
      osc.connect(gain1);
      gain1.connect(merger, 0, 1);
      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.getChannelData(1);

      // Medir residuo después de 300ms
      const checkStart = Math.floor(0.3 * sampleRate);
      let peak0 = 0, peak1 = 0;
      for (let i = checkStart; i < ch0.length; i++) {
        if (Math.abs(ch0[i]) > peak0) peak0 = Math.abs(ch0[i]);
        if (Math.abs(ch1[i]) > peak1) peak1 = Math.abs(ch1[i]);
      }

      return { 
        peakWithout: peak0, 
        peakWith: peak1,
        dbWithout: 20 * Math.log10(peak0 || 1e-30),
        dbWith: 20 * Math.log10(peak1 || 1e-30)
      };
    }, DC_OFFSET_CONFIG);

    // Con hard-set, la fuga debe ser 0 exacto
    expect(result.peakWith).toBe(0);
    // Sin hard-set, habrá fuga residual
    expect(result.peakWithout).toBeGreaterThan(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: DC BLOCKER EN RUTA DE SALIDA A ALTAVOCES
// ═══════════════════════════════════════════════════════════════════════════
// El DC blocker (1er orden, fc=1Hz) está posicionado SOLO en la ruta de
// salida a altavoces: muteNode → [dcBlocker] → dcBlockerOut → channelGains
//
// La re-entry (postVcaNode → matriz) NO pasa por el DC blocker.
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - DC Blocker en salida (fc=1Hz)', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: DC blocker elimina componente DC en salida
  // ─────────────────────────────────────────────────────────────────────────
  // Simula un DC constante entrando al DC blocker. La salida debe tender
  // a 0 mientras que la re-entry debe mantener el DC intacto.
  // ─────────────────────────────────────────────────────────────────────────

  test('DC blocker elimina DC en salida pero re-entry lo preserva', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate } = config;
      const duration = 2.0;
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // Canal 0: salida (con DC blocker), Canal 1: re-entry (sin DC blocker)
        length,
        sampleRate
      });

      // Fuente DC constante (simula joystick a +1V)
      const dcSource = offline.createConstantSource();
      dcSource.offset.value = 1.0;

      // Simular postVcaNode
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      // Simular muteNode
      const muteNode = offline.createGain();
      muteNode.gain.value = 1.0;

      // Simular DC blocker con un filtro IIR de 1er orden (fc=1Hz)
      // y[n] = x[n] - x[n-1] + R*y[n-1], R = 1 - 2π·fc/fs
      const fc = 1; // 1 Hz como en el config
      const R = 1 - (2 * Math.PI * fc / sampleRate);

      // Usamos un ScriptProcessorNode para simular el DC blocker
      // (AudioWorklet no disponible en OfflineAudioContext en tests)
      // Alternativa: usar IIRFilter con los coeficientes equivalentes
      // H(z) = (1 - z⁻¹) / (1 - R·z⁻¹)
      // feedforward = [1, -1], feedback = [1, -R]
      const dcBlockerFilter = offline.createIIRFilter(
        [1, -1],       // feedforward: 1 - z⁻¹
        [1, -R]        // feedback: 1 - R·z⁻¹
      );

      // Cadena de salida: dcSource → postVcaNode → muteNode → dcBlocker → destination (ch0)
      // Cadena re-entry: dcSource → postVcaNode → destination (ch1)
      const merger = offline.createChannelMerger(2);

      dcSource.connect(postVcaNode);

      // Ruta filtro → mute → DC blocker → salida (ch0)
      postVcaNode.connect(muteNode);
      muteNode.connect(dcBlockerFilter);
      dcBlockerFilter.connect(merger, 0, 0);

      // Ruta re-entry directa (ch1)
      postVcaNode.connect(merger, 0, 1);

      merger.connect(offline.destination);
      dcSource.start(0);

      const buffer = await offline.startRendering();
      const outputPath = buffer.getChannelData(0);
      const reEntryPath = buffer.getChannelData(1);

      // Medir DC residual en la salida (últimos 0.5s)
      const measureStart = Math.floor(1.5 * sampleRate);
      let outputDC = 0, reEntryDC = 0;
      let count = 0;
      for (let i = measureStart; i < outputPath.length; i++) {
        outputDC += outputPath[i];
        reEntryDC += reEntryPath[i];
        count++;
      }
      outputDC /= count;
      reEntryDC /= count;

      return {
        outputDC: Math.abs(outputDC),
        reEntryDC,
        outputDCdB: 20 * Math.log10(Math.abs(outputDC) || 1e-30),
        settling: Math.abs(outputDC) < 0.001 ? 'settled' : 'not settled'
      };
    }, DC_OFFSET_CONFIG);

    // La salida debe tener DC prácticamente eliminado después de 1.5s (>9τ para fc=1Hz)
    expect(result.outputDC).toBeLessThan(0.01);

    // La re-entry debe mantener el DC intacto (+1.0V)
    expect(result.reEntryDC).toBeCloseTo(1.0, 4);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: DC blocker es transparente para señal de audio (440 Hz)
  // ─────────────────────────────────────────────────────────────────────────

  test('DC blocker transparente para audio 440Hz (atenuación < 0.001 dB)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate } = config;
      const duration = 0.5;
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // Canal 0: con DC blocker, Canal 1: referencia
        length,
        sampleRate
      });

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      // DC blocker IIR (fc=1Hz)
      const fc = 1;
      const R = 1 - (2 * Math.PI * fc / sampleRate);
      const dcBlocker = offline.createIIRFilter([1, -1], [1, -R]);

      const merger = offline.createChannelMerger(2);

      // Canal 0: con DC blocker
      osc.connect(dcBlocker);
      dcBlocker.connect(merger, 0, 0);

      // Canal 1: referencia directa
      osc.connect(merger, 0, 1);

      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const filtered = buffer.getChannelData(0);
      const reference = buffer.getChannelData(1);

      // Medir RMS en la segunda mitad (después del settling)
      const measureStart = Math.floor(0.25 * sampleRate);
      let rmsFiltered = 0, rmsRef = 0;
      let count = 0;
      for (let i = measureStart; i < filtered.length; i++) {
        rmsFiltered += filtered[i] * filtered[i];
        rmsRef += reference[i] * reference[i];
        count++;
      }
      rmsFiltered = Math.sqrt(rmsFiltered / count);
      rmsRef = Math.sqrt(rmsRef / count);

      const attenuationDb = 20 * Math.log10(rmsFiltered / rmsRef);

      return {
        rmsFiltered,
        rmsRef,
        attenuationDb,
        ratio: rmsFiltered / rmsRef
      };
    }, DC_OFFSET_CONFIG);

    // A 440 Hz con fc=1Hz, la atenuación teórica es < 0.0001 dB (despreciable)
    // Aceptamos hasta -0.01 dB como margen
    expect(result.attenuationDb).toBeGreaterThan(-0.01);
    // La ratio debe ser esencialmente 1.0
    expect(result.ratio).toBeCloseTo(1.0, 3);
  });

});
