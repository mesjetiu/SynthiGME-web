/**
 * 🥚 Easter Egg — Desintegración visual + pieza musical
 *
 * Módulo autocontenido que lanza una animación de «desintegración»
 * del Synthi sincronizada con una pieza musical generada por síntesis.
 * Los elementos de la interfaz (knobs, sliders, módulos, pines) se
 * convierten en siluetas geométricas que flotan, giran, se dispersan
 * y se disuelven sobre un fondo oscuro con gradientes de color cambiante.
 * Usa su propio AudioContext para no interferir con el sintetizador.
 *
 * Piezas disponibles:
 *  - 'electroacoustic' (por defecto): Estudio electroacústico evocando
 *    la música electrónica de los años 50–70 (Stockhausen, Xenakis, Varèse).
 *  - 'chiptune': Melodía 8-bit estilo videojuego retro (NES).
 *
 * Trigger: tocar alternadamente pad1, pad2, pad1, pad2 × 4 (8 taps).
 *
 * Seguridad: si el sintetizador tiene algún parámetro modificado
 * respecto a su estado inicial (isDirty), solo se muestra la animación
 * visual sin sonido, para no interferir con el trabajo del usuario.
 *
 * @module ui/easterEgg
 */

// ─── Estado ───
let isPlaying = false;
let backdropEl = null;
let overlayEl = null;
let activeAnimations = [];

// ─── Pieza seleccionada ───
const PIECES = {};       // se llena más abajo
let selectedPiece = 'electroacoustic';


// ═══════════════════════════════════════════════════════════════════════════
//  PIEZA 1: Melodía chiptune 8-bit (Victory Fanfare)
// ═══════════════════════════════════════════════════════════════════════════

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

// ─── Datos de la melodía chiptune ───
const BPM = 160;
const BEAT = 60 / BPM;

const LEAD = [
  [n('E', 5), 0, 0.5],
  [n('E', 5), 0.5, 0.5],
  [n('E', 5), 1, 0.5],
  [n('C', 5), 1.5, 0.5],
  [n('E', 5), 2, 1],
  [n('G', 5), 3, 1.5],
  [n('G', 4), 4.5, 1],
  [n('C', 5), 6, 0.75],
  [n('G', 4), 6.75, 0.75],
  [n('E', 4), 7.5, 0.75],
  [n('A', 4), 8.5, 0.5],
  [n('B', 4), 9, 0.5],
  [n('A#', 4), 9.5, 0.25],
  [n('A', 4), 9.75, 0.75],
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
  [n('C', 5), 16, 0.5],
  [n('E', 5), 16.5, 0.5],
  [n('G', 5), 17, 0.5],
  [n('C', 6), 17.5, 2],
];

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

const ARPEGGIO = [
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

const DRUMS = [
  ['kick', 0, 0.25],    ['hat', 0.5, 0.1],
  ['kick', 1, 0.25],    ['hat', 1.5, 0.1],
  ['snare', 2, 0.2],    ['hat', 2.5, 0.1],
  ['kick', 3, 0.25],    ['hat', 3.5, 0.1],
  ['snare', 4, 0.2],    ['hat', 4.5, 0.1],
  ['kick', 5, 0.25],    ['hat', 5.5, 0.1],
  ['kick', 6, 0.25],    ['hat', 6.5, 0.1],
  ['kick', 7, 0.25],    ['hat', 7.5, 0.1],
  ['snare', 8, 0.2],    ['hat', 8.5, 0.1],
  ['kick', 9, 0.25],    ['hat', 9.5, 0.1],
  ['snare', 10, 0.2],   ['hat', 10.5, 0.1],
  ['kick', 11, 0.25],   ['hat', 11.5, 0.1],
  ['kick', 12, 0.25],   ['hat', 12.5, 0.1],
  ['snare', 13, 0.2],   ['hat', 13.5, 0.1],
  ['kick', 14, 0.25],   ['snare', 14.5, 0.2],
  ['kick', 15, 0.25],   ['snare', 15.5, 0.2],
  ['kick', 16, 0.15],   ['snare', 16.2, 0.15],
  ['kick', 16.4, 0.15], ['snare', 16.6, 0.15],
  ['kick', 16.8, 0.15], ['snare', 17, 0.15],
  ['kick', 17.3, 0.5],
];

// ─── Síntesis chiptune ───

function playSquareNote(ctx, dest, freq, startTime, duration, volume = 0.12) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.setValueAtTime(volume, startTime + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, startTime + duration * 0.95);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

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
}

function playPulseNote(ctx, dest, freq, startTime, duration, volume = 0.06) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
  gain.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0, startTime + duration * 0.9);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playChipDrum(ctx, dest, type, startTime, duration) {
  const bufferSize = ctx.sampleRate * Math.max(duration, 0.15);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  if (type === 'kick') {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, startTime);
    filter.frequency.exponentialRampToValueAtTime(60, startTime + 0.1);
    gain.gain.setValueAtTime(0.35, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
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
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, startTime);
    gain.gain.setValueAtTime(0.08, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);
  }

  noise.connect(filter).connect(gain).connect(dest);
  noise.start(startTime);
  noise.stop(startTime + Math.max(duration, 0.2));
}

/**
 * Programa y ejecuta la pieza chiptune 8-bit.
 * @returns {{ totalDurationSec: number, burstTimes: number[] }}
 */
