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

  // Selector de resolución (1x, 2x, 3x, 4x) como desplegable
  const resolutionFactors = [1, 2, 3, 4];
  
  // Recuperar resolución guardada de localStorage
  const STORAGE_KEY = 'synthigme-resolution';
  const savedFactor = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  let currentResIndex = resolutionFactors.indexOf(savedFactor) !== -1 
    ? resolutionFactors.indexOf(savedFactor) 
    : 0; // Por defecto 1x
  const initialFactor = resolutionFactors[currentResIndex];
  
  const resolutionContainer = document.createElement('div');
  resolutionContainer.className = 'resolution-selector';
  
  const btnResolution = document.createElement('button');
  btnResolution.type = 'button';
  btnResolution.className = 'mobile-quickbar__btn mobile-quickbar__btn--text';
  btnResolution.setAttribute('aria-label', 'Resolución de renderizado');
  btnResolution.setAttribute('aria-haspopup', 'true');
  btnResolution.setAttribute('aria-expanded', 'false');
  btnResolution.textContent = `${initialFactor}×`;
  
  const resolutionMenu = document.createElement('div');
  resolutionMenu.className = 'resolution-menu';
  resolutionMenu.setAttribute('role', 'menu');
  
  resolutionFactors.forEach((factor, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'resolution-menu__option' + (index === currentResIndex ? ' resolution-menu__option--active' : '');
    option.setAttribute('role', 'menuitem');
    option.textContent = `${factor}×`;
    option.dataset.factor = factor;
    option.dataset.index = index;
    resolutionMenu.appendChild(option);
  });
  
  resolutionContainer.appendChild(btnResolution);
  resolutionContainer.appendChild(resolutionMenu);
  
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
    resolutionContainer.hidden = isFirefox;

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

  // Toggle del menú de resolución
  const toggleResolutionMenu = (show) => {
    const isOpen = show ?? !resolutionMenu.classList.contains('resolution-menu--open');
    resolutionMenu.classList.toggle('resolution-menu--open', isOpen);
    btnResolution.setAttribute('aria-expanded', String(isOpen));
  };
  
  btnResolution.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleResolutionMenu();
  });
  
  // Selección de opción del menú
  resolutionMenu.addEventListener('click', (e) => {
    const option = e.target.closest('.resolution-menu__option');
    if (!option) return;
    e.stopPropagation();
    
    const newIndex = parseInt(option.dataset.index, 10);
    const newFactor = parseInt(option.dataset.factor, 10);
    
    if (newIndex !== currentResIndex) {
      currentResIndex = newIndex;
      
      // Guardar en localStorage
      localStorage.setItem(STORAGE_KEY, newFactor);
      
      // Actualizar estado activo de las opciones
      resolutionMenu.querySelectorAll('.resolution-menu__option').forEach((opt, i) => {
        opt.classList.toggle('resolution-menu__option--active', i === newIndex);
      });
      
      // Notificar al sistema de navegación
      if (typeof window.__synthSetResolutionFactor === 'function') {
        window.__synthSetResolutionFactor(newFactor);
      }
      
      // Mostrar toast con feedback
      showResolutionToast(newFactor);
      
      applyPressedState();
    }
    
    toggleResolutionMenu(false);
  });
  
  // Cerrar menú al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!resolutionContainer.contains(e.target)) {
      toggleResolutionMenu(false);
    }
  });

  document.addEventListener('fullscreenchange', applyPressedState);
  displayModeQueries.forEach(mq => mq.addEventListener('change', applyPressedState));

  // Botón de configuración de audio
  const btnAudioSettings = document.createElement('button');
  btnAudioSettings.type = 'button';
  btnAudioSettings.className = 'mobile-quickbar__btn';
  btnAudioSettings.id = 'btnAudioSettings';
  btnAudioSettings.setAttribute('aria-label', 'Configuración de audio');
  btnAudioSettings.innerHTML = iconSvg('ti-volume');
  
  btnAudioSettings.addEventListener('click', () => {
    // Emitir evento custom para que app.js lo maneje
    document.dispatchEvent(new CustomEvent('synth:toggleAudioSettings'));
  });

  group.appendChild(btnPan);
  group.appendChild(btnZoom);
  group.appendChild(resolutionContainer);
  group.appendChild(btnAudioSettings);
  group.appendChild(btnFs);

  bar.appendChild(group);
  bar.appendChild(tab);
  document.body.appendChild(bar);

  // Aplicar resolución guardada al iniciar
  if (initialFactor > 1 && typeof window.__synthSetResolutionFactor === 'function') {
    window.__synthSetResolutionFactor(initialFactor);
  }

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
