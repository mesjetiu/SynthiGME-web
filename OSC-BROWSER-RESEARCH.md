# ⚠️ ARCHIVO DE INVESTIGACIÓN - OSC en Navegador y Dispositivos Móviles

> **Este documento es de investigación.** Recoge el análisis de opciones para llevar OSC
> a la PWA (navegador) y a futuras apps móviles (Android/iOS).
>
> Para documentación del sistema OSC actual (Electron), ver:
> - **[OSC.md](OSC.md)** — Protocolo, direcciones, integración SuperCollider
> - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Arquitectura general del proyecto

---

## 1. Contexto del Problema

OSC (Open Sound Control) en SynthiGME actualmente **solo funciona en Electron**, porque usa sockets UDP nativos (`dgram` de Node.js) para comunicación multicast. Los navegadores web no tienen acceso a sockets UDP por razones de seguridad.

Sin embargo, **sí es posible** llevar OSC al navegador mediante un puente (bridge) WebSocket↔UDP. Este documento analiza las opciones.

### Estado actual por plataforma

| Plataforma | OSC | Transporte | Notas |
|------------|-----|-----------|-------|
| **Electron** (desktop) | ✅ Funciona | UDP multicast nativo | `electron/oscServer.cjs` (482 líneas) |
| **PWA** (navegador) | ❌ No disponible | — | `oscBridge.isAvailable()` retorna `false` |
| **Móvil Android** (futuro) | ⏳ Planificado | Capacitor plugin o bridge WS | Ver [MOBILE-RESEARCH.md](MOBILE-RESEARCH.md) |
| **Móvil iOS** (futuro) | ⏳ Planificado | Capacitor plugin o bridge WS | Ver [MOBILE-RESEARCH.md](MOBILE-RESEARCH.md) |

---

## 2. Por qué no funciona en el navegador

Los navegadores bloquean por diseño el acceso a sockets UDP/TCP raw. Las únicas opciones de red disponibles en JavaScript del navegador son:

| API del navegador | ¿Sirve para OSC? | Motivo |
|---|:-:|---|
| `fetch` / `XMLHttpRequest` | ❌ | Solo HTTP/HTTPS, no UDP |
| `WebSocket` | ✅ Con bridge | Conexión bidireccional persistente, pero requiere servidor WS |
| `WebRTC DataChannel` | ⚠️ Teórico | P2P pero requiere signaling y no habla OSC nativo |
| `Web MIDI` | ❌ | Protocolo completamente diferente (7-bit, sin addresses) |
| `Bluetooth Web API` | ❌ | No es red IP |

**Conclusión**: La única vía práctica es **WebSocket**, que necesita un servidor intermediario (bridge) que traduzca entre WebSocket y UDP.

---

## 3. Arquitectura de código actual (reutilizable)

### 3.1 Capas del sistema OSC

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA WEB (src/assets/js/osc/)  — 100% reutilizable        │
│                                                              │
│  oscBridge.js        Singleton, gestión de listeners,        │
│                      anti-loop, prefijo, send/receive        │
│  oscAddressMap.js    Mapeo direcciones↔controles,            │
│  (antes oscMessageMap) conversiones de escala, pure functions │
│  oscOscillatorSync.js  Sync de knobs de osciladores,         │
│                      deduplicación, rangos                   │
│  index.js            Re-exports                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ window.oscAPI
┌──────────────────────────────┼──────────────────────────────┐
│  CAPA TRANSPORTE            │                               │
│                              ▼                               │
│  Electron:  preload.cjs expone window.oscAPI                │
│             → IPC → main.cjs → oscServer.cjs → UDP          │
│                                                              │
│  Browser:   ❌ No existe (window.oscAPI === undefined)       │
│             → oscBridge.isAvailable() retorna false          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Interfaz `window.oscAPI` (contrato actual)

Definida en `electron/preload.cjs`, expone:

| Método | Dirección | Descripción |
|--------|-----------|-------------|
| `start(config)` | renderer→main | Arranca servidor UDP |
| `stop()` | renderer→main | Para servidor |
| `send(address, args)` | renderer→main | Envía mensaje OSC |
| `getStatus()` | renderer→main | Estado del servidor |
| `onMessage(callback)` | main→renderer | Recibe mensajes entrantes |
| `addTarget(host, port)` | renderer→main | Añade target unicast |
| `removeTarget(host, port)` | renderer→main | Elimina target unicast |
| `getTargets()` | renderer→main | Lista targets unicast |

**Clave**: si la PWA proporciona un objeto `window.oscAPI` con la misma interfaz, **todo el código web existente funciona sin cambios** — `oscBridge.js`, `oscOscillatorSync.js`, la UI de settings, quickbar, oscLog...

