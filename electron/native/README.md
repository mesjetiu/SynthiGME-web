# PipeWire Audio Native Addon

Addon nativo de C++ para salida de audio multicanal (8 canales) en Linux usando libpipewire directamente.

## Estado: EN DESARROLLO 🚧

Este addon es funcional y con latencia aceptable para uso en tiempo real.

### ✅ Funcionando
- Compilación con node-gyp
- Stream de 8 canales independientes
- Visible en qpwgraph como "SynthiGME" con puertos AUX0-AUX7
- Integración con Electron via IPC
- Ring buffer interno (16384 frames = ~340ms) para absorber chunks grandes
- Métricas de latencia en tiempo real (bufferedFrames)
- **Latencia actual: ~170-340ms** (depende del ScriptProcessor)

### 🔧 Pendiente de optimizar
- Reducir buffer del ScriptProcessor de 8192 a 2048 frames
- Posible migración a AudioWorklet para menor latencia
- Investigar latencia mínima viable sin underflows

### 📋 Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron                             │
│  ┌──────────────────┐      ┌────────────────────────────┐  │
│  │   Web Audio      │ IPC  │   Addon Nativo (C++)       │  │
│  │   (renderer)     │─────▶│   - N-API binding          │  │
│  │                  │      │   - libpipewire stream     │  │
│  │  ScriptProcessor │      │   - Ring buffer interno    │  │
│  │  8ch capture     │      │   - 8 canales AUX0-AUX7    │  │
│  └──────────────────┘      └────────────────────────────┘  │
│                                       │                     │
└───────────────────────────────────────┼─────────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │    PipeWire      │
                              │  (qpwgraph)      │
                              │                  │
                              │  ┌────────────┐  │
                              │  │ SynthiGME  │  │
                              │  │  AUX0-7    │  │
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
[PwStream] Started: SynthiGME (8ch @ 48000Hz)
[PwStream] State: paused
[PwStream] State: streaming
[PwStream] Stopped. Underflows: 0
```

### 🔗 Referencias

- [PipeWire Documentation](https://docs.pipewire.org/)
- [Node-API (N-API)](https://nodejs.org/api/n-api.html)
- [node-addon-api](https://github.com/nodejs/node-addon-api)
