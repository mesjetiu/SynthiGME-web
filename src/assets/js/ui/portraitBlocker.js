/**
 * Bloqueador de orientación portrait.
 * 
 * Muestra un overlay cuando el dispositivo está en orientación vertical,
 * sugiriendo al usuario que gire a horizontal para mejor experiencia.
 * El usuario puede cerrar el aviso y no se mostrará más durante la sesión.
 * 
 * @module ui/portraitBlocker
 */

import { t, onLocaleChange } from '../i18n/index.js';

let dismissed = false;

/**
 * Inicializa el bloqueador de orientación portrait.
 * Busca el elemento #portraitBlocker en el DOM y configura
 * los listeners para mostrar/ocultar según la orientación.
 */
export function initPortraitBlocker() {
  const blocker = document.getElementById('portraitBlocker');
  if (!blocker) return;
  
  const closeBtn = blocker.querySelector('.portrait-blocker__close');
  const messageEl = blocker.querySelector('.portrait-blocker__message');
  
  // Función para actualizar los textos según el idioma actual
  const updateTexts = () => {
    if (messageEl) messageEl.textContent = t('orientation.blocker');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('orientation.blocker.dismiss'));
  };
  
  // Aplicar traducciones iniciales y suscribirse a cambios de idioma
  updateTexts();
  onLocaleChange(updateTexts);
  
  closeBtn?.addEventListener('click', () => {
    dismissed = true;
    blocker.classList.remove('portrait-blocker--visible');
    blocker.setAttribute('aria-hidden', 'true');
  });
  
  // Escuchar cambios de orientación
  const mq = window.matchMedia('(orientation: portrait)');
  
  const updateVisibility = () => {
    if (mq.matches && !dismissed) {
      blocker.classList.add('portrait-blocker--visible');
      blocker.setAttribute('aria-hidden', 'false');
    } else {
      blocker.classList.remove('portrait-blocker--visible');
      blocker.setAttribute('aria-hidden', 'true');
    }
  };
  
  mq.addEventListener('change', updateVisibility);
  updateVisibility();
}
