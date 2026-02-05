/**
 * Tests para worklets/multichannelCapture.worklet.js
 * 
 * Verifica la lógica del AudioWorklet de captura multicanal:
 * - Ring buffer con SharedArrayBuffer
 * - Cálculo de espacio disponible
 * - Detección de overflow
 * - Modo fallback con MessagePort
 * 
 * NOTA: No se puede instanciar AudioWorkletProcessor en Node.js,
 * pero podemos testear la lógica de buffer aislada.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// LÓGICA DE RING BUFFER EXTRAÍDA DEL WORKLET
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula espacio disponible en ring buffer
 * @param {number} writeIndex - Posición de escritura
 * @param {number} readIndex - Posición de lectura
 * @param {number} bufferFrames - Tamaño total del buffer
 * @returns {number} Frames disponibles para escribir
 */
function calculateAvailableSpace(writeIndex, readIndex, bufferFrames) {
  if (writeIndex >= readIndex) {
    return bufferFrames - (writeIndex - readIndex) - 1;
  } else {
    return readIndex - writeIndex - 1;
  }
}

/**
 * Calcula frames pendientes de leer
 * @param {number} writeIndex - Posición de escritura
 * @param {number} readIndex - Posición de lectura
 * @param {number} bufferFrames - Tamaño total del buffer
 * @returns {number} Frames disponibles para leer
 */
function calculatePendingFrames(writeIndex, readIndex, bufferFrames) {
  if (writeIndex >= readIndex) {
    return writeIndex - readIndex;
  } else {
    return bufferFrames - readIndex + writeIndex;
  }
}

/**
 * Simula avance del writeIndex
 * @param {number} writeIndex - Posición actual
 * @param {number} framesToWrite - Frames a escribir
 * @param {number} bufferFrames - Tamaño del buffer
 * @returns {number} Nueva posición
 */
