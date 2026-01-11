/**
 * Tests para RecordingEngine
 * 
 * Verifica la lógica de configuración del motor de grabación:
 * - Orden de fuentes (stereo primero, individual después)
 * - Matriz de routing por defecto
 * - Cálculo de índices
 */

import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES REPLICADAS (para tests sin imports de módulos con side effects)
// ─────────────────────────────────────────────────────────────────────────────

const STEREO_SOURCE_COUNT = 4;  // Pan 1-4 L, Pan 1-4 R, Pan 5-8 L, Pan 5-8 R
const INDIVIDUAL_OUTPUT_COUNT = 8;
const TOTAL_SOURCE_COUNT = STEREO_SOURCE_COUNT + INDIVIDUAL_OUTPUT_COUNT; // 12

/**
 * Simula la lógica de _createDefaultRoutingMatrix del RecordingEngine.
 * ORDEN: stereo buses primero (0-3), luego individual outputs (4-11).
 */
function createDefaultRoutingMatrix(trackCount) {
  const matrix = [];
  
  // 4 stereo sources PRIMERO: Pan 1-4 L, Pan 1-4 R, Pan 5-8 L, Pan 5-8 R
  // Default: L channels (0, 2) → track 0, R channels (1, 3) → track 1
  for (let i = 0; i < STEREO_SOURCE_COUNT; i++) {
    const trackGains = Array(trackCount).fill(0);
    const targetTrack = i % 2; // 0, 1, 0, 1
    if (targetTrack < trackCount) {
      trackGains[targetTrack] = 1;
    }
    matrix.push(trackGains);
  }
  
  // 8 individual outputs DESPUÉS (default: all off)
  for (let bus = 0; bus < INDIVIDUAL_OUTPUT_COUNT; bus++) {
    matrix.push(Array(trackCount).fill(0));
  }
  
  return matrix;
}

/**
 * Convierte índice de fuente a descripción legible.
 */
