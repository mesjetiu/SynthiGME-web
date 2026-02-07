/**
 * Tests de Audio: DC Offset / Señal LF residual en Output Channels
 * 
 * Verifica que la cadena de señal del Output Channel no genera señal
 * espuria de baja frecuencia cuando no hay entrada. Problema reportado:
 * al usar un Output Channel como fuente CV para FM, el tono del oscilador
 * deriva lentamente sin que nada cambie.
 * 
 * Fuentes potenciales investigadas:
 * 1. DC blocker AudioWorklet 1er orden a 0.01 Hz — red de seguridad para DC
 *    puro. Auto-reset tras ~50ms de silencio elimina settling lento.
 * 2. setTargetAtTime(0) nunca llega a cero exacto → fuga por crossfade
 * 3. OutputFilter worklet IIR acumulando estado residual
 * 4. VCA slew filter con convergencia asintótica
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
// TESTS: DC BLOCKER (AudioWorklet 1er orden, 0.01 Hz, auto-reset)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Señal residual sin entrada', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: DC Blocker con silencio no debe generar señal
  // ─────────────────────────────────────────────────────────────────────────

  test('DC blocker AudioWorklet 0.01Hz con silencio no genera señal (2s)', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, longDuration } = config;
      const length = Math.ceil(sampleRate * longDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // DC Blocker AudioWorklet 1er orden (idéntico al de engine.js)
      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      // Conectar silencio → dcBlocker → output
      // OfflineAudioContext no genera silencio explícito en un nodo desconectado,
      // así que usamos un GainNode con gain=0 como fuente de silencio
      const silenceSource = offline.createGain();
      silenceSource.gain.value = 0;

      // Necesitamos una fuente activa para que fluya audio
      const osc = offline.createOscillator();
      osc.frequency.value = 440;
      osc.connect(silenceSource);
      silenceSource.connect(dcBlocker);
      dcBlocker.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Analizar señal completa
      let peak = 0, rms = 0, mean = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        mean += v;
        rms += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      mean /= samples.length;
      rms = Math.sqrt(rms / samples.length);

      // Analizar segunda mitad (después del transitorio inicial)
      const halfStart = Math.floor(samples.length / 2);
      let peakSecondHalf = 0, rmsSecondHalf = 0;
      for (let i = halfStart; i < samples.length; i++) {
        const v = samples[i];
        rmsSecondHalf += v * v;
        if (Math.abs(v) > peakSecondHalf) peakSecondHalf = Math.abs(v);
      }
      rmsSecondHalf = Math.sqrt(rmsSecondHalf / (samples.length - halfStart));

      return { peak, rms, mean, peakSecondHalf, rmsSecondHalf };
    }, DC_OFFSET_CONFIG);

    // Con entrada de silencio puro, la salida debe ser silencio
    // Tolerancia: peak < 1e-6 (≈-120 dBFS)
    expect(result.peak).toBeLessThan(1e-6);
    expect(result.rms).toBeLessThan(1e-7);
    expect(result.peakSecondHalf).toBeLessThan(1e-6);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: DC Blocker con escalón DC genera transitorio pero converge a 0
  // ─────────────────────────────────────────────────────────────────────────

  test('DC Blocker: transitorio por escalón DC converge a cero', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, longDuration } = config;
      const length = Math.ceil(sampleRate * longDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // DC Blocker AudioWorklet 1er orden
      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      // Fuente: DC constante de 1.0V (simula offset del VCA)
      const dcSource = offline.createConstantSource();
      dcSource.offset.value = 1.0;

      dcSource.connect(dcBlocker);
      dcBlocker.connect(offline.destination);
      dcSource.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Muestrear en intervalos para ver la convergencia
      const snapshots = [];
      const intervals = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 1.5, 1.9];
      for (const t of intervals) {
        const idx = Math.min(Math.floor(t * sampleRate), samples.length - 1);
        snapshots.push({ time: t, value: samples[idx] });
      }

      // Peak en el último cuarto
      const lastQuarter = Math.floor(samples.length * 0.75);
      let peakLastQuarter = 0;
      for (let i = lastQuarter; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peakLastQuarter) peakLastQuarter = Math.abs(samples[i]);
      }

      return { snapshots, peakLastQuarter };
    }, DC_OFFSET_CONFIG);

    // El DC blocker a 0.01Hz con DC constante: τ ≈ 1/(2π·0.01) ≈ 16s
    // En 2s habrá decaído parcialmente. La tendencia debe ser decreciente.
    const values = result.snapshots.map(s => Math.abs(s.value));
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    
    // La señal debe estar decreciendo (o al menos no creciendo)
    expect(lastValue).toBeLessThan(firstValue);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: setTargetAtTime(0) → valor residual después de 5τ
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
  // TEST 5: Cadena re-entry con DC blocker — transiente inicial
  // ─────────────────────────────────────────────────────────────────────────
  // Simula: una señal entra y sale de un OC. Cuando la señal se detiene,
  // ¿cuánto tarda la salida de re-entry (post dcBlocker) en ser silencio?
  // ─────────────────────────────────────────────────────────────────────────

  test('Re-entry: señal residual tras detener fuente converge a cero', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, longDuration } = config;
      const length = Math.ceil(sampleRate * longDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Señal que dura 0.2s y luego se detiene
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      const envelope = offline.createGain();
      envelope.gain.value = 1.0;
      // Corte abrupto en t=0.2s
      envelope.gain.setValueAtTime(1.0, 0.2 - 0.001);
      envelope.gain.linearRampToValueAtTime(0, 0.2);

      // Cadena simplificada de re-entry
      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      osc.connect(envelope);
      envelope.connect(postVcaNode);
      postVcaNode.connect(dcBlocker);
      dcBlocker.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      // Medir residuo en intervalos después de t=0.2s
      const snapshots = [];
      const checkTimes = [0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75];
      const windowSize = 256;

      for (const t of checkTimes) {
        const startIdx = Math.floor(t * sampleRate);
        const endIdx = Math.min(startIdx + windowSize, samples.length);
        let peak = 0, mean = 0;
        for (let i = startIdx; i < endIdx; i++) {
          const v = samples[i];
          mean += v;
          if (Math.abs(v) > peak) peak = Math.abs(v);
        }
        mean /= (endIdx - startIdx);
        snapshots.push({ time: t, peak, mean, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity });
      }

      // Último segundo
      const lastSecondStart = Math.floor(sampleRate);
      let peakLastSecond = 0;
      for (let i = lastSecondStart; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peakLastSecond) peakLastSecond = Math.abs(samples[i]);
      }

      return { snapshots, peakLastSecond };
    }, DC_OFFSET_CONFIG);

    // La señal post-dcBlocker debería converger a silencio.
    // El DC blocker a 0.01Hz tiene τ ≈ 16s, settling lento.
    // Pero una señal 440Hz no tiene componente DC, así que el filtro
    // no almacena energía significativa. El residuo tras detener la
    // fuente (burst de 200ms) debe ser pequeño.
    const lastSnapshot = result.snapshots[result.snapshots.length - 1];
    expect(lastSnapshot.peak).toBeLessThan(0.01); // < 10mV
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Crossfade setTargetAtTime con hard-set final a 0
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

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Señal OC re-entry con fader a 0 — no debe filtrar señal residual
  // ─────────────────────────────────────────────────────────────────────────
  // Cuando el fader está a 0 (VCA gain = 0), la señal debería ser 0 exacto.
  // Si la cadena genera un micro-offset, el DC blocker lo convertiría
  // en una oscilación de muy baja frecuencia.
  // ─────────────────────────────────────────────────────────────────────────

  test('Re-entry con fader=0: dcBlocker no debe generar señal espuria', async ({ page }) => {
    const result = await page.evaluate(async (config) => {
      const { sampleRate, longDuration } = config;
      const length = Math.ceil(sampleRate * longDuration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 1,
        length,
        sampleRate
      });

      // Señal de entrada activa
      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;

      // VCA a ganancia 0 (fader abajo)
      const levelNode = offline.createGain();
      levelNode.gain.value = 0;

      const postVcaNode = offline.createGain();
      postVcaNode.gain.value = 1.0;

      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      osc.connect(levelNode);
      levelNode.connect(postVcaNode);
      postVcaNode.connect(dcBlocker);
      dcBlocker.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);

      let peak = 0;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
      }

      return { peak };
    }, DC_OFFSET_CONFIG);

    // Con VCA a 0, no debe haber señal alguna
    expect(result.peak).toBe(0);
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
// TESTS: FIDELIDAD DE FORMA DE ONDA POR RE-ENTRY
// ═══════════════════════════════════════════════════════════════════════════
// Verifica que señales LFO (≥ 1 Hz) pasan por el DC blocker sin
// distorsión significativa. El DC blocker a 0.01 Hz debe ser transparente
// para estas señales. Un blocker demasiado alto (ej: 2 Hz) destruye la
// forma de onda de una cuadrada de 1 Hz (99.8% droop en tramos planos).
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Output Channel - Fidelidad de forma de onda en re-entry', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Onda cuadrada 1Hz debe mantener tramos planos (droop < 5%)
  // ─────────────────────────────────────────────────────────────────────────
  // Una onda cuadrada de 1 Hz usada como CV para FM necesita mantener
  // los tramos planos. El DC blocker (highpass) introduce droop
  // exponencial en las porciones constantes. A 0.01 Hz (τ ≈ 16s) el
  // droop en 500ms es ~3%, aceptable. A 2 Hz (τ ≈ 80ms) era ~99.8%.
  // ─────────────────────────────────────────────────────────────────────────

  test('Onda cuadrada 1Hz: droop < 5% tras DC blocker 0.01Hz', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sampleRate = 44100;
      const duration = 3.0; // 3 ciclos completos
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2, // ch0: directo, ch1: con DC blocker
        length,
        sampleRate
      });

      // Onda cuadrada 1Hz (band-limited)
      const osc = offline.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1;

      // Ruta directa (canal 0) — referencia sin filtro
      const direct = offline.createGain();
      direct.gain.value = 1.0;

      // Ruta con DC blocker (canal 1) — AudioWorklet 1er orden como en engine.js
      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      const merger = offline.createChannelMerger(2);

      osc.connect(direct);
      direct.connect(merger, 0, 0);

      osc.connect(dcBlocker);
      dcBlocker.connect(merger, 0, 1);

      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const directSamples = buffer.getChannelData(0);
      const blockerSamples = buffer.getChannelData(1);

      // Medir en puntos medios de semiciclos (donde la cuadrada es más plana)
      // Semiciclos: +[0-0.5s], -[0.5-1s], +[1-1.5s], -[1.5-2s], +[2-2.5s], -[2.5-3s]
      const measurements = [];
      const midpoints = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75];
      const windowHalf = 128; // ±128 samples alrededor del punto medio

      for (const t of midpoints) {
        const center = Math.floor(t * sampleRate);
        const start = Math.max(0, center - windowHalf);
        const end = Math.min(length - 1, center + windowHalf);

        let directMean = 0, blockerMean = 0;
        let count = 0;
        for (let i = start; i <= end; i++) {
          directMean += directSamples[i];
          blockerMean += blockerSamples[i];
          count++;
        }
        directMean /= count;
        blockerMean /= count;

        const ratio = Math.abs(blockerMean / (directMean || 1));
        measurements.push({
          time: t,
          direct: directMean,
          blocked: blockerMean,
          ratio,
          droop: 1 - ratio
        });
      }

      // Droop máximo (excluir primer semiciclo que puede tener transitorio)
      const maxDroop = Math.max(...measurements.slice(1).map(m => m.droop));

      // Peak del segundo ciclo (ya estabilizado)
      const cycle2Start = Math.floor(1.0 * sampleRate);
      const cycle2End = Math.floor(2.0 * sampleRate);
      let directPeakC2 = 0, blockerPeakC2 = 0;
      for (let i = cycle2Start; i < cycle2End; i++) {
        if (Math.abs(directSamples[i]) > directPeakC2) {
          directPeakC2 = Math.abs(directSamples[i]);
        }
        if (Math.abs(blockerSamples[i]) > blockerPeakC2) {
          blockerPeakC2 = Math.abs(blockerSamples[i]);
        }
      }

      return {
        measurements,
        maxDroop,
        peakRatio: blockerPeakC2 / (directPeakC2 || 1),
        directPeakC2,
        blockerPeakC2
      };
    });

    // Droop debe ser < 5% para CV preciso en FM
    // A 0.01Hz: droop teórico ~3% por semiciclo de 500ms
    expect(result.maxDroop).toBeLessThan(0.05);

    // Peak ratio del segundo ciclo debe ser cercano a 1.0
    expect(result.peakRatio).toBeGreaterThan(0.95);

    console.log(`Square wave 1Hz droop: ${(result.maxDroop * 100).toFixed(1)}%`);
    console.log(`Peak ratio cycle 2: ${result.peakRatio.toFixed(4)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: Comparativa — 0.01Hz vs 2Hz en cuadrada 1Hz
  // ─────────────────────────────────────────────────────────────────────────
  // Demuestra que 2 Hz destruye la cuadrada (>90% droop) mientras que
  // 0.01 Hz la preserva (<5% droop). Sirve como regresión para evitar
  // que alguien suba la frecuencia del DC blocker en el futuro.
  // ─────────────────────────────────────────────────────────────────────────

  test('DC blocker 0.01Hz vs 2Hz: confirmar que 0.01Hz preserva cuadrada 1Hz', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sampleRate = 44100;
      const duration = 3.0;
      const length = Math.ceil(sampleRate * duration);

      // Función auxiliar: renderizar cuadrada 1Hz a través de un DC blocker
      async function renderWithBlocker(freq) {
        const offline = new OfflineAudioContext({
          numberOfChannels: 2, // ch0: directo, ch1: filtrado
          length,
          sampleRate
        });

        const osc = offline.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 1;

        // DC blocker AudioWorklet 1er orden con frecuencia variable
        await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
        const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
          channelCount: 1,
          channelCountMode: 'explicit',
          parameterData: { cutoffFrequency: freq }
        });

        const merger = offline.createChannelMerger(2);

        // ch0: directo (referencia)
        osc.connect(merger, 0, 0);

        // ch1: filtrado
        osc.connect(dcBlocker);
        dcBlocker.connect(merger, 0, 1);

        merger.connect(offline.destination);
        osc.start(0);

        const buffer = await offline.startRendering();
        return {
          direct: buffer.getChannelData(0),
          filtered: buffer.getChannelData(1)
        };
      }

      const r001 = await renderWithBlocker(0.01);
      const r2 = await renderWithBlocker(2);

      // Medir la distorsión de la forma de onda comparando con la señal directa.
      // Usamos el error RMS normalizado (NRMSE): cuanto más bajo, más fiel.
      // Zona de medición: segundo ciclo completo (excluir transitorio inicial)
      const analyzeStart = Math.floor(1.0 * sampleRate);
      const analyzeEnd = Math.floor(3.0 * sampleRate);

      function computeNRMSE(direct, filtered) {
        let sumSqError = 0, sumSqDirect = 0;
        for (let i = analyzeStart; i < analyzeEnd; i++) {
          const err = filtered[i] - direct[i];
          sumSqError += err * err;
          sumSqDirect += direct[i] * direct[i];
        }
        return Math.sqrt(sumSqError / sumSqDirect);
      }

      const nrmse001 = computeNRMSE(r001.direct, r001.filtered);
      const nrmse2 = computeNRMSE(r2.direct, r2.filtered);

      return {
        nrmse001,
        nrmse2,
        improvementRatio: nrmse2 / nrmse001
      };
    });

    // 0.01Hz: error normalizado < 5% (casi transparente)
    expect(result.nrmse001).toBeLessThan(0.05);

    // 2Hz: error normalizado > 50% (destruye la forma de onda)
    expect(result.nrmse2).toBeGreaterThan(0.5);

    // 0.01Hz debe ser al menos 10x mejor que 2Hz
    expect(result.improvementRatio).toBeGreaterThan(10);

    console.log(`0.01Hz NRMSE: ${(result.nrmse001 * 100).toFixed(1)}%, 2Hz NRMSE: ${(result.nrmse2 * 100).toFixed(1)}%`);
    console.log(`Improvement ratio: ${result.improvementRatio.toFixed(1)}x`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 12: Señal sinusoidal 1Hz debe pasar sin atenuación significativa
  // ─────────────────────────────────────────────────────────────────────────

  test('Sinusoidal 1Hz: atenuación < 0.1 dB tras DC blocker 0.01Hz', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const sampleRate = 44100;
      const duration = 2.0;
      const length = Math.ceil(sampleRate * duration);

      const offline = new OfflineAudioContext({
        numberOfChannels: 2,
        length,
        sampleRate
      });

      const osc = offline.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1;

      await offline.audioWorklet.addModule('/src/assets/js/worklets/dcBlocker.worklet.js');
      const dcBlocker = new AudioWorkletNode(offline, 'dc-blocker', {
        channelCount: 1,
        channelCountMode: 'explicit',
        parameterData: { cutoffFrequency: 0.01 }
      });

      const merger = offline.createChannelMerger(2);

      osc.connect(merger, 0, 0);        // ch0: directo
      osc.connect(dcBlocker);
      dcBlocker.connect(merger, 0, 1);   // ch1: con DC blocker

      merger.connect(offline.destination);
      osc.start(0);

      const buffer = await offline.startRendering();
      const direct = buffer.getChannelData(0);
      const filtered = buffer.getChannelData(1);

      // Medir peak en el segundo ciclo (estabilizado)
      const c2Start = Math.floor(1.0 * sampleRate);
      const c2End = Math.floor(2.0 * sampleRate);
      let directPeak = 0, filteredPeak = 0;
      for (let i = c2Start; i < c2End; i++) {
        if (Math.abs(direct[i]) > directPeak) directPeak = Math.abs(direct[i]);
        if (Math.abs(filtered[i]) > filteredPeak) filteredPeak = Math.abs(filtered[i]);
      }

      const ratio = filteredPeak / (directPeak || 1);
      const attenuationDb = -20 * Math.log10(ratio);

      return { directPeak, filteredPeak, ratio, attenuationDb };
    });

    // Atenuación a 1Hz debe ser < 0.1 dB (prácticamente transparente)
    expect(result.attenuationDb).toBeLessThan(0.1);
    expect(result.ratio).toBeGreaterThan(0.98);

    console.log(`1Hz sine attenuation: ${result.attenuationDb.toFixed(3)} dB (ratio: ${result.ratio.toFixed(4)})`);
  });

});
