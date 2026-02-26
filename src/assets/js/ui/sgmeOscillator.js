/**
 * UI del oscilador SGME.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * @module ui/sgmeOscillator
 * @see state/schema.js para definición de OscillatorState
 */

// UI scaffold for SGME Oscillator (solo interacción visual; sin audio por ahora)
import { Knob } from './knob.js';
import { flashGlow } from './glowManager.js';
const DEFAULT_KNOB_LABELS = [
  'Pulse level',
  'Pulse shape',
  'Sine level',
  'Sine symmetry',
  'Triangle level',
  'Sawtooth level',
  'Frequency'
];

// Escalas de display estilo Synthi 100: índices 1 (shape) y 3 (symmetry) son bipolares (-5 a +5)
const DEFAULT_KNOB_SCALES = [
  { min: 0, max: 10 },  // 0: Pulse level
  { min: -5, max: 5 },  // 1: Pulse shape (bipolar)
  { min: 0, max: 10 },  // 2: Sine level
  { min: -5, max: 5 },  // 3: Sine symmetry (bipolar)
  { min: 0, max: 10 },  // 4: Triangle level
  { min: 0, max: 10 },  // 5: Sawtooth level
  { min: 0, max: 10 }   // 6: Frequency
];

export class SGME_Oscillator {
  constructor(options = {}) {
    this.id = options.id || `sgme-osc-${Date.now()}`;
    this.title = options.title || 'Oscillator';
    this.size = options.size || { width: 320, height: 90 };
    // knobGap: array de 6 valores (gap entre cada par de knobs) o número uniforme
    const rawGap = options.knobGap ?? 8;
    this.knobGap = Array.isArray(rawGap) ? rawGap : Array(6).fill(rawGap);
    this.buttonSize = options.buttonSize || { width: 18, height: 30, indicator: 8 };
    this.switchOffset = options.switchOffset || { leftPercent: 36, topPx: 6 };
    // Ajustes de knobs: tamaño, offset de fila y offsets individuales (px)
    this.knobSize = options.knobSize || 42;
    this.knobInnerPct = options.knobInnerPct || 78;
    this.knobRowOffsetX = options.knobRowOffsetX ?? 0;
    this.knobRowOffsetY = options.knobRowOffsetY || -6;
    this.knobOffsets = options.knobOffsets || [0, 0, 0, 0, 0, 0, 0]; // array de px por knob
    this.knobLabels = options.knobLabels || DEFAULT_KNOB_LABELS;
    this.knobOptions = options.knobOptions || [];
    this.knobs = [];
    this.rangeState = 'hi';
    // Callback cuando cambia el switch HI/LO (usado para recalcular frecuencia)
    this.onRangeChange = options.onRangeChange || null;
    // Rango por defecto 0..1 y valor inicial 0 (overrideable por instancia).
    this.knobRange = options.knobRange || { min: 0, max: 1, initial: 0, pixelsForFullRange: 150 };
  }