### 3.3 Análisis de reutilización

| Componente | Reutilizable en PWA | Motivo |
|---|:-:|---|
| `oscBridge.js` (372 líneas) | ✅ 100% | Solo necesita `window.oscAPI` |
| `oscAddressMap.js` | ✅ 100% | Funciones puras, cero I/O |
| `oscOscillatorSync.js` | ✅ 100% | Depende solo de `oscBridge` |
| `index.js` | ✅ 100% | Re-exports |
| UI: settings, quickbar, oscLog | ✅ 100% | Verifican `window.oscAPI` |
| `oscServer.cjs` (482 líneas) | 🔄 Solo en bridge | Parser OSC binario custom, usa `dgram` |

---

## 4. Opciones evaluadas

### Opción A: WebSocket ↔ UDP Bridge (⭐ RECOMENDADA)

Un pequeño servidor Node.js traduce entre WebSocket (navegador) y UDP multicast (red OSC).

```
┌──────────┐  WebSocket   ┌──────────────┐  UDP Multicast   ┌──────────────┐
│ Browser  │◄────────────►│  osc-bridge  │◄────────────────►│ SuperCollider│
│ (PWA)    │ ws://:8081   │  (Node.js)   │ 224.0.1.1:57121  │ Electron     │
│          │              │  ~150 líneas │                   │ Otros peers  │
└──────────┘              └──────────────┘                   └──────────────┘
```

#### Implementación propuesta

**1. Servidor bridge** (`scripts/osc-bridge.mjs`):
- Abre un `UDPPort` con la librería `osc` (v2.4.5, ya en dependencias) en multicast `224.0.1.1:57121`
- Abre un `WebSocketServer` en puerto 8081
- Reenvía bidireccionalmente: WS→UDP y UDP→WS
- Filtra eco propio (como ya hace `oscServer.cjs`)
- Soporta múltiples clientes browser simultáneos

**2. Transporte browser** (`src/assets/js/osc/oscWebSocketTransport.js`):
- Usa `osc.WebSocketPort` del paquete `osc` (tiene build para browser)
- Crea un objeto `window.oscAPI` compatible con la interfaz de `preload.cjs`
- Se activa automáticamente si no existe `window.electronAPI`
- URL del bridge configurable (por defecto `ws://localhost:8081`)

**3. Detección automática en la app**:
```
App arranca
  → ¿Existe window.electronAPI? → Sí → OSC via Electron (actual)
  → No → ¿Existe bridge WS configado? → Intentar conectar
    → Conectado → Crear window.oscAPI vía WebSocket → Todo funciona
    → No conectado → OSC no disponible (como ahora)
```

#### Ventajas
- ✅ **Compatible con todo el ecosistema OSC**: SuperCollider, instancias Electron, cualquier app OSC
- ✅ **95% código existente reutilizado** sin cambios
- ✅ **`osc` npm ya está en dependencias** (v2.4.5) — soporta WebSocketPort nativo
- ✅ **Patrón probado**: Open Stage Control, TouchOSC, etc. usan este mismo enfoque
- ✅ **Baja latencia**: ~1-2ms en LAN para WebSocket
- ✅ **Simple**: bridge ~150 líneas, transporte browser ~100 líneas

#### Desventajas
- ❌ **Requiere servidor local**: el usuario debe ejecutar `npm run dev:osc-bridge` o equivalente
- ❌ Componente extra a instalar/mantener (aunque es trivial)
- ❌ En LAN remota, `wss://` (WebSocket seguro) requeriría certificado

#### Cuándo es útil
- Desarrollo y performance con la PWA
- Controlar SynthiGME desde SuperCollider usando la versión web
- Sincronizar múltiples instancias browser entre sí y con Electron
- Ensayos donde no se quiere instalar Electron

---

### Opción B: WebRTC DataChannels (P2P)

Conexión peer-to-peer entre navegadores sin servidor para datos.

```
┌──────────┐  WebRTC DataChannel (P2P)  ┌──────────┐
│ Browser A│◄──────────────────────────►│ Browser B│
└──────────┘                            └──────────┘
       ▲                                       ▲
       └───────── Signaling Server ────────────┘
                  (solo para setup)
```

#### Ventajas
- ✅ P2P real — latencia mínima entre browsers
- ✅ No necesita servidor para transferir datos (solo signaling inicial)

#### Desventajas
- ❌ **Incompatible** con SuperCollider, Electron y cualquier app OSC (no hablan WebRTC)
- ❌ Signaling server necesario para negociación (ICE, STUN, TURN)
- ❌ Complejidad alta (~500+ líneas)
- ❌ No es OSC estándar — reinventa el protocolo

**Veredicto**: Descartado. No aporta interoperabilidad con el ecosistema OSC.

