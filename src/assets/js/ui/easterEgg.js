/**
 * 🥚 Easter Egg — Fuegos artificiales + melodía 8-bit
 *
 * Módulo autocontenido que lanza un show de fuegos artificiales
 * sincronizado con una melodía chiptune estilo videojuego de los 80.
 * Usa su propio AudioContext para no interferir con el sintetizador.
 *
 * Uso:
 *   import { triggerEasterEgg } from './ui/easterEgg.js';
 *   triggerEasterEgg();
 *
 * @module ui/easterEgg
 */

// ─── Estado ───
let isPlaying = false;
let fireworksInstance = null;
let overlayEl = null;

// ─── Notas MIDI → frecuencia ───
const NOTE_FREQ = {};
for (let i = 0; i < 128; i++) {
  NOTE_FREQ[i] = 440 * Math.pow(2, (i - 69) / 12);
}

// Helpers para notación musical → MIDI
const NOTE_MAP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function n(name, octave) {
  const sharp = name.includes('#') ? 1 : 0;
  return NOTE_MAP[name[0]] + sharp + (octave + 1) * 12;
}

// ─── Melodía chiptune: "Victory Fanfare" estilo 8-bit ───
// Formato: [notaMIDI, inicio(beats), duración(beats)]
const BPM = 160;
const BEAT = 60 / BPM;

// Canal lead (onda cuadrada, melodía principal)
const LEAD = [
  // Intro fanfare — frase ascendente épica
  [n('E', 5), 0, 0.5],
  [n('E', 5), 0.5, 0.5],
  [n('E', 5), 1, 0.5],
  [n('C', 5), 1.5, 0.5],
  [n('E', 5), 2, 1],
  [n('G', 5), 3, 1.5],
  [n('G', 4), 4.5, 1],

  // Segundo motivo — descendente con salto
  [n('C', 5), 6, 0.75],
  [n('G', 4), 6.75, 0.75],
  [n('E', 4), 7.5, 0.75],
  [n('A', 4), 8.5, 0.5],
  [n('B', 4), 9, 0.5],
  [n('A#', 4), 9.5, 0.25],
  [n('A', 4), 9.75, 0.75],

  // Tercer motivo — arpegios rápidos
  [n('G', 4), 10.5, 0.33],
  [n('E', 5), 11, 0.33],
  [n('G', 5), 11.33, 0.33],
  [n('A', 5), 11.66, 0.5],
  [n('F', 5), 12.25, 0.5],
  [n('G', 5), 12.75, 0.25],
  [n('E', 5), 13.25, 0.5],
  [n('C', 5), 13.75, 0.5],
  [n('D', 5), 14.25, 0.5],
  [n('B', 4), 14.75, 0.5],

  // Final épico — acorde largo
  [n('C', 5), 16, 0.5],
  [n('E', 5), 16.5, 0.5],
  [n('G', 5), 17, 0.5],
  [n('C', 6), 17.5, 2],
];

// Canal de bajo (onda triangular)
const BASS = [
  [n('C', 3), 0, 1],
  [n('G', 2), 1, 1],
  [n('C', 3), 2, 1.5],
  [n('G', 2), 3.5, 1],
  [n('E', 2), 4.5, 1.5],

  [n('C', 3), 6, 0.75],
  [n('G', 2), 6.75, 0.75],
  [n('C', 3), 7.5, 1],
  [n('F', 2), 8.5, 1],
  [n('G', 2), 9.5, 1],

  [n('C', 3), 10.5, 0.5],
  [n('E', 3), 11, 0.5],
  [n('C', 3), 11.5, 0.5],
  [n('A', 2), 12, 0.5],
  [n('F', 2), 12.5, 0.5],
  [n('G', 2), 13, 0.5],
  [n('C', 3), 13.5, 0.5],
  [n('G', 2), 14, 0.75],
  [n('G', 2), 14.75, 0.75],

  [n('C', 3), 16, 0.5],
  [n('E', 3), 16.5, 0.5],
  [n('G', 3), 17, 0.5],
  [n('C', 3), 17.5, 2],
];