function playChiptunePiece(ctx, dest) {
  const t0 = ctx.currentTime + 0.1;

  for (const [midi, beat, dur] of LEAD) {
    playSquareNote(ctx, dest, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
  }
  for (const [midi, beat, dur] of BASS) {
    playTriangleNote(ctx, dest, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
  }
  for (const [midi, beat, dur] of ARPEGGIO) {
    playPulseNote(ctx, dest, NOTE_FREQ[midi], t0 + beat * BEAT, dur * BEAT);
  }
  for (const [type, beat, dur] of DRUMS) {
    playChipDrum(ctx, dest, type, t0 + beat * BEAT, dur * BEAT);
  }

  return {
    totalDurationSec: 19.5 * BEAT + 1.5,
    burstTimes: [0, 2, 3, 6, 8.5, 11.66, 16, 17.5].map(b => b * BEAT),
  };
}

PIECES.chiptune = playChiptunePiece;


// ═══════════════════════════════════════════════════════════════════════════
//  PIEZA 2: Estudio electroacústico (Studie)
//  Evocación de la música electrónica de estudio (1953–1970):
//  Stockhausen (Studie I/II, Kontakte), Xenakis, Varèse
// ═══════════════════════════════════════════════════════════════════════════

// ─── Síntesis electroacústica ───

/**
 * Tono sinusoidal sostenido con fade in/out configurable.
 */
function playSineTone(ctx, dest, freq, startTime, duration, volume,
  { fadeIn = 0.01, fadeOut = 0.05 } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(fadeIn, duration * 0.4));
  const sustainEnd = startTime + duration - Math.min(fadeOut, duration * 0.4);
  gain.gain.setValueAtTime(volume, sustainEnd);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Ping sinusoidal corto con envolvente percusiva (ataque instantáneo, decay exponencial).
 */
function playSinePing(ctx, dest, freq, startTime, duration, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(duration, 0.01));
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Glissando sinusoidal (barrido continuo de frecuencia).
 */
function playSineGliss(ctx, dest, freqStart, freqEnd, startTime, duration, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(Math.max(freqStart, 1), startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), startTime + duration);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
  gain.gain.setValueAtTime(volume, startTime + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Ráfaga de ruido blanco con filtro pasa-banda y barrido de frecuencia central.
 */
function playFilteredNoise(ctx, dest, freqStart, freqEnd, Q, startTime, duration, volume) {
  const bufferSize = Math.ceil(ctx.sampleRate * (duration + 0.1));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(Q, startTime);
  filter.frequency.setValueAtTime(Math.max(freqStart, 1), startTime);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), startTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.setValueAtTime(volume * 0.8, startTime + duration * 0.6);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  noise.connect(filter).connect(gain).connect(dest);
  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

/**
 * Textura FM: oscilador portador modulado en frecuencia por un segundo oscilador.
 * El índice de modulación y la frecuencia del modulador barren suavemente.
 */
function playFMTexture(ctx, dest, carrierFreq, modFreqStart, modFreqEnd,
  modIdxStart, modIdxEnd, startTime, duration, volume) {
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const outGain = ctx.createGain();

  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(carrierFreq, startTime);
  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(Math.max(modFreqStart, 0.1), startTime);
  modulator.frequency.exponentialRampToValueAtTime(
    Math.max(modFreqEnd, 0.1), startTime + duration);

  modGain.gain.setValueAtTime(modIdxStart * modFreqStart, startTime);
  modGain.gain.linearRampToValueAtTime(modIdxEnd * modFreqEnd, startTime + duration);

  outGain.gain.setValueAtTime(0, startTime);
  outGain.gain.linearRampToValueAtTime(volume, startTime + 0.1);
  outGain.gain.setValueAtTime(volume, startTime + duration * 0.7);
  outGain.gain.linearRampToValueAtTime(0, startTime + duration);

  modulator.connect(modGain).connect(carrier.frequency);
  carrier.connect(outGain).connect(dest);
  carrier.start(startTime);
  modulator.start(startTime);
  carrier.stop(startTime + duration + 0.02);
  modulator.stop(startTime + duration + 0.02);
}

/**
 * Programa y ejecuta la pieza electroacústica «Studie II» — versión extendida.
 *
 * Estructura en 6 secciones (~35s):
 *   I.    Klang     (0–6s)   — Emergencia de drones con batimiento
 *   II.   Punkte    (5–10s)  — Puntillismo: pings en accelerando
 *   III.  Gruppen   (9–16s)  — Gestos: glissandi, ruido, FM
 *   IV.   Eruption  (15–23s) — Clímax: texturas FM masivas, caos
 *   V.    Resonanz  (22–29s) — Ecos resonantes, pings invertidos
 *   VI.   Stille    (28–35s) — Disolución lenta, silencio
 *
 * @returns {{ totalDurationSec: number, burstTimes: number[] }}
 */
function playElectroacousticPiece(ctx, dest) {
  const t0 = ctx.currentTime + 0.1;

  // ─── I. Klang (0–6s): Emergencia ───
  // Dron profundo con batimiento lento (~1.5 Hz)
  playSineTone(ctx, dest, 55, t0, 7, 0.14, { fadeIn: 3.5, fadeOut: 2 });
  playSineTone(ctx, dest, 56.5, t0 + 0.3, 6.5, 0.11, { fadeIn: 3, fadeOut: 1.5 });
  // Quinta justa
  playSineTone(ctx, dest, 82.5, t0 + 1, 5, 0.09, { fadeIn: 1.5, fadeOut: 1 });
  // Octava aparece
  playSineTone(ctx, dest, 110, t0 + 2.5, 4, 0.07, { fadeIn: 0.5, fadeOut: 1.5 });
  // Parciales superiores
  playSineTone(ctx, dest, 165, t0 + 3.2, 3.5, 0.04, { fadeIn: 0.3, fadeOut: 1.2 });
  playSineTone(ctx, dest, 220, t0 + 4, 3, 0.035, { fadeIn: 0.2, fadeOut: 1 });
  // Sub-bajo pulsante
  playSineTone(ctx, dest, 27.5, t0 + 0.5, 5.5, 0.10, { fadeIn: 2, fadeOut: 2 });

  // ─── II. Punkte (5–10s): Puntillismo ───
  const pings = [
    [880,  5.0, 0.22, 0.08],   [1320, 5.4, 0.10, 0.06],
    [440,  5.9, 0.30, 0.09],   [2200, 6.2, 0.05, 0.05],
    [550,  6.4, 0.18, 0.07],   [1760, 6.7, 0.08, 0.04],
    [330,  6.85, 0.35, 0.08],  [3300, 7.0, 0.03, 0.03],
    [660,  7.15, 0.12, 0.07],  [1100, 7.28, 0.07, 0.05],
    [2640, 7.38, 0.04, 0.04],  [440,  7.48, 0.20, 0.06],
    [1650, 7.56, 0.05, 0.04],  [880,  7.62, 0.08, 0.05],
    [3960, 7.68, 0.02, 0.03],  [220,  7.74, 0.25, 0.07],
    [1320, 7.80, 0.03, 0.04],  [550,  7.85, 0.04, 0.05],
    [2200, 7.90, 0.025, 0.03], [770,  7.94, 0.03, 0.04],
    // Accelerando: nube densa
    [1100, 7.97, 0.02, 0.03],  [3300, 8.0, 0.015, 0.02],
    [440,  8.02, 0.015, 0.04], [1760, 8.04, 0.01, 0.03],
    [660,  8.06, 0.01, 0.03],  [2200, 8.08, 0.01, 0.02],
    [880,  8.10, 0.01, 0.03],  [330,  8.12, 0.015, 0.04],
    [1650, 8.14, 0.01, 0.02],  [550,  8.16, 0.01, 0.03],
    // Rebote — pings que se expanden de nuevo
    [2200, 8.5, 0.08, 0.05],   [440,  8.7, 0.15, 0.06],
    [1320, 9.0, 0.10, 0.04],   [660,  9.3, 0.18, 0.05],
    [3300, 9.5, 0.05, 0.03],   [880,  9.7, 0.12, 0.04],
  ];
  for (const [freq, time, dur, vol] of pings) {
    playSinePing(ctx, dest, freq, t0 + time, dur, vol);
  }

  // ─── III. Gruppen (9–16s): Gestos y texturas ───
  playSineGliss(ctx, dest, 80, 3500, t0 + 9, 4, 0.10);
  playFilteredNoise(ctx, dest, 400, 6000, 8, t0 + 9.5, 3.5, 0.07);
  playSineGliss(ctx, dest, 4000, 120, t0 + 11, 3, 0.08);
  playFMTexture(ctx, dest, 220, 1, 80, 0.5, 12, t0 + 12, 3, 0.07);
  // Glissandi cruzados
  playSineGliss(ctx, dest, 200, 5000, t0 + 13, 2.5, 0.06);
  playSineGliss(ctx, dest, 6000, 100, t0 + 13.5, 2.5, 0.06);
  playFilteredNoise(ctx, dest, 200, 8000, 1.5, t0 + 15, 0.1, 0.14);

  // ─── IV. Eruption (15–23s): Clímax ───
  // FM masiva — carrier grave, modulador en barrido amplio
  playFMTexture(ctx, dest, 110, 2, 200, 1, 20, t0 + 15.5, 4, 0.09);
  playFMTexture(ctx, dest, 330, 5, 150, 2, 15, t0 + 16, 3.5, 0.07);
  // Glissandi extremos simultáneos
  playSineGliss(ctx, dest, 30, 8000, t0 + 16, 3, 0.08);
  playSineGliss(ctx, dest, 10000, 40, t0 + 16.5, 3.5, 0.07);
  // Ráfaga de ruido (explosión)
  playFilteredNoise(ctx, dest, 100, 12000, 1, t0 + 17, 0.15, 0.18);
  // Textura FM aguda — metálica
  playFMTexture(ctx, dest, 880, 10, 500, 3, 25, t0 + 18, 3, 0.06);
  // Drones disonantes
  playSineTone(ctx, dest, 233, t0 + 18, 4, 0.06, { fadeIn: 0.5, fadeOut: 2 });
  playSineTone(ctx, dest, 247, t0 + 18.5, 3.5, 0.05, { fadeIn: 0.3, fadeOut: 2 });
  // Puntillismo caótico rápido
  const chaosFreqs = [3520, 1760, 440, 7040, 880, 2640, 5280, 330, 1320, 660];
  for (let i = 0; i < 20; i++) {
    const t = 19.5 + i * 0.12;
    const f = chaosFreqs[i % chaosFreqs.length] * (0.8 + Math.random() * 0.4);
    playSinePing(ctx, dest, f, t0 + t, 0.02 + Math.random() * 0.06, 0.03 + Math.random() * 0.04);
  }
  // Ruido de banda ancha descendente
  playFilteredNoise(ctx, dest, 8000, 200, 3, t0 + 20, 2.5, 0.08);
  // Último golpe FM
  playFMTexture(ctx, dest, 55, 1, 300, 5, 30, t0 + 21.5, 1.5, 0.10);

  // ─── V. Resonanz (22–29s): Ecos resonantes ───
  // Pings largos con mucha reverberación (duraciones largas)
  const resonantPings = [
    [220,  22.5, 1.5, 0.07],  [440,  23.0, 1.2, 0.05],
    [330,  24.0, 1.8, 0.06],  [660,  24.5, 0.8, 0.04],
    [165,  25.5, 2.0, 0.06],  [550,  26.0, 1.0, 0.04],
    [880,  26.5, 0.6, 0.03],  [110,  27.0, 2.5, 0.07],
    [1320, 27.5, 0.4, 0.03],  [275,  28.0, 1.5, 0.05],
  ];
  for (const [freq, time, dur, vol] of resonantPings) {
    playSineTone(ctx, dest, freq, t0 + time, dur, vol, { fadeIn: 0.02, fadeOut: dur * 0.8 });
  }
  // Glissando lento descendente como eco
  playSineGliss(ctx, dest, 2000, 200, t0 + 23, 5, 0.05);
  // FM suave, fantasmal
  playFMTexture(ctx, dest, 110, 0.5, 10, 0.2, 3, t0 + 24, 4, 0.04);
  // Ruido filtrado resonante
  playFilteredNoise(ctx, dest, 800, 300, 20, t0 + 25, 3, 0.03);

  // ─── VI. Stille (28–35s): Disolución ───
  // Armónicos agudos con batimiento
  playSineTone(ctx, dest, 4400, t0 + 28, 4, 0.03, { fadeIn: 1, fadeOut: 3 });
  playSineTone(ctx, dest, 4000, t0 + 28.5, 3.5, 0.025, { fadeIn: 0.5, fadeOut: 3 });
  // Glissando descendente final
  playSineGliss(ctx, dest, 1200, 40, t0 + 29, 4.5, 0.08);
  // Dron grave final
  playSineTone(ctx, dest, 55, t0 + 30, 5, 0.07, { fadeIn: 0.3, fadeOut: 4.5 });
  playSineTone(ctx, dest, 110, t0 + 30.5, 4.5, 0.05, { fadeIn: 0.2, fadeOut: 4 });
  // Susurro de ruido residual
  playFilteredNoise(ctx, dest, 2000, 300, 5, t0 + 32, 2.5, 0.02);
  // Último ping lejano
  playSinePing(ctx, dest, 3520, t0 + 34, 0.5, 0.02);

  return {
    totalDurationSec: 35,
    burstTimes: [0, 3, 5.5, 8, 9.5, 13, 15, 17, 19, 21.5, 24, 27, 29, 32],
  };
}

PIECES.electroacoustic = playElectroacousticPiece;


// ═══════════════════════════════════════════════════════════════════════════
//  EFECTOS VISUALES — Desintegración del Synthi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Paleta de colores para los fantasmas (sombrío pero colorido).
 * Cada entrada es [R, G, B].
 */
const PALETTE = [
  [130, 50, 200],   // violeta profundo
  [50, 130, 220],   // azul eléctrico
  [35, 175, 150],   // teal oscuro
  [200, 50, 90],    // magenta profundo
  [200, 145, 30],   // ámbar
  [70, 195, 120],   // esmeralda
  [170, 80, 200],   // lavanda
  [220, 70, 50],    // bermellón
];

/**
 * Selectores CSS de elementos del Synthi y su forma geométrica.
 * max: máximo de elementos a animar por selector.
 */
const GHOST_CONFIG = [
  { sel: '.panel',                        shape: 'rect',   max: 7   },  // los 7 paneles principales
  { sel: '.synth-module',                 shape: 'rect',   max: 15  },  // módulos dentro de paneles
  { sel: '.synth-module__header',         shape: 'rect',   max: 12  },  // frames
  { sel: '.synth-module__content',        shape: 'rect',   max: 7   },  // cuerpos de módulo
  { sel: '.knob',                         shape: 'circle', max: 30  },  // knobs
  { sel: '.output-channel__slider-shell', shape: 'vrect',  max: 12  },  // sliders
  { sel: '.panel7-joystick-pad',          shape: 'circle', max: 4   },  // pads
  { sel: '.panel7-seq-button',            shape: 'dot',    max: 8   },  // botones seq
];

/**
 * Crea un elemento «fantasma» — silueta geométrica con glow —
 * en la posición de un elemento real del Synthi, dentro del overlay.
 */
function createGhostEl(rect, shape, colorIdx) {
  const el = document.createElement('div');
  const [r, g, b] = PALETTE[colorIdx % PALETTE.length];
  const glow = Math.max(rect.width, rect.height) * 0.5;

  el.style.cssText = [
    'position: fixed',
    `left: ${rect.left}px`,
    `top: ${rect.top}px`,
    `width: ${Math.max(rect.width, 4)}px`,
    `height: ${Math.max(rect.height, 4)}px`,
    `background: rgba(${r},${g},${b},0.6)`,
    `border: 1px solid rgba(${r},${g},${b},0.8)`,
    `border-radius: ${shape === 'circle' || shape === 'dot' ? '50%' : '4px'}`,
    `box-shadow: 0 0 ${glow}px rgba(${r},${g},${b},0.35)`,
    'pointer-events: none',
    'will-change: transform, opacity',
  ].join(';');

  return el;
}

/**
 * Recoge elementos visibles del DOM del Synthi y crea fantasmas
 * geométricos dentro del overlay.
 */
function gatherGhosts(container) {
  const ghosts = [];
  let colorIdx = 0;

  for (const { sel, shape, max } of GHOST_CONFIG) {
    let elements = [...document.querySelectorAll(sel)];

    // Solo elementos con tamaño real (visibles)
    elements = elements.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });

    // Limitar cantidad por muestreo aleatorio (Fisher-Yates parcial)
    if (elements.length > max) {
      for (let i = elements.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [elements[i], elements[j]] = [elements[j], elements[i]];
      }
      elements = elements.slice(0, max);
    }

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const ghost = createGhostEl(rect, shape, colorIdx++);
      container.appendChild(ghost);
      ghosts.push(ghost);
    }
  }

  return ghosts;
}

