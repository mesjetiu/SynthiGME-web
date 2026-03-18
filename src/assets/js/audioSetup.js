/**
 * audioSetup.js
 *
 * Funciones de configuración de audio extraídas de app.js.
 * Gestiona la inicialización del AudioContext, salida/entrada multicanal
 * y la entrada de audio del sistema.
 *
 * Cada función recibe `app` como último parámetro en lugar de usar `this`.
 */

import { createLogger } from './utils/logger.js';
import { attachProcessorErrorHandler } from './utils/audio.js';
import { STORAGE_KEYS, isMobileDevice } from './utils/constants.js';

const log = createLogger('App');

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el motor de audio, espera a que el worklet esté listo y activa
 * el modo multicanal si estaba guardado en preferencias.
 *
 * @param {object} app - Instancia de la aplicación
 * @returns {Promise<boolean>} true si el worklet está listo
 */
export async function ensureAudio(app) {
  // Si DSP está deshabilitado, no iniciar audio
  if (!app.engine.dspEnabled) {
    return false;
  }

  // Evitar llamadas concurrentes - si ya hay una en progreso, esperar
  if (app._ensureAudioPromise) {
    return app._ensureAudioPromise;
  }

  app._ensureAudioPromise = (async () => {
    try {
      // Obtener latencyHint guardado o usar default según dispositivo
      const savedMode = localStorage.getItem(STORAGE_KEYS.LATENCY_MODE);
      const defaultMode = isMobileDevice() ? 'playback' : 'interactive';
      const latencyHint = savedMode || defaultMode;

      app.engine.start({ latencyHint });

      // Esperar a que el worklet esté listo (crucial para móviles)
      await app.engine.ensureWorkletReady();

      // Reanudar AudioContext si está suspendido (política autoplay de Chrome)
      // Requiere gesto del usuario para tener efecto
      if (app.engine.audioCtx?.state === 'suspended') {
        try {
          await app.engine.audioCtx.resume();
        } catch (e) { /* ignore — resume sin gesto no tiene efecto */ }
      }

      // Prevenir suspensión del sistema mientras hay audio activo (Electron)
      // Respeta la preferencia del usuario (misma que Wake Lock web)
      const sleepPref = localStorage.getItem(STORAGE_KEYS.WAKE_LOCK_ENABLED);
      if (sleepPref === null || sleepPref === 'true') {
        window.powerAPI?.preventSleep();
      }

      // Activar multicanal si estaba guardado (necesita AudioContext listo)
      await restoreMultichannelIfSaved(app);

      // Iniciar osciloscopio cuando haya audio
      app._ensurePanel2ScopeStarted();

      // Iniciar envelope shapers (siempre activos, como el hardware real)
      for (const esModule of app._envelopeShaperModules) {
        if (!esModule.isStarted) esModule.start();
      }

      // Iniciar secuenciador digital (siempre activo para recibir transport)
      if (app._sequencerModule && !app._sequencerModule.isStarted) {
        app._sequencerModule.start();
      }

      return app.engine.workletReady;
    } finally {
      // Limpiar la promesa para permitir futuras llamadas
      app._ensureAudioPromise = null;
    }
  })();

  return app._ensureAudioPromise;
}

/**
 * Restaura la salida multicanal si estaba guardada en preferencias.
 * Debe llamarse después de que el AudioContext esté listo.
 *
 * @param {object} app - Instancia de la aplicación
 */
export async function restoreMultichannelIfSaved(app) {
  if (app._multichannelRestored) return; // Solo una vez
  app._multichannelRestored = true; // Marcar antes de async para evitar race conditions

  const savedMode = app.audioSettingsModal?.outputMode;

  if (savedMode === 'multichannel') {
    log.info('🔊 Restoring multichannel output from saved mode...');
    const outputResult = await activateMultichannelOutput(app);
    if (outputResult.success) {
      log.info('🔊 Multichannel output restored (12ch)');
      app.audioSettingsModal.updatePhysicalChannels(12,
        ['Pan 1-4 L', 'Pan 1-4 R', 'Pan 5-8 L', 'Pan 5-8 R', 'Out 1', 'Out 2', 'Out 3', 'Out 4', 'Out 5', 'Out 6', 'Out 7', 'Out 8']);

      // Re-aplicar routing al engine tras reconstruir la arquitectura de salida
      app._applyAllRoutingToEngine();

      // También restaurar entrada multicanal
      const inputResult = await activateMultichannelInput(app);
      if (inputResult.success) {
        log.info('🎤 Multichannel input restored (8ch)');
      } else {
        log.warn('🎤 Multichannel input failed (output still active):', inputResult.error);
      }
    } else {
      log.error('🔊 Failed to restore multichannel:', outputResult.error);
      // Revertir a estéreo si falla (notify=false para evitar callback loop)
      app.audioSettingsModal.setOutputMode('stereo', false);
    }
  }
}

