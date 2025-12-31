// Modal de configuración de audio del sistema
// Permite rutear las salidas lógicas del Synthi a las salidas físicas del sistema (L/R)

/**
 * Clase que maneja la ventana modal de configuración de audio del sistema.
 * Permite mapear N salidas lógicas a las salidas físicas L/R de forma aditiva.
 */
export class AudioSettingsModal {
  /**
   * @param {Object} options
   * @param {number} [options.outputCount=8] - Número de salidas lógicas del sintetizador
   * @param {number} [options.inputCount=8] - Número de entradas lógicas (reservado, no funcional aún)
   * @param {Function} [options.onRoutingChange] - Callback cuando cambia el ruteo: (busIndex, leftGain, rightGain) => void
   */
  constructor(options = {}) {
    const { outputCount = 8, inputCount = 8, onRoutingChange } = options;
    
    this.outputCount = outputCount;
    this.inputCount = inputCount;
    this.onRoutingChange = onRoutingChange;
    
    // Estado de ruteo: cada salida tiene { left: boolean, right: boolean }
    // Por defecto: out1 → L, out2 → R, resto apagado
    this.outputRouting = Array.from({ length: this.outputCount }, (_, i) => ({
      left: i === 0,   // Out 1 a L
      right: i === 1   // Out 2 a R
    }));
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.isOpen = false;
    
    this._create();
  }

  /**
   * Crea la estructura DOM del modal
   */
  _create() {
    // Overlay oscuro
    this.overlay = document.createElement('div');
    this.overlay.className = 'audio-settings-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    
    // Contenedor modal
    this.modal = document.createElement('div');
    this.modal.className = 'audio-settings-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-labelledby', 'audioSettingsTitle');
    this.modal.setAttribute('aria-modal', 'true');
    
    // Header
    const header = document.createElement('div');
    header.className = 'audio-settings-modal__header';
    
