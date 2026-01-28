/**
 * Ventana flotante de log OSC
 * 
 * Muestra los mensajes OSC entrantes/salientes en tiempo real.
 * Se puede mostrar/ocultar desde los ajustes o el quickbar.
 */

import { t } from '../i18n/index.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('OSCLogWindow');

const ICON_SPRITE = './assets/icons/ui-sprite.svg';
const iconSvg = symbolId => `
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <use href="${ICON_SPRITE}#${symbolId}"></use>
  </svg>
`;

/** Número máximo de mensajes en el log */
const MAX_LOG_ENTRIES = 200;

/** Singleton de la ventana de log */
let instance = null;

/**
 * Ventana flotante draggable para log OSC
 */
export class OSCLogWindow {
  constructor() {
    if (instance) {
      return instance;
    }
    instance = this;
    
    this.element = null;
    this.logContainer = null;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.entries = [];
    this.filter = 'all'; // 'all', 'in', 'out'
    this.isPaused = false;
    
    this._boundOnMessage = this._onMessage.bind(this);
    this._boundOnDrag = this._onDrag.bind(this);
    this._boundOnDragEnd = this._onDragEnd.bind(this);
    
    this._createDOM();
    this._setupListeners();
    
    // Restaurar visibilidad desde localStorage
    const savedVisible = localStorage.getItem(STORAGE_KEYS.OSC_LOG_VISIBLE) === 'true';
    if (savedVisible) {
      this.show();
    }
  }
  
  /**
   * Crea la estructura DOM de la ventana
   */
  _createDOM() {
    this.element = document.createElement('div');
    this.element.className = 'osc-log-window';
    this.element.setAttribute('data-prevent-pan', 'true');
    
    // Header draggable
    const header = document.createElement('div');
    header.className = 'osc-log-window__header';
    
    const title = document.createElement('span');
    title.className = 'osc-log-window__title';
    title.textContent = t('osc.log.title');
    
    // Botones de control
    const controls = document.createElement('div');
    controls.className = 'osc-log-window__controls';
    
    // Botón pausar/reanudar
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'osc-log-window__btn';
    this.pauseBtn.title = t('osc.log.pause');
    this.pauseBtn.innerHTML = iconSvg('ti-player-pause');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    
    // Botón limpiar
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'osc-log-window__btn';
    clearBtn.title = t('osc.log.clear');
    clearBtn.innerHTML = iconSvg('ti-trash');
    clearBtn.addEventListener('click', () => this.clear());
    
    // Botón cerrar
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'osc-log-window__btn osc-log-window__btn--close';
    closeBtn.title = t('osc.log.close');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => this.hide());
    
    controls.appendChild(this.pauseBtn);
    controls.appendChild(clearBtn);
    controls.appendChild(closeBtn);
    
    header.appendChild(title);
    header.appendChild(controls);
    
    // Filtros
    const filterBar = document.createElement('div');
    filterBar.className = 'osc-log-window__filters';
    