/**
 * Anima los fantasmas: aparecen → tiemblan → se dispersan → explotan →
 * se mezclan y transforman → resuenan → se disuelven.
 *
 * Fases sincronizadas con la pieza electroacústica (~35s):
 *   0-4%   Aparición: fade-in en posición original
 *   4-14%  Tremor: vibración sutil (Klang)
 *  14-26%  Dispersión: los elementos se separan (Punkte)
 *  26-42%  Caos: máximo desplazamiento y rotación (Gruppen)
 *  42-58%  Erupción: explosión, escala extrema, giro salvaje (Eruption)
 *  58-74%  Resonancia: rebotes, pulsaciones (Resonanz)
 *  74-88%  Reagrupamiento: los elementos empiezan a volver (Stille)
 *  88-97%  Retorno: vuelven a su posición original
 *  97-100% Fundido rápido final
 *
 * @param {HTMLElement[]} ghosts
 * @param {number} durationMs
 * @returns {Animation[]}
 */
function animateGhosts(ghosts, durationMs) {
  const animations = [];
  const vw = window.innerWidth || 1200;
  const vh = window.innerHeight || 800;

  for (const ghost of ghosts) {
    const delay = Math.random() * 800;

    // Desplazamiento salvaje — cruza la pantalla
    const tx = (Math.random() - 0.5) * vw * 0.8;
    const ty = (Math.random() - 0.5) * vh * 0.7;
    // Segundo punto de destino (para la erupción)
    const tx2 = (Math.random() - 0.5) * vw * 1.0;
    const ty2 = (Math.random() - 0.5) * vh * 0.9;
    const rot = (Math.random() - 0.5) * 1080;
    const rot2 = rot + (Math.random() - 0.5) * 720;
    const sc = 0.2 + Math.random() * 2.5;
    const sc2 = 0.1 + Math.random() * 3;

    // Micro-jitter para la fase de tremor
    const jx = (Math.random() - 0.5) * 15;
    const jy = (Math.random() - 0.5) * 15;

    const keyframes = [
      // Aparición
      { transform: 'translate(0,0) rotate(0deg) scale(1)',
        opacity: 0, offset: 0 },
      { transform: 'translate(0,0) rotate(0deg) scale(1)',
        opacity: 0.85, offset: 0.04 },
      // Tremor (Klang)
      { transform: `translate(${jx}px,${jy}px) rotate(${rot * 0.03}deg) scale(1.05)`,
        opacity: 0.8, offset: 0.14 },
      // Dispersión (Punkte)
      { transform: `translate(${tx * 0.4}px,${ty * 0.4}px) rotate(${rot * 0.25}deg) scale(${0.6 + sc * 0.3})`,
        opacity: 0.7, offset: 0.26 },
      // Caos (Gruppen)
      { transform: `translate(${tx}px,${ty}px) rotate(${rot}deg) scale(${sc})`,
        opacity: 0.55, offset: 0.42 },
      // Erupción — explosión máxima, escala extrema, giro salvaje
      { transform: `translate(${tx2}px,${ty2}px) rotate(${rot2}deg) scale(${sc2})`,
        opacity: 0.45, offset: 0.58 },
      // Resonancia — rebote, pulsación
      { transform: `translate(${tx * 0.5}px,${ty * -0.4}px) rotate(${rot * 0.6}deg) scale(${sc * 0.8})`,
        opacity: 0.4, offset: 0.74 },
      // Reagrupamiento — los elementos empiezan a volver
      { transform: `translate(${tx * 0.15}px,${ty * 0.1}px) rotate(${rot * 0.08}deg) scale(1.1)`,
        opacity: 0.6, offset: 0.88 },
      // Retorno — vuelven a su lugar original
      { transform: 'translate(0,0) rotate(0deg) scale(1)',
        opacity: 0.85, offset: 0.97 },
      // Desaparición — fundido rápido final
      { transform: 'translate(0,0) rotate(0deg) scale(1)',
        opacity: 0, offset: 1 },
    ];

    try {
      const anim = ghost.animate(keyframes, {
        duration: durationMs - delay,
        delay,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        fill: 'both',
      });
      animations.push(anim);
    } catch (_) { /* JSDOM */ }
  }

  return animations;
}

