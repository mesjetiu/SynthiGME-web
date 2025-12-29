// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine } from './core/engine.js';
import { JoystickModule } from './modules/joystick.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputFaderModule } from './modules/outputFaders.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';
import panel5AudioBlueprint from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';

let orientationHintDismissed = false;

const INLINE_SVG_TEXT_CACHE = new Map();
const CANVAS_BG_IMAGE_CACHE = new Map();
const CANVAS_BG_IMAGE_READY = new Map();

let CANVAS_BG_INLINE_FALLBACK = false;
const CANVAS_BG_LOAD_TIMEOUT_MS = 1500;

// --- Paso 1 (migración a canvas): fondo canvas fijo para 1 panel ---
// Resolución fija en el canvas: N píxeles de bitmap por cada CSS px.
// No depende del navegador: nosotros elegimos el factor.
const CANVAS_BG_PX_PER_CSS_PX = 2;
const CANVAS_BG_PANELS = ['panel-1', 'panel-2', 'panel-3', 'panel-4'];
const CANVAS_BG_SVG_BY_PANEL = {
  'panel-1': './assets/panels/panel1_bg.svg',
  'panel-2': './assets/panels/panel2_bg.svg',
  'panel-3': './assets/panels/panel3_bg.svg',
  'panel-4': './assets/panels/panel4_bg.svg'
};

function shouldUseCanvasBg() {
  // En móviles Android con GPUs/driver delicados, escalar bitmaps con transform
  // puede dejar "lagunas" al hacer zoom-out. Para coarse pointer usamos canvas
  // en coordenadas de pantalla (sin transform), redibujado por frame.
  try {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function ensureCanvasBgLayer() {
  const outer = document.getElementById('viewportOuter');
  if (!outer) return null;

  let layer = document.getElementById('canvasBgLayer');
  let canvas = document.getElementById('canvasBg');

  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'canvasBgLayer';
    layer.setAttribute('aria-hidden', 'true');
    outer.insertBefore(layer, outer.firstChild);
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'canvasBg';
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);
  }

  return { outer, layer, canvas };
}

function loadImageOnce(url) {
  const key = `img::${url}`;
  if (CANVAS_BG_IMAGE_CACHE.has(key)) return CANVAS_BG_IMAGE_CACHE.get(key);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  CANVAS_BG_IMAGE_CACHE.set(key, promise);
  return promise;
}

