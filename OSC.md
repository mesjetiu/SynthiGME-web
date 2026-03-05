# OSC (Open Sound Control) - SynthiGME-web

## Descripción General

El protocolo OSC permite la comunicación entre múltiples instancias de SynthiGME en una red local. La arquitectura es **descentralizada** (peer-to-peer): no hay maestro ni esclavos. Cuando cualquier instancia mueve un control, todas las demás instancias sincronizadas realizan el mismo cambio.

## Estado de Implementación

| Plataforma | Estado | Notas |
|------------|--------|-------|
| **Electron** | 🚧 En desarrollo | Comunicación UDP nativa vía `dgram` |
| **PWA/Browser** | ⏳ Planificado | Requiere bridge WebSocket externo |

## Arquitectura

### Modo Electron (Implementación actual)

```
┌─────────────────┐     UDP Multicast      ┌─────────────────┐
│  Electron A     │◄─────────────────────► │  Electron B     │
│  ┌───────────┐  │     224.0.1.1:57121    │  ┌───────────┐  │
│  │ Renderer  │  │                        │  │ Renderer  │  │
│  │ (UI/Audio)│  │                        │  │ (UI/Audio)│  │
│  └─────┬─────┘  │                        │  └─────┬─────┘  │
│        │ IPC    │                        │        │ IPC    │
│  ┌─────┴─────┐  │                        │  ┌─────┴─────┐  │
│  │   Main    │  │                        │  │   Main    │  │
│  │(OSC Server│  │                        │  │(OSC Server│  │
│  └───────────┘  │                        │  └───────────┘  │
└─────────────────┘                        └─────────────────┘
         │                                          │
         └────────────────────┬─────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   SuperCollider   │
                    │   (Compatible)    │
                    └───────────────────┘
```

### Modo PWA/Browser (Futuro)

```
┌─────────────────┐                        ┌─────────────────┐
│   Browser A     │     WebSocket          │   Browser B     │
│   (PWA)         │◄──────────────────────►│   (PWA)         │
└────────┬────────┘          │             └────────┬────────┘
         │                   │                      │
         └───────────┬───────┴───────┬──────────────┘
                     │               │
              ┌──────┴───────┐       │
              │  WS Bridge   │◄──────┘
              │  Server      │
              │  (Node.js)   │
              └──────┬───────┘
                     │ OSC/UDP
              ┌──────┴───────┐
              │ SuperCollider│
              └──────────────┘
```

## Configuración

### Parámetros de red

| Parámetro | Valor por defecto | Descripción |
|-----------|-------------------|-------------|
| `port` | `57121` | Puerto UDP para OSC |
| `multicastGroup` | `224.0.1.1` | Grupo multicast IPv4 (RFC 2365 administratively scoped) |
| `prefix` | `/SynthiGME/` | Prefijo de direcciones OSC |

### Opciones de usuario

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `oscEnabled` | boolean | Activa/desactiva toda comunicación OSC |
| `oscSend` | boolean | Permite enviar mensajes OSC |
| `oscReceive` | boolean | Permite recibir mensajes OSC |
| `oscPrefix` | string | Clave inicial para filtrar mensajes (ej: `/SynthiGME/`) |

---

## Protocolo OSC - Direcciones y Valores

Las direcciones OSC siguen el formato: `{prefix}{módulo}/{instancia}/{parámetro}`

Los valores se transmiten en **escala real** del parámetro (no normalizada 0-1), manteniendo compatibilidad con la implementación en SuperCollider.

### Conversiones de escala

| Tipo de parámetro | Rango real | Rango UI (0-1) |
|-------------------|------------|----------------|
| Level estándar | 0 - 10 | 0 - 1 |
| Bipolar | -5 - 5 | 0 - 1 |
| Range selector | "hi", "lo" | — |
| Boolean/Gate | 0, 1 | 0, 1 |

---

## Módulos y Claves OSC

