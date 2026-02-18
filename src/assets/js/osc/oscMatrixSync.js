/**
 * OSC Matrix Sync - Sincronización de matrices de audio y control via OSC
 * 
 * Gestiona el envío y recepción de mensajes OSC para las matrices de pines
 * del Panel 5 (audio) y Panel 6 (control). Usa direcciones semánticas legibles:
 * 
 *   /audio/{source}/{Dest}  {pinColor|0}
 *   /cv/{source}/{Dest}     {pinColor|0}
 * 
 * La convención minúsculas→Mayúscula marca la transición source→destino.
 * Los valores son nombres de color de pin (WHITE, GREY, etc.) o 0 para desconectar.
 * 
 * También acepta alias de coordenadas Synthi en recepción para compatibilidad
 * con SuperCollider: /audio/{rowSynth}/{colSynth} {valor}
 * 
 * @module osc/oscMatrixSync
 * @see /OSC.md - Documentación del protocolo (secciones 2 y 3)
 */

import { oscBridge } from './oscBridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// MAPEO DE DESCRIPTORES DE BLUEPRINT A SEGMENTOS DE DIRECCIÓN OSC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un descriptor de fuente (source) del blueprint a segmento de dirección OSC.
 * Las fuentes usan minúsculas por convención.
 * 
 * @param {Object} source - Descriptor de fuente del blueprint
 * @returns {string|null} Segmento OSC (ej: 'osc/1/sinSaw', 'noise/2', 'in/3')
 */
function sourceToOSCSegment(source) {
  if (!source || !source.kind) return null;

  switch (source.kind) {
    case 'inputAmp':
      // channel es 0-indexed → OSC 1-indexed
      return `in/${(source.channel ?? 0) + 1}`;

    case 'outputBus':
      // bus ya es 1-indexed en el blueprint
      return `bus/${source.bus}`;

    case 'noiseGen':
      // index es 0-indexed → OSC 1-indexed
      return `noise/${(source.index ?? 0) + 1}`;

    case 'panel3Osc': {
      // oscIndex es 0-indexed → OSC 1-indexed
      const oscNum = (source.oscIndex ?? 0) + 1;
      const channel = source.channelId === 'triPulse' ? 'triPul' : 'sinSaw';
      return `osc/${oscNum}/${channel}`;
    }

    case 'joystick': {
      // side: 'left'→'L', 'right'→'R'; axis: 'y'|'x' (minúscula)
      const side = source.side === 'right' ? 'R' : 'L';
      return `joy/${side}/${source.axis || 'y'}`;
    }

    default:
      return null;
  }
}

/**
 * Convierte un descriptor de destino (dest) del blueprint a segmento de dirección OSC.
 * Los destinos usan Mayúscula inicial por convención.
 * 
 * @param {Object} dest - Descriptor de destino del blueprint
 * @returns {string|null} Segmento OSC (ej: 'Out/1', 'Sync/3', 'Freq/7', 'Scope/Y')
 */
