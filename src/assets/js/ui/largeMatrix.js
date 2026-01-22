/**
 * Matriz de conexión grande (63×67) para audio y control.
 * Implementa el contrato Serializable para persistencia de estado.
 * 
 * @module ui/largeMatrix
 * @see state/schema.js para definición de MatrixState
 */

import { getPinColorMenu, PIN_CSS_COLORS } from './pinColorMenu.js';

/** Tiempo en ms para detectar pulsación larga (touch) */
const LONG_PRESS_DURATION = 500;

export class LargeMatrix {
  constructor(tableElement, { rows = 63, cols = 67, frame = null, hiddenRows = [], hiddenCols = [], sourceMap = null, destMap = null, onToggle = null, panelId = null, defaultPinColor = null, getDefaultPinColor = null } = {}) {
    this.table = tableElement;
    this.rows = rows;
    this.cols = cols;
    this.hiddenRows = new Set(hiddenRows || []);
    this.hiddenCols = new Set(hiddenCols || []);
    this.sourceMap = sourceMap instanceof Map ? sourceMap : new Map();
    this.destMap = destMap instanceof Map ? destMap : new Map();
    this._layoutRaf = null;
    this._built = false;
    this._onTableClick = null;
    this._onContextMenu = null;
    this._onTouchStart = null;
    this._onTouchEnd = null;
    this._onTouchStartSecondFinger = null;  // Para cancelar long press en pinch
    this._longPressTimer = null;
    this._longPressTarget = null;
    this.frame = this._normalizeFrame(frame);
    this.onToggle = typeof onToggle === 'function' ? onToggle : null;
    
    // Configuración de colores de pines
    this.panelId = panelId;
    this.defaultPinColor = defaultPinColor;  // Color por defecto estático
    this.getDefaultPinColor = getDefaultPinColor;  // Función para color dinámico (ej: osciloscopio)
    
    // Mapa de colores de pines: "row:col" -> pinType (o null para default)
    this._pinColors = new Map();
    
    // Callback cuando cambia el color de un pin
    this.onPinColorChange = null;
    
    // Función para determinar el contexto de un pin (audio, control, oscilloscope)
    // Se configura desde app.js para detectar conexiones al osciloscopio
    this.getPinContext = null;

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
      
      // Si hay longpress activo, cancelar click
      if (this._longPressTriggered) {
        this._longPressTriggered = false;
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      
      const rowIndex = Number(btn.dataset.row);
      const colIndex = Number(btn.dataset.col);
      const nextActive = !btn.classList.contains('active');
      
      // Obtener color a usar para esta conexión
      // Si activamos, usar el próximo color del menú para el contexto
      let pinColor;
      if (nextActive) {
        const context = this._getPinContext(rowIndex, colIndex);
        pinColor = getPinColorMenu().getNextColor(context);
        // Guardar el color seleccionado
        this._pinColors.set(`${rowIndex}:${colIndex}`, pinColor);
      } else {
        pinColor = this._getEffectivePinColor(rowIndex, colIndex);
      }
      
      const allow = this.onToggle ? this.onToggle(rowIndex, colIndex, nextActive, btn, pinColor) !== false : true;
      if (!allow) return;
      btn.classList.toggle('active', nextActive);
      
      // Aplicar clase de color si se activa
      if (nextActive) {
        this._applyPinColorClass(btn, pinColor);
      } else {
        this._removePinColorClasses(btn);
        // Limpiar color guardado al desactivar
        this._pinColors.delete(`${rowIndex}:${colIndex}`);
      }
      
      // Notificar que hay cambios sin guardar
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    };
    table.addEventListener('click', this._onTableClick);
    
    // Contextmenu (click derecho) para selección de color
    this._onContextMenu = ev => {
      const btn = ev.target?.closest?.('button.pin-btn');
      if (!btn || !table.contains(btn)) return;
      if (btn.disabled || btn.classList.contains('is-hidden-pin')) return;
      
      ev.preventDefault();
      ev.stopPropagation();
      
      this._showColorMenu(btn, ev.clientX, ev.clientY);
    };
    table.addEventListener('contextmenu', this._onContextMenu);
    
    // Long press para táctil
    this._onTouchStart = ev => {
      if (ev.touches.length !== 1) return;
      
      const btn = ev.target?.closest?.('button.pin-btn');
      if (!btn || !table.contains(btn)) return;
      if (btn.disabled || btn.classList.contains('is-hidden-pin')) return;
      
      this._longPressTarget = btn;
      this._longPressStartPos = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      this._longPressTriggered = false;
      
      this._longPressTimer = setTimeout(() => {
        this._longPressTriggered = true;
        const touch = ev.touches[0] || this._longPressStartPos;
        this._showColorMenu(btn, touch.clientX || this._longPressStartPos.x, touch.clientY || this._longPressStartPos.y);
      }, LONG_PRESS_DURATION);
    };
    table.addEventListener('touchstart', this._onTouchStart, { passive: true });
    
    this._onTouchEnd = ev => {
      this._cancelLongPress();
    };
    table.addEventListener('touchend', this._onTouchEnd);
    table.addEventListener('touchcancel', this._onTouchEnd);
    
    // Cancelar long press si se detecta un segundo dedo (pinch/zoom)
    this._onTouchStartSecondFinger = ev => {
      if (ev.touches.length > 1 && this._longPressTimer) {
        this._cancelLongPress();
      }
    };
    // Usar capture para detectar antes que otros handlers
    document.addEventListener('touchstart', this._onTouchStartSecondFinger, { passive: true, capture: true });
    
    table.addEventListener('touchmove', ev => {
      // Cancelar si hay más de un dedo (pinch) o si se mueve demasiado
      if (ev.touches.length > 1) {
        this._cancelLongPress();
        return;
      }
      if (this._longPressStartPos && ev.touches.length === 1) {
        const dx = ev.touches[0].clientX - this._longPressStartPos.x;
        const dy = ev.touches[0].clientY - this._longPressStartPos.y;
        if (Math.hypot(dx, dy) > 10) {
          this._cancelLongPress();
        }
      }
    }, { passive: true });

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
        } else {
          // Un pin es inactivo si no tiene source O no tiene dest
          const isInactive = !this.sourceMap.has(r) || !this.destMap.has(c);
          if (isInactive) {
            btn.classList.add('is-inactive-pin');
            btn.disabled = true;
            btn.tabIndex = -1;
          }
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
  
  /**
   * Cancela el timer de longpress.
   * @private
   */
  _cancelLongPress() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this._longPressTarget = null;
    this._longPressStartPos = null;
  }
  