### 1. Osciladores (`/osc/{1-12}/...`)

```
/osc/{n}/range          # "hi" | "lo"
/osc/{n}/frequency      # 0 - 10
/osc/{n}/pulselevel     # 0 - 10
/osc/{n}/pulseshape     # -5 - 5
/osc/{n}/sinelevel      # 0 - 10
/osc/{n}/sinesymmetry   # -5 - 5
/osc/{n}/trianglelevel  # 0 - 10
/osc/{n}/sawtoothlevel  # 0 - 10
```

**Ejemplo:** `/SynthiGME/osc/1/frequency 5.5`

### 2. Matriz de Audio (`/audio/...`)

Matriz de conexiones de audio del Panel 5 del Synthi 100. Conecta fuentes de señal
(osciladores, ruido, entradas, buses) a destinos de audio (salidas, sync, osciloscopio).

#### Formato de dirección

```
/audio/{source}/{Dest}  {pin|0}
       ─minúsc─  ─Mayúsc─
```

La convención **minúsculas → Mayúscula** marca visualmente la transición source → destino.

#### Sources (fuentes de señal — minúsculas)

| Dirección | Descripción |
|-----------|-------------|
| `in/{1-8}` | Amplificadores de entrada |
| `bus/{1-8}` | Buses de salida (feedback post-fader) |
| `noise/{1-2}` | Generadores de ruido |
| `osc/{1-9}/sinSaw` | Oscilador — salida sine + sawtooth |
| `osc/{1-9}/triPul` | Oscilador — salida triangle + pulse |

#### Destinations (destinos — Mayúscula inicial)

| Dirección | Descripción |
|-----------|-------------|
| `Out/{1-8}` | Canales de salida |
| `Sync/{1-12}` | Hard sync de oscilador (resetea fase) |
| `PWM/{1-6}` | Modulación de ancho de pulso (osciladores 1-6) |
| `Scope/{Y,X}` | Osciloscopio (Y=vertical, X=Lissajous) |

#### Ejemplos

```
/SynthiGME/audio/osc/1/sinSaw/Out/1     WHITE    # Osc 1 sine+saw → Out 1
/SynthiGME/audio/osc/3/triPul/Out/2     GREEN    # Osc 3 tri+pulse → Out 2 (atenuado)
/SynthiGME/audio/noise/1/Out/4          GREY     # Ruido 1 → Out 4 (precisión)
/SynthiGME/audio/in/2/Out/1             WHITE    # Input 2 → Out 1
/SynthiGME/audio/bus/1/Out/5            RED      # Bus 1 feedback → Out 5 (alta ganancia)
/SynthiGME/audio/osc/5/sinSaw/Sync/2    GREY     # Osc 5 sin+saw → Hard sync Osc 2
/SynthiGME/audio/osc/1/triPul/Scope/Y   RED      # Osc 1 tri+pulse → Osciloscopio Y
/SynthiGME/audio/noise/1/PWM/3          GREY     # Ruido 1 → PWM Osc 3 (precisión)
/SynthiGME/audio/osc/1/sinSaw/Out/1     0        # Desconectar
```

### 3. Matriz de Control (`/cv/...`)

Matriz de conexiones de voltaje de control del Panel 6 del Synthi 100. Conecta fuentes
de señal de control (osciladores 10-12, joysticks, entradas, buses) a destinos modulables
(frecuencia de osciladores, nivel de salidas, osciloscopio).

#### Formato de dirección

```
/cv/{source}/{Dest}  {pin|0}
    ─minúsc─  ─Mayúsc─
```

#### Sources (fuentes CV — minúsculas)

| Dirección | Descripción |
|-----------|-------------|
| `in/{1-8}` | Amplificadores de entrada (audio como CV) |
| `bus/{1-8}` | Buses de salida (feedback post-fader) |
| `osc/{10-12}/sinSaw` | Oscilador — salida sine + sawtooth |
| `osc/{10-12}/triPul` | Oscilador — salida triangle + pulse |
| `joy/{L,R}/{y,x}` | Joystick (L=izquierdo, R=derecho) |

