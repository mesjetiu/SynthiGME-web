/**
 * Inicialización de UI y modales (R7).
 *
 * Extraído de app.js — configuración de modales, grabación, dormancy,
 * patch browser, undo/redo y filtros de bypass.
 *
 * @module uiInitializer
 */

import { createLogger } from './utils/logger.js';
import { sessionManager } from './state/sessionManager.js';
import { undoRedoManager } from './state/undoRedoManager.js';
import { DormancyManager } from './core/dormancyManager.js';
import { RecordingEngine } from './core/recordingEngine.js';
import { AudioSettingsModal } from './ui/audioSettingsModal.js';
import { RecordingSettingsModal } from './ui/recordingSettingsModal.js';
import { RecordingOverlay } from './ui/recordingOverlay.js';
import { SettingsModal } from './ui/settingsModal.js';
import { PatchBrowser } from './ui/patchBrowser.js';
import { WakeLockManager } from './utils/wakeLock.js';
import { STORAGE_KEYS } from './utils/constants.js';
import { showToast } from './ui/toast.js';
import { t } from './i18n/index.js';
import { initOSCLogWindow } from './ui/oscLogWindow.js';
import { oscBridge } from './osc/oscBridge.js';

const log = createLogger('UIInitializer');

// ─────────────────────────────────────────────────────────────────────────────

export function setupUI(app) {
    // Handler para toggle de DSP (motor de audio on/off)
    document.addEventListener('synth:toggleDSP', async (e) => {
      const forceEnabled = e.detail?.enabled;
      const newState = forceEnabled !== undefined ? forceEnabled : !app.engine.dspEnabled;
      
      if (newState) {
        // Activar DSP: reanudar o inicializar con patch actual
        await app.engine.resumeDSP();
        if (!app.engine.audioCtx) {
          await app.ensureAudio();
        }
        // Siempre re-aplicar patch para recrear conexiones de audio que
        // pudieron omitirse mientras DSP estaba off (los pines de la UI
        // se activan pero _handlePanel5AudioToggle retorna sin crear nodos
        // de audio cuando dspEnabled=false)
        const currentState = app._serializeCurrentState();
        if (currentState) {
          await app._applyPatch(currentState);
        }
        showToast(t('toast.dspEnabled'));
      } else {
        // Desactivar DSP: suspender AudioContext
        // Detener grabación si está activa
        if (app._recordingEngine?.isRecording) {
          await app._recordingEngine.toggle();
        }
        // Detener osciloscopio
        if (app._panel2Data?.scopeModule?.isRunning) {
          app._panel2Data.scopeModule.stop();
          app._panel2ScopeStarted = false;
        }
        await app.engine.suspendDSP();
        showToast(t('toast.dspDisabled'));
      }
      
      // Notificar del cambio de estado
      document.dispatchEvent(new CustomEvent('synth:dspChanged', {
        detail: { enabled: app.engine.dspEnabled }
      }));
    });
    
    // Handler para mute global desde quickbar
    document.addEventListener('synth:toggleMute', () => {
      if (!app.engine.dspEnabled) return;
      app.ensureAudio();
      // Resumir AudioContext (estamos en un gesto del usuario)
      if (app.engine.audioCtx && app.engine.audioCtx.state === 'suspended') {
        app.engine.audioCtx.resume();
      }
      app.engine.toggleMute();
      const muted = app.engine.muted;
      
      // Notificar a quickbar del nuevo estado
      document.dispatchEvent(new CustomEvent('synth:muteChanged', {
        detail: { muted }
      }));
      
      // Mostrar toast de feedback
      showToast(t(muted ? 'toast.mute' : 'toast.unmute'));
    });
    
    // Modal de configuración de audio (ruteo salidas → sistema L/R)
    setupAudioSettingsModal(app);
  }


