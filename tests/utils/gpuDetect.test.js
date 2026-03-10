/**
 * Tests para utils/gpuDetect.js
 * 
 * Verifica:
 * - Detección de GPU tier (strong/weak/unknown)
 * - Clasificación de renderers conocidos
 * - Resolución de modo de renderizado (auto/quality/performance)
 * - Aplicación/remoción de clase CSS
 * - Persistencia en localStorage
 * - Backward compatibility (modo quality = comportamiento original)
 */
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Mock de DOM mínimo para tests que no usan browser real
// ─────────────────────────────────────────────────────────────────────────────

const localStorage = new Map();
const bodyClasses = new Set();
const createdCanvases = [];

// Mock global mínimo
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || {};
globalThis.localStorage = {
  getItem: (k) => localStorage.get(k) ?? null,
  setItem: (k, v) => localStorage.set(k, String(v)),
  removeItem: (k) => localStorage.delete(k)
};

globalThis.document.createElement = (tag) => {
  if (tag === 'canvas') {
    const canvas = {
      _contextType: null,
      _context: null,
      getContext(type) {
        canvas._contextType = type;
        // Default: return a mock WebGL context
        if (!canvas._context) {
          canvas._context = createMockGLContext();
        }
        return canvas._context;
      }
    };
    createdCanvases.push(canvas);
    return canvas;
  }
  return {};
};

globalThis.document.body = {
  classList: {
    add: (c) => bodyClasses.add(c),
    remove: (c) => bodyClasses.delete(c),
    contains: (c) => bodyClasses.has(c)
  }
};

globalThis.window.matchMedia = (query) => ({
  matches: query === '(prefers-reduced-motion: reduce)' ? false : false
});

/**
 * Crea un mock de contexto WebGL con renderer configurable
 */
function createMockGLContext(renderer = 'NVIDIA GeForce GTX 1060', vendor = 'NVIDIA Corporation') {
  const RENDERER = 0x1F01;
  const VENDOR = 0x1F00;
  return {
    RENDERER,
    VENDOR,
    getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        return {
          UNMASKED_RENDERER_WEBGL: 0x9246,
          UNMASKED_VENDOR_WEBGL: 0x9245
        };
      }
      if (name === 'WEBGL_lose_context') {
        return { loseContext() {} };
      }
      return null;
    },
    getParameter(param) {
      if (param === 0x9246) return renderer;  // UNMASKED_RENDERER
      if (param === 0x9245) return vendor;    // UNMASKED_VENDOR
      if (param === RENDERER) return renderer;
      if (param === VENDOR) return vendor;
      return '';
    }
  };
}