#### Destinations (destinos CV — Mayúscula inicial)

| Dirección | Descripción |
|-----------|-------------|
| `Out/{1-4}` | Voltage input de canales de salida (mismo bus que Panel 5) |
| `Freq/{1-12}` | Frecuencia CV de oscilador |
| `Level/{1-8}` | Control CV del nivel de salida |
| `Scope/{Y,X}` | Osciloscopio (Y=vertical, X=Lissajous) |

#### Ejemplos

```
/SynthiGME/cv/joy/L/y/Freq/1            GREY     # Joystick L eje Y → Osc 1 freq CV
/SynthiGME/cv/osc/10/sinSaw/Freq/3      WHITE    # Osc 10 sin+saw → Osc 3 freq CV
/SynthiGME/cv/joy/R/x/Level/1           GREEN    # Joystick R eje X → Out 1 level CV
/SynthiGME/cv/in/1/Out/1                GREY     # Input 1 → Voltage input Out Ch 1
/SynthiGME/cv/bus/2/Scope/X             RED      # Bus 2 → Osciloscopio X
/SynthiGME/cv/osc/12/triPul/Level/8     PURPLE   # Osc 12 tri+pulse → Out 8 level CV
/SynthiGME/cv/joy/L/y/Freq/1            0        # Desconectar
```

### Valores de conexión (pines)

Las matrices del Synthi 100 usan **pines con resistencias** que determinan la ganancia
de cada conexión. Cada color de pin corresponde a un valor de resistencia específico
del sintetizador original de Cuenca (Datanomics 1982).

#### Formato por defecto: color del pin (string)

| Color | Resistencia | Tolerancia | Ganancia (Rf=100kΩ) | Uso típico |
|-------|------------|------------|---------------------|------------|
| `WHITE` | 100 kΩ | ±10% | 1.0× | Audio general |
| `GREY` | 100 kΩ | ±0.5% | 1.0× | CV de precisión (intervalos afinados) |
| `GREEN` | 68 kΩ | ±10% | 1.47× | Mezcla atenuada |
| `RED` | 2.7 kΩ | ±10% | 37× | Osciloscopio / señal fuerte |
| `BLUE` | 10 kΩ | ±10% | 10× | Alta ganancia (legacy Belgrado) |
| `YELLOW` | 22 kΩ | ±10% | 4.5× | Jumpers / boost de señal |
| `CYAN` | 250 kΩ | ±10% | 0.4× | Mezcla muy atenuada |
| `PURPLE` | 1 MΩ | ±10% | 0.1× | Influencia mínima |

> **Nota:** La ganancia se calcula como `Rf / Rpin` donde Rf = 100 kΩ es la resistencia
> de realimentación estándar del nodo de suma de tierra virtual del Synthi 100.
> Los valores de tolerancia se aplican opcionalmente para emular las variaciones
> del hardware real.

#### Desconexión

Enviar `0` (entero o float) como valor desconecta el pin:

```
/SynthiGME/audio/osc/1/sinSaw/Out/1  0
```

#### Formato alternativo: ganancia + tolerancia (2 floats)

Configurable en Ajustes > OSC. En lugar de enviar el nombre del color, se envían
dos valores numéricos: ganancia y tolerancia.

```
/SynthiGME/audio/osc/1/sinSaw/Out/1  1.0 0.10     # ≈ WHITE (gain=1.0, tol=±10%)
/SynthiGME/audio/osc/1/sinSaw/Out/1  37.0 0.10    # ≈ RED (gain=37, tol=±10%)
/SynthiGME/audio/osc/1/sinSaw/Out/1  1.0 0.005    # ≈ GREY (gain=1.0, tol=±0.5%)
/SynthiGME/audio/osc/1/sinSaw/Out/1  0.1 0.10     # ≈ PURPLE (gain=0.1, tol=±10%)
```

