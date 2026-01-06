// Módulo de navegación del viewport: zoom, pan, pinch
// Extraído de app.js para mejor organización del código

import { renderCanvasBgViewport, shouldUseCanvasBg, renderCanvasBgPanels } from '../utils/canvasBackground.js';

/**
 * Inicializa el sistema de navegación del viewport.
 * @param {Object} options - Opciones de configuración
 * @param {HTMLElement} options.outer - Elemento contenedor exterior (#viewportOuter)
 * @param {HTMLElement} options.inner - Elemento contenedor interior (#viewportInner)
 */
export function initViewportNavigation({ outer, inner } = {}) {
  if (!outer || !inner) {
    outer = document.getElementById('viewportOuter');
    inner = document.getElementById('viewportInner');
  }
  if (!outer || !inner) return;

  // Flags de sesión para bloquear gestos (solo UI móvil los cambia).
  // Desktop (wheel/ratón) no usa estos locks.
  window.__synthNavLocks = window.__synthNavLocks || { zoomLocked: false, panLocked: false };
  const navLocks = window.__synthNavLocks;

  // Detectar Firefox (siempre renderiza nítido, no necesita rasterización)
  const isFirefox = /Firefox\/\d+/.test(navigator.userAgent);
  window.__synthIsFirefox = isFirefox;

  // Sistema de resolución base configurable (1x, 2x, 3x)
  // - Firefox: siempre 1x (ya es nítido nativamente)
  // - Otros: usuario elige factor, por defecto 1x
  let currentResolutionFactor = isFirefox ? 1 : 1; // Por defecto 1x
  window.__synthResolutionFactor = currentResolutionFactor;
  
  // Callback para cambiar el factor de resolución
  // Siempre resetea a zoom general antes de aplicar nuevo factor
  window.__synthSetResolutionFactor = (factor) => {
    if (isFirefox) return; // Firefox no necesita esto
    if (factor === currentResolutionFactor) return;
    
    const animateFn = window.__synthAnimateToPanel;
    if (typeof animateFn === 'function') {
      // Ir a vista general primero
      animateFn(null, 600);
      setTimeout(() => {
        currentResolutionFactor = factor;
        window.__synthResolutionFactor = factor;
        render();
      }, 700);
    } else {
      currentResolutionFactor = factor;
      window.__synthResolutionFactor = factor;
      render();
    }
  };

  let rasterizeTimer = null;
  const RASTERIZE_DELAY_MS = 150;

  function cancelRasterize() {
    if (rasterizeTimer) {
      clearTimeout(rasterizeTimer);
      rasterizeTimer = null;
    }
  }

  function scheduleRasterize() {
    // Con el nuevo sistema de resolución base, no necesitamos rasterización dinámica
    // El factor de resolución ya proporciona la nitidez necesaria
    return;
    
    const minScale = getMinScale();
    const isAtMinZoom = scale <= minScale + 0.01;
    const transition = window.__synthSharpTransition;
    
    if (transition && transition.active) {
      const isZoomingOut = transition.lastScale !== null && scale < transition.lastScale;
      transition.lastScale = scale;
      
      if (isAtMinZoom) {
        transition.active = false;
        transition.lastScale = null;
      } else if (!isZoomingOut) {
        return;
      }
    } else if (!window.__synthSharpModeEnabled) {
      return;
    }
    
    cancelRasterize();
    rasterizeTimer = setTimeout(() => {
      rasterizeTimer = null;
      inner.style.zoom = scale;
      inner.style.transform = `translate3d(${offsetX / scale}px, ${offsetY / scale}px, 0)`;
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inner.style.zoom = '';
          inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
        });
      });
    }, RASTERIZE_DELAY_MS);
  }

  let scale = 1;
  let maxScale = 6.0;
  const VIEWPORT_MARGIN = 0.95;
  
  function getMinScale() {
    if (!metrics.outerWidth || !metrics.outerHeight || !metrics.contentWidth || !metrics.contentHeight) return 0.1;
    const scaleX = (metrics.outerWidth * VIEWPORT_MARGIN) / metrics.contentWidth;
    const scaleY = (metrics.outerHeight * VIEWPORT_MARGIN) / metrics.contentHeight;
    return Math.min(scaleX, scaleY);
  }

  window.__synthNavState = {
    get scale() { return scale; },
    getMinScale
  };

  let focusedPanelId = null;

  /**
   * Anima el zoom/pan hacia un panel específico o vuelve a vista general.
   * @param {string|null} panelId - ID del panel a enfocar, o null para vista general
   * @param {number} duration - Duración de la animación en ms (default 1000)
   */
  function animateToPanel(panelId, duration = 1000) {
    metricsDirty = true;
    refreshMetrics();
    
    const vv = window.visualViewport;
    const currentOuterWidth = vv ? vv.width : outer.clientWidth;
    const currentOuterHeight = vv ? vv.height : outer.clientHeight;
    
    const startScale = scale;
    const startOffsetX = offsetX;
    const startOffsetY = offsetY;
    
    let targetScale, targetOffsetX, targetOffsetY;
    
    if (panelId) {
      const panelEl = document.getElementById(panelId);
      if (!panelEl) return;
      
      const panelRect = panelEl.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      
      const panelLeft = (panelRect.left - innerRect.left) / scale;
      const panelTop = (panelRect.top - innerRect.top) / scale;
      const panelWidth = panelRect.width / scale;
      const panelHeight = panelRect.height / scale;
      
      const MIN_PADDING = 8;
      const PADDING_RATIO = 0.01;
      const extraPadding = Math.min(currentOuterWidth, currentOuterHeight) * PADDING_RATIO;
      const totalPadding = MIN_PADDING + extraPadding;
      
      const availableW = Math.max(100, currentOuterWidth - totalPadding * 2);
      const availableH = Math.max(100, currentOuterHeight - totalPadding * 2);
      const scaleX = availableW / panelWidth;
      const scaleY = availableH / panelHeight;
      targetScale = Math.min(scaleX, scaleY, maxScale);
      
      const scaledPanelWidth = panelWidth * targetScale;
      const scaledPanelHeight = panelHeight * targetScale;
      targetOffsetX = (currentOuterWidth - scaledPanelWidth) / 2 - panelLeft * targetScale;
      targetOffsetY = (currentOuterHeight - scaledPanelHeight) / 2 - panelTop * targetScale;
      
      focusedPanelId = panelId;
    } else {
      targetScale = getMinScale();
      const finalWidth = metrics.contentWidth * targetScale;
      const finalHeight = metrics.contentHeight * targetScale;
      targetOffsetX = (metrics.outerWidth - finalWidth) / 2;
      targetOffsetY = (metrics.outerHeight - finalHeight) / 2;
      
      focusedPanelId = null;
    }
    
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
  
  window.__synthAnimateToPanel = animateToPanel;
  window.__synthGetFocusedPanel = () => focusedPanelId;
  window.__synthResetFocusedPanel = () => {
    focusedPanelId = null;
    if (typeof updatePanelZoomButtons === 'function') {
      updatePanelZoomButtons();
    }
  };

  const LOW_ZOOM_ENTER = 0.45;
  const LOW_ZOOM_EXIT = 0.7;
  const LOW_ZOOM_CLASS = 'is-low-zoom';
  const LOW_ZOOM_EXIT_DELAY_MS = 500;
  const wheelPanFactor = 0.35;
  const wheelPanSmoothing = 0.92;
  const MIN_VISIBLE_STRIP_PX = 32;
  const PINCH_SCALE_EPSILON = 0.002;
  const MULTI_PAN_EPSILON = 0.05;
  let clampDisabled = false;
  let offsetX = 0;
  let offsetY = 0;
  let userHasAdjustedView = false;
  let lastViewportWidth = 0;

  function snapScale(value) {
    const dpr = window.devicePixelRatio || 1;
    const snapUnit = value < 0.6 ? 24 : 12;
    const denom = snapUnit * dpr;
    if (!denom) return value;
    return Math.round(value * denom) / denom;
  }

  const activeTouchMap = new Map();

  function isInteractiveTargetCapture(el) {
    if (!el) return false;
    const selector = '.knob, .knob-inner, .knob-cap, .pin-btn, .joystick-pad, .joystick-handle, .output-fader, .slider, .fader, .switch, .toggle, [data-prevent-pan="true"]';
    return !!el.closest(selector);
  }

  function updateNavGestureFlagFromCapture() {
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

    const allowOverscroll = true;

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

    if (nextLowZoom) {
      if (lowZoomIdleTimer) {
        clearTimeout(lowZoomIdleTimer);
        lowZoomIdleTimer = null;
      }
      applyLowZoomMode(true);
      return;
    }

    if (!lowZoomActive) return;

    if (lowZoomIdleTimer) {
      clearTimeout(lowZoomIdleTimer);
      lowZoomIdleTimer = null;
    }

    lowZoomIdleTimer = setTimeout(() => {
      lowZoomIdleTimer = null;
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

    const dpr = window.devicePixelRatio || 1;
    if (dpr > 0) {
      offsetX = Math.round(offsetX * dpr) / dpr;
      offsetY = Math.round(offsetY * dpr) / dpr;
    }

    const canvasOk = renderCanvasBgViewport(scale, offsetX, offsetY);
    if (!shouldUseCanvasBg() || canvasOk) {
      if (currentResolutionFactor > 1) {
        // Resolución alta: zoom base fijo, compensar con scale
        const visualScale = scale / currentResolutionFactor;
        inner.style.zoom = currentResolutionFactor;
        inner.style.transform = `translate3d(${offsetX / currentResolutionFactor}px, ${offsetY / currentResolutionFactor}px, 0) scale(${visualScale})`;
      } else {
        // Resolución 1x o Firefox: transform:scale() simple
        inner.style.zoom = '';
        inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
      }
      window.__synthViewTransform = { scale, offsetX, offsetY };
    }

    if (isCoarsePointer) {
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

  // Zoom con rueda (desktop)
  outer.addEventListener('wheel', ev => {
    metricsDirty = true;
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      cancelRasterize();
      const cx = ev.clientX - (metrics.outerLeft || 0);
      const cy = ev.clientY - (metrics.outerTop || 0);
      const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
      const minScale = getMinScale();
      const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomFactor));
      adjustOffsetsForZoom(cx, cy, newScale);
      markUserAdjusted();
      scheduleRasterize();
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
  let didMove = false;

  // Pinch-zoom con dos dedos
  const pointers = new Map();
  let lastDist = null;
  let lastCentroid = null;
  let needsSnapOnEnd = false;
  let lastPinchZoomAnchor = null;
  let didPinchZoom = false;

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
    const next = touchCount >= 2 && nonInteractiveCount >= 1;
    if (next !== navGestureActive) {
      navGestureActive = next;
      window.__synthNavGestureActive = navGestureActive;
      outer.classList.toggle('is-gesturing', navGestureActive);
      
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

    if (pointers.size === 2 && navGestureActive) {
      metricsDirty = true;
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
        const MIN_DIST_FOR_STABLE_RATIO = 180;
        const effectiveLastDist = Math.max(lastDist, MIN_DIST_FOR_STABLE_RATIO);
        const effectiveDist = Math.max(dist, MIN_DIST_FOR_STABLE_RATIO);
        const zoomFactor = effectiveDist / effectiveLastDist;

        const MAX_ZOOM_DELTA = 0.12;
        const clampedFactor = Math.max(1 - MAX_ZOOM_DELTA, Math.min(1 + MAX_ZOOM_DELTA, zoomFactor));

        if (!navLocks.zoomLocked) {
          if (Math.abs(clampedFactor - 1) > PINCH_SCALE_EPSILON) {
            cancelRasterize();
            const minScale = getMinScale();
            const newScale = Math.min(maxScale, Math.max(minScale, scale * clampedFactor));
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

      isPanning = false;
      panPointerId = null;
      return;
    }

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
      const needsRasterize = didPinchZoom;
      didPinchZoom = false;
      
      needsSnapOnEnd = false;
      lastPinchZoomAnchor = null;
      scheduleLowZoomUpdate('pinch');
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

  outer.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    return false;
  });

  // Resize handler
  let navResizeTimer = null;
  const handleNavResize = () => {
    const oldWidth = lastViewportWidth;
    
    const oldOuterWidth = metrics.outerWidth;
    const oldOuterHeight = metrics.outerHeight;
    const oldScale = scale;
    const oldOffsetX = offsetX;
    const oldOffsetY = offsetY;
    
    const worldCenterX = oldOuterWidth > 0 ? (oldOuterWidth / 2 - oldOffsetX) / oldScale : 0;
    const worldCenterY = oldOuterHeight > 0 ? (oldOuterHeight / 2 - oldOffsetY) / oldScale : 0;
    
    refreshMetrics();
    const newWidth = metrics.outerWidth;
    const newHeight = metrics.outerHeight;
    lastViewportWidth = newWidth;
    
    if (oldWidth > 0 && newWidth > 0 && Math.abs(newWidth - oldWidth) > 10) {
      const widthRatio = newWidth / oldWidth;
      const newScale = oldScale * widthRatio;
      const minScale = getMinScale();
      scale = Math.min(maxScale, Math.max(minScale, snapScale(newScale)));
      
      offsetX = (newWidth / 2) - worldCenterX * scale;
      offsetY = (newHeight / 2) - worldCenterY * scale;
    }

    refreshMetrics();
    clampOffsets();
    requestRender();

    if (userHasAdjustedView) return;
    
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
}

/**
 * Configura botones de zoom en cada panel.
 */
export function setupPanelZoomButtons() {
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
    
    btn.style.cssText = 'position:absolute; right:6px; bottom:6px; left:auto; top:auto;';
    
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const animateFn = window.__synthAnimateToPanel;
      const getFocused = window.__synthGetFocusedPanel;
      if (!animateFn) return;
      
      if (getFocused && getFocused() === panelId) {
        animateFn(null);
      } else {
        animateFn(panelId);
      }
    });
    
    panel.appendChild(btn);
  });
}

/**
 * Crea badges con el número de shortcut en cada panel.
 */
export function setupPanelShortcutBadges() {
  const PANEL_DATA = [
    { id: 'panel-1', num: '1' },
    { id: 'panel-2', num: '2' },
    { id: 'panel-3', num: '3' },
    { id: 'panel-4', num: '4' },
    { id: 'panel-5', num: '5' },
    { id: 'panel-6', num: '6' },
    { id: 'panel-output', num: '7' }
  ];

  PANEL_DATA.forEach(({ id, num }) => {
    const panel = document.getElementById(id);
    if (!panel) return;

    // Evitar duplicados
    if (panel.querySelector('.panel-shortcut-badge')) return;

    const badge = document.createElement('span');
    badge.className = 'panel-shortcut-badge';
    badge.textContent = num;
    badge.setAttribute('aria-hidden', 'true');
    badge.setAttribute('title', `Shortcut: ${num}`);
    
    panel.appendChild(badge);
  });
}

export function updatePanelZoomButtons() {
  const focusedId = window.__synthGetFocusedPanel ? window.__synthGetFocusedPanel() : null;
  document.querySelectorAll('.panel-zoom-btn').forEach(btn => {
    const panelId = btn.getAttribute('data-panel-id');
    btn.classList.toggle('is-zoomed', panelId === focusedId);
  });
}

/**
 * Configura doble tap/click en paneles para alternar zoom.
 */
export function setupPanelDoubleTapZoom() {
  const PANEL_IDS = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
  const DOUBLE_TAP_DELAY = 300;
  
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

    function isInteractiveElement(el) {
      if (!el || el === panel) return false;
      if (el.matches && el.matches(INTERACTIVE_SELECTORS)) return true;
      return isInteractiveElement(el.parentElement);
    }

    function handleZoomToggle() {
      const animateFn = window.__synthAnimateToPanel;
      const getFocused = window.__synthGetFocusedPanel;
      if (!animateFn) return;

      if (getFocused && getFocused() === panelId) {
        animateFn(null);
      } else {
        animateFn(panelId);
      }
    }

    panel.addEventListener('dblclick', (ev) => {
      if (isInteractiveElement(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      handleZoomToggle();
    });

    panel.addEventListener('touchend', (ev) => {
      if (isInteractiveElement(ev.target)) return;
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
      
      if (timeSinceLastTap < DOUBLE_TAP_DELAY && lastTapTarget === panel) {
        ev.preventDefault();
        handleZoomToggle();
        lastTapTime = 0;
        lastTapTarget = null;
      } else {
        lastTapTime = now;
        lastTapTarget = panel;
      }
    }, { passive: false });
  });
}
