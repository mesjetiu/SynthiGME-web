/**
 * Modal de configuración de grabación de audio.
 * Permite configurar número de pistas y matriz de ruteo outputs → tracks.
 */

import { t, onLocaleChange } from '../i18n/index.js';
import { OUTPUT_CHANNELS, MAX_RECORDING_TRACKS } from '../utils/constants.js';

/**
 * Modal para configurar la grabación de audio WAV.
 * Muestra una matriz de ruteo similar a la de audio pero para outputs → tracks.
 */
export class RecordingSettingsModal {
  /**
   * @param {Object} options
   * @param {import('../core/recordingEngine.js').RecordingEngine} options.recordingEngine
   * @param {number} [options.outputCount] - Número de salidas del sintetizador
   */
  constructor(options = {}) {
    const { recordingEngine, outputCount = OUTPUT_CHANNELS } = options;
    
    this.recordingEngine = recordingEngine;
    this.outputCount = outputCount;
    
    // Fuentes de grabación: 4 stereo buses PRIMERO + 8 individuales DESPUÉS = 12
    // ORDEN: stereo (0-3), individual (4-11)
    this.stereoSourceLabels = [
      'Pan1-4L',
      'Pan1-4R',
      'Pan5-8L',
      'Pan5-8R'
    ];
    this.stereoSourceCount = this.stereoSourceLabels.length; // 4
    this.totalSources = this.stereoSourceCount + this.outputCount; // 12
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.isOpen = false;
    
    // Array de botones toggle para actualización dinámica
    this.toggleButtons = [];
    
    // Contenedor de la matriz (para reconstrucción)
    this.matrixContainer = null;
    
    // Contenedor de matriz embebido (para contenido integrado en pestañas)
    this.embeddedMatrixContainer = null;
    
    // Referencias a elementos con texto traducible
    this._textElements = {};
    
    this._create();
    
    // Escuchar cambios de idioma
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
  }

  /**
   * Crea contenido embebible para usar en otro contenedor (sin overlay/header)
   * @returns {HTMLElement}
   */
  createEmbeddableContent() {
    const container = document.createElement('div');
    container.className = 'recording-settings-content';

    // Track count selector
    const trackSection = this._createTrackCountSection();
    container.appendChild(trackSection);

    // Routing matrix section
    const matrixSection = document.createElement('div');
    matrixSection.className = 'recording-settings-section';

    const matrixTitle = document.createElement('h3');
    matrixTitle.className = 'recording-settings-section__title';
    matrixTitle.textContent = t('recording.routing.title');

    const matrixDesc = document.createElement('p');
    matrixDesc.className = 'recording-settings-section__description';
    matrixDesc.textContent = t('recording.routing.description');

    // Contenedor de matriz para este contenido embebido
    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'recording-settings-matrix-container';
    
    // Guardar referencia al contenedor embebido
    this.embeddedMatrixContainer = matrixContainer;

    matrixSection.appendChild(matrixTitle);
    matrixSection.appendChild(matrixDesc);
    matrixSection.appendChild(matrixContainer);
    container.appendChild(matrixSection);

    // Construir matriz en este contenedor
    this._buildMatrixInContainer(matrixContainer);

    return container;
  }

  /**
   * Construye la matriz en un contenedor específico
   * @param {HTMLElement} container
   */
  _buildMatrixInContainer(container) {
    container.innerHTML = '';
    const trackCount = this.recordingEngine.trackCount;

    const matrix = document.createElement('div');
    matrix.className = 'recording-routing-matrix';
    matrix.style.setProperty('--track-count', trackCount);

    // Header row
    const headerRow = document.createElement('div');
    headerRow.className = 'recording-routing-matrix__header';

    const cornerCell = document.createElement('div');
    cornerCell.className = 'recording-routing-matrix__corner';
    headerRow.appendChild(cornerCell);

    for (let track = 0; track < trackCount; track++) {
      const headerCell = document.createElement('div');
      headerCell.className = 'recording-routing-matrix__header-cell';
      headerCell.textContent = `T${track + 1}`;
      headerCell.title = `${t('recording.track')} ${track + 1}`;
      headerRow.appendChild(headerCell);
    }
    matrix.appendChild(headerRow);

    // Rows: 4 stereo bus outputs PRIMERO (Pan 1-4 L/R, Pan 5-8 L/R) - índices 0-3
    for (let i = 0; i < this.stereoSourceCount; i++) {
      const row = document.createElement('div');
      row.className = 'recording-routing-matrix__row recording-routing-matrix__row--stereo';

      const rowLabel = document.createElement('div');
      rowLabel.className = 'recording-routing-matrix__row-label';
      rowLabel.textContent = this.stereoSourceLabels[i];
      row.appendChild(rowLabel);

      for (let track = 0; track < trackCount; track++) {
        const btn = this._createToggleButton(i, track);
        row.appendChild(btn);
      }
      matrix.appendChild(row);
    }

    // Rows: 8 individual outputs DESPUÉS - índices 4-11
    for (let bus = 0; bus < this.outputCount; bus++) {
      const sourceIndex = this.stereoSourceCount + bus; // 4, 5, 6, 7, 8, 9, 10, 11
      const row = document.createElement('div');
      row.className = 'recording-routing-matrix__row';

      const rowLabel = document.createElement('div');
      rowLabel.className = 'recording-routing-matrix__row-label';
      rowLabel.textContent = `Out ${bus + 1}`;
      row.appendChild(rowLabel);

      for (let track = 0; track < trackCount; track++) {
        const btn = this._createToggleButton(sourceIndex, track);
        row.appendChild(btn);
      }
      matrix.appendChild(row);
    }

    container.appendChild(matrix);
  }

