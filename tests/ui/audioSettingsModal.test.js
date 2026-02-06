/**
 * Tests para ui/audioSettingsModal.js
 * 
 * Verifica el funcionamiento del modal de configuración de audio:
 * - Sección de latencia (Web Audio + Multicanal)
 * - Cálculo de latencia total
 * - Visibilidad condicional de opciones multicanal
 * - Persistencia en localStorage
 * 
 * NOTA: Estos tests verifican la lógica de latencia de forma aislada,
 * sin importar el módulo completo debido a las dependencias DOM del navegador.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS MÍNIMOS (solo localStorage para tests de persistencia)
// ═══════════════════════════════════════════════════════════════════════════

// Mock de localStorage si no existe
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] ?? null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; }
  };
}

// Fallback para clear si no existe (en ciertos ambientes)
const clearLocalStorage = () => {
  if (globalThis.localStorage.clear) {
    globalThis.localStorage.clear();
  } else if (globalThis.localStorage._data) {
    globalThis.localStorage._data = {};
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

import { STORAGE_KEYS } from '../../src/assets/js/utils/constants.js';

// No podemos importar AudioSettingsModal directamente por dependencias DOM complejas
// pero podemos testear la lógica de latencia de forma aislada

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE LÓGICA DE LATENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Lógica de latencia de audio', () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  afterEach(() => {
    clearLocalStorage();
  });

  describe('Mapeo de latencia Web Audio', () => {
    // Replica la lógica de _getWebAudioLatencyMs
    const getWebAudioLatencyMs = (mode) => {
      const latencyMap = {
        'interactive': 10,
        'balanced': 25,
        'playback': 50,
        '0.1': 100,
        '0.2': 200
      };
      return latencyMap[mode] || 25;
    };

    it('interactive = ~10ms', () => {
      assert.strictEqual(getWebAudioLatencyMs('interactive'), 10);
    });

    it('balanced = ~25ms', () => {
      assert.strictEqual(getWebAudioLatencyMs('balanced'), 25);
    });

    it('playback = ~50ms', () => {
      assert.strictEqual(getWebAudioLatencyMs('playback'), 50);
    });

    it('0.1 (safe) = ~100ms', () => {
      assert.strictEqual(getWebAudioLatencyMs('0.1'), 100);
    });

    it('0.2 (maximum) = ~200ms', () => {
      assert.strictEqual(getWebAudioLatencyMs('0.2'), 200);
    });

    it('valor desconocido devuelve balanced (25ms)', () => {
      assert.strictEqual(getWebAudioLatencyMs('unknown'), 25);
      assert.strictEqual(getWebAudioLatencyMs(''), 25);
      assert.strictEqual(getWebAudioLatencyMs(null), 25);
    });
  });

  describe('Cálculo de latencia total', () => {
    // Replica la lógica de _updateTotalLatency
    const calculateTotalLatency = (webAudioMs, multichannelMs, isMultichannel) => {
      return webAudioMs + (isMultichannel ? multichannelMs : 0);
    };

    it('sin multicanal, solo cuenta Web Audio', () => {
      assert.strictEqual(calculateTotalLatency(25, 42, false), 25);
      assert.strictEqual(calculateTotalLatency(50, 85, false), 50);
    });

    it('con multicanal, suma ambas latencias', () => {
      assert.strictEqual(calculateTotalLatency(25, 42, true), 67);
      assert.strictEqual(calculateTotalLatency(10, 10, true), 20);
      assert.strictEqual(calculateTotalLatency(50, 85, true), 135);
    });

    it('latencia mínima posible con multicanal es ~20ms', () => {
      const minTotal = calculateTotalLatency(10, 10, true);
      assert.strictEqual(minTotal, 20);
    });

    it('latencia máxima posible con multicanal es ~370ms', () => {
      const maxTotal = calculateTotalLatency(200, 170, true);
      assert.strictEqual(maxTotal, 370);
    });
  });

  describe('Clasificación de latencia por colores', () => {
    // Replica la lógica de clasificación
    const getLatencyClass = (totalMs) => {
      if (totalMs <= 35) return 'latency-low';
      if (totalMs <= 75) return 'latency-medium';
      return 'latency-high';
    };

    it('≤35ms es latency-low (verde)', () => {
      assert.strictEqual(getLatencyClass(10), 'latency-low');
      assert.strictEqual(getLatencyClass(25), 'latency-low');
      assert.strictEqual(getLatencyClass(35), 'latency-low');
    });

    it('36-75ms es latency-medium (amarillo)', () => {
      assert.strictEqual(getLatencyClass(36), 'latency-medium');
      assert.strictEqual(getLatencyClass(50), 'latency-medium');
      assert.strictEqual(getLatencyClass(75), 'latency-medium');
    });

    it('>75ms es latency-high (naranja)', () => {
      assert.strictEqual(getLatencyClass(76), 'latency-high');
      assert.strictEqual(getLatencyClass(100), 'latency-high');
      assert.strictEqual(getLatencyClass(200), 'latency-high');
    });
  });

  describe('Persistencia de configuración', () => {
    it('LATENCY_MODE se guarda en localStorage', () => {
      localStorage.setItem(STORAGE_KEYS.LATENCY_MODE, 'interactive');
      assert.strictEqual(
        localStorage.getItem(STORAGE_KEYS.LATENCY_MODE),
        'interactive'
      );
    });

    it('AUDIO_LATENCY se guarda en localStorage', () => {
      localStorage.setItem(STORAGE_KEYS.AUDIO_LATENCY, '85');
      assert.strictEqual(
        localStorage.getItem(STORAGE_KEYS.AUDIO_LATENCY),
        '85'
      );
    });

    it('valor por defecto de Web Audio es balanced', () => {
      const saved = localStorage.getItem(STORAGE_KEYS.LATENCY_MODE);
      const mode = saved || 'balanced';
      assert.strictEqual(mode, 'balanced');
    });

    it('valor por defecto de Multicanal es 42ms', () => {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIO_LATENCY);
      const latency = saved ? parseInt(saved, 10) : 42;
      assert.strictEqual(latency, 42);
    });
  });

  describe('Visibilidad de multicanal', () => {
    // Replica la lógica de _updateLatencyVisibility
    const shouldShowMultichannel = (deviceId) => {
      return deviceId === 'multichannel-12ch';
    };

    it('visible con multichannel-12ch', () => {
      assert.strictEqual(shouldShowMultichannel('multichannel-12ch'), true);
    });

    it('oculto con default', () => {
      assert.strictEqual(shouldShowMultichannel('default'), false);
    });

    it('oculto con dispositivo específico', () => {
      assert.strictEqual(
        shouldShowMultichannel('some-audio-device-id'),
        false
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE OPCIONES DE LATENCIA
// ═══════════════════════════════════════════════════════════════════════════

describe('Opciones de latencia', () => {
  describe('Opciones de Web Audio', () => {
    const webAudioOptions = [
      { value: 'interactive', ms: 10 },
      { value: 'balanced', ms: 25 },
      { value: 'playback', ms: 50 },
      { value: '0.1', ms: 100 },
      { value: '0.2', ms: 200 }
    ];

    it('hay 5 opciones de Web Audio', () => {
      assert.strictEqual(webAudioOptions.length, 5);
    });

    it('las opciones están ordenadas de menor a mayor latencia', () => {
      for (let i = 1; i < webAudioOptions.length; i++) {
        assert.ok(
          webAudioOptions[i].ms > webAudioOptions[i - 1].ms,
          `${webAudioOptions[i].value} debería tener más latencia que ${webAudioOptions[i - 1].value}`
        );
      }
    });

    it('interactive es la de menor latencia', () => {
      const min = Math.min(...webAudioOptions.map(o => o.ms));
      const interactive = webAudioOptions.find(o => o.value === 'interactive');
      assert.strictEqual(interactive.ms, min);
    });
  });

  describe('Opciones de Multicanal', () => {
    const multichannelOptions = [
      { value: 10, label: 'muy baja' },
      { value: 21, label: 'baja' },
      { value: 42, label: 'normal' },
      { value: 85, label: 'alta' },
      { value: 170, label: 'muy alta' }
    ];

    it('hay 5 opciones de Multicanal', () => {
      assert.strictEqual(multichannelOptions.length, 5);
    });

    it('las opciones están ordenadas de menor a mayor', () => {
      for (let i = 1; i < multichannelOptions.length; i++) {
        assert.ok(
          multichannelOptions[i].value > multichannelOptions[i - 1].value,
          'Las opciones deberían estar ordenadas'
        );
      }
    });

    it('42ms es el valor recomendado (normal)', () => {
      const normal = multichannelOptions.find(o => o.label === 'normal');
      assert.strictEqual(normal.value, 42);
    });

    it('valores corresponden a frames de audio a 48kHz', () => {
      const sampleRate = 48000;
      // 10ms ≈ 480 frames, 21ms ≈ 1008 frames, 42ms ≈ 2016 frames
      multichannelOptions.forEach(opt => {
        const frames = Math.round(opt.value * sampleRate / 1000);
        assert.ok(
          frames > 0 && frames < sampleRate,
          `${opt.value}ms debería corresponder a frames válidos`
        );
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE STORAGE KEYS
// ═══════════════════════════════════════════════════════════════════════════

describe('STORAGE_KEYS de latencia', () => {
  it('LATENCY_MODE está definido', () => {
    assert.ok('LATENCY_MODE' in STORAGE_KEYS);
  });

  it('AUDIO_LATENCY está definido', () => {
    assert.ok('AUDIO_LATENCY' in STORAGE_KEYS);
  });

  it('LATENCY_MODE usa el prefijo correcto', () => {
    assert.ok(STORAGE_KEYS.LATENCY_MODE.startsWith('synthigme-'));
  });

  it('AUDIO_LATENCY usa el prefijo correcto', () => {
    assert.ok(STORAGE_KEYS.AUDIO_LATENCY.startsWith('synthigme-'));
  });

  it('LATENCY_MODE y AUDIO_LATENCY son diferentes', () => {
    assert.notStrictEqual(
      STORAGE_KEYS.LATENCY_MODE,
      STORAGE_KEYS.AUDIO_LATENCY
    );
  });
});
// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE ROUTING DE SALIDA
// ═══════════════════════════════════════════════════════════════════════════

describe('Routing de salida - Lógica aislada', () => {
  const OUTPUT_COUNT = 8;
  
  /**
   * Replica la lógica de _getDefaultRouting del modal.
   * @param {string} outputMode - 'stereo' o 'multichannel'
   * @param {number} physicalChannels - Número de canales físicos
   */
  const getDefaultRouting = (outputMode, physicalChannels) => {
    const isMultichannel = outputMode === 'multichannel';
    
    return Array.from({ length: OUTPUT_COUNT }, (_, busIdx) => 
      Array.from({ length: physicalChannels }, (_, chIdx) => {
        if (isMultichannel) {
          // Multicanal: diagonal Out 1-8 → canales 5-12 (índices 4-11)
          return chIdx === (busIdx + 4);
        } else {
          // Estéreo: todo OFF (el audio va por stereo buses)
          return false;
        }
      })
    );
  };

  describe('Defaults en modo estéreo', () => {
    it('todos los outputs están en OFF', () => {
      const routing = getDefaultRouting('stereo', 2);
      
      // Verificar que todos los valores son false
      routing.forEach((bus, busIdx) => {
        bus.forEach((value, chIdx) => {
          assert.strictEqual(value, false, `Out ${busIdx + 1} → Ch ${chIdx + 1} debería ser OFF`);
        });
      });
    });

    it('genera array de 8 buses x 2 canales', () => {
      const routing = getDefaultRouting('stereo', 2);
      assert.strictEqual(routing.length, 8);
      routing.forEach(bus => {
        assert.strictEqual(bus.length, 2);
      });
    });
  });

  describe('Defaults en modo multicanal', () => {
    it('diagonal: Out 1→Ch5, Out 2→Ch6, etc.', () => {
      const routing = getDefaultRouting('multichannel', 12);
      
      // Verificar diagonal desplazada
      for (let busIdx = 0; busIdx < OUTPUT_COUNT; busIdx++) {
        for (let chIdx = 0; chIdx < 12; chIdx++) {
          const expected = chIdx === (busIdx + 4);
          assert.strictEqual(
            routing[busIdx][chIdx], 
            expected, 
            `Out ${busIdx + 1} → Ch ${chIdx + 1} debería ser ${expected}`
          );
        }
      }
    });

    it('genera array de 8 buses x 12 canales', () => {
      const routing = getDefaultRouting('multichannel', 12);
      assert.strictEqual(routing.length, 8);
      routing.forEach(bus => {
        assert.strictEqual(bus.length, 12);
      });
    });

    it('canales 1-4 están en OFF (reservados para stereo buses)', () => {
      const routing = getDefaultRouting('multichannel', 12);
      
      routing.forEach((bus, busIdx) => {
        for (let chIdx = 0; chIdx < 4; chIdx++) {
          assert.strictEqual(
            bus[chIdx], 
            false, 
            `Out ${busIdx + 1} → Ch ${chIdx + 1} debería ser OFF`
          );
        }
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE STEREO BUS ROUTING
// ═══════════════════════════════════════════════════════════════════════════

describe('Stereo Bus Routing - Lógica aislada', () => {
  /**
   * Replica la lógica de _getDefaultStereoBusRouting del modal.
   * @param {string} outputMode - 'stereo' o 'multichannel'
   */
  const getDefaultStereoBusRouting = (outputMode) => {
    if (outputMode === 'multichannel') {
      return {
        A: [0, 1],  // Pan 1-4 → canales 1, 2 (índices 0, 1)
        B: [2, 3]   // Pan 5-8 → canales 3, 4 (índices 2, 3)
      };
    } else {
      return {
        A: [0, 1],  // Pan 1-4 → L, R
        B: [0, 1]   // Pan 5-8 → L, R
      };
    }
  };

  describe('Defaults en modo estéreo', () => {
    it('ambos buses van a L/R (canales 0,1)', () => {
      const routing = getDefaultStereoBusRouting('stereo');
      
      assert.deepStrictEqual(routing.A, [0, 1]);
      assert.deepStrictEqual(routing.B, [0, 1]);
    });

    it('Pan 1-4 y Pan 5-8 comparten los mismos canales', () => {
      const routing = getDefaultStereoBusRouting('stereo');
      
      assert.strictEqual(routing.A[0], routing.B[0]);
      assert.strictEqual(routing.A[1], routing.B[1]);
    });
  });

  describe('Defaults en modo multicanal', () => {
    it('Pan 1-4 → canales 1,2 (índices 0,1)', () => {
      const routing = getDefaultStereoBusRouting('multichannel');
      
      assert.deepStrictEqual(routing.A, [0, 1]);
    });

    it('Pan 5-8 → canales 3,4 (índices 2,3)', () => {
      const routing = getDefaultStereoBusRouting('multichannel');
      
      assert.deepStrictEqual(routing.B, [2, 3]);
    });

    it('buses A y B usan canales diferentes (diagonal)', () => {
      const routing = getDefaultStereoBusRouting('multichannel');
      
      // No deben compartir canales
      const channelsA = new Set(routing.A);
      const channelsB = new Set(routing.B);
      
      for (const ch of channelsB) {
        assert.ok(!channelsA.has(ch), `Canal ${ch} no debería estar en ambos buses`);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE STORAGE KEYS DE ROUTING
// ═══════════════════════════════════════════════════════════════════════════

describe('STORAGE_KEYS de routing', () => {
  describe('Output routing', () => {
    it('AUDIO_ROUTING está definido', () => {
      assert.ok('AUDIO_ROUTING' in STORAGE_KEYS);
    });

    it('AUDIO_ROUTING_MULTICHANNEL está definido', () => {
      assert.ok('AUDIO_ROUTING_MULTICHANNEL' in STORAGE_KEYS);
    });

    it('claves de routing son diferentes', () => {
      assert.notStrictEqual(
        STORAGE_KEYS.AUDIO_ROUTING,
        STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL
      );
    });

    it('ambas usan el prefijo correcto', () => {
      assert.ok(STORAGE_KEYS.AUDIO_ROUTING.startsWith('synthigme-'));
      assert.ok(STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL.startsWith('synthigme-'));
    });
  });

  describe('Stereo bus routing', () => {
    it('STEREO_BUS_ROUTING está definido', () => {
      assert.ok('STEREO_BUS_ROUTING' in STORAGE_KEYS);
    });

    it('STEREO_BUS_ROUTING_MULTICHANNEL está definido', () => {
      assert.ok('STEREO_BUS_ROUTING_MULTICHANNEL' in STORAGE_KEYS);
    });

    it('claves de stereo bus son diferentes', () => {
      assert.notStrictEqual(
        STORAGE_KEYS.STEREO_BUS_ROUTING,
        STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL
      );
    });

    it('ambas usan el prefijo correcto', () => {
      assert.ok(STORAGE_KEYS.STEREO_BUS_ROUTING.startsWith('synthigme-'));
      assert.ok(STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL.startsWith('synthigme-'));
    });
  });

  describe('Lógica de selección de clave', () => {
    /**
     * Replica la lógica de _getRoutingStorageKey
     */
    const getRoutingStorageKey = (outputMode) => {
      return outputMode === 'multichannel' 
        ? STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL 
        : STORAGE_KEYS.AUDIO_ROUTING;
    };

    /**
     * Replica la lógica de _getStereoBusRoutingStorageKey
     */
    const getStereoBusRoutingStorageKey = (outputMode) => {
      return outputMode === 'multichannel'
        ? STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL
        : STORAGE_KEYS.STEREO_BUS_ROUTING;
    };

    it('modo stereo usa AUDIO_ROUTING', () => {
      assert.strictEqual(
        getRoutingStorageKey('stereo'),
        STORAGE_KEYS.AUDIO_ROUTING
      );
    });

    it('modo multichannel usa AUDIO_ROUTING_MULTICHANNEL', () => {
      assert.strictEqual(
        getRoutingStorageKey('multichannel'),
        STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL
      );
    });

    it('modo stereo usa STEREO_BUS_ROUTING', () => {
      assert.strictEqual(
        getStereoBusRoutingStorageKey('stereo'),
        STORAGE_KEYS.STEREO_BUS_ROUTING
      );
    });

    it('modo multichannel usa STEREO_BUS_ROUTING_MULTICHANNEL', () => {
      assert.strictEqual(
        getStereoBusRoutingStorageKey('multichannel'),
        STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE AISLAMIENTO DE MODOS
// ═══════════════════════════════════════════════════════════════════════════

describe('Aislamiento de routing entre modos', () => {
  beforeEach(() => {
    clearLocalStorage();
  });

  afterEach(() => {
    clearLocalStorage();
  });

  describe('Persistencia independiente', () => {
    it('guardar en stereo no afecta a multichannel', () => {
      // Simular guardar routing en modo estéreo
      const stereoRouting = [[true, false], [false, true]];
      localStorage.setItem(STORAGE_KEYS.AUDIO_ROUTING, JSON.stringify(stereoRouting));
      
      // Verificar que multichannel sigue vacío
      const multichannel = localStorage.getItem(STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL);
      assert.strictEqual(multichannel, null);
    });

    it('guardar en multichannel no afecta a stereo', () => {
      // Simular guardar routing en modo multicanal
      const mcRouting = [[false, false, false, false, true]];
      localStorage.setItem(STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL, JSON.stringify(mcRouting));
      
      // Verificar que stereo sigue vacío
      const stereo = localStorage.getItem(STORAGE_KEYS.AUDIO_ROUTING);
      assert.strictEqual(stereo, null);
    });

    it('ambos modos pueden tener datos simultáneamente', () => {
      const stereoRouting = [[true, true]];
      const mcRouting = [[false, false, false, false, true, false, false, false, false, false, false, false]];
      
      localStorage.setItem(STORAGE_KEYS.AUDIO_ROUTING, JSON.stringify(stereoRouting));
      localStorage.setItem(STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL, JSON.stringify(mcRouting));
      
      const loadedStereo = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIO_ROUTING));
      const loadedMc = JSON.parse(localStorage.getItem(STORAGE_KEYS.AUDIO_ROUTING_MULTICHANNEL));
      
      assert.deepStrictEqual(loadedStereo, stereoRouting);
      assert.deepStrictEqual(loadedMc, mcRouting);
    });
  });

  describe('Stereo bus routing independiente', () => {
    it('guardar en stereo no afecta a multichannel', () => {
      const stereoSB = { A: [0, 1], B: [0, 1] };
      localStorage.setItem(STORAGE_KEYS.STEREO_BUS_ROUTING, JSON.stringify(stereoSB));
      
      const multichannel = localStorage.getItem(STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL);
      assert.strictEqual(multichannel, null);
    });

    it('cada modo puede tener configuración diferente de stereo buses', () => {
      const stereoSB = { A: [0, 1], B: [0, 1] };  // Ambos a L/R
      const mcSB = { A: [0, 1], B: [2, 3] };      // Diagonal
      
      localStorage.setItem(STORAGE_KEYS.STEREO_BUS_ROUTING, JSON.stringify(stereoSB));
      localStorage.setItem(STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL, JSON.stringify(mcSB));
      
      const loadedStereo = JSON.parse(localStorage.getItem(STORAGE_KEYS.STEREO_BUS_ROUTING));
      const loadedMc = JSON.parse(localStorage.getItem(STORAGE_KEYS.STEREO_BUS_ROUTING_MULTICHANNEL));
      
      // Verificar que son diferentes
      assert.notDeepStrictEqual(loadedStereo.B, loadedMc.B);
      
      // Verificar valores específicos
      assert.deepStrictEqual(loadedStereo.B, [0, 1]);
      assert.deepStrictEqual(loadedMc.B, [2, 3]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE REDIMENSIONAMIENTO DE ARRAYS
// ═══════════════════════════════════════════════════════════════════════════

describe('Redimensionamiento de arrays de routing', () => {
  const OUTPUT_COUNT = 8;
  
  /**
   * Replica la lógica de _resizeRoutingArrays
   * Si hay datos existentes, los preserva. Si no, usa defaults.
   */
  const resizeRoutingArrays = (existingRouting, channelCount, outputMode) => {
    const isMultichannel = channelCount >= 12;
    
    return Array.from({ length: OUTPUT_COUNT }, (_, busIdx) => {
      const existingBus = existingRouting?.[busIdx];
      
      if (existingBus && existingBus.length > 0) {
        // Preservar datos existentes, expandir/recortar
        return Array.from({ length: channelCount }, (_, chIdx) => {
          if (chIdx < existingBus.length) {
            return existingBus[chIdx] === true;
          }
          return false;
        });
      } else {
        // Default: diagonal para multicanal, todo OFF para estéreo
        return Array.from({ length: channelCount }, (_, chIdx) => {
          if (isMultichannel) {
            return chIdx === (busIdx + 4);
          }
          return false;
        });
      }
    });
  };

  it('expande de 2 a 12 canales preservando datos', () => {
    const existing = [
      [true, false],  // Out 1 → L
      [false, true],  // Out 2 → R
    ];
    
    const resized = resizeRoutingArrays(existing, 12, 'multichannel');
    
    // Verificar que los primeros 2 canales se preservan
    assert.strictEqual(resized[0][0], true);
    assert.strictEqual(resized[0][1], false);
    assert.strictEqual(resized[1][0], false);
    assert.strictEqual(resized[1][1], true);
    
    // Canales nuevos deben ser false
    for (let ch = 2; ch < 12; ch++) {
      assert.strictEqual(resized[0][ch], false);
      assert.strictEqual(resized[1][ch], false);
    }
  });

  it('recorta de 12 a 2 canales preservando datos', () => {
    const existing = [
      [false, false, false, false, true, false, false, false, false, false, false, false], // Out 1 → Ch5
    ];
    
    const resized = resizeRoutingArrays(existing, 2, 'stereo');
    
    // Solo quedan 2 canales
    assert.strictEqual(resized[0].length, 2);
    assert.strictEqual(resized[0][0], false);
    assert.strictEqual(resized[0][1], false);
  });

  it('sin datos existentes usa defaults para multicanal', () => {
    const resized = resizeRoutingArrays(null, 12, 'multichannel');
    
    // Verificar diagonal
    assert.strictEqual(resized[0][4], true);  // Out 1 → Ch5
    assert.strictEqual(resized[1][5], true);  // Out 2 → Ch6
    assert.strictEqual(resized[7][11], true); // Out 8 → Ch12
  });

  it('sin datos existentes usa defaults para estéreo', () => {
    const resized = resizeRoutingArrays(null, 2, 'stereo');
    
    // Todo OFF en estéreo
    resized.forEach(bus => {
      bus.forEach(value => {
        assert.strictEqual(value, false);
      });
    });
  });
});