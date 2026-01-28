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
│  ┌───────────┐  │     239.255.0.1:57121  │  ┌───────────┐  │
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
| `multicastGroup` | `239.255.0.1` | Grupo multicast IPv4 |
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

### 2. Patchbay Audio (`/patchA/{row}/{col}`)

Matriz de conexiones de audio. Coordenadas con origen arriba-izquierda.

```
/patchA/{row}/{col}     # 0 = desconectado, 1 = conectado
```

**Ejemplo:** `/SynthiGME/patchA/91/36 1`

### 3. Patchbay Voltage (`/patchV/{row}/{col}`)

Matriz de conexiones de voltaje de control.

```
/patchV/{row}/{col}     # 0 = desconectado, 1 = conectado
```

**Ejemplo:** `/SynthiGME/patchV/16/8 1`

### 4. Canales de Salida (`/out/{1-8}/...`)

```
/out/{n}/level          # 0 - 10
/out/{n}/filter         # 0 - 10
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

### 17. Teclados (`/keyboard/{1-2}/...`)

```
/keyboard/{n}/midiEvent # [midinote, velocity, on/off] (Int8Array)
/keyboard/{n}/pitch     # 0 - 10
/keyboard/{n}/velocity  # -5 - 5
/keyboard/{n}/gate      # -5 - 5
/keyboard/{n}/retrigger # valor específico
```

**Ejemplo:** `/SynthiGME/keyboard/1/pitch 5.0`

### 18. Inversor (`/invertor/...`)

Módulo único.

```
/invertor/gain          # -5 - 5
/invertor/offset        # -5 - 5
```

**Ejemplo:** `/SynthiGME/invertor/gain 2.0`

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

SynthiGME escucha en el grupo multicast `239.255.0.1:57121`:

```supercollider
// Crear NetAddr para multicast
~synthi = NetAddr("239.255.0.1", 57121);

// Ejemplos de control de osciladores
~synthi.sendMsg('/SynthiGME/osc1/frequency', 5.0);
~synthi.sendMsg('/SynthiGME/osc1/sinelevel', 7.5);
~synthi.sendMsg('/SynthiGME/osc1/range', "hi");

// Controlar filtro
~synthi.sendMsg('/SynthiGME/filter1/frequency', 3.0);
~synthi.sendMsg('/SynthiGME/filter1/response', 8.0);

// Controlar reverb
~synthi.sendMsg('/SynthiGME/reverb/mix', 4.0);
~synthi.sendMsg('/SynthiGME/reverb/level', 6.0);
```

#### Automatización desde SC

```supercollider
// Ejemplo: LFO controlando frecuencia del oscilador 1
(
~synthi = NetAddr("239.255.0.1", 57121);

fork {
    var freq = 0;
    loop {
        freq = (sin(thisThread.seconds * 0.5) + 1) * 5; // 0-10
        ~synthi.sendMsg('/SynthiGME/osc1/frequency', freq);
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
// Recibir mensajes OSC de SynthiGME-web
OSCdef(\synthiTest, { |msg, time, addr|
    "Recibido: % desde %".format(msg, addr).postln;
}, '/SynthiGME/osc/1/frequency');

// Enviar mensaje de prueba a SynthiGME-web
n = NetAddr("239.255.0.1", 57121);
n.sendMsg('/SynthiGME/osc/1/frequency', 5.0);
```

---

## Archivos de Implementación

```
electron/
├── main.cjs              # Proceso principal, inicializa OSC server
├── preload.cjs           # Expone oscAPI al renderer
└── oscServer.cjs         # Servidor UDP OSC

src/assets/js/
└── osc/
    ├── oscBridge.js      # API unificada para renderer
    ├── oscMessages.js    # Mapeo de direcciones a controles
    └── oscConfig.js      # Configuración de usuario

tests/
└── osc/
    ├── oscServer.test.js
    └── oscBridge.test.js
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
|---------|-------|---------|
| 0.1.0 | 2026-01-27 | Documentación inicial, claves OSC de SuperCollider |
