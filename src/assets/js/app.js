// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine, setParamSmooth } from './core/engine.js';
import { compilePanelBlueprintMappings } from './core/blueprintMapper.js';
import { getOrCreateOscState, applyOscStateImmediate } from './core/oscillatorState.js';
import { DormancyManager } from './core/dormancyManager.js';
import { sessionManager } from './state/sessionManager.js';
import { safeDisconnect } from './utils/audio.js';
import { createLogger } from './utils/logger.js';
import { VOLTAGE_DEFAULTS, DIGITAL_TO_VOLTAGE, digitalToVoltage, voltageToDigital, createSoftClipCurve, createHybridClipCurve, calculateMatrixPinGain, PIN_RESISTANCES, STANDARD_FEEDBACK_RESISTANCE, createPinFilter, updatePinFilter, PIN_CUTOFF_FREQUENCIES } from './utils/voltageConstants.js';
import { dialToFrequency } from './state/conversions.js';

const log = createLogger('App');
import { RecordingEngine } from './core/recordingEngine.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputChannelsPanel } from './modules/outputChannel.js';
import { NoiseModule } from './modules/noise.js';
import { InputAmplifierModule } from './modules/inputAmplifier.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { getSharedTooltip } from './ui/matrixTooltip.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';
import { NoiseGenerator } from './ui/noiseGenerator.js';
import { RandomVoltage } from './ui/randomVoltage.js';
import { InputAmplifierUI } from './ui/inputAmplifierUI.js';

// Blueprints (estructura visual y ruteo)
import panel2Blueprint from './panelBlueprints/panel2.blueprint.js';
import panel3Blueprint from './panelBlueprints/panel3.blueprint.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';
import panel7Blueprint from './panelBlueprints/panel7.blueprint.js';

// Configs de módulos (parámetros de audio)
import {
  oscillatorConfig,
  noiseConfig,
  oscilloscopeConfig,
  inputAmplifierConfig,
  outputChannelConfig,
  audioMatrixConfig,
  controlMatrixConfig
} from './configs/index.js';

// Osciloscopio
import { OscilloscopeModule } from './modules/oscilloscope.js';
import { OscilloscopeDisplay } from './ui/oscilloscopeDisplay.js';

// UI Components reutilizables
import { ModuleFrame } from './ui/moduleFrame.js';
import { Toggle } from './ui/toggle.js';
import { Knob } from './ui/knob.js';
import { createKnob } from './ui/knobFactory.js';

// Utilidades de audio
import { createPulseWave, createAsymmetricSineWave } from './utils/waveforms.js';
import { deepMerge } from './utils/objects.js';

