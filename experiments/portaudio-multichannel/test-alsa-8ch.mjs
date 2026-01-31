import pa from 'naudiodon';

// Usar dispositivo ALSA pipewire directamente (sin crear sink)
const device = pa.getDevices().find(d => d.name === 'pipewire' && d.hostAPIName === 'ALSA');
console.log('Usando:', device.name, '- ID:', device.id, '-', device.maxOutputChannels, 'ch via ALSA');

const ao = new pa.AudioIO({
    outOptions: {
        channelCount: 8,
        sampleFormat: pa.SampleFormatFloat32,
        sampleRate: 48000,
        deviceId: device.id
    }
});

ao.start();
console.log('Reproduciendo 8 tonos por 10 segundos...');
console.log('Mira pw-link -o para ver los puertos');

const freqs = [261, 293, 329, 349, 392, 440, 493, 523];
const phases = new Array(8).fill(0);

let count = 0;
setInterval(() => {
    const buf = Buffer.alloc(1024 * 8 * 4);
    for (let s = 0; s < 1024; s++) {
        for (let ch = 0; ch < 8; ch++) {
            const val = Math.sin(phases[ch]) * 0.2;
            phases[ch] += 2 * Math.PI * freqs[ch] / 48000;
            buf.writeFloatLE(val, (s * 8 + ch) * 4);
        }
    }
    ao.write(buf);
    if (++count > 460) {
        ao.quit();
        process.exit(0);
    }
}, 21);
