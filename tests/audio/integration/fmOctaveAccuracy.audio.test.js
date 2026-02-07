/**
 * @fileoverview Test de precisión de octava para modulación FM vía matriz de control
 * 
 * ESCENARIO:
 *   - Osc portador a ~400Hz (seno)
 *   - Osc modulante genera cuadrada a 1Vp-p (±0.5V)
 *   - Modulante envía señal por matriz de control (pin GREY) al freqCV del portador
 *   - Se espera: 1Vp-p → exactamente 1 octava de cambio
 * 
 * BUG REPORTADO:
 *   Con 1Vp-p se obtiene sensiblemente menos de 1 octava.
 *   Se necesita ~1.04-1.05V para lograr la octava correcta (4-5% de pérdida).
 * 
 * CADENA COMPLETA (replica app.js):
 *   OscMod → [pinFilter] → [pinGain] → cvChainInput
 *     → [cvThermalSlew] → [cvSoftClip] → freqCVInput(×4800) → carrier.detune
 * 
 * EJECUTAR:
 *   npx playwright test tests/audio/integration/fmOctaveAccuracy.audio.test.js
 */

import { test, expect } from '@playwright/test';

test.describe('FM Octave Accuracy - 1V/oct via Control Matrix', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    await page.waitForFunction(() => window.__AUDIO_HARNESS_READY__ === true, { timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test principal: 1Vp-p debe producir exactamente 1 octava
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Octave Accuracy with Full Chain', () => {

    test('1Vpp cuadrada → cadena completa → debe producir 1 octava (±10 cents)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,      // 1V peak-to-peak
          modulatorFreq: 1,       // 1 Hz LFO
          includePinFilter: true,
          includeThermalSlew: true,
          includeSoftClip: true,
          pinType: 'GREY',
          duration: 2.0
        });
      });

      // Verificar que el modulante mantiene su nivel
      expect(result.modulator.levelLoss).toBeLessThan(1.0); // < 1% pérdida en nivel

      // Verificar precisión de octava: ratio debe ser 2.0 (±10 cents)
      const errorCents = Math.abs(result.error.cents);
      expect(errorCents).toBeLessThan(10); // Tolerancia estricta: ±10 cents
      expect(result.analysis.passed).toBe(true);

      // Log para diagnóstico
      console.log(`  Ratio medido: ${result.measured.ratio.toFixed(6)} (esperado: ${result.expected.ratio.toFixed(6)})`);
      console.log(`  Octavas: ${result.measured.octaves.toFixed(6)} (esperado: ${result.expected.octaves.toFixed(6)})`);
      console.log(`  Error: ${result.error.cents.toFixed(2)} cents (${result.error.percent.toFixed(3)}%)`);
      console.log(`  Mod Vpp real: ${result.modulator.actualVpp.toFixed(4)}V`);
    });

    test('1Vpp cuadrada → SIN cadena CV (baseline) → debe producir 1 octava exacta', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,
          modulatorFreq: 1,
          includePinFilter: false,    // Sin filtro RC
          includeThermalSlew: false,  // Sin thermal slew
          includeSoftClip: false,     // Sin soft clip
          duration: 2.0
        });
      });

      // Sin cadena intermedia: debe ser casi perfecto
      const errorCents = Math.abs(result.error.cents);
      expect(errorCents).toBeLessThan(5); // Tolerancia más estricta: ±5 cents
      console.log(`  Baseline error: ${result.error.cents.toFixed(2)} cents`);
    });

    test('1Vpp → solo pinFilter → aislar efecto del filtro RC', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,
          modulatorFreq: 1,
          includePinFilter: true,
          includeThermalSlew: false,
          includeSoftClip: false,
          duration: 2.0
        });
      });

      const errorCents = Math.abs(result.error.cents);
      expect(errorCents).toBeLessThan(10);
      console.log(`  PinFilter-only error: ${result.error.cents.toFixed(2)} cents`);
    });

    test('1Vpp → solo thermalSlew → aislar efecto del slew', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,
          modulatorFreq: 1,
          includePinFilter: false,
          includeThermalSlew: true,
          includeSoftClip: false,
          duration: 2.0
        });
      });

      const errorCents = Math.abs(result.error.cents);
      expect(errorCents).toBeLessThan(10);
      console.log(`  ThermalSlew-only error: ${result.error.cents.toFixed(2)} cents`);
    });

    test('1Vpp → solo softClip → aislar efecto del soft clip', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,
          modulatorFreq: 1,
          includePinFilter: false,
          includeThermalSlew: false,
          includeSoftClip: true,
          duration: 2.0
        });
      });

      const errorCents = Math.abs(result.error.cents);
      expect(errorCents).toBeLessThan(10);
      console.log(`  SoftClip-only error: ${result.error.cents.toFixed(2)} cents`);
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Linealidad V/oct a diferentes voltajes
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('V/oct Linearity at Different Voltages', () => {

    for (const vpp of [0.5, 1.0, 2.0, 4.0]) {
      test(`${vpp}Vpp → cadena completa → debe dar ${vpp} octavas`, async ({ page }) => {
        const result = await page.evaluate(async (v) => {
          return await window.testFMOctaveAccuracy({
            carrierFreq: 400,
            modulatorVpp: v,
            modulatorFreq: 1,
            includePinFilter: true,
            includeThermalSlew: true,
            includeSoftClip: true,
            duration: 2.0
          });
        }, vpp);

        // Tolerancia proporcional al rango (más laxa para señales grandes)
        const toleranceCents = vpp <= 1 ? 10 : 20;
        const errorCents = Math.abs(result.error.cents);
        expect(errorCents).toBeLessThan(toleranceCents);
        console.log(`  ${vpp}Vpp: ${result.measured.octaves.toFixed(4)} oct (esperado: ${result.expected.octaves.toFixed(4)}, error: ${result.error.cents.toFixed(2)} cents)`);
      });
    }

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Diagnóstico etapa por etapa
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Stage-by-Stage CV Chain Diagnosis', () => {

    test('diagnóstico: nivel de señal en cada etapa para 1Vpp', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCVChainStageByStage({
          cvAmplitude: 0.125,   // ±0.125 digital = ±0.5V = 1Vpp
          frequency: 1,
          duration: 2.0
        });
      });

      console.log('Diagnóstico etapa por etapa (1Vpp = ±0.125 digital):');
      for (const [stage, data] of Object.entries(result.stages)) {
        console.log(`  ${stage}: high=${data.avgHigh.toFixed(8)}, Vpp=${data.vpp.toFixed(6)}V, loss=${data.lossFromRef.toFixed(4)}%`);
      }

      // Cada etapa no debe perder más de 0.1% individualmente
      // (excepto freqCVInput que multiplica por 4800)
      for (const [stage, data] of Object.entries(result.stages)) {
        if (stage !== '6_after_freqCVInput') {
          expect(Math.abs(data.lossFromRef)).toBeLessThan(1.0); // < 1% pérdida
        }
      }
    });

    test('diagnóstico: nivel de señal en cada etapa para 2Vpp', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCVChainStageByStage({
          cvAmplitude: 0.25,    // ±0.25 digital = ±1V = 2Vpp
          frequency: 1,
          duration: 2.0
        });
      });

      console.log('Diagnóstico etapa por etapa (2Vpp = ±0.25 digital):');
      for (const [stage, data] of Object.entries(result.stages)) {
        console.log(`  ${stage}: high=${data.avgHigh.toFixed(8)}, Vpp=${data.vpp.toFixed(6)}V, loss=${data.lossFromRef.toFixed(4)}%`);
      }
    });

    test('diagnóstico: nivel de señal para 8Vpp (máximo nominal)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testCVChainStageByStage({
          cvAmplitude: 1.0,     // ±1.0 digital = ±4V = 8Vpp (máximo)
          frequency: 1,
          duration: 2.0
        });
      });

      console.log('Diagnóstico etapa por etapa (8Vpp = ±1.0 digital):');
      for (const [stage, data] of Object.entries(result.stages)) {
        console.log(`  ${stage}: high=${data.avgHigh.toFixed(8)}, Vpp=${data.vpp.toFixed(6)}V, loss=${data.lossFromRef.toFixed(4)}%`);
      }

      // Con señales grandes, el soft clip debe tener más efecto
      const softClipLoss = Math.abs(result.stages['5_after_softClip']?.lossFromRef || 0);
      console.log(`  SoftClip loss at 8Vpp: ${softClipLoss.toFixed(4)}%`);
    });

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Test de verificación: ¿se necesita ~1.04V para 1 octava?
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Voltage Compensation Verification', () => {

    test('si hay pérdida con 1V, verificar que 1.04-1.05V compensa', async ({ page }) => {
      // Primero medir error real con 1V
      const result1V = await page.evaluate(async () => {
        return await window.testFMOctaveAccuracy({
          carrierFreq: 400,
          modulatorVpp: 1.0,
          modulatorFreq: 1,
          includePinFilter: true,
          includeThermalSlew: true,
          includeSoftClip: true,
          duration: 2.0
        });
      });

      const cents1V = result1V.error.cents;
      console.log(`  Error con 1.00V: ${cents1V.toFixed(2)} cents`);

      // Si hay pérdida significativa (> 5 cents), probar con voltaje compensado
      if (Math.abs(cents1V) > 5) {
        const compensatedV = result1V.error.voltageNeededForExactOctave;
        console.log(`  Voltaje necesario para 1 octava exacta: ${compensatedV.toFixed(4)}V`);

        const resultComp = await page.evaluate(async (v) => {
          return await window.testFMOctaveAccuracy({
            carrierFreq: 400,
            modulatorVpp: v,
            modulatorFreq: 1,
            includePinFilter: true,
            includeThermalSlew: true,
            includeSoftClip: true,
            duration: 2.0
          });
        }, compensatedV);

        console.log(`  Error con ${compensatedV.toFixed(4)}V: ${resultComp.error.cents.toFixed(2)} cents`);
        // El voltaje compensado debería estar mucho más cerca de 1 octava
        expect(Math.abs(resultComp.error.cents)).toBeLessThan(Math.abs(cents1V));
      }
    });

  });

});
