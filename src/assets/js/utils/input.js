// Utilidades para manejo de input (touch, pointer, etc.)

/**
 * Determina si una interacción de pointer debe ser bloqueada.
 * 
 * Bloquea eventos touch cuando hay un gesto de navegación activo
 * (pan/zoom del viewport) para evitar conflictos entre la navegación
 * y los controles interactivos (knobs, faders, joystick).
 * 
 * @param {PointerEvent} ev - Evento de pointer a evaluar
 * @returns {boolean} true si la interacción debe ser ignorada
 * 
 * @example
 * element.addEventListener('pointerdown', (ev) => {
 *   if (shouldBlockInteraction(ev)) return;
 *   // ... manejar interacción normal
 * });
 */
export function shouldBlockInteraction(ev) {
  return ev.pointerType === 'touch' && (window.__synthNavGestureActive || window.__synthPipGestureActive);
}

/**
 * Determina si hay un gesto de navegación activo.
 * Útil para bloquear interacciones que no tienen PointerEvent disponible.
 * Incluye gestos tanto del viewport principal como de ventanas PiP.
 * 
 * @returns {boolean} true si hay navegación en progreso
 */
export function isNavGestureActive() {
  return !!(window.__synthNavGestureActive || window.__synthPipGestureActive);
}
