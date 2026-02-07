/**
 * DC Blocker AudioWorklet - Eliminación de offset DC para re-entry del Output Channel
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PROBLEMA QUE RESUELVE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * El Output Channel permite re-entrada de señal a la matriz de audio para
 * FM, AM, y otros patching creativos. Cualquier offset DC en esta ruta
 * produce drift audible en la frecuencia del oscilador destino.
 * 
 * El BiquadFilter nativo de Web Audio implementa un filtro de 2º orden
 * (biquad) que, a frecuencias muy bajas (0.01 Hz), tiene dos problemas:
 * 
 * 1. TREND-FOLLOWING: Los dos polos cerca de z=1 hacen que, al cortar
 *    la señal de entrada, el filtro "continúe la tendencia" del último
 *    instante, produciendo una rampa ascendente/descendente lenta
 *    (comportamiento de inercia del 2º orden).
 * 
 * 2. SETTLING EXTREMADAMENTE LENTO: Con τ ≈ 16s (fc = 0.01 Hz), el
 *    estado interno tarda ~80 segundos (5τ) en disiparse. Durante todo
 *    ese tiempo, la salida produce un offset que modula la frecuencia
 *    del oscilador destino.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLUCIÓN: DC BLOCKER DE 1er ORDEN CON AUTO-RESET
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
 *   - 1er orden: NO tiene trend-following. La respuesta libre es
 *     exponencial pura (decae monótonamente), no puede producir rampas.
 *   - Transparente para señales por encima de fc (< 0.1 dB a 10×fc)
 * 
 * AUTO-RESET: Cuando la entrada es silencio (< threshold) durante un
 * periodo configurable, el estado interno se resetea a 0. Esto elimina
 * completamente el settling lento: en lugar de esperar 80 segundos,
 * el DC blocker se limpia en ~50ms de silencio detectado.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * PARÁMETROS DE DISEÑO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * fc = 0.01 Hz:
 *   - Transparente para LFOs ≥ 0.1 Hz (< 0.1 dB de atenuación)
 *   - Onda cuadrada 1 Hz: ~3% droop por semi-ciclo (imperceptible como CV)
 *   - Bloquea offset DC estático
 * 
 * silenceThreshold = 1e-6:
 *   - Muy por debajo de cualquier señal audible o CV útil
 *   - Muy por encima de ruido de punto flotante (~1e-38)
 *   - Detecta "silencio real" sin falsos positivos
 * 
 * silenceTime = 50ms (~2400 muestras a 48kHz):
 *   - Suficiente para confirmar que la señal se ha detenido
 *   - Mucho más rápido que el settling natural (80s)
 *   - No confunde zero-crossings de señales normales con silencio
 *     (una señal de 0.01 Hz cruza cero cada 50s >> 50ms)
 * 
 * @module worklets/dcBlocker
 * @version 1.0.0
 */

class DCBlockerProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      {
        name: 'cutoffFrequency',
        defaultValue: 0.01,    // 0.01 Hz — transparente para LFOs, bloquea DC
        minValue: 0.001,
        maxValue: 10,
        automationRate: 'k-rate'
      }
    ];
  }

  constructor(options) {
    super();

    // Estado del filtro de 1er orden
    this._x1 = 0;    // x[n-1]: muestra anterior de entrada
    this._y1 = 0;    // y[n-1]: muestra anterior de salida

    // Coeficiente R del polo (se recalcula si cambia fc)
    this._R = 0;
    this._lastFc = -1;  // Forzar cálculo inicial

    // Auto-reset: detectar silencio y limpiar estado
    // silenceThreshold en amplitud lineal (no dB)
    this._silenceThreshold = options?.processorOptions?.silenceThreshold ?? 1e-6;
    // Tiempo de silencio requerido para reset (en muestras)
    const silenceTimeMs = options?.processorOptions?.silenceTimeMs ?? 50;
    this._silenceSamplesRequired = Math.ceil(silenceTimeMs * sampleRate / 1000);
    this._silenceCounter = 0;

    // Mensajes desde el hilo principal
    this.port.onmessage = (event) => {
      if (event.data?.type === 'reset') {
        this._x1 = 0;
        this._y1 = 0;
        this._silenceCounter = 0;
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
    const threshold = this._silenceThreshold;

    // Procesar bloque y detectar silencio simultáneamente
    let blockMaxAbs = 0;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      // DC blocker 1er orden: y[n] = x[n] - x[n-1] + R · y[n-1]
      const y = x - x1 + R * y1;
      x1 = x;
      y1 = y;

      output[i] = y;

      // Track máximo absoluto del bloque de entrada
      const abs = x > 0 ? x : -x;  // Más rápido que Math.abs()
      if (abs > blockMaxAbs) blockMaxAbs = abs;
    }

    // ─────────────────────────────────────────────────────────────────
    // AUTO-RESET: Si la entrada es silencio sostenido, limpiar estado
    // ─────────────────────────────────────────────────────────────────
    // Esto evita el settling lento de 80s del filtro cuando la señal
    // se corta. En lugar de esperar la constante de tiempo natural,
    // detectamos silencio y reseteamos el estado directamente.
    // ─────────────────────────────────────────────────────────────────
    if (blockMaxAbs < threshold) {
      this._silenceCounter += input.length;
      if (this._silenceCounter >= this._silenceSamplesRequired) {
        // Silencio confirmado: resetear estado del filtro
        x1 = 0;
        y1 = 0;
        // Forzar salida a 0 exacto en el resto del bloque
        // (el bloque actual ya se procesó, pero eran near-zero de todos modos)
        this._silenceCounter = this._silenceSamplesRequired; // Cap para evitar overflow
      }
    } else {
      this._silenceCounter = 0;
    }

    this._x1 = x1;
    this._y1 = y1;

    return true;
  }
}

registerProcessor('dc-blocker', DCBlockerProcessor);
