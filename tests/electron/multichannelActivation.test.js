/**
 * Tests para la activación de salida multicanal (app.js)
 * 
 * Verifica el flujo de activación/desactivación multicanal:
 * - Guardias contra AudioContext null (DSP apagado al inicio)
 * - Activación automática de DSP al pedir multicanal
 * - Limpieza de estado en caso de fallo
 * - Flujo completo estéreo ↔ multicanal
 * 
 * Usa mocks para engine, audioSettingsModal y multichannelAPI.
 * No requiere Electron runtime ni AudioContext real.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mock mínimo de AudioContext para tests.
 * Simula los métodos usados por _activateMultichannelOutput.
 */
function createMockAudioCtx() {
  const mockGainNode = {
    gain: { value: 1 },
    connect: () => {},
    disconnect: () => {}
  };
  
  const mockWorkletNode = {
    port: {
      onmessage: null,
      postMessage: () => {},
      close: () => {}
    },
    connect: () => {},
    disconnect: () => {}
  };
  
  return {
    sampleRate: 48000,
    state: 'running',
    destination: {},
    audioWorklet: {
      addModule: async () => {}
    },
    createGain: () => ({ ...mockGainNode }),
    createScriptProcessor: () => ({
      connect: () => {},
      disconnect: () => {},
      onaudioprocess: null
    }),
    suspend: async () => {},
    resume: async () => {}
  };
}

/**
 * Mock del engine de audio.
 */
function createMockEngine(options = {}) {
  const { dspEnabled = true, hasAudioCtx = true } = options;
  return {
    dspEnabled,
    audioCtx: hasAudioCtx ? createMockAudioCtx() : null,
    isRunning: hasAudioCtx,
    workletReady: hasAudioCtx,
    physicalChannels: 2,
    physicalChannelLabels: ['L', 'R'],
    _skipDestinationConnect: false,
    merger: {
      connect: () => {},
      disconnect: () => {}
    },
    forcePhysicalChannels(count, labels, skip) {
      this.physicalChannels = count;
      this.physicalChannelLabels = labels;
      this._skipDestinationConnect = skip;
      return { success: true, channels: count };
    },
    setOutputDevice: async () => ({ success: true, channels: 2 }),
    setOutputRouting: () => ({}),
    setStereoBusRouting: () => {},
    _onPhysicalChannelsChange: null,
    async resumeDSP() {
      this.dspEnabled = true;
    },
    async suspendDSP() {
      this.dspEnabled = false;
    },
    start() {
      if (!this.dspEnabled) return;
      if (!this.audioCtx) {
        this.audioCtx = createMockAudioCtx();
      }
      this.isRunning = true;
    },
    async ensureWorkletReady() {
      this.workletReady = true;
      return true;
    }
  };
}

/**
 * Mock del audioSettingsModal.
 */
function createMockAudioSettingsModal() {
  return {
    outputMode: 'stereo',
    selectedOutputDevice: 'default',
    multichannelAvailable: true,
    setOutputMode(mode, notify = true) {
      this.outputMode = mode;
      if (notify && this.onOutputModeChange) {
        this.onOutputModeChange(mode);
      }
    },
    updatePhysicalChannels: () => {},
    applyRoutingToEngine: (cb) => ({ warnings: [] }),
    applyStereoBusRoutingToEngine: () => {},
    getConfiguredLatencyMs: () => 42,
    onOutputModeChange: null
  };
}

/**
 * Mock de window.multichannelAPI (solo existe en Electron).
 */
function createMockMultichannelAPI(options = {}) {
  const { openSuccess = true, streamClosed = false } = options;
  let isOpen = false;
  return {
    _isOpen: () => isOpen,
    open: async ({ sampleRate, channels }) => {
      if (openSuccess) {
        isOpen = true;
        return { success: true, info: `${channels}ch @ ${sampleRate}Hz` };
      }
      return { success: false, error: 'mock open failure' };
    },
    close: async () => { isOpen = false; },
    write: () => {},
    setLatency: () => {},
    attachSharedBuffer: () => false  // SAB no disponible en tests
  };
}

