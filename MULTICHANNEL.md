# Audio Multicanal en SynthiGME

SynthiGME soporta audio multicanal independiente: **12 canales de salida** (4 buses estéreo + 8 individuales) y **8 canales de entrada** (directamente a los Input Amplifiers).

## Disponibilidad por Plataforma

| Plataforma | Salida 12ch | Entrada 8ch | Ruteo en qpwgraph | Notas |
|------------|-------------|-------------|-------------------|-------|
| **Linux + PipeWire** (Electron) | ✅ | ✅ | ✅ | Addon nativo incluido en AppImage |
| **Linux sin PipeWire** | ❌ | ❌ | — | Fallback a estéreo |
| **Windows** (Electron) | ❌ | ❌ | — | Estéreo vía Web Audio |
| **macOS** (Electron) | ❌ | ❌ | — | Estéreo vía Web Audio |
| **Web (navegador)** | ❌ | ❌ | — | Limitación de Chromium (max 2ch) |

> **Nota**: En todas las plataformas el sintetizador funciona con 8 buses lógicos internos. La diferencia es si se pueden rutear a puertos físicos independientes.

## Uso en Linux con PipeWire

### Requisitos

1. **PipeWire** como servidor de audio (viene por defecto en Fedora, Ubuntu 22.10+, etc.)
2. **qpwgraph** o **Helvum** para visualizar y rutear conexiones
3. **Addon nativo compilado** (incluido en AppImage, o compilar manualmente)

### Activación

1. Abre SynthiGME (versión Electron/AppImage)
2. Ve a **Ajustes de Audio** (icono de engranaje → Audio)
3. En **Dispositivo de salida**, selecciona el modo **"Multicanal (PipeWire 12ch)"** con los radio buttons
4. Configura la latencia multicanal según tus necesidades

> **Nota:** La entrada multicanal (8 canales) se activa automáticamente junto con la salida multicanal.

### Configuración de Latencia

La latencia multicanal tiene dos componentes:

| Componente | Rango | Descripción |
|------------|-------|-------------|
| **Latencia Web Audio** | 10-200ms | Buffer del AudioContext (afecta a todo) |
| **Latencia Multicanal** | 10-170ms | Buffer adicional para transferencia a PipeWire |

**Recomendaciones:**
- **Tiempo real** (instrumentos externos): Web Audio "Interactiva" + Multicanal "Muy baja" (~20ms total)
- **Producción** (estabilidad): Web Audio "Equilibrada" + Multicanal "Normal" (~67ms total)
- **Problemas de audio**: Aumentar ambas latencias

### Ruteo en qpwgraph

Una vez activo, verás en qpwgraph:

```
┌─────────────────────┐
│     SynthiGME       │
├─────────────────────┤
│ Pan_1-4_L  ●────────┼──► Sistema / DAW / Hardware
│ Pan_1-4_R  ●────────┼──►
│ Pan_5-8_L  ●────────┼──►
│ Pan_5-8_R  ●────────┼──►
│ Out_1      ●────────┼──►
│ Out_2      ●────────┼──►
│ Out_3      ●────────┼──►
│ Out_4      ●────────┼──►
│ Out_5      ●────────┼──►
│ Out_6      ●────────┼──►
│ Out_7      ●────────┼──►
│ Out_8      ●────────┼──►
└─────────────────────┘
```

**Organización de canales:**
- **Pan 1-4 L/R**: Salida estéreo mezclada de los canales 1-4 con panning
- **Pan 5-8 L/R**: Salida estéreo mezclada de los canales 5-8 con panning
- **Out 1-8**: Salidas individuales de cada Output Channel

### Puertos de Entrada (input_amp_1..8)

Al activar el modo multicanal, también se crean **8 puertos de entrada** en PipeWire que van directamente a los Input Amplifiers del sintetizador:

```
┌─────────────────────┐
│     SynthiGME       │
├─────────────────────┤
│                     │
│  ENTRADAS:          │
│ ◄────● input_amp_1  │
│ ◄────● input_amp_2  │
│ ◄────● input_amp_3  │
│ ◄────● input_amp_4  │
│ ◄────● input_amp_5  │
│ ◄────● input_amp_6  │
│ ◄────● input_amp_7  │
│ ◄────● input_amp_8  │
│                     │
└─────────────────────┘
```

En qpwgraph puedes conectar cualquier fuente de audio (micrófono, DAW, otro sintetizador) directamente a cada Input Amplifier sin pasar por el sistema de audio estéreo del navegador.

**Matriz de ruteo de entrada**: En Ajustes de Audio, la sección de entrada muestra una matriz 8×8 que permite rutear cada puerto PipeWire (input_amp_1..8) a cualquier combinación de Input Amplifiers (Ch1..Ch8). Por defecto es diagonal 1:1.

## Arquitectura Técnica