  /**
   * Muestra el menú de colores para un pin.
   * @private
   */
  _showColorMenu(btn, x, y) {
    const rowIndex = Number(btn.dataset.row);
    const colIndex = Number(btn.dataset.col);
    const key = `${rowIndex}:${colIndex}`;
    const isActive = btn.classList.contains('active');
    const currentColor = isActive ? this._getEffectivePinColor(rowIndex, colIndex) : null;
    const context = this._getPinContext(rowIndex, colIndex);
    
    const menu = getPinColorMenu();
    menu.show(x, y, btn, {
      context: context,
      currentColor: currentColor,
      isActive: isActive,
      onSelect: (selectedColor, shouldActivate) => {
        this._handleColorSelection(rowIndex, colIndex, selectedColor, shouldActivate, btn);
      }
    });
  }
  
  /**
   * Determina el contexto de un pin.
   * @private
   */
  _getPinContext(row, col) {
    // Si hay función externa para determinar contexto, usarla
    if (this.getPinContext) {
      return this.getPinContext(row, col);
    }
    // Fallback basado en panelId
    if (this.panelId === 'panel-5') return 'audio';
    if (this.panelId === 'panel-6') return 'control';
    return 'audio';
  }
  
  /**
   * Maneja la selección de color desde el menú.
   * @private
   */
  _handleColorSelection(row, col, selectedColor, shouldActivate, btn) {
    const key = `${row}:${col}`;
    const wasActive = btn.classList.contains('active');
    
    // Guardar el color seleccionado
    this._pinColors.set(key, selectedColor);
    
    if (wasActive) {
      // Pin ya activo: solo cambiar color
      this._applyPinColorClass(btn, selectedColor);
      
      // Notificar cambio de color (para actualizar ganancia)
      if (this.onPinColorChange) {
        this.onPinColorChange(row, col, selectedColor, btn);
      }
      
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    } else if (shouldActivate) {
      // Pin inactivo: activarlo con el color seleccionado
      const allow = this.onToggle ? this.onToggle(row, col, true, btn, selectedColor) !== false : true;
      if (allow) {
        btn.classList.add('active');
        this._applyPinColorClass(btn, selectedColor);
        document.dispatchEvent(new CustomEvent('synth:userInteraction'));
      }
    }
  }
  
  /**
   * Establece el color de un pin.
   * @private
   */
  _setPinColor(row, col, color, btn) {
    const key = `${row}:${col}`;
    const isActive = btn?.classList.contains('active');
    
    if (color === null) {
      this._pinColors.delete(key);
    } else {
      this._pinColors.set(key, color);
    }
    
    // Si el pin está activo, actualizar la clase visual y reconectar con nuevo color
    if (isActive && btn) {
      const effectiveColor = this._getEffectivePinColor(row, col);
      this._applyPinColorClass(btn, effectiveColor);
      
      // Notificar cambio de color (para reconectar audio si es necesario)
      if (this.onPinColorChange) {
        this.onPinColorChange(row, col, effectiveColor, btn);
      }
      
      document.dispatchEvent(new CustomEvent('synth:userInteraction'));
    }
  }
  