El receptor siempre acepta ambos formatos:
- **String** (`WHITE`, `RED`...) → aplica resistencia y tolerancia del color
- **Float + Float** (ganancia, tolerancia) → aplica directamente; al mostrar en la UI,
  busca el color más cercano
- **`0`** → desconecta

#### Alias de coordenadas (compatibilidad)

Para compatibilidad con la implementación original de SuperCollider, el receptor
también acepta direcciones con coordenadas Synthi (números de serigrafía):

```
/SynthiGME/audio/91/36   WHITE      # ≡ /audio/osc/1/sinSaw/Out/1 WHITE
/SynthiGME/cv/117/30     GREY       # ≡ /cv/joy/L/y/Freq/1 GREY
```

Cuando los dos segmentos tras `audio`/`cv` son numéricos, se resuelven automáticamente
consultando los blueprints de Panel 5 y Panel 6. El envío siempre usa formato semántico
por defecto (configurable para enviar coordenadas si se desea compatibilidad SC).

### 4. Canales de Salida (`/out/{1-8}/...`)

```
/out/{n}/level          # 0 - 10
/out/{n}/filter         # -5 - 5
/out/{n}/on             # 0 | 1
/out/{n}/pan            # 0 - 10
```

**Ejemplo:** `/SynthiGME/out/1/level 7.5`

### 5. Amplificadores de Entrada (`/in/{1-8}/...`)

```
/in/{n}/level           # 0 - 10
```

**Ejemplo:** `/SynthiGME/in/1/level 5.0`

### 6. Retornos de Tratamiento Externo (`/return/{1-2}/...`)

```
/return/{n}/level       # 0 - 10
```

**Ejemplo:** `/SynthiGME/return/1/level 6.0`

### 7. Generadores de Envolvente (`/env/{1-3}/...`)

```
/env/{n}/delay          # 0 - 10
/env/{n}/attack         # 0 - 10
/env/{n}/decay          # 0 - 10
/env/{n}/sustain        # 0 - 10
/env/{n}/release        # 0 - 10
/env/{n}/envelopeLevel  # -5 - 5
/env/{n}/signalLevel    # -5 - 5
/env/{n}/gate           # trigger (cualquier valor)
/env/{n}/selector       # valor específico del selector
```

**Ejemplo:** `/SynthiGME/env/1/attack 3.2`

### 8. Moduladores de Anillo (`/ring/{1-3}/...`)

```
/ring/{n}/level         # 0 - 10
```

**Ejemplo:** `/SynthiGME/ring/1/level 8.0`

### 9. Generadores de Ruido (`/noise/{1-2}/...`)

```
/noise/{n}/colour       # 0 - 10
/noise/{n}/level        # 0 - 10
```

**Ejemplo:** `/SynthiGME/noise/1/colour 2.5`

### 10. Generador Aleatorio (`/random/...`)

Módulo único (sin índice).

```
/random/mean            # -5 - 5
/random/variance        # -5 - 5
/random/voltage1        # 0 - 10
/random/voltage2        # 0 - 10
/random/key             # -5 - 5
```

**Ejemplo:** `/SynthiGME/random/variance 1.8`

### 11. Limitadores de Slew (`/slew/{1-3}/...`)

```
/slew/{n}/rate          # 0 - 10
```

**Ejemplo:** `/SynthiGME/slew/1/rate 4.5`

### 12. Filtros (`/filter/{1-3}/...`)

```
/filter/{n}/frequency   # 0 - 10
/filter/{n}/response    # 0 - 10
/filter/{n}/level       # 0 - 10
```

**Ejemplo:** `/SynthiGME/filter/2/frequency 6.3`

### 13. Banco de Filtros Octava (`/filterBank/...`)

