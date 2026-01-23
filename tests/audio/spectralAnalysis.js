/**
 * Helpers de Análisis Espectral para Tests de Audio
 * 
 * Funciones reutilizables para analizar buffers de audio renderizados
 * con OfflineAudioContext. Incluye FFT, detección de frecuencias,
 * medición de THD, y verificación de formas de onda.
 * 
 * @module tests/audio/spectralAnalysis
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE ANÁLISIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Umbrales por defecto para verificaciones de audio.
 */
export const THRESHOLDS = {
  /** Tolerancia de frecuencia en Hz para comparaciones */
  FREQUENCY_TOLERANCE: 5,
  
  /** Umbral mínimo en dB para considerar una frecuencia significativa */
  MIN_SIGNIFICANT_DB: -60,
  
  /** THD máximo aceptable para "baja distorsión" */
  MAX_ACCEPTABLE_THD: 1.0,
  
  /** Tolerancia de amplitud para comparaciones de samples */
  AMPLITUDE_TOLERANCE: 0.01,
  
  /** Umbral de ruido de fondo en dB */
  NOISE_FLOOR_DB: -80
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES FFT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Implementación de FFT Cooley-Tukey radix-2.
 * 
 * @param {Float32Array|number[]} signal - Señal de entrada (debe ser potencia de 2)
 * @returns {Array<{re: number, im: number}>} Resultado complejo de la FFT
 */
export function fft(signal) {
  const N = signal.length;
  
  // Caso base
  if (N <= 1) {
    return [{ re: signal[0] || 0, im: 0 }];
  }
  
  // Verificar potencia de 2, si no, hacer zero-padding
  if (N & (N - 1)) {
    const nextPow2 = Math.pow(2, Math.ceil(Math.log2(N)));
    const padded = new Float32Array(nextPow2);
    padded.set(signal);
    return fft(padded);
  }

  // Dividir en pares e impares
  const even = new Float32Array(N / 2);
  const odd = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) {
    even[i] = signal[2 * i];
    odd[i] = signal[2 * i + 1];
  }

  const evenFFT = fft(even);
  const oddFFT = fft(odd);

  // Combinar
  const result = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const twiddle = { re: Math.cos(angle), im: Math.sin(angle) };
    
    const oddK = oddFFT[k];
    const t = {
      re: twiddle.re * oddK.re - twiddle.im * oddK.im,
      im: twiddle.re * oddK.im + twiddle.im * oddK.re
    };
    
    result[k] = {
      re: evenFFT[k].re + t.re,
      im: evenFFT[k].im + t.im
    };
    result[k + N / 2] = {
      re: evenFFT[k].re - t.re,
      im: evenFFT[k].im - t.im
    };
  }
  
  return result;
}

/**
 * Aplica una ventana Hanning a la señal para reducir leakage espectral.
 * 
 * @param {Float32Array} samples - Samples de entrada
 * @returns {Float32Array} Samples con ventana aplicada
 */
