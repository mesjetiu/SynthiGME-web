/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PATCH BROWSER - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Modal para navegar, cargar, guardar y gestionar patches.
 * Diseñado para uso en performances en vivo con interfaz propia
 * (sin diálogos del sistema operativo).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { t, onLocaleChange } from '../i18n/index.js';
import { ConfirmDialog } from './confirmDialog.js';
import { InputDialog } from './inputDialog.js';
import { showToast } from './toast.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PatchBrowser');
import {
  listPatches,
  loadPatch,
  savePatch,
  deletePatch,
  renamePatch,
  exportPatchToFile,
  importPatchFromFile,
  createEmptyPatch,
  needsMigration
} from '../state/index.js';

const ICON_SPRITE = './assets/icons/ui-sprite.svg';

/**
 * Genera SVG inline para un icono del sprite.
 * @param {string} symbolId - ID del símbolo en el sprite
 * @returns {string} HTML del SVG
 */
function iconSvg(symbolId) {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <use href="${ICON_SPRITE}#${symbolId}"></use>
    </svg>
  `;
}

/**
 * Modal de navegación de patches.
 */
export class PatchBrowser {
  /**
   * @param {Object} options
   * @param {Function} [options.onLoad] - Callback cuando se carga un patch
   * @param {Function} [options.onSave] - Callback cuando se guarda el estado actual
   */
  constructor(options = {}) {
    this.onLoad = options.onLoad;
    this.onSave = options.onSave;
    
    /** @type {Array<{id: number, name: string, savedAt: string}>} */
    this.patches = [];
    
    /** @type {number|null} */
    this.selectedPatchId = null;
    
    /** @type {string} */
    this.searchQuery = '';
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.patchList = null;
    this.searchInput = null;
    this.isOpen = false;
    
    // Crear UI
    this._create();
    
    // Escuchar cambios de idioma
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
  }
  
  /**
   * Abre el modal y carga la lista de patches.
   */
  async open() {
    if (this.isOpen) return;
    this.isOpen = true;
    
    await this._loadPatches();
    this._render();
    
    this.overlay.classList.add('patch-browser-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    
    // Focus en búsqueda
    requestAnimationFrame(() => {
      this.searchInput?.focus();
    });
  }
  
  /**
   * Cierra el modal.
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('patch-browser-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.selectedPatchId = null;
  }
  
  /**
   * Alterna el estado del modal.
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  /**
   * Carga la lista de patches desde storage.
   */
  async _loadPatches() {
    try {
      this.patches = await listPatches({ sortBy: 'savedAt', descending: true });
    } catch (err) {
      log.error(' Error loading patches:', err);
      this.patches = [];
    }
  }
  
  /**
   * Crea la estructura DOM del modal.
   */
  _create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'patch-browser-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    
    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'patch-browser-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-labelledby', 'patchBrowserTitle');
    this.modal.setAttribute('aria-modal', 'true');
    
    // Header
    const header = document.createElement('div');
    header.className = 'patch-browser__header';
    
    this.titleElement = document.createElement('h2');
    this.titleElement.id = 'patchBrowserTitle';
    this.titleElement.className = 'patch-browser__title';
    this.titleElement.textContent = t('patches.title');
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'patch-browser__close';
    closeBtn.setAttribute('aria-label', t('patches.close'));
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());
    
    header.appendChild(this.titleElement);
    header.appendChild(closeBtn);
    
    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'patch-browser__toolbar';
    
    this.saveBtn = document.createElement('button');
    this.saveBtn.type = 'button';
    this.saveBtn.className = 'patch-browser__btn patch-browser__btn--primary';
    this.saveBtn.innerHTML = `${iconSvg('ti-device-floppy')} <span>${t('patches.saveCurrent')}</span>`;
    this.saveBtn.addEventListener('click', () => this._handleSave());
    
    this.importBtn = document.createElement('button');
    this.importBtn.type = 'button';
    this.importBtn.className = 'patch-browser__btn';
    this.importBtn.innerHTML = `${iconSvg('ti-upload')} <span>${t('patches.import')}</span>`;
    this.importBtn.addEventListener('click', () => this._handleImport());
    
    toolbar.appendChild(this.saveBtn);
    toolbar.appendChild(this.importBtn);
    
    // Search
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'patch-browser__search';
    searchWrapper.innerHTML = iconSvg('ti-search');
    
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'patch-browser__search-input';
    this.searchInput.placeholder = t('patches.search');
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this._render();
    });
    
    searchWrapper.appendChild(this.searchInput);
    
    // Patch list container
    this.patchList = document.createElement('div');
    this.patchList.className = 'patch-browser__list';
    
    // Actions bar
    const actionsBar = document.createElement('div');
    actionsBar.className = 'patch-browser__actions';
    
    this.loadBtn = document.createElement('button');
    this.loadBtn.type = 'button';
    this.loadBtn.className = 'patch-browser__action-btn';
    this.loadBtn.textContent = t('patches.load');
    this.loadBtn.disabled = true;
    this.loadBtn.addEventListener('click', () => this._handleLoad());
    
    this.exportBtn = document.createElement('button');
    this.exportBtn.type = 'button';
    this.exportBtn.className = 'patch-browser__action-btn';
    this.exportBtn.textContent = t('patches.export');
    this.exportBtn.disabled = true;
    this.exportBtn.addEventListener('click', () => this._handleExport());
    
    this.renameBtn = document.createElement('button');
    this.renameBtn.type = 'button';
    this.renameBtn.className = 'patch-browser__action-btn';
    this.renameBtn.textContent = t('patches.rename');
    this.renameBtn.disabled = true;
    this.renameBtn.addEventListener('click', () => this._handleRename());
    
    this.deleteBtn = document.createElement('button');
    this.deleteBtn.type = 'button';
    this.deleteBtn.className = 'patch-browser__action-btn patch-browser__action-btn--danger';
    this.deleteBtn.textContent = t('patches.delete');
    this.deleteBtn.disabled = true;
    this.deleteBtn.addEventListener('click', () => this._handleDelete());
    
    actionsBar.appendChild(this.loadBtn);
    actionsBar.appendChild(this.exportBtn);
    actionsBar.appendChild(this.renameBtn);
    actionsBar.appendChild(this.deleteBtn);
    
    // Ensamblar
    this.modal.appendChild(header);
    this.modal.appendChild(toolbar);
    this.modal.appendChild(searchWrapper);
    this.modal.appendChild(this.patchList);
    this.modal.appendChild(actionsBar);
    
    this.overlay.appendChild(this.modal);
    
    // Cerrar al hacer clic fuera
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    // Escape para cerrar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    
    document.body.appendChild(this.overlay);
  }
  
  /**
   * Renderiza la lista de patches.
   */
  _render() {
    this.patchList.innerHTML = '';
    
    const filtered = this.patches.filter(p => 
      !this.searchQuery || p.name.toLowerCase().includes(this.searchQuery)
    );
    
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'patch-browser__empty';
      empty.textContent = this.searchQuery 
        ? t('patches.search') + ': ' + this.searchQuery 
        : t('patches.empty');
      this.patchList.appendChild(empty);
      return;
    }
    
    for (const patch of filtered) {
      const item = this._createPatchItem(patch);
      this.patchList.appendChild(item);
    }
  }
  
  /**
   * Crea un elemento de patch para la lista.
   */
  _createPatchItem(patch) {
    const item = document.createElement('div');
    item.className = 'patch-browser__item';
    item.dataset.id = patch.id;
    
    if (patch.id === this.selectedPatchId) {
      item.classList.add('patch-browser__item--selected');
    }
    
    // Radio visual
    const radio = document.createElement('span');
    radio.className = 'patch-browser__radio';
    radio.innerHTML = patch.id === this.selectedPatchId ? '●' : '○';
    
    // Info
    const info = document.createElement('div');
    info.className = 'patch-browser__item-info';
    
    const name = document.createElement('div');
    name.className = 'patch-browser__item-name';
    name.textContent = patch.name;
    
    // Badge de versión si necesita migración
    if (needsMigration(patch)) {
      const badge = document.createElement('span');
      badge.className = 'patch-browser__version-badge';
      badge.textContent = '⚠️';
      badge.title = t('patches.versionWarning');
      name.appendChild(badge);
    }
    
    const date = document.createElement('div');
    date.className = 'patch-browser__item-date';
    date.textContent = this._formatDate(patch.savedAt);
    
    info.appendChild(name);
    info.appendChild(date);
    
    item.appendChild(radio);
    item.appendChild(info);
    
    // Click para seleccionar
    item.addEventListener('click', () => {
      this._selectPatch(patch.id);
    });
    
    // Doble click para cargar directamente (sin confirmar, para performances)
    item.addEventListener('dblclick', () => {
      this._selectPatch(patch.id);
      this._handleLoadDirect();
    });
    
    return item;
  }
  
  /**
   * Selecciona un patch.
   */
  _selectPatch(id) {
    this.selectedPatchId = id;
    this._render();
    this._updateActionButtons();
  }
  
  /**
   * Actualiza el estado de los botones de acción.
   */
  _updateActionButtons() {
    const hasSelection = this.selectedPatchId !== null;
    this.loadBtn.disabled = !hasSelection;
    this.exportBtn.disabled = !hasSelection;
    this.renameBtn.disabled = !hasSelection;
    this.deleteBtn.disabled = !hasSelection;
  }
  
  /**
   * Formatea una fecha ISO para mostrar.
   */
  _formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }
  
  /**
   * Muestra un toast de feedback.
   */
  _showToast(message) {
    let toast = document.getElementById('patchBrowserToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'patchBrowserToast';
      toast.className = 'patch-browser-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('patch-browser-toast--visible');
    
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('patch-browser-toast--visible');
    }, 2000);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Guarda el estado actual como nuevo patch.
   */
  async _handleSave() {
    const result = await InputDialog.show({
      title: t('patches.namePrompt'),
      placeholder: t('patches.defaultName'),
      defaultValue: t('patches.defaultName'),
      confirmText: t('patches.saveCurrent'),
      cancelText: t('common.cancel')
    });
    if (!result.confirmed || !result.value) return;
    const name = result.value;
    
    try {
      // Obtener estado actual via callback
      let patch;
      if (this.onSave) {
        const state = await this.onSave();
        patch = {
          name: name.trim(),
          ...state
        };
      } else {
        patch = createEmptyPatch(name.trim());
      }
      
      await savePatch(patch);
      await this._loadPatches();
      this._render();
      this._showToast(t('patches.saved'));
    } catch (err) {
      log.error(' Error saving:', err);
      this._showToast(t('patches.errorSaving'));
    }
  }
  
  /**
   * Carga el patch seleccionado (con confirmación).
   */
  async _handleLoad() {
    if (!this.selectedPatchId) return;
    
    const patch = this.patches.find(p => p.id === this.selectedPatchId);
    if (!patch) return;
    
    // Confirmar
    const result = await ConfirmDialog.show({
      title: t('patches.confirmLoad', { name: patch.name }),
      confirmText: t('common.yes'),
      cancelText: t('common.no')
    });
    if (!result.confirmed) return;
    
    await this._loadPatchById(this.selectedPatchId, patch.name);
  }
  
  /**
   * Carga el patch seleccionado directamente (sin confirmación, para performances).
   */
  async _handleLoadDirect() {
    if (!this.selectedPatchId) return;
    
    const patch = this.patches.find(p => p.id === this.selectedPatchId);
    if (!patch) return;
    
    await this._loadPatchById(this.selectedPatchId, patch.name);
  }
  
  /**
   * Carga un patch por su ID.
   * @param {number} id - ID del patch
   * @param {string} name - Nombre del patch (para el toast)
   */
  async _loadPatchById(id, name) {
    try {
      const fullPatch = await loadPatch(id);
      
      if (this.onLoad) {
        this.onLoad(fullPatch);
      }
      
      this.close();
      // Toast global visible incluso después de cerrar el modal
      showToast(t('patches.loadedName', { name }));
    } catch (err) {
      log.error(' Error loading:', err);
      showToast(t('patches.errorLoading'));
    }
  }
  
  /**
   * Exporta el patch seleccionado a archivo.
   */
  async _handleExport() {
    if (!this.selectedPatchId) return;
    
    try {
      const patch = await loadPatch(this.selectedPatchId);
      if (patch) {
        exportPatchToFile(patch);
        this._showToast(t('patches.exported'));
      }
    } catch (err) {
      log.error(' Error exporting:', err);
    }
  }
  
  /**
   * Renombra el patch seleccionado.
   */
  async _handleRename() {
    if (!this.selectedPatchId) return;
    
    const patch = this.patches.find(p => p.id === this.selectedPatchId);
    if (!patch) return;
    
    const result = await InputDialog.show({
      title: t('patches.renamePrompt'),
      placeholder: patch.name,
      defaultValue: patch.name,
      confirmText: t('patches.rename'),
      cancelText: t('common.cancel')
    });
    
    if (!result.confirmed || !result.value || result.value === patch.name) return;
    
    try {
      await renamePatch(this.selectedPatchId, result.value);
      await this._loadPatches();
      this._render();
      this._showToast(t('patches.renamed'));
    } catch (err) {
      log.error(' Error renaming:', err);
      this._showToast(t('patches.errorRenaming'));
    }
  }
  
  /**
   * Importa un patch desde archivo.
   */
  async _handleImport() {
    try {
      const patch = await importPatchFromFile();
      
      // Guardar en la base de datos
      await savePatch(patch);
      await this._loadPatches();
      this._render();
      this._showToast(t('patches.imported'));
    } catch (err) {
      log.error(' Error importing:', err);
    }
  }
  
  /**
   * Elimina el patch seleccionado.
   */
  async _handleDelete() {
    if (!this.selectedPatchId) return;
    
    const patch = this.patches.find(p => p.id === this.selectedPatchId);
    if (!patch) return;
    
    const result = await ConfirmDialog.show({
      title: t('patches.confirmDelete', { name: patch.name }),
      confirmText: t('common.yes'),
      cancelText: t('common.no')
    });
    if (!result.confirmed) return;
    
    try {
      await deletePatch(this.selectedPatchId);
      this.selectedPatchId = null;
      await this._loadPatches();
      this._render();
      this._updateActionButtons();
      this._showToast(t('patches.deleted'));
    } catch (err) {
      log.error(' Error deleting:', err);
    }
  }
  
  /**
   * Actualiza los textos para i18n.
   */
  _updateTexts() {
    if (this.titleElement) {
      this.titleElement.textContent = t('patches.title');
    }
    
    if (this.saveBtn) {
      this.saveBtn.querySelector('span').textContent = t('patches.saveCurrent');
    }
    
    if (this.importBtn) {
      this.importBtn.querySelector('span').textContent = t('patches.import');
    }
    
    if (this.searchInput) {
      this.searchInput.placeholder = t('patches.search');
    }
    
    if (this.loadBtn) {
      this.loadBtn.textContent = t('patches.load');
    }
    
    if (this.exportBtn) {
      this.exportBtn.textContent = t('patches.export');
    }
    
    if (this.renameBtn) {
      this.renameBtn.textContent = t('patches.rename');
    }
    
    if (this.deleteBtn) {
      this.deleteBtn.textContent = t('patches.delete');
    }
    
    // Close button aria-label
    const closeBtn = this.modal?.querySelector('.patch-browser__close');
    if (closeBtn) {
      closeBtn.setAttribute('aria-label', t('patches.close'));
    }
    
    // Re-render si está abierto
    if (this.isOpen) {
      this._render();
    }
  }
  
  /**
   * Limpieza.
   */
  destroy() {
    if (this._unsubscribeLocale) this._unsubscribeLocale();
    if (this.overlay?.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}
