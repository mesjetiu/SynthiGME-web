/**
 * Bloqueador de orientación portrait.
 * 
 * Muestra un overlay cuando el dispositivo está en orientación vertical,
 * sugiriendo al usuario que gire a horizontal para mejor experiencia.
 * El usuario puede cerrar el aviso y no se mostrará más durante la sesión.
 * 
 * @module ui/portraitBlocker
 */

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
