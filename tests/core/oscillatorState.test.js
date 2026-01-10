/**
 * Tests para core/oscillatorState.js
 * 
 * Verifica la gestión del estado de osciladores.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_OSC_STATE,
  getOrCreateOscState
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

  it('freq tiene valor inicial razonable (> 0)', () => {
    assert.ok(typeof DEFAULT_OSC_STATE.freq === 'number');
    assert.ok(DEFAULT_OSC_STATE.freq > 0);
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
