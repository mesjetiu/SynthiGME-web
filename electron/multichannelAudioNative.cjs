/**
 * MultichannelAudio - Salida de audio de 8 canales via addon nativo PipeWire
 * 
 * Este módulo permite sacar audio por 8 canales físicos independientes
 * usando un addon nativo C++ con libpipewire directamente.
 * 
 * Ventajas sobre pw-cat:
 * - Latencia mínima (directo a PipeWire sin spawn de proceso)
 * - Ring buffer interno para absorber jitter
 * - API síncrona simple
 * 
 * Uso:
 * 1. Llamar a open() para iniciar el stream
 * 2. Llamar a write() con buffers de audio Float32 interleaved
 * 3. Llamar a close() al terminar
 */

const os = require('os');
const path = require('path');

// Intentar cargar el addon nativo
let PipeWireAudio = null;
try {
  const addonPath = path.join(__dirname, 'native', 'build', 'Release', 'pipewire_audio.node');
  const addon = require(addonPath);
  PipeWireAudio = addon.PipeWireAudio;
  console.log('[MultichannelAudio] Addon nativo cargado correctamente');
} catch (e) {
  console.warn('[MultichannelAudio] No se pudo cargar addon nativo:', e.message);
}

class MultichannelAudio {
  constructor() {
    this.audio = null;
    this.isOpen = false;
    this.config = null;
    this._writeCount = 0;
  }

  /**
   * Verifica si el sistema soporta salida multicanal
   * @returns {{ available: boolean, reason?: string }}
   */
  checkAvailability() {
    if (os.platform() !== 'linux') {
      return { available: false, reason: 'Solo soportado en Linux' };
    }
    
    if (!PipeWireAudio) {
      return { available: false, reason: 'Addon nativo no compilado' };
    }
    
    return { available: true };
  }

  /**
   * Abre el stream de audio de 8 canales
   * @param {Object} [config]
   * @param {number} [config.sampleRate=48000]
   * @param {number} [config.channels=8]
   * @param {number} [config.bufferSize=256]
   * @returns {Promise<{ success: boolean, error?: string, info?: Object }>}
   */
  async open(config = {}) {
    if (this.isOpen) {
      await this.close();
    }

    const check = this.checkAvailability();
    if (!check.available) {
      return { success: false, error: check.reason };
    }

    this.config = {
      sampleRate: config.sampleRate || 48000,
      channels: config.channels || 8,
      bufferSize: config.bufferSize || 256
    };

    try {
      // Crear instancia del addon
      this.audio = new PipeWireAudio(
        'SynthiGME',
        this.config.channels,
        this.config.sampleRate,
        this.config.bufferSize
      );

      // Iniciar stream
      const started = this.audio.start();
      if (!started) {
        return { success: false, error: 'No se pudo iniciar stream PipeWire' };
      }

      this.isOpen = true;
      this._writeCount = 0;

      console.log(`[MultichannelAudio] Nativo iniciado: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);

      return {
        success: true,
        info: {
          backend: 'pipewire-native',
          channels: this.audio.channels,
          sampleRate: this.audio.sampleRate
        }
      };

    } catch (error) {
      console.error('[MultichannelAudio] Error al abrir:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Escribe audio al stream
   * @param {Float32Array} buffer - Audio interleaved (frames * channels)
   * @returns {{ success: boolean, framesWritten?: number }}
   */
  write(buffer) {
    if (!this.isOpen || !this.audio) {
      return { success: false };
    }

    try {
      const framesWritten = this.audio.write(buffer);
      this._writeCount++;
      
      // Log cada 100 writes con métricas de latencia
      if (this._writeCount % 100 === 0) {
        const bufferedFrames = this.audio.bufferedFrames || 0;
        const latencyMs = (bufferedFrames / this.audio.sampleRate * 1000).toFixed(1);
        const overflows = this.audio.overflows || 0;
        const silentUnderflows = this.audio.silentUnderflows || 0;
        console.log(`[MultichannelAudio] Writes: ${this._writeCount}, Buf: ${bufferedFrames}f (${latencyMs}ms), Under: ${this.audio.underflows}, Over: ${overflows}, Silent: ${silentUnderflows}`);
      }

      return { success: true, framesWritten };
    } catch (error) {
      console.error('[MultichannelAudio] Error escribiendo:', error);
      return { success: false };
    }
  }

  /**
   * Cierra el stream de audio
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.isOpen) {
      return;
    }

    console.log('[MultichannelAudio] Cerrando...');

    if (this.audio) {
      this.audio.stop();
      console.log(`[MultichannelAudio] Total underflows: ${this.audio.underflows}`);
      this.audio = null;
    }

    this.isOpen = false;
    console.log('[MultichannelAudio] Cerrado');
  }

  /**
   * Obtiene el estado actual
   * @returns {Object}
   */
  getStatus() {
    return {
      isOpen: this.isOpen,
      backend: 'pipewire-native',
      channels: this.audio?.channels ?? 0,
      sampleRate: this.audio?.sampleRate ?? 0,
      underflows: this.audio?.underflows ?? 0,
      writeCount: this._writeCount
    };
  }
}

module.exports = MultichannelAudio;
