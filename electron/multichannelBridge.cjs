/**
 * MultichannelBridge - Salida de audio multicanal con naudiodon/PortAudio
 * 
 * Este módulo gestiona la salida de audio multicanal (>2 canales) usando
 * naudiodon (bindings de PortAudio para Node.js).
 * 
 * Backends:
 * - Linux: ALSA via PipeWire (crea sink PulseAudio de N canales)
 * - Windows: WASAPI via PortAudio (planificado)
 * - macOS: CoreAudio via PortAudio (planificado)
 * 
 * En Linux/PipeWire: Se crea automáticamente un sink PulseAudio de N canales.
 * El audio fluye: naudiodon → ALSA pulse → SynthiGME sink → qpwgraph routing
 * Las salidas SynthiGME:monitor_* se pueden rutear a cualquier destino.
 * 
 * Documentación: MULTICANAL-ELECTRON.md
 */

const os = require('os');
const { execSync } = require('child_process');

// naudiodon se carga dinámicamente
let portAudio = null;
let naudiodonAvailable = false;

try {
    portAudio = require('naudiodon');
    naudiodonAvailable = true;
    console.log('[MultichannelBridge] ✅ naudiodon cargado');
} catch (e) {
    console.warn('[MultichannelBridge] naudiodon no disponible:', e.message);
}

// ID del módulo PulseAudio creado (para eliminarlo al cerrar)
let pulseModuleId = null;

class MultichannelBridge {
    constructor() {
        this.audioStream = null;
        this.isOpen = false;
        this.config = null;
        this.platform = os.platform();
        this.sinkName = null;
        
        // Estadísticas
        this.stats = {
            bytesWritten: 0,
            buffersReceived: 0,
            underruns: 0,
            errors: 0
        };
        
        this.canWrite = true;
    }

