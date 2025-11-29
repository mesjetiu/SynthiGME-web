import { Knob } from './knob.js';

export function createOutputRouterUI(engine, container) {
  const block = document.createElement('div');
  block.className = 'voice-block';
  const title = document.createElement('div');
  title.className = 'voice-title';
  title.textContent = 'Output Router (Ch1/Ch2 → L/R)';
  block.appendChild(title);

  const row = document.createElement('div');
  row.className = 'knob-row';

  const makeKnob = (label, min, max, initial, format, onChange, pixelsForFullRange = 200) => {
    const wrap = document.createElement('div');
    wrap.className = 'knob-wrapper';
    const knob = document.createElement('div');
    knob.className = 'knob';
    const inner = document.createElement('div');
    inner.className = 'knob-inner';
    knob.appendChild(inner);
    const lbl = document.createElement('div');
    lbl.className = 'knob-label';
    lbl.textContent = label;
    const val = document.createElement('div');
    val.className = 'knob-value';
    wrap.appendChild(knob);
    wrap.appendChild(lbl);
    wrap.appendChild(val);
    row.appendChild(wrap);

    new Knob(knob, {
      min,
      max,
      initial,
      valueElement: val,
      format,
      onChange,
      pixelsForFullRange
    });
  };

  makeKnob('Ch1 Level', 0, 1, engine.bus1Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(1, v));
  makeKnob('Ch1 Pan', -1, 1, engine.bus1Pan,
    v => (v < 0 ? 'L ' : 'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(1, v));
  makeKnob('Ch2 Level', 0, 1, engine.bus2Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(2, v));
  makeKnob('Ch2 Pan', -1, 1, engine.bus2Pan,
    v => (v < 0 ? 'L ' : 'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(2, v));

  block.appendChild(row);
  container.appendChild(block);
}
