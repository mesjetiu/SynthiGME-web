/**
 * SynthiGME - Dispositivo Demo (sin interacción)
 * ================================================
 * 
 * Versión simplificada que reproduce los 8 canales automáticamente
 * para poder ver el dispositivo en pavucontrol/qpwgraph.
 * 
 * Uso: node synthigme-demo.mjs
 * 
 * Mientras corre, abre pavucontrol → pestaña "Reproducción"
 * y verás "Node" o "PortAudio" como un stream de 8 canales.
 */

import portAudio from 'naudiodon';

// Configuración
const CONFIG = {
    numChannels: 8,
    sampleRate: 48000,
    bufferSize: 512,
    duration: 30, // segundos
    frequencies: [220, 440, 660, 880, 1100, 1320, 1540, 1760]
};

console.log('🎹 SynthiGME Demo - Dispositivo de 8 canales');
console.log('━'.repeat(50));
console.log('');

// Buscar dispositivo pulse
const devices = portAudio.getDevices();
const device = devices.find(d => d.name === 'pulse' && d.maxOutputChannels >= 8);

if (!device) {
    console.error('❌ No se encontró dispositivo pulse con 8+ canales');
    process.exit(1);
}

console.log(`📻 Dispositivo: ${device.name} (${device.maxOutputChannels} canales)`);
console.log(`🔧 Configuración: ${CONFIG.numChannels}ch @ ${CONFIG.sampleRate}Hz`);
console.log('');

// Crear stream
const audioStream = new portAudio.AudioIO({
    outOptions: {
        channelCount: CONFIG.numChannels,
        sampleFormat: portAudio.SampleFormatFloat32,
        sampleRate: CONFIG.sampleRate,
        deviceId: device.id,
        closeOnError: false
    }
});

// Estado de fases
const phases = new Array(CONFIG.numChannels).fill(0);

// Generar buffer
function generateBuffer(numSamples) {
    const buffer = Buffer.alloc(numSamples * CONFIG.numChannels * 4);
    
    for (let s = 0; s < numSamples; s++) {
        for (let ch = 0; ch < CONFIG.numChannels; ch++) {
            const value = Math.sin(phases[ch]) * 0.2;
            phases[ch] += (2 * Math.PI * CONFIG.frequencies[ch]) / CONFIG.sampleRate;
            if (phases[ch] > 2 * Math.PI) phases[ch] -= 2 * Math.PI;
            
            buffer.writeFloatLE(value, (s * CONFIG.numChannels + ch) * 4);
        }
    }
    
    return buffer;
}

// Iniciar
audioStream.start();
console.log('✅ Reproduciendo 8 tonos en 8 canales separados...');
console.log('');
console.log('┌────────────────────────────────────────────────┐');
console.log('│  AHORA ABRE pavucontrol O qpwgraph             │');
console.log('│  Verás este stream como "Node" con 8 canales   │');
console.log('└────────────────────────────────────────────────┘');
console.log('');
console.log(`⏱️  Se detendrá automáticamente en ${CONFIG.duration} segundos`);
console.log('   (o presiona Ctrl+C para salir antes)');
console.log('');

// Frecuencias
console.log('Frecuencias por canal:');
CONFIG.frequencies.forEach((f, i) => {
    console.log(`  Canal ${i + 1}: ${f} Hz`);
});
console.log('');

// Bucle de audio
let running = true;
const startTime = Date.now();

function audioLoop() {
    if (!running) return;
    
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= CONFIG.duration) {
        console.log('\n⏹️  Tiempo completado. Cerrando...');
        audioStream.quit();
        process.exit(0);
    }
    
    const buffer = generateBuffer(CONFIG.bufferSize);
    audioStream.write(buffer);
    
    setImmediate(audioLoop);
}

audioLoop();

// Manejo de cierre
process.on('SIGINT', () => {
    console.log('\n\n👋 Cerrando dispositivo...');
    running = false;
    audioStream.quit();
    process.exit(0);
});
