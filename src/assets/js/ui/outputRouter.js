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

  const addKnob = (label, min, max, initial, onChange, scaleMin = 0, scaleMax = 10, pixelsForFullRange = 200) => {
    const { wrapper } = createKnob({
      label,
      min,
      max,
      initial,
      showValue: true,
      onChange,
      pixelsForFullRange,
      scaleMin,
      scaleMax,
      scaleDecimals: 1
    });
    row.appendChild(wrapper);
  };

  // Level: escala 0-10, Pan: escala -5 a +5
  addKnob('Ch1 Level', 0, 1, engine.bus1Level,
    v => engine.setBusLevel(1, v), 0, 10);
  addKnob('Ch1 Pan', -1, 1, engine.bus1Pan,
    v => engine.setBusPan(1, v), -5, 5);
  addKnob('Ch2 Level', 0, 1, engine.bus2Level,
    v => engine.setBusLevel(2, v), 0, 10);
  addKnob('Ch2 Pan', -1, 1, engine.bus2Pan,
    v => engine.setBusPan(2, v), -5, 5);

  block.appendChild(row);
  container.appendChild(block);
}
