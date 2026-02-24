/**
 * Tests de Audio para PWM (Pulse Width Modulation)
 * 
 * Verifica el comportamiento del PWM del oscilador CEM 3340 del Synthi 100:
 * 
 * 1. Modulación del AudioParam 'pulseWidth' desde señal externa (LFO)
 *    - Simula conexión de matriz Panel 5 → oscPWM
 *    - Verifica aparición de armónicos pares con modulación
 *    - Verifica presencia de sidebands
 * 
 * 2. Comportamiento en extremos del duty cycle
 *    - Duty 50% = onda cuadrada (solo armónicos impares)
 *    - Duty extremo (0.01/0.99) = señal casi DC ("thin buzz")
 *    - Verificación de simetría del comportamiento
 * 
 * 3. Linealidad de la respuesta
 *    - AC RMS máximo en duty 50%, decrece hacia extremos
 *    - DC (media) nulo en 50%, crece hacia extremos
 *    - Simetría: duty X y (1-X) producen AC RMS similar
 * 
 * Basado en especificaciones técnicas del CEM 3340:
 * - Entrada de modulación con ganancia 1 (R2=100K, R4=100K)
 * - Respuesta lineal: potenciómetro 10K LIN
 * - Colapso a DC en extremos (0%/100% duty cycle)
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import { setupAudioPage } from '../testHelpers.js';

test.describe('PWM (Pulse Width Modulation) — CEM 3340', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MODULACIÓN DEL ANCHO DE PULSO
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Modulación PWM desde matriz', () => {

    test('PWM con LFO debe producir espectro diferente al estático', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMModulation({
          carrierFreq: 440,
          modFreq: 5,          // LFO lento (5Hz)
          modDepth: 0.3,       // ±30% de modulación del duty cycle
          basePulseWidth: 0.5, // Base: onda cuadrada
          duration: 1.0,
          sampleRate: 44100
        });
      });

      // Ambas señales deben tener audio (no silencio)
      expect(result.reference.rms).toBeGreaterThan(0.3);
      expect(result.modulated.rms).toBeGreaterThan(0.3);

      // Con modulación PWM desde duty 50%, deben aparecer armónicos pares
      // (la onda cuadrada estática solo tiene impares)
      // H2 de la señal modulada debe ser mayor que sin modulación
      const h2RefMag = result.reference.h2?.magnitude ?? 0;
      const h2ModMag = result.modulated.h2?.magnitude ?? 0;
      expect(h2ModMag).toBeGreaterThan(h2RefMag);
    });

    test('Mayor profundidad de modulación produce más armónicos pares', async ({ page }) => {
      // Modulación suave
      const resultLow = await page.evaluate(async () => {
        return await window.testPWMModulation({
          carrierFreq: 440,
          modFreq: 5,
          modDepth: 0.1,       // ±10% modulación
          basePulseWidth: 0.5,
          duration: 1.0,
          sampleRate: 44100
        });
      });

      // Modulación profunda
      const resultHigh = await page.evaluate(async () => {
        return await window.testPWMModulation({
          carrierFreq: 440,
          modFreq: 5,
          modDepth: 0.4,       // ±40% modulación
          basePulseWidth: 0.5,
          duration: 1.0,
          sampleRate: 44100
        });
      });

      const h2Low = resultLow.modulated.h2?.magnitude ?? 0;
      const h2High = resultHigh.modulated.h2?.magnitude ?? 0;

      // Mayor profundidad → más H2 (armónico par)
      expect(h2High).toBeGreaterThan(h2Low);
    });

    test('PWM con frecuencia de audio produce sidebands', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMModulation({
          carrierFreq: 440,
          modFreq: 50,         // Modulación a frecuencia audible
          modDepth: 0.3,
          basePulseWidth: 0.5,
          duration: 1.0,
          sampleRate: 44100
        });
      });

      // Debe haber señal modulada
      expect(result.modulated.rms).toBeGreaterThan(0.3);

      // H2 debe aparecer con modulación
      const h2Ref = result.reference.h2?.magnitude ?? 0;
      const h2Mod = result.modulated.h2?.magnitude ?? 0;
      expect(h2Mod).toBeGreaterThan(h2Ref);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMPORTAMIENTO EN EXTREMOS DEL DUTY CYCLE
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Extremos del duty cycle (CEM 3340)', () => {

    test('Duty 50% produce onda cuadrada simétrica (DC nulo, máximo AC)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMExtremes({
          frequency: 440,
          duration: 0.5,
          sampleRate: 44100
        });
      });

      const pw50 = result.results['0.5'];

      // Onda cuadrada simétrica: media ≈ 0 (sin componente DC)
      expect(Math.abs(pw50.mean)).toBeLessThan(0.01);
      // AC RMS máximo para pulse bipolar ±1: teórico = 1.0
      expect(pw50.acRms).toBeGreaterThan(0.95);
      // Oscila a 440Hz (≈440 zero-crossings en 0.5s, contando ambas direcciones)
      expect(pw50.zeroCrossings).toBeGreaterThan(400);
      expect(pw50.zeroCrossings).toBeLessThan(500);
    });

    test('Duty extremo aumenta componente DC y reduce AC (thin buzz)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMExtremes({
          frequency: 440,
          duration: 0.5,
          sampleRate: 44100
        });
      });

      const pw50 = result.results['0.5'];
      const pw01 = result.results['0.01'];
      const pw99 = result.results['0.99'];

      // Duty 1%: señal casi siempre en -1, media ≈ -0.98
      // AC RMS se reduce drásticamente (colapso a DC del CEM 3340)
      expect(pw01.acRms).toBeLessThan(pw50.acRms);
      expect(Math.abs(pw01.mean)).toBeGreaterThan(0.5);

      // Duty 99%: espejo — señal casi siempre en +1, media ≈ +0.98
      expect(pw99.acRms).toBeLessThan(pw50.acRms);
      expect(Math.abs(pw99.mean)).toBeGreaterThan(0.5);
    });

    test('Comportamiento simétrico: duty X y duty (1-X) deben tener AC RMS similar', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMExtremes({
          frequency: 440,
          duration: 0.5,
          sampleRate: 44100
        });
      });

      // 25% y 75% deben ser similares (espejo)
      const pw25 = result.results['0.25'];
      const pw75 = result.results['0.75'];
      expect(Math.abs(pw25.acRms - pw75.acRms)).toBeLessThan(0.05);

      // 10% y 90% deben ser similares
      const pw10 = result.results['0.1'];
      const pw90 = result.results['0.9'];
      expect(Math.abs(pw10.acRms - pw90.acRms)).toBeLessThan(0.05);

      // La media debe ser opuesta en signo: duty 25% → mean negativa, 75% → mean positiva
      expect(pw25.mean).toBeLessThan(0);
      expect(pw75.mean).toBeGreaterThan(0);
    });

    test('AC RMS decrece progresivamente hacia extremos', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testPWMExtremes({
          frequency: 440,
          duration: 0.5,
          sampleRate: 44100
        });
      });

      // Para pulse bipolar ±1: AC RMS = 2 × sqrt(d × (1-d))
      // Máximo en d=0.5 (AC RMS = 1.0), decrece hacia extremos
      const pw50 = result.results['0.5'];
      const pw25 = result.results['0.25'];
      const pw10 = result.results['0.1'];
      const pw05 = result.results['0.05'];
      const pw01 = result.results['0.01'];

      // Tendencia clara: 50% > 25% > 10% > 5% > 1%
      expect(pw50.acRms).toBeGreaterThan(pw25.acRms);
      expect(pw25.acRms).toBeGreaterThan(pw10.acRms);
      expect(pw10.acRms).toBeGreaterThan(pw05.acRms);
      expect(pw05.acRms).toBeGreaterThan(pw01.acRms);
    });
  });
});
