// Módulo de barra de acciones rápidas para móvil
// Controles de zoom, pan, pantalla completa y modo nitidez

import { onUpdateAvailable, hasWaitingUpdate } from '../utils/serviceWorker.js';
import { t, onLocaleChange } from '../i18n/index.js';
import { keyboardShortcuts } from './keyboardShortcuts.js';

/**
 * Helper para establecer aria-label y tooltip en un botón.
 * @param {HTMLElement} btn - El botón
 * @param {string} text - Texto traducido
 */
function setButtonTooltip(btn, text) {
  btn.setAttribute('aria-label', text);
  btn.setAttribute('data-tooltip', text);
}

/** Tiempo mínimo de pulsación para mostrar tooltip (ms) */
const LONG_PRESS_DURATION = 400;

/** Referencia al tooltip activo para poder ocultarlo */
let activeTooltipBtn = null;
let longPressTimer = null;

/**
 * Oculta el tooltip activo.
 */
function hideActiveTooltip() {
  if (activeTooltipBtn) {
    activeTooltipBtn.classList.remove('tooltip-visible');
    activeTooltipBtn = null;
  }
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

/**
 * Configura long-press para mostrar tooltip en un botón (solo táctil).
 * @param {HTMLElement} btn - El botón a configurar
 */
function setupLongPressTooltip(btn) {
  let startX = 0;
  let startY = 0;
  let tooltipShown = false;
  
  btn.addEventListener('touchstart', (e) => {
    // Guardar posición inicial para detectar movimiento
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tooltipShown = false;
    
    // Iniciar timer de long-press
    longPressTimer = setTimeout(() => {
      // Ocultar cualquier otro tooltip activo
      hideActiveTooltip();
      
      // Mostrar tooltip de este botón
      btn.classList.add('tooltip-visible');
      activeTooltipBtn = btn;
      tooltipShown = true;
      
      // Vibración háptica sutil si está disponible
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    }, LONG_PRESS_DURATION);
  }, { passive: true });
  
  btn.addEventListener('touchmove', (e) => {
    // Cancelar si el usuario mueve el dedo (umbral de 10px)
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > 10 || dy > 10) {
      hideActiveTooltip();
    }
  }, { passive: true });
  
  btn.addEventListener('touchend', (e) => {
    // Si se mostró el tooltip, prevenir el click
    if (tooltipShown) {
      e.preventDefault();
      // Ocultar tooltip después de un tiempo
      setTimeout(hideActiveTooltip, 1500);
    } else {
      // No fue long-press, cancelar timer
      hideActiveTooltip();
    }
  });
  
  btn.addEventListener('touchcancel', () => {
    hideActiveTooltip();
  }, { passive: true });
}

/**
 * Configura long-press tooltips para todos los botones del quickbar.
 * @param {HTMLElement[]} buttons - Array de botones
 */
function setupAllLongPressTooltips(buttons) {
  // Solo en dispositivos táctiles
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) return;
  
  buttons.forEach(btn => setupLongPressTooltip(btn));
  
  // Ocultar tooltip al tocar fuera
  document.addEventListener('touchstart', (e) => {
    if (activeTooltipBtn && !activeTooltipBtn.contains(e.target)) {
      hideActiveTooltip();
    }
  }, { passive: true });
}

/**
 * Configura la barra de acciones rápidas para dispositivos móviles.
 */