// Canal de arpegio/acompañamiento (pulso 12.5%)
const ARPEGGIO = [
  // Acordes arpegiados rápidos
  [n('C', 4), 0, 0.25],   [n('E', 4), 0.25, 0.25],  [n('G', 4), 0.5, 0.25],
  [n('C', 4), 1, 0.25],   [n('E', 4), 1.25, 0.25],  [n('G', 4), 1.5, 0.25],
  [n('C', 4), 2, 0.25],   [n('E', 4), 2.25, 0.25],  [n('G', 4), 2.5, 0.25],
  [n('C', 4), 3, 0.25],   [n('E', 4), 3.25, 0.25],  [n('G', 4), 3.5, 0.25],
  [n('C', 4), 4, 0.25],   [n('E', 4), 4.25, 0.25],
  [n('G', 3), 4.5, 0.25], [n('B', 3), 4.75, 0.25],  [n('D', 4), 5, 0.25],

  [n('C', 4), 6, 0.25],   [n('E', 4), 6.25, 0.25],  [n('G', 4), 6.5, 0.25],
  [n('C', 4), 7, 0.25],   [n('E', 4), 7.25, 0.25],  [n('G', 4), 7.5, 0.25],
  [n('F', 4), 8, 0.25],   [n('A', 4), 8.25, 0.25],  [n('C', 5), 8.5, 0.25],
  [n('G', 4), 9, 0.25],   [n('B', 4), 9.25, 0.25],  [n('D', 5), 9.5, 0.25],

  [n('C', 4), 10, 0.25],  [n('E', 4), 10.25, 0.25], [n('G', 4), 10.5, 0.25],
  [n('C', 4), 11, 0.25],  [n('E', 4), 11.25, 0.25], [n('G', 4), 11.5, 0.25],
  [n('F', 4), 12, 0.25],  [n('A', 4), 12.25, 0.25], [n('C', 5), 12.5, 0.25],
  [n('G', 4), 13, 0.25],  [n('B', 4), 13.25, 0.25], [n('D', 5), 13.5, 0.25],
  [n('G', 4), 14, 0.25],  [n('B', 4), 14.25, 0.25], [n('D', 5), 14.5, 0.25],
  [n('G', 4), 15, 0.25],  [n('B', 4), 15.25, 0.25], [n('D', 5), 15.5, 0.25],
];

// Canal percusión (ruido)
// Formato: [tipo('kick'|'snare'|'hat'), inicio(beats), duración(beats)]
const DRUMS = [
  ['kick', 0, 0.25],
  ['hat', 0.5, 0.1],
  ['kick', 1, 0.25],
  ['hat', 1.5, 0.1],
  ['snare', 2, 0.2],
  ['hat', 2.5, 0.1],
  ['kick', 3, 0.25],
  ['hat', 3.5, 0.1],
  ['snare', 4, 0.2],
  ['hat', 4.5, 0.1],
  ['kick', 5, 0.25],
  ['hat', 5.5, 0.1],

  ['kick', 6, 0.25],
  ['hat', 6.5, 0.1],
  ['kick', 7, 0.25],
  ['hat', 7.5, 0.1],
  ['snare', 8, 0.2],
  ['hat', 8.5, 0.1],
  ['kick', 9, 0.25],
  ['hat', 9.5, 0.1],
  ['snare', 10, 0.2],
  ['hat', 10.5, 0.1],

  ['kick', 11, 0.25],
  ['hat', 11.5, 0.1],
  ['kick', 12, 0.25],
  ['hat', 12.5, 0.1],
  ['snare', 13, 0.2],
  ['hat', 13.5, 0.1],
  ['kick', 14, 0.25],
  ['snare', 14.5, 0.2],
  ['kick', 15, 0.25],
  ['snare', 15.5, 0.2],

  // Final — redoble
  ['kick', 16, 0.15],
  ['snare', 16.2, 0.15],
  ['kick', 16.4, 0.15],
  ['snare', 16.6, 0.15],
  ['kick', 16.8, 0.15],
  ['snare', 17, 0.15],
  ['kick', 17.3, 0.5],
];


// ─── Síntesis 8-bit ───

/**
 * Crea un oscilador con onda cuadrada 8-bit y envolvente tipo NES.
 */
