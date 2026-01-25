/**
 * MultichannelBridge - Salida de audio multicanal nativa
 * 
 * Este módulo gestiona la salida de audio multicanal (>2 canales) usando
 * herramientas nativas del sistema operativo, ya que Web Audio API está
 * limitada a estéreo en Chromium.
 * 
 * Backends soportados:
 * - Linux: pw-cat (PipeWire) - IMPLEMENTADO
 * - Windows: naudiodon (WASAPI) - PLANIFICADO
 * - macOS: naudiodon (CoreAudio) - PLANIFICADO
 * 
 * Documentación: MULTICANAL-ELECTRON.md
 */

const { spawn, execSync } = require('child_process');
const os = require('os');

class MultichannelBridge {
    constructor() {
        this.process = null;
        this.isOpen = false;
        this.config = null;
        this.platform = os.platform();
        this.writeQueue = [];
        this.isWriting = false;
        
        // Estadísticas para debug de latencia
        this.stats = {
            bufferFullCount: 0,
            droppedSamples: 0,
            writtenBuffers: 0,
            lastDropWarning: 0
        };
        
        // Flag para saber si podemos escribir (backpressure)
        this.canWrite = true;
    }

    /**
     * Verifica si el sistema soporta salida multicanal
     * @returns {{available: boolean, reason?: string, backend?: string}}
     */
    checkAvailability() {
        if (this.platform === 'linux') {
            return this._checkLinuxAvailability();
        } else if (this.platform === 'win32') {
            return this._checkWindowsAvailability();
        } else if (this.platform === 'darwin') {
            return this._checkMacOSAvailability();
        }
        
        return {
            available: false,
            reason: `Plataforma no soportada: ${this.platform}`
        };
    }

    /**
     * Verifica disponibilidad en Linux (PipeWire)
     */
    _checkLinuxAvailability() {
        try {
            // Verificar que pw-cat está instalado
            execSync('which pw-cat', { stdio: 'ignore' });
            
            // Verificar que PipeWire está corriendo
            execSync('pw-cli info 0', { stdio: 'ignore' });
            
            return {
                available: true,
                backend: 'pipewire',
                maxChannels: 64 // PipeWire soporta hasta 64 canales
            };
        } catch (e) {
            // Intentar con pactl (PulseAudio/PipeWire-pulse)
            try {
                execSync('which pactl', { stdio: 'ignore' });
                return {
                    available: false,
                    reason: 'PipeWire no detectado. Instala pipewire y pipewire-audio-client-libraries para soporte multicanal.',
                    suggestion: 'sudo pacman -S pipewire pipewire-audio-client-libraries'
                };
            } catch {
                return {
                    available: false,
                    reason: 'No se encontró pw-cat ni pactl. Sistema de audio no compatible.'
                };
            }
        }
    }

    /**
     * Verifica disponibilidad en Windows (WASAPI via naudiodon)
     */
    _checkWindowsAvailability() {
        // TODO: Implementar verificación de naudiodon
        return {
            available: false,
            reason: 'Windows multicanal aún no implementado (planificado: naudiodon + WASAPI)'
        };
    }

    /**
     * Verifica disponibilidad en macOS (CoreAudio via naudiodon)
     */
    _checkMacOSAvailability() {
        // TODO: Implementar verificación de naudiodon
        return {
            available: false,
            reason: 'macOS multicanal aún no implementado (planificado: naudiodon + CoreAudio)'
        };
    }