/**
 * Mock de window.multichannelInputAPI.
 */
function createMockMultichannelInputAPI() {
  return {
    open: async () => ({ success: false, error: 'mock input not available' }),
    close: async () => {}
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LÓGICA EXTRAÍDA DE APP.JS PARA TEST AISLADO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Replica la lógica de _activateMultichannelOutput de app.js.
 * Extraída para poder testear sin instanciar toda la app.
 * Cubre: guardias, apertura de stream, manejo de errores.
 */
async function activateMultichannelOutput(app) {
  // Guardia: ya activo
  if (app._multichannelActive) {
    return { success: true };
  }
  
  // Guardia: multichannelAPI no disponible
  if (!app._multichannelAPI) {
    return { success: false, error: 'multichannelAPI no disponible' };
  }
  
  // Guardia: AudioContext null
  if (!app.engine.audioCtx) {
    return { success: false, error: 'AudioContext no inicializado' };
  }
  
  // Forzar 12 canales
  app.engine.forcePhysicalChannels(12, 
    ['1','2','3','4','5','6','7','8','9','10','11','12'], true);
  
  // Configurar latencia
  if (app._multichannelAPI.setLatency) {
    app._multichannelAPI.setLatency(42);
  }
  
  // Abrir stream
  const sampleRate = app.engine.audioCtx?.sampleRate || 48000;
  const result = await app._multichannelAPI.open({ sampleRate, channels: 12 });
  
  if (!result.success) {
    app.engine.forcePhysicalChannels(2, ['L', 'R'], false);
    return { success: false, error: result.error };
  }
  
  const ctx = app.engine.audioCtx;
  
  // Intentar cargar worklet
  try {
    await ctx.audioWorklet.addModule('multichannelCapture.worklet.js');
  } catch (e) {
    // Intentar fallback
    try {
      return await activateMultichannelOutputFallback(app);
    } catch (fallbackError) {
      // Limpieza completa en fallo total
      await app._multichannelAPI.close();
      app.engine.forcePhysicalChannels(2, ['L', 'R'], false);
      return { success: false, error: 'Worklet y fallback fallaron' };
    }
  }
  
  // Crear silenciador y conectar
  app._multichannelSilencer = ctx.createGain();
  app._multichannelSilencer.gain.value = 0;
  app._multichannelActive = true;
  
  return { success: true };
}

/**
 * Replica _activateMultichannelOutputFallback con guardia de ctx null.
 */
async function activateMultichannelOutputFallback(app) {
  const ctx = app.engine.audioCtx;
  if (!ctx) {
    throw new Error('AudioContext is null - cannot create ScriptProcessor fallback');
  }
  
  app._multichannelProcessor = ctx.createScriptProcessor(512, 12, 2);
  app._multichannelSilencer = ctx.createGain();
  app._multichannelSilencer.gain.value = 0;
  app._multichannelActive = true;
  
  return { success: true };
}

/**
 * Replica la lógica de onOutputModeChange de app.js.
 * Incluye la activación automática de DSP.
 */
async function handleOutputModeChange(app, mode) {
  if (mode === 'multichannel') {
    // Activación automática de DSP si estaba off
    const dspWasOff = !app.engine.dspEnabled;
    if (dspWasOff) {
      await app.engine.resumeDSP();
    }
    
    // Inicializar audio
    const audioReady = await app.ensureAudio();
    if (!audioReady) {
      app.audioSettingsModal.setOutputMode('stereo', false);
      return { success: false, error: 'audio engine failed to start' };
    }
    
    // Re-aplicar patch si DSP estaba off
    if (dspWasOff) {
      app._patchReapplied = true;
      app._dspChangedNotified = true;
    }
    
    // Activar multicanal
    const outputResult = await activateMultichannelOutput(app);
    if (!outputResult.success) {
      app.audioSettingsModal.setOutputMode('stereo', false);
      return { success: false, error: outputResult.error };
    }
    
    return { success: true, dspWasOff };
  } else {
    // Modo estéreo
    app._multichannelActive = false;
    app._multichannelSilencer = null;
    app._multichannelProcessor = null;
    return { success: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Activación multicanal - Guardias de AudioContext', () => {
  
  let app;
  
  beforeEach(() => {
    app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      _multichannelWorklet: null,
      _patchReapplied: false,
      _dspChangedNotified: false,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        await this.engine.ensureWorkletReady();
        return this.engine.workletReady;
      }
    };
  });
  
  it('retorna error si multichannelAPI no está disponible', async () => {
    app._multichannelAPI = null;
    
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error, /multichannelAPI/);
    assert.strictEqual(app._multichannelActive, false);
  });
  
  it('retorna error si AudioContext es null', async () => {
    app.engine.audioCtx = null;
    
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error, /AudioContext/);
    assert.strictEqual(app._multichannelActive, false);
  });
  
  it('no modifica canales del engine si AudioContext es null', async () => {
    app.engine.audioCtx = null;
    
    await activateMultichannelOutput(app);
    
    // Los canales deben seguir en 2 (estéreo)
    assert.strictEqual(app.engine.physicalChannels, 2);
    assert.deepStrictEqual(app.engine.physicalChannelLabels, ['L', 'R']);
  });
  
  it('skip si ya está activo', async () => {
    app._multichannelActive = true;
    
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, true);
    // No debió tocar los canales
    assert.strictEqual(app.engine.physicalChannels, 2);
  });
  
  it('activa multicanal con AudioContext válido', async () => {
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(app._multichannelActive, true);
    assert.strictEqual(app.engine.physicalChannels, 12);
  });
  
  it('crea silenciador al activar multicanal', async () => {
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, true);
    assert.ok(app._multichannelSilencer, 'silencer debe existir');
    assert.strictEqual(app._multichannelSilencer.gain.value, 0, 'silencer debe estar en 0');
  });
});