function playSquareNote(ctx, dest, freq, startTime, duration, volume = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Onda cuadrada pura (duty cycle 50%) — sonido NES clásico
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);

  // Envolvente tipo chip: attack instantáneo, sustain, release rápido
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.setValueAtTime(volume, startTime + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, startTime + duration * 0.95);

  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
  return osc;
}

/**
 * Crea un oscilador con onda triangular (bajo tipo NES).
 */
function playTriangleNote(ctx, dest, freq, startTime, duration, volume = 0.18) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.setValueAtTime(volume, startTime + duration * 0.8);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
  return osc;
}

/**
 * Crea un pulso 12.5% (arpegio estilo NES) usando osciladores armónicos.
 */
function playPulseNote(ctx, dest, freq, startTime, duration, volume = 0.06) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Usar onda cuadrada con un toque de detuning para efecto de chorus 8-bit
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
  gain.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0, startTime + duration * 0.9);

  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
  return osc;
}

/**
 * Sintetiza percusión con ruido filtrado (canal de ruido del NES).
 */
function playDrum(ctx, dest, type, startTime, duration) {
  const bufferSize = ctx.sampleRate * Math.max(duration, 0.15);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  if (type === 'kick') {
    // Kick: ruido grave + tono descendente
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, startTime);
    filter.frequency.exponentialRampToValueAtTime(60, startTime + 0.1);
    gain.gain.setValueAtTime(0.35, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

    // Componente tonal del kick
    const kickOsc = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(150, startTime);
    kickOsc.frequency.exponentialRampToValueAtTime(30, startTime + 0.12);
    kickGain.gain.setValueAtTime(0.4, startTime);
    kickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
    kickOsc.connect(kickGain).connect(dest);
    kickOsc.start(startTime);
    kickOsc.stop(startTime + 0.15);
  } else if (type === 'snare') {
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, startTime);
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
  } else {
    // Hi-hat
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, startTime);
    gain.gain.setValueAtTime(0.08, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
  }

  noise.connect(filter).connect(gain).connect(dest);
  noise.start(startTime);
  noise.stop(startTime + Math.max(duration, 0.2));
}


// ─── Efectos visuales (fireworks) ───

/**
 * Crea el overlay fullscreen para los fuegos artificiales.
 */
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'easter-egg-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'z-index: 9999',
    'background: rgba(0, 0, 0, 0.85)',
    'cursor: pointer',
    'opacity: 0',
    'transition: opacity 0.6s ease-in',
    'pointer-events: auto',
  ].join(';');

  // Texto de cierre
  const hint = document.createElement('div');
  hint.textContent = '🎮 click para cerrar';
  hint.style.cssText = [
    'position: absolute',
    'bottom: 20px',
    'left: 50%',
    'transform: translateX(-50%)',
    'color: rgba(255,255,255,0.5)',
    'font-family: monospace',
    'font-size: 14px',
    'z-index: 10000',
    'pointer-events: none',
  ].join(';');
  overlay.appendChild(hint);

  document.body.appendChild(overlay);

  // Fade in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

  return overlay;
}

/**
 * Inicializa los fuegos artificiales en el overlay.
 */
function startFireworks(container) {
  // fireworks-js se carga como UMD global
  const Fireworks = window.Fireworks?.default || window.Fireworks;
  if (!Fireworks) {
    console.warn('[EasterEgg] fireworks-js no disponible');
    return null;
  }

  const fw = new Fireworks(container, {
    autoresize: true,
    opacity: 0.5,
    acceleration: 1.05,
    friction: 0.97,
    gravity: 1.5,
    particles: 80,
    traceLength: 3,
    traceSpeed: 10,
    explosion: 6,
    intensity: 25,
    flickering: 50,
    lineStyle: 'round',
    hue: { min: 0, max: 360 },
    delay: { min: 15, max: 30 },
    rocketsPoint: { min: 20, max: 80 },
    lineWidth: {
      explosion: { min: 1, max: 3 },
      trace: { min: 1, max: 2 },
    },
    brightness: { min: 50, max: 80 },
    decay: { min: 0.015, max: 0.03 },
    mouse: { click: false, move: false, max: 1 },
  });

  fw.start();
  return fw;
}


// ─── Orquestación ───

/**
 * Detiene y limpia todo el Easter egg.
 */