/**
 * Activa la salida multicanal nativa de 8 canales.
 * Usa SharedArrayBuffer para comunicación lock-free con AudioWorklet.
 *
 * @param {object} app - Instancia de la aplicación
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function activateMultichannelOutput(app) {
  // Evitar re-activación si ya está activo
  if (app._multichannelActive) {
    log.info('🎛️ Multichannel output already active, skipping');
    return { success: true };
  }

  // CRÍTICO: Verificar disponibilidad ANTES de tocar el engine
  // (en navegador web, window.multichannelAPI no existe)
  if (!window.multichannelAPI) {
    log.info('🎛️ multichannelAPI not available (browser mode)');
    return { success: false, error: 'multichannelAPI no disponible' };
  }

  // CRÍTICO: AudioContext debe existir para crear nodos de audio
  if (!app.engine.audioCtx) {
    log.error('🎛️ Cannot activate multichannel: AudioContext is null');
    return { success: false, error: 'AudioContext no inicializado' };
  }

  // Primero forzar 12 canales en el engine
  const channelLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  app.engine.forcePhysicalChannels(12, channelLabels, true);

  // Obtener latencia configurada del modal de ajustes
  const configuredLatencyMs = app.audioSettingsModal?.getConfiguredLatencyMs?.() || 42;
  log.info('🎛️ Using configured latency:', configuredLatencyMs, 'ms');

  // Configurar latencia ANTES de abrir el stream
  if (window.multichannelAPI.setLatency) {
    window.multichannelAPI.setLatency(configuredLatencyMs);
  }

  // Abrir el stream multicanal
  const sampleRate = app.engine.audioCtx?.sampleRate || 48000;
  const result = await window.multichannelAPI.open({ sampleRate, channels: 12 });

  if (!result.success) {
    app.engine.forcePhysicalChannels(2, ['L', 'R'], false);
    return { success: false, error: result.error };
  }

  log.info('🎛️ Multichannel stream opened:', result.info);

  const ctx = app.engine.audioCtx;

  // Crear SharedArrayBuffer en el renderer si está disponible
  // Layout: [writeIndex(4), readIndex(4), audioData(frames * 12ch * 4bytes)]
  const SHARED_BUFFER_FRAMES = 8192;  // ~170ms @ 48kHz
  const channels = 12;
  let sharedBuffer = null;

  // DEBUG: Verificar disponibilidad de SharedArrayBuffer
  console.warn('[SAB Debug] typeof SharedArrayBuffer:', typeof SharedArrayBuffer);
  console.warn('[SAB Debug] crossOriginIsolated:', window.crossOriginIsolated);

  if (typeof SharedArrayBuffer !== 'undefined') {
    console.warn('[SAB Debug] SharedArrayBuffer disponible, intentando crear...');
    try {
      const byteLength = 8 + (SHARED_BUFFER_FRAMES * channels * 4);
      sharedBuffer = new SharedArrayBuffer(byteLength);
      console.warn('[SAB Debug] SharedArrayBuffer creado:', byteLength, 'bytes');

      // Inicializar índices a 0
      const control = new Int32Array(sharedBuffer, 0, 2);
      control[0] = 0;  // writeIndex (worklet escribe)
      control[1] = 0;  // readIndex (C++ escribe)

      // Adjuntar al native stream via preload
      console.warn('[SAB Debug] Llamando attachSharedBuffer...');
      const attached = window.multichannelAPI.attachSharedBuffer(sharedBuffer, SHARED_BUFFER_FRAMES);
      console.warn('[SAB Debug] attachSharedBuffer resultado:', attached);
      if (attached) {
        app._sharedAudioBuffer = sharedBuffer;
        app._sharedBufferFrames = SHARED_BUFFER_FRAMES;
        log.info('🎛️ SharedArrayBuffer creado y adjuntado:', SHARED_BUFFER_FRAMES, 'frames - LOCK-FREE MODE!');
      } else {
        log.warn('🎛️ No se pudo adjuntar SharedArrayBuffer, usando fallback');
        sharedBuffer = null;
      }
    } catch (e) {
      log.warn('🎛️ Error creando SharedArrayBuffer:', e.message);
      sharedBuffer = null;
    }
  } else {
    log.warn('🎛️ SharedArrayBuffer no disponible (requiere COOP/COEP headers)');
  }

  // Cargar el AudioWorklet
  try {
    await ctx.audioWorklet.addModule('./assets/js/worklets/multichannelCapture.worklet.js');
    log.info('🎛️ MultichannelCapture worklet loaded');
  } catch (e) {
    log.error('🎛️ Failed to load worklet:', e);
    try {
      return await activateMultichannelOutputFallback(app);
    } catch (fallbackError) {
      // Si también falla el fallback, limpiar estado y cerrar stream
      log.error('🎛️ Fallback also failed:', fallbackError);
      await window.multichannelAPI.close();
      app.engine.forcePhysicalChannels(2, ['L', 'R'], false);
      return { success: false, error: 'Worklet y fallback fallaron' };
    }
  }

  // Crear el AudioWorkletNode
  const chunkSize = 2048; // Fallback chunk size
  app._multichannelWorklet = new AudioWorkletNode(ctx, 'multichannel-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 12,
    channelCountMode: 'explicit',
    channelInterpretation: 'discrete',
    processorOptions: {
      channels: 12,
      chunkSize: chunkSize
    }
  });
  attachProcessorErrorHandler(app._multichannelWorklet, 'multichannel-capture');

  app._mcWorkletChunks = 0;

  // Configurar comunicación con el worklet
  app._multichannelWorklet.port.onmessage = (event) => {
    const { type } = event.data;

    if (type === 'ready') {
      // Worklet listo - enviar SharedArrayBuffer si tenemos uno
      if (app._sharedAudioBuffer) {
        app._multichannelWorklet.port.postMessage({
          type: 'init',
          sharedBuffer: app._sharedAudioBuffer,
          bufferFrames: app._sharedBufferFrames
        });
        log.info('🎛️ SharedArrayBuffer enviado al worklet');
      }
    } else if (type === 'initialized') {
      log.info('🎛️ Worklet inicializado con SharedArrayBuffer - LOCK-FREE activo!');
    } else if (type === 'audioData') {
      // Fallback: recibir datos via MessagePort
      const { buffer, frames } = event.data;
      const audioData = new Float32Array(buffer);
      window.multichannelAPI.write(audioData);

      app._mcWorkletChunks++;
      if (app._mcWorkletChunks % 200 === 1) {
        log.info(`🎛️ [Fallback] Chunk #${app._mcWorkletChunks}, ${frames} frames`);
      }
    }
  };

  // Crear GainNode silenciador
  app._multichannelSilencer = ctx.createGain();
  app._multichannelSilencer.gain.value = 0;

  app._multichannelActive = true;

  try {
    app.engine.merger.disconnect();
    log.info('🎛️ Merger disconnected');
  } catch (e) {
    log.warn('🎛️ Merger disconnect failed:', e.message);
  }

  // Conectar: merger → worklet → silencer → destination
  app.engine.merger.connect(app._multichannelWorklet);
  app._multichannelWorklet.connect(app._multichannelSilencer);
  app._multichannelSilencer.connect(ctx.destination);

  const mode = app._sharedAudioBuffer ? 'LOCK-FREE (SharedArrayBuffer)' : 'FALLBACK (MessagePort)';
  log.info(`🎛️ Multichannel active - ${mode}`);

  return { success: true };
}

/**
 * Fallback a ScriptProcessor si AudioWorklet no está disponible.
 *
 * @param {object} app - Instancia de la aplicación
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function activateMultichannelOutputFallback(app) {
  log.warn('🎛️ Using ScriptProcessor fallback (may have UI-related audio glitches)');

  const ctx = app.engine.audioCtx;
  if (!ctx) {
    throw new Error('AudioContext is null - cannot create ScriptProcessor fallback');
  }
  const bufferSize = 512;
  const inputChannels = 12;
  const outputChannels = 2;

  app._multichannelProcessor = ctx.createScriptProcessor(bufferSize, inputChannels, outputChannels);
  app._multichannelSilencer = ctx.createGain();
  app._multichannelSilencer.gain.value = 0;

  app._multichannelProcessor.onaudioprocess = (event) => {
    const inputBuffer = event.inputBuffer;
    const outputBuffer = event.outputBuffer;
    const frameCount = inputBuffer.length;
    const channelCount = inputBuffer.numberOfChannels;

    // Silencio en salida
    for (let ch = 0; ch < outputBuffer.numberOfChannels; ch++) {
      const out = outputBuffer.getChannelData(ch);
      for (let i = 0; i < out.length; i++) out[i] = 0;
    }

    // Interleave y enviar
    const interleavedBuffer = new Float32Array(frameCount * channelCount);
    for (let frame = 0; frame < frameCount; frame++) {
      for (let ch = 0; ch < channelCount; ch++) {
        interleavedBuffer[frame * channelCount + ch] = inputBuffer.getChannelData(ch)[frame];
      }
    }
    window.multichannelAPI.write(interleavedBuffer.buffer);
  };

  app._multichannelActive = true;

  try { app.engine.merger.disconnect(); } catch (e) {}

  app.engine.merger.connect(app._multichannelProcessor);
  app._multichannelProcessor.connect(app._multichannelSilencer);
  app._multichannelSilencer.connect(ctx.destination);

  return { success: true };
}

/**
 * Desactiva la salida multicanal y restaura la salida normal.
 *
 * @param {object} app - Instancia de la aplicación
 */
