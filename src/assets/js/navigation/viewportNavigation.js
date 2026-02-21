// Módulo de navegación del viewport: zoom, pan, pinch
// Extraído de app.js para mejor organización del código

import { renderCanvasBgViewport, shouldUseCanvasBg, renderCanvasBgPanels } from '../utils/canvasBackground.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { keyboardShortcuts } from '../ui/keyboardShortcuts.js';

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

  // Flags de sesión para bloquear gestos de navegación.
  // Aplica a todas las plataformas: táctil (pinch/pan) y desktop (wheel/ratón).
  window.__synthNavLocks = window.__synthNavLocks || { zoomLocked: false, panLocked: false };
  const navLocks = window.__synthNavLocks;

  // ─── Opciones de interacción táctil ────────────────────────────────────
  // Multitouch: permite mover varios knobs/faders simultáneamente (off por defecto)
  // Single-finger pan: arrastrar canvas con un dedo en táctil (on por defecto)
  let multitouchControlsEnabled = localStorage.getItem(STORAGE_KEYS.MULTITOUCH_CONTROLS) === 'true';
  let singleFingerPanEnabled = localStorage.getItem(STORAGE_KEYS.SINGLE_FINGER_PAN) !== 'false'; // true por defecto

  document.addEventListener('synth:multitouchControlsChange', (e) => {
    multitouchControlsEnabled = e.detail?.enabled ?? false;
  });

  document.addEventListener('synth:singleFingerPanChange', (e) => {
    singleFingerPanEnabled = e.detail?.enabled ?? true;
  });

  // Detectar Firefox (siempre renderiza nítido, no necesita rasterización)
  const isFirefox = /Firefox\/\d+/.test(navigator.userAgent);
  window.__synthIsFirefox = isFirefox;

  // Sistema de resolución base configurable (1x, 2x, 3x en desktop)
  // - Firefox: siempre 1x (ya es nítido nativamente)
  // - Escalas disponibles: 1x, 1.5x, 2x, 2.5x, 3x
  // - Por defecto: 1x (seguro para todos los dispositivos)
  const validFactors = [1, 1.5, 2, 2.5, 3];
  const rememberResolution = localStorage.getItem(STORAGE_KEYS.REMEMBER_RESOLUTION) === 'true';
  const savedFactor = parseFloat(localStorage.getItem(STORAGE_KEYS.RESOLUTION));
  // Solo usar factor guardado si "recordar" está activo, si no siempre 1x
  const initialFactor = (!isFirefox && rememberResolution && validFactors.includes(savedFactor)) ? savedFactor : 1;
  let currentResolutionFactor = initialFactor;
  window.__synthResolutionFactor = currentResolutionFactor;
  
  // Callback para cambiar el factor de resolución
  // Siempre resetea a zoom general antes de aplicar nuevo factor
  window.__synthSetResolutionFactor = (factor) => {
    if (isFirefox) return; // Firefox no necesita esto
    if (factor === currentResolutionFactor) return;
    cancelRasterize();
    clearActiveZoom(); // Limpiar zoom residual antes de aplicar resolución manual
    
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

  // ─── Rasterización adaptativa (sharp mode) ─────────────────────────────
  // En Chrome/Safari, transform:scale() escala texturas GPU ya rasterizadas
  // → resultado borroso al hacer zoom in. Solución: cuando el usuario deja
  // de interactuar, aplicar CSS zoom al nivel de escala actual para forzar
  // re-rasterización del DOM a resolución real. Al volver a mover/zoom,
  // revertir a transform:scale() para fluidez de 60fps.
  // Opción controlable por el usuario desde Ajustes > Visualización.
  let rasterizeTimer = null;
  const RASTERIZE_DELAY_MS = 200;
  const MAX_SHARP_ZOOM = 3;
  const MAX_RASTER_DIMENSION = 16384;
  const MIN_SHARP_SCALE = 1.05; // Sin beneficio visual por debajo de ~1×
  let sharpMode = false;
  let sharpZoomFactor = 1;

  // Preferencia del usuario (por defecto desactivado)
  const savedSharpPref = localStorage.getItem(STORAGE_KEYS.SHARP_RASTERIZE_ENABLED);
  let sharpRasterizeEnabled = savedSharpPref === 'true';

  // Escuchar cambios de la opción desde Ajustes o menú Electron
  document.addEventListener('synth:sharpRasterizeChange', (e) => {
    sharpRasterizeEnabled = e.detail?.enabled ?? false;
    if (!sharpRasterizeEnabled) {
      cancelRasterize();
      clearActiveZoom();
      render();
    } else {
      // Al activar, programar rasterización si hay zoom
      scheduleRasterize();
    }
  });

  // ── Zoom residual ──────────────────────────────────────────────────────
  // Cuando el sharp mode está activo, inner.style.zoom se fija a un valor.
  // Al desactivar el sharp mode (por interacción del usuario), NO quitamos
  // el CSS zoom — eso causaría otra re-rasterización costosa a 1× que
  // bloquea el hilo principal. En su lugar, mantenemos el zoom CSS como
  // "residual" y lo compensamos en el transform. Resultado:
  // - Entrada a sharp: render() aplica CSS zoom (re-rasterización → nítido)
  // - Salida de sharp: transform compensa (instantáneo, sin re-rasterización)
  // - El zoom residual solo se limpia en momentos seguros (fullscreen, cambio
  //   de resolución manual) o al re-entrar en sharp a un nivel diferente.
  let activeZoom = 1; // CSS zoom actualmente aplicado al DOM

  // ── Commit diferido: aplica el CSS zoom en un RAF, cancelable por input ──
  let sharpCommitRaf = null;
  const MAX_SHARP_DEFER_FRAMES = 10; // Máx frames esperando input libre
  let sharpDeferCount = 0;

  function requestSharpCommit() {
    cancelSharpCommit();
    sharpDeferCount = 0;
    sharpCommitRaf = requestAnimationFrame(commitSharpMode);
  }

  function cancelSharpCommit() {
    if (sharpCommitRaf) {
      cancelAnimationFrame(sharpCommitRaf);
      sharpCommitRaf = null;
    }
    sharpDeferCount = 0;
  }

  /**
   * Commit real del sharp mode. Comprueba isInputPending() antes de aplicar
   * el CSS zoom para evitar bloquear el hilo principal si hay eventos pendientes.
   * Si hay input pendiente, difiere al siguiente frame (hasta MAX_SHARP_DEFER_FRAMES).
   */
  function commitSharpMode() {
    sharpCommitRaf = null;

    // Si se canceló entre el schedule y el commit, abortar
    if (sharpZoomFactor <= 1) return;

    // Comprobar si hay input pendiente (Chrome 87+)
    const hasPendingInput = typeof navigator?.scheduling?.isInputPending === 'function'
      && navigator.scheduling.isInputPending({ includeContinuous: true });

    if (hasPendingInput && sharpDeferCount < MAX_SHARP_DEFER_FRAMES) {
      sharpDeferCount++;
      sharpCommitRaf = requestAnimationFrame(commitSharpMode);
      return;
    }

    // Aplicar: activar sharp mode y renderizar con nuevo CSS zoom
    sharpMode = true;
    render();
  }

  /**
   * Cancela cualquier rasterización pendiente y desactiva sharp mode.
   * NO quita el CSS zoom del DOM — se mantiene como zoom residual para
   * evitar re-rasterización costosa al empezar a interactuar.
   */
  function cancelRasterize() {
    if (rasterizeTimer) {
      clearTimeout(rasterizeTimer);
      rasterizeTimer = null;
    }
    cancelSharpCommit();
    sharpMode = false;
    sharpZoomFactor = 1;
    // NO requestRender(): el CSS zoom se mantiene como residual.
    // render() lo compensará vía activeZoom en el transform.
  }

  /**
   * Limpia forzosamente el zoom residual del DOM.
   * Solo llamar en momentos seguros donde el lag es aceptable
   * (fullscreen, cambio de resolución manual).
   */
  function clearActiveZoom() {
    if (activeZoom > 1) {
      activeZoom = 1;
      inner.style.zoom = '';
    }
  }

  function scheduleRasterize() {
    if (!sharpRasterizeEnabled) return;
    if (currentResolutionFactor > 1) return; // resolución manual activa
    cancelRasterize();
    rasterizeTimer = setTimeout(() => {
      rasterizeTimer = null;
      enterSharpMode();
    }, RASTERIZE_DELAY_MS);
  }

  /**
   * Prepara el modo sharp: calcula el zoom seguro y programa su aplicación
   * diferida vía requestAnimationFrame + isInputPending().
   */
  function enterSharpMode() {
    if (!sharpRasterizeEnabled) return;
    if (currentResolutionFactor > 1) return;

    const target = Math.min(scale, MAX_SHARP_ZOOM);
    if (target < MIN_SHARP_SCALE) {
      // Escala demasiado baja para beneficio visual.
      // Limpiar zoom residual si existe (la vista general es pequeña,
      // el coste de re-rasterizar a 1× es bajo).
      if (activeZoom > 1) {
        clearActiveZoom();
        render();
      }
      return;
    }

    // Verificar límites del compositor GPU
    const cw = metrics.contentWidth || 1;
    const ch = metrics.contentHeight || 1;
    const maxByW = MAX_RASTER_DIMENSION / cw;
    const maxByH = MAX_RASTER_DIMENSION / ch;
    const safeZoom = Math.min(target, maxByW, maxByH);
    if (safeZoom < MIN_SHARP_SCALE) return;

    sharpZoomFactor = Math.round(safeZoom * 100) / 100;
    requestSharpCommit();
  }

  // Exponer estado de sharp mode para depuración
  window.__synthSharpMode = {
    get active() { return sharpMode; },
    get zoom() { return sharpZoomFactor; },
    get activeZoom() { return activeZoom; },
    get pending() { return sharpCommitRaf !== null; }
  };

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
        scheduleViewportSave();
        // DESACTIVADO: botón de zoom en panel
        // if (typeof updatePanelZoomButtons === 'function') {
        //   updatePanelZoomButtons();
        // }
      }
    }
    
    cancelRasterize();
    // Ocultar tooltips de knobs/sliders: el contenido se mueve bajo el puntero
    // y no se dispara pointerleave, dejando el tooltip activo indefinidamente.
    document.dispatchEvent(new Event('synth:dismissTooltips'));
    requestAnimationFrame(animateStep);
  }
  
  window.__synthAnimateToPanel = animateToPanel;
  window.__synthGetFocusedPanel = () => focusedPanelId;
  window.__synthResetFocusedPanel = () => {
    focusedPanelId = null;
    // DESACTIVADO: botón de zoom en panel
    // if (typeof updatePanelZoomButtons === 'function') {
    //   updatePanelZoomButtons();
    // }
  };

  const LOW_ZOOM_ENTER = 0.45;
  const LOW_ZOOM_EXIT = 0.7;
  const LOW_ZOOM_CLASS = 'is-low-zoom';
  const LOW_ZOOM_EXIT_DELAY_MS = 500;
  const wheelPanFactor = 0.35;
  const wheelPanSmoothing = 0.92;
  const MAX_PAN_MARGIN_RATIO = 0.25; // Máximo 1/4 del viewport vacío en cada borde
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
    const selector = '.knob, .knob-inner, .knob-cap, .pin-btn, .joystick-pad, .panel7-joystick-pad, .joystick-handle, .output-fader, .slider, .fader, .switch, .toggle, [data-prevent-pan="true"]';
    return !!el.closest(selector);
  }

  function updateNavGestureFlagFromCapture() {
    let totalTouches = 0;
    let nonInteractiveTouches = 0;
    activeTouchMap.forEach((isInteractive) => {
      totalTouches++;
      if (!isInteractive) nonInteractiveTouches++;
    });
    // Sin multitouch: cualquier toque con 2+ dedos activa navegación (bloquea controles)
    // Con multitouch: solo si al menos un dedo está en zona no interactiva
    const navActive = multitouchControlsEnabled
      ? (totalTouches >= 2 && nonInteractiveTouches >= 1)
      : (totalTouches >= 2);
    const wasActive = window.__synthNavGestureActive;
    window.__synthNavGestureActive = navActive;
    outer.classList.toggle('is-gesturing', navActive);
    // Al iniciar gesto de navegación, ocultar tooltips de todos los controles
    if (navActive && !wasActive) {
      document.dispatchEvent(new Event('synth:dismissTooltips'));
    }
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
      // Máximo 1/4 del viewport vacío en cada borde al hacer pan
      const marginX = outerWidth * MAX_PAN_MARGIN_RATIO;
      const marginY = outerHeight * MAX_PAN_MARGIN_RATIO;

      // minOffset: borde derecho del contenido no más a la izquierda que 3/4 del viewport
      // maxOffset: borde izquierdo del contenido no más a la derecha que 1/4 del viewport
      const minOffsetX = outerWidth - marginX - scaledWidth;
      const maxOffsetX = marginX;
      if (minOffsetX <= maxOffsetX) {
        offsetX = Math.min(Math.max(offsetX, minOffsetX), maxOffsetX);
      } else {
        offsetX = (minOffsetX + maxOffsetX) / 2;
      }

      const minOffsetY = outerHeight - marginY - scaledHeight;
      const maxOffsetY = marginY;
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
      // Determinar zoom efectivo:
      // 1. Sharp mode activo → zoom del sharp mode (re-rasterización nueva)
      // 2. Resolución manual fija → factor del usuario
      // 3. Zoom residual → mantener CSS zoom existente para evitar
      //    re-rasterización costosa al empezar a interactuar
      let effectiveZoom = 1;
      if (sharpMode && sharpZoomFactor > 1) {
        effectiveZoom = sharpZoomFactor;
      } else if (currentResolutionFactor > 1) {
        effectiveZoom = currentResolutionFactor;
      } else if (activeZoom > 1) {
        effectiveZoom = activeZoom;
      }

      if (effectiveZoom > 1) {
        const visualScale = scale / effectiveZoom;
        // Solo modificar inner.style.zoom si cambió (evitar trabajo innecesario)
        if (effectiveZoom !== activeZoom) {
          inner.style.zoom = effectiveZoom;
        }
        inner.style.transform = `translate3d(${offsetX / effectiveZoom}px, ${offsetY / effectiveZoom}px, 0) scale(${visualScale})`;
      } else {
        if (activeZoom > 1) {
          inner.style.zoom = '';
        }
        inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
      }
      activeZoom = effectiveZoom;
      window.__synthViewTransform = { scale, offsetX, offsetY };
    }

    if (isCoarsePointer) {
      scheduleLowZoomUpdate();
    }
  }

  refreshMetrics();
  lastViewportWidth = metrics.outerWidth;
  render();

  // ─── Estabilización de viewport en móvil/tablet ───
  // En dispositivos móviles, el viewport puede cambiar varias veces durante la carga
  // (barras de navegación que aparecen/desaparecen, teclado virtual, etc.)
  // Escuchamos los primeros cambios de visualViewport para recalcular y estabilizar
  if (window.visualViewport) {
    let stabilizationCount = 0;
    const MAX_STABILIZATION_CALLS = 5;
    
    const handleViewportStabilization = () => {
      // Skip stabilization during fullscreen transition (handled separately)
      if (window.__synthFullscreenTransition || document.fullscreenElement) return;
      
      // Si el usuario (o la restauración de sesión) ya ajustó la vista,
      // no resetear a vista general — respetar la posición/zoom guardados
      if (userHasAdjustedView) {
        window.visualViewport.removeEventListener('resize', handleViewportStabilization);
        return;
      }
      
      stabilizationCount++;
      metricsDirty = true;
      refreshMetrics();
      
      // Recalcular vista general
      const minScale = getMinScale();
      scale = Math.min(maxScale, Math.max(minScale, snapScale(minScale)));
      const finalWidth = metrics.contentWidth * scale;
      const finalHeight = metrics.contentHeight * scale;
      offsetX = (metrics.outerWidth - finalWidth) / 2;
      offsetY = (metrics.outerHeight - finalHeight) / 2;
      requestRender();
      
      // Dejar de escuchar después de suficientes estabilizaciones
      if (stabilizationCount >= MAX_STABILIZATION_CALLS) {
        window.visualViewport.removeEventListener('resize', handleViewportStabilization);
      }
    };
    
    window.visualViewport.addEventListener('resize', handleViewportStabilization);
    
    // Auto-limpieza: dejar de escuchar después de 4 segundos aunque no haya llegado al máximo
    setTimeout(() => {
      window.visualViewport.removeEventListener('resize', handleViewportStabilization);
    }, 4000);
  }

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

  requestAnimationFrame(() => {
    fitContentToViewport();
    
    // Restaurar viewport de sesión anterior (sobreescribe fit-to-content)
    if (localStorage.getItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT) === 'true') {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.VIEWPORT_STATE));
        if (saved && typeof saved.scale === 'number') {
          scale = saved.scale;
          offsetX = saved.offsetX || 0;
          offsetY = saved.offsetY || 0;
          focusedPanelId = saved.focusedPanelId || null;
          userHasAdjustedView = true; // Evitar que handleNavResize resetee
          requestRender();
        }
      } catch { /* estado corrupto, ignorar */ }
    }
  });

  /**
   * Pre-calcula y aplica las dimensiones de fullscreen ANTES de que el navegador
   * haga la transición. Esto evita el lapsus de pantalla en blanco porque el
   * contenido ya está posicionado/escalado correctamente para el tamaño de pantalla.
   * @param {boolean} entering - true si estamos entrando a fullscreen, false si salimos
   */
  function prepareForFullscreen(entering) {
    if (!outer || !inner) return;
    
    cancelRasterize();
    clearActiveZoom(); // Limpiar zoom residual — fullscreen recalcula todo
    window.__synthFullscreenTransition = true;
    
    // Calcular las dimensiones objetivo
    let targetWidth, targetHeight;
    if (entering) {
      // Usar screen.availWidth/availHeight para fullscreen (excluye barras del sistema)
      // Fallback a screen.width/height si no disponible
      // En iOS Safari, usar window.screen con orientation
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      if (isLandscape) {
        targetWidth = Math.max(screen.availWidth || screen.width, screen.availHeight || screen.height);
        targetHeight = Math.min(screen.availWidth || screen.width, screen.availHeight || screen.height);
      } else {
        targetWidth = Math.min(screen.availWidth || screen.width, screen.availHeight || screen.height);
        targetHeight = Math.max(screen.availWidth || screen.width, screen.availHeight || screen.height);
      }
    } else {
      // Al salir, las dimensiones actuales del viewport son las correctas
      // (el navegador aún no ha cambiado)
      targetWidth = outer.clientWidth;
      targetHeight = outer.clientHeight;
    }
    
    // Calcular escala mínima para las nuevas dimensiones
    const contentWidth = metrics.contentWidth;
    const contentHeight = metrics.contentHeight;
    if (!contentWidth || !contentHeight || !targetWidth || !targetHeight) return;
    
    const scaleX = (targetWidth * VIEWPORT_MARGIN) / contentWidth;
    const scaleY = (targetHeight * VIEWPORT_MARGIN) / contentHeight;
    const newMinScale = Math.min(scaleX, scaleY);
    const newScale = Math.min(maxScale, Math.max(newMinScale, snapScale(newMinScale)));
    
    // Calcular offsets para centrar
    const finalWidth = contentWidth * newScale;
    const finalHeight = contentHeight * newScale;
    const newOffsetX = (targetWidth - finalWidth) / 2;
    const newOffsetY = (targetHeight - finalHeight) / 2;
    
    // Aplicar inmediatamente
    scale = newScale;
    offsetX = newOffsetX;
    offsetY = newOffsetY;
    
    // Forzar actualización del transform directamente (sin pasar por render que puede bloquear por canvas)
    if (currentResolutionFactor > 1) {
      const visualScale = scale / currentResolutionFactor;
      inner.style.zoom = currentResolutionFactor;
      inner.style.transform = `translate3d(${offsetX / currentResolutionFactor}px, ${offsetY / currentResolutionFactor}px, 0) scale(${visualScale})`;
    } else {
      inner.style.zoom = '';
      inner.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    }
    window.__synthViewTransform = { scale, offsetX, offsetY };
  }
  
  // Exponer globalmente para que quickbar pueda llamarla
  window.__synthPrepareForFullscreen = prepareForFullscreen;

  // ─── Serialización / restauración del viewport ─────────────────────────
  // Permite guardar y restaurar la posición/zoom del canvas principal.
  // Usado por patches (configuración visual) y persistencia entre sesiones.

  /**
   * Devuelve el estado actual del viewport como objeto serializable.
   * @returns {{ scale: number, offsetX: number, offsetY: number, focusedPanelId: string|null }}
   */
  window.__synthSerializeViewportState = () => ({
    scale,
    offsetX,
    offsetY,
    focusedPanelId
  });

  /**
   * Restaura el viewport a un estado previamente serializado.
   * @param {{ scale: number, offsetX: number, offsetY: number, focusedPanelId?: string|null }} state
   */
  window.__synthRestoreViewportState = (state) => {
    if (!state || typeof state.scale !== 'number') return;
    scale = state.scale;
    offsetX = state.offsetX || 0;
    offsetY = state.offsetY || 0;
    focusedPanelId = state.focusedPanelId || null;
    userHasAdjustedView = true; // Evitar que handleNavResize resetee
    requestRender();
  };

  /**
   * Guarda el estado del viewport en localStorage si la preferencia está activa.
   */
  function saveViewportStateIfEnabled() {
    if (localStorage.getItem(STORAGE_KEYS.REMEMBER_VISUAL_LAYOUT) !== 'true') return;
    try {
      const state = window.__synthSerializeViewportState();
      localStorage.setItem(STORAGE_KEYS.VIEWPORT_STATE, JSON.stringify(state));
    } catch { /* silenciar errores de storage */ }
  }

  // ─── Guardado periódico con debounce al cambiar zoom/pan ────────────────
  // Complementa beforeunload/visibilitychange para no perder estado si el
  // navegador no dispara esos eventos (crash, kill, cierre forzado).
  let _viewportSaveTimer = null;
  const VIEWPORT_SAVE_DEBOUNCE_MS = 2000;
  function scheduleViewportSave() {
    if (_viewportSaveTimer) clearTimeout(_viewportSaveTimer);
    _viewportSaveTimer = setTimeout(() => {
      _viewportSaveTimer = null;
      saveViewportStateIfEnabled();
    }, VIEWPORT_SAVE_DEBOUNCE_MS);
  }

  // Guardar viewport al cerrar/ocultar la pestaña
  window.addEventListener('beforeunload', saveViewportStateIfEnabled);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveViewportStateIfEnabled();
  });

  // Escuchar cambios en la preferencia de recordar disposición visual
  document.addEventListener('synth:settingChanged', (e) => {
    if (e.detail?.key === 'rememberVisualLayout') {
      if (e.detail.value) {
        saveViewportStateIfEnabled();
      }
    }
  });

  function setClampDisabled(value) {
    if (clampDisabled === value) return;
    clampDisabled = value;
    requestRender();
  }

  function markUserAdjusted() {
    userHasAdjustedView = true;
    scheduleViewportSave();
  }

  // ─── Atajos de teclado para navegación del viewport ───
  // Shift: deshabilitar clamp de bordes
  // Flechas: paneo del canvas (paso proporcional al viewport)
  // Ctrl+/Ctrl-/Ctrl+0: zoom (funciona tanto en navegador como en Electron)
  const ARROW_PAN_FACTOR = 0.15; // fracción del viewport por pulsación

  /**
   * Comprueba si el usuario está escribiendo en un campo de texto.
   * En ese caso, las flechas y atajos de zoom no deben interceptarse.
   */
  function _isTypingInInput(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT' && target.type?.toLowerCase() !== 'range') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  window.addEventListener('keydown', ev => {
    if (ev.key === 'Shift') {
      setClampDisabled(true);
    }

    // ── Zoom con Ctrl+Plus / Ctrl+Minus / Ctrl+0 (navegador) ──
    // En Electron estos atajos se interceptan en main.cjs (before-input-event)
    // y se reenvían vía IPC. Aquí se manejan para que funcionen también en
    // el navegador web, previniendo el zoom nativo de la página.
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const k = ev.key;
      if (k === '+' || k === '=') {
        ev.preventDefault();
        if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
          window.__synthZoomFocusedPip('in');
        } else {
          document.dispatchEvent(new CustomEvent('synth:zoomIn'));
        }
        return;
      }
      if (k === '-' || k === '_') {
        ev.preventDefault();
        if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
          window.__synthZoomFocusedPip('out');
        } else {
          document.dispatchEvent(new CustomEvent('synth:zoomOut'));
        }
        return;
      }
      if (k === '0') {
        ev.preventDefault();
        if (window.__synthFocusedPip && window.__synthZoomFocusedPip) {
          window.__synthZoomFocusedPip('reset');
        } else {
          document.dispatchEvent(new CustomEvent('synth:zoomReset'));
        }
        return;
      }
    }

    // ── Paneo con flechas ──
    // Solo cuando no se está escribiendo y sin modificadores (excepto Shift)
    if (_isTypingInInput(ev.target)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    const arrowDir = {
      ArrowLeft:  [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp:    [0, 1],
      ArrowDown:  [0, -1]
    }[ev.key];

    if (arrowDir) {
      ev.preventDefault();
      // Si hay un PiP en foco, redirigir paneo a su viewport
      if (window.__synthFocusedPip && window.__synthPanFocusedPip) {
        // Invertir signos: ArrowLeft → scroll derecha (-), ArrowRight → scroll izquierda (+)
        window.__synthPanFocusedPip(-arrowDir[0], -arrowDir[1]);
        return;
      }
      cancelRasterize();
      const stepX = (metrics.outerWidth || outer.clientWidth) * ARROW_PAN_FACTOR;
      const stepY = (metrics.outerHeight || outer.clientHeight) * ARROW_PAN_FACTOR;
      offsetX += arrowDir[0] * stepX;
      offsetY += arrowDir[1] * stepY;
      requestRender();
      markUserAdjusted();
      scheduleRasterize();
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

  // ─── Capture-phase touch tracking ─────────────────────────────────
  // Registrar TODOS los touch pointers en capture phase para que:
  // 1) activeTouchMap + __synthNavGestureActive funcione siempre
  // 2) pointers map tenga datos para zoom incluso cuando controles
  //    interactivos (ej. joystick pad) usan stopPropagation en burbujeo
  // ───────────────────────────────────────────────────────────────────
  outer.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    const isInteractive = isInteractiveTargetCapture(ev.target);
    activeTouchMap.set(ev.pointerId, isInteractive);
    updateNavGestureFlagFromCapture();
    // Alimentar pointers map desde captura para que el zoom funcione
    // aunque el control bloquee propagación con stopPropagation.
    // Si el evento llega también por burbujeo, se sobreescribirá
    // con los mismos datos (sin efecto negativo).
    if (!pointers.has(ev.pointerId)) {
      pointers.set(ev.pointerId, {
        x: ev.clientX, y: ev.clientY,
        pointerType: ev.pointerType,
        isInteractive
      });
      recomputeNavGestureState();
    }
  }, true);

  // Capture-phase pointermove: actualizar coordenadas para zoom.
  // Necesario porque controles con stopPropagation impiden que
  // el pointermove llegue al handler de burbujeo del viewport.
  outer.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'touch') return;
    if (!pointers.has(ev.pointerId)) return;
    const prev = pointers.get(ev.pointerId);
    pointers.set(ev.pointerId, {
      x: ev.clientX, y: ev.clientY,
      pointerType: prev?.pointerType,
      isInteractive: prev?.isInteractive
    });
  }, true);

  const handleTouchEndCapture = ev => {
    if (ev.pointerType !== 'touch') return;
    activeTouchMap.delete(ev.pointerId);
    updateNavGestureFlagFromCapture();
    // Limpiar pointers map para evitar pointers fantasma cuando
    // un control usa setPointerCapture y el pointerup no llega
    // al handler de burbujeo del viewport.
    if (pointers.has(ev.pointerId)) {
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
    }
  };

  outer.addEventListener('pointerup', handleTouchEndCapture, true);
  outer.addEventListener('pointercancel', handleTouchEndCapture, true);

  function isInteractiveTarget(el) {
    if (!el) return false;
    const selector = '.knob, .knob-inner, .pin-btn, .joystick-pad, .panel7-joystick-pad, .joystick-handle, .output-fader';
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
      if (navLocks.zoomLocked) return;
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
    if (navLocks.panLocked) return;
    cancelRasterize();
    const lineHeight = 16;
    const deltaUnit = ev.deltaMode === 1 ? lineHeight : (ev.deltaMode === 2 ? (metrics.outerHeight || outer.clientHeight) : 1);
    const moveX = ev.deltaX * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    const moveY = ev.deltaY * deltaUnit * wheelPanFactor * wheelPanSmoothing;
    offsetX -= moveX;
    offsetY -= moveY;
    requestRender();
    markUserAdjusted();
    scheduleRasterize();
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
    // Sin multitouch: cualquier toque con 2+ dedos activa navegación (bloquea controles)
    // Con multitouch: solo si al menos un dedo está en zona no interactiva
    const next = multitouchControlsEnabled
      ? (touchCount >= 2 && nonInteractiveCount >= 1)
      : (touchCount >= 2);
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
    const isTouchPan = ev.pointerType === 'touch' && singleFingerPanEnabled && !navLocks.panLocked;

    if ((isMouseLike || isTouchPan) && pointers.size === 1 && !isInteractiveTarget(ev.target)) {
      cancelRasterize(); // Salir de sharp mode al iniciar pan
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
      if (navLocks.panLocked) {
        isPanning = false;
        panPointerId = null;
        return;
      }
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
      didPinchZoom = false;
      
      needsSnapOnEnd = false;
      lastPinchZoomAnchor = null;
      scheduleLowZoomUpdate('pinch');
      scheduleRasterize(); // Siempre programar sharp mode al soltar
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
      scheduleRasterize(); // Programar sharp mode al soltar
      requestRender();

      if (ev.pointerType === 'touch') {
        requestAnimationFrame(() => renderCanvasBgPanels());
      }
    }
  });

  // Disable browser context menu globally (except for text input fields, matrix pins, panels, PiP placeholders, and viewport empty space)
  document.addEventListener('contextmenu', ev => {
    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || ev.target.isContentEditable) return;
    // Allow contextmenu on matrix pin buttons (for color selection)
    if (ev.target.closest?.('button.pin-btn')) return;
    // Allow contextmenu on panels (for PiP detach)
    if (ev.target.closest?.('.panel')) return;
    // Allow contextmenu on PiP placeholders (for panel restore)
    if (ev.target.closest?.('.pip-placeholder')) return;
    // Allow contextmenu on panel notes (header & body menus, including viewport notes)
    if (ev.target.closest?.('.panel-note')) return;
    // Allow contextmenu on viewportInner empty space (for creating viewport notes)
    if (ev.target.id === 'viewportInner') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, { capture: true });

  // Fallback for Samsung/Android Chrome — no bloquear si el target es un placeholder o viewportInner
  outer.oncontextmenu = (e) => {
    if (e.target.closest?.('.pip-placeholder')) return true;
    if (e.target.id === 'viewportInner') return true;
    return false;
  };

  // ─────────────────────────────────────────────────────────────────────
  // LIMPIEZA DEFENSIVA de pointer maps
  // En Android/Samsung, pointerup/pointercancel pueden perderse si:
  // - Un PiP intercepta con stopPropagation
  // - El navegador consume el evento internamente
  // - Se cambia de pestaña/app durante un gesto
  // Resultado: pointers/activeTouchMap quedan con entradas fantasma y
  // el pinch-zoom deja de funcionar (pointers.size nunca es 2).
  // ─────────────────────────────────────────────────────────────────────
  
  // Fallback: pointerup/pointercancel a nivel document (capture) como red de seguridad
  // Si el pointer se perdió en outer, al menos lo limpiamos aquí
  document.addEventListener('pointerup', (ev) => {
    if (pointers.has(ev.pointerId)) {
      pointers.delete(ev.pointerId);
      recomputeNavGestureState();
      if (pointers.size < 2) {
        lastDist = null;
        lastCentroid = null;
      }
    }
    if (activeTouchMap.has(ev.pointerId)) {
      activeTouchMap.delete(ev.pointerId);
      updateNavGestureFlagFromCapture();
    }
  }, { capture: true });
  
  document.addEventListener('pointercancel', (ev) => {
    if (pointers.has(ev.pointerId)) {
      pointers.delete(ev.pointerId);
      recomputeNavGestureState();
      if (pointers.size < 2) {
        lastDist = null;
        lastCentroid = null;
      }
    }
    if (activeTouchMap.has(ev.pointerId)) {
      activeTouchMap.delete(ev.pointerId);
      updateNavGestureFlagFromCapture();
    }
  }, { capture: true });
  
  // Limpiar todo al cambiar de pestaña/app o al volver (Android multitask)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pointers.clear();
      activeTouchMap.clear();
      recomputeNavGestureState();
      lastDist = null;
      lastCentroid = null;
      isPanning = false;
      panPointerId = null;
      window.__synthPipGestureActive = false;
    }
  });

  // Resize handler
  let navResizeTimer = null;
  const handleNavResize = () => {
    cancelRasterize(); // Salir de sharp mode durante resize
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

    if (userHasAdjustedView) {
      scheduleRasterize();
      return;
    }
    
    if (window.__synthResetFocusedPanel) {
      window.__synthResetFocusedPanel();
    }
    fitContentToViewport();
    scheduleRasterize();
  };

  window.addEventListener('resize', () => {
    // Bypass debounce during fullscreen transition
    if (window.__synthFullscreenTransition) {
      handleNavResize();
      return;
    }
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

  // ─── Zoom programático (Ctrl+/Ctrl- desde menú Electron) ───
  // Permite hacer zoom centrado en el viewport desde eventos globales
  document.addEventListener('synth:zoomIn', () => {
    metricsDirty = true;
    refreshMetrics();
    cancelRasterize();
    const cx = (metrics.outerWidth || outer.clientWidth) / 2;
    const cy = (metrics.outerHeight || outer.clientHeight) / 2;
    const minScale = getMinScale();
    const newScale = Math.min(maxScale, Math.max(minScale, scale * 1.25));
    adjustOffsetsForZoom(cx, cy, newScale);
    markUserAdjusted();
    scheduleRasterize();
  });

  document.addEventListener('synth:zoomOut', () => {
    metricsDirty = true;
    refreshMetrics();
    cancelRasterize();
    const cx = (metrics.outerWidth || outer.clientWidth) / 2;
    const cy = (metrics.outerHeight || outer.clientHeight) / 2;
    const minScale = getMinScale();
    const newScale = Math.min(maxScale, Math.max(minScale, scale * 0.8));
    adjustOffsetsForZoom(cx, cy, newScale);
    markUserAdjusted();
    scheduleRasterize();
  });

  document.addEventListener('synth:zoomReset', () => {
    cancelRasterize();
    metricsDirty = true;
    refreshMetrics();
    fitContentToViewport();
    render();
    userHasAdjustedView = false;
    focusedPanelId = null;
    if (window.__synthResetFocusedPanel) {
      window.__synthResetFocusedPanel();
    }
    scheduleRasterize();
    // Guardar estado de reset (vista general) para que se restaure así
    scheduleViewportSave();
  });

  // ─── Fullscreen transition handling ───
  // Handle fullscreen changes immediately without debounce to prevent blank screen
  document.addEventListener('fullscreenchange', () => {
    cancelRasterize(); // Salir de sharp mode durante transición fullscreen
    window.__synthFullscreenTransition = true;
    
    // Clear any pending debounced resize
    if (navResizeTimer) {
      clearTimeout(navResizeTimer);
      navResizeTimer = null;
    }
    
    // Refrescar y renderizar inmediatamente
    metricsDirty = true;
    refreshMetrics();
    fitContentToViewport();
    render();
    renderCanvasBgPanels();
    
    // Renderizar de nuevo en el próximo frame para capturar cambios del navegador
    requestAnimationFrame(() => {
      metricsDirty = true;
      refreshMetrics();
      fitContentToViewport();
      render();
      renderCanvasBgPanels();
      
      // Y otro render después de un pequeño delay para asegurar estabilidad
      requestAnimationFrame(() => {
        metricsDirty = true;
        handleNavResize();
        render();
        renderCanvasBgPanels();
        
        // Disparar evento para que la app redibuje todos los componentes
        document.dispatchEvent(new CustomEvent('synth:fullscreenComplete'));
        
        // Limpiar flag de transición
        setTimeout(() => {
          window.__synthFullscreenTransition = false;
          
          // Redibujado final de seguridad después de que el navegador termine
          metricsDirty = true;
          refreshMetrics();
          handleNavResize();
          render();
          renderCanvasBgPanels();
          
          // Disparar evento de nuevo para asegurar redibujado completo
          document.dispatchEvent(new CustomEvent('synth:fullscreenComplete'));
          
          // Programar sharp mode tras estabilización de fullscreen
          scheduleRasterize();
        }, 400);
      });
    });
  });
}

// ─── DESACTIVADO: botón de zoom en esquina inferior derecha de cada panel ───
// Se mantiene la funcionalidad de doble click/tap para centrar panel.
// Descomentar si se quiere recuperar el botón.
//
// /**
//  * Configura botones de zoom en cada panel.
//  */
// export function setupPanelZoomButtons() {
//   const PANEL_IDS = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
//   const ICON_SPRITE = './assets/icons/ui-sprite.svg';
//   
//   const iconSvg = symbolId => `
//     <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
//       <use href="${ICON_SPRITE}#${symbolId}"></use>
//     </svg>
//   `;
//   
//   PANEL_IDS.forEach(panelId => {
//     const panel = document.getElementById(panelId);
//     if (!panel) return;
//     
//     const btn = document.createElement('button');
//     btn.type = 'button';
//     btn.className = 'panel-zoom-btn';
//     btn.setAttribute('aria-label', 'Enfocar panel');
//     btn.setAttribute('data-panel-id', panelId);
//     btn.innerHTML = iconSvg('ti-focus-2');
//     
//     btn.style.cssText = 'position:absolute; right:6px; bottom:6px; left:auto; top:auto;';
//     
//     btn.addEventListener('click', (ev) => {
//       ev.stopPropagation();
//       const animateFn = window.__synthAnimateToPanel;
//       const getFocused = window.__synthGetFocusedPanel;
//       if (!animateFn) return;
//       
//       if (getFocused && getFocused() === panelId) {
//         animateFn(null);
//       } else {
//         animateFn(panelId);
//       }
//     });
//     
//     panel.appendChild(btn);
//   });
// }

/** Mapeo de actionId → panelId para los badges de shortcut */
const PANEL_SHORTCUT_MAP = [
  { actionId: 'panel1', panelId: 'panel-1' },
  { actionId: 'panel2', panelId: 'panel-2' },
  { actionId: 'panel3', panelId: 'panel-3' },
  { actionId: 'panel4', panelId: 'panel-4' },
  { actionId: 'panel5', panelId: 'panel-5' },
  { actionId: 'panel6', panelId: 'panel-6' },
  { actionId: 'panelOutput', panelId: 'panel-output' }
];

/**
 * Obtiene el texto corto del shortcut para mostrar en el badge.
 * @param {string} actionId - ID de la acción (ej: 'panel1')
 * @returns {string} Texto a mostrar (ej: '1', 'A', 'Ctrl+1'...)
 */
function getShortcutLabel(actionId) {
  const binding = keyboardShortcuts.get(actionId);
  if (!binding || !binding.key) return '—';
  // Si es solo una tecla sin modificadores, mostrar solo la tecla en mayúscula
  const hasMods = binding.ctrl || binding.alt || binding.shift;
  if (!hasMods) return binding.key.toUpperCase();
  return keyboardShortcuts.formatBinding(binding);
}

/**
 * Actualiza el texto de todos los badges (panel + PiP) según los atajos actuales.
 */
function refreshShortcutBadges() {
  PANEL_SHORTCUT_MAP.forEach(({ actionId, panelId }) => {
    const label = getShortcutLabel(actionId);
    // Badge en el panel del canvas
    const panel = document.getElementById(panelId);
    const badge = panel?.querySelector('.panel-shortcut-badge');
    if (badge) {
      badge.textContent = label;
      badge.setAttribute('title', `Shortcut: ${label}`);
    }
    // Badge en la ventana PiP (si existe)
    const pipContainer = document.querySelector(`.pip-container[data-panel-id="${panelId}"] .pip-shortcut-badge`);
    if (pipContainer) {
      pipContainer.textContent = label;
    }
  });
}

/**
 * Crea badges con el shortcut en cada panel y se suscribe a cambios.
 */
export function setupPanelShortcutBadges() {
  PANEL_SHORTCUT_MAP.forEach(({ actionId, panelId }) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // Evitar duplicados
    if (panel.querySelector('.panel-shortcut-badge')) return;

    const label = getShortcutLabel(actionId);
    const badge = document.createElement('span');
    badge.className = 'panel-shortcut-badge';
    badge.textContent = label;
    badge.setAttribute('aria-hidden', 'true');
    badge.setAttribute('title', `Shortcut: ${label}`);
    
    panel.appendChild(badge);
  });

  // Actualizar badges cuando el usuario cambie los atajos en ajustes
  keyboardShortcuts.onChange(() => refreshShortcutBadges());
}

