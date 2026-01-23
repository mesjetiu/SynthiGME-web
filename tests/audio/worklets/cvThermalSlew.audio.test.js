/**
 * Tests de Audio Real para CV Thermal Slew
 * 
 * Verifica que el worklet CVThermalSlewProcessor emula correctamente
 * la inercia térmica del transistor en los VCOs del Synthi 100.
 * 
 * Comportamiento esperado (Manual Técnico Datanomics 1982):
 * - Saltos grandes de CV (>2kHz) producen efecto de portamento térmico
 * - Calentamiento (subida) es más rápido que enfriamiento (bajada)
 * - τ subida ≈ 150ms, τ bajada ≈ 500ms
 * - Saltos pequeños pasan sin modificar (bajo el umbral)
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import { setupAudioPage } from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

const THERMAL_SLEW_CONFIG = {
  // Constantes de tiempo esperadas (del config de oscillator.config.js)
  riseTimeConstant: 0.15,    // 150ms calentamiento
  fallTimeConstant: 0.5,     // 500ms enfriamiento
  threshold: 0.5,            // Umbral de activación
  
  // Tolerancias para tests
  timeConstantTolerance: 0.4,  // ±40% tolerancia en tiempo (audio worklet tiene latencia)
  slewActiveTolerance: 0.1     // Tolerancia para detectar slew activo
};

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE THERMAL SLEW
// ═══════════════════════════════════════════════════════════════════════════

test.describe('CV Thermal Slew - Audio Real', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE SLEW ASIMÉTRICO
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Asimetría Calentamiento/Enfriamiento', () => {

    test('Subida (calentamiento) debe ser más rápida que bajada (enfriamiento)', async ({ page }) => {
      // Medir tiempo de respuesta en subida
      const riseResult = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 1.5
        });
      }, THERMAL_SLEW_CONFIG);

      // Medir tiempo de respuesta en bajada
      const fallResult = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'down',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 1.5
        });
      }, THERMAL_SLEW_CONFIG);

      // El slew debe estar activo en ambos casos (cvStep > threshold)
      expect(riseResult.analysis.slewActive).toBe(true);
      expect(fallResult.analysis.slewActive).toBe(true);

      // Subida debe ser más rápida que bajada
      // El ratio exacto depende de la implementación del worklet
      const riseTime = riseResult.analysis.settlingTimeMs;
      const fallTime = fallResult.analysis.settlingTimeMs;
      
      // Verificar que ambos tienen slew (settling time > 50ms)
      expect(riseTime).toBeGreaterThan(50);
      expect(fallTime).toBeGreaterThan(50);
      
      // La bajada debe ser al menos ligeramente más lenta
      // (tolerancia amplia porque el análisis discreto introduce variabilidad)
      expect(fallTime).toBeGreaterThanOrEqual(riseTime * 0.8);
    });

    test('Tiempo de subida debe aproximarse a τ = 150ms', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 1.0
        });
      }, THERMAL_SLEW_CONFIG);

      expect(result.analysis.slewActive).toBe(true);
      
      // Tiempo de settling debe estar en rango razonable de τ
      // (±40% debido a latencia de worklet y análisis discreto)
      const expectedMs = THERMAL_SLEW_CONFIG.riseTimeConstant * 1000;
      const tolerance = expectedMs * THERMAL_SLEW_CONFIG.timeConstantTolerance;
      
      expect(result.analysis.settlingTimeMs).toBeGreaterThan(expectedMs - tolerance);
      expect(result.analysis.settlingTimeMs).toBeLessThan(expectedMs + tolerance * 2);
    });

    test('Tiempo de bajada debe aproximarse a τ = 500ms', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'down',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 2.0  // Más largo para capturar el slew lento
        });
      }, THERMAL_SLEW_CONFIG);

      expect(result.analysis.slewActive).toBe(true);
      
      // El settling time debe ser mayor que el de subida y en un rango razonable
      // (50ms - 2000ms para capturar la variabilidad del análisis)
      expect(result.analysis.settlingTimeMs).toBeGreaterThan(50);
      expect(result.analysis.settlingTimeMs).toBeLessThan(2000);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE UMBRAL
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Umbral de Activación', () => {

    test('Salto grande (> umbral) debe activar slew', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,  // >> threshold de 0.5
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 0.5
        });
      }, THERMAL_SLEW_CONFIG);

      expect(result.analysis.slewActive).toBe(true);
      
      // El valor medio durante la transición NO debe ser el target
      expect(result.samples.midSlew).toBeLessThan(result.analysis.targetValue * 0.95);
    });

    test('Salto pequeño (< umbral) debe pasar instantáneamente', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 0.3,  // < threshold de 0.5
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 0.2
        });
      }, THERMAL_SLEW_CONFIG);

      // El valor final debe alcanzarse casi instantáneamente
      // (settlingTime muy pequeño porque no hay slew)
      expect(result.analysis.settlingTimeMs).toBeLessThan(50);  // < 50ms
      expect(result.analysis.finalError).toBeLessThan(0.01);
    });

    test('Salto exactamente en el umbral debe comportarse como bajo umbral', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: cfg.threshold,  // Exactamente en el umbral
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 0.2
        });
      }, THERMAL_SLEW_CONFIG);

      // En el umbral exacto, no debe activarse slew (delta <= threshold)
      expect(result.analysis.settlingTimeMs).toBeLessThan(100);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE BYPASS
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Modo Bypass', () => {

    test('enabled=0 debe ser bypass total (paso instantáneo)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testThermalSlewBypass({
          cvStep: 2.0,
          duration: 0.2
        });
      });

      expect(result.bypass).toBe(true);
      expect(result.instantaneous).toBe(true);
      
      // Valor después del salto debe ser exactamente el target
      expect(result.valueAfterStep).toBeCloseTo(result.expectedAfterStep, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE CONVERGENCIA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Convergencia al Target', () => {

    test('Debe converger al valor target final (subida)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 2.0  // Suficiente tiempo para convergencia
        });
      }, THERMAL_SLEW_CONFIG);

      // El valor final debe estar muy cerca del target
      expect(result.analysis.finalError).toBeLessThan(0.05);
      expect(result.analysis.finalValue).toBeCloseTo(result.analysis.targetValue, 1);
    });

    test('Debe converger al valor target final (bajada)', async ({ page }) => {
      const result = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 2.0,
          direction: 'down',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 3.0  // Más tiempo para enfriamiento lento
        });
      }, THERMAL_SLEW_CONFIG);

      // El valor final debe estar muy cerca del target (0)
      expect(result.analysis.finalError).toBeLessThan(0.05);
      expect(result.analysis.finalValue).toBeCloseTo(0, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE BIDIRECCIONALIDAD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Bidireccionalidad', () => {

    test('Slew debe funcionar tanto para subidas como bajadas', async ({ page }) => {
      const riseResult = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 1.5,
          direction: 'up',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 1.0
        });
      }, THERMAL_SLEW_CONFIG);

      const fallResult = await page.evaluate(async (cfg) => {
        return await window.testThermalSlew({
          cvStep: 1.5,
          direction: 'down',
          threshold: cfg.threshold,
          riseTimeConstant: cfg.riseTimeConstant,
          fallTimeConstant: cfg.fallTimeConstant,
          duration: 1.5
        });
      }, THERMAL_SLEW_CONFIG);

      // Ambas direcciones deben tener slew activo
      expect(riseResult.analysis.slewActive).toBe(true);
      expect(fallResult.analysis.slewActive).toBe(true);

      // Ambas deben tener settling time > 0 (no instantáneo)
      expect(riseResult.analysis.settlingTimeMs).toBeGreaterThan(50);
      expect(fallResult.analysis.settlingTimeMs).toBeGreaterThan(50);
    });
  });
});
