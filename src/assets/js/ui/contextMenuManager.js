/**
 * ContextMenuManager - Menú contextual jerárquico para paneles del sintetizador.
 * 
 * Muestra opciones contextuales según dónde haga clic el usuario:
 * - Extraer/Devolver panel (PiP)
 * - Reiniciar panel completo
 * - Reiniciar módulo específico
 * - Reiniciar control individual (knob, slider, switch)
 * 
 * Funciona tanto en paneles normales como en paneles en modo PiP.
 * 
 * @module ui/contextMenuManager
 */

import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('ContextMenu');

/** Menú contextual activo */
let activeContextMenu = null;

/** Listeners pendientes de cleanup */
let cleanupListeners = null;

// ─────────────────────────────────────────────────────────────────────────────
// SVG ICONS
// ─────────────────────────────────────────────────────────────────────────────

const ICON_DETACH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <path d="M9 3v18"/>
  <path d="M14 9l3 3-3 3"/>
</svg>`;

const ICON_ATTACH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <path d="M9 3v18"/>
  <path d="M14 9l-3 3 3 3"/>
</svg>`;

const ICON_RESET = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 12a9 9 0 1 1 3 6.74"/>
  <polyline points="3 22 3 16 9 16"/>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// DETECCIÓN DE CONTEXTO (módulo y control bajo el cursor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta el módulo bajo el elemento clicado.
 * Busca el ancestro más cercano que sea un módulo reconocido.
 * 
 * @param {HTMLElement} target - Elemento DOM clicado
 * @returns {{ id: string, name: string, element: HTMLElement } | null}
 */
function detectModule(target) {
  // Selectores de módulos conocidos (más específico primero)
  const moduleEl = target.closest('.sgme-osc, .noise-generator, .random-voltage, .synth-module, .input-amplifiers-module');
  if (!moduleEl) return null;
  
  const id = moduleEl.id;
  if (!id) return null;
  
  // Extraer nombre visible del header
  const header = moduleEl.querySelector(
    '.sgme-osc__header, .synth-module__header, .noise-generator__header, .random-voltage__header, .input-amplifiers__header'
  );
  const name = header?.textContent?.trim() || id;
  
  return { id, name, element: moduleEl };
}

/**
 * Detecta el control (knob) bajo el elemento clicado.
 * 
 * @param {HTMLElement} target - Elemento DOM clicado
 * @param {{ id: string, name: string, element: HTMLElement } | null} moduleInfo - Info del módulo
 * @returns {{ label: string, knobIndex: number, moduleId: string } | null}
 */
function detectControl(target, moduleInfo) {
  if (!moduleInfo) return null;
  
  // Buscar el knob-shell más cercano (contiene knob + label + value)
  const shellSelectors = '.sgme-osc__knob-shell, .noise-generator__knob-shell, .random-voltage__knob-shell';
  const shell = target.closest(shellSelectors) || target.closest('[class*="__knob-shell"]');
  if (!shell) return null;
  
  // Para osciladores: los knobs están en un array, usar índice
  const moduleEl = moduleInfo.element;
  const isOscillator = moduleEl.classList.contains('sgme-osc');
  
  if (isOscillator) {
    // Buscar el label en la fila de labels (posición del shell = índice)
    const shellsContainer = moduleEl.querySelector('.sgme-osc__knobs');
    if (!shellsContainer) return null;
    const allShells = Array.from(shellsContainer.children);
    const knobIndex = allShells.indexOf(shell);
    if (knobIndex < 0) return null;
    
    // El label del oscilador está en la fila de labels (sgme-osc__labels)
    const labelsRow = moduleEl.querySelector('.sgme-osc__labels');
    const labelSpans = labelsRow ? Array.from(labelsRow.children) : [];
    const label = labelSpans[knobIndex]?.textContent?.trim() || `Knob ${knobIndex + 1}`;
    
    return { label, knobIndex, moduleId: moduleInfo.id };
  }
  
  // Para ModuleUI (noise, random voltage, etc.): buscar el label dentro del shell
  const labelEl = shell.querySelector('[class*="__knob-label"]');
  const label = labelEl?.textContent?.trim() || '';
  
  // Calcular índice: buscar entre hermanos
  const knobsRow = shell.parentElement;
  const allShells = knobsRow ? Array.from(knobsRow.children).filter(
    el => el.classList.contains(`${moduleEl.className.split(' ')[0]}__knob-shell`) || 
          el.className.includes('__knob-shell')
  ) : [];
  const knobIndex = allShells.indexOf(shell);
  
  return { label: label || `Knob ${knobIndex + 1}`, knobIndex, moduleId: moduleInfo.id };
}

/**
 * Detecta el panelId desde un elemento DOM (busca ancestro .panel).
 * @param {HTMLElement} target
 * @returns {string|null}
 */