// DESACTIVADO: actualización visual de botones de zoom (botón desactivado)
// export function updatePanelZoomButtons() {
//   const focusedId = window.__synthGetFocusedPanel ? window.__synthGetFocusedPanel() : null;
//   document.querySelectorAll('.panel-zoom-btn').forEach(btn => {
//     const panelId = btn.getAttribute('data-panel-id');
//     btn.classList.toggle('is-zoomed', panelId === focusedId);
//   });
// }

/**
 * Configura doble tap/click en paneles para alternar zoom.
 */
export function setupPanelDoubleTapZoom() {
  const PANEL_IDS = ['panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5', 'panel-6', 'panel-output'];
  const DOUBLE_TAP_DELAY = 300;
  
  const INTERACTIVE_SELECTORS = [
    'button', 'input', 'select', 'textarea', 'a',
    '.knob', '.knob-inner', '.knob-cap', '.knob-wrap',
    '.slider', '.switch', '.toggle', '.fader',
    '.output-fader', '.output-channel__slider', '.output-channel__switch',
    '.synth-toggle',
    '.pin-btn', '.matrix-cell',
    '.joystick-pad', '.joystick-handle',
    '.panel7-joystick-pad',
    '.panel7-seq-switch', '.panel7-seq-button',
    '.sgme-osc__knob', '.noise-generator__knob', '.random-voltage__knob',
    '.panel-zoom-btn',
    '[role="button"]', '[role="slider"]', '[draggable="true"]',
    '[data-prevent-pan="true"]'
  ].join(',');

  PANEL_IDS.forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    let lastTapTime = 0;
    let lastTapTarget = null;

    function isInteractiveElement(el) {
      if (!el || el === panel) return false;
      return !!el.closest(INTERACTIVE_SELECTORS);
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
      // Ignorar si el panel está en PiP (tiene sus propios handlers)
      if (panel.classList.contains('panel--pipped')) return;
      if (isInteractiveElement(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      handleZoomToggle();
    });

    panel.addEventListener('touchend', (ev) => {
      // Ignorar si el panel está en PiP (tiene sus propios handlers)
      if (panel.classList.contains('panel--pipped')) return;
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
