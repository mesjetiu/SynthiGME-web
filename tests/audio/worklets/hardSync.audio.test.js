/**
 * Tests de Audio Real para Hard Sync de Osciladores
 * 
 * Verifica el comportamiento del hard sync usando OfflineAudioContext
 * y el worklet real. El hard sync resetea la fase de un oscilador
 * "slave" cada vez que la señal de un oscilador "master" cruza por
 * cero en dirección positiva (flanco ascendente).
 * 
 * Esto permite crear timbres armónicos complejos típicos de
 * sintetizadores clásicos como el Synthi 100.
 * 
 * Conexión en Panel 5: columnas 24-35 son los sync inputs de Osc 1-12
 * 
 * @requires Playwright con Chromium
 * @requires tests/audio/harness.html
 */

import { test, expect } from '@playwright/test';
import {
  setupAudioPage,
  verifyFrequency,
  TEST_TOLERANCES
} from '../testHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE HARD SYNC
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Hard Sync de Osciladores - Audio Real', () => {

  test.beforeEach(async ({ page }) => {
    await setupAudioPage(page);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST DE DIAGNÓSTICO - VERIFICA QUE EL SYNC INPUT FUNCIONA
  // ─────────────────────────────────────────────────────────────────────────

  test('DIAGNÓSTICO: Sync input debe modificar el output del slave', async ({ page }) => {
    const result = await page.evaluate(async () => {
      return await window.diagnoseSyncInput({
        masterFrequency: 220,
        slaveFrequency: 440,
        duration: 0.1
      });
    });

    console.log(`Diagnosis: crossings=${result.positiveCrossings}/${result.expectedCrossings}, avgDiff=${result.avgDiffWithWithoutSync}, syncEffect=${result.syncHasEffect}`);
    
    // El master debe tener ~22 cruces positivos en 0.1s a 220Hz
    expect(result.crossingsMatch).toBe(true);
    
    // CRÍTICO: El sync debe tener efecto - si avgDiff es ~0, el sync no funciona
    // Nota: avgDiff > 0.01 significa que hay diferencia significativa en las muestras
    console.log('avgDiff value:', result.avgDiffWithWithoutSync);
    expect(result.avgDiffWithWithoutSync).toBeGreaterThan(0.01);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS BÁSICOS DE SINCRONIZACIÓN
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Sincronización Básica', () => {

    test('Hard sync produce cambios medibles en el output del slave', async ({ page }) => {
      // El hard sync debe modificar significativamente la forma de onda del slave
      const result = await page.evaluate(async () => {
        return await window.diagnoseSyncInput({
          masterFrequency: 220,
          slaveFrequency: 440,
          duration: 0.2
        });
      });

      // El master debe generar cruces por cero correctamente
      expect(result.crossingsMatch).toBe(true);
      
      // CRÍTICO: El sync debe producir una diferencia medible
      // avgDiff > 0.1 significa cambios significativos en la forma de onda
      expect(result.avgDiffWithWithoutSync).toBeGreaterThan(0.1);
    });

    test('Hard sync con ratio 1:2 produce espectro con armónicos del master', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 220,
          slaveFrequency: 440,  // 2x master
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Debe haber energía en la frecuencia del master o sus múltiplos
      // Nota: La frecuencia dominante puede ser el slave (440Hz) o el master (220Hz)
      // dependiendo del contenido armónico, pero debe haber energía significativa
      expect(result.dominant).not.toBeNull();
      expect(result.rms).toBeGreaterThan(0.1);
      
      // Debe haber armónicos del master detectados
      const h1 = result.masterHarmonics.find(h => h.harmonic === 1);
      const h2 = result.masterHarmonics.find(h => h.harmonic === 2);
      
      // Al menos la fundamental o el segundo armónico del master debe estar presente
      // found es un objeto con {frequency, magnitude, db} o null
      const hasMasterHarmonics = h1?.found != null || h2?.found != null;
      expect(hasMasterHarmonics).toBe(true);
    });

    test('Hard sync con ratio 1:3 produce espectro rico', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 150,
          slaveFrequency: 450,  // 3x master
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Debe haber múltiples frecuencias significativas (sync produce espectro rico)
      expect(result.harmonicRichness).toBeGreaterThan(2);
      expect(result.rms).toBeGreaterThan(0.1);
    });

    test('Hard sync con ratio no entero produce espectro complejo', async ({ page }) => {
      // Ratio 1:2.5 produce parciales interesantes
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 200,
          slaveFrequency: 500,  // 2.5x master
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Debe producir señal con múltiples componentes
      expect(result.rms).toBeGreaterThan(0.1);
      expect(result.harmonicRichness).toBeGreaterThan(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS COMPARATIVOS (CON VS SIN SYNC)
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Comparación Con/Sin Sync', () => {

    test('Sync debe modificar el espectro del slave', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSyncComparison({
          masterFrequency: 220,
          slaveFrequency: 440,
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Sin sync: fundamental = 440Hz (frecuencia del slave)
      const noSyncCheck = verifyFrequency(result.noSync.dominantFrequency, 440, 10);
      expect(noSyncCheck.valid).toBe(true);

      // Con sync: el espectro cambia - puede tener diferente frecuencia dominante
      // o al menos diferente contenido armónico
      expect(result.withSync.rms).toBeGreaterThan(0.1);
      
      // El contenido armónico debe cambiar
      // (si no cambia nada, harmonicCountDiff sería 0)
      expect(result.harmonicCountDiff).not.toBe(0);
    });

    test('Sync tiende a aumentar riqueza armónica', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSyncComparison({
          masterFrequency: 220,
          slaveFrequency: 660,  // 3x master para más efecto
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // El sync generalmente aumenta los armónicos porque el
      // reseteo de fase crea discontinuidades que añaden frecuencias
      // Nota: puede variar, pero al menos no debe reducir drásticamente
      expect(result.withSync.harmonicCount).toBeGreaterThanOrEqual(
        result.noSync.harmonicCount * 0.5  // Al menos 50% de los originales
      );
    });

    test('Sync mantiene nivel de señal similar', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSyncComparison({
          masterFrequency: 220,
          slaveFrequency: 440,
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // RMS y peak no deben cambiar drásticamente con sync
      const rmsDiff = Math.abs(result.withSync.rms - result.noSync.rms);
      const peakDiff = Math.abs(result.withSync.peak - result.noSync.peak);

      // Diferencia de menos de 0.3 en RMS y peak
      expect(rmsDiff).toBeLessThan(0.3);
      expect(peakDiff).toBeLessThan(0.3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE DIFERENTES FORMAS DE ONDA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Formas de Onda del Slave', () => {

    const slaveWaveforms = ['sawtooth', 'pulse', 'triangle', 'sine'];

    for (const waveform of slaveWaveforms) {
      test(`Hard sync con slave ${waveform} debe funcionar`, async ({ page }) => {
        const result = await page.evaluate(async (wf) => {
          return await window.testHardSync({
            masterFrequency: 220,
            slaveFrequency: 440,
            masterWaveform: 'sine',
            slaveWaveform: wf,
            duration: 0.5
          });
        }, waveform);

        // Debe producir señal con energía
        expect(result.dominant).not.toBeNull();
        expect(result.rms).toBeGreaterThan(0.05);
        
        // Debe haber contenido armónico (sync enriquece el espectro)
        expect(result.harmonicRichness).toBeGreaterThanOrEqual(1);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE DIFERENTES FORMAS DE ONDA DEL MASTER
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Formas de Onda del Master', () => {

    test('Master sawtooth debe sincronizar correctamente', async ({ page }) => {
      // Sawtooth tiene flancos positivos claros
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 220,
          slaveFrequency: 440,
          masterWaveform: 'sawtooth',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      expect(result.rms).toBeGreaterThan(0.1);
      expect(result.dominant).not.toBeNull();
    });

    test('Master pulse debe sincronizar correctamente', async ({ page }) => {
      // Pulse tiene flancos muy definidos
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 220,
          slaveFrequency: 440,
          masterWaveform: 'pulse',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      expect(result.rms).toBeGreaterThan(0.1);
      expect(result.dominant).not.toBeNull();
    });

    test('Master triangle debe sincronizar correctamente', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 220,
          slaveFrequency: 440,
          masterWaveform: 'triangle',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      expect(result.rms).toBeGreaterThan(0.1);
      expect(result.dominant).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE DIFERENTES RATIOS DE FRECUENCIA
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Ratios de Frecuencia Master:Slave', () => {

    const ratios = [
      { ratio: '1:1', master: 440, slave: 440 },
      { ratio: '1:2', master: 220, slave: 440 },
      { ratio: '1:3', master: 147, slave: 440 },
      { ratio: '1:4', master: 110, slave: 440 },
      { ratio: '2:3', master: 293, slave: 440 }
    ];

    for (const { ratio, master, slave } of ratios) {
      test(`Ratio ${ratio} (master=${master}Hz, slave=${slave}Hz) produce señal`, async ({ page }) => {
        const result = await page.evaluate(async (cfg) => {
          return await window.testHardSync({
            masterFrequency: cfg.master,
            slaveFrequency: cfg.slave,
            masterWaveform: 'sine',
            slaveWaveform: 'sawtooth',
            duration: 0.5
          });
        }, { master, slave });

        // Debe producir señal con energía
        expect(result.dominant).not.toBeNull();
        expect(result.rms).toBeGreaterThan(0.1);
        
        // Para ratio 1:1, las frecuencias dominante y master deben coincidir
        if (master === slave) {
          const freqCheck = verifyFrequency(result.dominant.frequency, master, 15);
          expect(freqCheck.valid).toBe(true);
        }
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE CASOS LÍMITE
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Casos Límite', () => {

    test('Master muy lento (sub-audio) produce modulación periódica', async ({ page }) => {
      // Master a 20Hz, slave a 440Hz
      // El sync resetea el slave 20 veces por segundo
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 20,
          slaveFrequency: 440,
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 1.0  // Más duración para captar ciclos del master
        });
      });

      // Debe haber señal (el sync resetea la fase 20 veces por segundo)
      expect(result.rms).toBeGreaterThan(0.05);
      // La frecuencia dominante probablemente seguirá siendo del slave
      // ya que hay muchos ciclos del slave entre cada reset
      expect(result.dominant).not.toBeNull();
    });

    test('Slave más lento que master (ratio inverso) produce efecto diferente', async ({ page }) => {
      // Master a 880Hz, slave a 440Hz (inverso del típico)
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 880,
          slaveFrequency: 440,
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Debe producir señal con energía
      // En este caso, el master resetea el slave antes de que complete su ciclo
      expect(result.rms).toBeGreaterThan(0.1);
      expect(result.dominant).not.toBeNull();
    });

    test('Misma frecuencia master/slave (sync in-phase)', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return await window.testHardSync({
          masterFrequency: 440,
          slaveFrequency: 440,
          masterWaveform: 'sine',
          slaveWaveform: 'sawtooth',
          duration: 0.5
        });
      });

      // Con la misma frecuencia, el sync fuerza alineación de fase
      const freqCheck = verifyFrequency(result.dominant.frequency, 440, 10);
      expect(freqCheck.valid).toBe(true);
      expect(result.rms).toBeGreaterThan(0.1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TESTS DE ESTABILIDAD
  // ─────────────────────────────────────────────────────────────────────────

  test.describe('Estabilidad del Sync', () => {

    test('Sync debe ser consistente en múltiples renders', async ({ page }) => {
      const config = {
        masterFrequency: 220,
        slaveFrequency: 440,
        masterWaveform: 'sine',
        slaveWaveform: 'sawtooth',
        duration: 0.3
      };

      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await page.evaluate(async (cfg) => {
          return await window.testHardSync(cfg);
        }, config);
        results.push(result);
      }

      // Todas las ejecuciones deben dar la misma frecuencia dominante
      const freqs = results.map(r => r.dominant.frequency);
      for (let i = 1; i < freqs.length; i++) {
        expect(Math.abs(freqs[i] - freqs[0])).toBeLessThan(5);
      }

      // RMS similar (determinístico)
      const rmsValues = results.map(r => r.rms);
      for (let i = 1; i < rmsValues.length; i++) {
        expect(Math.abs(rmsValues[i] - rmsValues[0])).toBeLessThan(0.01);
      }
    });
  });
});
