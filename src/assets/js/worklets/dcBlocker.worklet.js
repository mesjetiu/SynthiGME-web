/**
 * DC Blocker AudioWorklet - Eliminación de offset DC en la salida final
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PROPÓSITO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Protege los altavoces y la salida de audio eliminando cualquier componente
 * DC que pueda llegar a la etapa final de salida. Señales DC en altavoces
 * causan calentamiento de bobina, desplazamiento del cono y distorsión.
 * 
 * POSICIÓN EN LA CADENA:
 *   ... → muteNode → 🔵 DC BLOCKER → channelGains → masterGains → 🔊
 *   
 *   postVcaNode → RE-ENTRY (matriz) ← sin DC blocker (DC pasa para CV)
 * 
 * El DC blocker solo actúa en la ruta hacia altavoces. La re-entry a la
 * matriz NO pasa por este filtro, preservando señales DC legítimas
 * (joystick, voltajes de control) para FM, AM y otros usos de CV.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ALGORITMO: DC BLOCKER DE 1er ORDEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Algoritmo clásico de DC rejection (Julius O. Smith III):
 * 
 *   y[n] = x[n] - x[n-1] + R · y[n-1]
 * 
 * donde R = 1 - 2π·fc/fs determina la frecuencia de corte.
 * 
 * Función de transferencia:
 *   H(z) = (1 - z⁻¹) / (1 - R·z⁻¹)
 * 
 * Propiedades:
 *   - Un cero en z = 1 (bloquea DC exactamente)
 *   - Un polo en z = R (determina τ de settling)
 *   - 1er orden: respuesta libre exponencial pura (sin trend-following)
 *   - Transparente para señales por encima de fc
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PARÁMETROS DE DISEÑO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * fc = 1 Hz (por defecto, configurable en outputChannel.config.js):
 *   - -3 dB a 1 Hz, -0.04 dB a 10 Hz (totalmente inaudible)
 *   - Bloquea DC puro y sub-graves extremos (<1 Hz)
 *   - τ ≈ 159 ms: settling ~800 ms para 5τ
 *   - Transparente para todo el rango audible (20 Hz - 20 kHz)
 *   - Protege altavoces sin afectar sub-graves musicales
 * 
 * @module worklets/dcBlocker
 * @version 2.0.0
 */

class DCBlockerProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'cutoffFrequency',
        defaultValue: 1,       // 1 Hz — configurable desde outputChannel.config.js
        minValue: 0.001,
        maxValue: 100,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor() {
    super();

    // Estado del filtro de 1er orden
    this._x1 = 0;    // x[n-1]: muestra anterior de entrada
    this._y1 = 0;    // y[n-1]: muestra anterior de salida

    // Coeficiente R del polo (se recalcula si cambia fc)
    this._R = 0;
    this._lastFc = -1;  // Forzar cálculo inicial

    // Mensajes desde el hilo principal
    this.port.onmessage = (event) => {
      if (event.data?.type === 'reset') {
        this._x1 = 0;
        this._y1 = 0;
      }
    };
  }

  /**
   * Recalcula el coeficiente R del polo cuando cambia fc.
   * R = 1 - 2π·fc/fs
   * @param {number} fc - Frecuencia de corte en Hz
   */
  _updateCoefficient(fc) {
    if (fc === this._lastFc) return;
    this._R = 1 - (2 * Math.PI * fc / sampleRate);
    this._lastFc = fc;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    // Obtener fc (k-rate: un valor por bloque)
    const fc = parameters.cutoffFrequency[0];
    this._updateCoefficient(fc);

    const R = this._R;
    let x1 = this._x1;
    let y1 = this._y1;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      // DC blocker 1er orden: y[n] = x[n] - x[n-1] + R · y[n-1]
      const y = x - x1 + R * y1;
      x1 = x;
      y1 = y;

      output[i] = y;
    }

    this._x1 = x1;
    this._y1 = y1;

    return true;
  }
}

registerProcessor('dc-blocker', DCBlockerProcessor);
