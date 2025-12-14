export class LargeMatrix {
  constructor(tableElement, { rows = 63, cols = 66, frame = null } = {}) {
    this.table = tableElement;
    this.rows = rows;
    this.cols = cols;
    this._layoutRaf = null;
    this.frame = this._normalizeFrame(frame);

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
      // Traslación del frame en "pasos" (1 paso = 1/66 del cuadrado).
      translateSteps: { x: 0, y: 0 },
      // Márgenes internos del frame en "pasos". Positivo recorta; negativo expande.
      marginsSteps: { left: 0, right: 0, top: 0, bottom: 0 }
    };

    if (!frame) return defaults;

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
      }
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

    // Definimos 1 paso como 1/66 del cuadrado (porque el frame es 66x66).
    const steps = this.cols;
    const stepPercent = squarePercent / steps;

    const m = this.frame.marginsSteps;
    const t = this.frame.translateSteps;

    let leftPercent = outerMargin + (t.x + m.left) * stepPercent;
    let topPercent = outerMargin + (t.y + m.top) * stepPercent;
    let widthPercent = squarePercent - (m.left + m.right) * stepPercent;
    let heightPercent = squarePercent - (m.top + m.bottom) * stepPercent;

    // Clamp defensivo para evitar valores degenerados.
    widthPercent = Math.max(1, Math.min(100, widthPercent));
    heightPercent = Math.max(1, Math.min(100, heightPercent));
    leftPercent = Math.min(100 - 1, Math.max(-50, leftPercent));
    topPercent = Math.min(100 - 1, Math.max(-50, topPercent));
    // Evitar que el frame se salga demasiado del panel por la derecha/abajo.
    widthPercent = Math.min(widthPercent, 100 - leftPercent);
    heightPercent = Math.min(heightPercent, 100 - topPercent);

    container.style.position = 'absolute';
    container.style.left = `${leftPercent}%`;
    container.style.top = `${topPercent}%`;
    container.style.width = `${widthPercent}%`;
    container.style.height = `${heightPercent}%`;
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.overflow = 'hidden';
    container.style.background = 'transparent';
  }

  build() {
    const table = this.table;
    if (!table) return;

    table.innerHTML = '';
    const tbody = document.createElement('tbody');

    for (let r = 0; r < this.rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < this.cols; c++) {
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'pin-btn';
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
        });
        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

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
      // SIN acoplar dimensiones. Para eso escalamos X e Y por separado.
      // Además, restamos un pequeño epsilon para evitar clipping por redondeos.
      const EPS_PX = 2;
      const safeWidth = Math.max(0, availableWidth - EPS_PX);
      const safeHeight = Math.max(0, availableHeight - EPS_PX);

      const scaleX = safeWidth / baseWidth;
      const scaleY = safeHeight / baseHeight;

      table.style.transformOrigin = 'center center';
      table.style.transform = `scale(${scaleX}, ${scaleY})`;
    });
  }
}
