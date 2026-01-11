/**
 * Tests para core/engine.js
 * 
 * Verifica lógica pura del AudioEngine (sin DOM ni AudioContext real):
 * - AUDIO_CONSTANTS: valores de rampa
 * - _generateChannelLabels: etiquetas para 2, 4, 6, 8 canales
 * - _initOutputRoutingMatrix: matriz de routing por defecto (todo a 0)
 * - Stereo bus routing: soporte para valor -1 (desconectado)
 * - Output mute: estado por canal
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AUDIO_CONSTANTS } from '../../src/assets/js/core/engine.js';

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO_CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIO_CONSTANTS', () => {
  
  it('DEFAULT_RAMP_TIME es un número positivo', () => {
    assert.equal(typeof AUDIO_CONSTANTS.DEFAULT_RAMP_TIME, 'number');
    assert.ok(AUDIO_CONSTANTS.DEFAULT_RAMP_TIME > 0);
  });

  it('SLOW_RAMP_TIME es mayor que DEFAULT_RAMP_TIME', () => {
    assert.ok(AUDIO_CONSTANTS.SLOW_RAMP_TIME > AUDIO_CONSTANTS.DEFAULT_RAMP_TIME);
  });

  it('FAST_RAMP_TIME es menor que DEFAULT_RAMP_TIME', () => {
    assert.ok(AUDIO_CONSTANTS.FAST_RAMP_TIME < AUDIO_CONSTANTS.DEFAULT_RAMP_TIME);
  });

  it('todos los tiempos están en rango razonable (1ms - 500ms)', () => {
    const MIN_MS = 0.001; // 1ms
    const MAX_MS = 0.5;   // 500ms
    
    assert.ok(AUDIO_CONSTANTS.DEFAULT_RAMP_TIME >= MIN_MS);
    assert.ok(AUDIO_CONSTANTS.DEFAULT_RAMP_TIME <= MAX_MS);
    assert.ok(AUDIO_CONSTANTS.SLOW_RAMP_TIME >= MIN_MS);
    assert.ok(AUDIO_CONSTANTS.SLOW_RAMP_TIME <= MAX_MS);
    assert.ok(AUDIO_CONSTANTS.FAST_RAMP_TIME >= MIN_MS);
    assert.ok(AUDIO_CONSTANTS.FAST_RAMP_TIME <= MAX_MS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _generateChannelLabels (lógica replicada para testing)
// ═══════════════════════════════════════════════════════════════════════════
// Esta función es privada en AudioEngine, replicamos la lógica para testear.

function generateChannelLabels(count) {
  const labelSets = {
    2: ['L', 'R'],
    4: ['FL', 'FR', 'RL', 'RR'],
    6: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR'],
    8: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR', 'SL', 'SR']
  };
  
  if (labelSets[count]) return labelSets[count];
  return Array.from({ length: count }, (_, i) => `Ch${i + 1}`);
}

describe('generateChannelLabels', () => {
  
  describe('configuraciones estándar', () => {
    
    it('2 canales → L, R (estéreo)', () => {
      const labels = generateChannelLabels(2);
      assert.deepEqual(labels, ['L', 'R']);
    });

    it('4 canales → FL, FR, RL, RR (cuadrafónico)', () => {
      const labels = generateChannelLabels(4);
      assert.deepEqual(labels, ['FL', 'FR', 'RL', 'RR']);
    });

    it('6 canales → 5.1 surround', () => {
      const labels = generateChannelLabels(6);
      assert.deepEqual(labels, ['FL', 'FR', 'C', 'LFE', 'RL', 'RR']);
    });

    it('8 canales → 7.1 surround', () => {
      const labels = generateChannelLabels(8);
      assert.deepEqual(labels, ['FL', 'FR', 'C', 'LFE', 'RL', 'RR', 'SL', 'SR']);
    });
  });

  describe('configuraciones no estándar', () => {
    
    it('1 canal → Ch1', () => {
      const labels = generateChannelLabels(1);
      assert.deepEqual(labels, ['Ch1']);
    });

    it('3 canales → Ch1, Ch2, Ch3', () => {
      const labels = generateChannelLabels(3);
      assert.deepEqual(labels, ['Ch1', 'Ch2', 'Ch3']);
    });

    it('5 canales → Ch1..Ch5', () => {
      const labels = generateChannelLabels(5);
      assert.equal(labels.length, 5);
      assert.equal(labels[0], 'Ch1');
      assert.equal(labels[4], 'Ch5');
    });

    it('12 canales → Ch1..Ch12', () => {
      const labels = generateChannelLabels(12);
      assert.equal(labels.length, 12);
      assert.equal(labels[0], 'Ch1');
      assert.equal(labels[11], 'Ch12');
    });
  });

  describe('edge cases', () => {
    
    it('0 canales → array vacío', () => {
      const labels = generateChannelLabels(0);
      assert.deepEqual(labels, []);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// _initOutputRoutingMatrix (lógica replicada para testing)
// ═══════════════════════════════════════════════════════════════════════════
// Matriz de routing por defecto: todo a 0 (audio fluye por stereo buses).

function initOutputRoutingMatrix(outputChannels, channelCount) {
  const matrix = [];
  for (let bus = 0; bus < outputChannels; bus++) {
    // Todo a 0 por defecto (el audio fluye por stereo buses, no por routing directo)
    const channelGains = Array(channelCount).fill(0);
    matrix.push(channelGains);
  }
  return matrix;
}

describe('initOutputRoutingMatrix', () => {
  
  it('crea matriz de 8 buses × 2 canales', () => {
    const matrix = initOutputRoutingMatrix(8, 2);
    assert.equal(matrix.length, 8);
    matrix.forEach(row => {
      assert.equal(row.length, 2);
    });
  });

  it('todos los valores son 0 por defecto', () => {
    const matrix = initOutputRoutingMatrix(8, 2);
    matrix.forEach(row => {
      row.forEach(gain => {
        assert.equal(gain, 0);
      });
    });
  });

  it('bus 0 NO tiene routing a canal 0 por defecto (cambio de comportamiento)', () => {
    // Antes: bus 0 → canal 0, bus 1 → canal 1
    // Ahora: todo a 0 (audio va por stereo buses)
    const matrix = initOutputRoutingMatrix(8, 2);
    assert.equal(matrix[0][0], 0, 'Bus 0 no debe rutear a canal 0');
    assert.equal(matrix[1][1], 0, 'Bus 1 no debe rutear a canal 1');
  });

  it('funciona con más canales físicos (8 canales)', () => {
    const matrix = initOutputRoutingMatrix(8, 8);
    assert.equal(matrix.length, 8);
    matrix.forEach(row => {
      assert.equal(row.length, 8);
      row.forEach(gain => assert.equal(gain, 0));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stereo Bus Routing - validación de valores
// ═══════════════════════════════════════════════════════════════════════════
// El routing de stereo buses acepta -1 como "desconectado".

describe('Stereo Bus Routing - lógica de valores', () => {
  
  // Simula la lógica de validación de setStereoBusRouting
  function isValidChannel(channel, maxChannels) {
    // -1 = desconectado (válido)
    // >= 0 y < maxChannels = canal válido
    return channel === -1 || (channel >= 0 && channel < maxChannels);
  }

  function shouldConnect(channel) {
    return channel >= 0;
  }

  it('canal -1 es válido (desconectado)', () => {
    assert.ok(isValidChannel(-1, 2));
    assert.ok(isValidChannel(-1, 8));
  });

  it('canal 0 es válido', () => {
    assert.ok(isValidChannel(0, 2));
  });

  it('canal 1 es válido para 2 canales', () => {
    assert.ok(isValidChannel(1, 2));
  });

  it('canal 2 NO es válido para 2 canales', () => {
    assert.ok(!isValidChannel(2, 2));
  });

  it('canal -1 NO debe conectar', () => {
    assert.ok(!shouldConnect(-1));
  });

  it('canal 0 SÍ debe conectar', () => {
    assert.ok(shouldConnect(0));
  });

  it('canal 7 SÍ debe conectar', () => {
    assert.ok(shouldConnect(7));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Output Mute - lógica de estado
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Mute - lógica de estado', () => {
  
  // Simula el array outputMutes del engine
  function createMuteState(channelCount) {
    return Array.from({ length: channelCount }, () => false);
  }

  function setMute(muteState, busIndex, muted) {
    if (busIndex < 0 || busIndex >= muteState.length) return;
    muteState[busIndex] = muted;
  }

  function getMute(muteState, busIndex) {
    return muteState[busIndex] ?? false;
  }

  // Simula la lógica del muteNode (gain 0 o 1)
  function getMuteNodeGain(muted) {
    return muted ? 0 : 1;
  }

  it('estado inicial: todos los canales sin mute', () => {
    const state = createMuteState(8);
    assert.equal(state.length, 8);
    state.forEach(muted => assert.equal(muted, false));
  });

  it('setMute cambia el estado de un canal', () => {
    const state = createMuteState(8);
    setMute(state, 0, true);
    assert.equal(state[0], true);
    assert.equal(state[1], false);
  });

  it('getMute devuelve el estado correcto', () => {
    const state = createMuteState(8);
    state[3] = true;
    assert.equal(getMute(state, 3), true);
    assert.equal(getMute(state, 4), false);
  });

  it('getMute devuelve false para índice fuera de rango', () => {
    const state = createMuteState(8);
    assert.equal(getMute(state, 100), false);
    assert.equal(getMute(state, -1), false);
  });

  it('setMute ignora índices fuera de rango', () => {
    const state = createMuteState(8);
    setMute(state, 100, true);
    setMute(state, -1, true);
    // No debe haber crasheado y el estado original se mantiene
    assert.equal(state.length, 8);
  });

  describe('muteNode gain', () => {
    
    it('muted=true → gain=0', () => {
      assert.equal(getMuteNodeGain(true), 0);
    });

    it('muted=false → gain=1', () => {
      assert.equal(getMuteNodeGain(false), 1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stereo Bus Routing - estructura de datos
// ═══════════════════════════════════════════════════════════════════════════

describe('Stereo Bus Routing - estructura', () => {
  
  // Simula la estructura stereoBusRouting del engine
  function createStereoBusRouting() {
    return {
      A: [0, 1],  // Pan 1-4: L→Ch0, R→Ch1
      B: [0, 1]   // Pan 5-8: L→Ch0, R→Ch1
    };
  }

  function setStereoBusRouting(routing, busId, leftChannel, rightChannel) {
    if (!routing[busId]) return;
    routing[busId] = [leftChannel, rightChannel];
  }

  function getStereoBusRouting(routing, busId) {
    return routing[busId] ?? [0, 1];
  }

  it('estructura inicial tiene buses A y B', () => {
    const routing = createStereoBusRouting();
    assert.ok(routing.A);
    assert.ok(routing.B);
  });

  it('cada bus tiene [L, R] = [0, 1] por defecto', () => {
    const routing = createStereoBusRouting();
    assert.deepEqual(routing.A, [0, 1]);
    assert.deepEqual(routing.B, [0, 1]);
  });

  it('setStereoBusRouting actualiza los canales', () => {
    const routing = createStereoBusRouting();
    setStereoBusRouting(routing, 'A', 2, 3);
    assert.deepEqual(routing.A, [2, 3]);
    assert.deepEqual(routing.B, [0, 1]); // B sin cambios
  });

  it('setStereoBusRouting acepta -1 (desconectado)', () => {
    const routing = createStereoBusRouting();
    setStereoBusRouting(routing, 'A', -1, 1);
    assert.deepEqual(routing.A, [-1, 1]);
  });

  it('setStereoBusRouting acepta ambos desconectados', () => {
    const routing = createStereoBusRouting();
    setStereoBusRouting(routing, 'B', -1, -1);
    assert.deepEqual(routing.B, [-1, -1]);
  });

  it('getStereoBusRouting devuelve el routing actual', () => {
    const routing = createStereoBusRouting();
    routing.A = [4, 5];
    assert.deepEqual(getStereoBusRouting(routing, 'A'), [4, 5]);
  });

  it('getStereoBusRouting devuelve [0,1] para bus inexistente', () => {
    const routing = createStereoBusRouting();
    assert.deepEqual(getStereoBusRouting(routing, 'C'), [0, 1]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Output Level - separación de mute y level
// ═══════════════════════════════════════════════════════════════════════════

describe('Output Level y Mute - separación conceptual', () => {
  
  // El level (fader) y el mute (switch) son independientes
  // El mute NO afecta al valor guardado del level
  
  function createOutputState(channelCount) {
    return {
      levels: Array.from({ length: channelCount }, () => 0.0),
      mutes: Array.from({ length: channelCount }, () => false)
    };
  }

  function setLevel(state, busIndex, level) {
    if (busIndex < 0 || busIndex >= state.levels.length) return;
    state.levels[busIndex] = level;
  }

  function setMute(state, busIndex, muted) {
    if (busIndex < 0 || busIndex >= state.mutes.length) return;
    state.mutes[busIndex] = muted;
  }

  // El nivel efectivo (lo que oye el usuario) considera mute
  function getEffectiveLevel(state, busIndex) {
    const level = state.levels[busIndex] ?? 0;
    const muted = state.mutes[busIndex] ?? false;
    // Nota: en la implementación real, levelNode tiene el level
    // y muteNode tiene 0 o 1. El producto da el nivel efectivo.
    return muted ? 0 : level;
  }

  it('level y mute son independientes', () => {
    const state = createOutputState(8);
    setLevel(state, 0, 0.8);
    setMute(state, 0, true);
    
    // El level guardado sigue siendo 0.8
    assert.equal(state.levels[0], 0.8);
    // Pero el canal está muteado
    assert.equal(state.mutes[0], true);
  });

  it('mute=true → nivel efectivo = 0 (aunque level > 0)', () => {
    const state = createOutputState(8);
    setLevel(state, 0, 0.8);
    setMute(state, 0, true);
    
    assert.equal(getEffectiveLevel(state, 0), 0);
  });

  it('mute=false → nivel efectivo = level', () => {
    const state = createOutputState(8);
    setLevel(state, 0, 0.8);
    setMute(state, 0, false);
    
    assert.equal(getEffectiveLevel(state, 0), 0.8);
  });

  it('al quitar mute, se recupera el level original', () => {
    const state = createOutputState(8);
    setLevel(state, 0, 0.75);
    setMute(state, 0, true);
    
    assert.equal(getEffectiveLevel(state, 0), 0);
    
    setMute(state, 0, false);
    assert.equal(getEffectiveLevel(state, 0), 0.75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS CON AUDIOCONTEXT MOCK
// ═══════════════════════════════════════════════════════════════════════════
// Estos tests usan mocks de AudioContext para verificar interacciones reales
// con la Web Audio API (llamadas a setTargetAtTime, connect, disconnect, etc.)
// ═══════════════════════════════════════════════════════════════════════════

import { setParamSmooth, AudioEngine } from '../../src/assets/js/core/engine.js';
import { 
  createMockAudioContext, 
  createMockAudioParam,
  createMockGainNode,
  resetNodeCalls 
} from '../mocks/audioContext.mock.js';

// ═══════════════════════════════════════════════════════════════════════════
// setParamSmooth - con AudioParam mock
// ═══════════════════════════════════════════════════════════════════════════

describe('setParamSmooth (con AudioContext mock)', () => {
  
  it('llama a cancelScheduledValues antes de setTargetAtTime', () => {
    const ctx = createMockAudioContext();
    const param = createMockAudioParam(0);
    
    setParamSmooth(param, 0.5, ctx);
    
    assert.equal(param._calls.cancelScheduledValues, 1);
    assert.equal(param._calls.setTargetAtTime, 1);
  });

  it('actualiza el valor del parámetro', () => {
    const ctx = createMockAudioContext();
    const param = createMockAudioParam(0);
    
    setParamSmooth(param, 0.75, ctx);
    
    assert.equal(param.value, 0.75);
  });

  it('usa DEFAULT_RAMP_TIME por defecto', () => {
    const ctx = createMockAudioContext();
    const param = createMockAudioParam(1);
    
    // Verificamos que funciona sin opciones
    setParamSmooth(param, 0.5, ctx);
    
    assert.equal(param.value, 0.5);
    assert.equal(param._calls.setTargetAtTime, 1);
  });

  it('acepta ramp personalizado en options', () => {
    const ctx = createMockAudioContext();
    const param = createMockAudioParam(0);
    
    // El ramp se pasa a setTargetAtTime internamente
    // Verificamos que la función no falla con opciones
    setParamSmooth(param, 1.0, ctx, { ramp: 0.1 });
    
    assert.equal(param.value, 1.0);
  });

  it('no hace nada si param es null', () => {
    const ctx = createMockAudioContext();
    
    // No debe lanzar error
    setParamSmooth(null, 0.5, ctx);
  });

  it('no hace nada si ctx es null', () => {
    const param = createMockAudioParam(0);
    
    // No debe lanzar error
    setParamSmooth(param, 0.5, null);
    
    // El valor no debe cambiar
    assert.equal(param.value, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AudioEngine.setOutputMute - con nodos mock
// ═══════════════════════════════════════════════════════════════════════════

describe('AudioEngine.setOutputMute (con AudioContext mock)', () => {
  
  let engine;
  let mockCtx;
  
  // Crear engine con mock antes de cada test
  function setupEngine() {
    mockCtx = createMockAudioContext({ maxChannelCount: 2 });
    engine = new AudioEngine({ outputChannels: 8 });
    engine.start({ audioContext: mockCtx });
    return engine;
  }

  it('mute=true pone muteNode.gain a 0', () => {
    setupEngine();
    
    engine.setOutputMute(0, true);
    
    // Verificar que el mute se aplicó al estado
    assert.equal(engine.outputMutes[0], true);
    
    // El muteNode debería tener gain 0 (tras el ramp)
    const muteNode = engine.outputBuses[0].muteNode;
    assert.equal(muteNode.gain.value, 0);
  });

  it('mute=false pone muteNode.gain a 1', () => {
    setupEngine();
    
    // Primero mutear
    engine.setOutputMute(0, true);
    assert.equal(engine.outputBuses[0].muteNode.gain.value, 0);
    
    // Luego desmutear
    engine.setOutputMute(0, false);
    assert.equal(engine.outputMutes[0], false);
    assert.equal(engine.outputBuses[0].muteNode.gain.value, 1);
  });

  it('usa setTargetAtTime para cambio suave', () => {
    setupEngine();
    
    const muteNode = engine.outputBuses[0].muteNode;
    const initialCalls = muteNode.gain._calls.setTargetAtTime;
    
    engine.setOutputMute(0, true);
    
    // Debe haber llamado a setTargetAtTime al menos una vez
    assert.ok(muteNode.gain._calls.setTargetAtTime > initialCalls);
  });

  it('canales diferentes son independientes', () => {
    setupEngine();
    
    engine.setOutputMute(0, true);
    engine.setOutputMute(3, true);
    
    assert.equal(engine.outputMutes[0], true);
    assert.equal(engine.outputMutes[1], false);
    assert.equal(engine.outputMutes[2], false);
    assert.equal(engine.outputMutes[3], true);
  });

  it('ignora índices fuera de rango', () => {
    setupEngine();
    
    // No debe lanzar error
    engine.setOutputMute(100, true);
    engine.setOutputMute(-1, true);
    
    // El estado no debe cambiar para índices válidos
    assert.equal(engine.outputMutes[0], false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AudioEngine.setOutputRouting - con nodos mock
// ═══════════════════════════════════════════════════════════════════════════

describe('AudioEngine.setOutputRouting (con AudioContext mock)', () => {
  
  let engine;
  let mockCtx;
  
  function setupEngine(maxChannels = 2) {
    mockCtx = createMockAudioContext({ maxChannelCount: maxChannels });
    engine = new AudioEngine({ outputChannels: 8 });
    engine.start({ audioContext: mockCtx });
    return engine;
  }

  it('aplica ganancia de routing a channelGains (modo legacy)', () => {
    setupEngine(2);
    
    // Modo legacy: setOutputRouting(busIndex, leftGain, rightGain)
    // Rutear bus 0 con left=1.0, right=0
    engine.setOutputRouting(0, 1.0, 0);
    
    // El channelGain[0] (left) del bus 0 debe tener ganancia 1.0
    const channelGainL = engine.outputBuses[0].channelGains[0];
    const channelGainR = engine.outputBuses[0].channelGains[1];
    assert.equal(channelGainL.gain.value, 1.0);
    assert.equal(channelGainR.gain.value, 0);
  });

  it('ganancia 0 desconecta efectivamente el canal', () => {
    setupEngine(2);
    
    // Primero conectar con left=1, right=1
    engine.setOutputRouting(0, 1.0, 1.0);
    assert.equal(engine.outputBuses[0].channelGains[0].gain.value, 1.0);
    assert.equal(engine.outputBuses[0].channelGains[1].gain.value, 1.0);
    
    // Luego desconectar con ganancia 0
    engine.setOutputRouting(0, 0.0, 0.0);
    assert.equal(engine.outputBuses[0].channelGains[0].gain.value, 0.0);
    assert.equal(engine.outputBuses[0].channelGains[1].gain.value, 0.0);
  });

  it('valores intermedios de ganancia (0.5)', () => {
    setupEngine(2);
    
    engine.setOutputRouting(0, 0.5, 0.5);
    
    assert.equal(engine.outputBuses[0].channelGains[0].gain.value, 0.5);
    assert.equal(engine.outputBuses[0].channelGains[1].gain.value, 0.5);
  });

  it('actualiza la matriz _outputRoutingMatrix', () => {
    setupEngine(2);
    
    engine.setOutputRouting(2, 0.3, 0.8);
    
    // La matriz debe reflejar el cambio
    assert.equal(engine._outputRoutingMatrix[2][0], 0.3);
    assert.equal(engine._outputRoutingMatrix[2][1], 0.8);
  });

  it('diferentes buses son independientes', () => {
    setupEngine(2);
    
    engine.setOutputRouting(0, 1.0, 0.0);  // bus 0: full left
    engine.setOutputRouting(1, 0.0, 0.7);  // bus 1: partial right
    
    assert.equal(engine.outputBuses[0].channelGains[0].gain.value, 1.0);
    assert.equal(engine.outputBuses[0].channelGains[1].gain.value, 0.0);
    assert.equal(engine.outputBuses[1].channelGains[0].gain.value, 0.0);
    assert.equal(engine.outputBuses[1].channelGains[1].gain.value, 0.7);
  });

  it('usa setTargetAtTime para cambio suave', () => {
    setupEngine(2);
    
    const channelGain = engine.outputBuses[0].channelGains[0];
    const initialCalls = channelGain.gain._calls.setTargetAtTime;
    
    engine.setOutputRouting(0, 1.0, 0.0);
    
    // Debe usar setTargetAtTime (via setParamSmooth)
    assert.ok(channelGain.gain._calls.setTargetAtTime > initialCalls);
  });

  it('modo multicanal con array de ganancias', () => {
    setupEngine(2);
    
    // Modo multicanal: array de ganancias [left, right]
    engine.setOutputRouting(0, [0.8, 0.6]);
    
    assert.equal(engine.outputBuses[0].channelGains[0].gain.value, 0.8);
    assert.equal(engine.outputBuses[0].channelGains[1].gain.value, 0.6);
  });

  it('ignora busIndex fuera de rango', () => {
    setupEngine(2);
    
    // No debe lanzar error
    engine.setOutputRouting(100, 1.0, 1.0);
    engine.setOutputRouting(-1, 1.0, 1.0);
  });

  it('devuelve info de canales aplicados e ignorados', () => {
    setupEngine(2);
    
    // Solo 2 canales físicos, intentamos rutear a 4
    const result = engine.setOutputRouting(0, [1.0, 0.5, 0.3, 0.2]);
    
    // Los primeros 2 se aplican, los otros 2 se ignoran
    assert.deepEqual(result.applied, [0, 1]);
    assert.deepEqual(result.ignored, [2, 3]);
  });
});
