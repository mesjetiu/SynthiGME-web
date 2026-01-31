# ⚠️ ARCHIVO HISTÓRICO - Investigación: Salida Multicanal en SynthiGME

> **Este documento es histórico.** La investigación documentada aquí llevó a la implementación actual.
> 
> Para documentación actualizada del sistema multicanal, ver:
> - **[MULTICHANNEL.md](MULTICHANNEL.md)** - Guía de uso y configuración
> - **[electron/native/README.md](electron/native/README.md)** - Detalles del addon nativo

---

## Contexto del Problema (Resuelto)

SynthiGME necesita soportar 8 salidas de audio independientes que correspondan a las 8 salidas de la matriz del sintetizador, ruteables a hardware multicanal.

### Limitación Principal

**Chromium (Chrome, Edge, Electron) limita `AudioContext.destination.maxChannelCount` a 2**, incluso cuando el hardware soporta más canales. Esto es una decisión de seguridad/privacidad del navegador, no una limitación real del hardware.

Referencia: https://bugs.chromium.org/p/chromium/issues/detail?id=960958

## Enfoques Experimentados

### 1. Web Audio API Nativa (DESCARTADO)

**Intento**: Usar `destination.channelCount` y `maxChannelCount` para detectar y usar >2 canales.

**Resultado**: Chromium siempre reporta 2 canales máximo.

### 2. pw-cat via spawn (DESCARTADO - Latencia)

**Intento**: Usar `pw-cat` (PipeWire) para escribir audio multicanal desde Electron.

**Código**: `experiments/portaudio-multichannel/multichannel-test.mjs`

**Resultado**: 
- ✅ Funciona: Se crean 8 puertos visibles en qpwgraph
- ❌ Latencia inaceptable: 20-30 segundos

### 3. naudiodon/PortAudio via JACK (PARCIAL)

**Intento**: Usar naudiodon (bindings de PortAudio para Node.js) con backend JACK.

**Problema**: JACK solo expone 2 canales en dispositivos estéreo. Para tener 8 canales JACK, hay que crear un sink PulseAudio de 8 canales.

**Resultado**:
- ✅ Se crea sink de 8 canales
- ✅ PortAudio via JACK crea nodo con 8 puertos
- ❌ **Duplicación**: Dos nodos en qpwgraph (PortAudio + SynthiGME sink)
- ❌ Audio no ruteado correctamente

### 4. naudiodon/PortAudio via ALSA pulse (PARCIAL)

**Intento**: Usar dispositivo ALSA `pulse` que conecta al sink PulseAudio.

**Resultado**:
- ✅ Se crea sink de 8 canales
- ✅ ALSA plug-in conecta al sink
- ✅ 8 puertos `monitor_*` visibles en qpwgraph
- ❌ Audio no llega a los monitores

### 5. ALSA directo (pipewire device) (DESCARTADO)

**Intento**: Usar dispositivo ALSA "pipewire" directamente sin sink.

**Resultado**:
- ✅ Reporta 64 canales disponibles
- ❌ **No crea puertos visibles** en qpwgraph
- ❌ Audio va directo al hardware sin posibilidad de ruteo

## Arquitectura de Audio en Linux

```
┌─────────────────┐      ┌─────────────────┐      ┌──────────────┐
│  Aplicación     │      │    PipeWire     │      │   Hardware   │
│  (SynthiGME)    │─────▶│   (JACK/Pulse)  │─────▶│   (ALSA)     │
└─────────────────┘      └─────────────────┘      └──────────────┘
                                 │
                          ┌──────┴──────┐
                          │  qpwgraph   │
                          │  (routing)  │
                          └─────────────┘
```

Para que los puertos sean ruteables en qpwgraph, la aplicación debe:
1. Usar API JACK (crea puertos visibles), o
2. Usar PulseAudio API (crea nodo en el grafo)

ALSA directo **no crea nodos visibles** en PipeWire.

## Solución Propuesta: Forzar 8 Canales en Web Audio

En lugar de usar native modules, la solución más limpia es:

1. **Forzar 8 canales en el AudioEngine** ignorando `maxChannelCount`
2. El navegador mezclará los 8 canales a los 2 disponibles (o más si el hardware lo soporta)
3. **Para ruteo externo**: Usar la grabación multitrack existente o un bridge opcional

### Implementación

1. En `engine.js`: Añadir opción `forceChannelCount: 8`
2. En `audioSettingsModal.js`: Mostrar siempre 8 canales de salida
3. El routing lógico funciona dentro de Web Audio
4. Para salida física >2ch: Documentar uso con JACK/PipeWire externo

## Archivos de Referencia

### Experimentos
- `experiments/portaudio-multichannel/` - Tests con naudiodon

### Código Relevante
- `src/assets/js/core/engine.js` - AudioEngine con masterGains[]
- `src/assets/js/ui/audioSettingsModal.js` - Modal de ajustes
- `electron/multichannelBridge.cjs` - Bridge para Electron (experimental)

## Conclusión

La Web Audio API está diseñada para entregar audio al sistema operativo, no para routing fino. Para verdadero multicanal hardware:

1. **PWA/Web**: Limitado a lo que el navegador exponga (normalmente 2ch)
2. **Electron**: Posible via native modules, pero complejo
3. **Mejor enfoque**: Implementar 8 canales lógicos que siempre están disponibles

El sistema ya tiene la infraestructura para 8 salidas lógicas (`outputBuses[]`). Solo hay que desacoplar la detección de `maxChannelCount` de la creación de canales.
