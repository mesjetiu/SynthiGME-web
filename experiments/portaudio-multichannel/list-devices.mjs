/**
 * Lista todos los dispositivos de audio y sus canales máximos.
 * Esto valida que naudiodon funciona y detecta tu hardware.
 * 
 * Ejecutar: npm run list
 */

import portAudio from 'naudiodon';

console.log('=== Dispositivos de Audio (PortAudio via naudiodon) ===\n');

const devices = portAudio.getDevices();

// Filtrar solo dispositivos de salida (maxOutputChannels > 0)
const outputDevices = devices.filter(d => d.maxOutputChannels > 0);

console.log(`Encontrados ${outputDevices.length} dispositivos de salida:\n`);

outputDevices.forEach((device, index) => {
    const multicanal = device.maxOutputChannels > 2 ? '✓ MULTICANAL' : '  estéreo';
    console.log(`[${device.id}] ${device.name}`);
    console.log(`    Canales de salida: ${device.maxOutputChannels} ${multicanal}`);
    console.log(`    Sample rate por defecto: ${device.defaultSampleRate} Hz`);
    console.log(`    Latencia baja: ${(device.defaultLowOutputLatency * 1000).toFixed(1)} ms`);
    console.log(`    Latencia alta: ${(device.defaultHighOutputLatency * 1000).toFixed(1)} ms`);
    console.log('');
});

// Resumen
const multicanales = outputDevices.filter(d => d.maxOutputChannels > 2);
if (multicanales.length > 0) {
    console.log('=== RESULTADO: VIABLE ===');
    console.log(`Dispositivos con >2 canales: ${multicanales.map(d => `"${d.name}" (${d.maxOutputChannels}ch)`).join(', ')}`);
    console.log('\nPuedes probar con: npm run test -- --device=ID --channels=N');
} else {
    console.log('=== RESULTADO: SIN MULTICANAL ===');
    console.log('Ningún dispositivo reporta más de 2 canales.');
    console.log('Verifica tu configuración de PipeWire/ALSA.');
}
