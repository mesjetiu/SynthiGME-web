/**
 * SignalFlowHighlighter — Resaltado visual de flujo de señal
 * 
 * Permite visualizar el flujo de señal al pasar el ratón (con tecla modificadora)
 * o al hacer clic (en dispositivos táctiles) sobre un módulo o pin de la matriz.
 * 
 * Comportamiento:
 * - Sobre un **módulo**: resalta en CYAN los módulos que le envían señal (fuentes)
 *   y en MAGENTA los módulos a los que envía señal (destinos).
 *   Los pines implicados también se resaltan.
 * - Sobre un **pin activo**: resalta en CYAN el módulo de origen y en MAGENTA
 *   el módulo de destino de esa conexión concreta.
 * 
 * Colores elegidos:
 * - CYAN (#00e5ff) para fuentes → evita confusión con pin azul (#2196F3)
 * - MAGENTA (#ff1744) para destinos → rojo intenso, distinto del pin rojo (#f44336)
 * 
 * Modos de activación:
 * - Desktop: mantener tecla modificadora (configurable, por defecto Ctrl) + hover
 * - Tablet/móvil: clic/tap directamente sobre módulo o pin (sin modificador)
 * - Configurable: puede funcionar siempre sin modificador también en desktop
 * 
 * @module ui/signalFlowHighlighter
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { isMobileDevice } from '../utils/constants.js';

const log = createLogger('SignalFlowHighlighter');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

/** Clases CSS para el glow de flujo de señal */
const CSS_CLASSES = {
  SOURCE_GLOW: 'signal-flow-source',
  DEST_GLOW: 'signal-flow-dest',
  SOURCE_PIN: 'signal-flow-pin-source',
  DEST_PIN: 'signal-flow-pin-dest',
  ACTIVE: 'signal-flow-active'
};

// ─────────────────────────────────────────────────────────────────────────────
// MAPEO SOURCE/DEST KIND → MÓDULO DOM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve el ID(s) del elemento DOM del módulo a partir de un descriptor source/dest.
 * @param {Object} descriptor - { kind, oscIndex?, channel?, bus?, index?, side?, busIndex? }
 * @returns {string[]} Array de selectores CSS de los módulos implicados
 */
function getModuleElementIds(descriptor) {
  if (!descriptor || !descriptor.kind) return [];
  
  switch (descriptor.kind) {
    case 'panel3Osc':
      return [`panel3-osc-${(descriptor.oscIndex ?? 0) + 1}`];
    
    case 'noiseGen':
      return [`panel3-noise-${(descriptor.index ?? 0) + 1}`];
    
    case 'inputAmp':
      return ['input-amplifiers'];
    
    case 'outputBus':
      return [`output-channel-${descriptor.bus ?? 1}`];
    
    case 'joystick': {
      const side = descriptor.side === 'right' ? 'right' : 'left';
      return [`joystick-${side}`];
    }
    
    case 'oscilloscope':
      return ['oscilloscope-module'];
    
    case 'oscSync':
      return [`panel3-osc-${(descriptor.oscIndex ?? 0) + 1}`];
    
    case 'oscFreqCV':
      return [`panel3-osc-${(descriptor.oscIndex ?? 0) + 1}`];
    
    case 'outputLevelCV':
      return [`output-channel-${(descriptor.busIndex ?? 0) + 1}`];
    
    default:
      return [];
  }
}

/**
 * Encuentra el elemento DOM del módulo más cercano a partir de un elemento hijo.
 * Busca elementos con las clases típicas de módulo.
 * @param {HTMLElement} el - Elemento desde el que buscar
 * @returns {HTMLElement|null}
 */
function findModuleElement(el) {
  return el.closest('.synth-module, .sgme-osc, .noise-generator, .random-voltage, .output-channel-module, .panel7-joystick, .panel7-sequencer, .input-amplifier-module, .panel1-placeholder, .panel2-placeholder');
}

/**
 * Obtiene el ID del módulo desde un elemento DOM de módulo.
 * @param {HTMLElement} moduleEl
 * @returns {string|null}
 */
