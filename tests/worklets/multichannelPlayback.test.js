/**
 * Tests para worklets/multichannelPlayback.worklet.js
 * 
 * Verifica la lógica del AudioWorklet de reproducción multicanal:
 * - Ring buffer con SharedArrayBuffer (lectura desde C++)
 * - Cálculo de frames disponibles
 * - Detección de underflow
 * - Lectura de frames entrelazados
 * 
 * NOTA: No se puede instanciar AudioWorkletProcessor en Node.js,
 * pero podemos testear la lógica de buffer aislada.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// LÓGICA DE RING BUFFER EXTRAÍDA DEL WORKLET (LECTURA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula frames disponibles para leer.
 * writeIndex es actualizado por C++, readIndex por el worklet.
 * 
 * @param {number} writeIndex - Posición de escritura (C++)
 * @param {number} readIndex - Posición de lectura (worklet)
 * @param {number} bufferFrames - Tamaño total del buffer
 * @returns {number} Frames disponibles para leer
 */
function calculateAvailable(writeIndex, readIndex, bufferFrames) {
  if (writeIndex >= readIndex) {
    return writeIndex - readIndex;
  } else {
    return bufferFrames - (readIndex - writeIndex);
  }
}

/**
 * Simula avance del readIndex (worklet consume samples)
 * @param {number} readIndex - Posición actual
 * @param {number} framesToRead - Frames a consumir
 * @param {number} bufferFrames - Tamaño del buffer
 * @returns {number} Nueva posición
 */
function advanceReadIndex(readIndex, framesToRead, bufferFrames) {
  return (readIndex + framesToRead) % bufferFrames;
}

/**
 * Simula lectura de frames desde buffer interleaved.
 * @param {Float32Array} audioBuffer - Buffer de audio entrelazado
 * @param {number} startIndex - Frame inicial de lectura
 * @param {number} frameCount - Número de frames a leer
 * @param {number} channels - Número de canales
 * @param {number} bufferFrames - Tamaño del ring buffer
 * @returns {Float32Array[]} Array de canales con samples
 */
function readFrames(audioBuffer, startIndex, frameCount, channels, bufferFrames) {
  const output = Array.from({ length: channels }, () => new Float32Array(frameCount));
  let readPos = startIndex;
  
  for (let frame = 0; frame < frameCount; frame++) {
    const baseIndex = readPos * channels;
    
    for (let ch = 0; ch < channels; ch++) {
      output[ch][frame] = audioBuffer[baseIndex + ch];
    }
    
    readPos = (readPos + 1) % bufferFrames;
  }
  
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE RING BUFFER (LECTURA)
// ═══════════════════════════════════════════════════════════════════════════

describe('Playback Ring Buffer - Cálculo de disponibilidad', () => {
  const BUFFER_SIZE = 8192; // Tamaño típico del ring buffer

  describe('calculateAvailable', () => {
    it('buffer vacío tiene 0 frames disponibles', () => {
      const available = calculateAvailable(0, 0, BUFFER_SIZE);
      assert.strictEqual(available, 0);
    });

    it('buffer con datos tiene frames disponibles', () => {
      // C++ ha escrito hasta 1000, worklet no ha leído nada
      const available = calculateAvailable(1000, 0, BUFFER_SIZE);
      assert.strictEqual(available, 1000);
    });

    it('writeIndex adelante de readIndex (normal)', () => {
      const available = calculateAvailable(5000, 3000, BUFFER_SIZE);
      assert.strictEqual(available, 2000);
    });

    it('writeIndex detrás de readIndex (wrap around)', () => {
      // writeIndex=500, readIndex=7000 significa que C++ ha dado la vuelta
      const available = calculateAvailable(500, 7000, BUFFER_SIZE);
      // Hay 8192 - 7000 + 500 = 1692 frames
      assert.strictEqual(available, BUFFER_SIZE - (7000 - 500));
    });

    it('buffer casi lleno', () => {
      const available = calculateAvailable(BUFFER_SIZE - 1, 0, BUFFER_SIZE);
      assert.strictEqual(available, BUFFER_SIZE - 1);
    });
  });

  describe('advanceReadIndex', () => {
    it('avance simple sin wrap', () => {
      const newIndex = advanceReadIndex(0, 128, BUFFER_SIZE);
      assert.strictEqual(newIndex, 128);
    });

    it('avance con wrap around', () => {
      const newIndex = advanceReadIndex(8100, 200, BUFFER_SIZE);
      assert.strictEqual(newIndex, (8100 + 200) % BUFFER_SIZE);
    });

    it('avance exacto al final', () => {
      const newIndex = advanceReadIndex(8000, 192, BUFFER_SIZE);
      assert.strictEqual(newIndex, 0); // Exactamente al inicio
    });
  });
});

describe('Playback Ring Buffer - Lectura de frames', () => {
  const CHANNELS = 8;
  const BUFFER_FRAMES = 256; // Buffer pequeño para tests
  
  let audioBuffer;
  
  beforeEach(() => {
    // Crear buffer de prueba con patrón conocido
    audioBuffer = new Float32Array(BUFFER_FRAMES * CHANNELS);
    
    // Llenar con patrón: frame * 0.001 + channel * 0.1
    for (let frame = 0; frame < BUFFER_FRAMES; frame++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        audioBuffer[frame * CHANNELS + ch] = frame * 0.001 + ch * 0.1;
      }
    }
  });

  describe('readFrames', () => {
    it('lee frames con datos correctos por canal', () => {
      const output = readFrames(audioBuffer, 0, 4, CHANNELS, BUFFER_FRAMES);
      
      assert.strictEqual(output.length, CHANNELS);
      
      // Verificar primer frame, canal 0 (tolerancia por precisión Float32)
      const epsilon = 1e-6;
      assert.ok(Math.abs(output[0][0] - (0 * 0.001 + 0 * 0.1)) < epsilon);
      
      // Verificar primer frame, canal 5
      assert.ok(Math.abs(output[5][0] - (0 * 0.001 + 5 * 0.1)) < epsilon);
      
      // Verificar frame 3, canal 2
      assert.ok(Math.abs(output[2][3] - (3 * 0.001 + 2 * 0.1)) < epsilon);
    });

    it('maneja wrap around correctamente', () => {
      // Empezar cerca del final y leer más allá
      const startFrame = BUFFER_FRAMES - 2;
      const output = readFrames(audioBuffer, startFrame, 4, CHANNELS, BUFFER_FRAMES);
      const epsilon = 1e-6;
      
      // Frame 0 del output = frame 254 del buffer
      assert.ok(Math.abs(output[0][0] - (254 * 0.001 + 0 * 0.1)) < epsilon);
      
      // Frame 1 del output = frame 255 del buffer
      assert.ok(Math.abs(output[0][1] - (255 * 0.001 + 0 * 0.1)) < epsilon);
      
      // Frame 2 del output = frame 0 del buffer (wrap)
      assert.ok(Math.abs(output[0][2] - (0 * 0.001 + 0 * 0.1)) < epsilon);
      
      // Frame 3 del output = frame 1 del buffer
      assert.ok(Math.abs(output[0][3] - (1 * 0.001 + 0 * 0.1)) < epsilon);
    });

    it('produce arrays del tamaño correcto', () => {
      const frameCount = 128;
      const output = readFrames(audioBuffer, 0, frameCount, CHANNELS, BUFFER_FRAMES);
      
      assert.strictEqual(output.length, CHANNELS);
      for (const ch of output) {
        assert.strictEqual(ch.length, frameCount);
      }
    });
  });
});

