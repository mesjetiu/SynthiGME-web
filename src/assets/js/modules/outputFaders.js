/**
 * Panel de 8 faders verticales para controlar los buses lógicos de salida.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * @module modules/outputFaders
 * @see state/schema.js para definición de LevelsState
 */

import { Module } from '../core/engine.js';
import { shouldBlockInteraction, isNavGestureActive } from '../utils/input.js';

export class OutputFaderModule extends Module {
  constructor(engine, id = 'outputFaders') {
    super(engine, id, 'Output Faders');
    /** @type {HTMLInputElement[]} */
    this.sliders = [];
    /** @type {HTMLElement[]} */
    this.valueDisplays = [];
  }

  createPanel(container) {
    if (!container) return;
    this.sliders = [];
    this.valueDisplays = [];
    
    const block = document.createElement('div');
    block.className = 'voice-block output-fader-panel';

    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = 'Buses de salida';
    block.appendChild(title);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'output-fader-row';

    const channels = this.engine.outputChannels || 0;
    for (let i = 0; i < channels; i += 1) {
      const column = document.createElement('div');
      column.className = 'output-fader-column';

      const label = document.createElement('div');
      label.className = 'output-fader-label';
      label.textContent = `Out ${i + 1}`;
      column.appendChild(label);

      const shell = document.createElement('div');
      shell.className = 'output-fader-shell';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.001';
      slider.value = String(this.engine.getOutputLevel(i) ?? 0);
      slider.className = 'output-fader';
      slider.setAttribute('aria-label', `Nivel salida ${i + 1}`);
      slider.dataset.preventPan = 'true';
      
      // Guardar referencia
      this.sliders.push(slider);

      let lastCommittedValue = Number(slider.value);

      slider.addEventListener('pointerdown', ev => {
        if (shouldBlockInteraction(ev)) return;
        if (window._synthApp && window._synthApp.ensureAudio) {
          window._synthApp.ensureAudio();
        }
      });

      let rafId = null;
      let pendingValue = null;

      const flushValue = () => {
        rafId = null;
        if (pendingValue == null) return;
        const numericValue = pendingValue;
        pendingValue = null;
        if (numericValue === lastCommittedValue) return;
        lastCommittedValue = numericValue;
        this.engine.setOutputLevel(i, numericValue, { ramp: 0.06 });
        value.textContent = numericValue.toFixed(3);
        // Notificar que hay cambios sin guardar
        document.dispatchEvent(new CustomEvent('synth:userInteraction'));
      };

      slider.addEventListener('input', () => {
        if (isNavGestureActive()) {
          slider.value = String(lastCommittedValue);
          return;
        }
        pendingValue = Number(slider.value);
        if (!rafId) {
          rafId = requestAnimationFrame(flushValue);
        }
      });

      const value = document.createElement('div');
      value.className = 'output-fader-value';
      value.textContent = Number(slider.value).toFixed(3);
      
      // Guardar referencia al display
      this.valueDisplays.push(value);

      shell.appendChild(slider);
      column.appendChild(shell);
      column.appendChild(value);
      sliderRow.appendChild(column);
    }

    block.appendChild(sliderRow);
    container.appendChild(block);
  }
  
  /**
   * Serializa el estado del módulo para guardarlo en un patch.
   * @returns {import('../state/schema.js').LevelsState} Estado serializado
   */
  serialize() {
    return {
      levels: this.sliders.map(s => parseFloat(s.value))
    };
  }
  
  /**
   * Restaura el estado del módulo desde un patch.
   * @param {Partial<import('../state/schema.js').LevelsState>} data - Estado serializado
   */
  deserialize(data) {
    if (!data || !Array.isArray(data.levels)) return;
    data.levels.forEach((value, idx) => {
      if (this.sliders[idx] && typeof value === 'number') {
        this.sliders[idx].value = String(value);
        if (this.valueDisplays[idx]) {
          this.valueDisplays[idx].textContent = value.toFixed(2);
        }
        this.engine.setOutputLevel(idx, value, { ramp: 0.06 });
      }
    });
  }
}
