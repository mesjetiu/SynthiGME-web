/**
 * RandomVoltage - Componente UI para Random Control Voltage Generator
 * 
 * Genera la interfaz visual con 5 knobs:
 * - Mean: Ritmo promedio del reloj (0.2-20 Hz, exponencial)
 * - Variance: Varianza temporal (-5=constante, +5=máxima irregularidad)
 * - Voltage 1: Nivel de salida V1 (±2.5V, curva LOG)
 * - Voltage 2: Nivel de salida V2 (±2.5V, curva LOG)
 * - Key: Amplitud del pulso de disparo (±5V, 5ms)
 * 
 * Extiende ModuleUI para reutilizar la lógica común de knobs.
 * 
 * @example
 * ```javascript
 * const rcvg = new RandomVoltage({
 *   id: 'random-cv-1',
 *   title: 'Random Control Voltage',
 *   knobOptions: {
 *     mean: { min: -5, max: 5, initial: 0, onChange: fn },
 *     variance: { min: -5, max: 5, initial: 0, onChange: fn },
 *     voltage1: { min: 0, max: 10, initial: 0, onChange: fn },
 *     voltage2: { min: 0, max: 10, initial: 0, onChange: fn },
 *     key: { min: -5, max: 5, initial: 0, onChange: fn }
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
    const defColors = options.knobColors || ['red', 'red', 'white', 'white', 'white'];
    const defTypes = options.knobTypes || ['bipolar', 'normal', 'bipolar', 'bipolar', 'normal'];
    
    const getHexColor = (colorName, fallback) => {
      const cmap = { blue: '#547FA1', white: '#BEB7B1', red: KNOB_RED, yellow: '#C8A638', green: '#467660', black: '#242227' };
      return cmap[colorName] || fallback;
    };

    super({
      id: options.id || 'random-voltage',
      title: options.title || 'Random Control Voltage',
      cssClass: 'random-voltage',
      knobDefs: [
        { key: 'mean', label: 'Mean', color: getHexColor(defColors[0], KNOB_RED), type: defTypes[0] },
        { key: 'variance', label: 'Variance', color: getHexColor(defColors[1], KNOB_RED), type: defTypes[1] },
        { key: 'voltage1', label: 'Voltage 1', color: getHexColor(defColors[2], KNOB_WHITE), type: defTypes[2] },
        { key: 'voltage2', label: 'Voltage 2', color: getHexColor(defColors[3], KNOB_WHITE), type: defTypes[3] },
        { key: 'key', label: 'Key', color: getHexColor(defColors[4], KNOB_WHITE), type: defTypes[4] }
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
