// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { serializeCurrentState, applyPatch as applyPatchFromSerializer } from './stateSerializer.js';
import { findModuleById, getModulesForPanel, reflowOscillatorPanel, resetModule, resetToDefaults } from './moduleManager.js';
import {
  handlePanel5AudioToggle, handlePanel6ControlToggle,
  ensurePanelNodes, getPanelKnobOptions,
  getPanel5PinGain, getPanel6PinGain
} from './panelRouting.js';
import {
  ensureAudio,
  activateMultichannelOutput, activateMultichannelOutputFallback,
  deactivateMultichannelOutput,
  activateMultichannelInput, deactivateMultichannelInput,
  ensureSystemAudioInput, restoreMultichannelIfSaved
} from './audioSetup.js';
import {
  buildPanel1, buildPanel2, buildPanel4,
  buildOscillatorPanel, setupOutputFaders,
  buildLargeMatrices, initSignalFlowHighlighter,
  setupJoystickPad
} from './panelAssembler.js';
import { setupAudioRouting, setupControlRouting } from './routingSetup.js';
import {
  setupUI as setupUIFromInitializer,
  setupAudioSettingsModal as setupAudioSettingsModalFromInitializer,
  setupRecording as setupRecordingFromInitializer,
  setupSettingsModal as setupSettingsModalFromInitializer,
  setupDormancyManager as setupDormancyManagerFromInitializer,
  setupFilterBypass as setupFilterBypassFromInitializer,
  setupPatchBrowser as setupPatchBrowserFromInitializer,
  setupUndoRedo as setupUndoRedoFromInitializer
} from './uiInitializer.js';
import { AudioEngine, setParamSmooth } from './core/engine.js';
import { compilePanelBlueprintMappings } from './core/blueprintMapper.js';
import { getOrCreateOscState, applyOscStateImmediate } from './core/oscillatorState.js';
import { DormancyManager } from './core/dormancyManager.js';
import { sessionManager } from './state/sessionManager.js';
import { undoRedoManager } from './state/undoRedoManager.js';
import { safeDisconnect, attachProcessorErrorHandler } from './utils/audio.js';
import { createLogger } from './utils/logger.js';
import { VOLTAGE_DEFAULTS, DIGITAL_TO_VOLTAGE, KNOB_POT_MAX_VOLTAGE, digitalToVoltage, voltageToDigital, createSoftClipCurve, createHybridClipCurve, calculateMatrixPinGain, PIN_RESISTANCES, STANDARD_FEEDBACK_RESISTANCE, createPinFilter, updatePinFilter, PIN_CUTOFF_FREQUENCIES } from './utils/voltageConstants.js';
import { dialToFrequency } from './state/conversions.js';

const log = createLogger('App');
import { RecordingEngine } from './core/recordingEngine.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputChannelsPanel } from './modules/outputChannel.js';
import { NoiseModule } from './modules/noise.js';
import { RandomCVModule } from './modules/randomCV.js';
import { KeyboardModule } from './modules/keyboard.js';
import { JoystickModule } from './modules/joystick.js';
import { InputAmplifierModule } from './modules/inputAmplifier.js';
import { SynthiFilterModule } from './modules/synthiFilter.js';
import { SpringReverbModule } from './modules/springReverb.js';
import { RingModulatorModule } from './modules/ringModulator.js';
import { EnvelopeShaperModule } from './modules/envelopeShaper.js';
import { SequencerModule } from './modules/sequencerModule.js';
import { PitchToVoltageConverterModule } from './modules/pitchToVoltageConverter.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { getSharedTooltip } from './ui/matrixTooltip.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';
import { NoiseGenerator } from './ui/noiseGenerator.js';
import { RandomVoltage } from './ui/randomVoltage.js';
import { InputAmplifierUI } from './ui/inputAmplifierUI.js';
import { Panel1FilterUI } from './ui/panel1Filter.js';
import { Panel1ReverbUI } from './ui/panel1Reverb.js';
import { Panel1RingModUI } from './ui/panel1RingMod.js';
import { KNOB_YELLOW, KNOB_WHITE, KNOB_BLUE, KNOB_RED, KNOB_GREEN, KNOB_BLACK } from './configs/knobColors.js';

/** Mapa de nombre de color (string) → valor hex importado. Usado por todos los builders de panel. */
const COLOR_MAP = {
  blue: KNOB_BLUE,
  red: KNOB_RED,
  yellow: KNOB_YELLOW,
  white: KNOB_WHITE,
  green: KNOB_GREEN,
  black: KNOB_BLACK
};

// Blueprints (estructura visual y ruteo)
import panel1Blueprint from './panelBlueprints/panel1.blueprint.js';
import panel2Blueprint from './panelBlueprints/panel2.blueprint.js';
import panel3Blueprint from './panelBlueprints/panel3.blueprint.js';
import panel4Blueprint from './panelBlueprints/panel4.blueprint.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';
import panel7Blueprint from './panelBlueprints/panel7.blueprint.js';

// Configs de módulos (parámetros de audio)
import {
  oscillatorConfig,
  noiseConfig,
  randomVoltageConfig,
  filterConfig,
  keyboardConfig,
  oscilloscopeConfig,
  inputAmplifierConfig,
  outputChannelConfig,
  audioMatrixConfig,
  controlMatrixConfig,
  joystickConfig,
  reverberationConfig,
  ringModulatorConfig,
  envelopeShaperConfig,
  sequencerConfig as sequencerModuleConfig,
  pitchToVoltageConverterConfig
} from './configs/index.js';

// Osciloscopio
import { OscilloscopeModule } from './modules/oscilloscope.js';
import { OscilloscopeDisplay } from './ui/oscilloscopeDisplay.js';