function destToOSCSegment(dest) {
  if (!dest || !dest.kind) return null;

  switch (dest.kind) {
    case 'outputBus':
      // bus ya es 1-indexed en el blueprint
      return `Out/${dest.bus}`;

    case 'oscSync':
      // oscIndex es 0-indexed → OSC 1-indexed
      return `Sync/${(dest.oscIndex ?? 0) + 1}`;

    case 'oscilloscope':
      // channel: 'Y' o 'X'
      return `Scope/${dest.channel || 'Y'}`;

    case 'oscFreqCV':
      // oscIndex es 0-indexed → OSC 1-indexed
      return `Freq/${(dest.oscIndex ?? 0) + 1}`;

    case 'outputLevelCV':
      // busIndex es 0-indexed → OSC 1-indexed
      return `Level/${(dest.busIndex ?? 0) + 1}`;

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSING DE DIRECCIONES OSC ENTRANTES A DESCRIPTORES DE BLUEPRINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un segmento de fuente OSC a descriptor de blueprint.
 * 
 * @param {string[]} parts - Segmentos de la dirección (ya sin prefijo y tipo de matriz)
 * @returns {{ source: Object, remainingParts: string[] }|null}
 */
function parseSourceSegment(parts) {
  if (!parts.length) return null;
  const seg = parts[0];

  // in/{n}
  if (seg === 'in' && parts.length >= 2) {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return {
        source: { kind: 'inputAmp', channel: n - 1 },
        remainingParts: parts.slice(2)
      };
    }
  }

  // bus/{n}
  if (seg === 'bus' && parts.length >= 2) {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return {
        source: { kind: 'outputBus', bus: n },
        remainingParts: parts.slice(2)
      };
    }
  }

  // noise/{n}
  if (seg === 'noise' && parts.length >= 2) {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return {
        source: { kind: 'noiseGen', index: n - 1 },
        remainingParts: parts.slice(2)
      };
    }
  }

  // osc/{n}/sinSaw o osc/{n}/triPul
  if (seg === 'osc' && parts.length >= 3) {
    const n = parseInt(parts[1], 10);
    const channelSeg = parts[2];
    if (!isNaN(n) && (channelSeg === 'sinSaw' || channelSeg === 'triPul')) {
      const channelId = channelSeg === 'triPul' ? 'triPulse' : 'sineSaw';
      return {
        source: { kind: 'panel3Osc', oscIndex: n - 1, channelId },
        remainingParts: parts.slice(3)
      };
    }
  }

  // joy/{L,R}/{y,x}
  if (seg === 'joy' && parts.length >= 3) {
    const sideSeg = parts[1];
    const axisSeg = parts[2];
    if ((sideSeg === 'L' || sideSeg === 'R') && (axisSeg === 'x' || axisSeg === 'y')) {
      return {
        source: { kind: 'joystick', side: sideSeg === 'R' ? 'right' : 'left', axis: axisSeg },
        remainingParts: parts.slice(3)
      };
    }
  }

  return null;
}

/**
 * Parsea un segmento de destino OSC a descriptor de blueprint.
 * 
 * @param {string[]} parts - Segmentos restantes de la dirección
 * @param {string} matrixType - 'audio' o 'cv'
 * @returns {Object|null} Descriptor de destino del blueprint
 */
