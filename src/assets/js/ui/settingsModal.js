/**
 * Modal de ajustes generales
 * 
 * Permite configurar:
 * - Idioma de la interfaz
 * - Escala de renderizado (1×, 2×, 3×, 4×)
 * - Atajos de teclado
 * - Buscar actualizaciones manualmente
 * 
 * Sigue el mismo patrón visual que AudioSettingsModal.
 */

import { t, getLocale, setLocale, getSupportedLocales, onLocaleChange } from '../i18n/index.js';
import { checkForUpdates, applyUpdate, hasWaitingUpdate, onUpdateAvailable } from '../utils/serviceWorker.js';
import { keyboardShortcuts } from './keyboardShortcuts.js';
import { ConfirmDialog } from './confirmDialog.js';
import { STORAGE_KEYS, AUTOSAVE_INTERVALS, isMobileDevice } from '../utils/constants.js';
import { WakeLockManager } from '../utils/wakeLock.js';
import { showToast } from './toast.js';

/**
 * Modal de configuración general con pestañas
 * Integra: General, Audio, Grabación, Avanzado
 */
export class SettingsModal {
  /**
   * @param {Object} options
   * @param {Function} [options.onResolutionChange] - Callback cuando cambia la escala
   * @param {Function} [options.onAutoSaveIntervalChange] - Callback cuando cambia el intervalo de autoguardado
   * @param {Function} [options.onSaveOnExitChange] - Callback cuando cambia la opción de guardar al salir
   * @param {Function} [options.onRestoreOnStartChange] - Callback cuando cambia la opción de restaurar al inicio
   * @param {Function} [options.onWakeLockChange] - Callback cuando cambia la opción de mantener pantalla encendida
   * @param {import('./audioSettingsModal.js').AudioSettingsModal} [options.audioSettingsModal] - Modal de audio
   * @param {import('./recordingSettingsModal.js').RecordingSettingsModal} [options.recordingSettingsModal] - Modal de grabación
   */
  constructor(options = {}) {
    const { 
      onResolutionChange, 
      onAutoSaveIntervalChange, 
      onSaveOnExitChange, 
      onRestoreOnStartChange,
      onWakeLockChange,
      audioSettingsModal,
      recordingSettingsModal
    } = options;
    
    this.onResolutionChange = onResolutionChange;
    this.onAutoSaveIntervalChange = onAutoSaveIntervalChange;
    this.onSaveOnExitChange = onSaveOnExitChange;
    this.onRestoreOnStartChange = onRestoreOnStartChange;
    this.onWakeLockChange = onWakeLockChange;
    
    // Referencias a modales para integración
    this.audioSettingsModal = audioSettingsModal;
    this.recordingSettingsModal = recordingSettingsModal;
    
    // Pestaña activa
    this.activeTab = 'general';
    
    // Escalas disponibles: 1x, 1.5x, 2x, 2.5x, 3x (todas disponibles en cualquier dispositivo)
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.resolutionFactors = [1, 1.5, 2, 2.5, 3];
    this.isMobile = isMobile;
    this.mobileWarningThreshold = 2; // Avisar en móvil si > 2x
    
    // Escala actual: solo cargar de localStorage si "recordar" está activo
    const rememberResolution = localStorage.getItem(STORAGE_KEYS.REMEMBER_RESOLUTION) === 'true';
    const savedFactor = parseFloat(localStorage.getItem(STORAGE_KEYS.RESOLUTION));
    // Si no recordar, siempre empezar en 1x (seguro)
    this.currentResolution = (rememberResolution && this.resolutionFactors.includes(savedFactor)) ? savedFactor : 1;
    this.rememberResolution = rememberResolution;
    
    // Configuración de autoguardado
    const savedInterval = localStorage.getItem(STORAGE_KEYS.AUTOSAVE_INTERVAL);
    this.autoSaveInterval = savedInterval && AUTOSAVE_INTERVALS.hasOwnProperty(savedInterval) ? savedInterval : 'off';
    this.saveOnExit = localStorage.getItem(STORAGE_KEYS.SAVE_ON_EXIT) === 'true';
    this.restoreOnStart = localStorage.getItem(STORAGE_KEYS.RESTORE_ON_START) === 'true';
    
    // "Preguntar antes de restaurar" - por defecto true (preguntar)
    const savedAskBeforeRestore = localStorage.getItem(STORAGE_KEYS.ASK_BEFORE_RESTORE);
    this.askBeforeRestore = savedAskBeforeRestore === null ? true : savedAskBeforeRestore === 'true';
    
    // ─────────────────────────────────────────────────────────────────────
    // Optimizaciones de rendimiento
    // ─────────────────────────────────────────────────────────────────────
    
    // Debug global de optimizaciones
    this.optimizationsDebug = localStorage.getItem(STORAGE_KEYS.OPTIMIZATIONS_DEBUG) === 'true';
    
    // Dormancy system
    const savedDormancyEnabled = localStorage.getItem(STORAGE_KEYS.DORMANCY_ENABLED);
    this.dormancyEnabled = savedDormancyEnabled === null ? true : savedDormancyEnabled === 'true';
    this.dormancyDebug = localStorage.getItem(STORAGE_KEYS.DORMANCY_DEBUG) === 'true';
    
    // Filter bypass
    const savedFilterBypassEnabled = localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED);
    this.filterBypassEnabled = savedFilterBypassEnabled === null ? true : savedFilterBypassEnabled === 'true';
    this.filterBypassDebug = localStorage.getItem(STORAGE_KEYS.FILTER_BYPASS_DEBUG) === 'true';
    
    // Latency mode: 'playback' (estable) o 'interactive' (baja latencia)
    // Por defecto: móviles usan 'playback', desktop usa 'interactive'
    const savedLatencyMode = localStorage.getItem(STORAGE_KEYS.LATENCY_MODE);
    const defaultLatencyMode = isMobileDevice() ? 'playback' : 'interactive';
    this.latencyMode = savedLatencyMode || defaultLatencyMode;
    
    // ─────────────────────────────────────────────────────────────────────
    // Emulación de voltajes (Synthi 100 Cuenca/Datanomics 1982)
    // ─────────────────────────────────────────────────────────────────────
    
    // Soft clipping: activado por defecto
    const savedSoftClip = localStorage.getItem(STORAGE_KEYS.VOLTAGE_SOFT_CLIP_ENABLED);
    this.voltageSoftClipEnabled = savedSoftClip === null ? true : savedSoftClip === 'true';
    
    // Pin tolerance: activado por defecto
    const savedPinTolerance = localStorage.getItem(STORAGE_KEYS.VOLTAGE_PIN_TOLERANCE_ENABLED);
    this.voltagePinToleranceEnabled = savedPinTolerance === null ? true : savedPinTolerance === 'true';
    
    // Thermal drift: activado por defecto
    const savedThermalDrift = localStorage.getItem(STORAGE_KEYS.VOLTAGE_THERMAL_DRIFT_ENABLED);
    this.voltageThermalDriftEnabled = savedThermalDrift === null ? true : savedThermalDrift === 'true';

    // Detectar Firefox (no necesita selector de resolución)
    this.isFirefox = /Firefox\/\d+/.test(navigator.userAgent);
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.isOpen = false;
    
    // Selectores
    this.languageSelect = null;
    this.resolutionSelect = null;
    
    // Crear modal
    this._create();
    
    // Escuchar cambios de idioma para actualizar textos
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
    
    // Escuchar cuando hay actualización disponible para actualizar el UI
    this._unsubscribeUpdate = onUpdateAvailable((available) => {
      if (available && this.updateCheckBtn) {
        this._showUpdateAvailable();
      }
    });
    