// UI Components reutilizables
import { ModuleFrame } from './ui/moduleFrame.js';
import { Toggle } from './ui/toggle.js';
import { RotarySwitch } from './ui/rotarySwitch.js';
import { Voltmeter } from './ui/voltmeter.js';
import { Knob } from './ui/knob.js';
import { createKnob } from './ui/knobFactory.js';
import { createVernierElements, VernierKnob } from './ui/vernierKnob.js';
import { registerTooltipHideCallback, hideOtherTooltips, attachControlTooltip } from './ui/tooltipManager.js';

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
import { RecordingOverlay } from './ui/recordingOverlay.js';
import { SettingsModal } from './ui/settingsModal.js';
import { PatchBrowser } from './ui/patchBrowser.js';
import { ConfirmDialog } from './ui/confirmDialog.js';
import { triggerEasterEgg, initEasterEggTrigger } from './ui/easterEgg.js';
import { initPortraitBlocker } from './ui/portraitBlocker.js';
import { initPipManager, restorePipState, clearRememberedPipConfigs } from './ui/pipManager.js';
import { initKeyboardWindow } from './ui/keyboardWindow.js';
import { initPanelNotes } from './ui/panelNotes.js';
import { initElectronMenuBridge } from './ui/electronMenuBridge.js';
import { showToast } from './ui/toast.js';
import { labelPanelSlot, getOscillatorLayoutSpec, resolveOscillatorUI, getNoiseUIDefaults, getRandomCVUIDefaults, resolveModuleUI } from './ui/layoutHelpers.js';
import { initI18n, t } from './i18n/index.js';
import { registerServiceWorker } from './utils/serviceWorker.js';
import { detectBuildVersion } from './utils/buildVersion.js';
import { WakeLockManager } from './utils/wakeLock.js';
import { initErrorHandler } from './utils/errorHandler.js';
import { init as initTelemetry, trackEvent as telemetryTrackEvent, setEnabled as telemetrySetEnabled } from './utils/telemetry.js';
import { perfMonitor } from './utils/perfMonitor.js';
import { STORAGE_KEYS, isMobileDevice } from './utils/constants.js';
import { initRenderMode } from './utils/gpuDetect.js';
import { getNoiseColourTooltipInfo, getNoiseLevelTooltipInfo, getRandomCVMeanTooltipInfo, getRandomCVVarianceTooltipInfo, getRandomCVVoltageLevelTooltipInfo, getRandomCVKeyTooltipInfo, getKeyboardPitchSpreadTooltipInfo, getKeyboardVelocityTooltipInfo, getKeyboardGateTooltipInfo, getFilterFrequencyTooltipInfo, getFilterResponseTooltipInfo, getFilterLevelTooltipInfo, getReverbMixTooltipInfo, getReverbLevelTooltipInfo, getRingModLevelTooltipInfo, getEnvelopeShaperTimeTooltipInfo, getEnvelopeShaperSustainTooltipInfo, getEnvelopeShaperEnvLevelTooltipInfo, getEnvelopeShaperSignalLevelTooltipInfo, getEnvelopeShaperModeTooltipInfo, getSequencerClockRateTooltipInfo, getSequencerVoltageLevelTooltipInfo, getSequencerKeyLevelTooltipInfo, getPVCRangeTooltipInfo, showVoltageTooltip, showAudioTooltip, formatGain, formatVoltage } from './utils/tooltipUtils.js';
import { initOSCLogWindow } from './ui/oscLogWindow.js';
import { oscBridge } from './osc/oscBridge.js';
import { oscillatorOSCSync } from './osc/oscOscillatorSync.js';
import { inputAmplifierOSCSync } from './osc/oscInputAmplifierSync.js';
import { outputChannelOSCSync } from './osc/oscOutputChannelSync.js';
import { noiseGeneratorOSCSync } from './osc/oscNoiseGeneratorSync.js';
import { randomCVOSCSync } from './osc/oscRandomCVSync.js';
import { keyboardOSCSync } from './osc/oscKeyboardSync.js';
import { joystickOSCSync } from './osc/oscJoystickSync.js';
import { matrixOSCSync } from './osc/oscMatrixSync.js';
import { reverbOSCSync } from './osc/oscReverbSync.js';
import { ringModOSCSync } from './osc/oscRingModSync.js';
import { envelopeShaperOSCSync } from './osc/oscEnvelopeShaperSync.js';
import { sequencerOSCSync } from './osc/oscSequencerSync.js';
import pvcOSCSync from './osc/oscPitchToVoltageConverterSync.js';
import { midiAccess } from './midi/midiAccess.js';
import { midiLearnManager } from './midi/midiLearnManager.js';
import { initMIDILearnOverlay } from './midi/midiLearnOverlay.js';
import { initGlowManager, flashGlow } from './ui/glowManager.js';
import { loadSvgInline } from './ui/svgInlineLoader.js';
import { SignalFlowHighlighter } from './ui/signalFlowHighlighter.js';
import { keyboardShortcuts } from './ui/keyboardShortcuts.js';

// ─────────────────────────────────────────────────────────────────────────────
// VISIBILIDAD DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────
//
// Aplica visibility:hidden + pointer-events:none a módulos marcados
// con visible:false en el blueprint. El módulo sigue ocupando su
// espacio en el layout (no se usa display:none), pero es invisible
// y no responde a clics ni hover.
//
function applyModuleVisibility(element, blueprint, moduleKey) {
  const mod = blueprint.modules?.[moduleKey];
  if (mod && mod.visible === false) {
    element.style.visibility = 'hidden';
    element.style.pointerEvents = 'none';
  }
}

