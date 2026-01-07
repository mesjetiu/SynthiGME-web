/**
 * Sistema de notificaciones toast.
 * 
 * Muestra mensajes temporales de feedback al usuario.
 * Usa el mismo estilo que resolution-toast para consistencia visual.
 * 
 * @module ui/toast
 */

let toastTimeout = null;

/**
 * Muestra un toast temporal de feedback.
 * @param {string} message - Mensaje a mostrar
 * @param {number} [duration=2000] - Duración en ms antes de ocultar
 */
export function showToast(message, duration = 2000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'resolution-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('resolution-toast--visible');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('resolution-toast--visible');
  }, duration);
}
