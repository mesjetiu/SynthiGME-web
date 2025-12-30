// Módulo de barra de acciones rápidas para móvil
// Controles de zoom, pan, pantalla completa y modo nitidez

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

  // Selector de resolución (1x, 2x, 3x)
  const resolutionFactors = [1, 2, 3];
  let currentResIndex = 0; // Por defecto 1x
  
  const btnResolution = document.createElement('button');
  btnResolution.type = 'button';
  btnResolution.className = 'mobile-quickbar__btn mobile-quickbar__btn--text';
  btnResolution.setAttribute('aria-label', 'Resolución de renderizado');
  btnResolution.textContent = '1×';
  
  // Toast para feedback visual
  const showResolutionToast = (factor) => {
    let toast = document.getElementById('resolutionToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'resolutionToast';
      toast.className = 'resolution-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = `Resolución: ${factor}×`;
    toast.classList.add('resolution-toast--visible');
    setTimeout(() => {
      toast.classList.remove('resolution-toast--visible');
    }, 1500);
  };

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

    btnPan.classList.toggle('is-active', Boolean(navLocks.panLocked));
    btnZoom.classList.toggle('is-active', Boolean(navLocks.zoomLocked));
    btnFs.classList.toggle('is-active', Boolean(document.fullscreenElement));
    
    // Actualizar texto del botón de resolución
    const currentFactor = resolutionFactors[currentResIndex];
    btnResolution.textContent = `${currentFactor}×`;
    btnResolution.classList.toggle('is-active', currentFactor > 1);

    btnPan.hidden = !isCoarse;
    btnPan.disabled = !isCoarse;
    btnZoom.hidden = !isCoarse;
    btnZoom.disabled = !isCoarse;

    // Ocultar selector de resolución en Firefox (no lo necesita)
    const isFirefox = window.__synthIsFirefox ?? /Firefox\/\d+/.test(navigator.userAgent);
    btnResolution.hidden = isFirefox;
    btnResolution.disabled = isFirefox;

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

  btnResolution.addEventListener('click', () => {
    // Ciclar: 1x → 2x → 3x → 1x
    currentResIndex = (currentResIndex + 1) % resolutionFactors.length;
    const newFactor = resolutionFactors[currentResIndex];
    
    // Notificar al sistema de navegación
    if (typeof window.__synthSetResolutionFactor === 'function') {
      window.__synthSetResolutionFactor(newFactor);
    }
    
    // Mostrar toast con feedback
    showResolutionToast(newFactor);
    
    applyPressedState();
  });

  document.addEventListener('fullscreenchange', applyPressedState);
  displayModeQueries.forEach(mq => mq.addEventListener('change', applyPressedState));

  group.appendChild(btnPan);
  group.appendChild(btnZoom);
  group.appendChild(btnResolution);
  group.appendChild(btnFs);

  bar.appendChild(group);
  bar.appendChild(tab);
  document.body.appendChild(bar);

  applyPressedState();
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
  hint.textContent = 'Gira el dispositivo en posición horizontal para una mejor experiencia de uso del sintetizador';
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