/**
 * Programa pulsos visuales en el overlay sincronizados con la pieza.
 * Cada pulso es un breve flash de brillo interior.
 * @param {HTMLElement} overlay
 * @param {number[]} burstTimes — tiempos en segundos
 */
function scheduleVisualPulses(overlay, burstTimes) {
  for (let i = 0; i < burstTimes.length; i++) {
    const t = burstTimes[i];
    // Intensidad creciente hacia el clímax (mitad de la pieza)
    const progress = i / burstTimes.length;
    const intensity = progress < 0.5
      ? 0.08 + progress * 0.3
      : 0.23 - (progress - 0.5) * 0.3;
    const spread = 150 + intensity * 600;
    setTimeout(() => {
      if (!overlay || !overlay.parentElement) return;
      try {
        overlay.animate([
          { boxShadow: 'inset 0 0 0 rgba(255,255,255,0)' },
          { boxShadow: `inset 0 0 ${spread}px rgba(180,140,255,${intensity})` },
          { boxShadow: 'inset 0 0 0 rgba(255,255,255,0)' },
        ], { duration: 600, easing: 'ease-out' });
      } catch (_) { /* ignore — JSDOM */ }
    }, t * 1000);
  }
}

/**
 * Crea el overlay oscuro con gradiente radial y rotación de matiz animada.
 * @param {number} durationMs — duración total de la animación
 */
