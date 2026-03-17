/**
 * Tests para state/storage.js
 * 
 * Tests de funciones de exportación/importación de patches
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

// Mock de Blob y URL para Node.js
class MockBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.type = options?.type || '';
    this.content = parts.join('');
  }
}

// Almacén para capturar llamadas
let capturedLinks = [];
let capturedBlobs = [];
let revokedUrls = [];

globalThis.Blob = MockBlob;

globalThis.URL = {
  createObjectURL: (blob) => {
    capturedBlobs.push(blob);
    return `blob:mock-url-${capturedBlobs.length}`;
  },
  revokeObjectURL: (url) => {
    revokedUrls.push(url);
  }
};

// Mock de document
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'a') {
      const link = {
        tag: 'a',
        href: '',
        download: '',
        style: {},
        click: function() {
          capturedLinks.push({ ...this });
        }
      };
      return link;
    }
    if (tag === 'input') {
      return {
        tag: 'input',
        type: '',
        accept: '',
        onchange: null,
        click: () => {}
      };
    }
    return { style: {} };
  },
  body: {
    appendChild: () => {},
    removeChild: () => {}
  }
};

// Mock de window
globalThis.window = { __synthBuildVersion: '0.3.0-test' };

// Mock de localStorage
globalThis.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] || null; },
  setItem(key, value) { this._data[key] = value; },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAR FUNCIONES A TESTEAR
// ═══════════════════════════════════════════════════════════════════════════

import { exportPatchToFile, saveLastState, loadLastState, clearLastState, hasLastState } from '../../src/assets/js/state/storage.js';

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('exportPatchToFile', () => {
  beforeEach(() => {
    capturedLinks = [];
    capturedBlobs = [];
    revokedUrls = [];
  });

  it('crea un blob con el JSON del patch', async () => {
    const patch = { name: 'Test Patch', modules: {} };
    
    exportPatchToFile(patch);
    
    // Esperar el setTimeout(0)
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(capturedBlobs.length, 1);
    assert.equal(capturedBlobs[0].type, 'application/json');
    
    const content = JSON.parse(capturedBlobs[0].content);
    assert.equal(content.name, 'Test Patch');
  });

  it('usa el nombre del patch para el archivo', async () => {
    const patch = { name: 'Mi Sonido', modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(capturedLinks.length, 1);
    assert.equal(capturedLinks[0].download, 'Mi_Sonido.sgme.json');
  });

  it('permite especificar un nombre de archivo personalizado', async () => {
    const patch = { name: 'Original', modules: {} };
    
    exportPatchToFile(patch, 'custom-name');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(capturedLinks[0].download, 'custom-name.sgme.json');
  });

  it('sanitiza caracteres especiales del nombre', async () => {
    const patch = { name: 'Test/Patch:With<Special>Chars', modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Los caracteres especiales deben ser reemplazados por _
    assert.ok(!capturedLinks[0].download.includes('/'));
    assert.ok(!capturedLinks[0].download.includes(':'));
    assert.ok(!capturedLinks[0].download.includes('<'));
    assert.ok(!capturedLinks[0].download.includes('>'));
    assert.ok(capturedLinks[0].download.endsWith('.sgme.json'));
  });

  it('usa "patch" como nombre por defecto si no hay nombre', async () => {
    const patch = { modules: {} }; // Sin nombre
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(capturedLinks[0].download, 'patch.sgme.json');
  });

  it('simula el click en el link para iniciar descarga', async () => {
    const patch = { name: 'Click Test', modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(capturedLinks.length, 1);
    assert.ok(capturedLinks[0].href.startsWith('blob:'));
  });

  it('revoca la URL del blob después de la descarga', async () => {
    const patch = { name: 'Revoke Test', modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    assert.equal(revokedUrls.length, 1);
    assert.ok(revokedUrls[0].startsWith('blob:'));
  });

  it('serializa el patch con formato legible (indentación)', async () => {
    const patch = { 
      name: 'Format Test', 
      modules: { osc1: { freq: 440 } } 
    };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const content = capturedBlobs[0].content;
    // JSON.stringify con null, 2 produce saltos de línea
    assert.ok(content.includes('\n'));
  });

  it('preserva la estructura completa del patch', async () => {
    const patch = {
      name: 'Complex Patch',
      formatVersion: 2,
      savedAt: '2026-01-15T10:00:00.000Z',
      modules: {
        osc1: { knobs: [0.5, 0.3, 0.7, 0.2, 0.1, 0.8] },
        osc2: { knobs: [0.4, 0.4, 0.6, 0.3, 0.2, 0.9] }
      },
      matrix: { audio: [[1, 2, 3]], control: [] },
      routing: { stereoBuses: [1, 2], individualOutputs: [] }
    };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const exported = JSON.parse(capturedBlobs[0].content);
    assert.deepEqual(exported, patch);
  });
});

describe('exportPatchToFile - edge cases', () => {
  beforeEach(() => {
    capturedLinks = [];
    capturedBlobs = [];
    revokedUrls = [];
  });

  it('maneja nombres con solo caracteres especiales', async () => {
    const patch = { name: '!@#$%^&*()', modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Todos los caracteres se reemplazan por _, resultando en __________
    assert.ok(capturedLinks[0].download.endsWith('.sgme.json'));
    assert.ok(!capturedLinks[0].download.includes('!'));
  });

  it('maneja nombres muy largos', async () => {
    const longName = 'A'.repeat(200);
    const patch = { name: longName, modules: {} };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Debe generar archivo aunque el nombre sea largo
    assert.ok(capturedLinks[0].download.length > 0);
    assert.ok(capturedLinks[0].download.endsWith('.sgme.json'));
  });

  it('maneja patch con propiedades undefined', async () => {
    const patch = { 
      name: 'Sparse', 
      modules: {},
      undefinedProp: undefined 
    };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const content = capturedBlobs[0].content;
    // JSON.stringify omite propiedades undefined
    assert.ok(!content.includes('undefinedProp'));
  });

  it('maneja patch con arrays vacíos', async () => {
    const patch = { 
      name: 'Empty Arrays', 
      modules: {},
      matrix: { audio: [], control: [] }
    };
    
    exportPatchToFile(patch);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const exported = JSON.parse(capturedBlobs[0].content);
    assert.deepEqual(exported.matrix.audio, []);
    assert.deepEqual(exported.matrix.control, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE ÚLTIMO ESTADO (localStorage)
// ═══════════════════════════════════════════════════════════════════════════

describe('saveLastState / loadLastState', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('saveLastState persiste el estado en localStorage', () => {
    const state = { modules: { osc: { freq: 440 } } };
    saveLastState(state);

    const raw = globalThis.localStorage.getItem('synthigme-last-state');
    assert.ok(raw, 'debe haber un valor en localStorage');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.modules, state.modules);
  });

  it('saveLastState añade savedAt automáticamente', () => {
    saveLastState({ test: true });

    const raw = globalThis.localStorage.getItem('synthigme-last-state');
    const parsed = JSON.parse(raw);
    assert.ok(parsed.savedAt, 'savedAt debe estar presente');
    assert.ok(new Date(parsed.savedAt).getTime() > 0, 'savedAt debe ser fecha válida');
  });

  it('loadLastState retorna null cuando no hay estado guardado', () => {
    const result = loadLastState();
    assert.equal(result, null);
  });

  it('loadLastState recupera el estado previamente guardado', () => {
    const state = { modules: { osc: { freq: 880 } }, matrix: [] };
    saveLastState(state);

    const loaded = loadLastState();
    assert.ok(loaded, 'debe retornar un objeto');
    assert.deepEqual(loaded.modules, state.modules);
  });

  it('loadLastState retorna null si el JSON está corrupto', () => {
    globalThis.localStorage.setItem('synthigme-last-state', 'no-es-json-valido');

    const result = loadLastState();
    assert.equal(result, null);
  });

  it('saveLastState sobrescribe el estado anterior', () => {
    saveLastState({ version: 1 });
    saveLastState({ version: 2 });

    const loaded = loadLastState();
    assert.equal(loaded.version, 2);
  });
});

describe('clearLastState', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('elimina el estado de localStorage', () => {
    saveLastState({ data: 'test' });
    clearLastState();

    const raw = globalThis.localStorage.getItem('synthigme-last-state');
    assert.equal(raw, null);
  });

  it('no lanza si no hay estado guardado', () => {
    assert.doesNotThrow(() => clearLastState());
  });
});

describe('hasLastState', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('retorna false cuando no hay estado guardado', () => {
    assert.equal(hasLastState(), false);
  });

  it('retorna true después de guardar estado', () => {
    saveLastState({ test: true });
    assert.equal(hasLastState(), true);
  });

  it('retorna false después de clearLastState', () => {
    saveLastState({ test: true });
    clearLastState();
    assert.equal(hasLastState(), false);
  });
});
