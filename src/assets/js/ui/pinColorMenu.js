/**
 * Menú contextual para seleccionar el color de un pin en la matriz.
 * Se muestra con click derecho (desktop) o pulsación larga (touch).
 * 
 * @module ui/pinColorMenu
 */

import { t } from '../i18n/index.js';
import { PIN_RESISTANCES } from '../utils/voltageConstants.js';

/**
 * Colores disponibles para selección (ORANGE excluido por ser peligroso).
 * El orden determina cómo aparecen en el menú.
 */
const SELECTABLE_COLORS = ['WHITE', 'GREY', 'GREEN', 'RED'];

/**
 * Colores CSS para cada tipo de pin.
 */
const PIN_CSS_COLORS = {
  WHITE: '#ffffff',
  GREY: '#888888',
  GREEN: '#4CAF50',
  RED: '#f44336'
};

/**
 * Formatea la resistencia para mostrar al usuario.
 * @param {number} ohms - Resistencia en ohmios
 * @returns {string} Resistencia formateada (ej: "100kΩ", "2.7kΩ")
 */
function formatResistance(ohms) {
  if (ohms >= 1000) {
    const k = ohms / 1000;
    return Number.isInteger(k) ? `${k}kΩ` : `${k.toFixed(1)}kΩ`;
  }
  return `${ohms}Ω`;
}

/**
 * Clase que gestiona el menú contextual de colores de pines.
 * Singleton - usar getPinColorMenu() para obtener la instancia.
 */
export class PinColorMenu {
  constructor() {
    this._element = null;
    this._isVisible = false;
    this._currentCallback = null;
    this._currentPinBtn = null;
    
    // Último color seleccionado por panel (para recordar preferencia)
    this._lastSelectedByPanel = {
      'panel-5': null,  // Audio matrix
      'panel-6': null   // Control matrix
    };
    
    this._onDocumentClick = this._handleDocumentClick.bind(this);
    this._onKeydown = this._handleKeydown.bind(this);
  }

  /**
   * Obtiene o crea el elemento DOM del menú.
   */
  get element() {
    if (!this._element) {
      this._element = this._createMenuElement();
      document.body.appendChild(this._element);
    }
    return this._element;
  }

  /**
   * Crea el elemento DOM del menú.
   * @private
   */
  _createMenuElement() {
    const menu = document.createElement('div');
    menu.className = 'pin-color-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');
    
    // Título
    const title = document.createElement('div');
    title.className = 'pin-color-menu__title';
    title.textContent = t('pinColor.title');
    menu.appendChild(title);
    
    // Opciones de color
    const optionsList = document.createElement('div');
    optionsList.className = 'pin-color-menu__options';
    
    // Opción "Por defecto"
    const defaultOption = this._createOption('DEFAULT', t('pinColor.default'), null);
    optionsList.appendChild(defaultOption);
    
    // Separador
    const separator = document.createElement('div');
    separator.className = 'pin-color-menu__separator';
    optionsList.appendChild(separator);
    
    // Opciones de colores
    for (const color of SELECTABLE_COLORS) {
      const pinInfo = PIN_RESISTANCES[color];
      const label = t(`pinColor.${color.toLowerCase()}`);
      const sublabel = formatResistance(pinInfo.value);
      const option = this._createOption(color, label, sublabel);
      optionsList.appendChild(option);
    }
    
