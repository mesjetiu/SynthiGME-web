/**
 * 🥚 Easter Egg — Desintegración visual + pieza musical
 *
 * Módulo autocontenido que lanza una animación de «desintegración»
 * del Synthi sincronizada con una pieza musical generada por síntesis.
 * Los elementos de la interfaz (knobs, sliders, módulos, pines) se
 * convierten en siluetas geométricas que flotan, giran, se dispersan
 * y se disuelven con trayectorias orgánicas (wobble + espiral).
 * El puntero del ratón (o dedo en tablet) actúa como atractor suave
 * que influye en la trayectoria de los elementos.
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
let overlayEl = null;
let canvasAnimId = 0;

// ─── Atractor (puntero del ratón / dedo en tablet) ───
let attractorX = -9999;
let attractorY = -9999;
let attractorActive = false;
let _onKeyDown = null;    // ref para cleanup de Escape

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
 * Crea un impulse response sintético para reverb por convolución.
 * @param {AudioContext} ctx
 * @param {number} duration — duración en segundos
 * @param {number} decay — velocidad de decaimiento (mayor = más corto)
 * @returns {ConvolverNode}
 */
function createReverb(ctx, duration = 3, decay = 2.5) {
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * duration);
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

/**
 * Crea un delay estéreo con feedback.
 * @returns {{ input: GainNode, output: GainNode }}
 */
function createStereoDelay(ctx, delayTimeL = 0.37, delayTimeR = 0.53, feedback = 0.45, wetLevel = 0.3) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const delayL = ctx.createDelay(2);
  const delayR = ctx.createDelay(2);
  const fbGainL = ctx.createGain();
  const fbGainR = ctx.createGain();
  const wetGain = ctx.createGain();
  const merger = ctx.createChannelMerger(2);

  delayL.delayTime.value = delayTimeL;
  delayR.delayTime.value = delayTimeR;
  fbGainL.gain.value = feedback;
  fbGainR.gain.value = feedback;
  wetGain.gain.value = wetLevel;

  // Dry
  input.connect(output);
  // Wet path L
  input.connect(delayL);
  delayL.connect(fbGainL);
  fbGainL.connect(delayR);  // cruzado para efecto ping-pong
  delayL.connect(merger, 0, 0);
  // Wet path R
  input.connect(delayR);
  delayR.connect(fbGainR);
  fbGainR.connect(delayL);
  delayR.connect(merger, 0, 1);
  // Mix
  merger.connect(wetGain);
  wetGain.connect(output);

  return { input, output };
}

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
 * Con reverb por convolución, delay estéreo, filtros resonantes y FM compleja.
 *
 * Estructura en 6 secciones (~35s):
 *   I.    Klang     (0–6s)   — Impacto inicial + drones emergentes
 *   II.   Punkte    (5–10s)  — Puntillismo: pings con reverb
 *   III.  Gruppen   (9–16s)  — Gestos: glissandi, ruido, FM
 *   IV.   Eruption  (15–23s) — Clímax: texturas FM masivas, caos
 *   V.    Resonanz  (22–29s) — Ecos con delay estéreo, pings invertidos
 *   VI.   Stille    (28–35s) — Disolución lenta, silencio
 *
 * @returns {{ totalDurationSec: number, burstTimes: number[] }}
 */
