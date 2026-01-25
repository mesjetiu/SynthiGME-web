/**
 * AudioWorklet processor for capturing multichannel output.
 * 
 * Este worklet captura las 8 salidas individuales del sintetizador y las
 * combina en un buffer interleaved listo para enviar al backend nativo
 * (PipeWire/WASAPI/CoreAudio) via IPC.
 * 
 * Arquitectura:
 *   outputBus[0..7] → ScriptProcessorNode/AudioWorkletNode → IPC → nativo
 * 
 * Se usa para Electron cuando multicanal nativo está disponible,
 * permitiendo salida >2 canales aunque Chromium limite a estéreo.
 * 
 * Documentación: MULTICANAL-ELECTRON.md
 */

class MultichannelCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Número de canales a capturar (por defecto 8 = buses Out 1-8)
    this.channelCount = options.processorOptions?.channelCount || 8;
    
    // Estado de captura
    this.isCapturing = false;
    
    // Buffer de acumulación para enviar en bloques más grandes
    // Reduce overhead de mensajes IPC
    this.bufferSize = options.processorOptions?.bufferSize || 2048;
    this.accumulatedSamples = 0;
    this.sampleBuffer = new Float32Array(this.bufferSize * this.channelCount);
    
    // Manejar mensajes del hilo principal
    this.port.onmessage = (event) => {
      const { command, data } = event.data;
      
      switch (command) {
        case 'start':
          this.isCapturing = true;
          this.accumulatedSamples = 0;
          console.log('[MultichannelCapture] Captura iniciada');
          break;
          
        case 'stop':
          this.isCapturing = false;
          // Enviar cualquier buffer parcial restante
          if (this.accumulatedSamples > 0) {
            this._sendBuffer();
          }
          this.port.postMessage({ type: 'stopped' });
          console.log('[MultichannelCapture] Captura detenida');
          break;
          
        case 'setBufferSize':
          this.bufferSize = data.bufferSize;
          this.sampleBuffer = new Float32Array(this.bufferSize * this.channelCount);
          this.accumulatedSamples = 0;
          break;
      }
    };
  }

  /**
   * Procesa un bloque de audio.
   * @param {Float32Array[][]} inputs - Array de inputs, cada uno con N canales
   * @param {Float32Array[][]} outputs - Array de outputs (pass-through)
   * @param {Object} parameters - Parámetros de audio
   */
  process(inputs, outputs, parameters) {
    // Pass-through: copiar inputs a outputs para que el audio siga fluyendo
    // hacia el destination estéreo (para monitoreo/fallback)
    for (let i = 0; i < inputs.length && i < outputs.length; i++) {
      for (let ch = 0; ch < inputs[i].length && ch < outputs[i].length; ch++) {
        outputs[i][ch].set(inputs[i][ch]);
      }
    }
    
    if (!this.isCapturing) {
      return true;
    }
    
    // Obtener referencia al primer input (multicanal)
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    
    const blockSize = input[0]?.length || 128;
    
    // Interleave los canales en el buffer de acumulación
    // Formato: [ch0_s0, ch1_s0, ..., ch7_s0, ch0_s1, ch1_s1, ..., ch7_s1, ...]
    for (let sample = 0; sample < blockSize; sample++) {
      const baseIndex = (this.accumulatedSamples + sample) * this.channelCount;
      
      for (let ch = 0; ch < this.channelCount; ch++) {
        if (input[ch]) {
          this.sampleBuffer[baseIndex + ch] = input[ch][sample];
        } else {
          // Silencio si el canal no existe
          this.sampleBuffer[baseIndex + ch] = 0;
        }
      }
    }
    
    this.accumulatedSamples += blockSize;
    
    // Cuando el buffer está lleno, enviarlo
    if (this.accumulatedSamples >= this.bufferSize) {
      this._sendBuffer();
    }
    
    return true;
  }
  
  /**
   * Envía el buffer acumulado al hilo principal.
   */
  _sendBuffer() {
    if (this.accumulatedSamples === 0) return;
    
    // Crear copia del buffer con solo los samples válidos
    const validSamples = this.accumulatedSamples * this.channelCount;
    const bufferToSend = this.sampleBuffer.slice(0, validSamples);
    
    this.port.postMessage({
      type: 'samples',
      samples: bufferToSend,
      sampleCount: this.accumulatedSamples,
      channelCount: this.channelCount
    }, [bufferToSend.buffer]); // Transfer ownership para evitar copia
    
    // Crear nuevo buffer ya que transferimos ownership del anterior
    this.sampleBuffer = new Float32Array(this.bufferSize * this.channelCount);
    this.accumulatedSamples = 0;
  }
}

registerProcessor('multichannel-capture-processor', MultichannelCaptureProcessor);
