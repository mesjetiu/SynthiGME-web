// Layout-only UI scaffold for SGME Oscillator (no audio wiring yet)
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
        <span>HI</span>
        <span class="sgme-osc__switch-toggle"></span>
        <span>LO</span>
      </div>
    `;
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
    });
    bottom.appendChild(knobsRow);

    root.appendChild(top);
    root.appendChild(bottom);
    return root;
  }
}
