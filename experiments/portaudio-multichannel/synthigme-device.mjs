/**
 * SynthiGME - Dispositivo de Audio Virtual Multicanal
 * =====================================================
 * 
 * Esta prueba de concepto crea un dispositivo de audio virtual que aparece
 * en PipeWire/PulseAudio como "SynthiGME Output" con 8 canales de salida.
 * 
 * El objetivo es simular cómo funcionará la integración final en Electron:
 * - Un solo dispositivo visible en el mezclador del sistema
 * - 8 canales independientes (los 8 buses de salida del Synthi 100)
 * - Nombre identificable para el usuario
 * 
 * Uso:
 *   node synthigme-device.mjs [--channels=8] [--device=ID]
 * 
 * Controles interactivos:
 *   1-8: Activa/desactiva tono en ese canal
 *   a:   Activa todos los canales
 *   s:   Silencia todos los canales
 *   q:   Salir
 * 
 * @author SynthiGME Team
 * @version 0.1.0 - Prueba de concepto
 */

import portAudio from 'naudiodon';
import * as readline from 'readline';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

/**
 * Parsea argumentos de línea de comandos
 * @param {string} name - Nombre del argumento
 * @param {string} defaultVal - Valor por defecto
 * @returns {string}
 */
function getArg(name, defaultVal) {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : defaultVal;
}

// Configuración del dispositivo
const CONFIG = {
    // Número de canales de salida (8 = buses del Synthi 100)
    numChannels: parseInt(getArg('channels', '8'), 10),
    
    // ID del dispositivo PortAudio (-1 = buscar automáticamente)
    deviceId: parseInt(getArg('device', '-1'), 10),
    
    // Frecuencia de muestreo
    sampleRate: 48000,
    
    // Tamaño del buffer (más pequeño = menos latencia, más CPU)
    bufferSize: 256,
    
    // Nombre que aparecerá en el sistema (via variables de entorno ALSA)
    appName: 'SynthiGME Output',
    
    // Frecuencias base para cada canal (serie armónica desde La3)
    // Canal 0: 220 Hz (La3), Canal 1: 440 Hz (La4), etc.
    baseFrequencies: [220, 440, 660, 880, 1100, 1320, 1540, 1760]
};

// ============================================================================
// ESTADO DEL DISPOSITIVO
// ============================================================================

/**
 * Estado de cada canal
 * @type {Object[]}
 */
const channels = Array.from({ length: CONFIG.numChannels }, (_, i) => ({
    id: i,
    active: false,
    frequency: CONFIG.baseFrequencies[i] || 220 * (i + 1),
    phase: 0,
    gain: 0.25  // Ganancia individual por canal
}));

// Estado global
let isRunning = true;
let audioStream = null;

// ============================================================================
// SELECCIÓN DE DISPOSITIVO
// ============================================================================

/**
 * Busca un dispositivo de salida adecuado
 * @returns {Object|null} Dispositivo encontrado o null
 */
function findOutputDevice() {
    const devices = portAudio.getDevices();
    const outputDevices = devices.filter(d => d.maxOutputChannels >= CONFIG.numChannels);
    
    console.log('\n📻 Dispositivos de salida disponibles:');
    console.log('─'.repeat(60));
    
    outputDevices.forEach(d => {
        const marker = d.maxOutputChannels >= CONFIG.numChannels ? '✓' : '✗';
        console.log(`  [${d.id}] ${d.name}`);
        console.log(`      ${marker} ${d.maxOutputChannels} canales | ${d.defaultSampleRate} Hz`);
    });
    
    // Si se especificó un ID, usarlo
    if (CONFIG.deviceId >= 0) {
        const device = devices.find(d => d.id === CONFIG.deviceId);
        if (device && device.maxOutputChannels >= CONFIG.numChannels) {
            return device;
        }
        console.error(`\n❌ Dispositivo ${CONFIG.deviceId} no encontrado o no soporta ${CONFIG.numChannels} canales`);
        return null;
    }
    
    // Buscar automáticamente: preferir 'pulse' o 'default'
    const preferred = ['pulse', 'pipewire', 'default'];
    for (const name of preferred) {
        const device = outputDevices.find(d => d.name.toLowerCase().includes(name));
        if (device) {
            console.log(`\n✓ Seleccionado automáticamente: ${device.name}`);
            return device;
        }
    }
    
    // Usar el primero disponible
    if (outputDevices.length > 0) {
        console.log(`\n✓ Usando primer dispositivo: ${outputDevices[0].name}`);
        return outputDevices[0];
    }
    
    return null;
}

// ============================================================================
// GENERACIÓN DE AUDIO
// ============================================================================

/**
 * Genera el siguiente buffer de audio con todas las señales mezcladas
 * @param {number} numSamples - Número de muestras por canal
 * @returns {Buffer} Buffer de audio interleaved (float32)
 */
