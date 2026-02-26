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
 * @param {string} [options.svgSrc='assets/knobs/knob.svg'] - Ruta al SVG del anillo exterior
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
    showValue = false,
    centerColor = '',
    svgSrc = 'assets/knobs/knob.svg'
  } = options;

  // Wrapper principal
  const wrapper = document.createElement('div');
  wrapper.className = `knob-wrapper${className ? ' ' + className : ''}`;

  // Elemento del knob
  const knobEl = document.createElement('div');
  const sizeClass = size ? ` knob--${size}` : '';
  knobEl.className = `knob knob--svg${sizeClass}`;

  // Inner (indicador de rotación) - contiene el SVG del anillo que gira
  const inner = document.createElement('div');
  inner.className = 'knob-inner';
  const ringImg = document.createElement('img');
  ringImg.className = 'knob-svg-ring';
  ringImg.src = svgSrc;
  ringImg.alt = '';
  ringImg.draggable = false;
  inner.appendChild(ringImg);
  knobEl.appendChild(inner);

  // Centro de color (no rota) - brillo simulado fijo
  const center = document.createElement('div');
  center.className = 'knob-center';
  if (centerColor) {
    center.style.setProperty('--knob-center-color', centerColor);
  }
  knobEl.appendChild(center);

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
 * @param {boolean} [options.showValue=true] - Mostrar elemento de valor (default: true)
 * @param {string} [options.svgSrc='assets/knobs/knob.svg'] - Ruta al SVG del anillo exterior
 * @param {number} [options.min=0] - Valor mínimo interno
 * @param {number} [options.max=1] - Valor máximo interno
 * @param {number} [options.initial=0] - Valor inicial
 * @param {number} [options.pixelsForFullRange=150] - Píxeles para rango completo
 * @param {number} [options.scaleMin=0] - Valor mínimo de la escala de display (estilo Synthi 100)
 * @param {number} [options.scaleMax=10] - Valor máximo de la escala de display (estilo Synthi 100)
 * @param {number} [options.scaleDecimals=1] - Decimales a mostrar en la escala
 * @param {Function} [options.onChange] - Callback al cambiar valor
 * @param {Function} [options.format] - Función para formatear el valor mostrado (deprecated, usar scale*)
 * @returns {Object} { wrapper, knobEl, knobInstance, valueEl?, labelEl? }
 * 
 * @example
 * const { wrapper, knobInstance } = createKnob({
 *   label: 'Volume',
 *   min: 0,
 *   max: 1,
 *   initial: 0.5,
 *   scaleMin: 0,
 *   scaleMax: 10,
 *   onChange: v => setVolume(v)
 * });
 * container.appendChild(wrapper);
 */
export function createKnob(options = {}) {
  const {
    label,
    size,
    className,
    centerColor,
    svgSrc,
    showValue = true, // Por defecto mostrar valor
    min = 0,
    max = 1,
    initial = 0,
    pixelsForFullRange = 150,
    scaleMin = 0,
    scaleMax = 10,
    scaleDecimals = 1,
    onChange,
    format,
    getTooltipInfo
  } = options;

  // Crear elementos DOM
  const elements = createKnobElements({ label, size, className, showValue, centerColor, svgSrc });

  // Opciones para la instancia Knob
  const knobOptions = {
    min,
    max,
    initial,
    pixelsForFullRange,
    scaleMin,
    scaleMax,
    scaleDecimals
  };

  if (onChange) knobOptions.onChange = onChange;
  if (format) knobOptions.format = format;
  if (getTooltipInfo) knobOptions.getTooltipInfo = getTooltipInfo;
  if (elements.valueEl) knobOptions.valueElement = elements.valueEl;

  // Crear instancia
  const knobInstance = new Knob(elements.knobEl, knobOptions);

  return {
    ...elements,
    knobInstance
  };
}