function cleanup(audioCtx) {
  isPlaying = false;

  // Parar fireworks
  if (fireworksInstance) {
    try { fireworksInstance.stop(true); } catch (_) { /* ignore */ }
    fireworksInstance = null;
  }

  // Cerrar AudioContext propio
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }

  // Fade out y eliminar overlay
  if (overlayEl) {
    overlayEl.style.opacity = '0';
    const el = overlayEl;
    overlayEl = null;
    setTimeout(() => {
      el.remove();
    }, 600);
  }
}

/**
 * Programa ráfagas extras de fireworks sincronizadas con la melodía.
 * Lanza ráfagas en momentos clave (notas importantes del lead).
 */
function scheduleFireworkBursts(startTime) {
  // Beats donde ocurren notas importantes del lead
  const burstBeats = [0, 2, 3, 6, 8.5, 11.66, 16, 17.5];

  for (const beat of burstBeats) {
    const delay = beat * BEAT * 1000; // ms
    setTimeout(() => {
      if (!isPlaying || !fireworksInstance) return;
      // Lanzar ráfaga manual de cohetes extra
      try {
        fireworksInstance.launch(3 + Math.floor(Math.random() * 4));
      } catch (_) { /* algunos métodos pueden no existir */ }
    }, delay);
  }
}


// ─── API pública ───

/**
 * Carga el script de fireworks-js si no está cargado.
 * @returns {Promise<void>}
 */
function ensureFireworksLoaded() {
  return new Promise((resolve, reject) => {
    if (window.Fireworks) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    // Ruta relativa desde index.html
    script.src = './assets/js/vendor/fireworks.umd.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar fireworks-js'));
    document.head.appendChild(script);
  });
}

/**
 * 🥚 Lanza el Easter Egg: fuegos artificiales + melodía 8-bit.
 * Se puede llamar desde cualquier parte de la app.
 * Click en el overlay para cerrar antes de tiempo.
 */
export async function triggerEasterEgg() {
  if (isPlaying) return;
  isPlaying = true;

  try {
    // 1. Cargar fireworks-js dinámicamente
    await ensureFireworksLoaded();

    // 2. Crear AudioContext propio (no interferimos con el Synthi)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    // Master gain + compresor para que suene bien sin clipear
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12, ctx.currentTime);
    compressor.knee.setValueAtTime(10, ctx.currentTime);
    compressor.ratio.setValueAtTime(6, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.15, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.7, ctx.currentTime);
    compressor.connect(masterGain).connect(ctx.destination);

    // 3. Crear overlay visual
    overlayEl = createOverlay();

    // Click para cerrar
    overlayEl.addEventListener('click', () => cleanup(ctx), { once: true });

    // 4. Iniciar fuegos artificiales
    fireworksInstance = startFireworks(overlayEl);

    // 5. Programar la melodía
    const t0 = ctx.currentTime + 0.1;

    // Lead (onda cuadrada)
    for (const [midi, beat, dur] of LEAD) {
      playSquareNote(ctx, compressor, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
    }

    // Bajo (onda triangular)
    for (const [midi, beat, dur] of BASS) {
      playTriangleNote(ctx, compressor, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
    }

    // Arpegios (pulso)
    for (const [midi, beat, dur] of ARPEGGIO) {
      playPulseNote(ctx, compressor, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
    }

    // Percusión
    for (const [type, beat, dur] of DRUMS) {
      playDrum(ctx, compressor, type, t0 + beat * BEAT, dur * BEAT);
    }

    // 6. Programar ráfagas de fuegos sincronizadas
    scheduleFireworkBursts(t0);

    // 7. Fade out del master al final
    const totalBeats = 19.5;
    const endTime = t0 + totalBeats * BEAT;
    masterGain.gain.setValueAtTime(0.7, endTime - 1);
    masterGain.gain.linearRampToValueAtTime(0, endTime);

    // 8. Auto-limpieza al terminar la melodía
    const totalDurationMs = (totalBeats * BEAT + 1.5) * 1000;
    setTimeout(() => {
      if (isPlaying) cleanup(ctx);
    }, totalDurationMs);

  } catch (err) {
    console.error('[EasterEgg] Error:', err);
    isPlaying = false;
  }
}
