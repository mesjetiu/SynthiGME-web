// Punto de entrada que ensambla el motor y todos los módulos de la interfaz Synthi
import { AudioEngine } from './core/engine.js';
import { JoystickModule } from './modules/joystick.js';
import { PanelManager } from './ui/panelManager.js';
import { OutputFaderModule } from './modules/outputFaders.js';
import { LargeMatrix } from './ui/largeMatrix.js';
import { SGME_Oscillator } from './ui/sgmeOscillator.js';

let orientationHintDismissed = false;

const INLINE_SVG_TEXT_CACHE = new Map();
const CANVAS_BG_IMAGE_CACHE = new Map();

// --- Paso 1 (migración a canvas): fondo canvas fijo para 1 panel ---
// Resolución fija en el canvas: N píxeles de bitmap por cada CSS px.
// No depende del navegador: nosotros elegimos el factor.
const CANVAS_BG_PX_PER_CSS_PX = 2;
const CANVAS_BG_PANELS = ['panel-1', 'panel-2', 'panel-3', 'panel-4'];
const CANVAS_BG_SVG_BY_PANEL = {
  'panel-1': './assets/panels/panel3_bg.svg',
  'panel-2': './assets/panels/panel3_bg.svg',
  'panel-3': './assets/panels/panel3_bg.svg',
  'panel-4': './assets/panels/panel3_bg.svg'
};

function ensureCanvasBgLayer() {
  const inner = document.getElementById('viewportInner');
  if (!inner) return null;

  let layer = document.getElementById('canvasBgLayer');
  let canvas = document.getElementById('canvasBg');

  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'canvasBgLayer';
    layer.setAttribute('aria-hidden', 'true');
    inner.insertBefore(layer, inner.firstChild);
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'canvasBg';
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);
  }

  return { inner, layer, canvas };
}

function ensureCanvasForPanel(panelId) {
  const env = ensureCanvasBgLayer();
  if (!env) return null;
  const { layer } = env;

  const id = `canvasBg-${panelId}`;
  let canvas = document.getElementById(id);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.dataset.panelId = panelId;
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);
  }

  return { ...env, canvas };
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

