/**
 * ScopeCaptureProcessor - AudioWorklet para captura sincronizada de osciloscopio
 * 
 * Captura dos canales de audio (Y, X) de forma perfectamente sincronizada
 * para visualización en modos Y-T (forma de onda) y X-Y (Lissajous).
 * 
 * @version 1.0.0
 * 
 * ## Arquitectura
 * 
 * ```
 * Input 0 (Y) ──┐
 *               ├──▶ ScopeCaptureProcessor ──(MessagePort)──▶ UI
 * Input 1 (X) ──┘         │
 *                         │ captura síncrona ambos canales
 *                         ▼
 *                    { bufferY, bufferX, triggered }
 * ```
 * 
 * ## Trigger (sincronización de visualización)
 * 
 * Para obtener una imagen estable en el osciloscopio, el worklet implementa
 * detección de cruce por cero con pendiente positiva (rising edge trigger):
 * 
 * 1. Busca un punto donde: muestra[n-1] < triggerLevel <= muestra[n]
 * 2. Alinea el buffer de captura a ese punto
 * 3. Envía el buffer solo cuando hay suficientes muestras post-trigger
 * 
 * Si no se detecta trigger en un tiempo razonable (holdoff), envía el buffer
 * de todas formas para evitar congelamiento de la visualización.
 * 
 * ## Mensajes al Main Thread
 * 
 * Envía:
 * ```javascript
 * {
 *   type: 'scopeData',
 *   bufferY: Float32Array,  // Muestras del canal Y
 *   bufferX: Float32Array,  // Muestras del canal X (o ceros si no conectado)
 *   sampleRate: number,     // Para cálculos de tiempo en UI
 *   triggered: boolean      // true si se encontró trigger, false si timeout
 * }
 * ```
 * 
 * ## Mensajes desde Main Thread
 * 
 * Recibe:
 * ```javascript
 * { type: 'setTriggerLevel', level: number }  // -1.0 a 1.0, default 0
 * { type: 'setTriggerEnabled', enabled: boolean }
 * { type: 'setBufferSize', size: number }     // 512, 1024, 2048, 4096
 * ```
 */

class ScopeCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Configuración de buffer
    // El tamaño del buffer determina cuántas muestras se capturan por frame
    // A 44.1kHz: 1024 muestras ≈ 23ms de audio
    this.bufferSize = options?.processorOptions?.bufferSize || 1024;
    
    // Buffers circulares para captura continua
    // Usamos el doble del tamaño para tener margen de búsqueda de trigger
    this.ringSize = this.bufferSize * 2;
    this.ringY = new Float32Array(this.ringSize);
    this.ringX = new Float32Array(this.ringSize);
    this.writeIndex = 0;
    
    // Sistema de trigger
    this.triggerEnabled = true;
    this.triggerLevel = 0.0;        // Nivel de disparo (-1.0 a 1.0)
    this.triggerHoldoff = 0;        // Contador de muestras desde último trigger
    this.holdoffMax = this.bufferSize * 4;  // Max muestras sin trigger antes de forzar envío
    this.lastSampleY = 0;           // Para detección de cruce
    
    // Histéresis: samples mínimos entre triggers para ignorar armónicos/ruido
    // Se puede configurar via mensaje 'setTriggerHysteresis'
    this.triggerHysteresis = options?.processorOptions?.triggerHysteresis || 150;
    
    // Estado de captura
    this.samplesSinceLastSend = 0;
    this.minSamplesPerSend = this.bufferSize;  // Enviar cada bufferSize muestras
    
    // Estado activo
    this.active = true;
    
    // Manejar mensajes del hilo principal
    this.port.onmessage = (event) => {
      const { type } = event.data;
      
      switch (type) {
        case 'setTriggerLevel':
          this.triggerLevel = Math.max(-1, Math.min(1, event.data.level));
          break;
          
        case 'setTriggerEnabled':
          this.triggerEnabled = event.data.enabled;
          break;
          
        case 'setBufferSize':
          const newSize = event.data.size;
          if ([512, 1024, 2048, 4096].includes(newSize)) {
            this.bufferSize = newSize;
            this.ringSize = newSize * 2;
            this.ringY = new Float32Array(this.ringSize);
            this.ringX = new Float32Array(this.ringSize);
            this.writeIndex = 0;
            this.holdoffMax = newSize * 4;
            this.minSamplesPerSend = newSize;
          }
          break;
          
        case 'setTriggerHysteresis':
          // Número de samples a ignorar después de un trigger
          this.triggerHysteresis = Math.max(0, Math.floor(event.data.samples));
          break;
          
        case 'stop':
          this.active = false;
          break;
      }
    };
  }

  /**
   * Detecta trigger por cruce por cero con pendiente positiva.
   * 
   * @param {number} prevSample - Muestra anterior
   * @param {number} currSample - Muestra actual
   * @returns {boolean} true si se detectó trigger
   */
  detectTrigger(prevSample, currSample) {
    // Rising edge: cruce de triggerLevel de abajo hacia arriba
    return prevSample < this.triggerLevel && currSample >= this.triggerLevel;
  }

  /**
   * Busca el punto de trigger en el ring buffer y extrae un buffer alineado.
   * Muestra solo ciclos completos para evitar "baile" en el borde derecho.
   * 
   * @returns {{ bufferY: Float32Array, bufferX: Float32Array, triggered: boolean, validLength: number }}
   */
  extractAlignedBuffer() {
    const outY = new Float32Array(this.bufferSize);
    const outX = new Float32Array(this.bufferSize);
    
    if (!this.triggerEnabled) {
      // Sin trigger: tomar las últimas bufferSize muestras
      for (let i = 0; i < this.bufferSize; i++) {
        const idx = (this.writeIndex - this.bufferSize + i + this.ringSize) % this.ringSize;
        outY[i] = this.ringY[idx];
        outX[i] = this.ringX[idx];
      }
      return { bufferY: outY, bufferX: outX, triggered: false, validLength: this.bufferSize };
    }
    
    // Buscar triggers en el ring buffer CON HISTÉRESIS
    // La histéresis evita detectar triggers falsos por armónicos o ruido
    const triggers = [];
    const searchStart = (this.writeIndex - this.ringSize + this.bufferSize) % this.ringSize;
    let lastTriggerAt = -this.triggerHysteresis; // Permite detectar desde el inicio
    
    for (let i = 1; i < this.bufferSize; i++) {
      // Solo buscar trigger si han pasado suficientes samples desde el último
      if (i - lastTriggerAt < this.triggerHysteresis) continue;
      
      const prevIdx = (searchStart + i - 1 + this.ringSize) % this.ringSize;
      const currIdx = (searchStart + i + this.ringSize) % this.ringSize;
      
      if (this.detectTrigger(this.ringY[prevIdx], this.ringY[currIdx])) {
        triggers.push({ ringIdx: currIdx, offset: i });
        lastTriggerAt = i; // Iniciar período de histéresis
      }
    }
    
    // Si no hay triggers, devolver buffer sin alinear
    if (triggers.length === 0) {
      for (let i = 0; i < this.bufferSize; i++) {
        const idx = (this.writeIndex - this.bufferSize + i + this.ringSize) % this.ringSize;
        outY[i] = this.ringY[idx];
        outX[i] = this.ringX[idx];
      }
      return { bufferY: outY, bufferX: outX, triggered: false, validLength: this.bufferSize };
    }
    
    // Usar el primer trigger como inicio
    const firstTrigger = triggers[0];
    const startIdx = firstTrigger.ringIdx;
    
    // Buscar el último trigger que quepa en el buffer (para ciclos completos)
    // Aplicamos la misma histéresis para consistencia con los triggers encontrados
    let lastTriggerOffset = 0;
    const maxSearch = this.bufferSize - firstTrigger.offset;
    let lastFoundAt = 0; // Posición del último trigger encontrado
    
    for (let i = 1; i < maxSearch; i++) {
      // Aplicar histéresis también aquí
      if (i - lastFoundAt < this.triggerHysteresis) continue;
      
      const prevIdx = (startIdx + i - 1) % this.ringSize;
      const currIdx = (startIdx + i) % this.ringSize;
      
      if (this.detectTrigger(this.ringY[prevIdx], this.ringY[currIdx])) {
        lastTriggerOffset = i;
        lastFoundAt = i;
      }
    }
    
    // Determinar longitud válida: hasta el último trigger encontrado, o todo el buffer
    const validLength = lastTriggerOffset > 0 ? lastTriggerOffset : this.bufferSize;
    
    // Extraer buffer desde el primer trigger
    for (let i = 0; i < this.bufferSize; i++) {
      const idx = (startIdx + i) % this.ringSize;
      if (i < validLength) {
        outY[i] = this.ringY[idx];
        outX[i] = this.ringX[idx];
      } else {
        // Rellenar el resto con el último valor válido (evita saltos)
        outY[i] = outY[validLength - 1];
        outX[i] = outX[validLength - 1];
      }
    }
    
    return { bufferY: outY, bufferX: outX, triggered: true, validLength };
  }

  /**
   * Procesa bloques de audio (128 muestras por llamada).
   * 
   * @param {Float32Array[][]} inputs - inputs[0] = Y, inputs[1] = X
   * @param {Float32Array[][]} outputs - No usado (solo captura)
   * @returns {boolean} true para mantener el procesador activo
   */
  process(inputs, outputs) {
    if (!this.active) return false;
    
    // Input 0 = Canal Y (vertical / forma de onda)
    // Input 1 = Canal X (horizontal / para modo X-Y)
    const inputY = inputs[0]?.[0];
    const inputX = inputs[1]?.[0];
    
    if (!inputY) return true;
    
    const blockSize = inputY.length;  // Normalmente 128
    
    // Escribir muestras al ring buffer
    for (let i = 0; i < blockSize; i++) {
      this.ringY[this.writeIndex] = inputY[i];
      this.ringX[this.writeIndex] = inputX?.[i] ?? 0;
      
      this.writeIndex = (this.writeIndex + 1) % this.ringSize;
    }
    
    this.samplesSinceLastSend += blockSize;
    this.triggerHoldoff += blockSize;
    
    // Enviar datos cuando tengamos suficientes muestras
    if (this.samplesSinceLastSend >= this.minSamplesPerSend) {
      const { bufferY, bufferX, triggered, validLength } = this.extractAlignedBuffer();
      
      // Enviar al hilo principal
      this.port.postMessage({
        type: 'scopeData',
        bufferY,
        bufferX,
        sampleRate,
        triggered,
        validLength  // Longitud válida (ciclos completos)
      });
      
      this.samplesSinceLastSend = 0;
      if (triggered) {
        this.triggerHoldoff = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('scope-capture', ScopeCaptureProcessor);
