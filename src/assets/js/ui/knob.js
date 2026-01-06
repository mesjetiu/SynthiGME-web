// Componente Knob reutilizable para parámetros continuos en la interfaz
import { shouldBlockInteraction } from '../utils/input.js';

export class Knob {
  constructor(rootEl, options = {}) {
    this.rootEl = rootEl;
    this.innerEl = rootEl.querySelector('.knob-inner');

    const {
      valueElement = null,
      min = 0,
      max = 1,
      initial = 0,
      onChange = null,
      format = (v => v),
      pixelsForFullRange = 150
    } = options;

    this.valueEl = valueElement;
    this.min = min;
    this.max = max;
    this.value = initial;
    this.onChange = onChange;
    this.format = format;
    this.pixelsForFullRange = pixelsForFullRange;

    this.dragging = false;
    this.startY = 0;
    this.startValue = this.value;

    this.minAngle = -135;
    this.maxAngle = 135;
    this._attach();
    this._updateVisual();
  }

  _attach() {
    this.rootEl.addEventListener('pointerdown', ev => {
      if (shouldBlockInteraction(ev)) return;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      this.dragging = true;
      this.startY = ev.clientY;
      this.startValue = this.value;
      this.rootEl.setPointerCapture(ev.pointerId);
    });

    this.rootEl.addEventListener('pointermove', ev => {
      if (!this.dragging) return;
      if (shouldBlockInteraction(ev)) return;
      const dy = this.startY - ev.clientY;
      const sens = (this.max - this.min) / this.pixelsForFullRange;
      this.setValue(this.startValue + dy * sens);
    });

    const end = ev => {
      if (!this.dragging) return;
      this.dragging = false;
      try { this.rootEl.releasePointerCapture(ev.pointerId); } catch (error) {
        // ignore release errors
      }
    };

    this.rootEl.addEventListener('pointerup', end);
    this.rootEl.addEventListener('pointercancel', end);
    this.rootEl.addEventListener('pointerleave', end);
  }

  _updateVisual() {
    const t = (this.value - this.min) / (this.max - this.min);
    const angle = this.minAngle + t * (this.maxAngle - this.minAngle);
    this.innerEl.style.transform = `rotate(${angle}deg)`;
    if (this.valueEl) this.valueEl.textContent = this.format(this.value);
  }

  setValue(value) {
    this.value = Math.min(this.max, Math.max(this.min, value));
    this._updateVisual();
    if (this.onChange) this.onChange(this.value);
    // Notificar que hay cambios sin guardar
    document.dispatchEvent(new CustomEvent('synth:userInteraction'));
  }

  getValue() {
    return this.value;
  }
}