---

### Opción C: Web MIDI API

Usar MIDI como protocolo de control en lugar de OSC.

#### Desventajas fatales
- ❌ **No es OSC** — protocolo completamente diferente
- ❌ Solo valores 7-bit (0-127) sin extensiones NRPN
- ❌ Sin direcciones string (`/osc/1/frequency`)
- ❌ Requeriría reescribir todo el sistema de control
- ❌ No sustituye a OSC — son complementarios

**Veredicto**: Descartado. Podría añadirse como **complemento** futuro, pero no sustituye OSC.

---

### Opción D: JSON sobre WebSocket sin bridge UDP

WebSocket puro entre browsers, sin traducción a UDP.

#### Desventajas
- ❌ **Sin interoperabilidad** con SuperCollider, Electron u otras apps OSC
- ❌ Servidor relay necesario igualmente
- ❌ Pierde compatibilidad con el protocolo binario OSC

**Veredicto**: Inferior a Opción A. Si ya necesitas servidor, mejor que haga bridge UDP completo.

---

## 5. Comparativa resumida

| Criterio | A: WS↔UDP Bridge | B: WebRTC | C: Web MIDI | D: JSON/WS |
|---|:-:|:-:|:-:|:-:|
| Compatible SuperCollider | ✅ | ❌ | ❌ | ❌ |
| Compatible Electron OSC | ✅ | ❌ | ❌ | ❌ |
| Sin servidor | ❌ | ⚠️ signaling | ✅ | ❌ |
| Código reutilizado | 95% | ~50% | ~10% | ~80% |
| Esfuerzo implementación | Bajo | Alto | Muy alto | Bajo |
| Protocolo OSC estándar | ✅ | ❌ | ❌ | ❌ |
| Latencia LAN | ~2ms | ~1ms | N/A | ~2ms |

---

## 6. OSC en dispositivos móviles

### 6.1 Capacitor (Android/iOS) — Plugin nativo UDP

Si la app se empaqueta con Capacitor (ver [MOBILE-RESEARCH.md](MOBILE-RESEARCH.md)), OSC puede implementarse como un **plugin nativo** que accede a sockets UDP directamente:

| Plataforma | API nativa | Complejidad |
|---|---|---|
| **Android** | `java.net.DatagramSocket` / `java.net.MulticastSocket` | ~150 líneas Java |
| **iOS** | `NWConnection` (Network.framework) o `GCDAsyncUdpSocket` | ~150 líneas Swift |

El plugin expondría la misma interfaz que `window.oscAPI`, eliminando la necesidad de bridge.

```
┌──────────────────┐  UDP Multicast   ┌──────────────┐
│ Capacitor App    │◄───────────────►│ SuperCollider│
│ ┌──────────┐    │ 224.0.1.1:57121  │ Electron     │
│ │ WebView  │    │                  │ Otros peers  │
│ │ (web app)│    │                  └──────────────┘
│ └────┬─────┘    │
│      │ plugin   │
│ ┌────┴────────┐ │
│ │ OSC Plugin  │ │
│ │ (nativo UDP)│ │
│ └─────────────┘ │
└──────────────────┘
```

**Ventajas**: OSC nativo sin bridge, latencia mínima, compatible con todo el ecosistema.
**Desventaja**: Requiere código nativo por plataforma (~300 líneas total entre Android e iOS).

### 6.2 Capacitor + Bridge WebSocket

Alternativamente, la app móvil podría usar el mismo bridge WebSocket que la PWA de escritorio. El móvil se conectaría vía WiFi al bridge corriendo en un PC de la LAN.

**Ventajas**: Sin código nativo, misma implementación que la PWA.
**Desventaja**: Depende de un servidor bridge en la red, más latencia.

### 6.3 Recomendación para móvil

| Fase | Enfoque | Motivo |
|---|---|---|
| **v1 móvil** | Sin OSC | Lanzar rápido, minimizar complejidad |
| **v1.1 móvil** | Bridge WebSocket | Reutilizar implementación de la PWA |
| **v2 móvil** | Plugin nativo UDP | OSC autónomo sin servidor externo |

---

## 7. Consideraciones de seguridad y red

### 7.1 HTTPS y WebSocket seguro

- En `localhost`, WebSocket (`ws://`) funciona sin HTTPS — sin problemas para desarrollo local.
- En LAN (ej: `ws://192.168.1.x:8081`), los navegadores permiten `ws://` desde páginas HTTP, pero **bloquean `ws://` desde páginas HTTPS** (mixed content).
- La PWA servida desde GitHub Pages es HTTPS → necesitaría `wss://` para bridges remotos.

