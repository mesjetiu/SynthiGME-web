// Panel de 8 faders verticales para controlar los buses lógicos de salida
import { Module } from '../core/engine.js';

export class OutputFaderModule extends Module {
  constructor(engine, id = 'outputFaders') {
    super(engine, id, 'Output Faders');
  }

  createPanel(container) {
    if (!container) return;
    const block = document.createElement('div');
    block.className = 'voice-block output-fader-panel';
    block.dataset.preventPan = 'true';

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
      shell.dataset.preventPan = 'true';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(this.engine.getOutputLevel(i) ?? 1);
      slider.className = 'output-fader';
      slider.setAttribute('aria-label', `Nivel salida ${i + 1}`);
      slider.dataset.preventPan = 'true';

      slider.addEventListener('pointerdown', ev => {
        ev.stopPropagation();
        if (window._synthApp && window._synthApp.ensureAudio) {
          window._synthApp.ensureAudio();
        }
      });

      slider.addEventListener('input', () => {
        const numericValue = Number(slider.value);
        this.engine.setOutputLevel(i, numericValue);
        value.textContent = numericValue.toFixed(2);
      });

      const value = document.createElement('div');
      value.className = 'output-fader-value';
      value.textContent = Number(slider.value).toFixed(2);

      shell.appendChild(slider);
      column.appendChild(shell);
      column.appendChild(value);
      sliderRow.appendChild(column);
    }

    block.appendChild(sliderRow);
    container.appendChild(block);
  }
}