export async function deactivateMultichannelOutput(app) {
  if (!app._multichannelActive) return;

  log.info('🎛️ Deactivating multichannel output...');

  // Cerrar el stream nativo
  if (window.multichannelAPI) {
    await window.multichannelAPI.close();
  }

  const ctx = app.engine.audioCtx;

  // Desconectar worklet o processor
  if (app._multichannelWorklet) {
    try {
      // Enviar señal de stop al worklet para que deje de procesar
      app._multichannelWorklet.port.postMessage({ type: 'stop' });
      app.engine.merger.disconnect(app._multichannelWorklet);
      app._multichannelWorklet.disconnect();
      app._multichannelWorklet.port.close();
    } catch (e) {}
    app._multichannelWorklet = null;
  }

  if (app._multichannelProcessor) {
    try {
      app.engine.merger.disconnect(app._multichannelProcessor);
      app._multichannelProcessor.disconnect();
      app._multichannelProcessor.onaudioprocess = null;
    } catch (e) {}
    app._multichannelProcessor = null;
  }

  if (app._multichannelSilencer) {
    try { app._multichannelSilencer.disconnect(); } catch (e) {}
    app._multichannelSilencer = null;
  }

  // Restaurar conexión normal al destination
  if (app.engine.merger && ctx) {
    app.engine._skipDestinationConnect = false;
    app.engine.merger.connect(ctx.destination);
  }

  app._multichannelActive = false;
  log.info('🎛️ Multichannel output deactivated, normal audio restored');
}

