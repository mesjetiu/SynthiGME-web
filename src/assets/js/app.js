// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine } from './core/engine.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputFaderModule } from './modules/outputFaders.js';
import { NoiseModule } from './modules/noise.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';
import { NoiseGenerator } from './ui/noiseGenerator.js';
import { RandomVoltage } from './ui/randomVoltage.js';

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
import { registerServiceWorker } from './utils/serviceWorker.js';
import { detectBuildVersion } from './utils/buildVersion.js';

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

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.outputPanel.addHeaderElement(this.muteBtn);

    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
    this._heightSyncScheduled = false;
    this.largeMatrixAudio = null;
    this.largeMatrixControl = null;
    
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

    // Sine oscillator - puede ser worklet o nativo
    if (node.osc && Number.isFinite(state.freq)) {
      try {
        if (node._useWorklet && node.osc.setFrequency) {
          node.osc.setFrequency(state.freq);
        } else if (node.osc.frequency) {
          node.osc.frequency.cancelScheduledValues(now);
          node.osc.frequency.setValueAtTime(state.freq, now);
        }
      } catch (error) {}
    }
    if (node.sawOsc && node.sawOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.sawOsc.frequency.cancelScheduledValues(now);
        node.sawOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }

    if (node.gain && node.gain.gain && Number.isFinite(state.oscLevel)) {
      try {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(state.oscLevel, now);
      } catch (error) {}
    }
    if (node.sawGain && node.sawGain.gain && Number.isFinite(state.sawLevel)) {
      try {
        node.sawGain.gain.cancelScheduledValues(now);
        node.sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch (error) {}
    }
    if (node.triOsc && node.triOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.triOsc.frequency.cancelScheduledValues(now);
        node.triOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (node.triGain && node.triGain.gain && Number.isFinite(state.triLevel)) {
      try {
        node.triGain.gain.cancelScheduledValues(now);
        node.triGain.gain.setValueAtTime(state.triLevel, now);
      } catch (error) {}
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
      } catch (error) {}
    }
    if (node.pulseGain && node.pulseGain.gain && Number.isFinite(state.pulseLevel)) {
      try {
        node.pulseGain.gain.cancelScheduledValues(now);
        node.pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch (error) {}
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
  }

  _setupUI() {
    const muteBtn = this.muteBtn;
    if (!muteBtn) return;
    muteBtn.addEventListener('click', () => {
      this.ensureAudio();
      this.engine.toggleMute();
      muteBtn.textContent = this.engine.muted ? '🔇 Mute ON' : '🔊 Audio ON';
      muteBtn.classList.toggle('off', this.engine.muted);
    });
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
    
    // Conectar display al módulo
    scopeModule.onData(data => display.draw(data));
    
    // Guardar referencias
    this._panel2Data = {
      host,
      scopeSection,
      moduleFrame,
      displayContainer,
      scopeModule,
      display,
      modeToggle
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
      const osc = new SGME_Oscillator({
        id: `panel${panelIndex}-osc-${slot.index}`,
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
      const noise1 = new NoiseGenerator({
        id: noise1Cfg.id || 'panel3-noise-1',
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
      
      // Noise Generator 2 UI
      const noise2 = new NoiseGenerator({
        id: noise2Cfg.id || 'panel3-noise-2',
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
      
      // Random Control Voltage Generator (solo UI, sin audio aún)
      const randomCV = new RandomVoltage({
        id: randomCVCfg.id || 'panel3-random-cv',
        title: randomCVCfg.title || 'Random Voltage',
        knobOptions: randomCVCfg.knobs || {
          mean: { min: -1, max: 1, initial: 0 },
          variance: { min: 0, max: 1, initial: 0.5 },
          voltage1: { min: 0, max: 1, initial: 0 },
          voltage2: { min: 0, max: 1, initial: 0 },
          key: { min: 0, max: 1, initial: 0 }
        }
      });
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

  // Métodos legacy para compatibilidad
  _buildPanel1Layout() { /* migrado a _buildOscillatorPanel */ }
  _buildPanel2Layout() { /* migrado a _buildOscillatorPanel */ }
  _buildPanel3Layout() { /* migrado a _buildOscillatorPanel */ }
  _buildPanel4Layout() { /* migrado a _buildOscillatorPanel */ }
  _reflowPanel1Layout() { this._reflowOscillatorPanel(1); }
  _reflowPanel2Layout() { this._reflowOscillatorPanel(2); }
  _reflowPanel3Layout() { this._reflowOscillatorPanel(3); }
  _reflowPanel4Layout() { this._reflowOscillatorPanel(4); }

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
      osc.setPeriodicWave(this._createAsymmetricSineWave(ctx, state.sineSymmetry));
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
      pulseOsc.setPeriodicWave(this._createPulseWave(ctx, state.pulseWidth));
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
    
    // Solo configurar frecuencia en osciladores nativos (worklets ya tienen frecuencia)
    if (!useWorklet && Number.isFinite(state.freq)) {
      try {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(state.freq, now);
        pulseOsc.frequency.cancelScheduledValues(now);
        pulseOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    
    // Saw y Tri siempre son nativos
    if (Number.isFinite(state.freq)) {
      try {
        sawOsc.frequency.cancelScheduledValues(now);
        sawOsc.frequency.setValueAtTime(state.freq, now);
        triOsc.frequency.cancelScheduledValues(now);
        triOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.oscLevel)) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(state.oscLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.sawLevel)) {
      try {
        sawGain.gain.cancelScheduledValues(now);
        sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.triLevel)) {
      try {
        triGain.gain.cancelScheduledValues(now);
        triGain.gain.setValueAtTime(state.triLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.pulseLevel)) {
      try {
        pulseGain.gain.cancelScheduledValues(now);
        pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch (error) {}
    }
    
    // Iniciar osciladores nativos (worklets ya están corriendo)
    try { 
      if (!useWorklet) {
        osc.start(startTime);
        pulseOsc.start(startTime);
      }
      sawOsc.start(startTime);
      triOsc.start(startTime);
    } catch (error) {}

    entry = { osc, gain, sawOsc, sawGain, triOsc, triGain, pulseOsc, pulseGain, sineSawOut, triPulseOut, moduleOut, _freqInitialized: true, _useWorklet: useWorklet };
    panelAudio.nodes[oscIndex] = entry;
    return entry;
  }

  _updatePanelOscVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.oscLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanelSawVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.sawLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.sawGain) return;
    const now = ctx.currentTime;
    node.sawGain.gain.cancelScheduledValues(now);
    node.sawGain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanelTriVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.triLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.triGain) return;
    const now = ctx.currentTime;
    node.triGain.gain.cancelScheduledValues(now);
    node.triGain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanelPulseVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.pulseLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.pulseGain) return;
    const now = ctx.currentTime;
    node.pulseGain.gain.cancelScheduledValues(now);
    node.pulseGain.gain.setTargetAtTime(value, now, 0.03);
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
      const wave = this._createPulseWave(ctx, duty);
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
      const wave = this._createAsymmetricSineWave(ctx, value);
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
    return this._deepMerge(defaults, override);
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
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
    const now = ctx.currentTime;
    
    // Sine - worklet o nativo
    if (node._useWorklet && node.osc.setFrequency) {
      node.osc.setFrequency(freq);
    } else if (node.osc.frequency) {
      node.osc.frequency.cancelScheduledValues(now);
      if (!node._freqInitialized) {
        node.osc.frequency.setValueAtTime(freq, now);
        node._freqInitialized = true;
      } else {
        node.osc.frequency.setTargetAtTime(freq, now, 0.03);
      }
    }
    
    // Saw y Tri siempre nativos
    if (node.sawOsc) {
      node.sawOsc.frequency.cancelScheduledValues(now);
      node.sawOsc.frequency.setTargetAtTime(freq, now, 0.03);
    }
    if (node.triOsc) {
      node.triOsc.frequency.cancelScheduledValues(now);
      node.triOsc.frequency.setTargetAtTime(freq, now, 0.03);
    }
    
    // Pulse - worklet o nativo
    if (node.pulseOsc) {
      if (node._useWorklet && node.pulseOsc.setFrequency) {
        node.pulseOsc.setFrequency(freq);
      } else if (node.pulseOsc.frequency) {
        node.pulseOsc.frequency.cancelScheduledValues(now);
        node.pulseOsc.frequency.setTargetAtTime(freq, now, 0.03);
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

  _handlePanel5AudioToggle(rowIndex, colIndex, activate) {
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
      try { conn.disconnect(); } catch (error) {}
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

window.addEventListener('DOMContentLoaded', () => {
  ensureOrientationHint();
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
  
  // Inicializar navegación del viewport
  initViewportNavigation();
  
  // Registrar service worker y detectar versión
  registerServiceWorker();
  detectBuildVersion();
  
  // Configurar UI móvil y zoom de paneles
  setupMobileQuickActionsBar();
  setupPanelZoomButtons();
  setupPanelDoubleTapZoom();
});
