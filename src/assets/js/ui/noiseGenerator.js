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
import { KNOB_BLUE, KNOB_WHITE } from '../configs/knobColors.js';

export class NoiseGenerator extends ModuleUI {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Noise'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    // Si options.knobColors o options.knobTypes existen (pasados desde el blueprint a través de app.js layout)
    const defColors = options.knobColors || ['blue', 'white'];
    const defTypes = options.knobTypes || ['bipolar', 'normal'];

    const getHexColor = (colorName, fallback) => {
      const cmap = { blue: KNOB_BLUE, white: KNOB_WHITE, red: '#B54049', yellow: '#C8A638', green: '#467660', black: '#242227' };
      return cmap[colorName] || fallback;
    };

    super({
      id: options.id || 'noise-gen',
      title: options.title || 'Noise',
      cssClass: 'noise-generator',
      knobDefs: [
        { key: 'colour', label: 'Colour', color: getHexColor(defColors[0], KNOB_BLUE), type: defTypes[0] },
        { key: 'level', label: 'Level', color: getHexColor(defColors[1], KNOB_WHITE), type: defTypes[1] }
      ],
      knobOptions: options.knobOptions || {},
      knobSize: options.knobSize || 40,
      knobInnerPct: options.knobInnerPct,
      knobGap: options.knobGap,
      knobRowOffsetX: options.knobRowOffsetX,
      knobRowOffsetY: options.knobRowOffsetY,
      knobOffsets: options.knobOffsets
    });
  }
}

export default NoiseGenerator;
