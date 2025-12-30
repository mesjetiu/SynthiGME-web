/**
 * Utilidades de audio para síntesis de ondas
 * 
 * Funciones puras para crear formas de onda personalizadas usando PeriodicWave.
 * Centralizadas para evitar duplicación en app.js, pulse.js, etc.
 */

/**
 * Crea una onda de pulso (cuadrada con duty cycle variable).
 * 
 * Genera una PeriodicWave que varía de una onda cuadrada perfecta (duty=0.5)
 * a pulsos estrechos (duty cercano a 0 o 1).
 * 
 * @param {AudioContext} ctx - Contexto de audio
 * @param {number} duty - Ciclo de trabajo (0.01 a 0.99, donde 0.5 = cuadrada)
 * @param {number} [harmonics=32] - Número de armónicos para la síntesis
 * @returns {PeriodicWave} Onda periódica para usar con OscillatorNode
 * 
 * @example
 * const wave = createPulseWave(audioCtx, 0.25); // Pulso 25%
 * oscillator.setPeriodicWave(wave);
 */
export function createPulseWave(ctx, duty, harmonics = 32) {
  const d = Math.min(0.99, Math.max(0.01, duty));
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
  }
  return ctx.createPeriodicWave(real, imag);
}

/**
 * Crea una onda senoidal asimétrica.
 * 
 * Genera una PeriodicWave que varía de seno puro (symmetry=0.5)
 * a formas asimétricas añadiendo armónicos pares.
 * 
 * @param {AudioContext} ctx - Contexto de audio
 * @param {number} symmetry - Simetría (0 a 1, donde 0.5 = seno puro)
 * @param {number} [harmonics=16] - Número de armónicos para la síntesis
 * @returns {PeriodicWave} Onda periódica para usar con OscillatorNode
 * 
 * @example
 * const wave = createAsymmetricSineWave(audioCtx, 0.7); // Seno asimétrico
 * oscillator.setPeriodicWave(wave);
 */
export function createAsymmetricSineWave(ctx, symmetry, harmonics = 16) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  imag[1] = 1.0;
  const asymAmount = (symmetry - 0.5) * 2;
  for (let n = 2; n <= harmonics; n += 2) {
    imag[n] = asymAmount * (1.0 / (n * n));
  }
  return ctx.createPeriodicWave(real, imag);
}