export function applyHanningWindow(samples) {
  const N = samples.length;
  const windowed = new Float32Array(N);
  
  for (let i = 0; i < N; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
    windowed[i] = samples[i] * window;
  }
  
  return windowed;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS DE ESPECTRO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula el espectro de magnitud de una señal.
 * 
 * @param {Float32Array} samples - Samples de audio
 * @param {number} sampleRate - Frecuencia de muestreo
 * @param {Object} [options] - Opciones de análisis
 * @param {boolean} [options.useWindow=true] - Aplicar ventana Hanning
 * @param {boolean} [options.normalize=true] - Normalizar por N
 * @returns {Array<{bin: number, frequency: number, magnitude: number, db: number}>}
 */
export function computeSpectrum(samples, sampleRate, options = {}) {
  const { useWindow = true, normalize = true } = options;
  
  // Aplicar ventana si se solicita
  const signal = useWindow ? applyHanningWindow(samples) : samples;
  
  const fftResult = fft(signal);
  const N = fftResult.length;
  const spectrum = [];
  
  // Solo la mitad positiva (hasta Nyquist)
  for (let i = 0; i < N / 2; i++) {
    const re = fftResult[i].re;
    const im = fftResult[i].im;
    let magnitude = Math.sqrt(re * re + im * im);
    
    if (normalize) {
      magnitude /= N;
    }
    
    // Compensar energía perdida por windowing (factor ~2 para Hanning)
    if (useWindow && i > 0) {
      magnitude *= 2;
    }
    
    const db = 20 * Math.log10(magnitude + 1e-10);
    
    spectrum.push({
      bin: i,
      frequency: i * sampleRate / N,
      magnitude,
      db
    });
  }
  
  return spectrum;
}

/**
 * Encuentra la frecuencia dominante (pico principal) en el espectro.
 * 
 * @param {Array} spectrum - Espectro calculado por computeSpectrum
 * @param {number} [minDb=-60] - Umbral mínimo en dB
 * @returns {Object|null} Bin con frecuencia dominante o null
 */
export function findDominantFrequency(spectrum, minDb = THRESHOLDS.MIN_SIGNIFICANT_DB) {
  let maxMag = -Infinity;
  let dominant = null;
  
  for (const bin of spectrum) {
    if (bin.db > minDb && bin.magnitude > maxMag) {
      maxMag = bin.magnitude;
      dominant = bin;
    }
  }
  
  return dominant;
}

/**
 * Interpolación parabólica para estimar frecuencia con precisión sub-bin.
 * 
 * @param {Array} spectrum - Espectro
 * @param {number} peakBin - Índice del bin pico
 * @param {number} sampleRate - Frecuencia de muestreo
 * @returns {number} Frecuencia estimada con interpolación
 */
export function interpolateFrequency(spectrum, peakBin, sampleRate) {
  if (peakBin <= 0 || peakBin >= spectrum.length - 1) {
    return spectrum[peakBin].frequency;
  }
  
  const y0 = spectrum[peakBin - 1].magnitude;
  const y1 = spectrum[peakBin].magnitude;
  const y2 = spectrum[peakBin + 1].magnitude;
  
  // Interpolación parabólica
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
  const binFreq = sampleRate / (spectrum.length * 2);
  
  return spectrum[peakBin].frequency + d * binFreq;
}

/**
 * Encuentra los armónicos de una frecuencia fundamental.
 * 
 * @param {Array} spectrum - Espectro
 * @param {number} fundamental - Frecuencia fundamental en Hz
 * @param {number} [count=10] - Número de armónicos a buscar
 * @param {number} [tolerance=5] - Tolerancia en Hz
 * @returns {Array<{harmonic: number, expected: number, found: Object|null}>}
 */
export function findHarmonics(spectrum, fundamental, count = 10, tolerance = THRESHOLDS.FREQUENCY_TOLERANCE) {
  const harmonics = [];
  
  for (let n = 1; n <= count; n++) {
    const targetFreq = fundamental * n;
    let best = null;
    let bestDiff = Infinity;
    
    for (const bin of spectrum) {
      const diff = Math.abs(bin.frequency - targetFreq);
      if (diff < tolerance && diff < bestDiff) {
        bestDiff = diff;
        best = bin;
      }
    }
    
    harmonics.push({
      harmonic: n,
      expected: targetFreq,
      found: best
    });
  }
  
  return harmonics;
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICIONES DE CALIDAD DE AUDIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula la Distorsión Armónica Total (THD).
 * 
 * THD = sqrt(sum(H2² + H3² + ... + Hn²)) / H1 * 100%
 * 
 * @param {Array} spectrum - Espectro
 * @param {number} fundamental - Frecuencia fundamental
 * @param {number} [numHarmonics=5] - Número de armónicos a considerar
 * @returns {number|null} THD en porcentaje, o null si no se puede calcular
 */
export function measureTHD(spectrum, fundamental, numHarmonics = 5) {
  const harmonics = findHarmonics(spectrum, fundamental, numHarmonics + 1);
  
  const fundamentalMag = harmonics[0]?.found?.magnitude || 0;
  if (fundamentalMag === 0) return null;
  
  let harmonicPower = 0;
  for (let i = 1; i < harmonics.length; i++) {
    const mag = harmonics[i]?.found?.magnitude || 0;
    harmonicPower += mag * mag;
  }
  
  return Math.sqrt(harmonicPower) / fundamentalMag * 100;
}

/**
 * Mide el nivel de ruido de fondo (noise floor).
 * Calcula el promedio de magnitudes en bins sin señal significativa.
 * 
 * @param {Array} spectrum - Espectro
 * @param {number} [thresholdDb=-40] - Umbral para considerar "sin señal"
 * @returns {{averageDb: number, maxDb: number}}
 */
export function measureNoiseFloor(spectrum, thresholdDb = -40) {
  const noiseBins = spectrum.filter(bin => bin.db < thresholdDb);
  
  if (noiseBins.length === 0) {
    return { averageDb: -Infinity, maxDb: -Infinity };
  }
  
  const avgMag = noiseBins.reduce((sum, bin) => sum + bin.magnitude, 0) / noiseBins.length;
  const maxMag = Math.max(...noiseBins.map(bin => bin.magnitude));
  
  return {
    averageDb: 20 * Math.log10(avgMag + 1e-10),
    maxDb: 20 * Math.log10(maxMag + 1e-10)
  };
}

/**
 * Calcula la relación señal-ruido (SNR).
 * 
 * @param {Array} spectrum - Espectro
 * @param {number} signalFrequency - Frecuencia de la señal
 * @param {number} [bandwidth=50] - Ancho de banda de la señal en Hz
 * @returns {number} SNR en dB
 */
export function measureSNR(spectrum, signalFrequency, bandwidth = 50) {
  let signalPower = 0;
  let noisePower = 0;
  
  for (const bin of spectrum) {
    const power = bin.magnitude * bin.magnitude;
    if (Math.abs(bin.frequency - signalFrequency) < bandwidth / 2) {
      signalPower += power;
    } else {
      noisePower += power;
    }
  }
  
  if (noisePower === 0) return Infinity;
  return 10 * Math.log10(signalPower / noisePower);
}

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS DE FORMA DE ONDA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula el valor RMS de una señal.
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @returns {number} Valor RMS
 */
export function calculateRMS(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Calcula el valor pico de una señal.
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @returns {number} Valor pico (máximo absoluto)
 */
export function calculatePeak(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  return max;
}

/**
 * Calcula el factor de cresta (crest factor).
 * Indica qué tan "puntiaguda" es la forma de onda.
 * 
 * Sine = ~1.414 (√2)
 * Square = 1.0
 * Triangle = ~1.732 (√3)
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @returns {number} Factor de cresta (peak / RMS)
 */
export function calculateCrestFactor(samples) {
  const rms = calculateRMS(samples);
  const peak = calculatePeak(samples);
  return rms > 0 ? peak / rms : 0;
}

/**
 * Detecta cruces por cero en la señal.
 * Útil para verificar frecuencia y fase.
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @returns {{count: number, indices: number[]}}
 */
export function detectZeroCrossings(samples) {
  const crossings = [];
  
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] < 0 && samples[i] >= 0) ||
        (samples[i - 1] > 0 && samples[i] <= 0)) {
      crossings.push(i);
    }
  }
  
  return {
    count: crossings.length,
    indices: crossings
  };
}