**Soluciones**:
1. **Desarrollo local**: `ws://localhost:8081` funciona siempre.
2. **LAN**: Servir la PWA localmente (HTTP) en lugar de desde GitHub Pages, o configurar certificado autofirmado para el bridge.
3. **Excepción Chrome**: `chrome://flags/#unsafely-treat-insecure-origin-as-secure` para desarrollo.

### 7.2 Multicast y firewalls

- UDP multicast funciona en LAN sin configuración especial en la mayoría de routers domésticos.
- Redes corporativas/educativas pueden bloquear multicast → fallback a unicast.
- El bridge puede configurarse para unicast además de multicast (como ya hace `oscServer.cjs` con `unicastTargets`).

### 7.3 Latencia

| Ruta | Latencia típica |
|---|---|
| Electron → UDP → SuperCollider | <1ms (LAN) |
| Browser → WS → Bridge → UDP → SuperCollider | ~2-4ms (LAN) |
| Móvil WiFi → WS → Bridge → UDP → SuperCollider | ~5-15ms (WiFi) |

Para control de síntesis en tiempo real, todas son aceptables (la percepción humana de latencia en controles es ~20-30ms).

---

## 8. Plan de implementación propuesto

### Fase 1: Bridge + transporte WebSocket (~250 líneas nuevas)

1. **`scripts/osc-bridge.mjs`** — Servidor bridge Node.js
   - Usa paquete `osc` (ya en dependencias) para `UDPPort` + `WebSocketServer`
   - Puerto WS configurable (default 8081)
   - Filtro de eco propio
   - Soporte múltiples clientes browser

2. **`src/assets/js/osc/oscWebSocketTransport.js`** — Transporte browser
   - Crea `window.oscAPI` compatible con la interfaz Electron
   - Conexión/reconexión automática al bridge
   - Indicador de estado (conectado/desconectado/reconectando)

3. **Detección automática en `oscBridge.js`**
   - Si `window.electronAPI` → usar IPC (actual)
   - Si no → intentar WebSocket → si conecta → `window.oscAPI` disponible
   - Sin cambios en el 95% del código existente

4. **Script npm**: `"dev:osc-bridge": "node scripts/osc-bridge.mjs"`

5. **UI**: Indicador de conexión al bridge en Settings > OSC, campo para URL del bridge

### Fase 2: Integración en dev server (opcional)

- Integrar el bridge como opción del `npm run dev:web` existente
- Flag `--osc` para activar automáticamente: `npm run dev:web -- --osc`
- Elimina la necesidad de ejecutar un proceso separado

### Fase 3: Plugin Capacitor para móvil (futuro)

- Plugin nativo con UDP directo
- Misma interfaz `window.oscAPI`
- Sin necesidad de bridge en móvil

---

## 9. Dependencia `osc` npm

El paquete [`osc`](https://github.com/colinbdclark/osc.js) (v2.4.5) ya está en `package.json` como dependencia de producción. Actualmente **no se usa** — `oscServer.cjs` implementa su propio parser binario OSC.

Para el bridge, `osc` proporciona:

| Componente | Uso |
|---|---|
| `osc.UDPPort` | Bridge: lado UDP multicast (Node.js) |
| `osc.WebSocketPort` | Bridge: lado WS servidor (Node.js) + Browser: cliente WS |
| Parsing OSC binary | Automático en ambos lados |

Esto simplifica la implementación — no hace falta reimplementar el protocolo binario.

---

## 10. Alternativa: ¿Reutilizar el parser custom de oscServer.cjs?

`oscServer.cjs` incluye un parser OSC binario manual (~200 líneas) con funciones `encodeOSCMessage`, `decodeOSCMessage`, etc. Técnicamente podría extraerse como módulo compartido.

**Recomendación**: Usar `osc` npm en su lugar. Motivos:
- Ya está en dependencias y es más completo (soporta bundles, timetags, tipos extendidos)
- Los ~200 líneas custom se ahorraron por diseño (zero-dependency en Electron main process)
- Para el bridge, `osc` npm con sus transportes WebSocket/UDP integrados es la opción más limpia

---

## Referencias

- [osc.js (colinbdclark)](https://github.com/colinbdclark/osc.js) — Librería OSC con transportes WebSocket/UDP
- [Especificación OSC 1.0](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- [Open Stage Control](https://openstagecontrol.ammd.net/) — Ejemplo de app que usa WS↔OSC bridge
- [TouchOSC](https://hexler.net/touchosc) — Controlador OSC móvil (referencia de UX)
- [OSC.md](OSC.md) — Documentación del protocolo OSC en SynthiGME

---

## Historial

| Fecha | Cambios |
|-------|---------|
| 2026-02-09 | Documento inicial — investigación de opciones para OSC en navegador y móvil |
