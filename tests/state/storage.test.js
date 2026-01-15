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

import { exportPatchToFile } from '../../src/assets/js/state/storage.js';

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
