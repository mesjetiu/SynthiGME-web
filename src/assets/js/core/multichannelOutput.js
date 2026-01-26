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

import { createLogger } from '../utils/logger.js';

const log = createLogger('MultichannelOutput');

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
    this.keepAliveNode = null;  // Nodo para mantener el worklet activo
    this.isInitialized = false;
    this.isRunning = false;
    this.config = {
      channels: 8,
      sampleRate: 48000,
      bufferSize: 256,  // Buffer pequeño para baja latencia
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
      // IMPORTANTE: Capturamos DESPUÉS del muteNode para respetar el nivel/mute del canal
      // La cadena es: input → [filters] → levelNode → muteNode → (captura aquí)
      for (let i = 0; i < Math.min(outputBuses.length, this.config.channels); i++) {
        const bus = outputBuses[i];
        // Usar muteNode (después de levelNode) para capturar señal con nivel aplicado
        const capturePoint = bus?.muteNode || bus?.levelNode || bus?.input;
        if (capturePoint) {
          // Crear un splitter para tomar una copia de la señal
          const splitter = audioCtx.createGain();
          splitter.gain.value = 1.0;
          
          // Conectar desde el punto de captura (después del control de nivel)
          capturePoint.connect(splitter);
          splitter.connect(this.merger, 0, i);
          
          // Guardar referencia para desconectar después
          bus._multichannelSplitter = splitter;
          bus._multichannelCapturePoint = capturePoint;
        }
      }
      
      // Conectar merger al nodo de captura
      this.merger.connect(this.captureNode);
      
      // ConstantSourceNode para mantener el worklet activo
      // (el silenciamiento del estéreo lo gestiona el engine)
      this.keepAliveNode = audioCtx.createConstantSource();
      this.keepAliveNode.offset.value = 0;
      this.keepAliveNode.connect(this.captureNode);
      this.keepAliveNode.start();
      
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
        delete bus._multichannelCapturePoint;
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
    
    // Detener y desconectar el nodo keep-alive
    if (this.keepAliveNode) {
      try {
        this.keepAliveNode.stop();
        this.keepAliveNode.disconnect();
      } catch { /* Ignorar */ }
      this.keepAliveNode = null;
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
   * Fire-and-forget para mínima latencia (usa ipcRenderer.send, no invoke).
   * @private
   */
  _sendSamplesToNative(samples, sampleCount, channelCount) {
    if (!this.isRunning) return;
    
    // Fire-and-forget: no esperamos respuesta para minimizar latencia
    // Usamos ipcRenderer.send que no tiene round-trip
    window.electronAudio.write(samples);
    
    // Actualizar stats localmente (no tenemos confirmación del backend)
    this.stats.samplesWritten += sampleCount;
    this.stats.buffersWritten++;
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
