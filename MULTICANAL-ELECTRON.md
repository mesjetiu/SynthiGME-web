# Plan de Integración: Salida Multicanal en Electron

> **Estado**: Validado con prueba de concepto  
> **Fecha**: Enero 2026  
> **Prioridad**: Linux primero, luego Windows, después macOS

## Resumen Ejecutivo

El sintetizador Synthi 100 tiene 8 salidas de audio independientes. Actualmente, Web Audio API
(Chromium) limita la salida a 2 canales estéreo, independientemente del hardware disponible.

**Solución validada**: Usar herramientas nativas del sistema operativo (PipeWire/JACK en Linux,
WASAPI en Windows, CoreAudio en macOS) para crear streams multicanal reales.

## Compatibilidad por Plataforma

| Plataforma | Multicanal | Método | Estado |
|------------|-----------|--------|--------|
| **Electron Linux** | ✅ 8 canales | `pw-cat` / PipeWire | Validado |
| **Electron Windows** | ✅ 8 canales | naudiodon + WASAPI | Planificado |
| **Electron macOS** | ✅ 8 canales | naudiodon + CoreAudio | Planificado |
| **PWA (navegador)** | ❌ 2 canales | Web Audio API | Limitación de Chromium |
| **Web servida** | ❌ 2 canales | Web Audio API | Limitación de Chromium |

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON RENDERER                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  AudioEngine (Web Audio API)                              │ │
│  │  ├── 8 buses de salida (GainNodes existentes)             │ │
│  │  └── outputCapture.worklet.js (NUEVO)                     │ │
│  │      └── Captura samples de los 8 buses                   │ │
│  │      └── Escribe en SharedArrayBuffer (ring buffer)       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                          ↓ IPC (contextBridge)                  │
├─────────────────────────────────────────────────────────────────┤
│                     ELECTRON MAIN                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  MultichannelBridge                                       │ │
│  │  ├── Linux: spawn('pw-cat', [...])                        │ │
│  │  ├── Windows: naudiodon (WASAPI)                          │ │
│  │  └── macOS: naudiodon (CoreAudio)                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                          ↓                                      │
│              Sistema de Audio del OS                            │
│              (8 canales independientes)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Fases de Implementación

### Fase 1: Linux con PipeWire (~3-4 días)

#### 1.1 Crear MultichannelBridge para main process

```javascript
// electron/multichannelBridge.cjs
// - Detectar si pw-cat está disponible
// - Spawn proceso con 8 canales
// - Gestionar ciclo de vida del stream
```

**Archivo**: `electron/multichannelBridge.cjs`

#### 1.2 Exponer API via preload

```javascript
// electron/preload.cjs (añadir)
contextBridge.exposeInMainWorld('electronAudio', {
    isMultichannelAvailable: () => ipcRenderer.invoke('audio:isAvailable'),
    getDevices: () => ipcRenderer.invoke('audio:getDevices'),
    openStream: (config) => ipcRenderer.invoke('audio:open', config),
    closeStream: () => ipcRenderer.invoke('audio:close'),
    getStreamInfo: () => ipcRenderer.invoke('audio:info')
});
```

**Archivo**: `electron/preload.cjs`

#### 1.3 Crear AudioWorklet de captura

```javascript
// src/assets/js/worklets/outputCapture.worklet.js
// - Recibe audio de los 8 buses
// - Escribe en SharedArrayBuffer
// - Main thread lee y envía a pw-cat
```

**Archivo**: `src/assets/js/worklets/outputCapture.worklet.js`

#### 1.4 Modificar AudioEngine para usar multicanal

```javascript
// src/assets/js/core/audioEngine.js (modificar)
// - Detectar si electronAudio está disponible
// - Si sí: rutear buses a AudioWorklet de captura
// - Si no: mantener comportamiento actual (destination estéreo)
```

**Archivo**: `src/assets/js/core/audioEngine.js`

#### 1.5 UI de configuración

- Añadir opción en modal de Audio Settings
- Mostrar indicador de "Modo multicanal activo"
- Selector de número de canales (2, 4, 6, 8)

**Archivo**: `src/assets/js/ui/modals/AudioSettingsModal.js`

### Fase 2: Windows con WASAPI (~2-3 días)

#### 2.1 Integrar naudiodon

- Compilar naudiodon para Windows (prebuild o CI)
- Wrapper en MultichannelBridge para detectar plataforma
- WASAPI permite multicanal nativo

#### 2.2 Gestión de dispositivos Windows

- Enumerar dispositivos con >2 canales
- Permitir selección en UI

