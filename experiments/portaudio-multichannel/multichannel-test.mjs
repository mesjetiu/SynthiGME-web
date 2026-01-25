/**
 * Prueba de salida multicanal: genera un tono diferente en cada canal.
 * 
 * Uso: npm run test -- --device=ID --channels=N
 * Ejemplo: npm run test -- --device=0 --channels=4
 * 
 * Cada canal emite una frecuencia diferente:
 *   Canal 0: 220 Hz (La3)
 *   Canal 1: 330 Hz (Mi4)
 *   Canal 2: 440 Hz (La4)
 *   Canal 3: 550 Hz (Do#5)
 *   ... etc
 */

import portAudio from 'naudiodon';

// Parsear argumentos
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : defaultVal;
};

const deviceId = parseInt(getArg('device', '-1'), 10);
const numChannels = parseInt(getArg('channels', '4'), 10);
const duration = parseInt(getArg('duration', '5'), 10);
const sampleRate = 48000;

// Validar dispositivo
const devices = portAudio.getDevices();
const device = deviceId >= 0 
    ? devices.find(d => d.id === deviceId)
    : devices.find(d => d.maxOutputChannels >= numChannels);

if (!device) {
    console.error(`Error: No se encontró dispositivo con ID=${deviceId} o con ${numChannels}+ canales`);
    console.log('\nDispositivos disponibles:');
    devices.filter(d => d.maxOutputChannels > 0).forEach(d => {
        console.log(`  [${d.id}] ${d.name} (${d.maxOutputChannels} canales)`);
    });
    process.exit(1);
}

if (device.maxOutputChannels < numChannels) {
    console.error(`Error: Dispositivo "${device.name}" solo soporta ${device.maxOutputChannels} canales, pediste ${numChannels}`);
    process.exit(1);
}

console.log(`=== Test Multicanal ===`);
console.log(`Dispositivo: ${device.name} (ID: ${device.id})`);
console.log(`Canales: ${numChannels}`);
console.log(`Duración: ${duration} segundos`);
console.log(`Sample rate: ${sampleRate} Hz`);
console.log('');

// Frecuencias base para cada canal (serie armónica desde La3)
const baseFreq = 220;
const frequencies = Array.from({ length: numChannels }, (_, i) => baseFreq * (i + 1));
console.log('Frecuencias por canal:');
frequencies.forEach((f, i) => console.log(`  Canal ${i}: ${f} Hz`));
console.log('');

// Crear stream de salida
let ao;
try {
    ao = new portAudio.AudioIO({
        outOptions: {
            channelCount: numChannels,
            sampleFormat: portAudio.SampleFormatFloat32,
            sampleRate: sampleRate,
            deviceId: device.id,
            closeOnError: false
        }
    });
} catch (err) {
    console.error('Error al abrir stream:', err.message);
    process.exit(1);
}

console.log('Stream abierto correctamente. Reproduciendo...\n');

// Generar audio: cada canal con su frecuencia
const bufferSize = 1024;
const totalSamples = sampleRate * duration;
let samplesWritten = 0;
const phases = new Array(numChannels).fill(0);

ao.on('error', err => {
    console.error('Error de audio:', err);
});

ao.start();

const writeBuffer = () => {
    if (samplesWritten >= totalSamples) {
        ao.quit();
        console.log('\n=== Test completado ===');
        console.log('Si escuchaste tonos diferentes en cada salida, ¡multicanal funciona!');
        return;
    }

    // Buffer interleaved: [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ch1_s1, ...]
    const buffer = Buffer.alloc(bufferSize * numChannels * 4); // float32 = 4 bytes
    
    for (let i = 0; i < bufferSize; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.sin(phases[ch]) * 0.3; // Amplitud 0.3 para no saturar
            phases[ch] += (2 * Math.PI * frequencies[ch]) / sampleRate;
            
            // Escribir float32 little-endian
            buffer.writeFloatLE(sample, (i * numChannels + ch) * 4);
        }
    }

    // Wrap phases para evitar pérdida de precisión
    for (let ch = 0; ch < numChannels; ch++) {
        if (phases[ch] > 2 * Math.PI) phases[ch] -= 2 * Math.PI;
    }

    const written = ao.write(buffer);
    samplesWritten += bufferSize;

    // Progreso
    const percent = Math.floor((samplesWritten / totalSamples) * 100);
    process.stdout.write(`\rProgreso: ${percent}%`);

    // Continuar escribiendo
    setImmediate(writeBuffer);
};

writeBuffer();

// Manejo de cierre limpio
process.on('SIGINT', () => {
    console.log('\n\nInterrumpido por usuario');
    ao.quit();
    process.exit(0);
});
