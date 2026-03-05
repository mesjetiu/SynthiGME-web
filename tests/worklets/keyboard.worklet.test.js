/**
 * Tests para keyboard.worklet.js — AudioWorkletProcessor del Keyboard Module
 * 
 * Verifica la lógica del procesador de audio de los teclados:
 * 
 * 1. MATEMÁTICA OFFLINE: Replica las funciones de conversión del worklet
 *    (_recalcPitch, _recalcVelocity, _computeGateVoltage)
 *    y verifica los mapeos sin instanciar el worklet.
 * 
 * 2. HIGH-NOTE PRIORITY: Siempre suena la nota más aguda.
 * 
 * 3. SAMPLE & HOLD: Pitch y velocity se mantienen al soltar teclas.
 * 
 * 4. RETRIGGER: Gap de ~2ms en gate para retrigger de envolventes.
 * 
 * Referencia: Datanomics 1982, teclados duales Synthi 100 de Cuenca
 * 
 * @version 1.0.0
 */

import { describe, test, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES (deben coincidir con keyboard.worklet.js)
// ═══════════════════════════════════════════════════════════════════════════

const PIVOT_NOTE = 66;         // F#3
const SPREAD_UNITY = 9;        // 1V/Oct
const SEMITONES_PER_OCTAVE = 12;
const VELOCITY_RANGE_V = 7;    // ±3.5V
const RETRIGGER_GAP_SAMPLES = 96;
const SAMPLE_RATE = 48000;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula el voltaje de pitch.
 * Fórmula: ((note - PIVOT) / 12) * (spread / SPREAD_UNITY) + offset
 */
function recalcPitch(note, spread, offset = 0, invert = false) {
  if (note === null) return offset;
  let v = ((note - PIVOT_NOTE) / SEMITONES_PER_OCTAVE) * (spread / SPREAD_UNITY);
  if (invert) v = -v;
  v += offset;
  return v;
}

/**
 * Calcula el voltaje de velocity.
 * Base: (vel/127)*7 - 3.5 → [-3.5, +3.5]
 * Factor: velocityLevel/5 → [-1, +1]
 */
function recalcVelocity(velocity, velocityLevel) {
  const base = (velocity / 127) * VELOCITY_RANGE_V - (VELOCITY_RANGE_V / 2);
  const factor = velocityLevel / 5;
  return base * factor;
}

/**
 * Calcula el voltaje de gate.
 * gate ON → +|gateLevel/5|, gate OFF → -|gateLevel/5|
 */
function computeGateVoltage(on, gateLevel) {
  const level = gateLevel / 5;
  return on ? Math.abs(level) : -Math.abs(level);
}

/**
 * Obtiene la nota más alta de un set.
 */
function getHighestNote(keysPressed) {
  let max = -1;
  for (const n of keysPressed) {
    if (n > max) max = n;
  }
  return max;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1: PITCH — Conversión nota → voltaje
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Pitch', () => {
  
  test('nota pivote F#3 (66) → 0V a spread=9', () => {
    const v = recalcPitch(66, 9);
    assert.strictEqual(v, 0);
  });

  test('F#4 (78) → +1V a spread=9 (1V/Oct)', () => {
    const v = recalcPitch(78, 9);
    assert.ok(Math.abs(v - 1) < 1e-10, `Expected 1V, got ${v}`);
  });
  
  test('F#2 (54) → -1V a spread=9 (1V/Oct)', () => {
    const v = recalcPitch(54, 9);
    assert.ok(Math.abs(v - (-1)) < 1e-10, `Expected -1V, got ${v}`);
  });
  
  test('spread=0 → todas las notas dan ~0V', () => {
    const v1 = recalcPitch(60, 0);
    const v2 = recalcPitch(72, 0);
    assert.strictEqual(v1, 0);
    assert.strictEqual(v2, 0);
  });
  
  test('spread=10 → intervalo expandido (>1V/Oct)', () => {
    const v = recalcPitch(78, 10);
    assert.ok(v > 1, `Expected > 1V, got ${v}`);
  });
  
  test('offset se suma al pitch', () => {
    const v = recalcPitch(66, 9, 2.5);
    assert.ok(Math.abs(v - 2.5) < 1e-10);
  });
  
  test('invert invierte la polaridad del pitch (sin offset)', () => {
    const normal = recalcPitch(78, 9);
    const inverted = recalcPitch(78, 9, 0, true);
    assert.ok(Math.abs(normal + inverted) < 1e-10);
  });
  
  test('nota null con offset devuelve solo offset', () => {
    const v = recalcPitch(null, 9, 3);
    assert.strictEqual(v, 3);
  });
  
  test('1 semitono → 1/12 V a spread=9', () => {
    const v = recalcPitch(67, 9); // F#3 + 1 semitono
    const expected = 1 / SEMITONES_PER_OCTAVE;
    assert.ok(Math.abs(v - expected) < 1e-10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: VELOCITY — Conversión velocity → voltaje
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Velocity', () => {
  
  test('velocity 0 con level +5 → -3.5V', () => {
    const v = recalcVelocity(0, 5);
    assert.ok(Math.abs(v - (-3.5)) < 1e-10);
  });
  
  test('velocity 127 con level +5 → +3.5V', () => {
    const v = recalcVelocity(127, 5);
    assert.ok(Math.abs(v - 3.5) < 1e-10);
  });
  
  test('velocity ~64 con level +5 → ~0V', () => {
    const v = recalcVelocity(63.5, 5);
    assert.ok(Math.abs(v) < 0.05, `Expected ~0V, got ${v}`);
  });
  
  test('velocityLevel 0 → sin efecto de velocity', () => {
    const v = recalcVelocity(127, 0);
    assert.strictEqual(v, 0);
  });
  
  test('velocityLevel negativo invierte la polaridad', () => {
    const vPos = recalcVelocity(127, 5);
    const vNeg = recalcVelocity(127, -5);
    assert.ok(Math.abs(vPos + vNeg) < 1e-10);
  });
  
  test('rango total es ±3.5V (7V p-p) a level=5', () => {
    const vMin = recalcVelocity(0, 5);
    const vMax = recalcVelocity(127, 5);
    assert.ok(Math.abs((vMax - vMin) - VELOCITY_RANGE_V) < 1e-10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: GATE — Voltaje de gate
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Gate', () => {
  
  test('gate ON con level +5 → +1 (normalizado)', () => {
    const v = computeGateVoltage(true, 5);
    assert.strictEqual(v, 1);
  });
  
  test('gate OFF con level +5 → -1 (normalizado)', () => {
    const v = computeGateVoltage(false, 5);
    assert.strictEqual(v, -1);
  });
  
  test('gate ON con level -5 → +1 (abs)', () => {
    const v = computeGateVoltage(true, -5);
    assert.strictEqual(v, 1);
  });
  
  test('gate OFF con level -5 → -1 (abs negativo)', () => {
    const v = computeGateVoltage(false, -5);
    assert.strictEqual(v, -1);
  });
  
  test('gate level 0 → 0V en ambos estados', () => {
    assert.ok(Object.is(computeGateVoltage(true, 0), 0) || computeGateVoltage(true, 0) === 0);
    // -0 === 0 en JS, pero strictEqual distingue. Usar == o Math.abs
    assert.strictEqual(Math.abs(computeGateVoltage(false, 0)), 0);
  });
  
  test('gate level 2.5 → ±0.5V normalizado', () => {
    assert.strictEqual(computeGateVoltage(true, 2.5), 0.5);
    assert.strictEqual(computeGateVoltage(false, 2.5), -0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 4: HIGH-NOTE PRIORITY
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — High-note priority', () => {
  
  test('nota más alta de un conjunto', () => {
    const keys = new Set([60, 64, 67, 72]);
    assert.strictEqual(getHighestNote(keys), 72);
  });
  
  test('una sola nota devuelve esa nota', () => {
    const keys = new Set([60]);
    assert.strictEqual(getHighestNote(keys), 60);
  });
  
  test('set vacío devuelve -1', () => {
    const keys = new Set();
    assert.strictEqual(getHighestNote(keys), -1);
  });
  
  test('notas añadidas en orden descendente', () => {
    const keys = new Set([72, 67, 60]);
    assert.strictEqual(getHighestNote(keys), 72);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 5: SAMPLE & HOLD (simulación de estado)
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Sample & Hold', () => {
  let state;

  beforeEach(() => {
    state = {
      keysPressed: new Set(),
      currentPitch: null,
      currentVelocity: 0,
      gateOn: false,
      pitchSpread: 9,
      velocityLevel: 5,
      gateLevel: 5,
      retrigger: 0
    };
  });

  function noteOn(note, velocity) {
    const lastPitch = state.currentPitch;
    state.keysPressed.add(note);
    const maxNote = getHighestNote(state.keysPressed);
    state.currentPitch = maxNote;
    if (state.keysPressed.size === 1 || maxNote > (lastPitch ?? 0)) {
      state.currentVelocity = velocity;
    }
    state.gateOn = true;
  }

  function noteOff(note) {
    state.keysPressed.delete(note);
    if (state.keysPressed.size === 0) {
      state.gateOn = false;
    } else {
      const maxNote = getHighestNote(state.keysPressed);
      state.currentPitch = maxNote;
    }
  }

  test('pitch se mantiene tras note off (S&H)', () => {
    noteOn(72, 100);
    const pitchBefore = recalcPitch(state.currentPitch, state.pitchSpread);
    noteOff(72);
    const pitchAfter = recalcPitch(state.currentPitch, state.pitchSpread);
    // Pitch debe mantenerse incluso con gate off
    assert.strictEqual(state.currentPitch, 72);
    assert.strictEqual(pitchBefore, pitchAfter);
    assert.strictEqual(state.gateOn, false);
  });
  
  test('velocity se mantiene tras note off (S&H)', () => {
    noteOn(60, 80);
    assert.strictEqual(state.currentVelocity, 80);
    noteOff(60);
    assert.strictEqual(state.currentVelocity, 80); // no se resetea
  });
  
  test('nota baja no cambia velocity (solo nota más alta la cambia)', () => {
    noteOn(72, 100);
    noteOn(60, 50); // nota más baja → velocity no cambia
    assert.strictEqual(state.currentVelocity, 100);
  });
  
  test('nota más alta sí cambia velocity', () => {
    noteOn(60, 50);
    noteOn(72, 100); // nota más alta → velocity cambia
    assert.strictEqual(state.currentVelocity, 100);
  });
  
  test('soltar nota alta con nota baja retenida → pitch baja', () => {
    noteOn(60, 80);
    noteOn(72, 100);
    assert.strictEqual(state.currentPitch, 72);
    noteOff(72); // soltar la alta
    assert.strictEqual(state.currentPitch, 60); // vuelve a la baja
    assert.strictEqual(state.gateOn, true); // gate sigue ON
  });
  
  test('soltar todas las teclas → gate OFF, pitch se mantiene', () => {
    noteOn(60, 80);
    noteOn(72, 100);
    noteOff(72);
    noteOff(60);
    assert.strictEqual(state.gateOn, false);
    assert.strictEqual(state.currentPitch, 60); // S&H de la última nota
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 6: RETRIGGER GAP
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Retrigger gap', () => {
  
  test('retrigger gap es ~2ms a 48kHz', () => {
    const gapMs = RETRIGGER_GAP_SAMPLES / SAMPLE_RATE * 1000;
    assert.ok(Math.abs(gapMs - 2) < 0.1, `Expected ~2ms, got ${gapMs}ms`);
  });
  
  test('retrigger gap es 96 samples', () => {
    assert.strictEqual(RETRIGGER_GAP_SAMPLES, 96);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 7: CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Constantes', () => {
  
  test('PIVOT_NOTE es 66 (F#3)', () => {
    assert.strictEqual(PIVOT_NOTE, 66);
  });
  
  test('SPREAD_UNITY es 9', () => {
    assert.strictEqual(SPREAD_UNITY, 9);
  });
  
  test('SEMITONES_PER_OCTAVE es 12', () => {
    assert.strictEqual(SEMITONES_PER_OCTAVE, 12);
  });
  
  test('VELOCITY_RANGE_V es 7 (±3.5V)', () => {
    assert.strictEqual(VELOCITY_RANGE_V, 7);
  });
});