function createOverlay(durationMs) {
  // ── Capa 1: Backdrop estático (sin animaciones → nunca glitchea) ──
  const backdrop = document.createElement('div');
  backdrop.id = 'easter-egg-backdrop';
  backdrop.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'z-index: 9998',
    'background: radial-gradient(ellipse at 35% 45%, rgba(25,5,50,0.88), rgba(5,5,12,0.93) 70%)',
    'opacity: 0',
    'transition: opacity 0.8s ease-in',
    'pointer-events: none',
  ].join(';');
  document.body.appendChild(backdrop);
  backdropEl = backdrop;

  // ── Capa 2: Overlay animado (fantasmas + filtros) ──
  const overlay = document.createElement('div');
  overlay.id = 'easter-egg-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'z-index: 9999',
    'background: transparent',
    'cursor: pointer',
    'opacity: 0',
    'transition: opacity 0.8s ease-in',
    'pointer-events: auto',
    'overflow: hidden',
  ].join(';');

  // Rotación de matiz animada — solo sobre la capa de fantasmas, no el backdrop
  try {
    overlay.animate([
      { filter: 'hue-rotate(0deg) brightness(1) saturate(1)' },
      { filter: 'hue-rotate(60deg) brightness(1.1) saturate(1.3)' },
      { filter: 'hue-rotate(120deg) brightness(0.95) saturate(1.1)' },
      { filter: 'hue-rotate(200deg) brightness(1.15) saturate(1.4)' },
      { filter: 'hue-rotate(280deg) brightness(0.9) saturate(1.2)' },
      { filter: 'hue-rotate(360deg) brightness(1.1) saturate(1.3)' },
      { filter: 'hue-rotate(480deg) brightness(0.95) saturate(1.1)' },
      { filter: 'hue-rotate(560deg) brightness(1.05) saturate(1.2)' },
      { filter: 'hue-rotate(720deg) brightness(1) saturate(1)' },
    ], {
      duration: durationMs,
      iterations: 1,
      easing: 'linear',
    });
  } catch (_) { /* ignore — JSDOM */ }

  const hint = document.createElement('div');
  hint.textContent = '\u{1F50A} click para cerrar';
  hint.style.cssText = [
    'position: absolute',
    'bottom: 20px',
    'left: 50%',
    'transform: translateX(-50%)',
    'color: rgba(255,255,255,0.35)',
    'font-family: monospace',
    'font-size: 14px',
    'z-index: 10000',
    'pointer-events: none',
  ].join(';');
  overlay.appendChild(hint);

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    overlay.style.opacity = '1';
  });

  return overlay;
}


