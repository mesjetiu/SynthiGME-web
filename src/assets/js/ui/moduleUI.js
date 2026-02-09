/**
 * ModuleUI - Clase base para componentes UI de módulos del sintetizador.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * Proporciona funcionalidad común para módulos que tienen:
 * - Un título/header
 * - Una fila de knobs configurables
 * - Métodos getValue/setValue para acceder a los knobs
 * 
 * Las subclases solo necesitan definir:
 * - cssClass: string con el nombre de clase CSS base
 * - knobDefs: array de {key, label} para los knobs
 * 
 * @module ui/moduleUI
 * @see state/schema.js para definición de KnobModuleState
 * 
 * @example
 * ```javascript
 * class MyModule extends ModuleUI {
 *   constructor(options) {
 *     super({
 *       ...options,
 *       cssClass: 'my-module',
 *       knobDefs: [
 *         { key: 'param1', label: 'Param 1' },
 *         { key: 'param2', label: 'Param 2' }
 *       ]
 *     });
 *   }
 * }
 * ```
 */

import { Knob } from './knob.js';

export class ModuleUI {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Module'] - Título mostrado
   * @param {string} options.cssClass - Clase CSS base (ej: 'noise-generator')
   * @param {Array<{key: string, label: string}>} options.knobDefs - Definiciones de knobs
   * @param {Object} [options.knobOptions] - Configuración de knobs {key: {min, max, initial, onChange}}
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    const {
      id = 'module',
      title = 'Module',
      cssClass = 'module-ui',
      knobDefs = [],
      knobOptions = {},
      knobSize = 40
    } = options;

    this.id = id;
    this.title = title;
    this.cssClass = cssClass;
    this.knobDefs = knobDefs;
    this.knobOptions = knobOptions;
    this.knobSize = knobSize;
    this.knobInnerPct = options.knobInnerPct ?? 76;
    
    // knobGap: array (gap entre cada par de knobs) o número uniforme
    const rawGap = options.knobGap ?? 8;
    this.knobGap = Array.isArray(rawGap) ? rawGap : Array(Math.max(0, knobDefs.length - 1)).fill(rawGap);
    
    this.knobRowOffsetX = options.knobRowOffsetX ?? 0;
    this.knobRowOffsetY = options.knobRowOffsetY ?? 0;
    this.knobOffsets = options.knobOffsets || new Array(knobDefs.length).fill(0);
    
    this.element = null;
    this.knobs = {};
  }

  /**
   * Crea el elemento DOM del componente.
   * @returns {HTMLElement}
   */
  createElement() {
    const container = document.createElement('div');
    container.id = this.id;
    container.className = this.cssClass;
    
    // CSS custom properties para knob sizing
    container.style.setProperty('--module-knob-size', `${this.knobSize}px`);
    container.style.setProperty('--module-knob-inner-pct', `${this.knobInnerPct}%`);

    // Header con título
    const header = document.createElement('div');
    header.className = `${this.cssClass}__header`;
    header.textContent = this.title;
    container.appendChild(header);

    // Contenedor de knobs
    const knobsRow = document.createElement('div');
    knobsRow.className = `${this.cssClass}__knobs`;
    // Offset de toda la fila de knobs
    if (this.knobRowOffsetX || this.knobRowOffsetY) {
      knobsRow.style.transform = `translate(${this.knobRowOffsetX}px, ${this.knobRowOffsetY}px)`;
    }
    // Gap: 0 en grid, margenes individuales por shell
    knobsRow.style.gap = '0';

    // Crear knobs según definiciones
    this.knobDefs.forEach((def, idx) => {
      const shell = this._createKnobShell(def.label, def.key);
      // Gap individual: margin-left basado en knobGap[idx-1]
      if (idx > 0 && this.knobGap[idx - 1]) {
        shell.style.marginLeft = `${this.knobGap[idx - 1]}px`;
      }
      // Offset Y individual por knob
      if (Number.isFinite(this.knobOffsets[idx]) && this.knobOffsets[idx] !== 0) {
        shell.style.transform = `translateY(${this.knobOffsets[idx]}px)`;
      }
      knobsRow.appendChild(shell);
    });

    container.appendChild(knobsRow);

    this.element = container;
    return container;
  }

  /**
   * Crea un shell de knob con label y knob.
   * @param {string} label - Etiqueta del knob
   * @param {string} key - Clave para acceder al knob
   * @returns {HTMLElement}
   * @private
   */
  _createKnobShell(label, key) {
    const shell = document.createElement('div');
    shell.className = `${this.cssClass}__knob-shell`;

    // Label encima del knob
    const labelEl = document.createElement('div');
    labelEl.className = `${this.cssClass}__knob-label`;
    labelEl.textContent = label;
    shell.appendChild(labelEl);

    // Knob container
    const knobContainer = document.createElement('div');
    knobContainer.className = `knob ${this.cssClass}__knob`;

    const knobInner = document.createElement('div');
    knobInner.className = 'knob-inner';
    knobContainer.appendChild(knobInner);
    shell.appendChild(knobContainer);

    // Valor debajo del knob (visible, muestra escala 0-10)
    const valueEl = document.createElement('div');
    valueEl.className = `knob-value ${this.cssClass}__knob-value`;
    shell.appendChild(valueEl);

    // Crear instancia de Knob con escala Synthi 100
    const opts = this.knobOptions[key] || {};
    const knobConfig = {
      valueElement: valueEl,
      min: opts.min ?? 0,
      max: opts.max ?? 1,
      initial: opts.initial ?? 0,
      onChange: opts.onChange || (() => {}),
      pixelsForFullRange: opts.pixelsForFullRange ?? 150,
      // Escala de display estilo Synthi 100
      scaleMin: opts.scaleMin ?? 0,
      scaleMax: opts.scaleMax ?? 10,
      scaleDecimals: opts.scaleDecimals ?? 1
    };
    // Tooltip técnico (si lo proporciona el caller)
    if (opts.getTooltipInfo) {
      knobConfig.getTooltipInfo = opts.getTooltipInfo;
    }
    const knob = new Knob(knobContainer, knobConfig);

    this.knobs[key] = knob;

    return shell;
  }

  /**
   * Obtiene el valor actual de un knob.
   * @param {string} key - Clave del knob
   * @returns {number}
   */
  getValue(key) {
    return this.knobs[key]?.getValue() ?? 0;
  }

  /**
   * Establece el valor de un knob.
   * @param {string} key - Clave del knob
   * @param {number} value - Nuevo valor
   */
  setValue(key, value) {
    this.knobs[key]?.setValue(value);
  }

  /**
   * Obtiene el elemento DOM.
   * @returns {HTMLElement}
   */
  getElement() {
    return this.element;
  }
  
  /**
   * Serializa el estado del módulo para guardarlo en un patch.
   * @returns {import('../state/schema.js').KnobModuleState} Estado serializado (objeto clave-valor)
   */
  serialize() {
    const data = {};
    for (const key of Object.keys(this.knobs)) {
      data[key] = this.knobs[key].getValue();
    }
    return data;
  }
  
  /**
   * Restaura el estado del módulo desde un patch.
   * @param {Partial<import('../state/schema.js').KnobModuleState>} data - Estado serializado
   */
  deserialize(data) {
    if (!data) return;
    for (const key of Object.keys(data)) {
      if (this.knobs[key] && typeof data[key] === 'number') {
        this.knobs[key].setValue(data[key]);
      }
    }
  }
}

export default ModuleUI;
