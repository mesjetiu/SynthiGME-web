// ═══════════════════════════════════════════════════════════════════════════
// RING MODULATOR WORKLET — Synthi 100 / Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════
//
// Multiplicador de precisión activo basado en chip 4214AP.
// Sin transformador, sin diodos — multiplicación matemática pura.
//
// DSP:
//   output[n] = softClip(inputA[n]) × softClip(inputB[n])
//
// La ganancia de salida (Level) se aplica externamente mediante
// un GainNode en el módulo principal (main thread).
//
// Soft-clip:
//   Transparente hasta ±SOFT_CLIP_THRESHOLD (0.8, equivalente a 8V p-p).
//   Saturación suave tipo tanh por encima del umbral.
//   Esto replica el comportamiento del hardware donde señales > 8V p-p
//   empiezan a distorsionar por saturación de los op-amps de entrada.
//
// Entradas:
//   input 0: Señal A (canal 0 = mono)
//   input 1: Señal B (canal 0 = mono)
//
// Salida:
//   output 0: Resultado de la multiplicación (canal 0 = mono)
//
// Mensajes:
//   { type: 'setDormant', dormant: boolean }
//   { type: 'stop' }
//
// Referencia: Plano D100-05 C1, Manual Datanomics 1982
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

// Umbral de soft-clip normalizado: 8V p-p sobre ~10V p-p de rango total del sistema
const SOFT_CLIP_THRESHOLD = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES DSP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft-clip con saturación tanh.
 * Transparente por debajo del umbral, saturación suave por encima.
 * Simétrico para señales positivas y negativas.
 *
 * @param {number} x - Muestra de entrada
 * @returns {number} Muestra limitada
 */
function softClip(x) {
  if (x >= -SOFT_CLIP_THRESHOLD && x <= SOFT_CLIP_THRESHOLD) {
    return x;
  }
  // Saturación suave por encima del umbral
  const sign = x > 0 ? 1 : -1;
  const ax = Math.abs(x);
  const excess = ax - SOFT_CLIP_THRESHOLD;
  const range = 1.0 - SOFT_CLIP_THRESHOLD;
  return sign * (SOFT_CLIP_THRESHOLD + range * Math.tanh(excess / range));
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

class RingModulatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._isDormant = false;
    this._isStopped = false;
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  _handleMessage(data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'setDormant':
        this._isDormant = !!data.dormant;
        break;
      case 'stop':
        this._isStopped = true;
        break;
    }
  }

  process(inputs, outputs) {
    if (this._isStopped) return false;

    const output = outputs[0]?.[0];
    if (!output) return true;

    if (this._isDormant) {
      output.fill(0);
      return true;
    }

    const inputA = inputs[0]?.[0];
    const inputB = inputs[1]?.[0];

    // Si alguna entrada no está conectada (array vacío), salida es silencio.
    // Esto replica el comportamiento del hardware: anything × 0 = 0
    if (!inputA || !inputB || inputA.length === 0 || inputB.length === 0) {
      output.fill(0);
      return true;
    }

    // Multiplicación pura con soft-clip en las entradas
    for (let i = 0; i < output.length; i++) {
      output[i] = softClip(inputA[i]) * softClip(inputB[i]);
    }

    return true;
  }
}

registerProcessor('ring-modulator', RingModulatorProcessor);
