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
import { OutputFaderModule } from './modules/outputFaders.js';

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this.mainPanel = this.panelManager.createPanel({
      id: 'panel-main',
      title: 'Synthi GME (emulador del EMS Synthi 100) – Prototipo Web',
      subtitle: '3 osciladores + matriz tipo EMS + stick (-1..1) + router estéreo (Output Ch1/Ch2 → L/R).'
    });
    this.matrixPanel = this.panelManager.createPanel({
      id: 'panel-matrix',
      title: 'Pin Matrix & Routing',
      subtitle: 'Cartografía EMS ampliable en panel dedicado.'
    });
    this.outputPanel = this.panelManager.createPanel({
      id: 'panel-output',
      title: 'Output Mixer',
      subtitle: '8 buses lógicos → estéreo master'
    });

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.mainPanel.addHeaderElement(this.muteBtn);

    this.oscRowEl = this.mainPanel.addSection({ id: 'oscRow', title: 'Oscillators 1–3', type: 'row' });
    this.pulseRowEl = this.mainPanel.addSection({ id: 'pulseRow', title: 'Oscillator 3 / Pulse', type: 'row' });
    this.noiseRowEl = this.mainPanel.addSection({ id: 'noiseRow', title: 'Noise Generator', type: 'row' });
    this.matrixEl = this.matrixPanel.addSection({ id: 'matrixTable', title: 'Pin Matrix (tipo Synthi)', type: 'matrix' });
    this.stickRowEl = this.mainPanel.addSection({ id: 'stickRow', title: 'Stick (Joystick)', type: 'row' });
    this.routerRowEl = this.mainPanel.addSection({ id: 'routerRow', title: 'Output Router (buses → L/R)', type: 'row' });
    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
    this.matrix = null;
    this._heightSyncScheduled = false;
    this._setupModules();
    this._setupUI();
    this._schedulePanelSync();
    window.addEventListener('resize', () => this._schedulePanelSync());
  }

  ensureAudio() { this.engine.start(); }

  _setupModules() {
    const osc1 = new OscillatorModule(this.engine, 'osc1', 110);
    const osc2 = new OscillatorModule(this.engine, 'osc2', 220);
    const osc3 = new PulseModule(this.engine, 'osc3', 330);
    const noise = new NoiseModule(this.engine, 'noise');
    const stick = new JoystickModule(this.engine, 'stick');
    const router = new OutputRouterModule(this.engine, 'router');
    const outputFaders = new OutputFaderModule(this.engine, 'outputFaders');

    this.engine.addModule(osc1);
    this.engine.addModule(osc2);
    this.engine.addModule(osc3);
    this.engine.addModule(noise);
    this.engine.addModule(stick);
    this.engine.addModule(router);
    this.engine.addModule(outputFaders);

    osc1.createPanel(this.oscRowEl);
    osc2.createPanel(this.oscRowEl);
    osc3.createPanel(this.pulseRowEl);
    noise.createPanel(this.noiseRowEl);
    stick.createPanel(this.stickRowEl);
    createOutputRouterUI(this.engine, this.routerRowEl);
    outputFaders.createPanel(this.outputFadersRowEl);

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

    const outputDestinations = Array.from({ length: this.engine.outputChannels || 2 }, (_, idx) => ({
      moduleId: null,
      portId: null,
      type: 'output',
      busIndex: idx,
      label: `Output Ch ${idx + 1}`
    }));

    const destPorts = [
      // Signal inputs
      { moduleId: null,   portId: null,     type: 'amp',    label: 'Meter' },
      ...outputDestinations,
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

  _schedulePanelSync() {
    if (this._heightSyncScheduled) return;
    this._heightSyncScheduled = true;
    requestAnimationFrame(() => {
      this._heightSyncScheduled = false;
      this._syncPanelHeights();
    });
  }

  _syncPanelHeights() {
    const panels = document.querySelectorAll('#viewportInner .panel');
    if (!panels.length) return;
    let maxHeight = 0;
    panels.forEach(panel => {
      panel.style.height = 'auto';
      const panelHeight = panel.offsetHeight;
      if (panelHeight > maxHeight) maxHeight = panelHeight;
    });
    panels.forEach(panel => {
      panel.style.height = `${maxHeight}px`;
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
  const wheelPanFactor = 0.65; // ajuste fino para gestos de dos dedos
  const wheelPanSmoothing = 0.85; // suaviza el gesto en trackpads
  const panClampPadding = 200;
  const PINCH_SCALE_EPSILON = 0.004; // evita que el pellizco dispare zoom por ruido
  const MULTI_PAN_EPSILON = 0.75; // ignora micro movimientos en desplazamiento multitáctil
  let clampDisabled = false;
  let offsetX = 0;
  let offsetY = 0;

  function clampOffsets(padding = panClampPadding) {
    if (clampDisabled) return;
    const contentWidth = inner.scrollWidth;
    const contentHeight = inner.scrollHeight;
    if (!contentWidth || !contentHeight) return;
    const visibleWidth = outer.clientWidth / scale;
    const visibleHeight = outer.clientHeight / scale;
    const extraWidth = Math.max(visibleWidth - contentWidth, 0);
    const extraHeight = Math.max(visibleHeight - contentHeight, 0);

    const minX = extraWidth > 0
      ? -padding
      : visibleWidth - contentWidth - padding;
    const maxX = extraWidth > 0
      ? visibleWidth - contentWidth + padding
      : padding;

    const minY = extraHeight > 0
      ? -padding
      : visibleHeight - contentHeight - padding;
    const maxY = extraHeight > 0
      ? visibleHeight - contentHeight + padding
      : padding;

    offsetX = Math.min(Math.max(offsetX, minX), maxX);
    offsetY = Math.min(Math.max(offsetY, minY), maxY);
  }

  function applyTransform() {
    clampOffsets();
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  applyTransform();

  function setClampDisabled(value) {
    if (clampDisabled === value) return;
    clampDisabled = value;
    applyTransform();
  }

  window.addEventListener('keydown', ev => {
    if (ev.key === 'Shift') {
      setClampDisabled(true);
    }
  });

  window.addEventListener('keyup', ev => {
    if (ev.key === 'Shift') {
      setClampDisabled(false);
    }
  });

  window.addEventListener('blur', () => {
    setClampDisabled(false);
  });

  function isInteractiveTarget(el) {
    if (!el) return false;
    return !!el.closest('.knob, .knob-inner, .pin-btn, .joystick-pad, .joystick-handle');
  }

  function adjustOffsetsForZoom(cx, cy, newScale) {
    const worldX = (cx - offsetX) / scale;
    const worldY = (cy - offsetY) / scale;
    scale = newScale;
    offsetX = cx - worldX * scale;
    offsetY = cy - worldY * scale;
    applyTransform();
  }

  // Zoom con rueda (desktop), centrado en el cursor; pan con gesto normal de dos dedos
  outer.addEventListener('wheel', ev => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const rect = outer.getBoundingClientRect();
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      adjustOffsetsForZoom(cx, cy, newScale);
      return;
    }

    ev.preventDefault();
    const lineHeight = 16;
    const deltaUnit = ev.deltaMode === 1 ? lineHeight : (ev.deltaMode === 2 ? outer.clientHeight : 1);
    const moveX = ev.deltaX * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    const moveY = ev.deltaY * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    offsetX -= moveX;
    offsetY -= moveY;
    applyTransform();
  }, { passive: false });

  // Estado para pan con un dedo
  let isPanning = false;
  let panPointerId = null;
  let lastX = 0;
  let lastY = 0;

  // Pinch-zoom con dos dedos (móvil/tablet), centrado en el punto medio
  const pointers = new Map();
  let lastDist = null;
  let lastCentroid = null;

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
      // Pinch-zoom + pan simultáneo con dos dedos
      ev.preventDefault();
      const arr = Array.from(pointers.values());
      const [p1, p2] = arr;
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.hypot(dx, dy);
      const rect = outer.getBoundingClientRect();
      const centroidClientX = (p1.x + p2.x) / 2;
      const centroidClientY = (p1.y + p2.y) / 2;
      const localCx = centroidClientX - rect.left;
      const localCy = centroidClientY - rect.top;

      let transformDirty = false;
      if (lastCentroid) {
        const panDx = centroidClientX - lastCentroid.x;
        const panDy = centroidClientY - lastCentroid.y;
        if (Math.abs(panDx) > MULTI_PAN_EPSILON || Math.abs(panDy) > MULTI_PAN_EPSILON) {
          offsetX += panDx;
          offsetY += panDy;
          transformDirty = true;
        }
      }

      let didZoom = false;
      if (lastDist != null) {
        const zoomFactor = dist / lastDist;
        if (Math.abs(zoomFactor - 1) > PINCH_SCALE_EPSILON) {
          const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
          adjustOffsetsForZoom(localCx, localCy, newScale);
          didZoom = true;
          transformDirty = false; // adjustOffsetsForZoom ya aplicó la transformación
        }
      }

      lastDist = dist;
      lastCentroid = { x: centroidClientX, y: centroidClientY };

      if (!didZoom && transformDirty) {
        applyTransform();
      }

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
    if (pointers.size < 2) {
      lastDist = null;
      lastCentroid = null;
    }
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });
  outer.addEventListener('pointercancel', ev => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) {
      lastDist = null;
      lastCentroid = null;
    }
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
  registerServiceWorker();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const promptUserToRefresh = waitingWorker => {
    if (!waitingWorker || !navigator.serviceWorker.controller) return;
    const shouldUpdate = window.confirm('Hay una nueva versión disponible de SynthiGME-web. ¿Quieres recargar ahora?');
    if (shouldUpdate) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  navigator.serviceWorker.register('./sw.js')
    .then(registration => {
      if (registration.waiting) {
        promptUserToRefresh(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            promptUserToRefresh(newWorker);
          }
        });
      });
    })
    .catch(error => {
      console.error('No se pudo registrar el service worker.', error);
    });
}