```
/filterBank/63          # 0 - 10
/filterBank/125         # 0 - 10
/filterBank/250         # 0 - 10
/filterBank/500         # 0 - 10
/filterBank/1000        # 0 - 10
/filterBank/2000        # 0 - 10
/filterBank/4000        # 0 - 10
/filterBank/8000        # 0 - 10
```

**Ejemplo:** `/SynthiGME/filterBank/1000 5.0`

### 14. Reverberación (`/reverb/...`)

Módulo único.

```
/reverb/mix             # 0 - 10
/reverb/level           # 0 - 10
```

**Ejemplo:** `/SynthiGME/reverb/mix 4.0`

### 15. Echo/Delay (`/echo/...`)

Módulo único.

```
/echo/delay             # 0 - 10
/echo/mix               # 0 - 10
/echo/feedback          # 0 - 10
/echo/level             # 0 - 10
```

**Ejemplo:** `/SynthiGME/echo/feedback 3.5`

### 16. Osciloscopio (`/oscilloscope/...`)

Módulo único.

```
/oscilloscope/sensCH1   # 0 - 10
/oscilloscope/sensCH2   # 0 - 10
/oscilloscope/mode      # 0 - 10
```

**Ejemplo:** `/SynthiGME/oscilloscope/mode 5.0`

### 17. Teclados (`/keyboard/{upper|lower}/...`)

2 teclados: `upper` (superior, 5 octavas) y `lower` (inferior, 5 octavas).

```
/keyboard/{side}/pitchSpread    # 0 - 10  (rango de afinación)
/keyboard/{side}/velocityLevel  # -5 - 5  (sensibilidad velocity)
/keyboard/{side}/gateLevel      # -5 - 5  (nivel de envelope trigger)
/keyboard/{side}/retrigger      # 0 o 1   (0=Kbd key release, 1=On retrigger)
/keyboard/{side}/noteOn         # [nota, velocity] (Int array, nota MIDI 0-127)
/keyboard/{side}/noteOff        # nota            (Int, nota MIDI 0-127)
```

**Ejemplo:** `/SynthiGME/keyboard/upper/pitchSpread 5.0`
**Ejemplo nota:** `/SynthiGME/keyboard/lower/noteOn 60 100`

### 18. Inversor (`/invertor/...`)

Módulo único.

```
/invertor/gain          # -5 - 5
/invertor/offset        # -5 - 5
```

**Ejemplo:** `/SynthiGME/invertor/gain 2.0`

### 19. Joysticks (`/joy/{1-2}/...`)

2 joysticks (1=izquierdo, 2=derecho). Cada uno con pad XY y knobs de rango.

```
/joy/{n}/positionX      # -1 - 1 (posición normalizada del pad)
/joy/{n}/positionY      # -1 - 1 (posición normalizada del pad)
/joy/{n}/rangeX         # 0 - 10 (rango del eje X)
/joy/{n}/rangeY         # 0 - 10 (rango del eje Y)
```

**Ejemplo:** `/SynthiGME/joy/1/positionX 0.5`

---

## Mecanismo Anti-Loop

Para evitar bucles infinitos cuando un mensaje OSC recibido dispara un nuevo envío:

1. Cada mensaje incluye implícitamente un origen (`source`)
2. Los cambios con `source === 'osc'` NO se reenvían
3. Solo cambios con `source === 'local'` (interacción de usuario) se envían

```javascript
// Pseudocódigo del flujo
onKnobChange(value, source = 'local') {
  updateAudio(value);
  updateUI(value);
  
  if (source !== 'osc' && oscEnabled && oscSend) {
    oscBridge.send(address, value);
  }
}

onOscMessage(address, value) {
  if (oscEnabled && oscReceive) {
    const control = findControl(address);
    control.setValue(value, 'osc'); // source = 'osc' evita reenvío
  }
}
```

---

## Sincronización Inicial

### Fase 1 (Implementación actual)
- Solo cambios futuros se sincronizan
- Cada instancia mantiene su estado al conectarse