/**
 * Activa la entrada multicanal nativa de 8 canales.
 * Usa SharedArrayBuffer para comunicación lock-free con AudioWorklet.
 *
 * @param {object} app - Instancia de la aplicación
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function activateMultichannelInput(app) {
  // Evitar re-activación si ya está activo
  if (app._multichannelInputActive) {
    log.info('🎤 Multichannel input already active, skipping');
    return { success: true };
  }

  // Verificar disponibilidad
  if (!window.multichannelInputAPI) {
    log.info('🎤 multichannelInputAPI not available (browser mode)');
    return { success: false, error: 'multichannelInputAPI no disponible' };
  }

  if (!app.inputAmplifiers?.isStarted) {
    log.warn('🎤 Input amplifiers not ready for multichannel input');
    return { success: false, error: 'Input amplifiers not ready' };
  }

  // Desconectar el input estéreo del sistema si está activo
  // (en modo multicanal usamos PipeWire directamente, no getUserMedia)
  app._disconnectSystemAudioInput();

  const ctx = app.engine.audioCtx;
  const sampleRate = ctx?.sampleRate || 48000;

  // Abrir el stream de captura PipeWire
  const result = await window.multichannelInputAPI.open({ sampleRate, channels: 8 });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  log.info('🎤 Multichannel input stream opened:', result.info);

  // Crear SharedArrayBuffer para recibir audio capturado
  // Layout: [writeIndex(4), readIndex(4), audioData(frames * 8ch * 4bytes)]
  const SHARED_BUFFER_FRAMES = 8192;  // ~170ms @ 48kHz
  const channels = 8;
  let sharedBuffer = null;

  if (typeof SharedArrayBuffer !== 'undefined') {
    try {
      const byteLength = 8 + (SHARED_BUFFER_FRAMES * channels * 4);
      sharedBuffer = new SharedArrayBuffer(byteLength);

      // Inicializar índices a 0
      const control = new Int32Array(sharedBuffer, 0, 2);
      control[0] = 0;  // writeIndex (C++ escribe)
      control[1] = 0;  // readIndex (worklet escribe)

      // Adjuntar al native stream
      const attached = window.multichannelInputAPI.attachSharedBuffer(sharedBuffer, SHARED_BUFFER_FRAMES);
      if (attached) {
        app._sharedInputBuffer = sharedBuffer;
        app._sharedInputBufferFrames = SHARED_BUFFER_FRAMES;
        log.info('🎤 Input SharedArrayBuffer creado y adjuntado:', SHARED_BUFFER_FRAMES, 'frames');
      } else {
        log.warn('🎤 No se pudo adjuntar SharedArrayBuffer de input');
        sharedBuffer = null;
      }
    } catch (e) {
      log.warn('🎤 Error creando Input SharedArrayBuffer:', e.message);
      sharedBuffer = null;
    }
  }

  if (!sharedBuffer) {
    // Sin SharedArrayBuffer no podemos continuar
    await window.multichannelInputAPI.close();
    return { success: false, error: 'SharedArrayBuffer no disponible' };
  }

  // Cargar el AudioWorklet de playback (lee del SAB y produce audio)
  try {
    await ctx.audioWorklet.addModule('./assets/js/worklets/multichannelPlayback.worklet.js');
    log.info('🎤 MultichannelPlayback worklet loaded');
  } catch (e) {
    log.error('🎤 Failed to load playback worklet:', e);
    await window.multichannelInputAPI.close();
    return { success: false, error: 'Failed to load worklet' };
  }

  // Crear el AudioWorkletNode
  app._multichannelInputWorklet = new AudioWorkletNode(ctx, 'multichannel-playback', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [8],
    channelCount: 8,
    channelCountMode: 'explicit',
    channelInterpretation: 'discrete',
    processorOptions: {
      channels: 8
    }
  });
  attachProcessorErrorHandler(app._multichannelInputWorklet, 'multichannel-playback');

  // Configurar comunicación con el worklet
  app._multichannelInputWorklet.port.onmessage = (event) => {
    const { type } = event.data;

    if (type === 'ready') {
      // Worklet listo - enviar SharedArrayBuffer
      if (app._sharedInputBuffer) {
        app._multichannelInputWorklet.port.postMessage({
          type: 'init',
          sharedBuffer: app._sharedInputBuffer,
          bufferFrames: app._sharedInputBufferFrames
        });
        log.info('🎤 Input SharedArrayBuffer enviado al worklet');
      }
    } else if (type === 'initialized') {
      log.info('🎤 Input worklet inicializado con SharedArrayBuffer');
    }
  };

  // Conectar worklet → ChannelSplitter → Input Amplifiers (1:1 directo)
  const splitter = ctx.createChannelSplitter(8);
  app._multichannelInputWorklet.connect(splitter);

  for (let ch = 0; ch < 8; ch++) {
    const inputNode = app.inputAmplifiers.getInputNode(ch);
    if (inputNode) {
      splitter.connect(inputNode, ch);
    }
  }

  app._multichannelInputSplitter = splitter;
  app._multichannelInputActive = true;

  log.info('🎤 Multichannel input active - 8ch PipeWire → Input Amplifiers');
  return { success: true };
}

/**
 * Desactiva la entrada multicanal nativa.
 *
 * @param {object} app - Instancia de la aplicación
 */