async function renderCanvasBgPanel(panelId) {
  const env = ensureCanvasForPanel(panelId);
  if (!env) return;
  const { canvas } = env;

  const panel = document.getElementById(panelId);
  if (!panel) return;

  const svgUrl = CANVAS_BG_SVG_BY_PANEL[panelId];
  if (!svgUrl) return;

  // Canvas tamaño = tamaño del panel (en CSS px) * factor fijo.
  // Importante en móvil: evitar un canvas enorme (textura gigante) que puede dar gaps.
  const x = panel.offsetLeft || 0;
  const y = panel.offsetTop || 0;
  const cssW = panel.offsetWidth || 0;
  const cssH = panel.offsetHeight || 0;
  if (cssW <= 0 || cssH <= 0) return;

  const pxW = Math.max(1, Math.round(cssW * CANVAS_BG_PX_PER_CSS_PX));
  const pxH = Math.max(1, Math.round(cssH * CANVAS_BG_PX_PER_CSS_PX));

  canvas.style.position = 'absolute';
  canvas.style.left = `${x}px`;
  canvas.style.top = `${y}px`;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  if (canvas.width !== pxW) canvas.width = pxW;
  if (canvas.height !== pxH) canvas.height = pxH;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  ctx.setTransform(CANVAS_BG_PX_PER_CSS_PX, 0, 0, CANVAS_BG_PX_PER_CSS_PX, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const img = await loadImageOnce(svgUrl);
  if (!img) return;

  ctx.drawImage(img, 0, 0, cssW, cssH);
}

function renderCanvasBgPanels() {
  CANVAS_BG_PANELS.forEach(panelId => {
    renderCanvasBgPanel(panelId);
  });
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

  // Canvas: ocultar el SVG en los paneles que ya pintamos por canvas.
  if (CANVAS_BG_PANELS.includes(panelId)) host.classList.add('is-canvas-hidden');
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
    injectInlinePanelSvgBackground('panel-1', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-2', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-3', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-4', './assets/panels/panel3_bg.svg');
    injectInlinePanelSvgBackground('panel-5', './assets/panels/panel5_bg.svg');
    injectInlinePanelSvgBackground('panel-6', './assets/panels/panel6_bg.svg');
        
    // Canvas: pinta fondos de panel-1/2/3/4 para evitar lagunas en móvil.
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
      const knobOptions = this._getPanel3KnobOptions(slot.index - 1);
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

  _getPanel3KnobOptions(oscIndex) {
    const knobOptions = [];
    knobOptions[2] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanel3OscVolume(oscIndex, value)
    };
    knobOptions[6] = {
      min: 10,
      max: 10000,
      initial: 10,
      pixelsForFullRange: 900,
      onChange: value => this._updatePanel3OscFreq(oscIndex, value)
    };
    return knobOptions;
  }

  _getPanel1KnobOptions(oscIndex) {
    const knobOptions = [];
    knobOptions[2] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanel1OscVolume(oscIndex, value)
    };
    knobOptions[6] = {
      min: 10,
      max: 10000,
      initial: 10,
      pixelsForFullRange: 900,
      onChange: value => this._updatePanel1OscFreq(oscIndex, value)
    };
    return knobOptions;
  }

  _getPanel2KnobOptions(oscIndex) {
    const knobOptions = [];
    knobOptions[2] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanel2OscVolume(oscIndex, value)
    };
    knobOptions[6] = {
      min: 10,
      max: 10000,
      initial: 10,
      pixelsForFullRange: 900,
      onChange: value => this._updatePanel2OscFreq(oscIndex, value)
    };
    return knobOptions;
  }

  _getPanel4KnobOptions(oscIndex) {
    const knobOptions = [];
    knobOptions[2] = {
      min: 0,
      max: 1,
      initial: 0,
      onChange: value => this._updatePanel4OscVolume(oscIndex, value)
    };
    knobOptions[6] = {
      min: 10,
      max: 10000,
      initial: 10,
      pixelsForFullRange: 900,
      onChange: value => this._updatePanel4OscFreq(oscIndex, value)
    };
    return knobOptions;
  }

  _ensurePanel1Nodes(index) {
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    this._panel1Audio = this._panel1Audio || { nodes: [] };
    this._panel1Audio.nodes = this._panel1Audio.nodes || [];
    let entry = this._panel1Audio.nodes[index];
    if (entry && entry.osc && entry.gain) return entry;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 10;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    
    const bus1 = this.engine.getOutputBusNode(0);
    if (bus1) gain.connect(bus1);

    const startTime = ctx.currentTime + 0.01;
    try { osc.start(startTime); } catch (error) {}

    entry = { osc, gain };
    this._panel1Audio.nodes[index] = entry;
    return entry;
  }

  _updatePanel1OscVolume(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel1Nodes(index);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanel1OscFreq(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel1Nodes(index);
    if (!node || !node.osc) return;
    const now = ctx.currentTime;
    node.osc.frequency.cancelScheduledValues(now);
    node.osc.frequency.setTargetAtTime(value, now, 0.03);
  }

  _ensurePanel2Nodes(index) {
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    this._panel2Audio = this._panel2Audio || { nodes: [] };
    this._panel2Audio.nodes = this._panel2Audio.nodes || [];
    let entry = this._panel2Audio.nodes[index];
    if (entry && entry.osc && entry.gain) return entry;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 10;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    
    const bus1 = this.engine.getOutputBusNode(0);
    if (bus1) gain.connect(bus1);

    const startTime = ctx.currentTime + 0.01;
    try { osc.start(startTime); } catch (error) {}

    entry = { osc, gain };
    this._panel2Audio.nodes[index] = entry;
    return entry;
  }

  _updatePanel2OscVolume(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel2Nodes(index);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanel2OscFreq(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel2Nodes(index);
    if (!node || !node.osc) return;
    const now = ctx.currentTime;
    node.osc.frequency.cancelScheduledValues(now);
    node.osc.frequency.setTargetAtTime(value, now, 0.03);
  }

  _ensurePanel4Nodes(index) {
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    this._panel4Audio = this._panel4Audio || { nodes: [] };
    this._panel4Audio.nodes = this._panel4Audio.nodes || [];
    let entry = this._panel4Audio.nodes[index];
    if (entry && entry.osc && entry.gain) return entry;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 10;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    
    const bus1 = this.engine.getOutputBusNode(0);
    if (bus1) gain.connect(bus1);

    const startTime = ctx.currentTime + 0.01;
    try { osc.start(startTime); } catch (error) {}

    entry = { osc, gain };
    this._panel4Audio.nodes[index] = entry;
    return entry;
  }

  _updatePanel4OscVolume(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel4Nodes(index);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanel4OscFreq(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel4Nodes(index);
    if (!node || !node.osc) return;
    const now = ctx.currentTime;
    node.osc.frequency.cancelScheduledValues(now);
    node.osc.frequency.setTargetAtTime(value, now, 0.03);
  }

  _ensurePanel3Nodes(index) {
    this.ensureAudio();
    const ctx = this.engine.audioCtx;
    if (!ctx) return null;

    this._panel3Audio = this._panel3Audio || { nodes: [] };
    this._panel3Audio.nodes = this._panel3Audio.nodes || [];
    let entry = this._panel3Audio.nodes[index];
    if (entry && entry.osc && entry.gain) return entry;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 10;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);

    const startTime = ctx.currentTime + 0.01;
    try { osc.start(startTime); } catch (error) {
      // ignore multiple starts
    }

    entry = { osc, gain };
    this._panel3Audio.nodes[index] = entry;
    return entry;
  }

  _updatePanel3OscVolume(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel3Nodes(index);
    if (!node || !node.gain) return;
    const now = ctx.currentTime;
    node.gain.gain.cancelScheduledValues(now);
    node.gain.gain.setTargetAtTime(value, now, 0.03);
  }

  _updatePanel3OscFreq(index, value) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const node = this._ensurePanel3Nodes(index);
    if (!node || !node.osc) return;
    const now = ctx.currentTime;
    node.osc.frequency.cancelScheduledValues(now);
    node.osc.frequency.setTargetAtTime(value, now, 0.03);
  }

  _getPanel5RowMap() {
    const rowNumbers = [91, 93, 95, 97, 99, 101, 103, 105, 107];
    const map = new Map();
    rowNumbers.forEach((rowNumber, idx) => {
      map.set(rowNumber, idx);
    });
    return map;
  }

  _getPanel5ColMap() {
    const startCol = 36;
    const buses = 8;
    const map = new Map();
    for (let i = 0; i < buses; i += 1) {
      map.set(startCol + i, i);
    }
    return map;
  }

  _setupPanel5AudioRouting() {
    this._panel3Routing = this._panel3Routing || { connections: {}, rowMap: null, colMap: null };
    this._panel3Routing.connections = {};
    this._panel3Routing.rowMap = this._getPanel5RowMap();
    this._panel3Routing.colMap = this._getPanel5ColMap();
    this._panel3Routing.hiddenCols = Array.from(this.largeMatrixAudio?.hiddenCols || []);

    if (this.largeMatrixAudio && this.largeMatrixAudio.setToggleHandler) {
      this.largeMatrixAudio.setToggleHandler((rowIndex, colIndex, nextActive) =>
        this._handlePanel5AudioToggle(rowIndex, colIndex, nextActive)
      );
    }
  }

  _handlePanel5AudioToggle(rowIndex, colIndex, activate) {
    const rowNumber = 67 + rowIndex;
    const colNumber = this._getVisibleColNumber(colIndex);
    const oscIndex = this._panel3Routing?.rowMap?.get(rowNumber);
    const busIndex = this._panel3Routing?.colMap?.get(colNumber);
    const key = `${rowIndex}:${colIndex}`;

    // Si no mapea a nuestras fuentes/destinos, dejar que el UI siga sin conexiones de audio.
    if (oscIndex == null || busIndex == null) return true;

    if (activate) {
      this.ensureAudio();
      const ctx = this.engine.audioCtx;
      const src = this._ensurePanel3Nodes(oscIndex);
      const outNode = src?.gain;
      const busNode = this.engine.getOutputBusNode(busIndex);
      if (!ctx || !outNode || !busNode) return false;

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
    const hidden = this._panel3Routing?.hiddenCols || [];
    let hiddenBefore = 0;
    for (const h of hidden) {
      if (h <= colIndex) hiddenBefore += 1;
    }
    return colIndex + 1 - hiddenBefore;
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

    const HIDDEN_COLS_PANEL5 = [33, 65, 66]; // 1-based: columna 34
    // Numeración Synthi100: columnas 1-66, filas comienzan en 67.
    // Filas 97, 98, 99 -> índices 30, 31, 32 (0-based). Fila 126 -> índice 59.
    const HIDDEN_ROWS_PANEL5 = [30, 31, 32, 62];

    // Panel 5 (audio) con columna 34 oculta
    this.largeMatrixAudio = new LargeMatrix(this.panel5MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME,
      hiddenCols: HIDDEN_COLS_PANEL5,
      hiddenRows: HIDDEN_ROWS_PANEL5
    });

    // Panel 6 (control) sin columnas ocultas por ahora, pero con la misma interfaz para reutilizar más adelante
    this.largeMatrixControl = new LargeMatrix(this.panel6MatrixEl, {
      rows: 63,
      cols: 67,
      frame: LARGE_MATRIX_FRAME,
      hiddenCols: [],
      hiddenRows: []
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

  let scale = 1;
  let maxScale = 6.0;
  const VIEWPORT_MARGIN = 0.95; // 95% del ancho disponible (margen de seguridad del 5%)
  
  // Función para calcular el zoom mínimo basado en el ancho actual del viewport
  function getMinScale() {
    if (!metrics.outerWidth || !metrics.contentWidth) return 0.1;
    return (metrics.outerWidth * VIEWPORT_MARGIN) / metrics.contentWidth;
  }
  
  const LOW_ZOOM_ENTER = 0.45;
  const LOW_ZOOM_EXIT = 0.7; // histéresis amplia para evitar saltos
  // Esperas antes de aplicar el cambio de modo tras la última actividad de zoom
  const LOW_ZOOM_IDLE_WHEEL_MS = 2000; // rueda/trackpad
  const LOW_ZOOM_IDLE_PINCH_MS = 1200; // pellizco táctil
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

    // Sincronizamos will-change con la activación/salida según el retardo de inactividad
    if (lowZoomActive) {
      inner.style.willChange = 'transform';
    } else {
      inner.style.willChange = '';
    }
  }

  function scheduleLowZoomUpdate(kind) {
    const delay = kind === 'pinch' ? LOW_ZOOM_IDLE_PINCH_MS : LOW_ZOOM_IDLE_WHEEL_MS;
    if (lowZoomIdleTimer) {
      clearTimeout(lowZoomIdleTimer);
      lowZoomIdleTimer = null;
    }
    lowZoomIdleTimer = setTimeout(() => {
      lowZoomIdleTimer = null;
      applyLowZoomMode(computeLowZoomState());
    }, delay);
  }

  function render() {
    if (metricsDirty) {
      refreshMetrics();
    }
    clampOffsets();
    inner.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
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
      const cx = ev.clientX - (metrics.outerLeft || 0);
      const cy = ev.clientY - (metrics.outerTop || 0);
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const minScale = getMinScale();
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      adjustOffsetsForZoom(cx, cy, newScale);
      markUserAdjusted();
      scheduleLowZoomUpdate('wheel');
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
            const minScale = getMinScale();
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
        if (didZoom) {
          scheduleLowZoomUpdate('pinch');
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
      scheduleLowZoomUpdate('pinch');
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
      scheduleLowZoomUpdate('pinch');
      requestRender();
    }
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