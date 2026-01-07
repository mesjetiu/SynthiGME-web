/**
 * Matriz de conexión grande (63×67) para audio y control.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * @module ui/largeMatrix
 * @see state/schema.js para definición de MatrixState
 */
export class LargeMatrix {
  constructor(tableElement, { rows = 63, cols = 67, frame = null, hiddenRows = [], hiddenCols = [], onToggle = null } = {}) {
    this.table = tableElement;
    this.rows = rows;
    this.cols = cols;
    this.hiddenRows = new Set(hiddenRows || []);
    this.hiddenCols = new Set(hiddenCols || []);
    this._layoutRaf = null;
    this._built = false;
    this._onTableClick = null;
    this.frame = this._normalizeFrame(frame);
    this.onToggle = typeof onToggle === 'function' ? onToggle : null;

    if (this.table) {
      this.table.classList.add('matrix-large');
      this._applyMatrixStyling();
      this._applyLayoutOffsets();
    }
  }

  _normalizeFrame(frame) {
    // La matriz (rows/cols) es inamovible.
    // Solo transformamos el "frame" (cuadrilátero) donde encaja.
    const defaults = {
      // Cuadrado base representado en % del panel.
      squarePercent: 90,
      // Traslación del frame en "pasos" (1 paso = 1/cols del cuadrado).
      translateSteps: { x: 0, y: 0 },
      // Márgenes internos del frame en "pasos". Positivo recorta; negativo expande.
      marginsSteps: { left: 0, right: 0, top: 0, bottom: 0 },
      // Si es false, durante el ajuste permitimos que el frame se salga del panel.
      // OJO: esto puede solapar otros paneles. Úsalo solo para ajustar a ojo.
      clip: true,
      // Cuánto overflow (en %) permitimos al clamp por cada lado.
      overflowPercent: { left: 25, right: 60, top: 25, bottom: 60 },
      // Para ajuste: permitir width/height > 100%.
      maxSizePercent: 100
    };

    if (!frame) return defaults;

    const clip = typeof frame.clip === 'boolean' ? frame.clip : defaults.clip;
    const overflowPercent = {
      left: typeof frame.overflowPercent?.left === 'number' ? frame.overflowPercent.left : defaults.overflowPercent.left,
      right: typeof frame.overflowPercent?.right === 'number' ? frame.overflowPercent.right : defaults.overflowPercent.right,
      top: typeof frame.overflowPercent?.top === 'number' ? frame.overflowPercent.top : defaults.overflowPercent.top,
      bottom: typeof frame.overflowPercent?.bottom === 'number' ? frame.overflowPercent.bottom : defaults.overflowPercent.bottom
    };

    const maxSizePercent = typeof frame.maxSizePercent === 'number'
      ? frame.maxSizePercent
      : (clip ? defaults.maxSizePercent : 300);

    return {
      squarePercent: typeof frame.squarePercent === 'number' ? frame.squarePercent : defaults.squarePercent,
      translateSteps: {
        x: typeof frame.translateSteps?.x === 'number' ? frame.translateSteps.x : defaults.translateSteps.x,
        y: typeof frame.translateSteps?.y === 'number' ? frame.translateSteps.y : defaults.translateSteps.y
      },
      marginsSteps: {
        left: typeof frame.marginsSteps?.left === 'number' ? frame.marginsSteps.left : defaults.marginsSteps.left,
        right: typeof frame.marginsSteps?.right === 'number' ? frame.marginsSteps.right : defaults.marginsSteps.right,
        top: typeof frame.marginsSteps?.top === 'number' ? frame.marginsSteps.top : defaults.marginsSteps.top,
        bottom: typeof frame.marginsSteps?.bottom === 'number' ? frame.marginsSteps.bottom : defaults.marginsSteps.bottom
      },
      clip,
      overflowPercent,
      maxSizePercent
    };
  }

  _applyMatrixStyling() {
    if (!this.table) return;
    const pinSizePx = 7;
    const cellSizePx = 12;
    this.table.style.setProperty('--matrix-large-pin-size', `${pinSizePx}px`);
    this.table.style.setProperty('--matrix-large-cell-size', `${cellSizePx}px`);
    this.table.style.background = 'transparent';
  }

