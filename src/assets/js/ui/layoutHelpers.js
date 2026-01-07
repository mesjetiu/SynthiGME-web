/**
 * Helpers de layout para paneles.
 * 
 * Funciones utilitarias para configurar posición y layout de paneles
 * en la cuadrícula del sintetizador.
 * 
 * @module ui/layoutHelpers
 */

import panel3Blueprint from '../panelBlueprints/panel3.blueprint.js';

/**
 * Configura los atributos de posición de un panel en la cuadrícula.
 * 
 * @param {Object} panel - Panel con propiedad element
 * @param {string|null} label - Etiqueta del panel (no usado actualmente)
 * @param {Object} layout - Configuración de posición
 * @param {number} [layout.row] - Fila en la cuadrícula
 * @param {number} [layout.col] - Columna en la cuadrícula
 */
export function labelPanelSlot(panel, label, layout = {}) {
  if (!panel || !panel.element) return;

  if (layout.row) {
    panel.element.style.setProperty('--panel-row', layout.row);
    panel.element.dataset.panelRow = layout.row;
  }
  if (layout.col) {
    panel.element.style.setProperty('--panel-col', layout.col);
    panel.element.dataset.panelCol = layout.col;
  }
}

/**
 * Devuelve la especificación de layout para paneles de osciladores.
 * Lee estructura base del blueprint y parámetros del config.
 * 
 * @returns {Object} Especificación de layout combinada
 */
export function getOscillatorLayoutSpec() {
  // Leer estructura del blueprint (o usar defaults hardcoded como fallback)
  const blueprintLayout = panel3Blueprint?.layout?.oscillators || {};
  
  // Dimensiones de oscilador (blueprint o fallback)
  const oscSize = blueprintLayout.oscSize || { width: 370, height: 110 };
  
  // Layout params del blueprint
  const gap = blueprintLayout.gap || { x: 0, y: 0 };
  const airOuter = blueprintLayout.airOuter ?? 0;
  const airOuterY = blueprintLayout.airOuterY ?? 0;
  const rowsPerColumn = blueprintLayout.rowsPerColumn ?? 6;
  const topOffset = blueprintLayout.topOffset ?? 10;
  const reservedHeight = blueprintLayout.reservedHeight ?? oscSize.height;
  
  // Parámetros de UI del config (ajustes visuales)
  const padding = 6;
  const knobGap = 8;
  const switchOffset = { leftPercent: 36, topPx: 6 };
  
  return {
    oscSize,
    padding,
    gap,
    airOuter,
    airOuterY,
    rowsPerColumn,
    topOffset,
    knobGap,
    switchOffset,
    reservedHeight
  };
}
