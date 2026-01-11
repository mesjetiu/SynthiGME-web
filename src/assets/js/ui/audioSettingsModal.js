// Modal de configuración de audio del sistema
// Permite rutear las salidas lógicas del Synthi a las salidas físicas del sistema
// Soporta configuraciones multicanal (estéreo, 5.1, 7.1, etc.)

import { t, onLocaleChange } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { STORAGE_KEYS, OUTPUT_CHANNELS, INPUT_CHANNELS, DEFAULT_PHYSICAL_CHANNELS } from '../utils/constants.js';

const log = createLogger('AudioSettingsModal');

/**
 * Clase que maneja la ventana modal de configuración de audio del sistema.
 * Permite mapear N salidas lógicas a N salidas físicas de forma aditiva.
 * La matriz se reconstruye dinámicamente cuando cambia el número de canales.
 */
export class AudioSettingsModal {
  /**
   * @param {Object} options
   * @param {number} [options.outputCount=8] - Número de salidas lógicas del sintetizador
   * @param {number} [options.inputCount=8] - Número de entradas lógicas (reservado, no funcional aún)
   * @param {number} [options.physicalChannels=2] - Número inicial de canales físicos
   * @param {string[]} [options.channelLabels] - Etiquetas para los canales físicos
   * @param {Function} [options.onRoutingChange] - Callback cuando cambia el ruteo
   * @param {Function} [options.onOutputDeviceChange] - Callback cuando cambia dispositivo de salida
   * @param {Function} [options.onInputDeviceChange] - Callback cuando cambia dispositivo de entrada
   */
  constructor(options = {}) {
    const { 
      outputCount = OUTPUT_CHANNELS, 
      inputCount = INPUT_CHANNELS, 
      physicalChannels = DEFAULT_PHYSICAL_CHANNELS,
      physicalInputChannels = 2,
      channelLabels = ['L', 'R'],
      inputChannelLabels = ['Mic/L', 'R'],
      onRoutingChange,
      onInputRoutingChange,
      onOutputDeviceChange, 
      onInputDeviceChange,
      onStereoBusRoutingChange  // Callback para cambios en routing de stereo buses
    } = options;
    
    this.outputCount = outputCount;
    this.inputCount = inputCount;  // 8 Input Amplifiers del Synthi
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURACIÓN MULTICANAL
    // ─────────────────────────────────────────────────────────────────────────
    // physicalChannels: número de canales físicos del dispositivo actual
    // channelLabels: etiquetas descriptivas para cada canal (L, R, C, LFE, etc.)
    // ─────────────────────────────────────────────────────────────────────────
    this.physicalChannels = physicalChannels;
    this.channelLabels = channelLabels;
    
    // Canales de entrada del sistema (Mic/Line)
    this.physicalInputChannels = physicalInputChannels;
    this.inputChannelLabels = inputChannelLabels;
    
    this.onRoutingChange = onRoutingChange;
    this.onInputRoutingChange = onInputRoutingChange;
    this.onOutputDeviceChange = onOutputDeviceChange;
    this.onInputDeviceChange = onInputDeviceChange;
    this.onStereoBusRoutingChange = onStereoBusRoutingChange;
    
    // Stereo bus routing: Pan 1-4 (A) y Pan 5-8 (B) a canales físicos
    // Por defecto ambos van a L/R (canales 0,1)
    const loadedStereoBusRouting = this._loadStereoBusRouting();
    this.stereoBusRouting = loadedStereoBusRouting || {
      A: [0, 1],  // Pan 1-4 → L, R
      B: [0, 1]   // Pan 5-8 → L, R
    };
    
    // Dispositivos seleccionados
    this.selectedOutputDevice = localStorage.getItem(STORAGE_KEYS.OUTPUT_DEVICE) || 'default';
    this.selectedInputDevice = localStorage.getItem(STORAGE_KEYS.INPUT_DEVICE) || 'default';
    this.availableOutputDevices = [];
    this.availableInputDevices = [];
    
    // Elementos de selectores
    this.outputDeviceSelect = null;
    this.inputDeviceSelect = null;
    
    // Elemento para mostrar información de canales
    this.channelInfoElement = null;
    
    // Contenedor de la matriz (para reconstrucción dinámica)
    this.matrixContainer = null;
    
    // Estado de ruteo de SALIDA: cada salida lógica tiene un array de booleanos por canal físico
    // outputRouting[busIndex][channelIndex] = boolean
    const loadedRouting = this._loadRouting();
    this.outputRouting = loadedRouting || this._getDefaultRouting();
    
    if (loadedRouting) {
      log.info(' Output routing loaded from localStorage:', this.outputRouting);
    } else {
      log.info(' Using default output routing (no saved data)');
    }
    
    // Estado de ruteo de ENTRADA: cada entrada del sistema tiene un array de booleanos por Input Amplifier
    // inputRouting[systemInputIndex][synthChannelIndex] = boolean
    const loadedInputRouting = this._loadInputRouting();
    this.inputRouting = loadedInputRouting || this._getDefaultInputRouting();
    
    if (loadedInputRouting) {
      log.info(' Input routing loaded from localStorage:', this.inputRouting);
    } else {
      log.info(' Using default input routing (no saved data)');
    }
    
    // Elementos DOM
    this.overlay = null;
    this.modal = null;
    this.isOpen = false;
    
    // Array de botones toggle para actualización dinámica
    this.outputToggleButtons = [];
    this.inputToggleButtons = [];
    
    // Contenedor de matriz de entrada
    this.inputMatrixContainer = null;
    
    // Referencias a elementos con texto traducible
    this._textElements = {};
    
    this._create();
    
    // Escuchar cambios de idioma para actualizar textos
    this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
  }

  /**
   * Devuelve el ruteo por defecto: out1 → canal 0, out2 → canal 1, resto apagado
   */
  _getDefaultRouting() {
    return Array.from({ length: this.outputCount }, (_, busIdx) => 
      Array.from({ length: this.physicalChannels }, (_, chIdx) => {
        // Por defecto: bus 0 → canal 0, bus 1 → canal 1
        return (busIdx === 0 && chIdx === 0) || (busIdx === 1 && chIdx === 1);
      })
    );
  }

