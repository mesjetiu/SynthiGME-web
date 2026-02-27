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
 * Extiende ModuleUI para reutilizar la lógica común de knobs.
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

import { ModuleUI } from './moduleUI.js';
import { KNOB_RED, KNOB_WHITE } from '../configs/knobColors.js';

export class RandomVoltage extends ModuleUI {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del componente
   * @param {string} [options.title='Random Voltage'] - Título mostrado
   * @param {Object} [options.knobOptions] - Configuración de knobs
   * @param {number} [options.knobSize=40] - Tamaño de los knobs en px
   */
  constructor(options = {}) {
    super({
      id: options.id || 'random-voltage',
      title: options.title || 'Random Voltage',
      cssClass: 'random-voltage',
      knobDefs: [
        { key: 'mean', label: 'Mean', color: KNOB_RED },
        { key: 'variance', label: 'Variance', color: KNOB_RED },
        { key: 'voltage1', label: 'Voltage 1', color: KNOB_WHITE },
        { key: 'voltage2', label: 'Voltage 2', color: KNOB_WHITE },
        { key: 'key', label: 'Key', color: KNOB_WHITE }
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

export default RandomVoltage;
