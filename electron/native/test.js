/**
 * Test del addon nativo PipeWire
 * Genera un tono de prueba en cada uno de los 8 canales
 */

const { PipeWireAudio } = require('./build/Release/pipewire_audio.node');

const CHANNELS = 8;
const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 256;

console.log('=== Test PipeWire Native Addon ===\n');

// Crear stream
const audio = new PipeWireAudio('SynthiGME-Test', CHANNELS, SAMPLE_RATE, BUFFER_SIZE);

console.log(`Canales: ${audio.channels}`);
console.log(`Sample Rate: ${audio.sampleRate}`);
console.log(`Running: ${audio.isRunning}`);

// Iniciar
if (!audio.start()) {
    console.error('Error al iniciar stream');
    process.exit(1);
}

console.log(`Running después de start(): ${audio.isRunning}\n`);

// Generar tono de prueba
// Canal 0: 220Hz, Canal 1: 330Hz, ... cada canal frecuencia diferente
const frequencies = [220, 330, 440, 550, 660, 770, 880, 990];
const phases = new Float32Array(CHANNELS);

const FRAMES_PER_CHUNK = 256;
const buffer = new Float32Array(FRAMES_PER_CHUNK * CHANNELS);

let totalFrames = 0;
const DURATION_SECONDS = 5;
const TOTAL_FRAMES = SAMPLE_RATE * DURATION_SECONDS;

console.log(`Reproduciendo ${DURATION_SECONDS} segundos de audio...`);
console.log('Frecuencias por canal:', frequencies.map((f, i) => `CH${i}:${f}Hz`).join(', '));
console.log('\n🎵 Abre qpwgraph para ver los 8 canales AUX0-AUX7\n');

function generateAndWrite() {
    // Generar audio interleaved
    for (let frame = 0; frame < FRAMES_PER_CHUNK; frame++) {
        for (let ch = 0; ch < CHANNELS; ch++) {
            const freq = frequencies[ch];
            const sample = Math.sin(phases[ch]) * 0.3; // Amplitude 0.3
            buffer[frame * CHANNELS + ch] = sample;
            phases[ch] += (2 * Math.PI * freq) / SAMPLE_RATE;
            if (phases[ch] > 2 * Math.PI) {
                phases[ch] -= 2 * Math.PI;
            }
        }
    }
    
    // Escribir al stream
    const written = audio.write(buffer);
    totalFrames += written;
    
    // Mostrar métricas de latencia
    if (totalFrames % (SAMPLE_RATE / 2) < FRAMES_PER_CHUNK) {
        const buffered = audio.bufferedFrames || 0;
        const latencyMs = (buffered / SAMPLE_RATE * 1000).toFixed(1);
        console.log(`  Frames: ${totalFrames}, Buffered: ${buffered} (${latencyMs}ms), Underflows: ${audio.underflows}`);
    }
    
    if (totalFrames < TOTAL_FRAMES) {
        // Continuar generando
        setImmediate(generateAndWrite);
    } else {
        // Finalizar
        console.log(`\n✓ Completado. Frames totales: ${totalFrames}`);
        console.log(`  Underflows: ${audio.underflows}`);
        
        // Esperar un poco antes de cerrar
        setTimeout(() => {
            audio.stop();
            console.log('Stream detenido.');
            process.exit(0);
        }, 500);
    }
}

// Iniciar generación
generateAndWrite();

// Manejo de señales
process.on('SIGINT', () => {
    console.log('\n\nInterrumpido por usuario');
    audio.stop();
    process.exit(0);
});
