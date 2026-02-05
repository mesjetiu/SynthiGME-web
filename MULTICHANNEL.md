# Audio Multicanal en SynthiGME

SynthiGME soporta salida de audio en **8 canales independientes**, permitiendo rutear cada bus de salida del sintetizador a un canal de audio físico diferente.

## Disponibilidad por Plataforma

| Plataforma | 12 canales independientes | Ruteo en qpwgraph | Notas |
|------------|-------------------------|-------------------|-------|
| **Linux + PipeWire** (Electron) | ✅ Sí | ✅ Sí | Requiere addon nativo compilado |
| **Linux sin PipeWire** | ❌ No | — | Fallback a estéreo |
| **Windows** (Electron) | ❌ No (por ahora) | — | Estéreo vía Web Audio |
| **macOS** (Electron) | ❌ No (por ahora) | — | Estéreo vía Web Audio |
| **Web (navegador)** | ❌ No | — | Limitación de Chromium (max 2ch) |

> **Nota**: En todas las plataformas el sintetizador funciona con 8 buses lógicos internos. La diferencia es si se pueden rutear a 8 salidas físicas independientes.

## Uso en Linux con PipeWire

### Requisitos

1. **PipeWire** como servidor de audio (viene por defecto en Fedora, Ubuntu 22.10+, etc.)
2. **qpwgraph** o **Helvum** para visualizar y rutear conexiones
3. **Addon nativo compilado** (incluido en AppImage, o compilar manualmente)

### Activación

1. Abre SynthiGME (versión Electron/AppImage)
2. Ve a **Ajustes de Audio** (icono de engranaje → Audio)
3. En **Dispositivo de salida**, selecciona **"SynthiGME 12ch (PipeWire)"****
4. Configura la latencia multicanal según tus necesidades

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

## Arquitectura Técnica

### Flujo de Audio (Linux + PipeWire)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron                                  │
│  ┌──────────────────┐      ┌─────────────────────────────────┐  │
│  │   Web Audio      │      │   Addon Nativo (C++)            │  │
│  │   (renderer)     │      │                                 │  │
│  │                  │ SAB  │   SharedArrayBuffer (lock-free) │  │
│  │  AudioWorklet    │─────▶│   Ring buffer (8192 frames)     │  │
│  │  12ch capture    │      │   PipeWire stream               │  │
│  └──────────────────┘      └─────────────────────────────────┘  │
│                                       │                          │
└───────────────────────────────────────┼──────────────────────────┘
                                        ▼
                              ┌──────────────────┐
                              │    PipeWire      │
                              │                  │
                              │  8 puertos       │
                              │  AUX0 - AUX7     │
                              └──────────────────┘
```

### Componentes Clave

| Componente | Archivo | Descripción |
|------------|---------|-------------|
| AudioWorklet (captura) | `src/assets/js/worklets/multichannelCapture.worklet.js` | Captura 12 canales desde Web Audio |
| Addon nativo | `electron/native/src/` | Escribe audio a PipeWire |
| Preload API | `electron/preload.cjs` | Expone `window.multichannelAPI` |
| UI latencia | `src/assets/js/ui/audioSettingsModal.js` | Configuración de latencia |

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

### No aparece la opción "SynthiGME 12ch"

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
