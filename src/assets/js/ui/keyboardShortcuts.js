/**
 * Gestor centralizado de atajos de teclado
 * Permite personalización con persistencia en localStorage
 */

import { t } from '../i18n/index.js';

const STORAGE_KEY = 'synthigme-keyboard-shortcuts';

// Teclas reservadas que no pueden asignarse
const RESERVED_KEYS = ['Tab', 'Enter', 'Escape', ' ', 'Space'];

// Atajos por defecto
const DEFAULT_SHORTCUTS = {
  mute: { key: 'm', shift: false, ctrl: false, alt: false },
  record: { key: 'r', shift: false, ctrl: false, alt: false },
  patches: { key: 'p', shift: false, ctrl: false, alt: false },
  settings: { key: 's', shift: false, ctrl: false, alt: false },
  fullscreen: { key: 'f', shift: false, ctrl: false, alt: false },
  reset: { key: 'i', shift: true, ctrl: false, alt: false },
  // Navegación de paneles
  panel1: { key: '1', shift: false, ctrl: false, alt: false },
  panel2: { key: '2', shift: false, ctrl: false, alt: false },
  panel3: { key: '3', shift: false, ctrl: false, alt: false },
  panel4: { key: '4', shift: false, ctrl: false, alt: false },
  panel5: { key: '5', shift: false, ctrl: false, alt: false },
  panel6: { key: '6', shift: false, ctrl: false, alt: false },
  panelOutput: { key: '7', shift: false, ctrl: false, alt: false },
  overview: { key: '0', shift: false, ctrl: false, alt: false }
};

// Mapeo de acciones a eventos/handlers
const SHORTCUT_ACTIONS = {
  mute: () => document.dispatchEvent(new CustomEvent('synth:toggleMute')),
  record: () => document.dispatchEvent(new CustomEvent('synth:toggleRecording')),
  patches: () => document.dispatchEvent(new CustomEvent('synth:togglePatches')),
  settings: () => document.dispatchEvent(new CustomEvent('synth:toggleSettings')),
  fullscreen: async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('No se pudo alternar la pantalla completa.', error);
    }
  },
  reset: () => {
    const confirmed = confirm(t('settings.reset.confirm'));
    if (confirmed) {
      document.dispatchEvent(new CustomEvent('synth:resetToDefaults'));
    }
  },
  // Navegación de paneles
  panel1: () => window.__synthAnimateToPanel?.('panel-1'),
  panel2: () => window.__synthAnimateToPanel?.('panel-2'),
  panel3: () => window.__synthAnimateToPanel?.('panel-3'),
  panel4: () => window.__synthAnimateToPanel?.('panel-4'),
  panel5: () => window.__synthAnimateToPanel?.('panel-5'),
  panel6: () => window.__synthAnimateToPanel?.('panel-6'),
  panelOutput: () => window.__synthAnimateToPanel?.('panel-output'),
  overview: () => window.__synthAnimateToPanel?.(null)
};

/**
 * Clase singleton para gestionar atajos de teclado
 */
class KeyboardShortcutsManager {
  constructor() {
    this.shortcuts = this._load();
    this._boundHandler = this._handleKeyDown.bind(this);
    this._listeners = new Set();
  }