describe('Activación multicanal - Fallo de stream PipeWire', () => {
  
  let app;
  
  beforeEach(() => {
    app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI({ openSuccess: false }),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        return true;
      }
    };
  });
  
  it('revierte canales a estéreo si open() falla', async () => {
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, false);
    assert.strictEqual(app.engine.physicalChannels, 2, 'debe revertir a 2 canales');
    assert.deepStrictEqual(app.engine.physicalChannelLabels, ['L', 'R']);
    assert.strictEqual(app._multichannelActive, false);
  });
  
  it('no deja stream PipeWire abierto si open() falla', async () => {
    await activateMultichannelOutput(app);
    
    assert.strictEqual(app._multichannelAPI._isOpen(), false);
  });
});

describe('Activación multicanal - Fallo de worklet y fallback', () => {
  
  let app;
  
  beforeEach(() => {
    app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        return true;
      }
    };
    
    // Hacer que el worklet falle
    app.engine.audioCtx.audioWorklet.addModule = async () => {
      throw new Error('Worklet load failed');
    };
  });
  
  it('usa fallback de ScriptProcessor si worklet falla', async () => {
    const result = await activateMultichannelOutput(app);
    
    // El fallback debe tener éxito (ctx existe)
    assert.strictEqual(result.success, true);
    assert.strictEqual(app._multichannelActive, true);
    assert.ok(app._multichannelProcessor, 'debe crear ScriptProcessor');
  });
  
  it('limpia estado si worklet y fallback fallan', async () => {
    // Hacer que también falle el fallback (ctx null)
    app.engine.audioCtx.createScriptProcessor = () => {
      throw new Error('ScriptProcessor failed');
    };
    
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error, /fallaron/);
    assert.strictEqual(app._multichannelActive, false);
    // Stream PipeWire debe haberse cerrado
    assert.strictEqual(app._multichannelAPI._isOpen(), false);
    // Canales deben volver a estéreo
    assert.strictEqual(app.engine.physicalChannels, 2);
  });
});