describe('Playback - Detección de underflow', () => {
  const BUFFER_SIZE = 8192;

  /**
   * Simula la lógica de detección de underflow del worklet
   */
  function checkUnderflow(available, needed) {
    return available < needed;
  }

  it('detecta underflow cuando no hay suficientes frames', () => {
    assert.strictEqual(checkUnderflow(64, 128), true);
  });

  it('no hay underflow cuando hay suficientes frames', () => {
    assert.strictEqual(checkUnderflow(256, 128), false);
  });

  it('exactamente suficiente no es underflow', () => {
    assert.strictEqual(checkUnderflow(128, 128), false);
  });

  it('buffer vacío es underflow', () => {
    assert.strictEqual(checkUnderflow(0, 128), true);
  });
});

describe('Playback vs Capture - Diferencias de rol', () => {
  const BUFFER_SIZE = 8192;
  
  it('roles invertidos: C++ escribe, worklet lee', () => {
    // En capture: worklet escribe, C++ lee
    // En playback: C++ escribe, worklet lee
    
    // Simular C++ escribiendo 1000 frames
    const writeIndex = 1000;
    const readIndex = 0;
    
    const available = calculateAvailable(writeIndex, readIndex, BUFFER_SIZE);
    assert.strictEqual(available, 1000);
    
    // Worklet consume 128 frames
    const newReadIndex = advanceReadIndex(readIndex, 128, BUFFER_SIZE);
    assert.strictEqual(newReadIndex, 128);
    
    // Ahora hay menos disponible
    const newAvailable = calculateAvailable(writeIndex, newReadIndex, BUFFER_SIZE);
    assert.strictEqual(newAvailable, 1000 - 128);
  });

  it('C++ puede adelantar mientras worklet lee', () => {
    let writeIndex = 500;
    let readIndex = 0;
    
    // Worklet lee 128
    readIndex = advanceReadIndex(readIndex, 128, BUFFER_SIZE);
    
    // C++ escribe más
    writeIndex = 700;
    
    // Hay más disponible ahora
    const available = calculateAvailable(writeIndex, readIndex, BUFFER_SIZE);
    assert.strictEqual(available, 700 - 128);
  });
});
