import { createLogger } from './logger.js';

const log = createLogger('CanvasBackground');

// Módulo de fondo canvas para paneles
// Optimizado para dispositivos móviles con pointer coarse

const INLINE_SVG_TEXT_CACHE = new Map();
const CANVAS_BG_IMAGE_CACHE = new Map();
const CANVAS_BG_IMAGE_READY = new Map();

let CANVAS_BG_INLINE_FALLBACK = false;
const CANVAS_BG_LOAD_TIMEOUT_MS = 1500;

// Resolución fija en el canvas: N píxeles de bitmap por cada CSS px.
const CANVAS_BG_PX_PER_CSS_PX = 2;
const CANVAS_BG_PANELS = ['panel-1', 'panel-2', 'panel-3', 'panel-4'];
const CANVAS_BG_SVG_BY_PANEL = {
  // SVG ocultos temporalmente: paneles 1, 2, 3 y 4 (dejar URLs comentadas para revertir rápido).
  // 'panel-1': './assets/panels/panel1_bg.svg',
  // 'panel-2': './assets/panels/panel2_bg.svg',
  //'panel-3': './assets/panels/panel3_bg.svg',
  // 'panel-4': './assets/panels/panel4_bg.svg'
};

/**
 * Detecta si el dispositivo tiene pointer coarse (táctil).
 * En estos dispositivos usamos canvas para evitar lagunas al hacer zoom.
 */
export function shouldUseCanvasBg() {
  try {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Crea o recupera la capa de canvas para fondos.
 */
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

/**
 * Carga una imagen una sola vez y la cachea.
 */
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

/**
 * Precarga las imágenes de fondo para el canvas.
 * Incluye timeout para fallback a fondo inline si no carga.
 */
export function preloadCanvasBgImages() {
  if (!shouldUseCanvasBg()) return;

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
      CANVAS_BG_IMAGE_READY.set(url, img || null);

      if (!img) {
        CANVAS_BG_INLINE_FALLBACK = true;
        for (const pId of CANVAS_BG_PANELS) {
          if (CANVAS_BG_SVG_BY_PANEL[pId] !== url) continue;
          const panel = document.getElementById(pId);
          const host = panel?.querySelector?.(':scope > .panel-inline-bg');
          host?.classList?.remove('is-canvas-hidden');
        }
      }

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

/**
 * Renderiza el fondo canvas para el viewport.
 * @param {number} scale - Escala actual del viewport
 * @param {number} offsetX - Offset X del viewport
 * @param {number} offsetY - Offset Y del viewport
 * @returns {boolean} true si el renderizado fue exitoso
 */
export function renderCanvasBgViewport(scale = 1, offsetX = 0, offsetY = 0) {
  if (!shouldUseCanvasBg()) return true;

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

  for (const panelId of CANVAS_BG_PANELS) {
    const url = CANVAS_BG_SVG_BY_PANEL[panelId];
    if (!url) continue;
    if (!CANVAS_BG_IMAGE_READY.has(url)) return false;
  }

  ctx.setTransform(CANVAS_BG_PX_PER_CSS_PX, 0, 0, CANVAS_BG_PX_PER_CSS_PX, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);

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

    let sx = offsetX + x * scale;
    let sy = offsetY + y * scale;
    let sw = w * scale;
    let sh = h * scale;

    sx = snap(sx);
    sy = snap(sy);
    sw = snap(sw);
    sh = snap(sh);

    ctx.drawImage(img, sx - 0.5, sy - 0.5, sw + 1, sh + 1);
  }

  return true;
}

/**
 * Renderiza fondos de panel usando la transformación actual del viewport.
 */
export function renderCanvasBgPanels() {
  const t = window.__synthViewTransform || { scale: 1, offsetX: 0, offsetY: 0 };
  renderCanvasBgViewport(t.scale, t.offsetX, t.offsetY);
}

/**
 * Carga texto SVG una sola vez y lo cachea.
 */
export function loadSvgTextOnce(url) {
  if (INLINE_SVG_TEXT_CACHE.has(url)) return INLINE_SVG_TEXT_CACHE.get(url);
  const promise = fetch(url, { cache: 'force-cache' })
    .then(resp => (resp && resp.ok ? resp.text() : null))
    .catch(() => null);
  INLINE_SVG_TEXT_CACHE.set(url, promise);
  return promise;
}

/**
 * Inyecta un fondo SVG inline en un panel usando fetch.
 * Usa fetch() en lugar de <object> para pasar correctamente por el service worker.
 * Incluye retry logic para mejorar fiabilidad offline.
 * @param {string} panelId - ID del panel
 * @param {string} svgUrl - URL del archivo SVG
 * @param {number} [retries=3] - Número de reintentos en caso de fallo
 */
export async function injectInlinePanelSvgBackground(panelId, svgUrl, retries = 3) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.querySelector(':scope > .panel-inline-bg')) return;

  const host = document.createElement('div');
  host.className = 'panel-inline-bg';
  panel.insertBefore(host, panel.firstChild);

  // Intentar cargar el SVG con reintentos
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(svgUrl, { cache: 'force-cache' });
      if (response.ok) {
        const svgText = await response.text();
        host.innerHTML = svgText;
        
        // Configurar el SVG inyectado
        const svg = host.querySelector('svg');
        if (svg) {
          svg.style.cssText = 'width: 100%; height: 100%; display: block;';
          svg.setAttribute('aria-hidden', 'true');
        }
        
        panel.classList.add('has-inline-bg');
        return; // Éxito, salir
      }
    } catch (e) {
      if (attempt < retries - 1) {
        // Esperar antes de reintentar (100ms, 200ms, 300ms...)
        await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
      } else {
        log.warn(` Failed to load ${svgUrl} after ${retries} attempts:`, e);
      }
    }
  }
  
  panel.classList.add('has-inline-bg'); // Marcar como procesado aunque falle
}
