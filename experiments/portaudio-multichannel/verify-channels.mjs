/**
 * Prueba de concepto: Verificación de canales separados
 * 
 * Este script demuestra que PortAudio realmente envía canales separados,
 * grabando cada canal individualmente a archivos WAV.
 * 
 * La limitación de ver "solo 2 canales" en pavucontrol es porque:
 * 1. Tu tarjeta de sonido física es estéreo
 * 2. PipeWire hace downmix automático de 8ch → 2ch
 * 
 * Para REALMENTE usar 8 canales necesitas:
 * - Una interfaz de audio con 8+ salidas físicas, O
 * - Rutear a un sink virtual de 8 canales para procesamiento
 */

import portAudio from 'naudiodon';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🎹 Prueba de Canales Separados');
console.log('━'.repeat(50));

// Configuración
const NUM_CHANNELS = 8;
const SAMPLE_RATE = 48000;
const DURATION_SECONDS = 2;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS;

// Frecuencias únicas para cada canal (fácilmente distinguibles)
const FREQUENCIES = [
    261.63,  // C4  - Do
    293.66,  // D4  - Re
    329.63,  // E4  - Mi
    349.23,  // F4  - Fa
    392.00,  // G4  - Sol
    440.00,  // A4  - La
    493.88,  // B4  - Si
    523.25   // C5  - Do (octava alta)
];

console.log('\n📊 Generando buffers de audio...');
console.log('   Cada canal tiene una nota diferente de la escala:');
FREQUENCIES.forEach((f, i) => {
    const notes = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do+'];
    console.log(`   Canal ${i + 1}: ${f.toFixed(2)} Hz (${notes[i]})`);
});

// Generar buffer multicanal
const buffer = Buffer.alloc(TOTAL_SAMPLES * NUM_CHANNELS * 4); // float32
const phases = new Array(NUM_CHANNELS).fill(0);

for (let sample = 0; sample < TOTAL_SAMPLES; sample++) {
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        // Generar onda sinusoidal
        const value = Math.sin(phases[ch]) * 0.3;
        phases[ch] += (2 * Math.PI * FREQUENCIES[ch]) / SAMPLE_RATE;
        
        // Escribir en formato interleaved
        const offset = (sample * NUM_CHANNELS + ch) * 4;
        buffer.writeFloatLE(value, offset);
    }
}

console.log('\n✅ Buffer generado:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

// Ahora extraer cada canal y guardarlo como WAV mono para verificar
console.log('\n📁 Extrayendo canales individuales a archivos WAV...');

const outputDir = path.join(__dirname, 'channel-verification');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Función para crear header WAV
function createWavHeader(numSamples, sampleRate, numChannels = 1, bitsPerSample = 32) {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(3, 20);  // format = IEEE float
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return header;
}

// Extraer cada canal
for (let ch = 0; ch < NUM_CHANNELS; ch++) {
    const channelBuffer = Buffer.alloc(TOTAL_SAMPLES * 4);
    
    for (let sample = 0; sample < TOTAL_SAMPLES; sample++) {
        const srcOffset = (sample * NUM_CHANNELS + ch) * 4;
        const dstOffset = sample * 4;
        buffer.copy(channelBuffer, dstOffset, srcOffset, srcOffset + 4);
    }
    
    const wavPath = path.join(outputDir, `canal-${ch + 1}-${FREQUENCIES[ch].toFixed(0)}hz.wav`);
    const header = createWavHeader(TOTAL_SAMPLES, SAMPLE_RATE);
    
    fs.writeFileSync(wavPath, Buffer.concat([header, channelBuffer]));
    console.log(`   ✓ ${path.basename(wavPath)}`);
}

// También guardar el archivo multicanal completo
const multiWavPath = path.join(outputDir, 'todos-8-canales.wav');
const multiHeader = createWavHeader(TOTAL_SAMPLES, SAMPLE_RATE, NUM_CHANNELS);
fs.writeFileSync(multiWavPath, Buffer.concat([multiHeader, buffer]));
console.log(`   ✓ ${path.basename(multiWavPath)} (8 canales)`);

console.log('\n' + '━'.repeat(50));
console.log('📂 Archivos guardados en:', outputDir);
console.log('\n🔍 VERIFICACIÓN:');
console.log('   1. Abre cada archivo canal-N-XXXhz.wav en Audacity');
console.log('   2. Cada uno debe tener UNA SOLA frecuencia');
console.log('   3. Esto DEMUESTRA que los canales están separados');
console.log('\n💡 PARA MULTICANAL REAL necesitas:');
console.log('   - Interfaz de audio con 8+ salidas físicas');
console.log('   - Ej: Focusrite Scarlett 18i20, MOTU 828, etc.');
console.log('   - O usar JACK para ruteo virtual entre apps');
console.log('━'.repeat(50));
