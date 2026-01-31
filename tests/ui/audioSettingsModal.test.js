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
      return deviceId === 'multichannel-8ch';
    };

    it('visible con multichannel-8ch', () => {
      assert.strictEqual(shouldShowMultichannel('multichannel-8ch'), true);
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
