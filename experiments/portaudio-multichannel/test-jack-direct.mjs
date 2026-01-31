import pa from 'naudiodon';

// Buscar dispositivo JACK estéreo (el único disponible sin sink)
const device = pa.getDevices().find(d => 
    d.hostAPIName === 'JACK Audio Connection Kit' && d.maxOutputChannels >= 2
);

if (!device) {
    console.log('No hay dispositivo JACK');
    process.exit(1);
}

console.log('Usando:', device.name, '- ID:', device.id, '-', device.maxOutputChannels, 'ch');
console.log('Nota: JACK nativo solo tiene 2 canales, pero PortAudio puede crear más puertos');

// Intentar abrir con 8 canales aunque el dispositivo diga 2
const ao = new pa.AudioIO({
    outOptions: {
        channelCount: 8,  // Intentar 8 aunque JACK diga 2
        sampleFormat: pa.SampleFormatFloat32,
        sampleRate: 48000,
        deviceId: device.id
    }
});

ao.start();
console.log('Iniciado con 8 canales');

const freqs = [261, 293, 329, 349, 392, 440, 493, 523];
const phases = new Array(8).fill(0);

let count = 0;
setInterval(() => {
    const buf = Buffer.alloc(1024 * 8 * 4);
    for (let s = 0; s < 1024; s++) {
        for (let ch = 0; ch < 8; ch++) {
            buf.writeFloatLE(Math.sin(phases[ch]) * 0.2, (s * 8 + ch) * 4);
            phases[ch] += 2 * Math.PI * freqs[ch] / 48000;
        }
    }
    ao.write(buf);
    if (++count > 200) { ao.quit(); process.exit(0); }
}, 21);