  createElement() {
    const root = document.createElement('div');
    root.className = 'sgme-osc';
    root.id = this.id;
    root.style.setProperty('--osc-width', `${this.size.width}px`);
    root.style.setProperty('--osc-height', `${this.size.height}px`);
    // knobGap se aplica por shell (margin-left), no como CSS grid gap
    root.style.setProperty('--osc-knob-size', `${this.knobSize}px`);
    root.style.setProperty('--osc-knob-inner-pct', `${this.knobInnerPct}%`);
    root.style.setProperty('--osc-knob-row-offset-y', `${this.knobRowOffsetY}px`);
    root.style.setProperty('--switch-left-percent', `${this.switchOffset.leftPercent}%`);
    root.style.setProperty('--switch-top-px', `${this.switchOffset.topPx}px`);
    root.style.setProperty('--osc-button-width', `${this.buttonSize.width}px`);
    root.style.setProperty('--osc-button-height', `${this.buttonSize.height}px`);
    root.style.setProperty('--osc-button-indicator-size', `${this.buttonSize.indicator}px`);
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

    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'output-channel__switch-wrap sgme-osc__switch-wrap';
    const range = document.createElement('button');
    range.type = 'button';
    range.className = 'output-channel__switch';
    range.setAttribute('aria-label', `${this.title} range`);
    const indicator = document.createElement('span');
    indicator.className = 'output-channel__switch-indicator';
    range.appendChild(indicator);
    range.addEventListener('click', () => {
      this.rangeState = this.rangeState === 'hi' ? 'lo' : 'hi';
      this._renderRange(range);
      // Notificar cambio de rango para recalcular frecuencia
      if (typeof this.onRangeChange === 'function') {
        this.onRangeChange(this.rangeState);
      }
      flashGlow(range);
    });
    rangeWrap.appendChild(range);
    top.appendChild(rangeWrap);

    const bottom = document.createElement('div');
    bottom.className = 'sgme-osc__bottom';
    const knobsRow = document.createElement('div');
    knobsRow.className = 'sgme-osc__knobs';
    knobsRow.style.transform = `translate(${this.knobRowOffsetX}px, ${this.knobRowOffsetY}px)`;
    this.knobLabels.forEach((label, idx) => {
      const shell = document.createElement('div');
      shell.className = 'sgme-osc__knob-shell';
      // Gap individual: margin-left basado en knobGap[idx-1] (primer knob sin margen)
      if (idx > 0 && this.knobGap[idx - 1]) {
        shell.style.marginLeft = `${this.knobGap[idx - 1]}px`;
      }
      if (Number.isFinite(this.knobOffsets[idx])) {
        shell.style.transform = `translateY(${this.knobOffsets[idx]}px)`;
      }
      const knob = document.createElement('div');
      knob.className = 'knob knob--svg sgme-osc__knob';
      knob.style.width = `${this.knobSize}px`;
      knob.style.height = `${this.knobSize}px`;
      const inner = document.createElement('div');
      inner.className = 'knob-inner';
      const ringImg = document.createElement('img');
      ringImg.className = 'knob-svg-ring';
      ringImg.src = 'assets/knobs/knob.svg';
      ringImg.alt = '';
      ringImg.draggable = false;
      inner.appendChild(ringImg);
      knob.appendChild(inner);
      const knobCenter = document.createElement('div');
      knobCenter.className = 'knob-center';
      knob.appendChild(knobCenter);
      shell.appendChild(knob);
      
      // Elemento de valor debajo del knob
      const valueEl = document.createElement('div');
      valueEl.className = 'knob-value sgme-osc__knob-value';
      shell.appendChild(valueEl);
      
      knobsRow.appendChild(shell);

      // Escala de display (estilo Synthi 100)
      const scale = DEFAULT_KNOB_SCALES[idx] || { min: 0, max: 10 };
      
      const baseOptions = {
        min: this.knobRange.min,
        max: this.knobRange.max,
        initial: this.knobRange.initial,
        pixelsForFullRange: this.knobRange.pixelsForFullRange,
        scaleMin: scale.min,
        scaleMax: scale.max,
        scaleDecimals: 1,
        valueElement: valueEl
      };
      const perKnob = this.knobOptions[idx] || {};
      const knobInstance = new Knob(knob, { ...baseOptions, ...perKnob });
      this.knobs.push(knobInstance);
    });
    bottom.appendChild(knobsRow);

    root.appendChild(top);
    root.appendChild(bottom);
    this._renderRange(range);
    return root;
  }

  _renderRange(rangeEl) {
    const isHi = this.rangeState === 'hi';
    rangeEl.classList.toggle('is-on', isHi);
    rangeEl.setAttribute('aria-pressed', String(isHi));
    rangeEl.setAttribute('data-state', isHi ? 'hi' : 'lo');
  }
  
  /**
   * Serializa el estado del oscilador para guardarlo en un patch.
   * @returns {import('../state/schema.js').OscillatorState} Estado serializado
   */
  serialize() {
    return {
      knobs: this.knobs.map(k => k.getValue()),
      rangeState: this.rangeState
    };
  }
  
  /**
   * Restaura el estado del oscilador desde un patch.
   * 
   * IMPORTANTE: El rangeState se aplica ANTES de los knobs para que
   * el callback onChange del knob de frecuencia use el rango correcto
   * al calcular la frecuencia en Hz.
   * 
   * @param {Partial<import('../state/schema.js').OscillatorState>} data - Estado serializado
   */
  deserialize(data) {
    if (!data) return;
    
    // 1. Aplicar rangeState PRIMERO (antes de los knobs)
    // El knob de frecuencia necesita el rango correcto para calcular Hz
    if (data.rangeState === 'hi' || data.rangeState === 'lo') {
      const rangeChanged = data.rangeState !== this.rangeState;
      this.rangeState = data.rangeState;
      const rangeEl = document.querySelector(`#${this.id} .output-channel__switch`);
      if (rangeEl) {
        this._renderRange(rangeEl);
        if (rangeChanged) flashGlow(rangeEl);
      }
    }
    
    // 2. Aplicar valores de knobs (sus onChange usarán el rangeState correcto)
    if (Array.isArray(data.knobs)) {
      data.knobs.forEach((value, idx) => {
        if (this.knobs[idx] && typeof value === 'number') {
          this.knobs[idx].setValue(value);
        }
      });
    }
  }
}