  /**
   * Carga el ruteo desde localStorage.
   * Soporta tanto el formato legacy {left, right} como el nuevo formato multicanal [bool, bool, ...]
   * 
   * @returns {boolean[][]|null} - Matriz de ruteo o null si no hay datos guardados
   */
  _loadRouting() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIO_ROUTING);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return null;
      
      // Detectar formato y convertir
      return Array.from({ length: this.outputCount }, (_, busIdx) => {
        const savedBus = parsed[busIdx];
        
        if (Array.isArray(savedBus)) {
          // Formato multicanal: array de booleanos
          // Expandir/recortar al número actual de canales físicos
          return Array.from({ length: this.physicalChannels }, (_, chIdx) => {
            return savedBus[chIdx] === true;
          });
        } else if (savedBus && typeof savedBus.left === 'boolean') {
          // Formato legacy: {left, right} → convertir a array
          return Array.from({ length: this.physicalChannels }, (_, chIdx) => {
            if (chIdx === 0) return savedBus.left;
            if (chIdx === 1) return savedBus.right;
            return false; // Canales adicionales apagados
          });
        }
        
        // Sin datos guardados para este bus, usar default
        return Array.from({ length: this.physicalChannels }, (_, chIdx) => {
          return (busIdx === 0 && chIdx === 0) || (busIdx === 1 && chIdx === 1);
        });
      });
    } catch (e) {
      log.warn(' Error loading routing from localStorage:', e);
      return null;
    }
  }

  /**
   * Guarda el ruteo actual en localStorage (formato multicanal)
   */
  _saveRouting() {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIO_ROUTING, JSON.stringify(this.outputRouting));
      log.info(' Routing saved to localStorage');
    } catch (e) {
      log.warn(' Error saving routing to localStorage:', e);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STEREO BUSES: Pan 1-4 (A) y Pan 5-8 (B)
  // ═════════════════════════════════════════════════════════════════════════════
  // Dos buses estéreo que mezclan canales con panning:
  //   - Pan 1-4 (A): Mezcla Out 1-4 con sus pans respectivos
  //   - Pan 5-8 (B): Mezcla Out 5-8 con sus pans respectivos
  // Cada uno se puede rutear a cualquier par de canales físicos.
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Carga el routing de stereo buses desde localStorage.
   * @returns {Object|null}
   */
  _loadStereoBusRouting() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STEREO_BUS_ROUTING);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.A) && Array.isArray(parsed.B)) {
        return parsed;
      }
      return null;
    } catch (e) {
      log.warn(' Error loading stereo bus routing:', e);
      return null;
    }
  }

  /**
   * Guarda el routing de stereo buses en localStorage.
   */
  _saveStereoBusRouting() {
    try {
      localStorage.setItem(STORAGE_KEYS.STEREO_BUS_ROUTING, JSON.stringify(this.stereoBusRouting));
      log.info(' Stereo bus routing saved');
    } catch (e) {
      log.warn(' Error saving stereo bus routing:', e);
    }
  }

  /**
   * Crea la sección de configuración de stereo buses.
   * @returns {HTMLElement}
   */
  _createStereoBusSection() {
    const section = document.createElement('div');
    section.className = 'audio-settings-stereo-buses';
    
    const title = document.createElement('h4');
    title.className = 'audio-settings-stereo-buses__title';
    title.textContent = t('audio.stereoBuses.title') || 'Stereo Mix Outputs';
    this._textElements.stereoBusTitle = title;
    section.appendChild(title);
    
    const desc = document.createElement('p');
    desc.className = 'audio-settings-stereo-buses__desc';
    desc.textContent = t('audio.stereoBuses.description') || 'Route panned stereo mixes to physical outputs.';
    this._textElements.stereoBusDesc = desc;
    section.appendChild(desc);
    
    // Contenedor para los stereo buses
    this.stereoBusContainer = document.createElement('div');
    this.stereoBusContainer.className = 'stereo-bus-container';
    this._buildStereoBusRows();
    section.appendChild(this.stereoBusContainer);
    
    return section;
  }

  /**
   * Construye las filas de configuración de stereo buses.
   */
  _buildStereoBusRows() {
    if (!this.stereoBusContainer) return;
    this.stereoBusContainer.innerHTML = '';
    
    // Stereo Bus A: Pan 1-4
    const rowA = this._createStereoBusRow('A', 'Pan 1-4');
    this.stereoBusContainer.appendChild(rowA);
    
    // Stereo Bus B: Pan 5-8
    const rowB = this._createStereoBusRow('B', 'Pan 5-8');
    this.stereoBusContainer.appendChild(rowB);
  }

  /**
   * Crea una fila de configuración para un stereo bus.
   * @param {string} busId - 'A' o 'B'
   * @param {string} label - Etiqueta del bus
   * @returns {HTMLElement}
   */
  _createStereoBusRow(busId, label) {
    const row = document.createElement('div');
    row.className = 'stereo-bus-row';
    row.dataset.bus = busId;
    
    const labelEl = document.createElement('span');
    labelEl.className = 'stereo-bus-row__label';
    labelEl.textContent = label;
    row.appendChild(labelEl);
    
    const routing = this.stereoBusRouting[busId] || [0, 1];
    
    // Selector L
    const selectWrapL = document.createElement('div');
    selectWrapL.className = 'stereo-bus-row__select-wrap';
    const labelL = document.createElement('label');
    labelL.textContent = 'L:';
    const selectL = this._createChannelSelectForStereoBus(busId, 'L', routing[0]);
    selectWrapL.appendChild(labelL);
    selectWrapL.appendChild(selectL);
    row.appendChild(selectWrapL);
    
    // Selector R
    const selectWrapR = document.createElement('div');
    selectWrapR.className = 'stereo-bus-row__select-wrap';
    const labelR = document.createElement('label');
    labelR.textContent = 'R:';
    const selectR = this._createChannelSelectForStereoBus(busId, 'R', routing[1]);
    selectWrapR.appendChild(labelR);
    selectWrapR.appendChild(selectR);
    row.appendChild(selectWrapR);
    
    return row;
  }

  /**
   * Crea un selector de canal físico para stereo bus.
   * @param {string} busId - 'A' o 'B'
   * @param {string} side - 'L' o 'R'
   * @param {number} currentValue - Canal actualmente seleccionado
   * @returns {HTMLSelectElement}
   */
  _createChannelSelectForStereoBus(busId, side, currentValue) {
    const select = document.createElement('select');
    select.className = 'stereo-bus-select';
    select.dataset.bus = busId;
    select.dataset.side = side;
    
    // Opciones para cada canal físico
    for (let ch = 0; ch < this.physicalChannels; ch++) {
      const option = document.createElement('option');
      option.value = String(ch);
      option.textContent = this.channelLabels[ch] || `Ch ${ch + 1}`;
      if (ch === currentValue) {
        option.selected = true;
      }
      select.appendChild(option);
    }
    
    select.addEventListener('change', () => {
      const newValue = parseInt(select.value, 10);
      const sideIndex = side === 'L' ? 0 : 1;
      this.stereoBusRouting[busId][sideIndex] = newValue;
      this._saveStereoBusRouting();
      
      // Notificar al engine
      if (this.onStereoBusRoutingChange) {
        this.onStereoBusRoutingChange(
          busId, 
          this.stereoBusRouting[busId][0], 
          this.stereoBusRouting[busId][1]
        );
      }
    });
    
    return select;
  }

  /**
   * Aplica el routing de stereo buses al engine.
   * Debe llamarse al iniciar para sincronizar estado.
   * @param {Function} setStereoBusRouting - Función del engine para aplicar routing
   */
  applyStereoBusRoutingToEngine(setStereoBusRouting) {
    if (!setStereoBusRouting) return;
    
    for (const busId of ['A', 'B']) {
      const routing = this.stereoBusRouting[busId] || [0, 1];
      setStereoBusRouting(busId, routing[0], routing[1]);
    }
    log.info(' Stereo bus routing applied to engine:', this.stereoBusRouting);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RUTEO DE ENTRADA (Sistema → Input Amplifiers del Synthi)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve el ruteo de entrada por defecto: sysIn1 → Ch1, sysIn2 → Ch2
   */
  _getDefaultInputRouting() {
    return Array.from({ length: this.physicalInputChannels }, (_, sysIdx) => 
      Array.from({ length: this.inputCount }, (_, chIdx) => {
        // Por defecto: entrada 0 → canal 0, entrada 1 → canal 1
        return sysIdx === chIdx;
      })
    );
  }

  /**
   * Carga el ruteo de entrada desde localStorage
   * @returns {boolean[][]|null}
   */
  _loadInputRouting() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INPUT_ROUTING);
      if (!saved) return null;
      
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return null;
      
      // Adaptar al número actual de entradas y canales
      return Array.from({ length: this.physicalInputChannels }, (_, sysIdx) => {
        const savedRow = parsed[sysIdx];
        if (!Array.isArray(savedRow)) {
          // Sin datos para esta entrada, usar default
          return Array.from({ length: this.inputCount }, (_, chIdx) => sysIdx === chIdx);
        }
        return Array.from({ length: this.inputCount }, (_, chIdx) => {
          return savedRow[chIdx] === true;
        });
      });
    } catch (e) {
      log.warn(' Error loading input routing:', e);
      return null;
    }
  }

  /**
   * Guarda el ruteo de entrada en localStorage
   */
  _saveInputRouting() {
    try {
      localStorage.setItem(STORAGE_KEYS.INPUT_ROUTING, JSON.stringify(this.inputRouting));
      log.info(' Input routing saved to localStorage');
    } catch (e) {
      log.warn(' Error saving input routing:', e);
    }
  }

  /**
   * Actualiza el número de canales de entrada físicos y reconstruye la matriz.
   * @param {number} channelCount - Nuevo número de canales de entrada
   * @param {string[]} [labels] - Etiquetas para los canales
   */
  updatePhysicalInputChannels(channelCount, labels) {
    const oldCount = this.physicalInputChannels;
    this.physicalInputChannels = channelCount;
    this.inputChannelLabels = labels || this._generateDefaultInputLabels(channelCount);
    
    log.info(` Physical input channels changed: ${oldCount} → ${channelCount}`);
    
    // Reconstruir la matriz de ruteo de entrada para el nuevo número de canales
    this.inputRouting = Array.from({ length: channelCount }, (_, sysIdx) => {
      if (sysIdx < this.inputRouting.length) {
        // Preservar fila existente
        return this.inputRouting[sysIdx];
      }
      // Nueva entrada: solo conectar a su canal correspondiente
      return Array.from({ length: this.inputCount }, (_, chIdx) => sysIdx === chIdx);
    });
    
    // Actualizar info de canales de entrada en la UI
    this._updateInputChannelInfo();
    
    // Reconstruir la matriz visual de entrada
    if (this.inputMatrixContainer) {
      this._buildInputMatrix();
    }
    
    // Guardar el nuevo estado
    this._saveInputRouting();
  }

  /**
   * Genera etiquetas por defecto para canales de entrada
   */
  _generateDefaultInputLabels(count) {
    if (count === 1) return ['Mono'];
    if (count === 2) return ['L', 'R'];
    return Array.from({ length: count }, (_, i) => `In ${i + 1}`);
  }

  /**
   * Actualiza la información de canales de entrada en la UI
   */
  _updateInputChannelInfo() {
    if (!this.inputChannelInfoElement) return;
    this.inputChannelInfoElement.textContent = this.physicalInputChannels === 1 ? t('audio.channel.mono') : 
      this.physicalInputChannels === 2 ? t('audio.channel.stereo') : `${this.physicalInputChannels}ch`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIN RUTEO DE ENTRADA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Actualiza el número de canales físicos y reconstruye la matriz.
   * Se llama cuando el engine detecta un cambio de dispositivo con diferente
   * número de canales.
   * 
   * @param {number} channelCount - Nuevo número de canales físicos
   * @param {string[]} [labels] - Etiquetas para los canales
   */
  updatePhysicalChannels(channelCount, labels) {
    const oldCount = this.physicalChannels;
    this.physicalChannels = channelCount;
    this.channelLabels = labels || this._generateDefaultLabels(channelCount);
    
    log.info(` Physical channels changed: ${oldCount} → ${channelCount}`);
    
    // Expandir/recortar la matriz de ruteo para el nuevo número de canales
    this.outputRouting = this.outputRouting.map((busRouting, busIdx) => {
      return Array.from({ length: channelCount }, (_, chIdx) => {
        if (chIdx < busRouting.length) {
          // Preservar valor existente
          return busRouting[chIdx];
        }
        // Nuevos canales: apagados por defecto
        return false;
      });
    });
    
    // Actualizar info de canales en la UI
    this._updateChannelInfo();
    
    // Reconstruir la matriz visual
    if (this.matrixContainer) {
      this._rebuildMatrix();
    }
    
    // Guardar el nuevo estado
    this._saveRouting();
  }

  /**
   * Genera etiquetas por defecto para los canales
   */
  _generateDefaultLabels(count) {
    const labelSets = {
      2: ['L', 'R'],
      4: ['FL', 'FR', 'RL', 'RR'],
      6: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR'],
      8: ['FL', 'FR', 'C', 'LFE', 'RL', 'RR', 'SL', 'SR']
    };
    return labelSets[count] || Array.from({ length: count }, (_, i) => `Ch${i + 1}`);
  }

  /**
   * Actualiza el elemento de información de canales en la UI
   */
  _updateChannelInfo() {
    if (!this.channelInfoElement) return;
    
    const configName = this._getConfigurationName(this.physicalChannels);
    this.channelInfoElement.textContent = `${this.physicalChannels} (${configName})`;
    this.channelInfoElement.title = `${this.channelLabels.join(', ')}`;
  }

  /**
   * Obtiene el nombre de la configuración de canales
   */
  _getConfigurationName(count) {
    const names = {
      1: t('audio.channel.mono'),
      2: t('audio.channel.stereo'),
      4: t('audio.channel.quad'),
      6: t('audio.channel.surround')
    };
    return names[count] || `${count}ch`;
  }
  
  /**
   * Actualiza los textos del modal (para cambio de idioma en caliente)
   */
  _updateTexts() {
    const els = this._textElements;
    if (els.title) els.title.textContent = t('audio.title');
    if (els.closeBtn) els.closeBtn.setAttribute('aria-label', t('audio.close'));
    if (els.outputTitle) els.outputTitle.textContent = t('audio.outputs.title');
    if (els.outputDeviceLabel) els.outputDeviceLabel.textContent = t('audio.device.output');
    if (els.outputChannelLabel) els.outputChannelLabel.textContent = t('audio.outputs.channels') + ' ';
    if (els.outputDesc) els.outputDesc.textContent = t('audio.outputs.description');
    if (els.inputTitle) els.inputTitle.textContent = t('audio.inputs.title');
    if (els.inputDeviceLabel) els.inputDeviceLabel.textContent = t('audio.device.input');
    if (els.inputChannelLabel) els.inputChannelLabel.textContent = t('audio.inputs.channels') + ' ';
    if (els.inputDesc) els.inputDesc.textContent = t('audio.inputs.description');
    if (els.inputPermissionBtn) els.inputPermissionBtn.textContent = t('audio.inputs.enable');
    
    // Actualizar nombres de configuración de canales
    this._updateChannelInfo();
    this._updateInputChannelInfo();
  }

  /**
   * Enumera los dispositivos de audio disponibles
   * @param {boolean} requestPermission - Si true, solicita permisos para ver nombres
   */
  async _enumerateDevices(requestPermission = false) {
    try {
      // Solo pedir permisos si se solicita explícitamente
      // Esto evita diálogos repetidos en móvil
      if (requestPermission) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        } catch {
          // Usuario denegó permisos, continuar con IDs anónimos
        }
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      this.availableOutputDevices = devices.filter(d => d.kind === 'audiooutput');
      this.availableInputDevices = devices.filter(d => d.kind === 'audioinput');
      
      // Verificar si tenemos etiquetas (indica permisos previos)
      this._hasMediaPermission = devices.some(d => d.label && d.label.length > 0);
      
      this._updateDeviceSelects();
    } catch (e) {
      log.warn(' Error enumerating devices:', e);
      this._showDeviceError();
    }
  }

  /**
   * Muestra un mensaje de error en los selectores de dispositivos
   */
  _showDeviceError() {
    const errorText = t('audio.device.error') || 'Error loading devices';
    
    if (this.outputDeviceSelect) {
      this.outputDeviceSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = errorText;
      this.outputDeviceSelect.appendChild(opt);
    }
    
    if (this.inputDeviceSelect) {
      this.inputDeviceSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = errorText;
      this.inputDeviceSelect.appendChild(opt);
    }
  }

  /**
   * Método público para refrescar la lista de dispositivos.
   * Útil para llamar desde contenido embebido o al cambiar de pestaña.
   * @param {boolean} requestPermission - Si true, solicita permisos para ver nombres
   * @returns {Promise<void>}
   */
  refreshDevices(requestPermission = false) {
    return this._enumerateDevices(requestPermission);
  }

  /**
   * Actualiza los selectores con los dispositivos disponibles
   */
  _updateDeviceSelects() {
    if (this.outputDeviceSelect) {
      this.outputDeviceSelect.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = 'default';
      defaultOpt.textContent = t('audio.device.default');
      this.outputDeviceSelect.appendChild(defaultOpt);
      
      this.availableOutputDevices.forEach(device => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || `${t('audio.device.system')} ${device.deviceId.slice(0, 8)}...`;
        if (device.deviceId === this.selectedOutputDevice) opt.selected = true;
        this.outputDeviceSelect.appendChild(opt);
      });
    }
    
    if (this.inputDeviceSelect) {
      this.inputDeviceSelect.innerHTML = '';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = 'default';
      defaultOpt.textContent = t('audio.device.default');
      this.inputDeviceSelect.appendChild(defaultOpt);
      
      this.availableInputDevices.forEach(device => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || `${t('audio.device.system')} ${device.deviceId.slice(0, 8)}...`;
        if (device.deviceId === this.selectedInputDevice) opt.selected = true;
        this.inputDeviceSelect.appendChild(opt);
      });
    }
    
    // Mostrar/ocultar botón de permisos
    this._updatePermissionButton();
  }

  /**
   * Actualiza los botones de solicitar permisos
   */
  _updatePermissionButton() {
    // Botón de permisos de salida
    if (this.permissionBtn) {
      if (this._hasMediaPermission) {
        this.permissionBtn.style.display = 'none';
      } else {
        this.permissionBtn.style.display = 'inline-block';
      }
    }
    
    // Botón de permisos de entrada
    if (this.inputPermissionBtn) {
      if (this._hasMediaPermission) {
        this.inputPermissionBtn.style.display = 'none';
      } else {
        this.inputPermissionBtn.style.display = 'inline-block';
      }
    }
  }

  /**
   * Crea un selector de dispositivo
   */
  _createDeviceSelector(label, isOutput) {
    const wrapper = document.createElement('div');
    wrapper.className = 'audio-settings-device-selector';
    
    const labelEl = document.createElement('label');
    labelEl.className = 'audio-settings-device-selector__label';
    labelEl.textContent = label;
    
    const select = document.createElement('select');
    select.className = 'audio-settings-device-selector__select';
    
    // Opción por defecto mientras se cargan
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = t('audio.device.loading');
    select.appendChild(defaultOpt);
    
    select.addEventListener('change', () => {
      const deviceId = select.value;
      if (isOutput) {
        this.selectedOutputDevice = deviceId;
        localStorage.setItem(STORAGE_KEYS.OUTPUT_DEVICE, deviceId);
        if (this.onOutputDeviceChange) this.onOutputDeviceChange(deviceId);
      } else {
        this.selectedInputDevice = deviceId;
        localStorage.setItem(STORAGE_KEYS.INPUT_DEVICE, deviceId);
        if (this.onInputDeviceChange) this.onInputDeviceChange(deviceId);
      }
    });
    
    // Workaround para bug de renderizado en Samsung: forzar repaint al abrir/cerrar dropdown
    select.addEventListener('focus', () => {
      if (this.modal) {
        this.modal.style.transform = 'translateZ(0)';
        requestAnimationFrame(() => {
          this.modal.style.transform = '';
        });
      }
    });
    
    select.addEventListener('blur', () => {
      if (this.modal) {
        void this.modal.offsetHeight; // Trigger reflow
      }
    });
    
    wrapper.appendChild(labelEl);
    wrapper.appendChild(select);
    
    return { wrapper, select, label: labelEl };
  }

  /**
   * Crea contenido embebible para usar en otro contenedor (sin overlay/header)
   * @returns {HTMLElement}
   */
  createEmbeddableContent() {
    const content = document.createElement('div');
    content.className = 'audio-settings-content';

    // Sección de salidas (OUTPUT ROUTING)
    const outputSection = this._createOutputSection();
    content.appendChild(outputSection);

    // Sección de entradas (INPUT ROUTING)
    const inputSection = this._createInputSection();
    content.appendChild(inputSection);

    // Enumerar dispositivos de audio para contenido embebido
    this.refreshDevices();

    return content;
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
    
    this._textElements.title = document.createElement('h2');
    this._textElements.title.id = 'audioSettingsTitle';
    this._textElements.title.className = 'audio-settings-modal__title';
    this._textElements.title.textContent = t('audio.title');
    
    this._textElements.closeBtn = document.createElement('button');
    this._textElements.closeBtn.type = 'button';
    this._textElements.closeBtn.className = 'audio-settings-modal__close';
    this._textElements.closeBtn.setAttribute('aria-label', t('audio.close'));
    this._textElements.closeBtn.innerHTML = '×';
    this._textElements.closeBtn.addEventListener('click', () => this.close());
    
    header.appendChild(this._textElements.title);
    header.appendChild(this._textElements.closeBtn);
    
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
    
    this._textElements.outputTitle = document.createElement('h3');
    this._textElements.outputTitle.className = 'audio-settings-section__title';
    this._textElements.outputTitle.textContent = t('audio.outputs.title');
    section.appendChild(this._textElements.outputTitle);
    
    // Selector de dispositivo de salida
    const { wrapper: outputDeviceWrapper, select: outputSelect, label: outputLabel } = this._createDeviceSelector(t('audio.device.output'), true);
    this.outputDeviceSelect = outputSelect;
    this._textElements.outputDeviceLabel = outputLabel;
    section.appendChild(outputDeviceWrapper);
    
    // Botón para solicitar permisos (mostrar nombres de dispositivos)
    this.permissionBtn = document.createElement('button');
    this.permissionBtn.className = 'audio-settings-permission-btn';
    this.permissionBtn.textContent = '🎤 ' + t('audio.device.output');
    this.permissionBtn.style.display = 'none'; // Se mostrará si no hay permisos
    this.permissionBtn.addEventListener('click', async () => {
      await this._enumerateDevices(true);
    });
    section.appendChild(this.permissionBtn);
    
    // Información de canales del dispositivo actual
    const channelInfo = document.createElement('div');
    channelInfo.className = 'audio-settings-channel-info';
    this.channelInfoElement = document.createElement('span');
    this.channelInfoElement.className = 'audio-settings-channel-info__value';
    this._updateChannelInfo();
    
    this._textElements.outputChannelLabel = document.createElement('span');
    this._textElements.outputChannelLabel.className = 'audio-settings-channel-info__label';
    this._textElements.outputChannelLabel.textContent = t('audio.outputs.channels') + ' ';
    
    channelInfo.appendChild(this._textElements.outputChannelLabel);
    channelInfo.appendChild(this.channelInfoElement);
    section.appendChild(channelInfo);
    
    this._textElements.outputDesc = document.createElement('p');
    this._textElements.outputDesc.className = 'audio-settings-section__desc';
    this._textElements.outputDesc.textContent = t('audio.outputs.description');
    section.appendChild(this._textElements.outputDesc);
    
    // Contenedor de la matriz (permite reconstrucción dinámica)
    this.matrixContainer = document.createElement('div');
    this.matrixContainer.className = 'routing-matrix-container';
    this._buildMatrix();
    section.appendChild(this.matrixContainer);
    
    // Sección de Stereo Buses (Pan 1-4, Pan 5-8)
    const stereoBusSection = this._createStereoBusSection();
    section.appendChild(stereoBusSection);
    
    return section;
  }

  /**
   * Construye la matriz de ruteo dentro del contenedor.
   * Se puede llamar para reconstruir cuando cambia el número de canales.
   */
  _buildMatrix() {
    // Matriz de ruteo
    const matrix = document.createElement('div');
    matrix.className = 'routing-matrix';
    
    // Header de la matriz con etiquetas de canales
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'routing-matrix__header';
    
    const cornerCell = document.createElement('div');
    cornerCell.className = 'routing-matrix__corner';
    matrixHeader.appendChild(cornerCell);
    
    // Añadir header para cada canal físico
    this.channelLabels.forEach((label, chIdx) => {
      const headerCell = document.createElement('div');
      headerCell.className = 'routing-matrix__header-cell';
      headerCell.textContent = label;
      headerCell.title = `Canal ${chIdx + 1}: ${label}`;
      matrixHeader.appendChild(headerCell);
    });
    
    matrix.appendChild(matrixHeader);
    
    // Filas de la matriz (una por cada salida lógica)
    this.outputToggleButtons = [];
    
    for (let busIdx = 0; busIdx < this.outputCount; busIdx++) {
      const row = document.createElement('div');
      row.className = 'routing-matrix__row';
      
      const rowLabel = document.createElement('div');
      rowLabel.className = 'routing-matrix__row-label';
      rowLabel.textContent = `Out ${busIdx + 1}`;
      row.appendChild(rowLabel);
      
      // Array de botones para este bus
      const busButtons = [];
      
      // Un botón por cada canal físico
      for (let chIdx = 0; chIdx < this.physicalChannels; chIdx++) {
        const btn = this._createToggleButton(busIdx, chIdx);
        row.appendChild(btn);
        busButtons.push(btn);
      }
      
      this.outputToggleButtons.push(busButtons);
      matrix.appendChild(row);
    }
    
    // Reemplazar contenido del contenedor
    this.matrixContainer.innerHTML = '';
    this.matrixContainer.appendChild(matrix);
  }

  /**
   * Reconstruye la matriz cuando cambia el número de canales.
   * Preserva el estado de ruteo existente.
   */
  _rebuildMatrix() {
    this._buildMatrix();
  }

  /**
   * Crea un botón toggle para la matriz de ruteo
   * @param {number} busIndex - Índice del bus de salida
   * @param {number} channelIndex - Índice del canal físico
   */
  _createToggleButton(busIndex, channelIndex) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'routing-matrix__toggle';
    
    // Asegurar que el array de ruteo existe para este bus
    if (!this.outputRouting[busIndex]) {
      this.outputRouting[busIndex] = Array(this.physicalChannels).fill(false);
    }
    
    const isActive = this.outputRouting[busIndex][channelIndex] === true;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.dataset.bus = busIndex;
    btn.dataset.channel = channelIndex;
    btn.title = `Out ${busIndex + 1} → ${this.channelLabels[channelIndex] || `Ch${channelIndex + 1}`}`;
    
    if (isActive) {
      btn.classList.add('routing-matrix__toggle--active');
    }
    
    btn.addEventListener('click', () => this._toggleRouting(busIndex, channelIndex, btn));
    
    return btn;
  }

  /**
   * Alterna el estado de ruteo de una salida hacia un canal físico.
   * @param {number} busIndex - Índice del bus de salida
   * @param {number} channelIndex - Índice del canal físico
   * @param {HTMLElement} btn - Botón que se pulsó
   */
  _toggleRouting(busIndex, channelIndex, btn) {
    // Asegurar que el array existe
    if (!this.outputRouting[busIndex]) {
      this.outputRouting[busIndex] = Array(this.physicalChannels).fill(false);
    }
    
    // Alternar estado
    this.outputRouting[busIndex][channelIndex] = !this.outputRouting[busIndex][channelIndex];
    const isActive = this.outputRouting[busIndex][channelIndex];
    
    btn.classList.toggle('routing-matrix__toggle--active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    
    // Persistir cambio en localStorage
    this._saveRouting();
    
    // Notificar cambio con el array completo de ganancias para este bus
    if (this.onRoutingChange) {
      // Convertir booleanos a ganancias (0.0 o 1.0)
      const channelGains = this.outputRouting[busIndex].map(active => active ? 1.0 : 0.0);
      this.onRoutingChange(busIndex, channelGains);
    }
  }

  /**
   * Crea la sección de ruteo de entradas (Sistema → Input Amplifiers del Synthi)
   */
  _createInputSection() {
    const section = document.createElement('div');
    section.className = 'audio-settings-section';
    
    this._textElements.inputTitle = document.createElement('h3');
    this._textElements.inputTitle.className = 'audio-settings-section__title';
    this._textElements.inputTitle.textContent = t('audio.inputs.title');
    section.appendChild(this._textElements.inputTitle);
    
    // Selector de dispositivo de entrada
    const { wrapper: inputDeviceWrapper, select: inputSelect, label: inputLabel } = this._createDeviceSelector(t('audio.device.input'), false);
    this.inputDeviceSelect = inputSelect;
    this._textElements.inputDeviceLabel = inputLabel;
    section.appendChild(inputDeviceWrapper);
    
    // Botón para solicitar permisos de entrada (micrófono)
    this._textElements.inputPermissionBtn = document.createElement('button');
    this._textElements.inputPermissionBtn.className = 'audio-settings-permission-btn';
    this._textElements.inputPermissionBtn.textContent = t('audio.inputs.enable');
    this._textElements.inputPermissionBtn.style.display = 'none';
    this._textElements.inputPermissionBtn.addEventListener('click', async () => {
      await this._enumerateDevices(true);
    });
    this.inputPermissionBtn = this._textElements.inputPermissionBtn;
    section.appendChild(this._textElements.inputPermissionBtn);
    
    // Información de canales de entrada detectados
    const inputChannelInfo = document.createElement('div');
    inputChannelInfo.className = 'audio-settings-channel-info';
    this.inputChannelInfoElement = document.createElement('span');
    this.inputChannelInfoElement.className = 'audio-settings-channel-info__value';
    this._updateInputChannelInfo();
    
    this._textElements.inputChannelLabel = document.createElement('span');
    this._textElements.inputChannelLabel.className = 'audio-settings-channel-info__label';
    this._textElements.inputChannelLabel.textContent = t('audio.inputs.channels') + ' ';
    
    inputChannelInfo.appendChild(this._textElements.inputChannelLabel);
    inputChannelInfo.appendChild(this.inputChannelInfoElement);
    section.appendChild(inputChannelInfo);
    
    this._textElements.inputDesc = document.createElement('p');
    this._textElements.inputDesc.className = 'audio-settings-section__desc';
    this._textElements.inputDesc.textContent = t('audio.inputs.description');
    section.appendChild(this._textElements.inputDesc);
    
    // Contenedor de la matriz de entrada (permite reconstrucción dinámica)
    this.inputMatrixContainer = document.createElement('div');
    this.inputMatrixContainer.className = 'routing-matrix-container';
    this._buildInputMatrix();
    section.appendChild(this.inputMatrixContainer);
    
    return section;
  }

  /**
   * Construye la matriz de ruteo de entrada.
   * Filas: entradas del sistema (Mic/Line L/R)
   * Columnas: 8 Input Amplifiers del Synthi (Ch1-Ch8)
   */
  _buildInputMatrix() {
    const matrix = document.createElement('div');
    matrix.className = 'routing-matrix';
    
    // Header: Ch1, Ch2, ... Ch8 (Input Amplifiers del Synthi)
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'routing-matrix__header';
    
    const cornerCell = document.createElement('div');
    cornerCell.className = 'routing-matrix__corner';
    matrixHeader.appendChild(cornerCell);
    
    for (let chIdx = 0; chIdx < this.inputCount; chIdx++) {
      const headerCell = document.createElement('div');
      headerCell.className = 'routing-matrix__header-cell';
      headerCell.textContent = `Ch${chIdx + 1}`;
      headerCell.title = `Input Amplifier ${chIdx + 1}`;
      matrixHeader.appendChild(headerCell);
    }
    
    matrix.appendChild(matrixHeader);
    
    // Filas: una por cada entrada física del sistema
    this.inputToggleButtons = [];
    
    for (let sysIdx = 0; sysIdx < this.physicalInputChannels; sysIdx++) {
      const row = document.createElement('div');
      row.className = 'routing-matrix__row';
      
      const rowLabel = document.createElement('div');
      rowLabel.className = 'routing-matrix__row-label';
      rowLabel.textContent = this.inputChannelLabels[sysIdx] || `In ${sysIdx + 1}`;
      row.appendChild(rowLabel);
      
      // Array de botones para esta entrada del sistema
      const rowButtons = [];
      
      // Un botón por cada Input Amplifier del Synthi
      for (let chIdx = 0; chIdx < this.inputCount; chIdx++) {
        const btn = this._createInputToggleButton(sysIdx, chIdx);
        row.appendChild(btn);
        rowButtons.push(btn);
      }
      
      this.inputToggleButtons.push(rowButtons);
      matrix.appendChild(row);
    }
    
    // Reemplazar contenido del contenedor
    this.inputMatrixContainer.innerHTML = '';
    this.inputMatrixContainer.appendChild(matrix);
  }

  /**
   * Crea un botón toggle para la matriz de ruteo de entrada
   * @param {number} systemInputIndex - Índice de la entrada del sistema
   * @param {number} synthChannelIndex - Índice del Input Amplifier del Synthi
   */
  _createInputToggleButton(systemInputIndex, synthChannelIndex) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'routing-matrix__toggle';
    
    // Asegurar que el array de ruteo existe
    if (!this.inputRouting[systemInputIndex]) {
      this.inputRouting[systemInputIndex] = Array(this.inputCount).fill(false);
    }
    
    const isActive = this.inputRouting[systemInputIndex][synthChannelIndex] === true;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.dataset.sysInput = systemInputIndex;
    btn.dataset.synthChannel = synthChannelIndex;
    btn.title = `${this.inputChannelLabels[systemInputIndex] || `In ${systemInputIndex + 1}`} → Ch${synthChannelIndex + 1}`;
    
    if (isActive) {
      btn.classList.add('routing-matrix__toggle--active');
    }
    
    btn.addEventListener('click', () => this._toggleInputRouting(systemInputIndex, synthChannelIndex, btn));
    
    return btn;
  }

  /**
   * Alterna el estado de ruteo de una entrada del sistema hacia un Input Amplifier.
   * @param {number} systemInputIndex - Índice de la entrada del sistema
   * @param {number} synthChannelIndex - Índice del Input Amplifier del Synthi
   * @param {HTMLElement} btn - Botón que se pulsó
   */
  _toggleInputRouting(systemInputIndex, synthChannelIndex, btn) {
    // Asegurar que el array existe
    if (!this.inputRouting[systemInputIndex]) {
      this.inputRouting[systemInputIndex] = Array(this.inputCount).fill(false);
    }
    
    // Alternar estado
    this.inputRouting[systemInputIndex][synthChannelIndex] = !this.inputRouting[systemInputIndex][synthChannelIndex];
    const isActive = this.inputRouting[systemInputIndex][synthChannelIndex];
    
    btn.classList.toggle('routing-matrix__toggle--active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
    
    // Persistir cambio en localStorage
    this._saveInputRouting();
    
    // Notificar cambio con el array completo de ganancias para esta entrada del sistema
    if (this.onInputRoutingChange) {
      // Convertir booleanos a ganancias (0.0 o 1.0)
      const channelGains = this.inputRouting[systemInputIndex].map(active => active ? 1.0 : 0.0);
      this.onInputRoutingChange(systemInputIndex, channelGains);
    }
  }

  /**
   * Obtiene el ruteo de entrada actual
   * @returns {boolean[][]}
   */
  getInputRouting() {
    return this.inputRouting;
  }

  /**
   * Establece el ruteo de entrada
   * @param {boolean[][]} routing
   */
  setInputRouting(routing) {
    this.inputRouting = routing;
    this._saveInputRouting();
    if (this.inputMatrixContainer) {
      this._buildInputMatrix();
    }
  }

  /**
   * Aplica todo el ruteo de entrada al engine (llamar al iniciar)
   */
  applyInputRoutingToEngine() {
    if (!this.onInputRoutingChange) return;
    
    for (let sysIdx = 0; sysIdx < this.physicalInputChannels; sysIdx++) {
      if (!this.inputRouting[sysIdx]) continue;
      const channelGains = this.inputRouting[sysIdx].map(active => active ? 1.0 : 0.0);
      this.onInputRoutingChange(sysIdx, channelGains);
    }
  }

  /**
   * Abre el modal
   */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.classList.add('audio-settings-overlay--visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    
    // Enumerar dispositivos cuando se abre el modal
    this._enumerateDevices();
    
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
   * Obtiene el estado de ruteo actual como matriz multicanal
   * @returns {boolean[][]} - Matriz [busIndex][channelIndex] = boolean
   */
  getRouting() {
    return this.outputRouting.map(busRouting => [...busRouting]);
  }

  /**
   * Obtiene el ruteo en formato legacy (para compatibilidad)
   * @returns {Array<{left: boolean, right: boolean}>}
   */
  getRoutingLegacy() {
    return this.outputRouting.map(busRouting => ({
      left: busRouting[0] === true,
      right: busRouting[1] === true
    }));
  }

  /**
   * Establece el estado de ruteo desde una matriz multicanal.
   * Soporta tanto formato legacy {left, right} como nuevo formato [bool, bool, ...]
   * 
   * @param {Array<boolean[]|{left: boolean, right: boolean}>} routing
   */
  setRouting(routing) {
    if (!Array.isArray(routing)) return;
    
    routing.forEach((busData, busIdx) => {
      if (busIdx >= this.outputCount) return;
      
      // Detectar formato
      if (Array.isArray(busData)) {
        // Formato multicanal
        this.outputRouting[busIdx] = Array.from({ length: this.physicalChannels }, (_, chIdx) => {
          return busData[chIdx] === true;
        });
      } else if (busData && typeof busData.left === 'boolean') {
        // Formato legacy
        this.outputRouting[busIdx] = Array.from({ length: this.physicalChannels }, (_, chIdx) => {
          if (chIdx === 0) return busData.left;
          if (chIdx === 1) return busData.right;
          return false;
        });
      }
      
      // Actualizar UI
      const busButtons = this.outputToggleButtons[busIdx];
      if (busButtons && Array.isArray(busButtons)) {
        busButtons.forEach((btn, chIdx) => {
          if (btn && this.outputRouting[busIdx]) {
            const isActive = this.outputRouting[busIdx][chIdx] === true;
            btn.classList.toggle('routing-matrix__toggle--active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
          }
        });
      }
    });
  }

  /**
   * Aplica el ruteo actual al engine.
   * 
   * MODO MULTICANAL (nuevo):
   *   applyFn(busIndex, channelGains[])
   *   
   * MODO LEGACY (si applyFn acepta 3 argumentos):
   *   applyFn(busIndex, leftGain, rightGain)
   * 
   * @param {Function} applyFn - Función de aplicación
   * @returns {{ warnings: string[] }} - Advertencias sobre canales ignorados
   */
  applyRoutingToEngine(applyFn) {
    if (typeof applyFn !== 'function') return { warnings: [] };
    
    const warnings = [];
    
    for (let busIdx = 0; busIdx < this.outputCount; busIdx++) {
      // Convertir booleanos a ganancias
      const channelGains = (this.outputRouting[busIdx] || []).map(active => active ? 1.0 : 0.0);
      
      // Intentar modo multicanal primero
      const result = applyFn(busIdx, channelGains);
      
      // Si el engine devuelve info sobre canales ignorados, recolectarla
      if (result && result.ignored && result.ignored.length > 0) {
        warnings.push(
          `Out ${busIdx + 1}: canales ${result.ignored.map(c => this.channelLabels[c] || `Ch${c + 1}`).join(', ')} ignorados`
        );
      }
    }
    
    // Mostrar advertencias si hay
    if (warnings.length > 0) {
      log.warn(' Routing warnings:', warnings);
    }
    
    return { warnings };
  }

  /**
   * Muestra una advertencia al usuario sobre canales ignorados
   * @param {string[]} warnings - Lista de advertencias
   */
  showRoutingWarnings(warnings) {
    if (!warnings || warnings.length === 0) return;
    
    // Por ahora solo log, se puede expandir a notificación visual
    log.warn(' Advertencias de ruteo:', warnings.join('; '));
  }
}
