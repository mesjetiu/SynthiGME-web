/**
 * Compilador de blueprints de paneles.
 * 
 * Transforma blueprints declarativos en mapas de ruteo optimizados
 * para conectar fuentes de audio (osciladores, ruido) con destinos
 * (buses de salida, osciloscopio).
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * SISTEMA DE NUMERACIÓN SYNTHI → ÍNDICE FÍSICO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Los blueprints usan NUMERACIÓN SYNTHI (serigrafía del panel).
 * Los HUECOS (pines que no existen) NO tienen número en la serigrafía.
 * 
 * Ejemplo con hiddenCols0: [33] (hueco en índice físico 33):
 * 
 *   Índice físico: 0   1   2  ...  32   33    34   35  ...  63   64
 *   Synthi #:      1   2   3  ...  33  [gap]  34   35  ...  63   64
 *                                       ↑
 *                               (no tiene número)
 * 
 * La conversión:
 *   - Synthi 33 → índice 32
 *   - Synthi 34 → índice 34 (salta el 33)
 *   - Synthi 63 → índice 64
 * 
 * REGLA: En los blueprints, usar SIEMPRE los números de la serigrafía.
 *        NUNCA compensar manualmente los huecos.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * @module core/blueprintMapper
 */

/**
 * Compila un blueprint de panel en mapas de ruteo.
 * 
 * @param {Object} blueprint - Blueprint del panel con grid, sources, destinations
 * @returns {Object} Mapas compilados:
 *   - rowMap: Map<rowIndex, oscIndex> para osciladores
 *   - colMap: Map<colIndex, busIndex> para buses de salida
 *   - destMap: Map<colIndex, destObject> destinos completos
 *   - channelMap: Map<rowIndex, channelId> (sineSaw/triPulse)
 *   - sourceMap: Map<rowIndex, sourceObject> fuentes completas
 *   - hiddenRows: number[] filas ocultas (índice 0-based)
 *   - hiddenCols: number[] columnas ocultas (índice 0-based)
 *   - rowBase: number base de coordenadas de filas
 *   - colBase: number base de coordenadas de columnas
 */
export function compilePanelBlueprintMappings(blueprint) {
  const rowBase = blueprint?.grid?.coordSystem?.rowBase ?? 67;
  const colBase = blueprint?.grid?.coordSystem?.colBase ?? 1;

  const rows = blueprint?.grid?.rows ?? 63;
  const cols = blueprint?.grid?.cols ?? 67;

  const hiddenRows0 = Array.isArray(blueprint?.ui?.hiddenRows0)
    ? blueprint.ui.hiddenRows0.filter(Number.isFinite)
    : (blueprint?.ui?.hiddenRowsSynth || [])
      .filter(Number.isFinite)
      .map(r => r - rowBase)
      .filter(r => r >= 0);

  const hiddenCols0 = Array.isArray(blueprint?.ui?.hiddenCols0)
    ? blueprint.ui.hiddenCols0.filter(Number.isFinite)
    : (blueprint?.ui?.hiddenColsSynth || [])
      .filter(Number.isFinite)
      .map(c => c - colBase)
      .filter(c => c >= 0);

  const hiddenRowSet = new Set(hiddenRows0);

  // Array de índices físicos visibles para filas
  // La numeración Synthi de filas NO cuenta los huecos
  const visibleRowIndices = [];
  for (let r = 0; r < rows; r += 1) {
    if (hiddenRowSet.has(r)) continue;
    visibleRowIndices.push(r);
  }

  /**
   * Convierte número de fila Synthi a índice físico.
   * La numeración Synthi de FILAS NO incluye los huecos.
   * @param {number} rowSynth - Número de fila según serigrafía Synthi
   * @returns {number|null} Índice físico 0-based, o null si inválido
   */
  const synthRowToPhysicalRowIndex = (rowSynth) => {
    const ordinal = rowSynth - rowBase;
    if (!Number.isFinite(ordinal) || ordinal < 0) return null;
    return visibleRowIndices[ordinal] ?? null;
  };

  // Array de índices físicos visibles para columnas
  // La numeración Synthi de COLUMNAS tampoco cuenta los huecos
  const hiddenColSet = new Set(hiddenCols0);
  const visibleColIndices = [];
  for (let c = 0; c < cols; c += 1) {
    if (hiddenColSet.has(c)) continue;
    visibleColIndices.push(c);
  }

  /**
   * Convierte número de columna Synthi a índice físico.
   * La numeración Synthi NO incluye los huecos.
   * @param {number} colSynth - Número de columna según serigrafía Synthi
   * @returns {number|null} Índice físico 0-based, o null si inválido
   */
  const synthColToPhysicalColIndex = (colSynth) => {
    const ordinal = colSynth - colBase;
    if (!Number.isFinite(ordinal) || ordinal < 0) return null;
    return visibleColIndices[ordinal] ?? null;
  };

  // Mapeo de filas a fuentes (osciladores y noise generators)
  const rowMap = new Map();      // rowIndex -> oscIndex (para osciladores)
  const channelMap = new Map();  // rowIndex -> channelId (sineSaw/triPulse)
  const sourceMap = new Map();   // rowIndex -> { kind, index?, oscIndex?, channelId? }
  
  for (const entry of blueprint?.sources || []) {
    const rowSynth = entry?.rowSynth;
    const source = entry?.source;
    if (!Number.isFinite(rowSynth) || !source) continue;
    
    const rowIndex = synthRowToPhysicalRowIndex(rowSynth);
    if (rowIndex == null) continue;
    
    // Guardar fuente completa para routing genérico
    sourceMap.set(rowIndex, source);
    
    // Mantener compatibilidad con osciladores
    if (source.kind === 'panel3Osc') {
      const oscIndex = source.oscIndex;
      const channelId = source.channelId || 'sineSaw';
      if (Number.isFinite(oscIndex)) {
        rowMap.set(rowIndex, oscIndex);
        channelMap.set(rowIndex, channelId);
      }
    }
  }

  const colMap = new Map();
  const destMap = new Map();  // Mapa de columna a destino completo { kind, bus?, channel? }
  for (const entry of blueprint?.destinations || []) {
    const colSynth = entry?.colSynth;
    const dest = entry?.dest;
    if (!Number.isFinite(colSynth) || !dest) continue;
    const colIndex = synthColToPhysicalColIndex(colSynth);
    if (colIndex == null) continue;
    
    // Guardar destino completo para tipos especiales
    destMap.set(colIndex, dest);
    
    // Para compatibilidad: seguir mapeando buses al colMap
    if (dest.kind === 'outputBus' && Number.isFinite(dest.bus)) {
      const busIndex = dest.bus - 1;
      if (busIndex >= 0) {
        colMap.set(colIndex, busIndex);
      }
    }
  }

  return { rowMap, colMap, destMap, channelMap, sourceMap, hiddenRows: hiddenRows0, hiddenCols: hiddenCols0, rowBase, colBase };
}
