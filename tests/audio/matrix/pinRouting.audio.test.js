/**
 * Tests de Audio Real para Sistema de Pines y Routing de Matriz
 * 
 * Verifica el comportamiento del routing de audio a través del sistema
 * de pines de la matriz, incluyendo:
 * 
 * - Ganancias de pines (resistencias virtuales)
 * - Cadenas de ganancia (múltiples pines)
 * - Suma de señales en columnas
 * - Atenuación y amplificación
 * - Preservación de frecuencia a través del routing
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import {
  setupAudioPage,
  verifyFrequency,
  verifyAmplitude,
  createRoutingConfig,
  TEST_FREQUENCIES,
  TEST_TOLERANCES
} from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE ROUTING Y GANANCIAS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Sistema de Pines y Routing de Matriz - Audio Real', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE GANANCIA UNITARIA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Ganancia Unitaria (Pass-through)', () => {

    test('Señal a través de ganancia 1.0 debe preservar amplitud', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [1.0],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      // Ganancia total esperada = 1.0
      expect(result.expectedTotalGain).toBeCloseTo(1.0, 2);
      
      // Peak debe estar cerca de 1.0 (señal sin modificar)
      const ampCheck = verifyAmplitude(result.actualPeak, 1.0, 0.05);
      expect(ampCheck.valid).toBe(true);
    });

    test('Frecuencia debe preservarse a través del routing', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 1000,
        sourceWaveform: 'sine',
        gains: [1.0],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      // Buscar frecuencia dominante en espectro
      const dominant = result.spectrum.reduce((max, bin) => 
        bin.magnitude > max.magnitude ? bin : max
      , { magnitude: 0 });

      const freqCheck = verifyFrequency(dominant.frequency, 1000, 10);
      expect(freqCheck.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ATENUACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Atenuación (Ganancia < 1.0)', () => {

    test('Ganancia 0.5 debe reducir amplitud a la mitad', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.5],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(0.5, 2);
      
      // Peak debe estar cerca de 0.5
      const ampCheck = verifyAmplitude(result.actualPeak, 0.5, 0.05);
      expect(ampCheck.valid).toBe(true);
    });

    test('Ganancia 0.1 debe atenuar significativamente', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.1],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(0.1, 2);
      
      const ampCheck = verifyAmplitude(result.actualPeak, 0.1, 0.02);
      expect(ampCheck.valid).toBe(true);
    });

    test('Ganancia 0 debe silenciar completamente', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.0],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.actualPeak).toBeLessThan(0.001);
      expect(result.rms).toBeLessThan(0.001);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE AMPLIFICACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Amplificación (Ganancia > 1.0)', () => {

    test('Ganancia 2.0 debe duplicar amplitud', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [2.0],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(2.0, 2);
      
      // Peak puede saturar a 2.0 si no hay clipping
      // En Web Audio, GainNode no hace clipping automático
      const ampCheck = verifyAmplitude(result.actualPeak, 2.0, 0.1);
      expect(ampCheck.valid).toBe(true);
    });

    test('Ganancia 1.5 debe amplificar proporcionalmente', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [1.5],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(1.5, 2);
      
      const ampCheck = verifyAmplitude(result.actualPeak, 1.5, 0.1);
      expect(ampCheck.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE CADENAS DE GANANCIA (MÚLTIPLES PINES)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Cadenas de Ganancia (Múltiples Pines)', () => {

    test('Dos ganancias 0.5 en serie deben dar 0.25', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.5, 0.5],  // 0.5 × 0.5 = 0.25
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(0.25, 2);
      
      const ampCheck = verifyAmplitude(result.actualPeak, 0.25, 0.05);
      expect(ampCheck.valid).toBe(true);
    });

    test('Tres ganancias en serie deben multiplicarse', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.8, 0.5, 0.5],  // 0.8 × 0.5 × 0.5 = 0.2
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(0.2, 2);
      
      const ampCheck = verifyAmplitude(result.actualPeak, 0.2, 0.05);
      expect(ampCheck.valid).toBe(true);
    });

    test('Ganancia compuesta con amplificación y atenuación', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [2.0, 0.5, 0.5],  // 2.0 × 0.5 × 0.5 = 0.5
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      expect(result.expectedTotalGain).toBeCloseTo(0.5, 2);
      
      const ampCheck = verifyAmplitude(result.actualPeak, 0.5, 0.05);
      expect(ampCheck.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE VALORES TÍPICOS DE RESISTENCIA (PINES DE MATRIZ)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Valores Típicos de Resistencia (Pines)', () => {
    
    // Valores típicos de pines según audioMatrix.config.js
    const pinGainValues = [
      { name: 'Pin máximo', gain: 1.0 },
      { name: 'Pin 3/4', gain: 0.75 },
      { name: 'Pin medio', gain: 0.5 },
      { name: 'Pin 1/4', gain: 0.25 },
      { name: 'Pin mínimo', gain: 0.1 }
    ];

    for (const { name, gain } of pinGainValues) {
      test(`${name} (gain=${gain}) debe atenuar correctamente`, async ({ page }) => {
        const config = createRoutingConfig({
          sourceFrequency: 440,
          sourceWaveform: 'sine',
          gains: [gain],
          duration: 0.5
        });

        const result = await page.evaluate(async (cfg) => {
          return await window.testSignalRouting(cfg);
        }, config);

        expect(result.expectedTotalGain).toBeCloseTo(gain, 2);
        
        const tolerance = gain < 0.2 ? 0.02 : 0.05;
        const ampCheck = verifyAmplitude(result.actualPeak, gain, tolerance);
        expect(ampCheck.valid).toBe(true);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE PRESERVACIÓN DE SEÑAL
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Preservación de Características de Señal', () => {

    test('Formas de onda complejas deben preservar armónicos', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sawtooth',  // Tiene muchos armónicos
        gains: [0.5],
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        return await window.testSignalRouting(cfg);
      }, config);

      // El espectro debe mostrar múltiples frecuencias (armónicos)
      const significantBins = result.spectrum.filter(b => b.db > -50);
      expect(significantBins.length).toBeGreaterThan(1);

      // La fundamental debe estar presente
      const fundamental = result.spectrum.find(b => 
        b.frequency > 400 && b.frequency < 480
      );
      expect(fundamental).toBeDefined();
      expect(fundamental.magnitude).toBeGreaterThan(0);
    });

    test('Señal a través de múltiples etapas debe preservar forma', async ({ page }) => {
      // Primero sin routing
      const directConfig = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [],  // Sin etapas de ganancia
        duration: 0.5
      });

      // Luego con routing (ganancia 1.0 preserva)
      const routedConfig = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [1.0, 1.0, 1.0],  // 3 etapas, todas 1.0
        duration: 0.5
      });

      const [directResult, routedResult] = await Promise.all([
        page.evaluate(async (cfg) => window.testSignalRouting(cfg), directConfig),
        page.evaluate(async (cfg) => window.testSignalRouting(cfg), routedConfig)
      ]);

      // Ambos deben tener características similares
      expect(Math.abs(directResult.rms - routedResult.rms)).toBeLessThan(0.01);
      expect(Math.abs(directResult.actualPeak - routedResult.actualPeak)).toBeLessThan(0.01);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE DIFERENTES FRECUENCIAS A TRAVÉS DE ROUTING
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Routing con Diferentes Frecuencias', () => {
    const testCases = [
      { freq: 50, name: 'sub-bass (50Hz)' },
      { freq: 440, name: 'mid (440Hz)' },
      { freq: 1000, name: 'high-mid (1kHz)' },
      { freq: 8000, name: 'high (8kHz)' }
    ];

    for (const { freq, name } of testCases) {
      test(`Ganancia 0.5 con ${name} debe atenuar correctamente`, async ({ page }) => {
        const config = createRoutingConfig({
          sourceFrequency: freq,
          sourceWaveform: 'sine',
          gains: [0.5],
          duration: freq < 100 ? 1.0 : 0.5
        });

        const result = await page.evaluate(async (cfg) => {
          return await window.testSignalRouting(cfg);
        }, config);

        // La ganancia debe ser consistente independiente de frecuencia
        // (GainNode es flat, no tiene respuesta de frecuencia)
        const ampCheck = verifyAmplitude(result.actualPeak, 0.5, 0.05);
        expect(ampCheck.valid).toBe(true);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE LINEARIDAD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Linearidad del Sistema', () => {

    test('Respuesta debe ser lineal (doblar ganancia dobla amplitud)', async ({ page }) => {
      const gains = [0.25, 0.5, 1.0];
      const results = [];

      for (const gain of gains) {
        const config = createRoutingConfig({
          sourceFrequency: 440,
          sourceWaveform: 'sine',
          gains: [gain],
          duration: 0.5
        });

        const result = await page.evaluate(async (cfg) => {
          return await window.testSignalRouting(cfg);
        }, config);

        results.push({ gain, peak: result.actualPeak });
      }

      // Verificar linearidad: peak(0.5) / peak(0.25) ≈ 2
      const ratio1 = results[1].peak / results[0].peak;
      expect(ratio1).toBeCloseTo(2.0, 1);

      // peak(1.0) / peak(0.5) ≈ 2
      const ratio2 = results[2].peak / results[1].peak;
      expect(ratio2).toBeCloseTo(2.0, 1);
    });

    test('Sin distorsión en rango normal de ganancias', async ({ page }) => {
      const config = createRoutingConfig({
        sourceFrequency: 440,
        sourceWaveform: 'sine',
        gains: [0.8],  // Ganancia que no debería distorsionar
        duration: 0.5
      });

      const result = await page.evaluate(async (cfg) => {
        // Necesitamos calcular THD manualmente del espectro
        const baseResult = await window.testSignalRouting(cfg);
        
        // Calcular THD simple: buscar el pico máximo (fundamental) y comparar con armónicos
        const spectrum = baseResult.spectrum;
        
        // Encontrar fundamental (mayor magnitud)
        let fundamental = spectrum.reduce((max, b) => 
          b.magnitude > max.magnitude ? b : max
        , { magnitude: 0, frequency: 0 });
        
        // Buscar armónicos cercanos a 2x y 3x
        const h2Freq = fundamental.frequency * 2;
        const h3Freq = fundamental.frequency * 3;
        
        // Encontrar bins cercanos a los armónicos (tolerancia de ±50Hz)
        const h2 = spectrum.filter(b => Math.abs(b.frequency - h2Freq) < 50)
          .reduce((max, b) => b.magnitude > max.magnitude ? b : max, { magnitude: 0 });
        const h3 = spectrum.filter(b => Math.abs(b.frequency - h3Freq) < 50)
          .reduce((max, b) => b.magnitude > max.magnitude ? b : max, { magnitude: 0 });
        
        const h1Mag = fundamental.magnitude;
        const h2Mag = h2.magnitude;
        const h3Mag = h3.magnitude;
        
        // THD como porcentaje
        const thd = h1Mag > 0 
          ? Math.sqrt(h2Mag * h2Mag + h3Mag * h3Mag) / h1Mag * 100 
          : 0;
        
        return { ...baseResult, thd, h1Mag, h2Mag, h3Mag };
      }, config);

      // THD debe ser muy bajo para sine a través de GainNode (< 1% es excelente)
      expect(result.thd).toBeLessThan(1.0);
    });
  });
});
