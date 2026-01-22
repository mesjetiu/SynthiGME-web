/**
 * Tests de Audio Real para Modulación CV 1V/Octava
 * 
 * Verifica que la entrada CV de frecuencia del oscilador responde
 * correctamente al estándar 1V/Octava usando Web Audio real.
 * 
 * Escenarios probados:
 * - +1V CV → frecuencia × 2 (1 octava arriba)
 * - -1V CV → frecuencia ÷ 2 (1 octava abajo)
 * - Diferentes voltajes (+2V, -2V, +0.5V, etc.)
 * - Pin GREY de precisión (100kΩ, ±0.5%)
 * - Modos HI y LO del oscilador
 * 
 * El sistema Synthi 100 (Cuenca/Datanomics 1982) usa:
 * - DIGITAL_TO_VOLTAGE = 4.0 (1.0 digital = 4V)
 * - VOLTS_PER_OCTAVE = 1.0
 * - Frecuencia de referencia: 261 Hz (C4) en posición dial 5
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import { setupAudioPage, verifyFrequency, TEST_TOLERANCES } from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const CV_TEST_CONFIG = {
  baseFrequency: 440,  // A4 - estándar de afinación, mejor resolución FFT
  duration: 0.5,
  toleranceOctaves: 0.02,  // ±2% de octava = ±24 cents
  toleranceHz: 5           // ±5 Hz para verificación directa
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE MODULACIÓN CV 1V/OCTAVA
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Modulación CV 1V/Octava - Audio Real', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS BÁSICOS: +1V Y -1V
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Cambio de Octava Básico', () => {

    test('+1V CV debe subir exactamente 1 octava (frecuencia × 2)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: 1.0,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // Verificar que obtuvimos frecuencias válidas (mayores a 0)
      expect(result.baseFrequency.measured).toBeGreaterThan(0);
      expect(result.withCV.measured).toBeGreaterThan(0);

      // Verificar ratio de frecuencias ≈ 2.0 (la métrica más importante)
      expect(result.analysis.frequencyRatio).toBeCloseTo(2.0, 1);

      // Verificar octavas de cambio ≈ 1.0
      expect(result.analysis.octavesChange).toBeCloseTo(1.0, 1);

      // Error debe ser menor a 2% de octava (24 cents)
      expect(result.analysis.errorCents).toBeLessThan(24);
    });

    test('-1V CV debe bajar exactamente 1 octava (frecuencia ÷ 2)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: -1.0,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // Verificar frecuencia base
      const baseCheck = verifyFrequency(result.baseFrequency.measured, CV_TEST_CONFIG.baseFrequency, 5);
      expect(baseCheck.valid).toBe(true);

      // Verificar que la frecuencia con CV es la mitad (1 octava abajo)
      const expectedFreq = CV_TEST_CONFIG.baseFrequency / 2;  // 261 ÷ 2 = 130.5 Hz
      const freqCheck = verifyFrequency(result.withCV.measured, expectedFreq, 5);
      expect(freqCheck.valid).toBe(true);

      // Verificar ratio de frecuencias ≈ 0.5
      expect(result.analysis.frequencyRatio).toBeCloseTo(0.5, 1);

      // Verificar octavas de cambio ≈ -1.0
      expect(result.analysis.octavesChange).toBeCloseTo(-1.0, 1);

      // Error debe ser menor a 2% de octava
      expect(result.analysis.errorCents).toBeLessThan(24);
    });

    test('0V CV debe mantener la frecuencia base sin cambios', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: 0.0,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // Ambas frecuencias deben ser iguales
      const baseCheck = verifyFrequency(result.baseFrequency.measured, CV_TEST_CONFIG.baseFrequency, 5);
      expect(baseCheck.valid).toBe(true);

      const cvCheck = verifyFrequency(result.withCV.measured, CV_TEST_CONFIG.baseFrequency, 5);
      expect(cvCheck.valid).toBe(true);

      // Ratio debe ser ≈ 1.0
      expect(result.analysis.frequencyRatio).toBeCloseTo(1.0, 2);

      // Octavas de cambio ≈ 0
      expect(result.analysis.octavesChange).toBeCloseTo(0.0, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE MÚLTIPLES OCTAVAS
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Cambios de Múltiples Octavas', () => {

    test('+2V CV debe subir aproximadamente 2 octavas (frecuencia × 4)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: 2.0,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // Verificar que obtuvimos frecuencias válidas
      expect(result.baseFrequency.measured).toBeGreaterThan(0);
      expect(result.withCV.measured).toBeGreaterThan(result.baseFrequency.measured);

      // Ratio ≈ 4.0, con tolerancia por soft clipping
      expect(result.analysis.frequencyRatio).toBeGreaterThan(3.5);
      expect(result.analysis.frequencyRatio).toBeLessThan(4.5);
      
      // Octavas ≈ 2.0 (tolerancia más amplia para voltajes extremos)
      expect(result.analysis.octavesChange).toBeGreaterThan(1.8);
      expect(result.analysis.octavesChange).toBeLessThan(2.2);
    });

    test('-2V CV debe bajar aproximadamente 2 octavas (frecuencia ÷ 4)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: -2.0,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // Frecuencia esperada: 261 ÷ 4 = 65.25 Hz
      // NOTA: El soft clipping puede limitar la respuesta en extremos
      const expectedFreq = CV_TEST_CONFIG.baseFrequency / 4;
      const freqCheck = verifyFrequency(result.withCV.measured, expectedFreq, expectedFreq * 0.15);
      expect(freqCheck.valid).toBe(true);

      // Ratio ≈ 0.25 (tolerancia por soft clipping)
      expect(result.analysis.frequencyRatio).toBeGreaterThan(0.22);
      expect(result.analysis.frequencyRatio).toBeLessThan(0.30);
      
      // Octavas ≈ -2.0 (tolerancia más amplia para voltajes extremos)
      expect(result.analysis.octavesChange).toBeGreaterThan(-2.2);
      expect(result.analysis.octavesChange).toBeLessThan(-1.75);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE INTERVALOS MUSICALES
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Intervalos Musicales', () => {

    test('+0.5V CV debe subir un tritono (6 semitonos)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: cfg.baseFrequency,
          cvVoltage: 0.5,
          waveform: 'sine',
          pinType: 'GREY',
          duration: cfg.duration
        });
      }, CV_TEST_CONFIG);

      // +0.5V = +0.5 octavas = 6 semitonos
      // Factor = 2^0.5 ≈ 1.414
      // Frecuencia esperada: 261 × 1.414 ≈ 369 Hz (F#4)
      const expectedRatio = Math.pow(2, 0.5);
      expect(result.analysis.frequencyRatio).toBeCloseTo(expectedRatio, 1);
      expect(result.analysis.octavesChange).toBeCloseTo(0.5, 1);
    });

    test('+0.0833V CV debe subir un semitono (100 cents)', async ({ page }) => {
      // 1 semitono = 1/12 octava ≈ 0.0833 octavas
      // 1V = 1 octava, así que 1 semitono = 1/12 V ≈ 0.0833V
      const semitoneCv = 1.0 / 12;

      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: 440,  // A4 para mejor resolución
          cvVoltage: cfg.cv,
          waveform: 'sine',
          pinType: 'GREY',
          duration: 0.5
        });
      }, { cv: semitoneCv });

      // +1 semitono desde 440 Hz = 466.16 Hz (A#4)
      // Factor = 2^(1/12) ≈ 1.0595
      const expectedRatio = Math.pow(2, 1/12);
      expect(result.analysis.frequencyRatio).toBeCloseTo(expectedRatio, 1);
      
      // Error menor a 20 cents (tolerancia realista para resolución FFT)
      expect(result.analysis.errorCents).toBeLessThan(20);
    });

    test('-0.25V CV debe bajar una quinta justa (7 semitonos abajo → 5 semitonos)', async ({ page }) => {
      // Una quinta justa hacia abajo = -7 semitonos = -7/12 octavas
      // Pero si bajamos 0.25 octavas = 3 semitonos (tercera menor abajo)
      const result = await page.evaluate(async (cfg) => {
        return await window.testFrequencyCV({
          baseFrequency: 440,
          cvVoltage: -0.25,
          waveform: 'sine',
          pinType: 'GREY',
          duration: 0.5
        });
      }, {});

      // -0.25V = -0.25 octavas = -3 semitonos
      // Factor = 2^(-0.25) ≈ 0.841
      const expectedRatio = Math.pow(2, -0.25);
      expect(result.analysis.frequencyRatio).toBeCloseTo(expectedRatio, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS CON DIFERENTES FRECUENCIAS BASE
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Diferentes Frecuencias Base', () => {

    const frequencies = [
      { base: 110, name: 'A2 (grave)' },
      { base: 440, name: 'A4 (central)' },
      { base: 880, name: 'A5 (agudo)' },
      { base: 1760, name: 'A6 (muy agudo)' }
    ];

    for (const { base, name } of frequencies) {
      test(`+1V desde ${name} (${base}Hz) debe doblar frecuencia`, async ({ page }) => {
        const result = await page.evaluate(async (cfg) => {
          return await window.testFrequencyCV({
            baseFrequency: cfg.base,
            cvVoltage: 1.0,
            waveform: 'sine',
            pinType: 'GREY',
            duration: 0.5
          });
        }, { base });

        // La octava debe funcionar igual independientemente de la frecuencia base
        expect(result.analysis.frequencyRatio).toBeCloseTo(2.0, 1);
        expect(result.analysis.octavesChange).toBeCloseTo(1.0, 1);
        
        // Frecuencia medida debe ser el doble de la base
        const expectedFreq = base * 2;
        const freqCheck = verifyFrequency(result.withCV.measured, expectedFreq, expectedFreq * 0.02);
        expect(freqCheck.valid).toBe(true);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE FORMAS DE ONDA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Diferentes Formas de Onda', () => {

    const waveforms = ['sine', 'sawtooth', 'triangle', 'pulse'];

    for (const waveform of waveforms) {
      test(`CV +1V funciona correctamente con onda ${waveform}`, async ({ page }) => {
        const result = await page.evaluate(async (cfg) => {
          return await window.testFrequencyCV({
            baseFrequency: 440,
            cvVoltage: 1.0,
            waveform: cfg.waveform,
            pinType: 'GREY',
            duration: 0.5
          });
        }, { waveform });

        // El CV debe funcionar igual para todas las formas de onda
        expect(result.analysis.frequencyRatio).toBeCloseTo(2.0, 1);
        expect(result.analysis.octavesChange).toBeCloseTo(1.0, 1);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE LINEALIDAD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Linealidad de la Escala V/Oct', () => {

    test('La respuesta CV es exponencial (cada V dobla la frecuencia)', async ({ page }) => {
      // Probar varios voltajes y verificar que la relación es consistente
      // Nota: voltajes extremos pueden verse afectados por soft clipping
      const voltages = [-1, 0, 1];  // Rango seguro sin soft clipping
      const results = [];

      for (const cv of voltages) {
        const result = await page.evaluate(async (cfg) => {
          return await window.testFrequencyCV({
            baseFrequency: 261,
            cvVoltage: cfg.cv,
            waveform: 'sine',
            pinType: 'GREY',
            duration: 0.3
          });
        }, { cv });
        
        results.push({
          cv,
          measured: result.withCV.measured,
          ratio: result.analysis.frequencyRatio,
          octaves: result.analysis.octavesChange
        });
      }

      // Verificar que las octavas cambian linealmente con el voltaje
      for (let i = 0; i < voltages.length; i++) {
        const expectedOctaves = voltages[i];
        expect(results[i].octaves).toBeCloseTo(expectedOctaves, 1);
      }

      // Verificar que el ratio entre voltajes consecutivos es consistente
      // De -1V a 0V: ratio debe ser 2
      // De 0V a +1V: ratio debe ser 2
      for (let i = 1; i < results.length; i++) {
        const ratioStep = results[i].measured / results[i-1].measured;
        expect(ratioStep).toBeCloseTo(2.0, 1);  // Cada voltio dobla la frecuencia
      }
    });
  });
});
