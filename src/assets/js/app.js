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
import { LargeMatrix } from './ui/largeMatrix.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';

let orientationHintDismissed = false;

const INLINE_SVG_TEXT_CACHE = new Map();

function loadSvgTextOnce(url) {
  if (INLINE_SVG_TEXT_CACHE.has(url)) return INLINE_SVG_TEXT_CACHE.get(url);
  const promise = fetch(url, { cache: 'force-cache' })
    .then(resp => (resp && resp.ok ? resp.text() : null))
    .catch(() => null);
  INLINE_SVG_TEXT_CACHE.set(url, promise);
  return promise;
}

function injectInlinePanelSvgBackground(panelId, svgUrl) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.querySelector(':scope > .panel-inline-bg')) return;

  const host = document.createElement('div');
  host.className = 'panel-inline-bg';
  panel.insertBefore(host, panel.firstChild);

  // Usar <object> en lugar de <img>: aísla el contexto de render del SVG,
  // permitiendo que Chrome lo re-renderice vectorialmente incluso bajo transform scale.
  const obj = document.createElement('object');
  obj.type = 'image/svg+xml';
  obj.data = svgUrl;
  obj.style.cssText = 'width: 100%; height: 100%; display: block;';
  obj.setAttribute('aria-hidden', 'true');
  host.appendChild(obj);
  panel.classList.add('has-inline-bg');
}

// Esta constante será sustituida por esbuild en el bundle de docs/.
// En /src seguirá siendo el placeholder.
// typeof __BUILD_VERSION__ es seguro aunque no exista.
// eslint-disable-next-line no-undef
const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '__BUILD_VERSION__';

function applyBuildVersionToPanels(version) {
  const els = document.querySelectorAll('.panel-build-version');
  els.forEach(el => {
    el.textContent = `Versión ${version}`;
  });
}

function detectBuildVersion() {
  // Caso build (/docs): BUILD_VERSION ya viene inyectado por esbuild.
  if (BUILD_VERSION && BUILD_VERSION !== '__BUILD_VERSION__') {
    window.__synthBuildVersion = BUILD_VERSION;
    applyBuildVersionToPanels(BUILD_VERSION);
    return;
  }

  // Caso /src: usamos la version de package.json como referencia.
  fetch('../package.json', { cache: 'no-store' })
    .then(resp => (resp && resp.ok ? resp.json() : null))
    .then(pkg => {
      if (!pkg || !pkg.version) return;
      const label = `${pkg.version}-src`;
      window.__synthBuildVersion = label;
      applyBuildVersionToPanels(label);
    })
    .catch(() => {});
}

