// ═══════════════════════════════════════════════════════════════════════════
// ModuleFrame - Marco reutilizable para módulos de sintetizador
// ═══════════════════════════════════════════════════════════════════════════
//
// Proporciona el "panelillo" visual consistente usado por todos los módulos:
// - Osciladores, Osciloscopio, Noise Generators, Filtros, etc.
//
// Usa la clase CSS .synth-module para estilos compartidos.
//
// ═══════════════════════════════════════════════════════════════════════════

export class ModuleFrame {
  /**
   * @param {Object} options
   * @param {string} options.id - ID único del módulo
   * @param {string} options.title - Título que aparece en el header
   * @param {string} [options.className] - Clase CSS adicional
   * @param {Object} [options.size] - { width, height } en px (opcional)
   * @param {boolean} [options.showHeader=true] - Mostrar header con título
   */
  constructor(options = {}) {
    this.id = options.id || `module-${Date.now()}`;
    this.title = options.title;  // null = sin header
    this.className = options.className || '';
    this.size = options.size || null;
    this.showHeader = this.title != null && options.showHeader !== false;
    this.element = null;
    this.headerArea = null;
    this.contentArea = null;
    this.controlsArea = null;
  }

  /**
   * Crea el elemento DOM del marco
   * @returns {HTMLElement}
   */
  createElement() {
    const root = document.createElement('div');
    // Clase base .synth-module + clases adicionales
    root.className = `synth-module ${this.className}`.trim();
    root.id = this.id;
    
    if (this.size) {
      root.style.width = `${this.size.width}px`;
      root.style.height = `${this.size.height}px`;
    }

    // Header con título (opcional)
    if (this.showHeader) {
      const header = document.createElement('div');
      header.className = 'synth-module__header';
      header.textContent = this.title;
      root.appendChild(header);
      this.headerArea = header;
    }

    // Área de contenido principal (display, canvas, etc.)
    const content = document.createElement('div');
    content.className = 'synth-module__content';
    root.appendChild(content);
    this.contentArea = content;

    // Área de controles (knobs, toggles, etc.)
    const controls = document.createElement('div');
    controls.className = 'synth-module__controls';
    root.appendChild(controls);
    this.controlsArea = controls;

    this.element = root;
    return root;
  }

  /**
   * Añade un elemento al área de contenido
   */
  appendToContent(element) {
    if (this.contentArea) this.contentArea.appendChild(element);
  }

  /**
   * Añade un control al área de controles
   */
  appendToControls(element) {
    if (this.controlsArea) this.controlsArea.appendChild(element);
  }

  /**
   * Añade un elemento al header (junto al título)
   */
  appendToHeader(element) {
    if (this.headerArea) this.headerArea.appendChild(element);
  }

  getContentArea() { return this.contentArea; }
  getControlsArea() { return this.controlsArea; }
  getHeaderArea() { return this.headerArea; }
}
