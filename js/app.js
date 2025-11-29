// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine } from './core/engine.js';
import { Matrix } from './core/matrix.js';
import { OscillatorModule } from './modules/oscillator.js';
import { PulseModule } from './modules/pulse.js';
import { NoiseModule } from './modules/noise.js';
import { JoystickModule } from './modules/joystick.js';
import { OutputRouterModule } from './modules/outputRouter.js';
import { createOutputRouterUI } from './ui/outputRouter.js';
import { PanelManager } from './ui/panelManager.js';

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this.mainPanel = this.panelManager.createPanel({
      id: 'panel-main',
      title: 'Synthi VCS3 – Prototipo Web',
      subtitle: '3 osciladores + matriz tipo EMS + stick (-1..1) + router estéreo (Output Ch1/Ch2 → L/R).'
    });

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.mainPanel.addHeaderElement(this.muteBtn);

    this.oscRowEl = this.mainPanel.addSection({ id: 'oscRow', title: 'Oscillators 1–3', type: 'row' });
    this.pulseRowEl = this.mainPanel.addSection({ id: 'pulseRow', title: 'Oscillator 3 / Pulse', type: 'row' });
    this.noiseRowEl = this.mainPanel.addSection({ id: 'noiseRow', title: 'Noise Generator', type: 'row' });
    this.matrixEl = this.mainPanel.addSection({ id: 'matrixTable', title: 'Pin Matrix (tipo Synthi)', type: 'matrix' });
    this.stickRowEl = this.mainPanel.addSection({ id: 'stickRow', title: 'Stick (Joystick)', type: 'row' });
    this.routerRowEl = this.mainPanel.addSection({ id: 'routerRow', title: 'Output Router (buses → L/R)', type: 'row' });
    this.matrix = null;
    this._setupModules();
    this._setupUI();
  }

  ensureAudio() { this.engine.start(); }

  _setupModules() {
    const osc1 = new OscillatorModule(this.engine, 'osc1', 110);
    const osc2 = new OscillatorModule(this.engine, 'osc2', 220);
    const osc3 = new PulseModule(this.engine, 'osc3', 330);
    const noise = new NoiseModule(this.engine, 'noise');
    const stick = new JoystickModule(this.engine, 'stick');
    const router = new OutputRouterModule(this.engine, 'router');

    this.engine.addModule(osc1);
    this.engine.addModule(osc2);
    this.engine.addModule(osc3);
    this.engine.addModule(noise);
    this.engine.addModule(stick);
    this.engine.addModule(router);

    osc1.createPanel(this.oscRowEl);
    osc2.createPanel(this.oscRowEl);
    osc3.createPanel(this.pulseRowEl);
    noise.createPanel(this.noiseRowEl);
    stick.createPanel(this.stickRowEl);
    createOutputRouterUI(this.engine, this.routerRowEl);

    const sourcePorts = [
      { moduleId: 'osc1', portId: 'audioOut', label: 'Oscillator 1 I' },
      { moduleId: 'osc1', portId: 'audioOut', label: 'Oscillator 1 II' },
      { moduleId: 'osc2', portId: 'audioOut', label: 'Oscillator 2 I' },
      { moduleId: 'osc2', portId: 'audioOut', label: 'Oscillator 2 II' },
      { moduleId: 'osc3', portId: 'audioOut', label: 'Oscillator 3 I' },
      { moduleId: 'osc3', portId: 'audioOut', label: 'Oscillator 3 II' },
      { moduleId: 'noise',  portId: 'audioOut', label: 'Noise' },
      { moduleId: null,  portId: null, label: 'Input Channel 1' },
      { moduleId: null,  portId: null, label: 'Input Channel 2' },
      { moduleId: null,  portId: null, label: 'Filter' },
      { moduleId: null,  portId: null, label: 'Trapezoid' },
      { moduleId: null,  portId: null, label: 'Envelope Signal' },
      { moduleId: null,  portId: null, label: 'Ring Modulator' },
      { moduleId: null,  portId: null, label: 'Reverberation' },
      { moduleId: 'stick',  portId: 'xOut', label: 'Stick X' },
      { moduleId: 'stick',  portId: 'yOut', label: 'Stick Y' }
    ];

    const destPorts = [
      // Signal inputs
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Meter' },
      { moduleId: null,   portId: null,     type: 'output', bus: 1, label: 'Output Ch 1' },
      { moduleId: null,   portId: null,     type: 'output', bus: 2, label: 'Output Ch 2' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Envelope A' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Envelope B' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Ring Mod A' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Ring Mod B' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Reverb' },
      // Control inputs
      { moduleId: 'osc1', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 1' },
      { moduleId: 'osc2', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 2' },
      { moduleId: 'osc3', portId: 'freqCV', type: 'freq',   label: 'Osc Freq 3' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Decay' },
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Reverb Mix' },
      { moduleId: null,   portId: null,     type: 'freq',   label: 'Filter Freq' },
      { moduleId: 'router', portId: 'bus1LevelCV', type: 'amp',    label: 'Output Ch Level 1' },
      { moduleId: 'router', portId: 'bus2LevelCV', type: 'amp',    label: 'Output Ch Level 2' }
    ];

    this.matrix = new Matrix(this.engine, this.matrixEl, sourcePorts, destPorts, {
      freqDepth: 80,
      ampDepth: 0.5,
      outputGain: 1.0
    });
    this.matrix.build();
  }

  _setupUI() {
    const muteBtn = this.muteBtn;
    if (!muteBtn) return;
    muteBtn.addEventListener('click', () => {
      this.ensureAudio();
      this.engine.toggleMute();
      muteBtn.textContent = this.engine.muted ? '🔇 Mute ON' : '🔊 Audio ON';
      muteBtn.classList.toggle('off', this.engine.muted);
    });
  }
}


// --------- ZOOM / PAN del panel completo ---------
(function() {
  const outer = document.getElementById('viewportOuter');
  const inner = document.getElementById('viewportInner');
  if (!outer || !inner) return;

  let scale = 1;
  let minScale = 0.1; // permite alejar mucho
  let maxScale = 3.0;
  let offsetX = 0;
  let offsetY = 0;

  function applyTransform() {
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  applyTransform();

  function isInteractiveTarget(el) {
    if (!el) return false;
    return !!el.closest('.knob, .knob-inner, .pin-btn, .joystick-pad, .joystick-handle');
  }

  // Zoom con rueda (desktop), centrado en el cursor
  outer.addEventListener('wheel', ev => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const rect = outer.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      const sx = cx - offsetX;
      const sy = cy - offsetY;
      offsetX = cx - sx * (newScale / scale);
      offsetY = cy - sy * (newScale / scale);
      scale = newScale;
      applyTransform();
    }
  }, { passive: false });

  // Estado para pan con un dedo
  let isPanning = false;
  let panPointerId = null;
  let lastX = 0;
  let lastY = 0;

  // Pinch-zoom con dos dedos (móvil/tablet), centrado en el punto medio
  const pointers = new Map();
  let lastDist = null;

  outer.addEventListener('pointerdown', ev => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // Si solo hay un dedo y no estamos sobre un control interactivo, iniciamos pan
    if (pointers.size === 1 && !isInteractiveTarget(ev.target)) {
      isPanning = true;
      panPointerId = ev.pointerId;
      lastX = ev.clientX;
      lastY = ev.clientY;
    }
  });

  outer.addEventListener('pointermove', ev => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      // Pinch-zoom: dos dedos
      ev.preventDefault();
      const arr = Array.from(pointers.values());
      const dx = arr[0].x - arr[1].x;
      const dy = arr[0].y - arr[1].y;
      const dist = Math.hypot(dx, dy);
      const rect = outer.getBoundingClientRect();
      const cx = (arr[0].x + arr[1].x) / 2 - rect.left;
      const cy = (arr[0].y + arr[1].y) / 2 - rect.top;
      if (lastDist != null) {
        const zoomFactor = dist / lastDist;
        const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
        const sx = cx - offsetX;
        const sy = cy - offsetY;
        offsetX = cx - sx * (newScale / scale);
        offsetY = cy - sy * (newScale / scale);
        scale = newScale;
        applyTransform();
      }
      lastDist = dist;
      // Cuando hay dos dedos, desactivamos pan a un dedo
      isPanning = false;
      panPointerId = null;
      return;
    }

    // Si hay un solo dedo activo y estamos en modo pan
    if (pointers.size === 1 && isPanning && panPointerId === ev.pointerId) {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      offsetX += dx;
      offsetY += dy;
      applyTransform();
    }
  }, { passive: false });

  outer.addEventListener('pointerup', ev => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) lastDist = null;
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });
  outer.addEventListener('pointercancel', ev => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) lastDist = null;
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });
})();

window.addEventListener('DOMContentLoaded', () => {
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
});