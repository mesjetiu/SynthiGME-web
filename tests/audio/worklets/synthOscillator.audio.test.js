/**
 * Tests de Audio Real para SynthOscillator Worklet
 * 
 * Verifica el procesamiento de audio del oscilador usando OfflineAudioContext
 * y el worklet real, no mocks. Incluye:
 * 
 * - Generación de formas de onda (sine, sawtooth, triangle, pulse)
 * - Alineación de fase entre formas de onda
 * - Anti-aliasing (PolyBLEP)
 * - Parámetros modulables (frequency, pulseWidth, symmetry)
 * - Modo multi-waveform
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import {
  setupAudioPage,
  verifyFrequency,
  verifyTHD,
  verifyPhaseAlignment,
  createOscillatorConfig,
  generateFrequencySweepCases,
  generateWaveformCases,
  TEST_FREQUENCIES,
  TEST_TOLERANCES,
  DEFAULT_TEST_CONFIG,
  formatTestResult,
  compareWithExpected
} from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE TESTS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('SynthOscillator AudioWorklet - Tests de Audio Real', () => {
  
  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE FORMAS DE ONDA BÁSICAS
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Formas de Onda Básicas', () => {

    test('Sine wave @ 440Hz debe generar frecuencia correcta', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      // Verificar frecuencia dominante
      expect(result.dominant).not.toBeNull();
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);

      // Sine puro debe tener THD muy bajo
      expect(result.thd).toBeLessThan(TEST_TOLERANCES.thd.pure);

      // Verificar alineación de fase (sine empieza en pico)
      const phaseCheck = verifyPhaseAlignment(result.phaseAnalysis, 'sine');
      expect(phaseCheck.valid).toBe(true);
    });

    test('Sawtooth wave @ 440Hz debe tener armónicos correctos', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sawtooth',
        frequency: 440,
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      expect(result.dominant).not.toBeNull();
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);

      // Sawtooth tiene todos los armónicos con amplitud 1/n
      // Verificar que al menos los primeros 3 armónicos existen
      const harmonics = result.harmonics.filter(h => h.found && h.found.db > -40);
      expect(harmonics.length).toBeGreaterThanOrEqual(3);

      // H1 (fundamental) debe ser el más fuerte
      expect(result.harmonics[0].found.magnitude)
        .toBeGreaterThan(result.harmonics[1].found?.magnitude || 0);
    });

    test('Triangle wave @ 440Hz debe tener solo armónicos impares', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'triangle',
        frequency: 440,
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      expect(result.dominant).not.toBeNull();
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);

      // Triangle: armónicos impares (1, 3, 5...) con amplitud 1/n²
      // Los armónicos pares (2, 4, 6...) deben ser muy débiles
      const h2 = result.harmonics[1]; // Armónico 2 (par)
      const h3 = result.harmonics[2]; // Armónico 3 (impar)

      if (h2.found && h3.found) {
        // H3 debe ser significativamente más fuerte que H2
        expect(h3.found.db).toBeGreaterThan(h2.found.db + 10);
      }
    });

    test('Pulse wave @ 440Hz con duty cycle 50% debe ser square', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'pulse',
        frequency: 440,
        duration: 0.5,
        pulseWidth: 0.5  // 50% = square
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      expect(result.dominant).not.toBeNull();
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);

      // Square (pulse 50%) tiene solo armónicos impares
      // Similar a triangle pero con diferente distribución
      const h2 = result.harmonics[1];
      const h3 = result.harmonics[2];

      if (h2.found && h3.found) {
        expect(h3.found.db).toBeGreaterThan(h2.found.db + 6);
      }
    });

    test('Pulse wave con duty cycle variable debe cambiar espectro', async ({ page }) => {
      // Test con duty cycle 25% - tiene todos los armónicos excepto cada 4to
      const config = createOscillatorConfig({
        waveform: 'pulse',
        frequency: 440,
        duration: 0.5,
        pulseWidth: 0.25
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      expect(result.dominant).not.toBeNull();

      // Con duty 25%, H4 y H8 deben ser muy débiles (nulls del espectro)
      const h4 = result.harmonics[3];
      const h3 = result.harmonics[2];

      if (h3.found && h4.found) {
        // H4 debe ser significativamente más débil que H3
        expect(h4.found.db).toBeLessThan(h3.found.db - 10);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE BARRIDO DE FRECUENCIA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Barrido de Frecuencia', () => {
    const testFrequencies = [50, 100, 440, 1000, 5000, 10000];

    for (const freq of testFrequencies) {
      test(`Sine @ ${freq}Hz debe generar frecuencia correcta`, async ({ page }) => {
        const config = createOscillatorConfig({
          waveform: 'sine',
          frequency: freq,
          duration: freq < 100 ? 1.0 : 0.5  // Más duración para frecuencias bajas
        });

        const result = await page.evaluate(async (cfg) => {
          return await window.testSynthOscillator(cfg);
        }, config);

        expect(result.dominant).not.toBeNull();
        
        // Tolerancia mayor para frecuencias muy altas (resolución FFT)
        const tolerance = freq > 5000 ? 20 : 5;
        const freqCheck = verifyFrequency(result.dominant.frequency, freq, tolerance);
        expect(freqCheck.valid).toBe(true);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE SIMETRÍA DEL SINE (Algoritmo Híbrido)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Simetría del Sine (Algoritmo Híbrido Synthi 100)', () => {

    test('Symmetry 0.5 debe producir sine puro', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        symmetry: 0.5  // Centro = sine puro
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      // THD debe ser extremadamente bajo para sine puro
      expect(result.thd).toBeLessThan(0.1);
    });

    test('Symmetry 0 (extremo inferior) debe tener deformación', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        symmetry: 0.0  // Extremo = deformación tipo cuspide
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      // Con simetría extrema, aparecen armónicos (THD mayor)
      expect(result.thd).toBeGreaterThan(1.0);

      // Pero la fundamental sigue siendo correcta
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);
    });

    test('Symmetry 1 (extremo superior) debe tener deformación simétrica', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        symmetry: 1.0  // Extremo superior
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      // Similar deformación que symmetry 0
      expect(result.thd).toBeGreaterThan(1.0);

      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 5);
      expect(freqCheck.valid).toBe(true);
    });

    test('Barrido de simetría debe mostrar transición gradual', async ({ page }) => {
      const symmetryValues = [0, 0.25, 0.5, 0.75, 1.0];
      const results = [];

      for (const sym of symmetryValues) {
        const config = createOscillatorConfig({
          waveform: 'sine',
          frequency: 440,
          symmetry: sym
        });

        const result = await page.evaluate(async (cfg) => {
          return await window.testSynthOscillator(cfg);
        }, config);

        results.push({ symmetry: sym, thd: result.thd });
      }

      // THD debe ser mínimo en el centro (0.5)
      const thdAtCenter = results.find(r => r.symmetry === 0.5).thd;
      const thdAtEdge0 = results.find(r => r.symmetry === 0).thd;
      const thdAtEdge1 = results.find(r => r.symmetry === 1.0).thd;

      expect(thdAtCenter).toBeLessThan(thdAtEdge0);
      expect(thdAtCenter).toBeLessThan(thdAtEdge1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ANTI-ALIASING (PolyBLEP)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Anti-Aliasing (PolyBLEP)', () => {

    test('Sawtooth @ 10kHz no debe tener aliasing severo', async ({ page }) => {
      const config = {
        frequency: 10000,
        waveform: 'sawtooth',
        duration: 0.5,
        sampleRate: 44100
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testAntiAliasing(cfg);
      }, config);

      // PolyBLEP atenúa el aliasing pero no lo elimina por completo
      // Verificamos que no hay aliasing severo (> -30dB respecto al fundamental)
      // El aliasing detectado debe ser atenuado (por debajo de -50dB absoluto)
      const severeAliasing = result.aliasingDetected.filter(a => a.detectedDb > -30);
      expect(severeAliasing.length).toBe(0);
    });

    test('Pulse @ 6kHz no debe tener aliasing severo', async ({ page }) => {
      // Pulse tiene mucho más contenido armónico que sawtooth
      // Usamos 6kHz para tener más margen bajo Nyquist (22kHz)
      const config = {
        frequency: 6000,
        waveform: 'pulse',
        duration: 0.5,
        sampleRate: 44100
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testAntiAliasing(cfg);
      }, config);

      // No debe haber aliasing por encima de -25dB (bastante severo)
      const severeAliasing = result.aliasingDetected.filter(a => a.detectedDb > -25);
      expect(severeAliasing.length).toBe(0);
    });

    test('Comparación: sawtooth @ 5kHz vs 15kHz - más atenuación de armónicos altos', async ({ page }) => {
      const configs = [
        { frequency: 5000, waveform: 'sawtooth', duration: 0.5 },
        { frequency: 15000, waveform: 'sawtooth', duration: 0.5 }
      ];

      const results = [];
      for (const cfg of configs) {
        const result = await page.evaluate(async (config) => {
          return await window.testSynthOscillator(config);
        }, cfg);
        results.push({ freq: cfg.frequency, harmonics: result.harmonics });
      }

      // A 15kHz, los armónicos deben estar más atenuados (cerca de Nyquist)
      // Comparar la cantidad de armónicos significativos
      const significantAt5k = results[0].harmonics.filter(h => h.found && h.found.db > -50).length;
      const significantAt15k = results[1].harmonics.filter(h => h.found && h.found.db > -50).length;

      // A mayor frecuencia, menos armónicos significativos
      expect(significantAt5k).toBeGreaterThan(significantAt15k);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE MODO MULTI-WAVEFORM
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Modo Multi-Waveform', () => {

    test('Solo sineLevel activo debe producir sine en canal 0', async ({ page }) => {
      const config = {
        frequency: 440,
        duration: 0.5,
        sineLevel: 1.0,
        sawLevel: 0,
        triLevel: 0,
        pulseLevel: 0,
        symmetry: 0.5
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillatorMulti(cfg);
      }, config);

      // Canal 0 (sine+saw) debe tener señal
      expect(result.channel0.rms).toBeGreaterThan(0.5);
      
      // Canal 1 (tri+pulse) debe estar en silencio
      expect(result.channel1.rms).toBeLessThan(0.01);
    });

    test('Solo triLevel activo debe producir triangle en canal 1', async ({ page }) => {
      const config = {
        frequency: 440,
        duration: 0.5,
        sineLevel: 0,
        sawLevel: 0,
        triLevel: 1.0,
        pulseLevel: 0
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillatorMulti(cfg);
      }, config);

      // Canal 1 (tri+pulse) debe tener señal
      expect(result.channel1.rms).toBeGreaterThan(0.5);
      
      // Canal 0 (sine+saw) debe estar en silencio
      expect(result.channel0.rms).toBeLessThan(0.01);
    });

    test('Todas las formas de onda activas deben producir señal en ambos canales', async ({ page }) => {
      const config = {
        frequency: 440,
        duration: 0.5,
        sineLevel: 0.5,
        sawLevel: 0.5,
        triLevel: 0.5,
        pulseLevel: 0.5,
        pulseWidth: 0.5,
        symmetry: 0.5
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillatorMulti(cfg);
      }, config);

      // Ambos canales deben tener señal
      expect(result.channel0.rms).toBeGreaterThan(0.3);
      expect(result.channel1.rms).toBeGreaterThan(0.3);
    });

    test('Niveles proporcionales deben afectar mezcla', async ({ page }) => {
      // Config con más saw que sine
      const config = {
        frequency: 440,
        duration: 0.5,
        sineLevel: 0.2,
        sawLevel: 0.8,
        triLevel: 0,
        pulseLevel: 0
      };

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillatorMulti(cfg);
      }, config);

      // Canal 0 debe tener características más de sawtooth (más armónicos)
      const spectrum = result.channel0.spectrum;
      const fundamental = spectrum.find(b => b.frequency > 400 && b.frequency < 480);
      const h2 = spectrum.find(b => b.frequency > 850 && b.frequency < 920);

      // Sawtooth tiene H2 significativo, sine no
      // Con más saw, H2 debe ser más prominente
      if (fundamental && h2) {
        expect(h2.magnitude / fundamental.magnitude).toBeGreaterThan(0.2);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE LATENCIA Y TIMING
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Latencia y Timing', () => {

    test('Primera muestra debe tener señal (sin latencia inicial)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testLatency({
          frequency: 1000,
          sampleRate: 44100,
          duration: 0.1
        });
      });

      // La latencia debe ser 0 o muy cercana a 0
      // El oscilador debe empezar a generar inmediatamente
      expect(result.latencySamples).toBeLessThanOrEqual(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE CONSISTENCIA Y REPRODUCIBILIDAD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Consistencia y Reproducibilidad', () => {

    test('Mismo config debe producir resultados idénticos', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        duration: 0.1
      });

      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await page.evaluate(async (cfg) => {
          return await window.testSynthOscillator(cfg);
        }, config);
        results.push(result);
      }

      // Los primeros N samples deben ser idénticos
      const samples0 = results[0].samplePreview;
      const samples1 = results[1].samplePreview;
      const samples2 = results[2].samplePreview;

      for (let i = 0; i < 100; i++) {
        expect(Math.abs(samples0[i] - samples1[i])).toBeLessThan(1e-6);
        expect(Math.abs(samples1[i] - samples2[i])).toBeLessThan(1e-6);
      }
    });

    test('Frecuencia estable durante todo el buffer', async ({ page }) => {
      const config = createOscillatorConfig({
        waveform: 'sine',
        frequency: 440,
        duration: 1.0  // 1 segundo para verificar estabilidad
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSynthOscillator(cfg);
      }, config);

      // La frecuencia dominante debe ser estable
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 2);
      expect(freqCheck.valid).toBe(true);

      // THD debe mantenerse bajo (sin drift o inestabilidades)
      expect(result.thd).toBeLessThan(TEST_TOLERANCES.thd.pure);
    });
  });
});