const JOYSTICK_MAX_OUTPUT_VOLTAGE = 8;

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this._panel3Audio = { nodes: [] };
    this._panel3Routing = { connections: {}, rowMap: null, colMap: null };
    this.placeholderPanels = {};
    
    // Si "Iniciar con audio" está desactivado, deshabilitar DSP al arrancar
    const dspStartEnabled = localStorage.getItem(STORAGE_KEYS.DSP_START_ENABLED);
    if (dspStartEnabled === 'false') {
      this.engine.dspEnabled = false;
      localStorage.setItem(STORAGE_KEYS.DSP_ENABLED, 'false');
    }
    
    // Configurar sessionManager con callbacks
    sessionManager.setSerializeCallback(() => this._serializeCurrentState());
    sessionManager.setRestoreCallback((patch) => this._applyPatch(patch));
    
    // Configurar undo/redo manager (se inicializa después de crear los módulos)
    // La inicialización real ocurre en _setupUndoRedo()

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
    // Paneles con fondo inline desactivado: 1, 2 y 4.
    // injectInlinePanelSvgBackground('panel-1', './assets/panels/panel1_bg.svg');
    // injectInlinePanelSvgBackground('panel-2', './assets/panels/panel2_bg.svg');
    injectInlinePanelSvgBackground('panel-3', './assets/panels/panel_3.svg');
    // injectInlinePanelSvgBackground('panel-4', './assets/panels/panel4_bg.svg');
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');

    // Canvas: pinta fondos de panel-1/2/3/4 para evitar lagunas en móvil.
    preloadCanvasBgImages();
    this._canvasBgRenderScheduled = false;
    this._scheduleCanvasBackgroundRender();

    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });

    // Fondos JPG temporales (eliminar línea correspondiente al migrar a SVG).
    setPanelImageBackground('panel-1', './assets/panels/panel_1.jpg');
    setPanelImageBackground('panel-2', './assets/panels/panel_2.jpg');
    // Panel 3 vuelve a SVG inline para respetar la Microgramma original.
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
    this._envelopeShaperUIs = {};
    this._envelopeShaperModules = [];
    this._panel1FilterUIs = {};
    this._panel1FilterModules = {};
    this._panel1ReverbUI = null;
    this._panel1ReverbModule = null;
    this._panel1RingModUIs = {};
    this._panel1RingModModules = [];
    this._inputAmplifierUIs = {};
    this._outputFadersModule = null;
    this._sequencerModule = null;       // Single SequencerModule instance
    this._sequencerKnobs = {};          // { voltageA: knobInstance, ..., key4: knobInstance }
    this._sequencerDisplayUpdate = null; // 7-segment display update function
    this._keyboardModules = {};    // { upper: KeyboardModule, lower: KeyboardModule }
    this._keyboardKnobs = {};      // { upper: { pitchSpread, velocityLevel, gateLevel }, lower: ... }
    this._pvcModule = null;        // PitchToVoltageConverterModule instance
    this._pvcKnobs = {};           // { range: knobInstance }
    
    // Construir paneles
    this._buildPanel1();  // Filtros, Envelopes, RM, Reverb, Echo
    this._buildPanel2();  // Osciloscopio
    this._buildOscillatorPanel(3, this.panel3, this._panel3Audio);
    this._buildPanel4();  // Voltímetros, Sequencer Display, Keyboard Output Range
    
    this._setupOutputFaders();
    this._buildLargeMatrices();
    this._setupPanel5AudioRouting();
    this._setupPanel6ControlRouting();
    this._initSignalFlowHighlighter();
    this._setupUI();
    this._schedulePanelSync();
    
    // Inicializar sincronización OSC para osciladores (Panel 3)
    oscillatorOSCSync.init(this);
    // Inicializar sincronización OSC para otros módulos
    inputAmplifierOSCSync.init(this);
    outputChannelOSCSync.init(this);
    noiseGeneratorOSCSync.init(this);
    randomCVOSCSync.init(this);
    keyboardOSCSync.init(this);
    joystickOSCSync.init(this);
    reverbOSCSync.init(this);
    ringModOSCSync.init(this);
    envelopeShaperOSCSync.init(this);
    sequencerOSCSync.init(this);
    pvcOSCSync.init(this);
    // Inicializar sincronización OSC para matrices (Panel 5 audio + Panel 6 control)
    matrixOSCSync.init(this);

    // Inicializar sistema MIDI Learn
    midiAccess.init().then((success) => {
      if (success) {
        midiLearnManager.init(this);
        midiLearnManager.applyVisualIndicators();
        log.info(`MIDI Learn inicializado — ${midiAccess.getInputs().length} dispositivo(s)`);
        // Sincronizar estado MIDI al menú Electron
        document.dispatchEvent(new CustomEvent('midi:devicesChanged', {
          detail: { count: midiAccess.getInputs().length }
        }));
        document.dispatchEvent(new CustomEvent('midi:mappingChanged'));
      } else {
        log.warn('MIDI no disponible — MIDI Learn funcionará cuando haya acceso');
        // Registrar igualmente para que si el usuario reintenta funcione
        midiLearnManager.init(this);
      }
    }).catch(err => {
      log.error('Error inicializando MIDI:', err);
    });
    initMIDILearnOverlay();

    // Escuchar eventos MIDI desde menú Electron
    document.addEventListener('midi:toggleEnabled', (e) => {
      midiLearnManager.setEnabled(e.detail?.enabled ?? true);
    });
    document.addEventListener('midi:clearAll', () => {
      midiLearnManager.clearAllMappings();
    });
    document.addEventListener('midi:export', () => {
      midiLearnManager.downloadMappings();
    });
    document.addEventListener('midi:import', () => {
      midiLearnManager.uploadMappings();
    });

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
  async ensureAudio() { return ensureAudio(this); }
  
  /**
   * Restaura la salida multicanal si estaba guardada en preferencias.
   * Debe llamarse después de que el AudioContext esté listo.
   */
  async _restoreMultichannelIfSaved() { return restoreMultichannelIfSaved(this); }

  _setupOutputFaders() { setupOutputFaders(this); }

    _formatSignedValue(value, decimals = 2) {
      const abs = Math.abs(value).toFixed(decimals);
      if (Object.is(value, -0) || value < 0) return `-${abs}`;
      if (value > 0) return `+${abs}`;
      return abs;
    }

    _getJoystickAxisSnapshot(module, axis) {
      const isX = axis === 'x';
      const padGain = isX ? module.getX() : module.getY();
      const rangeDial = isX ? module.getRangeX() : module.getRangeY();
      const rangeGain = Math.max(0, Math.min(1, rangeDial / 10));
      const outputVoltage = padGain * rangeGain * JOYSTICK_MAX_OUTPUT_VOLTAGE;
      return { padGain, rangeDial, rangeGain, outputVoltage };
    }

    _getJoystickRangeTooltipInfo(module, axis) {
      const axisLabel = axis.toUpperCase();
      return () => {
        const parts = [];
        const state = this._getJoystickAxisSnapshot(module, axis);

        if (showVoltageTooltip()) {
          parts.push(`${axisLabel} out: ${formatVoltage(state.outputVoltage, 2)}`);
        }

        if (showAudioTooltip()) {
          parts.push(`Range ${formatGain(state.rangeGain)}`);
          parts.push(`Pad ×${this._formatSignedValue(state.padGain, 2)}`);
        }

        return parts.length > 0 ? parts.join(' · ') : null;
      };
    }

    _getJoystickPadTooltipContent(module) {
      const x = this._getJoystickAxisSnapshot(module, 'x');
      const y = this._getJoystickAxisSnapshot(module, 'y');
      const showVoltage = showVoltageTooltip();
      const showAudio = showAudioTooltip();

      const mainText = showVoltage
        ? `X ${formatVoltage(x.outputVoltage, 2)} · Y ${formatVoltage(y.outputVoltage, 2)}`
        : `X ×${this._formatSignedValue(x.padGain, 2)} · Y ×${this._formatSignedValue(y.padGain, 2)}`;

      const infoParts = [];
      if (showAudio) {
        infoParts.push(`Range X ${formatGain(x.rangeGain)} · Range Y ${formatGain(y.rangeGain)}`);
        infoParts.push(`Pad X ×${this._formatSignedValue(x.padGain, 2)} · Pad Y ×${this._formatSignedValue(y.padGain, 2)}`);
      }

      if (infoParts.length > 0) {
        return `<div class="knob-tooltip__main">${mainText}</div><div class="knob-tooltip__info">${infoParts.join('<br>')}</div>`;
      }

      return `<div class="knob-tooltip__main">${mainText}</div>`;
    }

  /**
   * Configura la interacción de puntero en un pad de joystick.
   * Convierte eventos de puntero en posición normalizada (-1..+1)
   * y actualiza el módulo de audio correspondiente.
   *
   * @param {HTMLElement} padEl - Elemento del pad
   * @param {JoystickModule} module - Módulo de audio asociado
   * @param {number} joyIndex - Índice del joystick (0=left, 1=right)
   * @private
   */
  _setupJoystickPad(padEl, module, joyIndex = 0) { return setupJoystickPad(padEl, module, joyIndex, this); }

  _setupUI() {
    setupUIFromInitializer(this);
  }

  /**
   * Configura el modal de ajustes de audio del sistema.
   * Permite rutear las 8 salidas lógicas hacia N canales físicos del sistema.
   * Soporta configuraciones multicanal (estéreo, 5.1, 7.1, etc.)
   * También permite rutear las entradas del sistema hacia los 8 Input Amplifiers.
   */
  _setupAudioSettingsModal() {
    setupAudioSettingsModalFromInitializer(this);
  }
  
  /**
   * Configura el navegador de patches para guardar/cargar estados.
   */
  _setupPatchBrowser() {
    setupPatchBrowserFromInitializer(this);
  }
  
  /**
   * Configura el sistema de undo/redo.
   * Se inicializa al final del setup, cuando todos los módulos están listos.
   */
  _setupUndoRedo() {
    setupUndoRedoFromInitializer(this);
  }
  
  /**
   * Serializa el estado actual del sintetizador a un objeto de patch.
   * @returns {Object} Objeto con el estado de todos los módulos
   * @see stateSerializer.js
   */
  _serializeCurrentState() {
    return serializeCurrentState(this);
  }


  /**
   * Aplica un patch cargado al sintetizador.
   * @param {Object} patchData - Datos del patch a aplicar
   * @see stateSerializer.js
   */
  async _applyPatch(patchData) {
    return applyPatchFromSerializer(patchData, this);
  }
  
  /**
   * Resetea todos los módulos a sus valores por defecto.
   * Itera directamente por los módulos existentes en lugar de usar un patch.
   */
  async _resetToDefaults() { return resetToDefaults(this); }
  
  // ─────────────────────────────────────────────────────────────────────────
  // REINICIO CONTEXTUAL (panel, módulo o control individual)
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Valores por defecto por tipo de módulo, extraídos de los configs (fuente única de verdad) */
  get _defaultValues() {
    // Oscilador: extraer initial de cada knob en el orden esperado por serialize/deserialize
    const oscKnobs = oscillatorConfig.defaults.knobs;
    const oscKnobOrder = ['pulseLevel', 'pulseWidth', 'sineLevel', 'sineSymmetry', 'triangleLevel', 'sawtoothLevel', 'frequency'];
    const oscRangeState = oscillatorConfig.defaults.switches?.range?.initial ?? 'hi';

    // Noise: los dos generadores son idénticos, usar noise1 como referencia
    const noiseKnobs = noiseConfig.noise1.knobs;

    // Random voltage
    const rvKnobs = randomVoltageConfig.knobs;

    // Filters
    const filterKnobs = filterConfig.knobs;

    // Input amplifiers
    const iaKnobs = inputAmplifierConfig.knobs;
    const iaCount = inputAmplifierConfig.count;

    // Output channels
    const ocKnobs = outputChannelConfig.knobs;
    const ocFaders = outputChannelConfig.faders;
    const ocSwitches = outputChannelConfig.switches;
    const ocCount = outputChannelConfig.count;

    // Oscilloscope
    const scopeKnobs = oscilloscopeConfig.knobs;
    const scopeInitialMode = oscilloscopeConfig.audio.mode === 'xy' ? 'b' : 'a';

    return {
      oscillator: {
        knobs: oscKnobOrder.map(name => oscKnobs[name].initial),
        rangeState: oscRangeState
      },
      oscilloscope: {
        timeScale: scopeKnobs.timeScale.initial,
        ampScale: scopeKnobs.ampScale.initial,
        triggerLevel: scopeKnobs.triggerLevel.initial,
        mode: scopeInitialMode
      },
      noise: {
        colour: noiseKnobs.colour.initial,
        level: noiseKnobs.level.initial
      },
      randomVoltage: {
        mean: rvKnobs.mean.initial,
        variance: rvKnobs.variance.initial,
        voltage1: rvKnobs.voltage1.initial,
        voltage2: rvKnobs.voltage2.initial,
        key: rvKnobs.key.initial
      },
      envelopeShaper: {
        mode: envelopeShaperConfig.knobs.mode.initial,
        delay: envelopeShaperConfig.knobs.delay.initial,
        attack: envelopeShaperConfig.knobs.attack.initial,
        decay: envelopeShaperConfig.knobs.decay.initial,
        sustain: envelopeShaperConfig.knobs.sustain.initial,
        release: envelopeShaperConfig.knobs.release.initial,
        envelopeLevel: envelopeShaperConfig.knobs.envelopeLevel.initial,
        signalLevel: envelopeShaperConfig.knobs.signalLevel.initial
      },
      filters: {
        frequency: filterKnobs.frequency.initial,
        response: filterKnobs.response.initial,
        level: filterKnobs.level.initial
      },
      keyboard: {
        pitchSpread: keyboardConfig.knobs.pitchSpread.initial,
        pitchOffset: keyboardConfig.knobs.pitchOffset.initial,
        velocityLevel: keyboardConfig.knobs.velocityLevel.initial,
        gateLevel: keyboardConfig.knobs.gateLevel.initial,
        retrigger: keyboardConfig.switches.retrigger.initial
      },
      pitchToVoltageConverter: {
        range: pitchToVoltageConverterConfig.knobs.range.initial
      },
      inputAmplifiers: {
        levels: Array(iaCount).fill(iaKnobs.level.initial)
      },
      outputChannels: {
        channels: Array(ocCount).fill(null).map(() => ({
          level: ocFaders.level.initial,
          filter: ocKnobs.filter.initial,
          pan: ocKnobs.pan.initial,
          power: ocSwitches.power.initial
        }))
      }
    };
  }
  
  /**
   * Mapeo de panelId → módulos contenidos.
   * Devuelve un array de {type, id, ui} para cada módulo del panel.
   * @param {string} panelId
   * @returns {Array<{type: string, id: string, ui: Object}>}
   */
  _getModulesForPanel(panelId) { return getModulesForPanel(panelId, this); }
  
  /**
   * Busca un módulo UI por su ID de DOM.
   * @param {string} moduleId - ID del elemento DOM del módulo
   * @returns {{ type: string, ui: Object } | null}
   */
  _findModuleById(moduleId) { return findModuleById(moduleId, this); }
  
  /**
   * Reinicia un módulo individual a sus valores por defecto.
   * @param {string} type - Tipo de módulo
   * @param {Object} ui - Instancia UI del módulo
   */
  _resetModule(type, ui) { return resetModule(type, ui, this); }

  /**
   * Resetea los knobs y switches del teclado UI a sus valores por defecto.
   * @param {string} side - 'upper' o 'lower'
   */
  _resetKeyboardKnobs(side) {
    const knobRefs = this._keyboardKnobs?.[side];
    if (!knobRefs) return;
    const kbKnobs = keyboardConfig.knobs;
    if (knobRefs.pitchSpread) {
      knobRefs.pitchSpread.setValue(kbKnobs.pitchSpread.initial / (kbKnobs.pitchSpread.max ?? 10));
    }
    if (knobRefs.velocityLevel) {
      const vl = kbKnobs.velocityLevel;
      knobRefs.velocityLevel.setValue((vl.initial - (vl.min ?? -5)) / ((vl.max ?? 5) - (vl.min ?? -5)));
    }
    if (knobRefs.gateLevel) {
      const gl = kbKnobs.gateLevel;
      knobRefs.gateLevel.setValue((gl.initial - (gl.min ?? -5)) / ((gl.max ?? 5) - (gl.min ?? -5)));
    }
    if (knobRefs.retrigger) {
      const rtrInitial = keyboardConfig.switches?.retrigger?.initial ?? 0;
      knobRefs.retrigger.setState(rtrInitial === 1 ? 'a' : 'b');
    }
  }
  
  /**
   * Reinicia un control individual (knob, slider o switch) a su valor por defecto.
   * @param {string} moduleId - ID del módulo
   * @param {number} knobIndex - Índice del knob en el módulo (-1 para output channels)
   * @param {Object} [extra] - Info adicional (controlType, controlKey para output channels)
   */
  _resetControl(moduleId, knobIndex, extra = {}) {
    const found = this._findModuleById(moduleId);
    if (!found) return;
    
    const { type, ui } = found;
    const { controlType, controlKey } = extra;
    
    // Output channel individual: manejar slider, knobs y switch
    if (type === 'outputChannel') {
      const defaults = this._defaultValues;
      const chDefaults = defaults.outputChannels.channels[0];
      
      if (controlType === 'slider') {
        ui.deserialize({ level: chDefaults.level });
      } else if (controlType === 'knob' && controlKey) {
        // filter o pan
        ui.deserialize({ [controlKey]: chDefaults[controlKey] });
      } else if (controlType === 'switch') {
        ui.deserialize({ power: chDefaults.power });
      }
      return;
    }

    // Osciloscopio: knobs individuales o toggle
    if (type === 'oscilloscope') {
      const { timeKnob, ampKnob, levelKnob, modeToggle, display, scopeModule } = ui;
      const scopeDefaults = this._defaultValues.oscilloscope;
      const scopeKnobMap = { 0: timeKnob, 1: ampKnob, 2: levelKnob };
      if (controlType === 'toggle' || controlType === 'switch') {
        if (modeToggle) {
          modeToggle.setState(scopeDefaults.mode);
          const mode = scopeDefaults.mode === 'a' ? 'yt' : 'xy';
          if (display) display.setMode(mode);
          if (scopeModule?.setMode) scopeModule.setMode(mode);
        }
      } else if (scopeKnobMap[knobIndex]?.knobInstance) {
        scopeKnobMap[knobIndex].knobInstance.resetToDefault();
      }
      return;
    }

    // Joystick: knob (rangeX/rangeY) o pad (posición)
    if (type === 'joystick') {
      const { module, knobs, padEl, config } = ui;
      if (controlType === 'pad') {
        const wasAtOrigin = module.getX() === 0 && module.getY() === 0;
        module.setPosition(0, 0);
        if (padEl?._joystickUpdateHandle) {
          padEl._joystickUpdateHandle(0, 0);
          if (!wasAtOrigin) flashGlow(padEl);
        }
      } else if (controlType === 'knob' && controlKey) {
        const defVal = config?.knobs?.[controlKey]?.initial ?? 0;
        const max = config?.knobs?.[controlKey]?.max || 10;
        if (controlKey === 'rangeX') module.setRangeX(defVal);
        else if (controlKey === 'rangeY') module.setRangeY(defVal);
        if (knobs?.[controlKey]?.knobInstance) knobs[controlKey].knobInstance.setValue(defVal / max);
      }
      return;
    }
    
    // Oscilador: knobs en array
    if (type === 'oscillator') {
      const knob = ui.knobs[knobIndex];
      if (knob && typeof knob.resetToDefault === 'function') {
        knob.resetToDefault();
      }
      return;
    }

    // Sequencer: knob o switch individual
    if (type === 'sequencer') {
      if (controlType === 'knob' && controlKey && this._sequencerKnobs[controlKey]) {
        this._sequencerKnobs[controlKey].resetToDefault();
      } else if (controlType === 'switch' && controlKey) {
        const defaultState = controlKey === 'runClock';
        this._sequencerSwitchUIs?.[controlKey]?.setState(defaultState);
        this._sequencerModule?.setSwitch(controlKey, defaultState);
      }
      return;
    }

    // Keyboard: knob individual
    if (type === 'keyboard') {
      if (controlType === 'knob' && controlKey) {
        const side = moduleId.includes('upper') || moduleId === 'keyboard-upper' ? 'upper' : 'lower';
        const knobRef = this._keyboardKnobs[side]?.[controlKey];
        if (knobRef && typeof knobRef.resetToDefault === 'function') {
          knobRef.resetToDefault();
        }
      }
      return;
    }

    // PVC: knob individual
    if (type === 'pitchToVoltageConverter') {
      if (controlType === 'knob' && controlKey) {
        const knobRef = this._pvcKnobs[controlKey];
        if (knobRef && typeof knobRef.resetToDefault === 'function') {
          knobRef.resetToDefault();
        }
      }
      return;
    }
    
    // ModuleUI (noise, random voltage, etc.): knobs es un objeto keyed
    if (ui.knobs && typeof ui.knobs === 'object') {
      const knobKeys = Object.keys(ui.knobs);
      const key = knobKeys[knobIndex];
      if (key && ui.knobs[key] && typeof ui.knobs[key].resetToDefault === 'function') {
        ui.knobs[key].resetToDefault();
      }
    }
  }
  
  /**
   * Maneja un evento de reinicio contextual (panel, módulo o control).
   * @param {Object} detail - Detalle del evento synth:resetContext
   * @param {'panel'|'module'|'control'} detail.level - Nivel de reinicio
   * @param {string} detail.panelId - ID del panel
   * @param {string} [detail.moduleId] - ID del módulo (para module/control)
   * @param {number} [detail.knobIndex] - Índice del knob (para control)
   */
  _handleContextReset(detail) {
    const { level, panelId, moduleId, knobIndex, controlType, controlKey } = detail;
    
    log.info(`Context reset: level=${level}, panel=${panelId}, module=${moduleId}, knob=${knobIndex}, controlType=${controlType}`);
    
    // Deshabilitar tracking de cambios durante el reset
    sessionManager.applyingPatch(true);
    
    try {
      switch (level) {
        case 'panel': {
          const modules = this._getModulesForPanel(panelId);
          log.info(`Context reset panel '${panelId}': ${modules.length} modules [${modules.map(m => m.type).join(', ')}]`);
          for (const mod of modules) {
            try {
              this._resetModule(mod.type, mod.ui);
            } catch (err) {
              log.error(`Error resetting module ${mod.type} (${mod.id}):`, err);
            }
          }
          break;
        }
        case 'module': {
          const found = this._findModuleById(moduleId);
          if (found) {
            this._resetModule(found.type, found.ui);
          }
          break;
        }
        case 'control': {
          this._resetControl(moduleId, knobIndex, { controlType, controlKey });
          break;
        }
      }
    } catch (err) {
      log.error('Error in context reset:', err);
    } finally {
      // Rehabilitar tracking de cambios
      sessionManager.applyingPatch(false);
      
      // Forzar actualización de dormancy
      this.dormancyManager?.flushPendingUpdate();
    }
  }
  
  /**
   * Configura el sistema de grabación de audio WAV.
   * Crea el RecordingEngine, el modal de configuración, y los event listeners.
   */
  _setupRecording() {
    setupRecordingFromInitializer(this);
  }
  
  /**
   * Configura el modal de ajustes generales con pestañas.
   * Se llama después de _setupRecording para tener acceso a todos los modales.
   */
  _setupSettingsModal() {
    setupSettingsModalFromInitializer(this);
  }
  
  /**
   * Configura el DormancyManager para optimización de rendimiento.
   * Desactiva automáticamente módulos sin conexiones en la matriz.
   */
  _setupDormancyManager() {
    setupDormancyManagerFromInitializer(this);
  }
  
  /**
   * Configura los listeners para el Filter Bypass optimization.
   * Desconecta filtros cuando están en posición neutral para ahorrar CPU.
   */
  _setupFilterBypass() {
    setupFilterBypassFromInitializer(this);
  }
  
  /**
   * Dispara la lógica de restauración del estado previo.
   * Debe llamarse DESPUÉS de que el splash haya terminado.
   * Espera a que el worklet esté listo antes de restaurar.
   */
  async triggerRestoreLastState() {
    try {
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
    } catch (err) {
      log.error('Error al restaurar estado previo:', err);
      showToast(t('toast.restoreError', 'Error al restaurar estado previo'), { level: 'error', duration: 3000 });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 1 - FILTROS, ENVELOPE SHAPERS, RING MODULATORS, REVERB, ECHO
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPanel1() {
    buildPanel1(this);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 4 - VOLTÍMETROS, SEQUENCER DISPLAY, KEYBOARD OUTPUT RANGE
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPanel4() { buildPanel4(this); }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 2 - OSCILOSCOPIO
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPanel2() {
    buildPanel2(this);
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
  async _ensureSystemAudioInput(deviceId = null) { return ensureSystemAudioInput(this, deviceId); }

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
  async _activateMultichannelOutput() { return activateMultichannelOutput(this); }
  
  /**
   * Fallback a ScriptProcessor si AudioWorklet no está disponible.
   * @private
   */
  async _activateMultichannelOutputFallback() { return activateMultichannelOutputFallback(this); }

  /**
   * Desactiva la salida multicanal y restaura la salida normal.
   */
  async _deactivateMultichannelOutput() { return deactivateMultichannelOutput(this); }

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
  async _activateMultichannelInput() { return activateMultichannelInput(this); }

  /**
   * Desactiva la entrada multicanal nativa.
   */
  async _deactivateMultichannelInput() { return deactivateMultichannelInput(this); }

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
  _buildOscillatorPanel(panelIndex, panel, panelAudio) { buildOscillatorPanel(panelIndex, panel, panelAudio, this); }

  /**
   * Reflow unificado para paneles de osciladores.
   */
  _reflowOscillatorPanel(panelIndex) { reflowOscillatorPanel(panelIndex, this); }

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

  _ensurePanelNodes(panelIndex, oscIndex) { return ensurePanelNodes(panelIndex, oscIndex, this); }

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

  _getPanelKnobOptions(panelIndex, oscIndex) { return getPanelKnobOptions(panelIndex, oscIndex, this); }

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
  _getPanel5PinGain(rowIndex, colIndex) { return getPanel5PinGain(rowIndex, colIndex, this); }

  _setupPanel5AudioRouting() {
    setupAudioRouting(this);
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

  async _handlePanel5AudioToggle(rowIndex, colIndex, activate, pinColor = null) { return handlePanel5AudioToggle(rowIndex, colIndex, activate, pinColor, this); }

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
   * Comprueba si hay alguna conexión PWM CV activa en la matriz de audio (Panel 5)
   * para un oscilador específico.
   * @param {number} oscIndex - Índice 0-based del oscilador
   * @returns {boolean}
   */
  _hasOscillatorPWMCV(oscIndex) {
    const routing = this._panel3Routing;
    if (!routing?.connections || !routing?.destMap) {
      return false;
    }
    
    for (const key of Object.keys(routing.connections)) {
      const colIndex = parseInt(key.split(':')[1], 10);
      const dest = routing.destMap.get(colIndex);
      
      if (dest?.kind === 'oscPWM' && dest?.oscIndex === oscIndex) {
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
    setupControlRouting(this);
  }

  /**
   * Inicializa el resaltador de flujo de señal.
   * Lee la tecla configurada desde shortcuts y escucha cambios de configuración.
   */
  _initSignalFlowHighlighter() { initSignalFlowHighlighter(this); }

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
  _getPanel6PinGain(rowIndex, colIndex) { return getPanel6PinGain(rowIndex, colIndex, this); }

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
  async _handlePanel6ControlToggle(rowIndex, colIndex, activate, pinColor = null) { return handlePanel6ControlToggle(rowIndex, colIndex, activate, pinColor, this); }

  _buildLargeMatrices() { buildLargeMatrices(this); }

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
      this._scheduleCanvasBackgroundRender();
    });
  }

  _scheduleCanvasBackgroundRender() {
    if (this._canvasBgRenderScheduled) return;
    this._canvasBgRenderScheduled = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._canvasBgRenderScheduled = false;
        renderCanvasBgPanels();
      });
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
const SPLASH_MIN_DISPLAY_MS = 2000;

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
    
    // Forzar siempre la vista general: el canvas principal queda fijo y auto-ajustado.
    if (typeof window.__synthAnimateToPanel === 'function') {
      window.__synthAnimateToPanel(null, 0);
    }
    
    // Disparar la pregunta de restaurar estado DESPUÉS de que el splash termine
    if (window._synthApp && window._synthApp.triggerRestoreLastState) {
      window._synthApp.triggerRestoreLastState();
    }
    
    // Mostrar diálogo de consentimiento de telemetría (solo en primer uso)
    showTelemetryConsentIfNeeded();
  }, 800);
}