export async function deactivateMultichannelInput(app) {
  if (!app._multichannelInputActive) return;

  log.info('🎤 Deactivating multichannel input...');

  // Cerrar el stream nativo
  if (window.multichannelInputAPI) {
    await window.multichannelInputAPI.close();
  }

  // Desconectar worklet y splitter
  if (app._multichannelInputWorklet) {
    try {
      // Enviar señal de stop al worklet para que deje de procesar
      app._multichannelInputWorklet.port.postMessage({ type: 'stop' });
      app._multichannelInputWorklet.disconnect();
      app._multichannelInputWorklet.port.close();
    } catch (e) {}
    app._multichannelInputWorklet = null;
  }

  if (app._multichannelInputSplitter) {
    try { app._multichannelInputSplitter.disconnect(); } catch (e) {}
    app._multichannelInputSplitter = null;
  }

  app._sharedInputBuffer = null;
  app._multichannelInputActive = false;

  log.info('🎤 Multichannel input deactivated');

  // Restaurar input estéreo del sistema si hay un dispositivo seleccionado
  const inputDeviceId = app.audioSettingsModal?.selectedInputDevice;
  if (inputDeviceId) {
    await ensureSystemAudioInput(app, inputDeviceId);
  }
}

/**
 * Asegura que el audio del sistema esté conectado a los Input Amplifiers.
 * Solicita permiso de micrófono si es necesario.
 *
 * @param {object} app - Instancia de la aplicación
 * @param {string|null} [deviceId] - ID del dispositivo de entrada (opcional)
 */
