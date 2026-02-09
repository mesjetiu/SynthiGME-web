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
 * Defaults internos para módulos (fallback si el blueprint no define noiseUI, etc.).
 * @private
 */
const FALLBACK_MODULE_UI = {
  knobSize: 40,
  knobInnerPct: 76,
  knobGap: [8],
  knobRowOffsetX: 0,
  knobRowOffsetY: 0,
  knobOffsets: [0, 0]
};

/**
 * Defaults internos (fallback si el blueprint no define oscillatorUI).
 * Solo se usan si el blueprint no tiene la sección oscillatorUI.
 * @private
 */
const FALLBACK_OSC_UI = {
  knobSize: 42,
  knobInnerPct: 78,
  knobGap: [8, 8, 8, 8, 8, 8],
  knobRowOffsetX: 0,
  knobRowOffsetY: -6,
  knobOffsets: [0, 0, 0, 0, 0, 0, 0],
  switchOffset: { leftPercent: 36, topPx: 6 },
  slotOffset: { x: 0, y: 0 }
};

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
  
  // Configuración visual interior de cada oscilador (defaults generales)
  const oscUIDefaults = {
    ...FALLBACK_OSC_UI,
    ...panel3Blueprint?.oscillatorUI
  };
  
  return {
    oscSize,
    padding: 6,
    gap,
    airOuter,
    airOuterY,
    rowsPerColumn,
    topOffset,
    reservedHeight,
    // Defaults de UI interior (consumidos por _buildOscillatorPanel)
    oscUIDefaults
  };
}

/**
 * Resuelve la configuración visual interior para un oscilador concreto.
 * Hace merge de: FALLBACK → oscillatorUI (defaults) → slot.ui (overrides).
 *
 * Merge shallow: las propiedades escalares del override ganan; para objetos
 * anidados (switchOffset, slotOffset) se hace merge un nivel.
 *
 * @param {Object} defaults - oscillatorUI del blueprint (ya mergeado con FALLBACK)
 * @param {Object} [slotUI] - overrides del slot (oscillatorSlots[i].ui)
 * @returns {Object} Configuración final para este oscilador
 */
export function resolveOscillatorUI(defaults, slotUI) {
  if (!slotUI) return { ...defaults };

  return {
    ...defaults,
    ...slotUI,
    // Merge un nivel para sub-objetos
    switchOffset: {
      ...(defaults.switchOffset || FALLBACK_OSC_UI.switchOffset),
      ...(slotUI.switchOffset || {})
    },
    slotOffset: {
      ...(defaults.slotOffset || FALLBACK_OSC_UI.slotOffset),
      ...(slotUI.slotOffset || {})
    },
    // Arrays: si el slot los redefine, ganan enteros (no se mezclan)
    knobOffsets: slotUI.knobOffsets || defaults.knobOffsets || FALLBACK_OSC_UI.knobOffsets,
    knobGap: slotUI.knobGap || defaults.knobGap || FALLBACK_OSC_UI.knobGap
  };
}

/**
 * Devuelve los defaults de UI para Noise Generators del blueprint.
 * @returns {Object} Defaults mergeados (FALLBACK_MODULE_UI → noiseUI)
 */
export function getNoiseUIDefaults() {
  return {
    ...FALLBACK_MODULE_UI,
    ...panel3Blueprint?.noiseUI
  };
}

/**
 * Resuelve la configuración visual para un módulo (Noise, Random CV, etc.).
 * Merge: FALLBACK_MODULE_UI → defaults (noiseUI) → module.ui (overrides).
 *
 * @param {Object} defaults - noiseUI del blueprint (ya mergeado con FALLBACK)
 * @param {Object} [moduleUI] - overrides del módulo (modules.noise1.ui)
 * @returns {Object} Configuración final para este módulo
 */
export function resolveModuleUI(defaults, moduleUI) {
  if (!moduleUI) return { ...defaults };

  return {
    ...defaults,
    ...moduleUI,
    knobOffsets: moduleUI.knobOffsets || defaults.knobOffsets || FALLBACK_MODULE_UI.knobOffsets,
    knobGap: moduleUI.knobGap || defaults.knobGap || FALLBACK_MODULE_UI.knobGap
  };
}
