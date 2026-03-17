/**
 * Configuración de routing de audio y control (R7).
 *
 * Extraído de app.js — inicializa los mapas de routing para las matrices
 * de audio (Panel 5) y de control (Panel 6) a partir de sus blueprints.
 *
 * @module routingSetup
 */

import { compilePanelBlueprintMappings } from './core/blueprintMapper.js';
import panel5AudioBlueprint   from './panelBlueprints/panel5.audio.blueprint.js';
import panel6ControlBlueprint from './panelBlueprints/panel6.control.blueprint.js';

// ─────────────────────────────────────────────────────────────────────────────
// setupAudioRouting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de routing de audio del Panel 5.
 * Compila el blueprint y registra el handler de toggle en largeMatrixAudio.
 *
 * @param {object} app - Instancia de App
 */
export function setupAudioRouting(app) {
  app._panel3Routing = app._panel3Routing || {
    connections: {}, rowMap: null, colMap: null,
    destMap: null, channelMap: null, sourceMap: null
  };
  app._panel3Routing.connections = {};

  const mappings = compilePanelBlueprintMappings(panel5AudioBlueprint);
  app._panel3Routing.rowMap      = mappings.rowMap;
  app._panel3Routing.colMap      = mappings.colMap;
  app._panel3Routing.destMap     = mappings.destMap;
  app._panel3Routing.channelMap  = mappings.channelMap;
  app._panel3Routing.sourceMap   = mappings.sourceMap;
  app._panel3Routing.hiddenCols  = mappings.hiddenCols;
  app._panel3Routing.rows        = mappings.rows;
  app._panel3Routing.cols        = mappings.cols;

  if (app.largeMatrixAudio?.setToggleHandler) {
    app.largeMatrixAudio.setToggleHandler(
      (rowIndex, colIndex, nextActive, btn, pinColor) =>
        app._handlePanel5AudioToggle(rowIndex, colIndex, nextActive, pinColor)
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// setupControlRouting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de routing de control del Panel 6.
 * Compila el blueprint y registra el handler de toggle en largeMatrixControl.
 *
 * @param {object} app - Instancia de App
 */
export function setupControlRouting(app) {
  app._panel6Routing = app._panel6Routing || {
    connections: {}, rowMap: null, colMap: null,
    destMap: null, channelMap: null, sourceMap: null
  };
  app._panel6Routing.connections = {};

  const mappings = compilePanelBlueprintMappings(panel6ControlBlueprint);
  app._panel6Routing.rowMap      = mappings.rowMap;
  app._panel6Routing.colMap      = mappings.colMap;
  app._panel6Routing.destMap     = mappings.destMap;
  app._panel6Routing.channelMap  = mappings.channelMap;
  app._panel6Routing.sourceMap   = mappings.sourceMap;
  app._panel6Routing.hiddenCols  = mappings.hiddenCols;
  app._panel6Routing.rows        = mappings.rows;
  app._panel6Routing.cols        = mappings.cols;

  if (app.largeMatrixControl?.setToggleHandler) {
    app.largeMatrixControl.setToggleHandler(
      (rowIndex, colIndex, nextActive, btn, pinColor) =>
        app._handlePanel6ControlToggle(rowIndex, colIndex, nextActive, pinColor)
    );
  }
}