  /**
   * Obtiene el color efectivo para un pin (considerando default dinámico).
   * @private
   */
  _getEffectivePinColor(row, col) {
    const key = `${row}:${col}`;
    const storedColor = this._pinColors.get(key);
    
    if (storedColor) return storedColor;
    
    // Usar función dinámica si existe (para osciloscopio)
    if (this.getDefaultPinColor) {
      const dynamicDefault = this.getDefaultPinColor(row, col);
      if (dynamicDefault) return dynamicDefault;
    }
    
    // Usar default estático del panel
    return this.defaultPinColor || 'WHITE';
  }
  
  /**
   * Aplica la clase CSS de color a un pin.
   * @private
   */
  _applyPinColorClass(btn, color) {
    this._removePinColorClasses(btn);
    if (color) {
      btn.classList.add(`pin-${color.toLowerCase()}`);
    }
  }
  
  /**
   * Elimina todas las clases de color de un pin.
   * @private
   */
  _removePinColorClasses(btn) {
    btn.classList.remove('pin-white', 'pin-grey', 'pin-green', 'pin-red', 'pin-blue', 'pin-yellow', 'pin-cyan', 'pin-purple');
  }
  
  /**
   * Obtiene el color actual de un pin.
   * @param {number} row
   * @param {number} col
   * @returns {string|null}
   */
  getPinColor(row, col) {
    return this._pinColors.get(`${row}:${col}`) || null;
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
        const pinColor = this._pinColors.get(`${row}:${col}`);
        // Formato: [row, col] o [row, col, pinType] si hay color específico
        if (pinColor) {
          connections.push([row, col, pinColor]);
        } else {
          connections.push([row, col]);
        }
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
    
    // Limpiar colores previos
    this._pinColors.clear();
    
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
      this._removePinColorClasses(btn);
    });
    
    // Luego, activar las conexiones del patch
    data.connections.forEach((conn) => {
      // Soporta formato antiguo [row, col] y nuevo [row, col, pinType]
      const row = conn[0];
      const col = conn[1];
      const pinType = conn[2] || null;  // Tercer elemento opcional
      
      const btn = this.table.querySelector(`button.pin-btn[data-row="${row}"][data-col="${col}"]`);
      if (btn && !btn.disabled && !btn.classList.contains('is-hidden-pin')) {
        // Guardar color si se especificó
        if (pinType) {
          this._pinColors.set(`${row}:${col}`, pinType);
        }
        
        const effectiveColor = this._getEffectivePinColor(row, col);
        
        // Notificar al handler (para conectar audio)
        if (this.onToggle) {
          const allow = this.onToggle(row, col, true, btn, effectiveColor) !== false;
          if (allow) {
            btn.classList.add('active');
            this._applyPinColorClass(btn, effectiveColor);
          }
        } else {
          btn.classList.add('active');
          this._applyPinColorClass(btn, effectiveColor);
        }
      }
    });
  }
  
  /**
   * Limpia todas las conexiones de la matriz.
   */
  clearAll() {
    if (!this.table || !this._built) return;
    
    // Limpiar colores
    this._pinColors.clear();
    
    const activeButtons = this.table.querySelectorAll('button.pin-btn.active');
    activeButtons.forEach(btn => {
      const row = parseInt(btn.dataset.row, 10);
      const col = parseInt(btn.dataset.col, 10);
      if (this.onToggle) {
        this.onToggle(row, col, false, btn);
      }
      btn.classList.remove('active');
      this._removePinColorClasses(btn);
    });
  }
  
  /**
   * Actualiza la visibilidad de pines inactivos.
   * @param {boolean} showInactive - true = mostrar todos, false = atenuar inactivos
   */
  setShowInactivePins(showInactive) {
    if (!this.table || !this._built) return;
    
    const buttons = this.table.querySelectorAll('button.pin-btn');
    buttons.forEach(btn => {
      // Ignorar pines ocultos (hiddenRows/hiddenCols)
      if (btn.classList.contains('is-hidden-pin')) return;
      
      const r = parseInt(btn.dataset.row, 10);
      const c = parseInt(btn.dataset.col, 10);
      const isInactive = !this.sourceMap.has(r) || !this.destMap.has(c);
      
      if (isInactive) {
        if (showInactive) {
          btn.classList.remove('is-inactive-pin');
          btn.disabled = false;
          btn.tabIndex = 0;
        } else {
          btn.classList.add('is-inactive-pin');
          btn.disabled = true;
          btn.tabIndex = -1;
        }
      }
    });
  }
}