class App {
  constructor() {
    this.engine = new AudioEngine();
    this.panelManager = new PanelManager(document.getElementById('viewportInner'));
    this.placeholderPanels = {};
    // Panel 1: panel principal de controles
    this.panel1 = this.panelManager.createPanel({ id: 'panel-1' });
    this._labelPanelSlot(this.panel1, null, { row: 1, col: 1 });

    // Panel 2: matriz pequeña de ruteo (Matrix)
    this.panel2 = this.panelManager.createPanel({ id: 'panel-2' });
    this._labelPanelSlot(this.panel2, null, { row: 1, col: 2 });

    // Panel 3: SGME Oscillators (layout-only, sin audio por ahora)
    this.panel3 = this.panelManager.createPanel({ id: 'panel-3' });
    this._labelPanelSlot(this.panel3, null, { row: 1, col: 3 });

    // Panel 4: placeholder pendiente
    this._createPlaceholderPanel({
      id: 'panel-4',
      layout: { row: 1, col: 4 },
      message: 'Espacio libre para los módulos del Panel 4 del Synthi original.'
    });

    // Panel 5: por ahora vacío (antiguo panel de matriz pequeña)
    this.panel5 = this.panelManager.createPanel({ id: 'panel-5' });
    this._labelPanelSlot(this.panel5, null, { row: 2, col: 1 });

    // Panel 6: gran matriz 66x63 sin rótulos
    this.panel6 = this.panelManager.createPanel({ id: 'panel-6' });
    this._labelPanelSlot(this.panel6, null, { row: 2, col: 3 });

    // Fondo SVG inline (runtime) para mejorar nitidez bajo zoom.
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');
    injectInlinePanelSvgBackground('panel-3', './assets/panels/panel3_bg.svg');

    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });
    this._labelPanelSlot(this.outputPanel, null, { row: 2, col: 4 });

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.panel1.addHeaderElement(this.muteBtn);

    this.oscRowEl = this.panel1.addSection({ id: 'oscRow', title: 'Oscillators 1–3', type: 'row' });
    this.pulseRowEl = this.panel1.addSection({ id: 'pulseRow', title: 'Oscillator 3 / Pulse', type: 'row' });
    this.noiseRowEl = this.panel1.addSection({ id: 'noiseRow', title: 'Noise Generator', type: 'row' });

    // Matriz pequeña ahora vive en el Panel 2
    this.matrixEl = this.panel2.addSection({ id: 'matrixTable', type: 'matrix' });

    this.stickRowEl = this.panel1.addSection({ id: 'stickRow', title: 'Stick (Joystick)', type: 'row' });
    this.routerRowEl = this.panel1.addSection({ id: 'routerRow', title: 'Output Router (buses → L/R)', type: 'row' });
    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
    this.matrix = null;
    this._heightSyncScheduled = false;
    this.largeMatrixAudio = null;
    this.largeMatrixControl = null;
    this._buildPanel3Layout();
    this._setupModules();
    this._buildLargeMatrices();
    this._setupUI();
    this._schedulePanelSync();
    window.addEventListener('resize', () => {
      this._schedulePanelSync();
      this._resizeLargeMatrices();
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

  _getPanel3LayoutSpec() {
    // Todos los números son ajustes fáciles para posteriores alineados a ojo.
    const oscSize = { width: 340, height: 86 };
    const padding = 10;
    const gap = { x: 20, y: 12 };
    const rowsPerColumn = 6; // 12 osciladores en 2 columnas
    const topOffset = 10;
    const knobGap = 8;
    const switchOffset = { leftPercent: 36, topPx: 6 };
    return {
      oscSize,
      padding,
      gap,
      rowsPerColumn,
      topOffset,
      knobGap,
      switchOffset,
      reservedHeight: oscSize.height
    };
  }

  _buildPanel3Layout() {
    if (!this.panel3) return;

    const host = document.createElement('div');
    host.id = 'panel3Layout';
    host.className = 'panel3-layout';
    this.panel3.appendElement(host);

    const layout = this._getPanel3LayoutSpec();
    const { oscSize, padding, gap, rowsPerColumn, topOffset } = layout;

    const oscillatorSlots = [];
    // Columna izquierda (1-6)
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 1, col: 0, row: i });
    }
    // Columna derecha (7-12)
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 7, col: 1, row: i });
    }

    const oscInstances = oscillatorSlots.map(slot => {
      const osc = new SGME_Oscillator({
        id: `sgme-osc-${slot.index}`,
        title: `Oscillator ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset
      });
      const el = osc.createElement();
      const x = padding + slot.col * (oscSize.width + gap.x);
      const y = topOffset + slot.row * (oscSize.height + gap.y);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      host.appendChild(el);
      return el;
    });

    // Franja inferior reservada para otros 3 módulos (sin contenido todavía)
    const reserved = document.createElement('div');
    reserved.className = 'panel3-reserved-row';
    reserved.textContent = 'Reserved strip for future modules';
    const reservedTop = topOffset + rowsPerColumn * (oscSize.height + gap.y);
    reserved.style.left = `${padding}px`;
    reserved.style.right = `${padding}px`;
    reserved.style.top = `${reservedTop}px`;
    reserved.style.height = `${layout.reservedHeight}px`;
    host.appendChild(reserved);

    // Guardamos por si más adelante se necesita referenciar desde fuera
    this.panel3OscillatorElements = oscInstances;
    this.panel3ReservedRow = reserved;
  }

  _buildLargeMatrices() {
    // Panel 5 y 6: matrices grandes idénticas en tamaño y comportamiento básico
    this.panel5MatrixEl = this.panel5.addSection({ id: 'panel5Matrix', type: 'matrix' });
    this.panel6MatrixEl = this.panel6.addSection({ id: 'panel6Matrix', type: 'matrix' });

    // AJUSTE MANUAL (ensayo/error)
    // Unidades: "pasos" ~= "pines" (fracciones permitidas: 0.1, 0.5, etc.)
    // Convención de signo (idéntica en los 4 lados):
    // - margen positivo  => comprime hacia dentro
    // - margen negativo  => expande hacia fuera
    const LARGE_MATRIX_TWEAK = {
      moveSteps: { x: 5.1, y: 0 },
      marginsSteps: { left: -7.47, right: -3, top: 4.7, bottom: 2.7 }
    };

    const LARGE_MATRIX_FRAME = {
      squarePercent: 90,
      translateSteps: LARGE_MATRIX_TWEAK.moveSteps,
      marginsSteps: LARGE_MATRIX_TWEAK.marginsSteps,
      // MODO AJUSTE: permite salirse del panel (útil para alinear a ojo)
      clip: true, // false para ajuste visual
      overflowPercent: { left: 25, top: 25, right: 200, bottom: 80 },
      // Permite que los márgenes negativos expandan más allá del 100%
      maxSizePercent: 300
    };

    // Modo ajuste visual (evitar recortes por CSS durante el ajuste)
    if (LARGE_MATRIX_FRAME.clip === false) {
      this.panel5?.element?.classList.add('matrix-adjust');
      this.panel6?.element?.classList.add('matrix-adjust');
    } else {
      this.panel5?.element?.classList.remove('matrix-adjust');
      this.panel6?.element?.classList.remove('matrix-adjust');
    }

    this.largeMatrixAudio = new LargeMatrix(this.panel5MatrixEl, { rows: 63, cols: 67, frame: LARGE_MATRIX_FRAME });
    this.largeMatrixControl = new LargeMatrix(this.panel6MatrixEl, { rows: 63, cols: 67, frame: LARGE_MATRIX_FRAME });

    this.largeMatrixAudio.build();
    this.largeMatrixControl.build();
  }

  _resizeLargeMatrices() {
    if (this.largeMatrixAudio) {
      this.largeMatrixAudio.resizeToFit();
    }
    if (this.largeMatrixControl) {
      this.largeMatrixControl.resizeToFit();
    }
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

  // Flags de sesión para bloquear gestos (solo UI móvil los cambia).
  // Desktop (wheel/ratón) no usa estos locks.
  window.__synthNavLocks = window.__synthNavLocks || { zoomLocked: false, panLocked: false };
  const navLocks = window.__synthNavLocks;

  let scale = 1;
  let minScale = 0.1; // permite alejar mucho
  let maxScale = 6.0;
  const LOW_ZOOM_THRESHOLD = 0.55;
  const LOW_ZOOM_CLASS = 'is-low-zoom';
  const wheelPanFactor = 0.35; // ajuste fino para gestos de dos dedos
  const wheelPanSmoothing = 0.92; // suaviza el gesto en trackpads
  const MIN_VISIBLE_STRIP_PX = 32; // franja mínima de contenido que debe seguir visible
  const PINCH_SCALE_EPSILON = 0.002; // evita que el pellizco dispare zoom por ruido
  const MULTI_PAN_EPSILON = 0.05; // ignora micro movimientos en desplazamiento multitáctil
  let clampDisabled = false;
  let offsetX = 0;
  let offsetY = 0;
  let userHasAdjustedView = false;

  // Reducir borrosidad: hacemos "snap" del scale global para que el tamaño
  // de celdas/pines caiga más cerca de píxeles enteros (sobre todo al alejar).
  function snapScale(value) {
    // Snap adaptativo: al alejar usamos unidades mayores para evitar repaints innecesarios.
    const dpr = window.devicePixelRatio || 1;
    const snapUnit = value < 0.6 ? 24 : 12;
    const denom = snapUnit * dpr;
    if (!denom) return value;
    return Math.round(value * denom) / denom;
  }

  // Nota: la fluidez depende sobre todo de limitar el trabajo por evento.
  // Hacemos render de transformaciones como máximo 1 vez por frame.

  // Contador táctil en captura para activar __synthNavGestureActive
  const activeTouchIds = new Set();

  function updateNavGestureFlagFromCapture() {
    const navActive = activeTouchIds.size >= 2;
    window.__synthNavGestureActive = navActive;
  }

  const metrics = {
    contentWidth: 0,
    contentHeight: 0,
    outerWidth: 0,
    outerHeight: 0,
    outerLeft: 0,
    outerTop: 0
  };
  let metricsDirty = true;

  const isCoarsePointer = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();

  function computeContentSizeFromPanels() {
    const panels = inner.querySelectorAll('.panel');
    if (!panels || panels.length === 0) {
      return {
        width: inner.scrollWidth,
        height: inner.scrollHeight
      };
    }

    let maxRight = 0;
    let maxBottom = 0;
    panels.forEach(panel => {
      const right = (panel.offsetLeft || 0) + (panel.offsetWidth || 0);
      const bottom = (panel.offsetTop || 0) + (panel.offsetHeight || 0);
      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });

    return {
      width: maxRight,
      height: maxBottom
    };
  }

  function refreshMetrics() {
    const rect = outer.getBoundingClientRect();
    const content = computeContentSizeFromPanels();
    metrics.contentWidth = content.width;
    metrics.contentHeight = content.height;
    metrics.outerWidth = outer.clientWidth;
    metrics.outerHeight = outer.clientHeight;
    metrics.outerLeft = rect.left;
    metrics.outerTop = rect.top;
    metricsDirty = false;
  }

  let renderRaf = null;
  function requestRender() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      render();
    });
  }

  function clampOffsets() {
    if (clampDisabled) return;
    const contentWidth = metrics.contentWidth;
    const contentHeight = metrics.contentHeight;
    if (!contentWidth || !contentHeight) return;

    const outerWidth = metrics.outerWidth;
    const outerHeight = metrics.outerHeight;
    if (!outerWidth || !outerHeight) return;

    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;

    // En móvil/tablet táctil mantenemos el clamp permisivo (deja una franja visible).
    // En desktop usamos clamp clásico (no permite mostrar fondo, salvo si el contenido
    // es más pequeño que el viewport, en cuyo caso lo centramos).
    const allowOverscroll = isCoarsePointer;

    if (allowOverscroll) {
      const visibleStripX = Math.min(MIN_VISIBLE_STRIP_PX, scaledWidth, outerWidth);
      const visibleStripY = Math.min(MIN_VISIBLE_STRIP_PX, scaledHeight, outerHeight);

      const minOffsetX = visibleStripX - scaledWidth;
      const maxOffsetX = outerWidth - visibleStripX;
      if (minOffsetX <= maxOffsetX) {
        offsetX = Math.min(Math.max(offsetX, minOffsetX), maxOffsetX);
      } else {
        offsetX = (minOffsetX + maxOffsetX) / 2;
      }

      const minOffsetY = visibleStripY - scaledHeight;
      const maxOffsetY = outerHeight - visibleStripY;
      if (minOffsetY <= maxOffsetY) {
        offsetY = Math.min(Math.max(offsetY, minOffsetY), maxOffsetY);
      } else {
        offsetY = (minOffsetY + maxOffsetY) / 2;
      }
      return;
    }

    // Clamp clásico (desktop)
    if (scaledWidth <= outerWidth) {
      offsetX = (outerWidth - scaledWidth) / 2;
    } else {
      const minOffsetX = outerWidth - scaledWidth;
      const maxOffsetX = 0;
      offsetX = Math.min(Math.max(offsetX, minOffsetX), maxOffsetX);
    }

    if (scaledHeight <= outerHeight) {
      offsetY = (outerHeight - scaledHeight) / 2;
    } else {
      const minOffsetY = outerHeight - scaledHeight;
      const maxOffsetY = 0;
      offsetY = Math.min(Math.max(offsetY, minOffsetY), maxOffsetY);
    }
  }

  function render() {
    if (metricsDirty) {
      refreshMetrics();
    }
    clampOffsets();
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;

    const isLowZoom = scale < LOW_ZOOM_THRESHOLD;
    inner.classList.toggle(LOW_ZOOM_CLASS, isLowZoom);
  }

  refreshMetrics();
  render();

  function fitContentToViewport() {
    if (!outer || !inner) return;
    refreshMetrics();
    const contentWidth = metrics.contentWidth;
    const contentHeight = metrics.contentHeight;
    if (!contentWidth || !contentHeight) return;
    const outerWidth = metrics.outerWidth;
    const outerHeight = metrics.outerHeight;
    if (!outerWidth || !outerHeight) return;
    const scaleX = outerWidth / contentWidth;
    const scaleY = outerHeight / contentHeight;
    const targetScale = Math.min(1, scaleX, scaleY);
    const clampedScale = Math.min(maxScale, Math.max(minScale, targetScale));
    scale = Math.min(maxScale, Math.max(minScale, snapScale(clampedScale)));
    const finalWidth = contentWidth * scale;
    const finalHeight = contentHeight * scale;
    const centeredOffsetX = (outerWidth - finalWidth) / 2;
    const centeredOffsetY = (outerHeight - finalHeight) / 2;
    offsetX = centeredOffsetX;
    offsetY = centeredOffsetY;
    requestRender();
  }

  requestAnimationFrame(() => fitContentToViewport());

  function setClampDisabled(value) {
    if (clampDisabled === value) return;
    clampDisabled = value;
    requestRender();
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

  function adjustOffsetsForZoom(cx, cy, newScale, { snap = false } = {}) {
    const worldX = (cx - offsetX) / scale;
    const worldY = (cy - offsetY) / scale;
    const clamped = Math.min(maxScale, Math.max(minScale, newScale));
    scale = snap ? snapScale(clamped) : clamped;
    offsetX = cx - worldX * scale;
    offsetY = cy - worldY * scale;
    requestRender();
  }

  // Zoom con rueda (desktop), centrado en el cursor; pan con gesto normal de dos dedos
  outer.addEventListener('wheel', ev => {
    metricsDirty = true;
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const cx = ev.clientX - (metrics.outerLeft || 0);
      const cy = ev.clientY - (metrics.outerTop || 0);
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      adjustOffsetsForZoom(cx, cy, newScale);
      markUserAdjusted();
      return;
    }

    ev.preventDefault();
    const lineHeight = 16;
    const deltaUnit = ev.deltaMode === 1 ? lineHeight : (ev.deltaMode === 2 ? (metrics.outerHeight || outer.clientHeight) : 1);
    const moveX = ev.deltaX * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    const moveY = ev.deltaY * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    offsetX -= moveX;
    offsetY -= moveY;
    requestRender();
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
  let needsSnapOnEnd = false;
  let lastPinchZoomAnchor = null;

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
    const prev = pointers.get(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, pointerType: prev?.pointerType });

    if (pointers.size === 2) {
      metricsDirty = true;
      // Pinch-zoom + pan simultáneo con dos dedos
      ev.preventDefault();
      const arr = Array.from(pointers.values());
      const [p1, p2] = arr;
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.hypot(dx, dy);
      const centroidClientX = (p1.x + p2.x) / 2;
      const centroidClientY = (p1.y + p2.y) / 2;
      const localCx = centroidClientX - (metrics.outerLeft || 0);
      const localCy = centroidClientY - (metrics.outerTop || 0);

      // Si el paneo está bloqueado, anclamos el zoom al centro del viewport para
      // evitar que el ancla se desplace al mover los dedos durante el pinch.
      const outerW = metrics.outerWidth || outer.clientWidth || 0;
      const outerH = metrics.outerHeight || outer.clientHeight || 0;
      const zoomAnchorX = navLocks.panLocked ? outerW / 2 : localCx;
      const zoomAnchorY = navLocks.panLocked ? outerH / 2 : localCy;
      lastPinchZoomAnchor = { x: zoomAnchorX, y: zoomAnchorY };

      let transformDirty = false;
      let didZoom = false;
      if (lastCentroid) {
        const panDx = centroidClientX - lastCentroid.x;
        const panDy = centroidClientY - lastCentroid.y;
        if (!navLocks.panLocked) {
          if (Math.abs(panDx) > MULTI_PAN_EPSILON || Math.abs(panDy) > MULTI_PAN_EPSILON) {
            offsetX += panDx;
            offsetY += panDy;
            transformDirty = true;
          }
        }
      }

      if (lastDist != null) {
        const zoomFactor = dist / lastDist;
        if (!navLocks.zoomLocked) {
          if (Math.abs(zoomFactor - 1) > PINCH_SCALE_EPSILON) {
            const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
            // Importante: durante el pinch NO hacemos snap (si no, parece que no hace zoom).
            adjustOffsetsForZoom(zoomAnchorX, zoomAnchorY, newScale, { snap: false });
            didZoom = true;
          }
        }
      }

      lastDist = dist;
      lastCentroid = { x: centroidClientX, y: centroidClientY };

      if (didZoom || transformDirty) {
        requestRender();
        markUserAdjusted();
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
      requestRender();
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

    if (pointers.size === 0) {
      // No aplicamos snap de escala al final del pinch: evita micro-zoom
      // perceptible al soltar el último dedo.
      needsSnapOnEnd = false;
      lastPinchZoomAnchor = null;
      requestRender();
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

    if (pointers.size === 0) {
      needsSnapOnEnd = false;
      lastPinchZoomAnchor = null;
      requestRender();
    }
  });

  window.addEventListener('resize', () => {
    refreshMetrics();
    requestRender();
    if (userHasAdjustedView) return;
    fitContentToViewport();
  });
})();

function setupMobileQuickActionsBar() {
  const isCoarse = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  if (!isCoarse) return;

  if (document.getElementById('mobileQuickbar')) return;

  window.__synthNavLocks = window.__synthNavLocks || { zoomLocked: false, panLocked: false };
  const navLocks = window.__synthNavLocks;

  const ICON_SPRITE = './assets/icons/ui-sprite.svg';
  const iconSvg = symbolId => `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <use href="${ICON_SPRITE}#${symbolId}"></use>
    </svg>
  `;

  const bar = document.createElement('div');
  bar.id = 'mobileQuickbar';
  bar.className = 'mobile-quickbar mobile-quickbar--collapsed';
  bar.setAttribute('data-prevent-pan', 'true');

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'mobile-quickbar__tab';
  tab.setAttribute('aria-label', 'Abrir acciones rápidas');
  tab.setAttribute('aria-expanded', 'false');
  tab.innerHTML = iconSvg('ti-menu-2');

  const group = document.createElement('div');
  group.className = 'mobile-quickbar__group';

  const btnPan = document.createElement('button');
  btnPan.type = 'button';
  btnPan.className = 'mobile-quickbar__btn';
  btnPan.setAttribute('aria-label', 'Bloquear paneo');
  btnPan.setAttribute('aria-pressed', String(Boolean(navLocks.panLocked)));
  btnPan.innerHTML = iconSvg('ti-hand-stop');

  const btnZoom = document.createElement('button');
  btnZoom.type = 'button';
  btnZoom.className = 'mobile-quickbar__btn';
  btnZoom.setAttribute('aria-label', 'Bloquear zoom');
  btnZoom.setAttribute('aria-pressed', String(Boolean(navLocks.zoomLocked)));
  btnZoom.innerHTML = iconSvg('ti-zoom-cancel');

  const btnFs = document.createElement('button');
  btnFs.type = 'button';
  btnFs.className = 'mobile-quickbar__btn';
  btnFs.setAttribute('aria-label', 'Pantalla completa');
  btnFs.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  btnFs.innerHTML = iconSvg('ti-arrows-maximize');

  const displayModeQueries = ['(display-mode: standalone)', '(display-mode: fullscreen)']
    .map(query => window.matchMedia ? window.matchMedia(query) : null)
    .filter(Boolean);

  const isStandaloneDisplay = () => {
    const matchesQuery = displayModeQueries.some(mq => mq.matches);
    const navigatorStandalone = typeof window.navigator !== 'undefined' && 'standalone' in window.navigator
      ? window.navigator.standalone
      : false;
    return matchesQuery || Boolean(navigatorStandalone);
  };

  const canFullscreen = !!(document.documentElement && document.documentElement.requestFullscreen);
  const shouldHideFullscreen = () => !canFullscreen || isStandaloneDisplay();

  const applyPressedState = () => {
    btnPan.setAttribute('aria-pressed', String(Boolean(navLocks.panLocked)));
    btnZoom.setAttribute('aria-pressed', String(Boolean(navLocks.zoomLocked)));
    btnFs.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));

    btnPan.classList.toggle('is-active', Boolean(navLocks.panLocked));
    btnZoom.classList.toggle('is-active', Boolean(navLocks.zoomLocked));
    btnFs.classList.toggle('is-active', Boolean(document.fullscreenElement));

    btnFs.hidden = shouldHideFullscreen();
    btnFs.disabled = btnFs.hidden;
  };

  let expanded = false;
  function setExpanded(value) {
    expanded = Boolean(value);
    bar.classList.toggle('mobile-quickbar--collapsed', !expanded);
    bar.classList.toggle('mobile-quickbar--expanded', expanded);
    tab.setAttribute('aria-expanded', String(expanded));
  }

  tab.addEventListener('click', () => {
    setExpanded(!expanded);
  });

  btnPan.addEventListener('click', () => {
    navLocks.panLocked = !navLocks.panLocked;
    applyPressedState();
  });

  btnZoom.addEventListener('click', () => {
    navLocks.zoomLocked = !navLocks.zoomLocked;
    applyPressedState();
  });

  btnFs.addEventListener('click', async () => {
    if (btnFs.disabled) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('No se pudo alternar la pantalla completa.', error);
    } finally {
      applyPressedState();
    }
  });

  document.addEventListener('fullscreenchange', applyPressedState);
  displayModeQueries.forEach(mq => mq.addEventListener('change', applyPressedState));

  group.appendChild(btnPan);
  group.appendChild(btnZoom);
  group.appendChild(btnFs);

  bar.appendChild(group);
  bar.appendChild(tab);
  document.body.appendChild(bar);

  applyPressedState();
}

window.addEventListener('DOMContentLoaded', () => {
  ensureOrientationHint();
  window._synthApp = new App();
  if (window._synthApp && window._synthApp.ensureAudio) {
    window._synthApp.ensureAudio();
  }
  registerServiceWorker();
  detectBuildVersion();
  setupMobileQuickActionsBar();
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