function advanceWriteIndex(writeIndex, framesToWrite, bufferFrames) {
  return (writeIndex + framesToWrite) % bufferFrames;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE RING BUFFER
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Buffer - Cálculo de espacio', () => {
  const BUFFER_SIZE = 8192; // Tamaño típico del ring buffer

  describe('calculateAvailableSpace', () => {
    it('buffer vacío tiene casi todo el espacio', () => {
      const available = calculateAvailableSpace(0, 0, BUFFER_SIZE);
      assert.strictEqual(available, BUFFER_SIZE - 1);
    });

    it('buffer lleno tiene 0 espacio', () => {
      // writeIndex = readIndex - 1 (mod bufferSize) significa lleno
      const available = calculateAvailableSpace(BUFFER_SIZE - 1, 0, BUFFER_SIZE);
      assert.strictEqual(available, 0);
    });

    it('writeIndex adelante de readIndex', () => {
      const available = calculateAvailableSpace(1000, 500, BUFFER_SIZE);
      assert.strictEqual(available, BUFFER_SIZE - 500 - 1);
    });

    it('writeIndex detrás de readIndex (wrap around)', () => {
      const available = calculateAvailableSpace(500, 7000, BUFFER_SIZE);
      assert.strictEqual(available, 7000 - 500 - 1);
    });

    it('siempre deja 1 slot de guarda', () => {
      // Verificar que nunca podemos llenar completamente
      for (let write = 0; write < 100; write++) {
        for (let read = 0; read < 100; read++) {
          const avail = calculateAvailableSpace(write, read, 100);
          const pending = calculatePendingFrames(write, read, 100);
          assert.ok(avail + pending < 100, 'Siempre debe haber espacio de guarda');
        }
      }
    });
  });

  describe('calculatePendingFrames', () => {
    it('buffer vacío tiene 0 frames pendientes', () => {
      const pending = calculatePendingFrames(0, 0, BUFFER_SIZE);
      assert.strictEqual(pending, 0);
    });

    it('con datos escritos, hay frames pendientes', () => {
      const pending = calculatePendingFrames(1000, 0, BUFFER_SIZE);
      assert.strictEqual(pending, 1000);
    });

    it('wrap around funciona correctamente', () => {
      // write=500, read=7000 en buffer de 8192
      // pendiente = 8192 - 7000 + 500 = 1692
      const pending = calculatePendingFrames(500, 7000, BUFFER_SIZE);
      assert.strictEqual(pending, BUFFER_SIZE - 7000 + 500);
    });
  });

  describe('advanceWriteIndex', () => {
    it('avance normal sin wrap', () => {
      const newIdx = advanceWriteIndex(100, 128, BUFFER_SIZE);
      assert.strictEqual(newIdx, 228);
    });

    it('wrap around al final', () => {
      const newIdx = advanceWriteIndex(8100, 200, BUFFER_SIZE);
      assert.strictEqual(newIdx, (8100 + 200) % BUFFER_SIZE);
    });

    it('múltiples avances son consistentes', () => {
      let idx = 0;
      for (let i = 0; i < 100; i++) {
        idx = advanceWriteIndex(idx, 128, BUFFER_SIZE);
      }
      assert.strictEqual(idx, (100 * 128) % BUFFER_SIZE);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE DETECCIÓN DE OVERFLOW
// ═══════════════════════════════════════════════════════════════════════════

describe('Ring Buffer - Detección de overflow', () => {
  const BUFFER_SIZE = 8192;
  const FRAME_SIZE = 128; // Tamaño típico de quantum de audio

  it('detecta overflow cuando buffer está casi lleno', () => {
    const writeIndex = 8000;
    const readIndex = 0;
    const available = calculateAvailableSpace(writeIndex, readIndex, BUFFER_SIZE);
    
    // Solo quedan 191 frames (8192 - 8000 - 1)
    assert.ok(available < FRAME_SIZE * 2, 'Debería haber poco espacio');
  });

  it('sin overflow cuando hay espacio suficiente', () => {
    const writeIndex = 1000;
    const readIndex = 0;
    const available = calculateAvailableSpace(writeIndex, readIndex, BUFFER_SIZE);
    
    assert.ok(available >= FRAME_SIZE, 'Debería caber al menos un frame');
  });

  it('overflow cuando writeIndex alcanza a readIndex', () => {
    // Simular buffer casi lleno
    const readIndex = 100;
    const writeIndex = 99; // Un frame antes de alcanzar read
    const available = calculateAvailableSpace(writeIndex, readIndex, BUFFER_SIZE);
    
    assert.strictEqual(available, 0, 'No debería haber espacio');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE LAYOUT DE SHAREDARRAYBUFFER
// ═══════════════════════════════════════════════════════════════════════════

describe('SharedArrayBuffer Layout', () => {
  const CHANNELS = 12;
  const BUFFER_FRAMES = 8192;
  
  // Layout esperado:
  // Bytes 0-3: writeIndex (Int32)
  // Bytes 4-7: readIndex (Int32)
  // Bytes 8+: audio data (Float32 interleaved)
  
  it('control buffer ocupa 8 bytes', () => {
    const controlSize = 2 * 4; // 2 Int32
    assert.strictEqual(controlSize, 8);
  });

  it('audio buffer empieza en offset 8', () => {
    const audioByteOffset = 8;
    assert.strictEqual(audioByteOffset, 2 * 4); // Después de 2 Int32
  });

  it('tamaño total calculable', () => {
    const controlBytes = 8;
    const audioBytes = BUFFER_FRAMES * CHANNELS * 4; // Float32 = 4 bytes
    const totalBytes = controlBytes + audioBytes;
    
    assert.strictEqual(totalBytes, 8 + 8192 * 12 * 4);
    assert.strictEqual(totalBytes, 393224); // ~384KB
  });

  it('índice interleaved es correcto', () => {
    // Para frame F, canal C, el índice es: F * CHANNELS + C
    const frame = 100;
    const channel = 3;
    const expectedIndex = frame * CHANNELS + channel;
    assert.strictEqual(expectedIndex, 1203);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE MODO FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

describe('Modo Fallback (MessagePort)', () => {
  const CHUNK_SIZE = 2048;
  const CHANNELS = 12;

  it('chunk size por defecto es 2048 frames', () => {
    assert.strictEqual(CHUNK_SIZE, 2048);
  });

  it('buffer fallback tiene tamaño correcto', () => {
    const bufferSize = CHUNK_SIZE * CHANNELS;
    assert.strictEqual(bufferSize, 24576);
  });

  it('mensaje contiene metadatos necesarios', () => {
    // Simular estructura del mensaje
    const message = {
      type: 'audioData',
      frames: CHUNK_SIZE,
      channels: CHANNELS
    };
    
    assert.strictEqual(message.type, 'audioData');
    assert.strictEqual(message.frames, 2048);
    assert.strictEqual(message.channels, 12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('Configuración del Worklet', () => {
  it('número de canales por defecto es 12', () => {
    const defaultChannels = 12;
    assert.strictEqual(defaultChannels, 12);
  });

  it('valores de latencia mapean a frames', () => {
    const sampleRate = 48000;
    const latencyOptions = [10, 21, 42, 85, 170]; // ms
    
    latencyOptions.forEach(ms => {
      const frames = Math.round(ms * sampleRate / 1000);
      assert.ok(frames > 0);
      assert.ok(frames < sampleRate); // Menos de 1 segundo
    });
  });

  it('prebuffer de 42ms = 2016 frames a 48kHz', () => {
    const ms = 42;
    const sampleRate = 48000;
    const frames = Math.round(ms * sampleRate / 1000);
    assert.strictEqual(frames, 2016);
  });

  it('ring buffer de 170ms ≈ 8160 frames a 48kHz', () => {
    const ms = 170;
    const sampleRate = 48000;
    const frames = Math.round(ms * sampleRate / 1000);
    assert.strictEqual(frames, 8160);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE ATOMICS (simulados)
// ═══════════════════════════════════════════════════════════════════════════

describe('Operaciones Atómicas', () => {
  // Simular comportamiento de Atomics con SharedArrayBuffer
  let controlBuffer;
  
  beforeEach(() => {
    // Simular Int32Array compartido
    controlBuffer = new Int32Array(2);
    controlBuffer[0] = 0; // writeIndex
    controlBuffer[1] = 0; // readIndex
  });

  it('Atomics.store actualiza correctamente', () => {
    Atomics.store(controlBuffer, 0, 1000);
    assert.strictEqual(controlBuffer[0], 1000);
  });

  it('Atomics.load lee correctamente', () => {
    controlBuffer[0] = 5000;
    const value = Atomics.load(controlBuffer, 0);
    assert.strictEqual(value, 5000);
  });

  it('índices pueden actualizarse independientemente', () => {
    Atomics.store(controlBuffer, 0, 100); // writeIndex
    Atomics.store(controlBuffer, 1, 50);  // readIndex
    
    assert.strictEqual(Atomics.load(controlBuffer, 0), 100);
    assert.strictEqual(Atomics.load(controlBuffer, 1), 50);
  });
});
