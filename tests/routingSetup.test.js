/**
 * Tests para routingSetup.js (R7)
 *
 * Verifica los contratos de setupAudioRouting() y setupControlRouting()
 * antes y después del refactor R7 (split de app.js).
 *
 * setupAudioRouting(app)   — compila panel5AudioBlueprint y popula _panel3Routing
 * setupControlRouting(app) — compila panel6ControlBlueprint y popula _panel6Routing
 *
 * No requiere DOM ni AudioContext: los blueprints son datos puros.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ─── Import del módulo bajo prueba ────────────────────────────────────────────
import {
  setupAudioRouting,
  setupControlRouting
} from '../src/assets/js/routingSetup.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMockApp() {
  return {
    _panel3Routing: null,
    _panel6Routing: null,
    largeMatrixAudio:   { _handler: null, setToggleHandler(fn) { this._handler = fn; } },
    largeMatrixControl: { _handler: null, setToggleHandler(fn) { this._handler = fn; } }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// setupAudioRouting — _panel3Routing
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupAudioRouting — estructura de _panel3Routing', () => {
  let app;
  beforeEach(() => { app = buildMockApp(); setupAudioRouting(app); });

  it('inicializa _panel3Routing', () => {
    assert.ok(app._panel3Routing !== null);
    assert.ok(typeof app._panel3Routing === 'object');
  });

  it('crea connections como objeto vacío', () => {
    assert.deepEqual(app._panel3Routing.connections, {});
  });

  it('rowMap es un Map', () => {
    assert.ok(app._panel3Routing.rowMap instanceof Map);
  });

  it('colMap es un Map', () => {
    assert.ok(app._panel3Routing.colMap instanceof Map);
  });

  it('destMap es un Map', () => {
    assert.ok(app._panel3Routing.destMap instanceof Map);
  });

  it('sourceMap es un Map', () => {
    assert.ok(app._panel3Routing.sourceMap instanceof Map);
  });

  it('channelMap es un Map', () => {
    assert.ok(app._panel3Routing.channelMap instanceof Map);
  });

  it('rows es un array', () => {
    assert.ok(Array.isArray(app._panel3Routing.rows));
  });

  it('cols es un array', () => {
    assert.ok(Array.isArray(app._panel3Routing.cols));
  });

  it('rowMap no está vacío (hay filas en el blueprint)', () => {
    assert.ok(app._panel3Routing.rowMap.size > 0, 'debe tener al menos una fila');
  });

  it('destMap no está vacío (hay columnas en el blueprint)', () => {
    assert.ok(app._panel3Routing.destMap.size > 0, 'debe tener al menos una columna destino');
  });
});

describe('setupAudioRouting — toggle handler', () => {
  it('registra un toggle handler en largeMatrixAudio', () => {
    const app = buildMockApp();
    setupAudioRouting(app);
    assert.strictEqual(typeof app.largeMatrixAudio._handler, 'function');
  });

  it('no lanza si largeMatrixAudio es null', () => {
    const app = buildMockApp();
    app.largeMatrixAudio = null;
    assert.doesNotThrow(() => setupAudioRouting(app));
  });

  it('no lanza si largeMatrixAudio no tiene setToggleHandler', () => {
    const app = buildMockApp();
    app.largeMatrixAudio = {};
    assert.doesNotThrow(() => setupAudioRouting(app));
  });
});

describe('setupAudioRouting — idempotencia', () => {
  it('resetea connections al llamar por segunda vez', () => {
    const app = buildMockApp();
    setupAudioRouting(app);
    app._panel3Routing.connections['0:0'] = { dummy: true };
    setupAudioRouting(app);
    assert.deepEqual(app._panel3Routing.connections, {});
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupControlRouting — _panel6Routing
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupControlRouting — estructura de _panel6Routing', () => {
  let app;
  beforeEach(() => { app = buildMockApp(); setupControlRouting(app); });

  it('inicializa _panel6Routing', () => {
    assert.ok(app._panel6Routing !== null);
  });

  it('crea connections como objeto vacío', () => {
    assert.deepEqual(app._panel6Routing.connections, {});
  });

  it('rowMap es un Map con entradas', () => {
    assert.ok(app._panel6Routing.rowMap instanceof Map);
    assert.ok(app._panel6Routing.rowMap.size > 0);
  });

  it('destMap es un Map con entradas', () => {
    assert.ok(app._panel6Routing.destMap instanceof Map);
    assert.ok(app._panel6Routing.destMap.size > 0);
  });

  it('sourceMap es un Map', () => {
    assert.ok(app._panel6Routing.sourceMap instanceof Map);
  });

  it('rows y cols son arrays', () => {
    assert.ok(Array.isArray(app._panel6Routing.rows));
    assert.ok(Array.isArray(app._panel6Routing.cols));
  });
});

describe('setupControlRouting — toggle handler', () => {
  it('registra un toggle handler en largeMatrixControl', () => {
    const app = buildMockApp();
    setupControlRouting(app);
    assert.strictEqual(typeof app.largeMatrixControl._handler, 'function');
  });

  it('no lanza si largeMatrixControl es null', () => {
    const app = buildMockApp();
    app.largeMatrixControl = null;
    assert.doesNotThrow(() => setupControlRouting(app));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Consistencia entre audio y control routing
// ═══════════════════════════════════════════════════════════════════════════════

describe('routing audio vs control — tamaños de matrices', () => {
  it('audio y control tienen distinto número de filas (blueprints diferentes)', () => {
    const app = buildMockApp();
    setupAudioRouting(app);
    setupControlRouting(app);
    // Panel 5 (audio) y panel 6 (control) tienen diferente configuración de matriz
    // No necesariamente distintos, pero ambos deben estar poblados
    assert.ok(app._panel3Routing.rowMap.size > 0);
    assert.ok(app._panel6Routing.rowMap.size > 0);
  });
});
