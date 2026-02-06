# PipeWire Audio Native Addon

Addon nativo de C++ para salida de audio multicanal (8 canales) en Linux usando libpipewire directamente.

## Estado: ✅ FUNCIONAL

Este addon está en producción y soporta audio multicanal en tiempo real con latencia configurable.

### ✅ Implementado
- Compilación con node-gyp
- Stream de 12 canales independientes
- Visible en qpwgraph como "SynthiGME" con puertos Pan_1-4_L/R, Pan_5-8_L/R, Out_1-8
- Integración con Electron via API directa (no IPC)
- **SharedArrayBuffer lock-free** para comunicación AudioWorklet ↔ C++
- Ring buffer configurable (8192 frames por defecto)
- Latencia configurable: 10-170ms
- Prebuffer automático antes de iniciar playback

### 📋 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron                                 │
│  ┌──────────────────┐      ┌─────────────────────────────────┐  │
│  │   Web Audio      │      │   Addon Nativo (C++)            │  │
│  │   (renderer)     │      │                                 │  │
│  │                  │ SAB  │   SharedArrayBuffer (lock-free) │  │
│  │  AudioWorklet    │─────▶│   Ring buffer interno           │  │
│  │  12ch capture    │      │   PipeWire stream               │  │
│  └──────────────────┘      └─────────────────────────────────┘  │
│                                       │                         │
└───────────────────────────────────────┼─────────────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │    PipeWire      │
                              │  (qpwgraph)      │
                              │                  │
                              │  ┌────────────┐  │
                              │  │ SynthiGME  │  │
                              │  │ Pan/Out    │  │
                              │  └────────────┘  │
                              └──────────────────┘
```

### 🔨 Compilación

Requisitos:
- Node.js >= 18
- node-gyp
- libpipewire-0.3-dev (en Arch/Manjaro: `pipewire`)
- pkg-config

```bash
cd electron/native
npm install   # Compila automáticamente
npm run build # Recompilar
```

### 📁 Archivos

```
electron/native/
├── binding.gyp          # Configuración node-gyp
├── package.json         # Dependencias (node-addon-api)
├── test.js              # Test standalone (genera tonos)
└── src/
    ├── pipewire_audio.cc  # Binding N-API → JavaScript
    ├── pw_stream.cc       # Implementación PipeWire
    └── pw_stream.h        # Header con clase PwStream
```

### 🧪 Test standalone

```bash
cd electron/native
node test.js
# Genera tonos en 8 canales durante 5 segundos
# Abrir qpwgraph para ver los puertos
```

### 📚 API JavaScript

```javascript
const { PipeWireAudio } = require('./build/Release/pipewire_audio.node');

// Crear stream
const audio = new PipeWireAudio(name, channels, sampleRate, bufferSize);

// Iniciar
audio.start();  // → boolean

// Escribir audio (Float32Array interleaved)
audio.write(float32Array);  // → frames escritos

// Propiedades
audio.isRunning;   // boolean
audio.channels;    // number
audio.sampleRate;  // number
audio.underflows;  // number

// Detener
audio.stop();
```

### 🐛 Debugging

El addon imprime mensajes de estado:
```
[PwStream] State: connecting
[PwStream] Started: SynthiGME (12ch @ 48000Hz)
[PwStream] State: paused
[PwStream] State: streaming
[PwStream] Stopped. Underflows: 0
```

### 🔗 Referencias

- [PipeWire Documentation](https://docs.pipewire.org/)
- [Node-API (N-API)](https://nodejs.org/api/n-api.html)
- [node-addon-api](https://github.com/nodejs/node-addon-api)
