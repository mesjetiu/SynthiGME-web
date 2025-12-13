export class LargeMatrix {
  constructor(tableElement, { rows = 63, cols = 66 } = {}) {
    this.table = tableElement;
    this.rows = rows;
    this.cols = cols;
    this._layoutRaf = null;

    if (this.table) {
      this.table.classList.add('matrix-large');
    }
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

      const widthScale = availableWidth / baseWidth;
      const heightScale = availableHeight / baseHeight;

      // Escala uniforme que garantiza que la matriz completa quepa dentro
      // del contenedor. No ampliamos por encima de 1 para mantener
      // el tamaño base en pantallas grandes.
      const scale = Math.min(1, widthScale, heightScale);

      table.style.transformOrigin = 'center center';
      table.style.transform = `scale(${scale})`;
    });
  }
}
