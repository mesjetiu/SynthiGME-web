/**
 * Sistema de notificaciones toast unificado.
 * 
 * Muestra mensajes temporales de feedback al usuario con niveles de severidad.
 * Un único toast visible a la vez (el nuevo reemplaza al anterior).
 * 
 * Niveles:
 * - info    (default) — feedback general, color neutro
 * - success — operación completada, verde
 * - warning — degradación/fallback, amarillo  
 * - error   — fallo de operación, rojo
 * 
 * @module ui/toast
 */

let toastTimeout = null;

/** Clases CSS por nivel */
const LEVEL_CLASSES = {
  info: '',
  success: 'toast--success',
  warning: 'toast--warning',
  error: 'toast--error'
};

/**
 * Muestra un toast temporal de feedback.
 * @param {string} message - Mensaje a mostrar
 * @param {number|Object} [optionsOrDuration=2000] - Duración en ms, o objeto de opciones
 * @param {number} [optionsOrDuration.duration=2000] - Duración en ms
 * @param {('info'|'success'|'warning'|'error')} [optionsOrDuration.level='info'] - Nivel de severidad
 */
export function showToast(message, optionsOrDuration = 2000) {
  let duration, level;
  
  if (typeof optionsOrDuration === 'object' && optionsOrDuration !== null) {
    duration = optionsOrDuration.duration ?? 2000;
    level = optionsOrDuration.level ?? 'info';
  } else {
    duration = optionsOrDuration;
    level = 'info';
  }
  
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  // Limpiar clases de nivel previas
  toast.classList.remove('toast--success', 'toast--warning', 'toast--error');
  
  // Aplicar clase de nivel
  const levelClass = LEVEL_CLASSES[level] || '';
  if (levelClass) {
    toast.classList.add(levelClass);
  }
  
  toast.textContent = message;
  toast.classList.add('toast--visible');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, duration);
}