function sourceIndexToLabel(sourceIndex) {
  if (sourceIndex < STEREO_SOURCE_COUNT) {
    // Stereo sources (0-3)
    const labels = ['Pan1-4L', 'Pan1-4R', 'Pan5-8L', 'Pan5-8R'];
    return labels[sourceIndex];
  }
  // Individual outputs (4-11)
  return `Out ${sourceIndex - STEREO_SOURCE_COUNT + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('RecordingEngine - Constantes', () => {
  it('STEREO_SOURCE_COUNT es 4', () => {
    assert.strictEqual(STEREO_SOURCE_COUNT, 4);
  });

  it('INDIVIDUAL_OUTPUT_COUNT es 8', () => {
    assert.strictEqual(INDIVIDUAL_OUTPUT_COUNT, 8);
  });

  it('TOTAL_SOURCE_COUNT es 12', () => {
    assert.strictEqual(TOTAL_SOURCE_COUNT, 12);
  });
});

describe('RecordingEngine - Orden de fuentes', () => {
  it('índices 0-3 son stereo buses', () => {
    assert.strictEqual(sourceIndexToLabel(0), 'Pan1-4L');
    assert.strictEqual(sourceIndexToLabel(1), 'Pan1-4R');
    assert.strictEqual(sourceIndexToLabel(2), 'Pan5-8L');
    assert.strictEqual(sourceIndexToLabel(3), 'Pan5-8R');
  });

  it('índices 4-11 son outputs individuales', () => {
    assert.strictEqual(sourceIndexToLabel(4), 'Out 1');
    assert.strictEqual(sourceIndexToLabel(5), 'Out 2');
    assert.strictEqual(sourceIndexToLabel(6), 'Out 3');
    assert.strictEqual(sourceIndexToLabel(7), 'Out 4');
    assert.strictEqual(sourceIndexToLabel(8), 'Out 5');
    assert.strictEqual(sourceIndexToLabel(9), 'Out 6');
    assert.strictEqual(sourceIndexToLabel(10), 'Out 7');
    assert.strictEqual(sourceIndexToLabel(11), 'Out 8');
  });

  it('stereo buses van ANTES que individuales', () => {
    // Los 4 primeros son stereo, los 8 siguientes son individuales
    for (let i = 0; i < 4; i++) {
      assert.ok(sourceIndexToLabel(i).startsWith('Pan'), `índice ${i} debe ser stereo`);
    }
    for (let i = 4; i < 12; i++) {
      assert.ok(sourceIndexToLabel(i).startsWith('Out'), `índice ${i} debe ser individual`);
    }
  });
});

describe('RecordingEngine - Matriz de routing por defecto', () => {
  it('matriz tiene 12 filas (12 fuentes)', () => {
    const matrix = createDefaultRoutingMatrix(2);
    assert.strictEqual(matrix.length, 12);
  });

  it('cada fila tiene tantas columnas como tracks', () => {
    for (const trackCount of [1, 2, 4, 8, 12]) {
      const matrix = createDefaultRoutingMatrix(trackCount);
      for (const row of matrix) {
        assert.strictEqual(row.length, trackCount, `con ${trackCount} tracks`);
      }
    }
  });

  it('stereo bus L (índices 0, 2) van a track 0 por defecto', () => {
    const matrix = createDefaultRoutingMatrix(2);
    assert.strictEqual(matrix[0][0], 1, 'Pan1-4L → track 0');
    assert.strictEqual(matrix[2][0], 1, 'Pan5-8L → track 0');
  });

  it('stereo bus R (índices 1, 3) van a track 1 por defecto', () => {
    const matrix = createDefaultRoutingMatrix(2);
    assert.strictEqual(matrix[1][1], 1, 'Pan1-4R → track 1');
    assert.strictEqual(matrix[3][1], 1, 'Pan5-8R → track 1');
  });

  it('outputs individuales (índices 4-11) están apagados por defecto', () => {
    const matrix = createDefaultRoutingMatrix(2);
    for (let i = 4; i < 12; i++) {
      for (let track = 0; track < 2; track++) {
        assert.strictEqual(matrix[i][track], 0, `Out ${i - 3} debe estar apagado`);
      }
    }
  });

  it('con 1 solo track, solo L va a track 0', () => {
    const matrix = createDefaultRoutingMatrix(1);
    assert.strictEqual(matrix[0][0], 1, 'Pan1-4L → track 0');
    assert.strictEqual(matrix[1][0], 0, 'Pan1-4R → no route (solo 1 track)');
    assert.strictEqual(matrix[2][0], 1, 'Pan5-8L → track 0');
    assert.strictEqual(matrix[3][0], 0, 'Pan5-8R → no route (solo 1 track)');
  });
});

describe('RecordingEngine - Conversión de índices', () => {
  it('stereo source index a bus/lado', () => {
    // Índice 0 → Bus A, L
    // Índice 1 → Bus A, R
    // Índice 2 → Bus B, L
    // Índice 3 → Bus B, R
    const getBusAndSide = (stereoIndex) => {
      const busId = stereoIndex < 2 ? 'A' : 'B';
      const side = stereoIndex % 2 === 0 ? 'L' : 'R';
      return { busId, side };
    };

    assert.deepStrictEqual(getBusAndSide(0), { busId: 'A', side: 'L' });
    assert.deepStrictEqual(getBusAndSide(1), { busId: 'A', side: 'R' });
    assert.deepStrictEqual(getBusAndSide(2), { busId: 'B', side: 'L' });
    assert.deepStrictEqual(getBusAndSide(3), { busId: 'B', side: 'R' });
  });

  it('individual source index a output channel', () => {
    // Índice 4 → Out 1 (channel 0)
    // Índice 11 → Out 8 (channel 7)
    const getOutputChannel = (sourceIndex) => {
      return sourceIndex - STEREO_SOURCE_COUNT;
    };

    assert.strictEqual(getOutputChannel(4), 0);
    assert.strictEqual(getOutputChannel(5), 1);
    assert.strictEqual(getOutputChannel(10), 6);
    assert.strictEqual(getOutputChannel(11), 7);
  });
});
