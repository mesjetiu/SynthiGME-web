import pa from 'naudiodon';
import { execSync } from 'child_process';

// Asegurar que el sink existe
const sinks = execSync('pactl list short sinks', {encoding:'utf8'});
console.log('Sinks:', sinks);

// Usar dispositivo ALSA pulse que debería ver el sink
const device = pa.getDevices().find(d => d.name === 'pulse' && d.hostAPIName === 'ALSA');
console.log('Dispositivo pulse:', device);

const ao = new pa.AudioIO({
    outOptions: {
        channelCount: 8,
        sampleFormat: pa.SampleFormatFloat32,
        sampleRate: 48000,
        deviceId: device.id
    }
});

ao.start();
console.log('Iniciado en ALSA pulse con 8 canales');

const freqs = [261, 293, 329, 349, 392, 440, 493, 523];
const phases = new Array(8).fill(0);

let count = 0;
setInterval(() => {
    const buf = Buffer.alloc(1024 * 8 * 4);
    for (let s = 0; s < 1024; s++) {
        for (let ch = 0; ch < 8; ch++) {
            buf.writeFloatLE(Math.sin(phases[ch]) * 0.3, (s * 8 + ch) * 4);
            phases[ch] += 2 * Math.PI * freqs[ch] / 48000;
        }
    }
    ao.write(buf);
    if (++count > 200) { ao.quit(); process.exit(0); }
}, 21);
