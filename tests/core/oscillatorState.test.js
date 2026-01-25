/**
 * Tests para core/oscillatorState.js
 * 
 * Verifica la gestión del estado de osciladores.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_OSC_STATE,
  getOrCreateOscState,
  createInitialOscState
} from '../../src/assets/js/core/oscillatorState.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_OSC_STATE
// ─────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_OSC_STATE', () => {
  it('tiene todas las propiedades requeridas', () => {
    const requiredProps = [
      'freq',
      'oscLevel',
      'sawLevel',
      'triLevel',
      'pulseLevel',
      'pulseWidth',
      'sineSymmetry'
    ];
    
    for (const prop of requiredProps) {
      assert.ok(prop in DEFAULT_OSC_STATE, `Falta propiedad: ${prop}`);
    }
  });

  it('freq tiene valor inicial de 261 Hz (dial=5, C4)', () => {
    assert.ok(typeof DEFAULT_OSC_STATE.freq === 'number');
    // 261 Hz corresponde a dial=5 en rango HI (Do central, C4)
    assert.strictEqual(DEFAULT_OSC_STATE.freq, 261);
  });

  it('todos los niveles de onda están en 0 por defecto', () => {
    assert.strictEqual(DEFAULT_OSC_STATE.oscLevel, 0);
    assert.strictEqual(DEFAULT_OSC_STATE.sawLevel, 0);
    assert.strictEqual(DEFAULT_OSC_STATE.triLevel, 0);
    assert.strictEqual(DEFAULT_OSC_STATE.pulseLevel, 0);
  });

  it('pulseWidth está centrado en 0.5 (onda cuadrada)', () => {
    assert.strictEqual(DEFAULT_OSC_STATE.pulseWidth, 0.5);
  });

  it('sineSymmetry está centrado en 0.5 (seno puro)', () => {
    assert.strictEqual(DEFAULT_OSC_STATE.sineSymmetry, 0.5);
  });

  it('todos los valores son números', () => {
    for (const [key, value] of Object.entries(DEFAULT_OSC_STATE)) {
      assert.ok(
        typeof value === 'number',
        `${key} debería ser number, es ${typeof value}`
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createInitialOscState
// ─────────────────────────────────────────────────────────────────────────────

describe('createInitialOscState', () => {
  it('crea estado con valores derivados de la config por defecto', () => {
    const state = createInitialOscState();
    
    assert.ok('freq' in state);
    assert.ok('oscLevel' in state);
    assert.ok('sawLevel' in state);
    assert.ok('triLevel' in state);
    assert.ok('pulseLevel' in state);
    assert.ok('pulseWidth' in state);
    assert.ok('sineSymmetry' in state);
  });

  it('freq corresponde a dial=5 en rango HI (~261 Hz)', () => {
    const state = createInitialOscState();
    // Tolerancia del 5% para variaciones de tracking
    assert.ok(state.freq > 240 && state.freq < 280, `freq=${state.freq} debería ser ~261`);
  });

  it('freq es ~10x menor en rango LO', () => {
    const stateHI = createInitialOscState(null, false);
    const stateLO = createInitialOscState(null, true);
    
    // En rango LO, la frecuencia es 1/10 del rango HI
    const ratio = stateHI.freq / stateLO.freq;
    assert.ok(ratio > 9 && ratio < 11, `ratio=${ratio} debería ser ~10`);
  });

  it('respeta valores iniciales de config personalizada', () => {
    const customConfig = {
      pulseLevel: { initial: 0.7 },
      pulseWidth: { initial: 0.3 },
      sineLevel: { initial: 0.5 },
      sineSymmetry: { initial: 0.8 },
      triangleLevel: { initial: 0.2 },
      sawtoothLevel: { initial: 0.4 },
      frequency: { initial: 7 }  // dial=7 debería dar ~1000 Hz
    };
    
    const state = createInitialOscState(customConfig);
    
    assert.strictEqual(state.pulseLevel, 0.7);
    assert.strictEqual(state.pulseWidth, 0.3);
    assert.strictEqual(state.oscLevel, 0.5);
    assert.strictEqual(state.sineSymmetry, 0.8);
    assert.strictEqual(state.triLevel, 0.2);
    assert.strictEqual(state.sawLevel, 0.4);
    // dial=7 debería dar frecuencia mayor que dial=5
    assert.ok(state.freq > 500, `freq=${state.freq} debería ser >500 Hz para dial=7`);
  });

  it('cada llamada crea objeto independiente', () => {
    const state1 = createInitialOscState();
    const state2 = createInitialOscState();
    
    state1.freq = 9999;
    
    assert.notStrictEqual(state2.freq, 9999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOrCreateOscState
// ─────────────────────────────────────────────────────────────────────────────

describe('getOrCreateOscState', () => {
  it('crea state array si no existe', () => {
    const panelAudio = {};
    getOrCreateOscState(panelAudio, 0);
    
    assert.ok(Array.isArray(panelAudio.state));
  });

  it('crea estado con defaults para índice nuevo', () => {
    const panelAudio = {};
    const state = getOrCreateOscState(panelAudio, 0);
    
    assert.deepStrictEqual(state, DEFAULT_OSC_STATE);
  });

  it('retorna el mismo estado si ya existe', () => {
    const panelAudio = { state: [] };
    const existingState = { freq: 440, oscLevel: 0.5 };
    panelAudio.state[0] = existingState;
    
    const result = getOrCreateOscState(panelAudio, 0);
    
    assert.strictEqual(result, existingState);
  });

  it('no sobrescribe estados existentes', () => {
    const panelAudio = { state: [] };
    panelAudio.state[0] = { freq: 100 };
    panelAudio.state[2] = { freq: 300 };
    
    // Crear estado en índice 1
    getOrCreateOscState(panelAudio, 1);
    
    // Verificar que 0 y 2 no cambiaron
    assert.strictEqual(panelAudio.state[0].freq, 100);
    assert.strictEqual(panelAudio.state[2].freq, 300);
  });

  it('maneja índices no contiguos (sparse array)', () => {
    const panelAudio = {};
    
    getOrCreateOscState(panelAudio, 5);
    
    assert.ok(panelAudio.state[5] !== undefined);
    assert.strictEqual(panelAudio.state[0], undefined);
  });

  it('crea copias independientes del estado default', () => {
    const panelAudio = {};
    
    const state0 = getOrCreateOscState(panelAudio, 0);
    const state1 = getOrCreateOscState(panelAudio, 1);
    
    // Modificar uno no afecta al otro
    state0.freq = 999;
    
    assert.notStrictEqual(state0.freq, state1.freq);
    assert.strictEqual(state1.freq, DEFAULT_OSC_STATE.freq);
  });

  it('no muta DEFAULT_OSC_STATE', () => {
    const originalFreq = DEFAULT_OSC_STATE.freq;
    const panelAudio = {};
    
    const state = getOrCreateOscState(panelAudio, 0);
    state.freq = 12345;
    
    assert.strictEqual(DEFAULT_OSC_STATE.freq, originalFreq);
  });

  it('preserva el array state existente', () => {
    const existingState = [{ freq: 100 }, { freq: 200 }];
    const panelAudio = { state: existingState };
    
    getOrCreateOscState(panelAudio, 3);
    
    assert.strictEqual(panelAudio.state, existingState);
    assert.strictEqual(panelAudio.state[0].freq, 100);
    assert.strictEqual(panelAudio.state[1].freq, 200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Casos de uso típicos
// ─────────────────────────────────────────────────────────────────────────────

describe('Casos de uso típicos', () => {
  it('inicialización de 12 osciladores', () => {
    const panelAudio = {};
    
    for (let i = 0; i < 12; i++) {
      getOrCreateOscState(panelAudio, i);
    }
    
    assert.strictEqual(panelAudio.state.length, 12);
    
    // Todos deberían tener valores default
    for (let i = 0; i < 12; i++) {
      assert.strictEqual(panelAudio.state[i].freq, DEFAULT_OSC_STATE.freq);
    }
  });

  it('acceso repetido al mismo oscilador mantiene cambios', () => {
    const panelAudio = {};
    
    // Primera vez: crear
    const state1 = getOrCreateOscState(panelAudio, 0);
    state1.freq = 440;
    state1.oscLevel = 0.8;
    
    // Segunda vez: recuperar
    const state2 = getOrCreateOscState(panelAudio, 0);
    
    assert.strictEqual(state2.freq, 440);
    assert.strictEqual(state2.oscLevel, 0.8);
  });
});
