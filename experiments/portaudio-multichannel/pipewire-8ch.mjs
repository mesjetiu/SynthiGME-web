/**
 * SynthiGME - Stream PipeWire de 8 canales
 * 
 * Crea UN SOLO stream con 8 canales visibles en PipeWire/qpwgraph.
 * Usa pw-play directamente para evitar el downmix de PulseAudio.
 * 
 * Uso: node pipewire-8ch.mjs
 */

import { spawn } from 'child_process';

const NUM_CHANNELS = 8;
const SAMPLE_RATE = 48000;
const DURATION_SECONDS = 60;

// Escala musical para cada canal
const FREQUENCIES = [
    261.63, 293.66, 329.63, 349.23,  // Do Re Mi Fa
    392.00, 440.00, 493.88, 523.25   // Sol La Si Do
];

const NOTES = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do+'];

console.log('🎹 SynthiGME - Stream PipeWire de 8 canales');
console.log('━'.repeat(50));
console.log('');

// pw-cat con 8 canales y sin auto-connect
const args = [
    '--playback',              // Modo reproducción
    '--raw',                   // Datos raw (no archivo)
    '--target', '0',           // No auto-connect (tú ruteas manualmente)
    '--channels', String(NUM_CHANNELS),
    '--channel-map', 'FL,FR,RL,RR,FC,LFE,SL,SR',  // Mapa de 8 canales
    '--rate', String(SAMPLE_RATE),
    '--format', 'f32',
    '--media-category', 'Playback',
    '--media-role', 'Music',
    '-P', 'media.name=SynthiGME',
    '-P', 'node.name=SynthiGME',
    '-'  // Leer de stdin
];

console.log('📡 Iniciando stream de 8 canales...');
console.log('   Comando: pw-cat', args.join(' '));
console.log('');

const pwPlay = spawn('pw-cat', args, {
    stdio: ['pipe', 'inherit', 'inherit']
});

pwPlay.on('error', (err) => {
    console.error('❌ Error al iniciar pw-play:', err.message);
    console.error('   ¿Está instalado pipewire-audio-client-libraries?');
    process.exit(1);
});

pwPlay.on('spawn', () => {
    console.log('✅ Stream creado');
    console.log('');
    console.log('Canales:');
    FREQUENCIES.forEach((f, i) => {
        console.log(`   Canal ${i + 1}: ${f.toFixed(0)} Hz (${NOTES[i]})`);
    });
    console.log('');
    console.log('┌' + '─'.repeat(48) + '┐');
    console.log('│  ABRE qpwgraph AHORA                           │');
    console.log('│  Busca "SynthiGME" - Verás 8 canales           │');
    console.log('│  Conecta cada canal donde quieras              │');
    console.log('└' + '─'.repeat(48) + '┘');
    console.log('');
    console.log('⏱️  Duración: 60 segundos (Ctrl+C para salir)');
    console.log('');
    
    startAudioGeneration();
});

pwPlay.on('close', (code) => {
    console.log(`\n📴 pw-play terminó con código ${code}`);
    process.exit(code || 0);
});

function startAudioGeneration() {
    const CHUNK_SAMPLES = 1024;
    const CHUNK_BYTES = CHUNK_SAMPLES * NUM_CHANNELS * 4; // float32, interleaved
    const phases = new Array(NUM_CHANNELS).fill(0);
    
    let totalSamplesWritten = 0;
    const totalSamples = SAMPLE_RATE * DURATION_SECONDS;
    
    function generateChunk() {
        if (totalSamplesWritten >= totalSamples) {
            pwPlay.stdin.end();
            return;
        }
        
        if (pwPlay.stdin.destroyed) return;
        
        const buffer = Buffer.alloc(CHUNK_BYTES);
        
        for (let i = 0; i < CHUNK_SAMPLES; i++) {
            for (let ch = 0; ch < NUM_CHANNELS; ch++) {
                const sample = Math.sin(phases[ch]) * 0.25;
                phases[ch] += (2 * Math.PI * FREQUENCIES[ch]) / SAMPLE_RATE;
                if (phases[ch] > 2 * Math.PI) phases[ch] -= 2 * Math.PI;
                
                // Formato interleaved: [ch0, ch1, ch2, ..., ch7, ch0, ch1, ...]
                const offset = (i * NUM_CHANNELS + ch) * 4;
                buffer.writeFloatLE(sample, offset);
            }
        }
        
        const canWrite = pwPlay.stdin.write(buffer);
        totalSamplesWritten += CHUNK_SAMPLES;
        
        // Mostrar progreso cada 5 segundos
        const seconds = Math.floor(totalSamplesWritten / SAMPLE_RATE);
        if (totalSamplesWritten % (SAMPLE_RATE * 5) < CHUNK_SAMPLES) {
            process.stdout.write(`\r⏱️  ${seconds}s / ${DURATION_SECONDS}s`);
        }
        
        if (canWrite) {
            setImmediate(generateChunk);
        } else {
            pwPlay.stdin.once('drain', generateChunk);
        }
    }
    
    generateChunk();
}

process.on('SIGINT', () => {
    console.log('\n\n🛑 Interrumpido');
    pwPlay.stdin.end();
    pwPlay.kill();
    process.exit(0);
});