function preloadCanvasBgImages() {
  if (!shouldUseCanvasBg()) return;

  // Si en algún dispositivo el SVG no se puede rasterizar a Image() (canvas),
  // hacemos fallback: mostramos el fondo inline (object) y no bloqueamos el render.
  let timeoutId = setTimeout(() => {
    timeoutId = null;
    const urls = CANVAS_BG_PANELS
      .map(panelId => CANVAS_BG_SVG_BY_PANEL[panelId])
      .filter(Boolean);

    const allSettled = urls.every(url => CANVAS_BG_IMAGE_READY.has(url));
    if (allSettled) return;

    CANVAS_BG_INLINE_FALLBACK = true;
    for (const panelId of CANVAS_BG_PANELS) {
      const panel = document.getElementById(panelId);
      const host = panel?.querySelector?.(':scope > .panel-inline-bg');
      host?.classList?.remove('is-canvas-hidden');
    }
  }, CANVAS_BG_LOAD_TIMEOUT_MS);

  for (const panelId of CANVAS_BG_PANELS) {
    const url = CANVAS_BG_SVG_BY_PANEL[panelId];
    if (!url) continue;
    loadImageOnce(url).then(img => {
      // Marcamos siempre como "resuelto" (aunque sea null), para no dejar
      // el render bloqueado indefinidamente.
      CANVAS_BG_IMAGE_READY.set(url, img || null);

      if (!img) {
        CANVAS_BG_INLINE_FALLBACK = true;
        // Mostrar el inline background para el/los panel(es) que dependan de este SVG.
        for (const pId of CANVAS_BG_PANELS) {
          if (CANVAS_BG_SVG_BY_PANEL[pId] !== url) continue;
          const panel = document.getElementById(pId);
          const host = panel?.querySelector?.(':scope > .panel-inline-bg');
          host?.classList?.remove('is-canvas-hidden');
        }
      }

      // Si ya está todo resuelto antes del timeout, lo anulamos.
      if (timeoutId) {
        const urls = CANVAS_BG_PANELS
          .map(pId => CANVAS_BG_SVG_BY_PANEL[pId])
          .filter(Boolean);
        const allSettled = urls.every(u => CANVAS_BG_IMAGE_READY.has(u));
        if (allSettled) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    });
  }
}

function renderCanvasBgViewport(scale = 1, offsetX = 0, offsetY = 0) {
  if (!shouldUseCanvasBg()) return true;

  // Si el dispositivo no soporta bien SVG->canvas, dejamos que el inline background
  // haga el trabajo (y no bloqueamos el render ni forzamos canvas).
  if (CANVAS_BG_INLINE_FALLBACK) return true;

  const env = ensureCanvasBgLayer();
  if (!env) return false;
  const { outer, canvas } = env;

  const cssW = Math.max(outer.clientWidth, 1);
  const cssH = Math.max(outer.clientHeight, 1);
  const pxW = Math.max(1, Math.round(cssW * CANVAS_BG_PX_PER_CSS_PX));
  const pxH = Math.max(1, Math.round(cssH * CANVAS_BG_PX_PER_CSS_PX));

  canvas.style.position = 'absolute';
  canvas.style.left = '0px';
  canvas.style.top = '0px';
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return false;

  // Si aún no están las imágenes, no limpiamos ni redibujamos para evitar
  // frames "vacíos" que se perciben como lagunas.
  for (const panelId of CANVAS_BG_PANELS) {
    const url = CANVAS_BG_SVG_BY_PANEL[panelId];
    if (!url) continue;
    // Esperar solo a que el load se resuelva; si fue null, ya habremos activado fallback.
    if (!CANVAS_BG_IMAGE_READY.has(url)) return false;
  }

  ctx.setTransform(CANVAS_BG_PX_PER_CSS_PX, 0, 0, CANVAS_BG_PX_PER_CSS_PX, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);

  // Snap de coordenadas a la rejilla del canvas para evitar seams por redondeos.
  const snapUnit = 1 / CANVAS_BG_PX_PER_CSS_PX;
  const snap = (v) => Math.round(v / snapUnit) * snapUnit;

  for (const panelId of CANVAS_BG_PANELS) {
    const panel = document.getElementById(panelId);
    if (!panel) continue;
    const svgUrl = CANVAS_BG_SVG_BY_PANEL[panelId];
    if (!svgUrl) continue;
    const img = CANVAS_BG_IMAGE_READY.get(svgUrl);
    if (!img) continue;

    const x = panel.offsetLeft || 0;
    const y = panel.offsetTop || 0;
    const w = panel.offsetWidth || 0;
    const h = panel.offsetHeight || 0;
    if (w <= 0 || h <= 0) continue;

    // Convertir mundo (#viewportInner) -> pantalla (#viewportOuter)
    let sx = offsetX + x * scale;
    let sy = offsetY + y * scale;
    let sw = w * scale;
    let sh = h * scale;

    sx = snap(sx);
    sy = snap(sy);
    sw = snap(sw);
    sh = snap(sh);

    // Bleed 1 CSS px para tapar micro-seams
    ctx.drawImage(img, sx - 0.5, sy - 0.5, sw + 1, sh + 1);
  }

  return true;
}

function renderCanvasBgPanels() {
  const t = window.__synthViewTransform || { scale: 1, offsetX: 0, offsetY: 0 };
  renderCanvasBgViewport(t.scale, t.offsetX, t.offsetY);
}

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
    this._panel3Audio = { nodes: [] };
    this._panel3Routing = { connections: {}, rowMap: null, colMap: null };
    this.placeholderPanels = {};
    
    // Paneles 1, 2, 3, 4: todos son SGME Oscillators (12 osciladores cada uno)
    // Panel 1 incluye joystick integrado en el área inferior
    this.panel1 = this.panelManager.createPanel({ id: 'panel-1' });
    this._labelPanelSlot(this.panel1, null, { row: 1, col: 1 });
    this._panel1Audio = { nodes: [] };

    this.panel2 = this.panelManager.createPanel({ id: 'panel-2' });
    this._labelPanelSlot(this.panel2, null, { row: 1, col: 2 });
    this._panel2Audio = { nodes: [] };

    this.panel3 = this.panelManager.createPanel({ id: 'panel-3' });
    this._labelPanelSlot(this.panel3, null, { row: 1, col: 3 });

    this.panel4 = this.panelManager.createPanel({ id: 'panel-4' });
    this._labelPanelSlot(this.panel4, null, { row: 1, col: 4 });
    this._panel4Audio = { nodes: [] };

    // Panel 5: por ahora vacío (antiguo panel de matriz pequeña)
    this.panel5 = this.panelManager.createPanel({ id: 'panel-5' });
    this._labelPanelSlot(this.panel5, null, { row: 2, col: 1 });

    // Panel 6: gran matriz 66x63 sin rótulos
    this.panel6 = this.panelManager.createPanel({ id: 'panel-6' });
    this._labelPanelSlot(this.panel6, null, { row: 2, col: 3 });

    // Fondo SVG inline (runtime) para mejorar nitidez bajo zoom.
    injectInlinePanelSvgBackground('panel-1', './assets/panels/panel1_bg.svg');
    injectInlinePanelSvgBackground('panel-2', './assets/panels/panel2_bg.svg');
    injectInlinePanelSvgBackground('panel-3', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-4', './assets/panels/panel4_bg.svg');
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');
        
    // Canvas: pinta fondos de panel-1/2/3/4 para evitar lagunas en móvil.
    preloadCanvasBgImages();
    renderCanvasBgPanels();
    this.outputPanel = this.panelManager.createPanel({ id: 'panel-output' });
    this._labelPanelSlot(this.outputPanel, null, { row: 2, col: 4 });

    this.muteBtn = document.createElement('button');
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.textContent = '🔊 Audio ON';
    this.outputPanel.addHeaderElement(this.muteBtn);

    this.outputFadersRowEl = this.outputPanel.addSection({ id: 'outputFadersRow', title: 'Salidas lógicas Synthi (1–8)', type: 'row' });
    this._heightSyncScheduled = false;
    this.largeMatrixAudio = null;
    this.largeMatrixControl = null;
    
    // Construir los 4 paneles de SGME Oscillators
    this._buildPanel1Layout();
    this._buildPanel2Layout();
    this._buildPanel3Layout();
    this._buildPanel4Layout();
    
    this._setupOutputFaders();
    this._buildLargeMatrices();
    this._setupPanel5AudioRouting();
    this._setupUI();
    this._schedulePanelSync();

    // En móvil/tablet, el pinch/zoom puede disparar eventos resize (visual viewport),
    // y esto aquí es caro (reflow + resize matrices). Lo debounceamos y lo evitamos
    // durante gestos multitáctiles activos.
    let appResizeTimer = null;
    const runAppResizeWork = () => {
      this._schedulePanelSync();
      this._resizeLargeMatrices();
    };
    window.addEventListener('resize', () => {
      if (appResizeTimer) clearTimeout(appResizeTimer);
      appResizeTimer = setTimeout(() => {
        appResizeTimer = null;
        if (window.__synthNavGestureActive) {
          // Reintentar cuando termine el gesto.
          appResizeTimer = setTimeout(() => {
            appResizeTimer = null;
            if (!window.__synthNavGestureActive) runAppResizeWork();
          }, 180);
          return;
        }
        runAppResizeWork();
      }, 120);
    }, { passive: true });
  }

  _getOrCreateOscState(panelAudio, index) {
    panelAudio.state = panelAudio.state || [];
    let state = panelAudio.state[index];
    if (!state) {
      state = { freq: 10, oscLevel: 0, sawLevel: 0, triLevel: 0, pulseLevel: 0, pulseWidth: 0.5, sineSymmetry: 0.5 };
      panelAudio.state[index] = state;
    }
    return state;
  }

  _applyOscStateImmediate(node, state, ctx) {
    if (!node || !state || !ctx) return;
    const now = ctx.currentTime;

    if (node.osc && node.osc.frequency && Number.isFinite(state.freq)) {
      try {
        node.osc.frequency.cancelScheduledValues(now);
        node.osc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (node.sawOsc && node.sawOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.sawOsc.frequency.cancelScheduledValues(now);
        node.sawOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }

    if (node.gain && node.gain.gain && Number.isFinite(state.oscLevel)) {
      try {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(state.oscLevel, now);
      } catch (error) {}
    }
    if (node.sawGain && node.sawGain.gain && Number.isFinite(state.sawLevel)) {
      try {
        node.sawGain.gain.cancelScheduledValues(now);
        node.sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch (error) {}
    }
    if (node.triOsc && node.triOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.triOsc.frequency.cancelScheduledValues(now);
        node.triOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (node.triGain && node.triGain.gain && Number.isFinite(state.triLevel)) {
      try {
        node.triGain.gain.cancelScheduledValues(now);
        node.triGain.gain.setValueAtTime(state.triLevel, now);
      } catch (error) {}
    }
    if (node.pulseOsc && node.pulseOsc.frequency && Number.isFinite(state.freq)) {
      try {
        node.pulseOsc.frequency.cancelScheduledValues(now);
        node.pulseOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (node.pulseGain && node.pulseGain.gain && Number.isFinite(state.pulseLevel)) {
      try {
        node.pulseGain.gain.cancelScheduledValues(now);
        node.pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch (error) {}
    }
  }

  ensureAudio() { this.engine.start(); }

  _setupOutputFaders() {
    const outputFaders = new OutputFaderModule(this.engine, 'outputFaders');
    this.engine.addModule(outputFaders);
    outputFaders.createPanel(this.outputFadersRowEl);
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

  _buildPanel1Layout() {
    if (!this.panel1) return;

    const host = document.createElement('div');
    host.id = 'panel1Layout';
    host.className = 'panel3-layout';
    this.panel1.appendElement(host);

    const layout = this._getPanel3LayoutSpec();
    const { oscSize, gap, rowsPerColumn } = layout;

    const oscillatorSlots = [];
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 1, col: 0, row: i });
    }
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 7, col: 1, row: i });
    }

    const oscComponents = oscillatorSlots.map(slot => {
      const knobOptions = this._getPanel1KnobOptions(slot.index - 1);
      const osc = new SGME_Oscillator({
        id: `panel1-osc-${slot.index}`,
        title: `Osc ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset,
        knobSize: 40,
        knobRowOffsetY: -15,
        knobInnerPct: 76,
        knobOptions
      });
      const el = osc.createElement();
      host.appendChild(el);
      return { osc, element: el, slot };
    });

    const reserved = document.createElement('div');
    reserved.className = 'panel3-reserved-row';
    reserved.textContent = 'Reserved strip for future modules';
    host.appendChild(reserved);

    this._panel1LayoutData = {
      host,
      layout,
      oscillatorSlots,
      oscComponents,
      reserved
    };
    this._panel1Audio.nodes = new Array(oscComponents.length).fill(null);
    this._panel1LayoutRaf = null;
    this._reflowPanel1Layout();
  }

  _reflowPanel1Layout() {
    const data = this._panel1LayoutData;
    if (!data) return;

    if (this._panel1LayoutRaf) {
      cancelAnimationFrame(this._panel1LayoutRaf);
    }

    this._panel1LayoutRaf = requestAnimationFrame(() => {
      this._panel1LayoutRaf = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = -150, topOffset, rowsPerColumn } = layout;
      
      const paddingLeft = 0;
      const paddingRight = 0;
      
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;
      
      oscComponents.forEach(({ element, slot }, idx) => {
        const col = slot.col;
        const row = slot.row;
        const x = baseLeft + col * (columnWidth + gap.x);
        const y = baseTop + row * (oscSize.height + gap.y);
        element.style.transform = `translate(${x}px, ${y}px)`;
      });

      if (reserved) {
        const reservedTop = baseTop + blockHeight + gap.y;
        reserved.style.transform = `translate(${baseLeft}px, ${reservedTop}px)`;
        reserved.style.width = `${columnWidth * 2 + gap.x}px`;
      }
    });
  }

  _buildPanel2Layout() {
    if (!this.panel2) return;

    const host = document.createElement('div');
    host.id = 'panel2Layout';
    host.className = 'panel3-layout';
    this.panel2.appendElement(host);

    const layout = this._getPanel3LayoutSpec();
    const { oscSize, gap, rowsPerColumn } = layout;

    const oscillatorSlots = [];
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 1, col: 0, row: i });
    }
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 7, col: 1, row: i });
    }

    const oscComponents = oscillatorSlots.map(slot => {
      const knobOptions = this._getPanel2KnobOptions(slot.index - 1);
      const osc = new SGME_Oscillator({
        id: `panel2-osc-${slot.index}`,
        title: `Osc ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset,
        knobSize: 40,
        knobRowOffsetY: -15,
        knobInnerPct: 76,
        knobOptions
      });
      const el = osc.createElement();
      host.appendChild(el);
      return { osc, element: el, slot };
    });

    const reserved = document.createElement('div');
    reserved.className = 'panel3-reserved-row';
    reserved.textContent = 'Reserved strip for future modules';
    host.appendChild(reserved);

    this._panel2LayoutData = {
      host,
      layout,
      oscillatorSlots,
      oscComponents,
      reserved
    };
    this._panel2Audio.nodes = new Array(oscComponents.length).fill(null);
    this._panel2LayoutRaf = null;
    this._reflowPanel2Layout();
  }

  _reflowPanel2Layout() {
    const data = this._panel2LayoutData;
    if (!data) return;

    if (this._panel2LayoutRaf) {
      cancelAnimationFrame(this._panel2LayoutRaf);
    }

    this._panel2LayoutRaf = requestAnimationFrame(() => {
      this._panel2LayoutRaf = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = -150, topOffset, rowsPerColumn } = layout;
      
      const paddingLeft = 0;
      const paddingRight = 0;
      
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;
      
      oscComponents.forEach(({ element, slot }, idx) => {
        const col = slot.col;
        const row = slot.row;
        const x = baseLeft + col * (columnWidth + gap.x);
        const y = baseTop + row * (oscSize.height + gap.y);
        element.style.transform = `translate(${x}px, ${y}px)`;
      });

      if (reserved) {
        const reservedTop = baseTop + blockHeight + gap.y;
        reserved.style.transform = `translate(${baseLeft}px, ${reservedTop}px)`;
        reserved.style.width = `${columnWidth * 2 + gap.x}px`;
      }
    });
  }

  _getPanel3LayoutSpec() {
    // Todos los números son ajustes fáciles para posteriores alineados a ojo.
    const oscSize = { width: 370, height: 110 };
    const padding = 6;
    // gap.x controla el aire en la parte central (entre las dos columnas).
    // gap.y controla el aire vertical entre filas.
    const gap = { x: 0, y: 0 };
    // Aire simétrico a ambos lados del bloque de osciladores (px).
    // Sube este valor para dejar margen entre columnas y bordes laterales del panel.
    const airOuter = 0;
    // Aire simétrico arriba/abajo (px) sobre el bloque completo (osciladores + franja reservada).
    const airOuterY = 0;
    const rowsPerColumn = 6; // 12 osciladores en 2 columnas
    const topOffset = 10;
    const knobGap = 8;
    const switchOffset = { leftPercent: 36, topPx: 6 };
    return {
      oscSize,
      padding,
      gap,
      airOuter,
      airOuterY,
      rowsPerColumn,
      topOffset,
      knobGap,
      switchOffset,
      reservedHeight: oscSize.height
    };
  }

  _buildPanel4Layout() {
    if (!this.panel4) return;

    const host = document.createElement('div');
    host.id = 'panel4Layout';
    host.className = 'panel3-layout';
    this.panel4.appendElement(host);

    const layout = this._getPanel3LayoutSpec();
    const { oscSize, gap, rowsPerColumn } = layout;

    const oscillatorSlots = [];
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 1, col: 0, row: i });
    }
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 7, col: 1, row: i });
    }

    const oscComponents = oscillatorSlots.map(slot => {
      const knobOptions = this._getPanel4KnobOptions(slot.index - 1);
      const osc = new SGME_Oscillator({
        id: `panel4-osc-${slot.index}`,
        title: `Osc ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset,
        knobSize: 40,
        knobRowOffsetY: -15,
        knobInnerPct: 76,
        knobOptions
      });
      const el = osc.createElement();
      host.appendChild(el);
      return { osc, element: el, slot };
    });

    const reserved = document.createElement('div');
    reserved.className = 'panel3-reserved-row';
    reserved.textContent = 'Reserved strip for future modules';
    host.appendChild(reserved);

    this._panel4LayoutData = {
      host,
      layout,
      oscillatorSlots,
      oscComponents,
      reserved
    };
    this._panel4Audio.nodes = new Array(oscComponents.length).fill(null);
    this._panel4LayoutRaf = null;
    this._reflowPanel4Layout();
  }

  _reflowPanel4Layout() {
    const data = this._panel4LayoutData;
    if (!data) return;

    if (this._panel4LayoutRaf) {
      cancelAnimationFrame(this._panel4LayoutRaf);
    }

    this._panel4LayoutRaf = requestAnimationFrame(() => {
      this._panel4LayoutRaf = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = -150, topOffset, rowsPerColumn } = layout;
      
      const paddingLeft = 0;
      const paddingRight = 0;
      
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;
      
      oscComponents.forEach(({ element, slot }, idx) => {
        const col = slot.col;
        const row = slot.row;
        const x = baseLeft + col * (columnWidth + gap.x);
        const y = baseTop + row * (oscSize.height + gap.y);
        element.style.transform = `translate(${x}px, ${y}px)`;
      });

      if (reserved) {
        const reservedTop = baseTop + blockHeight + gap.y;
        reserved.style.transform = `translate(${baseLeft}px, ${reservedTop}px)`;
        reserved.style.width = `${columnWidth * 2 + gap.x}px`;
      }
    });
  }

  _buildPanel3Layout() {
    if (!this.panel3) return;

    const host = document.createElement('div');
    host.id = 'panel3Layout';
    host.className = 'panel3-layout';
    this.panel3.appendElement(host);

    const layout = this._getPanel3LayoutSpec();
    const { oscSize, gap, rowsPerColumn } = layout;

    const oscillatorSlots = [];
    // Columna izquierda (1-6)
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 1, col: 0, row: i });
    }
    // Columna derecha (7-12)
    for (let i = 0; i < rowsPerColumn; i += 1) {
      oscillatorSlots.push({ index: i + 7, col: 1, row: i });
    }

    const oscComponents = oscillatorSlots.map(slot => {
      const knobOptions = this._getPanel3KnobOptions(slot.index - 1);
      const osc = new SGME_Oscillator({
        id: `sgme-osc-${slot.index}`,
        title: `Oscillator ${slot.index}`,
        size: oscSize,
        knobGap: layout.knobGap,
        switchOffset: layout.switchOffset,
        knobSize: 40,
        knobRowOffsetY: -15,
        knobInnerPct: 76,
        knobOptions
      });
      const el = osc.createElement();
      host.appendChild(el);
      return { osc, element: el, slot };
    });

    // Franja inferior reservada para otros 3 módulos (sin contenido todavía)
    const reserved = document.createElement('div');
    reserved.className = 'panel3-reserved-row';
    reserved.textContent = 'Reserved strip for future modules';
    host.appendChild(reserved);

    // Guardamos referencias para relayout dinámico
    this._panel3LayoutData = {
      host,
      layout,
      oscillatorSlots,
      oscComponents,
      reserved
    };
    this._panel3Audio.nodes = new Array(oscComponents.length).fill(null);
    this._panel3LayoutRaf = null;
    this._reflowPanel3Layout();
  }

  _reflowPanel3Layout() {
    const data = this._panel3LayoutData;
    if (!data) return;

    // Cancelar RAF pendiente (debouncing automático como en largeMatrix)
    if (this._panel3LayoutRaf) {
      cancelAnimationFrame(this._panel3LayoutRaf);
    }

    this._panel3LayoutRaf = requestAnimationFrame(() => {
      this._panel3LayoutRaf = null;

      const { host, layout, oscillatorSlots, oscComponents, reserved } = data;
      if (!host || !host.isConnected) return;

      const { oscSize, gap, airOuter = 0, airOuterY = -150, topOffset, rowsPerColumn } = layout;
      
      // Cachear padding - Panel 3 CSS tiene padding: 0 estático
      const paddingLeft = 0;
      const paddingRight = 0;
      
      // BATCH READS: leer todas las dimensiones primero para evitar layout thrashing
      const availableWidth = host.clientWidth;
      const availableHeight = host.clientHeight;
      
      // Cálculos de posicionamiento (no tocan el DOM)
      const columnWidth = oscSize.width;
      const blockWidth = columnWidth * 2 + gap.x + airOuter * 2;
      const baseLeft = Math.max(0, (availableWidth - blockWidth) / 2) + airOuter;
      
      const blockHeight = rowsPerColumn * (oscSize.height + gap.y) - gap.y;
      const totalHeight = blockHeight + layout.reservedHeight + gap.y;
      const usableHeight = availableHeight - airOuterY * 2;
      const baseTop = (usableHeight - totalHeight) / 2 + airOuterY + topOffset;
      
      // BATCH WRITES: escribir todos los estilos después de leer
      oscillatorSlots.forEach((slot, idx) => {
        const el = oscComponents[idx]?.element;
        if (!el) return;
        el.style.width = `${columnWidth}px`;
        const x = baseLeft + slot.col * (columnWidth + gap.x);
        const y = baseTop + slot.row * (oscSize.height + gap.y);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      });
      
      if (reserved) {
        const reservedTop = baseTop + blockHeight + gap.y;
        reserved.style.left = `${paddingLeft}px`;
        reserved.style.right = `${paddingRight}px`;
        reserved.style.top = `${reservedTop}px`;
        reserved.style.height = `${layout.reservedHeight}px`;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FUNCIONES UNIFICADAS DE AUDIO PARA OSCILADORES (paneles 1-4)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Crea un PeriodicWave para onda de pulso con el duty cycle dado.
   * @param {AudioContext} ctx - Contexto de audio
   * @param {number} duty - Duty cycle (0.01 a 0.99)
   * @param {number} harmonics - Número de armónicos (default 32)
   * @returns {PeriodicWave}
   */
  _createPulseWave(ctx, duty, harmonics = 32) {
    const d = Math.min(0.99, Math.max(0.01, duty));
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    return ctx.createPeriodicWave(real, imag);
  }

  /**
   * Crea un PeriodicWave para onda senoidal con simetría variable.
   * Simula el efecto de "rectificación variable" del Synthi 100.
   * 
   * La simetría controla la asimetría vertical de la onda:
   * - symmetry = 0   → vientres abajo (semicírculos negativos, picos arriba)
   * - symmetry = 0.5 → sine puro (onda senoidal perfecta)
   * - symmetry = 1   → vientres arriba (semicírculos positivos, picos abajo)
   * 
   * Matemáticamente: añadimos armónicos pares (2, 4, 6...) que deforman
   * la onda verticalmente. La amplitud y signo dependen de la simetría.
   * 
   * @param {AudioContext} ctx - Contexto de audio
   * @param {number} symmetry - Valor de simetría (0 a 1, neutro en 0.5)
   * @param {number} harmonics - Número de armónicos (default 16)
   * @returns {PeriodicWave}
   */
  _createAsymmetricSineWave(ctx, symmetry, harmonics = 16) {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    
    // Fundamental: sine puro (siempre presente)
    imag[1] = 1.0;
    
    // Calcular cuánta asimetría aplicar (-1 a +1, donde 0 = sine puro)
    // symmetry 0 → asymAmount -1 (vientres abajo)
    // symmetry 0.5 → asymAmount 0 (sine puro)
    // symmetry 1 → asymAmount +1 (vientres arriba)
    const asymAmount = (symmetry - 0.5) * 2;
    
    // Añadir armónicos pares para crear asimetría vertical
    // Los armónicos pares (2, 4, 6...) rompen la simetría de la onda
    for (let n = 2; n <= harmonics; n += 2) {
      // Amplitud decreciente con el número de armónico (1/n²)
      // Multiplicado por asymAmount para controlar intensidad y dirección
      imag[n] = asymAmount * (1.0 / (n * n));
    }
    
    return ctx.createPeriodicWave(real, imag);
  }

  /**
   * Obtiene o crea el objeto de audio para un panel dado.
   * @param {number} panelIndex - Índice del panel (1-4)
   * @returns {Object} Objeto con nodes[] y state[]
   */
  _getPanelAudio(panelIndex) {
    if (!this._panelAudios) {
      this._panelAudios = {};
    }
    if (!this._panelAudios[panelIndex]) {
      this._panelAudios[panelIndex] = { nodes: [], state: [] };
    }
    return this._panelAudios[panelIndex];
  }

  /**
   * Crea/obtiene los nodos de audio para un oscilador de cualquier panel.
   * @param {number} panelIndex - Índice del panel (1-4)
   * @param {number} oscIndex - Índice del oscilador dentro del panel
   * @returns {Object|null} Nodos de audio del oscilador
   */
  _ensurePanelNodes(panelIndex, oscIndex) {
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    const panelAudio = this._getPanelAudio(panelIndex);
    panelAudio.nodes = panelAudio.nodes || [];
    panelAudio.state = panelAudio.state || [];
    
    let entry = panelAudio.nodes[oscIndex];
    if (entry && entry.osc && entry.gain && entry.sawOsc && entry.sawGain && entry.triOsc && entry.triGain && entry.pulseOsc && entry.pulseGain && entry.sineSawOut && entry.triPulseOut) {
      return entry;
    }

    const state = this._getOrCreateOscState(panelAudio, oscIndex);

    // Oscilador senoidal con simetría variable (PeriodicWave)
    // Usamos PeriodicWave en lugar de type='sine' para permitir
    // modificar la simetría dinámicamente con setPeriodicWave()
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._createAsymmetricSineWave(ctx, state.sineSymmetry));
    osc.frequency.value = 10;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    
    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.value = 10;

    const sawGain = ctx.createGain();
    sawGain.gain.value = 0;
    sawOsc.connect(sawGain);

    const triOsc = ctx.createOscillator();
    triOsc.type = 'triangle';
    triOsc.frequency.value = 10;

    const triGain = ctx.createGain();
    triGain.gain.value = 0;
    triOsc.connect(triGain);

    const pulseOsc = ctx.createOscillator();
    pulseOsc.setPeriodicWave(this._createPulseWave(ctx, state.pulseWidth));
    pulseOsc.frequency.value = 10;

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0;
    pulseOsc.connect(pulseGain);

    // Salida 1: Sine + Saw (fila impar en panel5)
    const sineSawOut = ctx.createGain();
    sineSawOut.gain.value = 1.0;
    gain.connect(sineSawOut);
    sawGain.connect(sineSawOut);

    // Salida 2: Triangle + Pulse (fila par en panel5)
    const triPulseOut = ctx.createGain();
    triPulseOut.gain.value = 1.0;
    triGain.connect(triPulseOut);
    pulseGain.connect(triPulseOut);
    
    // Mantener moduleOut como alias de sineSawOut para compatibilidad legacy
    const moduleOut = sineSawOut;
    // Bypass a out1 solo para paneles 1, 2 y 4 (prueba de concepto).
    // Panel 3 se rutea exclusivamente por panel 5 y 6.
    if (panelIndex !== 3) {
      const bus1 = this.engine.getOutputBusNode(0);
      if (bus1) moduleOut.connect(bus1);
    }

    const startTime = ctx.currentTime + 0.01;
    const now = ctx.currentTime;
    
    if (Number.isFinite(state.freq)) {
      try {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(state.freq, now);
        sawOsc.frequency.cancelScheduledValues(now);
        sawOsc.frequency.setValueAtTime(state.freq, now);
        triOsc.frequency.cancelScheduledValues(now);
        triOsc.frequency.setValueAtTime(state.freq, now);
        pulseOsc.frequency.cancelScheduledValues(now);
        pulseOsc.frequency.setValueAtTime(state.freq, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.oscLevel)) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(state.oscLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.sawLevel)) {
      try {
        sawGain.gain.cancelScheduledValues(now);
        sawGain.gain.setValueAtTime(state.sawLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.triLevel)) {
      try {
        triGain.gain.cancelScheduledValues(now);
        triGain.gain.setValueAtTime(state.triLevel, now);
      } catch (error) {}
    }
    if (Number.isFinite(state.pulseLevel)) {
      try {
        pulseGain.gain.cancelScheduledValues(now);
        pulseGain.gain.setValueAtTime(state.pulseLevel, now);
      } catch (error) {}
    }
    try { 
      osc.start(startTime);
      sawOsc.start(startTime);
      triOsc.start(startTime);
      pulseOsc.start(startTime);
    } catch (error) {}

    entry = { osc, gain, sawOsc, sawGain, triOsc, triGain, pulseOsc, pulseGain, sineSawOut, triPulseOut, moduleOut, _freqInitialized: true };
    panelAudio.nodes[oscIndex] = entry;
    return entry;
  }

  /**
   * Actualiza el volumen del oscilador seno para cualquier panel.
   */
  _updatePanelOscVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.oscLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  /**
   * Actualiza el volumen del oscilador sierra para cualquier panel.
   */
  _updatePanelSawVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.sawLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.sawGain) return;
    const now = ctx.currentTime;
    node.sawGain.gain.cancelScheduledValues(now);
    node.sawGain.gain.setTargetAtTime(value, now, 0.03);
  }

  /**
   * Actualiza el volumen del oscilador triángulo para cualquier panel.
   */
  _updatePanelTriVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.triLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.triGain) return;
    const now = ctx.currentTime;
    node.triGain.gain.cancelScheduledValues(now);
    node.triGain.gain.setTargetAtTime(value, now, 0.03);
  }

  /**
   * Actualiza el volumen del oscilador pulso para cualquier panel.
   */
  _updatePanelPulseVolume(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.pulseLevel = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.pulseGain) return;
    const now = ctx.currentTime;
    node.pulseGain.gain.cancelScheduledValues(now);
    node.pulseGain.gain.setTargetAtTime(value, now, 0.03);
  }

  /**
   * Actualiza el ancho de pulso (pulse width) para cualquier panel.
   * @param {number} value - Valor de 0 a 1 (se mapea a 0.01-0.99)
   */
  _updatePanelPulseWidth(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    // Mapear 0-1 a 0.01-0.99 para evitar extremos
    const duty = 0.01 + value * 0.98;
    state.pulseWidth = duty;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.pulseOsc) return;
    // Regenerar el PeriodicWave con el nuevo duty cycle
    const wave = this._createPulseWave(ctx, duty);
    node.pulseOsc.setPeriodicWave(wave);
  }

  /**
   * Actualiza la simetría de la onda senoidal para cualquier panel.
   * 
   * Controla la asimetría vertical de la onda sine, simulando el
   * efecto del knob "Sine Symmetry" del Synthi 100.
   * 
   * @param {number} panelIndex - Índice del panel (1-4)
   * @param {number} oscIndex - Índice del oscilador
   * @param {number} value - Valor de 0 a 1 (0.5 = sine puro)
   */
  _updatePanelSineSymmetry(panelIndex, oscIndex, value) {
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.sineSymmetry = value;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.osc) return;
    // Regenerar el PeriodicWave con la nueva simetría
    const wave = this._createAsymmetricSineWave(ctx, value);
    node.osc.setPeriodicWave(wave);
  }

  /**
   * Mapeo cuadrático de frecuencia para mejor control en rangos bajos.
   * t² da más resolución en frecuencias bajas y menos en altas.
   */
  _mapFreqQuadratic(knobValue) {
    const min = 10;
    const max = 10000;
    const t = (knobValue - min) / (max - min);
    return t * t * (max - min) + min;
  }

  /**
   * Actualiza la frecuencia del oscilador para cualquier panel.
   */
  _updatePanelOscFreq(panelIndex, oscIndex, value) {
    const freq = this._mapFreqQuadratic(value);
    const panelAudio = this._getPanelAudio(panelIndex);
    const state = this._getOrCreateOscState(panelAudio, oscIndex);
    state.freq = freq;

    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanelNodes(panelIndex, oscIndex);
    if (!node || !node.osc) return;
    const now = ctx.currentTime;
    node.osc.frequency.cancelScheduledValues(now);
    if (!node._freqInitialized) {
      node.osc.frequency.setValueAtTime(freq, now);
      node._freqInitialized = true;
    } else {
      node.osc.frequency.setTargetAtTime(freq, now, 0.03);
    }
    if (node.sawOsc) {
      node.sawOsc.frequency.cancelScheduledValues(now);
      if (!node._freqInitialized) {
        node.sawOsc.frequency.setValueAtTime(freq, now);
      } else {
        node.sawOsc.frequency.setTargetAtTime(freq, now, 0.03);
      }
    }
    if (node.triOsc) {
      node.triOsc.frequency.cancelScheduledValues(now);
      if (!node._freqInitialized) {
        node.triOsc.frequency.setValueAtTime(freq, now);
      } else {
        node.triOsc.frequency.setTargetAtTime(freq, now, 0.03);
      }
    }
    if (node.pulseOsc) {
      node.pulseOsc.frequency.cancelScheduledValues(now);
      if (!node._freqInitialized) {
        node.pulseOsc.frequency.setValueAtTime(freq, now);
      } else {
        node.pulseOsc.frequency.setTargetAtTime(freq, now, 0.03);
      }
    }
  }

  /**
   * Genera las opciones de knobs para cualquier panel de osciladores.
   * @param {number} panelIndex - Índice del panel (1-4)
   * @param {number} oscIndex - Índice del oscilador
   */
  _getPanelKnobOptions(panelIndex, oscIndex) {
    const knobOptions = [];
    knobOptions[0] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanelPulseVolume(panelIndex, oscIndex, value)
    };
    knobOptions[1] = {
      min: 0,
      max: 1,
      initial: 0.5,
      onChange: value => this._updatePanelPulseWidth(panelIndex, oscIndex, value)
    };
    knobOptions[2] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanelOscVolume(panelIndex, oscIndex, value)
    };
    // Knob 3: Simetría del sine (0=vientres abajo, 0.5=sine puro, 1=vientres arriba)
    knobOptions[3] = {
      min: 0,
      max: 1,
      initial: 0.5,
      onChange: value => this._updatePanelSineSymmetry(panelIndex, oscIndex, value)
    };
    knobOptions[4] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanelTriVolume(panelIndex, oscIndex, value)
    };
    knobOptions[5] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanelSawVolume(panelIndex, oscIndex, value)
    };
    knobOptions[6] = {
      min: 10,
      max: 10000,
      initial: 10,
      pixelsForFullRange: 900,
      onChange: value => this._updatePanelOscFreq(panelIndex, oscIndex, value)
    };
    return knobOptions;
  }

  // ---- Wrappers de compatibilidad para funciones unificadas ----

  _getPanel1KnobOptions(oscIndex) { return this._getPanelKnobOptions(1, oscIndex); }
  _getPanel2KnobOptions(oscIndex) { return this._getPanelKnobOptions(2, oscIndex); }
  _getPanel3KnobOptions(oscIndex) { return this._getPanelKnobOptions(3, oscIndex); }
  _getPanel4KnobOptions(oscIndex) { return this._getPanelKnobOptions(4, oscIndex); }

  _ensurePanel1Nodes(index) { return this._ensurePanelNodes(1, index); }
  _ensurePanel2Nodes(index) { return this._ensurePanelNodes(2, index); }
  _ensurePanel3Nodes(index) { return this._ensurePanelNodes(3, index); }
  _ensurePanel4Nodes(index) { return this._ensurePanelNodes(4, index); }

  _updatePanel1OscVolume(index, value) { this._updatePanelOscVolume(1, index, value); }
  _updatePanel2OscVolume(index, value) { this._updatePanelOscVolume(2, index, value); }
  _updatePanel3OscVolume(index, value) { this._updatePanelOscVolume(3, index, value); }
  _updatePanel4OscVolume(index, value) { this._updatePanelOscVolume(4, index, value); }

  _updatePanel1SawVolume(index, value) { this._updatePanelSawVolume(1, index, value); }
  _updatePanel2SawVolume(index, value) { this._updatePanelSawVolume(2, index, value); }
  _updatePanel3SawVolume(index, value) { this._updatePanelSawVolume(3, index, value); }
  _updatePanel4SawVolume(index, value) { this._updatePanelSawVolume(4, index, value); }

  _updatePanel1TriVolume(index, value) { this._updatePanelTriVolume(1, index, value); }
  _updatePanel2TriVolume(index, value) { this._updatePanelTriVolume(2, index, value); }
  _updatePanel3TriVolume(index, value) { this._updatePanelTriVolume(3, index, value); }
  _updatePanel4TriVolume(index, value) { this._updatePanelTriVolume(4, index, value); }

  _updatePanel1PulseVolume(index, value) { this._updatePanelPulseVolume(1, index, value); }
  _updatePanel2PulseVolume(index, value) { this._updatePanelPulseVolume(2, index, value); }
  _updatePanel3PulseVolume(index, value) { this._updatePanelPulseVolume(3, index, value); }
  _updatePanel4PulseVolume(index, value) { this._updatePanelPulseVolume(4, index, value); }

  _updatePanel1PulseWidth(index, value) { this._updatePanelPulseWidth(1, index, value); }
  _updatePanel2PulseWidth(index, value) { this._updatePanelPulseWidth(2, index, value); }
  _updatePanel3PulseWidth(index, value) { this._updatePanelPulseWidth(3, index, value); }
  _updatePanel4PulseWidth(index, value) { this._updatePanelPulseWidth(4, index, value); }

  _updatePanel1SineSymmetry(index, value) { this._updatePanelSineSymmetry(1, index, value); }
  _updatePanel2SineSymmetry(index, value) { this._updatePanelSineSymmetry(2, index, value); }
  _updatePanel3SineSymmetry(index, value) { this._updatePanelSineSymmetry(3, index, value); }
  _updatePanel4SineSymmetry(index, value) { this._updatePanelSineSymmetry(4, index, value); }

  _updatePanel1OscFreq(index, value) { this._updatePanelOscFreq(1, index, value); }
  _updatePanel2OscFreq(index, value) { this._updatePanelOscFreq(2, index, value); }
  _updatePanel3OscFreq(index, value) { this._updatePanelOscFreq(3, index, value); }
  _updatePanel4OscFreq(index, value) { this._updatePanelOscFreq(4, index, value); }

  _compilePanelBlueprintMappings(blueprint) {
    const rowBase = blueprint?.grid?.coordSystem?.rowBase ?? 67;
    const colBase = blueprint?.grid?.coordSystem?.colBase ?? 1;

    const rows = blueprint?.grid?.rows ?? 63;
    const cols = blueprint?.grid?.cols ?? 67;

    const hiddenRows0 = Array.isArray(blueprint?.ui?.hiddenRows0)
      ? blueprint.ui.hiddenRows0.filter(Number.isFinite)
      : (blueprint?.ui?.hiddenRowsSynth || [])
        .filter(Number.isFinite)
        .map(r => r - rowBase)
        .filter(r => r >= 0);

    const hiddenCols0 = Array.isArray(blueprint?.ui?.hiddenCols0)
      ? blueprint.ui.hiddenCols0.filter(Number.isFinite)
      : (blueprint?.ui?.hiddenColsSynth || [])
        .filter(Number.isFinite)
        .map(c => c - colBase)
        .filter(c => c >= 0);

    const hiddenRowSet = new Set(hiddenRows0);
    const hiddenColSet = new Set(hiddenCols0);

    const visibleRowIndices = [];
    for (let r = 0; r < rows; r += 1) {
      if (hiddenRowSet.has(r)) continue;
      visibleRowIndices.push(r);
    }

    const synthRowToPhysicalRowIndex = (rowSynth) => {
      const ordinal = rowSynth - rowBase;
      if (!Number.isFinite(ordinal) || ordinal < 0) return null;
      return visibleRowIndices[ordinal] ?? null;
    };

    const synthColToPhysicalColIndex = (colSynth) => {
      // Columnas: mantenemos numeración física 1-based (incluye huecos),
      // porque el usuario ya validó Out 1..8 empezando en col 37.
      const colIndex = colSynth - colBase;
      if (!Number.isFinite(colIndex) || colIndex < 0) return null;
      return colIndex;
    };

    const rowMap = new Map();
    const channelMap = new Map();
    for (const entry of blueprint?.sources || []) {
      const rowSynth = entry?.rowSynth;
      const oscIndex = entry?.source?.oscIndex;
      const channelId = entry?.source?.channelId || 'sineSaw';
      if (!Number.isFinite(rowSynth) || !Number.isFinite(oscIndex)) continue;
      const rowIndex = synthRowToPhysicalRowIndex(rowSynth);
      if (rowIndex == null) continue;
      rowMap.set(rowIndex, oscIndex);
      channelMap.set(rowIndex, channelId);
    }

    const colMap = new Map();
    for (const entry of blueprint?.destinations || []) {
      const colSynth = entry?.colSynth;
      const bus = entry?.dest?.bus;
      if (!Number.isFinite(colSynth) || !Number.isFinite(bus)) continue;
      const busIndex = bus - 1;
      if (busIndex < 0) continue;
      const colIndex = synthColToPhysicalColIndex(colSynth);
      if (colIndex == null) continue;
      colMap.set(colIndex, busIndex);
    }

    return { rowMap, colMap, channelMap, hiddenRows: hiddenRows0, hiddenCols: hiddenCols0, rowBase, colBase };
  }

  _getPanel5RowMap() {
    return this._compilePanelBlueprintMappings(panel5AudioBlueprint).rowMap;
  }

  _getPanel5ColMap() {
    return this._compilePanelBlueprintMappings(panel5AudioBlueprint).colMap;
  }

  _setupPanel5AudioRouting() {
    this._panel3Routing = this._panel3Routing || { connections: {}, rowMap: null, colMap: null, channelMap: null };
    this._panel3Routing.connections = {};
    const mappings = this._compilePanelBlueprintMappings(panel5AudioBlueprint);
    this._panel3Routing.rowMap = mappings.rowMap;
    this._panel3Routing.colMap = mappings.colMap;
    this._panel3Routing.channelMap = mappings.channelMap;
    // Pines no válidos (huecos del panel) se deshabilitan en la matriz.
    // Nota: el routing usa índices físicos (rowIndex/colIndex), así que esto NO reindexa nada.
    this._panel3Routing.hiddenCols = mappings.hiddenCols;

    if (this.largeMatrixAudio && this.largeMatrixAudio.setToggleHandler) {
      this.largeMatrixAudio.setToggleHandler((rowIndex, colIndex, nextActive) =>
        this._handlePanel5AudioToggle(rowIndex, colIndex, nextActive)
      );
    }
  }

  _handlePanel5AudioToggle(rowIndex, colIndex, activate) {
    const oscIndex = this._panel3Routing?.rowMap?.get(rowIndex);
    const busIndex = this._panel3Routing?.colMap?.get(colIndex);
    const channelId = this._panel3Routing?.channelMap?.get(rowIndex) || 'sineSaw';
    const key = `${rowIndex}:${colIndex}`;

    // Si no mapea a nuestras fuentes/destinos, dejar que el UI siga sin conexiones de audio.
    if (oscIndex == null || busIndex == null) return true;

    if (activate) {
      this.ensureAudio();
      const ctx = this.engine.audioCtx;
      const src = this._ensurePanel3Nodes(oscIndex);
      // Seleccionar nodo de salida según el canal: sineSaw o triPulse
      const outNode = channelId === 'triPulse' ? src?.triPulseOut : src?.sineSawOut;
      const busNode = this.engine.getOutputBusNode(busIndex);
      if (!ctx || !outNode || !busNode) return false;

      // Importante: si el usuario ajustó la frecuencia antes de rutear, puede quedar
      // una rampa pendiente por setTargetAtTime. Al hacer audible el módulo por primera vez,
      // cancelamos y fijamos inmediatamente al valor actual para evitar glissando.
      const state = this._panel3Audio?.state?.[oscIndex];
      this._applyOscStateImmediate(src, state, ctx);

      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      outNode.connect(gain);
      gain.connect(busNode);
      this._panel3Routing.connections[key] = gain;
      return true;
    }

    const conn = this._panel3Routing.connections?.[key];
    if (conn) {
      try { conn.disconnect(); } catch (error) {}
      delete this._panel3Routing.connections[key];
    }

    return true;
  }

  _getVisibleColNumber(colIndex) {
    return colIndex + 1;
  }

  _buildLargeMatrices() {
    // Panel 5 y 6: matrices grandes idénticas en tamaño y comportamiento básico
    this.panel5MatrixEl = this.panel5.addSection({ id: 'panel5Matrix', type: 'matrix' });
    this.panel6MatrixEl = this.panel6.addSection({ id: 'panel6Matrix', type: 'matrix' });

    const LARGE_MATRIX_FRAME_PANEL5 = panel5AudioBlueprint?.ui?.frame || {
      squarePercent: 90,
      translateSteps: { x: 5.1, y: 0 },
      marginsSteps: { left: -7.47, right: -3, top: 4.7, bottom: 2.7 },
      // MODO AJUSTE: permite salirse del panel (útil para alinear a ojo)
      clip: true, // false para ajuste visual
      overflowPercent: { left: 25, top: 25, right: 200, bottom: 80 },
      // Permite que los márgenes negativos expandan más allá del 100%
      maxSizePercent: 300
    };

    const LARGE_MATRIX_FRAME_PANEL6 = panel6ControlBlueprint?.ui?.frame || LARGE_MATRIX_FRAME_PANEL5;

    // Modo ajuste visual (evitar recortes por CSS durante el ajuste)
    if (LARGE_MATRIX_FRAME_PANEL5.clip === false) {
      this.panel5?.element?.classList.add('matrix-adjust');
      this.panel6?.element?.classList.add('matrix-adjust');
    } else {
      this.panel5?.element?.classList.remove('matrix-adjust');
      this.panel6?.element?.classList.remove('matrix-adjust');
    }

    const { hiddenCols: HIDDEN_COLS_PANEL5, hiddenRows: HIDDEN_ROWS_PANEL5 } =
      this._compilePanelBlueprintMappings(panel5AudioBlueprint);

    const { hiddenCols: HIDDEN_COLS_PANEL6, hiddenRows: HIDDEN_ROWS_PANEL6 } =
      this._compilePanelBlueprintMappings(panel6ControlBlueprint);

    // Panel 5 (audio): todas las columnas clickables.
    this.largeMatrixAudio = new LargeMatrix(this.panel5MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL5,
      hiddenCols: HIDDEN_COLS_PANEL5,
      hiddenRows: HIDDEN_ROWS_PANEL5
    });

    // Panel 6 (control) sin columnas ocultas por ahora, pero con la misma interfaz para reutilizar más adelante
    this.largeMatrixControl = new LargeMatrix(this.panel6MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME_PANEL6,
      hiddenCols: HIDDEN_COLS_PANEL6,
      hiddenRows: HIDDEN_ROWS_PANEL6
    });

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
      this._reflowPanel1Layout();
      this._reflowPanel2Layout();
      this._reflowPanel3Layout();
      this._reflowPanel4Layout();
      this._syncPanelHeights();

      // Paso 1 (canvas): repintar cuando el layout ya está estable.
      renderCanvasBgPanels();
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

  // Estrategia de render universal (todos los navegadores):
  // - Reposo: transform:scale (preparado para zoom fluido)
  // - Durante zoom: transform:scale (sin cambio = sin delay)
  // - Al terminar: brevemente CSS zoom (re-rasteriza), luego vuelve a transform:scale
  // Esto unifica el comportamiento y prepara para posibles cambios en políticas de rasterizado.
  // El usuario puede desactivar el modo nitidez si prefiere más fluidez.
  if (typeof window.__synthSharpModeEnabled === 'undefined') {
    window.__synthSharpModeEnabled = true;
  }
  // Flag para redibujado transitorio (se gestiona desde la quickbar)
  // window.__synthSharpTransition = { active: bool, lastScale: number }
  let rasterizeTimer = null;
  const RASTERIZE_DELAY_MS = 150;

  function cancelRasterize() {
    if (rasterizeTimer) {
      clearTimeout(rasterizeTimer);
      rasterizeTimer = null;
    }
  }

  function scheduleRasterize() {
    // Si modo nitidez está activo, redibujar siempre
    // Si está desactivado pero en transición (zoom out), redibujar hasta zoom mínimo
    const minScale = getMinScale();
    const isAtMinZoom = scale <= minScale + 0.01;
    const transition = window.__synthSharpTransition;
    
    if (transition && transition.active) {
      const isZoomingOut = transition.lastScale !== null && scale < transition.lastScale;
      transition.lastScale = scale;
      
      if (isAtMinZoom) {
        // Llegamos al zoom mínimo: un último redibujado y fin de transición
        transition.active = false;
        transition.lastScale = null;
      } else if (!isZoomingOut) {
        // Si está haciendo zoom in o no hay cambio, no redibujar
        return;
      }
      // Si está haciendo zoom out, continuar redibujando
    } else if (!window.__synthSharpModeEnabled) {
      return;
    }
    
    cancelRasterize();
    rasterizeTimer = setTimeout(() => {
      rasterizeTimer = null;
      // Paso 1: Cambiar a CSS zoom para forzar re-rasterización
      inner.style.zoom = scale;
      inner.style.transform = `translate3d(${offsetX / scale}px, ${offsetY / scale}px, 0)`;
      
      // Paso 2: Esperar a que el navegador re-rasterice, luego volver a transform:scale
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Volver a transform:scale (preparado para el próximo zoom)
          inner.style.zoom = '';
          inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
        });
      });
    }, RASTERIZE_DELAY_MS);
  }

  let scale = 1;
  let maxScale = 6.0;
  const VIEWPORT_MARGIN = 0.95; // 95% del ancho disponible (margen de seguridad del 5%)
  
  // Función para calcular el zoom mínimo basado en el ancho actual del viewport
  function getMinScale() {
    if (!metrics.outerWidth || !metrics.outerHeight || !metrics.contentWidth || !metrics.contentHeight) return 0.1;
    const scaleX = (metrics.outerWidth * VIEWPORT_MARGIN) / metrics.contentWidth;
    const scaleY = (metrics.outerHeight * VIEWPORT_MARGIN) / metrics.contentHeight;
    return Math.min(scaleX, scaleY);
  }

  // Exponer estado de navegación para que la quickbar pueda acceder
  window.__synthNavState = {
    get scale() { return scale; },
    getMinScale
  };

  // Estado de zoom a panel específico
  let focusedPanelId = null;

  /**
   * Anima el zoom/pan hacia un panel específico o vuelve a vista general.
   * @param {string|null} panelId - ID del panel a enfocar, o null para vista general
   * @param {number} duration - Duración de la animación en ms (default 1000)
   */
  function animateToPanel(panelId, duration = 1000) {
    // Forzar refresco de métricas (el viewport puede haber cambiado a fullscreen)
    metricsDirty = true;
    refreshMetrics();
    
    // Usar visualViewport para obtener dimensiones reales del viewport visible
    // (especialmente importante en móviles/tablets donde el teclado o barras pueden reducir el área)
    const vv = window.visualViewport;
    const currentOuterWidth = vv ? vv.width : outer.clientWidth;
    const currentOuterHeight = vv ? vv.height : outer.clientHeight;
    
    const startScale = scale;
    const startOffsetX = offsetX;
    const startOffsetY = offsetY;
    
    let targetScale, targetOffsetX, targetOffsetY;
    
    if (panelId) {
      // Zoom al panel específico
      const panelEl = document.getElementById(panelId);
      if (!panelEl) return;
      
      const panelRect = panelEl.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      
      // Posición del panel relativa al inner (en coordenadas sin escalar)
      const panelLeft = (panelRect.left - innerRect.left) / scale;
      const panelTop = (panelRect.top - innerRect.top) / scale;
      const panelWidth = panelRect.width / scale;
      const panelHeight = panelRect.height / scale;
      
      // Padding híbrido: base fija + porcentaje del eje menor
      // Esto garantiza visibilidad en pantallas pequeñas y proporcionalidad en grandes
      const MIN_PADDING = 8; // px mínimo de margen
      const PADDING_RATIO = 0.01; // 2% del eje menor
      const extraPadding = Math.min(currentOuterWidth, currentOuterHeight) * PADDING_RATIO;
      const totalPadding = MIN_PADDING + extraPadding;
      
      const availableW = Math.max(100, currentOuterWidth - totalPadding * 2);
      const availableH = Math.max(100, currentOuterHeight - totalPadding * 2);
      const scaleX = availableW / panelWidth;
      const scaleY = availableH / panelHeight;
      targetScale = Math.min(scaleX, scaleY, maxScale);
      
      // Centrar el panel en el viewport (usar dimensiones actuales)
      const scaledPanelWidth = panelWidth * targetScale;
      const scaledPanelHeight = panelHeight * targetScale;
      targetOffsetX = (currentOuterWidth - scaledPanelWidth) / 2 - panelLeft * targetScale;
      targetOffsetY = (currentOuterHeight - scaledPanelHeight) / 2 - panelTop * targetScale;
      
      focusedPanelId = panelId;
    } else {
      // Volver a vista general (zoom mínimo, centrado)
      targetScale = getMinScale();
      const finalWidth = metrics.contentWidth * targetScale;
      const finalHeight = metrics.contentHeight * targetScale;
      targetOffsetX = (metrics.outerWidth - finalWidth) / 2;
      targetOffsetY = (metrics.outerHeight - finalHeight) / 2;
      
      focusedPanelId = null;
    }
    
    // Animación con easing
    const startTime = performance.now();
    
    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    function animateStep(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);
      
      scale = startScale + (targetScale - startScale) * eased;
      offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
      offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
      
      render();
      
      if (progress < 1) {
        requestAnimationFrame(animateStep);
      } else {
        // Animación completa
        scheduleLowZoomUpdate();
        scheduleRasterize();
        if (typeof updatePanelZoomButtons === 'function') {
          updatePanelZoomButtons();
        }
      }
    }
    
    cancelRasterize();
    requestAnimationFrame(animateStep);
  }
  
  // Exponer para uso externo
  window.__synthAnimateToPanel = animateToPanel;
  window.__synthGetFocusedPanel = () => focusedPanelId;
  window.__synthResetFocusedPanel = () => {
    focusedPanelId = null;
    if (typeof updatePanelZoomButtons === 'function') {
      updatePanelZoomButtons();
    }
  };

  const LOW_ZOOM_ENTER = 0.45;
  const LOW_ZOOM_EXIT = 0.7; // histéresis amplia para evitar saltos
  const LOW_ZOOM_CLASS = 'is-low-zoom';
  const LOW_ZOOM_EXIT_DELAY_MS = 500; // delay generoso para evitar salto al volver a hi-zoom
  const wheelPanFactor = 0.35; // ajuste fino para gestos de dos dedos
  const wheelPanSmoothing = 0.92; // suaviza el gesto en trackpads
  const MIN_VISIBLE_STRIP_PX = 32; // franja mínima de contenido que debe seguir visible
  const PINCH_SCALE_EPSILON = 0.002; // evita que el pellizco dispare zoom por ruido
  const MULTI_PAN_EPSILON = 0.05; // ignora micro movimientos en desplazamiento multitáctil
  let clampDisabled = false;
  let offsetX = 0;
  let offsetY = 0;
  let userHasAdjustedView = false;
  let lastViewportWidth = 0;

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
  // Guardamos {pointerId -> isInteractive} para saber si está en un control
  const activeTouchMap = new Map();

  function isInteractiveTargetCapture(el) {
    if (!el) return false;
    const selector = '.knob, .knob-inner, .knob-cap, .pin-btn, .joystick-pad, .joystick-handle, .output-fader, .slider, .fader, .switch, .toggle, [data-prevent-pan="true"]';
    return !!el.closest(selector);
  }

  function updateNavGestureFlagFromCapture() {
    // Solo activar navegación si hay >=2 toques Y al menos uno NO está en control interactivo
    let totalTouches = 0;
    let nonInteractiveTouches = 0;
    activeTouchMap.forEach((isInteractive) => {
      totalTouches++;
      if (!isInteractive) nonInteractiveTouches++;
    });
    const navActive = totalTouches >= 2 && nonInteractiveTouches >= 1;
    window.__synthNavGestureActive = navActive;
    outer.classList.toggle('is-gesturing', navActive);
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

    // Clamp permisivo: permite mover el canvas libremente dejando una franja visible.
    // Ahora se usa tanto en móvil/tablet como en desktop para poder centrar paneles
    // laterales en pantalla.
    const allowOverscroll = true;
    // Para volver al comportamiento restrictivo en desktop, descomentar:
    // const allowOverscroll = isCoarsePointer;

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

  let lowZoomActive = false;
  let lowZoomIdleTimer = null;

  function computeLowZoomState() {
    return lowZoomActive
      ? scale < LOW_ZOOM_EXIT
      : scale < LOW_ZOOM_ENTER;
  }

  function applyLowZoomMode(nextLowZoom) {
    if (nextLowZoom === lowZoomActive) return;
    lowZoomActive = nextLowZoom;
    inner.classList.toggle(LOW_ZOOM_CLASS, lowZoomActive);
  }

  function scheduleLowZoomUpdate() {
    const nextLowZoom = computeLowZoomState();

    // Si vuelve a low-zoom, aplicamos inmediato y cancelamos cualquier salida pendiente.
    if (nextLowZoom) {
      if (lowZoomIdleTimer) {
        clearTimeout(lowZoomIdleTimer);
        lowZoomIdleTimer = null;
      }
      applyLowZoomMode(true);
      return;
    }

    // Si ya estamos fuera de low-zoom, no hay nada que hacer.
    if (!lowZoomActive) return;

    // Estamos en low-zoom y toca salir: retrasamos la salida para evitar salto.
    if (lowZoomIdleTimer) {
      clearTimeout(lowZoomIdleTimer);
      lowZoomIdleTimer = null;
    }

    lowZoomIdleTimer = setTimeout(() => {
      lowZoomIdleTimer = null;
      // Revalidar por si hubo cambios durante el delay.
      const stillWantsLowZoom = computeLowZoomState();
      if (!stillWantsLowZoom) {
        applyLowZoomMode(false);
      }
    }, LOW_ZOOM_EXIT_DELAY_MS);
  }

  function render() {
    if (metricsDirty) {
      refreshMetrics();
    }
    clampOffsets();

    // En algunos móviles, el checkerboarding aparece con offsets subpíxel.
    // Snapeamos el translate a la rejilla de píxel (DPR) para minimizar seams.
    const dpr = window.devicePixelRatio || 1;
    if (dpr > 0) {
      offsetX = Math.round(offsetX * dpr) / dpr;
      offsetY = Math.round(offsetY * dpr) / dpr;
    }

    // Fondo canvas (solo móvil/coarse pointer): dibujar en coordenadas de pantalla
    // para evitar "lagunas" por bitmaps escalados con transform.
    // Importante: en modo canvas hacemos la actualización atómica. Si el canvas
    // no llega a dibujar este frame (assets no listos), no movemos el DOM para
    // evitar separación visual por capas.
    const canvasOk = renderCanvasBgViewport(scale, offsetX, offsetY);
    if (!shouldUseCanvasBg() || canvasOk) {
      // Siempre usamos transform:scale (preparado para zoom sin delay).
      // El re-rasterizado ocurre en scheduleRasterize() después del gesto.
      inner.style.zoom = '';
      inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
      window.__synthViewTransform = { scale, offsetX, offsetY };
    }

    // Móvil: aplicar is-low-zoom inmediatamente para evitar "etapa irresponsive"
    if (isCoarsePointer) {
      // Mantener entrada inmediata, pero con delay al salir de low-zoom.
      scheduleLowZoomUpdate();
    }
  }

  refreshMetrics();
  lastViewportWidth = metrics.outerWidth;
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
    
    // Ajustar al ancho del viewport con margen de seguridad
    const minScale = getMinScale();
    const targetScale = minScale;
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
    const isInteractive = isInteractiveTargetCapture(ev.target);
    activeTouchMap.set(ev.pointerId, isInteractive);
    updateNavGestureFlagFromCapture();
  }, true);

  const handleTouchEndCapture = ev => {
    if (ev.pointerType !== 'touch') return;
    activeTouchMap.delete(ev.pointerId);
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
    const minScale = getMinScale();
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
      cancelRasterize(); // cancelar re-rasterización pendiente
      const cx = ev.clientX - (metrics.outerLeft || 0);
      const cy = ev.clientY - (metrics.outerTop || 0);
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const minScale = getMinScale();
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      adjustOffsetsForZoom(cx, cy, newScale);
      markUserAdjusted();
      scheduleRasterize(); // re-rasterizar cuando termine
      if (!isCoarsePointer) {
        scheduleLowZoomUpdate();
      }
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
  let didMove = false; // true si hubo movimiento real durante el gesto

  // Pinch-zoom con dos dedos (móvil/tablet), centrado en el punto medio
  const pointers = new Map();
  let lastDist = null;
  let lastCentroid = null;
  let needsSnapOnEnd = false;
  let lastPinchZoomAnchor = null;
  let didPinchZoom = false; // true si hubo cambio de zoom real durante pinch

  // Flag global de "gesto de navegación" activo (dos o más toques táctiles en zona no-interactiva)
  let activeTouchCount = 0;
  let navGestureActive = false;
  window.__synthNavGestureActive = false;

  function recomputeNavGestureState() {
    let touchCount = 0;
    let nonInteractiveCount = 0;
    pointers.forEach(p => {
      if (p && p.pointerType === 'touch') {
        touchCount += 1;
        if (!p.isInteractive) nonInteractiveCount++;
      }
    });
    activeTouchCount = touchCount;
    // Solo activar navegación si hay >=2 toques Y al menos uno NO está en control
    const next = touchCount >= 2 && nonInteractiveCount >= 1;
    if (next !== navGestureActive) {
      navGestureActive = next;
      window.__synthNavGestureActive = navGestureActive;
      outer.classList.toggle('is-gesturing', navGestureActive);
      
      // Anticipar cambio de modo: al poner 2 dedos, cancelar re-rasterización
      // Cancelar re-rasterización pendiente al iniciar gesto de 2 dedos
      // para que no interfiera con el zoom.
      if (navGestureActive) {
        cancelRasterize();
      }
    }
  }

  outer.addEventListener('pointerdown', ev => {
    const isInteractive = isInteractiveTarget(ev.target);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType, isInteractive });
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
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, pointerType: prev?.pointerType, isInteractive: prev?.isInteractive });

    // Solo hacer pinch-zoom si hay gesto de navegación activo (no todos los toques en controles)
    if (pointers.size === 2 && navGestureActive) {
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
        // Estabilizar pinch con dedos muy juntos: cuando dist es pequeño,
        // cualquier ruido en píxeles produce un ratio enorme. Usamos un
        // denominador mínimo para suavizar ese caso sin afectar zoom normal.
        // 180px ≈ 1.5-2cm en pantallas típicas: por debajo, el zoom se estabiliza.
        const MIN_DIST_FOR_STABLE_RATIO = 180;
        const effectiveLastDist = Math.max(lastDist, MIN_DIST_FOR_STABLE_RATIO);
        const effectiveDist = Math.max(dist, MIN_DIST_FOR_STABLE_RATIO);
        const zoomFactor = effectiveDist / effectiveLastDist;

        // Clamp: evita saltos extremos por un frame ruidoso (±12% max por evento).
        const MAX_ZOOM_DELTA = 0.12;
        const clampedFactor = Math.max(1 - MAX_ZOOM_DELTA, Math.min(1 + MAX_ZOOM_DELTA, zoomFactor));

        if (!navLocks.zoomLocked) {
          if (Math.abs(clampedFactor - 1) > PINCH_SCALE_EPSILON) {
            cancelRasterize(); // cancelar re-rasterización pendiente durante pinch
            const minScale = getMinScale();
            const newScale = Math.min(maxScale, Math.max(minScale, scale * clampedFactor));
            // Importante: durante el pinch NO hacemos snap (si no, parece que no hace zoom).
            adjustOffsetsForZoom(zoomAnchorX, zoomAnchorY, newScale, { snap: false });
            didZoom = true;
          }
        }
      }

      lastDist = dist;
      lastCentroid = { x: centroidClientX, y: centroidClientY };

      if (didZoom || transformDirty) {
        if (didZoom) didPinchZoom = true;
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
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        didMove = true;
        offsetX += dx;
        offsetY += dy;
        requestRender();
        markUserAdjusted();
      }
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
      didMove = false;
    }

    if (pointers.size === 0) {
      // Guardar si hubo zoom ANTES de resetear el flag
      const needsRasterize = didPinchZoom;
      didPinchZoom = false;
      
      // No aplicamos snap de escala al final del pinch: evita micro-zoom
      // perceptible al soltar el último dedo.
      needsSnapOnEnd = false;
      lastPinchZoomAnchor = null;
      scheduleLowZoomUpdate('pinch');
      // Solo re-rasterizar si hubo cambio de zoom, no para pan
      if (needsRasterize) {
        scheduleRasterize();
      }
      requestRender();

      if (ev.pointerType === 'touch') {
        requestAnimationFrame(() => renderCanvasBgPanels());
      }
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
      scheduleLowZoomUpdate('pinch');
      requestRender();

      if (ev.pointerType === 'touch') {
        requestAnimationFrame(() => renderCanvasBgPanels());
      }
    }
  });

  // Prevenir menú contextual en móviles (long press)
  // En el futuro se puede usar para mostrar menú propio
  outer.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    return false;
  });

  // Al redimensionar => recalcular métricas y ajustar zoom proporcionalmente
  // Nota: durante pinch/zoom táctil puede dispararse resize repetidamente.
  // Lo debounceamos y evitamos trabajo mientras hay gesto multitáctil activo.
  let navResizeTimer = null;
  const handleNavResize = () => {
    const oldWidth = lastViewportWidth;
    
    // Guardar métricas y estado actual ANTES de refrescar
    const oldOuterWidth = metrics.outerWidth;
    const oldOuterHeight = metrics.outerHeight;
    const oldScale = scale;
    const oldOffsetX = offsetX;
    const oldOffsetY = offsetY;
    
    // Guardar el punto central del mundo ANTES de cambiar nada
    const worldCenterX = oldOuterWidth > 0 ? (oldOuterWidth / 2 - oldOffsetX) / oldScale : 0;
    const worldCenterY = oldOuterHeight > 0 ? (oldOuterHeight / 2 - oldOffsetY) / oldScale : 0;
    
    refreshMetrics();
    const newWidth = metrics.outerWidth;
    const newHeight = metrics.outerHeight;
    lastViewportWidth = newWidth;
    
    // Si cambió el ancho del viewport, ajustar el zoom proporcionalmente
    if (oldWidth > 0 && newWidth > 0 && Math.abs(newWidth - oldWidth) > 10) {
      const widthRatio = newWidth / oldWidth;
      const newScale = oldScale * widthRatio;
      const minScale = getMinScale();
      scale = Math.min(maxScale, Math.max(minScale, snapScale(newScale)));
      
      // Recalcular offsets para mantener el mismo punto central visible
      offsetX = (newWidth / 2) - worldCenterX * scale;
      offsetY = (newHeight / 2) - worldCenterY * scale;

      // Mantener el centro visible tras el resize
      // (clamp/render se aplican abajo)
    }

    refreshMetrics();
    clampOffsets();
    requestRender();

    // En primera carga/si el usuario no ajustó, seguimos haciendo fit.
    if (userHasAdjustedView) return;
    
    // Al hacer fit, resetear panel enfocado porque volvemos a vista general
    if (window.__synthResetFocusedPanel) {
      window.__synthResetFocusedPanel();
    }
    fitContentToViewport();
  };

  window.addEventListener('resize', () => {
    if (navResizeTimer) clearTimeout(navResizeTimer);
    navResizeTimer = setTimeout(() => {
      navResizeTimer = null;
      if (window.__synthNavGestureActive) {
        navResizeTimer = setTimeout(() => {
          navResizeTimer = null;
          if (!window.__synthNavGestureActive) handleNavResize();
        }, 180);
        return;
      }
      handleNavResize();
    }, 90);
  }, { passive: true });
})();

/**
 * Añade botones de zoom a todos los paneles principales.
 */
function setupPanelZoomButtons() {
  const PANEL_IDS = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
  const ICON_SPRITE = './assets/icons/ui-sprite.svg';
  
  const iconSvg = symbolId => `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <use href="${ICON_SPRITE}#${symbolId}"></use>
    </svg>
  `;
  
  PANEL_IDS.forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-zoom-btn';
    btn.setAttribute('aria-label', 'Enfocar panel');
    btn.setAttribute('data-panel-id', panelId);
    btn.innerHTML = iconSvg('ti-focus-2');
    
    // Forzar posición con estilos inline para evitar conflictos CSS
    btn.style.cssText = 'position:absolute; right:6px; bottom:6px; left:auto; top:auto;';
    
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const animateFn = window.__synthAnimateToPanel;
      const getFocused = window.__synthGetFocusedPanel;
      if (!animateFn) return;
      
      if (getFocused && getFocused() === panelId) {
        // Ya enfocado en este panel: volver a vista general
        animateFn(null);
      } else {
        // Enfocar este panel
        animateFn(panelId);
      }
    });
    
    panel.appendChild(btn);
  });
}

function updatePanelZoomButtons() {
  const focusedId = window.__synthGetFocusedPanel ? window.__synthGetFocusedPanel() : null;
  document.querySelectorAll('.panel-zoom-btn').forEach(btn => {
    const panelId = btn.getAttribute('data-panel-id');
    btn.classList.toggle('is-zoomed', panelId === focusedId);
  });
}

/**
 * Configura doble tap/click en paneles para alternar zoom.
 * Solo actúa si el click es en espacio vacío del panel (no en controles).
 */
function setupPanelDoubleTapZoom() {
  const PANEL_IDS = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
  const DOUBLE_TAP_DELAY = 300; // ms máximo entre taps para considerarlo doble
  
  // Selectores de elementos interactivos que NO deben activar el zoom
  // (controles específicos, no contenedores como .sgme-osc que sí deben responder en su fondo)
  const INTERACTIVE_SELECTORS = [
    'button', 'input', 'select', 'textarea', 'a',
    '.knob', '.knob-cap', '.knob-pointer', '.knob-ring',
    '.slider', '.switch', '.toggle', '.fader',
    '.panel-zoom-btn', '.matrix-pin',
    '[role="button"]', '[role="slider"]', '[draggable="true"]'
  ].join(',');

  PANEL_IDS.forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    let lastTapTime = 0;
    let lastTapTarget = null;

    /**
     * Comprueba si el elemento o alguno de sus ancestros es interactivo.
     */
    function isInteractiveElement(el) {
      if (!el || el === panel) return false;
      if (el.matches && el.matches(INTERACTIVE_SELECTORS)) return true;
      return isInteractiveElement(el.parentElement);
    }

    /**
     * Maneja el toggle de zoom al panel.
     */
    function handleZoomToggle() {
      const animateFn = window.__synthAnimateToPanel;
      const getFocused = window.__synthGetFocusedPanel;
      if (!animateFn) return;

      if (getFocused && getFocused() === panelId) {
        animateFn(null); // Volver a vista general
      } else {
        animateFn(panelId); // Enfocar este panel
      }
    }

    // Doble click para desktop
    panel.addEventListener('dblclick', (ev) => {
      if (isInteractiveElement(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      handleZoomToggle();
    });

    // Doble tap para móvil (touchend porque dblclick no es fiable en táctil)
    panel.addEventListener('touchend', (ev) => {
      if (isInteractiveElement(ev.target)) return;
      // Ignorar si hay gesto de pinza/zoom activo (>=2 dedos) o multi-touch en este evento
      if (window.__synthNavGestureActive) {
        lastTapTime = 0;
        lastTapTarget = null;
        return;
      }
      if ((ev.touches && ev.touches.length > 0) || (ev.changedTouches && ev.changedTouches.length > 1)) {
        lastTapTime = 0;
        lastTapTarget = null;
        return;
      }
      
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime;
      
      // Solo cuenta como doble tap si es en el mismo panel y dentro del tiempo límite
      if (timeSinceLastTap < DOUBLE_TAP_DELAY && lastTapTarget === panel) {
        ev.preventDefault();
        handleZoomToggle();
        lastTapTime = 0; // Reset para evitar triple-tap
        lastTapTarget = null;
      } else {
        lastTapTime = now;
        lastTapTarget = panel;
      }
    }, { passive: false });
  });
}

function setupMobileQuickActionsBar() {
  const isCoarse = (() => {
    try {
      return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();

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

  const btnSharp = document.createElement('button');
  btnSharp.type = 'button';
  btnSharp.className = 'mobile-quickbar__btn';
  btnSharp.setAttribute('aria-label', 'Modo nitidez');
  btnSharp.setAttribute('aria-pressed', String(Boolean(window.__synthSharpModeEnabled)));
  btnSharp.innerHTML = iconSvg('ti-diamond');

  const displayModeQueries = ['(display-mode: standalone)']
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
  // Mantener visible también en modo PWA para poder probar el comportamiento.
  // Solo ocultar si el navegador no soporta la Fullscreen API.
  const shouldHideFullscreen = () => !canFullscreen;

  const applyPressedState = () => {
    btnPan.setAttribute('aria-pressed', String(Boolean(navLocks.panLocked)));
    btnZoom.setAttribute('aria-pressed', String(Boolean(navLocks.zoomLocked)));
    btnFs.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
    btnSharp.setAttribute('aria-pressed', String(Boolean(window.__synthSharpModeEnabled)));

    btnPan.classList.toggle('is-active', Boolean(navLocks.panLocked));
    btnZoom.classList.toggle('is-active', Boolean(navLocks.zoomLocked));
    btnFs.classList.toggle('is-active', Boolean(document.fullscreenElement));
    btnSharp.classList.toggle('is-active', Boolean(window.__synthSharpModeEnabled));

    // Ocultar botones de pan y zoom en desktop (solo tienen sentido en táctil)
    btnPan.hidden = !isCoarse;
    btnPan.disabled = !isCoarse;
    btnZoom.hidden = !isCoarse;
    btnZoom.disabled = !isCoarse;

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

  btnSharp.addEventListener('click', () => {
    const wasEnabled = window.__synthSharpModeEnabled;
    window.__synthSharpModeEnabled = !window.__synthSharpModeEnabled;
    
    // Si se desactiva mientras no estamos en zoom mínimo, activar redibujado transitorio
    if (wasEnabled && !window.__synthSharpModeEnabled) {
      const navState = window.__synthNavState;
      if (navState && typeof navState.scale === 'number' && typeof navState.getMinScale === 'function') {
        const minScale = navState.getMinScale();
        if (navState.scale > minScale + 0.01) {
          // Estamos a zoom alto, activar transición
          window.__synthSharpTransition = {
            active: true,
            lastScale: navState.scale
          };
        }
      }
    }
    
    applyPressedState();
  });

  document.addEventListener('fullscreenchange', applyPressedState);
  displayModeQueries.forEach(mq => mq.addEventListener('change', applyPressedState));

  group.appendChild(btnPan);
  group.appendChild(btnZoom);
  group.appendChild(btnSharp);
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
  setupPanelZoomButtons();
  setupPanelDoubleTapZoom();
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

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => {
      // Forzar check de actualización en cada carga
      if (registration.update) {
        registration.update().catch(() => {});
      }

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