describe('Activación multicanal - Fallback ScriptProcessor con ctx null', () => {
  
  it('lanza error si AudioContext es null en fallback', async () => {
    const app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: false }),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null
    };
    
    await assert.rejects(
      () => activateMultichannelOutputFallback(app),
      { message: /AudioContext is null/ }
    );
    
    assert.strictEqual(app._multichannelActive, false);
  });
  
  it('crea ScriptProcessor si AudioContext existe', async () => {
    const app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null
    };
    
    const result = await activateMultichannelOutputFallback(app);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(app._multichannelActive, true);
    assert.ok(app._multichannelProcessor);
  });
});

describe('onOutputModeChange - DSP automático al pedir multicanal', () => {
  
  let app;
  
  beforeEach(() => {
    app = {
      engine: createMockEngine({ dspEnabled: false, hasAudioCtx: false }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      _multichannelWorklet: null,
      _patchReapplied: false,
      _dspChangedNotified: false,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        await this.engine.ensureWorkletReady();
        return this.engine.workletReady;
      }
    };
  });
  
  it('activa DSP automáticamente si estaba apagado', async () => {
    assert.strictEqual(app.engine.dspEnabled, false, 'DSP debe empezar apagado');
    assert.strictEqual(app.engine.audioCtx, null, 'audioCtx debe ser null');
    
    const result = await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(app.engine.dspEnabled, true, 'DSP debe haberse activado');
    assert.ok(app.engine.audioCtx, 'audioCtx debe haberse creado');
    assert.strictEqual(app._multichannelActive, true);
  });
  
  it('reporta que DSP estaba off', async () => {
    const result = await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(result.dspWasOff, true);
  });
  
  it('re-aplica patch cuando DSP estaba off', async () => {
    await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(app._patchReapplied, true, 'debe re-aplicar patch');
  });
  
  it('notifica cambio de DSP cuando estaba off', async () => {
    await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(app._dspChangedNotified, true, 'debe notificar dspChanged');
  });
  
  it('no re-aplica patch si DSP ya estaba encendido', async () => {
    app.engine.dspEnabled = true;
    app.engine.audioCtx = createMockAudioCtx();
    app.engine.isRunning = true;
    
    const result = await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dspWasOff, false, 'DSP ya estaba encendido');
    assert.strictEqual(app._patchReapplied, false, 'no debe re-aplicar patch');
    assert.strictEqual(app._dspChangedNotified, false, 'no debe notificar dspChanged');
  });
  
  it('revierte a estéreo si ensureAudio falla con DSP roto', async () => {
    // Simular que ensureAudio falla siempre
    app.ensureAudio = async () => false;
    // resumeDSP sí funciona (marca dspEnabled=true) pero audio no arranca
    app.engine.resumeDSP = async function() { this.dspEnabled = true; };
    
    const result = await handleOutputModeChange(app, 'multichannel');
    
    assert.strictEqual(result.success, false);
    assert.strictEqual(app.audioSettingsModal.outputMode, 'stereo', 
      'debe revertir a estéreo');
    assert.strictEqual(app._multichannelActive, false);
  });
});

describe('onOutputModeChange - Flujo estéreo', () => {
  
  it('desactiva multicanal al cambiar a estéreo', async () => {
    const app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelActive: true,
      _multichannelSilencer: {},
      _multichannelProcessor: {},
      async ensureAudio() { return true; }
    };
    
    const result = await handleOutputModeChange(app, 'stereo');
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(app._multichannelActive, false);
    assert.strictEqual(app._multichannelSilencer, null);
  });
});

