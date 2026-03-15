/**
 * Panel1RingModUI — UI de Modulador de Anillo para Panel 1
 *
 * Estructura visual: ModuleFrame con 1 knob (Level).
 * Sigue el mismo patrón que Panel1ReverbUI y Panel1FilterUI.
 *
 * @version 1.0.0
 */

import { ModuleFrame } from './moduleFrame.js';
import { createKnob } from './knobFactory.js';
import { KNOB_BLUE, KNOB_YELLOW, KNOB_WHITE, KNOB_RED, KNOB_GREEN, KNOB_BLACK } from '../configs/knobColors.js';

const COLOR_MAP = {
  blue: KNOB_BLUE,
  yellow: KNOB_YELLOW,
  white: KNOB_WHITE,
  red: KNOB_RED,
  green: KNOB_GREEN,
  black: KNOB_BLACK
};

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applyOffset(element, offset, fallback = { x: 0, y: 0 }) {
  if (!element) {
    return;
  }
  const x = toNumber(offset?.x, fallback.x);
  const y = toNumber(offset?.y, fallback.y);
  if (x !== 0 || y !== 0) {
    element.style.transform = `translate(${x}px, ${y}px)`;
  }
}

export class Panel1RingModUI {
  constructor(options = {}) {
    this.id = options.id;
    this.cssClass = options.cssClass || 'panel1-ringmod-live';
    this.layout = {
      knobGap: options.knobGap ?? 6,
      knobSize: options.knobSize ?? 65,
      knobInnerPct: options.knobInnerPct ?? 78,
      knobColors: options.knobColors || ['white'],
      knobTypes: options.knobTypes || ['normal'],
      knobsOffset: options.knobsOffset || { x: 0, y: 0 },
      offset: options.offset || { x: 0, y: 0 }
    };
    this.knobOptions = options.knobOptions || {};
    this.element = null;
    this.frame = null;
    this.knobs = {};
    this.knobKeys = ['level'];
  }

  createElement() {
    this.frame = new ModuleFrame({
      id: this.id,
      title: null,
      className: `panel1-placeholder panel1-ring-mod ${this.cssClass}`
    });

    const element = this.frame.createElement();
    const knobsContainer = document.createElement('div');
    knobsContainer.className = 'panel1-bottom-knobs';
    knobsContainer.style.gap = `${toNumber(this.layout.knobGap, 6)}px`;
    applyOffset(knobsContainer, this.layout.knobsOffset);

    this.knobKeys.forEach((key, index) => {
      const knob = createKnob({
        showValue: false,
        centerColor: COLOR_MAP[this.layout.knobColors[index]] || KNOB_WHITE,
        svgSrc: this.layout.knobTypes[index] === 'bipolar'
          ? 'assets/knobs/knob-0-center.svg'
          : 'assets/knobs/knob.svg',
        min: this.knobOptions[key]?.min ?? 0,
        max: this.knobOptions[key]?.max ?? 10,
        initial: this.knobOptions[key]?.initial ?? 0,
        pixelsForFullRange: this.knobOptions[key]?.pixelsForFullRange ?? 900,
        scaleMin: this.knobOptions[key]?.scaleMin ?? 0,
        scaleMax: this.knobOptions[key]?.scaleMax ?? 10,
        scaleDecimals: this.knobOptions[key]?.scaleDecimals ?? 1,
        onChange: this.knobOptions[key]?.onChange,
        getTooltipInfo: this.knobOptions[key]?.getTooltipInfo,
        tooltipLabel: this.knobOptions[key]?.tooltipLabel || key.charAt(0).toUpperCase() + key.slice(1)
      });

      if (typeof this.layout.knobSize === 'number' && this.layout.knobSize > 0) {
        knob.knobEl.style.width = `${this.layout.knobSize}px`;
        knob.knobEl.style.height = `${this.layout.knobSize}px`;
      }

      const inner = knob.knobEl.querySelector('.knob-inner');
      if (inner) {
        const pct = toNumber(this.layout.knobInnerPct, 78);
        inner.style.width = `${pct}%`;
        inner.style.height = `${pct}%`;
      }

      this.knobs[key] = knob.knobInstance;
      knobsContainer.appendChild(knob.wrapper);
    });

    this.frame.appendToContent(knobsContainer);
    applyOffset(element, this.layout.offset);

    this.element = element;
    return element;
  }

  serialize() {
    return {
      level: this.knobs.level?.getValue() ?? 0
    };
  }

  deserialize(data) {
    if (!data) {
      return;
    }
    for (const key of this.knobKeys) {
      if (this.knobs[key] && typeof data[key] === 'number') {
        this.knobs[key].setValue(data[key]);
      }
    }
  }
}

export default Panel1RingModUI;
