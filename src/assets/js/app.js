// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine, setParamSmooth, AUDIO_CONSTANTS } from './core/engine.js';
import { RecordingEngine } from './core/recordingEngine.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputFaderModule } from './modules/outputFaders.js';
import { NoiseModule } from './modules/noise.js';
import { InputAmplifierModule } from './modules/inputAmplifier.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';
import { NoiseGenerator } from './ui/noiseGenerator.js';
import { RandomVoltage } from './ui/randomVoltage.js';
import { InputAmplifierUI } from './ui/inputAmplifierUI.js';

// Blueprints (estructura visual y ruteo)
import panel2Blueprint from './panelBlueprints/panel2.blueprint.js';
import panel3Blueprint from './panelBlueprints/panel3.blueprint.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';

// Configs (parámetros de audio)
import panel2Config from './panelBlueprints/panel2.config.js';
import panel3Config from './panelBlueprints/panel3.config.js';
import panel5AudioConfig from './panelBlueprints/panel5.audio.config.js';
import panel6ControlConfig from './panelBlueprints/panel6.control.config.js';

// Osciloscopio
import { OscilloscopeModule } from './modules/oscilloscope.js';
import { OscilloscopeDisplay } from './ui/oscilloscopeDisplay.js';

// UI Components reutilizables
import { ModuleFrame } from './ui/moduleFrame.js';
import { Toggle } from './ui/toggle.js';
import { Knob } from './ui/knob.js';

// Utilidades de audio
import { createPulseWave, createAsymmetricSineWave } from './utils/waveforms.js';
import { deepMerge } from './utils/objects.js';

// Módulos extraídos
import { 
  preloadCanvasBgImages, 
  renderCanvasBgPanels, 
  injectInlinePanelSvgBackground 
} from './utils/canvasBackground.js';
import { 
  initViewportNavigation, 
  setupPanelZoomButtons, 
  setupPanelDoubleTapZoom 
} from './navigation/viewportNavigation.js';
import { setupMobileQuickActionsBar, ensureOrientationHint } from './ui/quickbar.js';
import { AudioSettingsModal } from './ui/audioSettingsModal.js';
import { RecordingSettingsModal } from './ui/recordingSettingsModal.js';
import { SettingsModal } from './ui/settingsModal.js';
import { PatchBrowser } from './ui/patchBrowser.js';
import { initI18n, t } from './i18n/index.js';
import { registerServiceWorker } from './utils/serviceWorker.js';
import { detectBuildVersion } from './utils/buildVersion.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bloqueador de orientación portrait
// ─────────────────────────────────────────────────────────────────────────────
let portraitBlockerDismissed = false;

