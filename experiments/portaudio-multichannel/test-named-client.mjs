import pa from 'naudiodon';
import { execSync } from 'child_process';

// Asegurar sink existe
try {
    execSync('pactl load-module module-null-sink sink_name=SynthiGME8ch sink_properties=device.description=SynthiGME rate=48000 channels=8 channel_map=front-left,front-right,rear-left,rear-right,front-center,lfe,side-left,side-right 2>/dev/null');
} catch(e) {}

const device = pa.getDevices().find(d => d.name === 'pulse' && d.hostAPIName === 'ALSA');

const ao = new pa.AudioIO({
    outOptions: {
        channelCount: 8,
        sampleFormat: pa.SampleFormatFloat32,
        sampleRate: 48000,
        deviceId: device.id
    }
});

ao.start();
console.log('Iniciado');

const freqs = [261, 293, 329, 349, 392, 440, 493, 523];
const phases = new Array(8).fill(0);

setInterval(() => {
    const buf = Buffer.alloc(1024 * 8 * 4);
    for (let s = 0; s < 1024; s++) {
        for (let ch = 0; ch < 8; ch++) {
            buf.writeFloatLE(Math.sin(phases[ch]) * 0.3, (s * 8 + ch) * 4);
            phases[ch] += 2 * Math.PI * freqs[ch] / 48000;
        }
    }
    ao.write(buf);
}, 21);
