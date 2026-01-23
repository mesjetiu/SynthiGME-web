/**
 * CV Thermal Slew AudioWorklet Processor
 * 
 * Emula la inercia térmica del transistor en los osciladores CEM 3340 del
 * Synthi 100 (versión Datanomics/Cuenca 1982).
 * 
 * COMPORTAMIENTO FÍSICO:
 * Cuando se realiza un salto grande de frecuencia (>2 kHz), el voltaje de control
 * positivo provoca un ligero calentamiento de un transistor dentro del circuito.
 * Este componente tarda unos segundos en alcanzar el equilibrio térmico.
 * 
 * CARACTERÍSTICAS:
 * - Bidireccional: el efecto es audible tanto al subir como al bajar frecuencia
 * - Asimétrico: calentamiento (subida) es más rápido que enfriamiento (bajada)
 * - Umbral: solo se activa para saltos equivalentes a >2 kHz de cambio
 * - Slew variable: la intensidad del slew depende de la magnitud del salto
 * 
 * IMPLEMENTACIÓN:
 * Filtro one-pole asimétrico con coeficientes diferentes para subida/bajada:
 *   y[n] = y[n-1] + rate × (x[n] - y[n-1])
 *   donde rate = riseRate si subiendo, fallRate si bajando
 * 
 * El slew solo se activa cuando el delta supera el umbral configurado.
 * Bajo el umbral, la señal pasa sin modificar (comportamiento normal).
 * 
 * REFERENCIA:
 * Manual Técnico Datanomics 1982:
 * "Si se realiza un salto grande de frecuencia (por ejemplo, superior a 2 kHz),
 * se produce un ligero efecto de portamento. Esto ocurre porque un cambio brusco
 * en el voltaje de control positivo provoca un ligero calentamiento de un transistor
 * dentro del circuito del oscilador. El transistor tarda unos pocos segundos en
 * alcanzar el equilibrio térmico."
 * 
 * @version 1.0.0
 */

class CVThermalSlewProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        // Tasa de subida (calentamiento) - proceso activo, más rápido
        // Valor típico: 0.15 = ~150ms para alcanzar 63% del target
        name: 'riseRate',
        defaultValue: 0.15,
        minValue: 0.001,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        // Tasa de bajada (enfriamiento) - proceso pasivo, más lento
        // Valor típico: 0.03 = ~500ms para alcanzar 63% del target (~5× más lento)
        name: 'fallRate',
        defaultValue: 0.03,
        minValue: 0.001,
        maxValue: 1.0,
        automationRate: 'k-rate'
      },
      {
        // Umbral de activación en unidades digitales (entrada normalizada)
        // La entrada CV típica tiene rango ±1 donde 1 = 1 octava
        // 2 kHz de salto ~ 3 octavas desde 250Hz, o ~1.5 octavas desde 1kHz
        // Umbral de 0.5 = medio octava de delta activa el slew
        // Umbral de 1.5 = solo saltos de 1.5+ octavas activan slew
        name: 'threshold',
        defaultValue: 0.5,
        minValue: 0.0,
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
    
    // Estado interno: valor actual después del slew
    this.currentValue = 0;
    
    // Valor previo de entrada (para detectar dirección del cambio)
    this.prevInput = 0;
    
    // Flag para indicar si estamos en proceso de slew activo
    this.isSlewing = false;
    
    // Target al que nos dirigimos (para slew suave)
    this.targetValue = 0;
    
    // Configuración inicial desde processorOptions
    const opts = options?.processorOptions || {};
    
    // Tiempo de rampa base para calcular rates (en segundos)
    // riseRate y fallRate se derivan de estos tiempos constantes
    this.riseTimeConstant = opts.riseTimeConstant ?? 0.15;   // 150ms calentamiento
    this.fallTimeConstant = opts.fallTimeConstant ?? 0.5;    // 500ms enfriamiento
    
    // Pre-calcular rates basados en sample rate
    // rate = 1 - e^(-1 / (timeConstant × sampleRate))
    this._updateRates();
    
    // Mensaje de puerto para recibir actualizaciones de configuración
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateConfig') {
        if (event.data.riseTimeConstant !== undefined) {
          this.riseTimeConstant = event.data.riseTimeConstant;
        }
        if (event.data.fallTimeConstant !== undefined) {
          this.fallTimeConstant = event.data.fallTimeConstant;
        }
        this._updateRates();
      }
    };
  }

  /**
   * Actualiza los coeficientes de rate basados en las constantes de tiempo.
   * @private
   */
  _updateRates() {
    // Fórmula: rate = 1 - e^(-1 / (τ × fs))
    // Esto da el coeficiente para alcanzar ~63% del target en τ segundos
    this.computedRiseRate = 1 - Math.exp(-1 / (this.riseTimeConstant * sampleRate));
    this.computedFallRate = 1 - Math.exp(-1 / (this.fallTimeConstant * sampleRate));
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    // Si no hay entrada, pasar silencio
    if (!input || !input[0] || input[0].length === 0) {
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].fill(0);
      }
      return true;
    }
    
    // Leer parámetros (k-rate: un valor por bloque)
    const enabled = parameters.enabled[0] >= 0.5;
    const threshold = parameters.threshold[0];
    
    // Si está deshabilitado, bypass directo
    if (!enabled) {
      for (let channel = 0; channel < output.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel]);
        }
      }
      return true;
    }
    
    // Usar siempre los rates computados internamente (basados en timeConstants)
    // Los AudioParams de rate son para override en tiempo real si es necesario
    const riseRate = this.computedRiseRate;
    const fallRate = this.computedFallRate;
    
    // Procesar canal 0 (CV es mono típicamente)
    const inputChannel = input[0];
    const outputChannel = output[0];
    const blockSize = inputChannel.length;
    
    for (let i = 0; i < blockSize; i++) {
      const inputSample = inputChannel[i];
      
      // Calcular delta desde el valor actual
      const delta = inputSample - this.currentValue;
      const absDelta = Math.abs(delta);
      
      // Determinar si el delta supera el umbral
      if (absDelta > threshold) {
        // Slew activo: aplicar filtro asimétrico
        const isRising = delta > 0;
        
        // Seleccionar rate según dirección (calentamiento vs enfriamiento)
        const rate = isRising ? riseRate : fallRate;
        
        // Aplicar filtro one-pole: y[n] = y[n-1] + rate × (x[n] - y[n-1])
        this.currentValue += rate * delta;
      } else {
        // Bajo umbral: seguir instantáneamente
        this.currentValue = inputSample;
      }
      
      outputChannel[i] = this.currentValue;
    }
    
    // Copiar a otros canales de salida si existen
    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(outputChannel);
    }
    
    return true;
  }
}

registerProcessor('cv-thermal-slew', CVThermalSlewProcessor);