### Fase 3: macOS con CoreAudio (~2-3 días)

#### 3.1 Integrar naudiodon para macOS

- Compilar para darwin-x64 y darwin-arm64
- CoreAudio soporta multicanal nativo

#### 3.2 Gestión de dispositivos macOS

- Aggregate devices para combinar interfaces
- Soporte para interfaces Thunderbolt/USB

## Estructura de Archivos

```
electron/
├── main.cjs                    # (modificar) Registrar IPC handlers
├── preload.cjs                 # (modificar) Exponer electronAudio
└── multichannelBridge.cjs      # (NUEVO) Lógica multicanal por plataforma

src/assets/js/
├── core/
│   └── audioEngine.js          # (modificar) Integrar captura multicanal
└── worklets/
    └── outputCapture.worklet.js # (NUEVO) Captura de 8 buses
```

## API de MultichannelBridge

### Métodos principales

```javascript
class MultichannelBridge {
    /**
     * Verifica si el sistema soporta multicanal
     * @returns {Promise<{available: boolean, reason?: string}>}
     */
    async isAvailable() {}
    
    /**
     * Lista dispositivos con sus capacidades
     * @returns {Promise<Array<{id: string, name: string, maxChannels: number}>>}
     */
    async getDevices() {}
    
    /**
     * Abre stream multicanal
     * @param {Object} config
     * @param {number} config.channels - Número de canales (2-8)
     * @param {number} config.sampleRate - Sample rate (44100, 48000)
     * @param {string} [config.deviceId] - ID del dispositivo (opcional)
     * @returns {Promise<{success: boolean, streamId: string}>}
     */
    async openStream(config) {}
    
    /**
     * Escribe buffer de audio al stream
     * @param {Float32Array} interleavedSamples - Samples interleaved [ch0,ch1,...,ch7,ch0,...]
     * @returns {Promise<{written: number}>}
     */
    async write(interleavedSamples) {}
    
    /**
     * Cierra el stream activo
     */
    async closeStream() {}
}
```

## Consideraciones de Rendimiento

### Latencia objetivo
- Buffer size: 256-512 samples
- Latencia total: <20ms

### Estrategia de buffering
```
AudioWorklet (128 samples @ 48kHz = 2.67ms)
    ↓ SharedArrayBuffer (ring buffer 4096 samples)
Main thread (lee cada 5ms)
    ↓ IPC 
pw-cat (buffer interno)
    ↓
PipeWire (quantum típico: 256-1024 samples)
```

### Manejo de xruns
- Detectar underruns en pw-cat
- Rellenar con silencio si es necesario
- Log para diagnóstico

## Testing

### Tests automatizados
- Unit tests para MultichannelBridge (mock de pw-cat)
- Integration tests en CI con PipeWire virtual

### Tests manuales
- Verificar cada canal con tono diferente
- Verificar en qpwgraph que aparecen 8 puertos
- Medir latencia con loopback

## Documentación de Usuario

### Requisitos Linux
- PipeWire instalado (viene por defecto en Fedora, Ubuntu 22.04+)
- `pipewire-audio-client-libraries` para pw-cat

### Requisitos Windows
- Driver WASAPI del dispositivo de audio
- Interfaz con >2 salidas (o usar canal virtual)

### Requisitos macOS
- Interfaz de audio con >2 salidas
- Posibilidad de crear Aggregate Device

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| pw-cat no instalado | Media | Alto | Detectar y mostrar instrucciones |
| Latencia alta | Baja | Medio | Buffers pequeños + worker dedicado |
| Incompatibilidad de versión | Baja | Medio | Probar en múltiples distros |
| Crash del proceso nativo | Baja | Alto | Fallback a estéreo Web Audio |

## Cronograma Estimado

| Fase | Duración | Dependencias |
|------|----------|--------------|
| Fase 1 (Linux) | 3-4 días | Ninguna |
| Testing Linux | 1-2 días | Fase 1 |
| Fase 2 (Windows) | 2-3 días | Fase 1 completada |
| Testing Windows | 1 día | Fase 2 |
| Fase 3 (macOS) | 2-3 días | Fase 1 completada |
| Testing macOS | 1 día | Fase 3 |
| **Total** | **~2 semanas** | |

## Referencias

- [Experimentos validados](experiments/portaudio-multichannel/)
- [Arquitectura del proyecto](ARCHITECTURE.md)
- [PipeWire documentation](https://docs.pipewire.org/)
- [naudiodon (Node.js PortAudio)](https://github.com/Streampunk/naudiodon)
- [Web Audio API limitations](https://developer.chrome.com/blog/audio-output-devices/)
