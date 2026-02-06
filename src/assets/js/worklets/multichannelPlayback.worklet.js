/**
 * AudioWorklet para reproducción multicanal desde PipeWire INPUT
 * 
 * Este worklet lee audio capturado desde un SharedArrayBuffer (ring buffer)
 * donde el addon C++ escribe los samples de entrada de PipeWire.
 * Produce 8 canales de salida que van a los Input Amplifiers del Synthi.
 * 
 * Flujo: PipeWire capture → C++ → SAB → Este worklet → Web Audio graph
 * 
 * Comunicación lock-free usando Atomics:
 * - writeIndex: posición de escritura (C++ actualiza)
 * - readIndex: posición de lectura (worklet actualiza)
 * 
 * Layout del SharedArrayBuffer:
 * [0-3]: writeIndex (Int32) - C++ escribe aquí
 * [4-7]: readIndex (Int32) - worklet escribe aquí  
 * [8+]: audio data (Float32 interleaved, 8 canales)
 */

class MultichannelPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    this.channels = options.processorOptions?.channels || 8;
    this.sharedBuffer = null;
    this.controlBuffer = null; // Int32Array para índices atómicos
    this.audioBuffer = null;   // Float32Array para samples
    this.bufferFrames = 0;
    this.initialized = false;
    this.frameCount = 0;
    this.underflowCount = 0;
    
    // Recibir SharedArrayBuffer del main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'init' && event.data.sharedBuffer) {
        this.initSharedBuffer(event.data);
      }
    };
    
    // Notificar que estamos listos
    this.port.postMessage({ type: 'ready' });
    console.log(`[MultichannelPlayback] Iniciado: ${this.channels}ch, esperando SharedArrayBuffer...`);
  }
  
  initSharedBuffer(data) {
    try {
      this.sharedBuffer = data.sharedBuffer;
      this.bufferFrames = data.bufferFrames;
      
      // Layout del SharedArrayBuffer (mismo que capture pero roles invertidos):
      // [0-3]: writeIndex (Int32) - C++ escribe (posición donde C++ ha escrito)
      // [4-7]: readIndex (Int32) - worklet escribe (posición hasta donde hemos leído)
      // [8+]: audio data (Float32 interleaved)
      this.controlBuffer = new Int32Array(this.sharedBuffer, 0, 2);
      
      const audioByteOffset = 8; // 2 * sizeof(Int32)
      this.audioBuffer = new Float32Array(
        this.sharedBuffer, 
        audioByteOffset, 
        this.bufferFrames * this.channels
      );
      
      // Inicializar readIndex a 0 (C++ inicializa writeIndex)
      Atomics.store(this.controlBuffer, 1, 0);
      
      this.initialized = true;
      
      console.log(`[MultichannelPlayback] SharedArrayBuffer OK: ${this.bufferFrames} frames ring buffer`);
      this.port.postMessage({ type: 'initialized', bufferFrames: this.bufferFrames });
    } catch (e) {
      console.error('[MultichannelPlayback] SharedArrayBuffer init failed:', e);
    }
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    
    if (!output || output.length === 0) {
      return true;
    }
    
    const frameCount = output[0]?.length || 128;
    
    // Debug: log cada ~1 segundo
    this.frameCount += frameCount;
    if (this.frameCount % 48000 < 128) {
      const writeIdx = this.initialized ? Atomics.load(this.controlBuffer, 0) : 0;
      const readIdx = this.initialized ? Atomics.load(this.controlBuffer, 1) : 0;
      const available = this._calculateAvailable(writeIdx, readIdx);
      console.log(`[MultichannelPlayback] ${output.length}ch out, available=${available}frames, underflows=${this.underflowCount}`);
    }
    
    if (this.initialized) {
      this.readFromSharedBuffer(output, frameCount);
    } else {
      // Sin buffer inicializado: silencio
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
    }
    
    return true;
  }
  
  _calculateAvailable(writeIndex, readIndex) {
    if (writeIndex >= readIndex) {
      return writeIndex - readIndex;
    } else {
      return this.bufferFrames - (readIndex - writeIndex);
    }
  }
  
  readFromSharedBuffer(output, frameCount) {
    // Leer índices atómicamente
    const writeIndex = Atomics.load(this.controlBuffer, 0);
    const readIndex = Atomics.load(this.controlBuffer, 1);
    
    // Calcular frames disponibles
    const available = this._calculateAvailable(writeIndex, readIndex);
    
    if (available < frameCount) {
      // Underflow - no hay suficientes samples
      this.underflowCount++;
      if (this.underflowCount % 100 === 1) {
        console.warn(`[MultichannelPlayback] Underflow #${this.underflowCount}, available=${available}, needed=${frameCount}`);
      }
      
      // Leer lo que hay y rellenar con silencio
      const framesToRead = available;
      this._readFrames(output, framesToRead, readIndex);
      
      // Rellenar resto con silencio
      for (let ch = 0; ch < output.length; ch++) {
        for (let i = framesToRead; i < frameCount; i++) {
          output[ch][i] = 0;
        }
      }
      
      // Actualizar readIndex
      const newReadIndex = (readIndex + framesToRead) % this.bufferFrames;
      Atomics.store(this.controlBuffer, 1, newReadIndex);
      return;
    }
    
    // Leer todos los frames
    this._readFrames(output, frameCount, readIndex);
    
    // Actualizar readIndex atómicamente
    const newReadIndex = (readIndex + frameCount) % this.bufferFrames;
    Atomics.store(this.controlBuffer, 1, newReadIndex);
  }
  
  _readFrames(output, frameCount, startIndex) {
    let readPos = startIndex;
    
    for (let frame = 0; frame < frameCount; frame++) {
      const baseIndex = readPos * this.channels;
      
      for (let ch = 0; ch < output.length && ch < this.channels; ch++) {
        output[ch][frame] = this.audioBuffer[baseIndex + ch];
      }
      
      // Limpiar canales extra si output tiene más canales que el buffer
      for (let ch = this.channels; ch < output.length; ch++) {
        output[ch][frame] = 0;
      }
      
      readPos = (readPos + 1) % this.bufferFrames;
    }
  }
}

registerProcessor('multichannel-playback', MultichannelPlaybackProcessor);
