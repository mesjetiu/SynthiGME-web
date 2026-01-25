/**
 * Multichannel Output Manager
 * 
 * Gestiona la salida de audio multicanal nativa en Electron.
 * Conecta el AudioWorklet de captura con el backend nativo via IPC.
 * 
 * Uso:
 *   import { multichannelOutput } from './multichannelOutput.js';
 *   
 *   // Verificar disponibilidad
 *   if (await multichannelOutput.isAvailable()) {
 *     // Inicializar con el AudioContext y los buses de salida
 *     await multichannelOutput.initialize(audioCtx, outputBuses);
 *     // Iniciar captura y envío al backend nativo
 *     await multichannelOutput.start();
 *   }
 * 
 * Documentación: MULTICANAL-ELECTRON.md
 */

import { log } from '../utils/logger.js';

/**
 * @typedef {Object} MultichannelConfig
 * @property {number} channels - Número de canales (default: 8)
 * @property {number} sampleRate - Sample rate (default: 48000)
 * @property {number} bufferSize - Tamaño del buffer en samples (default: 2048)
 * @property {string} deviceName - Nombre visible en el sistema (default: 'SynthiGME')
 */

class MultichannelOutputManager {
  constructor() {
    this.audioCtx = null;
    this.captureNode = null;
    this.outputBuses = [];
    this.merger = null;
    this.isInitialized = false;
    this.isRunning = false;
    this.config = {
      channels: 8,
      sampleRate: 48000,
      bufferSize: 2048,
      deviceName: 'SynthiGME'
    };
    
    // Estadísticas
    this.stats = {
      samplesWritten: 0,
      buffersWritten: 0,
      errors: 0,
      lastError: null
    };
  }
  
  /**
   * Verifica si la salida multicanal nativa está disponible.
   * Solo funciona en Electron con PipeWire (Linux) o WASAPI (Windows).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    // Verificar que estamos en Electron
    if (!window.electronAudio) {
      log.debug('[MultichannelOutput] No disponible: no estamos en Electron');
      return false;
    }
    
    try {
      const result = await window.electronAudio.isMultichannelAvailable();
      if (result.available) {
        log.info(`[MultichannelOutput] Disponible: backend=${result.backend}, maxChannels=${result.maxChannels}`);
        return true;
      } else {
        log.info(`[MultichannelOutput] No disponible: ${result.reason}`);
        return false;
      }
    } catch (error) {
      log.error('[MultichannelOutput] Error verificando disponibilidad:', error);
      return false;
    }
  }
  
  /**
   * Inicializa el sistema de captura multicanal.
   * @param {AudioContext} audioCtx - El AudioContext del motor de audio
   * @param {Array} outputBuses - Array de buses de salida del engine
   * @param {MultichannelConfig} [config] - Configuración opcional
   * @returns {Promise<boolean>} true si se inicializó correctamente
   */
  async initialize(audioCtx, outputBuses, config = {}) {
    if (this.isInitialized) {
      log.warn('[MultichannelOutput] Ya inicializado');
      return true;
    }
    
    if (!await this.isAvailable()) {
      return false;
    }
    
    this.audioCtx = audioCtx;
    this.outputBuses = outputBuses;
    this.config = { ...this.config, ...config };
    
    // Actualizar sample rate al del AudioContext
    this.config.sampleRate = audioCtx.sampleRate;
    
    try {
      // Cargar el worklet de captura
      await audioCtx.audioWorklet.addModule('./assets/js/worklets/multichannelCapture.worklet.js');
      log.debug('[MultichannelOutput] Worklet cargado');
      
      // Crear nodo de captura
      this.captureNode = new AudioWorkletNode(audioCtx, 'multichannel-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: this.config.channels,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        processorOptions: {
          channelCount: this.config.channels,
          bufferSize: this.config.bufferSize
        }
      });
      
      // Manejar mensajes del worklet
      this.captureNode.port.onmessage = (event) => this._handleWorkletMessage(event);
      
      // Crear merger para combinar los buses en un nodo multicanal
      this.merger = audioCtx.createChannelMerger(this.config.channels);
      
      // Conectar cada bus de salida al merger
      // Usamos el nodo justo antes del pan/routing para capturar la señal "limpia"
      for (let i = 0; i < Math.min(outputBuses.length, this.config.channels); i++) {
        const bus = outputBuses[i];
        if (bus && bus.input) {
          // Crear un splitter para tomar una copia de la señal
          const splitter = audioCtx.createGain();
          splitter.gain.value = 1.0;
          
          // El bus.input ya está conectado a la cadena normal
          // Conectamos también al splitter para la captura
          bus.input.connect(splitter);
          splitter.connect(this.merger, 0, i);
          
          // Guardar referencia para desconectar después
          bus._multichannelSplitter = splitter;
        }
      }
      