### Fase 2 (Planificado)
- Opción de solicitar estado completo de otra instancia
- Mensaje especial: `/sync/request` y `/sync/full`
- Requiere mecanismo de selección de fuente

---

## Integración con SuperCollider

### Configuración en SynthiGME

1. Abrir **Ajustes → OSC**
2. Activar **OSC habilitado**
3. En la sección SuperCollider:
   - **Enviar a SuperCollider**: Activa el envío de mensajes a SC (127.0.0.1:57120)
   - **Recibir desde SuperCollider**: Permite que SC controle SynthiGME

### Código para SuperCollider

#### Recibir mensajes de SynthiGME

```supercollider
// Monitor simple de mensajes OSC
(
thisProcess.removeOSCRecvFunc(~synthiGMEfunc);

~synthiGMEfunc = { |msg, time, addr|
    var path = msg[0].asString;
    if(path.contains("SynthiGME")) {
        "% → % %".format(time.round(0.01), msg[0], msg[1..]).postln;
    };
};

thisProcess.addOSCRecvFunc(~synthiGMEfunc);
"═══ SynthiGME Monitor activo (puerto %) ═══".format(NetAddr.langPort).postln;
)

// Para detener:
// thisProcess.removeOSCRecvFunc(~synthiGMEfunc);
```

#### Monitor detallado

```supercollider
(
thisProcess.removeOSCRecvFunc(~synthiGMEfunc);

~synthiGMEfunc = { |msg, time, addr|
    var path = msg[0].asString;
    if(path.contains("SynthiGME")) {
        var parts = path.split($/);
        var module = parts[2] ? "?";
        var param = parts[3] ? "?";
        var value = msg[1];
        
        "% | %-12s %-15s = %".format(
            time.round(0.01),
            module,
            param,
            value.round(0.001)
        ).postln;
    };
};

thisProcess.addOSCRecvFunc(~synthiGMEfunc);
"═══════════════════════════════════════════════".postln;
"  SynthiGME OSC Monitor activo".postln;
"  Puerto: %".format(NetAddr.langPort).postln;
"═══════════════════════════════════════════════".postln;
)
```

#### Enviar mensajes a SynthiGME

SynthiGME escucha en el grupo multicast `224.0.1.1:57121`:

```supercollider
// Crear NetAddr para multicast
~synthi = NetAddr("224.0.1.1", 57121);

// ─── Control de módulos ───
~synthi.sendMsg('/SynthiGME/osc/1/frequency', 5.0);
~synthi.sendMsg('/SynthiGME/osc/1/sinelevel', 7.5);
~synthi.sendMsg('/SynthiGME/osc/1/range', "hi");
~synthi.sendMsg('/SynthiGME/filter/2/frequency', 3.0);
~synthi.sendMsg('/SynthiGME/reverb/mix', 4.0);

// ─── Conexiones en matrices ───
// Conectar Osc 1 sine+saw → Out 1 con pin blanco
~synthi.sendMsg('/SynthiGME/audio/osc/1/sinSaw/Out/1', "WHITE");

// Conectar Joystick L eje Y → Osc 1 freq CV con pin gris (precisión)
~synthi.sendMsg('/SynthiGME/cv/joy/L/y/Freq/1', "GREY");

// Desconectar
~synthi.sendMsg('/SynthiGME/audio/osc/1/sinSaw/Out/1', 0);

// Alias de coordenadas (compatibilidad con SuperCollider original)
~synthi.sendMsg('/SynthiGME/audio/91/36', "WHITE");  // ≡ osc/1/sinSaw/Out/1
```

#### Automatización desde SC

```supercollider
// Ejemplo: LFO controlando frecuencia del oscilador 1
(
~synthi = NetAddr("224.0.1.1", 57121);

fork {
    var freq = 0;
    loop {
        freq = (sin(thisThread.seconds * 0.5) + 1) * 5; // 0-10
        ~synthi.sendMsg('/SynthiGME/osc/1/frequency', freq);
        0.05.wait;
    };
};
)
```