/**
 * Estima la frecuencia fundamental usando cruces por cero.
 * Método simple pero efectivo para señales limpias.
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @param {number} sampleRate - Frecuencia de muestreo
 * @returns {number} Frecuencia estimada en Hz
 */
export function estimateFrequencyFromZeroCrossings(samples, sampleRate) {
  const crossings = detectZeroCrossings(samples);
  
  if (crossings.count < 2) return 0;
  
  // Calcular período promedio
  let totalSamples = 0;
  for (let i = 1; i < crossings.indices.length; i++) {
    totalSamples += crossings.indices[i] - crossings.indices[i - 1];
  }
  
  const avgPeriodSamples = totalSamples / (crossings.indices.length - 1);
  const avgPeriodSeconds = avgPeriodSamples / sampleRate;
  
  // Cada período tiene 2 cruces por cero, así que dividimos por 2
  return 1 / (avgPeriodSeconds * 2);
}

/**
 * Verifica si una forma de onda coincide con un tipo esperado.
 * Usa el factor de cresta como heurística principal.
 * 
 * @param {Float32Array|number[]} samples - Samples de audio
 * @param {string} expectedType - 'sine'|'square'|'triangle'|'sawtooth'
 * @param {number} [tolerance=0.1] - Tolerancia en el factor de cresta
 * @returns {{matches: boolean, crestFactor: number, expected: number}}
 */
