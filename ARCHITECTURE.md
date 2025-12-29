# SynthiGME-web — Arquitectura del Proyecto

> Emulador web del sintetizador EMS Synthi 100 usando Web Audio API.  
> Última actualización: 30 de diciembre de 2025

---

## 1. Visión General

SynthiGME-web es una aplicación **vanilla JavaScript** (ES Modules) que reproduce la funcionalidad del Synthi 100 en el navegador. No utiliza frameworks de runtime — solo herramientas de build (esbuild, svgo).

### Stack Tecnológico
| Capa | Tecnología |
|------|------------|
| Audio | Web Audio API + AudioWorklet |
| UI | DOM nativo + SVG |
| Build | esbuild (bundler), svgo (optimización SVG) |
| PWA | Service Worker + Web App Manifest |

---

## 2. Estructura de Carpetas

```
src/
├── index.html              # Punto de entrada HTML
├── manifest.webmanifest    # Configuración PWA
├── sw.js                   # Service Worker
└── assets/
    ├── css/
    │   └── main.css        # Estilos globales
    ├── icons/              # Iconos Tabler
    ├── panels/             # SVGs de paneles del sintetizador
    ├── pwa/icons/          # Iconos para PWA
    └── js/
        ├── app.js          # Bootstrap y orquestación principal
        ├── core/           # Motor de audio y conexiones
        ├── modules/        # Módulos de audio (osciladores, ruido, etc.)
        ├── ui/             # Componentes de interfaz reutilizables
        ├── navigation/     # Sistema de navegación del viewport
        ├── utils/          # Utilidades (canvas, SW, versión)
        ├── worklets/       # AudioWorklet processors (síntesis en hilo de audio)
        └── panelBlueprints/# Configuración de matrices y paneles
```

---

## 3. Módulos JavaScript

### 3.1 Core (`src/assets/js/core/`)

| Archivo | Propósito |
|---------|-----------|
| `engine.js` | `AudioEngine` gestiona el `AudioContext`, buses de salida (8 lógicos → 2 físicos), registro de módulos, carga de AudioWorklets, y clase base `Module` |
| `matrix.js` | Lógica de conexión de pines para matrices pequeñas |

### 3.2 Worklets (`src/assets/js/worklets/`)

Procesadores de audio que corren en el hilo de audio para síntesis de alta precisión:

| Archivo | Propósito |
|---------|----------|
| `synthOscillator.worklet.js` | Oscilador con fase coherente, 4 formas de onda (pulse, sine, triangle, sawtooth), anti-aliasing PolyBLEP, y entrada para hard sync |

### 3.3 Modules (`src/assets/js/modules/`)

Cada módulo representa un componente de audio del Synthi 100:

| Archivo | Módulo | Descripción |
|---------|--------|-------------|
| `oscillator.js` | `OscillatorModule` | Oscilador básico con forma de onda configurable |
| `pulse.js` | `PulseModule` | Oscilador de onda cuadrada/pulso con ancho variable |
| `noise.js` | `NoiseModule` | Generador de ruido blanco/rosa |
| `joystick.js` | `JoystickModule` | Control XY para modulación bidimensional |
| `outputFaders.js` | `OutputFadersModule` | UI de 8 faders para niveles de salida |
| `outputRouter.js` | `OutputRouterModule` | Expone niveles de bus como entradas CV para modulación |

**Patrón de módulo:**
```javascript
export class MiModulo extends Module {
  constructor(engine, id) { super(engine, id, 'Nombre'); }
  start() { /* crear nodos de audio */ }
  stop() { /* limpiar recursos */ }
  createUI(container) { /* generar controles */ }
}
```

### 3.4 UI (`src/assets/js/ui/`)

Componentes de interfaz reutilizables:

| Archivo | Componente | Descripción |
|---------|------------|-------------|
| `knob.js` | `Knob` | Control rotativo SVG con eventos de arrastre |
| `largeMatrix.js` | `LargeMatrix` | Matriz de pines 63×67 con toggle y visualización |
| `panelManager.js` | `PanelManager` | Gestión de paneles, carga de SVG, posicionamiento |
| `sgmeOscillator.js` | `SgmeOscillator` | UI compuesta de oscilador (knobs + display) |
| `outputRouter.js` | — | Helper para UI del router de salidas |
| `quickbar.js` | — | Barra de acciones rápidas para móvil (zoom, pan, fullscreen) |

### 3.5 Navigation (`src/assets/js/navigation/`)

Sistema de navegación del viewport:

