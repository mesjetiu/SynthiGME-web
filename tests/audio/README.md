# Tests de Audio con Web Audio API Real

> Suite de tests que verifican el procesamiento de audio real usando `OfflineAudioContext`
> y Playwright para ejecutar en browser headless.

## Quick Start

```bash
# Ejecutar todos los tests de audio
npm run test:audio

# Ejecutar solo tests de sanity (verificación básica)
npm run test:audio -- sanity.audio.test.js

# Ejecutar con UI visual de Playwright (debug)
npm run test:audio:ui

# Ejecutar con browser visible
npm run test:audio:headed

# Ejecutar con debugger
npm run test:audio:debug
```

## Arquitectura

```
tests/audio/
├── README.md                      # Este archivo
├── harness.html                   # Página HTML que carga los worklets
├── spectralAnalysis.js            # Helpers para análisis FFT y verificación
├── testHelpers.js                 # Utilidades comunes para tests de audio
├── playwright.config.js           # Configuración específica de Playwright
│
├── worklets/                      # Tests de AudioWorklets con audio real
│   └── synthOscillator.audio.test.js
│
├── matrix/                        # Tests del sistema de pines y routing
│   └── pinRouting.audio.test.js
│
└── integration/                   # Tests de integración E2E
    └── oscillatorToOutput.audio.test.js
```

## Ejecutar Tests

```bash
# Ejecutar todos los tests de audio
npm run test:audio

# Ejecutar solo tests de worklets
npm run test:audio -- --grep="worklets"

# Ejecutar con UI de Playwright (debug visual)
npm run test:audio:ui

# Ejecutar con modo headed (ver navegador)
npm run test:audio:headed
```

## Cómo Funcionan

### 1. OfflineAudioContext

A diferencia de `AudioContext` que reproduce en tiempo real, `OfflineAudioContext`
renderiza audio lo más rápido posible en memoria:

```javascript
const offline = new OfflineAudioContext({
  numberOfChannels: 1,
  length: 44100,     // 1 segundo de audio
  sampleRate: 44100
});

// Configurar nodos de audio...
const buffer = await offline.startRendering();
const samples = buffer.getChannelData(0); // Float32Array
```

### 2. Análisis Espectral (FFT)

Para verificar frecuencias, usamos FFT sobre los samples renderizados:

```javascript
import { analyzeSpectrum, findDominantFrequency } from './spectralAnalysis.js';

const spectrum = analyzeSpectrum(samples, sampleRate);
const dominant = findDominantFrequency(spectrum);

expect(dominant.frequency).toBeCloseTo(440, 1); // ±1 Hz
```

### 3. Playwright como Test Runner

Playwright carga `harness.html` en Chromium headless, que tiene acceso completo
a la Web Audio API real incluyendo AudioWorklets:

```javascript
test('oscillator genera 440Hz', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // Este código corre en el browser con Web Audio API real
    return await window.testOscillator(440);
  });
  
  expect(result.dominantFrequency).toBeCloseTo(440, 1);
});
```

## Helpers Disponibles

### spectralAnalysis.js

| Función | Descripción |
|---------|-------------|
| `fft(samples)` | Transformada de Fourier sobre samples |
| `analyzeSpectrum(samples, sampleRate)` | Retorna array de {frequency, magnitude} |
| `findDominantFrequency(spectrum)` | Encuentra pico de frecuencia principal |
| `findHarmonics(spectrum, fundamental, count)` | Encuentra armónicos |
| `measureTHD(spectrum, fundamental)` | Total Harmonic Distortion |
| `measureNoiseFloor(spectrum)` | Nivel de ruido base |
| `verifyWaveform(samples, expected, tolerance)` | Compara forma de onda |

### testHelpers.js

| Función | Descripción |
|---------|-------------|
| `renderOscillator(config)` | Renderiza un oscilador con OfflineAudioContext |
| `renderThroughMatrix(source, pinConfig)` | Renderiza señal a través de matriz |
| `createTestBuffer(type, frequency, duration)` | Crea buffer de test |
| `measureLatency(input, output)` | Mide latencia de procesamiento |
| `compareBuffers(a, b, tolerance)` | Compara dos buffers de audio |

## Tolerancias de Verificación

| Métrica | Tolerancia | Justificación |
|---------|------------|---------------|
| Frecuencia | ±1 Hz | Precisión de FFT depende de resolución |
| Amplitud | ±0.01 | Errores de redondeo float32 |
| THD | <1% | Umbral típico de "baja distorsión" |
| Fase | ±5° | Variación aceptable en timing |
| Nivel ruido | <-60dB | Floor típico de 16-bit |

## Añadir Nuevos Tests

1. Crear archivo en el directorio apropiado (`worklets/`, `matrix/`, `integration/`)
2. Importar helpers necesarios
3. Usar `test()` de Playwright
4. Ejecutar audio en `page.evaluate()` donde tienes Web Audio API real

```javascript
import { test, expect } from '@playwright/test';

test.describe('MiNuevoModulo Audio Tests', () => {
  test('descripción del test', async ({ page }) => {
    await page.goto('/tests/audio/harness.html');
    
    const result = await page.evaluate(async () => {
      // Tu código de test con Web Audio API real
      return { /* resultados */ };
    });
    
    expect(result.valor).toBe(esperado);
  });
});
```

## Notas de Implementación

### AudioWorklets en OfflineAudioContext

Los AudioWorklets funcionan en OfflineAudioContext, pero hay que registrarlos primero:

```javascript
await offline.audioWorklet.addModule('/src/assets/js/worklets/synthOscillator.worklet.js');
const node = new AudioWorkletNode(offline, 'synth-oscillator', { ... });
```

### Precisión de FFT

La resolución de frecuencia de FFT es `sampleRate / fftSize`. Para 44100Hz y fftSize=4096:
- Resolución = 44100 / 4096 ≈ 10.77 Hz

Para mayor precisión en frecuencias bajas, usa buffers más largos o zero-padding.

### Anti-aliasing (PolyBLEP)

Los tests de anti-aliasing verifican que no hay frecuencias espurias sobre Nyquist/2.
Genera ondas de alta frecuencia y verifica que los armónicos no se pliegan.
