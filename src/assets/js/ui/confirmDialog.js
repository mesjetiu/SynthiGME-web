/**
 * Diálogo de confirmación personalizado reutilizable.
 * 
 * Permite mostrar diálogos modales con:
 * - Título y mensaje
 * - Botones personalizables (confirmar/cancelar)
 * - Opción "No volver a preguntar" opcional
 * 
 * Uso:
 *   const result = await ConfirmDialog.show({
 *     title: 'Título',
 *     message: 'Mensaje',
 *     confirmText: 'Aceptar',
 *     cancelText: 'Cancelar',
 *     rememberKey: 'mi-clave' // opcional
 *   });
 *   
 *   if (result.confirmed) { ... }
 */

import { t, onLocaleChange } from '../i18n/index.js';

// Singleton: el diálogo se crea una sola vez y se reutiliza
let dialogInstance = null;

export class ConfirmDialog {
  constructor() {
    this.overlay = null;
    this.modal = null;
    this.titleEl = null;
    this.messageEl = null;
    this.confirmBtn = null;
    this.cancelBtn = null;
    this.rememberRow = null;
    this.rememberCheckbox = null;
    this.rememberLabel = null;
    
    this._resolve = null;
    this._currentRememberKey = null;
    
    this._create();
    
    // Actualizar textos cuando cambie el idioma
    this._unsubscribeLocale = onLocaleChange(() => this._updateDefaultTexts());
  }
  
  /**
   * Muestra el diálogo de confirmación.
   * @param {Object} options
   * @param {string} options.title - Título del diálogo
   * @param {string} [options.message] - Mensaje/descripción
   * @param {string} [options.confirmText] - Texto del botón de confirmar
   * @param {string} [options.cancelText] - Texto del botón de cancelar
   * @param {string} [options.rememberKey] - Clave localStorage para "no volver a preguntar"
   * @param {string} [options.rememberText] - Texto del checkbox "no volver a preguntar"
   * @returns {Promise<{confirmed: boolean, remember: boolean}>}
   */
  static async show(options) {
    if (!dialogInstance) {
      dialogInstance = new ConfirmDialog();
    }
    return dialogInstance._show(options);
  }
  
  /**
   * Comprueba si el usuario eligió "no volver a preguntar" para una clave dada.
   * @param {string} key - Clave localStorage
   * @returns {{skip: boolean, choice: boolean}} skip=true si no hay que preguntar, choice=la elección guardada
   */
  static getRememberedChoice(key) {
    const stored = localStorage.getItem(`synthigme-confirm-${key}`);
    if (stored !== null) {
      return { skip: true, choice: stored === 'true' };
    }
    return { skip: false, choice: false };
  }
  
  /**
   * Limpia la elección guardada para una clave.
   * @param {string} key
   */
  static clearRememberedChoice(key) {
    localStorage.removeItem(`synthigme-confirm-${key}`);
  }
  
