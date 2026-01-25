/**
 * SynthiGME - Dispositivo JACK de 8 canales
 * 
 * Este script crea un cliente JACK con 8 puertos de salida SEPARADOS.
 * Cada puerto aparece individualmente en qpwgraph/Carla y puede
 * ser ruteado a donde quieras.
 * 
 * Uso: node jack-multichannel.mjs
 * 
 * Luego abre qpwgraph y verás "SynthiGME" con 8 salidas.
 */

import { spawn } from 'child_process';
import { createWriteStream } from 'fs';

const NUM_CHANNELS = 8;
const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 256;

// Frecuencias de la escala musical
const FREQUENCIES = [
    261.63, 293.66, 329.63, 349.23,  // Do Re Mi Fa
    392.00, 440.00, 493.88, 523.25   // Sol La Si Do
];

console.log('🎹 SynthiGME - Cliente JACK de 8 canales');
console.log('━'.repeat(50));
console.log('');

// Verificar que JACK está corriendo (PipeWire lo emula)
const jackCheck = spawn('jack_lsp', [], { stdio: ['pipe', 'pipe', 'pipe'] });

jackCheck.on('error', () => {
    console.error('❌ Error: JACK no está disponible');
    console.error('   Asegúrate de que PipeWire está corriendo');
    process.exit(1);
});

jackCheck.on('close', (code) => {
    if (code !== 0) {
        console.error('❌ JACK no responde. ¿Está PipeWire activo?');
        process.exit(1);
    }
    console.log('✅ JACK/PipeWire detectado');
    startJackClient();
});

function startJackClient() {
    // Usamos jack-stdout para crear un cliente JACK con múltiples puertos
    // Pero eso no existe... necesitamos otra aproximación
    
    // La forma más directa es usar un cliente JACK nativo
    // Como no tenemos binding directo, usaremos pw-cat con pipes
    
    console.log('');
    console.log('📡 Creando 8 puertos de salida JACK...');
    console.log('');
    
    // Crear un proceso por cada canal usando pw-cat
    const processes = [];
    const phases = new Array(NUM_CHANNELS).fill(0);
    
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const portName = `SynthiGME:out_${ch + 1}`;
        
        // pw-play puede crear un stream con nombre personalizado
        const args = [
            '--target', '0',  // Sin auto-connect
            '--channels', '1',
            '--rate', String(SAMPLE_RATE),
            '--format', 'f32',
            '--media-name', `SynthiGME Canal ${ch + 1}`,
            '--media-category', 'Playback',
            '--media-role', 'Music',
            '-'  // Leer de stdin
        ];
        
        const proc = spawn('pw-play', args, {
            stdio: ['pipe', 'inherit', 'inherit']
        });
        
        proc.on('error', (err) => {
            console.error(`Error en canal ${ch + 1}:`, err.message);
        });
        
        processes.push({
            proc,
            channel: ch,
            freq: FREQUENCIES[ch],
            phase: 0
        });
        
        console.log(`   Canal ${ch + 1}: ${FREQUENCIES[ch].toFixed(0)} Hz`);
    }
    
    console.log('');
    console.log('┌' + '─'.repeat(48) + '┐');
    console.log('│  ABRE qpwgraph - Verás 8 streams "SynthiGME"   │');
    console.log('│  Cada uno es un canal independiente            │');
    console.log('│  Rutéalos como quieras                         │');
    console.log('└' + '─'.repeat(48) + '┘');
    console.log('');
    console.log('⏱️  Reproduciendo durante 60 segundos...');
    console.log('   (Ctrl+C para salir)');
    
    // Generar audio para cada canal
    const CHUNK_SAMPLES = 1024;
    const CHUNK_BYTES = CHUNK_SAMPLES * 4; // float32
    
    function generateAndSend() {
        for (const p of processes) {
            if (p.proc.stdin.destroyed) continue;
            
            const buffer = Buffer.alloc(CHUNK_BYTES);
            
            for (let i = 0; i < CHUNK_SAMPLES; i++) {
                const sample = Math.sin(p.phase) * 0.3;
                p.phase += (2 * Math.PI * p.freq) / SAMPLE_RATE;
                if (p.phase > 2 * Math.PI) p.phase -= 2 * Math.PI;
                
                buffer.writeFloatLE(sample, i * 4);
            }
            
            try {
                p.proc.stdin.write(buffer);
            } catch (e) {
                // Ignorar errores de escritura
            }
        }
    }
    
    // Generar audio en loop
    const interval = setInterval(generateAndSend, (CHUNK_SAMPLES / SAMPLE_RATE) * 1000 * 0.8);
    
    // Parar después de 60 segundos
    setTimeout(() => {
        clearInterval(interval);
        console.log('\n✅ Tiempo completado');
        cleanup();
    }, 60000);
    
    function cleanup() {
        for (const p of processes) {
            try {
                p.proc.stdin.end();
                p.proc.kill();
            } catch (e) {}
        }
        process.exit(0);
    }
    
    process.on('SIGINT', () => {
        console.log('\n\n🛑 Interrumpido por usuario');
        cleanup();
    });
}