  _applyLayoutOffsets() {
    const container = this.table.closest('.matrix-container');
    if (!container) return;
    const squarePercent = this.frame.squarePercent;
    const outerMargin = (100 - squarePercent) / 2;

    // Definimos 1 paso como 1/cols del cuadrado (1 paso ~= 1 columna/pin).
    const steps = this.cols;
    const stepPercent = squarePercent / steps;

    const m = this.frame.marginsSteps;
    const t = this.frame.translateSteps;

    let leftPercent = outerMargin + (t.x + m.left) * stepPercent;
    let topPercent = outerMargin + (t.y + m.top) * stepPercent;
    let widthPercent = squarePercent - (m.left + m.right) * stepPercent;
    let heightPercent = squarePercent - (m.top + m.bottom) * stepPercent;

    // Clamp defensivo para evitar valores degenerados.
    const maxSizePercent = typeof this.frame.maxSizePercent === 'number' ? this.frame.maxSizePercent : 100;
    widthPercent = Math.max(1, Math.min(maxSizePercent, widthPercent));
    heightPercent = Math.max(1, Math.min(maxSizePercent, heightPercent));

    // Importante: NO recortamos width/height para "hacer sitio" cuando mueves el frame.
    // Eso crea un umbral raro donde deja de obedecer. En su lugar, clampamos left/top
    // en función del width/height reales (solo se limita cuando de verdad tocaría el borde).
    // Permitimos un pequeño overflow del frame fuera del panel para poder
    // alinear a ojo con el arte (si no, se "pega" al borde y parece que deja
    // de obedecer aunque visualmente aún quede margen útil).
    // Puedes tocar estos valores para dar más "aire" al ajuste a ojo.
    // En tu caso el problema suele ser el borde derecho.
    const overflow = this.frame.overflowPercent || { left: 25, top: 25, right: 60, bottom: 60 };
    const minLeft = -Math.abs(overflow.left || 0);
    const minTop = -Math.abs(overflow.top || 0);
    const maxLeft = 100 - widthPercent + Math.abs(overflow.right || 0);
    const maxTop = 100 - heightPercent + Math.abs(overflow.bottom || 0);
    leftPercent = Math.min(maxLeft, Math.max(minLeft, leftPercent));
    topPercent = Math.min(maxTop, Math.max(minTop, topPercent));

    container.style.position = 'absolute';
    container.style.left = `${leftPercent}%`;
    container.style.top = `${topPercent}%`;
    container.style.width = `${widthPercent}%`;
    container.style.height = `${heightPercent}%`;
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.overflow = this.frame.clip === false ? 'visible' : 'hidden';
    container.style.background = 'transparent';

    // Debug (útil para ver si topas clamp o si es recorte visual)
    container.dataset.frameLeft = leftPercent.toFixed(3);
    container.dataset.frameTop = topPercent.toFixed(3);
    container.dataset.frameWidth = widthPercent.toFixed(3);
    container.dataset.frameHeight = heightPercent.toFixed(3);
    container.dataset.frameClip = String(this.frame.clip !== false);
  }

