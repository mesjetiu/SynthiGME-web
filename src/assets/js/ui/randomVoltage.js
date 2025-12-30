/**
 * RandomVoltage - Componente UI para Random Control Voltage Generator
 * 
 * Genera la interfaz visual con 5 knobs:
 * - Mean: Valor medio de la señal aleatoria
 * - Variance: Varianza/dispersión de los valores
 * - Voltage 1: Salida de voltaje 1
 * - Voltage 2: Salida de voltaje 2
 * - Key: Control de disparo/gate
 * 
 * Sigue el mismo formato visual que SGME_Oscillator.
 * 
 * @example
 * ```javascript
 * const rcvg = new RandomVoltage({
 *   id: 'random-cv-1',
 *   title: 'Random Voltage',
 *   knobOptions: {
 *     mean: { min: -1, max: 1, initial: 0, onChange: fn },
 *     variance: { min: 0, max: 1, initial: 0.5, onChange: fn },
 *     voltage1: { min: 0, max: 1, initial: 0, onChange: fn },
 *     voltage2: { min: 0, max: 1, initial: 0, onChange: fn },
 *     key: { min: 0, max: 1, initial: 0, onChange: fn }
 *   }
 * });
 * container.appendChild(rcvg.createElement());
 * ```
 */

import { Knob } from './knob.js';

export class RandomVoltage {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Random Voltage'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    const {
      id = 'random-voltage',
      title = 'Random Voltage',
      knobOptions = {},
      knobSize = 40
    } = options;

    this.id = id;
    this.title = title;
    this.knobOptions = knobOptions;
    this.knobSize = knobSize;
    
    this.element = null;
    this.knobs = {};
    
    // Definición de los 5 knobs
    this.knobDefs = [
      { key: 'mean', label: 'Mean' },
      { key: 'variance', label: 'Variance' },
      { key: 'voltage1', label: 'Voltage 1' },
      { key: 'voltage2', label: 'Voltage 2' },
      { key: 'key', label: 'Key' }
    ];
  }

  /**
   * Crea el elemento DOM del componente.
   * @returns {HTMLElement}
   */
  createElement() {
    const container = document.createElement('div');
    container.id = this.id;
    container.className = 'random-voltage';

    // Header con título
    const header = document.createElement('div');
    header.className = 'random-voltage__header';
    header.textContent = this.title;
    container.appendChild(header);

    // Contenedor de knobs
    const knobsRow = document.createElement('div');
    knobsRow.className = 'random-voltage__knobs';

    // Crear los 5 knobs
    for (const def of this.knobDefs) {
      const shell = this._createKnobShell(def.label, def.key);
      knobsRow.appendChild(shell);
    }

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
    shell.className = 'random-voltage__knob-shell';

    // Label encima del knob
    const labelEl = document.createElement('div');
    labelEl.className = 'random-voltage__knob-label';
    labelEl.textContent = label;
    shell.appendChild(labelEl);

    // Knob container
    const knobContainer = document.createElement('div');
    knobContainer.className = 'knob random-voltage__knob';

    const knobInner = document.createElement('div');
    knobInner.className = 'knob-inner';
    knobContainer.appendChild(knobInner);
    shell.appendChild(knobContainer);

    // Valor (oculto por CSS, pero existe para compatibilidad)
    const valueEl = document.createElement('div');
    valueEl.className = 'random-voltage__knob-value';
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
   * @param {'mean' | 'variance' | 'voltage1' | 'voltage2' | 'key'} key
   * @returns {number}
   */
  getValue(key) {
    return this.knobs[key]?.getValue() ?? 0;
  }

  /**
   * Establece el valor de un knob.
   * @param {'mean' | 'variance' | 'voltage1' | 'voltage2' | 'key'} key
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

export default RandomVoltage;