      // Conectar merger al nodo de captura
      this.merger.connect(this.captureNode);
      
      // El output del captureNode va a un destino vacío para mantener el grafo activo
      // (el audio real va por el path normal hacia destination)
      const silentDest = audioCtx.createGain();
      silentDest.gain.value = 0;
      this.captureNode.connect(silentDest);
      silentDest.connect(audioCtx.destination);
      
      this.isInitialized = true;
      log.info(`[MultichannelOutput] Inicializado: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);
      
      return true;
    } catch (error) {
      log.error('[MultichannelOutput] Error inicializando:', error);
      this.stats.lastError = error.message;
      return false;
    }
  }
  
  /**
   * Inicia la captura y envío de audio al backend nativo.
   * @returns {Promise<boolean>}
   */
  async start() {
    if (!this.isInitialized) {
      log.error('[MultichannelOutput] No inicializado');
      return false;
    }
    
    if (this.isRunning) {
      log.warn('[MultichannelOutput] Ya está corriendo');
      return true;
    }
    
    try {
      // Abrir stream en el backend nativo
      const result = await window.electronAudio.openStream({
        channels: this.config.channels,
        sampleRate: this.config.sampleRate,
        deviceName: this.config.deviceName
      });
      
      if (!result.success) {
        log.error('[MultichannelOutput] Error abriendo stream:', result.error);
        this.stats.lastError = result.error;
        return false;
      }
      
      // Iniciar captura en el worklet
      this.captureNode.port.postMessage({ command: 'start' });
      
      this.isRunning = true;
      log.info('[MultichannelOutput] Captura iniciada');
      
      return true;
    } catch (error) {
      log.error('[MultichannelOutput] Error iniciando:', error);
      this.stats.lastError = error.message;
      return false;
    }
  }
  
  /**
   * Detiene la captura y cierra el stream nativo.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Detener captura en el worklet
      if (this.captureNode) {
        this.captureNode.port.postMessage({ command: 'stop' });
      }
      
      // Cerrar stream nativo
      await window.electronAudio.closeStream();
      
      this.isRunning = false;
      log.info('[MultichannelOutput] Captura detenida');
    } catch (error) {
      log.error('[MultichannelOutput] Error deteniendo:', error);
    }
  }
  
  /**
   * Libera todos los recursos.
   */
  async dispose() {
    await this.stop();
    
    // Desconectar splitters de captura
    for (const bus of this.outputBuses) {
      if (bus._multichannelSplitter) {
        try {
          bus._multichannelSplitter.disconnect();
        } catch { /* Ignorar */ }
        delete bus._multichannelSplitter;
      }
    }
    
    // Desconectar nodos
    if (this.merger) {
      try { this.merger.disconnect(); } catch { /* Ignorar */ }
      this.merger = null;
    }
    
    if (this.captureNode) {
      try { this.captureNode.disconnect(); } catch { /* Ignorar */ }
      this.captureNode = null;
    }
    
    this.audioCtx = null;
    this.outputBuses = [];
    this.isInitialized = false;
    
    log.info('[MultichannelOutput] Recursos liberados');
  }
  
  /**
   * Maneja mensajes del worklet de captura.
   * @private
   */
  _handleWorkletMessage(event) {
    const { type, samples, sampleCount, channelCount } = event.data;
    
    switch (type) {
      case 'samples':
        this._sendSamplesToNative(samples, sampleCount, channelCount);
        break;
        
      case 'stopped':
        log.debug('[MultichannelOutput] Worklet confirmó parada');
        break;
    }
  }
  
  /**
   * Envía samples al backend nativo via IPC.
   * @private
   */
  async _sendSamplesToNative(samples, sampleCount, channelCount) {
    if (!this.isRunning) return;
    
    try {
      const result = await window.electronAudio.write(samples);
      
      if (result.written) {
        this.stats.samplesWritten += sampleCount;
        this.stats.buffersWritten++;
      } else {
        this.stats.errors++;
        log.warn('[MultichannelOutput] Buffer no escrito');
      }
    } catch (error) {
      this.stats.errors++;
      this.stats.lastError = error.message;
      
      // No logueamos cada error para evitar spam
      if (this.stats.errors === 1 || this.stats.errors % 100 === 0) {
        log.error(`[MultichannelOutput] Error escribiendo (${this.stats.errors} total):`, error);
      }
    }
  }
  
  /**
   * Obtiene estadísticas de la sesión actual.
   */
  getStats() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      config: { ...this.config }
    };
  }
}

// Singleton
export const multichannelOutput = new MultichannelOutputManager();
