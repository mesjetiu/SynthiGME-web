// UI scaffold for SGME Oscillator (solo interacción visual; sin audio por ahora)
import { Knob } from './knob.js';
const DEFAULT_KNOB_LABELS = [
  'Pulse level',
  'Pulse shape',
  'Sine level',
  'Sine symmetry',
  'Triangle level',
  'Sawtooth level',
  'Frequency'
];

export class SGME_Oscillator {
  constructor(options = {}) {
    this.id = options.id || `sgme-osc-${Date.now()}`;
    this.title = options.title || 'Oscillator';
    this.size = options.size || { width: 320, height: 90 };
    this.knobGap = options.knobGap || 8;
    this.switchOffset = options.switchOffset || { leftPercent: 36, topPx: 6 };
    this.knobLabels = options.knobLabels || DEFAULT_KNOB_LABELS;
    this.knobs = [];
    this.rangeState = 'hi';
    // Igualamos sensibilidad y punto inicial al panel 1: rango 0..1, inicio 0.4 y 150 px para recorrer el rango.
    this.knobRange = options.knobRange || { min: 0, max: 1, initial: 0.4, pixelsForFullRange: 150 };
  }

  createElement() {
    const root = document.createElement('div');
    root.className = 'sgme-osc';
    root.id = this.id;
    root.style.setProperty('--osc-width', `${this.size.width}px`);
    root.style.setProperty('--osc-height', `${this.size.height}px`);
    root.style.setProperty('--osc-knob-gap', `${this.knobGap}px`);
    root.style.setProperty('--switch-left-percent', `${this.switchOffset.leftPercent}%`);
    root.style.setProperty('--switch-top-px', `${this.switchOffset.topPx}px`);
    root.style.width = `${this.size.width}px`;
    root.style.height = `${this.size.height}px`;

    const top = document.createElement('div');
    top.className = 'sgme-osc__top';
    const header = document.createElement('div');
    header.className = 'sgme-osc__header';
    header.textContent = this.title;
    top.appendChild(header);

    const labelRow = document.createElement('div');
    labelRow.className = 'sgme-osc__labels';
    this.knobLabels.forEach(label => {
      const span = document.createElement('span');
      span.textContent = label;
      labelRow.appendChild(span);
    });
    top.appendChild(labelRow);

    const range = document.createElement('div');
    range.className = 'sgme-osc__switch';
    range.innerHTML = `
      <div class="sgme-osc__switch-label">Range</div>
      <div class="sgme-osc__switch-body">
        <span class="sgme-osc__switch-hi">HI</span>
        <span class="sgme-osc__switch-toggle" aria-hidden="true"></span>
        <span class="sgme-osc__switch-lo">LO</span>
      </div>
    `;
    range.addEventListener('click', () => {
      this.rangeState = this.rangeState === 'hi' ? 'lo' : 'hi';
      this._renderRange(range);
    });
    top.appendChild(range);

    const bottom = document.createElement('div');
    bottom.className = 'sgme-osc__bottom';
    const knobsRow = document.createElement('div');
    knobsRow.className = 'sgme-osc__knobs';
    this.knobLabels.forEach(label => {
      const shell = document.createElement('div');
      shell.className = 'sgme-osc__knob-shell';
      const knob = document.createElement('div');
      knob.className = 'knob sgme-osc__knob';
      const inner = document.createElement('div');
      inner.className = 'knob-inner';
      knob.appendChild(inner);
      shell.appendChild(knob);
      knobsRow.appendChild(shell);

      const knobInstance = new Knob(knob, {
        min: this.knobRange.min,
        max: this.knobRange.max,
        initial: this.knobRange.initial,
        pixelsForFullRange: this.knobRange.pixelsForFullRange
      });
      this.knobs.push(knobInstance);
    });
    bottom.appendChild(knobsRow);

    root.appendChild(top);
    root.appendChild(bottom);
    this._renderRange(range);
    return root;
  }

  _renderRange(rangeEl) {
    const isLo = this.rangeState === 'lo';
    rangeEl.classList.toggle('is-lo', isLo);
    rangeEl.setAttribute('data-state', isLo ? 'lo' : 'hi');
  }
}
