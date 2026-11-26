import { ModuleFrame } from './moduleFrame.js';
import { createKnob } from './knobFactory.js';
import { createControlsLayer, placeAtCenter } from '../utils/panelBox.js';
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

export class Panel1FilterUI {
  constructor(options = {}) {
    this.id = options.id;
    this.cssClass = options.cssClass || 'panel1-filter-live';
    this.layout = {
      knobSize: options.knobSize ?? 65,
      knobInnerPct: options.knobInnerPct ?? 78,
      knobColors: options.knobColors || ['blue', 'yellow', 'white'],
      knobTypes: options.knobTypes || ['normal', 'normal', 'normal'],
      // Centro { x, y } de cada mando, en px relativos a la caja del módulo
      centers: options.centers || {}
    };
    this.knobOptions = options.knobOptions || {};
    this.element = null;
    this.frame = null;
    this.knobs = {};
    this.knobKeys = ['frequency', 'response', 'level'];
  }

  createElement() {
    const KNOB_LABELS = { frequency: 'Frequency', response: 'Response', level: 'Level' };

    this.frame = new ModuleFrame({
      id: this.id,
      title: null,
      className: `panel1-placeholder panel1-filter ${this.cssClass}`
    });

    const element = this.frame.createElement();
    // Los mandos, cada uno por su centro en una capa que cubre la caja
    const knobsContainer = createControlsLayer('panel1-controls');

    this.knobKeys.forEach((key, index) => {
      const knob = createKnob({
        showValue: false,
        centerColor: COLOR_MAP[this.layout.knobColors[index]] || KNOB_WHITE,
        svgSrc: this.layout.knobTypes[index] === 'bipolar'
          ? 'assets/knobs/knob-0-center.svg'
          : this.layout.knobTypes[index] === 'vernier'
            ? 'assets/knobs/vernier-dial.svg'
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
        tooltipLabel: KNOB_LABELS[key] || key
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

      placeAtCenter(knob.wrapper, this.layout.centers[key], toNumber(this.layout.knobSize, 65), `${this.id} ${key}`);
      this.knobs[key] = knob.knobInstance;
      knobsContainer.appendChild(knob.wrapper);
    });

    // La posición del módulo la pone el ensamblador con su caja (panelBox):
    // aquí no se toca el transform del marco.
    this.frame.appendToContent(knobsContainer);

    this.element = element;
    return element;
  }

  serialize() {
    return {
      frequency: this.knobs.frequency?.getValue() ?? 0,
      response: this.knobs.response?.getValue() ?? 0,
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

export default Panel1FilterUI;
