// Helper de UI que dibuja los controles del router estéreo y enlaza con el motor
import { createKnob } from './knobFactory.js';

export function createOutputRouterUI(engine, container) {
  const block = document.createElement('div');
  block.className = 'voice-block';
  const title = document.createElement('div');
  title.className = 'voice-title';
  title.textContent = 'Output Router (Ch1/Ch2 → L/R)';
  block.appendChild(title);

  const row = document.createElement('div');
  row.className = 'knob-row';

  const addKnob = (label, min, max, initial, format, onChange, pixelsForFullRange = 200) => {
    const { wrapper } = createKnob({
      label,
      min,
      max,
      initial,
      showValue: true,
      format,
      onChange,
      pixelsForFullRange
    });
    row.appendChild(wrapper);
  };

  addKnob('Ch1 Level', 0, 1, engine.bus1Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(1, v));
  addKnob('Ch1 Pan', -1, 1, engine.bus1Pan,
    v => (v < 0 ? 'L ' : 'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(1, v));
  addKnob('Ch2 Level', 0, 1, engine.bus2Level,
    v => v.toFixed(2),
    v => engine.setBusLevel(2, v));
  addKnob('Ch2 Pan', -1, 1, engine.bus2Pan,
    v => (v < 0 ? 'L ' : 'R ') + Math.abs(v).toFixed(2),
    v => engine.setBusPan(2, v));

  block.appendChild(row);
  container.appendChild(block);
}