// Módulos extraídos
import { 
  preloadCanvasBgImages, 
  renderCanvasBgPanels, 
  injectInlinePanelSvgBackground,
  setPanelImageBackground
} from './utils/canvasBackground.js';
import { 
  initViewportNavigation, 
  setupPanelDoubleTapZoom,
  setupPanelShortcutBadges
} from './navigation/viewportNavigation.js';
import { setupMobileQuickActionsBar, ensureOrientationHint } from './ui/quickbar.js';
import { AudioSettingsModal } from './ui/audioSettingsModal.js';
import { RecordingSettingsModal } from './ui/recordingSettingsModal.js';
import { SettingsModal } from './ui/settingsModal.js';
import { PatchBrowser } from './ui/patchBrowser.js';
import { ConfirmDialog } from './ui/confirmDialog.js';
import { initPortraitBlocker } from './ui/portraitBlocker.js';
import { initPipManager, restorePipState } from './ui/pipManager.js';
import { initElectronMenuBridge } from './ui/electronMenuBridge.js';
import { showToast } from './ui/toast.js';
import { labelPanelSlot, getOscillatorLayoutSpec, resolveOscillatorUI } from './ui/layoutHelpers.js';
import { initI18n, t } from './i18n/index.js';
import { registerServiceWorker } from './utils/serviceWorker.js';
import { detectBuildVersion } from './utils/buildVersion.js';
import { WakeLockManager } from './utils/wakeLock.js';
import { STORAGE_KEYS, isMobileDevice } from './utils/constants.js';
import { getNoiseColourTooltipInfo, getNoiseLevelTooltipInfo } from './utils/tooltipUtils.js';
import { initOSCLogWindow } from './ui/oscLogWindow.js';
import { oscBridge } from './osc/oscBridge.js';
import { oscillatorOSCSync } from './osc/oscOscillatorSync.js';

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this._panel3Audio = { nodes: [] };
    this._panel3Routing = { connections: {}, rowMap: null, colMap: null };
    this.placeholderPanels = {};
    
    // Configurar sessionManager con callbacks
    sessionManager.setSerializeCallback(() => this._serializeCurrentState());
    sessionManager.setRestoreCallback((patch) => this._applyPatch(patch));

    // Paneles 1, 3, 4: SGME Oscillators. Panel 2: vacío/reservado para futuros módulos
    this.panel1 = this.panelManager.createPanel({ id: 'panel-1' });
    labelPanelSlot(this.panel1, null, { row: 1, col: 1 });
    this._panel1Audio = { nodes: [] };

    this.panel2 = this.panelManager.createPanel({ id: 'panel-2' });
    labelPanelSlot(this.panel2, null, { row: 1, col: 2 });

    this.panel3 = this.panelManager.createPanel({ id: 'panel-3' });
    labelPanelSlot(this.panel3, null, { row: 1, col: 3 });

    this.panel4 = this.panelManager.createPanel({ id: 'panel-4' });
    labelPanelSlot(this.panel4, null, { row: 1, col: 4 });
    this._panel4Audio = { nodes: [] };

    // Panel 5: matriz de audio
    this.panel5 = this.panelManager.createPanel({ id: 'panel-5' });
    labelPanelSlot(this.panel5, null, { row: 2, col: 1 });

    // Panel 6: matriz de control
    this.panel6 = this.panelManager.createPanel({ id: 'panel-6' });
    labelPanelSlot(this.panel6, null, { row: 2, col: 3 });

    // Fondo SVG inline (runtime) para mejorar nitidez bajo zoom.
    // Paneles con fondo desactivado temporalmente: 1, 2, 3 y 4.
    // injectInlinePanelSvgBackground('panel-1', './assets/panels/panel1_bg.svg');
    // injectInlinePanelSvgBackground('panel-2', './assets/panels/panel2_bg.svg');
    // injectInlinePanelSvgBackground('panel-3', './assets/panels/panel3_bg.svg');
    // injectInlinePanelSvgBackground('panel-4', './assets/panels/panel4_bg.svg');
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');
        
    // Canvas: pinta fondos de panel-1/2/3/4 para evitar lagunas en móvil.
    preloadCanvasBgImages();
    renderCanvasBgPanels();

    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });

    // Fondos JPG temporales (eliminar línea correspondiente al migrar a SVG).
    setPanelImageBackground('panel-1', './assets/panels/panel_1.jpg');
    setPanelImageBackground('panel-2', './assets/panels/panel_2.jpg');
    setPanelImageBackground('panel-3', './assets/panels/panel_3.jpg');
    setPanelImageBackground('panel-4', './assets/panels/panel_4.jpg');
    setPanelImageBackground('panel-output', './assets/panels/panel_7.jpg');
    labelPanelSlot(this.outputPanel, null, { row: 2, col: 4 });

    // Sección para output channels - posicionada en la mitad inferior del panel
    this.outputChannelsSection = this.outputPanel.addSection({ 
      id: 'outputChannelsSection', 
      type: 'custom',
      className: 'output-channels-section'
    });
    this._heightSyncScheduled = false;
    this.largeMatrixAudio = null;
    this.largeMatrixControl = null;
    
    // Referencias a los UIs de módulos para serialización de patches
    this._oscillatorUIs = {};
    this._noiseUIs = {};
    this._randomVoltageUIs = {};
    this._inputAmplifierUIs = {};
    this._outputFadersModule = null;
    
    // Construir paneles
    // Panel 1 y 4: Solo visual, sin audio (módulos dummy a reemplazar)
    this._buildOscillatorPanel(1, this.panel1, this._panel1Audio);
    this._buildPanel2();  // Osciloscopio
    this._buildOscillatorPanel(3, this.panel3, this._panel3Audio);
    this._buildOscillatorPanel(4, this.panel4, this._panel4Audio);
    
    this._setupOutputFaders();
    this._buildLargeMatrices();
    this._setupPanel5AudioRouting();
    this._setupPanel6ControlRouting();
    this._setupUI();
    this._schedulePanelSync();
    
    // Inicializar sincronización OSC para osciladores (Panel 3)
    oscillatorOSCSync.init(this);

    // Resize handler con debounce
    let appResizeTimer = null;
    const runAppResizeWork = () => {
      this._schedulePanelSync();
      this._resizeLargeMatrices();
    };
    window.addEventListener('resize', () => {
      // Bypass debounce during fullscreen transition
      if (window.__synthFullscreenTransition) {
        runAppResizeWork();
        return;
      }
      if (appResizeTimer) clearTimeout(appResizeTimer);
      appResizeTimer = setTimeout(() => {
        appResizeTimer = null;
        if (window.__synthNavGestureActive) {
          appResizeTimer = setTimeout(() => {
            appResizeTimer = null;
            if (!window.__synthNavGestureActive) runAppResizeWork();
          }, 180);
          return;
        }
        runAppResizeWork();
      }, 120);
    }, { passive: true });

    // Listener para redibujado completo después de fullscreen
    // Asegura que matrices y paneles se redibujen correctamente
    document.addEventListener('synth:fullscreenComplete', () => {
      this._schedulePanelSync();
      this._resizeLargeMatrices();
    });
  }

  /**
   * Asegura que el motor de audio esté iniciado y el worklet cargado.
   * @returns {Promise<boolean>} true si el worklet está listo
   */
  async ensureAudio() {
    // Evitar llamadas concurrentes - si ya hay una en progreso, esperar
    if (this._ensureAudioPromise) {
      return this._ensureAudioPromise;
    }
    
    this._ensureAudioPromise = (async () => {
      try {
        // Obtener latencyHint guardado o usar default según dispositivo
        const savedMode = localStorage.getItem(STORAGE_KEYS.LATENCY_MODE);
        const defaultMode = isMobileDevice() ? 'playback' : 'interactive';
        const latencyHint = savedMode || defaultMode;
        
        this.engine.start({ latencyHint });
        
        // Esperar a que el worklet esté listo (crucial para móviles)
        await this.engine.ensureWorkletReady();
        
        // Activar multicanal si estaba guardado (necesita AudioContext listo)
        await this._restoreMultichannelIfSaved();
        
        // Iniciar osciloscopio cuando haya audio
        this._ensurePanel2ScopeStarted();
        
        return this.engine.workletReady;
      } finally {
        // Limpiar la promesa para permitir futuras llamadas
        this._ensureAudioPromise = null;
      }
    })();
    
    return this._ensureAudioPromise;
  }
  
  /**
   * Restaura la salida multicanal si estaba guardada en preferencias.
   * Debe llamarse después de que el AudioContext esté listo.
   */
  async _restoreMultichannelIfSaved() {
    if (this._multichannelRestored) return; // Solo una vez
    this._multichannelRestored = true; // Marcar antes de async para evitar race conditions
    
    const savedMode = this.audioSettingsModal?.outputMode;
    
    if (savedMode === 'multichannel') {
      log.info('🔊 Restoring multichannel output from saved mode...');
      const outputResult = await this._activateMultichannelOutput();
      if (outputResult.success) {
        log.info('🔊 Multichannel output restored (12ch)');
        this.audioSettingsModal.updatePhysicalChannels(12, 
          ['Pan 1-4 L', 'Pan 1-4 R', 'Pan 5-8 L', 'Pan 5-8 R', 'Out 1', 'Out 2', 'Out 3', 'Out 4', 'Out 5', 'Out 6', 'Out 7', 'Out 8']);
        
        // Re-aplicar routing al engine tras reconstruir la arquitectura de salida
        this._applyAllRoutingToEngine();
        
        // También restaurar entrada multicanal
        const inputResult = await this._activateMultichannelInput();
        if (inputResult.success) {
          log.info('🎤 Multichannel input restored (8ch)');
        } else {
          log.warn('🎤 Multichannel input failed (output still active):', inputResult.error);
        }
      } else {
        log.error('🔊 Failed to restore multichannel:', outputResult.error);
        // Revertir a estéreo si falla (notify=false para evitar callback loop)
        this.audioSettingsModal.setOutputMode('stereo', false);
      }
    }
  }

  _setupOutputFaders() {
    const blueprint = panel7Blueprint;
    const layoutSection = blueprint.layout.sections.outputChannels;
    const layoutRow = blueprint.layout.channelsRow || {};
    const layoutSlider = blueprint.layout.slider || {};
    const layoutChannel = blueprint.layout.channel || {};
    
    // Aplicar estilos del blueprint al contenedor de la sección
    if (this.outputChannelsSection) {
      const marginBottom = layoutSection.marginBottom ?? 10;
      this.outputChannelsSection.style.marginBottom = `${marginBottom}px`;
      
      // Padding de la fila y dimensiones del slider/channel vía CSS custom properties
      const rowPadding = layoutRow.padding || { top: 8, right: 8, bottom: 24, left: 8 };
      
      // CSS custom properties para slider y channel (heredadas por los hijos)
      const sliderHeight = layoutSlider.height ?? 220;
      const sliderShellHeight = layoutSlider.shellHeight ?? 240;
      const sliderWidth = layoutSlider.width ?? 24;
      const channelGap = layoutRow.gap ?? 8;
      const contentPadding = layoutChannel.contentPadding || { top: 6, right: 4, bottom: 16, left: 4 };
      
      this.outputChannelsSection.style.setProperty('--oc-slider-height', `${sliderHeight}px`);
      this.outputChannelsSection.style.setProperty('--oc-slider-shell-height', `${sliderShellHeight}px`);
      this.outputChannelsSection.style.setProperty('--oc-slider-width', `${sliderWidth}px`);
      this.outputChannelsSection.style.setProperty('--oc-channel-gap', `${channelGap}px`);
      this.outputChannelsSection.style.setProperty('--oc-row-padding', 
        `${rowPadding.top}px ${rowPadding.right}px ${rowPadding.bottom}px ${rowPadding.left}px`);
      this.outputChannelsSection.style.setProperty('--oc-content-padding', 
        `${contentPadding.top}px ${contentPadding.right}px ${contentPadding.bottom}px ${contentPadding.left}px`);
    }
    
    // Crear panel con 8 output channels individuales
    const channelCount = blueprint.modules.outputChannels.channelCount;
    this._outputChannelsPanel = new OutputChannelsPanel(this.engine, channelCount);
    this._outputChannelsPanel.createPanel(this.outputChannelsSection);
    
    // Mantener referencia como _outputFadersModule para compatibilidad con serialización
    this._outputFadersModule = this._outputChannelsPanel;
  }

  _setupUI() {
    // Handler para mute global desde quickbar
    document.addEventListener('synth:toggleMute', () => {
      this.ensureAudio();
      // Resumir AudioContext (estamos en un gesto del usuario)
      if (this.engine.audioCtx && this.engine.audioCtx.state === 'suspended') {
        this.engine.audioCtx.resume();
      }
      this.engine.toggleMute();
      const muted = this.engine.muted;
      
      // Notificar a quickbar del nuevo estado
      document.dispatchEvent(new CustomEvent('synth:muteChanged', {
        detail: { muted }
      }));
      
      // Mostrar toast de feedback
      showToast(t(muted ? 'toast.mute' : 'toast.unmute'));
    });
    
    // Modal de configuración de audio (ruteo salidas → sistema L/R)
    this._setupAudioSettingsModal();
  }

  /**
   * Configura el modal de ajustes de audio del sistema.
   * Permite rutear las 8 salidas lógicas hacia N canales físicos del sistema.
   * Soporta configuraciones multicanal (estéreo, 5.1, 7.1, etc.)
   * También permite rutear las entradas del sistema hacia los 8 Input Amplifiers.
   */
  _setupAudioSettingsModal() {
    // Obtener información de canales inicial del engine
    const channelInfo = this.engine.getPhysicalChannelInfo?.() || { count: 2, labels: ['L', 'R'] };
    
    this.audioSettingsModal = new AudioSettingsModal({
      outputCount: this.engine.outputChannels,
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
        const result = this.engine.setOutputRouting(busIndex, channelGains);
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
        this._applyInputRouting(systemInputIndex, channelGains);
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
        await this._deactivateMultichannelOutput();
        
        const result = await this.engine.setOutputDevice(deviceId);
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
          // Activar salida multicanal (12ch)
          const outputResult = await this._activateMultichannelOutput();
          if (outputResult.success) {
            log.info('🔊 Multichannel output activated (12ch)');
            // Forzar 12 canales en el modal con nombres descriptivos
            this.audioSettingsModal.updatePhysicalChannels(12, 
              ['Pan 1-4 L', 'Pan 1-4 R', 'Pan 5-8 L', 'Pan 5-8 R', 'Out 1', 'Out 2', 'Out 3', 'Out 4', 'Out 5', 'Out 6', 'Out 7', 'Out 8']);
            
            // Re-aplicar routing al engine tras reconstruir la arquitectura de salida
            this._applyAllRoutingToEngine();
            
            // Activar entrada multicanal (8ch)
            const inputResult = await this._activateMultichannelInput();
            if (inputResult.success) {
              log.info('🎤 Multichannel input activated (8ch)');
            } else {
              log.warn('🎤 Multichannel input failed (output still active):', inputResult.error);
              // El input es opcional, no revertimos el output si falla
            }
          } else {
            log.error('🔊 Failed to activate multichannel:', outputResult.error);
            // Revertir a estéreo (notify=false para evitar callback loop)
            this.audioSettingsModal.setOutputMode('stereo', false);
          }
        } else {
          // Modo estéreo: desactivar multicanal y restaurar dispositivo
          await this._deactivateMultichannelInput();
          await this._deactivateMultichannelOutput();
          
          // Restaurar el dispositivo seleccionado en el modal
          const deviceId = this.audioSettingsModal.selectedOutputDevice;
          if (deviceId) {
            const result = await this.engine.setOutputDevice(deviceId);
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
        await this._reconnectSystemAudioInput(deviceId);
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE RUTEO DE STEREO BUSES (Pan 1-4 L/R, Pan 5-8 L/R)
      // ─────────────────────────────────────────────────────────────────────────
      // Recibe: rowIdx (0=Pan1-4L, 1=Pan1-4R, 2=Pan5-8L, 3=Pan5-8R), channelGains[]
      // Permite rutear cada salida de stereo bus a múltiples canales físicos.
      // ─────────────────────────────────────────────────────────────────────────
      onStereoBusRoutingChange: (rowIdx, channelGains) => {
        this.engine.setStereoBusRouting(rowIdx, channelGains);
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // INICIALIZAR ROUTING CON CANALES CORRECTOS
    // ─────────────────────────────────────────────────────────────────────────
    // El modal se crea con outputRouting=null para evitar guardar en clave incorrecta.
    // Llamamos updatePhysicalChannels para cargar el routing del modo actual.
    // ─────────────────────────────────────────────────────────────────────────
    this.audioSettingsModal.updatePhysicalChannels(channelInfo.count, channelInfo.labels);
    
    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRAR CALLBACK PARA CAMBIOS DE CANALES
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando el engine detecta un cambio en el número de canales (ej: el usuario
    // cambia de auriculares estéreo a interfaz multicanal), notifica al modal
    // para que reconstruya la matriz de ruteo dinámicamente.
    // ─────────────────────────────────────────────────────────────────────────
    if (this.engine.onPhysicalChannelsChange) {
      this.engine.onPhysicalChannelsChange((channelCount, labels) => {
        log.info(` Physical channels changed: ${channelCount}`, labels);
        this.audioSettingsModal.updatePhysicalChannels(channelCount, labels);
        // Re-aplicar routing tras reconstruir la arquitectura
        this._applyAllRoutingToEngine();
      });
    }
    
    // Aplicar ruteo guardado al engine cuando inicie
    const originalStart = this.engine.start.bind(this.engine);
    this.engine.start = () => {
      originalStart();
      
      // ─────────────────────────────────────────────────────────────────────
      // SINCRONIZAR ESTADO DE MUTE DE OUTPUT CHANNELS
      // ─────────────────────────────────────────────────────────────────────
      // Los switches de power se crean antes de que el engine inicie,
      // por lo que su estado inicial no se aplicó al engine. Lo hacemos ahora.
      // ─────────────────────────────────────────────────────────────────────
      if (this._outputChannelsPanel?.channels) {
        log.info(' Syncing output channel mute states to engine...');
        this._outputChannelsPanel.channels.forEach((channel, idx) => {
          const isMuted = !channel.values.power;
          this.engine.setOutputMute(idx, isMuted);
        });
      }
      
      // Aplicar ruteo inicial después de start
      log.info(' Applying saved audio routing to engine...');
      const result = this.audioSettingsModal.applyRoutingToEngine((busIndex, channelGains) => {
        return this.engine.setOutputRouting(busIndex, channelGains);
      });
      
      // Mostrar advertencias si hay canales configurados que no existen
      if (result.warnings && result.warnings.length > 0) {
        log.warn(' Routing warnings:', result.warnings);
      }
      
      // Aplicar routing de stereo buses
      log.info(' Applying stereo bus routing to engine...');
      this.audioSettingsModal.applyStereoBusRoutingToEngine((rowIdx, channelGains) => {
        this.engine.setStereoBusRouting(rowIdx, channelGains);
      });
      
      // Aplicar dispositivo de salida guardado (solo en modo estéreo)
      const savedOutputDevice = this.audioSettingsModal.selectedOutputDevice;
      const isMultichannel = this.audioSettingsModal.outputMode === 'multichannel';
      if (savedOutputDevice && savedOutputDevice !== 'default' && !isMultichannel) {
        this.engine.setOutputDevice(savedOutputDevice);
      }
    };
    
    // Escuchar evento del quickbar para abrir/cerrar modal
    document.addEventListener('synth:toggleAudioSettings', () => {
      this.audioSettingsModal.toggle();
    });
    
    // Listener para resetear el sintetizador a valores por defecto
    document.addEventListener('synth:resetToDefaults', async () => {
      await this._resetToDefaults();
    });
    
    // Listener para marcar sesión como "dirty" cuando el usuario interactúa
    document.addEventListener('synth:userInteraction', () => {
      sessionManager.markDirty();
      // Resumir AudioContext si está suspendido (requiere gesto del usuario)
      if (this.engine.audioCtx && this.engine.audioCtx.state === 'suspended') {
        this.engine.audioCtx.resume();
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // MODAL DE AJUSTES GENERALES (idioma, escala de renderizado, autoguardado)
    // Se crea después de _setupRecording para tener acceso a todos los modales
    // ─────────────────────────────────────────────────────────────────────────
    // (movido a después de _setupRecording)
    
    // ─────────────────────────────────────────────────────────────────────────
    // GRABACIÓN DE AUDIO WAV
    // ─────────────────────────────────────────────────────────────────────────
    this._setupRecording();
    
    // Ahora crear el settingsModal con acceso a todos los modales
    this._setupSettingsModal();
    
    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY MANAGER (optimización de rendimiento)
    // ─────────────────────────────────────────────────────────────────────────
    this._setupDormancyManager();
    
    // ─────────────────────────────────────────────────────────────────────────
    // FILTER BYPASS (optimización de filtros en posición neutral)
    // ─────────────────────────────────────────────────────────────────────────
    this._setupFilterBypass();
    
    // ─────────────────────────────────────────────────────────────────────────
    // PATCH BROWSER (guardar/cargar estados del sintetizador)
    // ─────────────────────────────────────────────────────────────────────────
    this._setupPatchBrowser();
  }
  
  /**
   * Configura el navegador de patches para guardar/cargar estados.
   */
  _setupPatchBrowser() {
    this.patchBrowser = new PatchBrowser({
      onLoad: async (patchData) => {
        // Aplicar el patch cargado al sintetizador
        log.info(' Loading patch:', patchData);
        await this._applyPatch(patchData);
        // Limpiar flag de autoguardado (el usuario cargó un patch explícitamente)
        sessionManager.clearLastState();
      },
      onSave: () => {
        // Serializar el estado actual para guardarlo
        const state = this._serializeCurrentState();
        log.info(' Serialized state:', state);
        // Limpiar flag de autoguardado (el usuario guardó explícitamente)
        sessionManager.clearLastState();
        return state;
      }
    });
    
    document.addEventListener('synth:togglePatches', () => {
      this.patchBrowser.toggle();
    });
  }
  
  /**
   * Serializa el estado actual del sintetizador a un objeto de patch.
   * @returns {Object} Objeto con el estado de todos los módulos
   */
  _serializeCurrentState() {
    const state = {
      modules: {}
    };
    
    // Serializar osciladores
    if (this._oscillatorUIs) {
      state.modules.oscillators = {};
      for (const [id, ui] of Object.entries(this._oscillatorUIs)) {
        if (ui && typeof ui.serialize === 'function') {
          state.modules.oscillators[id] = ui.serialize();
        }
      }
    }
    
    // Serializar generadores de ruido
    if (this._noiseUIs) {
      state.modules.noise = {};
      for (const [id, ui] of Object.entries(this._noiseUIs)) {
        if (ui && typeof ui.serialize === 'function') {
          state.modules.noise[id] = ui.serialize();
        }
      }
    }
    
    // Serializar Random Voltage
    if (this._randomVoltageUIs) {
      state.modules.randomVoltage = {};
      for (const [id, ui] of Object.entries(this._randomVoltageUIs)) {
        if (ui && typeof ui.serialize === 'function') {
          state.modules.randomVoltage[id] = ui.serialize();
        }
      }
    }
    
    // Serializar Output Faders
    if (this._outputFadersModule && typeof this._outputFadersModule.serialize === 'function') {
      state.modules.outputFaders = this._outputFadersModule.serialize();
    }
    
    // Serializar Input Amplifiers
    if (this._inputAmplifierUIs) {
      state.modules.inputAmplifiers = {};
      for (const [id, ui] of Object.entries(this._inputAmplifierUIs)) {
        if (ui && typeof ui.serialize === 'function') {
          state.modules.inputAmplifiers[id] = ui.serialize();
        }
      }
    }
    
    // Serializar matriz de conexiones de audio
    if (this.largeMatrixAudio && typeof this.largeMatrixAudio.serialize === 'function') {
      state.modules.matrixAudio = this.largeMatrixAudio.serialize();
    }
    
    // Serializar matriz de conexiones de control
    if (this.largeMatrixControl && typeof this.largeMatrixControl.serialize === 'function') {
      state.modules.matrixControl = this.largeMatrixControl.serialize();
    }
    
    return state;
  }
  
  /**
   * Aplica un patch cargado al sintetizador.
   * @param {Object} patchData - Datos del patch a aplicar
   */
  async _applyPatch(patchData) {
    log.info(' _applyPatch called with:', patchData);
    
    if (!patchData || !patchData.modules) {
      log.warn(' Invalid patch data - missing modules');
      return;
    }
    
    // Asegurar que el worklet esté listo antes de aplicar el patch
    // Esto es crucial para móviles donde la carga puede tardar más
    await this.ensureAudio();
    
    // Deshabilitar tracking de cambios durante la aplicación del patch
    sessionManager.applyingPatch(true);
    
    const { modules } = patchData;
    log.info(' Modules to restore:', Object.keys(modules));
    
    // Restaurar osciladores
    if (modules.oscillators && this._oscillatorUIs) {
      log.info(' Restoring oscillators:', Object.keys(modules.oscillators));
      log.info(' Available oscillator UIs:', Object.keys(this._oscillatorUIs));
      for (const [id, data] of Object.entries(modules.oscillators)) {
        const ui = this._oscillatorUIs[id];
        if (ui && typeof ui.deserialize === 'function') {
          log.info(` Deserializing oscillator ${id}:`, data);
          ui.deserialize(data);
        } else {
          log.warn(` Oscillator UI not found for ${id}`);
        }
      }
    }
    
    // Restaurar generadores de ruido
    if (modules.noise && this._noiseUIs) {
      for (const [id, data] of Object.entries(modules.noise)) {
        const ui = this._noiseUIs[id];
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(data);
        }
      }
    }
    
    // Restaurar Random Voltage
    if (modules.randomVoltage && this._randomVoltageUIs) {
      for (const [id, data] of Object.entries(modules.randomVoltage)) {
        const ui = this._randomVoltageUIs[id];
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(data);
        }
      }
    }
    
    // Restaurar Output Faders
    if (modules.outputFaders && this._outputFadersModule && typeof this._outputFadersModule.deserialize === 'function') {
      this._outputFadersModule.deserialize(modules.outputFaders);
    }
    
    // Restaurar Input Amplifiers
    if (modules.inputAmplifiers && this._inputAmplifierUIs) {
      for (const [id, data] of Object.entries(modules.inputAmplifiers)) {
        const ui = this._inputAmplifierUIs[id];
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(data);
        }
      }
    }
    
    // Restaurar matriz de conexiones de audio
    if (modules.matrixAudio && this.largeMatrixAudio && typeof this.largeMatrixAudio.deserialize === 'function') {
      this.largeMatrixAudio.deserialize(modules.matrixAudio);
    }
    
    // Restaurar matriz de conexiones de control
    if (modules.matrixControl && this.largeMatrixControl && typeof this.largeMatrixControl.deserialize === 'function') {
      this.largeMatrixControl.deserialize(modules.matrixControl);
    }
    
    // Rehabilitar tracking de cambios
    sessionManager.applyingPatch(false);
    
    // Forzar actualización síncrona de dormancy para que los módulos se
    // resincronicen inmediatamente (fix: noise level no se restauraba porque
    // setLevel() durante dormancy salta el AudioParam y el wake-up dependía
    // de un requestAnimationFrame que podía deduplicarse o retrasarse)
    this.dormancyManager?.flushPendingUpdate();
    
    log.info(' Patch applied successfully');
  }
  
  /**
   * Resetea todos los módulos a sus valores por defecto.
   * Itera directamente por los módulos existentes en lugar de usar un patch.
   */
  async _resetToDefaults() {
    log.info(' Resetting to defaults...');
    
    // Deshabilitar tracking de cambios durante el reset
    sessionManager.applyingPatch(true);
    
    // Valores por defecto para cada tipo de módulo
    const defaultOscillator = { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' };
    const defaultNoise = { colour: 0, level: 0 };
    const defaultRandomVoltage = { mean: 0.5, variance: 0.5, voltage1: 0, voltage2: 0, key: 0.5 };
    const defaultInputAmplifiers = { levels: Array(8).fill(0) };
    // Formato compatible: usar channels con level para el nuevo OutputChannelsPanel
    const defaultOutputChannels = { 
      channels: Array(8).fill(null).map(() => ({ level: 0, filter: 0, pan: 0, power: false }))
    };
    
    // Resetear osciladores
    if (this._oscillatorUIs) {
      for (const ui of Object.values(this._oscillatorUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaultOscillator);
        }
      }
    }
    
    // Resetear generadores de ruido
    if (this._noiseUIs) {
      for (const ui of Object.values(this._noiseUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaultNoise);
        }
      }
    }
    
    // Resetear Random Voltage
    if (this._randomVoltageUIs) {
      for (const ui of Object.values(this._randomVoltageUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaultRandomVoltage);
        }
      }
    }
    
    // Resetear Input Amplifiers
    if (this._inputAmplifierUIs) {
      for (const ui of Object.values(this._inputAmplifierUIs)) {
        if (ui && typeof ui.deserialize === 'function') {
          ui.deserialize(defaultInputAmplifiers);
        }
      }
    }
    
    // Resetear Output Faders / Output Channels
    if (this._outputFadersModule && typeof this._outputFadersModule.deserialize === 'function') {
      this._outputFadersModule.deserialize(defaultOutputChannels);
    }
    
    // Limpiar matrices de conexiones
    if (this.largeMatrixAudio && typeof this.largeMatrixAudio.deserialize === 'function') {
      this.largeMatrixAudio.deserialize({ connections: [] });
    }
    
    if (this.largeMatrixControl && typeof this.largeMatrixControl.deserialize === 'function') {
      this.largeMatrixControl.deserialize({ connections: [] });
    }
    
    // Rehabilitar tracking de cambios
    sessionManager.applyingPatch(false);
    
    // Forzar actualización síncrona de dormancy (misma razón que en _applyPatch)
    this.dormancyManager?.flushPendingUpdate();
    
    // Limpiar estado guardado (no preguntar al reiniciar si no hay cambios)
    sessionManager.clearLastState();
    
    // Mostrar toast de confirmación
    showToast(t('toast.reset'));
    
    log.info(' Reset to defaults complete');
  }
  
  /**
   * Configura el sistema de grabación de audio WAV.
   * Crea el RecordingEngine, el modal de configuración, y los event listeners.
   */
  _setupRecording() {
    // Crear motor de grabación
    this._recordingEngine = new RecordingEngine(this.engine);
    
    // Crear modal de configuración de grabación
    this._recordingSettingsModal = new RecordingSettingsModal({
      recordingEngine: this._recordingEngine,
      outputCount: this.engine.outputChannels
    });
    
    // Callbacks del motor de grabación
    this._recordingEngine.onRecordingStart = () => {
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', {
        detail: { recording: true }
      }));
      showToast(t('toast.recordingStarted'));
    };
    
    this._recordingEngine.onRecordingStop = (filename) => {
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', {
        detail: { recording: false }
      }));
      if (filename) {
        showToast(t('toast.recordingSaved', { filename }));
      } else {
        showToast(t('toast.recordingEmpty'));
      }
    };
    
    // Handler para toggle de grabación
    document.addEventListener('synth:toggleRecording', async () => {
      this.ensureAudio();
      try {
        await this._recordingEngine.toggle();
      } catch (e) {
        log.error(' Recording error:', e);
        showToast(t('toast.recordingError'));
      }
    });
    
    // Handler para abrir modal de configuración de grabación
    document.addEventListener('synth:toggleRecordingSettings', () => {
      this._recordingSettingsModal.toggle();
    });
  }
  
  /**
   * Configura el modal de ajustes generales con pestañas.
   * Se llama después de _setupRecording para tener acceso a todos los modales.
   */
  _setupSettingsModal() {
    // Inicializar WakeLockManager
    this.wakeLockManager = new WakeLockManager({
      storageKey: STORAGE_KEYS.WAKE_LOCK_ENABLED,
      onStateChange: (isActive) => {
        log.info(` Wake lock ${isActive ? 'acquired' : 'released'}`);
      }
    });
    
    this.settingsModal = new SettingsModal({
      onResolutionChange: (factor) => {
        log.info(` Resolution changed: ${factor}×`);
      },
      onAutoSaveIntervalChange: (intervalMs, intervalKey) => {
        sessionManager.configureAutoSave(intervalMs);
        log.info(` Autosave interval changed: ${intervalKey} (${intervalMs}ms)`);
      },
      onSaveOnExitChange: (enabled) => {
        this._saveOnExit = enabled;
        log.info(` Save on exit: ${enabled}`);
      },
      onRestoreOnStartChange: (enabled) => {
        log.info(` Restore on start: ${enabled}`);
      },
      onWakeLockChange: (enabled) => {
        if (enabled) {
          this.wakeLockManager.enable();
        } else {
          this.wakeLockManager.disable();
        }
        log.info(` Wake lock ${enabled ? 'enabled' : 'disabled'}`);
      },
      // Referencias a modales para integración en pestañas
      audioSettingsModal: this.audioSettingsModal,
      recordingSettingsModal: this._recordingSettingsModal
    });
    
    // Configurar estado inicial de autoguardado
    this._saveOnExit = this.settingsModal.getSaveOnExit();
    sessionManager.configureAutoSave(this.settingsModal.getAutoSaveIntervalMs());
    
    // Guardar al cerrar la página si está habilitado
    window.addEventListener('beforeunload', () => {
      if (this._saveOnExit) {
        sessionManager.saveOnExit();
      }
    });
    
    // NOTA: La restauración del estado previo se hace DESPUÉS del splash,
    // llamando a triggerRestoreLastState() desde el código de inicialización.
    
    // Toggle settings modal
    document.addEventListener('synth:toggleSettings', (e) => {
      const tabId = e.detail?.tabId;
      if (this.settingsModal.isOpen) {
        this.settingsModal.close();
      } else {
        this.settingsModal.open(tabId);
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
      const isEnabled = this._oscEnabled || false;
      const newState = !isEnabled;
      
      if (newState) {
        // Intentar conectar
        const success = await oscBridge.start();
        if (!success) {
          // Si falla, no cambiar estado y mostrar error
          showToast(t('quickbar.oscError', 'Error al activar OSC'));
          return;
        }
        this._oscEnabled = true;
        
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
        this._oscEnabled = false;
        
        // Ocultar ventana de log al apagar OSC (sin cambiar preferencia del usuario)
        window.dispatchEvent(new CustomEvent('osc:log-visibility', { 
          detail: { visible: false, updateCheckbox: false } 
        }));
      }
      
      // Notificar al quickbar y al settings modal del nuevo estado
      document.dispatchEvent(new CustomEvent('osc:statusChanged', { 
        detail: { enabled: this._oscEnabled } 
      }));
      
      // Toast de feedback
      showToast(t(this._oscEnabled ? 'quickbar.oscOn' : 'quickbar.oscOff'));
    });
    
    // OSC siempre empieza apagado (no leer de localStorage)
    this._oscEnabled = false;
    if (oscBridge.isAvailable()) {
      document.dispatchEvent(new CustomEvent('osc:statusChanged', { 
        detail: { enabled: false } 
      }));
    }
    
    // Escuchar cambios de estado OSC desde settings para mantener sincronizado
    document.addEventListener('osc:statusChanged', (e) => {
      this._oscEnabled = e.detail?.enabled ?? false;
    });
  }
  
  /**
   * Configura el DormancyManager para optimización de rendimiento.
   * Desactiva automáticamente módulos sin conexiones en la matriz.
   */
  _setupDormancyManager() {
    this.dormancyManager = new DormancyManager(this);
    
    // Escuchar cambios desde Settings
    document.addEventListener('synth:dormancyEnabledChange', (e) => {
      this.dormancyManager.setEnabled(e.detail.enabled);
      log.info(` Dormancy system ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
    
    document.addEventListener('synth:dormancyDebugChange', (e) => {
      this.dormancyManager.setDebugIndicators(e.detail.enabled);
      log.info(` Dormancy debug indicators ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
  }
  
  /**
   * Configura los listeners para el Filter Bypass optimization.
   * Desconecta filtros cuando están en posición neutral para ahorrar CPU.
   */
  _setupFilterBypass() {
    // Escuchar cambios desde Settings
    document.addEventListener('synth:filterBypassEnabledChange', (e) => {
      const enabled = e.detail.enabled;
      // Output channels (engine)
      this.engine.setFilterBypassEnabled(enabled);
      // Noise generators (worklet interno)
      const noiseAudio = this._panel3LayoutData?.noiseAudioModules;
      if (noiseAudio) {
        noiseAudio.noise1.setFilterBypassEnabled(enabled);
        noiseAudio.noise2.setFilterBypassEnabled(enabled);
      }
      log.info(`⚡ Filter bypass ${enabled ? 'enabled' : 'disabled'}`);
    });
    
    document.addEventListener('synth:filterBypassDebugChange', (e) => {
      this.engine.setFilterBypassDebug(e.detail.enabled);
      log.info(`🔧 Filter bypass debug ${e.detail.enabled ? 'enabled' : 'disabled'}`);
    });
    
    // Escuchar cambio global de debug de optimizaciones
    document.addEventListener('synth:optimizationsDebugChange', (e) => {
      // El debug global afecta a ambos sistemas
      if (e.detail.enabled) {
        // Al activar global, habilitar ambos debugs individuales
        this.dormancyManager.setDebugIndicators(true);
        this.engine.setFilterBypassDebug(true);
        log.info('🔧 Global optimizations debug enabled');
      }
      // Nota: desactivar global no desactiva individuales, sólo los checkboxes individuales lo hacen
    });
  }
  
  /**
   * Dispara la lógica de restauración del estado previo.
   * Debe llamarse DESPUÉS de que el splash haya terminado.
   * Espera a que el worklet esté listo antes de restaurar.
   */
  async triggerRestoreLastState() {
    // Esperar a que el worklet esté listo antes de restaurar el patch
    // Esto es crucial para móviles donde la carga puede tardar más
    await this.ensureAudio();
    
    if (this.settingsModal.getRestoreOnStart()) {
      sessionManager.maybeRestoreLastState({
        getAskBeforeRestore: () => this.settingsModal.getAskBeforeRestore(),
        setAskBeforeRestore: (v) => this.settingsModal.setAskBeforeRestore(v),
        getRememberedChoice: (key) => ConfirmDialog.getRememberedChoice(key),
        showConfirmDialog: () => ConfirmDialog.show({
          title: t('patches.lastSession'),
          confirmText: t('patches.lastSession.yes'),
          cancelText: t('patches.lastSession.no'),
          rememberKey: 'restore-last-session',
          rememberText: t('patches.lastSession.remember')
        })
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 2 - OSCILOSCOPIO
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPanel2() {
    if (!this.panel2) return;

    const blueprint = panel2Blueprint;
    // Config de osciloscopio (oscilloscopeConfig) se usa internamente en OscilloscopeDisplay
    
    // Crear contenedor principal
    const host = document.createElement('div');
    host.id = 'panel2Layout';
    host.className = 'panel2-layout';
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: ${blueprint.layout.padding.top}px ${blueprint.layout.padding.right}px 
               ${blueprint.layout.padding.bottom}px ${blueprint.layout.padding.left}px;
      display: flex;
      flex-direction: column;
    `;
    this.panel2.appendElement(host);
    
    // Crear sección del osciloscopio
    const scopeSection = document.createElement('div');
    scopeSection.className = 'panel2-oscilloscope-section';
    const sectionConfig = blueprint.layout.sections.oscilloscope;
    scopeSection.style.cssText = `
      flex: 0 0 ${sectionConfig.heightRatio * 100}%;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: ${sectionConfig.marginBottom || 0}px;
    `;
    host.appendChild(scopeSection);
    
    // Crear módulo de audio primero (necesitamos referencia para el toggle)
    const scopeModule = new OscilloscopeModule(this.engine, 'oscilloscope');
    
    // Configurar parámetros de audio desde config ANTES de iniciar
    const audioConfig = oscilloscopeConfig.audio;
    scopeModule.setBufferSize(audioConfig.bufferSize);
    scopeModule.setTriggerHysteresis(audioConfig.triggerHysteresis);
    scopeModule.setSchmittHysteresis(audioConfig.schmittHysteresis);
    // Sensibilidad de entrada: compensar ganancia del pin rojo (×37)
    if (audioConfig.inputSensitivity) {
      scopeModule.setInputSensitivity(audioConfig.inputSensitivity);
    }
    
    this.engine.addModule(scopeModule);
    this.oscilloscope = scopeModule;
    
    // Crear el frame usando ModuleFrame
    const frameConfig = blueprint.modules.oscilloscope.frame;
    const moduleFrame = new ModuleFrame({
      id: 'oscilloscope-module',
      title: null, // Sin título por ahora
      className: 'synth-module--oscilloscope'
    });
    
    const frameElement = moduleFrame.createElement();
    frameElement.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: ${frameConfig.borderRadius}px;
      padding: ${frameConfig.padding.top}px ${frameConfig.padding.right}px 
               ${frameConfig.padding.bottom}px ${frameConfig.padding.left}px;
    `;
    scopeSection.appendChild(frameElement);
    
    // Crear contenedor principal con layout horizontal (display + controles)
    const displayConfig = blueprint.modules.oscilloscope.display;
    const mainContainer = document.createElement('div');
    mainContainer.className = 'oscilloscope-main';
    mainContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
    `;
    moduleFrame.appendToContent(mainContainer);
    
    // Crear contenedor del display
    const displayContainer = document.createElement('div');
    displayContainer.className = 'oscilloscope-display-container';
    displayContainer.style.cssText = `
      flex: 0 0 auto;
      width: 60%;
      max-width: 240px;
      aspect-ratio: ${displayConfig.aspectRatio};
      background: ${oscilloscopeConfig.display.bgColor};
      border-radius: 4px;
      overflow: hidden;
    `;
    mainContainer.appendChild(displayContainer);
    
    // Crear display con resolución interna fija
    const displayStyles = oscilloscopeConfig.display;
    const display = new OscilloscopeDisplay({
      container: displayContainer,
      internalWidth: displayStyles.internalWidth,
      internalHeight: displayStyles.internalHeight,
      useDevicePixelRatio: displayStyles.useDevicePixelRatio,
      mode: oscilloscopeConfig.audio.mode,
      lineColor: displayStyles.lineColor,
      bgColor: displayStyles.bgColor,
      gridColor: displayStyles.gridColor,
      centerColor: displayStyles.centerColor,
      lineWidth: displayStyles.lineWidth,
      showGrid: displayStyles.showGrid,
      showTriggerIndicator: displayStyles.showTriggerIndicator
    });
    
    // Crear contenedor de knobs (a la derecha del display)
    const knobsConfig = oscilloscopeConfig.knobs;
    const knobsContainer = document.createElement('div');
    knobsContainer.className = 'oscilloscope-knobs';
    mainContainer.appendChild(knobsContainer);
    
    // Knob TIME (escala horizontal)
    const timeKnob = createKnob({
      label: 'TIME',
      size: 'sm',
      ...knobsConfig.timeScale,
      onChange: (value) => display.setTimeScale(value)
    });
    knobsContainer.appendChild(timeKnob.wrapper);
    
    // Knob AMP (escala vertical)
    const ampKnob = createKnob({
      label: 'AMP',
      size: 'sm',
      ...knobsConfig.ampScale,
      onChange: (value) => display.setAmpScale(value)
    });
    knobsContainer.appendChild(ampKnob.wrapper);
    
    // Knob LEVEL (nivel de trigger)
    const levelKnob = createKnob({
      label: 'LEVEL',
      size: 'sm',
      ...knobsConfig.triggerLevel,
      onChange: (value) => scopeModule.setTriggerLevel(value)
    });
    knobsContainer.appendChild(levelKnob.wrapper);
    
    // Crear toggle para modo Y-T / X-Y (Lissajous)
    const modeToggle = new Toggle({
      id: 'scope-mode-toggle',
      labelA: 'Y-T',
      labelB: 'X-Y',
      initial: oscilloscopeConfig.audio.mode === 'xy' ? 'b' : 'a',
      onChange: (state) => {
        const mode = state === 'a' ? 'yt' : 'xy';
        display.setMode(mode);
        if (scopeModule.setMode) scopeModule.setMode(mode);
      }
    });
    moduleFrame.appendToControls(modeToggle.createElement());
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONEXIÓN DISPLAY ↔ MÓDULO CON SINCRONIZACIÓN
    // ─────────────────────────────────────────────────────────────────────────
    // Iniciar el render loop sincronizado con requestAnimationFrame.
    // Esto evita "tearing" y temblores al desvincular la tasa de datos del
    // worklet (~43 Hz) de la tasa de refresco del monitor (60+ Hz).
    // ─────────────────────────────────────────────────────────────────────────
    display.startRenderLoop();
    
    // Conectar datos del módulo al display
    scopeModule.onData(data => display.draw(data));
    
    // ─────────────────────────────────────────────────────────────────────────
    // INPUT AMPLIFIER LEVEL (8 canales de entrada)
    // ─────────────────────────────────────────────────────────────────────────
    
    // Crear sección para Input Amplifiers
    const inputAmpSection = document.createElement('div');
    inputAmpSection.className = 'panel2-input-amp-section';
    const inputAmpSectionConfig = blueprint.layout.sections.inputAmplifiers;
    inputAmpSection.style.cssText = `
      flex: 0 0 auto;
      width: 100%;
      box-sizing: border-box;
    `;
    host.appendChild(inputAmpSection);
    
    // Crear módulo de audio
    const inputAmpModule = new InputAmplifierModule(this.engine, 'input-amplifiers', {
      channels: blueprint.modules.inputAmplifiers.channels,
      initialLevel: inputAmplifierConfig.knobs.level.initial,
      levelSmoothingTime: inputAmplifierConfig.audio.levelSmoothingTime
    });
    this.engine.addModule(inputAmpModule);
    this.inputAmplifiers = inputAmpModule;
    
    // Crear UI
    const inputAmpId = blueprint.modules.inputAmplifiers.id;
    const inputAmpUI = new InputAmplifierUI({
      id: inputAmpId,
      title: blueprint.modules.inputAmplifiers.title,
      channels: blueprint.modules.inputAmplifiers.channels,
      knobConfig: inputAmplifierConfig.knobs.level,
      onLevelChange: (channel, value) => {
        inputAmpModule.setLevel(channel, value);
      }
    });
    
    inputAmpSection.appendChild(inputAmpUI.createElement());
    
    // Guardar referencia para serialización
    this._inputAmplifierUIs[inputAmpId] = inputAmpUI;
    
    // Guardar referencias
    this._panel2Data = {
      host,
      scopeSection,
      moduleFrame,
      displayContainer,
      scopeModule,
      display,
      modeToggle,
      inputAmpSection,
      inputAmpModule,
      inputAmpUI
    };
    
    // Estado inicial
    this._panel2ScopeStarted = false;
    
    // Dibujar estado vacío inicial
    display.drawEmpty();
  }

  async _ensurePanel2ScopeStarted() {
    if (this._panel2ScopeStarted || !this._panel2Data?.scopeModule) return;
    this._panel2ScopeStarted = true;
    await this._panel2Data.scopeModule.start();
  }

  /**
   * Conecta las entradas de audio del sistema (micrófono/línea) a los Input Amplifiers.
   * Usa getUserMedia para obtener acceso al audio del sistema.
   * La matriz de ruteo de entrada controla qué entrada del sistema va a qué Input Amplifier.
   * 
   * @param {string} [deviceId] - ID del dispositivo de entrada (opcional)
   */
  async _ensureSystemAudioInput(deviceId = null) {
    // Evitar reconectar si ya está conectado con el mismo dispositivo
    if (this._systemAudioConnected && !deviceId) return;
    
    // Verificar si el permiso fue denegado previamente (evita bucle en Chrome móvil)
    if (this.audioSettingsModal?.isMicrophonePermissionDenied?.()) {
      log.info(' Microphone permission previously denied, skipping getUserMedia');
      return;
    }
    
    if (!this.inputAmplifiers?.isStarted) {
      log.warn(' Input amplifiers not ready for system audio');
      return;
    }
    
    const ctx = this.engine.audioCtx;
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
      if (this.audioSettingsModal?.clearMicrophonePermissionDenied) {
        this.audioSettingsModal.clearMicrophonePermissionDenied();
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
      this._inputRoutingGains = [];
      
      for (let sysIdx = 0; sysIdx < channelCount; sysIdx++) {
        const rowGains = [];
        
        for (let chIdx = 0; chIdx < 8; chIdx++) {
          const gainNode = ctx.createGain();
          gainNode.gain.value = 0; // Empiezan en silencio, se aplica ruteo después
          
          // Conectar: splitter canal sysIdx → gainNode → Input Amplifier chIdx
          splitter.connect(gainNode, sysIdx);
          const inputNode = this.inputAmplifiers.getInputNode(chIdx);
          if (inputNode) {
            gainNode.connect(inputNode);
          }
          
          rowGains.push(gainNode);
        }
        
        this._inputRoutingGains.push(rowGains);
      }
      
      this._systemAudioStream = stream;
      this._systemAudioSource = sourceNode;
      this._systemAudioSplitter = splitter;
      this._systemAudioChannelCount = channelCount;
      this._systemAudioConnected = true;
      
      // Actualizar el modal con el número de canales detectados
      const labels = this._generateInputLabels(channelCount);
      if (this.audioSettingsModal) {
        this.audioSettingsModal.updatePhysicalInputChannels(channelCount, labels);
        // Aplicar el ruteo guardado
        this.audioSettingsModal.applyInputRoutingToEngine();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTICANAL NATIVO (8 canales via PipeWire) - SOLO ELECTRON + LINUX
  // ═══════════════════════════════════════════════════════════════════════════
  // Usa PipeWire nativo para salida de 8 canales independientes.
  // Comunicación lock-free via SharedArrayBuffer cuando está disponible.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Re-aplica todo el routing de salida (buses individuales + stereo buses) al engine.
   * Se usa después de reconstruir la arquitectura de salida (cambio de canales).
   * @private
   */
  _applyAllRoutingToEngine() {
    // Routing de buses individuales (Out 1-8)
    log.info(' Re-applying output routing to engine after channel rebuild...');
    const result = this.audioSettingsModal.applyRoutingToEngine((busIndex, channelGains) => {
      return this.engine.setOutputRouting(busIndex, channelGains);
    });
    if (result.warnings?.length > 0) {
      log.warn(' Routing warnings:', result.warnings);
    }
    
    // Routing de stereo buses (Pan 1-4 L/R, Pan 5-8 L/R)
    log.info(' Re-applying stereo bus routing to engine...');
    this.audioSettingsModal.applyStereoBusRoutingToEngine((rowIdx, channelGains) => {
      this.engine.setStereoBusRouting(rowIdx, channelGains);
    });
  }

  /**
   * Activa la salida multicanal nativa de 8 canales.
   * Usa SharedArrayBuffer para comunicación lock-free con AudioWorklet.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async _activateMultichannelOutput() {
    // Evitar re-activación si ya está activo
    if (this._multichannelActive) {
      log.info('🎛️ Multichannel output already active, skipping');
      return { success: true };
    }
    
    // CRÍTICO: Verificar disponibilidad ANTES de tocar el engine
    // (en navegador web, window.multichannelAPI no existe)
    if (!window.multichannelAPI) {
      log.info('🎛️ multichannelAPI not available (browser mode)');
      return { success: false, error: 'multichannelAPI no disponible' };
    }
    
    // Primero forzar 12 canales en el engine
    const channelLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    this.engine.forcePhysicalChannels(12, channelLabels, true);
    
    // Obtener latencia configurada del modal de ajustes
    const configuredLatencyMs = this.audioSettingsModal?.getConfiguredLatencyMs?.() || 42;
    log.info('🎛️ Using configured latency:', configuredLatencyMs, 'ms');
    
    // Configurar latencia ANTES de abrir el stream
    if (window.multichannelAPI.setLatency) {
      window.multichannelAPI.setLatency(configuredLatencyMs);
    }
    
    // Abrir el stream multicanal
    const sampleRate = this.engine.audioCtx?.sampleRate || 48000;
    const result = await window.multichannelAPI.open({ sampleRate, channels: 12 });
    
    if (!result.success) {
      this.engine.forcePhysicalChannels(2, ['L', 'R'], false);
      return { success: false, error: result.error };
    }
    
    log.info('🎛️ Multichannel stream opened:', result.info);
    
    const ctx = this.engine.audioCtx;
    
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
          this._sharedAudioBuffer = sharedBuffer;
          this._sharedBufferFrames = SHARED_BUFFER_FRAMES;
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
      return this._activateMultichannelOutputFallback();
    }
    
    // Crear el AudioWorkletNode
    const chunkSize = 2048; // Fallback chunk size
    this._multichannelWorklet = new AudioWorkletNode(ctx, 'multichannel-capture', {
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
    
    this._mcWorkletChunks = 0;
    
    // Configurar comunicación con el worklet
    this._multichannelWorklet.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'ready') {
        // Worklet listo - enviar SharedArrayBuffer si tenemos uno
        if (this._sharedAudioBuffer) {
          this._multichannelWorklet.port.postMessage({
            type: 'init',
            sharedBuffer: this._sharedAudioBuffer,
            bufferFrames: this._sharedBufferFrames
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
        
        this._mcWorkletChunks++;
        if (this._mcWorkletChunks % 200 === 1) {
          log.info(`🎛️ [Fallback] Chunk #${this._mcWorkletChunks}, ${frames} frames`);
        }
      }
    };
    
    // Crear GainNode silenciador
    this._multichannelSilencer = ctx.createGain();
    this._multichannelSilencer.gain.value = 0;
    
    this._multichannelActive = true;
    
    try {
      this.engine.merger.disconnect();
      log.info('🎛️ Merger disconnected');
    } catch (e) {
      log.warn('🎛️ Merger disconnect failed:', e.message);
    }
    
    // Conectar: merger → worklet → silencer → destination
    this.engine.merger.connect(this._multichannelWorklet);
    this._multichannelWorklet.connect(this._multichannelSilencer);
    this._multichannelSilencer.connect(ctx.destination);
    
    const mode = this._sharedAudioBuffer ? 'LOCK-FREE (SharedArrayBuffer)' : 'FALLBACK (MessagePort)';
    log.info(`🎛️ Multichannel active - ${mode}`);
    
    return { success: true };
  }
  
  /**
   * Fallback a ScriptProcessor si AudioWorklet no está disponible.
   * @private
   */
  async _activateMultichannelOutputFallback() {
    log.warn('🎛️ Using ScriptProcessor fallback (may have UI-related audio glitches)');
    
    const ctx = this.engine.audioCtx;
    const bufferSize = 512;
    const inputChannels = 12;
    const outputChannels = 2;
    
    this._multichannelProcessor = ctx.createScriptProcessor(bufferSize, inputChannels, outputChannels);
    this._multichannelSilencer = ctx.createGain();
    this._multichannelSilencer.gain.value = 0;
    
    this._multichannelProcessor.onaudioprocess = (event) => {
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
    
    this._multichannelActive = true;
    
    try { this.engine.merger.disconnect(); } catch (e) {}
    
    this.engine.merger.connect(this._multichannelProcessor);
    this._multichannelProcessor.connect(this._multichannelSilencer);
    this._multichannelSilencer.connect(ctx.destination);
    
    return { success: true };
  }

  /**
   * Desactiva la salida multicanal y restaura la salida normal.
   */
  async _deactivateMultichannelOutput() {
    if (!this._multichannelActive) return;
    
    log.info('🎛️ Deactivating multichannel output...');
    
    // Cerrar el stream nativo
    if (window.multichannelAPI) {
      await window.multichannelAPI.close();
    }
    
    const ctx = this.engine.audioCtx;
    
    // Desconectar worklet o processor
    if (this._multichannelWorklet) {
      try {
        // Enviar señal de stop al worklet para que deje de procesar
        this._multichannelWorklet.port.postMessage({ type: 'stop' });
        this.engine.merger.disconnect(this._multichannelWorklet);
        this._multichannelWorklet.disconnect();
        this._multichannelWorklet.port.close();
      } catch (e) {}
      this._multichannelWorklet = null;
    }
    
    if (this._multichannelProcessor) {
      try {
        this.engine.merger.disconnect(this._multichannelProcessor);
        this._multichannelProcessor.disconnect();
        this._multichannelProcessor.onaudioprocess = null;
      } catch (e) {}
      this._multichannelProcessor = null;
    }
    
    if (this._multichannelSilencer) {
      try { this._multichannelSilencer.disconnect(); } catch (e) {}
      this._multichannelSilencer = null;
    }
    
    // Restaurar conexión normal al destination
    if (this.engine.merger && ctx) {
      this.engine._skipDestinationConnect = false;
      this.engine.merger.connect(ctx.destination);
    }
    
    this._multichannelActive = false;
    log.info('🎛️ Multichannel output deactivated, normal audio restored');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTICANAL INPUT (8 canales via PipeWire) - SOLO ELECTRON + LINUX
  // ═══════════════════════════════════════════════════════════════════════════
  // Usa PipeWire nativo para captura de 8 canales independientes.
  // Comunicación lock-free via SharedArrayBuffer: C++ escribe, worklet lee.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Activa la entrada multicanal nativa de 8 canales.
   * Usa SharedArrayBuffer para comunicación lock-free con AudioWorklet.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async _activateMultichannelInput() {
    // Evitar re-activación si ya está activo
    if (this._multichannelInputActive) {
      log.info('🎤 Multichannel input already active, skipping');
      return { success: true };
    }
    
    // Verificar disponibilidad
    if (!window.multichannelInputAPI) {
      log.info('🎤 multichannelInputAPI not available (browser mode)');
      return { success: false, error: 'multichannelInputAPI no disponible' };
    }
    
    if (!this.inputAmplifiers?.isStarted) {
      log.warn('🎤 Input amplifiers not ready for multichannel input');
      return { success: false, error: 'Input amplifiers not ready' };
    }
    
    // Desconectar el input estéreo del sistema si está activo
    // (en modo multicanal usamos PipeWire directamente, no getUserMedia)
    this._disconnectSystemAudioInput();
    
    const ctx = this.engine.audioCtx;
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
          this._sharedInputBuffer = sharedBuffer;
          this._sharedInputBufferFrames = SHARED_BUFFER_FRAMES;
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
    this._multichannelInputWorklet = new AudioWorkletNode(ctx, 'multichannel-playback', {
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
    
    // Configurar comunicación con el worklet
    this._multichannelInputWorklet.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'ready') {
        // Worklet listo - enviar SharedArrayBuffer
        if (this._sharedInputBuffer) {
          this._multichannelInputWorklet.port.postMessage({
            type: 'init',
            sharedBuffer: this._sharedInputBuffer,
            bufferFrames: this._sharedInputBufferFrames
          });
          log.info('🎤 Input SharedArrayBuffer enviado al worklet');
        }
      } else if (type === 'initialized') {
        log.info('🎤 Input worklet inicializado con SharedArrayBuffer');
      }
    };
    
    // Conectar worklet → ChannelSplitter → Input Amplifiers (1:1 directo)
    const splitter = ctx.createChannelSplitter(8);
    this._multichannelInputWorklet.connect(splitter);
    
    for (let ch = 0; ch < 8; ch++) {
      const inputNode = this.inputAmplifiers.getInputNode(ch);
      if (inputNode) {
        splitter.connect(inputNode, ch);
      }
    }
    
    this._multichannelInputSplitter = splitter;
    this._multichannelInputActive = true;
    
    log.info('🎤 Multichannel input active - 8ch PipeWire → Input Amplifiers');
    return { success: true };
  }

  /**
   * Desactiva la entrada multicanal nativa.
   */
  async _deactivateMultichannelInput() {
    if (!this._multichannelInputActive) return;
    
    log.info('🎤 Deactivating multichannel input...');
    
    // Cerrar el stream nativo
    if (window.multichannelInputAPI) {
      await window.multichannelInputAPI.close();
    }
    
    // Desconectar worklet y splitter
    if (this._multichannelInputWorklet) {
      try {
        // Enviar señal de stop al worklet para que deje de procesar
        this._multichannelInputWorklet.port.postMessage({ type: 'stop' });
        this._multichannelInputWorklet.disconnect();
        this._multichannelInputWorklet.port.close();
      } catch (e) {}
      this._multichannelInputWorklet = null;
    }
    
    if (this._multichannelInputSplitter) {
      try { this._multichannelInputSplitter.disconnect(); } catch (e) {}
      this._multichannelInputSplitter = null;
    }
    
    this._sharedInputBuffer = null;
    this._multichannelInputActive = false;
    
    log.info('🎤 Multichannel input deactivated');
    
    // Restaurar input estéreo del sistema si hay un dispositivo seleccionado
    const inputDeviceId = this.audioSettingsModal?.selectedInputDevice;
    if (inputDeviceId) {
      await this._ensureSystemAudioInput(inputDeviceId);
    }
  }

  /**
   * Desconecta el audio del sistema (usado al activar multicanal).
   * @private
   */
  _disconnectSystemAudioInput() {
    if (this._systemAudioStream) {
      this._systemAudioStream.getTracks().forEach(t => t.stop());
      this._systemAudioStream = null;
    }
    if (this._systemAudioSource) {
      this._systemAudioSource.disconnect();
      this._systemAudioSource = null;
    }
    if (this._inputRoutingGains) {
      this._inputRoutingGains.forEach(row => row.forEach(g => g.disconnect()));
      this._inputRoutingGains = null;
    }
    if (this._systemAudioSplitter) {
      try { this._systemAudioSplitter.disconnect(); } catch (e) {}
      this._systemAudioSplitter = null;
    }
    this._systemAudioConnected = false;
    log.info('🎤 System audio input disconnected');
  }

  /**
   * Reconecta el audio del sistema con un nuevo dispositivo de entrada.
   * @param {string} deviceId - ID del dispositivo de entrada
   */
  async _reconnectSystemAudioInput(deviceId) {
    // Desconectar el audio actual si existe
    if (this._systemAudioStream) {
      this._systemAudioStream.getTracks().forEach(t => t.stop());
      this._systemAudioStream = null;
    }
    if (this._systemAudioSource) {
      this._systemAudioSource.disconnect();
      this._systemAudioSource = null;
    }
    if (this._inputRoutingGains) {
      this._inputRoutingGains.forEach(row => row.forEach(g => g.disconnect()));
      this._inputRoutingGains = null;
    }
    this._systemAudioConnected = false;
    
    // Reconectar con el nuevo dispositivo
    await this._ensureSystemAudioInput(deviceId);
  }

  /**
   * Aplica el ruteo de entrada para una entrada del sistema.
   * Llamado por el callback onInputRoutingChange del modal.
   * 
   * @param {number} systemInputIndex - Índice de la entrada del sistema (0-based)
   * @param {number[]} channelGains - Array de ganancias para cada Input Amplifier [0-1]
   */
  _applyInputRouting(systemInputIndex, channelGains) {
    if (!this._inputRoutingGains || !this._inputRoutingGains[systemInputIndex]) {
      // Audio del sistema aún no conectado, guardar para aplicar después
      return;
    }
    
    const ctx = this.engine.audioCtx;
    const now = ctx?.currentTime ?? 0;
    const smoothTime = 0.03; // 30ms de suavizado
    
    const rowGains = this._inputRoutingGains[systemInputIndex];
    channelGains.forEach((gain, chIdx) => {
      if (rowGains[chIdx]) {
        rowGains[chIdx].gain.cancelScheduledValues(now);
        rowGains[chIdx].gain.setTargetAtTime(gain, now, smoothTime);
      }
    });
  }

  /**
   * Genera etiquetas para los canales de entrada
   */
  _generateInputLabels(count) {
    if (count === 1) return ['Mono'];
    if (count === 2) return ['L', 'R'];
    return Array.from({ length: count }, (_, i) => `In ${i + 1}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCCIÓN DE PANELES DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Construye el layout de osciladores para cualquier panel (1-4).
   * Usa el blueprint para estructura y el config para parámetros.
   * Elimina la duplicación de _buildPanel1Layout, _buildPanel2Layout, etc.
   */
  _buildOscillatorPanel(panelIndex, panel, panelAudio) {
    if (!panel) return;

    const host = document.createElement('div');
    host.id = `panel${panelIndex}Layout`;
    host.className = 'panel3-layout';
    panel.appendElement(host);

    const layout = getOscillatorLayoutSpec();
    const { oscSize, gap, rowsPerColumn } = layout;

    // ─────────────────────────────────────────────────────────────────────────
    // Slots de osciladores: leer del blueprint o generar por defecto
    // El blueprint define posición visual (col, row) para cada oscIndex
    // ─────────────────────────────────────────────────────────────────────────
    let oscillatorSlots;
    if (Array.isArray(panel3Blueprint?.oscillatorSlots)) {
      // Usar slots del blueprint (oscIndex está 0-based, convertimos a index 1-based)
      oscillatorSlots = panel3Blueprint.oscillatorSlots.map(slot => ({
        index: slot.oscIndex + 1,   // UI usa 1-based
        col: slot.col,
        row: slot.row,
        slotUI: slot.ui || null     // overrides de UI por oscilador
      }));
    } else {
      // Fallback: generar grid clásico
      oscillatorSlots = [];
      for (let i = 0; i < rowsPerColumn; i += 1) {
        oscillatorSlots.push({ index: i + 1, col: 0, row: i });
      }
      for (let i = 0; i < rowsPerColumn; i += 1) {
        oscillatorSlots.push({ index: i + 7, col: 1, row: i });
      }
    }

    const oscComponents = oscillatorSlots.map(slot => {
      const oscIndex = slot.index - 1;  // Convertir de 1-based a 0-based
      const knobOptions = this._getPanelKnobOptions(panelIndex, oscIndex);
      const oscId = `panel${panelIndex}-osc-${slot.index}`;
      
      // Resolver UI para este oscilador: defaults + overrides del slot
      const oscUI = resolveOscillatorUI(layout.oscUIDefaults, slot.slotUI);
      
      const osc = new SGME_Oscillator({
        id: oscId,
        title: `Osc ${slot.index}`,
        size: oscSize,
        knobGap: oscUI.knobGap,
        switchOffset: oscUI.switchOffset,
        knobSize: oscUI.knobSize,
        knobRowOffsetX: oscUI.knobRowOffsetX,
        knobRowOffsetY: oscUI.knobRowOffsetY,
        knobInnerPct: oscUI.knobInnerPct,
        knobOffsets: oscUI.knobOffsets,
        knobOptions,
        // Callback para recalcular frecuencia cuando cambia el switch HI/LO
        onRangeChange: (rangeState) => this._onOscRangeChange(panelIndex, oscIndex, rangeState)
      });
      const el = osc.createElement();
      
      // Añadir data-attribute para dormancy debug (solo Panel 3 usa índices 0-8)
      if (panelIndex === 3) {
        el.dataset.oscIndex = String(slot.index - 1);
      }
      
      host.appendChild(el);
      
      // Guardar referencia para serialización
      this._oscillatorUIs[oscId] = osc;
      
      return { osc, element: el, slot, oscIndex };
    });
    
    // ─────────────────────────────────────────────────────────────────────
    // SINCRONIZAR ESTADO DE AUDIO CON VALORES INICIALES DE UI
    // ─────────────────────────────────────────────────────────────────────
    // Los knobs se inicializan con valores de la config (ej: freq dial=5).
    // Debemos sincronizar el estado de audio para que coincida con la UI.
    // NO creamos nodos de audio aquí (eso se hace lazy en la matriz).
    // Solo actualizamos el estado interno que se usará cuando se creen los nodos.
    // ─────────────────────────────────────────────────────────────────────
    oscComponents.forEach(({ osc, oscIndex }) => {
      this._syncOscillatorStateFromUI(panelIndex, oscIndex, osc);
    });

    // Fila de módulos de ruido y Random CV (solo para Panel 3)
    let reservedRow = null;
    let noiseModules = null;
    let noiseAudioModules = null;
    
    if (panelIndex === 3) {
      reservedRow = document.createElement('div');
      reservedRow.className = 'panel3-reserved-row panel3-modules-row';
      
      // Leer configuración de módulos desde los configs de módulos
      const noiseDefaults = noiseConfig.defaults || {};
      const noise1Cfg = noiseConfig.noise1 || {};
      const noise2Cfg = noiseConfig.noise2 || {};
      const randomCVCfg = {}; // Random CV config se lee de randomVoltageConfig si es necesario
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear módulos de audio para Noise Generators
      // Los módulos se inicializan bajo demanda cuando el usuario interactúa
      // con la matriz (después del user gesture que activa el AudioContext)
      // ─────────────────────────────────────────────────────────────────────
      const noise1Audio = new NoiseModule(this.engine, noise1Cfg.id || 'noise-1', {
        initialColour: noise1Cfg.knobs?.colour?.initial ?? 5,
        initialLevel: noise1Cfg.knobs?.level?.initial ?? 0,
        levelSmoothingTime: noise1Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise1Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01,
        colourFilter: noiseConfig.colourFilter,
        levelCurve: noiseConfig.levelCurve,
        ramps: noiseDefaults.ramps
      });
      
      const noise2Audio = new NoiseModule(this.engine, noise2Cfg.id || 'noise-2', {
        initialColour: noise2Cfg.knobs?.colour?.initial ?? 5,
        initialLevel: noise2Cfg.knobs?.level?.initial ?? 0,
        levelSmoothingTime: noise2Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise2Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01,
        colourFilter: noiseConfig.colourFilter,
        levelCurve: noiseConfig.levelCurve,
        ramps: noiseDefaults.ramps
      });
      
      // NO llamar start() aquí - se hace lazy en _handlePanel5AudioToggle
      // cuando el usuario hace click en la matriz (después del user gesture)
      
      noiseAudioModules = { noise1: noise1Audio, noise2: noise2Audio };
      
      // Aplicar estado inicial de filter bypass (mismo setting que output channels).
      // Leemos de localStorage porque settingsModal aún no se ha creado en este punto.
      const savedBypass = localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED);
      const bypassEnabled = savedBypass === null ? true : savedBypass === 'true';
      noise1Audio.setFilterBypassEnabled(bypassEnabled);
      noise2Audio.setFilterBypassEnabled(bypassEnabled);
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear UI con callbacks vinculados a audio
      // ─────────────────────────────────────────────────────────────────────
      
      // Tooltips para knobs del noise generator
      const cf = noiseConfig.colourFilter || {};
      const noiseTau = (cf.potResistance || 10000) * (cf.capacitance || 33e-9);
      const noiseFc = 1 / (Math.PI * noiseTau);  // LP fc(-3dB) ≈ 965 Hz
      const noiseColourTooltip = getNoiseColourTooltipInfo(noiseFc);
      const lc = noiseConfig.levelCurve || {};
      const noiseLevelTooltip = getNoiseLevelTooltipInfo(3.0, lc.logBase || 100);
      
      // Noise Generator 1 UI
      const noise1Id = noise1Cfg.id || 'panel3-noise-1';
      const noise1 = new NoiseGenerator({
        id: noise1Id,
        title: noise1Cfg.title || 'Noise 1',
        knobOptions: {
          colour: {
            ...noise1Cfg.knobs?.colour,
            onChange: (value) => noise1Audio.setColour(value),
            getTooltipInfo: noiseColourTooltip
          },
          level: {
            ...noise1Cfg.knobs?.level,
            onChange: (value) => noise1Audio.setLevel(value),
            getTooltipInfo: noiseLevelTooltip
          }
        }
      });
      reservedRow.appendChild(noise1.createElement());
      this._noiseUIs[noise1Id] = noise1;
      
      // Noise Generator 2 UI
      const noise2Id = noise2Cfg.id || 'panel3-noise-2';
      const noise2 = new NoiseGenerator({
        id: noise2Id,
        title: noise2Cfg.title || 'Noise 2',
        knobOptions: {
          colour: {
            ...noise2Cfg.knobs?.colour,
            onChange: (value) => noise2Audio.setColour(value),
            getTooltipInfo: noiseColourTooltip
          },
          level: {
            ...noise2Cfg.knobs?.level,
            onChange: (value) => noise2Audio.setLevel(value),
            getTooltipInfo: noiseLevelTooltip
          }
        }
      });
      reservedRow.appendChild(noise2.createElement());
      this._noiseUIs[noise2Id] = noise2;
      
      // Random Control Voltage Generator (solo UI, sin audio aún)
      const randomCVId = randomCVCfg.id || 'panel3-random-cv';
      const randomCV = new RandomVoltage({
        id: randomCVId,
        title: randomCVCfg.title || 'Random Voltage',
        knobOptions: randomCVCfg.knobs || {
          mean: { min: -1, max: 1, initial: 0 },
          variance: { min: 0, max: 1, initial: 0.5 },
          voltage1: { min: 0, max: 1, initial: 0 },
          voltage2: { min: 0, max: 1, initial: 0 },
          key: { min: 0, max: 1, initial: 0 }
        }
      });
      this._randomVoltageUIs[randomCVId] = randomCV;
      reservedRow.appendChild(randomCV.createElement());
      
      host.appendChild(reservedRow);
      
      noiseModules = { noise1, noise2, randomCV };
    } else {
      // Otros paneles mantienen la fila reservada vacía
      reservedRow = document.createElement('div');
      reservedRow.className = 'panel3-reserved-row';
      reservedRow.textContent = 'Reserved strip for future modules';
      host.appendChild(reservedRow);
    }

    // Guardar datos del layout
    const layoutDataKey = `_panel${panelIndex}LayoutData`;
    const rafKey = `_panel${panelIndex}LayoutRaf`;
    
    this[layoutDataKey] = {
      host,
      layout,
      oscillatorSlots,
      oscComponents,
      reserved: reservedRow,
      noiseModules,
      noiseAudioModules
    };
    panelAudio.nodes = new Array(oscComponents.length).fill(null);
    this[rafKey] = null;
    this._reflowOscillatorPanel(panelIndex);
  }

  /**
   * Reflow unificado para paneles de osciladores.
   */
  _reflowOscillatorPanel(panelIndex) {
    const layoutDataKey = `_panel${panelIndex}LayoutData`;
    const rafKey = `_panel${panelIndex}LayoutRaf`;
    
    const data = this[layoutDataKey];
    if (!data) return;

    if (this[rafKey]) {
      cancelAnimationFrame(this[rafKey]);
    }

    this[rafKey] = requestAnimationFrame(() => {
      this[rafKey] = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved, noiseModules } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = 0, topOffset, rowsPerColumn } = layout;
      
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;
      
      oscComponents.forEach(({ element, slot }) => {
        const col = slot.col;
        const row = slot.row;
        // Aplicar slotOffset del blueprint (permite ajuste fino por oscilador)
        const slotOffset = slot.slotUI?.slotOffset || layout.oscUIDefaults?.slotOffset || { x: 0, y: 0 };
        const x = baseLeft + col * (columnWidth + gap.x) + (slotOffset.x || 0);
        const y = baseTop + row * (oscSize.height + gap.y) + (slotOffset.y || 0);
        element.style.transform = `translate(${x}px, ${y}px)`;
      });

      if (reserved) {
        const reservedTop = baseTop + blockHeight + gap.y;
        reserved.style.transform = `translate(${baseLeft}px, ${reservedTop}px)`;
        reserved.style.width = `${columnWidth * 2 + gap.x}px`;
        
        // Aplicar altura y proporciones del blueprint si es Panel 3
        if (panelIndex === 3) {
          // Leer del BLUEPRINT (estructura visual)
          const blueprintModulesRow = panel3Blueprint?.layout?.modulesRow || {};
          const rowHeight = blueprintModulesRow.height || layout.reservedHeight;
          reserved.style.height = `${rowHeight}px`;
          
          // Aplicar proporciones a los módulos desde el blueprint
          if (noiseModules) {
            const proportions = blueprintModulesRow.proportions || { noise1: 2/9, noise2: 2/9, randomCV: 5/9 };
            const totalWidth = columnWidth * 2 + gap.x;
            
            if (noiseModules.noise1?.element) {
              noiseModules.noise1.element.style.flex = `0 0 ${proportions.noise1 * 100}%`;
            }
            if (noiseModules.noise2?.element) {
              noiseModules.noise2.element.style.flex = `0 0 ${proportions.noise2 * 100}%`;
            }
            if (noiseModules.randomCV?.element) {
              noiseModules.randomCV.element.style.flex = `0 0 ${proportions.randomCV * 100}%`;
            }
          }
        } else {
          reserved.style.height = `${layout.reservedHeight}px`;
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FUNCIONES DE AUDIO PARA OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Programa un reintento de creación de oscilador cuando el worklet esté listo.
   * En móviles, el worklet puede tardar más en cargar.
   */
  _scheduleWorkletRetry(panelIndex, oscIndex) {
    // Evitar múltiples reintentos para el mismo oscilador
    const key = `${panelIndex}-${oscIndex}`;
    if (!this._pendingWorkletRetries) {
      this._pendingWorkletRetries = new Set();
    }
    
    if (this._pendingWorkletRetries.has(key)) return;
    this._pendingWorkletRetries.add(key);
    
    // Esperar a que el worklet esté listo y reintentar
    this.engine.ensureWorkletReady().then(ready => {
      this._pendingWorkletRetries.delete(key);
      
      if (ready) {
        log.info(`Worklet ready - retrying oscillator ${oscIndex} on panel ${panelIndex}`);
        // Forzar recreación del nodo
        const panelAudio = this._getPanelAudio(panelIndex);
        if (panelAudio.nodes[oscIndex]) {
          panelAudio.nodes[oscIndex] = null;
        }
        // Reintentar creación
        const node = this._ensurePanelNodes(panelIndex, oscIndex);
        
        // Reaplicar el estado desde la UI si existe
        if (node && this._oscillatorUIs) {
          const oscId = `osc${panelIndex === 3 ? oscIndex + 1 : (panelIndex === 1 ? oscIndex + 7 : oscIndex + 10)}`;
          const ui = this._oscillatorUIs[oscId];
          if (ui && typeof ui.serialize === 'function') {
            // Re-emitir los valores actuales para actualizar los nodos de audio
            const data = ui.serialize();
            ui.deserialize(data);
          }
        }
      }
    }).catch(err => {
      log.error(`Failed to retry oscillator ${oscIndex}:`, err);
      this._pendingWorkletRetries.delete(key);
    });
  }

  _getPanelAudio(panelIndex) {
    if (!this._panelAudios) {
      this._panelAudios = {};
    }
    if (!this._panelAudios[panelIndex]) {
      this._panelAudios[panelIndex] = { nodes: [], state: [] };
    }
    return this._panelAudios[panelIndex];
  }

  _ensurePanelNodes(panelIndex, oscIndex) {
    // Panel 1 y 4: Solo visual, sin nodos de audio (módulos dummy)
    if (panelIndex === 1 || panelIndex === 4) return null;
    
    // Iniciar audio de forma síncrona pero no esperar al worklet
    // Si el worklet no está listo, registramos para reintentar después
    this.engine.start({ 
      latencyHint: localStorage.getItem(STORAGE_KEYS.LATENCY_MODE) || 
                   (isMobileDevice() ? 'playback' : 'interactive')
    });
    
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    const panelAudio = this._getPanelAudio(panelIndex);
    panelAudio.nodes = panelAudio.nodes || [];
    panelAudio.state = panelAudio.state || [];
    
    let entry = panelAudio.nodes[oscIndex];
    // Verificar si ya existe con el nuevo formato (multiOsc)
    if (entry && entry.multiOsc && entry.sineSawOut && entry.triPulseOut && entry.freqCVInput) {
      // ─────────────────────────────────────────────────────────────────────
      // VERIFICAR CADENA CV: Si cvThermalSlew debería existir pero no existe,
      // intentar crearla ahora que el worklet puede estar listo
      // ─────────────────────────────────────────────────────────────────────
      if (!entry.cvThermalSlew && this.engine.workletReady) {
        const oscConfig = this._getOscConfig(oscIndex);
        const thermalSlewConfig = oscConfig?.thermalSlew ?? oscillatorConfig.defaults?.thermalSlew ?? {};
        
        if (thermalSlewConfig.enabled !== false) {
          log.info(`[FM] Osc ${oscIndex}: cvThermalSlew missing, creating now...`);
          try {
            const cvThermalSlew = new AudioWorkletNode(ctx, 'cv-thermal-slew', {
              numberOfInputs: 1,
              numberOfOutputs: 1,
              outputChannelCount: [1],
              channelCount: 1,
              channelCountMode: 'explicit',
              processorOptions: {
                riseTimeConstant: thermalSlewConfig.riseTimeConstant ?? 0.15,
                fallTimeConstant: thermalSlewConfig.fallTimeConstant ?? 0.5
              }
            });
            
            const thresholdParam = cvThermalSlew.parameters?.get('threshold');
            if (thresholdParam) {
              thresholdParam.value = thermalSlewConfig.threshold ?? 0.5;
            }
            
            // Reconectar cadena: freqCVInput → cvThermalSlew → [cvSoftClip] → detune
            const detuneParam = entry.multiOsc.parameters?.get('detune');
            if (detuneParam) {
              // Desconectar freqCVInput del destino actual
              try { entry.freqCVInput.disconnect(); } catch(e) {}
              
              // Conectar nueva cadena
              entry.freqCVInput.connect(cvThermalSlew);
              
              let lastNode = cvThermalSlew;
              if (entry.cvSoftClip) {
                lastNode.connect(entry.cvSoftClip);
                lastNode = entry.cvSoftClip;
              }
              lastNode.connect(detuneParam);
              
              entry.cvThermalSlew = cvThermalSlew;
              log.info(`[FM] Osc ${oscIndex}: cvThermalSlew CREATED and chain reconnected ✓`);
            }
          } catch (err) {
            log.warn(`[FM] Failed to create cvThermalSlew for osc ${oscIndex}:`, err);
          }
        }
      }
      return entry;
    }

    const state = getOrCreateOscState(panelAudio, oscIndex);
    const useWorklet = this.engine.workletReady;

    // ─────────────────────────────────────────────────────────────────────────
    // OSCILADOR MULTI-WAVEFORM CON FASE MAESTRA UNIFICADA
    // ─────────────────────────────────────────────────────────────────────────
    // Todas las formas de onda (sine, saw, tri, pulse) se generan desde una
    // única fase maestra en el worklet. Esto garantiza coherencia perfecta
    // entre formas de onda y facilita el hard sync.
    // ─────────────────────────────────────────────────────────────────────────
    
    if (!useWorklet) {
      // Worklet no está listo aún - programar reintento cuando lo esté
      log.warn(`MultiOscillator requires worklet support - scheduling retry for osc ${oscIndex}`);
      this._scheduleWorkletRetry(panelIndex, oscIndex);
      return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Obtener configuración de sineShape del oscillator.config.js
    // ─────────────────────────────────────────────────────────────────────────
    const oscConfig = this._getOscConfig(oscIndex);
    const sineShape = oscConfig?.sineShape ?? oscillatorConfig.defaults?.sineShape ?? {};
    const audioConfig = oscConfig?.audio ?? oscillatorConfig.defaults?.audio ?? {};
    // Suavizado inherente del módulo (emula slew rate del CA3140)
    const moduleSlew = oscConfig?.moduleSlew ?? oscillatorConfig.defaults?.moduleSlew ?? {};

    const multiOsc = this.engine.createMultiOscillator({
      frequency: state.freq || 10,
      pulseWidth: state.pulseWidth || 0.5,
      symmetry: state.sineSymmetry || 0.5,
      sineLevel: state.oscLevel || 0,
      sawLevel: state.sawLevel || 0,
      triLevel: state.triLevel || 0,
      pulseLevel: state.pulseLevel || 0,
      // Parámetros de calibración del algoritmo híbrido de seno
      sineShapeAttenuation: sineShape.attenuation ?? 1.0,
      sinePurity: sineShape.purity ?? 0.7,
      saturationK: sineShape.saturationK ?? 1.55,
      maxOffset: sineShape.maxOffset ?? 0.85,
      // Tiempo de suavizado para cambios de parámetros
      smoothingTime: audioConfig.smoothingTime ?? 0.01,
      // Suavizado inherente del módulo (oscillator.config.js moduleSlew)
      moduleSlewCutoff: moduleSlew.cutoffHz ?? 20000,
      moduleSlewEnabled: moduleSlew.enabled ?? true
    });

    if (!multiOsc) return null;

    // Output 0: sine + saw
    const sineSawOut = ctx.createGain();
    sineSawOut.gain.value = 1.0;
    multiOsc.connect(sineSawOut, 0);

    // Output 1: tri + pulse
    const triPulseOut = ctx.createGain();
    triPulseOut.gain.value = 1.0;
    multiOsc.connect(triPulseOut, 1);
    
    const moduleOut = sineSawOut;
    if (panelIndex !== 3) {
      const bus1 = this.engine.getOutputBusNode(0);
      if (bus1) moduleOut.connect(bus1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NODO DE ENTRADA CV PARA MODULACIÓN DE FRECUENCIA (Panel 6)
    // ─────────────────────────────────────────────────────────────────────────
    // Implementa el estándar 1V/octava del Synthi 100.
    //
    // CONVERSIÓN:
    // - Digital ±1 = ±4V (DIGITAL_TO_VOLTAGE = 4.0)
    // - 1V real debe producir 1200 cents (1 octava)
    // - Por tanto: centsGain = 1200 / DIGITAL_TO_VOLTAGE = 1200 / 4 = 300 cents por unidad digital
    //   Así, 1V = 0.25 digital × 300 = 75... NO, hay que repensar.
    //
    // CORRECCIÓN: Para 1V/octava:
    // - 1V entrada → 1200 cents de cambio
    // - 1V en digital = 1/4 = 0.25
    // - Para que 0.25 digital → 1200 cents: gain = 1200 / 0.25 = 4800 cents
    //
    // Con cvScale=2, octavesPerUnit=0.5: gain = 2 * 0.5 * 1200 = 1200 (±1 digital = ±1 oct)
    // Esto significa ±4V = ±1 oct, es decir 0.25V/oct - INCORRECTO
    //
    // Para 1V/oct real: 1V = 0.25 digital debe dar 1200 cents
    // gain = 1200 / 0.25 = 4800 cents por unidad digital
    // ─────────────────────────────────────────────────────────────────────────
    const DIGITAL_TO_VOLTAGE = 4.0; // Coincide con voltageConstants.js
    const CENTS_PER_OCTAVE = 1200;
    // 1V/octava: 1V real = 1200 cents, 1V digital = 1/4, así que:
    const centsPerVolt = CENTS_PER_OCTAVE; // 1200 cents/V (estándar 1V/oct)
    const centsPerDigital = centsPerVolt / DIGITAL_TO_VOLTAGE; // 300 cents por 0.25 digital... NO
    // Recalculo: si 1V = 1200 cents, y 1 digital = 4V, entonces 1 digital = 4800 cents
    const centsGain = CENTS_PER_OCTAVE * DIGITAL_TO_VOLTAGE; // 1200 * 4 = 4800 cents por unidad digital
    
    const freqCVInput = ctx.createGain();
    freqCVInput.gain.value = centsGain;
    
    // ─────────────────────────────────────────────────────────────────────────
    // THERMAL SLEW DE CV (Inercia térmica del transistor)
    // ─────────────────────────────────────────────────────────────────────────
    // Según Manual Técnico Datanomics 1982:
    // "Si se realiza un salto grande de frecuencia (>2 kHz), se produce un
    // ligero efecto de portamento debido al calentamiento de un transistor."
    // ─────────────────────────────────────────────────────────────────────────
    const thermalSlewConfig = oscConfig?.thermalSlew ?? oscillatorConfig.defaults?.thermalSlew ?? {};
    let cvThermalSlew = null;
    
    log.info(`[FM] Osc ${oscIndex}: thermalSlew.enabled=${thermalSlewConfig.enabled}, workletReady=${this.engine.workletReady}`);
    
    if (thermalSlewConfig.enabled !== false && this.engine.workletReady) {
      try {
        cvThermalSlew = new AudioWorkletNode(ctx, 'cv-thermal-slew', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
          processorOptions: {
            riseTimeConstant: thermalSlewConfig.riseTimeConstant ?? 0.15,
            fallTimeConstant: thermalSlewConfig.fallTimeConstant ?? 0.5
          }
        });
        
        const thresholdParam = cvThermalSlew.parameters?.get('threshold');
        if (thresholdParam) {
          thresholdParam.value = thermalSlewConfig.threshold ?? 0.5;
        }
        log.info(`[FM] Osc ${oscIndex}: cvThermalSlew CREATED ✓`);
      } catch (err) {
        log.warn(` Failed to create CVThermalSlew for osc ${oscIndex}:`, err);
        cvThermalSlew = null;
      }
    } else {
      log.info(`[FM] Osc ${oscIndex}: cvThermalSlew SKIPPED (disabled or worklet not ready)`);
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SOFT CLIPPING DE CV (AudioWorklet - emulación Datanomics/Cuenca)
    // ─────────────────────────────────────────────────────────────────────────
    const softClipConfig = oscConfig?.softClip ?? oscillatorConfig.defaults?.softClip ?? {};
    const softClipCoefficient = softClipConfig.coefficient ?? 0.0001;
    const softClipEnabled = softClipConfig.enabled !== false;
    
    let cvSoftClip = null;
    if (softClipEnabled && VOLTAGE_DEFAULTS.softClipEnabled && this.engine.workletReady) {
      try {
        cvSoftClip = new AudioWorkletNode(ctx, 'cv-soft-clip', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
          processorOptions: {
            coefficient: softClipCoefficient
          }
        });
        log.info(`[FM] Osc ${oscIndex}: cvSoftClip CREATED (coefficient=${softClipCoefficient})`);
      } catch (err) {
        log.warn(`[FM] Osc ${oscIndex}: Failed to create cvSoftClip:`, err);
        cvSoftClip = null;
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONSTRUIR CADENA DE CV COMPLETA
    // ─────────────────────────────────────────────────────────────────────────
    // CADENA CV: freqCVInput → [cvThermalSlew] → [cvSoftClip] → detune
    // ─────────────────────────────────────────────────────────────────────────
    const detuneParam = multiOsc.parameters?.get('detune');
    
    // Nodo de entrada para la cadena CV (declarado fuera del if para poder referenciarlo en entry)
    let cvChainInput = null;
    
    if (detuneParam) {
      // CADENA CV COMPLETA (orden corregido):
      // source → cvChainInput → cvThermalSlew → cvSoftClip → freqCVInput(×4800) → detune
      //
      // El thermal slew y soft clip operan sobre la señal CV en unidades digitales (±1 a ±2),
      // ANTES de la conversión a cents. Esto es correcto porque:
      // - El thermal slew emula la inercia térmica del transistor (opera en voltios)
      // - El soft clip emula la saturación del opamp (opera en voltios)
      // - La conversión a cents es solo para el parámetro detune de Web Audio
      //
      // freqCVInput es el punto de entrada desde la matriz, pero ahora lo usamos
      // como nodo de ganancia al final de la cadena.
      
      // Crear nodo de entrada para la cadena CV (antes de thermal/softclip)
      cvChainInput = ctx.createGain();
      cvChainInput.gain.value = 1.0; // Ganancia unitaria, solo punto de conexión
      
      let lastNode = cvChainInput;
      
      if (cvThermalSlew) {
        log.info(`[FM] Osc ${oscIndex}: Connecting cvChainInput → cvThermalSlew`);
        lastNode.connect(cvThermalSlew);
        lastNode = cvThermalSlew;
      }
      
      if (cvSoftClip) {
        log.info(`[FM] Osc ${oscIndex}: Connecting → cvSoftClip`);
        lastNode.connect(cvSoftClip);
        lastNode = cvSoftClip;
      }
      
      // freqCVInput aplica la ganancia de conversión a cents (×4800)
      log.info(`[FM] Osc ${oscIndex}: Connecting → freqCVInput (×${centsGain} cents)`);
      lastNode.connect(freqCVInput);
      
      // Finalmente conectar al parámetro detune
      log.info(`[FM] Osc ${oscIndex}: Connecting → detune`);
      freqCVInput.connect(detuneParam);
      log.info(`[FM] Osc ${oscIndex}: CV chain complete ✓`);
      
      /* CADENA COMPLETA COMENTADA PARA PRUEBAS:
      let lastNode = freqCVInput;
      
      if (cvThermalSlew) {
        log.info(`[FM] Osc ${oscIndex}: Connecting freqCVInput → cvThermalSlew`);
        lastNode.connect(cvThermalSlew);
        lastNode = cvThermalSlew;
      }
      
      if (cvSoftClip) {
        log.info(`[FM] Osc ${oscIndex}: Connecting → cvSoftClip`);
        lastNode.connect(cvSoftClip);
        lastNode = cvSoftClip;
      }
      
      log.info(`[FM] Osc ${oscIndex}: Connecting → detune`);
      lastNode.connect(detuneParam);
      log.info(`[FM] Osc ${oscIndex}: CV chain complete ✓`);
      */
    } else {
      log.error(`[FM] Osc ${oscIndex}: DETUNE PARAM IS NULL - FM WILL NOT WORK!`);
    }
    
    // Marcar que la cadena CV está conectada
    const cvChainConnected = !!detuneParam;

    // Crear referencias de compatibilidad para código existente
    entry = {
      // Nuevo: oscilador unificado
      multiOsc,
      sineSawOut,
      triPulseOut,
      moduleOut,
      freqCVInput,
      _cvChainInput: cvChainInput, // Entrada de la cadena CV (antes de thermal/softclip)
      cvThermalSlew,  // Referencia al AudioWorkletNode para debug/ajustes
      cvSoftClip,  // Referencia al AudioWorkletNode para debug/ajustes
      _freqInitialized: true,
      _useWorklet: true,
      _isMultiOsc: true,
      _cvChainConnected: cvChainConnected,  // Flag para saber si freqCVInput → detune está conectado
      
      // Compatibilidad: aliases para código que espera la estructura antigua
      // Los GainNodes individuales ya no existen; los niveles se controlan
      // directamente en el worklet via AudioParams
      osc: multiOsc,
      gain: null,
      sawOsc: null,
      sawGain: null,
      triOsc: null,
      triGain: null,
      pulseOsc: null,
      pulseGain: null
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // DORMANCY SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    entry._isDormant = false;
    entry.setDormant = (dormant) => {
      if (entry._isDormant === dormant) return;
      entry._isDormant = dormant;
      
      // Enviar mensaje al worklet para early exit real (ahorra CPU)
      try {
        multiOsc.port.postMessage({ type: 'setDormant', dormant });
        console.log(`[Dormancy] Oscillator ${oscIndex} on panel ${panelIndex}: ${dormant ? 'DORMANT' : 'ACTIVE'}`);
      } catch (e) {
        console.warn('[Dormancy] Failed to send message to worklet:', e);
      }
      
      const rampTime = 0.01;
      
      if (dormant) {
        // DORMANT: Silenciar todos los niveles en el worklet
        try {
          multiOsc.setSineLevel(0, rampTime);
          multiOsc.setSawLevel(0, rampTime);
          multiOsc.setTriLevel(0, rampTime);
          multiOsc.setPulseLevel(0, rampTime);
        } catch { /* Ignorar errores */ }
      } else {
        // ACTIVE: Restaurar niveles desde el estado
        const oscState = panelAudio.state?.[oscIndex];
        if (oscState) {
          try {
            if (Number.isFinite(oscState.oscLevel)) multiOsc.setSineLevel(oscState.oscLevel, rampTime);
            if (Number.isFinite(oscState.sawLevel)) multiOsc.setSawLevel(oscState.sawLevel, rampTime);
            if (Number.isFinite(oscState.triLevel)) multiOsc.setTriLevel(oscState.triLevel, rampTime);
            if (Number.isFinite(oscState.pulseLevel)) multiOsc.setPulseLevel(oscState.pulseLevel, rampTime);
          } catch { /* Ignorar errores */ }
        }
      }
    };
    
    panelAudio.nodes[oscIndex] = entry;
    panelAudio.sources = panelAudio.sources || [];
    panelAudio.sources[oscIndex] = entry;
    return entry;
  }

  /**
   * Sincroniza el estado de audio de un oscilador con los valores actuales de su UI.
   * 
   * Este método lee los valores de los knobs de la UI y actualiza el estado interno
   * de audio para que coincida. NO crea nodos de audio (eso se hace lazy cuando
   * el usuario activa un pin de la matriz).
   * 
   * Se usa durante la inicialización para asegurar que el estado de audio
   * coincida con los valores iniciales configurados en los knobs.
   * 
   * @param {number} panelIndex - Índice del panel
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {SGME_Oscillator} [oscUI] - Referencia al UI del oscilador (opcional, se busca si no se pasa)
   * @private
   */
  _syncOscillatorStateFromUI(panelIndex, oscIndex, oscUI = null) {
    // Obtener UI si no se pasó
    if (!oscUI) {
      const oscId = `panel${panelIndex}-osc-${oscIndex + 1}`;
      oscUI = this._oscillatorUIs?.[oscId];
    }
    
    if (!oscUI || !oscUI.knobs) return;
    
    const panelAudio = this._getPanelAudio(panelIndex);
    
    // Obtener configuración del oscilador para la conversión de frecuencia
    const config = panelIndex === 3 ? this._getOscConfig(oscIndex) : oscillatorConfig.defaults;
    const knobsConfig = config?.knobs || {};
    const trackingConfig = config?.tracking || {};
    
    // Crear estado inicial desde la UI actual
    const isRangeLow = oscUI.rangeState === 'lo';
    const state = getOrCreateOscState(panelAudio, oscIndex, {
      knobsConfig,
      rangeLow: isRangeLow
    });
    
    // Leer valores actuales de los knobs y actualizar estado
    // Orden de knobs: [pulseLevel, pulseWidth, sineLevel, sineSymmetry, triangleLevel, sawtoothLevel, frequency]
    const knobValues = oscUI.knobs.map(k => k.getValue());
    
    state.pulseLevel = knobValues[0] ?? 0;
    state.pulseWidth = 0.01 + (knobValues[1] ?? 0.5) * 0.98; // Convertir a duty cycle
    state.oscLevel = knobValues[2] ?? 0;
    state.sineSymmetry = knobValues[3] ?? 0.5;
    state.triLevel = knobValues[4] ?? 0;
    state.sawLevel = knobValues[5] ?? 0;
    
    // Convertir posición del dial a frecuencia real
    const dialPosition = knobValues[6] ?? 5;
    state.freq = dialToFrequency(dialPosition, {
      rangeLow: isRangeLow,
      trackingConfig: {
        alpha: trackingConfig.alpha ?? 0.01,
        linearHalfRange: trackingConfig.linearHalfRange ?? 2.5
      }
    });
  }

  /**
   * Actualiza el volumen de una voz específica del oscilador.
   * @param {number} panelIndex - Índice del panel
   * @param {number} oscIndex - Índice del oscilador
   * @param {'osc'|'saw'|'tri'|'pulse'} voice - Tipo de voz
   * @param {number} value - Nuevo nivel (0-1)
   * @private
   */
  _updatePanelVoiceVolume(panelIndex, oscIndex, voice, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = getOrCreateOscState(panelAudio, oscIndex);
    
    // Mapeo de voz a propiedad de estado y método del worklet
    const voiceMap = {
      osc: { stateKey: 'oscLevel', setMethod: 'setSineLevel' },
      saw: { stateKey: 'sawLevel', setMethod: 'setSawLevel' },
      tri: { stateKey: 'triLevel', setMethod: 'setTriLevel' },
      pulse: { stateKey: 'pulseLevel', setMethod: 'setPulseLevel' }
    };
    
    const mapping = voiceMap[voice];
    if (!mapping) return;
    
    state[mapping.stateKey] = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.multiOsc) return;
    
    // Usar el método del worklet multiOsc
    if (node.multiOsc[mapping.setMethod]) {
      node.multiOsc[mapping.setMethod](value);
    }
  }

  // Métodos de conveniencia para compatibilidad
  _updatePanelOscVolume(panelIndex, oscIndex, value) {
    this._updatePanelVoiceVolume(panelIndex, oscIndex, 'osc', value);
  }
  _updatePanelSawVolume(panelIndex, oscIndex, value) {
    this._updatePanelVoiceVolume(panelIndex, oscIndex, 'saw', value);
  }
  _updatePanelTriVolume(panelIndex, oscIndex, value) {
    this._updatePanelVoiceVolume(panelIndex, oscIndex, 'tri', value);
  }
  _updatePanelPulseVolume(panelIndex, oscIndex, value) {
    this._updatePanelVoiceVolume(panelIndex, oscIndex, 'pulse', value);
  }

  _updatePanelPulseWidth(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = getOrCreateOscState(panelAudio, oscIndex);
    const duty = 0.01 + value * 0.98;
    state.pulseWidth = duty;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.multiOsc) return;
    
    // Usar el método del worklet multiOsc
    if (node.multiOsc.setPulseWidth) {
      node.multiOsc.setPulseWidth(duty);
    }
  }

  _updatePanelSineSymmetry(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = getOrCreateOscState(panelAudio, oscIndex);
    state.sineSymmetry = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.multiOsc) return;
    
    // Usar el método del worklet multiOsc
    if (node.multiOsc.setSymmetry) {
      node.multiOsc.setSymmetry(value);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SISTEMA DE CONFIGURACIÓN DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────

  _getOscConfig(oscIndex) {
    const defaults = oscillatorConfig.defaults || {};
    const oscNumber = oscIndex + 1;
    const override = oscillatorConfig.oscillators?.[oscNumber] || {};
    return deepMerge(defaults, override);
  }

  _applyCurve(value, knobConfig) {
    const { min, max, curve = 'linear', curveExponent = 2, curveK = 3 } = knobConfig;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    
    let curved;
    switch (curve) {
      case 'quadratic':
        curved = Math.pow(t, curveExponent);
        break;
      case 'exponential':
        curved = (Math.exp(curveK * t) - 1) / (Math.exp(curveK) - 1);
        break;
      case 'logarithmic':
        curved = Math.log(t + 1) / Math.log(2);
        break;
      default:
        curved = t;
    }
    
    return curved * (max - min) + min;
  }

  /**
   * Actualiza la frecuencia de un oscilador usando el modelo Synthi 100.
   * 
   * Implementa la conversión dial → frecuencia según el VCO CEM 3340 (1982):
   * - Escala exponencial 1V/Octava
   * - Factor 0.95 unidades de dial por octava
   * - Punto de referencia: posición 5 = 261 Hz (Do central)
   * - Distorsión de tracking fuera del rango lineal (±2.5V)
   * - Switch HI/LO divide la frecuencia por 10
   * 
   * @param {number} panelIndex - Índice del panel (3 para osciladores principales)
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {number} dialPosition - Posición del dial (0-10)
   * @param {boolean} [rangeLow] - Si se especifica, usa este valor. Si no, lee del UI.
   * @param {Object} [options] - Opciones adicionales
   * @param {number} [options.ramp=0] - Tiempo de rampa en segundos (0 = instantáneo)
   * @private
   */
  _updatePanelOscFreq(panelIndex, oscIndex, dialPosition, rangeLow = undefined, options = {}) {
    const { ramp = 0 } = options;
    
    // Obtener configuración del oscilador
    const config = panelIndex === 3 ? this._getOscConfig(oscIndex) : oscillatorConfig.defaults;
    const trackingConfig = config?.tracking || {};
    
    // Leer el estado del switch HI/LO desde el componente UI
    const oscId = `panel${panelIndex}-osc-${oscIndex + 1}`;
    const oscUI = this._oscillatorUIs?.[oscId];
    const isRangeLow = rangeLow !== undefined ? rangeLow : (oscUI?.rangeState === 'lo');
    
    // El valor que viene del knob ya es la posición del dial (0-10)
    // No necesita conversión adicional ya que el knob está configurado con min:0, max:10
    const dialValue = dialPosition;
    
    const freq = dialToFrequency(dialValue, {
      rangeLow: isRangeLow,
      trackingConfig: {
        alpha: trackingConfig.alpha ?? 0.01,
        linearHalfRange: trackingConfig.linearHalfRange ?? 2.5
      }
    });
    
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = getOrCreateOscState(panelAudio, oscIndex);
    state.freq = freq;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.multiOsc) return;
    
    // Actualizar frecuencia en el worklet multiOsc (única fase maestra)
    // ramp > 0: rampa suave para knob manual; ramp = 0: instantáneo para CV
    if (node.multiOsc.setFrequency) {
      node.multiOsc.setFrequency(freq, ramp);
    }
  }
  
  /**
   * Callback cuando cambia el switch HI/LO de un oscilador.
   * Recalcula la frecuencia con el nuevo rango.
   * 
   * @param {number} panelIndex - Índice del panel
   * @param {number} oscIndex - Índice del oscilador (0-based)
   * @param {'hi'|'lo'} rangeState - Nuevo estado del switch
   * @private
   */
  _onOscRangeChange(panelIndex, oscIndex, rangeState) {
    // Obtener el valor actual del knob de frecuencia
    const oscId = `panel${panelIndex}-osc-${oscIndex + 1}`;
    const oscUI = this._oscillatorUIs?.[oscId];
    if (!oscUI || !oscUI.knobs[6]) return;
    
    const currentDialPosition = oscUI.knobs[6].getValue();
    const isRangeLow = rangeState === 'lo';
    
    // Recalcular frecuencia con el nuevo rango
    this._updatePanelOscFreq(panelIndex, oscIndex, currentDialPosition, isRangeLow);
    
    // Enviar cambio de rango via OSC (solo Panel 3)
    if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
      oscillatorOSCSync.sendRangeChange(oscIndex, rangeState);
    }
  }

  _getPanelKnobOptions(panelIndex, oscIndex) {
    const config = panelIndex === 3 ? this._getOscConfig(oscIndex) : oscillatorConfig.defaults;
    const knobsConfig = config?.knobs || {};
    const audioConfig = config?.audio || {};
    
    // ─────────────────────────────────────────────────────────────────────
    // VOLTAJE PARA TOOLTIPS: Usar escala del sistema CV, NO outputLevels
    // ─────────────────────────────────────────────────────────────────────
    // Todas las formas de onda producen ±1 digital a nivel máximo.
    // El sistema CV convierte: 1 digital = DIGITAL_TO_VOLTAGE = 4V.
    // Por tanto, el Vpp real a nivel máximo es DIGITAL_TO_VOLTAGE × 2 = 8.0V.
    //
    // Los outputLevels del config son REFERENCIA del hardware real del Synthi 100
    // (pulse=8.1V, saw=6.2V, etc.) pero NO reflejan la salida digital.
    // Usar outputLevels causaba error en V/oct: tooltip "1V" ≠ 1V real en CV.
    // ─────────────────────────────────────────────────────────────────────
    const FULL_SCALE_VPP = DIGITAL_TO_VOLTAGE * 2; // 8.0V p-p
    
    const knobOptions = [];
    
    // Helpers para verificar preferencias de tooltips (se leen en cada llamada)
    const showVoltage = () => localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE) !== 'false';
    const showAudio = () => localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES) !== 'false';
    
    // Helper para convertir ganancia a dB
    const gainToDb = (gain) => {
      if (gain <= 0) return '-∞ dB';
      return `${(20 * Math.log10(gain)).toFixed(1)} dB`;
    };
    
    // Helper para crear tooltips de levels
    // Muestra: Vp-p (voltaje), ganancia y dB
    const getLevelTooltipInfo = (maxVpp) => (value, scaleValue) => {
      const parts = [];
      if (showVoltage()) {
        const vpp = (value * maxVpp).toFixed(2);
        parts.push(`${vpp} Vp-p`);
      }
      if (showAudio()) {
        parts.push(`×${value.toFixed(2)}`);
        parts.push(gainToDb(value));
      }
      return parts.length > 0 ? parts.join(' · ') : null;
    };
    
    const pulseLevelCfg = knobsConfig.pulseLevel || {};
    const pulseVpp = FULL_SCALE_VPP;
    knobOptions[0] = {
      min: pulseLevelCfg.min ?? 0,
      max: pulseLevelCfg.max ?? 1,
      initial: pulseLevelCfg.initial ?? 0,
      pixelsForFullRange: pulseLevelCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelPulseVolume(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 0, value);
        }
      },
      getTooltipInfo: getLevelTooltipInfo(pulseVpp)
    };
    
    const pulseWidthCfg = knobsConfig.pulseWidth || {};
    knobOptions[1] = {
      min: pulseWidthCfg.min ?? 0,
      max: pulseWidthCfg.max ?? 1,
      initial: pulseWidthCfg.initial ?? 0.5,
      pixelsForFullRange: pulseWidthCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelPulseWidth(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 1, value);
        }
      },
      getTooltipInfo: (value) => showAudio() ? `Duty: ${Math.round(value * 100)}%` : null
    };
    
    const sineLevelCfg = knobsConfig.sineLevel || {};
    const sineVpp = FULL_SCALE_VPP;
    knobOptions[2] = {
      min: sineLevelCfg.min ?? 0,
      max: sineLevelCfg.max ?? 1,
      initial: sineLevelCfg.initial ?? 0,
      pixelsForFullRange: sineLevelCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelOscVolume(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 2, value);
        }
      },
      getTooltipInfo: getLevelTooltipInfo(sineVpp)
    };
    
    const sineSymmetryCfg = knobsConfig.sineSymmetry || {};
    knobOptions[3] = {
      min: sineSymmetryCfg.min ?? 0,
      max: sineSymmetryCfg.max ?? 1,
      initial: sineSymmetryCfg.initial ?? 0.5,
      pixelsForFullRange: sineSymmetryCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelSineSymmetry(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 3, value);
        }
      },
      getTooltipInfo: (value) => {
        if (!showAudio()) return null;
        const offset = Math.round((value - 0.5) * 200);
        return offset === 0 ? 'Puro' : `Offset: ${offset > 0 ? '+' : ''}${offset}%`;
      }
    };
    
    const triangleLevelCfg = knobsConfig.triangleLevel || {};
    const triangleVpp = FULL_SCALE_VPP;
    knobOptions[4] = {
      min: triangleLevelCfg.min ?? 0,
      max: triangleLevelCfg.max ?? 1,
      initial: triangleLevelCfg.initial ?? 0,
      pixelsForFullRange: triangleLevelCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelTriVolume(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 4, value);
        }
      },
      getTooltipInfo: getLevelTooltipInfo(triangleVpp)
    };
    
    const sawtoothLevelCfg = knobsConfig.sawtoothLevel || {};
    const sawtoothVpp = FULL_SCALE_VPP;
    knobOptions[5] = {
      min: sawtoothLevelCfg.min ?? 0,
      max: sawtoothLevelCfg.max ?? 1,
      initial: sawtoothLevelCfg.initial ?? 0,
      pixelsForFullRange: sawtoothLevelCfg.pixelsForFullRange ?? 900,
      onChange: value => {
        this._updatePanelSawVolume(panelIndex, oscIndex, value);
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 5, value);
        }
      },
      getTooltipInfo: getLevelTooltipInfo(sawtoothVpp)
    };
    
    const frequencyCfg = knobsConfig.frequency || {};
    const trackingConfig = config?.tracking || {};
    
    // Función para generar info del tooltip de frecuencia
    // Muestra: voltaje del dial y frecuencia real calculada
    const getFreqTooltipInfo = (value, scaleValue) => {
      const parts = [];
      
      // Voltaje del potenciómetro (si está habilitado)
      // El pot del Synthi 100 genera 0-10V proporcional a la posición del dial.
      // El VCO interpreta ese voltaje con su propio tracking (0.95 u/oct).
      if (showVoltage()) {
        parts.push(value.toFixed(3) + ' V');
      }
      
      // Frecuencia real (si está habilitado)
      if (showAudio()) {
        const oscId = `panel${panelIndex}-osc-${oscIndex + 1}`;
        const oscUI = this._oscillatorUIs?.[oscId];
        const isRangeLow = oscUI?.rangeState === 'lo';
        
        const freq = dialToFrequency(value, {
          rangeLow: isRangeLow,
          trackingConfig: {
            alpha: trackingConfig.alpha ?? 0.01,
            linearHalfRange: trackingConfig.linearHalfRange ?? 2.5
          }
        });
        
        let freqStr;
        if (freq >= 1000) {
          freqStr = (freq / 1000).toFixed(2) + ' kHz';
        } else {
          freqStr = freq.toFixed(2) + ' Hz';
        }
        
        // Detectar CV conectado
        const hasFreqCV = this._hasOscillatorFreqCV(oscIndex);
        if (hasFreqCV) {
          freqStr += ' + CV';
        }
        
        parts.push(freqStr);
      }
      
      return parts.length > 0 ? parts.join(' · ') : null;
    };
    
    knobOptions[6] = {
      min: frequencyCfg.min ?? 0,
      max: frequencyCfg.max ?? 10,
      initial: frequencyCfg.initial ?? 5,
      pixelsForFullRange: frequencyCfg.pixelsForFullRange ?? 10000,
      scaleDecimals: frequencyCfg.scaleDecimals ?? 3,
      onChange: value => {
        // Rampa desde config para suavizar cambios manuales del knob (evita saltos audibles)
        const ramp = audioConfig.frequencyRampTime ?? 0.2;
        this._updatePanelOscFreq(panelIndex, oscIndex, value, undefined, { ramp });
        if (panelIndex === 3 && !oscillatorOSCSync.shouldIgnoreOSC()) {
          oscillatorOSCSync.sendKnobChange(oscIndex, 6, value);
        }
      },
      getTooltipInfo: getFreqTooltipInfo
    };
    
    return knobOptions;
  }

  // Wrappers de compatibilidad (pueden eliminarse en refactor futuro)
  _ensurePanel3Nodes(index) { return this._ensurePanelNodes(3, index); }

  // ─────────────────────────────────────────────────────────────────────────
  // SISTEMA DE BLUEPRINTS Y MATRICES
  // ─────────────────────────────────────────────────────────────────────────

  _physicalRowToSynthRow(rowIndex) {
    const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
    return mappings.rowBase + rowIndex;
  }

  _physicalColToSynthCol(colIndex) {
    const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
    return mappings.colBase + colIndex;
  }

  /**
   * Calcula la ganancia de un pin de matriz del Panel 5 (Audio).
   * 
   * Usa la fórmula de tierra virtual: Ganancia = Rf / R_pin
   * donde Rf es la resistencia de realimentación del destino y R_pin
   * es la resistencia del pin de conexión.
   * 
   * @param {number} rowIndex - Índice de fila física (fuente)
   * @param {number} colIndex - Índice de columna física (destino)
   * @param {Object} [destInfo] - Información del destino (opcional, para obtener Rf)
   * @param {string} [userPinType] - Tipo de pin seleccionado por el usuario (WHITE, GREY, GREEN, RED)
   * @returns {number} Factor de ganancia para el GainNode
   */
  _getPanel5PinGain(rowIndex, colIndex, destInfo = null, userPinType = null) {
    const cfg = audioMatrixConfig?.audio || {};
    const matrixGain = cfg.matrixGain ?? 1.0;
    const gainRange = cfg.gainRange || { min: 0, max: 2.0 };

    const rowSynth = this._physicalRowToSynthRow(rowIndex);
    const colSynth = this._physicalColToSynthCol(colIndex);
    const pinKey = `${rowSynth}:${colSynth}`;

    // Prioridad 1: Ganancia explícita por pin (override manual en config)
    const pinGains = audioMatrixConfig?.pinGains || {};
    if (pinKey in pinGains) {
      const pinGain = pinGains[pinKey];
      const clampedPin = Math.max(gainRange.min, Math.min(gainRange.max, pinGain));
      return clampedPin * matrixGain;
    }

    // Prioridad 2: Calcular según modelo de virtual-earth summing
    // Usar tipo de pin del usuario si se proporciona, sino fallback a config o default
    const pinTypes = audioMatrixConfig?.pinTypes || {};
    const pinType = userPinType || pinTypes[pinKey] || VOLTAGE_DEFAULTS.defaultPinType || 'WHITE';
    
    // Obtener Rf del destino (por defecto 100k estándar)
    let rf = STANDARD_FEEDBACK_RESISTANCE;
    if (destInfo?.rf) {
      rf = destInfo.rf;
    }
    
    // Determinar si aplicar tolerancia basado en settings
    const applyTolerance = VOLTAGE_DEFAULTS.applyPinTolerance ?? false;
    
    // Calcular seed único para reproducibilidad de tolerancia
    const seed = rowSynth * 1000 + colSynth;
    
    // Calcular ganancia base según fórmula de virtual-earth
    const pinGain = calculateMatrixPinGain(pinType, rf, { applyTolerance, seed });
    
    // Aplicar ganancias adicionales por fila/columna si existen
    const rowGains = audioMatrixConfig?.rowGains || {};
    const colGains = audioMatrixConfig?.colGains || {};
    const rowGain = rowGains[rowSynth] ?? 1.0;
    const colGain = colGains[colSynth] ?? 1.0;

    const clampedRow = Math.max(gainRange.min, Math.min(gainRange.max, rowGain));
    const clampedCol = Math.max(gainRange.min, Math.min(gainRange.max, colGain));

    // Combinar todas las ganancias
    const totalGain = pinGain * clampedRow * clampedCol * matrixGain;
    
    // Clamp final para evitar valores extremos
    return Math.max(gainRange.min, Math.min(gainRange.max * 40, totalGain)); // Permitir hasta 40x para pines rojos
  }

  _setupPanel5AudioRouting() {
    this._panel3Routing = this._panel3Routing || { connections: {}, rowMap: null, colMap: null, destMap: null, channelMap: null, sourceMap: null };
    this._panel3Routing.connections = {};
    const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
    this._panel3Routing.rowMap = mappings.rowMap;
    this._panel3Routing.colMap = mappings.colMap;
    this._panel3Routing.destMap = mappings.destMap;
    this._panel3Routing.channelMap = mappings.channelMap;
    this._panel3Routing.sourceMap = mappings.sourceMap;
    this._panel3Routing.hiddenCols = mappings.hiddenCols;

    if (this.largeMatrixAudio && this.largeMatrixAudio.setToggleHandler) {
      this.largeMatrixAudio.setToggleHandler((rowIndex, colIndex, nextActive, btn, pinColor) =>
        this._handlePanel5AudioToggle(rowIndex, colIndex, nextActive, pinColor)
      );
    }
  }

  /**
   * Cuenta el número de conexiones activas al osciloscopio desde ambos paneles.
   * Usado para determinar cuándo limpiar el display (cuando no hay conexiones).
   * @returns {number} Número total de conexiones al osciloscopio
   */
  getScopeConnectionCount() {
    let count = 0;
    
    // Contar conexiones del Panel 5 (audio) al osciloscopio
    if (this._panel3Routing?.connections && this._panel3Routing?.destMap) {
      for (const key of Object.keys(this._panel3Routing.connections)) {
        const colIndex = parseInt(key.split(':')[1], 10);
        const dest = this._panel3Routing.destMap.get(colIndex);
        if (dest?.kind === 'oscilloscope') count++;
      }
    }
    
    // Contar conexiones del Panel 6 (control) al osciloscopio
    if (this._panel6Routing?.connections && this._panel6Routing?.destMap) {
      for (const key of Object.keys(this._panel6Routing.connections)) {
        const colIndex = parseInt(key.split(':')[1], 10);
        const dest = this._panel6Routing.destMap.get(colIndex);
        if (dest?.kind === 'oscilloscope') count++;
      }
    }
    
    return count;
  }

  async _handlePanel5AudioToggle(rowIndex, colIndex, activate, pinColor = null) {
    const source = this._panel3Routing?.sourceMap?.get(rowIndex);
    const dest = this._panel3Routing?.destMap?.get(colIndex);
    const key = `${rowIndex}:${colIndex}`;

    if (!source || !dest) return true;

    if (activate) {
      this.ensureAudio();
      const ctx = this.engine.audioCtx;
      if (!ctx) return false;

      // Obtener nodo de salida según tipo de fuente
      let outNode = null;
      
      if (source.kind === 'panel3Osc') {
        // Fuente: Oscilador de Panel 3
        const oscIndex = source.oscIndex;
        const channelId = source.channelId || 'sineSaw';
        const src = this._ensurePanel3Nodes(oscIndex);
        outNode = channelId === 'triPulse' ? src?.triPulseOut : src?.sineSawOut;
        
        // Aplicar estado del oscilador
        const state = this._panel3Audio?.state?.[oscIndex];
        applyOscStateImmediate(src, state, ctx);
        
      } else if (source.kind === 'noiseGen') {
        // Fuente: Noise Generator
        const noiseIndex = source.index;
        // Acceder a los datos de Panel 3 dinámicamente
        const panel3Data = this['_panel3LayoutData'];
        const noiseAudioModules = panel3Data?.noiseAudioModules;
        
        if (!noiseAudioModules) {
          log.warn(' Noise audio modules not initialized');
          return false;
        }
        
        const noiseModule = noiseIndex === 0 ? noiseAudioModules.noise1 : noiseAudioModules.noise2;
        
        // Asegurar que el módulo esté iniciado (lazy init después de user gesture)
        if (noiseModule && !noiseModule.isStarted) {
          noiseModule.start();
        }
        
        outNode = noiseModule?.getOutputNode?.();
        
        if (!outNode) {
          log.warn(' NoiseModule output node not available, retrying init');
          noiseModule?.start?.();
          outNode = noiseModule?.getOutputNode?.();
        }
        
      } else if (source.kind === 'inputAmp') {
        // Fuente: Input Amplifier (canales de entrada del sistema)
        const channel = source.channel;
        
        if (!this.inputAmplifiers) {
          log.warn(' Input amplifiers module not initialized');
          return false;
        }
        
        // Asegurar que el módulo esté iniciado
        if (!this.inputAmplifiers.isStarted) {
          await this.inputAmplifiers.start();
        }
        
        // Asegurar que tengamos audio del sistema conectado
        await this._ensureSystemAudioInput();
        
        outNode = this.inputAmplifiers.getOutputNode(channel);
        
        if (!outNode) {
          log.warn(' InputAmplifier output node not available for channel', channel);
          return false;
        }
      } else if (source.kind === 'outputBus') {
        // Fuente: Output Bus (señal POST-VCA, PRE-filtro, con DC blocker)
        const busIndex = source.bus - 1; // bus 1-8 → index 0-7
        
        // Obtener dcBlocker del bus (señal post-VCA con DC eliminado)
        // Según planos Cuenca 1982: la re-entrada es post-fader pero pre-filtro
        // El DC blocker elimina cualquier offset DC que pueda causar problemas
        const busData = this.engine.outputBuses?.[busIndex];
        if (!busData?.dcBlocker) {
          log.warn(' Output bus dcBlocker not available for bus', source.bus);
          return false;
        }
        
        outNode = busData.dcBlocker;
      }
      
      if (!outNode) {
        log.warn(' No output node for source', source);
        return false;
      }

      // Determinar nodo de destino según tipo
      let destNode = null;
      if (dest.kind === 'outputBus') {
        const busIndex = dest.bus - 1;
        destNode = this.engine.getOutputBusNode(busIndex);
      } else if (dest.kind === 'oscilloscope') {
        // Conectar a la entrada correspondiente del osciloscopio
        if (!this.oscilloscope) {
          log.warn(' Oscilloscope module not ready yet');
          return false;
        }
        destNode = dest.channel === 'X' ? this.oscilloscope.inputX : this.oscilloscope.inputY;
        log.info(` Connecting to oscilloscope ${dest.channel}`);
      } else if (dest.kind === 'oscSync') {
        // ─────────────────────────────────────────────────────────────────────
        // HARD SYNC INPUT
        // ─────────────────────────────────────────────────────────────────────
        // La señal de audio conectada resetea la fase del oscilador destino
        // cada vez que cruza por cero en dirección positiva (flanco ascendente).
        // Esto permite crear timbres armónicos complejos al sincronizar la fase
        // de un oscilador "slave" con la frecuencia de un oscilador "master".
        //
        // El worklet (synthOscillator.worklet.js) detecta el flanco positivo
        // y resetea this.phase = 0. Ver processFunctions.processWithSync().
        //
        // NOTA: Conexión directa sin GainNode intermedio. La señal pasa tal cual
        // al input 0 del AudioWorkletNode. Si en el futuro se quisiera añadir
        // control de "sensibilidad" o threshold, bastaría con interponer un
        // GainNode con atenuación aquí.
        //
        const oscIndex = dest.oscIndex;
        const oscNodes = this._ensurePanel3Nodes(oscIndex);
        
        // El destino es el AudioWorkletNode directamente (input 0 = sync)
        // multiOsc es el AudioWorkletNode creado por engine.createMultiOscillator()
        destNode = oscNodes?.multiOsc;
        
        if (!destNode) {
          log.warn(' multiOsc not available for hard sync, osc', oscIndex);
          return false;
        }
        
        log.info(` Hard sync → Osc ${oscIndex + 1}`);
      }
      
      if (!destNode) {
        log.warn(' No destination node for', dest);
        return false;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // CADENA DE AUDIO CON FILTRO RC
      // ─────────────────────────────────────────────────────────────────────────
      // Emula el filtro RC natural formado por:
      // - Resistencia del pin (WHITE=100k, RED=2.7k, etc.)
      // - Capacitancia parásita del bus de la matriz (~100pF)
      //
      // La cadena es: source → pinFilter → gain → destination
      //
      // Referencia: Manual Datanomics 1982 - "con pines de 100k se produce
      // integración de transitorios rápidos"
      // ─────────────────────────────────────────────────────────────────────────
      
      // Crear filtro RC del pin (BiquadFilter lowpass)
      // El Q se lee de audioMatrixConfig.pinFiltering.filterQ
      const pinFilterQ = audioMatrixConfig?.pinFiltering?.filterQ ?? 0.5;
      const pinFilter = createPinFilter(ctx, pinColor || 'GREY', pinFilterQ);
      
      // Crear nodo de ganancia
      const gain = ctx.createGain();
      const pinGainValue = this._getPanel5PinGain(rowIndex, colIndex, dest, pinColor);
      gain.gain.value = pinGainValue;
      
      // Conectar cadena: source → pinFilter → gain → dest
      outNode.connect(pinFilter);
      pinFilter.connect(gain);
      
      // Para hard sync, conectar explícitamente al input 0 del AudioWorkletNode
      // connect(dest, outputIndex, inputIndex) - el tercer parámetro es crucial
      if (dest.kind === 'oscSync') {
        gain.connect(destNode, 0, 0); // output 0 del gain → input 0 del worklet
      } else {
        gain.connect(destNode);
      }
      
      // Guardar referencia a la conexión completa (filtro + gain)
      // para poder desconectar y actualizar ambos
      this._panel3Routing.connections[key] = { 
        filter: pinFilter, 
        gain: gain,
        pinColor: pinColor || 'GREY'
      };
      
      // Notificar al DormancyManager del cambio de conexiones
      this.dormancyManager?.onConnectionChange();
      
      return true;
    }

    const conn = this._panel3Routing.connections?.[key];
    if (conn) {
      safeDisconnect(conn.filter);
      safeDisconnect(conn.gain);
      delete this._panel3Routing.connections[key];
      
      // Si era una conexión al osciloscopio, verificar si quedan conexiones
      if (dest?.kind === 'oscilloscope' && this.oscilloscope) {
        // Contar conexiones restantes al osciloscopio
        const scopeConnections = this.getScopeConnectionCount ? this.getScopeConnectionCount() : 0;
        if (scopeConnections === 0) {
          // Notificar al display que no hay señal
          this.oscilloscope._notifyNoSignal?.();
        }
      }
    }

    // Notificar al DormancyManager del cambio de conexiones
    this.dormancyManager?.onConnectionChange();
    
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 6 - CONTROL MATRIX ROUTING
  // ─────────────────────────────────────────────────────────────────────────────
  //
  // Panel 6 es la matriz de control del Synthi 100. A diferencia del Panel 5
  // (audio), aquí se rutean señales de control (CV) hacia parámetros de módulos.
  //
  // SISTEMA BIPOLAR:
  // - Las señales CV van de -1 a +1
  // - CV = +1 → máxima modulación positiva
  // - CV =  0 → sin modulación (el parámetro mantiene su valor de knob)
  // - CV = -1 → máxima modulación negativa
  //
  // IMPLEMENTACIÓN ACTUAL:
  // - Sources (filas 83-88): Osciladores 10-12 (2 filas por oscilador)
  // - Destinations (columnas 30-42): Entradas CV de frecuencia (Osc 1-12)
  //
  // CONEXIONES:
  // Las conexiones se almacenan en this._panel6Routing.connections como
  // { "rowIndex:colIndex": GainNode } para facilitar desconexión.
  //
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Comprueba si hay CV conectado a la frecuencia de un oscilador.
   * 
   * Recorre las conexiones activas del Panel 6 buscando destinos de tipo
   * 'oscFreqCV' que coincidan con el índice de oscilador especificado.
   * 
   * @param {number} oscIndex - Índice del oscilador (0-11)
   * @returns {boolean} true si hay al menos una conexión CV activa
   * @private
   */
  _hasOscillatorFreqCV(oscIndex) {
    const routing = this._panel6Routing;
    if (!routing?.connections || !routing?.destMap) {
      return false;
    }
    
    // Recorrer las conexiones activas
    for (const key of Object.keys(routing.connections)) {
      const colIndex = parseInt(key.split(':')[1], 10);
      const dest = routing.destMap.get(colIndex);
      
      // Comprobar si el destino es CV de frecuencia para este oscilador
      if (dest?.kind === 'oscFreqCV' && dest?.oscIndex === oscIndex) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Configura el sistema de ruteo de control del Panel 6.
   * Compila el blueprint y registra el handler de toggle para la matriz.
   * @private
   */
  _setupPanel6ControlRouting() {
    this._panel6Routing = this._panel6Routing || { connections: {}, rowMap: null, colMap: null, destMap: null, channelMap: null, sourceMap: null };
    this._panel6Routing.connections = {};
    const mappings = compilePanelBlueprintMappings(panel6ControlBlueprint);
    this._panel6Routing.rowMap = mappings.rowMap;
    this._panel6Routing.colMap = mappings.colMap;
    this._panel6Routing.destMap = mappings.destMap;
    this._panel6Routing.channelMap = mappings.channelMap;
    this._panel6Routing.sourceMap = mappings.sourceMap;
    this._panel6Routing.hiddenCols = mappings.hiddenCols;

    if (this.largeMatrixControl && this.largeMatrixControl.setToggleHandler) {
      this.largeMatrixControl.setToggleHandler((rowIndex, colIndex, nextActive, btn, pinColor) =>
        this._handlePanel6ControlToggle(rowIndex, colIndex, nextActive, pinColor)
      );
    }
  }

  /**
   * Calcula la ganancia de un pin de matriz del Panel 6 (Control).
   * 
   * Usa la fórmula de tierra virtual: Ganancia = Rf / R_pin
   * Las señales de CV (Control Voltage) típicamente usan pines verdes
   * (68kΩ) para atenuación estándar de señales de control.
   * 
   * @param {number} rowIndex - Índice de fila física (fuente)
   * @param {number} colIndex - Índice de columna física (destino)
   * @param {Object} [destInfo] - Información del destino (opcional, para obtener Rf)
   * @param {string} [userPinType] - Tipo de pin seleccionado por el usuario (WHITE, GREY, GREEN, RED)
   * @returns {number} Factor de ganancia para el GainNode
   * @private
   */
  _getPanel6PinGain(rowIndex, colIndex, destInfo = null, userPinType = null) {
    const config = controlMatrixConfig || {};
    const controlSection = config.control || {};
    const matrixGain = controlSection.matrixGain ?? 1.0;
    const gainRange = controlSection.gainRange || { min: 0, max: 2.0 };
    const rowGains = config.rowGains || {};
    const colGains = config.colGains || {};
    const pinGains = config.pinGains || {};

    // Convertir índices físicos a numeración Synthi para buscar en configs
    const rowSynth = rowIndex + (panel6ControlBlueprint?.grid?.coordSystem?.rowBase || 67);
    const colSynth = colIndex + (panel6ControlBlueprint?.grid?.coordSystem?.colBase || 1);
    const pinKey = `${rowSynth}:${colSynth}`;

    // Prioridad 1: Ganancia explícita de pin (override manual en config)
    if (pinKey in pinGains) {
      return pinGains[pinKey] * matrixGain;
    }

    // Prioridad 2: Calcular según modelo de virtual-earth summing
    // Usar tipo de pin del usuario si se proporciona, sino fallback a config o default
    const pinTypes = config.pinTypes || {};
    const pinType = userPinType || pinTypes[pinKey] || 'GREY'; // Control: gris por defecto (100k, ganancia 1:1)
    
    // Obtener Rf del destino (por defecto 100k estándar)
    let rf = STANDARD_FEEDBACK_RESISTANCE;
    if (destInfo?.rf) {
      rf = destInfo.rf;
    }
    
    // Para CV, la tolerancia se aplica según settings pero con mayor cuidado
    const applyTolerance = VOLTAGE_DEFAULTS.applyPinTolerance ?? false;
    
    // Seed único para reproducibilidad
    const seed = rowSynth * 1000 + colSynth;
    
    // Calcular ganancia base según fórmula de virtual-earth
    const pinGain = calculateMatrixPinGain(pinType, rf, { applyTolerance, seed });
    
    // Aplicar ganancias adicionales por fila/columna si existen
    const rowGain = rowGains[rowSynth] ?? 1.0;
    const colGain = colGains[colSynth] ?? 1.0;
    
    // Combinar todas las ganancias
    return pinGain * rowGain * colGain * matrixGain;
  }

  /**
   * Maneja la activación/desactivación de un pin en la matriz de control (Panel 6).
   * 
   * FLUJO DE CONEXIÓN:
   * 1. Obtener nodo de salida de la fuente (oscilador, LFO, etc.)
   * 2. Obtener nodo de entrada del destino (freqCVInput del oscilador destino)
   * 3. Crear GainNode intermedio para control de profundidad
   * 4. Conectar: source → gainNode → destino
   * 
   * @param {number} rowIndex - Índice de fila (0-based)
   * @param {number} colIndex - Índice de columna (0-based)
   * @param {boolean} activate - true para conectar, false para desconectar
   * @param {string} [pinColor] - Color del pin seleccionado (WHITE, GREY, GREEN, RED)
   * @returns {boolean} true si la operación fue exitosa
   * @private
   */
  async _handlePanel6ControlToggle(rowIndex, colIndex, activate, pinColor = null) {
    const source = this._panel6Routing?.sourceMap?.get(rowIndex);
    const dest = this._panel6Routing?.destMap?.get(colIndex);
    const key = `${rowIndex}:${colIndex}`;

    if (!source || !dest) return true;

    if (activate) {
      this.ensureAudio();
      const ctx = this.engine.audioCtx;
      if (!ctx) return false;

      // ─────────────────────────────────────────────────────────────────────
      // OBTENER NODO DE SALIDA DE LA FUENTE
      // ─────────────────────────────────────────────────────────────────────
      let outNode = null;
      
      if (source.kind === 'panel3Osc') {
        // Fuente: Oscilador de Panel 3 (usado como LFO/CV source)
        const oscIndex = source.oscIndex;
        const channelId = source.channelId || 'sineSaw';
        const src = this._ensurePanel3Nodes(oscIndex);
        outNode = channelId === 'triPulse' ? src?.triPulseOut : src?.sineSawOut;
        
        // Aplicar estado del oscilador
        const state = this._panel3Audio?.state?.[oscIndex];
        applyOscStateImmediate(src, state, ctx);
      } else if (source.kind === 'inputAmp') {
        // Fuente: Input Amplifier (canales de entrada como fuente de CV)
        const channel = source.channel;
        
        if (!this.inputAmplifiers) {
          log.warn(' Input amplifiers module not initialized');
          return false;
        }
        
        // Asegurar que el módulo esté iniciado
        if (!this.inputAmplifiers.isStarted) {
          await this.inputAmplifiers.start();
        }
        
        // Asegurar que tengamos audio del sistema conectado
        await this._ensureSystemAudioInput();
        
        outNode = this.inputAmplifiers.getOutputNode(channel);
        
        if (!outNode) {
          log.warn(' InputAmplifier output node not available for channel', channel);
          return false;
        }
      } else if (source.kind === 'outputBus') {
        // Fuente: Output Bus (señal POST-VCA como fuente de CV, con DC blocker)
        const busIndex = source.bus - 1; // bus 1-8 → index 0-7
        
        // Obtener dcBlocker del bus (señal post-VCA con DC eliminado)
        // Según planos Cuenca 1982: la re-entrada es post-fader pero pre-filtro
        // El DC blocker elimina cualquier offset DC que pueda causar problemas
        const busData = this.engine.outputBuses?.[busIndex];
        if (!busData?.dcBlocker) {
          log.warn(' Output bus dcBlocker not available for bus', source.bus);
          return false;
        }
        
        outNode = busData.dcBlocker;
      }
      // Aquí se añadirán más tipos de fuentes en el futuro:
      // - 'envelope': generador de envolventes
      // - 'lfo': LFO dedicado
      // - 'sequencer': secuenciador de voltaje
      // - 'randomVoltage': generador de voltaje aleatorio
      
      if (!outNode) {
        log.warn(' No output node for control source', source);
        return false;
      }

      // ─────────────────────────────────────────────────────────────────────
      // OBTENER NODO DE ENTRADA DEL DESTINO
      // ─────────────────────────────────────────────────────────────────────
      let destNode = null;
      
      if (dest.kind === 'oscFreqCV') {
        // Destino: Entrada CV de frecuencia del oscilador
        const oscIndex = dest.oscIndex;
        const oscNodes = this._ensurePanel3Nodes(oscIndex);
        
        // Usar _cvChainInput si existe (entrada antes de thermal/softclip),
        // sino fallback a freqCVInput para compatibilidad
        destNode = oscNodes?._cvChainInput || oscNodes?.freqCVInput;
        
        // ─────────────────────────────────────────────────────────────────────
        // FIX: Verificar y reconectar cadena CV si no está conectada
        // ─────────────────────────────────────────────────────────────────────
        if (oscNodes?.multiOsc && oscNodes?.freqCVInput && !oscNodes._cvChainConnected) {
          const detuneParam = oscNodes.multiOsc.parameters?.get('detune');
          if (detuneParam) {
            log.info(`[FM] Osc ${oscIndex}: Reconnecting freqCVInput → detune`);
            try { oscNodes.freqCVInput.disconnect(); } catch(e) {}
            oscNodes.freqCVInput.connect(detuneParam);
            oscNodes._cvChainConnected = true;
          }
        }
        
        if (!destNode) {
          log.warn(' freqCVInput not available for osc', oscIndex);
          return false;
        }
      } else if (dest.kind === 'oscilloscope') {
        // Destino: Osciloscopio (visualización de señales CV)
        if (!this.oscilloscope) {
          log.warn(' Oscilloscope module not ready yet');
          return false;
        }
        destNode = dest.channel === 'X' ? this.oscilloscope.inputX : this.oscilloscope.inputY;
        log.info(` Panel 6: Connecting to oscilloscope ${dest.channel}`);
      } else if (dest.kind === 'outputLevelCV') {
        // ─────────────────────────────────────────────────────────────────────
        // Destino: Control de nivel de canal de salida (VCA CEM 3330)
        // ─────────────────────────────────────────────────────────────────────
        //
        // En el hardware Synthi 100 (Cuenca 1982), el CV de la matriz se SUMA
        // algebraicamente al voltaje del fader ANTES del VCA. Esto significa:
        //
        // 1. El CV afecta la ganancia de forma no lineal (10 dB/V)
        // 2. Si el fader está en 0, el CV se IGNORA (corte mecánico)
        // 3. CV positivo puede causar saturación suave
        //
        // IMPLEMENTACIÓN AUDIO-RATE:
        // Conectamos el CV directamente al AudioWorklet del VCA del engine.
        // Esto permite AM a frecuencias de audio (trémolo, ring mod, etc.)
        // con la curva logarítmica 10 dB/V del CEM 3330.
        //
        // ─────────────────────────────────────────────────────────────────────
        const busIndex = dest.busIndex;
        
        // Verificar que el engine esté disponible y los worklets cargados
        if (!this.engine || !this.engine.workletReady) {
          log.warn(' Engine or worklets not ready for audio-rate CV');
          // Fallback a conexión dummy (el CV no tendrá efecto)
          destNode = ctx.createGain();
          destNode.gain.value = 0;
        } else {
          // ─────────────────────────────────────────────────────────────────────
          // CREAR NODO INTERMEDIARIO PARA CV
          // ─────────────────────────────────────────────────────────────────────
          // El pinFilter y gain de la matriz se conectan aquí, y la salida
          // va al VCA worklet del engine.
          // ─────────────────────────────────────────────────────────────────────
          const cvPassthrough = ctx.createGain();
          cvPassthrough.gain.value = 1;
          
          // Conectar el passthrough al VCA worklet del engine
          const connected = this.engine.connectOutputLevelCV(busIndex, cvPassthrough);
          
          if (connected) {
            destNode = cvPassthrough;
            
            // Guardar referencia para cleanup
            this._outputLevelCVData = {
              cvPassthrough,
              busIndex,
              disconnect: () => {
                this.engine?.disconnectOutputLevelCV(busIndex, cvPassthrough);
              }
            };
            
            log.info(` Panel 6: Audio-rate CV connected to output level bus ${busIndex + 1}`);
          } else {
            log.warn(' Failed to connect CV to VCA worklet');
            destNode = ctx.createGain();
            destNode.gain.value = 0;
          }
        }
      } else if (dest.kind === 'outputBus') {
        // ─────────────────────────────────────────────────────────────────────
        // Destino: Entrada de audio/voltaje al Output Channel (ANTES del VCA)
        // ─────────────────────────────────────────────────────────────────────
        //
        // Columnas 42-45 de Panel 6: "Voltage Input" para canales 1-4
        // La señal se suma a las entradas de audio del Panel 5 y pasa por
        // toda la cadena del canal: VCA (con filtro anti-click) → filtros → salida
        //
        // CASO DE USO:
        // Usar el Output Channel como "slew limiter" para señales de control.
        // La señal de control entra aquí, pasa por el VCA (τ=5ms), y sale
        // suavizada por la re-entrada POST-fader (filas 75-78).
        //
        // ─────────────────────────────────────────────────────────────────────
        const busIndex = dest.bus - 1;
        destNode = this.engine.getOutputBusNode(busIndex);
        
        if (!destNode) {
          log.warn(' Output bus input not available for bus', dest.bus);
          return false;
        }
        
        log.info(` Panel 6: Voltage input connected to output channel ${dest.bus}`);
      }
      // Aquí se añadirán más tipos de destinos en el futuro:
      // - 'oscAmpCV': modulación de amplitud
      // - 'filterCutoffCV': modulación de frecuencia de corte
      // - 'filterResonanceCV': modulación de resonancia
      // - 'panCV': modulación de panorama
      
      if (!destNode) {
        log.warn(' No destination node for control dest', dest);
        return false;
      }

      // ─────────────────────────────────────────────────────────────────────
      // CREAR CONEXIÓN CON FILTRO RC + GAINNODE
      // ─────────────────────────────────────────────────────────────────────
      // El filtro RC emula la integración por resistencia de pin.
      // El GainNode permite controlar la "profundidad" de modulación
      // mediante las ganancias definidas en panel6.control.config.js
      //
      // Cadena: source → pinFilter → gain → destination
      //
      // Referencia: Manual Datanomics 1982 - "con pines de 100k se produce
      // integración de transitorios rápidos"
      // ─────────────────────────────────────────────────────────────────────
      
      // Crear filtro RC del pin
      // El Q se lee de audioMatrixConfig.pinFiltering.filterQ
      const pinFilterQ = audioMatrixConfig?.pinFiltering?.filterQ ?? 0.5;
      const pinFilter = createPinFilter(ctx, pinColor || 'GREY', pinFilterQ);
      
      // Crear nodo de ganancia
      const gain = ctx.createGain();
      const pinGainValue = this._getPanel6PinGain(rowIndex, colIndex, dest, pinColor);
      gain.gain.value = pinGainValue;
      
      // Conectar cadena: source → pinFilter → gain → dest
      outNode.connect(pinFilter);
      pinFilter.connect(gain);
      gain.connect(destNode);
      
      // Guardar referencia completa (filtro + gain + pinColor)
      // Si hay datos de CV sampling pendientes, fusionarlos
      const connectionData = {
        filter: pinFilter,
        gain: gain,
        pinColor: pinColor || 'GREY',
        // Fusionar datos de outputLevelCV si existen
        ...(this._outputLevelCVData || {})
      };
      delete this._outputLevelCVData;  // Limpiar temporal
      
      this._panel6Routing.connections[key] = connectionData;
      
      log.info(` Panel 6: Connected ${source.kind}[${source.oscIndex ?? source.channel ?? ''}] → ${dest.kind}[${dest.oscIndex ?? dest.busIndex ?? ''}] (gain: ${pinGainValue}, fc: ${PIN_CUTOFF_FREQUENCIES[pinColor || 'GREY']?.toFixed(0)} Hz)`);
      
      // Notificar al DormancyManager del cambio de conexiones
      this.dormancyManager?.onConnectionChange();
      
      return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DESCONEXIÓN
    // ─────────────────────────────────────────────────────────────────────────
    const conn = this._panel6Routing.connections?.[key];
    if (conn) {
      // Limpiar nodos de audio
      safeDisconnect(conn.filter);
      safeDisconnect(conn.gain);
      
      // ─────────────────────────────────────────────────────────────────────
      // Limpieza especial para outputLevelCV
      // ─────────────────────────────────────────────────────────────────────
      // Sistema nuevo (audio-rate): desconectar del VCA worklet
      // Sistema legacy (60Hz): detener RAF y desconectar nodos de muestreo
      // ─────────────────────────────────────────────────────────────────────
      if (conn.disconnect) {
        // Sistema nuevo: desconectar del VCA worklet
        conn.disconnect();
      }
      if (conn.cvPassthrough) {
        safeDisconnect(conn.cvPassthrough);
      }
      // Legacy cleanup (para conexiones existentes antes de la migración)
      if (conn.stopSampling) {
        conn.stopSampling();
      }
      if (conn.cvSampler) {
        safeDisconnect(conn.cvSampler);
      }
      if (conn.analyser) {
        safeDisconnect(conn.analyser);
      }
      if (conn.silencer) {
        safeDisconnect(conn.silencer);
      }
      
      delete this._panel6Routing.connections[key];
      log.info(` Panel 6: Disconnected ${key}`);
      
      // Si era una conexión al osciloscopio, verificar si quedan conexiones
      if (dest?.kind === 'oscilloscope' && this.oscilloscope) {
        // Contar conexiones restantes al osciloscopio (Panel 5 + Panel 6)
        const scopeConnections = this.getScopeConnectionCount ? this.getScopeConnectionCount() : 0;
        if (scopeConnections === 0) {
          // Notificar al display que no hay señal
          this.oscilloscope._notifyNoSignal?.();
        }
      }
    }

    // Notificar al DormancyManager del cambio de conexiones
    this.dormancyManager?.onConnectionChange();
    
    return true;
  }

  _buildLargeMatrices() {
    this.panel5MatrixEl = this.panel5.addSection({ id: 'panel5Matrix', type: 'matrix' });
    this.panel6MatrixEl = this.panel6.addSection({ id: 'panel6Matrix', type: 'matrix' });

    const LARGE_MATRIX_FRAME_PANEL5 = panel5AudioBlueprint?.ui?.frame || {
      squarePercent: 90,
      translateSteps: { x: 5.1, y: 0 },
      marginsSteps: { left: -7.47, right: -3, top: 4.7, bottom: 2.7 },
      clip: true,
      overflowPercent: { left: 25, top: 25, right: 200, bottom: 80 },
      maxSizePercent: 300
    };

    const LARGE_MATRIX_FRAME_PANEL6 = panel6ControlBlueprint?.ui?.frame || LARGE_MATRIX_FRAME_PANEL5;

    if (LARGE_MATRIX_FRAME_PANEL5.clip === false) {
      this.panel5?.element?.classList.add('matrix-adjust');
      this.panel6?.element?.classList.add('matrix-adjust');
    } else {
      this.panel5?.element?.classList.remove('matrix-adjust');
      this.panel6?.element?.classList.remove('matrix-adjust');
    }

    // Compile blueprints to get routing maps for tooltips and hidden pins
    const panel5Maps = compilePanelBlueprintMappings(panel5AudioBlueprint);
    const panel6Maps = compilePanelBlueprintMappings(panel6ControlBlueprint);

    const { hiddenCols: HIDDEN_COLS_PANEL5, hiddenRows: HIDDEN_ROWS_PANEL5 } = panel5Maps;
    const { hiddenCols: HIDDEN_COLS_PANEL6, hiddenRows: HIDDEN_ROWS_PANEL6 } = panel6Maps;

    // Función para determinar color por defecto dinámico (osciloscopio = RED)
    const getPanel5DefaultColor = (row, col) => {
      const dest = panel5Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'RED';
      return null;  // Usa el default del panel (WHITE)
    };
    
    const getPanel6DefaultColor = (row, col) => {
      const dest = panel6Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'RED';
      return null;  // Usa el default del panel (GREEN)
    };

    this.largeMatrixAudio = new LargeMatrix(this.panel5MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL5,
      hiddenCols: HIDDEN_COLS_PANEL5,
      hiddenRows: HIDDEN_ROWS_PANEL5,
      sourceMap: panel5Maps.sourceMap,
      destMap: panel5Maps.destMap,
      panelId: 'panel-5',
      defaultPinColor: 'WHITE',  // Audio: pin blanco por defecto
      getDefaultPinColor: getPanel5DefaultColor
    });

    this.largeMatrixControl = new LargeMatrix(this.panel6MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL6,
      hiddenCols: HIDDEN_COLS_PANEL6,
      hiddenRows: HIDDEN_ROWS_PANEL6,
      sourceMap: panel6Maps.sourceMap,
      destMap: panel6Maps.destMap,
      panelId: 'panel-6',
      defaultPinColor: 'GREEN',  // Control: pin verde por defecto
      getDefaultPinColor: getPanel6DefaultColor
    });

    this.largeMatrixAudio.build();
    this.largeMatrixControl.build();
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIN CONTEXT DETECTION
    // ─────────────────────────────────────────────────────────────────────────
    // Determina el contexto de un pin para usar el color correcto.
    // Contextos: 'audio', 'control', 'oscilloscope'
    //
    this.largeMatrixAudio.getPinContext = (row, col) => {
      const dest = panel5Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'oscilloscope';
      return 'audio';
    };
    
    this.largeMatrixControl.getPinContext = (row, col) => {
      const dest = panel6Maps.destMap.get(col);
      if (dest?.kind === 'oscilloscope') return 'oscilloscope';
      return 'control';
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // PIN COLOR CHANGE CALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando el usuario cambia el color de un pin activo, actualizar:
    // 1. La frecuencia de corte del filtro RC (emula cambio de resistencia)
    // 2. La ganancia (fórmula de tierra virtual Rf/Rpin)
    //
    this.largeMatrixAudio.onPinColorChange = (row, col, newColor, btn) => {
      const key = `${row}:${col}`;
      const conn = this._panel3Routing?.connections?.[key];
      
      if (conn) {
        const dest = this._panel3Routing?.destMap?.get(col);
        const currentTime = this.engine.audioCtx.currentTime;
        
        // Actualizar filtro RC
        updatePinFilter(conn.filter, newColor, currentTime);
        conn.pinColor = newColor;
        
        // Actualizar ganancia
        const newGain = this._getPanel5PinGain(row, col, dest, newColor);
        conn.gain.gain.setValueAtTime(newGain, currentTime);
        log.info(` Panel 5: Pin color changed [${row}:${col}] → ${newColor} (gain: ${newGain.toFixed(3)}, fc: ${PIN_CUTOFF_FREQUENCIES[newColor]?.toFixed(0)} Hz)`);
      }
    };
    
    this.largeMatrixControl.onPinColorChange = (row, col, newColor, btn) => {
      const key = `${row}:${col}`;
      const conn = this._panel6Routing?.connections?.[key];
      
      if (conn) {
        const dest = this._panel6Routing?.destMap?.get(col);
        const currentTime = this.engine.audioCtx.currentTime;
        
        // Actualizar filtro RC
        updatePinFilter(conn.filter, newColor, currentTime);
        conn.pinColor = newColor;
        
        // Actualizar ganancia
        const newGain = this._getPanel6PinGain(row, col, dest, newColor);
        conn.gain.gain.setValueAtTime(newGain, currentTime);
        log.info(` Panel 6: Pin color changed [${row}:${col}] → ${newColor} (gain: ${newGain.toFixed(3)}, fc: ${PIN_CUTOFF_FREQUENCIES[newColor]?.toFixed(0)} Hz)`);
      }
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // INACTIVE PINS VISIBILITY
    // ─────────────────────────────────────────────────────────────────────────
    // Apply initial preference for inactive pins (dim by default).
    // Listen for changes to update in real-time.
    //
    const savedShowInactive = localStorage.getItem(STORAGE_KEYS.SHOW_INACTIVE_PINS) === 'true';
    this.largeMatrixAudio.setShowInactivePins(savedShowInactive);
    this.largeMatrixControl.setShowInactivePins(savedShowInactive);
    
    document.addEventListener('synth:showInactivePinsChange', (e) => {
      const show = e.detail?.show ?? false;
      this.largeMatrixAudio?.setShowInactivePins(show);
      this.largeMatrixControl?.setShowInactivePins(show);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // MATRIX PIN TOOLTIPS
    // ─────────────────────────────────────────────────────────────────────────
    // Attach tooltip system to both matrices.
    // Tooltips show "Source → Destination" on hover (desktop) or tap (mobile).
    // Uses sourceMap/destMap from compiled blueprints for label generation.
    //
    const tooltip = getSharedTooltip();
    tooltip.attachToMatrix(this.panel5MatrixEl, {
      sourceMap: panel5Maps.sourceMap,
      destMap: panel5Maps.destMap,
      rowBase: panel5Maps.rowBase,
      colBase: panel5Maps.colBase
    });
    tooltip.attachToMatrix(this.panel6MatrixEl, {
      sourceMap: panel6Maps.sourceMap,
      destMap: panel6Maps.destMap,
      rowBase: panel6Maps.rowBase,
      colBase: panel6Maps.colBase
    });
  }

  _resizeLargeMatrices() {
    if (this.largeMatrixAudio) {
      this.largeMatrixAudio.resizeToFit();
    }
    if (this.largeMatrixControl) {
      this.largeMatrixControl.resizeToFit();
    }
  }

  _schedulePanelSync() {
    if (this._heightSyncScheduled) return;
    this._heightSyncScheduled = true;
    requestAnimationFrame(() => {
      this._heightSyncScheduled = false;
      this._reflowOscillatorPanel(1);
      this._reflowOscillatorPanel(2);
      this._reflowOscillatorPanel(3);
      this._reflowOscillatorPanel(4);
      this._syncPanelHeights();
      renderCanvasBgPanels();
    });
  }

  _syncPanelHeights() {
    const panels = document.querySelectorAll('#viewportInner .panel');
    panels.forEach(panel => {
      panel.style.height = '';
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN DEL SPLASH SCREEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SPLASH_MIN_DISPLAY_MS: Tiempo mínimo (en milisegundos) que el splash 
 * permanece visible, incluso si la carga es más rápida.
 * 
 * Esto evita un "parpadeo" molesto en cargas muy rápidas y garantiza que
 * el usuario vea la pantalla de bienvenida el tiempo suficiente para
 * reconocer la marca.
 * 
 * VALORES RECOMENDADOS:
 * - 800ms  → Carga rápida, mínimo reconocible
 * - 1200ms → Balance entre velocidad y visibilidad (por defecto)
 * - 1800ms → Más tiempo de exposición de marca
 * - 2500ms → Experiencia pausada, ideal para primera carga
 * - 3200ms → Extra estabilidad en móvil/tablet
 * 
 * Para desactivar el tiempo mínimo, establecer en 0.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const SPLASH_MIN_DISPLAY_MS = 3200;

/**
 * Oculta el splash screen con una transición suave.
 * Actualiza la versión mostrada antes de ocultar.
 * Dispara la restauración del estado previo cuando termina.
 */
function hideSplashScreen() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  
  // Añadir clase que dispara la animación de fade-out (ver main.css)
  splash.classList.add('splash--hidden');
  
  // Eliminar del DOM después de la transición para liberar memoria
  // El tiempo debe coincidir con la duración de la transición CSS (0.8s = 800ms)
  setTimeout(() => {
    splash.remove();
    
    // Forzar recálculo del viewport a vista general para evitar zoom "congelado"
    // Esto corrige un bug en móvil/tablet donde el viewport parece zoomeado hasta el primer toque
    if (typeof window.__synthAnimateToPanel === 'function') {
      window.__synthAnimateToPanel(null, 0);
    }
    
    // Disparar la pregunta de restaurar estado DESPUÉS de que el splash termine
    if (window._synthApp && window._synthApp.triggerRestoreLastState) {
      window._synthApp.triggerRestoreLastState();
    }
  }, 800);
}

window.addEventListener('DOMContentLoaded', async () => {
  // ─── Marcar tiempo de inicio para calcular tiempo mínimo de splash ───
  const splashStartTime = Date.now();
  
  // Inicializar sistema de internacionalización antes de crear la UI
  await initI18n();
  
  // Detectar versión antes de crear la app (para que esté disponible en modales)
  await detectBuildVersion();
  
  // ensureOrientationHint(); // Desactivado: reemplazado por bloqueador portrait permanente
  initPortraitBlocker();
  
  // Intentar bloquear orientación a landscape (solo funciona en fullscreen/PWA)
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {
      // Bloqueo de orientación no soportado o denegado
    });
  }
  
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
  
  // DEBUG: Exponer channelBypass a consola para diagnóstico
  // Usar: window.channelBypass(true) o window.channelBypass(false)
  window.channelBypass = (enabled) => {
    const app = window._synthApp;
    if (app && app.engine) {
      app.engine.setChannelBypassDebug(enabled);
    } else {
      console.warn('Engine no disponible');
    }
  };
  
  // Inicializar navegación del viewport
  initViewportNavigation();
  
  // Inicializar sistema PiP (paneles flotantes)
  initPipManager();
  
  // Restaurar paneles PiP de sesión anterior
  restorePipState();
  
  // Registrar service worker
  registerServiceWorker();
  
  // Configurar UI móvil y zoom de paneles
  setupMobileQuickActionsBar();
  setupPanelShortcutBadges();
  setupPanelDoubleTapZoom();

  // Inicializar puente de menú Electron (traducciones, estado, acciones IPC)
  // Solo se activa si estamos en Electron (window.menuAPI existe)
  initElectronMenuBridge();
  
  // ─── Ocultar splash screen después de la inicialización ───
  // Garantiza un tiempo mínimo de visualización para evitar parpadeos
  const elapsedTime = Date.now() - splashStartTime;
  const remainingTime = Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsedTime);
  
  if (remainingTime > 0) {
    // Esperar el tiempo restante para cumplir el mínimo
    setTimeout(hideSplashScreen, remainingTime);
  } else {
    // Ya pasó el tiempo mínimo, ocultar inmediatamente
    hideSplashScreen();
  }
});