// ═══════════════════════════════════════════════════════════════════════════
//  ORQUESTACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detiene y limpia todo el Easter egg.
 */
function cleanup(audioCtx) {
  isPlaying = false;

  // Cancelar animaciones de fantasmas
  for (const anim of activeAnimations) {
    try { anim.cancel(); } catch (_) { /* ignore */ }
  }
  activeAnimations = [];

  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }

  // Fade-out y eliminar backdrop estático
  if (backdropEl) {
    backdropEl.style.opacity = '0';
    const bd = backdropEl;
    backdropEl = null;
    setTimeout(() => { bd.remove(); }, 800);
  }

  // Fade-out y eliminar overlay animado
  if (overlayEl) {
    overlayEl.style.opacity = '0';
    const el = overlayEl;
    overlayEl = null;
    setTimeout(() => { el.remove(); }, 800);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🥚 Lanza el Easter Egg: desintegración visual + pieza musical.
 * Se puede llamar desde cualquier parte de la app.
 * Click en el overlay para cerrar antes de tiempo.
 *
 * @param {Object} [options]
 * @param {boolean} [options.visualOnly=false] - Si true, solo visual sin sonido
 */
export async function triggerEasterEgg(options = {}) {
  if (isPlaying) return;
  isPlaying = true;

  const visualOnly = !!options.visualOnly;
  let ctx = null;

  try {
    let totalDurationSec = 20;
    let burstTimes = [0, 3, 6, 9, 12, 15, 18];

    // Audio: crear contexto y reproducir pieza (solo si no es visualOnly)
    if (!visualOnly) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-12, ctx.currentTime);
      compressor.knee.setValueAtTime(10, ctx.currentTime);
      compressor.ratio.setValueAtTime(6, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.15, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.7, ctx.currentTime);
      compressor.connect(masterGain).connect(ctx.destination);

      const pieceFn = PIECES[selectedPiece] || PIECES.electroacoustic;
      const result = pieceFn(ctx, compressor);
      totalDurationSec = result.totalDurationSec;
      burstTimes = result.burstTimes;

      // Fade out del master al final
      const fadeStart = ctx.currentTime + totalDurationSec - 1.5;
      masterGain.gain.setValueAtTime(0.7, fadeStart);
      masterGain.gain.linearRampToValueAtTime(0, fadeStart + 1.5);
    }

    // Visual: overlay con gradiente + desintegración de fantasmas
    const durationMs = totalDurationSec * 1000;
    overlayEl = createOverlay(durationMs);

    const ghosts = gatherGhosts(overlayEl);
    activeAnimations = animateGhosts(ghosts, durationMs);

    // Pulsos visuales sincronizados con la pieza
    scheduleVisualPulses(overlayEl, burstTimes);

    // Esperar 600ms antes de escuchar click para cerrar.
    // Esto evita que el click sintético que generan los navegadores móviles
    // tras el último pointerup (el tap que completa la secuencia) cierre
    // el overlay inmediatamente.
    setTimeout(() => {
      if (overlayEl) {
        overlayEl.addEventListener('click', () => cleanup(ctx), { once: true });
      }
    }, 600);

    // Auto-limpieza al terminar
    setTimeout(() => {
      if (isPlaying) cleanup(ctx);
    }, (totalDurationSec + 1.5) * 1000);

  } catch (err) {
    console.error('[EasterEgg] Error:', err);
    isPlaying = false;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  TRIGGER: Secuencia de taps en pads de joystick
// ═══════════════════════════════════════════════════════════════════════════

// Secuencia requerida: frame1, frame2, frame1, frame2, frame1, frame2, frame1, frame2
export const TRIGGER_SEQUENCE = [0, 1, 0, 1, 0, 1, 0, 1];
export const TAP_MAX_DURATION = 300;   // ms máximo que puede durar un tap
export const TAP_MAX_MOVEMENT = 10;    // px máximo de movimiento para considerarlo tap
export const SEQUENCE_TIMEOUT = 2000;  // ms máximo entre taps consecutivos

// Si true, el Easter egg solo reproduce sonido cuando el patch NO ha sido
// modificado (isDirtyFn). Si false, siempre reproduce sonido.
// Mantenemos la infraestructura (isDirtyFn, markCleanFn, wasDirtyAtSequenceStart)
// para poder activarlo en el futuro cambiando este flag a true.
const ENFORCE_CLEAN_CHECK = false;

/**
 * Instala el detector de secuencia de taps en los frames de joystick.
 * Busca los frames por id (joystick-left/right — los .synth-module contenedores).
 * Usa los frames en lugar de los pads para no interferir con la interacción del joystick.
 * Debe llamarse después de que el DOM del panel 7 esté construido.
 *
 * @param {Object} [options]
 * @param {() => boolean} [options.isDirtyFn] - Función que devuelve true si el
 *   sintetizador tiene parámetros modificados. Si dirty → solo visual, sin sonido.
 * @param {() => void} [options.markCleanFn] - Función que limpia el estado dirty.
 *   Se llama al completar la secuencia del Easter egg si no estaba dirty al inicio,
 *   para deshacer el dirty causado por los propios taps (synth:userInteraction).
 */
export function initEasterEggTrigger(options = {}) {
  const isDirtyFn = options.isDirtyFn || (() => false);
  const markCleanFn = options.markCleanFn || null;
  const frame1 = document.querySelector('#joystick-left');
  const frame2 = document.querySelector('#joystick-right');

  if (!frame1 || !frame2) {
    return;
  }

  const frames = [frame1, frame2];

  // Estado de la secuencia
  let sequenceIndex = 0;
  let lastTapTime = 0;

  // Estado dirty capturado al INICIO de la secuencia (antes de que los
  // propios taps disparen synth:userInteraction → markDirty).
  let wasDirtyAtSequenceStart = false;

  // Estado del tap en curso
  let tapStartTime = 0;
  let tapStartX = 0;
  let tapStartY = 0;
  let tapPadIndex = -1;
  let tapPointerId = -1;
  let countdownEl = null;

  /** Muestra un número grande centrado en pantalla (cuenta atrás) */
  function showCountdown(n) {
    removeCountdown();
    const el = document.createElement('div');
    el.className = 'easter-egg-countdown';
    el.textContent = n;
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) scale(0.3)',
      zIndex: '99999',
      fontSize: '18vw',
      fontWeight: '900',
      fontFamily: 'system-ui, sans-serif',
      color: 'rgba(200, 140, 255, 0.85)',
      textShadow: '0 0 40px rgba(130, 50, 200, 0.7), 0 0 80px rgba(50, 130, 220, 0.4)',
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: '0',
      transition: 'none',
    });
    document.body.appendChild(el);
    countdownEl = el;
    // Forzar reflow y animar entrada
    el.offsetHeight; // eslint-disable-line no-unused-expressions
    Object.assign(el.style, {
      transition: 'opacity 0.15s ease-out, transform 0.3s cubic-bezier(0.2, 1.4, 0.4, 1)',
      opacity: '1',
      transform: 'translate(-50%, -50%) scale(1)',
    });
    // Auto-fade tras 600ms
    setTimeout(() => {
      if (countdownEl === el) {
        Object.assign(el.style, {
          transition: 'opacity 0.4s ease-in, transform 0.4s ease-in',
          opacity: '0',
          transform: 'translate(-50%, -50%) scale(1.8)',
        });
        setTimeout(() => el.remove(), 400);
      }
    }, 600);
  }

  /** Elimina la cuenta atrás inmediatamente */
  function removeCountdown() {
    if (countdownEl) {
      countdownEl.remove();
      countdownEl = null;
    }
  }

  const resetSequence = () => {
    sequenceIndex = 0;
    lastTapTime = 0;
    wasDirtyAtSequenceStart = false;
    removeCountdown();
  };

  // Cualquier interacción fuera de los frames rompe la secuencia
  document.addEventListener('pointerdown', (ev) => {
    if (!frame1.contains(ev.target) && !frame2.contains(ev.target)) {
      resetSequence();
    }
  }, true);

  // Instalar listeners en cada frame
  frames.forEach((frame, frameIndex) => {
    frame.addEventListener('pointerdown', (ev) => {
      if (isPlaying) return;
      if (tapPointerId !== -1) {
        resetSequence();
        return;
      }

      // Capturar estado dirty al inicio de la secuencia.
      // Lo hacemos en pointerdown (antes de que el pointerup del frame
      // dispare synth:userInteraction → markDirty).
      if (sequenceIndex === 0) {
        wasDirtyAtSequenceStart = isDirtyFn();
      }

      tapStartTime = performance.now();
      tapStartX = ev.clientX;
      tapStartY = ev.clientY;
      tapPadIndex = frameIndex;
      tapPointerId = ev.pointerId;
    });

    frame.addEventListener('pointerup', (ev) => {
      if (isPlaying) return;
      if (ev.pointerId !== tapPointerId) return;

      const now = performance.now();
      const duration = now - tapStartTime;
      const dx = ev.clientX - tapStartX;
      const dy = ev.clientY - tapStartY;
      const movement = Math.sqrt(dx * dx + dy * dy);

      const padIdx = tapPadIndex;
      tapPointerId = -1;
      tapPadIndex = -1;

      // ¿Es un tap válido? (corto y sin movimiento)
      if (duration > TAP_MAX_DURATION || movement > TAP_MAX_MOVEMENT) {
        resetSequence();
        return;
      }

      // ¿Ha pasado demasiado tiempo desde el último tap?
      if (sequenceIndex > 0 && (now - lastTapTime) > SEQUENCE_TIMEOUT) {
        resetSequence();
        // Re-capturar dirty para el nuevo intento
        if (padIdx === TRIGGER_SEQUENCE[0]) {
          wasDirtyAtSequenceStart = isDirtyFn();
        }
      }

      // ¿Este pad es el esperado en la secuencia?
      if (padIdx !== TRIGGER_SEQUENCE[sequenceIndex]) {
        resetSequence();
        if (padIdx === TRIGGER_SEQUENCE[0]) {
          wasDirtyAtSequenceStart = isDirtyFn();
          sequenceIndex = 1;
          lastTapTime = now;
        }
        return;
      }

      // ¡Tap correcto!
      sequenceIndex++;
      lastTapTime = now;

      // Cuenta atrás: mostrar 3, 2, 1 cuando quedan 3 taps o menos
      const remaining = TRIGGER_SEQUENCE.length - sequenceIndex;
      if (remaining > 0 && remaining <= 3) {
        showCountdown(remaining);
      }

      // ¿Secuencia completa?
      if (sequenceIndex >= TRIGGER_SEQUENCE.length) {
        const dirty = ENFORCE_CLEAN_CHECK && wasDirtyAtSequenceStart;
        resetSequence();
        // Si no estaba dirty al inicio, deshacer el dirty que nuestros
        // propios taps causaron (pointerup → synth:userInteraction → markDirty)
        if (!dirty && markCleanFn) markCleanFn();
        triggerEasterEgg({ visualOnly: dirty });
      }
    });

    frame.addEventListener('pointercancel', (ev) => {
      if (ev.pointerId === tapPointerId) {
        tapPointerId = -1;
        tapPadIndex = -1;
        resetSequence();
      }
    });
  });
}
