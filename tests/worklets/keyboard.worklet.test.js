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
const DIGITAL_TO_VOLTAGE = 4.0; // 1 digital = 4V (coincide con voltageConstants.js)
const RETRIGGER_GAP_SAMPLES = 96;
const SAMPLE_RATE = 48000;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES REPLICADAS DEL WORKLET (tests offline)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula el voltaje de pitch en unidades digitales.
 * Fórmula: ((note - PIVOT) / 12) * (spread / SPREAD_UNITY) + offset
 *          Todo dividido por DIGITAL_TO_VOLTAGE (4.0)
 */
function recalcPitch(note, spread, offset = 0, invert = false) {
  if (note === null) return offset / DIGITAL_TO_VOLTAGE;
  let v = ((note - PIVOT_NOTE) / SEMITONES_PER_OCTAVE) * (spread / SPREAD_UNITY);
  if (invert) v = -v;
  v += offset;
  return v / DIGITAL_TO_VOLTAGE;
}

/**
 * Calcula el voltaje de velocity.
 * Fórmula: (vel/127) * velocityLevel
 * Dial +5 → hasta +5V, dial 0 → 0V, dial -5 → inversión hasta -5V.
 */
function recalcVelocity(velocity, velocityLevel) {
  return (velocity / 127) * velocityLevel;
}

/**
 * Calcula el voltaje de gate.
 * gate ON → +gateLevel, gate OFF → 0V (sin memoria)
 */