    /**
     * Abre un stream de audio multicanal
     * @param {Object} config Configuración del stream
     * @param {number} config.channels Número de canales (1-64)
     * @param {number} config.sampleRate Sample rate (44100, 48000, etc.)
     * @param {string} [config.deviceName] Nombre visible en el sistema
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async openStream(config) {
        if (this.isOpen) {
            await this.closeStream();
        }

        const availability = this.checkAvailability();
        if (!availability.available) {
            return { success: false, error: availability.reason };
        }

        this.config = {
            channels: config.channels || 8,
            sampleRate: config.sampleRate || 48000,
            deviceName: config.deviceName || 'SynthiGME'
        };

        if (this.platform === 'linux') {
            return this._openLinuxStream();
        }

        return { success: false, error: 'Plataforma no implementada' };
    }

    /**
     * Abre stream en Linux usando pw-cat
     */
    _openLinuxStream() {
        return new Promise((resolve) => {
            const channelMap = this._getChannelMap(this.config.channels);
            
            const args = [
                '--playback',              // Modo reproducción
                '--raw',                   // Datos raw (no archivo)
                '--target', '0',           // No auto-connect (usuario rutea manualmente)
                '--channels', String(this.config.channels),
                '--channel-map', channelMap,
                '--rate', String(this.config.sampleRate),
                '--format', 'f32',
                '--latency', '256',        // 256 samples @ 48kHz = ~5.3ms
                '-P', `media.name=${this.config.deviceName}`,
                '-P', `node.name=${this.config.deviceName}`,
                '-P', 'media.category=Playback',
                '-P', 'media.role=Music',
                '-'  // Leer de stdin
            ];

            console.log('[MultichannelBridge] Iniciando pw-cat:', args.join(' '));

            // Spawn con stdin pipe que tiene highWaterMark bajo para evitar acumulación
            this.process = spawn('pw-cat', args, {
                stdio: ['pipe', 'inherit', 'pipe']
            });
            
            // Configuración CRÍTICA para baja latencia:
            // - Reducir highWaterMark del stdin para que el backpressure actúe rápido
            // - Esto evita que Node.js acumule megas de audio en memoria
            if (this.process.stdin) {
                // El highWaterMark por defecto es 64KB, lo reducimos a 4KB (~1.3ms @ 8ch/48kHz)
                // Esto fuerza backpressure mucho antes
                this.process.stdin._writableState.highWaterMark = 4096;
                
                // Escuchar evento 'drain' para saber cuándo podemos escribir de nuevo
                this.process.stdin.on('drain', () => {
                    this.canWrite = true;
                });
            }

            this.process.on('error', (err) => {
                console.error('[MultichannelBridge] Error:', err.message);
                this.isOpen = false;
                resolve({ success: false, error: err.message });
            });

            this.process.stderr.on('data', (data) => {
                const msg = data.toString();
                // Ignorar warnings de ALSA que no son errores reales
                if (!msg.includes('ALSA lib')) {
                    console.error('[MultichannelBridge] stderr:', msg);
                }
            });

            this.process.on('close', (code) => {
                console.log(`[MultichannelBridge] pw-cat terminó con código ${code}`);
                this.isOpen = false;
                this.process = null;
            });

            // Esperar un momento para verificar que arrancó bien
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.isOpen = true;
                    this.canWrite = true;
                    console.log(`[MultichannelBridge] Stream abierto: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: 'pw-cat terminó inesperadamente' });
                }
            }, 100);
        });
    }

    /**
     * Genera el channel map para pw-cat según número de canales
     */
    _getChannelMap(channels) {
        // Mapeo estándar para hasta 8 canales (surround 7.1)
        const standardMap = ['FL', 'FR', 'RL', 'RR', 'FC', 'LFE', 'SL', 'SR'];
        
        if (channels <= 8) {
            return standardMap.slice(0, channels).join(',');
        }
        
        // Para más de 8 canales, usar AUX
        const map = [...standardMap];
        for (let i = 8; i < channels; i++) {
            map.push(`AUX${i - 7}`);
        }
        return map.join(',');
    }

    /**
     * Escribe samples de audio al stream.
     * IMPORTANTE: Respeta backpressure para evitar acumulación de latencia.
     * Si el buffer está lleno, DESCARTA los samples (preferimos glitches a latencia).
     * @param {Float32Array|ArrayBuffer} samples Samples interleaved
     * @returns {Promise<{written: boolean, dropped: boolean}>}
     */
    async write(samples) {
        if (!this.isOpen || !this.process || !this.process.stdin.writable) {
            return { written: false, dropped: false };
        }

        // Si el buffer de stdin está lleno, descartar este paquete
        // Esto es CRÍTICO para evitar acumulación de latencia
        if (!this.canWrite) {
            this.stats.droppedSamples++;
            const now = Date.now();
            // Log cada 5 segundos máximo para no spammear
            if (now - this.stats.lastDropWarning > 5000) {
                console.warn(`[MultichannelBridge] Descartando samples por backpressure (total: ${this.stats.droppedSamples})`);
                this.stats.lastDropWarning = now;
            }
            return { written: false, dropped: true };
        }

        try {
            // Convertir a Buffer si es necesario
            let buffer;
            if (samples instanceof ArrayBuffer) {
                buffer = Buffer.from(samples);
            } else if (samples.buffer) {
                buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
            } else {
                buffer = Buffer.from(samples);
            }
            
            // Escribir al stdin - el retorno indica si hay backpressure
            const canContinue = this.process.stdin.write(buffer);
            
            this.stats.writtenBuffers++;
            
            if (!canContinue) {
                // El buffer de stdin está lleno, marcar para no escribir más
                // hasta que se dispare el evento 'drain'
                this.canWrite = false;
                this.stats.bufferFullCount++;
            }
            
            return { written: true, dropped: false };
        } catch (err) {
            console.error('[MultichannelBridge] Error escribiendo:', err.message);
            return { written: false, dropped: false };
        }
    }

    /**
     * Escribe samples de forma síncrona (para uso desde worklet)
     * Respeta backpressure igual que write() async.
     * @param {Buffer} buffer Buffer de audio
     * @returns {{written: boolean, dropped: boolean}}
     */
    writeSync(buffer) {
        if (!this.isOpen || !this.process || !this.process.stdin.writable) {
            return { written: false, dropped: false };
        }
        
        // Si hay backpressure, descartar
        if (!this.canWrite) {
            this.stats.droppedSamples++;
            return { written: false, dropped: true };
        }
        
        try {
            const canContinue = this.process.stdin.write(buffer);
            this.stats.writtenBuffers++;
            
            if (!canContinue) {
                this.canWrite = false;
                this.stats.bufferFullCount++;
            }
            
            return { written: true, dropped: false };
        } catch (e) {
            return { written: false, dropped: false };
        }
    }
    
    /**
     * Obtiene estadísticas de rendimiento para diagnóstico
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            isOpen: this.isOpen,
            canWrite: this.canWrite,
            bufferPressure: !this.canWrite
        };
    }
    
    /**
     * Resetea las estadísticas
     */
    resetStats() {
        this.stats = {
            bufferFullCount: 0,
            droppedSamples: 0,
            writtenBuffers: 0,
            lastDropWarning: 0
        };
    }

    /**
     * Cierra el stream de audio
     */
    async closeStream() {
        if (this.process) {
            console.log('[MultichannelBridge] Cerrando stream...');
            console.log('[MultichannelBridge] Stats finales:', this.getStats());
            
            try {
                this.process.stdin.end();
                this.process.kill('SIGTERM');
            } catch (e) {
                // Ignorar errores al cerrar
            }
            
            this.process = null;
        }
        
        this.isOpen = false;
        this.canWrite = true;
        this.config = null;
        this.resetStats();
    }

    /**
     * Obtiene información del stream actual
     */
    getStreamInfo() {
        if (!this.isOpen) {
            return null;
        }
        
        return {
            channels: this.config.channels,
            sampleRate: this.config.sampleRate,
            deviceName: this.config.deviceName,
            backend: this.platform === 'linux' ? 'pipewire' : 'unknown',
            stats: this.getStats()
        };
    }
}

// Singleton para uso global
const bridge = new MultichannelBridge();

module.exports = {
    MultichannelBridge,
    bridge
};