  /**
   * Crea la estructura DOM del diálogo.
   */
  _create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'confirm-dialog-overlay';
    // Usar inert en lugar de aria-hidden para evitar warning de accesibilidad
    // cuando el botón recibe focus. inert también previene focus e interacción.
    this.overlay.inert = true;
    
    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'confirm-dialog';
    this.modal.setAttribute('role', 'alertdialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'confirmDialogTitle');
    
    // Título
    this.titleEl = document.createElement('h2');
    this.titleEl.id = 'confirmDialogTitle';
    this.titleEl.className = 'confirm-dialog__title';
    
    // Mensaje
    this.messageEl = document.createElement('p');
    this.messageEl.className = 'confirm-dialog__message';
    
    // Fila "No volver a preguntar"
    this.rememberRow = document.createElement('div');
    this.rememberRow.className = 'confirm-dialog__remember';
    
    this.rememberCheckbox = document.createElement('input');
    this.rememberCheckbox.type = 'checkbox';
    this.rememberCheckbox.id = 'confirmDialogRemember';
    this.rememberCheckbox.className = 'confirm-dialog__remember-checkbox';
    
    this.rememberLabel = document.createElement('label');
    this.rememberLabel.htmlFor = 'confirmDialogRemember';
    this.rememberLabel.className = 'confirm-dialog__remember-label';
    this.rememberLabel.textContent = t('patches.lastSession.remember');
    
    this.rememberRow.appendChild(this.rememberCheckbox);
    this.rememberRow.appendChild(this.rememberLabel);
    
    // Botones
    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'confirm-dialog__buttons';
    
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.type = 'button';
    this.cancelBtn.className = 'confirm-dialog__btn confirm-dialog__btn--cancel';
    this.cancelBtn.textContent = t('patches.lastSession.no');
    this.cancelBtn.addEventListener('click', () => this._handleResponse(false));
    
    this.confirmBtn = document.createElement('button');
    this.confirmBtn.type = 'button';
    this.confirmBtn.className = 'confirm-dialog__btn confirm-dialog__btn--confirm';
    this.confirmBtn.textContent = t('patches.lastSession.yes');
    this.confirmBtn.addEventListener('click', () => this._handleResponse(true));
    
    buttonsRow.appendChild(this.cancelBtn);
    buttonsRow.appendChild(this.confirmBtn);
    
    // Ensamblar
    this.modal.appendChild(this.titleEl);
    this.modal.appendChild(this.messageEl);
    this.modal.appendChild(this.rememberRow);
    this.modal.appendChild(buttonsRow);
    this.overlay.appendChild(this.modal);
    
    // Cerrar con Escape (como cancelar)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._resolve) {
        this._handleResponse(false);
      }
    });
    
    // No cerrar al hacer clic fuera (es un diálogo de confirmación)
    
    document.body.appendChild(this.overlay);
  }
  
  /**
   * Actualiza los textos por defecto cuando cambia el idioma.
   */
  _updateDefaultTexts() {
    // Solo actualizar si el diálogo no está visible
    if (this.overlay.classList.contains('confirm-dialog-overlay--visible')) return;
    
    this.rememberLabel.textContent = t('patches.lastSession.remember');
    this.cancelBtn.textContent = t('patches.lastSession.no');
    this.confirmBtn.textContent = t('patches.lastSession.yes');
  }
  
  /**
   * Muestra el diálogo con las opciones dadas.
   */
  async _show(options) {
    const {
      title,
      message = '',
      confirmText,
      cancelText,
      rememberKey = null,
      rememberText
    } = options;
    
    // Configurar contenido
    this.titleEl.textContent = title;
    this.messageEl.textContent = message;
    this.messageEl.style.display = message ? 'block' : 'none';
    
    // Configurar botones
    if (confirmText) this.confirmBtn.textContent = confirmText;
    if (cancelText) this.cancelBtn.textContent = cancelText;
    
    // Configurar "no volver a preguntar"
    this._currentRememberKey = rememberKey;
    if (rememberKey) {
      this.rememberRow.style.display = 'flex';
      this.rememberCheckbox.checked = false;
      if (rememberText) this.rememberLabel.textContent = rememberText;
    } else {
      this.rememberRow.style.display = 'none';
    }
    
    // Mostrar - primero quitar inert ANTES de hacer focus
    this.overlay.inert = false;
    this.overlay.classList.add('confirm-dialog-overlay--visible');
    
    // Focus en el botón de confirmar
    requestAnimationFrame(() => {
      this.confirmBtn.focus();
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
    const remember = this.rememberCheckbox.checked;
    
    // Guardar elección si se marcó "no volver a preguntar"
    if (remember && this._currentRememberKey) {
      localStorage.setItem(`synthigme-confirm-${this._currentRememberKey}`, String(confirmed));
    }
    
    // Ocultar
    this.overlay.classList.remove('confirm-dialog-overlay--visible');
    this.overlay.inert = true;
    
    // Resolver promesa
    if (this._resolve) {
      this._resolve({ confirmed, remember });
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