export function verifyWaveformType(samples, expectedType, tolerance = 0.1) {
  const crestFactor = calculateCrestFactor(samples);
  
  const expectedCrestFactors = {
    sine: Math.sqrt(2),        // ~1.414
    square: 1.0,
    triangle: Math.sqrt(3),    // ~1.732
    sawtooth: Math.sqrt(3),    // ~1.732
    pulse: null                // Variable según duty cycle
  };
  
  const expected = expectedCrestFactors[expectedType];
  if (expected === null) {
    return { matches: null, crestFactor, expected: null };
  }
  
  const matches = Math.abs(crestFactor - expected) < tolerance;
  
  return { matches, crestFactor, expected };
}

/**
 * Compara dos buffers de audio sample por sample.
 * 
 * @param {Float32Array|number[]} a - Primer buffer
 * @param {Float32Array|number[]} b - Segundo buffer
 * @param {number} [tolerance=0.001] - Tolerancia por sample
 * @returns {{matches: boolean, maxDiff: number, avgDiff: number, diffCount: number}}
 */
export function compareBuffers(a, b, tolerance = THRESHOLDS.AMPLITUDE_TOLERANCE) {
  const length = Math.min(a.length, b.length);
  let maxDiff = 0;
  let sumDiff = 0;
  let diffCount = 0;
  
  for (let i = 0; i < length; i++) {
    const diff = Math.abs(a[i] - b[i]);
    if (diff > maxDiff) maxDiff = diff;
    sumDiff += diff;
    if (diff > tolerance) diffCount++;
  }
  
  return {
    matches: diffCount === 0,
    maxDiff,
    avgDiff: sumDiff / length,
    diffCount
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES DE GENERACIÓN DE SEÑALES DE REFERENCIA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera una señal de referencia para comparación.
 * 
 * @param {string} type - Tipo de onda: 'sine'|'square'|'triangle'|'sawtooth'
 * @param {number} frequency - Frecuencia en Hz
 * @param {number} duration - Duración en segundos
 * @param {number} sampleRate - Frecuencia de muestreo
 * @param {Object} [options] - Opciones adicionales
 * @returns {Float32Array} Buffer con la señal generada
 */
export function generateReference(type, frequency, duration, sampleRate, options = {}) {
  const { amplitude = 1.0, phase = 0 } = options;
  const length = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(length);
  
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const p = (frequency * t + phase) % 1;
    
    let sample;
    switch (type) {
      case 'sine':
        sample = Math.sin(2 * Math.PI * p);
        break;
      case 'cosine':
        sample = Math.cos(2 * Math.PI * p);
        break;
      case 'square':
        sample = p < 0.5 ? 1 : -1;
        break;
      case 'triangle':
        sample = p < 0.5 ? (4 * p - 1) : (3 - 4 * p);
        break;
      case 'sawtooth':
        sample = 2 * p - 1;
        break;
      default:
        sample = 0;
    }
    
    samples[i] = sample * amplitude;
  }
  
  return samples;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS TEMPORAL DE TRANSITORIOS
// ═══════════════════════════════════════════════════════════════════════════
//
// Funciones para analizar el suavizado de formas de onda, basadas en las
// características eléctricas del Synthi 100 (Datanomics 1982).
//
// Referencias:
// - El slew rate del CA3140 (op-amp del oscilador) limita pendientes verticales
// - La impedancia de los pines de matriz (100kΩ, 2.7kΩ, etc.) crea integración RC
// - Manual técnico: "con pines de 100k se produce integración de transitorios"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mide el tiempo de subida (rise time) de una transición en la señal.
 * 
 * El rise time se define como el tiempo que tarda la señal en pasar del 10%
 * al 90% de la amplitud total de la transición. En el hardware del Synthi 100,
 * este tiempo nunca es cero debido al slew rate finito de los op-amps.
 * 
 * Referencia Synthi 100:
 * - El módulo Slew Limiter tiene un máximo de 1 V/ms (Manual Datanomics)
 * - Los transitorios del oscilador están limitados por el CA3140
 * 
 * @param {Float32Array|number[]} samples - Buffer de audio
 * @param {number} sampleRate - Frecuencia de muestreo en Hz
 * @param {Object} [options] - Opciones de análisis
 * @param {number} [options.lowThreshold=0.1] - Umbral inferior (10% por defecto)
 * @param {number} [options.highThreshold=0.9] - Umbral superior (90% por defecto)
 * @param {boolean} [options.findFirst=true] - true: primera transición, false: promedio
 * @returns {{riseTime: number, riseTimeSamples: number, transitionsFound: number, avgRiseTime: number}}
 */
export function measureRiseTime(samples, sampleRate, options = {}) {
  const {
    lowThreshold = 0.1,
    highThreshold = 0.9,
    findFirst = true
  } = options;
  
  // Encontrar amplitud mínima y máxima para normalizar
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] < minVal) minVal = samples[i];
    if (samples[i] > maxVal) maxVal = samples[i];
  }
  
  const range = maxVal - minVal;
  if (range < 0.001) {
    return { riseTime: 0, riseTimeSamples: 0, transitionsFound: 0, avgRiseTime: 0 };
  }
  
  // Calcular niveles absolutos basados en el rango completo
  const lowLevel = minVal + range * lowThreshold;
  const highLevel = minVal + range * highThreshold;
  
  const transitions = [];
  
  // Buscar transiciones ascendentes (flanco de subida)
  // Para cada punto que cruza el umbral bajo hacia arriba, buscar
  // el primer punto que cruza el umbral alto
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    
    // Detectar cruce ascendente del umbral bajo
    // También cuenta si el sample anterior estaba por debajo y el actual ya pasó ambos umbrales
    // (transición instantánea en onda cuadrada)
    if (prev <= lowLevel && curr > lowLevel) {
      const riseStartIndex = i;
      
      // Si ya pasó el umbral alto en el mismo sample (transición instantánea)
      if (curr >= highLevel) {
        transitions.push(1);  // Rise time = 1 sample (instantáneo)
        if (findFirst) break;
        continue;
      }
      
      // Buscar el cruce del umbral alto
      for (let j = i + 1; j < samples.length; j++) {
        const prevJ = samples[j - 1];
        const currJ = samples[j];
        
        // Si baja por debajo del umbral bajo, abortamos esta transición
        if (currJ <= lowLevel) break;
        
        // Cruce ascendente del umbral alto
        if (prevJ < highLevel && currJ >= highLevel) {
          const riseTimeSamples = j - riseStartIndex + 1;
          transitions.push(riseTimeSamples);
          if (findFirst) break;
          break;
        }
      }
      
      if (findFirst && transitions.length > 0) break;
    }
  }
  
  if (transitions.length === 0) {
    return { riseTime: 0, riseTimeSamples: 0, transitionsFound: 0, avgRiseTime: 0 };
  }
  
  const firstRiseSamples = transitions[0];
  const avgRiseSamples = transitions.reduce((a, b) => a + b, 0) / transitions.length;
  
  return {
    riseTime: firstRiseSamples / sampleRate,
    riseTimeSamples: firstRiseSamples,
    transitionsFound: transitions.length,
    avgRiseTime: avgRiseSamples / sampleRate
  };
}