  /**
   * Carga shortcuts de localStorage o usa defaults
   */
  _load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge con defaults por si hay nuevas acciones
        return { ...DEFAULT_SHORTCUTS, ...parsed };
      }
    } catch (e) {
      console.warn('[KeyboardShortcuts] Error loading:', e);
    }
    return { ...DEFAULT_SHORTCUTS };
  }

  /**
   * Guarda shortcuts en localStorage
   */
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.shortcuts));
    } catch (e) {
      console.warn('[KeyboardShortcuts] Error saving:', e);
    }
  }

  /**
   * Inicia la escucha de eventos de teclado
   */
  init() {
    document.addEventListener('keydown', this._boundHandler);
    
    // Mostrar badges de panel al pulsar Ctrl
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Control' && !e.repeat) {
        document.body.classList.add('show-panel-shortcuts');
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Control') {
        document.body.classList.remove('show-panel-shortcuts');
      }
    });
    // Ocultar si se pierde el foco de la ventana
    window.addEventListener('blur', () => {
      document.body.classList.remove('show-panel-shortcuts');
    });
  }

  /**
   * Detiene la escucha (para cleanup)
   */
  destroy() {
    document.removeEventListener('keydown', this._boundHandler);
  }

  /**
   * Maneja eventos keydown
   */
  _handleKeyDown(e) {
    // Ignorar si está en un input/textarea/select
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    
    // Ignorar teclas reservadas
    if (RESERVED_KEYS.includes(e.key)) return;

    // Buscar si algún shortcut coincide
    for (const [actionId, binding] of Object.entries(this.shortcuts)) {
      if (this._matchesBinding(e, binding)) {
        e.preventDefault();
        const action = SHORTCUT_ACTIONS[actionId];
        if (action) action();
        return;
      }
    }
  }

  /**
   * Comprueba si un evento coincide con un binding
   */
  _matchesBinding(e, binding) {
    if (!binding || !binding.key) return false;
    
    const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();
    const shiftMatch = e.shiftKey === Boolean(binding.shift);
    const ctrlMatch = (e.ctrlKey || e.metaKey) === Boolean(binding.ctrl);
    const altMatch = e.altKey === Boolean(binding.alt);
    
    return keyMatch && shiftMatch && ctrlMatch && altMatch;
  }

  /**
   * Obtiene todos los shortcuts actuales
   */
  getAll() {
    return { ...this.shortcuts };
  }

  /**
   * Obtiene un shortcut específico
   */
  get(actionId) {
    return this.shortcuts[actionId] ? { ...this.shortcuts[actionId] } : null;
  }

  /**
   * Establece un shortcut
   * @returns {{ success: boolean, conflict?: string }} 
   */
  set(actionId, binding) {
    // Validar tecla reservada
    if (RESERVED_KEYS.includes(binding.key)) {
      return { success: false, error: 'reserved' };
    }

    // Comprobar conflictos
    const conflict = this._findConflict(actionId, binding);
    if (conflict) {
      return { success: false, conflict };
    }

    this.shortcuts[actionId] = { ...binding };
    this._save();
    this._notifyListeners();
    return { success: true };
  }

  /**
   * Busca si hay conflicto con otro shortcut
   */
  _findConflict(actionId, newBinding) {
    for (const [id, existing] of Object.entries(this.shortcuts)) {
      if (id === actionId) continue;
      if (!existing || !existing.key) continue;
      
      const sameKey = existing.key.toLowerCase() === newBinding.key.toLowerCase();
      const sameShift = Boolean(existing.shift) === Boolean(newBinding.shift);
      const sameCtrl = Boolean(existing.ctrl) === Boolean(newBinding.ctrl);
      const sameAlt = Boolean(existing.alt) === Boolean(newBinding.alt);
      
      if (sameKey && sameShift && sameCtrl && sameAlt) {
        return id;
      }
    }
    return null;
  }

  /**
   * Borra un shortcut (lo deja sin asignar)
   */
  clear(actionId) {
    if (this.shortcuts[actionId]) {
      this.shortcuts[actionId] = { key: '', shift: false, ctrl: false, alt: false };
      this._save();
      this._notifyListeners();
    }
  }

  /**
   * Restaura todos los shortcuts a valores por defecto
   */
  resetToDefaults() {
    this.shortcuts = { ...DEFAULT_SHORTCUTS };
    this._save();
    this._notifyListeners();
  }

  /**
   * Formatea un binding para mostrar (ej: "Shift+I")
   */
  formatBinding(binding) {
    if (!binding || !binding.key) return '—';
    
    const parts = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    parts.push(binding.key.toUpperCase());
    
    return parts.join('+');
  }

  /**
   * Suscribirse a cambios
   */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Notifica a los listeners
   */
  _notifyListeners() {
    this._listeners.forEach(cb => cb(this.shortcuts));
  }

  /**
   * Lista de IDs de acciones disponibles
   */
  getActionIds() {
    return Object.keys(DEFAULT_SHORTCUTS);
  }

  /**
   * Comprueba si una tecla es reservada
   */
  isReservedKey(key) {
    return RESERVED_KEYS.includes(key);
  }
}

// Exportar instancia singleton
export const keyboardShortcuts = new KeyboardShortcutsManager();

// Exportar constantes útiles
export { RESERVED_KEYS, DEFAULT_SHORTCUTS };
