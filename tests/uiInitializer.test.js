/**
 * Tests para uiInitializer.js (R7)
 *
 * Verifica que setupUI(), setupRecording(), setupSettingsModal(),
 * setupDormancyManager(), setupPatchBrowser() y setupUndoRedo()
 * populan las referencias correctas en el objeto app.
 *
 * Usa JSDOM para DOM y mocks ligeros de engine, sessionManager, etc.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ─── Mocks de entorno ─────────────────────────────────────────────────────────
import './mocks/localStorage.mock.js';

// ─── JSDOM global ─────────────────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window              = dom.window;
global.document            = dom.window.document;
global.HTMLElement         = dom.window.HTMLElement;
global.CustomEvent         = dom.window.CustomEvent;
global.SVGElement          = dom.window.SVGElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame  = (id) => clearTimeout(id);

// fetch silencioso para recursos que no estén disponibles
global.fetch = async () => { throw new Error('fetch no disponible en tests'); };

// navigator (read-only en algunos entornos)
try { global.navigator = dom.window.navigator; } catch { /* read-only */ }

// ─── Import del módulo bajo prueba ────────────────────────────────────────────
import {
  setupUI,
  setupRecording,
  setupSettingsModal,
  setupDormancyManager,
  setupPatchBrowser,
  setupUndoRedo,
  setupAudioSettingsModal
} from '../src/assets/js/uiInitializer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Factory de mock app
// ─────────────────────────────────────────────────────────────────────────────

function buildMockEngine() {
  return {
    outputChannels: 8,
    dspEnabled: true,
    audioCtx: null,
    muted: false,
    getPhysicalChannelInfo: () => ({ count: 2, labels: ['L', 'R'] }),
    setOutputRouting: () => {},
    setOutputDevice: async () => ({ success: true, channels: 2 }),
    setInputDevice: async () => ({ success: true }),
    setInputRouting: () => {},
    toggleMute: () => {},
    resumeDSP: async () => {},
    suspendDSP: async () => {},
    setFilterBypassEnabled: () => {},
    setFilterBypassDebug: () => {},
    start: () => {}
  };
}

