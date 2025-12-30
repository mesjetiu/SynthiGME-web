/**
 * NoiseGenerator - Componente UI para generador de ruido
 * 
 * Genera la interfaz visual con 2 knobs:
 * - Colour: Control del color del ruido (blanco a rosa)
 * - Level: Nivel de salida
 * 
 * Extiende ModuleUI para reutilizar la lógica común de knobs.
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

import { ModuleUI } from './moduleUI.js';

export class NoiseGenerator extends ModuleUI {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Noise'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    super({
      id: options.id || 'noise-gen',
      title: options.title || 'Noise',
      cssClass: 'noise-generator',
      knobDefs: [
        { key: 'colour', label: 'Colour' },
        { key: 'level', label: 'Level' }
      ],
      knobOptions: options.knobOptions || {},
      knobSize: options.knobSize || 40
    });
  }
}

export default NoiseGenerator;