    menu.appendChild(optionsList);
    return menu;
  }

  /**
   * Crea una opción del menú.
   * @private
   */
  _createOption(colorKey, label, sublabel) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'pin-color-menu__option';
    option.dataset.color = colorKey;
    option.setAttribute('role', 'menuitem');
    
    // Indicador de color (círculo)
    if (colorKey !== 'DEFAULT') {
      const indicator = document.createElement('span');
      indicator.className = 'pin-color-menu__indicator';
      indicator.style.backgroundColor = PIN_CSS_COLORS[colorKey] || '#888';
      option.appendChild(indicator);
    } else {
      // Icono de "auto" para opción por defecto
      const autoIcon = document.createElement('span');
      autoIcon.className = 'pin-color-menu__auto-icon';
      autoIcon.textContent = '⟳';
      option.appendChild(autoIcon);
    }
    
    // Texto
    const text = document.createElement('span');
    text.className = 'pin-color-menu__label';
    text.textContent = label;
    option.appendChild(text);
    
    // Sublabel (resistencia)
    if (sublabel) {
      const sub = document.createElement('span');
      sub.className = 'pin-color-menu__sublabel';
      sub.textContent = sublabel;
      option.appendChild(sub);
    }
    
    option.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectColor(colorKey);
    });
    
    return option;
  }

  /**
   * Muestra el menú en la posición especificada.
   * @param {number} x - Coordenada X
   * @param {number} y - Coordenada Y
   * @param {HTMLElement} pinBtn - Botón del pin que se está editando
   * @param {Object} options - Opciones
   * @param {string} options.panelId - ID del panel ('panel-5' o 'panel-6')
   * @param {string} options.currentColor - Color actual del pin
   * @param {Function} options.onSelect - Callback al seleccionar color
   */
  show(x, y, pinBtn, { panelId, currentColor, onSelect }) {
    const menu = this.element;
    
    this._currentPinBtn = pinBtn;
    this._currentCallback = onSelect;
    this._currentPanelId = panelId;
    
    // Marcar opción actual
    menu.querySelectorAll('.pin-color-menu__option').forEach(opt => {
      const isSelected = opt.dataset.color === currentColor || 
                        (currentColor === null && opt.dataset.color === 'DEFAULT');
      opt.classList.toggle('is-selected', isSelected);
    });
    
    // Posicionar
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    // Mostrar
    menu.classList.add('is-visible');
    menu.setAttribute('aria-hidden', 'false');
    this._isVisible = true;
    
    // Ajustar posición si se sale de la pantalla
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const margin = 8;
      
      let adjustedX = x;
      let adjustedY = y;
      
      if (rect.right > viewport.width - margin) {
        adjustedX = viewport.width - rect.width - margin;
      }
      if (rect.bottom > viewport.height - margin) {
        adjustedY = viewport.height - rect.height - margin;
      }
      if (adjustedX < margin) adjustedX = margin;
      if (adjustedY < margin) adjustedY = margin;
      
      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    });
    
    // Listeners para cerrar
    document.addEventListener('click', this._onDocumentClick, { capture: true });
    document.addEventListener('keydown', this._onKeydown);
  }

  /**
   * Oculta el menú.
   */
  hide() {
    if (!this._isVisible) return;
    
    const menu = this.element;
    menu.classList.remove('is-visible');
    menu.setAttribute('aria-hidden', 'true');
    this._isVisible = false;
    this._currentCallback = null;
    this._currentPinBtn = null;
    
    document.removeEventListener('click', this._onDocumentClick, { capture: true });
    document.removeEventListener('keydown', this._onKeydown);
  }

  /**
   * Procesa la selección de un color.
   * @private
   */
  _selectColor(colorKey) {
    if (this._currentCallback) {
      // DEFAULT significa usar el color por defecto del panel
      const selectedColor = colorKey === 'DEFAULT' ? null : colorKey;
      
      // Recordar selección para este panel (excepto DEFAULT)
      if (selectedColor && this._currentPanelId) {
        this._lastSelectedByPanel[this._currentPanelId] = selectedColor;
      }
      
      this._currentCallback(selectedColor);
    }
    this.hide();
  }

  /**
   * Obtiene el último color seleccionado para un panel.
   * @param {string} panelId - ID del panel
   * @returns {string|null} Color o null si no hay selección previa
   */
  getLastSelectedColor(panelId) {
    return this._lastSelectedByPanel[panelId] || null;
  }

  /**
   * Maneja clicks fuera del menú.
   * @private
   */
  _handleDocumentClick(e) {
    if (!this._isVisible) return;
    
    const menu = this.element;
    if (!menu.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  }

  /**
   * Maneja teclas (Escape para cerrar).
   * @private
   */
  _handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  /**
   * Destruye el menú y limpia recursos.
   */
  destroy() {
    this.hide();
    if (this._element && this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
    this._element = null;
  }
}

// Singleton
let menuInstance = null;

/**
 * Obtiene la instancia singleton del menú de colores.
 * @returns {PinColorMenu}
 */
export function getPinColorMenu() {
  if (!menuInstance) {
    menuInstance = new PinColorMenu();
  }
  return menuInstance;
}

/**
 * Colores CSS exportados para uso en otros módulos.
 */
export { PIN_CSS_COLORS, SELECTABLE_COLORS };