    const title = document.createElement('h2');
    title.id = 'audioSettingsTitle';
    title.className = 'audio-settings-modal__title';
    title.textContent = 'Configuración de Audio';
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'audio-settings-modal__close';
    closeBtn.setAttribute('aria-label', 'Cerrar configuración');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => this.close());
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Contenido
    const content = document.createElement('div');
    content.className = 'audio-settings-modal__content';
    
    // Sección de salidas (OUTPUT ROUTING)
    const outputSection = this._createOutputSection();
    content.appendChild(outputSection);
    
    // Sección de entradas (INPUT ROUTING) - reservada, deshabilitada
    const inputSection = this._createInputSection();
    content.appendChild(inputSection);
    
    this.modal.appendChild(header);
    this.modal.appendChild(content);
    this.overlay.appendChild(this.modal);
    
    // Eventos
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    
    // Añadir al DOM (oculto)
    document.body.appendChild(this.overlay);
  }

  /**
   * Crea la sección de ruteo de salidas
   */
  _createOutputSection() {
    const section = document.createElement('div');
    section.className = 'audio-settings-section';
    
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'audio-settings-section__title';
    sectionTitle.textContent = 'Salidas → Sistema (L/R)';
    section.appendChild(sectionTitle);
    
    const description = document.createElement('p');
    description.className = 'audio-settings-section__desc';
    description.textContent = 'Rutea las salidas lógicas del Synthi a las salidas físicas del sistema.';
    section.appendChild(description);
    
    // Matriz de ruteo
    const matrix = document.createElement('div');
    matrix.className = 'routing-matrix';
    
    // Header de la matriz
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'routing-matrix__header';
    
    const cornerCell = document.createElement('div');
    cornerCell.className = 'routing-matrix__corner';
    matrixHeader.appendChild(cornerCell);
    
    ['L', 'R'].forEach(ch => {
      const headerCell = document.createElement('div');
      headerCell.className = 'routing-matrix__header-cell';
      headerCell.textContent = ch;
      matrixHeader.appendChild(headerCell);
    });
    
    matrix.appendChild(matrixHeader);
    
    // Filas de la matriz (una por cada salida)
    this.outputToggleButtons = [];
    
    for (let i = 0; i < this.outputCount; i++) {
      const row = document.createElement('div');
      row.className = 'routing-matrix__row';
      
      const rowLabel = document.createElement('div');
      rowLabel.className = 'routing-matrix__row-label';
      rowLabel.textContent = `Out ${i + 1}`;
      row.appendChild(rowLabel);
      
      const leftBtn = this._createToggleButton(i, 'left');
      const rightBtn = this._createToggleButton(i, 'right');
      
      row.appendChild(leftBtn);
      row.appendChild(rightBtn);
      
      this.outputToggleButtons.push({ left: leftBtn, right: rightBtn });
      
      matrix.appendChild(row);
    }
    
    section.appendChild(matrix);
    
    return section;
  }

  /**
   * Crea un botón toggle para la matriz de ruteo
   */
  _createToggleButton(busIndex, channel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'routing-matrix__toggle';
    btn.setAttribute('aria-pressed', String(this.outputRouting[busIndex][channel]));
    btn.dataset.bus = busIndex;
    btn.dataset.channel = channel;
    
    if (this.outputRouting[busIndex][channel]) {
      btn.classList.add('routing-matrix__toggle--active');
    }
    
    btn.addEventListener('click', () => this._toggleRouting(busIndex, channel, btn));
    
    return btn;
  }

  /**
   * Alterna el estado de ruteo de una salida
   */
  _toggleRouting(busIndex, channel, btn) {
    this.outputRouting[busIndex][channel] = !this.outputRouting[busIndex][channel];
    const isActive = this.outputRouting[busIndex][channel];
    
    btn.classList.toggle('routing-matrix__toggle--active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    
    // Notificar cambio
    if (this.onRoutingChange) {
      const leftGain = this.outputRouting[busIndex].left ? 1.0 : 0.0;
      const rightGain = this.outputRouting[busIndex].right ? 1.0 : 0.0;
      this.onRoutingChange(busIndex, leftGain, rightGain);
    }
  }

  /**
   * Crea la sección de ruteo de entradas (deshabilitada por ahora)
   */
  _createInputSection() {
    const section = document.createElement('div');
    section.className = 'audio-settings-section audio-settings-section--disabled';
    
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'audio-settings-section__title';
    sectionTitle.textContent = 'Entradas ← Sistema (Mic/Line)';
    section.appendChild(sectionTitle);
    
    const description = document.createElement('p');
    description.className = 'audio-settings-section__desc';
    description.textContent = 'Captura audio externo hacia las entradas del Synthi. (Próximamente)';
    section.appendChild(description);
    
    // Placeholder visual para futuras entradas
    const placeholder = document.createElement('div');
    placeholder.className = 'routing-matrix routing-matrix--placeholder';
    
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'routing-matrix__header';
    
    const cornerCell = document.createElement('div');
    cornerCell.className = 'routing-matrix__corner';
    matrixHeader.appendChild(cornerCell);
    
    ['Mic', 'Line L', 'Line R'].forEach(ch => {
      const headerCell = document.createElement('div');
      headerCell.className = 'routing-matrix__header-cell';
      headerCell.textContent = ch;
      matrixHeader.appendChild(headerCell);
    });
    
    placeholder.appendChild(matrixHeader);
    
    // Filas de entradas (placeholder)
    for (let i = 0; i < Math.min(this.inputCount, 4); i++) {
      const row = document.createElement('div');
      row.className = 'routing-matrix__row';
      
      const rowLabel = document.createElement('div');
      rowLabel.className = 'routing-matrix__row-label';
      rowLabel.textContent = `In ${i + 1}`;
      row.appendChild(rowLabel);
      
      for (let j = 0; j < 3; j++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'routing-matrix__toggle routing-matrix__toggle--disabled';
        btn.disabled = true;
        row.appendChild(btn);
      }
      
      placeholder.appendChild(row);
    }
    
    if (this.inputCount > 4) {
      const moreLabel = document.createElement('div');
      moreLabel.className = 'routing-matrix__more';
      moreLabel.textContent = `+${this.inputCount - 4} más...`;
      placeholder.appendChild(moreLabel);
    }
    
    section.appendChild(placeholder);
    
    return section;
  }

  /**
   * Abre el modal
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.classList.add('audio-settings-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    
    // Focus en el modal para accesibilidad
    requestAnimationFrame(() => {
      const closeBtn = this.modal.querySelector('.audio-settings-modal__close');
      if (closeBtn) closeBtn.focus();
    });
  }

  /**
   * Cierra el modal
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('audio-settings-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'true');
  }

  /**
   * Alterna visibilidad del modal
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Obtiene el estado de ruteo actual
   * @returns {Array<{left: boolean, right: boolean}>}
   */
  getRouting() {
    return this.outputRouting.map(r => ({ ...r }));
  }

  /**
   * Establece el estado de ruteo
   * @param {Array<{left: boolean, right: boolean}>} routing
   */
  setRouting(routing) {
    if (!Array.isArray(routing)) return;
    
    routing.forEach((r, i) => {
      if (i >= this.outputCount) return;
      this.outputRouting[i].left = Boolean(r.left);
      this.outputRouting[i].right = Boolean(r.right);
      
      // Actualizar UI
      if (this.outputToggleButtons[i]) {
        const { left, right } = this.outputToggleButtons[i];
        left.classList.toggle('routing-matrix__toggle--active', this.outputRouting[i].left);
        left.setAttribute('aria-pressed', String(this.outputRouting[i].left));
        right.classList.toggle('routing-matrix__toggle--active', this.outputRouting[i].right);
        right.setAttribute('aria-pressed', String(this.outputRouting[i].right));
      }
    });
  }

  /**
   * Aplica el ruteo actual al engine
   * @param {Function} applyFn - Función (busIndex, leftGain, rightGain) => void
   */
  applyRoutingToEngine(applyFn) {
    if (typeof applyFn !== 'function') return;
    
    for (let i = 0; i < this.outputCount; i++) {
      const leftGain = this.outputRouting[i].left ? 1.0 : 0.0;
      const rightGain = this.outputRouting[i].right ? 1.0 : 0.0;
      applyFn(i, leftGain, rightGain);
    }
  }
}