function playElectroacousticPiece(ctx, dest) {
  const t0 = ctx.currentTime + 0.05;

  // ─── Efectos globales ───
  const reverb = createReverb(ctx, 3.5, 2.2);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.25;
  reverb.connect(reverbGain).connect(dest);

  const delay = createStereoDelay(ctx, 0.31, 0.47, 0.4, 0.2);
  delay.output.connect(dest);

  // Bus seco + bus con efectos
  const dryBus = ctx.createGain();
  dryBus.gain.value = 1.0;
  dryBus.connect(dest);

  const fxBus = ctx.createGain();
  fxBus.gain.value = 1.0;
  fxBus.connect(dest);
  fxBus.connect(reverb);
  fxBus.connect(delay.input);

  // ─── I. Klang (0–6s): Impacto + Emergencia ───
  // *** Golpe inicial de ruido — no silencio ***
  playFilteredNoise(ctx, fxBus, 60, 2000, 2, t0, 0.6, 0.20);
  // Dron profundo inmediato (fadeIn corto)
  playSineTone(ctx, dryBus, 55, t0, 7, 0.16, { fadeIn: 0.3, fadeOut: 2 });
  playSineTone(ctx, dryBus, 56.5, t0 + 0.1, 6.5, 0.12, { fadeIn: 0.5, fadeOut: 1.5 });
  // Sub-bajo pulsante (inmediato)
  playSineTone(ctx, dryBus, 27.5, t0 + 0.05, 5, 0.12, { fadeIn: 0.1, fadeOut: 2 });
  // Quinta justa con batimiento
  playSineTone(ctx, fxBus, 82.5, t0 + 0.5, 5, 0.08, { fadeIn: 0.3, fadeOut: 1 });
  playSineTone(ctx, fxBus, 83.8, t0 + 0.7, 4.5, 0.06, { fadeIn: 0.3, fadeOut: 1 });
  // Octava y parciales — emergen rápido
  playSineTone(ctx, fxBus, 110, t0 + 1.2, 4, 0.07, { fadeIn: 0.2, fadeOut: 1.5 });
  playSineTone(ctx, fxBus, 165, t0 + 2, 3.5, 0.04, { fadeIn: 0.15, fadeOut: 1.2 });
  playSineTone(ctx, fxBus, 220, t0 + 2.5, 3, 0.035, { fadeIn: 0.1, fadeOut: 1 });
  // Glissando sub-grave ascendente (gesto de apertura)
  playSineGliss(ctx, fxBus, 20, 110, t0, 3, 0.10);
  // FM sutil de textura — empieza desde el comienzo
  playFMTexture(ctx, fxBus, 55, 0.3, 8, 0.1, 3, t0 + 0.5, 5, 0.04);

  // ─── II. Punkte (5–10s): Puntillismo con reverb ───
  const pings = [
    [880,  5.0, 0.22, 0.09],   [1320, 5.3, 0.10, 0.07],
    [440,  5.7, 0.30, 0.10],   [2200, 6.0, 0.05, 0.06],
    [550,  6.2, 0.18, 0.08],   [1760, 6.5, 0.08, 0.05],
    [330,  6.65, 0.35, 0.09],  [3300, 6.8, 0.03, 0.04],
    [660,  6.95, 0.12, 0.08],  [1100, 7.08, 0.07, 0.06],
    [2640, 7.18, 0.04, 0.05],  [440,  7.28, 0.20, 0.07],
    [1650, 7.36, 0.05, 0.05],  [880,  7.42, 0.08, 0.06],
    [3960, 7.48, 0.02, 0.04],  [220,  7.54, 0.25, 0.08],
    [1320, 7.60, 0.03, 0.05],  [550,  7.65, 0.04, 0.06],
    [2200, 7.70, 0.025, 0.04], [770,  7.74, 0.03, 0.05],
    // Accelerando: nube densa
    [1100, 7.77, 0.02, 0.04],  [3300, 7.80, 0.015, 0.03],
    [440,  7.82, 0.015, 0.05], [1760, 7.84, 0.01, 0.04],
    [660,  7.86, 0.01, 0.04],  [2200, 7.88, 0.01, 0.03],
    [880,  7.90, 0.01, 0.04],  [330,  7.92, 0.015, 0.05],
    [1650, 7.94, 0.01, 0.03],  [550,  7.96, 0.01, 0.04],
    // Rebote — pings que se expanden de nuevo (con reverb)
    [2200, 8.3, 0.08, 0.06],   [440,  8.5, 0.15, 0.07],
    [1320, 8.8, 0.10, 0.05],   [660,  9.1, 0.18, 0.06],
    [3300, 9.3, 0.05, 0.04],   [880,  9.5, 0.12, 0.05],
  ];
  for (const [freq, time, dur, vol] of pings) {
    // Pings van al bus con efectos para reverb/delay
    playSinePing(ctx, fxBus, freq, t0 + time, dur, vol);
  }
  // Cama de ruido filtrado sutil debajo de los pings
  playFilteredNoise(ctx, fxBus, 1000, 3000, 12, t0 + 5, 4, 0.025);

  // ─── III. Gruppen (9–16s): Gestos y texturas ───
  playSineGliss(ctx, fxBus, 80, 4500, t0 + 9, 4, 0.10);
  playFilteredNoise(ctx, fxBus, 400, 7000, 8, t0 + 9.5, 3.5, 0.08);
  playSineGliss(ctx, fxBus, 5000, 100, t0 + 10.5, 3, 0.08);
  playFMTexture(ctx, fxBus, 220, 1, 120, 0.5, 15, t0 + 11.5, 3, 0.08);
  // Glissandi cruzados (efecto «tijera»)
  playSineGliss(ctx, fxBus, 150, 6000, t0 + 12.5, 2.5, 0.07);
  playSineGliss(ctx, fxBus, 7000, 80, t0 + 13, 2.5, 0.07);
  // FM metálica con modulación rápida
  playFMTexture(ctx, fxBus, 440, 50, 300, 4, 18, t0 + 13.5, 2, 0.06);
  // «Corte de cinta» — ruido breve banda ancha
  playFilteredNoise(ctx, fxBus, 200, 10000, 1.5, t0 + 15, 0.12, 0.16);
  // Rebotes de pings que cruzan el panorama (via delay estéreo)
  playSinePing(ctx, fxBus, 1760, t0 + 14, 0.15, 0.10);
  playSinePing(ctx, fxBus, 2640, t0 + 14.3, 0.10, 0.08);
  playSinePing(ctx, fxBus, 3520, t0 + 14.5, 0.08, 0.07);

  // ─── IV. Eruption (15–23s): Clímax ───
  // FM masiva — carrier grave, modulador en barrido amplio
  playFMTexture(ctx, fxBus, 110, 2, 250, 1, 25, t0 + 15.5, 4.5, 0.10);
  playFMTexture(ctx, fxBus, 330, 5, 180, 2, 18, t0 + 16, 4, 0.08);
  // Glissandi extremos simultáneos
  playSineGliss(ctx, fxBus, 25, 10000, t0 + 16, 3.5, 0.09);
  playSineGliss(ctx, fxBus, 12000, 30, t0 + 16.5, 4, 0.08);
  // Explosión de ruido con filtro resonante
  playFilteredNoise(ctx, fxBus, 80, 14000, 1, t0 + 17, 0.2, 0.20);
  // Textura FM aguda — campanas metálicas
  playFMTexture(ctx, fxBus, 880, 15, 600, 4, 30, t0 + 17.5, 3.5, 0.07);
  playFMTexture(ctx, fxBus, 1320, 7, 400, 2, 20, t0 + 18, 3, 0.05);
  // Drones disonantes (cluster de semitonos)
  playSineTone(ctx, fxBus, 233, t0 + 18, 4, 0.06, { fadeIn: 0.3, fadeOut: 2 });
  playSineTone(ctx, fxBus, 247, t0 + 18.3, 3.5, 0.05, { fadeIn: 0.2, fadeOut: 2 });
  playSineTone(ctx, fxBus, 262, t0 + 18.5, 3, 0.04, { fadeIn: 0.2, fadeOut: 2 });
  // Puntillismo caótico — ráfaga de pings con reverb
  const chaosFreqs = [3520, 1760, 440, 7040, 880, 2640, 5280, 330, 1320, 660];
  for (let i = 0; i < 25; i++) {
    const t = 19.5 + i * 0.09;
    const f = chaosFreqs[i % chaosFreqs.length] * (0.7 + Math.random() * 0.6);
    playSinePing(ctx, fxBus, f, t0 + t, 0.02 + Math.random() * 0.08, 0.04 + Math.random() * 0.05);
  }
  // Ruido descendente con mucha resonancia
  playFilteredNoise(ctx, fxBus, 10000, 150, 4, t0 + 20, 2.5, 0.09);
  // Golpe FM final de la erupción
  playFMTexture(ctx, fxBus, 55, 1, 400, 5, 35, t0 + 21.5, 1.5, 0.12);
  // Ping reverberado que marca el fin del clímax
  playSinePing(ctx, fxBus, 4400, t0 + 22.5, 0.3, 0.10);

  // ─── V. Resonanz (22–29s): Ecos y resonancias ───
  // Pings largos procesados con delay estéreo (ping-pong)
  const resonantPings = [
    [220,  23.0, 1.5, 0.08],  [440,  23.5, 1.2, 0.06],
    [330,  24.5, 1.8, 0.07],  [660,  25.0, 0.8, 0.05],
    [165,  25.8, 2.0, 0.07],  [550,  26.3, 1.0, 0.05],
    [880,  26.8, 0.6, 0.04],  [110,  27.3, 2.5, 0.08],
    [1320, 27.8, 0.4, 0.04],  [275,  28.3, 1.5, 0.06],
  ];
  for (const [freq, time, dur, vol] of resonantPings) {
    playSineTone(ctx, fxBus, freq, t0 + time, dur, vol, { fadeIn: 0.01, fadeOut: dur * 0.8 });
  }
  // Glissando lento descendente como eco lejano
  playSineGliss(ctx, fxBus, 2500, 150, t0 + 23.5, 5, 0.05);
  // FM fantasmal suave
  playFMTexture(ctx, fxBus, 110, 0.3, 12, 0.15, 3, t0 + 24.5, 4, 0.04);
  // Ruido resonante estrecho (como viento en tubos)
  playFilteredNoise(ctx, fxBus, 900, 250, 25, t0 + 25.5, 3, 0.03);
  // Glissando inverso ascendente (reflejo)
  playSineGliss(ctx, fxBus, 80, 800, t0 + 27, 2, 0.04);

  // ─── VI. Stille (28–35s): Disolución ───
  // Armónicos agudos lejanos con batimiento
  playSineTone(ctx, fxBus, 4400, t0 + 28.5, 4.5, 0.03, { fadeIn: 0.8, fadeOut: 3.5 });
  playSineTone(ctx, fxBus, 4000, t0 + 29, 4, 0.025, { fadeIn: 0.5, fadeOut: 3 });
  // Glissando descendente final (largo, hacia el silencio)
  playSineGliss(ctx, fxBus, 1500, 30, t0 + 29.5, 5, 0.07);
  // Dron grave final
  playSineTone(ctx, dryBus, 55, t0 + 30, 5, 0.06, { fadeIn: 0.2, fadeOut: 4.5 });
  playSineTone(ctx, dryBus, 110, t0 + 30.5, 4.5, 0.04, { fadeIn: 0.15, fadeOut: 4 });
  // FM residual fantasmal
  playFMTexture(ctx, fxBus, 55, 0.1, 3, 0.05, 1, t0 + 31, 3, 0.02);
  // Susurro de ruido
  playFilteredNoise(ctx, fxBus, 2500, 200, 6, t0 + 32, 2.5, 0.018);
  // Último ping reverberado (lejano)
  playSinePing(ctx, fxBus, 3520, t0 + 34, 0.5, 0.025);
  // Ping final casi inaudible
  playSinePing(ctx, fxBus, 1760, t0 + 34.5, 0.3, 0.015);

  return {
    totalDurationSec: 35,
    burstTimes: [0, 2, 5, 6.8, 9, 12, 15, 17, 19, 21.5, 23, 26, 29, 32],
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
 * Selectores CSS de elementos del Synthi.
 * gatherGhosts busca solo 3 niveles: paneles, notas y módulos (frames).
 * No desciende a controles individuales (knobs, sliders, pines).
 */

/**
 * Determina la forma de un fantasma según las dimensiones y clases del elemento.
 * @param {Element} el
 * @param {DOMRect} rect
 * @returns {'circle'|'dot'|'rect'}
 */
function inferShape(el, rect) {
  const ratio = rect.width / (rect.height || 1);
  const size = Math.max(rect.width, rect.height);
  // Pines de matriz → siempre dot
  if (el.classList.contains('pin-btn')) return 'dot';
  // Elementos explícitamente circulares
  if (el.classList.contains('knob') || el.classList.contains('knob-inner') ||
      el.classList.contains('panel7-joystick-pad')) {
    return 'circle';
  }
  // Cuadrado pequeño y casi 1:1 → dot
  if (size < 20 && ratio > 0.7 && ratio < 1.4) return 'dot';
  // Cuadrado mediano y casi 1:1 → circle
  if (size < 60 && ratio > 0.7 && ratio < 1.4) return 'circle';
  // Todo lo demás → rect
  return 'rect';
}

/**
 * Recoge los elementos visibles del Synthi y devuelve datos de fantasmas
 * (sin crear elementos DOM — se renderizan en un único canvas).
 *
 * Niveles capturados:
 *   1. Paneles (.panel) — los 7 bloques principales
 *   2. Notas (.panel-note) — pueden estar dentro de paneles o en viewportInner
 *   3. Módulos — frames que rodean controles (synth-module, sgme-osc, etc.)
 *   4. Controles — knobs, sliders, botones, joystick pads, etc.
 *
 * Excluidos: canvas, SVG internals, tooltips.
 * @returns {Array<{x,y,w,h,shape,fillStyle,strokeStyle,delay,tx,ty,rot,sc}>}
 */
const MAX_GHOSTS = 2000;
const MAX_PINS = 50;   // pines simbólicos (hay cientos, solo unos pocos)

function gatherGhosts() {
  const MIN_SIZE = 1;
  const candidates = [];

  // ── Selector de módulos (frames) ──
  const MODULE_SEL = [
    '.synth-module',
    '.sgme-osc',
    '.noise-generator',
    '.random-voltage',
    '.output-channel-module',
    '.input-amplifier-module',
    '.input-amplifiers-module',
    '.panel7-joystick',
    '.panel7-sequencer',
    '.panel1-placeholder',
    '.panel2-placeholder',
    '.matrix-container',
  ].join(',');

  // ── Selector de controles internos (dentro de módulos) ──
  const CONTROL_SEL = [
    '.knob',
    '.output-channel__slider-shell',
    '.panel7-joystick-pad',
    '.panel7-seq-button',
    '.panel7-seq-switch',
    '.output-channel__switch',
    '.knob-value',
    '.sgme-osc__header',
    '.synth-module__header',
    '.noise-generator__header',
    '.random-voltage__header',
  ].join(',');

  // Tags a excluir siempre (SVG/canvas internals, infraestructura)
  const EXCLUDE_TAGS = new Set([
    'CANVAS', 'SVG', 'PATH', 'CIRCLE', 'RECT', 'LINE',
    'POLYLINE', 'POLYGON', 'TEXT', 'TSPAN',
    'BR', 'SCRIPT', 'STYLE', 'LINK',
  ]);

  // 1. Paneles
  for (const el of document.querySelectorAll('.panel')) {
    const r = el.getBoundingClientRect();
    if (r.width > MIN_SIZE && r.height > MIN_SIZE) {
      candidates.push({ el, rect: r, priority: 0 });
    }
  }

  // 2. Notas — pueden estar dentro de paneles O en #viewportInner
  for (const el of document.querySelectorAll('.panel-note')) {
    const r = el.getBoundingClientRect();
    if (r.width > MIN_SIZE && r.height > MIN_SIZE) {
      candidates.push({ el, rect: r, priority: 0 });
    }
  }

  // 3. Módulos (frames)
  for (const el of document.querySelectorAll(MODULE_SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width > MIN_SIZE && r.height > MIN_SIZE) {
      candidates.push({ el, rect: r, priority: 1 });
    }
  }

  // 4. Controles internos (knobs, sliders, botones, headers...)
  for (const el of document.querySelectorAll(CONTROL_SEL)) {
    if (EXCLUDE_TAGS.has(el.tagName)) continue;
    // Excluir tooltips
    if (el.closest('.tooltip, [role="tooltip"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > MIN_SIZE && r.height > MIN_SIZE) {
      candidates.push({ el, rect: r, priority: 2 });
    }
  }

  // 5. Pines simbólicos (solo un muestreo, no todos)
  const allPins = [...document.querySelectorAll('.pin-btn')].filter(el => {
    if (EXCLUDE_TAGS.has(el.tagName)) return false;
    if (el.closest('.tooltip, [role="tooltip"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > MIN_SIZE && r.height > MIN_SIZE;
  });
  // Fisher-Yates para muestreo aleatorio de pines
  for (let i = allPins.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPins[i], allPins[j]] = [allPins[j], allPins[i]];
  }
  for (const el of allPins.slice(0, MAX_PINS)) {
    const r = el.getBoundingClientRect();
    candidates.push({ el, rect: r, priority: 3 });
  }

  // Limitar si excede MAX_GHOSTS: siempre paneles/notas/módulos, muestreo de controles
  let selected = candidates;
  if (candidates.length > MAX_GHOSTS) {
    const fixed = candidates.filter(c => c.priority <= 1);
    const controls = candidates.filter(c => c.priority >= 2);
    // Fisher-Yates parcial
    for (let i = controls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [controls[i], controls[j]] = [controls[j], controls[i]];
    }
    selected = [...fixed, ...controls.slice(0, Math.max(MAX_GHOSTS - fixed.length, 0))];
  }

  // Datos de fantasmas (posición, forma, color, parámetros de animación)
  const vw = window.innerWidth || 1200;
  const vh = window.innerHeight || 800;
  const ghosts = [];
  for (let i = 0; i < selected.length; i++) {
    const { el, rect } = selected[i];
    const shape = inferShape(el, rect);
    const [r, g, b] = PALETTE[i % PALETTE.length];
    // Pines: dot = círculo pequeño, color brillante, tamaño mínimo mayor
    const isPin = el.classList.contains('pin-btn') || shape === 'dot';
    ghosts.push({
      x: rect.left, y: rect.top,
      w: isPin ? Math.max(rect.width, 8) : Math.max(rect.width, 4),
      h: isPin ? Math.max(rect.height, 8) : Math.max(rect.height, 4),
      shape,
      fillStyle: isPin
        ? `rgba(${r},${g},${b},0.95)`
        : `rgba(${r},${g},${b},0.80)`,
      strokeStyle: isPin
        ? `rgba(255,255,255,0.8)`
        : `rgba(${r},${g},${b},0.85)`,
      delay: Math.random() * 600,
      tx: (Math.random() - 0.5) * vw * 1.4,
      ty: (Math.random() - 0.5) * vh * 1.2,
      rot: shape === 'dot' ? 0 : (Math.random() - 0.5) * 1800,
      sc: shape === 'dot' ? 1 : 0.3 + Math.random() * 2.5,
      // Wobble sinusoidal (movimiento orgánico ondulante)
      wFreqX: 0.4 + Math.random() * 2.5,
      wFreqY: 0.6 + Math.random() * 2.5,
      wAmpX: 15 + Math.random() * 120,
      wAmpY: 15 + Math.random() * 120,
      // Espiral (movimiento orbital)
      spiralR: 8 + Math.random() * 70,
      spiralSpd: (Math.random() - 0.5) * 6,
    });
  }
  return ghosts;
}

// ─── Interpolación de fases para renderizado en canvas ───
const PHASE_OFFSETS = [0, 0.03, 0.14, 0.36, 0.60, 0.80, 0.85, 1];
const PHASE_TX_F   = [0,    0,  0.7,  1.0, 0.55, 0.10,    0, 0];
const PHASE_TY_F   = [0,    0,  0.7,  1.0, 0.55, 0.10,    0, 0];
const PHASE_ROT_F  = [0,    0,  0.5,  1.0, 0.85, 0.10,    0, 0];
const PHASE_ALPHA  = [1,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0, 1];
const DEG_TO_RAD   = Math.PI / 180;
const FADE_OUT_MS  = 6000;  // duración del fade-out final (tras la música)

function phaseScale(idx, sc) {
  if (idx === 2) return 0.7 + sc * 0.2;
  if (idx === 3) return sc;
  if (idx === 4) return 1.05;
  return 1;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Interpola posición/rotación/escala/opacidad de un ghost en un instante.
 *  Función pura: solo depende de progress, ghost y tiempo.
 *  El atractor se aplica externamente en el bucle de animación.
 *  @param {number} progress — progreso normalizado 0..1
 *  @param {Object} ghost — datos del ghost (posición, parámetros de movimiento)
 *  @param {number} [elapsedSec=0] — tiempo transcurrido en segundos (para wobble/espiral)
 */
function interpolateGhost(progress, ghost, elapsedSec = 0) {
  let i = 0;
  while (i < PHASE_OFFSETS.length - 2 && PHASE_OFFSETS[i + 1] <= progress) i++;
  const segLen = PHASE_OFFSETS[i + 1] - PHASE_OFFSETS[i];
  const t = easeInOut(Math.max(0, Math.min(1, (progress - PHASE_OFFSETS[i]) / segLen)));
  const lerp = (a, b) => a + (b - a) * t;

  const baseTx = lerp(PHASE_TX_F[i], PHASE_TX_F[i + 1]) * ghost.tx;
  const baseTy = lerp(PHASE_TY_F[i], PHASE_TY_F[i + 1]) * ghost.ty;

  // Envolvente para wobble/espiral: sube y baja suavemente con el progreso
  const env = Math.sin(progress * Math.PI);

  // Wobble sinusoidal — ondulación orgánica sobre la trayectoria base
  const TAU = 6.283185;
  const wx = (ghost.wAmpX || 0) * Math.sin(elapsedSec * (ghost.wFreqX || 0) * TAU) * env;
  const wy = (ghost.wAmpY || 0) * Math.cos(elapsedSec * (ghost.wFreqY || 0) * TAU) * env;

  // Espiral — componente orbital que añade movimiento circular
  const sa = elapsedSec * (ghost.spiralSpd || 0);
  const sr = (ghost.spiralR || 0) * env;

  const finalTx = baseTx + wx + Math.cos(sa) * sr;
  const finalTy = baseTy + wy + Math.sin(sa) * sr;

  return {
    tx: finalTx,
    ty: finalTy,
    rot: lerp(PHASE_ROT_F[i], PHASE_ROT_F[i + 1]) * ghost.rot,
    scale: lerp(phaseScale(i, ghost.sc), phaseScale(i + 1, ghost.sc)),
    alpha: lerp(PHASE_ALPHA[i], PHASE_ALPHA[i + 1]),
  };
}

/**
 * Renderiza todos los fantasmas en un único <canvas> con requestAnimationFrame.
 * Un solo canvas = 1 capa de composición GPU, en lugar de N elementos DOM
 * con N capas individuales. Drásticamente más rápido en tablets y móviles.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array} ghostData — datos devueltos por gatherGhosts()
 * @param {number} durationMs
 * @param {HTMLElement} overlay — overlay contenedor (para animar su fondo)
 */
function startCanvasAnimation(canvas, ghostData, durationMs, overlay) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return; // JSDOM
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx2d.scale(dpr, dpr);

  // Inicializar estado de física por ghost (velocidad + offset acumulado)
  for (const ghost of ghostData) {
    ghost.vx = 0;  // velocidad X (px/s)
    ghost.vy = 0;  // velocidad Y (px/s)
    ghost.ox = 0;  // offset acumulado X (px)
    ghost.oy = 0;  // offset acumulado Y (px)
    // Masa proporcional al área: elementos grandes = más inercia
    const area = ghost.w * ghost.h;
    ghost.mass = 0.5 + Math.sqrt(area) / 40; // ~0.5 (pines) a ~5+ (paneles)
    // Dirección aleatoria de drift (dispersión sin atractor)
    ghost.driftAngle = Math.random() * 6.283185;
    ghost.driftSpeed = 200 + Math.random() * 300; // px/s de empuje base
  }

  const startTime = performance.now();
  let prevTime = startTime;
  const totalMs = durationMs + FADE_OUT_MS;
  const fadeInMs = 1000;  // 1s de fade-in al inicio

  function frame(now) {
    const dt = Math.min((now - prevTime) / 1000, 0.05); // delta en seg, cap a 50ms
    prevTime = now;
    const elapsed = now - startTime;
    if (elapsed >= totalMs || !canvas.parentElement) return;

    ctx2d.clearRect(0, 0, w, h);

    // ── Fade global: in al inicio, out tras la música ──
    let globalFade;
    if (elapsed < fadeInMs) {
      globalFade = elapsed / fadeInMs;
    } else if (elapsed > durationMs) {
      globalFade = Math.max(0, 1 - (elapsed - durationMs) / FADE_OUT_MS);
    } else {
      globalFade = 1;
    }
    // Fondo del overlay sincronizado con el fade global
    overlay.style.background = `rgba(5, 5, 15, ${globalFade.toFixed(3)})`;

    for (const ghost of ghostData) {
      const ge = elapsed - ghost.delay;
      if (ge < 0) continue;
      // Progress solo sobre la duración de la música (no el fade-out extra)
      const progress = Math.min(ge / (durationMs - ghost.delay), 1);
      const elapsedSec = ge / 1000;
      const { tx, ty, rot, scale, alpha } = interpolateGhost(
        progress, ghost, elapsedSec
      );

      // ── Atractor físico: arrastre con velocidad acumulada ──
      // Fuerza suave que afecta también a elementos lejanos.
      // La velocidad se acumula en el tiempo → se puede "arrastrar" con el cursor.
      const attractorDecay = progress > 0.85
        ? Math.max(0, 1 - (progress - 0.85) / 0.15) : 1;

      if (attractorActive && attractorDecay > 0 && dt > 0) {
        const ghostCx = ghost.x + ghost.w / 2 + tx + ghost.ox;
        const ghostCy = ghost.y + ghost.h / 2 + ty + ghost.oy;
        const dx = attractorX - ghostCx;
        const dy = attractorY - ghostCy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        // Fuerza agresiva: componente proporcional + componente inversa
        // Cercanos: tirón fuerte. Lejanos: tirón creciente con el tiempo.
        // A dist=0 → ~4000 px/s², dist=200 → ~2600, dist=800 → ~1000
        const strength = 4000;
        const range = 500;
        const force = strength / (1 + dist / range);
        // Componente lineal extra: empuja lejanos proporcionalmente a distancia
        const linearPull = 1.5; // px/s² por px de distancia
        const totalForceX = (dx / dist) * force + dx * linearPull;
        const totalForceY = (dy / dist) * force + dy * linearPull;
        // F = ma → a = F/m : elementos grandes aceleran menos
        ghost.vx += (totalForceX / ghost.mass) * dt * attractorDecay;
        ghost.vy += (totalForceY / ghost.mass) * dt * attractorDecay;
      }

      // Sin atractor: dispersión aleatoria continua (drift)
      if (!attractorActive && dt > 0 && attractorDecay > 0) {
        // Rotar lentamente el ángulo de drift → trayectorias curvas
        ghost.driftAngle += (Math.random() - 0.5) * 2.5 * dt;
        const driftForce = ghost.driftSpeed * (1 + progress * 5); // acelera rápido
        // Elementos pequeños se dispersan más rápido (F/m)
        ghost.vx += (Math.cos(ghost.driftAngle) * driftForce / ghost.mass) * dt;
        ghost.vy += (Math.sin(ghost.driftAngle) * driftForce / ghost.mass) * dt;
      }

      // Damping: elementos grandes frenan menos (más inercia)
      // Base suave → casi sin fricción para dispersión libre
      const baseDamp = attractorActive ? 0.97 : 0.975;
      // Elementos pesados: damping más cercano a 1 (menos frenado)
      const massDamp = Math.min(baseDamp + (ghost.mass - 1) * 0.004, 0.995);
      ghost.vx *= Math.pow(massDamp, dt * 60);
      ghost.vy *= Math.pow(massDamp, dt * 60);

      // Integrar offset acumulado
      ghost.ox += ghost.vx * dt;
      ghost.oy += ghost.vy * dt;

      // Limitar offset máximo para evitar que se pierdan fuera de pantalla
      const maxOffset = 2000;
      const offsetDist = Math.sqrt(ghost.ox * ghost.ox + ghost.oy * ghost.oy);
      if (offsetDist > maxOffset) {
        const clamp = maxOffset / offsetDist;
        ghost.ox *= clamp;
        ghost.oy *= clamp;
      }

      // Al final de la animación, devolver suavemente a posición base
      if (attractorDecay < 1) {
        ghost.ox *= attractorDecay;
        ghost.oy *= attractorDecay;
        ghost.vx *= attractorDecay;
        ghost.vy *= attractorDecay;
      }

      const finalAlpha = alpha * globalFade;
      if (finalAlpha < 0.01) continue;

      const cx = ghost.x + ghost.w / 2 + tx + ghost.ox;
      const cy = ghost.y + ghost.h / 2 + ty + ghost.oy;
      const hw = ghost.w / 2;
      const hh = ghost.h / 2;

      ctx2d.save();
      ctx2d.globalAlpha = finalAlpha;
      ctx2d.translate(cx, cy);
      ctx2d.rotate(rot * DEG_TO_RAD);
      ctx2d.scale(scale, scale);

      ctx2d.fillStyle = ghost.fillStyle;
      ctx2d.strokeStyle = ghost.strokeStyle;
      ctx2d.lineWidth = 1;

      if (ghost.shape === 'circle' || ghost.shape === 'dot') {
        const r = ghost.shape === 'dot' ? Math.max(hw, 4) : hw;
        const ry = ghost.shape === 'dot' ? Math.max(hh, 4) : hh;
        ctx2d.beginPath();
        ctx2d.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.stroke();
      } else {
        ctx2d.beginPath();
        if (ctx2d.roundRect) {
          ctx2d.roundRect(-hw, -hh, ghost.w, ghost.h, 4);
        } else {
          ctx2d.rect(-hw, -hh, ghost.w, ghost.h);
        }
        ctx2d.fill();
        ctx2d.stroke();
      }

      ctx2d.restore();
    }

    canvasAnimId = requestAnimationFrame(frame);
  }

  canvasAnimId = requestAnimationFrame(frame);
}

/**
 * Crea el overlay transparente con canvas para la animación.
 * @param {number} durationMs — duración total de la animación
 */
function createOverlay(durationMs) {
  // Overlay transparente que captura interacción y contiene el canvas
  const overlay = document.createElement('div');
  overlay.id = 'easter-egg-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'z-index: 9999',
    'background: rgba(5, 5, 15, 0)',
    'cursor: default',
    'touch-action: none',
    'opacity: 0',
    'transition: opacity 0.8s ease-in',
    'pointer-events: auto',
    'overflow: hidden',
  ].join(';');

  // Canvas para renderizar fantasmas (1 sola capa GPU vs N elementos DOM)
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
  overlay.appendChild(canvas);

  const hint = document.createElement('div');
  hint.textContent = '\u{1F50A} doble click o Esc para cerrar';
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

  // Forzar reflow para que el navegador procese opacity:0 antes de animar a 1
  void overlay.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  });

  // ── Tracking del atractor (solo al arrastrar: click+move / touch drag) ──
  let pointerIsDown = false;
  overlay.addEventListener('pointerdown', (ev) => {
    pointerIsDown = true;
    attractorX = ev.clientX;
    attractorY = ev.clientY;
    attractorActive = true;
    overlay.setPointerCapture(ev.pointerId);
  });
  overlay.addEventListener('pointermove', (ev) => {
    if (!pointerIsDown) return;  // sin click/touch → sin atracción
    attractorX = ev.clientX;
    attractorY = ev.clientY;
    attractorActive = true;
  });
  overlay.addEventListener('pointerup', () => {
    pointerIsDown = false;
    attractorActive = false;
  });
  overlay.addEventListener('pointerleave', () => {
    pointerIsDown = false;
    attractorActive = false;
  });
  overlay.addEventListener('pointercancel', () => {
    pointerIsDown = false;
    attractorActive = false;
  });

  return { overlay, canvas };
}


// ═══════════════════════════════════════════════════════════════════════════
//  ORQUESTACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detiene y limpia todo el Easter egg.
 */
function cleanup(audioCtx) {
  isPlaying = false;

  // Cancelar animación canvas
  if (canvasAnimId) {
    cancelAnimationFrame(canvasAnimId);
    canvasAnimId = 0;
  }

  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }

  // Desregistrar listener de Escape
  if (_onKeyDown) {
    document.removeEventListener('keydown', _onKeyDown);
    _onKeyDown = null;
  }

  // Resetear atractor
  attractorActive = false;

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
 * Doble click en el overlay o Esc para cerrar antes de tiempo.
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
    const { overlay, canvas } = createOverlay(durationMs);
    overlayEl = overlay;

    const ghostData = gatherGhosts();
    startCanvasAnimation(canvas, ghostData, durationMs, overlay);

    // Cerrar con doble click (retraso para evitar cierre accidental)
    setTimeout(() => {
      if (overlayEl) {
        overlayEl.addEventListener('dblclick', () => cleanup(ctx), { once: true });
      }
    }, 600);

    // Cerrar con Escape
    _onKeyDown = (ev) => {
      if (ev.key === 'Escape') cleanup(ctx);
    };
    document.addEventListener('keydown', _onKeyDown);

    // Auto-limpieza al terminar (música + fade-out visual)
    setTimeout(() => {
      if (isPlaying) cleanup(ctx);
    }, (totalDurationSec + FADE_OUT_MS / 1000 + 1.5) * 1000);

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
