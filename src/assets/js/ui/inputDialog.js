/**
 * Diálogo de entrada de texto personalizado reutilizable.
 * 
 * Permite mostrar diálogos modales para solicitar texto al usuario,
 * reemplazando el prompt() nativo del navegador.
 * 
 * Uso:
 *   const result = await InputDialog.show({
 *     title: 'Nombre del patch',
 *     placeholder: 'Nuevo patch',
 *     defaultValue: 'Mi patch',
 *     confirmText: 'Guardar',
 *     cancelText: 'Cancelar'
 *   });
 *   
 *   if (result.confirmed) {
 *     console.log(result.value);
 *   }
 */

import { t, onLocaleChange } from '../i18n/index.js';

// Singleton: el diálogo se crea una sola vez y se reutiliza
let dialogInstance = null;

export class InputDialog {
  constructor() {
    this.overlay = null;
    this.modal = null;
    this.titleEl = null;
    this.inputEl = null;
    this.confirmBtn = null;
    this.cancelBtn = null;
    
    this._resolve = null;
    
    this._create();
    
    // Actualizar textos cuando cambie el idioma
    this._unsubscribeLocale = onLocaleChange(() => this._updateDefaultTexts());
  }
  
  /**
   * Muestra el diálogo de entrada de texto.
   * @param {Object} options
   * @param {string} options.title - Título del diálogo
   * @param {string} [options.placeholder] - Placeholder del input
   * @param {string} [options.defaultValue] - Valor por defecto
   * @param {string} [options.confirmText] - Texto del botón de confirmar
   * @param {string} [options.cancelText] - Texto del botón de cancelar
   * @returns {Promise<{confirmed: boolean, value: string}>}
   */
  static async show(options) {
    if (!dialogInstance) {
      dialogInstance = new InputDialog();
    }
    return dialogInstance._show(options);
  }
  
  /**
   * Crea la estructura DOM del diálogo.
   */
  _create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'input-dialog-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    
    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'input-dialog';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'inputDialogTitle');
    
    // Título
    this.titleEl = document.createElement('h2');
    this.titleEl.id = 'inputDialogTitle';
    this.titleEl.className = 'input-dialog__title';
    
    // Input
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'input-dialog__input';
    this.inputEl.autocomplete = 'off';
    this.inputEl.spellcheck = false;
    
    // Enter para confirmar
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this._resolve) {
        e.preventDefault();
        this._handleResponse(true);
      }
    });
    
    // Botones
    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'input-dialog__buttons';
    
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    this.cancelBtn.className = 'input-dialog__btn input-dialog__btn--cancel';
    this.cancelBtn.textContent = t('common.cancel');
    this.cancelBtn.addEventListener('click', () => this._handleResponse(false));
    
    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.className = 'input-dialog__btn input-dialog__btn--confirm';
    this.confirmBtn.textContent = t('common.ok');
    this.confirmBtn.addEventListener('click', () => this._handleResponse(true));
    
    buttonsRow.appendChild(this.cancelBtn);
    buttonsRow.appendChild(this.confirmBtn);
    
    // Ensamblar
    this.modal.appendChild(this.titleEl);
    this.modal.appendChild(this.inputEl);
    this.modal.appendChild(buttonsRow);
    this.overlay.appendChild(this.modal);
    
    // Cerrar con Escape (como cancelar)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._resolve) {
        this._handleResponse(false);
      }
    });
    
    document.body.appendChild(this.overlay);
  }
  
  /**
   * Actualiza los textos por defecto cuando cambia el idioma.
   */
  _updateDefaultTexts() {
    // Solo actualizar si el diálogo no está visible
    if (this.overlay.classList.contains('input-dialog-overlay--visible')) return;
    
    this.cancelBtn.textContent = t('common.cancel');
    this.confirmBtn.textContent = t('common.ok');
  }
  
  /**
   * Muestra el diálogo con las opciones dadas.
   */
  async _show(options) {
    const {
      title,
      placeholder = '',
      defaultValue = '',
      confirmText,
      cancelText
    } = options;
    
    // Configurar contenido
    this.titleEl.textContent = title;
    this.inputEl.placeholder = placeholder;
    this.inputEl.value = defaultValue;
    
    // Configurar botones
    if (confirmText) this.confirmBtn.textContent = confirmText;
    if (cancelText) this.cancelBtn.textContent = cancelText;
    
    // Mostrar
    this.overlay.classList.add('input-dialog-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    
    // Focus en el input y seleccionar texto
    requestAnimationFrame(() => {
      this.inputEl.focus();
      this.inputEl.select();
    });
    
    // Esperar respuesta
    return new Promise(resolve => {
      this._resolve = resolve;
    });
  }
  
  /**
   * Maneja la respuesta del usuario.
   */
  _handleResponse(confirmed) {
    const value = this.inputEl.value.trim();
    
    // Ocultar
    this.overlay.classList.remove('input-dialog-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    
    // Resolver promesa
    if (this._resolve) {
      this._resolve({ confirmed, value });
      this._resolve = null;
    }
  }
  
  /**
   * Libera recursos.
   */
  destroy() {
    if (this._unsubscribeLocale) {
      this._unsubscribeLocale();
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    dialogInstance = null;
  }
}
