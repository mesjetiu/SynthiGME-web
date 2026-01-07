/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INPUT AMPLIFIER UI - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Componente UI para los 8 canales de entrada del sintetizador.
 * Muestra 8 knobs de ganancia en una fila horizontal.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * @module ui/inputAmplifierUI
 * @see state/schema.js para definición de LevelsState
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ModuleFrame } from './moduleFrame.js';
import { Knob } from './knob.js';

export class InputAmplifierUI {
  
  /**
   * @param {Object} options
   * @param {string} [options.id='input-amplifiers'] - ID del módulo
   * @param {string} [options.title='Input Amplifier Level'] - Título del panelillo
   * @param {number} [options.channels=8] - Número de canales
   * @param {Object} [options.knobConfig] - Configuración de los knobs
   * @param {Function} [options.onLevelChange] - Callback: (channel, value) => {}
   */
  constructor(options = {}) {
    this.id = options.id || 'input-amplifiers';
    this.title = options.title || 'Input Amplifier Level';
    this.channels = options.channels || 8;
    this.knobConfig = options.knobConfig || {
      min: 0,
      max: 1,
      initial: 0,
      pixelsForFullRange: 150
    };
    this.onLevelChange = options.onLevelChange || null;
    
    /**
     * Referencias a los knobs creados
     * @type {Knob[]}
     */
    this.knobs = [];
    
    /**
     * Elemento DOM raíz
     * @type {HTMLElement}
     */
    this.element = null;
    
    /**
     * Frame del módulo
     * @type {ModuleFrame}
     */
    this.frame = null;
  }

  /**
   * Crea el elemento DOM del componente
   * @returns {HTMLElement}
   */
  createElement() {
    // Crear frame con ModuleFrame
    this.frame = new ModuleFrame({
      id: this.id,
      title: this.title,
      className: 'synth-module--input-amplifier'
    });
    
    this.element = this.frame.createElement();
    
    // Contenedor de knobs en fila horizontal
    const knobsRow = document.createElement('div');
    knobsRow.className = 'input-amplifier__knobs-row';
    
    // Crear 8 knobs
    for (let i = 0; i < this.channels; i++) {
      const knobWrapper = this._createChannelKnob(i);
      knobsRow.appendChild(knobWrapper);
    }
    
    // Añadir al área de controles (no content, para que quede en la parte inferior)
    this.frame.appendToContent(knobsRow);
    
    return this.element;
  }

  /**
   * Crea un knob para un canal
   * @private
   * @param {number} channel - Índice del canal (0-7)
   * @returns {HTMLElement}
   */
  _createChannelKnob(channel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-amplifier__channel';
    
    // Label superior "Channel N"
    const label = document.createElement('div');
    label.className = 'input-amplifier__label';
    label.textContent = `Channel ${channel + 1}`;
    wrapper.appendChild(label);
    
    // Contenedor del knob
    const knobEl = document.createElement('div');
    knobEl.className = 'knob knob--sm input-amplifier__knob';
    
    const inner = document.createElement('div');
    inner.className = 'knob-inner';
    knobEl.appendChild(inner);
    wrapper.appendChild(knobEl);
    
    // Crear instancia del Knob
    const knobInstance = new Knob(knobEl, {
      min: this.knobConfig.min,
      max: this.knobConfig.max,
      initial: this.knobConfig.initial,
      pixelsForFullRange: this.knobConfig.pixelsForFullRange,
      onChange: (value) => {
        if (this.onLevelChange) {
          this.onLevelChange(channel, value);
        }
      }
    });
    
    this.knobs.push(knobInstance);
    
    return wrapper;
  }

  /**
   * Establece el valor de un knob programáticamente
   * @param {number} channel - Índice del canal (0-7)
   * @param {number} value - Valor (0-1)
   */
  setLevel(channel, value) {
    const knob = this.knobs[channel];
    if (knob) {
      knob.setValue(value);
    }
  }

  /**
   * Obtiene el valor actual de un knob
   * @param {number} channel - Índice del canal (0-7)
   * @returns {number}
   */
  getLevel(channel) {
    const knob = this.knobs[channel];
    return knob ? knob.getValue() : 0;
  }

  /**
   * Obtiene el elemento DOM
   * @returns {HTMLElement}
   */
  getElement() {
    return this.element;
  }
  
  /**
   * Serializa el estado del módulo para guardarlo en un patch.
   * @returns {import('../state/schema.js').LevelsState} Estado serializado
   */
  serialize() {
    return {
      levels: this.knobs.map(k => k.getValue())
    };
  }
  
  /**
   * Restaura el estado del módulo desde un patch.
   * @param {Partial<import('../state/schema.js').LevelsState>} data - Estado serializado
   */
  deserialize(data) {
    if (!data || !Array.isArray(data.levels)) return;
    data.levels.forEach((value, idx) => {
      if (this.knobs[idx] && typeof value === 'number') {
        this.knobs[idx].setValue(value);
      }
    });
  }
}
