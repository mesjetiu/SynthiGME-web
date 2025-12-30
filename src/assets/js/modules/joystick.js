// Módulo JoystickModule: fuente de control XY con salidas de CV para la matriz
import { Module, setParamSmooth } from '../core/engine.js';
import { shouldBlockInteraction } from '../utils/input.js';

export class JoystickModule extends Module {
  constructor(engine, id) {
    super(engine, id, 'Stick');
    this.xConst = null;
    this.yConst = null;
    this.xGain = null;
    this.yGain = null;
    this.x = 0;
    this.y = 0;
  }

  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.xConst) return;
    this.xConst = ctx.createConstantSource();
    this.yConst = ctx.createConstantSource();
    this.xConst.offset.value = 0;
    this.yConst.offset.value = 0;
    this.xGain = ctx.createGain();
    this.yGain = ctx.createGain();
    this.xConst.connect(this.xGain);
    this.yConst.connect(this.yGain);
    this.outputs.push({ id: 'xOut', kind: 'cv', node: this.xGain, label: 'Stick X' });
    this.outputs.push({ id: 'yOut', kind: 'cv', node: this.yGain, label: 'Stick Y' });
  }

  start() {
    this._initAudioNodes();
    const ctx = this.getAudioCtx();
    const t = ctx.currentTime + 0.05;
    // ConstantSource puede lanzar si ya fue iniciado
    try { this.xConst.start(t); } catch { /* ya iniciado */ }
    try { this.yConst.start(t); } catch { /* ya iniciado */ }
  }

  stop(time) {
    if (!this.xConst || !this.yConst) return;
    // ConstantSource puede lanzar si ya fue detenido
    try { this.xConst.stop(time); } catch { /* ya detenido */ }
    try { this.yConst.stop(time); } catch { /* ya detenido */ }
  }

  setPosition(nx, ny) {
    const ctx = this.getAudioCtx();
    if (!ctx || !this.xConst || !this.yConst) return;
    const x = Math.max(-1, Math.min(1, nx));
    const y = Math.max(-1, Math.min(1, ny));
    this.x = x;
    this.y = y;
    setParamSmooth(this.xConst.offset, x, ctx);
    setParamSmooth(this.yConst.offset, y, ctx);
  }

  createPanel(container) {
    const block = document.createElement('div');
    block.className = 'joystick-block';
    const title = document.createElement('div');
    title.className = 'voice-title';
    title.textContent = 'Stick';
    block.appendChild(title);

    const pad = document.createElement('div');
    pad.className = 'joystick-pad';
    const handle = document.createElement('div');
    handle.className = 'joystick-handle';
    pad.appendChild(handle);
    block.appendChild(pad);

    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.justifyContent = 'space-between';
    infoRow.style.fontSize = '0.75rem';
    infoRow.style.marginTop = '0.2rem';
    const xSpan = document.createElement('span');
    const ySpan = document.createElement('span');
    xSpan.textContent = 'X: 0.00';
    ySpan.textContent = 'Y: 0.00';
    infoRow.appendChild(xSpan);
    infoRow.appendChild(ySpan);
    block.appendChild(infoRow);

    container.appendChild(block);

    const updateHandle = (nx, ny) => {
      const px = (nx + 1) / 2;
      const py = (1 - ny) / 2;
      handle.style.left = (px * 100) + '%';
      handle.style.top = (py * 100) + '%';
      handle.style.transform = 'translate(-50%, -50%)';
      xSpan.textContent = 'X: ' + nx.toFixed(2);
      ySpan.textContent = 'Y: ' + ny.toFixed(2);
    };

    const processEvent = (ev) => {
      const rect = pad.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      const nx = Math.max(-1, Math.min(1, x * 2 - 1));
      const ny = Math.max(-1, Math.min(1, 1 - y * 2));
      this.setPosition(nx, ny);
      updateHandle(nx, ny);
    };

    pad.addEventListener('pointerdown', ev => {
      if (shouldBlockInteraction(ev)) return;
      if (window._synthApp && window._synthApp.ensureAudio) {
        window._synthApp.ensureAudio();
      }
      pad.setPointerCapture(ev.pointerId);
      processEvent(ev);
    });
    pad.addEventListener('pointermove', ev => {
      if (shouldBlockInteraction(ev)) return;
      if (ev.buttons === 0) return;
      processEvent(ev);
    });
    pad.addEventListener('pointerup', ev => {
      // Puede fallar si el capture ya fue liberado
      try { pad.releasePointerCapture(ev.pointerId); } catch { /* ya liberado */ }
    });
    pad.addEventListener('pointerleave', ev => {
      if (ev.buttons === 0) return;
      // Puede fallar si el capture ya fue liberado
      try { pad.releasePointerCapture(ev.pointerId); } catch { /* ya liberado */ }
    });

    updateHandle(0, 0);
  }
}