function computeGateVoltage(on, gateLevel) {
  return on ? gateLevel : 0;
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

  test('F#4 (78) → 0.25 digital a spread=9 (1V/Oct = 0.25 digital/Oct)', () => {
    const v = recalcPitch(78, 9);
    assert.ok(Math.abs(v - 0.25) < 1e-10, `Expected 0.25 digital (1V), got ${v}`);
  });
  
  test('F#2 (54) → -0.25 digital a spread=9 (1V/Oct)', () => {
    const v = recalcPitch(54, 9);
    assert.ok(Math.abs(v - (-0.25)) < 1e-10, `Expected -0.25 digital (-1V), got ${v}`);
  });
  
  test('spread=0 → todas las notas dan ~0V', () => {
    const v1 = recalcPitch(60, 0);
    const v2 = recalcPitch(72, 0);
    assert.strictEqual(v1, 0);
    assert.strictEqual(v2, 0);
  });
  
  test('spread=10 → intervalo expandido (>0.25 digital/Oct)', () => {
    const v = recalcPitch(78, 10);
    assert.ok(v > 0.25, `Expected > 0.25 digital, got ${v}`);
  });
  
  test('offset se suma al pitch (dividido por DIGITAL_TO_VOLTAGE)', () => {
    const v = recalcPitch(66, 9, 2.5);
    assert.ok(Math.abs(v - 2.5 / DIGITAL_TO_VOLTAGE) < 1e-10);
  });
  
  test('invert invierte la polaridad del pitch (sin offset)', () => {
    const normal = recalcPitch(78, 9);
    const inverted = recalcPitch(78, 9, 0, true);
    assert.ok(Math.abs(normal + inverted) < 1e-10);
  });
  
  test('nota null con offset devuelve solo offset / DIGITAL_TO_VOLTAGE', () => {
    const v = recalcPitch(null, 9, 3);
    assert.ok(Math.abs(v - 3 / DIGITAL_TO_VOLTAGE) < 1e-10);
  });
  
  test('1 semitono → 1/48 digital a spread=9 (1/12 V / 4)', () => {
    const v = recalcPitch(67, 9); // F#3 + 1 semitono
    const expected = 1 / SEMITONES_PER_OCTAVE / DIGITAL_TO_VOLTAGE;
    assert.ok(Math.abs(v - expected) < 1e-10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2: VELOCITY — Conversión velocity → voltaje
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Velocity', () => {
  
  test('velocity 0 con level +5 → 0V (sin pulsación)', () => {
    const v = recalcVelocity(0, 5);
    assert.strictEqual(v, 0);
  });
  
  test('velocity 127 con level +5 → +5V (máximo positivo)', () => {
    const v = recalcVelocity(127, 5);
    assert.ok(Math.abs(v - 5) < 1e-10);
  });
  
  test('velocity 127 con level -5 → -5V (inversión: louder→softer)', () => {
    const v = recalcVelocity(127, -5);
    assert.ok(Math.abs(v - (-5)) < 1e-10);
  });
  
  test('velocityLevel 0 → sin efecto de velocity (0V siempre)', () => {
    const v = recalcVelocity(127, 0);
    assert.strictEqual(v, 0);
  });
  
  test('velocityLevel negativo invierte la polaridad', () => {
    const vPos = recalcVelocity(127, 5);
    const vNeg = recalcVelocity(127, -5);
    assert.ok(Math.abs(vPos + vNeg) < 1e-10);
  });
  
  test('velocity media (64) con level +5 → ~2.52V', () => {
    const v = recalcVelocity(64, 5);
    assert.ok(Math.abs(v - (64/127)*5) < 1e-10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 3: GATE — Voltaje de gate
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard Worklet — Gate', () => {
  
  test('gate ON con level +5 → +5V', () => {
    const v = computeGateVoltage(true, 5);
    assert.strictEqual(v, 5);
  });
  
  test('gate OFF con level +5 → 0V (sin memoria)', () => {
    const v = computeGateVoltage(false, 5);
    assert.strictEqual(v, 0);
  });
  
  test('gate ON con level -5 → -5V (invertido)', () => {
    const v = computeGateVoltage(true, -5);
    assert.strictEqual(v, -5);
  });
  
  test('gate OFF con level -5 → 0V', () => {
    const v = computeGateVoltage(false, -5);
    assert.strictEqual(v, 0);
  });
  
  test('gate level 0 → 0V en ambos estados', () => {
    assert.strictEqual(computeGateVoltage(true, 0), 0);
    assert.strictEqual(computeGateVoltage(false, 0), 0);
  });
  
  test('gate level 2.5 → ON=+2.5V, OFF=0V', () => {
    assert.strictEqual(computeGateVoltage(true, 2.5), 2.5);
    assert.strictEqual(computeGateVoltage(false, 2.5), 0);
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
// PARTE 6b: RETRIGGER MODES (lógica de disparo)
// ═══════════════════════════════════════════════════════════════════════════
//
// Simula la lógica del worklet para verificar cuándo se produce retrigger
// según el modo seleccionado (0=Kbd: Key Release, 1=On: New Pitch).

describe('Keyboard Worklet — Retrigger modes', () => {
  let state;

  beforeEach(() => {
    state = {
      keysPressed: new Set(),
      currentPitch: null,
      gateOn: false,
      retrigger: 0,        // 0=Kbd, 1=On
      retriggerFired: false // flag para detectar retrigger
    };
  });

  /**
   * Simula _handleNoteOn con la lógica corregida del worklet.
   */
  function noteOn(note, velocity = 100) {
    const lastPitch = state.currentPitch;
    state.keysPressed.add(note);
    const maxNote = getHighestNote(state.keysPressed);
    state.currentPitch = maxNote;
    state.retriggerFired = false;

    if (!state.gateOn) {
      state.gateOn = true;
    } else if (state.retrigger === 1 && maxNote !== lastPitch) {
      state.retriggerFired = true;
    }
  }

  /**
   * Simula _handleNoteOff con la lógica corregida del worklet.
   */
  function noteOff(note) {
    state.keysPressed.delete(note);
    state.retriggerFired = false;

    if (state.keysPressed.size === 0) {
      state.gateOn = false;
    } else {
      const maxNote = getHighestNote(state.keysPressed);
      if (maxNote !== state.currentPitch) {
        state.currentPitch = maxNote;
        if (state.retrigger === 1) {
          state.retriggerFired = true;
        }
      }
    }
  }

  // ── Mode 0 «Kbd» (Retrigger Key Release) ──

  test('mode 0: primera nota activa gate', () => {
    state.retrigger = 0;
    noteOn(60);
    assert.strictEqual(state.gateOn, true);
    assert.strictEqual(state.retriggerFired, false);
  });

  test('mode 0: nueva nota más alta NO retrigger (legato)', () => {
    state.retrigger = 0;
    noteOn(60);
    noteOn(72); // más alta, pero gate ya estaba ON
    assert.strictEqual(state.gateOn, true);
    assert.strictEqual(state.retriggerFired, false); // ← clave
  });

  test('mode 0: soltar nota alta con baja retenida NO retrigger', () => {
    state.retrigger = 0;
    noteOn(60);
    noteOn(72);
    noteOff(72); // pitch cambia a 60, pero no retrigger en mode 0
    assert.strictEqual(state.gateOn, true);
    assert.strictEqual(state.retriggerFired, false);
  });

  test('mode 0: soltar todas y volver a pulsar SÍ dispara gate', () => {
    state.retrigger = 0;
    noteOn(60);
    noteOff(60); // gate OFF
    assert.strictEqual(state.gateOn, false);
    noteOn(72); // gate ON de nuevo (transición 0→1 tecla)
    assert.strictEqual(state.gateOn, true);
  });

  // ── Mode 1 «On» (Key Release or New Pitch) ──

  test('mode 1: primera nota activa gate sin retrigger', () => {
    state.retrigger = 1;
    noteOn(60);
    assert.strictEqual(state.gateOn, true);
    assert.strictEqual(state.retriggerFired, false); // gate se enciende, no es retrigger
  });

  test('mode 1: nueva nota más alta SÍ retrigger', () => {
    state.retrigger = 1;
    noteOn(60);
    noteOn(72); // pitch cambia → retrigger
    assert.strictEqual(state.retriggerFired, true);
  });

  test('mode 1: nota más baja NO retrigger (pitch no cambia)', () => {
    state.retrigger = 1;
    noteOn(72);
    noteOn(60); // nota más baja, pitch sigue siendo 72 → sin retrigger
    assert.strictEqual(state.retriggerFired, false);
  });

  test('mode 1: soltar nota alta con baja retenida SÍ retrigger', () => {
    state.retrigger = 1;
    noteOn(60);
    noteOn(72);
    noteOff(72); // pitch cambia de 72→60 → retrigger
    assert.strictEqual(state.retriggerFired, true);
    assert.strictEqual(state.gateOn, true);
  });

  test('mode 1: misma nota pulsada dos veces NO retrigger', () => {
    state.retrigger = 1;
    noteOn(60);
    noteOn(60); // Set.add no cambia, pitch sigue igual
    assert.strictEqual(state.retriggerFired, false);
  });

  test('mode 1: soltar nota que no era la más alta NO retrigger', () => {
    state.retrigger = 1;
    noteOn(60);
    noteOn(72);
    noteOff(60); // pitch sigue siendo 72, sin cambio
    assert.strictEqual(state.retriggerFired, false);
    assert.strictEqual(state.gateOn, true);
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
});
