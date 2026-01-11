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

// ═══════════════════════════════════════════════════════════════════════════
// TESTS CON AUDIO CONTEXT MOCK
// ═══════════════════════════════════════════════════════════════════════════

import { 
  createMockAudioContext,
  createMockGainNode,
  createMockAudioWorkletNode
} from '../mocks/audioContext.mock.js';

const MAX_RECORDING_TRACKS = 8;

/**
 * Mock del RecordingEngine con AudioContext inyectable
 */
class MockRecordingEngine {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.isRecording = false;
    this.workletNode = null;
    this.workletReady = false;
    
    this._trackBuffers = [];
    this._sampleRate = 44100;
    
    this._stereoSourceCount = 4;
    this._individualOutputCount = audioEngine?.outputChannels || 8;
    this._totalSourceCount = this._stereoSourceCount + this._individualOutputCount;
    
    this._trackCount = 2;
    this._routingMatrix = this._createDefaultMatrix();
    
    this._trackMixers = [];
    this._outputGains = [];
    
    this.onRecordingStart = null;
    this.onRecordingStop = null;
  }

  _createDefaultMatrix() {
    const matrix = [];
    for (let i = 0; i < this._stereoSourceCount; i++) {
      const trackGains = Array(this._trackCount).fill(0);
      const targetTrack = i % 2;
      if (targetTrack < this._trackCount) {
        trackGains[targetTrack] = 1;
      }
      matrix.push(trackGains);
    }
    for (let bus = 0; bus < this._individualOutputCount; bus++) {
      matrix.push(Array(this._trackCount).fill(0));
    }
    return matrix;
  }

  get trackCount() {
    return this._trackCount;
  }

  set trackCount(count) {
    const newCount = Math.max(1, Math.min(MAX_RECORDING_TRACKS, count));
    if (newCount === this._trackCount) return;
    
    this._trackCount = newCount;
    
    for (let source = 0; source < this._totalSourceCount; source++) {
      if (!this._routingMatrix[source]) {
        this._routingMatrix[source] = Array(newCount).fill(0);
        if (source < this._stereoSourceCount) {
          const targetTrack = source % 2;
          if (targetTrack < newCount) {
            this._routingMatrix[source][targetTrack] = 1;
          }
        }
      } else {
        while (this._routingMatrix[source].length < newCount) {
          this._routingMatrix[source].push(0);
        }
        this._routingMatrix[source] = this._routingMatrix[source].slice(0, newCount);
      }
    }
    
    if (this.workletReady) {
      this._rebuildRoutingGraph();
    }
  }

  get routingMatrix() {
    return this._routingMatrix;
  }

  setRouting(sourceIndex, trackIndex, value) {
    if (sourceIndex < 0 || sourceIndex >= this._totalSourceCount) return;
    if (!this._routingMatrix[sourceIndex]) return;
    if (trackIndex < 0 || trackIndex >= this._trackCount) return;
    
    const gain = value ? 1 : 0;
    this._routingMatrix[sourceIndex][trackIndex] = gain;
    
    if (this._outputGains[sourceIndex]?.[trackIndex]) {
      const ctx = this.engine?.audioCtx;
      if (ctx) {
        this._outputGains[sourceIndex][trackIndex].gain.setTargetAtTime(
          gain, ctx.currentTime, 0.01
        );
      }
    }
  }

  getRouting(sourceIndex, trackIndex) {
    return this._routingMatrix[sourceIndex]?.[trackIndex] ?? 0;
  }

  async ensureWorkletReady() {
    if (this.workletReady) return;
    
    const ctx = this.engine?.audioCtx;
    if (!ctx) throw new Error('AudioContext not available');
    
    await ctx.audioWorklet.addModule('recordingCapture.worklet.js');
    this.workletReady = true;
  }

  async _buildRoutingGraph() {
    const ctx = this.engine?.audioCtx;
    if (!ctx) return;
    
    await this.ensureWorkletReady();
    this._sampleRate = ctx.sampleRate;
    
    const merger = ctx.createChannelMerger(this._trackCount);
    
    this._trackMixers = [];
    for (let track = 0; track < this._trackCount; track++) {
      const mixer = ctx.createGain();
      mixer.gain.value = 1.0;
      mixer.connect(merger, 0, track);
      this._trackMixers.push(mixer);
    }
    
    this._outputGains = [];
    for (let source = 0; source < this._totalSourceCount; source++) {
      this._outputGains[source] = [];
      for (let track = 0; track < this._trackCount; track++) {
        const gain = ctx.createGain();
        const routingValue = this._routingMatrix[source]?.[track] ?? 0;
        gain.gain.value = routingValue;
        gain.connect(this._trackMixers[track]);
        this._outputGains[source][track] = gain;
      }
    }
    
    this.workletNode = createMockAudioWorkletNode('recording-capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: this._trackCount
    });
    
    merger.connect(this.workletNode);
  }

  _rebuildRoutingGraph() {
    this._trackMixers = [];
    this._outputGains = [];
  }

  _cleanupRoutingGraph() {
    this._trackMixers.forEach(m => m?.disconnect?.());
    this._outputGains.flat().forEach(g => g?.disconnect?.());
    this.workletNode?.disconnect?.();
    
    this._trackMixers = [];
    this._outputGains = [];
    this.workletNode = null;
  }

  async startRecording() {
    if (this.isRecording) return;
    
    await this._buildRoutingGraph();
    this._trackBuffers = Array(this._trackCount).fill(null).map(() => []);
    this.isRecording = true;
    
    if (this.onRecordingStart) {
      this.onRecordingStart();
    }
  }

  stopRecording() {
    if (!this.isRecording) return null;
    
    this.isRecording = false;
    const buffers = this._trackBuffers;
    this._trackBuffers = [];
    
    this._cleanupRoutingGraph();
    
    if (this.onRecordingStop) {
      this.onRecordingStop(buffers);
    }
    
    return buffers;
  }
}