function buildMockApp() {
  return {
    engine: buildMockEngine(),

    // Propiedades que se asignan durante el setup
    audioSettingsModal:        null,
    patchBrowser:              null,
    _recordingEngine:          null,
    _recordingSettingsModal:   null,
    _recordingOverlay:         null,
    settingsModal:             null,
    wakeLockManager:           null,
    dormancyManager:           null,
    _saveOnExit:               false,
    _oscEnabled:               false,

    // Estado de audio (usado en callbacks)
    _panel2Data:               null,
    _panel2ScopeStarted:       false,
    _panel3LayoutData:         null,

    // Métodos que los callbacks invocan
    _serializeCurrentState:    () => ({}),
    _applyPatch:               async () => {},
    _applyInputRouting:        () => {},
    _deactivateMultichannelOutput: async () => {},
    _deactivateMultichannelInput:  async () => {},
    _activateMultichannelOutput:   async () => {},
    _activateMultichannelInput:    async () => {},
    ensureAudio:               async () => {}
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// setupRecording
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupRecording — asignaciones', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    setupRecording(app);
  });

  it('asigna app._recordingEngine', () => {
    assert.ok(app._recordingEngine !== null, '_recordingEngine debe estar asignado');
  });

  it('asigna app._recordingSettingsModal', () => {
    assert.ok(app._recordingSettingsModal !== null, '_recordingSettingsModal debe estar asignado');
  });

  it('asigna app._recordingOverlay', () => {
    assert.ok(app._recordingOverlay !== null, '_recordingOverlay debe estar asignado');
  });

  it('_recordingEngine tiene método toggle()', () => {
    assert.strictEqual(typeof app._recordingEngine.toggle, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupSettingsModal
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupSettingsModal — asignaciones', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    // setupSettingsModal accede a audioSettingsModal y _recordingSettingsModal
    // que normalmente se crean antes — proveemos mocks básicos
    setupRecording(app);
    setupSettingsModal(app);
  });

  it('asigna app.settingsModal', () => {
    assert.ok(app.settingsModal !== null, 'settingsModal debe estar asignado');
  });

  it('asigna app.wakeLockManager', () => {
    assert.ok(app.wakeLockManager !== null, 'wakeLockManager debe estar asignado');
  });

  it('settingsModal tiene método open()', () => {
    assert.strictEqual(typeof app.settingsModal.open, 'function');
  });

  it('settingsModal tiene método close()', () => {
    assert.strictEqual(typeof app.settingsModal.close, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupDormancyManager
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupDormancyManager — asignaciones', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    setupDormancyManager(app);
  });

  it('asigna app.dormancyManager', () => {
    assert.ok(app.dormancyManager !== null, 'dormancyManager debe estar asignado');
  });

  it('dormancyManager tiene método setEnabled()', () => {
    assert.strictEqual(typeof app.dormancyManager.setEnabled, 'function');
  });

  it('dormancyManager tiene método setDebugIndicators()', () => {
    assert.strictEqual(typeof app.dormancyManager.setDebugIndicators, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupPatchBrowser
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupPatchBrowser — asignaciones', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    setupPatchBrowser(app);
  });

  it('asigna app.patchBrowser', () => {
    assert.ok(app.patchBrowser !== null, 'patchBrowser debe estar asignado');
  });

  it('patchBrowser tiene método toggle()', () => {
    assert.strictEqual(typeof app.patchBrowser.toggle, 'function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupAudioSettingsModal
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupAudioSettingsModal — asignaciones', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    setupAudioSettingsModal(app);
  });

  it('asigna app.audioSettingsModal', () => {
    assert.ok(app.audioSettingsModal !== null, 'audioSettingsModal debe estar asignado');
  });

  it('también asigna app._recordingEngine (llamado internamente)', () => {
    assert.ok(app._recordingEngine !== null, '_recordingEngine debe estar asignado via setupAudioSettingsModal');
  });

  it('también asigna app.settingsModal (llamado internamente)', () => {
    assert.ok(app.settingsModal !== null, 'settingsModal debe estar asignado via setupAudioSettingsModal');
  });

  it('también asigna app.dormancyManager (llamado internamente)', () => {
    assert.ok(app.dormancyManager !== null, 'dormancyManager debe estar asignado via setupAudioSettingsModal');
  });

  it('también asigna app.patchBrowser (llamado internamente)', () => {
    assert.ok(app.patchBrowser !== null, 'patchBrowser debe estar asignado via setupAudioSettingsModal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupUI — integración
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupUI — integración', () => {
  let app;
  beforeEach(() => {
    app = buildMockApp();
    setupUI(app);
  });

  it('asigna app.audioSettingsModal', () => {
    assert.ok(app.audioSettingsModal !== null);
  });

  it('asigna app._recordingEngine', () => {
    assert.ok(app._recordingEngine !== null);
  });

  it('asigna app.settingsModal', () => {
    assert.ok(app.settingsModal !== null);
  });

  it('asigna app.dormancyManager', () => {
    assert.ok(app.dormancyManager !== null);
  });

  it('asigna app.patchBrowser', () => {
    assert.ok(app.patchBrowser !== null);
  });

  it('asigna app.wakeLockManager', () => {
    assert.ok(app.wakeLockManager !== null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// setupUI — event handlers
// ═══════════════════════════════════════════════════════════════════════════════

describe('setupUI — event handlers', () => {
  it('synth:toggleMute llama a engine.toggleMute()', () => {
    const app = buildMockApp();
    let muteCallCount = 0;
    app.engine.toggleMute = () => { muteCallCount++; };
    setupUI(app);

    document.dispatchEvent(new dom.window.CustomEvent('synth:toggleMute'));
    assert.strictEqual(muteCallCount, 1, 'engine.toggleMute debe haberse llamado');
  });

  it('synth:dormancyEnabledChange llama a dormancyManager.setEnabled()', () => {
    const app = buildMockApp();
    setupUI(app);

    let lastEnabled = null;
    app.dormancyManager.setEnabled = (v) => { lastEnabled = v; };
    document.dispatchEvent(new dom.window.CustomEvent('synth:dormancyEnabledChange', {
      detail: { enabled: false }
    }));
    assert.strictEqual(lastEnabled, false);
  });
});