function initPortraitBlocker() {
  const blocker = document.getElementById('portraitBlocker');
  if (!blocker) return;
  
  const closeBtn = blocker.querySelector('.portrait-blocker__close');
  
  closeBtn?.addEventListener('click', () => {
    portraitBlockerDismissed = true;
    blocker.classList.remove('portrait-blocker--visible');
    blocker.setAttribute('aria-hidden', 'true');
  });
  
  // Escuchar cambios de orientación
  const mq = window.matchMedia('(orientation: portrait)');
  
  const updateVisibility = () => {
    if (mq.matches && !portraitBlockerDismissed) {
      blocker.classList.add('portrait-blocker--visible');
      blocker.setAttribute('aria-hidden', 'false');
    } else {
      blocker.classList.remove('portrait-blocker--visible');
      blocker.setAttribute('aria-hidden', 'true');
    }
  };
  
  mq.addEventListener('change', updateVisibility);
  updateVisibility();
}

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this._panel3Audio = { nodes: [] };
    this._panel3Routing = { connections: {}, rowMap: null, colMap: null };
    this.placeholderPanels = {};
    
    // Paneles 1, 3, 4: SGME Oscillators. Panel 2: vacío/reservado para futuros módulos
    this.panel1 = this.panelManager.createPanel({ id: 'panel-1' });
    this._labelPanelSlot(this.panel1, null, { row: 1, col: 1 });
    this._panel1Audio = { nodes: [] };

    this.panel2 = this.panelManager.createPanel({ id: 'panel-2' });
    this._labelPanelSlot(this.panel2, null, { row: 1, col: 2 });

    this.panel3 = this.panelManager.createPanel({ id: 'panel-3' });
    this._labelPanelSlot(this.panel3, null, { row: 1, col: 3 });

    this.panel4 = this.panelManager.createPanel({ id: 'panel-4' });
    this._labelPanelSlot(this.panel4, null, { row: 1, col: 4 });
    this._panel4Audio = { nodes: [] };

    // Panel 5: matriz de audio
    this.panel5 = this.panelManager.createPanel({ id: 'panel-5' });
    this._labelPanelSlot(this.panel5, null, { row: 2, col: 1 });

    // Panel 6: matriz de control
    this.panel6 = this.panelManager.createPanel({ id: 'panel-6' });
    this._labelPanelSlot(this.panel6, null, { row: 2, col: 3 });

    // Fondo SVG inline (runtime) para mejorar nitidez bajo zoom.
    injectInlinePanelSvgBackground('panel-1', './assets/panels/panel1_bg.svg');
    injectInlinePanelSvgBackground('panel-2', './assets/panels/panel2_bg.svg');
    injectInlinePanelSvgBackground('panel-3', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-4', './assets/panels/panel4_bg.svg');
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');
        
    // Canvas: pinta fondos de panel-1/2/3/4 para evitar lagunas en móvil.
    preloadCanvasBgImages();
    renderCanvasBgPanels();

    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });
    this._labelPanelSlot(this.outputPanel, null, { row: 2, col: 4 });

    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
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
    this._buildOscillatorPanel(1, this.panel1, this._panel1Audio);
    this._buildPanel2();  // Osciloscopio
    this._buildOscillatorPanel(3, this.panel3, this._panel3Audio);
    this._buildOscillatorPanel(4, this.panel4, this._panel4Audio);
    
    this._setupOutputFaders();
    this._buildLargeMatrices();
    this._setupPanel5AudioRouting();
    this._setupUI();
    this._schedulePanelSync();

    // Resize handler con debounce
    let appResizeTimer = null;
    const runAppResizeWork = () => {
      this._schedulePanelSync();
      this._resizeLargeMatrices();
    };
    window.addEventListener('resize', () => {
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
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ESTADO DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────────

  _getOrCreateOscState(panelAudio, index) {
    panelAudio.state = panelAudio.state || [];
    let state = panelAudio.state[index];
    if (!state) {
      state = { freq: 10, oscLevel: 0, sawLevel: 0, triLevel: 0, pulseLevel: 0, pulseWidth: 0.5, sineSymmetry: 0.5 };
      panelAudio.state[index] = state;
    }
    return state;
  }

  _applyOscStateImmediate(node, state, ctx) {
    if (!node || !state || !ctx) return;
    const now = ctx.currentTime;

    // NOTA: Los try-catch en este método protegen contra estados inválidos
    // de AudioParam (nodo no iniciado, contexto cerrado, etc.). Se ignoran
    // porque el estado del oscilador se sincronizará en la siguiente operación.

    // Sine oscillator - puede ser worklet o nativo
    if (node.osc && Number.isFinite(state.freq)) {
      try {
        if (node._useWorklet && node.osc.setFrequency) {
          node.osc.setFrequency(state.freq);
        } else if (node.osc.frequency) {
          node.osc.frequency.cancelScheduledValues(now);
          node.osc.frequency.setValueAtTime(state.freq, now);
        }
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (node.sawOsc && node.sawOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.sawOsc.frequency.cancelScheduledValues(now);
        node.sawOsc.frequency.setValueAtTime(state.freq, now);
      } catch { /* AudioParam puede no estar listo */ }
    }

    if (node.gain && node.gain.gain && Number.isFinite(state.oscLevel)) {
      try {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(state.oscLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (node.sawGain && node.sawGain.gain && Number.isFinite(state.sawLevel)) {
      try {
        node.sawGain.gain.cancelScheduledValues(now);
        node.sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (node.triOsc && node.triOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.triOsc.frequency.cancelScheduledValues(now);
        node.triOsc.frequency.setValueAtTime(state.freq, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (node.triGain && node.triGain.gain && Number.isFinite(state.triLevel)) {
      try {
        node.triGain.gain.cancelScheduledValues(now);
        node.triGain.gain.setValueAtTime(state.triLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    // Pulse oscillator - puede ser worklet o nativo
    if (node.pulseOsc && Number.isFinite(state.freq)) {
      try {
        if (node._useWorklet && node.pulseOsc.setFrequency) {
          node.pulseOsc.setFrequency(state.freq);
        } else if (node.pulseOsc.frequency) {
          node.pulseOsc.frequency.cancelScheduledValues(now);
          node.pulseOsc.frequency.setValueAtTime(state.freq, now);
        }
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (node.pulseGain && node.pulseGain.gain && Number.isFinite(state.pulseLevel)) {
      try {
        node.pulseGain.gain.cancelScheduledValues(now);
        node.pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
  }

  ensureAudio() {
    this.engine.start();
    // Iniciar osciloscopio cuando haya audio
    this._ensurePanel2ScopeStarted();
  }

  _setupOutputFaders() {
    const outputFaders = new OutputFaderModule(this.engine, 'outputFaders');
    this.engine.addModule(outputFaders);
    outputFaders.createPanel(this.outputFadersRowEl);
    
    // Guardar referencia para serialización
    this._outputFadersModule = outputFaders;
  }

  _setupUI() {
    // Handler para mute global desde quickbar
    document.addEventListener('synth:toggleMute', () => {
      this.ensureAudio();
      this.engine.toggleMute();
      const muted = this.engine.muted;
      
      // Notificar a quickbar del nuevo estado
      document.dispatchEvent(new CustomEvent('synth:muteChanged', {
        detail: { muted }
      }));
      
      // Mostrar toast de feedback
      this._showToast(t(muted ? 'toast.mute' : 'toast.unmute'));
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
      // ─────────────────────────────────────────────────────────────────────────
      onOutputDeviceChange: async (deviceId) => {
        const result = await this.engine.setOutputDevice(deviceId);
        if (result.success) {
          console.log(`[App] Output device changed. Channels: ${result.channels}`);
          // La notificación de canales se hace a través del callback registrado abajo
        }
      },
      
      // ─────────────────────────────────────────────────────────────────────────
      // CALLBACK DE CAMBIO DE DISPOSITIVO DE ENTRADA
      // ─────────────────────────────────────────────────────────────────────────
      // Reconecta el audio del sistema con el nuevo dispositivo seleccionado.
      // Detecta el número de canales de entrada y actualiza la matriz.
      // ─────────────────────────────────────────────────────────────────────────
      onInputDeviceChange: async (deviceId) => {
        console.log('[App] Input device selected:', deviceId);
        await this._reconnectSystemAudioInput(deviceId);
      }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // REGISTRAR CALLBACK PARA CAMBIOS DE CANALES
    // ─────────────────────────────────────────────────────────────────────────
    // Cuando el engine detecta un cambio en el número de canales (ej: el usuario
    // cambia de auriculares estéreo a interfaz multicanal), notifica al modal
    // para que reconstruya la matriz de ruteo dinámicamente.
    // ─────────────────────────────────────────────────────────────────────────
    if (this.engine.onPhysicalChannelsChange) {
      this.engine.onPhysicalChannelsChange((channelCount, labels) => {
        console.log(`[App] Physical channels changed: ${channelCount}`, labels);
        this.audioSettingsModal.updatePhysicalChannels(channelCount, labels);
      });
    }
    
    // Aplicar ruteo guardado al engine cuando inicie
    const originalStart = this.engine.start.bind(this.engine);
    this.engine.start = () => {
      originalStart();
      
      // Aplicar ruteo inicial después de start
      console.log('[App] Applying saved audio routing to engine...');
      const result = this.audioSettingsModal.applyRoutingToEngine((busIndex, channelGains) => {
        return this.engine.setOutputRouting(busIndex, channelGains);
      });
      
      // Mostrar advertencias si hay canales configurados que no existen
      if (result.warnings && result.warnings.length > 0) {
        console.warn('[App] Routing warnings:', result.warnings);
      }
      
      // Aplicar dispositivo de salida guardado
      const savedOutputDevice = this.audioSettingsModal.selectedOutputDevice;
      if (savedOutputDevice && savedOutputDevice !== 'default') {
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
    // PATCH BROWSER (guardar/cargar estados del sintetizador)
    // ─────────────────────────────────────────────────────────────────────────
    this._setupPatchBrowser();
  }
  
  /**
   * Configura el autoguardado periódico.
   * @param {number} intervalMs - Intervalo en milisegundos (0 = desactivado)
   */
  _configureAutoSave(intervalMs) {
    // Limpiar timer anterior
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
    
    if (intervalMs > 0) {
      this._autoSaveTimer = setInterval(() => {
        this._performAutoSave();
      }, intervalMs);
      console.log(`[App] Autosave configured: every ${intervalMs / 1000}s`);
    } else {
      console.log('[App] Autosave disabled');
    }
  }
  
  /**
   * Realiza el autoguardado del estado actual.
   */
  async _performAutoSave() {
    try {
      const state = this._serializeCurrentState();
      // Guardar en localStorage como "último estado"
      localStorage.setItem('synthigme-last-state', JSON.stringify({
        timestamp: Date.now(),
        state
      }));
      console.log('[App] State auto-saved');
    } catch (err) {
      console.warn('[App] Autosave failed:', err);
    }
  }
  
  /**
   * Guarda el estado al cerrar la aplicación.
   */
  _saveStateOnExit() {
    try {
      const state = this._serializeCurrentState();
      localStorage.setItem('synthigme-last-state', JSON.stringify({
        timestamp: Date.now(),
        state,
        savedOnExit: true
      }));
      console.log('[App] State saved on exit');
    } catch (err) {
      console.warn('[App] Save on exit failed:', err);
    }
  }
  
  /**
   * Restaura el último estado guardado.
   */
  async _restoreLastState() {
    try {
      const stored = localStorage.getItem('synthigme-last-state');
      if (!stored) return;
      
      const { state, timestamp } = JSON.parse(stored);
      if (!state) return;
      
      // Esperar a que el audio esté listo antes de aplicar
      // Usamos un pequeño delay para que la UI esté lista
      setTimeout(async () => {
        await this._applyPatch({ modules: state.modules || state });
        console.log(`[App] Previous state restored (saved at ${new Date(timestamp).toLocaleString()})`);
      }, 500);
    } catch (err) {
      console.warn('[App] Restore last state failed:', err);
    }
  }
  
  /**
   * Configura el navegador de patches para guardar/cargar estados.
   */
  _setupPatchBrowser() {
    this.patchBrowser = new PatchBrowser({
      onLoad: async (patchData) => {
        // Aplicar el patch cargado al sintetizador
        console.log('[App] Loading patch:', patchData);
        await this._applyPatch(patchData);
      },
      onSave: () => {
        // Serializar el estado actual para guardarlo
        const state = this._serializeCurrentState();
        console.log('[App] Serialized state:', state);
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
    console.log('[App] _applyPatch called with:', patchData);
    
    if (!patchData || !patchData.modules) {
      console.warn('[App] Invalid patch data - missing modules');
      return;
    }
    
    const { modules } = patchData;
    console.log('[App] Modules to restore:', Object.keys(modules));
    
    // Restaurar osciladores
    if (modules.oscillators && this._oscillatorUIs) {
      console.log('[App] Restoring oscillators:', Object.keys(modules.oscillators));
      console.log('[App] Available oscillator UIs:', Object.keys(this._oscillatorUIs));
      for (const [id, data] of Object.entries(modules.oscillators)) {
        const ui = this._oscillatorUIs[id];
        if (ui && typeof ui.deserialize === 'function') {
          console.log(`[App] Deserializing oscillator ${id}:`, data);
          ui.deserialize(data);
        } else {
          console.warn(`[App] Oscillator UI not found for ${id}`);
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
    
    console.log('[App] Patch applied successfully');
  }
  
  /**
   * Resetea todos los módulos a sus valores por defecto.
   * Itera directamente por los módulos existentes en lugar de usar un patch.
   */
  async _resetToDefaults() {
    console.log('[App] Resetting to defaults...');
    
    // Valores por defecto para cada tipo de módulo
    const defaultOscillator = { knobs: [0, 0.5, 0, 0.5, 0, 0, 0], rangeState: 'hi' };
    const defaultNoise = { colour: 0, level: 0 };
    const defaultRandomVoltage = { mean: 0.5, variance: 0.5, voltage1: 0, voltage2: 0, key: 0.5 };
    const defaultInputAmplifiers = { levels: Array(8).fill(0) };
    const defaultOutputFaders = { levels: Array(8).fill(0) };
    
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
    
    // Resetear Output Faders
    if (this._outputFadersModule && typeof this._outputFadersModule.deserialize === 'function') {
      this._outputFadersModule.deserialize(defaultOutputFaders);
    }
    
    // Limpiar matrices de conexiones
    if (this.largeMatrixAudio && typeof this.largeMatrixAudio.deserialize === 'function') {
      this.largeMatrixAudio.deserialize({ connections: [] });
    }
    
    if (this.largeMatrixControl && typeof this.largeMatrixControl.deserialize === 'function') {
      this.largeMatrixControl.deserialize({ connections: [] });
    }
    
    // Mostrar toast de confirmación
    this._showToast(t('toast.reset'));
    
    console.log('[App] Reset to defaults complete');
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
      this._showToast(t('toast.recordingStarted'));
    };
    
    this._recordingEngine.onRecordingStop = (filename) => {
      document.dispatchEvent(new CustomEvent('synth:recordingChanged', {
        detail: { recording: false }
      }));
      if (filename) {
        this._showToast(t('toast.recordingSaved', { filename }));
      } else {
        this._showToast(t('toast.recordingEmpty'));
      }
    };
    
    // Handler para toggle de grabación
    document.addEventListener('synth:toggleRecording', async () => {
      this.ensureAudio();
      try {
        await this._recordingEngine.toggle();
      } catch (e) {
        console.error('[App] Recording error:', e);
        this._showToast(t('toast.recordingError'));
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
    this.settingsModal = new SettingsModal({
      onResolutionChange: (factor) => {
        console.log(`[App] Resolution changed: ${factor}×`);
      },
      onAutoSaveIntervalChange: (intervalMs, intervalKey) => {
        this._configureAutoSave(intervalMs);
        console.log(`[App] Autosave interval changed: ${intervalKey} (${intervalMs}ms)`);
      },
      onSaveOnExitChange: (enabled) => {
        this._saveOnExit = enabled;
        console.log(`[App] Save on exit: ${enabled}`);
      },
      onRestoreOnStartChange: (enabled) => {
        console.log(`[App] Restore on start: ${enabled}`);
      },
      // Referencias a modales para integración en pestañas
      audioSettingsModal: this.audioSettingsModal,
      recordingSettingsModal: this._recordingSettingsModal
    });
    
    // Configurar estado inicial de autoguardado
    this._saveOnExit = this.settingsModal.getSaveOnExit();
    this._configureAutoSave(this.settingsModal.getAutoSaveIntervalMs());
    
    // Guardar al cerrar la página si está habilitado
    window.addEventListener('beforeunload', () => {
      if (this._saveOnExit) {
        this._saveStateOnExit();
      }
    });
    
    // Restaurar estado previo si está habilitado
    if (this.settingsModal.getRestoreOnStart()) {
      this._restoreLastState();
    }
    
    // Toggle settings modal
    document.addEventListener('synth:toggleSettings', (e) => {
      const tabId = e.detail?.tabId;
      if (this.settingsModal.isOpen) {
        this.settingsModal.close();
      } else {
        this.settingsModal.open(tabId);
      }
    });
  }
  
  /**
   * Muestra un toast temporal de feedback.
   * @param {string} message - Mensaje a mostrar
   */
  _showToast(message) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'resolution-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('resolution-toast--visible');
    
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('resolution-toast--visible');
    }, 2000);
  }

  _labelPanelSlot(panel, label, layout = {}) {
    if (!panel || !panel.element) return;

    if (layout.row) {
      panel.element.style.setProperty('--panel-row', layout.row);
      panel.element.dataset.panelRow = layout.row;
    }
    if (layout.col) {
      panel.element.style.setProperty('--panel-col', layout.col);
      panel.element.dataset.panelCol = layout.col;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCCIÓN UNIFICADA DE PANELES DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Devuelve la especificación de layout para paneles de osciladores.
   * Lee estructura base del blueprint y parámetros del config.
   * 
   * @returns {Object} Especificación de layout combinada
   */
  _getLayoutSpec() {
    // Leer estructura del blueprint (o usar defaults hardcoded como fallback)
    const blueprintLayout = panel3Blueprint?.layout?.oscillators || {};
    
    // Dimensiones de oscilador (blueprint o fallback)
    const oscSize = blueprintLayout.oscSize || { width: 370, height: 110 };
    
    // Layout params del blueprint
    const gap = blueprintLayout.gap || { x: 0, y: 0 };
    const airOuter = blueprintLayout.airOuter ?? 0;
    const airOuterY = blueprintLayout.airOuterY ?? 0;
    const rowsPerColumn = blueprintLayout.rowsPerColumn ?? 6;
    const topOffset = blueprintLayout.topOffset ?? 10;
    const reservedHeight = blueprintLayout.reservedHeight ?? oscSize.height;
    
    // Parámetros de UI del config (ajustes visuales)
    const padding = 6;
    const knobGap = 8;
    const switchOffset = { leftPercent: 36, topPx: 6 };
    
    return {
      oscSize,
      padding,
      gap,
      airOuter,
      airOuterY,
      rowsPerColumn,
      topOffset,
      knobGap,
      switchOffset,
      reservedHeight
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL 2 - OSCILOSCOPIO
  // ─────────────────────────────────────────────────────────────────────────────

  _buildPanel2() {
    if (!this.panel2) return;

    const blueprint = panel2Blueprint;
    const config = panel2Config;
    
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
    const audioConfig = config.oscilloscope.audio;
    scopeModule.setBufferSize(audioConfig.bufferSize);
    scopeModule.setTriggerHysteresis(audioConfig.triggerHysteresis);
    scopeModule.setSchmittHysteresis(audioConfig.schmittHysteresis);
    
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
      background: ${config.oscilloscope.display.bgColor};
      border-radius: 4px;
      overflow: hidden;
    `;
    mainContainer.appendChild(displayContainer);
    
    // Crear display con resolución interna fija
    const displayStyles = config.oscilloscope.display;
    const display = new OscilloscopeDisplay({
      container: displayContainer,
      internalWidth: displayStyles.internalWidth,
      internalHeight: displayStyles.internalHeight,
      useDevicePixelRatio: displayStyles.useDevicePixelRatio,
      mode: config.oscilloscope.audio.mode,
      lineColor: displayStyles.lineColor,
      bgColor: displayStyles.bgColor,
      gridColor: displayStyles.gridColor,
      centerColor: displayStyles.centerColor,
      lineWidth: displayStyles.lineWidth,
      showGrid: displayStyles.showGrid,
      showTriggerIndicator: displayStyles.showTriggerIndicator
    });
    
    // Crear contenedor de knobs (a la derecha del display)
    const knobsConfig = config.oscilloscope.knobs;
    const knobsContainer = document.createElement('div');
    knobsContainer.className = 'oscilloscope-knobs';
    mainContainer.appendChild(knobsContainer);
    
    // Helper para crear un knob con label (usa clases CSS estándar)
    const createLabeledKnob = (id, label, knobConfig, onChange) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'knob-wrapper';
      
      const knobEl = document.createElement('div');
      knobEl.className = 'knob knob--sm';
      
      const inner = document.createElement('div');
      inner.className = 'knob-inner';
      knobEl.appendChild(inner);
      
      const labelEl = document.createElement('div');
      labelEl.className = 'knob-label';
      labelEl.textContent = label;
      
      wrapper.appendChild(knobEl);
      wrapper.appendChild(labelEl);
      
      const knobInstance = new Knob(knobEl, {
        min: knobConfig.min,
        max: knobConfig.max,
        initial: knobConfig.initial,
        pixelsForFullRange: knobConfig.pixelsForFullRange,
        onChange
      });
      
      return { wrapper, knobInstance };
    };
    
    // Knob TIME (escala horizontal)
    const timeKnob = createLabeledKnob('scope-time', 'TIME', knobsConfig.timeScale, (value) => {
      display.setTimeScale(value);
    });
    knobsContainer.appendChild(timeKnob.wrapper);
    
    // Knob AMP (escala vertical)
    const ampKnob = createLabeledKnob('scope-amp', 'AMP', knobsConfig.ampScale, (value) => {
      display.setAmpScale(value);
    });
    knobsContainer.appendChild(ampKnob.wrapper);
    
    // Knob LEVEL (nivel de trigger)
    const levelKnob = createLabeledKnob('scope-level', 'LEVEL', knobsConfig.triggerLevel, (value) => {
      scopeModule.setTriggerLevel(value);
    });
    knobsContainer.appendChild(levelKnob.wrapper);
    
    // Crear toggle para modo Y-T / X-Y (Lissajous)
    const modeToggle = new Toggle({
      id: 'scope-mode-toggle',
      labelA: 'Y-T',
      labelB: 'X-Y',
      initial: config.oscilloscope.audio.mode === 'xy' ? 'b' : 'a',
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
    const inputAmpConfig = config.inputAmplifiers;
    const inputAmpModule = new InputAmplifierModule(this.engine, 'input-amplifiers', {
      channels: blueprint.modules.inputAmplifiers.channels,
      initialLevel: inputAmpConfig.knobs.level.initial,
      levelSmoothingTime: inputAmpConfig.audio.levelSmoothingTime
    });
    this.engine.addModule(inputAmpModule);
    this.inputAmplifiers = inputAmpModule;
    
    // Crear UI
    const inputAmpId = blueprint.modules.inputAmplifiers.id;
    const inputAmpUI = new InputAmplifierUI({
      id: inputAmpId,
      title: blueprint.modules.inputAmplifiers.title,
      channels: blueprint.modules.inputAmplifiers.channels,
      knobConfig: inputAmpConfig.knobs.level,
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
    
    if (!this.inputAmplifiers?.isStarted) {
      console.warn('[App] Input amplifiers not ready for system audio');
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
      
      // Crear nodo fuente desde el stream
      const sourceNode = ctx.createMediaStreamSource(stream);
      const channelCount = sourceNode.channelCount || 2;
      
      console.log(`[App] System audio input: ${channelCount} channels`);
      
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
      
      console.log(`[App] Input routing matrix created: ${channelCount}×8`);
      
    } catch (err) {
      console.warn('[App] Could not access system audio input:', err.message);
      // No es crítico, los Input Amplifiers simplemente no tendrán entrada del sistema
    }
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

    const layout = this._getLayoutSpec();
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
        row: slot.row
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
      const knobOptions = this._getPanelKnobOptions(panelIndex, slot.index - 1);
      const oscId = `panel${panelIndex}-osc-${slot.index}`;
      const osc = new SGME_Oscillator({
        id: oscId,
        title: `Osc ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset,
        knobSize: 40,
        knobRowOffsetY: -15,
        knobInnerPct: 76,
        knobOptions
      });
      const el = osc.createElement();
      host.appendChild(el);
      
      // Guardar referencia para serialización
      this._oscillatorUIs[oscId] = osc;
      
      return { osc, element: el, slot };
    });

    // Fila de módulos de ruido y Random CV (solo para Panel 3)
    let reservedRow = null;
    let noiseModules = null;
    let noiseAudioModules = null;
    
    if (panelIndex === 3) {
      reservedRow = document.createElement('div');
      reservedRow.className = 'panel3-reserved-row panel3-modules-row';
      
      // Leer configuración de módulos desde el blueprint
      const modulesConfig = panel3Config.modules || {};
      const noiseDefaults = modulesConfig.noiseDefaults || {};
      const noise1Cfg = modulesConfig.noise1 || {};
      const noise2Cfg = modulesConfig.noise2 || {};
      const randomCVCfg = modulesConfig.randomCV || {};
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear módulos de audio para Noise Generators
      // Los módulos se inicializan bajo demanda cuando el usuario interactúa
      // con la matriz (después del user gesture que activa el AudioContext)
      // ─────────────────────────────────────────────────────────────────────
      const noise1Audio = new NoiseModule(this.engine, noise1Cfg.id || 'noise-1', {
        initialColour: noise1Cfg.knobs?.colour?.initial ?? noiseDefaults.initialColour ?? 0,
        initialLevel: noise1Cfg.knobs?.level?.initial ?? noiseDefaults.initialLevel ?? 0,
        levelSmoothingTime: noise1Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise1Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01
      });
      
      const noise2Audio = new NoiseModule(this.engine, noise2Cfg.id || 'noise-2', {
        initialColour: noise2Cfg.knobs?.colour?.initial ?? noiseDefaults.initialColour ?? 0,
        initialLevel: noise2Cfg.knobs?.level?.initial ?? noiseDefaults.initialLevel ?? 0,
        levelSmoothingTime: noise2Cfg.audio?.levelSmoothingTime ?? noiseDefaults.levelSmoothingTime ?? 0.03,
        colourSmoothingTime: noise2Cfg.audio?.colourSmoothingTime ?? noiseDefaults.colourSmoothingTime ?? 0.01
      });
      
      // NO llamar start() aquí - se hace lazy en _handlePanel5AudioToggle
      // cuando el usuario hace click en la matriz (después del user gesture)
      
      noiseAudioModules = { noise1: noise1Audio, noise2: noise2Audio };
      
      // ─────────────────────────────────────────────────────────────────────
      // Crear UI con callbacks vinculados a audio
      // ─────────────────────────────────────────────────────────────────────
      
      // Noise Generator 1 UI
      const noise1Id = noise1Cfg.id || 'panel3-noise-1';
      const noise1 = new NoiseGenerator({
        id: noise1Id,
        title: noise1Cfg.title || 'Noise 1',
        knobOptions: {
          colour: {
            ...noise1Cfg.knobs?.colour,
            onChange: (value) => noise1Audio.setColour(value)
          },
          level: {
            ...noise1Cfg.knobs?.level,
            onChange: (value) => noise1Audio.setLevel(value)
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
            onChange: (value) => noise2Audio.setColour(value)
          },
          level: {
            ...noise2Cfg.knobs?.level,
            onChange: (value) => noise2Audio.setLevel(value)
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
        const x = baseLeft + col * (columnWidth + gap.x);
        const y = baseTop + row * (oscSize.height + gap.y);
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

  _createPulseWave(ctx, duty, harmonics = 32) {
    const d = Math.min(0.99, Math.max(0.01, duty));
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    return ctx.createPeriodicWave(real, imag);
  }

  _createAsymmetricSineWave(ctx, symmetry, harmonics = 16) {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    imag[1] = 1.0;
    const asymAmount = (symmetry - 0.5) * 2;
    for (let n = 2; n <= harmonics; n += 2) {
      imag[n] = asymAmount * (1.0 / (n * n));
    }
    return ctx.createPeriodicWave(real, imag);
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
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    const panelAudio = this._getPanelAudio(panelIndex);
    panelAudio.nodes = panelAudio.nodes || [];
    panelAudio.state = panelAudio.state || [];
    
    let entry = panelAudio.nodes[oscIndex];
    if (entry && entry.osc && entry.gain && entry.sawOsc && entry.sawGain && entry.triOsc && entry.triGain && entry.pulseOsc && entry.pulseGain && entry.sineSawOut && entry.triPulseOut) {
      return entry;
    }

    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    const useWorklet = this.engine.workletReady;

    // SINE oscillator: usar worklet si disponible
    let osc, gain;
    if (useWorklet) {
      osc = this.engine.createSynthOscillator({
        waveform: 'sine',
        frequency: state.freq || 10,
        symmetry: state.sineSymmetry || 0.5,
        gain: 1.0
      });
      gain = ctx.createGain();
      gain.gain.value = state.oscLevel || 0;
      osc.connect(gain);
      // Marcar como worklet para saber cómo actualizar
      osc._isWorklet = true;
    } else {
      osc = ctx.createOscillator();
      osc.setPeriodicWave(createAsymmetricSineWave(ctx, state.sineSymmetry));
      osc.frequency.value = state.freq || 10;
      gain = ctx.createGain();
      gain.gain.value = state.oscLevel || 0;
      osc.connect(gain);
    }
    
    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.value = state.freq || 10;

    const sawGain = ctx.createGain();
    sawGain.gain.value = state.sawLevel || 0;
    sawOsc.connect(sawGain);

    const triOsc = ctx.createOscillator();
    triOsc.type = 'triangle';
    triOsc.frequency.value = state.freq || 10;

    const triGain = ctx.createGain();
    triGain.gain.value = state.triLevel || 0;
    triOsc.connect(triGain);

    // PULSE oscillator: usar worklet si disponible
    let pulseOsc, pulseGain;
    if (useWorklet) {
      pulseOsc = this.engine.createSynthOscillator({
        waveform: 'pulse',
        frequency: state.freq || 10,
        pulseWidth: state.pulseWidth || 0.5,
        gain: 1.0
      });
      pulseGain = ctx.createGain();
      pulseGain.gain.value = state.pulseLevel || 0;
      pulseOsc.connect(pulseGain);
      pulseOsc._isWorklet = true;
    } else {
      pulseOsc = ctx.createOscillator();
      pulseOsc.setPeriodicWave(createPulseWave(ctx, state.pulseWidth));
      pulseOsc.frequency.value = state.freq || 10;
      pulseGain = ctx.createGain();
      pulseGain.gain.value = state.pulseLevel || 0;
      pulseOsc.connect(pulseGain);
    }

    const sineSawOut = ctx.createGain();
    sineSawOut.gain.value = 1.0;
    gain.connect(sineSawOut);
    sawGain.connect(sineSawOut);

    const triPulseOut = ctx.createGain();
    triPulseOut.gain.value = 1.0;
    triGain.connect(triPulseOut);
    pulseGain.connect(triPulseOut);
    
    const moduleOut = sineSawOut;
    if (panelIndex !== 3) {
      const bus1 = this.engine.getOutputBusNode(0);
      if (bus1) moduleOut.connect(bus1);
    }

    const startTime = ctx.currentTime + 0.01;
    const now = ctx.currentTime;
    
    // NOTA: Los try-catch protegen contra estados inválidos de AudioParam.
    // Son esperados y seguros de ignorar (el estado se sincronizará después).
    
    // Solo configurar frecuencia en osciladores nativos (worklets ya tienen frecuencia)
    if (!useWorklet && Number.isFinite(state.freq)) {
      try {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(state.freq, now);
        pulseOsc.frequency.cancelScheduledValues(now);
        pulseOsc.frequency.setValueAtTime(state.freq, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    
    // Saw y Tri siempre son nativos
    if (Number.isFinite(state.freq)) {
      try {
        sawOsc.frequency.cancelScheduledValues(now);
        sawOsc.frequency.setValueAtTime(state.freq, now);
        triOsc.frequency.cancelScheduledValues(now);
        triOsc.frequency.setValueAtTime(state.freq, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (Number.isFinite(state.oscLevel)) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(state.oscLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (Number.isFinite(state.sawLevel)) {
      try {
        sawGain.gain.cancelScheduledValues(now);
        sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (Number.isFinite(state.triLevel)) {
      try {
        triGain.gain.cancelScheduledValues(now);
        triGain.gain.setValueAtTime(state.triLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    if (Number.isFinite(state.pulseLevel)) {
      try {
        pulseGain.gain.cancelScheduledValues(now);
        pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch { /* AudioParam puede no estar listo */ }
    }
    
    // Iniciar osciladores nativos (worklets ya están corriendo)
    // Puede lanzar si el oscilador ya fue iniciado
    try { 
      if (!useWorklet) {
        osc.start(startTime);
        pulseOsc.start(startTime);
      }
      sawOsc.start(startTime);
      triOsc.start(startTime);
    } catch { /* oscilador ya iniciado */ }

    entry = { osc, gain, sawOsc, sawGain, triOsc, triGain, pulseOsc, pulseGain, sineSawOut, triPulseOut, moduleOut, _freqInitialized: true, _useWorklet: useWorklet };
    panelAudio.nodes[oscIndex] = entry;
    return entry;
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
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    
    // Mapeo de voz a propiedad de estado y nodo de ganancia
    const voiceMap = {
      osc: { stateKey: 'oscLevel', gainNode: 'gain' },
      saw: { stateKey: 'sawLevel', gainNode: 'sawGain' },
      tri: { stateKey: 'triLevel', gainNode: 'triGain' },
      pulse: { stateKey: 'pulseLevel', gainNode: 'pulseGain' }
    };
    
    const mapping = voiceMap[voice];
    if (!mapping) return;
    
    state[mapping.stateKey] = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    const gainNode = node?.[mapping.gainNode];
    if (!gainNode) return;
    
    setParamSmooth(gainNode.gain, value, ctx);
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
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    const duty = 0.01 + value * 0.98;
    state.pulseWidth = duty;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.pulseOsc) return;
    
    // Usar worklet si disponible (sin clicks), fallback a setPeriodicWave
    if (node._useWorklet && node.pulseOsc.setPulseWidth) {
      node.pulseOsc.setPulseWidth(duty);
    } else {
      const wave = createPulseWave(ctx, duty);
      node.pulseOsc.setPeriodicWave(wave);
    }
  }

  _updatePanelSineSymmetry(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.sineSymmetry = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.osc) return;
    
    // Usar worklet si disponible (sin clicks), fallback a setPeriodicWave
    if (node._useWorklet && node.osc.setSymmetry) {
      node.osc.setSymmetry(value);
    } else {
      const wave = createAsymmetricSineWave(ctx, value);
      node.osc.setPeriodicWave(wave);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SISTEMA DE CONFIGURACIÓN DE OSCILADORES
  // ─────────────────────────────────────────────────────────────────────────

  _getOscConfig(oscIndex) {
    const defaults = panel3Config.defaults || {};
    const oscNumber = oscIndex + 1;
    const override = panel3Config.oscillators?.[oscNumber] || {};
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

  _updatePanelOscFreq(panelIndex, oscIndex, value) {
    const config = panelIndex === 3 ? this._getOscConfig(oscIndex) : panel3Config.defaults;
    const freqConfig = config?.knobs?.frequency || { min: 1, max: 10000, curve: 'quadratic' };
    const freq = this._applyCurve(value, freqConfig);
    
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.freq = freq;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.osc) return;
    
    // Sine - worklet o nativo
    if (node._useWorklet && node.osc.setFrequency) {
      node.osc.setFrequency(freq);
    } else if (node.osc.frequency) {
      if (!node._freqInitialized) {
        // Primera inicialización: valor inmediato
        const now = ctx.currentTime;
        node.osc.frequency.setValueAtTime(freq, now);
        node._freqInitialized = true;
      } else {
        setParamSmooth(node.osc.frequency, freq, ctx);
      }
    }
    
    // Saw y Tri siempre nativos
    if (node.sawOsc?.frequency) {
      setParamSmooth(node.sawOsc.frequency, freq, ctx);
    }
    if (node.triOsc?.frequency) {
      setParamSmooth(node.triOsc.frequency, freq, ctx);
    }
    
    // Pulse - worklet o nativo
    if (node.pulseOsc) {
      if (node._useWorklet && node.pulseOsc.setFrequency) {
        node.pulseOsc.setFrequency(freq);
      } else if (node.pulseOsc.frequency) {
        setParamSmooth(node.pulseOsc.frequency, freq, ctx);
      }
    }
  }

  _getPanelKnobOptions(panelIndex, oscIndex) {
    const config = panelIndex === 3 ? this._getOscConfig(oscIndex) : panel3Config.defaults;
    const knobsConfig = config?.knobs || {};
    
    const knobOptions = [];
    
    const pulseLevelCfg = knobsConfig.pulseLevel || {};
    knobOptions[0] = {
      min: pulseLevelCfg.min ?? 0,
      max: pulseLevelCfg.max ?? 1,
      initial: pulseLevelCfg.initial ?? 0,
      onChange: value => this._updatePanelPulseVolume(panelIndex, oscIndex, value)
    };
    
    const pulseWidthCfg = knobsConfig.pulseWidth || {};
    knobOptions[1] = {
      min: pulseWidthCfg.min ?? 0,
      max: pulseWidthCfg.max ?? 1,
      initial: pulseWidthCfg.initial ?? 0.5,
      onChange: value => this._updatePanelPulseWidth(panelIndex, oscIndex, value)
    };
    
    const sineLevelCfg = knobsConfig.sineLevel || {};
    knobOptions[2] = {
      min: sineLevelCfg.min ?? 0,
      max: sineLevelCfg.max ?? 1,
      initial: sineLevelCfg.initial ?? 0,
      onChange: value => this._updatePanelOscVolume(panelIndex, oscIndex, value)
    };
    
    const sineSymmetryCfg = knobsConfig.sineSymmetry || {};
    knobOptions[3] = {
      min: sineSymmetryCfg.min ?? 0,
      max: sineSymmetryCfg.max ?? 1,
      initial: sineSymmetryCfg.initial ?? 0.5,
      onChange: value => this._updatePanelSineSymmetry(panelIndex, oscIndex, value)
    };
    
    const triangleLevelCfg = knobsConfig.triangleLevel || {};
    knobOptions[4] = {
      min: triangleLevelCfg.min ?? 0,
      max: triangleLevelCfg.max ?? 1,
      initial: triangleLevelCfg.initial ?? 0,
      onChange: value => this._updatePanelTriVolume(panelIndex, oscIndex, value)
    };
    
    const sawtoothLevelCfg = knobsConfig.sawtoothLevel || {};
    knobOptions[5] = {
      min: sawtoothLevelCfg.min ?? 0,
      max: sawtoothLevelCfg.max ?? 1,
      initial: sawtoothLevelCfg.initial ?? 0,
      onChange: value => this._updatePanelSawVolume(panelIndex, oscIndex, value)
    };
    
    const frequencyCfg = knobsConfig.frequency || {};
    knobOptions[6] = {
      min: frequencyCfg.min ?? 1,
      max: frequencyCfg.max ?? 10000,
      initial: frequencyCfg.initial ?? 10,
      pixelsForFullRange: frequencyCfg.pixelsForFullRange ?? 900,
      onChange: value => this._updatePanelOscFreq(panelIndex, oscIndex, value)
    };
    
    return knobOptions;
  }

  // Wrappers de compatibilidad (pueden eliminarse en refactor futuro)
  _ensurePanel3Nodes(index) { return this._ensurePanelNodes(3, index); }

  // ─────────────────────────────────────────────────────────────────────────
  // SISTEMA DE BLUEPRINTS Y MATRICES
  // ─────────────────────────────────────────────────────────────────────────

  _compilePanelBlueprintMappings(blueprint) {
    const rowBase = blueprint?.grid?.coordSystem?.rowBase ?? 67;
    const colBase = blueprint?.grid?.coordSystem?.colBase ?? 1;

    const rows = blueprint?.grid?.rows ?? 63;
    const cols = blueprint?.grid?.cols ?? 67;

    const hiddenRows0 = Array.isArray(blueprint?.ui?.hiddenRows0)
      ? blueprint.ui.hiddenRows0.filter(Number.isFinite)
      : (blueprint?.ui?.hiddenRowsSynth || [])
        .filter(Number.isFinite)
        .map(r => r - rowBase)
        .filter(r => r >= 0);

    const hiddenCols0 = Array.isArray(blueprint?.ui?.hiddenCols0)
      ? blueprint.ui.hiddenCols0.filter(Number.isFinite)
      : (blueprint?.ui?.hiddenColsSynth || [])
        .filter(Number.isFinite)
        .map(c => c - colBase)
        .filter(c => c >= 0);

    const hiddenRowSet = new Set(hiddenRows0);

    const visibleRowIndices = [];
    for (let r = 0; r < rows; r += 1) {
      if (hiddenRowSet.has(r)) continue;
      visibleRowIndices.push(r);
    }

    const synthRowToPhysicalRowIndex = (rowSynth) => {
      const ordinal = rowSynth - rowBase;
      if (!Number.isFinite(ordinal) || ordinal < 0) return null;
      return visibleRowIndices[ordinal] ?? null;
    };

    const synthColToPhysicalColIndex = (colSynth) => {
      const colIndex = colSynth - colBase;
      if (!Number.isFinite(colIndex) || colIndex < 0) return null;
      return colIndex;
    };

    // Mapeo de filas a fuentes (osciladores y noise generators)
    const rowMap = new Map();      // rowIndex -> oscIndex (para osciladores)
    const channelMap = new Map();  // rowIndex -> channelId (sineSaw/triPulse)
    const sourceMap = new Map();   // rowIndex -> { kind, index?, oscIndex?, channelId? }
    
    for (const entry of blueprint?.sources || []) {
      const rowSynth = entry?.rowSynth;
      const source = entry?.source;
      if (!Number.isFinite(rowSynth) || !source) continue;
      
      const rowIndex = synthRowToPhysicalRowIndex(rowSynth);
      if (rowIndex == null) continue;
      
      // Guardar fuente completa para routing genérico
      sourceMap.set(rowIndex, source);
      
      // Mantener compatibilidad con osciladores
      if (source.kind === 'panel3Osc') {
        const oscIndex = source.oscIndex;
        const channelId = source.channelId || 'sineSaw';
        if (Number.isFinite(oscIndex)) {
          rowMap.set(rowIndex, oscIndex);
          channelMap.set(rowIndex, channelId);
        }
      }
    }

    const colMap = new Map();
    const destMap = new Map();  // Mapa de columna a destino completo { kind, bus?, channel? }
    for (const entry of blueprint?.destinations || []) {
      const colSynth = entry?.colSynth;
      const dest = entry?.dest;
      if (!Number.isFinite(colSynth) || !dest) continue;
      const colIndex = synthColToPhysicalColIndex(colSynth);
      if (colIndex == null) continue;
      
      // Guardar destino completo para tipos especiales
      destMap.set(colIndex, dest);
      
      // Para compatibilidad: seguir mapeando buses al colMap
      if (dest.kind === 'outputBus' && Number.isFinite(dest.bus)) {
        const busIndex = dest.bus - 1;
        if (busIndex >= 0) {
          colMap.set(colIndex, busIndex);
        }
      }
    }

    return { rowMap, colMap, destMap, channelMap, sourceMap, hiddenRows: hiddenRows0, hiddenCols: hiddenCols0, rowBase, colBase };
  }

  _physicalRowToSynthRow(rowIndex) {
    const mappings = this._compilePanelBlueprintMappings(panel5AudioBlueprint);
    return mappings.rowBase + rowIndex;
  }

  _physicalColToSynthCol(colIndex) {
    const mappings = this._compilePanelBlueprintMappings(panel5AudioBlueprint);
    return mappings.colBase + colIndex;
  }

  _getPanel5PinGain(rowIndex, colIndex) {
    const cfg = panel5AudioConfig?.audio || {};
    const matrixGain = cfg.matrixGain ?? 1.0;
    const gainRange = cfg.gainRange || { min: 0, max: 2.0 };

    const rowSynth = this._physicalRowToSynthRow(rowIndex);
    const colSynth = this._physicalColToSynthCol(colIndex);
    const pinKey = `${rowSynth}:${colSynth}`;

    const pinGains = panel5AudioConfig?.pinGains || {};
    if (pinKey in pinGains) {
      const pinGain = pinGains[pinKey];
      const clampedPin = Math.max(gainRange.min, Math.min(gainRange.max, pinGain));
      return clampedPin * matrixGain;
    }

    const rowGains = panel5AudioConfig?.rowGains || {};
    const colGains = panel5AudioConfig?.colGains || {};
    const rowGain = rowGains[rowSynth] ?? 1.0;
    const colGain = colGains[colSynth] ?? 1.0;

    const clampedRow = Math.max(gainRange.min, Math.min(gainRange.max, rowGain));
    const clampedCol = Math.max(gainRange.min, Math.min(gainRange.max, colGain));

    return clampedRow * clampedCol * matrixGain;
  }

  _setupPanel5AudioRouting() {
    this._panel3Routing = this._panel3Routing || { connections: {}, rowMap: null, colMap: null, destMap: null, channelMap: null, sourceMap: null };
    this._panel3Routing.connections = {};
    const mappings = this._compilePanelBlueprintMappings(panel5AudioBlueprint);
    this._panel3Routing.rowMap = mappings.rowMap;
    this._panel3Routing.colMap = mappings.colMap;
    this._panel3Routing.destMap = mappings.destMap;
    this._panel3Routing.channelMap = mappings.channelMap;
    this._panel3Routing.sourceMap = mappings.sourceMap;
    this._panel3Routing.hiddenCols = mappings.hiddenCols;

    if (this.largeMatrixAudio && this.largeMatrixAudio.setToggleHandler) {
      this.largeMatrixAudio.setToggleHandler((rowIndex, colIndex, nextActive) =>
        this._handlePanel5AudioToggle(rowIndex, colIndex, nextActive)
      );
    }
  }

  async _handlePanel5AudioToggle(rowIndex, colIndex, activate) {
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
        this._applyOscStateImmediate(src, state, ctx);
        
      } else if (source.kind === 'noiseGen') {
        // Fuente: Noise Generator
        const noiseIndex = source.index;
        // Acceder a los datos de Panel 3 dinámicamente
        const panel3Data = this['_panel3LayoutData'];
        const noiseAudioModules = panel3Data?.noiseAudioModules;
        
        if (!noiseAudioModules) {
          console.warn('[App] Noise audio modules not initialized');
          return false;
        }
        
        const noiseModule = noiseIndex === 0 ? noiseAudioModules.noise1 : noiseAudioModules.noise2;
        
        // Asegurar que el módulo esté iniciado (lazy init después de user gesture)
        if (noiseModule && !noiseModule.isStarted) {
          noiseModule.start();
        }
        
        outNode = noiseModule?.getOutputNode?.();
        
        if (!outNode) {
          console.warn('[App] NoiseModule output node not available, retrying init');
          noiseModule?.start?.();
          outNode = noiseModule?.getOutputNode?.();
        }
        
      } else if (source.kind === 'inputAmp') {
        // Fuente: Input Amplifier (canales de entrada del sistema)
        const channel = source.channel;
        
        if (!this.inputAmplifiers) {
          console.warn('[App] Input amplifiers module not initialized');
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
          console.warn('[App] InputAmplifier output node not available for channel', channel);
          return false;
        }
      }
      
      if (!outNode) {
        console.warn('[App] No output node for source', source);
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
          console.warn('[App] Oscilloscope module not ready yet');
          return false;
        }
        destNode = dest.channel === 'X' ? this.oscilloscope.inputX : this.oscilloscope.inputY;
        console.log(`[App] Connecting to oscilloscope ${dest.channel}`);
      }
      
      if (!destNode) {
        console.warn('[App] No destination node for', dest);
        return false;
      }

      const gain = ctx.createGain();
      const pinGainValue = this._getPanel5PinGain(rowIndex, colIndex);
      gain.gain.value = pinGainValue;
      outNode.connect(gain);
      gain.connect(destNode);
      this._panel3Routing.connections[key] = gain;
      return true;
    }

    const conn = this._panel3Routing.connections?.[key];
    if (conn) {
      // Ignorar error si el nodo ya fue desconectado
      try { conn.disconnect(); } catch { /* nodo ya desconectado */ }
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

    const { hiddenCols: HIDDEN_COLS_PANEL5, hiddenRows: HIDDEN_ROWS_PANEL5 } =
      this._compilePanelBlueprintMappings(panel5AudioBlueprint);

    const { hiddenCols: HIDDEN_COLS_PANEL6, hiddenRows: HIDDEN_ROWS_PANEL6 } =
      this._compilePanelBlueprintMappings(panel6ControlBlueprint);

    this.largeMatrixAudio = new LargeMatrix(this.panel5MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL5,
      hiddenCols: HIDDEN_COLS_PANEL5,
      hiddenRows: HIDDEN_ROWS_PANEL5
    });

    this.largeMatrixControl = new LargeMatrix(this.panel6MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL6,
      hiddenCols: HIDDEN_COLS_PANEL6,
      hiddenRows: HIDDEN_ROWS_PANEL6
    });

    this.largeMatrixAudio.build();
    this.largeMatrixControl.build();
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
 * 
 * Para desactivar el tiempo mínimo, establecer en 0.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const SPLASH_MIN_DISPLAY_MS = 2500;

/**
 * Oculta el splash screen con una transición suave.
 * Actualiza la versión mostrada antes de ocultar.
 */
function hideSplashScreen() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  
  // Actualizar versión en el splash con la versión real detectada
  const versionEl = document.getElementById('splashVersion');
  if (versionEl && window.synthBuildVersion) {
    versionEl.textContent = window.synthBuildVersion;
  }
  
  // Añadir clase que dispara la animación de fade-out (ver main.css)
  splash.classList.add('splash--hidden');
  
  // Eliminar del DOM después de la transición para liberar memoria
  // El tiempo debe coincidir con la duración de la transición CSS (0.8s = 800ms)
  setTimeout(() => {
    splash.remove();
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
  
  // Inicializar navegación del viewport
  initViewportNavigation();
  
  // Registrar service worker
  registerServiceWorker();
  
  // Configurar UI móvil y zoom de paneles
  setupMobileQuickActionsBar();
  setupPanelZoomButtons();
  setupPanelDoubleTapZoom();
  
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