function generateAudioBuffer(numSamples) {
    // Buffer interleaved: [ch0_s0, ch1_s0, ..., ch7_s0, ch0_s1, ch1_s1, ...]
    const buffer = Buffer.alloc(numSamples * CONFIG.numChannels * 4); // float32 = 4 bytes
    
    for (let sample = 0; sample < numSamples; sample++) {
        for (let ch = 0; ch < CONFIG.numChannels; ch++) {
            const channel = channels[ch];
            let value = 0;
            
            if (channel.active) {
                // Generar onda sinusoidal
                value = Math.sin(channel.phase) * channel.gain;
                
                // Avanzar fase
                channel.phase += (2 * Math.PI * channel.frequency) / CONFIG.sampleRate;
                
                // Normalizar fase para evitar pérdida de precisión
                if (channel.phase > 2 * Math.PI) {
                    channel.phase -= 2 * Math.PI;
                }
            }
            
            // Escribir muestra en formato float32 little-endian
            const offset = (sample * CONFIG.numChannels + ch) * 4;
            buffer.writeFloatLE(value, offset);
        }
    }
    
    return buffer;
}

// ============================================================================
// INTERFAZ DE USUARIO
// ============================================================================

/**
 * Muestra el estado actual de los canales
 */
function displayStatus() {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          🎹 SynthiGME - Dispositivo Virtual Multicanal         ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║                                                                ║');
    
    // Mostrar estado de cada canal
    const row1 = channels.slice(0, 4).map(ch => {
        const status = ch.active ? '🔊' : '🔇';
        return `${status} Ch${ch.id + 1}: ${ch.frequency}Hz`;
    }).join(' │ ');
    
    const row2 = channels.slice(4, 8).map(ch => {
        const status = ch.active ? '🔊' : '🔇';
        return `${status} Ch${ch.id + 1}: ${ch.frequency}Hz`;
    }).join(' │ ');
    
    console.log(`║  ${row1.padEnd(62)}║`);
    console.log(`║  ${row2.padEnd(62)}║`);
    console.log('║                                                                ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Controles:                                                    ║');
    console.log('║    [1-8] Activar/desactivar canal    [a] Todos ON    [s] OFF   ║');
    console.log('║    [q] Salir                                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('ℹ️  Este dispositivo aparece en PipeWire como un stream de 8 canales');
    console.log('   Usa pavucontrol o qpwgraph para ver/rutear las conexiones');
}

/**
 * Configura la entrada de teclado interactiva
 */
function setupKeyboardInput() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    
    process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
            shutdown();
            return;
        }
        
        switch (str) {
            case '1': case '2': case '3': case '4':
            case '5': case '6': case '7': case '8':
                const chIndex = parseInt(str) - 1;
                channels[chIndex].active = !channels[chIndex].active;
                displayStatus();
                break;
                
            case 'a': // Activar todos
                channels.forEach(ch => ch.active = true);
                displayStatus();
                break;
                
            case 's': // Silenciar todos
                channels.forEach(ch => ch.active = false);
                displayStatus();
                break;
                
            case 'q': // Salir
                shutdown();
                break;
        }
    });
}

// ============================================================================
// CICLO PRINCIPAL
// ============================================================================

/**
 * Bucle principal de generación de audio
 */
function audioLoop() {
    if (!isRunning || !audioStream) return;
    
    const buffer = generateAudioBuffer(CONFIG.bufferSize);
    
    try {
        audioStream.write(buffer);
    } catch (e) {
        console.error('Error escribiendo audio:', e.message);
    }
    
    // Continuar el bucle
    setImmediate(audioLoop);
}

/**
 * Cierra el dispositivo limpiamente
 */
function shutdown() {
    console.log('\n\n👋 Cerrando dispositivo SynthiGME...');
    isRunning = false;
    
    if (audioStream) {
        try {
            audioStream.quit();
        } catch (e) {
            // Ignorar errores al cerrar
        }
    }
    
    process.exit(0);
}

// ============================================================================
// INICIO
// ============================================================================

async function main() {
    console.log('🎹 SynthiGME - Inicializando dispositivo de audio virtual...\n');
    
    // Suprimir mensajes de ALSA
    process.env.ALSA_CARD = 'default';
    
    // Buscar dispositivo
    const device = findOutputDevice();
    if (!device) {
        console.error('\n❌ No se encontró un dispositivo de salida compatible');
        process.exit(1);
    }
    
    console.log(`\n🔧 Configuración:`);
    console.log(`   Dispositivo: ${device.name} (ID: ${device.id})`);
    console.log(`   Canales: ${CONFIG.numChannels}`);
    console.log(`   Sample rate: ${CONFIG.sampleRate} Hz`);
    console.log(`   Buffer: ${CONFIG.bufferSize} muestras (${(CONFIG.bufferSize / CONFIG.sampleRate * 1000).toFixed(1)} ms)`);
    
    // Crear stream de audio
    try {
        audioStream = new portAudio.AudioIO({
            outOptions: {
                channelCount: CONFIG.numChannels,
                sampleFormat: portAudio.SampleFormatFloat32,
                sampleRate: CONFIG.sampleRate,
                deviceId: device.id,
                closeOnError: false
            }
        });
    } catch (e) {
        console.error('\n❌ Error al crear stream de audio:', e.message);
        process.exit(1);
    }
    
    // Manejar errores del stream
    audioStream.on('error', err => {
        console.error('Error de audio:', err.message);
    });
    
    // Iniciar stream
    audioStream.start();
    
    console.log('\n✅ Dispositivo iniciado correctamente');
    console.log('   Presiona cualquier tecla para continuar...\n');
    
    // Esperar un momento y mostrar la interfaz
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Configurar interfaz
    setupKeyboardInput();
    displayStatus();
    
    // Iniciar bucle de audio
    audioLoop();
    
    // Manejar señales de cierre
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Ejecutar
main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