export async function ensureSystemAudioInput(app, deviceId = null) {
  // Evitar reconectar si ya está conectado con el mismo dispositivo
  if (app._systemAudioConnected && !deviceId) return;

  // Verificar si el permiso fue denegado previamente (evita bucle en Chrome móvil)
  if (app.audioSettingsModal?.isMicrophonePermissionDenied?.()) {
    log.info(' Microphone permission previously denied, skipping getUserMedia');
    return;
  }

  if (!app.inputAmplifiers?.isStarted) {
    log.warn(' Input amplifiers not ready for system audio');
    return;
  }

  const ctx = app.engine.audioCtx;
  if (!ctx) return;

  try {
    // Configurar constraints para getUserMedia
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };

    // Si se especifica un dispositivo, usarlo
    if (deviceId && deviceId !== 'default') {
      audioConstraints.deviceId = { exact: deviceId };
    }

    // Solicitar acceso al micrófono/entrada de línea
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // Permiso concedido - limpiar flag si existía
    if (app.audioSettingsModal?.clearMicrophonePermissionDenied) {
      app.audioSettingsModal.clearMicrophonePermissionDenied();
    }

    // Crear nodo fuente desde el stream
    const sourceNode = ctx.createMediaStreamSource(stream);
    const channelCount = sourceNode.channelCount || 2;

    log.info(` System audio input: ${channelCount} channels`);

    // Crear splitter para separar los canales de entrada
    const splitter = ctx.createChannelSplitter(Math.max(channelCount, 2));
    sourceNode.connect(splitter);

    // Crear matriz de GainNodes: inputRoutingGains[sysInput][synthChannel]
    // Esto permite controlar el ruteo de cada entrada del sistema a cada Input Amplifier
    app._inputRoutingGains = [];

    for (let sysIdx = 0; sysIdx < channelCount; sysIdx++) {
      const rowGains = [];

      for (let chIdx = 0; chIdx < 8; chIdx++) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0; // Empiezan en silencio, se aplica ruteo después

        // Conectar: splitter canal sysIdx → gainNode → Input Amplifier chIdx
        splitter.connect(gainNode, sysIdx);
        const inputNode = app.inputAmplifiers.getInputNode(chIdx);
        if (inputNode) {
          gainNode.connect(inputNode);
        }

        rowGains.push(gainNode);
      }

      app._inputRoutingGains.push(rowGains);
    }

    app._systemAudioStream = stream;
    app._systemAudioSource = sourceNode;
    app._systemAudioSplitter = splitter;
    app._systemAudioChannelCount = channelCount;
    app._systemAudioConnected = true;

    // Actualizar el modal con el número de canales detectados
    const labels = app._generateInputLabels(channelCount);
    if (app.audioSettingsModal) {
      app.audioSettingsModal.updatePhysicalInputChannels(channelCount, labels);
      // Aplicar el ruteo guardado
      app.audioSettingsModal.applyInputRoutingToEngine();
    }

    log.info(` Input routing matrix created: ${channelCount}×8`);

  } catch (err) {
    log.warn(' Could not access system audio input:', err.message);

    // Marcar permiso como denegado para evitar bucle en Chrome móvil
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      localStorage.setItem(STORAGE_KEYS.MIC_PERMISSION_DENIED, 'true');
      log.info(' Microphone permission denied, flag saved to prevent retry loop');
    }
    // No es crítico, los Input Amplifiers simplemente no tendrán entrada del sistema
  }
}
