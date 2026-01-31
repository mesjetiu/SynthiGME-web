/**
 * MultichannelAudio - Salida de audio de 8 canales via naudiodon/PortAudio
 * 
 * Este módulo permite sacar audio por 8 canales físicos independientes
 * usando naudiodon (bindings de PortAudio para Node.js) en Linux/PipeWire.
 * 
 * Arquitectura:
 * - Crea un sink PulseAudio de 8 canales
 * - Usa ALSA plugin 'pulse' para escribir al sink
 * - El sink expone 8 puertos monitor en PipeWire/qpwgraph
 * - Los puertos se pueden rutear a cualquier salida de hardware
 * 
 * Uso:
 * 1. Llamar a open() para crear el sink y abrir el stream
 * 2. Llamar a write() con buffers de audio Float32 interleaved
 * 3. Llamar a close() al terminar
 */

const os = require('os');
const { execSync } = require('child_process');

// naudiodon se carga dinámicamente
let portAudio = null;
let available = false;

try {
  portAudio = require('naudiodon');
  available = true;
  console.log('[MultichannelAudio] naudiodon loaded');
} catch (e) {
  console.warn('[MultichannelAudio] naudiodon not available:', e.message);
}

class MultichannelAudio {
  constructor() {
    this.stream = null;
    this.isOpen = false;
    this.sinkModuleId = null;
    this.config = null;
  }

  /**
   * Verifica si el sistema soporta salida multicanal
   * @returns {{ available: boolean, reason?: string }}
   */
  checkAvailability() {
    if (os.platform() !== 'linux') {
      return { available: false, reason: 'Solo soportado en Linux' };
    }
    
    if (!available) {
      return { available: false, reason: 'naudiodon no instalado' };
    }
    
    try {
      execSync('which pactl', { stdio: 'ignore' });
      execSync('pw-cli info 0', { stdio: 'ignore' });
      return { available: true };
    } catch (e) {
      return { available: false, reason: 'PipeWire no detectado' };
    }
  }

  /**
   * Abre el stream de audio de 8 canales
   * @param {Object} [config]
   * @param {number} [config.sampleRate=48000]
   * @param {number} [config.channels=8]
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
      channels: config.channels || 8
    };

    try {
      // 1. Crear sink PulseAudio de 8 canales
      const sinkCreated = await this._createSink();
      if (!sinkCreated) {
        return { success: false, error: 'No se pudo crear sink PulseAudio' };
      }

      // 2. Configurar PULSE_SINK antes de abrir el stream
      process.env.PULSE_SINK = 'SynthiGME';

      // 3. Buscar dispositivo ALSA 'pulse'
      const device = portAudio.getDevices().find(d => 
        d.name === 'pulse' && 
        d.hostAPIName === 'ALSA' &&
        d.maxOutputChannels >= this.config.channels
      );

      if (!device) {
        this._removeSink();
        return { success: false, error: 'Dispositivo ALSA pulse no encontrado' };
      }

      // 4. Abrir stream PortAudio
      this.stream = new portAudio.AudioIO({
        outOptions: {
          channelCount: this.config.channels,
          sampleFormat: portAudio.SampleFormatFloat32,
          sampleRate: this.config.sampleRate,
          deviceId: device.id,
          closeOnError: false
        }
      });

      this.stream.start();
      this.isOpen = true;

      console.log(`[MultichannelAudio] Stream opened: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);
      console.log('[MultichannelAudio] Route SynthiGME:monitor_* ports in qpwgraph');

      return {
        success: true,
        info: {
          channels: this.config.channels,
          sampleRate: this.config.sampleRate,
          device: device.name,
          sink: 'SynthiGME'
        }
      };

    } catch (e) {
      this._removeSink();
      console.error('[MultichannelAudio] Error opening stream:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Escribe audio al stream
   * @param {Buffer} buffer - Audio Float32 interleaved (samples * channels * 4 bytes)
   * @returns {{ written: boolean }}
   */
  write(buffer) {
    if (!this.isOpen || !this.stream) {
      return { written: false };
    }

    try {
      this.stream.write(buffer);
      return { written: true };
    } catch (e) {
      return { written: false };
    }
  }

  /**
   * Cierra el stream y elimina el sink
   */
  async close() {
    console.log('[MultichannelAudio] Closing...');
    this.isOpen = false;

    if (this.stream) {
      try {
        this.stream.quit();
      } catch (e) {
        // Ignorar errores al cerrar
      }
      this.stream = null;
    }

    this._removeSink();
    this.config = null;
  }

  /**
   * Obtiene información del stream actual
   * @returns {Object|null}
   */
  getInfo() {
    if (!this.isOpen) return null;
    return {
      channels: this.config.channels,
      sampleRate: this.config.sampleRate,
      sink: 'SynthiGME'
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Métodos privados
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Crea el sink PulseAudio de 8 canales
   */
  async _createSink() {
    const sinkName = 'SynthiGME';
    const channels = this.config.channels;
    
    // Mapa de canales para 8ch (7.1 surround)
    const channelMap = 'front-left,front-right,rear-left,rear-right,front-center,lfe,side-left,side-right';

    try {
      // Verificar si ya existe
      const existing = execSync(`pactl list short sinks 2>/dev/null`, { encoding: 'utf8' });
      if (existing.includes(sinkName)) {
        console.log(`[MultichannelAudio] Sink ${sinkName} already exists`);
        return true;
      }

      // Crear sink
      const cmd = `pactl load-module module-null-sink sink_name=${sinkName} sink_properties='device.description="SynthiGME 8ch Output"' rate=${this.config.sampleRate} channels=${channels} channel_map=${channelMap}`;
      const moduleId = execSync(cmd, { encoding: 'utf8' }).trim();
      this.sinkModuleId = parseInt(moduleId, 10);

      console.log(`[MultichannelAudio] Sink created (module ${this.sinkModuleId})`);
      
      // Pequeña espera para que el sink esté listo
      await new Promise(r => setTimeout(r, 200));
      return true;

    } catch (e) {
      console.error('[MultichannelAudio] Error creating sink:', e.message);
      return false;
    }
  }

  /**
   * Elimina el sink PulseAudio
   */
  _removeSink() {
    if (!this.sinkModuleId) return;

    try {
      execSync(`pactl unload-module ${this.sinkModuleId} 2>/dev/null`);
      console.log(`[MultichannelAudio] Sink removed (module ${this.sinkModuleId})`);
    } catch (e) {
      // Ignorar errores
    }
    this.sinkModuleId = null;
  }
}

// Singleton
const multichannelAudio = new MultichannelAudio();

module.exports = {
  MultichannelAudio,
  multichannelAudio
};
