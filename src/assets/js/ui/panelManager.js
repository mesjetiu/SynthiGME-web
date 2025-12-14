// Gestor de paneles modulares que permiten construir varios marcos Synthi

class Panel {
  constructor(options = {}) {
    const { id, title, subtitle } = options;
    this.id = id || `panel-${Date.now()}`;
    this.element = document.createElement('div');
    this.element.className = 'panel';
    this.element.id = this.id;
    this.sections = new Map();

    const buildTag = document.createElement('span');
    buildTag.className = 'panel-build-version';
    buildTag.textContent = '';
    this.element.appendChild(buildTag);

    if (title) this.setTitle(title);
    if (subtitle) this.setSubtitle(subtitle);
  }

  appendElement(el) {
    this.element.appendChild(el);
    return el;
  }

  setTitle(text) {
    if (!this.titleEl) {
      this.titleEl = document.createElement('h1');
      this.element.appendChild(this.titleEl);
    }
    this.titleEl.textContent = text;
    return this.titleEl;
  }

  setSubtitle(text) {
    if (!this.subtitleEl) {
      this.subtitleEl = document.createElement('p');
      this.subtitleEl.style.fontSize = '0.8rem';
      this.subtitleEl.style.textAlign = 'center';
      this.subtitleEl.style.marginTop = '0';
      this.element.appendChild(this.subtitleEl);
    }
    this.subtitleEl.textContent = text;
    return this.subtitleEl;
  }

  addHeaderElement(el) {
    if (!el) return null;
    this.element.insertBefore(el, this.titleEl || this.element.firstChild);
    return el;
  }

  addSection({ id, title, type = 'row', className } = {}) {
    if (!id) throw new Error('Section id is required');
    if (title) {
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'section-title';
      sectionTitle.textContent = title;
      this.element.appendChild(sectionTitle);
    }

    let contentNode;
    if (type === 'matrix') {
      const wrapper = document.createElement('div');
      wrapper.className = 'matrix-container';
      const table = document.createElement('table');
      table.className = 'matrix';
      wrapper.appendChild(table);
      this.element.appendChild(wrapper);
      contentNode = table;
    } else if (type === 'custom') {
      contentNode = document.createElement('div');
      if (className) contentNode.className = className;
      this.element.appendChild(contentNode);
    } else {
      const row = document.createElement('div');
      row.className = className || 'row';
      this.element.appendChild(row);
      contentNode = row;
    }

    contentNode.id = id;
    this.sections.set(id, contentNode);
    return contentNode;
  }

  getSection(id) {
    return this.sections.get(id) || null;
  }
}

export class PanelManager {
  constructor(rootEl) {
    if (!rootEl) throw new Error('PanelManager requires a root element');
    this.rootEl = rootEl;
    this.panels = new Map();
  }

  createPanel(options = {}) {
    const panel = new Panel(options);
    this.rootEl.appendChild(panel.element);
    if (options.id) {
      this.panels.set(options.id, panel);
    }
    return panel;
  }

  getPanel(id) {
    return this.panels.get(id) || null;
  }
}