/**
 * Mide el tiempo de bajada (fall time) de una transición en la señal.
 * Complementario a measureRiseTime para análisis simétrico.
 * 
 * @param {Float32Array|number[]} samples - Buffer de audio
 * @param {number} sampleRate - Frecuencia de muestreo en Hz
 * @param {Object} [options] - Opciones (mismas que measureRiseTime)
 * @returns {{fallTime: number, fallTimeSamples: number, transitionsFound: number, avgFallTime: number}}
 */
export function measureFallTime(samples, sampleRate, options = {}) {
  const {
    lowThreshold = 0.1,
    highThreshold = 0.9,
    findFirst = true
  } = options;
  
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] < minVal) minVal = samples[i];
    if (samples[i] > maxVal) maxVal = samples[i];
  }
  
  const range = maxVal - minVal;
  if (range < 0.001) {
    return { fallTime: 0, fallTimeSamples: 0, transitionsFound: 0, avgFallTime: 0 };
  }
  
  const lowLevel = minVal + range * lowThreshold;
  const highLevel = minVal + range * highThreshold;
  
  const transitions = [];
  let fallStartIndex = -1;
  
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    
    // Detectar cruce descendente sobre highLevel (inicio de bajada)
    if (curr <= highLevel && prev > highLevel && fallStartIndex === -1) {
      fallStartIndex = i;
    }
    // Detectar cruce descendente sobre lowLevel (fin de bajada)
    else if (fallStartIndex !== -1 && curr <= lowLevel && prev > lowLevel) {
      const fallTimeSamples = i - fallStartIndex;
      transitions.push(fallTimeSamples);
      fallStartIndex = -1;
      
      if (findFirst) break;
    }
    // Reset si sube por encima del umbral alto
    else if (curr > highLevel) {
      fallStartIndex = -1;
    }
  }
  
  if (transitions.length === 0) {
    return { fallTime: 0, fallTimeSamples: 0, transitionsFound: 0, avgFallTime: 0 };
  }
  
  const firstFallSamples = transitions[0];
  const avgFallSamples = transitions.reduce((a, b) => a + b, 0) / transitions.length;
  
  return {
    fallTime: firstFallSamples / sampleRate,
    fallTimeSamples: firstFallSamples,
    transitionsFound: transitions.length,
    avgFallTime: avgFallSamples / sampleRate
  };
}