    /**
     * Verifica si el sistema soporta salida multicanal
     */
    checkAvailability() {
        if (!naudiodonAvailable) {
            return {
                available: false,
                reason: 'naudiodon no está instalado. Ejecuta: npm install naudiodon'
            };
        }
        
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

    _checkLinuxAvailability() {
        try {
            // Verificar que pactl está disponible (para crear sink)
            execSync('which pactl', { stdio: 'ignore' });
            
            // Verificar que PipeWire está corriendo
            execSync('pw-cli info 0', { stdio: 'ignore' });
            
            return {
                available: true,
                backend: 'alsa-pulse',
                maxChannels: 32
            };
        } catch (e) {
            return {
                available: false,
                reason: 'PipeWire no detectado. Necesario para salida multicanal.'
            };
        }
    }

    _checkWindowsAvailability() {
        return {
            available: false,
            reason: 'Windows multicanal pendiente de implementar'
        };
    }

    _checkMacOSAvailability() {
        return {
            available: false,
            reason: 'macOS multicanal pendiente de implementar'
        };
    }

    /**
     * Crea un sink PulseAudio virtual de N canales (Linux/PipeWire)
     */
    _createPulseSink(channels, sinkName) {
        if (this.platform !== 'linux') return Promise.resolve(true);
        
        const channelMaps = {
            2: 'front-left,front-right',
            4: 'front-left,front-right,rear-left,rear-right',
            6: 'front-left,front-right,rear-left,rear-right,front-center,lfe',
            8: 'front-left,front-right,rear-left,rear-right,front-center,lfe,side-left,side-right'
        };
        
        const channelMap = channelMaps[channels] || channelMaps[8];
        
        return new Promise((resolve) => {
            try {
                // Verificar si ya existe
                const existing = execSync(`pactl list short sinks 2>/dev/null | grep "${sinkName}" || true`, { encoding: 'utf8' });
                if (existing.includes(sinkName)) {
                    console.log(`[MultichannelBridge] Sink ${sinkName} ya existe`);
                    this.sinkName = sinkName;
                    resolve(true);
                    return;
                }
                
                // Crear sink con nombre descriptivo para qpwgraph
                const cmd = `pactl load-module module-null-sink sink_name=${sinkName} sink_properties='device.description="SynthiGME Matrix Outputs"' rate=48000 channels=${channels} channel_map=${channelMap}`;
                const result = execSync(cmd, { encoding: 'utf8' }).trim();
                pulseModuleId = parseInt(result, 10);
                
                console.log(`[MultichannelBridge] ✅ Sink ${sinkName} creado (module ID: ${pulseModuleId})`);
                this.sinkName = sinkName;
                
                // Pequeña espera para que el sink esté listo
                setTimeout(() => resolve(true), 200);
            } catch (e) {
                console.error(`[MultichannelBridge] Error creando sink:`, e.message);
                resolve(false);
            }
        });
    }
    
    /**
     * Elimina el sink PulseAudio creado
     */
    _removePulseSink() {
        if (this.platform !== 'linux' || !pulseModuleId) return;
        
        try {
            execSync(`pactl unload-module ${pulseModuleId} 2>/dev/null || true`);
            console.log(`[MultichannelBridge] Sink eliminado (module ID: ${pulseModuleId})`);
            pulseModuleId = null;
            this.sinkName = null;
        } catch (e) {
            // Ignorar
        }
    }

    /**
     * Encuentra el dispositivo ALSA 'pulse' para escribir al sink
     */
    _findAlsaPulseDevice() {
        const devices = portAudio.getDevices();
        
        // Buscar el dispositivo ALSA 'pulse'
        const pulseDevice = devices.find(d => 
            d.name === 'pulse' && 
            d.hostAPIName === 'ALSA' &&
            d.maxOutputChannels >= 8
        );
        
        return pulseDevice;
    }

    /**
     * Abre un stream de audio multicanal
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
            bufferSize: config.bufferSize || 1024,
            deviceName: config.deviceName || 'SynthiGME'
        };

        if (this.platform === 'linux') {
            return this._openAlsaPulseStream();
        }

        return { success: false, error: 'Plataforma no implementada' };
    }

    /**
     * Abre stream usando naudiodon via ALSA pulse → PipeWire sink
     */
    async _openAlsaPulseStream() {
        try {
            // Crear sink PulseAudio de N canales
            const sinkName = `SynthiGME`;
            console.log(`[MultichannelBridge] Creando sink ${sinkName} con ${this.config.channels} canales...`);
            
            const sinkCreated = await this._createPulseSink(this.config.channels, sinkName);
            if (!sinkCreated) {
                return { success: false, error: 'No se pudo crear sink PulseAudio' };
            }
            
            // Configurar PULSE_SINK para que el audio vaya al sink correcto
            process.env.PULSE_SINK = sinkName;
            
            // Buscar dispositivo ALSA pulse
            const device = this._findAlsaPulseDevice();
            if (!device) {
                return { success: false, error: 'No se encontró dispositivo ALSA pulse' };
            }
            
            console.log(`[MultichannelBridge] Usando: ${device.name} (ID:${device.id}) - ${device.maxOutputChannels}ch via ALSA`);
            
            // Crear stream de salida PortAudio
            this.audioStream = new portAudio.AudioIO({
                outOptions: {
                    channelCount: this.config.channels,
                    sampleFormat: portAudio.SampleFormatFloat32,
                    sampleRate: this.config.sampleRate,
                    deviceId: device.id,
                    closeOnError: false
                }
            });
            
            this.audioStream.start();
            
            this.isOpen = true;
            this.canWrite = true;
            
            console.log(`[MultichannelBridge] ✅ Stream abierto: ${this.config.channels}ch @ ${this.config.sampleRate}Hz`);
            console.log(`[MultichannelBridge] En qpwgraph: Las salidas ${sinkName}:monitor_* se pueden rutear a hardware`);
            
            return {
                success: true,
                info: {
                    device: device.name,
                    deviceId: device.id,
                    channels: this.config.channels,
                    sampleRate: this.config.sampleRate,
                    hostApi: 'ALSA-PulseAudio',
                    sink: sinkName,
                    routingInfo: `Rutea ${sinkName}:monitor_FL,FR,RL,RR,FC,LFE,SL,SR a tu hardware en qpwgraph`
                }
            };
                
        } catch (e) {
            console.error('[MultichannelBridge] Error abriendo stream:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * Escribe samples de audio al stream
     */
    async write(samples) {
        if (!this.isOpen || !this.audioStream) {
            return { written: false, dropped: false };
        }

        try {
            let buffer;
            
            if (samples instanceof Buffer) {
                buffer = samples;
            } else if (samples instanceof ArrayBuffer) {
                buffer = Buffer.from(samples);
            } else if (samples.buffer) {
                buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
            } else {
                buffer = Buffer.from(samples);
            }
            
            this.stats.bytesWritten += buffer.length;
            this.stats.buffersReceived++;
            
            this.audioStream.write(buffer);
            
            return { written: true, dropped: false };
            
        } catch (err) {
            this.stats.errors++;
            return { written: false, dropped: false };
        }
    }

    writeSync(buffer) {
        if (!this.isOpen || !this.audioStream) {
            return { written: false, dropped: false };
        }
        
        try {
            this.stats.bytesWritten += buffer.length;
            this.stats.buffersReceived++;
            this.audioStream.write(buffer);
            return { written: true, dropped: false };
        } catch (e) {
            this.stats.errors++;
            return { written: false, dropped: false };
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            isOpen: this.isOpen,
            canWrite: this.canWrite
        };
    }
    
    resetStats() {
        this.stats = {
            bytesWritten: 0,
            buffersReceived: 0,
            underruns: 0,
            errors: 0
        };
    }

    async closeStream() {
        console.log('[MultichannelBridge] Cerrando stream...');
        this.isOpen = false;
        
        try {
            if (this.audioStream) {
                this.audioStream.quit();
                this.audioStream = null;
            }
            this._removePulseSink();
        } catch (e) {}
        
        this.canWrite = true;
        this.config = null;
        this.resetStats();
    }

    getStreamInfo() {
        if (!this.isOpen) return null;
        
        return {
            channels: this.config.channels,
            sampleRate: this.config.sampleRate,
            deviceName: this.config.deviceName,
            backend: 'jack',
            stats: this.getStats()
        };
    }
}

const bridge = new MultichannelBridge();

module.exports = {
    MultichannelBridge,
    bridge
};