function getModuleId(moduleEl) {
  return moduleEl?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export class SignalFlowHighlighter {
  /**
   * @param {Object} options
   * @param {Object} options.panel5Routing - { connections, sourceMap, destMap }
   * @param {Object} options.panel6Routing - { connections, sourceMap, destMap }
   * @param {import('./largeMatrix.js').LargeMatrix} options.matrixAudio - Instancia de la matriz de audio
   * @param {import('./largeMatrix.js').LargeMatrix} options.matrixControl - Instancia de la matriz de control
   */
  constructor({ panel5Routing, panel6Routing, matrixAudio, matrixControl }) {
    this._panel5Routing = panel5Routing;
    this._panel6Routing = panel6Routing;
    this._matrixAudio = matrixAudio;
    this._matrixControl = matrixControl;
    
    // Estado
    this._isActive = false;
    this._modifierKeyPressed = false;
    this._highlightedElements = new Set();
    this._highlightedPins = new Set();
    this._hoveredElement = null; // Elemento actualmente bajo el cursor
    
    // Configuración
    this._requireModifier = !isMobileDevice();
    this._modifierKey = 'Control'; // Valor por defecto
    
    // Cargar preferencia de localStorage
    const savedRequireModifier = localStorage.getItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER);
    if (savedRequireModifier !== null) {
      this._requireModifier = savedRequireModifier === 'true';
    }
    
    // Handlers enlazados
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseOver = this._handleMouseOver.bind(this);
    this._onMouseOut = this._handleMouseOut.bind(this);
    this._onClick = this._handleClick.bind(this);
    this._onBlur = this._handleBlur.bind(this);
  }
  
  /**
   * Inicializa los event listeners.
   */
  init() {
    // Tecla modificadora (solo en desktop)
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    
    // Hover sobre módulos y pines
    document.addEventListener('mouseover', this._onMouseOver);
    document.addEventListener('mouseout', this._onMouseOut);
    
    // Click para modo sin modificador (tablets) o modo toggle
    document.addEventListener('click', this._onClick);
    
    log.info('Signal flow highlighter inicializado');
  }
  
  /**
   * Limpia los event listeners.
   */
  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mouseover', this._onMouseOver);
    document.removeEventListener('mouseout', this._onMouseOut);
    document.removeEventListener('click', this._onClick);
    this._clearAllHighlights();
  }
  
  /**
   * Establece si se requiere tecla modificadora para activar.
   * @param {boolean} require
   */
  setRequireModifier(require) {
    this._requireModifier = require;
    localStorage.setItem(STORAGE_KEYS.SIGNAL_FLOW_REQUIRE_MODIFIER, String(require));
    if (require) {
      this._modifierKeyPressed = false;
      this._clearAllHighlights();
    }
  }
  
  /**
   * @returns {boolean} Si se requiere tecla modificadora
   */
  getRequireModifier() {
    return this._requireModifier;
  }
  
  /**
   * Actualiza la tecla modificadora desde el shortcut manager.
   * @param {string} key - Nombre de la tecla (ej: 'Control', 'Alt')
   */
  setModifierKey(key) {
    this._modifierKey = key;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  
  _handleKeyDown(e) {
    if (!this._requireModifier) return;
    if (e.key === this._modifierKey && !e.repeat) {
      this._modifierKeyPressed = true;
      // Si ya hay un elemento bajo el cursor, resaltar ahora
      if (this._hoveredElement) {
        const pinBtn = this._hoveredElement.closest?.('button.pin-btn');
        if (pinBtn && pinBtn.classList.contains('active')) {
          this._highlightPin(pinBtn);
        } else {
          const moduleEl = findModuleElement(this._hoveredElement);
          if (moduleEl) this._highlightModule(moduleEl);
        }
      }
    }
  }
  
  _handleKeyUp(e) {
    if (!this._requireModifier) return;
    if (e.key === this._modifierKey) {
      this._modifierKeyPressed = false;
      this._clearAllHighlights();
    }
  }
  
  _handleBlur() {
    this._modifierKeyPressed = false;
    this._hoveredElement = null;
    this._clearAllHighlights();
  }
  
  _handleMouseOver(e) {
    // Siempre trackear el elemento bajo el cursor
    this._hoveredElement = e.target;
    
    // Requiere modificador y no está pulsado → no resaltar, solo trackear
    if (this._requireModifier && !this._modifierKeyPressed) return;
    
    // ¿Es un pin de matriz?
    const pinBtn = e.target?.closest?.('button.pin-btn');
    if (pinBtn && pinBtn.classList.contains('active')) {
      this._highlightPin(pinBtn);
      return;
    }
    
    // ¿Es un módulo?
    const moduleEl = findModuleElement(e.target);
    if (moduleEl) {
      this._highlightModule(moduleEl);
      return;
    }
  }
  
  _handleMouseOut(e) {
    // Limpiar tracking si salimos del elemento trackeado
    const relatedTarget = e.relatedTarget;
    const currentModule = findModuleElement(e.target);
    const nextModule = relatedTarget ? findModuleElement(relatedTarget) : null;
    if (!nextModule || nextModule !== currentModule) {
      this._hoveredElement = relatedTarget || null;
    }
    
    if (this._requireModifier && !this._modifierKeyPressed) return;
    
    const pinBtn = e.target?.closest?.('button.pin-btn');
    const moduleEl = currentModule;
    
    if (pinBtn || moduleEl) {
      // Verificar que realmente estamos saliendo del elemento
      if (pinBtn && pinBtn.contains(relatedTarget)) return;
      if (moduleEl && moduleEl.contains(relatedTarget)) return;
      
      this._clearAllHighlights();
    }
  }
  
  _handleClick(e) {
    // En modo sin modificador: click sobre módulo o pin activa highlight
    if (this._requireModifier) return;
    
    // ¿Es un pin?
    const pinBtn = e.target?.closest?.('button.pin-btn');
    if (pinBtn && pinBtn.classList.contains('active')) {
      // Toggle: si ya está resaltado, limpiar
      if (pinBtn.classList.contains(CSS_CLASSES.SOURCE_PIN) || 
          pinBtn.classList.contains(CSS_CLASSES.DEST_PIN)) {
        this._clearAllHighlights();
      } else {
        this._clearAllHighlights();
        this._highlightPin(pinBtn);
      }
      return;
    }
    
    // ¿Es un módulo?
    const moduleEl = findModuleElement(e.target);
    if (moduleEl) {
      // No interferir con knobs, sliders, etc.
      const isControl = e.target.closest('.knob, .output-channel__slider-wrap, .synth-toggle, button');
      if (isControl && !pinBtn) return;
      
      if (moduleEl.classList.contains(CSS_CLASSES.SOURCE_GLOW) || 
          moduleEl.classList.contains(CSS_CLASSES.DEST_GLOW)) {
        this._clearAllHighlights();
      } else {
        this._clearAllHighlights();
        this._highlightModule(moduleEl);
      }
      return;
    }
    
    // Click fuera de módulo/pin → limpiar
    if (this._highlightedElements.size > 0 || this._highlightedPins.size > 0) {
      this._clearAllHighlights();
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // LÓGICA DE RESALTADO
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Resalta un módulo: busca todas las conexiones activas donde este módulo
   * es fuente o destino, y aplica glow a los módulos conectados.
   * @param {HTMLElement} moduleEl
   */
  _highlightModule(moduleEl) {
    const moduleId = getModuleId(moduleEl);
    if (!moduleId) return;
    
    this._clearAllHighlights();
    
    // Marcar el módulo como activo (sin color de flujo)
    moduleEl.classList.add(CSS_CLASSES.ACTIVE);
    this._highlightedElements.add(moduleEl);
    
    // Buscar en ambas matrices
    this._findAndHighlightForModule(moduleId, this._panel5Routing, this._matrixAudio);
    this._findAndHighlightForModule(moduleId, this._panel6Routing, this._matrixControl);
  }
  
  /**
   * Busca conexiones activas relacionadas con un módulo en una matriz.
   * @param {string} moduleId - ID del módulo
   * @param {Object} routing - { connections, sourceMap, destMap }
   * @param {import('./largeMatrix.js').LargeMatrix} matrix - Instancia de la matriz
   */
  _findAndHighlightForModule(moduleId, routing, matrix) {
    if (!routing || !routing.connections || !routing.sourceMap || !routing.destMap) return;
    
    const connections = routing.connections;
    const sourceMap = routing.sourceMap;
    const destMap = routing.destMap;
    
    for (const key of Object.keys(connections)) {
      const [rowStr, colStr] = key.split(':');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      
      const source = sourceMap.get(row);
      const dest = destMap.get(col);
      if (!source || !dest) continue;
      
      const sourceModuleIds = getModuleElementIds(source);
      const destModuleIds = getModuleElementIds(dest);
      
      const isSource = sourceModuleIds.includes(moduleId);
      const isDest = destModuleIds.includes(moduleId);
      
      if (isSource) {
        // Este módulo es la fuente → resaltar destino en MAGENTA
        destModuleIds.forEach(id => this._applyGlowToModule(id, CSS_CLASSES.DEST_GLOW));
        // Resaltar el pin como destino
        this._applyGlowToPin(matrix, row, col, CSS_CLASSES.DEST_PIN);
      }
      
      if (isDest) {
        // Este módulo es el destino → resaltar fuente en CYAN
        sourceModuleIds.forEach(id => this._applyGlowToModule(id, CSS_CLASSES.SOURCE_GLOW));
        // Resaltar el pin como fuente
        this._applyGlowToPin(matrix, row, col, CSS_CLASSES.SOURCE_PIN);
      }
    }
  }
  
  /**
   * Resalta un pin activo: identifica su fuente y destino y aplica glow.
   * @param {HTMLButtonElement} pinBtn
   */
  _highlightPin(pinBtn) {
    const row = parseInt(pinBtn.dataset.row, 10);
    const col = parseInt(pinBtn.dataset.col, 10);
    if (isNaN(row) || isNaN(col)) return;
    
    this._clearAllHighlights();
    
    // Determinar a qué matriz pertenece este pin
    const table = pinBtn.closest('table');
    if (!table) return;
    
    let routing, matrix;
    if (this._matrixAudio?.table === table) {
      routing = this._panel5Routing;
      matrix = this._matrixAudio;
    } else if (this._matrixControl?.table === table) {
      routing = this._panel6Routing;
      matrix = this._matrixControl;
    } else {
      return;
    }
    
    if (!routing?.sourceMap || !routing?.destMap) return;
    
    const source = routing.sourceMap.get(row);
    const dest = routing.destMap.get(col);
    
    if (source) {
      const sourceIds = getModuleElementIds(source);
      sourceIds.forEach(id => this._applyGlowToModule(id, CSS_CLASSES.SOURCE_GLOW));
    }
    
    if (dest) {
      const destIds = getModuleElementIds(dest);
      destIds.forEach(id => this._applyGlowToModule(id, CSS_CLASSES.DEST_GLOW));
    }
    
    // Marcar el pin como activo
    pinBtn.classList.add(CSS_CLASSES.ACTIVE);
    this._highlightedPins.add(pinBtn);
  }
  
  /**
   * Aplica una clase de glow a un módulo por su ID.
   * @param {string} moduleId - ID del elemento DOM
   * @param {string} cssClass - Clase CSS a aplicar
   */
  _applyGlowToModule(moduleId, cssClass) {
    const el = document.getElementById(moduleId);
    if (!el) return;
    
    // Si ya tiene el otro tipo de glow (es fuente Y destino de sí mismo),
    // no sobrescribir
    if (el.classList.contains(CSS_CLASSES.SOURCE_GLOW) && cssClass === CSS_CLASSES.DEST_GLOW) return;
    if (el.classList.contains(CSS_CLASSES.DEST_GLOW) && cssClass === CSS_CLASSES.SOURCE_GLOW) return;
    
    el.classList.add(cssClass);
    this._highlightedElements.add(el);
  }
  
  /**
   * Aplica una clase de glow a un pin de la matriz.
   * @param {import('./largeMatrix.js').LargeMatrix} matrix
   * @param {number} row
   * @param {number} col
   * @param {string} cssClass
   */
  _applyGlowToPin(matrix, row, col, cssClass) {
    if (!matrix?.table) return;
    const pinBtn = matrix.table.querySelector(`button.pin-btn[data-row="${row}"][data-col="${col}"]`);
    if (!pinBtn) return;
    
    pinBtn.classList.add(cssClass);
    this._highlightedPins.add(pinBtn);
  }
  
  /**
   * Limpia todos los resaltados activos.
   */
  _clearAllHighlights() {
    for (const el of this._highlightedElements) {
      el.classList.remove(
        CSS_CLASSES.SOURCE_GLOW,
        CSS_CLASSES.DEST_GLOW,
        CSS_CLASSES.ACTIVE
      );
    }
    this._highlightedElements.clear();
    
    for (const pin of this._highlightedPins) {
      pin.classList.remove(
        CSS_CLASSES.SOURCE_PIN,
        CSS_CLASSES.DEST_PIN,
        CSS_CLASSES.ACTIVE
      );
    }
    this._highlightedPins.clear();
  }
}