### Flujo de Audio - Salida (Linux + PipeWire)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron                                  │
│  ┌──────────────────┐      ┌─────────────────────────────────┐  │
│  │   Web Audio      │      │   Addon Nativo (C++)            │  │
│  │   (renderer)     │      │                                 │  │
│  │                  │ SAB  │   SharedArrayBuffer (lock-free) │  │
│  │  AudioWorklet    │─────▶│   Ring buffer (8192 frames)     │  │
│  │  12ch capture    │      │   PipeWire playback stream      │  │
│  └──────────────────┘      └─────────────────────────────────┘  │
│                                       │                          │
└───────────────────────────────────────┼──────────────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │    PipeWire      │
                              │  12 puertos OUT  │
                              │  Pan_1-4_L/R...  │
                              │  Out_1 - Out_8   │
                              └──────────────────┘
```

### Flujo de Audio - Entrada (Linux + PipeWire)

```
                              ┌──────────────────┐
                              │    PipeWire      │
                              │   8 puertos IN   │
                              │  input_amp_1..8  │
                              └──────────────────┘
                                        │
┌───────────────────────────────────────┼──────────────────────────┐
│                        Electron       ▼                          │
│  ┌──────────────────┐      ┌─────────────────────────────────┐  │
│  │   Web Audio      │      │   Addon Nativo (C++)            │  │
│  │   (renderer)     │      │                                 │  │
│  │                  │ SAB  │   SharedArrayBuffer (lock-free) │  │
│  │  AudioWorklet    │◀─────│   Ring buffer (8192 frames)     │  │
│  │  8ch playback    │      │   PipeWire capture stream       │  │
│  └──────────────────┘      └─────────────────────────────────┘  │
│          │                                                       │
│          ▼                                                       │
│  ┌──────────────────┐                                            │
│  │ Input Amplifiers │                                            │
│  │    (Ch1..Ch8)    │                                            │
│  └──────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

### Componentes Clave

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| AudioWorklet (salida) | `src/assets/js/worklets/multichannelCapture.worklet.js` | Captura 12 canales desde Web Audio, escribe a SAB |
| AudioWorklet (entrada) | `src/assets/js/worklets/multichannelPlayback.worklet.js` | Lee 8 canales desde SAB, produce audio para Input Amplifiers |
| Addon nativo | `electron/native/src/` | PwStream bidireccional (playback + capture) |
| Gestión audio multicanal | `electron/multichannelAudio.cjs` | Detección de PipeWire, gestión del ciclo de vida |
| Integración nativa | `electron/multichannelAudioNative.cjs` | Puente entre Electron y addon C++ |
| Preload API | `electron/preload.cjs` | Expone `window.multichannelAPI` y `window.multichannelInputAPI` |
| UI ruteo | `src/assets/js/ui/audioSettingsModal.js` | Matrices de ruteo salida (12×N) y entrada (8×8), radio buttons estéreo/multicanal |

### SharedArrayBuffer

La comunicación entre AudioWorklet y el addon nativo usa SharedArrayBuffer para transferencia **lock-free** (sin bloqueos):

```
┌─────────────────────────────────────────────────────────┐
│              SharedArrayBuffer (262KB)                  │
├─────────────────────────────────────────────────────────┤
│ Bytes 0-3: writeIndex (Int32, Atomics)                 │
│ Bytes 4-7: readIndex (Int32, Atomics)                  │
│ Bytes 8+:  Audio data (Float32 × 12ch × 8192 frames)   │
└─────────────────────────────────────────────────────────┘
```

## Compilar el Addon Nativo (Desarrollo)

Si necesitas compilar el addon manualmente (no viene en AppImage):

### Requisitos

```bash
# Ubuntu/Debian
sudo apt install build-essential libpipewire-0.3-dev pkg-config

# Arch/Manjaro
sudo pacman -S base-devel pipewire
```

### Compilación

```bash
cd electron/native
npm install   # Compila automáticamente con node-gyp
```

### Test Standalone

```bash
cd electron/native
node test.js
# Genera tonos en 8 canales durante 5 segundos
# Abrir qpwgraph para verificar
```

## Futuro: Otras Plataformas

El sistema está diseñado para ser extensible:

| Plataforma | API Potencial | Estado |
|------------|--------------|--------|
| Windows | WASAPI Exclusive / ASIO | Planificado |
| macOS | Core Audio Aggregate Device | Planificado |

La arquitectura JS (detección, UI, fallback) ya está preparada para soportar múltiples backends nativos.

## Solución de Problemas

### No aparece la opción multicanal

1. Verifica que estás usando la versión **Electron** (no el navegador web)
2. Verifica que PipeWire está corriendo: `systemctl --user status pipewire`
3. El addon puede no estar compilado para tu arquitectura

### Audio con cortes (underflows)

1. Aumenta la latencia multicanal en Ajustes de Audio
2. Cierra otras aplicaciones que usen audio
3. Verifica la carga de CPU

### No hay sonido en qpwgraph

1. Verifica que los puertos AUX están conectados a una salida
2. Revisa que el sintetizador no esté en Mute (tecla `M`)
3. Comprueba que hay audio activo (osciladores encendidos)

## Referencias

- [PipeWire Documentation](https://docs.pipewire.org/)
- [Web Audio API: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
