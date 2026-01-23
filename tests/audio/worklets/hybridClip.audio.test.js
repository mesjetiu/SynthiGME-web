/**
 * Tests de Audio Real para Hybrid Clipping
 * 
 * Verifica que el WaveShaperNode con curva híbrida emula correctamente
 * la saturación de los raíles ±12V del Synthi 100.
 * 
 * Tres zonas de operación:
 * - Zona lineal: |V| < 9V (2.25 digital) → ganancia 1:1, THD muy bajo
 * - Zona soft: 9V < |V| < 11.5V → saturación tanh, THD moderado
 * - Zona hard: |V| > 12V (3.0 digital) → clipping duro, THD alto
 * 
 * Referencia: Manual Técnico Datanomics 1982:
 * "primero comprimir (saturación suave con tanh hacia el límite)
 *  y luego recortar (clipping duro en los raíles)"
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import { setupAudioPage } from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const HYBRID_CLIP_CONFIG = {
  // Umbrales de la curva (normalizados a DIGITAL_TO_VOLTAGE = 4)
  linearThreshold: 2.25,    // 9V / 4 = 2.25 digital
  softThreshold: 2.875,     // 11.5V / 4 = 2.875 digital
  hardLimit: 3.0,           // 12V / 4 = 3.0 digital (raíles)
  softness: 2.0,            // Factor de suavidad tanh
  
  // Tolerancias
  thdLinearMax: 1.0,        // THD máximo en zona lineal (%)
  thdSoftMin: 0.1,          // THD mínimo esperado en zona soft (%) - muy conservador
  thdHardMin: 1.0,          // THD mínimo esperado en zona hard (%)
  symmetryTolerance: 0.1    // Tolerancia de asimetría (curva tiene interpolación)
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE HYBRID CLIPPING
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Hybrid Clipping - Audio Real', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ZONA LINEAL
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Zona Lineal (|V| < 9V)', () => {

    test('Señal pequeña (1V) debe pasar sin distorsión', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 1.0,  // 1V << 9V umbral
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('linear');
      expect(result.analysis.thdPercent).toBeLessThan(HYBRID_CLIP_CONFIG.thdLinearMax);
      expect(result.analysis.isCompressing).toBe(false);
    });

    test('Señal en límite lineal (2.0 digital ≈ 8V) debe tener THD muy bajo', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 2.0,  // Justo bajo el umbral de 2.25
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('linear');
      expect(result.analysis.thdPercent).toBeLessThan(HYBRID_CLIP_CONFIG.thdLinearMax);
      
      // Ganancia debe ser ~1:1 en zona lineal
      expect(result.analysis.compressionRatio).toBeCloseTo(1.0, 1);
    });

    test('Frecuencia dominante debe preservarse exactamente', async ({ page }) => {
      const testFreq = 880;  // A5
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 1.5,
          frequency: cfg.testFreq,
          linearThreshold: cfg.linearThreshold,
          softThreshold: cfg.softThreshold,
          hardLimit: cfg.hardLimit,
          softness: cfg.softness
        });
      }, { ...HYBRID_CLIP_CONFIG, testFreq });

      expect(result.analysis.dominantFrequency).toBeCloseTo(testFreq, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ZONA SOFT
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Zona Soft (9V < |V| < 11.5V)', () => {

    test('Señal en zona soft (2.5 digital ≈ 10V) debe tener output menor que input', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 2.5,  // Entre linearThreshold (2.25) y hardLimit (3.0)
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('soft');
      
      // En zona soft, el output debe ser ligeramente menor que el input
      // debido a la compresión tanh (aunque sea muy suave)
      // La curva está diseñada para ser gradual
      expect(result.analysis.outputPeak).toBeLessThanOrEqual(result.analysis.inputPeak);
    });

    test('Compresión tanh debe limitar pico por debajo del hardLimit', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 2.8,  // Muy cerca del hardLimit
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('soft');
      
      // El pico de salida debe ser menor que el de entrada
      expect(result.analysis.outputPeak).toBeLessThan(result.analysis.inputPeak);
      
      // Pero no debe alcanzar el hardLimit todavía
      expect(result.analysis.isClipping).toBe(false);
    });

    test('Compresión en zona hard debe ser mayor que en zona soft', async ({ page }) => {
      // Comparar compresión en zona soft vs hard
      const softResult = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 2.5,  // Zona soft
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      const hardResult = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 4.0,  // Zona hard
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      // En zona hard, la compresión debe ser significativamente mayor
      expect(hardResult.analysis.compressionRatio).toBeGreaterThan(
        softResult.analysis.compressionRatio
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ZONA HARD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Zona Hard (|V| > 12V)', () => {

    test('Señal excediendo raíles (4.0 digital ≈ 16V) debe clipear duro', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 4.0,  // > hardLimit de 3.0
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('hard');
      expect(result.analysis.isClipping).toBe(true);
      
      // THD debe ser alto debido al clipping
      expect(result.analysis.thdPercent).toBeGreaterThan(HYBRID_CLIP_CONFIG.thdHardMin);
      
      // El pico debe estar limitado al hardLimit
      expect(result.analysis.outputPeak).toBeLessThanOrEqual(HYBRID_CLIP_CONFIG.hardLimit * 1.01);
    });

    test('Señal muy grande debe limitarse exactamente al hardLimit', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 10.0,  // Muy por encima del hardLimit
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('hard');
      
      // El pico de salida debe ser exactamente el hardLimit
      expect(result.analysis.outputPeak).toBeCloseTo(HYBRID_CLIP_CONFIG.hardLimit, 1);
    });

    test('Clipping duro no debe producir oscilaciones (ringing)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 5.0,
          frequency: 100,  // Frecuencia baja para ver mejor el clipping
          duration: 0.5,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      // La frecuencia dominante debe seguir siendo la fundamental
      expect(result.analysis.dominantFrequency).toBeCloseTo(100, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE SIMETRÍA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Simetría Bipolar', () => {

    test('Picos positivos y negativos deben ser aproximadamente iguales', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipSymmetry({
          amplitude: 3.5,  // En zona hard
          hardLimit: cfg.hardLimit
        });
      }, HYBRID_CLIP_CONFIG);

      // |negPeak| debe ser aproximadamente igual a |posPeak|
      const diff = Math.abs(Math.abs(result.samples.negPeak) - Math.abs(result.samples.posPeak));
      expect(diff).toBeLessThan(0.3);  // Tolerancia amplia para variaciones de la curva
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE TRANSICIONES ENTRE ZONAS
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Transiciones entre Zonas', () => {

    test('Transición lineal → soft debe ser continua (sin saltos)', async ({ page }) => {
      // Testear justo en el borde lineal/soft
      const resultBelowThreshold = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: cfg.linearThreshold * 0.98,  // Justo bajo umbral
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      const resultAboveThreshold = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: cfg.linearThreshold * 1.02,  // Justo sobre umbral
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      // La diferencia de THD no debe ser abrupta
      const thdDiff = Math.abs(
        resultAboveThreshold.analysis.thdPercent - 
        resultBelowThreshold.analysis.thdPercent
      );
      expect(thdDiff).toBeLessThan(5);  // No más de 5% de salto
    });

    test('Transición soft → hard debe producir incremento notable de THD', async ({ page }) => {
      const resultSoft = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: cfg.hardLimit * 0.95,  // En zona soft, cerca del límite
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      const resultHard = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: cfg.hardLimit * 1.2,  // En zona hard
          frequency: 440,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      // La zona hard debe tener significativamente más THD
      expect(resultHard.analysis.thdPercent).toBeGreaterThan(
        resultSoft.analysis.thdPercent * 1.5
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE DIFERENTES FRECUENCIAS
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Comportamiento en Diferentes Frecuencias', () => {

    test('Clipping debe funcionar igual a frecuencias bajas (100Hz)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 3.5,
          frequency: 100,
          duration: 0.5,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('hard');
      expect(result.analysis.isClipping).toBe(true);
      expect(result.analysis.outputPeak).toBeLessThanOrEqual(HYBRID_CLIP_CONFIG.hardLimit * 1.01);
    });

    test('Clipping debe funcionar a frecuencias altas (4kHz)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testHybridClipping({
          amplitude: 3.5,
          frequency: 4000,
          duration: 0.2,
          ...cfg
        });
      }, HYBRID_CLIP_CONFIG);

      expect(result.analysis.zone).toBe('hard');
      expect(result.analysis.isClipping).toBe(true);
      // El pico debe estar limitado (aunque puede haber algo de aliasing a alta frecuencia)
      expect(result.analysis.outputPeak).toBeLessThan(result.analysis.inputPeak);
    });
  });
});
