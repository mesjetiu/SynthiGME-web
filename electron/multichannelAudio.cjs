/**
 * MultichannelAudio - Salida de audio de 8 canales via pw-cat (PipeWire)
 * 
 * Este módulo permite sacar audio por 8 canales físicos independientes
 * usando pw-cat directamente con PipeWire en Linux.
 * 
 * Arquitectura:
 * - Spawn de pw-cat con 8 canales y stdin pipe
 * - Escribe audio Float32 interleaved directamente
 * - Crea nodo "SynthiGME" visible en qpwgraph con 8 outputs
 * - No requiere sink PulseAudio intermedio
 * 
 * Uso:
 * 1. Llamar a open() para iniciar pw-cat
 * 2. Llamar a write() con buffers de audio Float32 interleaved
 * 3. Llamar a close() al terminar
 */

const os = require('os');
const { spawn, execSync } = require('child_process');

class MultichannelAudio {
  constructor() {
    this.process = null;
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
    
    try {
      execSync('which pw-cat', { stdio: 'ignore' });
      execSync('pw-cli info 0', { stdio: 'ignore' });
      return { available: true };
    } catch (e) {
      return { available: false, reason: 'PipeWire/pw-cat no detectado' };
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
      // Argumentos para pw-cat
      const args = [
        '--playback',              // Modo reproducción
        '--raw',                   // Datos raw (no archivo)
        '--target', '0',           // No auto-connect (usuario rutea manualmente)
        '--channels', String(this.config.channels),
        '--channel-map', 'AUX0,AUX1,AUX2,AUX3,AUX4,AUX5,AUX6,AUX7',  // Canales genéricos
        '--rate', String(this.config.sampleRate),
        '--format', 'f32',
        '--latency', '2048',       // Buffer interno
        '-P', 'media.name=SynthiGME',
        '-P', 'node.name=SynthiGME',
        '-'  // Leer de stdin
      ];

      console.log('[MultichannelAudio] Starting pw-cat with args:', args.join(' '));

      this.process = spawn('pw-cat', args, {
        stdio: ['pipe', 'inherit', 'inherit']
      });

      // Manejar errores
      this.process.on('error', (err) => {
        console.error('[MultichannelAudio] pw-cat error:', err.message);
        this.isOpen = false;
      });

      this.process.on('close', (code) => {
        console.log(`[MultichannelAudio] pw-cat closed with code ${code}`);
        this.isOpen = false;
      });

      // Esperar un momento para que el proceso arranque
      await new Promise(r => setTimeout(r, 200));

      if (this.process.exitCode !== null) {
        return { success: false, error: `pw-cat terminó con código ${this.process.exitCode}` };
      }

      this.isOpen = true;
      console.log(`[MultichannelAudio] Stream opened: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);
      console.log('[MultichannelAudio] Route SynthiGME outputs in qpwgraph');

      return {
        success: true,
        info: {
          channels: this.config.channels,
          sampleRate: this.config.sampleRate,
          method: 'pw-cat'
        }
      };

    } catch (e) {
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
    if (!this.isOpen || !this.process || !this.process.stdin || this.process.stdin.destroyed) {
      return { written: false };
    }

    try {
      // Debug periódico - verificar RMS de TODOS los canales
      this._writeCount = (this._writeCount || 0) + 1;
      if (this._writeCount % 200 === 1) {
        const floats = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
        const channels = this.config.channels;
        const frames = floats.length / channels;
        
        // Calcular RMS por canal
        const rmsPerChannel = [];
        for (let ch = 0; ch < channels; ch++) {
          let rms = 0;
          for (let i = 0; i < frames; i++) {
            const sample = floats[i * channels + ch];
            rms += sample * sample;
          }
          rms = Math.sqrt(rms / frames);
          rmsPerChannel.push(rms.toFixed(4));
        }
        console.log(`[MultichannelAudio] write #${this._writeCount}, RMS: [${rmsPerChannel.join(', ')}]`);
      }
      
      // Escribir directamente a stdin de pw-cat
      const nodeBuffer = Buffer.from(buffer);
      this.process.stdin.write(nodeBuffer);
      
      return { written: true };
    } catch (e) {
      console.error('[MultichannelAudio] write error:', e.message);
      return { written: false };
    }
  }

  /**
   * Cierra el stream
   */
  async close() {
    console.log('[MultichannelAudio] Closing...');
    this.isOpen = false;
    this._writeCount = 0;

    if (this.process) {
      try {
        // Cerrar stdin primero
        if (this.process.stdin && !this.process.stdin.destroyed) {
          this.process.stdin.end();
        }
        // Matar el proceso si sigue vivo
        if (this.process.exitCode === null) {
          this.process.kill('SIGTERM');
        }
      } catch (e) {
        // Ignorar errores al cerrar
      }
      this.process = null;
    }

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
      method: 'pw-cat'
    };
  }
}

// Singleton
const multichannelAudio = new MultichannelAudio();

module.exports = {
  MultichannelAudio,
  multichannelAudio
};
