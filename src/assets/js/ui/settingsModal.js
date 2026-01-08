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
import { STORAGE_KEYS, AUTOSAVE_INTERVALS } from '../utils/constants.js';
import { WakeLockManager } from '../utils/wakeLock.js';

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
    
    // Escalas disponibles
    this.resolutionFactors = [1, 2, 3, 4];
    
    // Escala actual (cargar de localStorage)
    const savedFactor = parseInt(localStorage.getItem(STORAGE_KEYS.RESOLUTION), 10);
    this.currentResolution = this.resolutionFactors.includes(savedFactor) ? savedFactor : 1;
    
    // Configuración de autoguardado
    const savedInterval = localStorage.getItem(STORAGE_KEYS.AUTOSAVE_INTERVAL);
    this.autoSaveInterval = savedInterval && AUTOSAVE_INTERVALS.hasOwnProperty(savedInterval) ? savedInterval : 'off';
    this.saveOnExit = localStorage.getItem(STORAGE_KEYS.SAVE_ON_EXIT) === 'true';
    this.restoreOnStart = localStorage.getItem(STORAGE_KEYS.RESTORE_ON_START) === 'true';
    
    // "Preguntar antes de restaurar" - por defecto true (preguntar)
    const savedAskBeforeRestore = localStorage.getItem(STORAGE_KEYS.ASK_BEFORE_RESTORE);
    this.askBeforeRestore = savedAskBeforeRestore === null ? true : savedAskBeforeRestore === 'true';
    
    // Detectar Firefox (no necesita selector de resolución)
    this.isFirefox = /Firefox\/\d+/.test(navigator.userAgent);
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.isOpen = false;
    
    // Selectores
    this.languageSelect = null;
    this.resolutionButtons = [];
    
    // Crear modal
    this._create();
    
    // Escuchar cambios de idioma para actualizar textos
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
    
    // Aplicar resolución guardada al iniciar (si no es Firefox y > 1)
    if (!this.isFirefox && this.currentResolution > 1) {
      if (typeof window.__synthSetResolutionFactor === 'function') {
        window.__synthSetResolutionFactor(this.currentResolution);
      }
    }
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
    
    // Contenedores de cada pestaña
    this.tabContents = {
      general: this._createGeneralTabContent(),
      audio: this._createAudioTabContent(),
      recording: this._createRecordingTabContent(),
      advanced: this._createAdvancedTabContent(),
      about: this._createAboutTabContent()
    };
    
    // Agregar contenidos al body
    Object.values(this.tabContents).forEach(content => body.appendChild(content));
    
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
      { id: 'audio', label: t('settings.tab.audio') },
      { id: 'recording', label: t('settings.tab.recording') },
      { id: 'advanced', label: t('settings.tab.advanced') },
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
    
    // Escala de renderizado (oculta en Firefox)
    if (!this.isFirefox) {
      container.appendChild(this._createResolutionSection());
    }
    
    // Autoguardado
    container.appendChild(this._createAutoSaveSection());
    
    // Pantalla (Wake Lock)
    container.appendChild(this._createWakeLockSection());
    
    // Atajos de teclado
    container.appendChild(this._createShortcutsSection());
    
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
    
    // Actualizaciones
    container.appendChild(this._createUpdatesSection());
    
    // Reset
    container.appendChild(this._createResetSection());
    
    return container;
  }
  
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
    
    // Botones de escala
    const buttonsWrapper = document.createElement('div');
    buttonsWrapper.className = 'settings-scale-buttons';
    
    this.resolutionButtons = [];
    
    this.resolutionFactors.forEach(factor => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-scale-btn';
      btn.textContent = `${factor}×`;
      btn.dataset.factor = factor;
      
      if (factor === this.currentResolution) {
        btn.classList.add('settings-scale-btn--active');
      }
      
      btn.addEventListener('click', () => this._setResolution(factor));
      
      buttonsWrapper.appendChild(btn);
      this.resolutionButtons.push(btn);
    });
    
    section.appendChild(this.resolutionTitleElement);
    section.appendChild(this.resolutionDescElement);
    section.appendChild(buttonsWrapper);
    
    return section;
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
   * Muestra el estado "actualización disponible"
   */
  _showUpdateAvailable() {
    this.updateCheckBtn.textContent = t('settings.updates.install');
    this.updateCheckBtn.classList.add('settings-update-btn--available');
    this.updateStatusElement.textContent = t('settings.updates.available');
    this.updateStatusElement.className = 'settings-update-status settings-update-status--available';
    this._isUpdateAvailable = true;
  }
  
  /**
   * Maneja el clic en el botón de actualizaciones
   */
  async _handleCheckUpdate() {
    // Si ya hay actualización disponible, instalar
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
    localStorage.setItem(STORAGE_KEYS.RESOLUTION, factor);
    
    // Actualizar botones
    this.resolutionButtons.forEach(btn => {
      const btnFactor = parseInt(btn.dataset.factor, 10);
      btn.classList.toggle('settings-scale-btn--active', btnFactor === factor);
    });
    
    // Notificar
    if (this.onResolutionChange) {
      this.onResolutionChange(factor);
    }
    
    // Notificar al sistema de navegación
    if (typeof window.__synthSetResolutionFactor === 'function') {
      window.__synthSetResolutionFactor(factor);
    }
    
    // Mostrar toast de feedback
    this._showToast(t('toast.resolution', { factor }));
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
      if (this.tabButtons.audio) this.tabButtons.audio.textContent = t('settings.tab.audio');
      if (this.tabButtons.recording) this.tabButtons.recording.textContent = t('settings.tab.recording');
      if (this.tabButtons.advanced) this.tabButtons.advanced.textContent = t('settings.tab.advanced');
      if (this.tabButtons.about) this.tabButtons.about.textContent = t('settings.tab.about');
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
