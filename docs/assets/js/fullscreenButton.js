/**
 * Lógica del botón de pantalla completa del HTML.
 * Extraído del inline script de index.html para cumplir con CSP.
 * 
 * Oculta el botón en modo standalone (PWA en móvil) y gestiona
 * la transición a fullscreen usando la Fullscreen API estándar.
 */
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('fullscreenBtn');
  if (!button) {
    return;
  }

  const mobileRegex = /Android|iPhone|iPad|iPod/i;
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

  const shouldHideButton = () => mobileRegex.test(navigator.userAgent || '') && isStandaloneDisplay();

  const syncVisibility = () => {
    if (shouldHideButton()) {
      button.hidden = true;
      button.disabled = true;
      return;
    }
    button.disabled = false;
    button.hidden = Boolean(document.fullscreenElement);
  };

  button.addEventListener('click', async () => {
    if (button.disabled) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        if (typeof window.__synthPrepareForFullscreen === 'function') {
          window.__synthPrepareForFullscreen(false);
        }
        await document.exitFullscreen();
        return;
      }

      if (typeof window.__synthPrepareForFullscreen === 'function') {
        window.__synthPrepareForFullscreen(true);
      }
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error('No se pudo alternar la pantalla completa.', error);
    }
  });

  document.addEventListener('fullscreenchange', syncVisibility);
  displayModeQueries.forEach(mq => mq.addEventListener('change', syncVisibility));

  syncVisibility();
});
