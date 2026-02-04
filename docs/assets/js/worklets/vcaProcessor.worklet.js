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
 * ENTRADAS:
 * - Input 0: Señal de audio a procesar
 * - Input 1: Señal CV de modulación (de la matriz de control)
 * 
 * PARÁMETROS:
 * - dialVoltage: Voltaje del fader (-12V a 0V, correspondiente a dial 0-10)
 * - cvScale: Factor de escala para CV (típico: 4.0 para ±4V desde matriz)
 * - cutoffEnabled: Si true, dial en corte (0) ignora CV
 * 
 * SALIDA:
 * - Output 0: Señal de audio modulada
 * 
 * @version 1.0.0
 */

// Constantes del VCA CEM 3330
const VCA_DB_PER_VOLT = 10;
const VCA_CUTOFF_THRESHOLD_DB = -120;  // Umbral de silencio
const VCA_SATURATION_LINEAR_THRESHOLD = 0;  // Voltaje donde empieza saturación
const VCA_SATURATION_HARD_LIMIT = 3;  // Voltaje de ganancia máxima (~1.5×)
const VCA_SATURATION_SOFTNESS = 2;  // Factor de suavidad

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
    
    // Cache para evitar recálculos innecesarios
    this._lastDialVoltage = -999;
    this._lastCvScale = -999;
    this._baseGain = 0;
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
    
    // Corte mecánico: si dial está en 0 (-12V), silencio total
    if (cutoffEnabled && dialVoltage <= -12) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }
    
    // Determinar si hay CV de modulación
    const hasCVInput = cvInput && cvInput[0] && cvInput[0].length > 0;
    
    // Procesar cada canal de audio
    for (let ch = 0; ch < audioInput.length && ch < output.length; ch++) {
      const audioChannel = audioInput[ch];
      const outputChannel = output[ch];
      
      if (hasCVInput) {
        // CON modulación CV: calcular ganancia sample-by-sample
        const cvChannel = cvInput[0];  // CV es mono (canal 0)
        
        for (let i = 0; i < audioChannel.length; i++) {
          // Convertir CV normalizado a voltios
          const cvVoltage = cvChannel[i] * cvScale;
          
          // Voltaje total = fader + CV
          const totalVoltage = dialVoltage + cvVoltage;
          
          // Calcular ganancia con curva logarítmica
          const gain = this.voltageToGain(totalVoltage);
          
          // Aplicar ganancia
          outputChannel[i] = audioChannel[i] * gain;
        }
      } else {
        // SIN modulación CV: ganancia constante (optimización)
        // Recalcular solo si cambió el voltaje del dial
        if (dialVoltage !== this._lastDialVoltage) {
          this._baseGain = this.voltageToGain(dialVoltage);
          this._lastDialVoltage = dialVoltage;
        }
        
        const gain = this._baseGain;
        for (let i = 0; i < audioChannel.length; i++) {
          outputChannel[i] = audioChannel[i] * gain;
        }
      }
    }
    
    return true;
  }
}

registerProcessor('vca-processor', VCAProcessor);