| Archivo | Propósito |
|---------|-----------|
| `viewportNavigation.js` | Zoom/pan/pinch del viewport, animación a paneles, botones de enfoque |

### 3.6 Utils (`src/assets/js/utils/`)

Utilidades compartidas:

| Archivo | Propósito |
|---------|-----------|
| `canvasBackground.js` | Renderizado de fondos SVG en canvas para móviles |
| `serviceWorker.js` | Registro y actualización del Service Worker |
| `buildVersion.js` | Detección e inyección de versión de build |

### 3.7 Panel Blueprints (`src/assets/js/panelBlueprints/`)

Configuración declarativa de matrices y calibración:

| Archivo | Contenido |
|---------|-----------|
| `panel3.oscillators.config.js` | Calibración de rangos de frecuencia por oscilador |
| `panel5.audio.blueprint.js` | Mapa de conexiones de la matriz de audio (filas/columnas) |
| `panel5.audio.config.js` | Ganancias y atenuaciones para cada cruce de matriz |
| `panel6.control.blueprint.js` | Mapa de conexiones de la matriz de control |
| `panel6.control.config.js` | Ganancias para señales de control (CV) |

---

## 4. Flujo de Audio

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Módulos    │────▶│   Matriz    │────▶│   Buses     │
│ (Osc, Noise)│     │  de Audio   │     │  Lógicos    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐     ┌──────▼──────┐
                    │   Audio     │◀────│   Router    │
                    │  Context    │     │   Maestro   │
                    │ destination │     │  (L/R mix)  │
                    └─────────────┘     └─────────────┘
```

1. **Módulos** producen señales de audio y las exponen como `AudioNode`
2. **Matriz de Audio** (Panel 5) determina qué módulos se conectan a qué buses
3. **Buses Lógicos** (8) suman señales y aplican nivel (faders)
4. **Router Maestro** mezcla los 8 buses en salida estéreo (L/R)
5. **AudioContext.destination** emite el audio final

---

## 5. Sistema de AudioWorklets

### Motivación

Los `OscillatorNode` nativos de Web Audio tienen limitaciones:
- `setPeriodicWave()` cambia la forma de onda instantáneamente → **clicks audibles**
- No exponen la **fase** del oscilador → imposible implementar **hard sync**

Para resolver esto, SynthiGME-web usa **AudioWorklet** para osciladores que requieren:
- Modulación suave de parámetros (pulse width, sine symmetry)
- Acceso a la fase interna (para sincronización futura)

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    Hilo Principal (JS)                      │
│  ┌─────────────────┐     ┌─────────────────┐               │
│  │  AudioEngine    │────▶│ AudioWorkletNode │              │
│  │ createSynthOsc()│     │  (proxy)         │              │
│  └─────────────────┘     └────────┬─────────┘              │
└───────────────────────────────────┼─────────────────────────┘
                                    │ MessagePort
┌───────────────────────────────────┼─────────────────────────┐
│                    Hilo de Audio (Worklet)                  │
│                          ┌────────▼─────────┐               │
│                          │ SynthOscillator  │               │
│                          │   Processor      │               │
│                          │  - phase         │               │
│                          │  - polyBLEP      │               │
│                          │  - hard sync     │               │
│                          └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### SynthOscillatorProcessor

**Formas de onda disponibles:**
- `pulse` — con parámetro `pulseWidth` (0.0–1.0)
- `sine` — con parámetro `symmetry` (0.0–1.0) para simetría variable
- `triangle` — onda triangular
- `sawtooth` — diente de sierra

**Características:**
- **Fase coherente**: la fase se mantiene al cambiar parámetros
- **Anti-aliasing PolyBLEP**: reduce aliasing en transiciones abruptas (pulse, saw)
- **Hard sync**: entrada 0 reservada para señal de sincronización (zero-crossing detection)

### API de Uso

```javascript
// Esperar a que el worklet esté listo
await engine.ensureWorkletReady();

// Crear oscilador
const osc = engine.createSynthOscillator({
  waveform: 'pulse',  // 'pulse' | 'sine' | 'triangle' | 'sawtooth'
  frequency: 440,
  pulseWidth: 0.5,    // solo para pulse
  symmetry: 0.5,      // solo para sine
  gain: 1.0
});

// Conectar
osc.connect(destination);

// Modular parámetros (sin clicks)
osc.setFrequency(880);
osc.setPulseWidth(0.3);
osc.setSymmetry(0.7);
osc.setWaveform('sawtooth');

