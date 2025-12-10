// Panel de 8 faders verticales para controlar los buses lógicos de salida
import { Module } from '../core/engine.js';

const clamp01 = value => Math.min(1, Math.max(0, value));

export class OutputFaderModule extends Module {
  constructor(engine, id = 'outputFaders') {
    super(engine, id, 'Output Faders');
    this.faders = [];
  }

  createPanel(container) {
    if (!container) return;
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

      const { controlEl, valueEl, setValue } = this._createCustomSlider(this.engine.getOutputLevel(i) ?? 1, newValue => {
        if (window._synthApp && window._synthApp.ensureAudio) {
          window._synthApp.ensureAudio();
        }
        this.engine.setOutputLevel(i, newValue);
      });

      column.appendChild(controlEl);
      column.appendChild(valueEl);
      sliderRow.appendChild(column);
      this.faders.push({ setValue, valueEl });
    }

    block.appendChild(sliderRow);
    container.appendChild(block);
  }

  _createCustomSlider(initialValue, onChange) {
    const clamped = clamp01(initialValue);
    const control = document.createElement('div');
    control.className = 'output-fader-control';

    const track = document.createElement('div');
    track.className = 'output-fader-track';

    const fill = document.createElement('div');
    fill.className = 'output-fader-fill';
    track.appendChild(fill);

    const thumb = document.createElement('div');
    thumb.className = 'output-fader-thumb';
    track.appendChild(thumb);

    control.appendChild(track);

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'output-fader-value';

    let currentValue = clamped;
    let activePointerId = null;

    const updateVisuals = value => {
      const percent = value * 100;
      fill.style.height = `${percent}%`;
      thumb.style.bottom = `${percent}%`;
      valueDisplay.textContent = value.toFixed(2);
    };

    const updateFromClientY = clientY => {
      const rect = track.getBoundingClientRect();
      if (!rect.height) return;
      const relative = clamp01(1 - ((clientY - rect.top) / rect.height));
      currentValue = relative;
      updateVisuals(currentValue);
      onChange(currentValue);
    };

    const stopTracking = () => {
      if (activePointerId == null) return;
      activePointerId = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    const handlePointerMove = event => {
      if (activePointerId !== event.pointerId) return;
      event.preventDefault();
      updateFromClientY(event.clientY);
    };

    const handlePointerUp = event => {
      if (activePointerId !== event.pointerId) return;
      stopTracking();
    };

    const startTracking = event => {
      event.preventDefault();
      track.setPointerCapture(event.pointerId);
      activePointerId = event.pointerId;
      updateFromClientY(event.clientY);
      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    };

    track.addEventListener('pointerdown', startTracking, { passive: false });

    updateVisuals(currentValue);

    return {
      controlEl: control,
      valueEl: valueDisplay,
      setValue: value => {
        currentValue = clamp01(value);
        updateVisuals(currentValue);
      }
    };
  }
}
