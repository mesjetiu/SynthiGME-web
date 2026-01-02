/**
 * ModuleUI - Clase base para componentes UI de módulos del sintetizador
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

    // Header con título
    const header = document.createElement('div');
    header.className = `${this.cssClass}__header`;
    header.textContent = this.title;
    container.appendChild(header);

    // Contenedor de knobs
    const knobsRow = document.createElement('div');
    knobsRow.className = `${this.cssClass}__knobs`;

    // Crear knobs según definiciones
    for (const def of this.knobDefs) {
      const shell = this._createKnobShell(def.label, def.key);
      knobsRow.appendChild(shell);
    }

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

    // Valor (oculto por CSS, pero existe para compatibilidad)
    const valueEl = document.createElement('div');
    valueEl.className = `${this.cssClass}__knob-value`;
    valueEl.textContent = '0';
    shell.appendChild(valueEl);

    // Crear instancia de Knob
    const opts = this.knobOptions[key] || {};
    const knob = new Knob(knobContainer, {
      valueElement: valueEl,
      min: opts.min ?? 0,
      max: opts.max ?? 1,
      initial: opts.initial ?? 0,
      onChange: opts.onChange || (() => {}),
      format: (v) => v.toFixed(2),
      pixelsForFullRange: opts.pixelsForFullRange ?? 150
    });

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
   * @returns {Object} Estado serializado
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
   * @param {Object} data - Estado serializado
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
