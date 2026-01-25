/**
 * @fileoverview Tests de integración para la cadena CV → AudioParam
 * 
 * Estos tests verifican que los AudioWorklets pueden pasar señal correctamente
 * hacia AudioParams, detectando el bug donde condicionales en el worklet
 * bloquean la propagación de señal.
 * 
 * BUG HISTÓRICO (Enero 2026):
 * - AudioWorklets con if/else, ternarios, Math.max/min en process()
 *   producían señal correcta hacia nodos de audio normales
 *   pero BLOQUEABAN la señal hacia AudioParams
 * - Solo aritmética pura funcionaba hacia AudioParams
 * 
 * EJECUTAR:
 *   npx playwright test tests/audio/integration/cvChain.audio.test.js
 */

import { test, expect } from '@playwright/test';

test.describe('CV Chain Integration Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    await page.waitForFunction(() => window.__AUDIO_HARNESS_READY__ === true, { timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests de AudioWorklet → AudioParam (detección de bug de condicionales)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('AudioWorklet → AudioParam Signal Propagation', () => {

    test('cvSoftClip debe pasar señal a AudioParam (detección de bug de condicionales)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletToAudioParam({
          workletPath: '/src/assets/js/worklets/cvSoftClip.worklet.js',
          workletName: 'cv-soft-clip',
          processorOptions: { coefficient: 0.0001 },
          cvValue: 0.5,
          duration: 0.2
        });
      });

      // El test PASA si hay señal significativa en el output
      expect(result.result.hasSignal).toBe(true);
      expect(result.result.rms).toBeGreaterThan(0.01);
      expect(result.result.passed).toBe(true);
    });

    test('cvThermalSlew debe pasar señal a AudioParam', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletToAudioParam({
          workletPath: '/src/assets/js/worklets/cvThermalSlew.worklet.js',
          workletName: 'cv-thermal-slew',
          processorOptions: { riseTimeConstant: 0.001, fallTimeConstant: 0.001 },
          cvValue: 0.5,
          duration: 0.2
        });
      });

      expect(result.result.hasSignal).toBe(true);
      expect(result.result.rms).toBeGreaterThan(0.01);
      expect(result.result.passed).toBe(true);
    });

    test('cvSoftClip con CV negativo debe pasar señal', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletToAudioParam({
          workletPath: '/src/assets/js/worklets/cvSoftClip.worklet.js',
          workletName: 'cv-soft-clip',
          processorOptions: { coefficient: 0.0001 },
          cvValue: -0.5,
          duration: 0.2
        });
      });

      // Con CV negativo, el gain será negativo pero la señal debería existir
      expect(result.result.hasSignal).toBe(true);
      expect(result.result.rms).toBeGreaterThan(0.01);
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests de comparación A/B (con/sin worklet)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Signal Passthrough Comparison (A/B Test)', () => {

    test('cvSoftClip no debe bloquear >50% de la señal', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletSignalPassthrough({
          workletPath: '/src/assets/js/worklets/cvSoftClip.worklet.js',
          workletName: 'cv-soft-clip',
          processorOptions: { coefficient: 0.0001 },
          cvValue: 0.5
        });
      });

      // El worklet no debe bloquear la señal
      expect(result.analysis.signalBlocked).toBe(false);
      expect(result.analysis.signalRatio).toBeGreaterThan(0.5);
      expect(result.analysis.passed).toBe(true);
    });

    test('cvThermalSlew no debe bloquear >50% de la señal', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletSignalPassthrough({
          workletPath: '/src/assets/js/worklets/cvThermalSlew.worklet.js',
          workletName: 'cv-thermal-slew',
          processorOptions: { riseTimeConstant: 0.001, fallTimeConstant: 0.001 },
          cvValue: 0.5
        });
      });

      expect(result.analysis.signalBlocked).toBe(false);
      expect(result.analysis.signalRatio).toBeGreaterThan(0.5);
      expect(result.analysis.passed).toBe(true);
    });

    test('cvSoftClip con coeficiente alto sigue pasando señal', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testWorkletSignalPassthrough({
          workletPath: '/src/assets/js/worklets/cvSoftClip.worklet.js',
          workletName: 'cv-soft-clip',
          processorOptions: { coefficient: 0.333 },  // Coeficiente alto
          cvValue: 0.5
        });
      });

      // Incluso con saturación fuerte, la señal debe pasar
      expect(result.analysis.signalBlocked).toBe(false);
      expect(result.withWorklet.peak).toBeGreaterThan(0.01);
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests de cadena FM completa
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Complete FM Chain Integration', () => {

    test('+1V CV debe producir +1 octava (cadena completa con todos los worklets)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: 1.0,
          includeThermalSlew: true,
          includeSoftClip: true,
          duration: 0.5
        });
      });

      // 440Hz + 1V = 880Hz (±50 cents de tolerancia)
      expect(result.measured.frequency).toBeGreaterThan(800);
      expect(result.measured.frequency).toBeLessThan(960);
      expect(result.analysis.withinTolerance).toBe(true);
      expect(result.analysis.passed).toBe(true);
    });

    test('+1V CV sin worklets (baseline) debe producir +1 octava', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: 1.0,
          includeThermalSlew: false,
          includeSoftClip: false,
          duration: 0.5
        });
      });

      // Baseline sin worklets: 440Hz → 880Hz
      expect(result.measured.frequency).toBeGreaterThan(800);
      expect(result.measured.frequency).toBeLessThan(960);
      expect(result.analysis.passed).toBe(true);
    });

    test('cadena con solo cvThermalSlew debe funcionar', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: 1.0,
          includeThermalSlew: true,
          includeSoftClip: false,
          duration: 0.5
        });
      });

      expect(result.measured.frequency).toBeGreaterThan(800);
      expect(result.analysis.passed).toBe(true);
    });

    test('cadena con solo cvSoftClip debe funcionar', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: 1.0,
          includeThermalSlew: false,
          includeSoftClip: true,
          duration: 0.5
        });
      });

      expect(result.measured.frequency).toBeGreaterThan(800);
      expect(result.analysis.passed).toBe(true);
    });

    test('-1V CV debe producir -1 octava (220Hz)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: -1.0,
          includeThermalSlew: true,
          includeSoftClip: true,
          duration: 0.5
        });
      });

      // 440Hz - 1V = 220Hz (±50 cents de tolerancia)
      expect(result.measured.frequency).toBeGreaterThan(200);
      expect(result.measured.frequency).toBeLessThan(240);
      expect(result.analysis.passed).toBe(true);
    });

    test('+2V CV debe producir +2 octavas (1760Hz)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 440,
          cvVoltage: 2.0,
          includeThermalSlew: true,
          includeSoftClip: true,
          duration: 0.5
        });
      });

      // 440Hz + 2V = 1760Hz
      expect(result.measured.frequency).toBeGreaterThan(1600);
      expect(result.measured.frequency).toBeLessThan(1920);
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tests de regresión específicos del bug
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Regression: Conditional Code in AudioWorklet', () => {

    test('worklet con aritmética pura no debe bloquear señal a AudioParam', async ({ page }) => {
      // cvSoftClip usa solo aritmética: y = x - x³ * coefficient
      const result = await page.evaluate(async () => {
        return await window.testWorkletToAudioParam({
          workletPath: '/src/assets/js/worklets/cvSoftClip.worklet.js',
          workletName: 'cv-soft-clip',
          processorOptions: { coefficient: 0.0001 },
          cvValue: 1.0
        });
      });

      expect(result.result.passed).toBe(true);
      expect(result.result.cvPassthrough).toBeGreaterThan(0.5);
    });

    test('FM funciona con CV de amplitud 4V (límite del sistema)', async ({ page }) => {
      // 4V = 1.0 digital = límite del rango normal
      const result = await page.evaluate(async () => {
        return await window.testCompleteFMChain({
          baseFrequency: 110,   // Baja para que +4V no salga del rango audible
          cvVoltage: 4.0,       // 4 octavas arriba → 110 × 16 = 1760Hz
          includeThermalSlew: true,
          includeSoftClip: true,
          duration: 0.5
        });
      });

      // Con softClip activo, el CV puede estar ligeramente saturado
      // pero la señal debe pasar
      expect(result.measured.frequency).toBeGreaterThan(1000);
    });

  });

});