// Detener
osc.stop();
```

### Fallback

Si el navegador no soporta AudioWorklet o falla la carga:
- `engine.workletReady` será `false`
- Los paneles usan `OscillatorNode` nativo como fallback
- La funcionalidad de hard sync no estará disponible

---

## 6. Sistema de Salidas

### Arquitectura de 8 Buses Lógicos

El Synthi 100 original tiene 8 salidas independientes. SynthiGME-web implementa:

- **8 buses lógicos** con `GainNode` independiente cada uno
- **Mezcla a 2 canales físicos** (L/R) — el navegador limita a estéreo
- **Modulación CV** — `OutputRouterModule` expone los niveles como `AudioParam` para que otros módulos (LFO, envolvente) puedan modularlos

### API de Buses

```javascript
// AudioEngine
engine.logicalBuses[0..7]  // GainNodes de cada bus
engine.setOutputLevel(busIndex, value)
engine.connectSourceToOutput(busIndex, node)
```

### Futuro: Salida Multicanal
Si `audioCtx.destination.maxChannelCount > 2`, el router podrá asignar buses a canales físicos adicionales sin modificar los módulos.

---

## 7. Sistema de Matrices

### Matriz de Audio (Panel 5)
- **63 filas** (fuentes: osciladores, filtros, etc.)
- **67 columnas** (destinos: buses, entradas de módulos)
- Cada pin conecta una fuente a un destino con ganancia configurable

### Matriz de Control (Panel 6)
- Rutea señales de control (CV) entre módulos
- Permite modulaciones complejas (ej: LFO → frecuencia de oscilador)

### Blueprint Schema
```javascript
{
  schemaVersion: '1.0.0',
  rows: [{ id: 'osc1', label: 'Osc 1', kind: 'audio' }, ...],
  columns: [{ id: 'bus1', label: 'Out 1', kind: 'audio' }, ...],
  getValue: (row, col) => 0.5  // ganancia por defecto
}
```

---

## 8. Build y Distribución

### Scripts (`package.json`)

| Script | Descripción |
|--------|-------------|
| `npm run build` | Genera bundle de producción en `docs/` |
| `npm run dev` | Modo desarrollo con watch |
| `npm run pre-release` | Incrementa versión y prepara changelog |
| `npm run post-release` | Crea tag git y publica |

### Proceso de Build (`scripts/build.mjs`)

1. Limpia directorio de salida
2. Copia assets estáticos (HTML, manifest, SW, iconos)
3. Bundlea JS con esbuild (ES2020, minificado)
4. Bundlea CSS con esbuild
5. **Copia AudioWorklets sin bundlear** (deben ser archivos separados)
6. Inyecta versión desde `package.json` en el código
7. Optimiza SVGs de paneles con svgo

### Salida
```
docs/
├── index.html
├── manifest.webmanifest
├── sw.js
└── assets/
    ├── css/main.css      # CSS minificado
    ├── js/
    │   ├── app.js        # Bundle JS único
    │   └── worklets/     # AudioWorklet modules (no bundleados)
    │       └── synthOscillator.worklet.js
    ├── panels/           # SVGs optimizados
    └── pwa/icons/
```

---

## 9. PWA (Progressive Web App)

- **Service Worker** (`sw.js`): Cache de assets para uso offline
- **Web Manifest**: Permite instalación como app nativa
- **Iconos**: Múltiples resoluciones para diferentes dispositivos

---

## 10. Patrones de Código

### Módulos de Audio
- Extienden clase base `Module` de `engine.js`
- Implementan `start()`, `stop()`, `createUI()`
- Registran `inputs` y `outputs` para la matriz

### Configuración Declarativa
- Blueprints separan datos de lógica
- Configs contienen valores de calibración editables
- Versionado de schemas para migraciones

### UI Reactiva Manual
- Eventos DOM nativos
- Sin virtual DOM — manipulación directa
- SVG para controles visuales (knobs, matrices)

---

## 11. Consideraciones Futuras

- [ ] **Hard sync**: Conectar señal de sincronización a entrada del worklet (Panel 6)
- [ ] **Paneo por bus**: Añadir control de panorama a cada bus lógico
- [ ] **Presets**: Sistema de guardado/carga de patches
- [ ] **MIDI**: Soporte para controladores externos
- [ ] **Multicanal**: Ruteo a más de 2 salidas físicas si el navegador lo permite
- [ ] **CV para faders**: Validar estabilidad antes de exponer todos los faders como AudioParam