  build() {
    const table = this.table;
    if (!table) return;

    // Evita reconstrucciones accidentales (muy caras en móvil).
    if (this._built) {
      this.resizeToFit();
      return;
    }

    table.innerHTML = '';

    // Delegación de eventos: 1 listener para todos los pines.
    this._onTableClick = ev => {
      const btn = ev.target?.closest?.('button.pin-btn');
      if (!btn || !table.contains(btn)) return;
      if (btn.disabled || btn.classList.contains('is-hidden-pin')) return;
      const rowIndex = Number(btn.dataset.row);
      const colIndex = Number(btn.dataset.col);
      const nextActive = !btn.classList.contains('active');
      const allow = this.onToggle ? this.onToggle(rowIndex, colIndex, nextActive, btn) !== false : true;
      if (!allow) return;
      btn.classList.toggle('active', nextActive);
      // Notificar que hay cambios sin guardar
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    };
    table.addEventListener('click', this._onTableClick);

    const tbody = document.createElement('tbody');

    for (let r = 0; r < this.rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < this.cols; c++) {
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'pin-btn';
        btn.dataset.row = String(r);
        btn.dataset.col = String(c);
        const isHidden = this.hiddenRows.has(r) || this.hiddenCols.has(c);
        if (isHidden) {
          btn.classList.add('is-hidden-pin');
          btn.disabled = true;
          btn.tabIndex = -1;
          btn.setAttribute('aria-hidden', 'true');
        }
        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    this._built = true;

    this.resizeToFit();
  }

  resizeToFit() {
    const table = this.table;
    if (!table) return;

    const container = table.closest('.matrix-container');
    if (!container) return;
    if (this._layoutRaf) {
      cancelAnimationFrame(this._layoutRaf);
    }

    this._layoutRaf = requestAnimationFrame(() => {
      this._layoutRaf = null;

      // Restablecemos cualquier escala previa para obtener el tamaño base
      table.style.transform = 'none';

      const containerRect = container.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();

      const availableWidth = containerRect.width;
      const availableHeight = containerRect.height;
      const baseWidth = tableRect.width;
      const baseHeight = tableRect.height;

      if (!availableWidth || !availableHeight || !baseWidth || !baseHeight) return;

      // Importante: los márgenes (top/bottom/left/right) deben deformar el frame
      // SIN deformar la matriz (y sus pines). Escalar X/Y por separado convierte
      // círculos en elipses, así que usamos un escalado uniforme (mismas
      // proporciones siempre) que quepa en ambos ejes.
      const widthScale = availableWidth / baseWidth;
      const heightScale = availableHeight / baseHeight;

      const EPS_SCALE = 0.999;
      const fitScale = Math.min(widthScale, heightScale);
      const scale = fitScale < 1 ? fitScale * EPS_SCALE : 1;

      table.style.transformOrigin = 'center center';
      table.style.transform = `scale(${scale})`;
    });
  }

  setToggleHandler(handler) {
    this.onToggle = typeof handler === 'function' ? handler : null;
  }
  
  /**
   * Serializa el estado de la matriz para guardarlo en un patch.
   * Guarda solo las conexiones activas como array de [row, col].
   * @returns {import('../state/schema.js').MatrixState} Estado serializado
   */
  serialize() {
    const connections = [];
    if (!this.table || !this._built) return { connections };
    
    const buttons = this.table.querySelectorAll('button.pin-btn.active');
    buttons.forEach(btn => {
      const row = parseInt(btn.dataset.row, 10);
      const col = parseInt(btn.dataset.col, 10);
      if (!isNaN(row) && !isNaN(col)) {
        connections.push([row, col]);
      }
    });
    
    return { connections };
  }
  
  /**
   * Restaura el estado de la matriz desde un patch.
   * @param {Partial<import('../state/schema.js').MatrixState>} data - Estado serializado
   */
  deserialize(data) {
    if (!data || !Array.isArray(data.connections)) return;
    if (!this.table || !this._built) return;
    
    // Primero, desactivar todas las conexiones existentes
    const activeButtons = this.table.querySelectorAll('button.pin-btn.active');
    activeButtons.forEach(btn => {
      const row = parseInt(btn.dataset.row, 10);
      const col = parseInt(btn.dataset.col, 10);
      // Notificar al handler si existe (para desconectar audio)
      if (this.onToggle) {
        this.onToggle(row, col, false, btn);
      }
      btn.classList.remove('active');
    });
    
    // Luego, activar las conexiones del patch
    data.connections.forEach(([row, col]) => {
      const btn = this.table.querySelector(`button.pin-btn[data-row="${row}"][data-col="${col}"]`);
      if (btn && !btn.disabled && !btn.classList.contains('is-hidden-pin')) {
        // Notificar al handler (para conectar audio)
        if (this.onToggle) {
          const allow = this.onToggle(row, col, true, btn) !== false;
          if (allow) {
            btn.classList.add('active');
          }
        } else {
          btn.classList.add('active');
        }
      }
    });
  }
  
  /**
   * Limpia todas las conexiones de la matriz.
   */
  clearAll() {
    if (!this.table || !this._built) return;
    
    const activeButtons = this.table.querySelectorAll('button.pin-btn.active');
    activeButtons.forEach(btn => {
      const row = parseInt(btn.dataset.row, 10);
      const col = parseInt(btn.dataset.col, 10);
      if (this.onToggle) {
        this.onToggle(row, col, false, btn);
      }
      btn.classList.remove('active');
    });
  }
}