function detectPanelId(target) {
  const panel = target.closest('.panel');
  return panel?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCCIÓN DEL MENÚ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Muestra el menú contextual en la posición dada.
 * 
 * @param {Object} options
 * @param {number} options.x - Posición X (clientX)
 * @param {number} options.y - Posición Y (clientY)
 * @param {string} options.panelId - ID del panel
 * @param {boolean} options.isPipped - Si el panel está en modo PiP
 * @param {HTMLElement} options.target - Elemento DOM clicado (para detectar módulo/control)
 * @param {Function} options.onDetach - Callback para extraer panel a PiP
 * @param {Function} options.onAttach - Callback para devolver panel de PiP
 */
export function showContextMenu({ x, y, panelId, isPipped, target, onDetach, onAttach }) {
  hideContextMenu();
  
  const moduleInfo = detectModule(target);
  const controlInfo = detectControl(target, moduleInfo);
  
  const menu = document.createElement('div');
  menu.className = 'pip-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  // ── Opción 1: Extraer / Devolver panel ──
  if (isPipped) {
    menu.appendChild(createMenuItem(
      ICON_ATTACH,
      t('pip.attach', 'Devolver panel'),
      () => { hideContextMenu(); onAttach?.(panelId); }
    ));
  } else {
    menu.appendChild(createMenuItem(
      ICON_DETACH,
      t('pip.detach', 'Extraer panel'),
      () => { hideContextMenu(); onDetach?.(panelId); }
    ));
  }
  
  // ── Separador ──
  menu.appendChild(createSeparator());
  
  // ── Opción 2: Reiniciar panel ──
  menu.appendChild(createMenuItem(
    ICON_RESET,
    t('contextMenu.resetPanel', 'Reiniciar panel'),
    () => {
      hideContextMenu();
      dispatchReset('panel', { panelId });
    }
  ));
  
  // ── Opción 3: Reiniciar módulo (solo si se detectó) ──
  if (moduleInfo) {
    menu.appendChild(createMenuItem(
      ICON_RESET,
      t('contextMenu.resetModule', 'Reiniciar {name}', { name: moduleInfo.name }),
      () => {
        hideContextMenu();
        dispatchReset('module', { panelId, moduleId: moduleInfo.id, moduleName: moduleInfo.name });
      }
    ));
  }
  
  // ── Opción 4: Reiniciar control (solo si se detectó) ──
  if (controlInfo && controlInfo.label) {
    menu.appendChild(createMenuItem(
      ICON_RESET,
      t('contextMenu.resetControl', 'Reiniciar {name}', { name: controlInfo.label }),
      () => {
        hideContextMenu();
        dispatchReset('control', { 
          panelId, 
          moduleId: controlInfo.moduleId, 
          knobIndex: controlInfo.knobIndex,
          controlLabel: controlInfo.label 
        });
      }
    ));
  }
  
  document.body.appendChild(menu);
  activeContextMenu = menu;
  
  // Ajustar posición si se sale de la pantalla
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  });
  
  // Cerrar al hacer click fuera
  const closeHandler = (e) => {
    if (activeContextMenu && activeContextMenu.contains(e.target)) return;
    hideContextMenu();
  };
  
  const closeOnContextMenu = (e) => {
    // Si el click derecho es en un panel o PiP, dejar que se abra el nuevo menú
    if (e.target.closest?.('.panel') || e.target.closest?.('.pip-container')) {
      cleanup();
      return;
    }
    hideContextMenu();
  };
  
  const cleanup = () => {
    document.removeEventListener('click', closeHandler);
    document.removeEventListener('contextmenu', closeOnContextMenu);
    cleanupListeners = null;
  };
  
  cleanupListeners = cleanup;
  
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeOnContextMenu);
  }, 10);
}

/**
 * Oculta el menú contextual activo.
 */
export function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
  if (cleanupListeners) {
    cleanupListeners();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea un elemento de menú.
 */
function createMenuItem(iconSvg, text, onClick) {
  const item = document.createElement('button');
  item.className = 'pip-context-menu__item';
  item.innerHTML = `${iconSvg}<span>${text}</span>`;
  item.addEventListener('click', onClick);
  return item;
}

/**
 * Crea un separador visual.
 */
function createSeparator() {
  const sep = document.createElement('div');
  sep.className = 'pip-context-menu__separator';
  return sep;
}

/**
 * Despacha un evento custom de reinicio.
 * @param {'panel'|'module'|'control'} level
 * @param {Object} detail
 */
function dispatchReset(level, detail) {
  log.info(`Reset ${level}:`, detail);
  document.dispatchEvent(new CustomEvent('synth:resetContext', { 
    detail: { level, ...detail } 
  }));
}
