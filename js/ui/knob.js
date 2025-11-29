export class Knob {
  constructor(rootEl, options) {
    this.rootEl = rootEl;
    this.innerEl = rootEl.querySelector('.knob-inner');
    this.valueEl = options.valueElement || null;
    this.min = options.min;
    this.max = options.max;
    this.value = options.initial;
    this.onChange = options.onChange || null;
    this.format = options.format || (v => v);
    this.pixelsForFullRange = options.pixelsForFullRange || 150;

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
  }

  getValue() {
    return this.value;
  }
}