function parseDestSegment(parts, matrixType) {
  if (!parts.length) return null;
  const seg = parts[0];

  // Out/{n}
  if (seg === 'Out' && parts.length >= 2) {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return { kind: 'outputBus', bus: n };
    }
  }

  // Sync/{n} (solo audio)
  if (seg === 'Sync' && parts.length >= 2 && matrixType === 'audio') {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return { kind: 'oscSync', oscIndex: n - 1 };
    }
  }

  // Scope/{Y,X}
  if (seg === 'Scope' && parts.length >= 2) {
    const ch = parts[1];
    if (ch === 'Y' || ch === 'X') {
      return { kind: 'oscilloscope', channel: ch };
    }
  }

  // Freq/{n} (solo cv)
  if (seg === 'Freq' && parts.length >= 2 && matrixType === 'cv') {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return { kind: 'oscFreqCV', oscIndex: n - 1 };
    }
  }

  // Level/{n} (solo cv)
  if (seg === 'Level' && parts.length >= 2 && matrixType === 'cv') {
    const n = parseInt(parts[1], 10);
    if (!isNaN(n)) {
      return { kind: 'outputLevelCV', busIndex: n - 1 };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BÚSQUEDA INVERSA: descriptor → coordenada de matriz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca el rowIndex de un source descriptor en el sourceMap del routing.
 * 
 * @param {Map<number, Object>} sourceMap - Mapa rowIndex → descriptor
 * @param {Object} target - Descriptor de fuente a buscar
 * @returns {number|null} rowIndex encontrado o null
 */
function findRowForSource(sourceMap, target) {
  if (!sourceMap || !target) return null;

  for (const [rowIndex, source] of sourceMap.entries()) {
    if (source.kind !== target.kind) continue;

    switch (source.kind) {
      case 'inputAmp':
        if (source.channel === target.channel) return rowIndex;
        break;
      case 'outputBus':
        if (source.bus === target.bus) return rowIndex;
        break;
      case 'noiseGen':
        if (source.index === target.index) return rowIndex;
        break;
      case 'panel3Osc':
        if (source.oscIndex === target.oscIndex && source.channelId === target.channelId) return rowIndex;
        break;
      case 'joystick':
        if (source.side === target.side && source.axis === target.axis) return rowIndex;
        break;
    }
  }
  return null;
}

/**
 * Busca el colIndex de un dest descriptor en el destMap del routing.
 * 
 * @param {Map<number, Object>} destMap - Mapa colIndex → descriptor
 * @param {Object} target - Descriptor de destino a buscar
 * @returns {number|null} colIndex encontrado o null
 */
function findColForDest(destMap, target) {
  if (!destMap || !target) return null;

  for (const [colIndex, dest] of destMap.entries()) {
    if (dest.kind !== target.kind) continue;

    switch (dest.kind) {
      case 'outputBus':
        if (dest.bus === target.bus) return colIndex;
        break;
      case 'oscSync':
        if (dest.oscIndex === target.oscIndex) return colIndex;
        break;
      case 'oscilloscope':
        if (dest.channel === target.channel) return colIndex;
        break;
      case 'oscFreqCV':
        if (dest.oscIndex === target.oscIndex) return colIndex;
        break;
      case 'outputLevelCV':
        if (dest.busIndex === target.busIndex) return colIndex;
        break;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLORES DE PIN VÁLIDOS
// ─────────────────────────────────────────────────────────────────────────────

/** Conjunto de colores de pin válidos para validación rápida */
const VALID_PIN_COLORS = new Set([
  'WHITE', 'GREY', 'GREEN', 'RED', 'BLUE', 'YELLOW', 'CYAN', 'PURPLE'
]);

/**
 * Parsea el valor recibido por OSC para un pin de matriz.
 * 
 * @param {*} value - Valor OSC recibido (string, number, o array)
 * @returns {{ action: 'connect'|'disconnect', pinColor: string|null, gain: number|null, tolerance: number|null }}
 */
function parsePinValue(value) {
  // Valor 0 → desconectar
  if (value === 0 || value === '0') {
    return { action: 'disconnect', pinColor: null, gain: null, tolerance: null };
  }

  // String con nombre de color
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (VALID_PIN_COLORS.has(upper)) {
      return { action: 'connect', pinColor: upper, gain: null, tolerance: null };
    }
  }

  // Array de 2 floats: [ganancia, tolerancia] (formato alternativo)
  if (Array.isArray(value) && value.length >= 2) {
    const gain = parseFloat(value[0]);
    const tolerance = parseFloat(value[1]);
    if (!isNaN(gain) && !isNaN(tolerance)) {
      if (gain === 0) {
        return { action: 'disconnect', pinColor: null, gain: null, tolerance: null };
      }
      // Buscar el color más cercano a esta ganancia
      const closestColor = findClosestPinColor(gain);
      return { action: 'connect', pinColor: closestColor, gain, tolerance };
    }
  }

  // Valor numérico solo: si > 0 → WHITE por defecto
  if (typeof value === 'number' && value > 0) {
    return { action: 'connect', pinColor: 'WHITE', gain: null, tolerance: null };
  }

  return { action: 'disconnect', pinColor: null, gain: null, tolerance: null };
}

/**
 * Ganancias nominales de cada color para comparación.
 * Ganancia = Rf / Rpin (con Rf = 100kΩ)
 */
const PIN_COLOR_GAINS = {
  'PURPLE':  0.1,   // 1MΩ
  'CYAN':    0.4,   // 250kΩ
  'WHITE':   1.0,   // 100kΩ
  'GREY':    1.0,   // 100kΩ (más preciso, pero misma ganancia nominal)
  'GREEN':   1.47,  // 68kΩ
  'YELLOW':  4.5,   // 22kΩ
  'BLUE':    10.0,  // 10kΩ
  'RED':     37.0   // 2.7kΩ
};

/**
 * Busca el color de pin con ganancia más cercana al valor dado.
 * 
 * @param {number} gain - Ganancia objetivo
 * @returns {string} Color del pin más cercano
 */
function findClosestPinColor(gain) {
  let closest = 'WHITE';
  let minDiff = Infinity;

  for (const [color, g] of Object.entries(PIN_COLOR_GAINS)) {
    // Usar ratio logarítmico para comparar ganancias
    const diff = Math.abs(Math.log(gain) - Math.log(g));
    if (diff < minDiff) {
      minDiff = diff;
      closest = color;
    }
  }
  return closest;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASE PRINCIPAL: MatrixOSCSync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clase que gestiona la sincronización OSC de las matrices de audio y control.
 */
class MatrixOSCSync {
  constructor() {
    /** @type {Map<string, Function>} Funciones para cancelar suscripciones */
    this._unsubscribers = new Map();

    /** @type {Object|null} Referencia a la instancia de app */
    this._app = null;

    /** @type {boolean} Flag para evitar loops de retroalimentación */
    this._ignoreOSCUpdates = false;

    /** @type {Map<string, string>} Cache de últimos valores enviados para deduplicación */
    this._lastSentValues = new Map();
  }

  /**
   * Inicializa la sincronización OSC para matrices
   * 
   * @param {Object} app - Instancia de SGMEApp
   */
  init(app) {
    this._app = app;
    this._setupListeners();
    console.log('[MatrixOSCSync] Inicializado para matrices audio y control');
  }

  /**
   * Envía un cambio de pin en la matriz de audio (Panel 5) via OSC.
   * 
   * @param {number} rowIndex - Índice de fila (0-based)
   * @param {number} colIndex - Índice de columna (0-based)
   * @param {boolean} activate - true para conectar, false para desconectar
   * @param {string|null} pinColor - Color del pin (WHITE, GREY, etc.) o null
   */
  sendAudioPinChange(rowIndex, colIndex, activate, pinColor) {
    this._sendPinChange('audio', rowIndex, colIndex, activate, pinColor);
  }

  /**
   * Envía un cambio de pin en la matriz de control (Panel 6) via OSC.
   * 
   * @param {number} rowIndex - Índice de fila (0-based)
   * @param {number} colIndex - Índice de columna (0-based)
   * @param {boolean} activate - true para conectar, false para desconectar
   * @param {string|null} pinColor - Color del pin (WHITE, GREY, etc.) o null
   */
  sendControlPinChange(rowIndex, colIndex, activate, pinColor) {
    this._sendPinChange('cv', rowIndex, colIndex, activate, pinColor);
  }

  /**
   * Envía un cambio de pin genérico via OSC.
   * 
   * @param {'audio'|'cv'} matrixType - Tipo de matriz
   * @param {number} rowIndex - Índice de fila (0-based)
   * @param {number} colIndex - Índice de columna (0-based)
   * @param {boolean} activate - true para conectar, false para desconectar
   * @param {string|null} pinColor - Color del pin
   * @private
   */
  _sendPinChange(matrixType, rowIndex, colIndex, activate, pinColor) {
    if (!oscBridge.connected) return;

    // Obtener routing del panel correspondiente
    const routing = matrixType === 'audio'
      ? this._app?._panel3Routing
      : this._app?._panel6Routing;

    if (!routing?.sourceMap || !routing?.destMap) return;

    const source = routing.sourceMap.get(rowIndex);
    const dest = routing.destMap.get(colIndex);
    if (!source || !dest) return;

    // Construir segmentos de dirección
    const sourceSeg = sourceToOSCSegment(source);
    const destSeg = destToOSCSegment(dest);
    if (!sourceSeg || !destSeg) return;

    // Dirección completa: {matrixType}/{source}/{Dest}
    const address = `${matrixType}/${sourceSeg}/${destSeg}`;

    // Valor: color del pin o 0 para desconexión
    const value = activate ? (pinColor || 'WHITE') : 0;

    // Deduplicación
    const cacheKey = address;
    const lastValue = this._lastSentValues.get(cacheKey);
    const valueStr = String(value);
    if (lastValue === valueStr) return;
    this._lastSentValues.set(cacheKey, valueStr);

    oscBridge.send(address, value);
  }

  /**
   * Verifica si debe ignorar actualizaciones OSC (para evitar loops).
   * @returns {boolean}
   */
  shouldIgnoreOSC() {
    return this._ignoreOSCUpdates;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECEPCIÓN DE MENSAJES OSC
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Configura los listeners para recibir mensajes OSC de matrices.
   * 
   * Usa wildcards para capturar todas las direcciones bajo /audio/ y /cv/.
   * @private
   */
  _setupListeners() {
    // Limpiar listeners previos
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();

    // Listener para /audio/* (Panel 5)
    const unsubAudio = oscBridge.on('audio/*', (value, address, from) => {
      this._handleIncoming('audio', address, value);
    });
    this._unsubscribers.set('audio-wildcard', unsubAudio);

    // Listener para /cv/* (Panel 6)
    const unsubCV = oscBridge.on('cv/*', (value, address, from) => {
      this._handleIncoming('cv', address, value);
    });
    this._unsubscribers.set('cv-wildcard', unsubCV);
  }

  /**
   * Procesa un mensaje OSC entrante para una matriz.
   * 
   * Soporta dos formatos de dirección:
   * 1. Semántico: /SynthiGME/audio/osc/1/sinSaw/Out/1
   * 2. Coordenadas: /SynthiGME/audio/91/36
   * 
   * @param {'audio'|'cv'} matrixType - Tipo de matriz
   * @param {string} fullAddress - Dirección OSC completa
   * @param {*} value - Valor recibido (color string, 0, o [gain, tolerance])
   * @private
   */
  _handleIncoming(matrixType, fullAddress, value) {
    if (this._ignoreOSCUpdates || !this._app) return;

    // Extraer la parte de dirección tras el prefijo y tipo de matriz
    // fullAddress: /SynthiGME/audio/osc/1/sinSaw/Out/1
    const prefix = oscBridge.getFormattedPrefix();
    let path = fullAddress;
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
    }

    // Quitar el tipo de matriz del inicio
    // path: audio/osc/1/sinSaw/Out/1
    if (path.startsWith(matrixType + '/')) {
      path = path.slice(matrixType.length + 1);
    } else {
      return; // No coincide con el tipo esperado
    }

    const parts = path.split('/');

    // Determinar routing del panel
    const routing = matrixType === 'audio'
      ? this._app._panel3Routing
      : this._app._panel6Routing;

    if (!routing?.sourceMap || !routing?.destMap) return;

    let rowIndex = null;
    let colIndex = null;

    // Intentar parsear como coordenadas Synthi (alias numérico)
    if (parts.length === 2 && !isNaN(parseInt(parts[0], 10)) && !isNaN(parseInt(parts[1], 10))) {
      const rowSynth = parseInt(parts[0], 10);
      const colSynth = parseInt(parts[1], 10);
      // Convertir de Synthi coords a índices físicos
      const result = this._synthCoordsToIndices(matrixType, rowSynth, colSynth);
      if (result) {
        rowIndex = result.rowIndex;
        colIndex = result.colIndex;
      }
    } else {
      // Parsear formato semántico
      const sourceResult = parseSourceSegment(parts);
      if (!sourceResult) return;

      const destDescriptor = parseDestSegment(sourceResult.remainingParts, matrixType);
      if (!destDescriptor) return;

      // Buscar rowIndex y colIndex en los mapas del routing
      rowIndex = findRowForSource(routing.sourceMap, sourceResult.source);
      colIndex = findColForDest(routing.destMap, destDescriptor);
    }

    if (rowIndex === null || colIndex === null) return;

    // Parsear el valor del pin
    const pinInfo = parsePinValue(value);

    // Aplicar el cambio
    this._applyPinChange(matrixType, rowIndex, colIndex, pinInfo);
  }

  /**
   * Convierte coordenadas Synthi (serigrafía) a índices físicos de la matriz.
   * 
   * @param {'audio'|'cv'} matrixType - Tipo de matriz
   * @param {number} rowSynth - Fila según serigrafía Synthi
   * @param {number} colSynth - Columna según serigrafía Synthi
   * @returns {{ rowIndex: number, colIndex: number }|null}
   * @private
   */
  _synthCoordsToIndices(matrixType, rowSynth, colSynth) {
    // Obtener blueprint correspondiente
    const routing = matrixType === 'audio'
      ? this._app?._panel3Routing
      : this._app?._panel6Routing;

    if (!routing) return null;

    const rowBase = routing.rowBase ?? 67;
    const colBase = routing.colBase ?? 1;
    const hiddenRows = routing.hiddenRows ?? [];
    const hiddenCols = routing.hiddenCols ?? [];

    // Calcular ordinal (sin contar huecos)
    const rowOrdinal = rowSynth - rowBase;
    const colOrdinal = colSynth - colBase;
    if (rowOrdinal < 0 || colOrdinal < 0) return null;

    // Reconstruir visibleIndices (misma lógica que blueprintMapper)
    const hiddenRowSet = new Set(hiddenRows);
    const hiddenColSet = new Set(hiddenCols);

    // Asumimos 63 filas y 67 columnas (estándar del Synthi 100)
    const rows = 63;
    const cols = 67;

    const visibleRowIndices = [];
    for (let r = 0; r < rows; r++) {
      if (!hiddenRowSet.has(r)) visibleRowIndices.push(r);
    }

    const visibleColIndices = [];
    for (let c = 0; c < cols; c++) {
      if (!hiddenColSet.has(c)) visibleColIndices.push(c);
    }

    const rowIndex = visibleRowIndices[rowOrdinal] ?? null;
    const colIndex = visibleColIndices[colOrdinal] ?? null;

    if (rowIndex === null || colIndex === null) return null;

    // Verificar que hay source y dest mapeados
    if (!routing.sourceMap?.has(rowIndex) || !routing.destMap?.has(colIndex)) return null;

    return { rowIndex, colIndex };
  }

  /**
   * Aplica un cambio de pin recibido por OSC a la UI y al motor de audio.
   * 
   * Usa la misma estrategia que LargeMatrix.deserialize(): busca el botón
   * por data-row/data-col, actualiza su estado visual y llama a onToggle()
   * para que app.js ejecute la conexión/desconexión de audio.
   * 
   * @param {'audio'|'cv'} matrixType - Tipo de matriz
   * @param {number} rowIndex - Índice de fila (0-based)
   * @param {number} colIndex - Índice de columna (0-based)
   * @param {Object} pinInfo - Resultado de parsePinValue()
   * @private
   */
  _applyPinChange(matrixType, rowIndex, colIndex, pinInfo) {
    if (!this._app) return;

    // Evitar loop de retroalimentación
    this._ignoreOSCUpdates = true;

    try {
      const largeMatrix = matrixType === 'audio'
        ? this._app.largeMatrixAudio
        : this._app.largeMatrixControl;

      if (!largeMatrix || !largeMatrix.table) return;

      const key = `${rowIndex}:${colIndex}`;
      const routing = matrixType === 'audio'
        ? this._app._panel3Routing
        : this._app._panel6Routing;

      const isCurrentlyConnected = !!(routing?.connections?.[key]);
      const shouldConnect = pinInfo.action === 'connect';

      // Buscar el botón en el DOM (misma estrategia que LargeMatrix.deserialize)
      const btn = largeMatrix.table.querySelector(
        `button.pin-btn[data-row="${rowIndex}"][data-col="${colIndex}"]`
      );
      if (!btn || btn.disabled || btn.classList.contains('is-hidden-pin')) return;

      if (shouldConnect && !isCurrentlyConnected) {
        // Conectar: guardar color, activar UI, llamar toggle handler
        if (pinInfo.pinColor) {
          largeMatrix._pinColors.set(key, pinInfo.pinColor);
        }
        const effectiveColor = largeMatrix._getEffectivePinColor(rowIndex, colIndex);

        if (largeMatrix.onToggle) {
          const allow = largeMatrix.onToggle(rowIndex, colIndex, true, btn, effectiveColor) !== false;
          if (allow) {
            btn.classList.add('active');
            largeMatrix._applyPinColorClass(btn, effectiveColor);
          }
        }
      } else if (shouldConnect && isCurrentlyConnected) {
        // Ya conectado: actualizar color si cambió
        const currentColor = routing.connections[key]?.pinColor;
        if (currentColor !== pinInfo.pinColor) {
          // Desconectar primero
          if (largeMatrix.onToggle) {
            largeMatrix.onToggle(rowIndex, colIndex, false, btn);
          }
          btn.classList.remove('active');
          largeMatrix._removePinColorClasses(btn);

          // Reconectar con nuevo color
          if (pinInfo.pinColor) {
            largeMatrix._pinColors.set(key, pinInfo.pinColor);
          }
          const effectiveColor = largeMatrix._getEffectivePinColor(rowIndex, colIndex);
          if (largeMatrix.onToggle) {
            const allow = largeMatrix.onToggle(rowIndex, colIndex, true, btn, effectiveColor) !== false;
            if (allow) {
              btn.classList.add('active');
              largeMatrix._applyPinColorClass(btn, effectiveColor);
            }
          }
        }
      } else if (!shouldConnect && isCurrentlyConnected) {
        // Desconectar: desactivar UI, llamar toggle handler
        if (largeMatrix.onToggle) {
          largeMatrix.onToggle(rowIndex, colIndex, false, btn);
        }
        btn.classList.remove('active');
        largeMatrix._removePinColorClasses(btn);
      }
      // Si !shouldConnect && !isCurrentlyConnected → nada que hacer
    } finally {
      setTimeout(() => {
        this._ignoreOSCUpdates = false;
      }, 10);
    }
  }

  /**
   * Desconecta todos los listeners.
   */
  destroy() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers.clear();
    this._app = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton y exportación
// ─────────────────────────────────────────────────────────────────────────────

/** @type {MatrixOSCSync} Instancia singleton */
const matrixOSCSync = new MatrixOSCSync();

export {
  matrixOSCSync,
  MatrixOSCSync,
  sourceToOSCSegment,
  destToOSCSegment,
  parsePinValue,
  VALID_PIN_COLORS
};
export default matrixOSCSync;