  /**
   * Crea la estructura DOM del modal
   */
  _create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'recording-settings-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'recording-settings-title');
    
    // Modal container
    this.modal = document.createElement('div');
    this.modal.className = 'recording-settings-modal';
    
    // Header
    const header = document.createElement('div');
    header.className = 'recording-settings-modal__header';
    
    const title = document.createElement('h2');
    title.id = 'recording-settings-title';
    title.className = 'recording-settings-modal__title';
    title.textContent = t('recording.title');
    this._textElements.title = title;
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'recording-settings-modal__close';
    closeBtn.setAttribute('aria-label', t('recording.close'));
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => this.close());
    this._textElements.closeBtn = closeBtn;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Body
    const body = document.createElement('div');
    body.className = 'recording-settings-modal__body';
    
    // Track count selector
    const trackSection = this._createTrackCountSection();
    body.appendChild(trackSection);
    
    // Routing matrix section
    const matrixSection = document.createElement('div');
    matrixSection.className = 'recording-settings-section';
    
    const matrixTitle = document.createElement('h3');
    matrixTitle.className = 'recording-settings-section__title';
    matrixTitle.textContent = t('recording.routing.title');
    this._textElements.matrixTitle = matrixTitle;
    
    const matrixDesc = document.createElement('p');
    matrixDesc.className = 'recording-settings-section__description';
    matrixDesc.textContent = t('recording.routing.description');
    this._textElements.matrixDesc = matrixDesc;
    
    this.matrixContainer = document.createElement('div');
    this.matrixContainer.className = 'recording-settings-matrix-container';
    
    matrixSection.appendChild(matrixTitle);
    matrixSection.appendChild(matrixDesc);
    matrixSection.appendChild(this.matrixContainer);
    body.appendChild(matrixSection);
    
    // Build initial matrix
    this._rebuildMatrix();
    
    // Assemble modal
    this.modal.appendChild(header);
    this.modal.appendChild(body);
    this.overlay.appendChild(this.modal);
    
    // Add to document
    document.body.appendChild(this.overlay);
    
    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    // Keyboard navigation
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  /**
   * Creates track count selector section
   */
  _createTrackCountSection() {
    const section = document.createElement('div');
    section.className = 'recording-settings-section';
    
    const row = document.createElement('div');
    row.className = 'recording-settings-row';
    
    const label = document.createElement('label');
    label.className = 'recording-settings-row__label';
    label.textContent = t('recording.tracks.label');
    label.htmlFor = 'recording-track-count';
    this._textElements.trackLabel = label;
    
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'recording-settings-select-wrapper';
    
    this.trackCountSelect = document.createElement('select');
    this.trackCountSelect.className = 'recording-settings-select';
    this.trackCountSelect.id = 'recording-track-count';
    
    // Options 1-MAX_RECORDING_TRACKS
    for (let i = 1; i <= MAX_RECORDING_TRACKS; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = i === 1 ? t('recording.tracks.mono') : 
                        i === 2 ? t('recording.tracks.stereo') : 
                        `${i} ${t('recording.tracks.tracks')}`;
      if (i === this.recordingEngine.trackCount) opt.selected = true;
      this.trackCountSelect.appendChild(opt);
    }
    
    this.trackCountSelect.addEventListener('change', () => {
      const newCount = parseInt(this.trackCountSelect.value, 10);
      this.recordingEngine.trackCount = newCount;
      
      // Reconstruir matrices (modal y/o embedded)
      if (this.matrixContainer) {
        this._rebuildMatrix();
      }
      if (this.embeddedMatrixContainer) {
        this._buildMatrixInContainer(this.embeddedMatrixContainer);
      }
    });
    
    selectWrapper.appendChild(this.trackCountSelect);
    row.appendChild(label);
    row.appendChild(selectWrapper);
    section.appendChild(row);
    
    return section;
  }

  /**
   * Rebuilds the routing matrix UI
   */
  _rebuildMatrix() {
    if (!this.matrixContainer) return;
    
    this.matrixContainer.innerHTML = '';
    this.toggleButtons = [];
    
    const trackCount = this.recordingEngine.trackCount;
    
    // Create matrix grid
    const matrix = document.createElement('div');
    matrix.className = 'recording-routing-matrix';
    matrix.style.setProperty('--track-count', trackCount);
    
    // Header row: corner cell + track labels
    const headerRow = document.createElement('div');
    headerRow.className = 'recording-routing-matrix__header';
    
    const cornerCell = document.createElement('div');
    cornerCell.className = 'recording-routing-matrix__corner';
    headerRow.appendChild(cornerCell);
    
    for (let track = 0; track < trackCount; track++) {
      const headerCell = document.createElement('div');
      headerCell.className = 'recording-routing-matrix__header-cell';
      headerCell.textContent = `T${track + 1}`;
      headerCell.title = `${t('recording.track')} ${track + 1}`;
      headerRow.appendChild(headerCell);
    }
    
    matrix.appendChild(headerRow);
    
    // Rows: one per output bus (8 individual)
    for (let bus = 0; bus < this.outputCount; bus++) {
      const row = document.createElement('div');
      row.className = 'recording-routing-matrix__row';
      
      // Row label
      const rowLabel = document.createElement('div');
      rowLabel.className = 'recording-routing-matrix__row-label';
      rowLabel.textContent = `Out ${bus + 1}`;
      row.appendChild(rowLabel);
      
      // Toggle buttons for each track
      for (let track = 0; track < trackCount; track++) {
        const btn = this._createToggleButton(bus, track);
        row.appendChild(btn);
      }
      
      matrix.appendChild(row);
    }
    
    // Rows: stereo bus outputs (4 channels: Pan 1-4 L/R, Pan 5-8 L/R)
    for (let i = 0; i < this.stereoSourceLabels.length; i++) {
      const sourceIndex = this.outputCount + i; // 8, 9, 10, 11
      const row = document.createElement('div');
      row.className = 'recording-routing-matrix__row recording-routing-matrix__row--stereo';
      
      const rowLabel = document.createElement('div');
      rowLabel.className = 'recording-routing-matrix__row-label';
      rowLabel.textContent = this.stereoSourceLabels[i];
      row.appendChild(rowLabel);
      
      for (let track = 0; track < trackCount; track++) {
        const btn = this._createToggleButton(sourceIndex, track);
        row.appendChild(btn);
      }
      
      matrix.appendChild(row);
    }
    
    this.matrixContainer.appendChild(matrix);
  }

  /**
   * Creates a toggle button for output → track routing
   */
  _createToggleButton(busIndex, trackIndex) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recording-routing-matrix__toggle';
    
    const isActive = this.recordingEngine.getRouting(busIndex, trackIndex) === 1;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.dataset.bus = busIndex;
    btn.dataset.track = trackIndex;
    
    if (isActive) {
      btn.classList.add('recording-routing-matrix__toggle--active');
    }
    
    btn.addEventListener('click', () => {
      const currentState = btn.classList.contains('recording-routing-matrix__toggle--active');
      const newState = !currentState;
      
      this.recordingEngine.setRouting(busIndex, trackIndex, newState);
      
      btn.classList.toggle('recording-routing-matrix__toggle--active', newState);
      btn.setAttribute('aria-pressed', String(newState));
    });
    
    this.toggleButtons.push({ btn, busIndex, trackIndex });
    return btn;
  }

  /**
   * Updates texts for i18n
   */
  _updateTexts() {
    const els = this._textElements;
    if (els.title) els.title.textContent = t('recording.title');
    if (els.closeBtn) els.closeBtn.setAttribute('aria-label', t('recording.close'));
    if (els.trackLabel) els.trackLabel.textContent = t('recording.tracks.label');
    if (els.matrixTitle) els.matrixTitle.textContent = t('recording.routing.title');
    if (els.matrixDesc) els.matrixDesc.textContent = t('recording.routing.description');
    
    // Update select options
    if (this.trackCountSelect) {
      Array.from(this.trackCountSelect.options).forEach((opt, i) => {
        const val = i + 1;
        opt.textContent = val === 1 ? t('recording.tracks.mono') : 
                          val === 2 ? t('recording.tracks.stereo') : 
                          `${val} ${t('recording.tracks.tracks')}`;
      });
    }
  }

  /**
   * Opens the modal
   */
  open() {
    if (this.isOpen) return;
    
    // Refresh matrix in case track count changed externally
    this._rebuildMatrix();
    
    this.overlay.classList.add('recording-settings-overlay--visible');
    this.isOpen = true;
    
    // Focus close button
    const closeBtn = this.modal.querySelector('.recording-settings-modal__close');
    if (closeBtn) closeBtn.focus();
  }

  /**
   * Closes the modal
   */
  close() {
    if (!this.isOpen) return;
    
    this.overlay.classList.remove('recording-settings-overlay--visible');
    this.isOpen = false;
  }

  /**
   * Toggles the modal
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._unsubscribeLocale) this._unsubscribeLocale();
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}