/**
 * Muestra el diálogo de consentimiento de telemetría si es la primera vez.
 * Usa ConfirmDialog con rememberKey para no volver a preguntar.
 * No bloquea el uso de la app.
 */
async function showTelemetryConsentIfNeeded() {
  // Si ya se configuró telemetría (aceptó o rechazó), no preguntar
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TELEMETRY_ENABLED);
    if (stored !== null) return;
  } catch { /* ignore */ }
  
  // Pequeño delay para no solapar con el diálogo de restaurar sesión
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const result = await ConfirmDialog.show({
    title: t('telemetry.consent.title'),
    message: t('telemetry.consent.message'),
    confirmText: t('telemetry.consent.accept'),
    cancelText: t('telemetry.consent.decline')
  });
  
  telemetrySetEnabled(result.confirmed);
  
  if (result.confirmed) {
    telemetryTrackEvent('first_run');
  }
}

// ─── Instalar handlers globales de errores lo antes posible ───
initErrorHandler();

// ─── Inicializar telemetría (solo si el usuario dio consentimiento) ───
initTelemetry();

window.addEventListener('DOMContentLoaded', async () => {
  const splashStartTime = Date.now();
  const perfBootstrapId = perfMonitor.isEnabled()
    ? await perfMonitor.beginScenario('bootstrap', { phase: 'DOMContentLoaded' })
    : null;
  
  try {
    // Inicializar sistema de internacionalización antes de crear la UI
    await initI18n();
    
    // Traducir texto del splash (hardcodeado en HTML como fallback en español)
    const splashLoaderText = document.querySelector('.splash__loader-text');
    if (splashLoaderText) splashLoaderText.textContent = t('splash.loading');
    
    // Inicializar sistema de glow (halo brillante en controles)
    initGlowManager();
    
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
      window._synthApp.ensureAudio().catch((err) => {
        log.error('Error al inicializar audio:', err);
        showToast('Error al inicializar audio. Recarga la página.', { level: 'error', duration: 5000 });
        telemetryTrackEvent('audio_fail', { message: err?.message || String(err) });
      });
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

    // 🥚 Easter Egg — trigger: tap pad1,pad2 alternadamente ×4
    // Si el synth tiene parámetros modificados → solo visual, sin sonido
    initEasterEggTrigger({ isDirtyFn: () => sessionManager.isDirty(), markCleanFn: () => sessionManager.markClean() });
    window.egg = triggerEasterEgg; // debug: consola
    
    // Inicializar modo de renderizado (detección GPU + clase CSS)
    initRenderMode();
    
    // Inicializar navegación del viewport
    initViewportNavigation();
    
    // Inicializar sistema PiP (paneles flotantes)
    initPipManager();
    
    // Restaurar paneles PiP de sesión anterior
    restorePipState();
    
    // Inicializar ventana flotante de teclados
    initKeyboardWindow();
    
    // Inicializar notas post-it en paneles
    initPanelNotes();
    
    // Registrar service worker
    registerServiceWorker();
    
    // Configurar UI móvil y zoom de paneles
    setupMobileQuickActionsBar();
    setupPanelShortcutBadges();
    setupPanelDoubleTapZoom();

    // Inicializar puente de menú Electron (traducciones, estado, acciones IPC)
    // Solo se activa si estamos en Electron (window.menuAPI existe)
    initElectronMenuBridge();

    if (perfMonitor.isEnabled()) {
      perfMonitor.incrementCounter('app.bootstrap.success');
      perfMonitor.mark('app:initialized', {
        buildVersion: window.synthBuildVersion || null
      });
      await perfMonitor.captureSnapshot('post-app-init');
    }
  } catch (err) {
    // ─── Error crítico en bootstrap: mostrar mensaje y ocultar splash ───
    log.error('Error crítico durante la inicialización:', err);
    try {
      showToast('Error crítico al iniciar la aplicación. Recarga la página.', { level: 'error', duration: 10000 });
    } catch (_) {
      // Fallback: si ni el toast funciona, inyectar directamente en el DOM
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#c0392b;color:#fff;padding:24px;border-radius:8px;z-index:99999;font-size:18px;text-align:center;';
      msg.textContent = 'Error crítico al iniciar. Recarga la página.';
      document.body?.appendChild(msg);
    }

    if (perfMonitor.isEnabled()) {
      perfMonitor.incrementCounter('app.bootstrap.error');
      perfMonitor.mark('app:init-error', { message: err?.message || String(err) });
    }
  }
  
  // ─── Ocultar splash screen después de la inicialización ───
  // Garantiza un tiempo mínimo de visualización para evitar parpadeos
  // NOTA: se ejecuta siempre, incluso si hubo error (para que el splash no quede congelado)
  const elapsedTime = Date.now() - splashStartTime;
  const remainingTime = Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsedTime);
  
  if (remainingTime > 0) {
    // Esperar el tiempo restante para cumplir el mínimo
    setTimeout(hideSplashScreen, remainingTime);
  } else {
    // Ya pasó el tiempo mínimo, ocultar inmediatamente
    hideSplashScreen();
  }

  if (perfBootstrapId) {
    await perfMonitor.endScenario(perfBootstrapId, {
      splashMinDisplayMs: SPLASH_MIN_DISPLAY_MS,
      bootstrapWallClockMs: Date.now() - splashStartTime
    });
  }
});
