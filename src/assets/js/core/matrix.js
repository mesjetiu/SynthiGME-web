// Administrador de la matriz de pines que conecta fuentes y destinos entre módulos
export class Matrix {
  constructor(engine, tableEl, sourcePorts, destPorts, options = {}) {
    this.engine = engine;
    this.tableEl = tableEl;
    this.sourcePorts = sourcePorts;
    this.destPorts = destPorts;
    this.connections = [];
    this.options = Object.assign({
      freqDepth: 80,
      ampDepth: 0.5,
      outputGain: 1.0
    }, options);
  }

  build() {
    this.tableEl.innerHTML = '';
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = 'Sources \\ Destinos';
    trHead.appendChild(th0);
    for (const dest of this.destPorts) {
      const th = document.createElement('th');
      const span = document.createElement('span');
      span.className = 'matrix-header-vertical';
      span.textContent = dest.label;
      th.appendChild(span);
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    this.tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.connections = [];
    this.sourcePorts.forEach((src, rowIndex) => {
      this.connections[rowIndex] = [];
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = src.label;
      tr.appendChild(th);
      this.destPorts.forEach((dest, colIndex) => {
        this.connections[rowIndex][colIndex] = null;
        const td = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'pin-btn';
        btn.dataset.row = rowIndex;
        btn.dataset.col = colIndex;
        btn.addEventListener('click', () => this.toggleConnection(btn, rowIndex, colIndex));
        td.appendChild(btn);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    this.tableEl.appendChild(tbody);
  }

  getPortNode(portInfo, isSource) {
    if (!portInfo || !portInfo.moduleId) return null;
    const mod = this.engine.findModule(portInfo.moduleId);
    if (!mod) return null;
    if (isSource) {
      const out = mod.outputs.find(o => o.id === portInfo.portId);
      return out ? out.node : null;
    }
    const inp = mod.inputs.find(i => i.id === portInfo.portId);
    return inp || null;
  }

  toggleConnection(btn, r, c) {
    if (window._synthApp && window._synthApp.ensureAudio) {
      window._synthApp.ensureAudio();
    }
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      this.removeConnection(r, c);
    } else {
      btn.classList.add('active');
      this.createConnection(r, c);
    }
  }

  createConnection(r, c) {
    const ctx = this.engine.audioCtx;
    if (!ctx) return;
    const srcInfo = this.sourcePorts[r];
    const destInfo = this.destPorts[c];

    if (destInfo.type === 'output') {
      const srcNode = this.getPortNode(srcInfo, true);
      if (!srcNode) return;
      const gain = ctx.createGain();
      gain.gain.value = this.options.outputGain;
      srcNode.connect(gain);
      const busIndex = (destInfo.busIndex != null)
        ? destInfo.busIndex
        : (typeof destInfo.bus === 'number' ? destInfo.bus - 1 : null);
      const busNode = (busIndex != null)
        ? this.engine.getOutputBusNode(busIndex)
        : null;
      if (busNode) {
        gain.connect(busNode);
      } else if (this.engine.masterL) {
        gain.connect(this.engine.masterL);
      }
      this.connections[r][c] = gain;
      return;
    }

    const srcNode = this.getPortNode(srcInfo, true);
    const destPort = this.getPortNode(destInfo, false);
    if (!srcNode || !destPort || !destPort.param) return;
    const gain = ctx.createGain();
    if (destInfo.type === 'freq') gain.gain.value = this.options.freqDepth;
    if (destInfo.type === 'amp') gain.gain.value = this.options.ampDepth;
    srcNode.connect(gain);
    gain.connect(destPort.param);
    this.connections[r][c] = gain;
  }

  removeConnection(r, c) {
    const conn = this.connections[r][c];
    if (!conn) return;
    try { conn.disconnect(); } catch (error) {}
    this.connections[r][c] = null;
  }
}