/**
 * Calcula la energía espectral en una banda de frecuencias alta.
 * 
 * Útil para cuantificar el contenido armónico de alta frecuencia que
 * debería ser atenuado por el suavizado de formas de onda. En el Synthi 100,
 * la capacitancia parásita de la matriz (~100pF) combinada con la resistencia
 * de los pines crea un filtro RC natural que atenúa estos armónicos.
 * 
 * Referencia Synthi 100:
 * - Pin blanco (100kΩ): fc ≈ 15.9 kHz (atenúa armónicos de audio alto)
 * - Pin rojo (2.7kΩ): fc ≈ 589 kHz (transparente en rango audible)
 * 
 * @param {Array} spectrum - Espectro calculado por computeSpectrum()
 * @param {number} cutoffHz - Frecuencia de corte inferior de la banda
 * @param {Object} [options] - Opciones adicionales
 * @param {number} [options.upperLimitHz=Infinity] - Límite superior de la banda
 * @returns {{energy: number, energyDb: number, binCount: number, avgMagnitude: number}}
 */
export function measureHighFrequencyEnergy(spectrum, cutoffHz, options = {}) {
  const { upperLimitHz = Infinity } = options;
  
  let energy = 0;
  let binCount = 0;
  let magnitudeSum = 0;
  
  for (const bin of spectrum) {
    if (bin.frequency >= cutoffHz && bin.frequency <= upperLimitHz) {
      energy += bin.magnitude * bin.magnitude;
      magnitudeSum += bin.magnitude;
      binCount++;
    }
  }
  
  const avgMagnitude = binCount > 0 ? magnitudeSum / binCount : 0;
  const energyDb = 10 * Math.log10(energy + 1e-10);
  
  return {
    energy,
    energyDb,
    binCount,
    avgMagnitude
  };
}

