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

let orientationHintDismissed = false;

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this.placeholderPanels = {};
    this.mainPanel = this.panelManager.createPanel({ id: 'panel-main' });
    this._labelPanelSlot(this.mainPanel, null, { row: 1, col: 1 });

    this._createPlaceholderPanel({
      id: 'panel-slot-2',
      layout: { row: 1, col: 2 },
      message: 'Esta ranura corresponde al Panel 2 del Synthi 100 físico. Se llenará cuando se definan los controles requeridos.'
    });

    this._createPlaceholderPanel({
      id: 'panel-slot-3',
      layout: { row: 1, col: 3 },
      message: 'Placeholder temporal mientras se documenta el contenido del Panel 3.'
    });

    this._createPlaceholderPanel({
      id: 'panel-slot-4',
      layout: { row: 1, col: 4 },
      message: 'Espacio libre para los módulos del Panel 4 del Synthi original.'
    });

    this.matrixPanel = this.panelManager.createPanel({ id: 'panel-matrix' });
    this._labelPanelSlot(this.matrixPanel, null, { row: 2, col: 1 });

    // Panel 6: gran matriz 66x63 sin rótulos
    this.panel6 = this.panelManager.createPanel({ id: 'panel-6' });
    this._labelPanelSlot(this.panel6, null, { row: 2, col: 3 });
    this.panel6MatrixEl = this.panel6.addSection({ id: 'panel6Matrix', type: 'matrix' });
    this.panel6MatrixEl.classList.add('matrix-large');

    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });
    this._labelPanelSlot(this.outputPanel, null, { row: 2, col: 4 });

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.mainPanel.addHeaderElement(this.muteBtn);

    this.oscRowEl = this.mainPanel.addSection({ id: 'oscRow', title: 'Oscillators 1–3', type: 'row' });
    this.pulseRowEl = this.mainPanel.addSection({ id: 'pulseRow', title: 'Oscillator 3 / Pulse', type: 'row' });
    this.noiseRowEl = this.mainPanel.addSection({ id: 'noiseRow', title: 'Noise Generator', type: 'row' });
    this.matrixEl = this.matrixPanel.addSection({ id: 'matrixTable', type: 'matrix' });
    this.stickRowEl = this.mainPanel.addSection({ id: 'stickRow', title: 'Stick (Joystick)', type: 'row' });
    this.routerRowEl = this.mainPanel.addSection({ id: 'routerRow', title: 'Output Router (buses → L/R)', type: 'row' });
    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
    this.matrix = null;
    this._heightSyncScheduled = false;
    this._panel6LayoutRaf = null;
    this._setupModules();
    this._buildPanel6Matrix();
    this._setupUI();
    this._schedulePanelSync();
    window.addEventListener('resize', () => {
      this._schedulePanelSync();
      this._resizePanel6Pins();
    });
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

  _labelPanelSlot(panel, label, layout = {}) {
    if (!panel || !panel.element) return;

    if (layout.row) {
      panel.element.style.setProperty('--panel-row', layout.row);
      panel.element.dataset.panelRow = layout.row;
    }
    if (layout.col) {
      panel.element.style.setProperty('--panel-col', layout.col);
      panel.element.dataset.panelCol = layout.col;
    }
  }

  _createPlaceholderPanel({ id, message, layout } = {}) {
    const panel = this.panelManager.createPanel({ id });
    panel.element.classList.add('panel-placeholder');
    if (layout) {
      this._labelPanelSlot(panel, null, layout);
    }

    const body = document.createElement('div');
    body.className = 'placeholder-body';
    body.textContent = message || 'Placeholder pendiente de especificaciones.';
    panel.appendElement(body);

    if (id) {
      this.placeholderPanels[id] = panel;
    }
    return panel;
  }

  _buildPanel6Matrix() {
    const table = this.panel6MatrixEl;
    if (!table) return;

    table.innerHTML = '';
    const tbody = document.createElement('tbody');

    const rows = 63;
    const cols = 66;

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'pin-btn';
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
        });
        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // Ajustar layout de la matriz grande dentro del panel 6
    this._resizePanel6Pins();
  }

  _resizePanel6Pins() {
    if (!this.panel6 || !this.panel6.element || !this.panel6MatrixEl) return;

    // Layout diferido para asegurarnos de que el panel y el contenedor
    // tienen dimensiones válidas antes de medir y escalar.
    if (this._panel6LayoutRaf) {
      cancelAnimationFrame(this._panel6LayoutRaf);
    }

    this._panel6LayoutRaf = requestAnimationFrame(() => {
      this._panel6LayoutRaf = null;

      const container = this.panel6MatrixEl.closest('.matrix-container');
      if (!container) return;

      const table = this.panel6MatrixEl;

      // Restablecemos cualquier escala previa para obtener el tamaño base
      table.style.transform = 'none';

      const containerRect = container.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();

      const availableWidth = containerRect.width;
      const availableHeight = containerRect.height;
      const baseWidth = tableRect.width;
      const baseHeight = tableRect.height;

      if (!availableWidth || !availableHeight || !baseWidth || !baseHeight) return;

      const widthScale = availableWidth / baseWidth;
      const heightScale = availableHeight / baseHeight;

      // Escala uniforme que garantiza que la matriz completa quepa dentro
      // del contenedor cuadrado. No ampliamos por encima de 1 para mantener
      // el tamaño base en pantallas grandes.
      const scale = Math.min(1, widthScale, heightScale);

      table.style.transformOrigin = 'center center';
      table.style.transform = `scale(${scale})`;
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
    panels.forEach(panel => {
      panel.style.height = '';
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
  const MIN_VISIBLE_STRIP_PX = 32; // franja mínima de contenido que debe seguir visible
  const PINCH_SCALE_EPSILON = 0.004; // evita que el pellizco dispare zoom por ruido
  const MULTI_PAN_EPSILON = 0.75; // ignora micro movimientos en desplazamiento multitáctil
  let clampDisabled = false;
  let offsetX = 0;
  let offsetY = 0;
  let userHasAdjustedView = false;

  // Contador táctil en captura para activar __synthNavGestureActive
  const activeTouchIds = new Set();

  function updateNavGestureFlagFromCapture() {
    const navActive = activeTouchIds.size >= 2;
    window.__synthNavGestureActive = navActive;
  }

  function clampOffsets() {
    if (clampDisabled) return;
    const contentWidth = inner.scrollWidth;
    const contentHeight = inner.scrollHeight;
    if (!contentWidth || !contentHeight) return;

    const outerWidth = outer.clientWidth;
    const outerHeight = outer.clientHeight;
    if (!outerWidth || !outerHeight) return;

    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;

    // Definimos la franja mínima que debe seguir visible en cada eje.
    const visibleStripX = Math.min(MIN_VISIBLE_STRIP_PX, scaledWidth, outerWidth);
    const visibleStripY = Math.min(MIN_VISIBLE_STRIP_PX, scaledHeight, outerHeight);

    // Para que nunca desaparezca por completo, imponemos que la intersección
    // entre contenido y viewport tenga como mínimo esa franja visible.
    // En X esto equivale a limitar offsetX a:
    //   [visibleStripX - scaledWidth, outerWidth - visibleStripX]
    const minOffsetX = visibleStripX - scaledWidth;
    const maxOffsetX = outerWidth - visibleStripX;

    if (minOffsetX <= maxOffsetX) {
      offsetX = Math.min(Math.max(offsetX, minOffsetX), maxOffsetX);
    } else {
      // Caso degenerado: el rango es imposible; fijamos al centro.
      offsetX = (minOffsetX + maxOffsetX) / 2;
    }

    // Análogo en Y.
    const minOffsetY = visibleStripY - scaledHeight;
    const maxOffsetY = outerHeight - visibleStripY;

    if (minOffsetY <= maxOffsetY) {
      offsetY = Math.min(Math.max(offsetY, minOffsetY), maxOffsetY);
    } else {
      offsetY = (minOffsetY + maxOffsetY) / 2;
    }
  }

  function applyTransform() {
    clampOffsets();
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  applyTransform();

  function fitContentToViewport() {
    if (!outer || !inner) return;
    const contentWidth = inner.scrollWidth;
    const contentHeight = inner.scrollHeight;
    if (!contentWidth || !contentHeight) return;
    const outerWidth = outer.clientWidth;
    const outerHeight = outer.clientHeight;
    if (!outerWidth || !outerHeight) return;
    const scaleX = outerWidth / contentWidth;
    const scaleY = outerHeight / contentHeight;
    const targetScale = Math.min(1, scaleX, scaleY);
    const clampedScale = Math.min(maxScale, Math.max(minScale, targetScale));
    scale = clampedScale;
    const finalWidth = contentWidth * scale;
    const finalHeight = contentHeight * scale;
    const centeredOffsetX = (outerWidth - finalWidth) / 2;
    const centeredOffsetY = (outerHeight - finalHeight) / 2;
    offsetX = centeredOffsetX;
    offsetY = centeredOffsetY;
    applyTransform();
  }

  requestAnimationFrame(() => fitContentToViewport());

  function setClampDisabled(value) {
    if (clampDisabled === value) return;
    clampDisabled = value;
    applyTransform();
  }

  function markUserAdjusted() {
    userHasAdjustedView = true;
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

  // Escuchamos punteros táctiles en captura para que el flag global
  // de gesto de navegación se actualice antes de que lleguen a los widgets.
  outer.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    activeTouchIds.add(ev.pointerId);
    updateNavGestureFlagFromCapture();
  }, true);

  const handleTouchEndCapture = ev => {
    if (ev.pointerType !== 'touch') return;
    activeTouchIds.delete(ev.pointerId);
    updateNavGestureFlagFromCapture();
  };

  outer.addEventListener('pointerup', handleTouchEndCapture, true);
  outer.addEventListener('pointercancel', handleTouchEndCapture, true);

  function isInteractiveTarget(el) {
    if (!el) return false;
    const selector = '.knob, .knob-inner, .pin-btn, .joystick-pad, .joystick-handle, .output-fader';
    if (el.closest('[data-prevent-pan="true"]')) return true;
    return !!el.closest(selector);
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
      markUserAdjusted();
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
    markUserAdjusted();
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

  // Flag global de "gesto de navegación" activo (dos o más toques táctiles)
  let activeTouchCount = 0;
  let navGestureActive = false;
  window.__synthNavGestureActive = false;

  function recomputeNavGestureState() {
    let count = 0;
    pointers.forEach(p => {
      if (p && p.pointerType === 'touch') {
        count += 1;
      }
    });
    activeTouchCount = count;
    const next = activeTouchCount >= 2;
    if (next !== navGestureActive) {
      navGestureActive = next;
      window.__synthNavGestureActive = navGestureActive;
    }
  }

  outer.addEventListener('pointerdown', ev => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType });
    recomputeNavGestureState();
    const isMouseLike = ev.pointerType === 'mouse' || ev.pointerType === 'pen';

    // En escritorio (ratón/lápiz), permitimos pan a un dedo sobre zonas no
    // interactivas. En táctil, un dedo nunca inicia pan: se reserva para
    // interactuar con los controles.
    if (isMouseLike && pointers.size === 1 && !isInteractiveTarget(ev.target)) {
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
        if (transformDirty) {
          markUserAdjusted();
        }
      }

      // Cuando hay dos dedos, desactivamos pan a un dedo
      isPanning = false;
      panPointerId = null;
      return;
    }

    // Si hay un solo puntero activo y estamos en modo pan (solo ratón)
    if (pointers.size === 1 && isPanning && panPointerId === ev.pointerId) {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      offsetX += dx;
      offsetY += dy;
      applyTransform();
      markUserAdjusted();
    }
  }, { passive: false });

  outer.addEventListener('pointerup', ev => {
    pointers.delete(ev.pointerId);
    recomputeNavGestureState();
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
    recomputeNavGestureState();
    if (pointers.size < 2) {
      lastDist = null;
      lastCentroid = null;
    }
    if (panPointerId === ev.pointerId) {
      isPanning = false;
      panPointerId = null;
    }
  });

  window.addEventListener('resize', () => {
    if (userHasAdjustedView) return;
    fitContentToViewport();
  });
})();

window.addEventListener('DOMContentLoaded', () => {
  ensureOrientationHint();
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
  registerServiceWorker();
});

function ensureOrientationHint() {
  if (orientationHintDismissed) return;
  orientationHintDismissed = true;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  if (!isPortrait) return;

  let hint = document.getElementById('orientationHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'orientationHint';
    hint.className = 'orientation-hint';
    document.body.appendChild(hint);
  }
  hint.textContent = 'Gira el dispositivo en posición horizontal para una mejor experiencia de uso del sintetizador';
  requestAnimationFrame(() => {
    hint.classList.remove('hide');
    hint.classList.add('show');
  });
  setTimeout(() => dismissOrientationHint(), 4500);
}

function dismissOrientationHint() {
  const hint = document.getElementById('orientationHint');
  if (!hint) return;
  hint.classList.add('hide');
  hint.classList.remove('show');
  setTimeout(() => {
    if (hint.parentNode) {
      hint.parentNode.removeChild(hint);
    }
  }, 600);
}

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