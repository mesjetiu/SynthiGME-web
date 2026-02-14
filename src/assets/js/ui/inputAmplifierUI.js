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
    * @param {Object} [options.layout] - Configuración visual de layout
    * @param {number} [options.layout.knobGap=8] - Gap horizontal entre knobs
    * @param {number|string} [options.layout.knobSize='sm'] - Tamaño del knob ('sm' o px)
    * @param {number} [options.layout.knobInnerPct=78] - Tamaño interior del knob en %
    * @param {{x:number,y:number}} [options.layout.knobsRowOffset] - Offset de la fila de knobs
    * @param {Array<{x:number,y:number}>} [options.layout.knobOffsets] - Offsets por canal/knob
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
    this.layout = {
      knobGap: options.layout?.knobGap ?? options.layout?.knobsGap ?? 8,
      knobSize: options.layout?.knobSize ?? 'sm',
      knobInnerPct: options.layout?.knobInnerPct ?? 78,
      knobsRowOffset: options.layout?.knobsRowOffset || { x: 0, y: 0 },
      knobOffsets: Array.isArray(options.layout?.knobOffsets) ? options.layout.knobOffsets : []
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
    knobsRow.style.gap = `${Number.isFinite(Number(this.layout.knobGap)) ? Number(this.layout.knobGap) : 8}px`;
    const rowOffsetX = Number(this.layout.knobsRowOffset?.x) || 0;
    const rowOffsetY = Number(this.layout.knobsRowOffset?.y) || 0;
    if (rowOffsetX !== 0 || rowOffsetY !== 0) {
      knobsRow.style.transform = `translate(${rowOffsetX}px, ${rowOffsetY}px)`;
    }
    
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
    const channelOffset = this.layout.knobOffsets?.[channel];
    const channelOffsetX = Number(channelOffset?.x) || 0;
    const channelOffsetY = Number(channelOffset?.y) || 0;
    if (channelOffsetX !== 0 || channelOffsetY !== 0) {
      wrapper.style.transform = `translate(${channelOffsetX}px, ${channelOffsetY}px)`;
    }
    
    // Label superior "Channel N"
    const label = document.createElement('div');
    label.className = 'input-amplifier__label';
    label.textContent = `Channel ${channel + 1}`;
    wrapper.appendChild(label);
    
    // Contenedor del knob
    const knobEl = document.createElement('div');
    const knobSizeClass = typeof this.layout.knobSize === 'string' && this.layout.knobSize
      ? ` knob--${this.layout.knobSize}`
      : '';
    knobEl.className = `knob${knobSizeClass} input-amplifier__knob`;
    if (typeof this.layout.knobSize === 'number' && Number.isFinite(this.layout.knobSize) && this.layout.knobSize > 0) {
      knobEl.style.width = `${this.layout.knobSize}px`;
      knobEl.style.height = `${this.layout.knobSize}px`;
    }
    
    const inner = document.createElement('div');
    inner.className = 'knob-inner';
    const innerPct = Number(this.layout.knobInnerPct);
    if (Number.isFinite(innerPct) && innerPct > 0) {
      inner.style.width = `${innerPct}%`;
      inner.style.height = `${innerPct}%`;
    }
    knobEl.appendChild(inner);
    wrapper.appendChild(knobEl);
    
    // Valor debajo del knob
    const valueEl = document.createElement('div');
    valueEl.className = 'knob-value input-amplifier__value';
    wrapper.appendChild(valueEl);
    
    // Crear instancia del Knob con escala Synthi 100 (0-10)
    const knobInstance = new Knob(knobEl, {
      min: this.knobConfig.min,
      max: this.knobConfig.max,
      initial: this.knobConfig.initial,
      pixelsForFullRange: this.knobConfig.pixelsForFullRange,
      scaleMin: 0,
      scaleMax: 10,
      scaleDecimals: 1,
      valueElement: valueEl,
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