export function setupAudioSettingsModal(app) {
    // Obtener información de canales inicial del engine
    const channelInfo = app.engine.getPhysicalChannelInfo?.() || { count: 2, labels: ['L', 'R'] };
    
    app.audioSettingsModal = new AudioSettingsModal({
      outputCount: app.engine.outputChannels,
      inputCount: 8,  // 8 Input Amplifiers del Synthi
      physicalChannels: channelInfo.count,
      channelLabels: channelInfo.labels,
      physicalInputChannels: 2,  // Por defecto estéreo, se actualiza al detectar dispositivo
      inputChannelLabels: ['L', 'R'],
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE RUTEO DE SALIDA MULTICANAL
      // ─────────────────────────────────────────────────────────────────────────
      // Recibe: busIndex y array de ganancias por canal [ch0, ch1, ch2, ...]
      // El engine ignora canales que no existan en el hardware actual y
      // devuelve información sobre qué canales fueron aplicados/ignorados.
      // ─────────────────────────────────────────────────────────────────────────
      onRoutingChange: (busIndex, channelGains) => {
        const result = app.engine.setOutputRouting(busIndex, channelGains);
        // Si hay canales ignorados, el engine ya emite warning en consola
        return result;
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE RUTEO DE ENTRADA (Sistema → Input Amplifiers)
      // ─────────────────────────────────────────────────────────────────────────
      // Recibe: systemInputIndex y array de ganancias por Input Amplifier
      // Actualiza los GainNodes que conectan cada entrada del sistema con
      // los 8 canales de los Input Amplifiers.
      // ─────────────────────────────────────────────────────────────────────────
      onInputRoutingChange: (systemInputIndex, channelGains) => {
        app._applyInputRouting(systemInputIndex, channelGains);
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE CAMBIO DE DISPOSITIVO DE SALIDA
      // ─────────────────────────────────────────────────────────────────────────
      // El engine detecta automáticamente el número de canales del nuevo
      // dispositivo y notifica al modal para reconstruir la matriz.
      // Solo se llama en modo estéreo (en multicanal el selector está deshabilitado).
      // ─────────────────────────────────────────────────────────────────────────
      onOutputDeviceChange: async (deviceId) => {
        // Desactivar multicanal si estaba activo (por si acaso)
        await app._deactivateMultichannelOutput();
        
        const result = await app.engine.setOutputDevice(deviceId);
        if (result.success) {
          log.info(` Output device changed. Channels: ${result.channels}`);
          // La notificación de canales se hace a través del callback registrado abajo
        }
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE CAMBIO DE MODO DE SALIDA (estéreo/multicanal)
      // ─────────────────────────────────────────────────────────────────────────
      // Alterna entre salida estéreo (dispositivo seleccionado) y multicanal
      // nativo (PipeWire 12 canales salida + 8 canales entrada).
      // ─────────────────────────────────────────────────────────────────────────
      onOutputModeChange: async (mode) => {
        if (mode === 'multichannel') {
          // Asegurar que el audio esté inicializado antes de activar multicanal.
          // Si DSP está deshabilitado (ej: "Activar audio al iniciar" desactivado),
          // lo re-habilitamos automáticamente — el usuario quiere multicanal, necesita audio.
          const dspWasOff = !app.engine.dspEnabled;
          if (dspWasOff) {
            log.info('🔊 DSP disabled, enabling for multichannel activation...');
            await app.engine.resumeDSP();
          }
          const audioReady = await app.ensureAudio();
          if (!audioReady) {
            log.error('🔊 Cannot activate multichannel: audio engine failed to start');
            app.audioSettingsModal.setOutputMode('stereo', false);
            return;
          }
          // Si el audio se acaba de inicializar (estaba off), re-aplicar patch
          // para recrear conexiones de audio omitidas con DSP off
          if (dspWasOff) {
            const currentState = app._serializeCurrentState();
            if (currentState) {
              await app._applyPatch(currentState);
            }
            // Notificar del cambio de estado DSP (actualiza checkboxes, menú Electron, etc.)
            document.dispatchEvent(new CustomEvent('synth:dspChanged', {
              detail: { enabled: true }
            }));
          }
          // Activar salida multicanal (12ch)
          const outputResult = await app._activateMultichannelOutput();
          if (outputResult.success) {
            log.info('🔊 Multichannel output activated (12ch)');
            // Forzar 12 canales en el modal con nombres descriptivos
            app.audioSettingsModal.updatePhysicalChannels(12, 
              ['Pan 1-4 L', 'Pan 1-4 R', 'Pan 5-8 L', 'Pan 5-8 R', 'Out 1', 'Out 2', 'Out 3', 'Out 4', 'Out 5', 'Out 6', 'Out 7', 'Out 8']);
            
            // Re-aplicar routing al engine tras reconstruir la arquitectura de salida
            app._applyAllRoutingToEngine();
            
            // Activar entrada multicanal (8ch)
            const inputResult = await app._activateMultichannelInput();
            if (inputResult.success) {
              log.info('🎤 Multichannel input activated (8ch)');
            } else {
              log.warn('🎤 Multichannel input failed (output still active):', inputResult.error);
              // El input es opcional, no revertimos el output si falla
            }
          } else {
            log.error('🔊 Failed to activate multichannel:', outputResult.error);
            // Revertir a estéreo (notify=false para evitar callback loop)
            app.audioSettingsModal.setOutputMode('stereo', false);
          }
        } else {
          // Modo estéreo: desactivar multicanal y restaurar dispositivo
          await app._deactivateMultichannelInput();
          await app._deactivateMultichannelOutput();
          
          // Restaurar el dispositivo seleccionado en el modal
          const deviceId = app.audioSettingsModal.selectedOutputDevice;
          if (deviceId) {
            const result = await app.engine.setOutputDevice(deviceId);
            if (result.success) {
              log.info(`🔊 Stereo mode restored. Device: ${deviceId}, Channels: ${result.channels}`);
            }
          }
        }
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE CAMBIO DE DISPOSITIVO DE ENTRADA
      // ─────────────────────────────────────────────────────────────────────────
      // Reconecta el audio del sistema con el nuevo dispositivo seleccionado.
      // Detecta el número de canales de entrada y actualiza la matriz.
      // ─────────────────────────────────────────────────────────────────────────
      onInputDeviceChange: async (deviceId) => {
        log.info(' Input device selected:', deviceId);
        await app._reconnectSystemAudioInput(deviceId);
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE RUTEO DE STEREO BUSES (Pan 1-4 L/R, Pan 5-8 L/R)
      // ─────────────────────────────────────────────────────────────────────────
      // Recibe: rowIdx (0=Pan1-4L, 1=Pan1-4R, 2=Pan5-8L, 3=Pan5-8R), channelGains[]
      // Permite rutear cada salida de stereo bus a múltiples canales físicos.
      // ─────────────────────────────────────────────────────────────────────────
      onStereoBusRoutingChange: (rowIdx, channelGains) => {
        app.engine.setStereoBusRouting(rowIdx, channelGains);
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // INICIALIZAR ROUTING CON CANALES CORRECTOS
    // ─────────────────────────────────────────────────────────────────────────
    // El modal se crea con outputRouting=null para evitar guardar en clave incorrecta.
    // Llamamos updatePhysicalChannels para cargar el routing del modo actual.
    // ─────────────────────────────────────────────────────────────────────────
    app.audioSettingsModal.updatePhysicalChannels(channelInfo.count, channelInfo.labels);
    
    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRAR CALLBACK PARA CAMBIOS DE CANALES
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando el engine detecta un cambio en el número de canales (ej: el usuario
    // cambia de auriculares estéreo a interfaz multicanal), notifica al modal
    // para que reconstruya la matriz de ruteo dinámicamente.
    // ─────────────────────────────────────────────────────────────────────────
    if (app.engine.onPhysicalChannelsChange) {
      app.engine.onPhysicalChannelsChange((channelCount, labels) => {
        log.info(` Physical channels changed: ${channelCount}`, labels);
        app.audioSettingsModal.updatePhysicalChannels(channelCount, labels);
        // Re-aplicar routing tras reconstruir la arquitectura
        app._applyAllRoutingToEngine();
      });
    }
    
    // Aplicar ruteo guardado al engine cuando inicie
    const originalStart = app.engine.start.bind(app.engine);
    app.engine.start = () => {
      originalStart();
      
      // ─────────────────────────────────────────────────────────────────────
      // SINCRONIZAR ESTADO DE MUTE DE OUTPUT CHANNELS
      // ─────────────────────────────────────────────────────────────────────
      // Los switches de power se crean antes de que el engine inicie,
      // por lo que su estado inicial no se aplicó al engine. Lo hacemos ahora.
      // ─────────────────────────────────────────────────────────────────────
      if (app._outputChannelsPanel?.channels) {
        log.info(' Syncing output channel mute states to engine...');
        app._outputChannelsPanel.channels.forEach((channel, idx) => {
          const isMuted = !channel.values.power;
          app.engine.setOutputMute(idx, isMuted);
        });
      }
      
      // ─────────────────────────────────────────────────────────────────────
      // CONECTAR VOLTÍMETROS A METERING DEL OUTPUT-FILTER WORKLET
      // ─────────────────────────────────────────────────────────────────────
      // Zero-node approach: el metering se calcula DENTRO del output-filter
      // worklet que ya existe en la cadena. No se añaden nodos ni conexiones.
      // filterGain se mantiene siempre en 1; con filterPosition=0 el worklet
      // da H(z)=1 (pass-through perfecto = bypass matemático).
      // ─────────────────────────────────────────────────────────────────────
      if (app._panel4Data?.voltmeters) {
        const vms = app._panel4Data.voltmeters;
        for (let i = 0; i < 8; i++) {
          const bus = app.engine.outputBuses[i];
          const vm = vms[`voltmeter${i + 1}`];
          if (bus?.filterNode && vm) {
            bus.filterNode.port.onmessage = (e) => {
              if (e.data?.type === 'meter') {
                vm.updateMeter(e.data);
              }
            };
            bus.filterNode.port.postMessage({ type: 'enableMeter' });
          }
        }
        log.info(' Voltmeters connected via output-filter worklet metering (zero new nodes)');
      }
      
      // Aplicar ruteo inicial después de start
      log.info(' Applying saved audio routing to engine...');
      const result = app.audioSettingsModal.applyRoutingToEngine((busIndex, channelGains) => {
        return app.engine.setOutputRouting(busIndex, channelGains);
      });
      
      // Mostrar advertencias si hay canales configurados que no existen
      if (result.warnings && result.warnings.length > 0) {
        log.warn(' Routing warnings:', result.warnings);
      }
      
      // Aplicar routing de stereo buses
      log.info(' Applying stereo bus routing to engine...');
      app.audioSettingsModal.applyStereoBusRoutingToEngine((rowIdx, channelGains) => {
        app.engine.setStereoBusRouting(rowIdx, channelGains);
      });
      
      // Aplicar dispositivo de salida guardado (solo en modo estéreo)
      const savedOutputDevice = app.audioSettingsModal.selectedOutputDevice;
      const isMultichannel = app.audioSettingsModal.outputMode === 'multichannel';
      if (savedOutputDevice && savedOutputDevice !== 'default' && !isMultichannel) {
        app.engine.setOutputDevice(savedOutputDevice);
      }
    };
    
    // Escuchar evento del quickbar para abrir/cerrar modal
    document.addEventListener('synth:toggleAudioSettings', () => {
      app.audioSettingsModal.toggle();
    });
    
    // Listener para resetear el sintetizador a valores por defecto
    document.addEventListener('synth:resetToDefaults', async () => {
      await app._resetToDefaults();
    });
    
    // Listener para reinicio contextual (panel, módulo o control individual)
    document.addEventListener('synth:resetContext', (e) => {
      app._handleContextReset(e.detail);
    });
    
    // Listener para marcar sesión como "dirty" cuando el usuario interactúa
    document.addEventListener('synth:userInteraction', () => {
      sessionManager.markDirty();
      // Registrar cambio en el historial de undo/redo
      undoRedoManager.commitInteraction();
      // Resumir AudioContext si está suspendido (requiere gesto del usuario)
      // NO reanudar si DSP está deshabilitado (modo controlador OSC)
      if (app.engine.dspEnabled && app.engine.audioCtx && app.engine.audioCtx.state === 'suspended') {
        app.engine.audioCtx.resume();
      }
    });
    
    // Listeners de undo/redo (disparados desde quickbar o atajos de teclado)
    document.addEventListener('synth:undo', () => {
      undoRedoManager.undo();
    });
    document.addEventListener('synth:redo', () => {
      undoRedoManager.redo();
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // MODAL DE AJUSTES GENERALES (idioma, escala de renderizado, autoguardado)
    // Se crea después de _setupRecording para tener acceso a todos los modales
    // ─────────────────────────────────────────────────────────────────────────
    // (movido a después de _setupRecording)
    
    // ─────────────────────────────────────────────────────────────────────────
    // GRABACIÓN DE AUDIO WAV
    // ─────────────────────────────────────────────────────────────────────────
    setupRecording(app);
    
    // Ahora crear el settingsModal con acceso a todos los modales
    setupSettingsModal(app);
    
    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY MANAGER (optimización de rendimiento)
    // ─────────────────────────────────────────────────────────────────────────
    setupDormancyManager(app);
    
    // ─────────────────────────────────────────────────────────────────────────
    // FILTER BYPASS (optimización de filtros en posición neutral)
    // ─────────────────────────────────────────────────────────────────────────
    setupFilterBypass(app);
    
    // ─────────────────────────────────────────────────────────────────────────
    // PATCH BROWSER (guardar/cargar estados del sintetizador)
    // ─────────────────────────────────────────────────────────────────────────
    setupPatchBrowser(app);
    
    // ─────────────────────────────────────────────────────────────────────────
    // UNDO / REDO (historial de cambios del usuario)
    // ─────────────────────────────────────────────────────────────────────────
    setupUndoRedo(app);
  }


export function setupPatchBrowser(app) {
    app.patchBrowser = new PatchBrowser({
      onLoad: async (patchData) => {
        // Aplicar el patch cargado al sintetizador
        log.info(' Loading patch:', patchData);
        await app._applyPatch(patchData);
        // Limpiar flag de autoguardado (el usuario cargó un patch explícitamente)
        sessionManager.clearLastState();
        // Limpiar historial de undo (nuevo punto de partida)
        undoRedoManager.clear();
      },
      onSave: () => {
        // Serializar el estado actual para guardarlo
        const state = app._serializeCurrentState();
        log.info(' Serialized state:', state);
        // Limpiar flag de autoguardado (el usuario guardó explícitamente)
        sessionManager.clearLastState();
        return state;
      }
    });
    
    document.addEventListener('synth:togglePatches', () => {
      app.patchBrowser.toggle();
    });
  }


export function setupUndoRedo(app) {
    undoRedoManager.init(
      () => app._serializeCurrentState(),
      (state) => app._applyPatch(state)
    );
    log.info('Undo/redo system initialized');
  }


export function setupRecording(app) {
    // Crear motor de grabación
    app._recordingEngine = new RecordingEngine(app.engine);
    
    // Crear modal de configuración de grabación
    app._recordingSettingsModal = new RecordingSettingsModal({
      recordingEngine: app._recordingEngine,
      outputCount: app.engine.outputChannels
    });
    
    // Crear overlay visual de grabación (indicador REC pulsante)
    app._recordingOverlay = new RecordingOverlay();
    
    // Callbacks del motor de grabación
    app._recordingEngine.onRecordingStart = () => {
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', {
        detail: { recording: true }
      }));
      showToast(t('toast.recordingStarted'), { level: 'success' });
    };
    
    app._recordingEngine.onRecordingStop = (filename) => {
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', {
        detail: { recording: false }
      }));
      if (filename) {
        showToast(t('toast.recordingSaved', { filename }), { level: 'success' });
      } else {
        showToast(t('toast.recordingEmpty'), { level: 'warning' });
      }
    };
    
    // Handler para toggle de grabación
    document.addEventListener('synth:toggleRecording', async () => {
      if (!app.engine.dspEnabled) {
        showToast(t('toast.dspRequired'), { level: 'warning' });
        return;
      }
      app.ensureAudio();
      try {
        await app._recordingEngine.toggle();
      } catch (e) {
        log.error(' Recording error:', e);
        showToast(t('toast.recordingError'), { level: 'error' });
      }
    });
    
    // Handler para abrir modal de configuración de grabación
    document.addEventListener('synth:toggleRecordingSettings', () => {
      app._recordingSettingsModal.toggle();
    });
  }


export function setupSettingsModal(app) {
    // Inicializar WakeLockManager
    app.wakeLockManager = new WakeLockManager({
      storageKey: STORAGE_KEYS.WAKE_LOCK_ENABLED,
      onStateChange: (isActive) => {
        log.info(` Wake lock ${isActive ? 'acquired' : 'released'}`);
      }
    });
    
    app.settingsModal = new SettingsModal({
      onResolutionChange: (factor) => {
        log.info(` Resolution changed: ${factor}×`);
      },
      onAutoSaveIntervalChange: (intervalMs, intervalKey) => {
        sessionManager.configureAutoSave(intervalMs);
        log.info(` Autosave interval changed: ${intervalKey} (${intervalMs}ms)`);
      },
      onSaveOnExitChange: (enabled) => {
        app._saveOnExit = enabled;
        log.info(` Save on exit: ${enabled}`);
      },
      onRestoreOnStartChange: (enabled) => {
        log.info(` Restore on start: ${enabled}`);
      },
      onWakeLockChange: (enabled) => {
        if (enabled) {
          app.wakeLockManager.enable();
          window.powerAPI?.preventSleep();
        } else {
          app.wakeLockManager.disable();
          window.powerAPI?.allowSleep();
        }
        // Notificar al menú Electron del cambio
        document.dispatchEvent(new CustomEvent('synth:wakeLockChange', {
          detail: { enabled }
        }));
        log.info(` Wake lock ${enabled ? 'enabled' : 'disabled'}`);
      },
      // Referencias a modales para integración en pestañas
      audioSettingsModal: app.audioSettingsModal,
      recordingSettingsModal: app._recordingSettingsModal
    });
    
    // Configurar estado inicial de autoguardado
    app._saveOnExit = app.settingsModal.getSaveOnExit();
    sessionManager.configureAutoSave(app.settingsModal.getAutoSaveIntervalMs());
    
    // Guardar al cerrar la página si está habilitado
    window.addEventListener('beforeunload', () => {
      if (app._saveOnExit) {
        sessionManager.saveOnExit();
      }
    });
    
    // NOTA: La restauración del estado previo se hace DESPUÉS del splash,
    // llamando a triggerRestoreLastState() desde el código de inicialización.
    
    // Toggle settings modal
    document.addEventListener('synth:toggleSettings', (e) => {
      const tabId = e.detail?.tabId;
      if (app.settingsModal.isOpen) {
        app.settingsModal.close();
      } else {
        app.settingsModal.open(tabId);
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // OSC LOG WINDOW Y TOGGLE
    // ─────────────────────────────────────────────────────────────────────────
    // Inicializar ventana de log OSC (se muestra si estaba visible antes)
    initOSCLogWindow();
    
    // Toggle OSC desde quickbar o settings
    document.addEventListener('osc:toggle', async () => {
      // Usar variable interna, OSC siempre empieza apagado
      const isEnabled = app._oscEnabled || false;
      const newState = !isEnabled;
      
      if (newState) {
        // Intentar conectar
        const success = await oscBridge.start();
        if (!success) {
          // Si falla, no cambiar estado y mostrar error
          showToast(t('quickbar.oscError', 'Error al activar OSC'), { level: 'error' });
          return;
        }
        app._oscEnabled = true;
        
        // Restaurar targets unicast guardados
        try {
          const targets = JSON.parse(localStorage.getItem(STORAGE_KEYS.OSC_UNICAST_TARGETS) || '[]');
          for (const target of targets) {
            await window.oscAPI.addTarget(target.ip, target.port);
          }
          
          // Restaurar SuperCollider si estaba activo
          const scSendEnabled = localStorage.getItem(STORAGE_KEYS.OSC_SUPERCOLLIDER_SEND) === 'true';
          if (scSendEnabled) {
            const scPort = parseInt(localStorage.getItem(STORAGE_KEYS.OSC_SUPERCOLLIDER_PORT) || '57120', 10);
            await window.oscAPI.addTarget('127.0.0.1', scPort);
          }
        } catch (err) {
          console.warn('[App] Error restaurando targets OSC:', err);
        }
        
        // Mostrar ventana de log si estaba marcada la opción
        const showLog = localStorage.getItem(STORAGE_KEYS.OSC_LOG_VISIBLE) === 'true';
        if (showLog) {
          window.dispatchEvent(new CustomEvent('osc:log-visibility', { 
            detail: { visible: true } 
          }));
        }
      } else {
        await oscBridge.stop();
        app._oscEnabled = false;
        
        // Ocultar ventana de log al apagar OSC (sin cambiar preferencia del usuario)
        window.dispatchEvent(new CustomEvent('osc:log-visibility', { 
          detail: { visible: false, updateCheckbox: false } 
        }));
      }
      
      // Notificar al quickbar y al settings modal del nuevo estado
      document.dispatchEvent(new CustomEvent('osc:statusChanged', { 
        detail: { enabled: app._oscEnabled } 
      }));
      
      // Toast de feedback
      showToast(t(app._oscEnabled ? 'quickbar.oscOn' : 'quickbar.oscOff'));
    });
    
    // OSC siempre empieza apagado (no leer de localStorage)
    app._oscEnabled = false;
    if (oscBridge.isAvailable()) {
      document.dispatchEvent(new CustomEvent('osc:statusChanged', { 
        detail: { enabled: false } 
      }));
    }
    
    // Escuchar cambios de estado OSC desde settings para mantener sincronizado
    document.addEventListener('osc:statusChanged', (e) => {
      app._oscEnabled = e.detail?.enabled ?? false;
    });
  }


export function setupDormancyManager(app) {
    app.dormancyManager = new DormancyManager(app);
    
    // Escuchar cambios desde Settings
    document.addEventListener('synth:dormancyEnabledChange', (e) => {
      app.dormancyManager.setEnabled(e.detail.enabled);
      log.info(` Dormancy system ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
    
    document.addEventListener('synth:dormancyDebugChange', (e) => {
      app.dormancyManager.setDebugIndicators(e.detail.enabled);
      log.info(` Dormancy debug indicators ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
  }


export function setupFilterBypass(app) {
    // Escuchar cambios desde Settings
    document.addEventListener('synth:filterBypassEnabledChange', (e) => {
      const enabled = e.detail.enabled;
      // Output channels (engine)
      app.engine.setFilterBypassEnabled(enabled);
      // Noise generators (worklet interno)
      const noiseAudio = app._panel3LayoutData?.noiseAudioModules;
      if (noiseAudio) {
        noiseAudio.noise1.setFilterBypassEnabled(enabled);
        noiseAudio.noise2.setFilterBypassEnabled(enabled);
      }
      log.info(`⚡ Filter bypass ${enabled ? 'enabled' : 'disabled'}`);
    });
    
    document.addEventListener('synth:filterBypassDebugChange', (e) => {
      app.engine.setFilterBypassDebug(e.detail.enabled);
      log.info(`🔧 Filter bypass debug ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
    
    // Escuchar cambio global de debug de optimizaciones
    document.addEventListener('synth:optimizationsDebugChange', (e) => {
      // El debug global afecta a ambos sistemas
      if (e.detail.enabled) {
        // Al activar global, habilitar ambos debugs individuales
        app.dormancyManager.setDebugIndicators(true);
        app.engine.setFilterBypassDebug(true);
        log.info('🔧 Global optimizations debug enabled');
      }
      // Nota: desactivar global no desactiva individuales, sólo los checkboxes individuales lo hacen
    });
  }

