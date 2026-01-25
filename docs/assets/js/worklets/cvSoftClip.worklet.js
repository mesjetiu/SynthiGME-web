/**
 * CV Soft Clip AudioWorklet Processor
 * 
 * Emula la saturación suave de los circuitos de control del Synthi 100
 * (versión Datanomics/Cuenca 1982).
 * 
 * COMPORTAMIENTO:
 * Las señales CV que superan el límite de entrada del módulo se saturan
 * suavemente usando una función tanh, en lugar de recortarse abruptamente.
 * Esto emula el comportamiento de los amplificadores operacionales cuando
 * se acercan a los raíles de alimentación.
 * 
 * IMPLEMENTACIÓN:
 * Usa tanh(x / softness) * limit para saturación suave simétrica.
 * - Para valores pequeños: salida ≈ entrada (zona lineal)
 * - Para valores grandes: salida → ±limit (saturación)
 * 
 * @version 1.0.0
 */

class CVSoftClipProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        // Límite de saturación en unidades normalizadas
        // Valor típico: 2.0 (equivale a 8V en el Synthi 100)
        name: 'limit',
        defaultValue: 2.0,
        minValue: 0.1,
        maxValue: 10.0,
        automationRate: 'k-rate'
      },
      {
        // Factor de suavidad de la curva tanh
        // Valores más altos = transición más gradual a saturación
        // 1.0 = saturación estándar, 2.0 = muy suave
        name: 'softness',
        defaultValue: 1.0,
        minValue: 0.1,
        maxValue: 4.0,
        automationRate: 'k-rate'
      },
      {
        // Habilitar/deshabilitar el procesamiento
        // 0 = bypass total, 1 = activo
        name: 'enabled',
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
    this.defaultLimit = opts.limit ?? 2.0;
    this.defaultSoftness = opts.softness ?? 1.0;
    // Coeficiente de saturación polinómica (x - coefficient × x³)
    this.coefficient = opts.coefficient ?? 0.0001;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !output || !output[0]) {
      if (output && output[0]) output[0].fill(0);
      return true;
    }
    
    const inputChannel = input[0];
    const outputChannel = output[0];
    const coef = this.coefficient;
    
    for (let i = 0; i < inputChannel.length; i++) {
      const x = inputChannel[i];
      // Saturación polinómica: y = x - coefficient × x³
      // Para valores pequeños: casi lineal
      // Para valores grandes: compresión gradual
      outputChannel[i] = x - x * x * x * coef;
    }
    
    return true;
  }
}

registerProcessor('cv-soft-clip', CVSoftClipProcessor);
