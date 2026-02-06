/**
 * AudioWorklet para captura multicanal con SharedArrayBuffer
 * 
 * Este worklet captura hasta 12 canales de audio y los escribe directamente
 * a un SharedArrayBuffer (ring buffer) sin pasar por el event loop de JS.
 * Esto elimina los problemas de audio cuando la UI está ocupada.
 * 
 * Comunicación lock-free usando Atomics:
 * - writeIndex: posición de escritura (worklet actualiza)
 * - readIndex: posición de lectura (C++ actualiza via preload)
 * 
 * Fallback: Si SharedArrayBuffer no está disponible, usa MessagePort.
 */

class MultichannelCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    this.channels = options.processorOptions?.channels || 12;
    this.sharedBuffer = null;
    this.controlBuffer = null; // Int32Array para índices atómicos
    this.audioBuffer = null;   // Float32Array para samples
    this.bufferFrames = 0;
    this.initialized = false;
    this.frameCount = 0;
    this.overflowCount = 0;
    this.stopped = false;  // Flag para detener el procesamiento
    
    // Fallback: acumular y enviar via MessagePort si no hay SharedArrayBuffer
    this.fallbackMode = true;
    this.fallbackChunkSize = options.processorOptions?.chunkSize || 2048;
    this.fallbackBuffer = new Float32Array(this.fallbackChunkSize * this.channels);
    this.fallbackPos = 0;
    
    // Recibir mensajes del main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'init' && event.data.sharedBuffer) {
        this.initSharedBuffer(event.data);
      } else if (event.data.type === 'stop') {
        // Señal para detener el worklet
        this.stopped = true;
        console.log('[Worklet] Stop signal received, shutting down...');
      }
    };
    
    // Notificar que estamos listos
    this.port.postMessage({ type: 'ready' });
    console.log(`[Worklet] Iniciado: ${this.channels}ch, esperando SharedArrayBuffer...`);
  }
  
  initSharedBuffer(data) {
    try {
      this.sharedBuffer = data.sharedBuffer;
      this.bufferFrames = data.bufferFrames;
      
      // Layout del SharedArrayBuffer:
      // [0-3]: writeIndex (Int32) - worklet escribe
      // [4-7]: readIndex (Int32) - C++ escribe
      // [8+]: audio data (Float32 interleaved)
      this.controlBuffer = new Int32Array(this.sharedBuffer, 0, 2);
      
      const audioByteOffset = 8; // 2 * sizeof(Int32)
      this.audioBuffer = new Float32Array(
        this.sharedBuffer, 
        audioByteOffset, 
        this.bufferFrames * this.channels
      );
      
      // Inicializar writeIndex a 0 (readIndex lo inicializa C++)
      Atomics.store(this.controlBuffer, 0, 0);
      
      this.fallbackMode = false;
      this.initialized = true;
      
      console.log(`[Worklet] SharedArrayBuffer OK: ${this.bufferFrames} frames ring buffer`);
      this.port.postMessage({ type: 'initialized', bufferFrames: this.bufferFrames });
    } catch (e) {
      console.error('[Worklet] SharedArrayBuffer init failed:', e);
      this.fallbackMode = true;
    }
  }
  
  process(inputs, outputs, parameters) {
    // Si se ha recibido señal de stop, devolver false para destruir el worklet
    if (this.stopped) {
      return false;
    }
    
    const input = inputs[0];
    
    if (!input || input.length === 0) {
      return true;
    }
    
    const frameCount = input[0]?.length || 128;
    
    // Debug: log cada 1000 llamadas (~1 segundo)
    this.frameCount += frameCount;
    if (this.frameCount % 48000 < 128) {
      let maxAmp = 0;
      for (let ch = 0; ch < input.length; ch++) {
        for (let i = 0; i < frameCount; i++) {
          maxAmp = Math.max(maxAmp, Math.abs(input[ch][i] || 0));
        }
      }
      console.log(`[Worklet] ${input.length}ch, ${frameCount}frames, maxAmp=${maxAmp.toFixed(4)}, fallback=${this.fallbackMode}`);
    }
    
    // Pass-through para mantener el grafo activo (silenciado por GainNode)
    const output = outputs[0];
    if (output) {
      for (let ch = 0; ch < output.length && ch < input.length; ch++) {
        output[ch].set(input[ch]);
      }
    }
    
    if (this.initialized && !this.fallbackMode) {
      this.writeToSharedBuffer(input, frameCount);
    } else {
      this.writeToFallback(input, frameCount);
    }
    
    return true;
  }
  
  writeToSharedBuffer(input, frameCount) {
    // Leer índices atómicamente
    const writeIndex = Atomics.load(this.controlBuffer, 0);
    const readIndex = Atomics.load(this.controlBuffer, 1);
    
    // Calcular espacio disponible (ring buffer con 1 slot de guarda)
    let available;
    if (writeIndex >= readIndex) {
      available = this.bufferFrames - (writeIndex - readIndex) - 1;
    } else {
      available = readIndex - writeIndex - 1;
    }
    
    if (frameCount > available) {
      // Buffer lleno - contar overflow pero no bloquear
      this.overflowCount++;
      if (this.overflowCount % 100 === 1) {
        console.warn(`[Worklet] Ring buffer overflow #${this.overflowCount}`);
      }
      return;
    }
    
    // Escribir frames al ring buffer (interleaved)
    let writePos = writeIndex;
    for (let frame = 0; frame < frameCount; frame++) {
      const baseIndex = writePos * this.channels;
      for (let ch = 0; ch < this.channels; ch++) {
        const sample = (input[ch] && input[ch][frame]) || 0;
        this.audioBuffer[baseIndex + ch] = sample;
      }
      writePos = (writePos + 1) % this.bufferFrames;
    }
    
    // Actualizar writeIndex atómicamente (memory barrier)
    Atomics.store(this.controlBuffer, 0, writePos);
  }
  
  writeToFallback(input, frameCount) {
    // Modo fallback: acumular y enviar via MessagePort
    for (let frame = 0; frame < frameCount; frame++) {
      for (let ch = 0; ch < this.channels; ch++) {
        const sample = (input[ch] && input[ch][frame]) || 0;
        this.fallbackBuffer[this.fallbackPos * this.channels + ch] = sample;
      }
      this.fallbackPos++;
      
      if (this.fallbackPos >= this.fallbackChunkSize) {
        // Crear copia y enviar
        const chunk = this.fallbackBuffer.slice(0, this.fallbackPos * this.channels);
        this.port.postMessage({
          type: 'audioData',
          buffer: chunk.buffer,
          frames: this.fallbackPos,
          channels: this.channels
        }, [chunk.buffer]);
        
        // Reset
        this.fallbackBuffer = new Float32Array(this.fallbackChunkSize * this.channels);
        this.fallbackPos = 0;
      }
    }
  }
}

registerProcessor('multichannel-capture', MultichannelCaptureProcessor);