/**
 * Compara espectros antes y después de filtrado para verificar atenuación.
 * 
 * Calcula la diferencia en dB por banda de frecuencia, útil para verificar
 * que el suavizado de forma de onda está atenuando correctamente los
 * armónicos de alta frecuencia sin afectar las frecuencias bajas.
 * 
 * @param {Array} spectrumBefore - Espectro sin filtrar
 * @param {Array} spectrumAfter - Espectro después de filtrado
 * @param {Object} [options] - Opciones de análisis
 * @param {number[]} [options.bandEdges=[100, 1000, 5000, 10000, 15000]] - Límites de bandas en Hz
 * @returns {Array<{bandStart: number, bandEnd: number, attenuationDb: number}>}
 */
export function compareSpectraAttenuation(spectrumBefore, spectrumAfter, options = {}) {
  const { bandEdges = [100, 1000, 5000, 10000, 15000, 20000] } = options;
  
  const bands = [];
  
  for (let i = 0; i < bandEdges.length - 1; i++) {
    const bandStart = bandEdges[i];
    const bandEnd = bandEdges[i + 1];
    
    const energyBefore = measureHighFrequencyEnergy(spectrumBefore, bandStart, { upperLimitHz: bandEnd });
    const energyAfter = measureHighFrequencyEnergy(spectrumAfter, bandStart, { upperLimitHz: bandEnd });
    
    // Atenuación positiva = energía reducida
    const attenuationDb = energyBefore.energyDb - energyAfter.energyDb;
    
    bands.push({
      bandStart,
      bandEnd,
      attenuationDb,
      energyBefore: energyBefore.energyDb,
      energyAfter: energyAfter.energyDb
    });
  }
  
  return bands;
}

/**
 * Calcula la frecuencia de corte RC teórica para un pin dado.
 * 
 * Fórmula: fc = 1 / (2π × R × C)
 * 
 * Basado en el modelo de la matriz del Synthi 100 donde cada pin
 * forma un filtro RC con la capacitancia parásita del bus.
 * 
 * @param {number} resistance - Resistencia del pin en ohmios
 * @param {number} [capacitance=100e-12] - Capacitancia del bus en faradios (100pF por defecto)
 * @returns {number} Frecuencia de corte en Hz
 */
export function calculateRCCutoffFrequency(resistance, capacitance = 100e-12) {
  return 1 / (2 * Math.PI * resistance * capacitance);
}

/**
 * Constantes de frecuencia de corte pre-calculadas para los pines estándar.
 * Basado en capacitancia de bus estimada de 100pF.
 * 
 * Referencia Synthi 100 (Manual Datanomics 1982):
 * - El manual advierte que pines de 100kΩ producen "integración" visible
 * - El pin rojo de 2.7kΩ se usa para osciloscopio sin integración
 */
export const PIN_CUTOFF_FREQUENCIES = {
  WHITE: calculateRCCutoffFrequency(100000),     // ~15.9 kHz
  GREY: calculateRCCutoffFrequency(100000),      // ~15.9 kHz
  GREEN: calculateRCCutoffFrequency(68000),      // ~23.4 kHz
  RED: calculateRCCutoffFrequency(2700),         // ~589 kHz (bypass)
  BLUE: calculateRCCutoffFrequency(10000),       // ~159 kHz
  YELLOW: calculateRCCutoffFrequency(22000),     // ~72 kHz
  CYAN: calculateRCCutoffFrequency(250000),      // ~6.4 kHz
  PURPLE: calculateRCCutoffFrequency(1000000)    // ~1.6 kHz
};