describe('RecordingEngine (con AudioContext mock)', () => {
  
  let mockCtx;
  let mockEngine;
  let recorder;
  
  beforeEach(() => {
    mockCtx = createMockAudioContext();
    mockEngine = {
      audioCtx: mockCtx,
      outputChannels: 8,
      outputBuses: Array(8).fill(null).map(() => ({
        levelNode: createMockGainNode()
      })),
      stereoBuses: {
        A: { outputL: createMockGainNode(), outputR: createMockGainNode() },
        B: { outputL: createMockGainNode(), outputR: createMockGainNode() }
      }
    };
    recorder = new MockRecordingEngine(mockEngine);
  });

  describe('inicialización con mock', () => {
    
    it('track count inicial es 2 (stereo)', () => {
      assert.strictEqual(recorder.trackCount, 2);
    });

    it('no está grabando inicialmente', () => {
      assert.strictEqual(recorder.isRecording, false);
    });

    it('worklet no está listo inicialmente', () => {
      assert.strictEqual(recorder.workletReady, false);
    });

    it('total de sources es 12 (4 stereo + 8 individual)', () => {
      assert.strictEqual(recorder._totalSourceCount, 12);
    });
  });

  describe('setRouting con mock', () => {
    
    it('activa routing de individual output a track', () => {
      recorder.setRouting(4, 0, 1);
      
      assert.strictEqual(recorder.getRouting(4, 0), 1);
    });

    it('desactiva routing existente', () => {
      recorder.setRouting(0, 0, 0);
      
      assert.strictEqual(recorder.getRouting(0, 0), 0);
    });

    it('ignora sourceIndex fuera de rango', () => {
      const before = recorder.routingMatrix.map(r => [...r]);
      recorder.setRouting(99, 0, 1);
      
      assert.deepStrictEqual(recorder.routingMatrix, before);
    });

    it('convierte valores truthy a 1', () => {
      recorder.setRouting(5, 0, 'yes');
      assert.strictEqual(recorder.getRouting(5, 0), 1);
    });

    it('convierte valores falsy a 0', () => {
      recorder.setRouting(0, 0, null);
      assert.strictEqual(recorder.getRouting(0, 0), 0);
    });
  });

  describe('trackCount con mock', () => {
    
    it('puede aumentar track count', () => {
      recorder.trackCount = 4;
      
      assert.strictEqual(recorder.trackCount, 4);
    });

    it('se limita a 1 como mínimo', () => {
      recorder.trackCount = 0;
      
      assert.strictEqual(recorder.trackCount, 1);
    });

    it('se limita a MAX_RECORDING_TRACKS como máximo', () => {
      recorder.trackCount = 100;
      
      assert.strictEqual(recorder.trackCount, MAX_RECORDING_TRACKS);
    });

    it('ajusta routing matrix al aumentar tracks', () => {
      recorder.trackCount = 4;
      
      for (const row of recorder.routingMatrix) {
        assert.strictEqual(row.length, 4);
      }
    });
  });

  describe('startRecording / stopRecording con mock', () => {
    
    it('startRecording cambia isRecording a true', async () => {
      await recorder.startRecording();
      
      assert.strictEqual(recorder.isRecording, true);
    });

    it('startRecording marca worklet como ready', async () => {
      await recorder.startRecording();
      
      assert.strictEqual(recorder.workletReady, true);
    });

    it('startRecording crea track buffers', async () => {
      await recorder.startRecording();
      
      assert.strictEqual(recorder._trackBuffers.length, recorder.trackCount);
    });

    it('stopRecording cambia isRecording a false', async () => {
      await recorder.startRecording();
      recorder.stopRecording();
      
      assert.strictEqual(recorder.isRecording, false);
    });

    it('stopRecording retorna los buffers', async () => {
      await recorder.startRecording();
      const buffers = recorder.stopRecording();
      
      assert.ok(Array.isArray(buffers));
      assert.strictEqual(buffers.length, 2);
    });

    it('stopRecording limpia el routing graph', async () => {
      await recorder.startRecording();
      recorder.stopRecording();
      
      assert.strictEqual(recorder._trackMixers.length, 0);
      assert.strictEqual(recorder._outputGains.length, 0);
    });

    it('stopRecording sin grabar retorna null', () => {
      const result = recorder.stopRecording();
      
      assert.strictEqual(result, null);
    });
  });

  describe('callbacks con mock', () => {
    
    it('onRecordingStart es llamado al iniciar', async () => {
      let called = false;
      recorder.onRecordingStart = () => { called = true; };
      
      await recorder.startRecording();
      
      assert.strictEqual(called, true);
    });

    it('onRecordingStop es llamado al detener', async () => {
      let called = false;
      recorder.onRecordingStop = () => { called = true; };
      
      await recorder.startRecording();
      recorder.stopRecording();
      
      assert.strictEqual(called, true);
    });
  });

  describe('_buildRoutingGraph con mock', () => {
    
    it('crea track mixers para cada track', async () => {
      await recorder._buildRoutingGraph();
      
      assert.strictEqual(recorder._trackMixers.length, recorder.trackCount);
    });

    it('crea gain nodes para todas las conexiones', async () => {
      await recorder._buildRoutingGraph();
      
      let gainCount = 0;
      for (const sourceGains of recorder._outputGains) {
        gainCount += sourceGains?.length || 0;
      }
      
      assert.strictEqual(gainCount, 12 * recorder.trackCount);
    });

    it('crea worklet node', async () => {
      await recorder._buildRoutingGraph();
      
      assert.notStrictEqual(recorder.workletNode, null);
    });
  });

  describe('ensureWorkletReady con mock', () => {
    
    it('carga el módulo worklet', async () => {
      await recorder.ensureWorkletReady();
      
      assert.ok(mockCtx._workletModules.length > 0);
    });

    it('marca workletReady = true', async () => {
      await recorder.ensureWorkletReady();
      
      assert.strictEqual(recorder.workletReady, true);
    });

    it('no recarga si ya está listo', async () => {
      await recorder.ensureWorkletReady();
      const moduleCount = mockCtx._workletModules.length;
      
      await recorder.ensureWorkletReady();
      
      assert.strictEqual(mockCtx._workletModules.length, moduleCount);
    });

    it('falla sin audioContext', async () => {
      recorder.engine = null;
      
      await assert.rejects(
        async () => recorder.ensureWorkletReady(),
        /AudioContext not available/
      );
    });
  });
});