### Notas técnicas

- **Puerto SC por defecto**: 57120 (sclang recibe aquí)
- **Puerto SynthiGME**: 57121 (grupo multicast)
- Los valores OSC usan escala real (0-10, -5 a 5), no normalizada (0-1)
- SC debe enviar al grupo multicast para que SynthiGME reciba

---

## Testing con SuperCollider

Para verificar que la implementación funciona, usar este código en SuperCollider:

```supercollider
// ─── Test de módulos ───
OSCdef(\synthiTest, { |msg, time, addr|
    "Recibido: % desde %".format(msg, addr).postln;
}, '/SynthiGME/osc/1/frequency');

n = NetAddr("224.0.1.1", 57121);
n.sendMsg('/SynthiGME/osc/1/frequency', 5.0);

// ─── Test de matrices ───
// Conectar Osc 1 sine+saw → Out 1 con pin blanco
n.sendMsg('/SynthiGME/audio/osc/1/sinSaw/Out/1', "WHITE");

// Conectar Joystick L eje Y → Osc 1 freq CV con pin gris
n.sendMsg('/SynthiGME/cv/joy/L/y/Freq/1', "GREY");

// Desconectar
n.sendMsg('/SynthiGME/audio/osc/1/sinSaw/Out/1', 0);
```

---

## Archivos de Implementación

```
electron/
├── main.cjs                    # Proceso principal, inicializa OSC server
├── preload.cjs                 # Expone oscAPI al renderer
└── oscServer.cjs               # Servidor UDP OSC

src/assets/js/
└── osc/
    ├── index.js                # Re-exportaciones del módulo OSC
    ├── oscBridge.js            # API unificada para renderer
    ├── oscAddressMap.js        # Mapeo de direcciones OSC a controles
    ├── oscOscillatorSync.js    # Sincronización de osciladores (Panel 3)
    ├── oscInputAmplifierSync.js # Sincronización de input amplifiers (Panel 2)
    ├── oscOutputChannelSync.js # Sincronización de output channels (Panel 7)
    ├── oscNoiseGeneratorSync.js # Sincronización de noise generators (Panel 3)
    ├── oscJoystickSync.js      # Sincronización de joysticks (Panel 7)
    └── oscMatrixSync.js        # Sincronización de matrices audio/control + PWM

tests/
└── osc/
    ├── oscAddressMap.test.js
    ├── oscControlSync.test.js
    ├── oscMatrixSync.test.js
    ├── oscOscillatorSync.test.js
    └── oscServer.test.js
```

---

## Dependencias

### Electron (producción)

```json
{
  "dependencies": {
    "osc": "^2.4.4"
  }
}
```

### Browser/PWA (futuro)

Requiere servidor bridge externo con WebSocket.

---

## Referencias

- [Especificación OSC](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- [Librería osc.js](https://github.com/colinbdclark/osc.js)
- [SynthiGME SuperCollider](https://github.com/mesjetiu/SynthiGME) - Implementación original

---

## Historial de Cambios

| Versión | Fecha | Cambios |
|---------|-------|---------|| 0.4.0 | 2026-02-26 | PWM como destino de matriz audio (`/audio/.../PWM/{1-6}`), `oscMatrixSync.js` para sincronización de matrices |
| 0.3.0 | 2026-02-18 | Nuevo protocolo semántico para matrices (`/audio/`, `/cv/`): direcciones legibles con convención minúsculas→Mayúscula (source→Dest), valores por color de pin con resistencias reales, formato alternativo ganancia+tolerancia, alias de coordenadas Synthi para compatibilidad SC || 0.2.0 | 2026-02-17 | OSC sync para input amplifiers, output channels, noise generators y joysticks |
| 0.1.0 | 2026-01-27 | Documentación inicial, claves OSC de SuperCollider |
