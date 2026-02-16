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
  // output-channel-module y panel7-joystick antes de synth-module para capturar el módulo específico
  const moduleEl = target.closest(
    '.sgme-osc, .noise-generator, .random-voltage, .output-channel-module, .panel7-joystick, .synth-module, .input-amplifiers-module'
  );
  if (!moduleEl) return null;
  
  const id = moduleEl.id;
  if (!id) return null;
  
  // Extraer nombre visible: data-module-name (ej: joystick) o header text o fallback a id
  const header = moduleEl.querySelector(
    '.sgme-osc__header, .synth-module__header, .noise-generator__header, .random-voltage__header, .input-amplifiers__header'
  );
  const name = moduleEl.dataset.moduleName || header?.textContent?.trim() || id;
  
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
  
  const moduleEl = moduleInfo.element;
  
  // ── Joystick: detectar pad o knob de rango ──
  if (moduleEl.classList.contains('panel7-joystick')) {
    const pad = target.closest('.panel7-joystick-pad');
    if (pad) {
      return { label: 'Joystick', knobIndex: -1, controlType: 'pad', moduleId: moduleInfo.id };
    }
    const knobWrapper = target.closest('.knob-wrapper');
    if (knobWrapper && knobWrapper.dataset.knob) {
      const knobKey = knobWrapper.dataset.knob;
      const label = knobKey === 'rangeY' ? 'Range Y' : knobKey === 'rangeX' ? 'Range X' : 'Range';
      return { label, knobIndex: -1, controlType: 'knob', controlKey: knobKey, moduleId: moduleInfo.id };
    }
    return null;
  }

  // ── Output channel: detectar slider, knob-wrap o switch ──
  if (moduleEl.classList.contains('output-channel-module')) {
    // Slider (fader de nivel)
    const sliderWrap = target.closest('.output-channel__slider-wrap');
    if (sliderWrap) {
      return { label: 'Level', knobIndex: -1, controlType: 'slider', moduleId: moduleInfo.id };
    }
    // Knobs (filter, pan) dentro de output-channel__knob-wrap
    const knobWrap = target.closest('.output-channel__knob-wrap');
    if (knobWrap) {
      const knobName = knobWrap.dataset.knob; // 'filter' o 'pan'
      const label = knobName ? knobName.charAt(0).toUpperCase() + knobName.slice(1) : 'Knob';
      return { label, knobIndex: -1, controlType: 'knob', controlKey: knobName, moduleId: moduleInfo.id };
    }
    // Switch on/off
    const switchWrap = target.closest('.output-channel__switch-wrap');
    if (switchWrap) {
      return { label: 'Power', knobIndex: -1, controlType: 'switch', moduleId: moduleInfo.id };
    }
    return null;
  }
  
  // ── Osciladores: knobs en array por índice ──
  // Buscar el knob-shell más cercano
  const shellSelectors = '.sgme-osc__knob-shell, .noise-generator__knob-shell, .random-voltage__knob-shell';
  const shell = target.closest(shellSelectors) || target.closest('[class*="__knob-shell"]');
  if (!shell) return null;
  
  const isOscillator = moduleEl.classList.contains('sgme-osc');
  
  if (isOscillator) {
    const shellsContainer = moduleEl.querySelector('.sgme-osc__knobs');
    if (!shellsContainer) return null;
    const allShells = Array.from(shellsContainer.children);
    const knobIndex = allShells.indexOf(shell);
    if (knobIndex < 0) return null;
    
    const labelsRow = moduleEl.querySelector('.sgme-osc__labels');
    const labelSpans = labelsRow ? Array.from(labelsRow.children) : [];
    const label = labelSpans[knobIndex]?.textContent?.trim() || `Knob ${knobIndex + 1}`;
    
    return { label, knobIndex, moduleId: moduleInfo.id };
  }
  
  // ── ModuleUI (noise, random voltage, etc.): knobs por clave ──
  const labelEl = shell.querySelector('[class*="__knob-label"]');
  const label = labelEl?.textContent?.trim() || '';
  
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
      t('pip.attach'),
      () => { hideContextMenu(); onAttach?.(panelId); }
    ));
  } else {
    menu.appendChild(createMenuItem(
      ICON_DETACH,
      t('pip.detach'),
      () => { hideContextMenu(); onDetach?.(panelId); }
    ));
  }
  
  // ── Separador ──
  menu.appendChild(createSeparator());
  
  // ── Opción 2: Reiniciar panel ──
  menu.appendChild(createMenuItem(
    ICON_RESET,
    t('contextMenu.resetPanel'),
    () => {
      hideContextMenu();
      dispatchReset('panel', { panelId });
    }
  ));
  
  // ── Opción 3: Reiniciar módulo (solo si se detectó) ──
  if (moduleInfo) {
    menu.appendChild(createMenuItem(
      ICON_RESET,
      t('contextMenu.resetModule', { name: moduleInfo.name }),
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
      t('contextMenu.resetControl', { name: controlInfo.label }),
      () => {
        hideContextMenu();
        dispatchReset('control', { 
          panelId, 
          moduleId: controlInfo.moduleId, 
          knobIndex: controlInfo.knobIndex,
          controlType: controlInfo.controlType,
          controlKey: controlInfo.controlKey,
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

  // Cerrar al hacer pointer/touch fuera (captura para funcionar aunque haya stopPropagation en PiP)
  const closeOnPointerDown = (e) => {
    if (activeContextMenu && activeContextMenu.contains(e.target)) return;
    hideContextMenu();
  };

  // Cerrar con Escape
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideContextMenu();
    }
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
    document.removeEventListener('pointerdown', closeOnPointerDown, true);
    document.removeEventListener('touchstart', closeOnPointerDown, true);
    document.removeEventListener('keydown', closeOnEscape);
    cleanupListeners = null;
  };
  
  cleanupListeners = cleanup;
  
  // Delay antes de registrar los listeners de cierre.
  // En touch, el finger-lift tras un long-press genera touchend/pointerup/click
  // que llegarían inmediatamente si el delay es demasiado corto.
  // 300ms asegura que esos eventos sintéticos ya pasaron antes de escuchar.
  const closeDelay = ('ontouchstart' in window) ? 300 : 10;
  
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
    document.addEventListener('contextmenu', closeOnContextMenu);
    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('touchstart', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
  }, closeDelay);
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
