/**
 * Modal de ajustes generales
 * 
 * Permite configurar:
 * - Idioma de la interfaz
 * - Escala de renderizado (1×, 2×, 3×, 4×)
 * 
 * Sigue el mismo patrón visual que AudioSettingsModal.
 */

import { t, getLocale, setLocale, getSupportedLocales, onLocaleChange } from '../i18n/index.js';

const STORAGE_KEY_RESOLUTION = 'synthigme-resolution';

/**
 * Modal de configuración general
 */
export class SettingsModal {
  /**
   * @param {Object} options
   * @param {Function} [options.onResolutionChange] - Callback cuando cambia la escala
   */
  constructor(options = {}) {
    const { onResolutionChange } = options;
    
    this.onResolutionChange = onResolutionChange;
    
    // Escalas disponibles
    this.resolutionFactors = [1, 2, 3, 4];
    
    // Escala actual (cargar de localStorage)
    const savedFactor = parseInt(localStorage.getItem(STORAGE_KEY_RESOLUTION), 10);
    this.currentResolution = this.resolutionFactors.includes(savedFactor) ? savedFactor : 1;
    
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
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
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
    this.modal.className = 'settings-modal';
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
    
    // Body
    const body = document.createElement('div');
    body.className = 'settings-modal__body';
    
    // Sección: Idioma
    body.appendChild(this._createLanguageSection());
    
    // Sección: Escala de renderizado (oculta en Firefox)
    if (!this.isFirefox) {
      body.appendChild(this._createResolutionSection());
    }
    
    // Ensamblar modal
    this.modal.appendChild(header);
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
   * Cambia la escala de renderizado
   * @param {number} factor
   */
  _setResolution(factor) {
    if (factor === this.currentResolution) return;
    
    this.currentResolution = factor;
    localStorage.setItem(STORAGE_KEY_RESOLUTION, factor);
    
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
    
    // Actualizar opciones de idioma
    if (this.languageSelect) {
      const options = this.languageSelect.querySelectorAll('option');
      options.forEach(opt => {
        opt.textContent = t(`settings.language.${opt.value}`);
      });
    }
    
    // Actualizar aria-label del botón cerrar
    const closeBtn = this.modal?.querySelector('.settings-modal__close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t('settings.close'));
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