    ['all', 'in', 'out'].forEach(filter => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'osc-log-window__filter';
      btn.dataset.filter = filter;
      btn.textContent = t(`osc.log.filter.${filter}`);
      if (filter === this.filter) {
        btn.classList.add('is-active');
      }
      btn.addEventListener('click', () => this.setFilter(filter));
      filterBar.appendChild(btn);
    });
    
    // Contenedor del log
    this.logContainer = document.createElement('div');
    this.logContainer.className = 'osc-log-window__log';
    
    // Mensaje inicial
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'osc-log-window__empty';
    emptyMsg.textContent = t('osc.log.noMessages');
    this.logContainer.appendChild(emptyMsg);
    
    this.element.appendChild(header);
    this.element.appendChild(filterBar);
    this.element.appendChild(this.logContainer);
    
    // Hacer header draggable
    header.addEventListener('mousedown', (e) => this._onDragStart(e));
    header.addEventListener('touchstart', (e) => this._onDragStart(e), { passive: false });
    
    // Insertar en el DOM (oculto inicialmente)
    this.element.hidden = true;
    document.body.appendChild(this.element);
    
    // Posición inicial
    this._loadPosition();
  }
  
  /**
   * Configura listeners de eventos OSC
   */
  _setupListeners() {
    // Escuchar eventos de visibilidad
    window.addEventListener('osc:log-visibility', (e) => {
      if (e.detail.visible) {
        this.show();
      } else {
        this.hide();
      }
    });
    
    // Escuchar mensajes OSC si la API está disponible
    if (typeof window.oscAPI !== 'undefined') {
      window.oscAPI.onMessage(this._boundOnMessage);
    }
    
    // También escuchar evento genérico para bridge
    window.addEventListener('osc:message', (e) => {
      if (e.detail) {
        this._onMessage(e.detail);
      }
    });
  }
  
  /**
   * Handler para mensajes OSC recibidos
   */
  _onMessage(data) {
    if (this.isPaused) return;
    
    const { address, args, direction = 'in', source } = data;
    
    this._addEntry({
      time: new Date(),
      direction,
      address,
      args,
      source
    });
  }
  
  /**
   * Añade una entrada al log
   */
  _addEntry(entry) {
    this.entries.push(entry);
    
    // Limitar número de entradas
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }
    
    this._renderEntry(entry);
  }
  
  /**
   * Renderiza una entrada en el DOM
   */
  _renderEntry(entry) {
    // Eliminar mensaje vacío si existe
    const emptyMsg = this.logContainer.querySelector('.osc-log-window__empty');
    if (emptyMsg) {
      emptyMsg.remove();
    }
    
    // Verificar filtro
    if (this.filter !== 'all' && this.filter !== entry.direction) {
      return;
    }
    
    const row = document.createElement('div');
    row.className = `osc-log-window__entry osc-log-window__entry--${entry.direction}`;
    
    const time = document.createElement('span');
    time.className = 'osc-log-window__time';
    time.textContent = entry.time.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 2
    });
    
    const direction = document.createElement('span');
    direction.className = 'osc-log-window__direction';
    direction.textContent = entry.direction === 'in' ? '←' : '→';
    
    const address = document.createElement('span');
    address.className = 'osc-log-window__address';
    address.textContent = entry.address;
    
    const args = document.createElement('span');
    args.className = 'osc-log-window__args';
    args.textContent = entry.args?.map(a => {
      if (typeof a === 'number') {
        return Number.isInteger(a) ? a : a.toFixed(4);
      }
      return JSON.stringify(a);
    }).join(', ') || '';
    
    row.appendChild(time);
    row.appendChild(direction);
    row.appendChild(address);
    row.appendChild(args);
    
    this.logContainer.appendChild(row);
    
    // Auto-scroll al final
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    
    // Limitar entradas en DOM
    while (this.logContainer.children.length > MAX_LOG_ENTRIES) {
      this.logContainer.firstChild.remove();
    }
  }
  
  /**
   * Establece el filtro de mensajes
   */
  setFilter(filter) {
    this.filter = filter;
    
    // Actualizar botones
    this.element.querySelectorAll('.osc-log-window__filter').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.filter === filter);
    });
    
    // Re-renderizar log
    this._rerenderLog();
  }
  
  /**
   * Re-renderiza todo el log según el filtro actual
   */
  _rerenderLog() {
    this.logContainer.innerHTML = '';
    
    const filteredEntries = this.entries.filter(entry => 
      this.filter === 'all' || this.filter === entry.direction
    );
    
    if (filteredEntries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'osc-log-window__empty';
      emptyMsg.textContent = t('osc.log.empty', 'No hay mensajes OSC');
      this.logContainer.appendChild(emptyMsg);
      return;
    }
    
    filteredEntries.forEach(entry => this._renderEntry(entry));
  }
  
  /**
   * Alterna pausa del log
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    this.pauseBtn.innerHTML = iconSvg(this.isPaused ? 'ti-player-play' : 'ti-player-pause');
    this.pauseBtn.title = t(this.isPaused ? 'osc.log.resume' : 'osc.log.pause');
    this.pauseBtn.classList.toggle('is-active', this.isPaused);
  }
  
  /**
   * Limpia el log
   */
  clear() {
    this.entries = [];
    this.logContainer.innerHTML = '';
    
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'osc-log-window__empty';
    emptyMsg.textContent = t('osc.log.noMessages');
    this.logContainer.appendChild(emptyMsg);
  }
  
  /**
   * Muestra la ventana
   */
  show() {
    if (this.isVisible) return;
    
    this.isVisible = true;
    this.element.hidden = false;
    localStorage.setItem(STORAGE_KEYS.OSC_LOG_VISIBLE, 'true');
    
    // Sincronizar checkbox en settings si está abierto
    const checkbox = document.getElementById('osc-log-checkbox');
    if (checkbox) checkbox.checked = true;
    
    log.info('Log window shown');
  }
  
  /**
   * Oculta la ventana
   */
  hide() {
    if (!this.isVisible) return;
    
    this.isVisible = false;
    this.element.hidden = true;
    localStorage.setItem(STORAGE_KEYS.OSC_LOG_VISIBLE, 'false');
    
    // Sincronizar checkbox en settings si está abierto
    const checkbox = document.getElementById('osc-log-checkbox');
    if (checkbox) checkbox.checked = false;
    
    log.info('Log window hidden');
  }
  
  /**
   * Alterna visibilidad
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DRAG & DROP
  // ═══════════════════════════════════════════════════════════════════════════
  
  _onDragStart(e) {
    if (e.target.closest('button')) return;
    
    this.isDragging = true;
    this.element.classList.add('is-dragging');
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = this.element.getBoundingClientRect();
    
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
    
    document.addEventListener('mousemove', this._boundOnDrag);
    document.addEventListener('mouseup', this._boundOnDragEnd);
    document.addEventListener('touchmove', this._boundOnDrag, { passive: false });
    document.addEventListener('touchend', this._boundOnDragEnd);
    
    e.preventDefault();
  }
  
  _onDrag(e) {
    if (!this.isDragging) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    let x = clientX - this.dragOffset.x;
    let y = clientY - this.dragOffset.y;
    
    // Limitar a los bordes de la ventana
    const rect = this.element.getBoundingClientRect();
    x = Math.max(0, Math.min(window.innerWidth - rect.width, x));
    y = Math.max(0, Math.min(window.innerHeight - rect.height, y));
    
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
    
    e.preventDefault();
  }
  
  _onDragEnd() {
    this.isDragging = false;
    this.element.classList.remove('is-dragging');
    
    document.removeEventListener('mousemove', this._boundOnDrag);
    document.removeEventListener('mouseup', this._boundOnDragEnd);
    document.removeEventListener('touchmove', this._boundOnDrag);
    document.removeEventListener('touchend', this._boundOnDragEnd);
    
    this._savePosition();
  }
  
  _savePosition() {
    const rect = this.element.getBoundingClientRect();
    localStorage.setItem('synthigme:osc-log-position', JSON.stringify({
      x: rect.left,
      y: rect.top
    }));
  }
  
  _loadPosition() {
    try {
      const saved = localStorage.getItem('synthigme:osc-log-position');
      if (saved) {
        const { x, y } = JSON.parse(saved);
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
      }
    } catch {
      // Usar posición por defecto
    }
  }
  
  /**
   * Añade un mensaje manualmente (para logging de envíos)
   */
  logOutgoing(address, args) {
    this._onMessage({
      address,
      args,
      direction: 'out'
    });
  }
  
  /**
   * Añade un mensaje de entrada manualmente
   */
  logIncoming(address, args, source) {
    this._onMessage({
      address,
      args,
      direction: 'in',
      source
    });
  }
}

/**
 * Obtiene o crea la instancia singleton
 */
export function getOSCLogWindow() {
  if (!instance) {
    instance = new OSCLogWindow();
  }
  return instance;
}

/**
 * Inicializa el log window (llamar al inicio de la app)
 */
export function initOSCLogWindow() {
  // Solo en Electron
  if (typeof window.oscAPI === 'undefined') {
    return null;
  }
  return getOSCLogWindow();
}
