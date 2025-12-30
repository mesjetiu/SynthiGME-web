/**
 * NoiseGenerator - Componente UI para generador de ruido
 * 
 * Genera la interfaz visual con 2 knobs:
 * - Colour: Control del color del ruido (blanco a rosa)
 * - Level: Nivel de salida
 * 
 * Sigue el mismo formato visual que SGME_Oscillator.
 * 
 * @example
 * ```javascript
 * const noise = new NoiseGenerator({
 *   id: 'noise-1',
 *   title: 'Noise 1',
 *   knobOptions: {
 *     colour: { min: 0, max: 1, initial: 0.5, onChange: fn },
 *     level: { min: 0, max: 1, initial: 0, onChange: fn }
 *   }
 * });
 * container.appendChild(noise.createElement());
 * ```
 */

import { Knob } from './knob.js';

export class NoiseGenerator {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Noise'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    const {
      id = 'noise-gen',
      title = 'Noise',
      knobOptions = {},
      knobSize = 40
    } = options;

    this.id = id;
    this.title = title;
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
    container.className = 'noise-generator';

    // Header con título
    const header = document.createElement('div');
    header.className = 'noise-generator__header';
    header.textContent = this.title;
    container.appendChild(header);

    // Contenedor de knobs
    const knobsRow = document.createElement('div');
    knobsRow.className = 'noise-generator__knobs';

    // Knob 1: Colour
    const colourShell = this._createKnobShell('Colour', 'colour');
    knobsRow.appendChild(colourShell);

    // Knob 2: Level
    const levelShell = this._createKnobShell('Level', 'level');
    knobsRow.appendChild(levelShell);

    container.appendChild(knobsRow);

    this.element = container;
    return container;
  }

  /**
   * Crea un shell de knob con label (encima) y knob.
   * @private
   */
  _createKnobShell(label, key) {
    const shell = document.createElement('div');
    shell.className = 'noise-generator__knob-shell';

    // Label encima del knob
    const labelEl = document.createElement('div');
    labelEl.className = 'noise-generator__knob-label';
    labelEl.textContent = label;
    shell.appendChild(labelEl);

    // Knob container
    const knobContainer = document.createElement('div');
    knobContainer.className = 'knob noise-generator__knob';

    const knobInner = document.createElement('div');
    knobInner.className = 'knob-inner';
    knobContainer.appendChild(knobInner);
    shell.appendChild(knobContainer);

    // Valor (oculto por CSS, pero existe para compatibilidad)
    const valueEl = document.createElement('div');
    valueEl.className = 'noise-generator__knob-value';
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
   * @param {'colour' | 'level'} key
   * @returns {number}
   */
  getValue(key) {
    return this.knobs[key]?.getValue() ?? 0;
  }

  /**
   * Establece el valor de un knob.
   * @param {'colour' | 'level'} key
   * @param {number} value
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
}

export default NoiseGenerator;
