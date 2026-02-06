/**
 * VCA CEM 3330 AudioWorklet Processor
 * 
 * Emula el VCA (Voltage Controlled Amplifier) del Synthi 100 versión
 * Cuenca/Datanomics 1982, que usa el chip CEM 3330.
 * 
 * ESPECIFICACIONES DEL HARDWARE:
 * - Respuesta logarítmica: 10 dB por cada voltio aplicado
 * - Fader: potenciómetro lineal que genera 0V (posición 10) a -12V (posición 0)
 * - CV externo: se suma algebraicamente al voltaje del fader
 * - Corte mecánico: en posición 0, el fader desconecta (ignora CV externo)
 * - Saturación: CV > 0V causa amplificación con saturación suave
 * 
 * LIMITACIÓN DE MODULACIÓN (τ = 5ms):
 * El circuito de control incluye un filtro paso-bajo de 1 polo con constante
 * de tiempo de 5ms para evitar clicks en cambios bruscos de voltaje.
 * Esto limita la modulación AM a frecuencias < ~32 Hz (fc = 1/2πτ).
 * El Synthi de Cuenca NO tiene el selector "Fast Response" de otros modelos.
 * 
 * ENTRADAS:
 * - Input 0: Señal de audio a procesar
 * - Input 1: Señal CV de modulación (de la matriz de control)
 * 
 * PARÁMETROS:
 * - dialVoltage: Voltaje del fader (-12V a 0V, correspondiente a dial 0-10)
 * - cvScale: Factor de escala para CV (típico: 4.0 para ±4V desde matriz)
 * - cutoffEnabled: Si true, dial en corte (0) ignora CV
 * - slewTime: Constante de tiempo del filtro anti-click (default: 0.005s = 5ms)
 * 
 * SALIDA:
 * - Output 0: Señal de audio modulada
 * 
 * @version 1.1.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES DEL VCA CEM 3330
// ─────────────────────────────────────────────────────────────────────────────
// Valores por defecto que pueden ser sobrescritos vía processorOptions.
// La configuración canónica está en outputChannel.config.js → vca
// ─────────────────────────────────────────────────────────────────────────────
const VCA_DB_PER_VOLT = 10;
const VCA_CUTOFF_THRESHOLD_DB = -120;  // Umbral de silencio
const VCA_SATURATION_LINEAR_THRESHOLD = 0;  // Voltaje donde empieza saturación
const VCA_SATURATION_HARD_LIMIT = 3;  // Voltaje de ganancia máxima (~1.5×)
const VCA_SATURATION_SOFTNESS = 2;  // Factor de suavidad

// ─────────────────────────────────────────────────────────────────────────────
// FILTRO ANTI-CLICK (Slew Limiter) - VALOR POR DEFECTO
// ─────────────────────────────────────────────────────────────────────────────
// Constante de tiempo del hardware Cuenca/Datanomics 1982: τ = 5 ms
// Frecuencia de corte: fc = 1/(2πτ) ≈ 31.8 Hz
// Esto limita la modulación AM a frecuencias sub-audio (<32 Hz).
//
// IMPORTANTE: Este valor se toma de outputChannel.config.js → vca.antiClickFilter
// El valor aquí es solo un fallback si no se proporciona en processorOptions.
// ─────────────────────────────────────────────────────────────────────────────
const VCA_SLEW_TIME_DEFAULT = 0.005;  // 5 ms (ver config para documentación)

class VCAProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        // Voltaje del fader (dial 0-10 → -12V a 0V)
        // Se actualiza cuando el usuario mueve el fader
        name: 'dialVoltage',
        defaultValue: -12,  // Dial en 0 por defecto (silencio)
        minValue: -12,
        maxValue: 0,
        automationRate: 'k-rate'  // No necesita cambiar cada sample
      },
      {
        // Factor de escala para convertir señal CV (-1..+1) a voltios
        // Valor típico: 4.0 (rango ±4V desde la matriz)
        name: 'cvScale',
        defaultValue: 4.0,
        minValue: 0,
        maxValue: 12,
        automationRate: 'k-rate'
      },
      {
        // Habilitar corte mecánico
        // Cuando dialVoltage ≤ -12V, ignora CV completamente
        name: 'cutoffEnabled',
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate'
      },
      {
        // Constante de tiempo del filtro anti-click (slew limiter)
        // τ = 5ms en versión Cuenca (sin selector Fast Response)
        // fc = 1/(2πτ) ≈ 31.8 Hz - limita AM a frecuencias sub-audio
        // Valor canónico en: outputChannel.config.js → vca.antiClickFilter.slewTime
        name: 'slewTime',
        defaultValue: VCA_SLEW_TIME_DEFAULT,
        minValue: 0.0001,  // 0.1ms mínimo (para evitar división por cero)
        maxValue: 0.1,     // 100ms máximo
        automationRate: 'k-rate'
      }
    ];
  }

  constructor(options) {
    super();
    
    // Configuración inicial desde processorOptions
    const opts = options?.processorOptions || {};
    this.dbPerVolt = opts.dbPerVolt ?? VCA_DB_PER_VOLT;
    this.cutoffThresholdDb = opts.cutoffThresholdDb ?? VCA_CUTOFF_THRESHOLD_DB;
    this.saturationLinear = opts.saturationLinear ?? VCA_SATURATION_LINEAR_THRESHOLD;
    this.saturationHardLimit = opts.saturationHardLimit ?? VCA_SATURATION_HARD_LIMIT;
    this.saturationSoftness = opts.saturationSoftness ?? VCA_SATURATION_SOFTNESS;
    
    // Pre-calcular constantes para optimización
    this.minGainDb = this.cutoffThresholdDb;
    this.minGainLinear = Math.pow(10, this.minGainDb / 20);
    
    // ─────────────────────────────────────────────────────────────────────────
    // FILTRO ANTI-CLICK (Slew Limiter)
    // ─────────────────────────────────────────────────────────────────────────
    // Filtro paso-bajo de 1 polo en la entrada de CV para evitar clicks.
    // El hardware usa τ = 5ms (fc ≈ 32 Hz), lo que limita AM a sub-audio.
    // Coeficiente: α = 1 - e^(-1/(fs×τ)) donde fs = sampleRate
    //
    // UBICACIÓN EN EL CIRCUITO (según Manual Técnico Datanomics 1982):
    // El filtro está DESPUÉS de la suma Fader+CV, no antes:
    //
    //   Fader (voltaje) ─┬─→ [SUMA] ─→ [LPF τ=5ms] ─→ VCA (ganancia)
    //                    │
    //   CV externo ──────┘
    //
    // Por tanto, suavizamos el VOLTAJE TOTAL (fader + CV), no solo el CV.
    // Esto afecta tanto a cambios rápidos de CV como a cambios de fader.
    // ─────────────────────────────────────────────────────────────────────────
    this._voltageSmoothed = -12;  // Estado del filtro (empieza en silencio)
    this._slewCoef = 0;           // Se calcula en process() cuando conocemos slewTime
    this._lastSlewTime = -1;
    
    // Cache para evitar recálculos innecesarios (solo sin CV)
    this._lastDialVoltage = -999;
    this._lastCvScale = -999;
    this._baseGain = 0;
    
    // ─────────────────────────────────────────────────────────────────────────
    // HANDLER DE MENSAJES: Resincronización al despertar de dormancy
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando un Output Channel despierta de dormancy, el main thread envía
    // un mensaje 'resync' con el voltaje actual del fader. Esto sincroniza
    // instantáneamente _voltageSmoothed para evitar el transitorio de ramping
    // que genera offset DC durante la transición.
    //
    // Sin este resync, _voltageSmoothed sigue en -12V (silencio) mientras el
    // dialVoltage ya está en el valor actual del fader, causando un ramping
    // audible que introduce offset DC en la señal de re-entry.
    // ─────────────────────────────────────────────────────────────────────────
    this.port.onmessage = (event) => {
      if (event.data?.type === 'resync') {
        // Sincronizar estado del filtro anti-click al voltaje actual
        // Esto elimina el transitorio al despertar de dormancy
        this._voltageSmoothed = event.data.dialVoltage ?? -12;
      }
    };
  }

  /**
   * Aplica saturación suave para voltajes positivos (ganancia > 1)
   * Emula la limitación del amplificador operacional del VCA.
   * 
   * @param {number} voltage - Voltaje total (fader + CV)
   * @returns {number} Voltaje saturado
   */
  applySaturation(voltage) {
    if (voltage <= this.saturationLinear) {
      return voltage;
    }
    
    // Zona de saturación suave
    const excess = voltage - this.saturationLinear;
    const softLimit = this.saturationHardLimit - this.saturationLinear;
    
    // Función de saturación: tanh suave hacia el límite
    const normalized = excess / softLimit;
    const saturated = Math.tanh(normalized * this.saturationSoftness) * softLimit;
    
    return this.saturationLinear + saturated;
  }

  /**
   * Convierte voltaje total a ganancia lineal.
   * Aplica la curva logarítmica de 10 dB/V del CEM 3330.
   * 
   * @param {number} totalVoltage - Voltaje (fader + CV)
   * @returns {number} Ganancia lineal (0 a ~1.5)
   */
  voltageToGain(totalVoltage) {
    // Aplicar saturación para voltajes positivos
    const saturatedVoltage = this.applySaturation(totalVoltage);
    
    // Calcular dB: 10 dB por voltio
    const dB = saturatedVoltage * this.dbPerVolt;
    
    // Si está por debajo del umbral de corte, silencio total
    if (dB <= this.minGainDb) {
      return 0;
    }
    
    // Convertir dB a ganancia lineal
    return Math.pow(10, dB / 20);
  }

  process(inputs, outputs, parameters) {
    const audioInput = inputs[0];
    const cvInput = inputs[1];
    const output = outputs[0];
    
    // Si no hay entrada de audio, silencio
    if (!audioInput || !audioInput[0]) {
      if (output && output[0]) {
        for (let ch = 0; ch < output.length; ch++) {
          output[ch].fill(0);
        }
      }
      return true;
    }
    
    // Obtener parámetros (k-rate = un valor por bloque)
    const dialVoltage = parameters.dialVoltage[0];
    const cvScale = parameters.cvScale[0];
    const cutoffEnabled = parameters.cutoffEnabled[0] > 0.5;
    const slewTime = parameters.slewTime[0];
    
    // Corte mecánico: si dial está en 0 (-12V), silencio total
    if (cutoffEnabled && dialVoltage <= -12) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      // Reset del filtro de slew al voltaje mínimo para evitar transitorios al reactivar
      this._voltageSmoothed = -12;
      return true;
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // ACTUALIZAR COEFICIENTE DE SLEW SI CAMBIÓ
    // ─────────────────────────────────────────────────────────────────────────
    // Filtro IIR de 1 polo: y[n] = y[n-1] + α × (x[n] - y[n-1])
    // donde α = 1 - e^(-1/(fs×τ))
    // ─────────────────────────────────────────────────────────────────────────
    if (slewTime !== this._lastSlewTime) {
      this._slewCoef = 1 - Math.exp(-1 / (sampleRate * slewTime));
      this._lastSlewTime = slewTime;
    }
    
    const slewCoef = this._slewCoef;
    
    // Determinar si hay CV de modulación
    const hasCVInput = cvInput && cvInput[0] && cvInput[0].length > 0;
    
    // Procesar cada canal de audio
    for (let ch = 0; ch < audioInput.length && ch < output.length; ch++) {
      const audioChannel = audioInput[ch];
      const outputChannel = output[ch];
      
      if (hasCVInput) {
        // ─────────────────────────────────────────────────────────────────────
        // CON MODULACIÓN CV: Aplicar filtro de slew al VOLTAJE TOTAL
        // ─────────────────────────────────────────────────────────────────────
        // Según el esquema del hardware, el filtro está DESPUÉS de la suma:
        //   totalVoltageRaw = dialVoltage + cvVoltage
        //   totalVoltageSmoothed = LPF(totalVoltageRaw, τ=5ms)
        //   gain = VCA(totalVoltageSmoothed)
        //
        // Esto significa que tanto cambios de CV como cambios de fader
        // pasan por el mismo filtro anti-click.
        // ─────────────────────────────────────────────────────────────────────
        const cvChannel = cvInput[0];  // CV es mono (canal 0)
        
        for (let i = 0; i < audioChannel.length; i++) {
          // Convertir CV normalizado a voltios
          const cvVoltage = cvChannel[i] * cvScale;
          
          // Voltaje total RAW (antes del filtro)
          const totalVoltageRaw = dialVoltage + cvVoltage;
          
          // Aplicar filtro de slew al VOLTAJE TOTAL (LPF 1 polo, τ=5ms)
          // Este es el comportamiento fiel del Synthi 100 Cuenca
          this._voltageSmoothed += (totalVoltageRaw - this._voltageSmoothed) * slewCoef;
          
          // Calcular ganancia con curva logarítmica desde el voltaje suavizado
          const gain = this.voltageToGain(this._voltageSmoothed);
          
          // Aplicar ganancia
          outputChannel[i] = audioChannel[i] * gain;
        }
      } else {
        // ─────────────────────────────────────────────────────────────────────
        // SIN CV: El fader también pasa por el filtro de slew
        // ─────────────────────────────────────────────────────────────────────
        // Aunque no hay CV externo, los cambios rápidos del fader (por OSC,
        // automatización, etc.) también deben suavizarse para evitar clicks.
        // ─────────────────────────────────────────────────────────────────────
        for (let i = 0; i < audioChannel.length; i++) {
          // Aplicar filtro de slew al voltaje del dial
          this._voltageSmoothed += (dialVoltage - this._voltageSmoothed) * slewCoef;
          
          // Calcular ganancia desde el voltaje suavizado
          const gain = this.voltageToGain(this._voltageSmoothed);
          
          // Aplicar ganancia
          outputChannel[i] = audioChannel[i] * gain;
        }
      }
    }
    
    return true;
  }
}

registerProcessor('vca-processor', VCAProcessor);
