/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PATCH BROWSER - SynthiGME
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Ventana flotante arrastrable para navegar, cargar, guardar y gestionar patches.
 * No bloquea la interacción con el canvas ni con las PiP.
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
 * Ventana flotante de navegación de patches.
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
    this.modal = null;
    this.patchList = null;
    this.searchInput = null;
    this.isOpen = false;
    
    // Drag state
    this._isDragging = false;
    this._dragOffset = { x: 0, y: 0 };
    this._dragPointerId = null;
    
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
    
    // Centrar la ventana si no ha sido arrastrada previamente
    if (!this.modal.style.left) {
      this._centerModal();
    }
    
    this.modal.classList.add('patch-browser-modal--visible');
    this.modal.setAttribute('aria-hidden', 'false');
    
    document.dispatchEvent(new CustomEvent('synth:patchBrowserChanged', {
      detail: { open: true }
    }));
    
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
    this.modal.classList.remove('patch-browser-modal--visible');
    this.modal.setAttribute('aria-hidden', 'true');
    this.selectedPatchId = null;
    
    document.dispatchEvent(new CustomEvent('synth:patchBrowserChanged', {
      detail: { open: false }
    }));
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
    // Floating panel (no blocking overlay)
    this.modal = document.createElement('div');
    this.modal.className = 'patch-browser-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-labelledby', 'patchBrowserTitle');
    this.modal.setAttribute('aria-hidden', 'true');
    
    // Header (draggable)
    const header = document.createElement('div');
    header.className = 'patch-browser__header';
    this._setupDrag(header);
    
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
    
    // Escape para cerrar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    
    document.body.appendChild(this.modal);
  }
  
  /**
   * Configura el drag del header para mover la ventana.
   * @param {HTMLElement} header
   */
  _setupDrag(header) {
    header.style.cursor = 'grab';
    header.style.touchAction = 'none';
    
    header.addEventListener('pointerdown', (e) => {
      // Solo botón principal, ignorar clicks en botón de cerrar
      if (e.button !== 0 || e.target.closest('.patch-browser__close')) return;
      
      this._isDragging = true;
      this._dragPointerId = e.pointerId;
      
      const rect = this.modal.getBoundingClientRect();
      this._dragOffset.x = e.clientX - rect.left;
      this._dragOffset.y = e.clientY - rect.top;
      
      this.modal.classList.add('patch-browser-modal--dragging');
      header.style.cursor = 'grabbing';
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    
    header.addEventListener('pointermove', (e) => {
      if (!this._isDragging || e.pointerId !== this._dragPointerId) return;
      
      const newX = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - this._dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - this._dragOffset.y));
      
      this.modal.style.left = `${newX}px`;
      this.modal.style.top = `${newY}px`;
    });
    
    header.addEventListener('pointerup', (e) => {
      if (!this._isDragging || e.pointerId !== this._dragPointerId) return;
      
      this._isDragging = false;
      this._dragPointerId = null;
      this.modal.classList.remove('patch-browser-modal--dragging');
      header.style.cursor = 'grab';
      try { header.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    
    header.addEventListener('pointercancel', (e) => {
      if (!this._isDragging || e.pointerId !== this._dragPointerId) return;
      
      this._isDragging = false;
      this._dragPointerId = null;
      this.modal.classList.remove('patch-browser-modal--dragging');
      header.style.cursor = 'grab';
    });
  }
  
  /**
   * Centra la ventana flotante en la pantalla.
   */
  _centerModal() {
    // Hacer visible temporalmente para medir
    this.modal.style.visibility = 'hidden';
    this.modal.style.opacity = '0';
    this.modal.style.display = 'block';
    
    const rect = this.modal.getBoundingClientRect();
    const x = Math.max(0, (window.innerWidth - rect.width) / 2);
    const y = Math.max(0, (window.innerHeight - rect.height) / 2);
    
    this.modal.style.left = `${x}px`;
    this.modal.style.top = `${y}px`;
    
    // Restaurar (la transición CSS se encargará)
    this.modal.style.removeProperty('visibility');
    this.modal.style.removeProperty('opacity');
    this.modal.style.removeProperty('display');
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
      showToast(t('patches.saved'), { level: 'success' });
    } catch (err) {
      log.error(' Error saving:', err);
      showToast(t('patches.errorSaving'), { level: 'error' });
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
      
      // La ventana permanece abierta para cambiar rápidamente de patch
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
      log.info(' Exporting patch ID:', this.selectedPatchId);
      const patch = await loadPatch(this.selectedPatchId);
      log.info(' Loaded patch:', patch ? patch.name : 'null');
      if (patch) {
        exportPatchToFile(patch);
        showToast(t('patches.exported'), { level: 'success' });
      } else {
        log.warn(' Patch not found in IndexedDB');
        showToast(t('patches.errorExporting'), { level: 'error' });
      }
    } catch (err) {
      log.error(' Error exporting:', err);
      showToast(t('patches.errorExporting'), { level: 'error' });
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
      showToast(t('patches.renamed'), { level: 'success' });
    } catch (err) {
      log.error(' Error renaming:', err);
      showToast(t('patches.errorRenaming'), { level: 'error' });
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
      showToast(t('patches.imported'), { level: 'success' });
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
      showToast(t('patches.deleted'), { level: 'success' });
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
    if (this.modal?.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }
}
