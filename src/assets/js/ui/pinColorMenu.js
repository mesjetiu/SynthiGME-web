/**
 * Menú contextual para seleccionar el color de un pin en la matriz.
 * Se muestra con click derecho (desktop) o pulsación larga (touch).
 * 
 * Contextos de color:
 * - 'audio': Panel 5, conexiones de audio (default: WHITE)
 * - 'control': Panel 6, conexiones de control CV (default: GREEN)
 * - 'oscilloscope': Conexiones al osciloscopio en ambos paneles (default: RED)
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
 * Lee un color CSS desde las variables :root.
 * @param {string} varName - Nombre de la variable (ej: '--pin-color-white')
 * @param {string} fallback - Valor por defecto si no existe
 * @returns {string} Color en formato hex
 */
function getCSSColor(varName, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/**
 * Colores CSS para cada tipo de pin.
 * Lee los valores desde las variables CSS definidas en :root.
 * Usa fallbacks hardcoded para SSR/tests.
 */
const PIN_CSS_COLORS = {
  get WHITE() { return getCSSColor('--pin-color-white', '#ffffff'); },
  get GREY() { return getCSSColor('--pin-color-grey', '#888888'); },
  get GREEN() { return getCSSColor('--pin-color-green', '#4CAF50'); },
  get RED() { return getCSSColor('--pin-color-red', '#f44336'); }
};

/**
 * Colores por defecto según contexto.
 * - audio: Panel 5 conexiones de audio
 * - control: Panel 6 conexiones de control CV (precisión para afinación)
 * - oscilloscope: Conexiones al osciloscopio (ambos paneles)
 */
const DEFAULT_COLORS = {
  'audio': 'WHITE',
  'control': 'GREY',
  'oscilloscope': 'RED'
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
    this._currentContext = null;
    this._currentIsActive = false;
    
    // Último color seleccionado por contexto (para recordar preferencia)
    this._lastSelectedByContext = {
      'audio': null,        // Panel 5 audio
      'control': null,      // Panel 6 control
      'oscilloscope': null  // Oscilloscope (ambos paneles)
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
    
    // Opciones de colores (sin DEFAULT - ahora mostramos tick en el próximo)
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
    
    // Tick (checkmark) para indicar selección - visible solo con .is-selected
    const tick = document.createElement('span');
    tick.className = 'pin-color-menu__tick';
    tick.textContent = '✓';
    option.appendChild(tick);
    
    // Indicador de color (círculo)
    const indicator = document.createElement('span');
    indicator.className = 'pin-color-menu__indicator';
    indicator.style.backgroundColor = PIN_CSS_COLORS[colorKey] || '#888';
    option.appendChild(indicator);
    
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
   * @param {string} options.context - Contexto: 'audio', 'control', 'oscilloscope'
   * @param {string|null} options.currentColor - Color actual del pin (si está activo)
   * @param {boolean} options.isActive - Si el pin está actualmente activo
   * @param {Function} options.onSelect - Callback al seleccionar color
   */
  show(x, y, pinBtn, { context, currentColor, isActive, onSelect }) {
    const menu = this.element;
    
    this._currentPinBtn = pinBtn;
    this._currentCallback = onSelect;
    this._currentContext = context;
    this._currentIsActive = isActive;
    
    // Determinar qué color marcar con tick:
    // - Si el pin está activo: su color actual
    // - Si no está activo: el próximo color que se usará (último usado o default)
    const colorToMark = isActive && currentColor ? currentColor : this.getNextColor(context);
    
    // Marcar opción con tick
    menu.querySelectorAll('.pin-color-menu__option').forEach(opt => {
      const isSelected = opt.dataset.color === colorToMark;
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
    this._currentContext = null;
    this._currentIsActive = false;
    
    document.removeEventListener('click', this._onDocumentClick, { capture: true });
    document.removeEventListener('keydown', this._onKeydown);
  }

  /**
   * Procesa la selección de un color.
   * @private
   */
  _selectColor(colorKey) {
    if (this._currentCallback && this._currentContext) {
      // Recordar selección para este contexto
      this._lastSelectedByContext[this._currentContext] = colorKey;
      
      // Notificar con el color seleccionado y si activar el pin
      this._currentCallback(colorKey, !this._currentIsActive);
    }
    this.hide();
  }

  /**
   * Obtiene el próximo color que se usará para un contexto.
   * Es el último seleccionado o el default del contexto.
   * @param {string} context - Contexto: 'audio', 'control', 'oscilloscope'
   * @returns {string} Color a usar
   */
  getNextColor(context) {
    return this._lastSelectedByContext[context] || DEFAULT_COLORS[context] || 'WHITE';
  }

  /**
   * Obtiene el color por defecto de un contexto.
   * @param {string} context - Contexto
   * @returns {string} Color por defecto
   */
  getDefaultColor(context) {
    return DEFAULT_COLORS[context] || 'WHITE';
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
 * Colores CSS y constantes exportadas para uso en otros módulos.
 */
export { PIN_CSS_COLORS, SELECTABLE_COLORS, DEFAULT_COLORS };