export function setupMobileQuickActionsBar() {
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

  // Contenedor fijo para botones siempre visibles (mute + tab)
  const fixedGroup = document.createElement('div');
  fixedGroup.className = 'mobile-quickbar__fixed';

  // Botón de MUTE global (siempre visible, panic button)
  const btnMute = document.createElement('button');
  btnMute.type = 'button';
  btnMute.className = 'mobile-quickbar__btn mobile-quickbar__mute';
  btnMute.id = 'btnGlobalMute';
  setButtonTooltip(btnMute, t('quickbar.mute'));
  btnMute.setAttribute('aria-pressed', 'false');
  btnMute.innerHTML = iconSvg('ti-volume');

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'mobile-quickbar__tab';
  setButtonTooltip(tab, t('quickbar.open'));
  tab.setAttribute('aria-expanded', 'false');
  tab.innerHTML = iconSvg('ti-menu-2');

  const group = document.createElement('div');
  group.className = 'mobile-quickbar__group';

  const btnPan = document.createElement('button');
  btnPan.type = 'button';
  btnPan.className = 'mobile-quickbar__btn';
  setButtonTooltip(btnPan, t(navLocks.panLocked ? 'quickbar.pan.unlock' : 'quickbar.pan.lock'));
  btnPan.setAttribute('aria-pressed', String(Boolean(navLocks.panLocked)));
  btnPan.innerHTML = iconSvg('ti-hand-stop');

  const btnZoom = document.createElement('button');
  btnZoom.type = 'button';
  btnZoom.className = 'mobile-quickbar__btn';
  setButtonTooltip(btnZoom, t(navLocks.zoomLocked ? 'quickbar.zoom.unlock' : 'quickbar.zoom.lock'));
  btnZoom.setAttribute('aria-pressed', String(Boolean(navLocks.zoomLocked)));
  btnZoom.innerHTML = iconSvg('ti-zoom-cancel');

  // Botón de patches
  const btnPatches = document.createElement('button');
  btnPatches.type = 'button';
  btnPatches.className = 'mobile-quickbar__btn';
  btnPatches.id = 'btnPatches';
  setButtonTooltip(btnPatches, t('quickbar.patches'));
  btnPatches.innerHTML = iconSvg('ti-files');
  
  btnPatches.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('synth:togglePatches'));
  });

  const btnFs = document.createElement('button');
  btnFs.type = 'button';
  btnFs.className = 'mobile-quickbar__btn';
  setButtonTooltip(btnFs, t(document.fullscreenElement ? 'quickbar.fullscreen.exit' : 'quickbar.fullscreen'));
  btnFs.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  btnFs.innerHTML = iconSvg('ti-arrows-maximize');

  // Botón de ajustes generales (idioma, resolución, etc.)
  const btnSettings = document.createElement('button');
  btnSettings.type = 'button';
  btnSettings.className = 'mobile-quickbar__btn';
  btnSettings.id = 'btnGeneralSettings';
  setButtonTooltip(btnSettings, t('quickbar.settings'));
  btnSettings.innerHTML = iconSvg('ti-settings');
  
  // Badge de actualización disponible
  const updateBadge = document.createElement('span');
  updateBadge.className = 'quickbar-update-badge';
  updateBadge.hidden = true;
  btnSettings.appendChild(updateBadge);
  
  // Mostrar badge si ya hay actualización pendiente
  if (hasWaitingUpdate()) {
    updateBadge.hidden = false;
  }
  
  // Escuchar notificaciones de actualización disponible
  onUpdateAvailable((available) => {
    updateBadge.hidden = !available;
  });
  
  btnSettings.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('synth:toggleSettings'));
  });

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
  const shouldHideFullscreen = () => !canFullscreen;

  const applyPressedState = () => {
    btnPan.setAttribute('aria-pressed', String(Boolean(navLocks.panLocked)));
    btnZoom.setAttribute('aria-pressed', String(Boolean(navLocks.zoomLocked)));
    btnFs.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));

    // Actualizar tooltips dinámicos
    setButtonTooltip(btnPan, t(navLocks.panLocked ? 'quickbar.pan.unlock' : 'quickbar.pan.lock'));
    setButtonTooltip(btnZoom, t(navLocks.zoomLocked ? 'quickbar.zoom.unlock' : 'quickbar.zoom.lock'));
    setButtonTooltip(btnFs, t(document.fullscreenElement ? 'quickbar.fullscreen.exit' : 'quickbar.fullscreen'));

    btnPan.classList.toggle('is-active', Boolean(navLocks.panLocked));
    btnZoom.classList.toggle('is-active', Boolean(navLocks.zoomLocked));
    btnFs.classList.toggle('is-active', Boolean(document.fullscreenElement));

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
    setButtonTooltip(tab, t(expanded ? 'quickbar.close' : 'quickbar.open'));
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

  // Handler del botón de MUTE global
  let isMuted = false;
  
  function updateMuteButton(muted) {
    isMuted = muted;
    btnMute.innerHTML = iconSvg(muted ? 'ti-volume-off' : 'ti-volume');
    setButtonTooltip(btnMute, t(muted ? 'quickbar.unmute' : 'quickbar.mute'));
    btnMute.setAttribute('aria-pressed', String(muted));
    btnMute.classList.toggle('is-muted', muted);
  }
  
  btnMute.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('synth:toggleMute'));
  });
  
  // Escuchar cambios de estado de mute desde engine
  document.addEventListener('synth:muteChanged', (e) => {
    updateMuteButton(e.detail?.muted ?? false);
  });
  
  // Inicializar sistema de atajos de teclado personalizables
  keyboardShortcuts.init();

  // Botón de grabación de audio
  const btnRecord = document.createElement('button');
  btnRecord.type = 'button';
  btnRecord.className = 'mobile-quickbar__btn';
  btnRecord.id = 'btnRecord';
  setButtonTooltip(btnRecord, t('quickbar.record'));
  btnRecord.innerHTML = iconSvg('ti-circle');
  
  let isRecording = false;
  
  function updateRecordButton(recording) {
    isRecording = recording;
    btnRecord.innerHTML = iconSvg(recording ? 'ti-player-stop' : 'ti-circle');
    setButtonTooltip(btnRecord, t(recording ? 'quickbar.stopRecording' : 'quickbar.record'));
    btnRecord.setAttribute('aria-pressed', String(recording));
    btnRecord.classList.toggle('is-recording', recording);
  }
  
  btnRecord.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('synth:toggleRecording'));
  });
  
  // Escuchar cambios de estado de grabación
  document.addEventListener('synth:recordingChanged', (e) => {
    updateRecordButton(e.detail?.recording ?? false);
  });

  // Botón de reset (Init)
  const btnReset = document.createElement('button');
  btnReset.type = 'button';
  btnReset.className = 'mobile-quickbar__btn mobile-quickbar__btn--danger';
  btnReset.id = 'btnReset';
  setButtonTooltip(btnReset, t('quickbar.reset'));
  btnReset.innerHTML = iconSvg('ti-refresh');
  
  btnReset.addEventListener('click', () => {
    const confirmed = confirm(t('settings.reset.confirm'));
    if (confirmed) {
      document.dispatchEvent(new CustomEvent('synth:resetToDefaults'));
    }
  });

  group.appendChild(btnPan);
  group.appendChild(btnZoom);
  group.appendChild(btnPatches);
  group.appendChild(btnRecord);
  group.appendChild(btnReset);
  group.appendChild(btnFs);
  group.appendChild(btnSettings);

  // Grupo fijo: mute + tab (siempre visibles)
  fixedGroup.appendChild(btnMute);
  fixedGroup.appendChild(tab);

  bar.appendChild(group);
  bar.appendChild(fixedGroup);
  document.body.appendChild(bar);

  applyPressedState();
  
  // Configurar long-press para tooltips en móvil
  setupAllLongPressTooltips([
    btnMute, tab, btnPan, btnZoom, btnPatches, 
    btnRecord, btnReset, btnFs, btnSettings
  ]);

  // Actualizar tooltips cuando cambie el idioma
  onLocaleChange(() => {
    setButtonTooltip(btnMute, t(isMuted ? 'quickbar.unmute' : 'quickbar.mute'));
    setButtonTooltip(tab, t(expanded ? 'quickbar.close' : 'quickbar.open'));
    setButtonTooltip(btnPatches, t('quickbar.patches'));
    setButtonTooltip(btnRecord, t(isRecording ? 'quickbar.stopRecording' : 'quickbar.record'));
    setButtonTooltip(btnReset, t('quickbar.reset'));
    setButtonTooltip(btnSettings, t('quickbar.settings'));
    applyPressedState(); // Actualiza pan, zoom, fullscreen
  });
}

/**
 * Muestra un hint de orientación para dispositivos en portrait.
 */
let orientationHintDismissed = false;

export function ensureOrientationHint() {
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
  hint.textContent = t('orientation.hint');
  requestAnimationFrame(() => {
    hint.classList.remove('hide');
    hint.classList.add('show');
  });
  setTimeout(() => dismissOrientationHint(), 4500);
}

export function dismissOrientationHint() {
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
