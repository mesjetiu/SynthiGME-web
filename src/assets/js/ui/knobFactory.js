/**
 * Factory para crear elementos DOM de knobs.
 * Centraliza la creación del markup HTML para evitar duplicación.
 * 
 * @module ui/knobFactory
 */

import { Knob } from './knob.js';

/**
 * Crea los elementos DOM para un knob con label y valor opcional.
 * NO instancia la clase Knob, solo crea el markup.
 * 
 * @param {Object} options - Opciones de configuración
 * @param {string} [options.label] - Texto del label (opcional)
 * @param {string} [options.size=''] - Tamaño: '' (normal), 'sm', 'lg'
 * @param {string} [options.className=''] - Clases CSS adicionales para el wrapper
 * @param {boolean} [options.showValue=false] - Mostrar elemento de valor
 * @returns {Object} { wrapper, knobEl, inner, labelEl?, valueEl? }
 * 
 * @example
 * const { wrapper, knobEl, valueEl } = createKnobElements({
 *   label: 'Freq',
 *   size: 'sm',
 *   showValue: true
 * });
 * container.appendChild(wrapper);
 * 
 * // Luego instanciar el Knob
 * new Knob(knobEl, { min: 0, max: 100, valueElement: valueEl, ... });
 */
export function createKnobElements(options = {}) {
  const {
    label = '',
    size = '',
    className = '',
    showValue = false
  } = options;

  // Wrapper principal
  const wrapper = document.createElement('div');
  wrapper.className = `knob-wrapper${className ? ' ' + className : ''}`;

  // Elemento del knob
  const knobEl = document.createElement('div');
  const sizeClass = size ? ` knob--${size}` : '';
  knobEl.className = `knob${sizeClass}`;

  // Inner (indicador de rotación)
  const inner = document.createElement('div');
  inner.className = 'knob-inner';
  knobEl.appendChild(inner);

  wrapper.appendChild(knobEl);

  const result = { wrapper, knobEl, inner };

  // Label opcional
  if (label) {
    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);
    result.labelEl = labelEl;
  }

  // Valor opcional
  if (showValue) {
    const valueEl = document.createElement('div');
    valueEl.className = 'knob-value';
    wrapper.appendChild(valueEl);
    result.valueEl = valueEl;
  }

  return result;
}

/**
 * Crea un knob completo con elementos DOM e instancia de Knob.
 * Versión "todo en uno" para casos simples.
 * 
 * @param {Object} options - Opciones de configuración
 * @param {string} [options.label] - Texto del label
 * @param {string} [options.size=''] - Tamaño: '' (normal), 'sm', 'lg'
 * @param {string} [options.className=''] - Clases CSS adicionales
 * @param {boolean} [options.showValue=false] - Mostrar elemento de valor
 * @param {number} [options.min=0] - Valor mínimo
 * @param {number} [options.max=1] - Valor máximo
 * @param {number} [options.initial=0] - Valor inicial
 * @param {number} [options.pixelsForFullRange=150] - Píxeles para rango completo
 * @param {Function} [options.onChange] - Callback al cambiar valor
 * @param {Function} [options.format] - Función para formatear el valor mostrado
 * @returns {Object} { wrapper, knobEl, knobInstance, valueEl?, labelEl? }
 * 
 * @example
 * const { wrapper, knobInstance } = createKnob({
 *   label: 'Volume',
 *   min: 0,
 *   max: 1,
 *   initial: 0.5,
 *   showValue: true,
 *   format: v => v.toFixed(2),
 *   onChange: v => setVolume(v)
 * });
 * container.appendChild(wrapper);
 */
export function createKnob(options = {}) {
  const {
    label,
    size,
    className,
    showValue = false,
    min = 0,
    max = 1,
    initial = 0,
    pixelsForFullRange = 150,
    onChange,
    format
  } = options;

  // Crear elementos DOM
  const elements = createKnobElements({ label, size, className, showValue });

  // Opciones para la instancia Knob
  const knobOptions = {
    min,
    max,
    initial,
    pixelsForFullRange
  };

  if (onChange) knobOptions.onChange = onChange;
  if (format) knobOptions.format = format;
  if (elements.valueEl) knobOptions.valueElement = elements.valueEl;

  // Crear instancia
  const knobInstance = new Knob(elements.knobEl, knobOptions);

  return {
    ...elements,
    knobInstance
  };
}
