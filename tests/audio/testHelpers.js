/**
 * Helpers y Utilidades para Tests de Audio
 * 
 * Funciones de conveniencia para configurar y ejecutar tests de audio
 * en Playwright con Web Audio API real.
 * 
 * @module tests/audio/testHelpers
 * @version 1.0.0
 */

import { THRESHOLDS } from './spectralAnalysis.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuración por defecto para tests de audio.
 */
export const DEFAULT_TEST_CONFIG = {
  sampleRate: 44100,
  duration: 0.5,       // 500ms - suficiente para análisis FFT preciso
  shortDuration: 0.1,  // 100ms - para tests rápidos
  longDuration: 1.0    // 1s - para análisis espectral preciso
};

/**
 * Frecuencias de prueba estándar.
 */
export const TEST_FREQUENCIES = {
  LOW: 100,      // Frecuencia baja
  MID: 440,      // La4 (A4) - frecuencia de referencia
  HIGH: 1000,    // 1kHz - frecuencia de prueba común
  VERY_HIGH: 10000  // 10kHz - para tests de anti-aliasing
};

/**
 * Tolerancias específicas para diferentes tipos de verificación.
 */
export const TEST_TOLERANCES = {
  frequency: {
    tight: 1,      // ±1 Hz para frecuencias estables
    normal: 5,     // ±5 Hz para análisis general
    loose: 20      // ±20 Hz para frecuencias muy altas
  },
  amplitude: {
    tight: 0.001,   // Para comparaciones precisas
    normal: 0.01,   // Para verificación general
    loose: 0.05     // Para señales con variación
  },
  thd: {
    pure: 0.5,      // THD < 0.5% para ondas puras
    low: 1.0,       // THD < 1% para baja distorsión
    acceptable: 5.0 // THD < 5% aceptable para modulación
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE PÁGINA (PLAYWRIGHT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Espera a que el harness de audio esté listo.
 * 
 * @param {Page} page - Página de Playwright
 * @param {number} [timeout=5000] - Timeout en ms
 */
export async function waitForHarnessReady(page, timeout = 5000) {
  await page.waitForFunction(
    () => window.__AUDIO_HARNESS_READY__ === true,
    { timeout }
  );
}

/**
 * Navega al harness y espera a que esté listo.
 * 
 * @param {Page} page - Página de Playwright
 */
export async function setupAudioPage(page) {
  await page.goto('/tests/audio/harness.html');
  await waitForHarnessReady(page);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE VERIFICACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica que una frecuencia medida está dentro de tolerancia.
 * 
 * @param {number} measured - Frecuencia medida
 * @param {number} expected - Frecuencia esperada
 * @param {number} [tolerance=5] - Tolerancia en Hz
 * @returns {{valid: boolean, diff: number, message: string}}
 */
export function verifyFrequency(measured, expected, tolerance = TEST_TOLERANCES.frequency.normal) {
  const diff = Math.abs(measured - expected);
  const valid = diff <= tolerance;
  
  return {
    valid,
    diff,
    message: valid 
      ? `Frecuencia ${measured}Hz coincide con esperada ${expected}Hz (±${tolerance}Hz)`
      : `Frecuencia ${measured}Hz difiere de esperada ${expected}Hz por ${diff.toFixed(2)}Hz`
  };
}

/**
 * Verifica que el THD está dentro de límites aceptables.
 * 
 * @param {number} thd - THD medido en porcentaje
 * @param {number} [maxThd=1.0] - THD máximo aceptable
 * @returns {{valid: boolean, message: string}}
 */
export function verifyTHD(thd, maxThd = TEST_TOLERANCES.thd.low) {
  const valid = thd <= maxThd;
  
  return {
    valid,
    message: valid
      ? `THD ${thd.toFixed(3)}% está dentro del límite ${maxThd}%`
      : `THD ${thd.toFixed(3)}% excede el límite ${maxThd}%`
  };
}

/**
 * Verifica que la amplitud está dentro de rango esperado.
 * 
 * @param {number} measured - Amplitud medida
 * @param {number} expected - Amplitud esperada
 * @param {number} [tolerance=0.01] - Tolerancia
 * @returns {{valid: boolean, diff: number, message: string}}
 */
export function verifyAmplitude(measured, expected, tolerance = TEST_TOLERANCES.amplitude.normal) {
  const diff = Math.abs(measured - expected);
  const valid = diff <= tolerance;
  
  return {
    valid,
    diff,
    message: valid
      ? `Amplitud ${measured.toFixed(4)} coincide con esperada ${expected} (±${tolerance})`
      : `Amplitud ${measured.toFixed(4)} difiere de esperada ${expected} por ${diff.toFixed(4)}`
  };
}

/**
 * Verifica la alineación de fase esperada.
 * 
 * @param {Object} phaseAnalysis - Análisis de fase del resultado
 * @param {string} waveform - Tipo de forma de onda
 * @returns {{valid: boolean, details: Object}}
 */
export function verifyPhaseAlignment(phaseAnalysis, waveform) {
  const tolerance = 0.1;
  const details = {};
  let valid = true;
  
  switch (waveform) {
    case 'sine':
      // Sine con symmetry=0.5 debe empezar en pico (+1)
      // Phase 0 = +1, Phase 0.25 = 0, Phase 0.5 = -1
      details.startValue = {
        expected: 1.0,
        actual: phaseAnalysis.startValue,
        valid: Math.abs(phaseAnalysis.startValue - 1.0) < tolerance
      };
      details.halfCycle = {
        expected: -1.0,
        actual: phaseAnalysis.halfCycle,
        valid: Math.abs(phaseAnalysis.halfCycle - (-1.0)) < tolerance
      };
      break;
      
    case 'sawtooth':
      // Sawtooth empieza en -1 y sube a +1
      details.startValue = {
        expected: -1.0,
        actual: phaseAnalysis.startValue,
        valid: Math.abs(phaseAnalysis.startValue - (-1.0)) < tolerance
      };
      break;
      
    case 'triangle':
      // Triangle empieza en +1 (alineado con sine)
      details.startValue = {
        expected: 1.0,
        actual: phaseAnalysis.startValue,
        valid: Math.abs(phaseAnalysis.startValue - 1.0) < tolerance
      };
      details.halfCycle = {
        expected: -1.0,
        actual: phaseAnalysis.halfCycle,
        valid: Math.abs(phaseAnalysis.halfCycle - (-1.0)) < tolerance
      };
      break;
      
    case 'pulse':
      // Pulse empieza en estado alto (+1) por defecto
      details.startValue = {
        expected: 1.0,
        actual: phaseAnalysis.startValue,
        valid: Math.abs(phaseAnalysis.startValue - 1.0) < tolerance
      };
      break;
  }
  
  // Verificar si todos los detalles son válidos
  for (const key in details) {
    if (!details[key].valid) {
      valid = false;
    }
  }
  
  return { valid, details };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE CONFIGURACIÓN DE TESTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea configuración de test para un oscilador.
 * 
 * @param {Object} overrides - Valores a sobrescribir
 * @returns {Object} Configuración completa
 */
export function createOscillatorConfig(overrides = {}) {
  return {
    waveform: 'sine',
    frequency: TEST_FREQUENCIES.MID,
    duration: DEFAULT_TEST_CONFIG.duration,
    pulseWidth: 0.5,
    symmetry: 0.5,
    sampleRate: DEFAULT_TEST_CONFIG.sampleRate,
    ...overrides
  };
}

/**
 * Crea configuración de test para routing de matriz.
 * 
 * @param {Object} overrides - Valores a sobrescribir
 * @returns {Object} Configuración completa
 */
export function createRoutingConfig(overrides = {}) {
  return {
    sourceFrequency: TEST_FREQUENCIES.MID,
    sourceWaveform: 'sine',
    gains: [1.0],
    duration: DEFAULT_TEST_CONFIG.duration,
    sampleRate: DEFAULT_TEST_CONFIG.sampleRate,
    ...overrides
  };
}

/**
 * Genera casos de test para un barrido de frecuencias.
 * 
 * @param {number[]} frequencies - Array de frecuencias a probar
 * @param {Object} baseConfig - Configuración base
 * @returns {Array<{name: string, config: Object}>}
 */
export function generateFrequencySweepCases(frequencies, baseConfig = {}) {
  return frequencies.map(freq => ({
    name: `${freq}Hz`,
    config: createOscillatorConfig({ ...baseConfig, frequency: freq })
  }));
}

/**
 * Genera casos de test para diferentes formas de onda.
 * 
 * @param {string[]} waveforms - Array de tipos de onda
 * @param {Object} baseConfig - Configuración base
 * @returns {Array<{name: string, config: Object}>}
 */
export function generateWaveformCases(waveforms, baseConfig = {}) {
  return waveforms.map(waveform => ({
    name: waveform,
    config: createOscillatorConfig({ ...baseConfig, waveform })
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE REPORTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatea un resultado de test para logging.
 * 
 * @param {Object} result - Resultado del test de audio
 * @returns {string} Resumen formateado
 */
export function formatTestResult(result) {
  const lines = [];
  
  if (result.dominant) {
    lines.push(`Frecuencia dominante: ${result.dominant.frequency.toFixed(2)}Hz (${result.dominant.db.toFixed(1)}dB)`);
  }
  
  if (result.thd !== null) {
    lines.push(`THD: ${result.thd.toFixed(3)}%`);
  }
  
  lines.push(`RMS: ${result.rms.toFixed(4)}`);
  lines.push(`Peak: ${result.peak.toFixed(4)}`);
  lines.push(`Render time: ${result.renderTime.toFixed(1)}ms`);
  
  return lines.join('\n');
}

/**
 * Compara resultados de test con expectativas.
 * 
 * @param {Object} result - Resultado del test
 * @param {Object} expected - Valores esperados
 * @returns {Object} Reporte de comparación
 */
export function compareWithExpected(result, expected) {
  const report = {
    passed: true,
    checks: []
  };
  
  if (expected.frequency !== undefined) {
    const check = verifyFrequency(
      result.dominant?.frequency || 0,
      expected.frequency,
      expected.frequencyTolerance || TEST_TOLERANCES.frequency.normal
    );
    report.checks.push({ name: 'frequency', ...check });
    if (!check.valid) report.passed = false;
  }
  
  if (expected.maxThd !== undefined) {
    const check = verifyTHD(result.thd || Infinity, expected.maxThd);
    report.checks.push({ name: 'thd', ...check });
    if (!check.valid) report.passed = false;
  }
  
  if (expected.amplitude !== undefined) {
    const check = verifyAmplitude(
      result.peak,
      expected.amplitude,
      expected.amplitudeTolerance || TEST_TOLERANCES.amplitude.normal
    );
    report.checks.push({ name: 'amplitude', ...check });
    if (!check.valid) report.passed = false;
  }
  
  return report;
}