    // NOTA: La resolución guardada se aplica directamente en viewportNavigation.js
    // al inicializar, leyendo de localStorage. No es necesario hacerlo aquí.
  }
  
  /**
   * Abre el modal
   * @param {string} [tabId] - ID de pestaña a activar (general, audio, recording, advanced)
   */
  open(tabId) {
    if (this.isOpen) return;
    this.isOpen = true;
    
    // Cambiar a pestaña específica si se indica
    if (tabId && ['general', 'audio', 'recording', 'advanced', 'about'].includes(tabId)) {
      this._switchTab(tabId);
    }
    
    this.overlay.classList.add('settings-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    
    requestAnimationFrame(() => {
      const closeBtn = this.modal.querySelector('.settings-modal__close');
      if (closeBtn) closeBtn.focus();
    });
  }
  
  /**
   * Cierra el modal
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('settings-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'true');
  }
  
  /**
   * Alterna el estado del modal
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  /**
   * Obtiene la escala actual
   * @returns {number}
   */
  getResolution() {
    return this.currentResolution;
  }
  
  /**
   * Crea la estructura DOM del modal
   */
  _create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    
    // Contenedor modal
    this.modal = document.createElement('div');
    this.modal.className = 'settings-modal settings-modal--tabbed';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-labelledby', 'settingsTitle');
    this.modal.setAttribute('aria-modal', 'true');
    
    // Header
    const header = document.createElement('div');
    header.className = 'settings-modal__header';
    
    this.titleElement = document.createElement('h2');
    this.titleElement.id = 'settingsTitle';
    this.titleElement.className = 'settings-modal__title';
    this.titleElement.textContent = t('settings.title');
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'settings-modal__close';
    closeBtn.setAttribute('aria-label', t('settings.close'));
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());
    
    header.appendChild(this.titleElement);
    header.appendChild(closeBtn);
    
    // Pestañas
    const tabsContainer = this._createTabs();
    
    // Body con contenido de pestañas
    const body = document.createElement('div');
    body.className = 'settings-modal__body';
    
    // Contenedores de cada pestaña (lazy loading para performance)
    this.tabContents = {};
    this.tabContentCreated = {
      general: false,
      display: false,
      audio: false,
      recording: false,
      advanced: false,
      about: false
    };
    
    // Crear solo la pestaña General al inicio
    this.tabContents.general = this._createGeneralTabContent();
    this.tabContentCreated.general = true;
    body.appendChild(this.tabContents.general);
    
    // Contenedor del body para lazy loading
    this.bodyElement = body;
    
    // Activar pestaña inicial
    this._switchTab('general');
    
    // Ensamblar modal
    this.modal.appendChild(header);
    this.modal.appendChild(tabsContainer);
    this.modal.appendChild(body);
    this.overlay.appendChild(this.modal);
    
    // Cerrar al hacer clic fuera del modal
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    
    // Añadir al DOM
    document.body.appendChild(this.overlay);
  }
  
  /**
   * Crea las pestañas de navegación
   */
  _createTabs() {
    const container = document.createElement('div');
    container.className = 'settings-modal__tabs';
    
    const tabs = [
      { id: 'general', label: t('settings.tab.general') },
      { id: 'display', label: t('settings.tab.display') },
      { id: 'audio', label: t('settings.tab.audio') },
      { id: 'recording', label: t('settings.tab.recording') },
      { id: 'advanced', label: t('settings.tab.advanced') },
      { id: 'osc', label: t('settings.tab.osc') },
      { id: 'about', label: t('settings.tab.about') }
    ];
    
    this.tabButtons = {};
    
    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-modal__tab';
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this._switchTab(tab.id));
      
      this.tabButtons[tab.id] = btn;
      container.appendChild(btn);
    });
    
    return container;
  }
  
  /**
   * Cambia a una pestaña específica
   */
  _switchTab(tabId) {
    this.activeTab = tabId;
    
    // Lazy load: crear pestaña si no existe
    if (!this.tabContentCreated[tabId]) {
      let content;
      switch (tabId) {
        case 'display':
          content = this._createDisplayTabContent();
          break;
        case 'audio':
          content = this._createAudioTabContent();
          break;
        case 'recording':
          content = this._createRecordingTabContent();
          break;
        case 'advanced':
          content = this._createAdvancedTabContent();
          break;
        case 'osc':
          content = this._createOSCTabContent();
          break;
        case 'about':
          content = this._createAboutTabContent();
          break;
        default:
          return; // general ya está creada
      }
      this.tabContents[tabId] = content;
      this.tabContentCreated[tabId] = true;
      this.bodyElement.appendChild(content);
    }
    
    // Actualizar botones
    Object.entries(this.tabButtons).forEach(([id, btn]) => {
      btn.classList.toggle('settings-modal__tab--active', id === tabId);
    });
    
    // Mostrar/ocultar contenidos
    if (this.tabContents) {
      Object.entries(this.tabContents).forEach(([id, content]) => {
        content.classList.toggle('settings-tab-content--active', id === tabId);
      });
    }
    
    // Refrescar dispositivos de audio al entrar en la pestaña Audio
    if (tabId === 'audio' && this.audioSettingsModal) {
      this.audioSettingsModal.refreshDevices();
    }
  }
  
  /**
   * Crea el contenido de la pestaña General
   */
  _createGeneralTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'general';
    
    // Idioma
    container.appendChild(this._createLanguageSection());
    
    // Autoguardado
    container.appendChild(this._createAutoSaveSection());
    
    // Pantalla (Wake Lock)
    container.appendChild(this._createWakeLockSection());
    
    // Atajos de teclado
    container.appendChild(this._createShortcutsSection());
    
    return container;
  }
  
  /**
   * Crea el contenido de la pestaña Visualización
   */
  _createDisplayTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'display';
    
    // Escala de renderizado (oculta en Firefox)
    if (!this.isFirefox) {
      container.appendChild(this._createResolutionSection());
    }
    
    // Pines inactivos de la matriz
    container.appendChild(this._createInactivePinsSection());
    
    // Paneles flotantes (PiP)
    container.appendChild(this._createPipSection());
    
    // Información de parámetros (tooltips)
    container.appendChild(this._createParamInfoSection());
    
    return container;
  }
  
  /**
   * Crea el contenido de la pestaña Audio
   */
  _createAudioTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'audio';
    
    if (this.audioSettingsModal) {
      const content = this.audioSettingsModal.createEmbeddableContent();
      container.appendChild(content);
    } else {
      const placeholder = document.createElement('p');
      placeholder.className = 'settings-section__description';
      placeholder.textContent = 'Audio settings not available';
      container.appendChild(placeholder);
    }
    
    return container;
  }
  
  /**
   * Crea el contenido de la pestaña Recording
   */
  _createRecordingTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'recording';
    
    if (this.recordingSettingsModal) {
      const content = this.recordingSettingsModal.createEmbeddableContent();
      container.appendChild(content);
    } else {
      const placeholder = document.createElement('p');
      placeholder.className = 'settings-section__description';
      placeholder.textContent = 'Recording settings not available';
      container.appendChild(placeholder);
    }
    
    return container;
  }
  
  /**
   * Crea el contenido de la pestaña Advanced
   */
  _createAdvancedTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'advanced';
    
    // Optimizaciones de rendimiento (agrupa dormancy + filter bypass + futuras)
    container.appendChild(this._createOptimizationsSection());
    
    // Emulación de voltajes (Synthi 100 Cuenca/Datanomics 1982)
    container.appendChild(this._createVoltageEmulationSection());
    
    // Actualizaciones
    container.appendChild(this._createUpdatesSection());
    
    // Reset
    container.appendChild(this._createResetSection());
    
    return container;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA: OSC
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Crea el contenido de la pestaña OSC
   */
  _createOSCTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'osc';
    
    // Descripción de OSC
    container.appendChild(this._createOSCDescriptionSection());
    
    // Habilitar OSC
    container.appendChild(this._createOSCEnableSection());
    
    // Modo de comunicación
    container.appendChild(this._createOSCModeSection());
    
    // Prefijo de direcciones
    container.appendChild(this._createOSCPrefixSection());
    
    // Targets unicast
    container.appendChild(this._createOSCTargetsSection());
    
    // Log flotante
    container.appendChild(this._createOSCLogSection());
    
    return container;
  }
  
  /**
   * Sección: Descripción de OSC
   */
  _createOSCDescriptionSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.osc.title');
    section.appendChild(title);
    
    const description = document.createElement('p');
    description.className = 'settings-section__description';
    description.textContent = t('settings.osc.description');
    section.appendChild(description);
    
    // Estado actual
    const statusRow = document.createElement('div');
    statusRow.className = 'settings-row';
    
    const statusLabel = document.createElement('span');
    statusLabel.className = 'settings-row__label';
    statusLabel.textContent = t('settings.osc.status');
    statusRow.appendChild(statusLabel);
    
    const statusValue = document.createElement('span');
    statusValue.className = 'settings-row__value osc-status';
    statusValue.id = 'osc-status-indicator';
    this._updateOSCStatusIndicator(statusValue);
    statusRow.appendChild(statusValue);
    
    section.appendChild(statusRow);
    
    return section;
  }
  
  /**
   * Actualiza el indicador de estado OSC
   */
  async _updateOSCStatusIndicator(element) {
    const isElectron = typeof window.oscAPI !== 'undefined';
    
    if (!isElectron) {
      element.textContent = t('settings.osc.electronOnly');
      element.classList.add('osc-status--disabled');
      return;
    }
    
    try {
      const status = await window.oscAPI.getStatus();
      if (status.running) {
        element.textContent = t('settings.osc.status.running');
        element.classList.remove('osc-status--stopped', 'osc-status--error', 'osc-status--disabled');
        element.classList.add('osc-status--running');
      } else {
        element.textContent = t('settings.osc.status.stopped');
        element.classList.remove('osc-status--running', 'osc-status--error', 'osc-status--disabled');
        element.classList.add('osc-status--stopped');
      }
    } catch (error) {
      element.textContent = t('settings.osc.status.error');
      element.classList.remove('osc-status--running', 'osc-status--stopped', 'osc-status--disabled');
      element.classList.add('osc-status--error');
    }
  }
  
  /**
   * Sección: Habilitar OSC
   */
  _createOSCEnableSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    // OSC siempre empieza apagado, no leer de localStorage
    const enabled = false;
    
    const row = document.createElement('div');
    row.className = 'settings-row';
    
    const label = document.createElement('label');
    label.className = 'settings-row__label';
    label.htmlFor = 'osc-enable-checkbox';
    label.textContent = t('settings.osc.enable');
    row.appendChild(label);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'osc-enable-checkbox';
    checkbox.className = 'settings-checkbox';
    checkbox.checked = enabled;
    checkbox.disabled = !isElectron;
    
    checkbox.addEventListener('change', async () => {
      localStorage.setItem(STORAGE_KEYS.OSC_ENABLED, checkbox.checked);
      
      if (checkbox.checked) {
        await this._startOSC();
      } else {
        await this._stopOSC();
      }
      
      // Actualizar indicador de estado
      const statusEl = document.getElementById('osc-status-indicator');
      if (statusEl) {
        this._updateOSCStatusIndicator(statusEl);
      }
      
      // Notificar al quickbar del cambio
      document.dispatchEvent(new CustomEvent('osc:statusChanged', { 
        detail: { enabled: checkbox.checked } 
      }));
    });
    
    // Escuchar cambios desde quickbar para sincronizar
    document.addEventListener('osc:statusChanged', (e) => {
      checkbox.checked = e.detail?.enabled ?? false;
      // Actualizar indicador de estado
      const statusEl = document.getElementById('osc-status-indicator');
      if (statusEl) {
        this._updateOSCStatusIndicator(statusEl);
      }
    });
    
    row.appendChild(checkbox);
    section.appendChild(row);
    
    if (!isElectron) {
      const warning = document.createElement('p');
      warning.className = 'settings-section__warning';
      warning.textContent = t('settings.osc.electronOnly');
      section.appendChild(warning);
    }
    
    return section;
  }
  
  /**
   * Sección: Modo de comunicación OSC
   */
  _createOSCModeSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.osc.mode');
    section.appendChild(title);
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    const currentMode = localStorage.getItem(STORAGE_KEYS.OSC_MODE) || 'peer';
    
    const modes = [
      { value: 'peer', label: t('settings.osc.mode.peer') },
      { value: 'master', label: t('settings.osc.mode.master') },
      { value: 'slave', label: t('settings.osc.mode.slave') }
    ];
    
    modes.forEach(mode => {
      const row = document.createElement('div');
      row.className = 'settings-row';
      
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'osc-mode';
      radio.id = `osc-mode-${mode.value}`;
      radio.value = mode.value;
      radio.checked = currentMode === mode.value;
      radio.disabled = !isElectron;
      
      radio.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEYS.OSC_MODE, mode.value);
        // Notificar al bridge si existe
        if (window.oscBridge) {
          window.oscBridge.setMode(mode.value);
        }
      });
      
      const label = document.createElement('label');
      label.htmlFor = radio.id;
      label.textContent = mode.label;
      
      row.appendChild(radio);
      row.appendChild(label);
      section.appendChild(row);
    });
    
    return section;
  }
  
  /**
   * Sección: Prefijo de direcciones OSC
   */
  _createOSCPrefixSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.osc.prefix');
    section.appendChild(title);
    
    const description = document.createElement('p');
    description.className = 'settings-section__description';
    description.textContent = t('settings.osc.prefix.description');
    section.appendChild(description);
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    const currentPrefix = localStorage.getItem(STORAGE_KEYS.OSC_PREFIX) || '/SynthiGME/';
    
    const row = document.createElement('div');
    row.className = 'settings-row';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'osc-prefix-input';
    input.className = 'settings-input';
    input.value = currentPrefix;
    input.placeholder = '/SynthiGME/';
    input.disabled = !isElectron;
    
    input.addEventListener('change', () => {
      let prefix = input.value.trim();
      // Asegurar que empiece y termine con /
      if (!prefix.startsWith('/')) prefix = '/' + prefix;
      if (!prefix.endsWith('/')) prefix = prefix + '/';
      input.value = prefix;
      localStorage.setItem(STORAGE_KEYS.OSC_PREFIX, prefix);
      
      // Notificar al bridge si existe
      if (window.oscBridge) {
        window.oscBridge.setPrefix(prefix);
      }
    });
    
    row.appendChild(input);
    section.appendChild(row);
    
    return section;
  }
  
  /**
   * Sección: Targets unicast
   */
  _createOSCTargetsSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.osc.targets');
    section.appendChild(title);
    
    const description = document.createElement('p');
    description.className = 'settings-section__description';
    description.textContent = t('settings.osc.targets.description');
    section.appendChild(description);
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    
    // Lista de targets
    const targetsList = document.createElement('div');
    targetsList.className = 'osc-targets-list';
    targetsList.id = 'osc-targets-list';
    section.appendChild(targetsList);
    
    // Cargar targets existentes
    this._loadOSCTargets(targetsList);
    
    // Formulario para añadir nuevo target
    const addForm = document.createElement('div');
    addForm.className = 'osc-targets-add';
    
    const ipInput = document.createElement('input');
    ipInput.type = 'text';
    ipInput.className = 'settings-input osc-targets-add__ip';
    ipInput.placeholder = t('settings.osc.targets.ip');
    ipInput.disabled = !isElectron;
    
    const portInput = document.createElement('input');
    portInput.type = 'number';
    portInput.className = 'settings-input osc-targets-add__port';
    portInput.placeholder = t('settings.osc.targets.port');
    portInput.value = '57120';
    portInput.min = '1';
    portInput.max = '65535';
    portInput.disabled = !isElectron;
    
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'settings-button';
    addButton.textContent = t('settings.osc.targets.add');
    addButton.disabled = !isElectron;
    
    addButton.addEventListener('click', async () => {
      const ip = ipInput.value.trim();
      const port = parseInt(portInput.value, 10);
      
      if (ip && port > 0 && port <= 65535) {
        await this._addOSCTarget(ip, port);
        ipInput.value = '';
        this._loadOSCTargets(targetsList);
      }
    });
    
    addForm.appendChild(ipInput);
    addForm.appendChild(portInput);
    addForm.appendChild(addButton);
    section.appendChild(addForm);
    
    return section;
  }
  
  /**
   * Carga los targets OSC desde localStorage y la API
   */
  async _loadOSCTargets(container) {
    container.innerHTML = '';
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    if (!isElectron) return;
    
    try {
      const targets = await window.oscAPI.getTargets();
      
      targets.forEach(target => {
        const row = document.createElement('div');
        row.className = 'osc-target-row';
        
        const address = document.createElement('span');
        address.className = 'osc-target-row__address';
        address.textContent = `${target.ip}:${target.port}`;
        row.appendChild(address);
        
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'settings-button settings-button--danger';
        removeBtn.textContent = t('settings.osc.targets.remove');
        removeBtn.addEventListener('click', async () => {
          await this._removeOSCTarget(target.ip, target.port);
          this._loadOSCTargets(container);
        });
        row.appendChild(removeBtn);
        
        container.appendChild(row);
      });
    } catch (error) {
      console.error('Error loading OSC targets:', error);
    }
  }
  
  /**
   * Añade un target unicast OSC
   */
  async _addOSCTarget(ip, port) {
    if (typeof window.oscAPI === 'undefined') return;
    
    try {
      await window.oscAPI.addTarget(ip, port);
      
      // Guardar en localStorage para persistencia
      const targets = JSON.parse(localStorage.getItem(STORAGE_KEYS.OSC_UNICAST_TARGETS) || '[]');
      if (!targets.some(t => t.ip === ip && t.port === port)) {
        targets.push({ ip, port });
        localStorage.setItem(STORAGE_KEYS.OSC_UNICAST_TARGETS, JSON.stringify(targets));
      }
    } catch (error) {
      console.error('Error adding OSC target:', error);
    }
  }
  
  /**
   * Elimina un target unicast OSC
   */
  async _removeOSCTarget(ip, port) {
    if (typeof window.oscAPI === 'undefined') return;
    
    try {
      await window.oscAPI.removeTarget(ip, port);
      
      // Actualizar localStorage
      const targets = JSON.parse(localStorage.getItem(STORAGE_KEYS.OSC_UNICAST_TARGETS) || '[]');
      const filtered = targets.filter(t => !(t.ip === ip && t.port === port));
      localStorage.setItem(STORAGE_KEYS.OSC_UNICAST_TARGETS, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing OSC target:', error);
    }
  }
  
  /**
   * Sección: Log flotante de OSC
   */
  _createOSCLogSection() {
    const section = document.createElement('section');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.osc.log');
    section.appendChild(title);
    
    const isElectron = typeof window.oscAPI !== 'undefined';
    const showLog = localStorage.getItem(STORAGE_KEYS.OSC_LOG_VISIBLE) === 'true';
    
    const row = document.createElement('div');
    row.className = 'settings-row';
    
    const label = document.createElement('label');
    label.className = 'settings-row__label';
    label.htmlFor = 'osc-log-checkbox';
    label.textContent = t('settings.osc.log.show');
    row.appendChild(label);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'osc-log-checkbox';
    checkbox.className = 'settings-checkbox';
    checkbox.checked = showLog;
    checkbox.disabled = !isElectron;
    
    checkbox.addEventListener('change', () => {
      localStorage.setItem(STORAGE_KEYS.OSC_LOG_VISIBLE, checkbox.checked);
      // Emitir evento para que el log window responda
      // La ventana solo se mostrará si OSC está activo (controlado en oscLogWindow)
      window.dispatchEvent(new CustomEvent('osc:log-visibility', { 
        detail: { visible: checkbox.checked } 
      }));
    });
    
    row.appendChild(checkbox);
    section.appendChild(row);
    
    return section;
  }
  
  /**
   * Inicia el servidor OSC
   */
  async _startOSC() {
    if (typeof window.oscAPI === 'undefined') return;
    
    try {
      await window.oscAPI.start();
      
      // Restaurar targets guardados
      const targets = JSON.parse(localStorage.getItem(STORAGE_KEYS.OSC_UNICAST_TARGETS) || '[]');
      for (const target of targets) {
        await window.oscAPI.addTarget(target.ip, target.port);
      }
    } catch (error) {
      console.error('Error starting OSC:', error);
    }
  }
  
  /**
   * Detiene el servidor OSC
   */
  async _stopOSC() {
    if (typeof window.oscAPI === 'undefined') return;
    
    try {
      await window.oscAPI.stop();
    } catch (error) {
      console.error('Error stopping OSC:', error);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PESTAÑA: ACERCA DE
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Crea el contenido de la pestaña Acerca de
   */
  _createAboutTabContent() {
    const container = document.createElement('div');
    container.className = 'settings-tab-content';
    container.dataset.tab = 'about';
    
    // Descripción del proyecto
    container.appendChild(this._createAboutDescriptionSection());
    
    // Información del proyecto (versión, autor, licencia)
    container.appendChild(this._createAboutInfoSection());
    
    // Enlaces
    container.appendChild(this._createAboutLinksSection());
    
    // Créditos
    container.appendChild(this._createAboutCreditsSection());
    
    return container;
  }
  
  /**
   * Crea la sección de descripción del proyecto
   */
  _createAboutDescriptionSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = 'SynthiGME-web';
    
    const desc = document.createElement('p');
    desc.className = 'settings-section__description settings-about__description';
    desc.textContent = t('settings.about.description');
    this.aboutDescElement = desc;
    
    section.appendChild(title);
    section.appendChild(desc);
    
    return section;
  }
  
  /**
   * Crea la sección de información del proyecto
   */
  _createAboutInfoSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.about.info');
    this.aboutInfoTitleElement = title;
    
    const infoList = document.createElement('dl');
    infoList.className = 'settings-about__info-list';
    
    // Versión
    const versionDt = document.createElement('dt');
    versionDt.textContent = t('settings.about.version');
    this.aboutVersionLabelElement = versionDt;
    const versionDd = document.createElement('dd');
    versionDd.textContent = window.__synthBuildVersion || '0.0.1';
    infoList.appendChild(versionDt);
    infoList.appendChild(versionDd);
    
    // Autor
    const authorDt = document.createElement('dt');
    authorDt.textContent = t('settings.about.author');
    this.aboutAuthorLabelElement = authorDt;
    const authorDd = document.createElement('dd');
    authorDd.textContent = 'Carlos Arturo Guerra Parra';
    infoList.appendChild(authorDt);
    infoList.appendChild(authorDd);
    
    // Licencia
    const licenseDt = document.createElement('dt');
    licenseDt.textContent = t('settings.about.license');
    this.aboutLicenseLabelElement = licenseDt;
    const licenseDd = document.createElement('dd');
    licenseDd.textContent = 'MIT License';
    infoList.appendChild(licenseDt);
    infoList.appendChild(licenseDd);
    
    section.appendChild(title);
    section.appendChild(infoList);
    
    return section;
  }
  
  /**
   * Crea la sección de enlaces
   */
  _createAboutLinksSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.about.links');
    this.aboutLinksTitleElement = title;
    
    const linksList = document.createElement('ul');
    linksList.className = 'settings-about__links-list';
    
    // Repositorio GitHub
    const repoLi = document.createElement('li');
    const repoLink = document.createElement('a');
    repoLink.href = 'https://github.com/mesjetiu/SynthiGME-web';
    repoLink.target = '_blank';
    repoLink.rel = 'noopener noreferrer';
    repoLink.textContent = t('settings.about.repository');
    this.aboutRepoLinkElement = repoLink;
    repoLi.appendChild(repoLink);
    linksList.appendChild(repoLi);
    
    // Reportar problema / Contacto (GitHub Issues)
    const issuesLi = document.createElement('li');
    const issuesLink = document.createElement('a');
    issuesLink.href = 'https://github.com/mesjetiu/SynthiGME-web/issues';
    issuesLink.target = '_blank';
    issuesLink.rel = 'noopener noreferrer';
    issuesLink.textContent = t('settings.about.issues');
    this.aboutIssuesLinkElement = issuesLink;
    issuesLi.appendChild(issuesLink);
    linksList.appendChild(issuesLi);
    
    // Proyecto original (SuperCollider)
    const originalLi = document.createElement('li');
    const originalLink = document.createElement('a');
    originalLink.href = 'https://github.com/mesjetiu/SynthiGME';
    originalLink.target = '_blank';
    originalLink.rel = 'noopener noreferrer';
    originalLink.textContent = t('settings.about.originalProject');
    this.aboutOriginalLinkElement = originalLink;
    originalLi.appendChild(originalLink);
    linksList.appendChild(originalLi);
    
    section.appendChild(title);
    section.appendChild(linksList);
    
    return section;
  }
  
  /**
   * Crea la sección de créditos
   */
  _createAboutCreditsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    const title = document.createElement('h3');
    title.className = 'settings-section__title';
    title.textContent = t('settings.about.credits');
    this.aboutCreditsTitleElement = title;
    
    const creditsList = document.createElement('ul');
    creditsList.className = 'settings-about__credits-list';
    
    // Iconos de la app: Sylvia Molina Muro
    const iconsLi = document.createElement('li');
    const iconsLabel = document.createElement('span');
    iconsLabel.className = 'settings-about__credit-label';
    iconsLabel.textContent = t('settings.about.credits.appIcons');
    this.aboutAppIconsLabelElement = iconsLabel;
    const iconsValue = document.createElement('span');
    iconsValue.textContent = 'Sylvia Molina Muro';
    iconsLi.appendChild(iconsLabel);
    iconsLi.appendChild(iconsValue);
    creditsList.appendChild(iconsLi);
    
    // Iconos de UI: Tabler Icons
    const tablerLi = document.createElement('li');
    const tablerLabel = document.createElement('span');
    tablerLabel.className = 'settings-about__credit-label';
    tablerLabel.textContent = t('settings.about.credits.uiIcons');
    this.aboutUiIconsLabelElement = tablerLabel;
    const tablerLink = document.createElement('a');
    tablerLink.href = 'https://tabler.io/icons';
    tablerLink.target = '_blank';
    tablerLink.rel = 'noopener noreferrer';
    tablerLink.textContent = 'Tabler Icons (MIT)';
    tablerLi.appendChild(tablerLabel);
    tablerLi.appendChild(tablerLink);
    creditsList.appendChild(tablerLi);
    
    // Inspiración: EMS Synthi 100
    const inspirationLi = document.createElement('li');
    const inspirationLabel = document.createElement('span');
    inspirationLabel.className = 'settings-about__credit-label';
    inspirationLabel.textContent = t('settings.about.credits.inspiration');
    this.aboutInspirationLabelElement = inspirationLabel;
    const inspirationValue = document.createElement('span');
    inspirationValue.textContent = 'EMS Synthi 100 – GME de Cuenca';
    inspirationLi.appendChild(inspirationLabel);
    inspirationLi.appendChild(inspirationValue);
    creditsList.appendChild(inspirationLi);
    
    section.appendChild(title);
    section.appendChild(creditsList);
    
    return section;
  }
  
  /**
   * Crea la sección de selección de idioma
   */
  _createLanguageSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.languageTitleElement = document.createElement('h3');
    this.languageTitleElement.className = 'settings-section__title';
    this.languageTitleElement.textContent = t('settings.language');
    
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'settings-select-wrapper';
    
    this.languageSelect = document.createElement('select');
    this.languageSelect.className = 'settings-select';
    
    // Opciones de idioma
    const locales = getSupportedLocales();
    const currentLocale = getLocale();
    
    locales.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = t(`settings.language.${lang}`);
      option.selected = lang === currentLocale;
      this.languageSelect.appendChild(option);
    });
    
    this.languageSelect.addEventListener('change', async () => {
      const newLang = this.languageSelect.value;
      await setLocale(newLang);
    });
    
    selectWrapper.appendChild(this.languageSelect);
    section.appendChild(this.languageTitleElement);
    section.appendChild(selectWrapper);
    
    return section;
  }
  
  /**
   * Crea la sección de escala de renderizado
   * Usa dropdown + checkbox "recordar" en lugar de botones
   */
  _createResolutionSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.resolutionTitleElement = document.createElement('h3');
    this.resolutionTitleElement.className = 'settings-section__title';
    this.resolutionTitleElement.textContent = t('settings.scale');
    
    this.resolutionDescElement = document.createElement('p');
    this.resolutionDescElement.className = 'settings-section__description';
    this.resolutionDescElement.textContent = t('settings.scale.description');
    
    // Fila con dropdown de escala
    const scaleRow = document.createElement('div');
    scaleRow.className = 'settings-row settings-row--select';
    
    this.resolutionSelectLabelElement = document.createElement('label');
    this.resolutionSelectLabelElement.className = 'settings-row__label';
    this.resolutionSelectLabelElement.textContent = t('settings.scale.current');
    this.resolutionSelectLabelElement.setAttribute('for', 'resolutionSelect');
    
    this.resolutionSelect = document.createElement('select');
    this.resolutionSelect.id = 'resolutionSelect';
    this.resolutionSelect.className = 'settings-select';
    
    this.resolutionFactors.forEach(factor => {
      const option = document.createElement('option');
      option.value = factor;
      option.textContent = `${factor}×`;
      if (factor === this.currentResolution) {
        option.selected = true;
      }
      this.resolutionSelect.appendChild(option);
    });
    
    this.resolutionSelect.addEventListener('change', () => {
      const factor = parseFloat(this.resolutionSelect.value);
      this._setResolution(factor);
    });
    
    scaleRow.appendChild(this.resolutionSelectLabelElement);
    scaleRow.appendChild(this.resolutionSelect);
    
    // Checkbox "Recordar para próximos reinicios"
    const rememberRow = document.createElement('div');
    rememberRow.className = 'settings-row settings-row--checkbox';
    
    this.rememberResolutionCheckbox = document.createElement('input');
    this.rememberResolutionCheckbox.type = 'checkbox';
    this.rememberResolutionCheckbox.id = 'rememberResolutionCheckbox';
    this.rememberResolutionCheckbox.className = 'settings-checkbox';
    this.rememberResolutionCheckbox.checked = this.rememberResolution;
    
    this.rememberResolutionLabelElement = document.createElement('label');
    this.rememberResolutionLabelElement.className = 'settings-checkbox-label';
    this.rememberResolutionLabelElement.setAttribute('for', 'rememberResolutionCheckbox');
    this.rememberResolutionLabelElement.textContent = t('settings.scale.remember');
    
    this.rememberResolutionCheckbox.addEventListener('change', () => {
      this.rememberResolution = this.rememberResolutionCheckbox.checked;
      localStorage.setItem(STORAGE_KEYS.REMEMBER_RESOLUTION, String(this.rememberResolution));
      // Si se activa "recordar", guardar la escala actual
      if (this.rememberResolution) {
        localStorage.setItem(STORAGE_KEYS.RESOLUTION, String(this.currentResolution));
      }
    });
    
    rememberRow.appendChild(this.rememberResolutionCheckbox);
    rememberRow.appendChild(this.rememberResolutionLabelElement);
    
    section.appendChild(this.resolutionTitleElement);
    section.appendChild(this.resolutionDescElement);
    section.appendChild(scaleRow);
    section.appendChild(rememberRow);
    
    return section;
  }
  
  /**
   * Crea la sección de visualización de pines inactivos
   * @returns {HTMLElement}
   */
  _createInactivePinsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.inactivePinsTitleElement = document.createElement('h3');
    this.inactivePinsTitleElement.className = 'settings-section__title';
    this.inactivePinsTitleElement.textContent = t('settings.display.inactivePins');
    section.appendChild(this.inactivePinsTitleElement);
    
    this.inactivePinsDescElement = document.createElement('p');
    this.inactivePinsDescElement.className = 'settings-section__description';
    this.inactivePinsDescElement.textContent = t('settings.display.inactivePins.description');
    section.appendChild(this.inactivePinsDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox para mostrar/ocultar pines inactivos
    // ─────────────────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'settings-row settings-row--checkbox';
    
    this.inactivePinsCheckbox = document.createElement('input');
    this.inactivePinsCheckbox.type = 'checkbox';
    this.inactivePinsCheckbox.id = 'inactivePinsCheckbox';
    this.inactivePinsCheckbox.className = 'settings-checkbox';
    
    // Cargar preferencia guardada (por defecto false = atenuados)
    const savedPref = localStorage.getItem(STORAGE_KEYS.SHOW_INACTIVE_PINS);
    this.showInactivePins = savedPref === 'true';
    this.inactivePinsCheckbox.checked = this.showInactivePins;
    
    this.inactivePinsLabelElement = document.createElement('label');
    this.inactivePinsLabelElement.className = 'settings-checkbox-label';
    this.inactivePinsLabelElement.htmlFor = 'inactivePinsCheckbox';
    this.inactivePinsLabelElement.textContent = t('settings.display.inactivePins.show');
    
    this.inactivePinsCheckbox.addEventListener('change', () => {
      this._setShowInactivePins(this.inactivePinsCheckbox.checked);
    });
    
    row.appendChild(this.inactivePinsCheckbox);
    row.appendChild(this.inactivePinsLabelElement);
    section.appendChild(row);
    
    return section;
  }
  
  /**
   * Establece si se muestran los pines inactivos
   * @param {boolean} show
   */
  _setShowInactivePins(show) {
    this.showInactivePins = show;
    localStorage.setItem(STORAGE_KEYS.SHOW_INACTIVE_PINS, String(show));
    
    // Notificar mediante evento para actualizar en caliente
    document.dispatchEvent(new CustomEvent('synth:showInactivePinsChange', { 
      detail: { show } 
    }));
  }
  
  /**
   * Obtiene si se muestran los pines inactivos
   * @returns {boolean}
   */
  getShowInactivePins() {
    return this.showInactivePins;
  }
  
  /**
   * Crea la sección de paneles flotantes (PiP)
   * @returns {HTMLElement}
   */
  _createPipSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.pipTitleElement = document.createElement('h3');
    this.pipTitleElement.className = 'settings-section__title';
    this.pipTitleElement.textContent = t('settings.display.pip');
    section.appendChild(this.pipTitleElement);
    
    this.pipDescElement = document.createElement('p');
    this.pipDescElement.className = 'settings-section__description';
    this.pipDescElement.textContent = t('settings.display.pip.description');
    section.appendChild(this.pipDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox para recordar paneles PiP entre sesiones
    // ─────────────────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'settings-row settings-row--checkbox';
    
    this.pipRememberCheckbox = document.createElement('input');
    this.pipRememberCheckbox.type = 'checkbox';
    this.pipRememberCheckbox.id = 'pipRememberCheckbox';
    this.pipRememberCheckbox.className = 'settings-checkbox';
    
    // Cargar preferencia guardada (por defecto true = recordar)
    const savedPref = localStorage.getItem(STORAGE_KEYS.PIP_REMEMBER);
    this.rememberPips = savedPref !== 'false'; // true por defecto
    this.pipRememberCheckbox.checked = this.rememberPips;
    
    this.pipRememberLabelElement = document.createElement('label');
    this.pipRememberLabelElement.className = 'settings-checkbox-label';
    this.pipRememberLabelElement.htmlFor = 'pipRememberCheckbox';
    this.pipRememberLabelElement.textContent = t('settings.display.pip.remember');
    
    this.pipRememberCheckbox.addEventListener('change', () => {
      this._setRememberPips(this.pipRememberCheckbox.checked);
    });
    
    row.appendChild(this.pipRememberCheckbox);
    row.appendChild(this.pipRememberLabelElement);
    section.appendChild(row);
    
    return section;
  }
  
  /**
   * Establece si se recuerdan los paneles PiP entre sesiones
   * @param {boolean} remember
   */
  _setRememberPips(remember) {
    this.rememberPips = remember;
    localStorage.setItem(STORAGE_KEYS.PIP_REMEMBER, String(remember));
    
    // Si se desactiva, limpiar estado guardado
    if (!remember) {
      localStorage.removeItem(STORAGE_KEYS.PIP_STATE);
    }
  }

  /**
   * Crea la sección de información de parámetros (tooltips)
   * @returns {HTMLElement}
   */
  _createParamInfoSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.paramInfoTitleElement = document.createElement('h3');
    this.paramInfoTitleElement.className = 'settings-section__title';
    this.paramInfoTitleElement.textContent = t('settings.display.paramInfo');
    section.appendChild(this.paramInfoTitleElement);
    
    this.paramInfoDescElement = document.createElement('p');
    this.paramInfoDescElement.className = 'settings-section__description';
    this.paramInfoDescElement.textContent = t('settings.display.paramInfo.description');
    section.appendChild(this.paramInfoDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox para mostrar valores de voltaje
    // ─────────────────────────────────────────────────────────────────────
    const voltageRow = document.createElement('div');
    voltageRow.className = 'settings-row settings-row--checkbox';
    
    this.tooltipVoltageCheckbox = document.createElement('input');
    this.tooltipVoltageCheckbox.type = 'checkbox';
    this.tooltipVoltageCheckbox.id = 'tooltipVoltageCheckbox';
    this.tooltipVoltageCheckbox.className = 'settings-checkbox';
    
    // Cargar preferencia guardada (por defecto true)
    const savedVoltage = localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE);
    this.showTooltipVoltage = savedVoltage !== 'false';
    this.tooltipVoltageCheckbox.checked = this.showTooltipVoltage;
    
    this.tooltipVoltageLabelElement = document.createElement('label');
    this.tooltipVoltageLabelElement.className = 'settings-checkbox-label';
    this.tooltipVoltageLabelElement.htmlFor = 'tooltipVoltageCheckbox';
    this.tooltipVoltageLabelElement.textContent = t('settings.display.paramInfo.voltage');
    
    this.tooltipVoltageCheckbox.addEventListener('change', () => {
      this.showTooltipVoltage = this.tooltipVoltageCheckbox.checked;
      localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_VOLTAGE, String(this.showTooltipVoltage));
    });
    
    voltageRow.appendChild(this.tooltipVoltageCheckbox);
    voltageRow.appendChild(this.tooltipVoltageLabelElement);
    section.appendChild(voltageRow);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox para mostrar valores de audio
    // ─────────────────────────────────────────────────────────────────────
    const audioRow = document.createElement('div');
    audioRow.className = 'settings-row settings-row--checkbox';
    
    this.tooltipAudioCheckbox = document.createElement('input');
    this.tooltipAudioCheckbox.type = 'checkbox';
    this.tooltipAudioCheckbox.id = 'tooltipAudioCheckbox';
    this.tooltipAudioCheckbox.className = 'settings-checkbox';
    
    // Cargar preferencia guardada (por defecto true)
    const savedAudio = localStorage.getItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES);
    this.showTooltipAudio = savedAudio !== 'false';
    this.tooltipAudioCheckbox.checked = this.showTooltipAudio;
    
    this.tooltipAudioLabelElement = document.createElement('label');
    this.tooltipAudioLabelElement.className = 'settings-checkbox-label';
    this.tooltipAudioLabelElement.htmlFor = 'tooltipAudioCheckbox';
    this.tooltipAudioLabelElement.textContent = t('settings.display.paramInfo.audio');
    
    this.tooltipAudioCheckbox.addEventListener('change', () => {
      this.showTooltipAudio = this.tooltipAudioCheckbox.checked;
      localStorage.setItem(STORAGE_KEYS.TOOLTIP_SHOW_AUDIO_VALUES, String(this.showTooltipAudio));
    });
    
    audioRow.appendChild(this.tooltipAudioCheckbox);
    audioRow.appendChild(this.tooltipAudioLabelElement);
    section.appendChild(audioRow);
    
    return section;
  }
  
  /**
   * Crea la sección de optimizaciones de rendimiento.
   * Agrupa todas las optimizaciones: dormancy, filter bypass, etc.
   * @returns {HTMLElement}
   */
  _createOptimizationsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    // ─────────────────────────────────────────────────────────────────────
    // Título y descripción de la sección principal
    // ─────────────────────────────────────────────────────────────────────
    this.optimizationsTitleElement = document.createElement('h3');
    this.optimizationsTitleElement.className = 'settings-section__title';
    this.optimizationsTitleElement.textContent = t('settings.optimizations');
    section.appendChild(this.optimizationsTitleElement);
    
    this.optimizationsDescElement = document.createElement('p');
    this.optimizationsDescElement.className = 'settings-section__description';
    this.optimizationsDescElement.textContent = t('settings.optimizations.description');
    section.appendChild(this.optimizationsDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox global de debug (afecta a todas las optimizaciones)
    // ─────────────────────────────────────────────────────────────────────
    const debugGlobalRow = document.createElement('div');
    debugGlobalRow.className = 'settings-row settings-row--checkbox';
    
    this.optimizationsDebugCheckbox = document.createElement('input');
    this.optimizationsDebugCheckbox.type = 'checkbox';
    this.optimizationsDebugCheckbox.id = 'optimizationsDebugCheckbox';
    this.optimizationsDebugCheckbox.className = 'settings-checkbox';
    this.optimizationsDebugCheckbox.checked = this.optimizationsDebug;
    
    this.optimizationsDebugLabelElement = document.createElement('label');
    this.optimizationsDebugLabelElement.className = 'settings-checkbox-label';
    this.optimizationsDebugLabelElement.htmlFor = 'optimizationsDebugCheckbox';
    this.optimizationsDebugLabelElement.textContent = t('settings.optimizations.debugGlobal');
    
    this.optimizationsDebugCheckbox.addEventListener('change', () => {
      this._setOptimizationsDebug(this.optimizationsDebugCheckbox.checked);
    });
    
    debugGlobalRow.appendChild(this.optimizationsDebugCheckbox);
    debugGlobalRow.appendChild(this.optimizationsDebugLabelElement);
    section.appendChild(debugGlobalRow);
    
    // ─────────────────────────────────────────────────────────────────────
    // Subsección: Dormancy
    // ─────────────────────────────────────────────────────────────────────
    section.appendChild(this._createDormancySubsection());
    
    // ─────────────────────────────────────────────────────────────────────
    // Subsección: Filter Bypass
    // ─────────────────────────────────────────────────────────────────────
    section.appendChild(this._createFilterBypassSubsection());
    
    // ─────────────────────────────────────────────────────────────────────
    // Subsección: Latency Mode
    // ─────────────────────────────────────────────────────────────────────
    section.appendChild(this._createLatencyModeSubsection());
    
    return section;
  }
  
  /**
   * Crea la subsección de dormancy dentro de optimizaciones.
   * @returns {HTMLElement}
   */
  _createDormancySubsection() {
    const subsection = document.createElement('div');
    subsection.className = 'settings-subsection';
    
    // Título de subsección
    this.dormancyTitleElement = document.createElement('h4');
    this.dormancyTitleElement.className = 'settings-subsection__title';
    this.dormancyTitleElement.textContent = t('settings.dormancy');
    subsection.appendChild(this.dormancyTitleElement);
    
    // Descripción
    this.dormancyDescElement = document.createElement('p');
    this.dormancyDescElement.className = 'settings-subsection__description';
    this.dormancyDescElement.textContent = t('settings.dormancy.description');
    subsection.appendChild(this.dormancyDescElement);
    
    // Checkbox: enabled
    const enabledRow = document.createElement('div');
    enabledRow.className = 'settings-row settings-row--checkbox';
    
    this.dormancyEnabledCheckbox = document.createElement('input');
    this.dormancyEnabledCheckbox.type = 'checkbox';
    this.dormancyEnabledCheckbox.id = 'dormancyEnabledCheckbox';
    this.dormancyEnabledCheckbox.className = 'settings-checkbox';
    this.dormancyEnabledCheckbox.checked = this.dormancyEnabled;
    
    this.dormancyEnabledLabelElement = document.createElement('label');
    this.dormancyEnabledLabelElement.className = 'settings-checkbox-label';
    this.dormancyEnabledLabelElement.htmlFor = 'dormancyEnabledCheckbox';
    this.dormancyEnabledLabelElement.textContent = t('settings.dormancy.enabled');
    
    this.dormancyEnabledCheckbox.addEventListener('change', () => {
      this._setDormancyEnabled(this.dormancyEnabledCheckbox.checked);
    });
    
    enabledRow.appendChild(this.dormancyEnabledCheckbox);
    enabledRow.appendChild(this.dormancyEnabledLabelElement);
    subsection.appendChild(enabledRow);
    
    // Checkbox: debug individual (indentado)
    const debugRow = document.createElement('div');
    debugRow.className = 'settings-row settings-row--checkbox settings-row--indent';
    
    this.dormancyDebugCheckbox = document.createElement('input');
    this.dormancyDebugCheckbox.type = 'checkbox';
    this.dormancyDebugCheckbox.id = 'dormancyDebugCheckbox';
    this.dormancyDebugCheckbox.className = 'settings-checkbox';
    this.dormancyDebugCheckbox.checked = this.dormancyDebug;
    
    this.dormancyDebugLabelElement = document.createElement('label');
    this.dormancyDebugLabelElement.className = 'settings-checkbox-label';
    this.dormancyDebugLabelElement.htmlFor = 'dormancyDebugCheckbox';
    this.dormancyDebugLabelElement.textContent = t('settings.dormancy.debug');
    
    this.dormancyDebugCheckbox.addEventListener('change', () => {
      this._setDormancyDebug(this.dormancyDebugCheckbox.checked);
    });
    
    debugRow.appendChild(this.dormancyDebugCheckbox);
    debugRow.appendChild(this.dormancyDebugLabelElement);
    subsection.appendChild(debugRow);
    
    return subsection;
  }
  
  /**
   * Crea la subsección de filter bypass dentro de optimizaciones.
   * @returns {HTMLElement}
   */
  _createFilterBypassSubsection() {
    const subsection = document.createElement('div');
    subsection.className = 'settings-subsection';
    
    // Título de subsección
    this.filterBypassTitleElement = document.createElement('h4');
    this.filterBypassTitleElement.className = 'settings-subsection__title';
    this.filterBypassTitleElement.textContent = t('settings.filterBypass');
    subsection.appendChild(this.filterBypassTitleElement);
    
    // Descripción
    this.filterBypassDescElement = document.createElement('p');
    this.filterBypassDescElement.className = 'settings-subsection__description';
    this.filterBypassDescElement.textContent = t('settings.filterBypass.description');
    subsection.appendChild(this.filterBypassDescElement);
    
    // Checkbox: enabled
    const enabledRow = document.createElement('div');
    enabledRow.className = 'settings-row settings-row--checkbox';
    
    this.filterBypassEnabledCheckbox = document.createElement('input');
    this.filterBypassEnabledCheckbox.type = 'checkbox';
    this.filterBypassEnabledCheckbox.id = 'filterBypassEnabledCheckbox';
    this.filterBypassEnabledCheckbox.className = 'settings-checkbox';
    this.filterBypassEnabledCheckbox.checked = this.filterBypassEnabled;
    
    this.filterBypassEnabledLabelElement = document.createElement('label');
    this.filterBypassEnabledLabelElement.className = 'settings-checkbox-label';
    this.filterBypassEnabledLabelElement.htmlFor = 'filterBypassEnabledCheckbox';
    this.filterBypassEnabledLabelElement.textContent = t('settings.filterBypass.enabled');
    
    this.filterBypassEnabledCheckbox.addEventListener('change', () => {
      this._setFilterBypassEnabled(this.filterBypassEnabledCheckbox.checked);
    });
    
    enabledRow.appendChild(this.filterBypassEnabledCheckbox);
    enabledRow.appendChild(this.filterBypassEnabledLabelElement);
    subsection.appendChild(enabledRow);
    
    // Checkbox: debug individual (indentado)
    const debugRow = document.createElement('div');
    debugRow.className = 'settings-row settings-row--checkbox settings-row--indent';
    
    this.filterBypassDebugCheckbox = document.createElement('input');
    this.filterBypassDebugCheckbox.type = 'checkbox';
    this.filterBypassDebugCheckbox.id = 'filterBypassDebugCheckbox';
    this.filterBypassDebugCheckbox.className = 'settings-checkbox';
    this.filterBypassDebugCheckbox.checked = this.filterBypassDebug;
    
    this.filterBypassDebugLabelElement = document.createElement('label');
    this.filterBypassDebugLabelElement.className = 'settings-checkbox-label';
    this.filterBypassDebugLabelElement.htmlFor = 'filterBypassDebugCheckbox';
    this.filterBypassDebugLabelElement.textContent = t('settings.filterBypass.debug');
    
    this.filterBypassDebugCheckbox.addEventListener('change', () => {
      this._setFilterBypassDebug(this.filterBypassDebugCheckbox.checked);
    });
    
    debugRow.appendChild(this.filterBypassDebugCheckbox);
    debugRow.appendChild(this.filterBypassDebugLabelElement);
    subsection.appendChild(debugRow);
    
    return subsection;
  }
  
  /**
   * Crea la subsección de latency mode dentro de optimizaciones.
   * @returns {HTMLElement}
   */
  _createLatencyModeSubsection() {
    const subsection = document.createElement('div');
    subsection.className = 'settings-subsection';
    
    // Título de subsección
    this.latencyModeTitleElement = document.createElement('h4');
    this.latencyModeTitleElement.className = 'settings-subsection__title';
    this.latencyModeTitleElement.textContent = t('settings.latencyMode');
    subsection.appendChild(this.latencyModeTitleElement);
    
    // Descripción
    this.latencyModeDescElement = document.createElement('p');
    this.latencyModeDescElement.className = 'settings-subsection__description';
    this.latencyModeDescElement.textContent = t('settings.latencyMode.description');
    subsection.appendChild(this.latencyModeDescElement);
    
    // Selector de modo
    const selectRow = document.createElement('div');
    selectRow.className = 'settings-row';
    
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'settings-select-wrapper';
    
    this.latencyModeSelect = document.createElement('select');
    this.latencyModeSelect.className = 'settings-select';
    this.latencyModeSelect.id = 'latencyModeSelect';
    
    // Opciones de latencia (de menor a mayor)
    const latencyOptions = [
      { value: 'interactive', label: 'settings.latencyMode.interactive' },
      { value: 'balanced', label: 'settings.latencyMode.balanced' },
      { value: 'playback', label: 'settings.latencyMode.playback' },
      { value: '0.1', label: 'settings.latencyMode.safe' },
      { value: '0.2', label: 'settings.latencyMode.maximum' }
    ];
    
    latencyOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = t(opt.label);
      this.latencyModeSelect.appendChild(option);
    });
    
    // Establecer valor actual
    this.latencyModeSelect.value = this.latencyMode;
    
    this.latencyModeSelect.addEventListener('change', () => {
      this._setLatencyMode(this.latencyModeSelect.value);
    });
    
    selectWrapper.appendChild(this.latencyModeSelect);
    selectRow.appendChild(selectWrapper);
    subsection.appendChild(selectRow);
    
    return subsection;
  }
  
  /**
   * Establece el modo de latencia.
   * Muestra mensaje informando que el cambio se aplicará al reiniciar.
   * @param {string} mode - 'interactive', 'balanced', 'playback', etc.
   */
  _setLatencyMode(mode) {
    const oldMode = this.latencyMode;
    if (mode === oldMode) return;
    
    this.latencyMode = mode;
    localStorage.setItem(STORAGE_KEYS.LATENCY_MODE, mode);
    
    // Mostrar toast informativo - el cambio se aplicará al reiniciar la app
    showToast(t('settings.latencyMode.restartRequired'), 3000);
  }
  
  /**
   * Establece el debug global de optimizaciones
   * @param {boolean} enabled
   */
  _setOptimizationsDebug(enabled) {
    this.optimizationsDebug = enabled;
    localStorage.setItem(STORAGE_KEYS.OPTIMIZATIONS_DEBUG, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:optimizationsDebugChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si el sistema de dormancy está habilitado
   * @param {boolean} enabled
   */
  _setDormancyEnabled(enabled) {
    this.dormancyEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.DORMANCY_ENABLED, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:dormancyEnabledChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si se muestran los indicadores de debug de dormancy
   * @param {boolean} enabled
   */
  _setDormancyDebug(enabled) {
    this.dormancyDebug = enabled;
    localStorage.setItem(STORAGE_KEYS.DORMANCY_DEBUG, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:dormancyDebugChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si el bypass de filtros está habilitado
   * @param {boolean} enabled
   */
  _setFilterBypassEnabled(enabled) {
    this.filterBypassEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.FILTER_BYPASS_ENABLED, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:filterBypassEnabledChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si se muestran los indicadores de debug de filter bypass
   * @param {boolean} enabled
   */
  _setFilterBypassDebug(enabled) {
    this.filterBypassDebug = enabled;
    localStorage.setItem(STORAGE_KEYS.FILTER_BYPASS_DEBUG, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:filterBypassDebugChange', { 
      detail: { enabled } 
    }));
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // EMULACIÓN DE VOLTAJES
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Crea la sección de emulación de voltajes.
   * Permite configurar soft clipping, tolerancia de pines y deriva térmica.
   * @returns {HTMLElement}
   */
  _createVoltageEmulationSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    // Título
    this.voltageEmulationTitleElement = document.createElement('h3');
    this.voltageEmulationTitleElement.className = 'settings-section__title';
    this.voltageEmulationTitleElement.textContent = t('settings.voltageEmulation');
    section.appendChild(this.voltageEmulationTitleElement);
    
    // Descripción
    this.voltageEmulationDescElement = document.createElement('p');
    this.voltageEmulationDescElement.className = 'settings-section__description';
    this.voltageEmulationDescElement.textContent = t('settings.voltageEmulation.description');
    section.appendChild(this.voltageEmulationDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox: Soft Clipping
    // ─────────────────────────────────────────────────────────────────────
    const softClipRow = document.createElement('div');
    softClipRow.className = 'settings-row settings-row--checkbox';
    
    this.voltageSoftClipCheckbox = document.createElement('input');
    this.voltageSoftClipCheckbox.type = 'checkbox';
    this.voltageSoftClipCheckbox.id = 'voltageSoftClipCheckbox';
    this.voltageSoftClipCheckbox.className = 'settings-checkbox';
    this.voltageSoftClipCheckbox.checked = this.voltageSoftClipEnabled;
    
    this.voltageSoftClipLabelElement = document.createElement('label');
    this.voltageSoftClipLabelElement.className = 'settings-checkbox-label';
    this.voltageSoftClipLabelElement.htmlFor = 'voltageSoftClipCheckbox';
    this.voltageSoftClipLabelElement.textContent = t('settings.voltageEmulation.softClip');
    
    this.voltageSoftClipCheckbox.addEventListener('change', () => {
      this._setVoltageSoftClipEnabled(this.voltageSoftClipCheckbox.checked);
    });
    
    softClipRow.appendChild(this.voltageSoftClipCheckbox);
    softClipRow.appendChild(this.voltageSoftClipLabelElement);
    section.appendChild(softClipRow);
    
    // Descripción de soft clip (indentada)
    const softClipDesc = document.createElement('p');
    softClipDesc.className = 'settings-row--indent settings-checkbox-description';
    softClipDesc.textContent = t('settings.voltageEmulation.softClip.description');
    this.voltageSoftClipDescElement = softClipDesc;
    section.appendChild(softClipDesc);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox: Pin Tolerance
    // ─────────────────────────────────────────────────────────────────────
    const pinToleranceRow = document.createElement('div');
    pinToleranceRow.className = 'settings-row settings-row--checkbox';
    
    this.voltagePinToleranceCheckbox = document.createElement('input');
    this.voltagePinToleranceCheckbox.type = 'checkbox';
    this.voltagePinToleranceCheckbox.id = 'voltagePinToleranceCheckbox';
    this.voltagePinToleranceCheckbox.className = 'settings-checkbox';
    this.voltagePinToleranceCheckbox.checked = this.voltagePinToleranceEnabled;
    
    this.voltagePinToleranceLabelElement = document.createElement('label');
    this.voltagePinToleranceLabelElement.className = 'settings-checkbox-label';
    this.voltagePinToleranceLabelElement.htmlFor = 'voltagePinToleranceCheckbox';
    this.voltagePinToleranceLabelElement.textContent = t('settings.voltageEmulation.pinTolerance');
    
    this.voltagePinToleranceCheckbox.addEventListener('change', () => {
      this._setVoltagePinToleranceEnabled(this.voltagePinToleranceCheckbox.checked);
    });
    
    pinToleranceRow.appendChild(this.voltagePinToleranceCheckbox);
    pinToleranceRow.appendChild(this.voltagePinToleranceLabelElement);
    section.appendChild(pinToleranceRow);
    
    // Descripción de pin tolerance (indentada)
    const pinToleranceDesc = document.createElement('p');
    pinToleranceDesc.className = 'settings-row--indent settings-checkbox-description';
    pinToleranceDesc.textContent = t('settings.voltageEmulation.pinTolerance.description');
    this.voltagePinToleranceDescElement = pinToleranceDesc;
    section.appendChild(pinToleranceDesc);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox: Thermal Drift
    // ─────────────────────────────────────────────────────────────────────
    const thermalDriftRow = document.createElement('div');
    thermalDriftRow.className = 'settings-row settings-row--checkbox';
    
    this.voltageThermalDriftCheckbox = document.createElement('input');
    this.voltageThermalDriftCheckbox.type = 'checkbox';
    this.voltageThermalDriftCheckbox.id = 'voltageThermalDriftCheckbox';
    this.voltageThermalDriftCheckbox.className = 'settings-checkbox';
    this.voltageThermalDriftCheckbox.checked = this.voltageThermalDriftEnabled;
    
    this.voltageThermalDriftLabelElement = document.createElement('label');
    this.voltageThermalDriftLabelElement.className = 'settings-checkbox-label';
    this.voltageThermalDriftLabelElement.htmlFor = 'voltageThermalDriftCheckbox';
    this.voltageThermalDriftLabelElement.textContent = t('settings.voltageEmulation.thermalDrift');
    
    this.voltageThermalDriftCheckbox.addEventListener('change', () => {
      this._setVoltageThermalDriftEnabled(this.voltageThermalDriftCheckbox.checked);
    });
    
    thermalDriftRow.appendChild(this.voltageThermalDriftCheckbox);
    thermalDriftRow.appendChild(this.voltageThermalDriftLabelElement);
    section.appendChild(thermalDriftRow);
    
    // Descripción de thermal drift (indentada)
    const thermalDriftDesc = document.createElement('p');
    thermalDriftDesc.className = 'settings-row--indent settings-checkbox-description';
    thermalDriftDesc.textContent = t('settings.voltageEmulation.thermalDrift.description');
    this.voltageThermalDriftDescElement = thermalDriftDesc;
    section.appendChild(thermalDriftDesc);
    
    return section;
  }
  
  /**
   * Establece si el soft clipping de voltajes está habilitado
   * @param {boolean} enabled
   */
  _setVoltageSoftClipEnabled(enabled) {
    this.voltageSoftClipEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.VOLTAGE_SOFT_CLIP_ENABLED, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:voltageSoftClipChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si la tolerancia de pines está habilitada
   * @param {boolean} enabled
   */
  _setVoltagePinToleranceEnabled(enabled) {
    this.voltagePinToleranceEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.VOLTAGE_PIN_TOLERANCE_ENABLED, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:voltagePinToleranceChange', { 
      detail: { enabled } 
    }));
  }
  
  /**
   * Establece si la deriva térmica está habilitada
   * @param {boolean} enabled
   */
  _setVoltageThermalDriftEnabled(enabled) {
    this.voltageThermalDriftEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.VOLTAGE_THERMAL_DRIFT_ENABLED, String(enabled));
    
    // Notificar mediante evento
    document.dispatchEvent(new CustomEvent('synth:voltageThermalDriftChange', { 
      detail: { enabled } 
    }));
  }

  /**
   * Crea la sección de actualizaciones
   */
  _createUpdatesSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.updatesTitleElement = document.createElement('h3');
    this.updatesTitleElement.className = 'settings-section__title';
    this.updatesTitleElement.textContent = t('settings.updates');
    
    // Versión actual
    const versionRow = document.createElement('div');
    versionRow.className = 'settings-version-row';
    
    this.versionLabelElement = document.createElement('span');
    this.versionLabelElement.className = 'settings-version-label';
    this.versionLabelElement.textContent = t('settings.updates.version');
    
    const versionValue = document.createElement('span');
    versionValue.className = 'settings-version-value';
    versionValue.textContent = window.__synthBuildVersion || '-';
    
    versionRow.appendChild(this.versionLabelElement);
    versionRow.appendChild(versionValue);
    
    // Botón de buscar actualizaciones
    this.updateCheckBtn = document.createElement('button');
    this.updateCheckBtn.type = 'button';
    this.updateCheckBtn.className = 'settings-update-btn';
    this.updateCheckBtn.textContent = t('settings.updates.check');
    this.updateCheckBtn.addEventListener('click', () => this._handleCheckUpdate());
    
    // Estado
    this.updateStatusElement = document.createElement('div');
    this.updateStatusElement.className = 'settings-update-status';
    
    // Si ya hay una actualización pendiente, mostrar el botón de instalar
    if (hasWaitingUpdate()) {
      this._showUpdateAvailable();
    }
    
    section.appendChild(this.updatesTitleElement);
    section.appendChild(versionRow);
    section.appendChild(this.updateCheckBtn);
    section.appendChild(this.updateStatusElement);
    
    return section;
  }
  
  /**
   * Crea la sección de reseteo del sintetizador
   */
  _createResetSection() {
    const section = document.createElement('div');
    section.className = 'settings-section settings-section--danger';
    
    this.resetTitleElement = document.createElement('h3');
    this.resetTitleElement.className = 'settings-section__title';
    this.resetTitleElement.textContent = t('settings.reset');
    
    this.resetDescElement = document.createElement('p');
    this.resetDescElement.className = 'settings-section__description';
    this.resetDescElement.textContent = t('settings.reset.description');
    
    this.resetBtn = document.createElement('button');
    this.resetBtn.type = 'button';
    this.resetBtn.className = 'settings-reset-btn settings-reset-btn--danger';
    this.resetBtn.textContent = t('settings.reset.button');
    this.resetBtn.addEventListener('click', () => this._handleReset());
    
    section.appendChild(this.resetTitleElement);
    section.appendChild(this.resetDescElement);
    section.appendChild(this.resetBtn);
    
    return section;
  }
  
  /**
   * Maneja el reseteo del sintetizador
   */
  async _handleReset() {
    const result = await ConfirmDialog.show({
      title: t('settings.reset.confirm'),
      confirmText: t('common.yes'),
      cancelText: t('common.no')
    });
    
    if (!result.confirmed) return;
    
    document.dispatchEvent(new CustomEvent('synth:resetToDefaults'));
    this.close();
  }
  
  /**
   * Crea la sección de autoguardado
   */
  _createAutoSaveSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.autoSaveTitleElement = document.createElement('h3');
    this.autoSaveTitleElement.className = 'settings-section__title';
    this.autoSaveTitleElement.textContent = t('settings.autosave');
    section.appendChild(this.autoSaveTitleElement);
    
    this.autoSaveDescElement = document.createElement('p');
    this.autoSaveDescElement.className = 'settings-section__description';
    this.autoSaveDescElement.textContent = t('settings.autosave.description');
    section.appendChild(this.autoSaveDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Intervalo de autoguardado
    // ─────────────────────────────────────────────────────────────────────
    const intervalRow = document.createElement('div');
    intervalRow.className = 'settings-row';
    
    this.intervalLabelElement = document.createElement('label');
    this.intervalLabelElement.className = 'settings-row__label';
    this.intervalLabelElement.textContent = t('settings.autosave.interval');
    
    const intervalSelectWrapper = document.createElement('div');
    intervalSelectWrapper.className = 'settings-select-wrapper';
    
    this.intervalSelect = document.createElement('select');
    this.intervalSelect.className = 'settings-select';
    
    const intervalOptions = ['off', '30s', '1m', '5m', '10m'];
    intervalOptions.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = t(`settings.autosave.interval.${key}`);
      option.selected = key === this.autoSaveInterval;
      this.intervalSelect.appendChild(option);
    });
    
    this.intervalSelect.addEventListener('change', () => {
      this._setAutoSaveInterval(this.intervalSelect.value);
    });
    
    intervalSelectWrapper.appendChild(this.intervalSelect);
    intervalRow.appendChild(this.intervalLabelElement);
    intervalRow.appendChild(intervalSelectWrapper);
    section.appendChild(intervalRow);
    
    // ─────────────────────────────────────────────────────────────────────
    // Guardar al salir
    // ─────────────────────────────────────────────────────────────────────
    const exitRow = document.createElement('div');
    exitRow.className = 'settings-row settings-row--checkbox';
    
    this.saveOnExitCheckbox = document.createElement('input');
    this.saveOnExitCheckbox.type = 'checkbox';
    this.saveOnExitCheckbox.id = 'saveOnExitCheckbox';
    this.saveOnExitCheckbox.className = 'settings-checkbox';
    this.saveOnExitCheckbox.checked = this.saveOnExit;
    
    this.saveOnExitLabelElement = document.createElement('label');
    this.saveOnExitLabelElement.className = 'settings-checkbox-label';
    this.saveOnExitLabelElement.htmlFor = 'saveOnExitCheckbox';
    this.saveOnExitLabelElement.textContent = t('settings.autosave.onExit');
    
    this.saveOnExitCheckbox.addEventListener('change', () => {
      this._setSaveOnExit(this.saveOnExitCheckbox.checked);
    });
    
    exitRow.appendChild(this.saveOnExitCheckbox);
    exitRow.appendChild(this.saveOnExitLabelElement);
    section.appendChild(exitRow);
    
    // ─────────────────────────────────────────────────────────────────────
    // Restaurar al iniciar
    // ─────────────────────────────────────────────────────────────────────
    const restoreRow = document.createElement('div');
    restoreRow.className = 'settings-row settings-row--checkbox';
    
    this.restoreOnStartCheckbox = document.createElement('input');
    this.restoreOnStartCheckbox.type = 'checkbox';
    this.restoreOnStartCheckbox.id = 'restoreOnStartCheckbox';
    this.restoreOnStartCheckbox.className = 'settings-checkbox';
    this.restoreOnStartCheckbox.checked = this.restoreOnStart;
    
    this.restoreOnStartLabelElement = document.createElement('label');
    this.restoreOnStartLabelElement.className = 'settings-checkbox-label';
    this.restoreOnStartLabelElement.htmlFor = 'restoreOnStartCheckbox';
    this.restoreOnStartLabelElement.textContent = t('settings.autosave.restoreOnStart');
    
    this.restoreOnStartCheckbox.addEventListener('change', () => {
      this._setRestoreOnStart(this.restoreOnStartCheckbox.checked);
      // Mostrar/ocultar opción de preguntar según si está activo "restaurar al iniciar"
      this._updateAskBeforeRestoreVisibility();
    });
    
    restoreRow.appendChild(this.restoreOnStartCheckbox);
    restoreRow.appendChild(this.restoreOnStartLabelElement);
    section.appendChild(restoreRow);
    
    // ─────────────────────────────────────────────────────────────────────
    // Preguntar antes de restaurar (sub-opción de "Restaurar al iniciar")
    // ─────────────────────────────────────────────────────────────────────
    this.askBeforeRestoreRow = document.createElement('div');
    this.askBeforeRestoreRow.className = 'settings-row settings-row--checkbox settings-row--indent';
    
    this.askBeforeRestoreCheckbox = document.createElement('input');
    this.askBeforeRestoreCheckbox.type = 'checkbox';
    this.askBeforeRestoreCheckbox.id = 'askBeforeRestoreCheckbox';
    this.askBeforeRestoreCheckbox.className = 'settings-checkbox';
    this.askBeforeRestoreCheckbox.checked = this.askBeforeRestore;
    
    this.askBeforeRestoreLabelElement = document.createElement('label');
    this.askBeforeRestoreLabelElement.className = 'settings-checkbox-label';
    this.askBeforeRestoreLabelElement.htmlFor = 'askBeforeRestoreCheckbox';
    this.askBeforeRestoreLabelElement.textContent = t('settings.autosave.askBeforeRestore');
    
    this.askBeforeRestoreCheckbox.addEventListener('change', () => {
      this._setAskBeforeRestore(this.askBeforeRestoreCheckbox.checked);
    });
    
    this.askBeforeRestoreRow.appendChild(this.askBeforeRestoreCheckbox);
    this.askBeforeRestoreRow.appendChild(this.askBeforeRestoreLabelElement);
    section.appendChild(this.askBeforeRestoreRow);
    
    // Mostrar/ocultar según estado inicial
    this._updateAskBeforeRestoreVisibility();
    
    return section;
  }
  
  /**
   * Crea la sección de Wake Lock (mantener pantalla encendida)
   * @returns {HTMLElement}
   */
  _createWakeLockSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    this.wakeLockTitleElement = document.createElement('h3');
    this.wakeLockTitleElement.className = 'settings-section__title';
    this.wakeLockTitleElement.textContent = t('settings.wakelock');
    section.appendChild(this.wakeLockTitleElement);
    
    this.wakeLockDescElement = document.createElement('p');
    this.wakeLockDescElement.className = 'settings-section__description';
    
    const isSupported = WakeLockManager.isSupported();
    this.wakeLockDescElement.textContent = isSupported 
      ? t('settings.wakelock.description')
      : t('settings.wakelock.unsupported');
    section.appendChild(this.wakeLockDescElement);
    
    // ─────────────────────────────────────────────────────────────────────
    // Checkbox para habilitar/deshabilitar wake lock
    // ─────────────────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'settings-row settings-row--checkbox';
    
    this.wakeLockCheckbox = document.createElement('input');
    this.wakeLockCheckbox.type = 'checkbox';
    this.wakeLockCheckbox.id = 'wakeLockCheckbox';
    this.wakeLockCheckbox.className = 'settings-checkbox';
    
    // Cargar preferencia guardada (por defecto true)
    const savedPref = localStorage.getItem(STORAGE_KEYS.WAKE_LOCK_ENABLED);
    this.wakeLockEnabled = savedPref === null ? true : savedPref === 'true';
    this.wakeLockCheckbox.checked = this.wakeLockEnabled;
    
    // Deshabilitar si no está soportado
    if (!isSupported) {
      this.wakeLockCheckbox.disabled = true;
      row.classList.add('settings-row--disabled');
    }
    
    this.wakeLockLabelElement = document.createElement('label');
    this.wakeLockLabelElement.className = 'settings-checkbox-label';
    this.wakeLockLabelElement.htmlFor = 'wakeLockCheckbox';
    this.wakeLockLabelElement.textContent = t('settings.wakelock');
    
    this.wakeLockCheckbox.addEventListener('change', () => {
      this._setWakeLockEnabled(this.wakeLockCheckbox.checked);
    });
    
    row.appendChild(this.wakeLockCheckbox);
    row.appendChild(this.wakeLockLabelElement);
    section.appendChild(row);
    
    return section;
  }
  
  /**
   * Establece si el wake lock está habilitado
   * @param {boolean} enabled
   */
  _setWakeLockEnabled(enabled) {
    this.wakeLockEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.WAKE_LOCK_ENABLED, String(enabled));
    
    // Notificar al callback si existe
    if (this.onWakeLockChange) {
      this.onWakeLockChange(enabled);
    }
  }
  
  /**
   * Obtiene si el wake lock está habilitado
   * @returns {boolean}
   */
  getWakeLockEnabled() {
    return this.wakeLockEnabled;
  }
  
  /**
   * Crea la sección de atajos de teclado personalizables
   * @returns {HTMLElement}
   */
  _createShortcutsSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';
    
    // Título
    this.shortcutsTitleElement = document.createElement('h3');
    this.shortcutsTitleElement.className = 'settings-section__title';
    this.shortcutsTitleElement.textContent = t('settings.shortcuts');
    section.appendChild(this.shortcutsTitleElement);
    
    // Descripción
    this.shortcutsDescElement = document.createElement('p');
    this.shortcutsDescElement.className = 'settings-section__description';
    this.shortcutsDescElement.textContent = t('settings.shortcuts.description');
    section.appendChild(this.shortcutsDescElement);

    // Nota fija sobre modificadores de knobs
    const knobsNote = document.createElement('p');
    knobsNote.className = 'settings-section__description settings-section__note';
    knobsNote.textContent = t('settings.shortcuts.knobModifiers');
    section.appendChild(knobsNote);
    
    // Lista de atajos
    const list = document.createElement('div');
    list.className = 'settings-shortcuts-list';
    
    const actionIds = keyboardShortcuts.getActionIds();
    this.shortcutInputs = {};
    
    actionIds.forEach(actionId => {
      const row = this._createShortcutRow(actionId);
      list.appendChild(row);
    });
    
    section.appendChild(list);
    
    // Botón de restaurar valores por defecto
    const resetRow = document.createElement('div');
    resetRow.className = 'settings-row';
    resetRow.style.marginTop = '12px';
    
    this.resetShortcutsButton = document.createElement('button');
    this.resetShortcutsButton.className = 'settings-shortcuts-reset';
    this.resetShortcutsButton.textContent = t('settings.shortcuts.resetDefaults');
    this.resetShortcutsButton.addEventListener('click', () => {
      keyboardShortcuts.resetToDefaults();
      this._updateAllShortcutInputs();
    });
    
    resetRow.appendChild(this.resetShortcutsButton);
    section.appendChild(resetRow);
    
    return section;
  }
  
  /**
   * Crea una fila para un atajo de teclado
   * @param {string} actionId
   * @returns {HTMLElement}
   */
  _createShortcutRow(actionId) {
    const row = document.createElement('div');
    row.className = 'settings-shortcut-row';
    
    // Etiqueta del atajo
    const label = document.createElement('span');
    label.className = 'settings-shortcut-label';
    label.textContent = t(`settings.shortcuts.${actionId}`);
    label.dataset.i18n = `settings.shortcuts.${actionId}`;
    
    // Caso especial: showPanelHints usa un selector en lugar de captura
    if (actionId === 'showPanelHints') {
      return this._createShowPanelHintsRow(row, label, actionId);
    }
    
    // Contenedor del input y botón
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'settings-shortcut-input-wrapper';
    
    // Input para capturar tecla
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-shortcut-input';
    input.readOnly = true;
    input.dataset.actionId = actionId;
    
    const binding = keyboardShortcuts.get(actionId);
    input.value = binding ? keyboardShortcuts.formatBinding(binding) : t('settings.shortcuts.none');
    if (!binding) {
      input.classList.add('empty');
    }
    
    // Guardar referencia para actualizaciones
    this.shortcutInputs[actionId] = input;
    
    // Estado de conflicto
    const conflictSpan = document.createElement('span');
    conflictSpan.className = 'settings-shortcut-conflict';
    conflictSpan.style.display = 'none';
    
    // Click para capturar
    input.addEventListener('click', () => {
      this._startShortcutCapture(input, actionId, conflictSpan);
    });
    
    // Botón para limpiar
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'settings-shortcut-clear';
    clearButton.innerHTML = '×';
    clearButton.title = 'Clear';
    clearButton.addEventListener('click', (e) => {
      e.stopPropagation();
      keyboardShortcuts.clear(actionId);
      input.value = t('settings.shortcuts.none');
      input.classList.add('empty');
      input.classList.remove('conflict');
      conflictSpan.style.display = 'none';
    });
    
    inputWrapper.appendChild(input);
    inputWrapper.appendChild(clearButton);
    
    row.appendChild(label);
    row.appendChild(inputWrapper);
    row.appendChild(conflictSpan);
    
    return row;
  }

  /**
   * Crea una fila especial para showPanelHints con selector Alt/Ctrl
   * @param {HTMLElement} row
   * @param {HTMLElement} label
   * @param {string} actionId
   * @returns {HTMLElement}
   */
  _createShowPanelHintsRow(row, label, actionId) {
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'settings-shortcut-input-wrapper';
    
    // Selector para elegir Alt o Ctrl
    const select = document.createElement('select');
    select.className = 'settings-shortcut-input settings-shortcut-select';
    select.dataset.actionId = actionId;
    
    const optionAlt = document.createElement('option');
    optionAlt.value = 'Alt';
    optionAlt.textContent = 'Alt';
    
    const optionCtrl = document.createElement('option');
    optionCtrl.value = 'Control';
    optionCtrl.textContent = 'Ctrl';
    
    select.appendChild(optionAlt);
    select.appendChild(optionCtrl);
    
    // Establecer valor actual
    const binding = keyboardShortcuts.get(actionId);
    select.value = binding?.key || 'Alt';
    
    // Guardar referencia para actualizaciones
    this.shortcutInputs[actionId] = select;
    
    // Listener de cambio
    select.addEventListener('change', () => {
      keyboardShortcuts.set(actionId, { 
        key: select.value, 
        shift: false, 
        ctrl: false, 
        alt: false 
      });
    });
    
    inputWrapper.appendChild(select);
    
    row.appendChild(label);
    row.appendChild(inputWrapper);
    
    return row;
  }
  
  /**
   * Inicia la captura de un nuevo atajo de teclado
   * @param {HTMLInputElement} input
   * @param {string} actionId
   * @param {HTMLElement} conflictSpan
   */
  _startShortcutCapture(input, actionId, conflictSpan) {
    // Cancelar cualquier captura anterior
    if (this._activeShortcutCapture) {
      this._cancelShortcutCapture();
    }
    
    input.classList.add('recording');
    input.value = t('settings.shortcuts.press');
    conflictSpan.style.display = 'none';
    
    this._activeShortcutCapture = {
      input,
      actionId,
      conflictSpan,
      handler: (e) => {
        // Ignorar solo modificadores solos
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const key = e.key.toUpperCase();
        
        // Verificar teclas reservadas
        if (keyboardShortcuts.isReservedKey(key)) {
          input.value = t('settings.shortcuts.reserved');
          input.classList.add('conflict');
          setTimeout(() => {
            this._cancelShortcutCapture();
            const binding = keyboardShortcuts.get(actionId);
            input.value = binding ? keyboardShortcuts.formatBinding(binding) : t('settings.shortcuts.none');
            input.classList.remove('conflict');
            if (!binding) input.classList.add('empty');
          }, 1500);
          return;
        }
        
        const newBinding = {
          key,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey
        };
        
        // Intentar establecer
        const result = keyboardShortcuts.set(actionId, newBinding);
        
        if (result.conflict) {
          // Hay conflicto
          input.classList.add('conflict');
          conflictSpan.textContent = t('settings.shortcuts.conflict').replace('{action}', t(`settings.shortcuts.${result.conflict}`));
          conflictSpan.style.display = 'inline';
          input.value = keyboardShortcuts.formatBinding(newBinding);
          
          // Revertir tras un momento
          setTimeout(() => {
            const binding = keyboardShortcuts.get(actionId);
            input.value = binding ? keyboardShortcuts.formatBinding(binding) : t('settings.shortcuts.none');
            input.classList.remove('conflict');
            conflictSpan.style.display = 'none';
            if (!binding) input.classList.add('empty');
          }, 2000);
        } else {
          // Éxito
          input.value = keyboardShortcuts.formatBinding(newBinding);
          input.classList.remove('empty');
        }
        
        this._endShortcutCapture();
      }
    };
    
    // Añadir listener global
    document.addEventListener('keydown', this._activeShortcutCapture.handler, true);
    
    // Cancelar si se hace click fuera
    this._activeShortcutCapture.blurHandler = () => {
      this._cancelShortcutCapture();
    };
    input.addEventListener('blur', this._activeShortcutCapture.blurHandler);
  }
  
  /**
   * Termina la captura de atajo
   */
  _endShortcutCapture() {
    if (!this._activeShortcutCapture) return;
    
    const { input, handler, blurHandler } = this._activeShortcutCapture;
    input.classList.remove('recording');
    document.removeEventListener('keydown', handler, true);
    input.removeEventListener('blur', blurHandler);
    this._activeShortcutCapture = null;
  }
  
  /**
   * Cancela la captura y restaura el valor anterior
   */
  _cancelShortcutCapture() {
    if (!this._activeShortcutCapture) return;
    
    const { input, actionId } = this._activeShortcutCapture;
    const binding = keyboardShortcuts.get(actionId);
    input.value = binding ? keyboardShortcuts.formatBinding(binding) : t('settings.shortcuts.none');
    if (!binding) input.classList.add('empty');
    
    this._endShortcutCapture();
  }
  
  /**
   * Actualiza todos los inputs de atajos con los valores actuales
   */
  _updateAllShortcutInputs() {
    if (!this.shortcutInputs) return;
    
    for (const [actionId, input] of Object.entries(this.shortcutInputs)) {
      const binding = keyboardShortcuts.get(actionId);
      
      // Caso especial: showPanelHints usa un selector
      if (actionId === 'showPanelHints' && input.tagName === 'SELECT') {
        input.value = binding?.key || 'Alt';
        continue;
      }
      
      input.value = binding ? keyboardShortcuts.formatBinding(binding) : t('settings.shortcuts.none');
      input.classList.remove('conflict');
      if (binding) {
        input.classList.remove('empty');
      } else {
        input.classList.add('empty');
      }
      
      // También ocultar mensajes de conflicto
      const conflictSpan = input.closest('.settings-shortcut-row')?.querySelector('.settings-shortcut-conflict');
      if (conflictSpan) {
        conflictSpan.style.display = 'none';
      }
    }
  }
  
  /**
   * Cambia el intervalo de autoguardado
   * @param {string} intervalKey
   */
  _setAutoSaveInterval(intervalKey) {
    if (!AUTOSAVE_INTERVALS.hasOwnProperty(intervalKey)) return;
    
    this.autoSaveInterval = intervalKey;
    localStorage.setItem(STORAGE_KEYS.AUTOSAVE_INTERVAL, intervalKey);
    
    if (this.onAutoSaveIntervalChange) {
      this.onAutoSaveIntervalChange(AUTOSAVE_INTERVALS[intervalKey], intervalKey);
    }
  }
  
  /**
   * Cambia la opción de guardar al salir
   * @param {boolean} enabled
   */
  _setSaveOnExit(enabled) {
    this.saveOnExit = enabled;
    localStorage.setItem(STORAGE_KEYS.SAVE_ON_EXIT, String(enabled));
    
    if (this.onSaveOnExitChange) {
      this.onSaveOnExitChange(enabled);
    }
  }
  
  /**
   * Cambia la opción de restaurar al inicio
   * @param {boolean} enabled
   */
  _setRestoreOnStart(enabled) {
    this.restoreOnStart = enabled;
    localStorage.setItem(STORAGE_KEYS.RESTORE_ON_START, String(enabled));
    
    if (this.onRestoreOnStartChange) {
      this.onRestoreOnStartChange(enabled);
    }
  }
  
  /**
   * Cambia la opción de preguntar antes de restaurar
   * @param {boolean} enabled
   */
  _setAskBeforeRestore(enabled) {
    this.askBeforeRestore = enabled;
    localStorage.setItem(STORAGE_KEYS.ASK_BEFORE_RESTORE, String(enabled));
    
    // Limpiar elección recordada cuando se activa "preguntar"
    if (enabled) {
      ConfirmDialog.clearRememberedChoice('restore-last-session');
    }
  }
  
  /**
   * Actualiza la visibilidad de la opción "preguntar antes de restaurar"
   */
  _updateAskBeforeRestoreVisibility() {
    if (this.askBeforeRestoreRow) {
      this.askBeforeRestoreRow.style.display = this.restoreOnStart ? 'flex' : 'none';
    }
  }
  
  /**
   * Establece externamente si preguntar antes de restaurar.
   * Útil cuando el usuario marca "no volver a preguntar" en el diálogo.
   * @param {boolean} enabled
   */
  setAskBeforeRestore(enabled) {
    this.askBeforeRestore = enabled;
    localStorage.setItem(STORAGE_KEYS.ASK_BEFORE_RESTORE, String(enabled));
    
    // Actualizar checkbox si existe
    if (this.askBeforeRestoreCheckbox) {
      this.askBeforeRestoreCheckbox.checked = enabled;
    }
  }
  
  /**
   * Indica si debe preguntar antes de restaurar
   * @returns {boolean}
   */
  getAskBeforeRestore() {
    return this.askBeforeRestore;
  }
  
  /**
   * Obtiene el intervalo de autoguardado en ms
   * @returns {number}
   */
  getAutoSaveIntervalMs() {
    return AUTOSAVE_INTERVALS[this.autoSaveInterval] || 0;
  }
  
  /**
   * Indica si debe guardar al salir
   * @returns {boolean}
   */
  getSaveOnExit() {
    return this.saveOnExit;
  }
  
  /**
   * Indica si debe restaurar al inicio
   * @returns {boolean}
   */
  getRestoreOnStart() {
    return this.restoreOnStart;
  }
  
  /**
   * Muestra el estado "actualización disponible" (pendiente de instalar)
   */
  _showUpdateAvailable() {
    this.updateCheckBtn.textContent = t('settings.updates.installAndReload');
    this.updateCheckBtn.classList.add('settings-update-btn--available');
    this.updateStatusElement.textContent = t('settings.updates.pendingInstall');
    this.updateStatusElement.className = 'settings-update-status settings-update-status--available';
    this._isUpdateAvailable = true;
  }
  
  /**
   * Maneja el clic en el botón de actualizaciones
   */
  async _handleCheckUpdate() {
    // Si ya hay actualización disponible, instalar y recargar
    if (this._isUpdateAvailable || hasWaitingUpdate()) {
      this.updateCheckBtn.disabled = true;
      this.updateCheckBtn.textContent = t('settings.updates.installing');
      applyUpdate();
      return;
    }
    
    // Buscar actualizaciones
    this.updateCheckBtn.disabled = true;
    this.updateCheckBtn.textContent = t('settings.updates.checking');
    this.updateStatusElement.textContent = '';
    this.updateStatusElement.className = 'settings-update-status';
    
    try {
      const result = await checkForUpdates();
      
      if (result.error) {
        this.updateStatusElement.textContent = t('settings.updates.error');
        this.updateStatusElement.className = 'settings-update-status settings-update-status--error';
      } else if (result.found) {
        this._showUpdateAvailable();
      } else {
        this.updateStatusElement.textContent = t('settings.updates.upToDate');
        this.updateStatusElement.className = 'settings-update-status settings-update-status--ok';
      }
    } catch (err) {
      this.updateStatusElement.textContent = t('settings.updates.error');
      this.updateStatusElement.className = 'settings-update-status settings-update-status--error';
    }
    
    this.updateCheckBtn.disabled = false;
    if (!this._isUpdateAvailable) {
      this.updateCheckBtn.textContent = t('settings.updates.check');
    }
  }
  
  /**
   * Cambia la escala de renderizado
   * @param {number} factor
   */
  _setResolution(factor) {
    if (factor === this.currentResolution) return;
    
    this.currentResolution = factor;
    
    // Guardar en localStorage si "recordar" está activo
    if (this.rememberResolution) {
      localStorage.setItem(STORAGE_KEYS.RESOLUTION, factor);
    }
    
    // Actualizar dropdown si existe
    if (this.resolutionSelect) {
      this.resolutionSelect.value = String(factor);
    }
    
    // Notificar
    if (this.onResolutionChange) {
      this.onResolutionChange(factor);
    }
    
    // Notificar al sistema de navegación
    if (typeof window.__synthSetResolutionFactor === 'function') {
      window.__synthSetResolutionFactor(factor);
    }
    
    // Mostrar toast de feedback (con warning si es móvil y factor > threshold)
    if (this.isMobile && factor > this.mobileWarningThreshold) {
      this._showToast(t('toast.resolution.mobileWarning', { factor }));
    } else {
      this._showToast(t('toast.resolution', { factor }));
    }
  }
  
  /**
   * Muestra un toast temporal de feedback
   * @param {string} message
   */
  _showToast(message) {
    let toast = document.getElementById('settingsToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'settingsToast';
      toast.className = 'resolution-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('resolution-toast--visible');
    
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('resolution-toast--visible');
    }, 1500);
  }
  
  /**
   * Actualiza los textos del modal (para cambio de idioma en caliente)
   */
  _updateTexts() {
    if (this.titleElement) {
      this.titleElement.textContent = t('settings.title');
    }
    
    if (this.languageTitleElement) {
      this.languageTitleElement.textContent = t('settings.language');
    }
    
    if (this.resolutionTitleElement) {
      this.resolutionTitleElement.textContent = t('settings.scale');
    }
    
    if (this.resolutionDescElement) {
      this.resolutionDescElement.textContent = t('settings.scale.description');
    }
    
    // Actualizar sección de actualizaciones
    if (this.updatesTitleElement) {
      this.updatesTitleElement.textContent = t('settings.updates');
    }
    
    if (this.versionLabelElement) {
      this.versionLabelElement.textContent = t('settings.updates.version');
    }
    
    if (this.updateCheckBtn && !this.updateCheckBtn.disabled) {
      if (this._isUpdateAvailable) {
        this.updateCheckBtn.textContent = t('settings.updates.install');
      } else {
        this.updateCheckBtn.textContent = t('settings.updates.check');
      }
    }
    
    if (this.updateStatusElement) {
      const statusClass = this.updateStatusElement.className;
      if (statusClass.includes('--available')) {
        this.updateStatusElement.textContent = t('settings.updates.available');
      } else if (statusClass.includes('--ok')) {
        this.updateStatusElement.textContent = t('settings.updates.upToDate');
      } else if (statusClass.includes('--error')) {
        this.updateStatusElement.textContent = t('settings.updates.error');
      }
    }
    
    // Actualizar opciones de idioma
    if (this.languageSelect) {
      const options = this.languageSelect.querySelectorAll('option');
      options.forEach(opt => {
        opt.textContent = t(`settings.language.${opt.value}`);
      });
    }
    
    // Actualizar sección de autoguardado
    if (this.autoSaveTitleElement) {
      this.autoSaveTitleElement.textContent = t('settings.autosave');
    }
    
    if (this.autoSaveDescElement) {
      this.autoSaveDescElement.textContent = t('settings.autosave.description');
    }
    
    if (this.intervalLabelElement) {
      this.intervalLabelElement.textContent = t('settings.autosave.interval');
    }
    
    if (this.intervalSelect) {
      const options = this.intervalSelect.querySelectorAll('option');
      options.forEach(opt => {
        opt.textContent = t(`settings.autosave.interval.${opt.value}`);
      });
    }
    
    if (this.saveOnExitLabelElement) {
      this.saveOnExitLabelElement.textContent = t('settings.autosave.onExit');
    }
    
    if (this.restoreOnStartLabelElement) {
      this.restoreOnStartLabelElement.textContent = t('settings.autosave.restoreOnStart');
    }
    
    if (this.askBeforeRestoreLabelElement) {
      this.askBeforeRestoreLabelElement.textContent = t('settings.autosave.askBeforeRestore');
    }
    
    // Actualizar sección de wake lock
    if (this.wakeLockTitleElement) {
      this.wakeLockTitleElement.textContent = t('settings.wakelock');
    }
    
    if (this.wakeLockDescElement) {
      const isSupported = WakeLockManager.isSupported();
      this.wakeLockDescElement.textContent = isSupported 
        ? t('settings.wakelock.description')
        : t('settings.wakelock.unsupported');
    }
    
    if (this.wakeLockLabelElement) {
      this.wakeLockLabelElement.textContent = t('settings.wakelock');
    }
    
    // Actualizar sección de reset
    if (this.resetTitleElement) {
      this.resetTitleElement.textContent = t('settings.reset');
    }
    
    if (this.resetDescElement) {
      this.resetDescElement.textContent = t('settings.reset.description');
    }
    
    if (this.resetBtn) {
      this.resetBtn.textContent = t('settings.reset.button');
    }
    
    // Actualizar sección de grabación
    if (this.recordingTitleElement) {
      this.recordingTitleElement.textContent = t('settings.recording');
    }
    
    if (this.recordingDescElement) {
      this.recordingDescElement.textContent = t('settings.recording.description');
    }
    
    if (this.recordingSettingsBtn) {
      this.recordingSettingsBtn.textContent = t('settings.recording.configure');
    }
    
    // Actualizar aria-label del botón cerrar
    const closeBtn = this.modal?.querySelector('.settings-modal__close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t('settings.close'));
    }
    
    // Actualizar pestañas
    if (this.tabButtons) {
      if (this.tabButtons.general) this.tabButtons.general.textContent = t('settings.tab.general');
      if (this.tabButtons.display) this.tabButtons.display.textContent = t('settings.tab.display');
      if (this.tabButtons.audio) this.tabButtons.audio.textContent = t('settings.tab.audio');
      if (this.tabButtons.recording) this.tabButtons.recording.textContent = t('settings.tab.recording');
      if (this.tabButtons.advanced) this.tabButtons.advanced.textContent = t('settings.tab.advanced');
      if (this.tabButtons.about) this.tabButtons.about.textContent = t('settings.tab.about');
    }
    
    // Actualizar sección de pines inactivos
    if (this.inactivePinsTitleElement) {
      this.inactivePinsTitleElement.textContent = t('settings.display.inactivePins');
    }
    if (this.inactivePinsDescElement) {
      this.inactivePinsDescElement.textContent = t('settings.display.inactivePins.description');
    }
    if (this.inactivePinsLabelElement) {
      this.inactivePinsLabelElement.textContent = t('settings.display.inactivePins.show');
    }
    
    // Actualizar sección de paneles flotantes (PiP)
    if (this.pipTitleElement) {
      this.pipTitleElement.textContent = t('settings.display.pip');
    }
    if (this.pipDescElement) {
      this.pipDescElement.textContent = t('settings.display.pip.description');
    }
    if (this.pipRememberLabelElement) {
      this.pipRememberLabelElement.textContent = t('settings.display.pip.remember');
    }
    
    // Actualizar sección de información de parámetros
    if (this.paramInfoTitleElement) {
      this.paramInfoTitleElement.textContent = t('settings.display.paramInfo');
    }
    if (this.paramInfoDescElement) {
      this.paramInfoDescElement.textContent = t('settings.display.paramInfo.description');
    }
    if (this.tooltipVoltageLabelElement) {
      this.tooltipVoltageLabelElement.textContent = t('settings.display.paramInfo.voltage');
    }
    if (this.tooltipAudioLabelElement) {
      this.tooltipAudioLabelElement.textContent = t('settings.display.paramInfo.audio');
    }
    
    // Actualizar sección "Acerca de"
    if (this.aboutDescElement) {
      this.aboutDescElement.textContent = t('settings.about.description');
    }
    if (this.aboutInfoTitleElement) {
      this.aboutInfoTitleElement.textContent = t('settings.about.info');
    }
    if (this.aboutVersionLabelElement) {
      this.aboutVersionLabelElement.textContent = t('settings.about.version');
    }
    if (this.aboutAuthorLabelElement) {
      this.aboutAuthorLabelElement.textContent = t('settings.about.author');
    }
    if (this.aboutLicenseLabelElement) {
      this.aboutLicenseLabelElement.textContent = t('settings.about.license');
    }
    if (this.aboutLinksTitleElement) {
      this.aboutLinksTitleElement.textContent = t('settings.about.links');
    }
    if (this.aboutRepoLinkElement) {
      this.aboutRepoLinkElement.textContent = t('settings.about.repository');
    }
    if (this.aboutIssuesLinkElement) {
      this.aboutIssuesLinkElement.textContent = t('settings.about.issues');
    }
    if (this.aboutOriginalLinkElement) {
      this.aboutOriginalLinkElement.textContent = t('settings.about.originalProject');
    }
    if (this.aboutCreditsTitleElement) {
      this.aboutCreditsTitleElement.textContent = t('settings.about.credits');
    }
    if (this.aboutAppIconsLabelElement) {
      this.aboutAppIconsLabelElement.textContent = t('settings.about.credits.appIcons');
    }
    if (this.aboutUiIconsLabelElement) {
      this.aboutUiIconsLabelElement.textContent = t('settings.about.credits.uiIcons');
    }
    if (this.aboutInspirationLabelElement) {
      this.aboutInspirationLabelElement.textContent = t('settings.about.credits.inspiration');
    }
    
    // Shortcuts section
    if (this.shortcutsTitleElement) {
      this.shortcutsTitleElement.textContent = t('settings.shortcuts');
    }
    if (this.shortcutsDescElement) {
      this.shortcutsDescElement.textContent = t('settings.shortcuts.description');
    }
    if (this.resetShortcutsButton) {
      this.resetShortcutsButton.textContent = t('settings.shortcuts.resetDefaults');
    }
    // Update shortcut row labels and empty placeholders
    if (this.shortcutInputs) {
      const rows = this.modal?.querySelectorAll('.settings-shortcut-row');
      rows?.forEach(row => {
        const label = row.querySelector('.settings-shortcut-label');
        if (label?.dataset.i18n) {
          label.textContent = t(label.dataset.i18n);
        }
        const input = row.querySelector('.settings-shortcut-input');
        if (input?.classList.contains('empty')) {
          input.value = t('settings.shortcuts.none');
        }
      });
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Actualizar sección de optimizaciones
    // ─────────────────────────────────────────────────────────────────────
    if (this.optimizationsTitleElement) {
      this.optimizationsTitleElement.textContent = t('settings.optimizations');
    }
    if (this.optimizationsDescElement) {
      this.optimizationsDescElement.textContent = t('settings.optimizations.description');
    }
    if (this.optimizationsDebugLabelElement) {
      this.optimizationsDebugLabelElement.textContent = t('settings.optimizations.debugGlobal');
    }
    
    // Subsección: Dormancy
    if (this.dormancyTitleElement) {
      this.dormancyTitleElement.textContent = t('settings.dormancy');
    }
    if (this.dormancyDescElement) {
      this.dormancyDescElement.textContent = t('settings.dormancy.description');
    }
    if (this.dormancyEnabledLabelElement) {
      this.dormancyEnabledLabelElement.textContent = t('settings.dormancy.enabled');
    }
    if (this.dormancyDebugLabelElement) {
      this.dormancyDebugLabelElement.textContent = t('settings.dormancy.debug');
    }
    
    // Subsección: Filter Bypass
    if (this.filterBypassTitleElement) {
      this.filterBypassTitleElement.textContent = t('settings.filterBypass');
    }
    if (this.filterBypassDescElement) {
      this.filterBypassDescElement.textContent = t('settings.filterBypass.description');
    }
    if (this.filterBypassEnabledLabelElement) {
      this.filterBypassEnabledLabelElement.textContent = t('settings.filterBypass.enabled');
    }
    if (this.filterBypassDebugLabelElement) {
      this.filterBypassDebugLabelElement.textContent = t('settings.filterBypass.debug');
    }
    
    // Subsección: Latency Mode
    if (this.latencyModeTitleElement) {
      this.latencyModeTitleElement.textContent = t('settings.latencyMode');
    }
    if (this.latencyModeDescElement) {
      this.latencyModeDescElement.textContent = t('settings.latencyMode.description');
    }
    if (this.latencyModeSelect) {
      const labelMap = {
        'interactive': 'settings.latencyMode.interactive',
        'balanced': 'settings.latencyMode.balanced',
        'playback': 'settings.latencyMode.playback',
        '0.1': 'settings.latencyMode.safe',
        '0.2': 'settings.latencyMode.maximum'
      };
      const options = this.latencyModeSelect.querySelectorAll('option');
      options.forEach(opt => {
        const label = labelMap[opt.value];
        if (label) opt.textContent = t(label);
      });
    }
  }
  
  /**
   * Limpieza
   */
  destroy() {
    if (this._unsubscribeLocale) this._unsubscribeLocale();
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}