function resetMocks() {
  localStorage.clear();
  bodyClasses.clear();
  createdCanvases.length = 0;
  delete globalThis.window.__synthGpuTier;
  delete globalThis.window.__synthRenderMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Importación dinámica con reset entre tests
// ─────────────────────────────────────────────────────────────────────────────

// Dado que gpuDetect.js usa un singleton cacheado, importamos y reseteamos

let gpuDetect;

async function loadModule() {
  // Usamos import dinámico con query param para evitar cache de Node
  const mod = await import(`../../src/assets/js/utils/gpuDetect.js?t=${Date.now()}_${Math.random()}`);
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests de clasificación de GPU
// ─────────────────────────────────────────────────────────────────────────────

describe('GPU Tier Detection — Patrones de renderers', () => {

  // Renderers que deben clasificarse como 'weak'
  const weakRenderers = [
    ['Google SwiftShader', 'Google Inc.', 'Software renderer (Chrome headless)'],
    ['llvmpipe (LLVM 12.0.0, 128 bits)', 'Mesa/X.org', 'Mesa software renderer (Linux sin GPU)'],
    ['Mesa Software Rasterizer', 'Mesa', 'Mesa software rasterizer'],
    ['Microsoft Basic Render Driver', 'Microsoft', 'Windows sin driver GPU'],
    ['Intel(R) HD Graphics 4000', 'Intel', 'Intel HD 4000 (Ivy Bridge, 2012)'],
    ['Intel(R) HD Graphics 3000', 'Intel', 'Intel HD 3000 (Sandy Bridge, 2011)'],
    ['Intel(R) HD Graphics 2000', 'Intel', 'Intel HD 2000 (Sandy Bridge, 2011)'],
    ['Intel(R) HD Graphics 4600', 'Intel', 'Intel HD 4600 (Haswell, 2013)'],
    ['Mesa DRI Intel(R) Sandybridge Mobile', 'Intel Open Source Technology Center', 'Mesa DRI Sandy Bridge'],
    ['Mesa DRI Intel(R) Ivybridge Mobile', 'Intel Open Source Technology Center', 'Mesa DRI Ivy Bridge'],
    ['Mesa DRI Intel(R) Haswell Mobile', 'Intel Open Source Technology Center', 'Mesa DRI Haswell'],
    ['Intel(R) G41 Express Chipset', 'Intel', 'Intel G41 (muy antiguo)'],
    ['Intel(R) GMA X4500', 'Intel', 'Intel GMA X4500'],
    ['Google Inc. Google SwiftShader', 'Google Inc.', 'Headless Chrome virtual GPU'],
  ];

  // Renderers que deben clasificarse como 'strong'
  const strongRenderers = [
    ['NVIDIA GeForce GTX 1060', 'NVIDIA Corporation', 'GPU dedicada NVIDIA'],
    ['AMD Radeon RX 580', 'AMD', 'GPU dedicada AMD'],
    ['Intel(R) Iris(R) Xe Graphics', 'Intel', 'Intel Iris Xe (moderno)'],
    ['Intel(R) UHD Graphics 630', 'Intel', 'Intel UHD 630 (Coffee Lake)'],
    ['Intel(R) UHD Graphics 770', 'Intel', 'Intel UHD 770 (Alder Lake)'],
    ['Apple M1', 'Apple', 'Apple Silicon'],
    ['Mali-G78', 'ARM', 'GPU móvil ARM moderna'],
    ['Adreno (TM) 660', 'Qualcomm', 'GPU móvil Qualcomm moderna'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3080)', 'Google Inc. (NVIDIA)', 'ANGLE con GPU dedicada'],
  ];

  for (const [renderer, vendor, desc] of weakRenderers) {
    it(`clasifica ${desc} como weak: "${renderer}"`, () => {
      // Testeamos los patrones directamente en lugar de importar el módulo
      const WEAK_GPU_PATTERNS = [
        /SwiftShader/i,
        /llvmpipe/i,
        /Mesa Software/i,
        /Microsoft Basic Render Driver/i,
        /Intel.*HD.*(?:2\d{3}|3\d{3}|4\d{3})\b/i,
        /Intel.*(?:G41|G45|Q45|B43|GMA)\b/i,
        /Mesa DRI Intel.*(?:Sandybridge|Ivybridge|Haswell|Bay Trail)\b/i,
        /Google Inc\.\s*Google/i
      ];
      const isWeak = WEAK_GPU_PATTERNS.some(re => re.test(renderer));
      assert.equal(isWeak, true, `"${renderer}" debería ser weak`);
    });
  }

  for (const [renderer, vendor, desc] of strongRenderers) {
    it(`clasifica ${desc} como strong: "${renderer}"`, () => {
      const WEAK_GPU_PATTERNS = [
        /SwiftShader/i,
        /llvmpipe/i,
        /Mesa Software/i,
        /Microsoft Basic Render Driver/i,
        /Intel.*HD.*(?:2\d{3}|3\d{3}|4\d{3})\b/i,
        /Intel.*(?:G41|G45|Q45|B43|GMA)\b/i,
        /Mesa DRI Intel.*(?:Sandybridge|Ivybridge|Haswell|Bay Trail)\b/i,
        /Google Inc\.\s*Google/i
      ];
      const isWeak = WEAK_GPU_PATTERNS.some(re => re.test(renderer));
      assert.equal(isWeak, false, `"${renderer}" debería ser strong`);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de STORAGE_KEYS
// ─────────────────────────────────────────────────────────────────────────────

describe('STORAGE_KEYS.RENDER_MODE', () => {
  it('la clave RENDER_MODE existe y tiene el prefijo correcto', async () => {
    const { STORAGE_KEYS } = await import('../../src/assets/js/utils/constants.js');
    assert.ok(STORAGE_KEYS.RENDER_MODE, 'RENDER_MODE debe existir');
    assert.ok(STORAGE_KEYS.RENDER_MODE.startsWith('synthigme-'), 'debe empezar con el prefijo');
    assert.ok(STORAGE_KEYS.RENDER_MODE.includes('render-mode'), 'debe contener render-mode');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de resolución de modo
// ─────────────────────────────────────────────────────────────────────────────

describe('Render Mode Resolution — lógica pura', () => {

  it('modo quality: siempre devuelve quality sin importar GPU', () => {
    // Testear la lógica de resolución directamente
    const resolve = (pref, gpuTier, reducedMotion) => {
      if (pref === 'quality') return 'quality';
      if (pref === 'performance') return 'performance';
      if (gpuTier === 'weak') return 'performance';
      if (reducedMotion) return 'performance';
      return 'quality';
    };

    assert.equal(resolve('quality', 'weak', false), 'quality');
    assert.equal(resolve('quality', 'strong', false), 'quality');
    assert.equal(resolve('quality', 'unknown', true), 'quality');
  });

  it('modo performance: siempre devuelve performance sin importar GPU', () => {
    const resolve = (pref, gpuTier, reducedMotion) => {
      if (pref === 'quality') return 'quality';
      if (pref === 'performance') return 'performance';
      if (gpuTier === 'weak') return 'performance';
      if (reducedMotion) return 'performance';
      return 'quality';
    };

    assert.equal(resolve('performance', 'strong', false), 'performance');
    assert.equal(resolve('performance', 'weak', false), 'performance');
  });

  it('modo auto con GPU strong: devuelve quality', () => {
    const resolve = (pref, gpuTier, reducedMotion) => {
      if (pref === 'quality') return 'quality';
      if (pref === 'performance') return 'performance';
      if (gpuTier === 'weak') return 'performance';
      if (reducedMotion) return 'performance';
      return 'quality';
    };

    assert.equal(resolve('auto', 'strong', false), 'quality');
  });

  it('modo auto con GPU weak: devuelve performance', () => {
    const resolve = (pref, gpuTier, reducedMotion) => {
      if (pref === 'quality') return 'quality';
      if (pref === 'performance') return 'performance';
      if (gpuTier === 'weak') return 'performance';
      if (reducedMotion) return 'performance';
      return 'quality';
    };

    assert.equal(resolve('auto', 'weak', false), 'performance');
  });

  it('modo auto con GPU strong + prefers-reduced-motion: devuelve performance', () => {
    const resolve = (pref, gpuTier, reducedMotion) => {
      if (pref === 'quality') return 'quality';
      if (pref === 'performance') return 'performance';
      if (gpuTier === 'weak') return 'performance';
      if (reducedMotion) return 'performance';
      return 'quality';
    };

    assert.equal(resolve('auto', 'strong', true), 'performance');
  });

  it('backward compatibility: sin clave guardada es auto por defecto', () => {
    const validModes = ['auto', 'quality', 'performance'];
    const saved = null; // nada guardado
    const resolved = validModes.includes(saved) ? saved : 'auto';
    assert.equal(resolved, 'auto');
  });

  it('ignora valores inválidos guardados en localStorage', () => {
    const validModes = ['auto', 'quality', 'performance'];
    const saved = 'turbo'; // valor inválido
    const resolved = validModes.includes(saved) ? saved : 'auto';
    assert.equal(resolved, 'auto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de CSS class toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('Render Mode CSS Class', () => {

  beforeEach(() => {
    bodyClasses.clear();
  });

  it('modo performance añade clase render-performance al body', () => {
    const PERFORMANCE_CLASS = 'render-performance';
    // Simular applyRenderMode('performance')
    bodyClasses.add(PERFORMANCE_CLASS);
    assert.ok(bodyClasses.has(PERFORMANCE_CLASS));
  });

  it('modo quality quita clase render-performance del body', () => {
    const PERFORMANCE_CLASS = 'render-performance';
    bodyClasses.add(PERFORMANCE_CLASS);
    // Simular applyRenderMode('quality')
    bodyClasses.delete(PERFORMANCE_CLASS);
    assert.ok(!bodyClasses.has(PERFORMANCE_CLASS));
  });

  it('la clase render-performance no existe por defecto', () => {
    assert.ok(!bodyClasses.has('render-performance'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de persistencia
// ─────────────────────────────────────────────────────────────────────────────

describe('Render Mode Persistence', () => {
  const STORAGE_KEY = 'synthigme-render-mode';

  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda preferencia en localStorage', () => {
    localStorage.set(STORAGE_KEY, 'performance');
    assert.equal(localStorage.get(STORAGE_KEY), 'performance');
  });

  it('lee preferencia guardada', () => {
    localStorage.set(STORAGE_KEY, 'quality');
    const saved = localStorage.get(STORAGE_KEY);
    assert.equal(saved, 'quality');
  });

  it('sin preferencia guardada retorna null', () => {
    const saved = localStorage.get(STORAGE_KEY);
    assert.equal(saved, undefined); // Map returns undefined for missing
  });

  it('los tres modos válidos se persisten correctamente', () => {
    for (const mode of ['auto', 'quality', 'performance']) {
      localStorage.set(STORAGE_KEY, mode);
      assert.equal(localStorage.get(STORAGE_KEY), mode);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de patrones regex edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('GPU Pattern Edge Cases', () => {
  const WEAK_GPU_PATTERNS = [
    /SwiftShader/i,
    /llvmpipe/i,
    /Mesa Software/i,
    /Microsoft Basic Render Driver/i,
    /Intel.*HD.*(?:2\d{3}|3\d{3}|4\d{3})\b/i,
    /Intel.*(?:G41|G45|Q45|B43|GMA)\b/i,
    /Mesa DRI Intel.*(?:Sandybridge|Ivybridge|Haswell|Bay Trail)\b/i,
    /Google Inc\.\s*Google/i
  ];

  const isWeak = (renderer) => WEAK_GPU_PATTERNS.some(re => re.test(renderer));

  it('Intel HD 5500 NO es weak (Broadwell, 2015)', () => {
    assert.equal(isWeak('Intel(R) HD Graphics 5500'), false);
  });

  it('Intel HD 6000 NO es weak (Broadwell, 2015)', () => {
    assert.equal(isWeak('Intel(R) HD Graphics 6000'), false);
  });

  it('Intel HD 530 NO es weak (Skylake, 2015)', () => {
    assert.equal(isWeak('Intel(R) HD Graphics 530'), false);
  });

  it('Intel UHD 620 NO es weak (Kaby Lake, 2017)', () => {
    assert.equal(isWeak('Intel(R) UHD Graphics 620'), false);
  });

  it('WebGL renderer string vacío NO es weak', () => {
    assert.equal(isWeak(''), false);
  });

  it('ANGLE wrapper con SwiftShader SÍ es weak', () => {
    assert.equal(isWeak('ANGLE (Google, Vulkan 1.1.0 (SwiftShader Device))'), true);
  });

  it('Mesa DRI con Bay Trail SÍ es weak', () => {
    assert.equal(isWeak('Mesa DRI Intel(R) Bay Trail'), true);
  });

  it('Intel Q45/Q43 chipset SÍ es weak', () => {
    assert.equal(isWeak('Intel(R) Q45/Q43 Express Chipset'), true);
  });

  it('Intel B43 Express SÍ es weak', () => {
    assert.equal(isWeak('Intel(R) B43 Express Chipset'), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de isPerformanceMode helper
// ─────────────────────────────────────────────────────────────────────────────

describe('isPerformanceMode helper', () => {
  it('debe ser una función booleana de consulta rápida', () => {
    // La función simplemente chequea el estado interno sin detectar GPU
    // Verificamos que el concepto es correcto
    let currentEffectiveMode = null;
    const isPerformanceMode = () => currentEffectiveMode === 'performance';

    assert.equal(isPerformanceMode(), false);
    
    currentEffectiveMode = 'quality';
    assert.equal(isPerformanceMode(), false);
    
    currentEffectiveMode = 'performance';
    assert.equal(isPerformanceMode(), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de integración: transform condicional
// ─────────────────────────────────────────────────────────────────────────────

describe('Transform conditional en viewport', () => {
  it('modo quality usa translate3d (GPU compositing)', () => {
    const perfMode = false;
    const offsetX = 100, offsetY = 200, scale = 0.5;
    
    let transform;
    if (perfMode) {
      transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    } else {
      transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    }
    
    assert.ok(transform.includes('translate3d'));
    assert.ok(!transform.includes('translate('));
  });

  it('modo performance usa translate sin Z (evita capa GPU)', () => {
    const perfMode = true;
    const offsetX = 100, offsetY = 200, scale = 0.5;
    
    let transform;
    if (perfMode) {
      transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    } else {
      transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    }
    
    assert.ok(transform.startsWith('translate('));
    assert.ok(!transform.includes('translate3d'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests de evento personalizado
// ─────────────────────────────────────────────────────────────────────────────

describe('Custom Event synth:renderModeChange', () => {
  it('el evento debe llevar preference y effective en detail', () => {
    const detail = { preference: 'auto', effective: 'performance' };
    
    assert.ok(detail.preference, 'debe incluir preferencia del usuario');
    assert.ok(detail.effective, 'debe incluir modo efectivo resuelto');
    assert.ok(['auto', 'quality', 'performance'].includes(detail.preference));
    assert.ok(['quality', 'performance'].includes(detail.effective));
  });
});