describe('Consistencia de estado tras activación/desactivación', () => {
  
  let app;
  
  beforeEach(() => {
    app = {
      engine: createMockEngine({ dspEnabled: true, hasAudioCtx: true }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      _patchReapplied: false,
      _dspChangedNotified: false,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        return true;
      }
    };
  });
  
  it('activar y desactivar deja estado limpio', async () => {
    // Activar
    const activateResult = await handleOutputModeChange(app, 'multichannel');
    assert.strictEqual(activateResult.success, true);
    assert.strictEqual(app._multichannelActive, true);
    
    // Desactivar
    const deactivateResult = await handleOutputModeChange(app, 'stereo');
    assert.strictEqual(deactivateResult.success, true);
    assert.strictEqual(app._multichannelActive, false);
    assert.strictEqual(app._multichannelSilencer, null);
    assert.strictEqual(app._multichannelProcessor, null);
  });
  
  it('ciclos múltiples estéreo→multicanal→estéreo no acumulan estado', async () => {
    for (let i = 0; i < 3; i++) {
      // Resetear estado para cada ciclo (simula la limpieza real)
      app._multichannelActive = false;
      
      const activateResult = await handleOutputModeChange(app, 'multichannel');
      assert.strictEqual(activateResult.success, true, `ciclo ${i + 1}: activar`);
      
      const deactivateResult = await handleOutputModeChange(app, 'stereo');
      assert.strictEqual(deactivateResult.success, true, `ciclo ${i + 1}: desactivar`);
      assert.strictEqual(app._multichannelActive, false, `ciclo ${i + 1}: estado limpio`);
    }
  });
  
  it('doble activación es idempotente', async () => {
    const result1 = await activateMultichannelOutput(app);
    assert.strictEqual(result1.success, true);
    
    const result2 = await activateMultichannelOutput(app);
    assert.strictEqual(result2.success, true);
    
    // Sigue activo, sin errores
    assert.strictEqual(app._multichannelActive, true);
  });
});

describe('Escenario completo: inicio sin audio → multicanal', () => {
  
  it('reproduce el bug original: DSP off + pedir multicanal', async () => {
    // Estado inicial: DSP apagado, sin AudioContext (como al inicio sin audio)
    const app = {
      engine: createMockEngine({ dspEnabled: false, hasAudioCtx: false }),
      audioSettingsModal: createMockAudioSettingsModal(),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null,
      _patchReapplied: false,
      _dspChangedNotified: false,
      async ensureAudio() {
        if (!this.engine.dspEnabled) return false;
        this.engine.start();
        await this.engine.ensureWorkletReady();
        return this.engine.workletReady;
      }
    };
    
    // Antes del fix: esto crasheaba con "Cannot read properties of null (reading 'audioWorklet')"
    // Después del fix: activa DSP, crea audioCtx, activa multicanal
    const result = await handleOutputModeChange(app, 'multichannel');
    
    // Verificar que todo se activó correctamente
    assert.strictEqual(result.success, true, 'multicanal debe activarse');
    assert.strictEqual(app.engine.dspEnabled, true, 'DSP debe estar encendido');
    assert.ok(app.engine.audioCtx, 'audioCtx debe existir');
    assert.strictEqual(app._multichannelActive, true, 'multicanal debe estar activo');
    assert.strictEqual(app.engine.physicalChannels, 12, 'debe tener 12 canales');
    
    // Verificar que se hizo la re-aplicación de patch
    assert.strictEqual(app._patchReapplied, true, 'debe haber re-aplicado patch');
    assert.strictEqual(app._dspChangedNotified, true, 'debe haber notificado cambio DSP');
  });
  
  it('sin fix: AudioContext null causa crash en activación directa', async () => {
    // Simula el escenario PRE-fix: se llama _activateMultichannelOutput sin ensureAudio
    const app = {
      engine: createMockEngine({ dspEnabled: false, hasAudioCtx: false }),
      _multichannelAPI: createMockMultichannelAPI(),
      _multichannelActive: false,
      _multichannelSilencer: null,
      _multichannelProcessor: null
    };
    
    // Con la guardia de AudioContext null, retorna error en vez de crashear
    const result = await activateMultichannelOutput(app);
    
    assert.strictEqual(result.success, false);
    assert.match(result.error, /AudioContext/);
    // Estado debe ser limpio — no queda nada a medio hacer
    assert.strictEqual(app._multichannelActive, false);
    assert.strictEqual(app.engine.physicalChannels, 2);
  });
});
