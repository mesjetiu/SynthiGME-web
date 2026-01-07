# SynthiGME-web — Arquitectura del Proyecto

> Emulador web del sintetizador EMS Synthi 100 usando Web Audio API.  
> Última actualización: 7 de enero de 2026

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
        ├── i18n/           # Sistema de internacionalización
        ├── utils/          # Utilidades (canvas, SW, versión)
        ├── worklets/       # AudioWorklet processors (síntesis en hilo de audio)
        └── panelBlueprints/# Blueprints (estructura) y Configs (parámetros)
```

### 2.1 Créditos de Assets

| Recurso | Autor/Fuente | Licencia |
|---------|--------------|----------|
| Iconos de interfaz (Tabler) | [tabler/tabler-icons](https://github.com/tabler/tabler-icons) | MIT (ver `assets/icons/LICENSE.tabler-icons.txt`) |
| Iconos de paneles del sintetizador | Sylvia Molina Muro | — |
| SVGs de paneles | Basados en el Synthi 100 original de EMS | — |

---

## 3. Módulos JavaScript

### 3.1 Core (`src/assets/js/core/`)

| Archivo | Propósito |
|---------|-----------|
| `engine.js` | `AudioEngine` gestiona el `AudioContext`, buses de salida (8 lógicos → 2 físicos), registro de módulos, carga de AudioWorklets, y clase base `Module`. Métodos clave: `setOutputLevel()`, `setOutputPan()`, `setOutputRouting()` (ruteo directo L/R). Exporta también `AUDIO_CONSTANTS` (tiempos de rampa) y `setParamSmooth()` (helper para cambios suaves de AudioParam) |
| `matrix.js` | Lógica de conexión de pines para matrices pequeñas |
| `recordingEngine.js` | `RecordingEngine` gestiona grabación de audio multitrack. Captura samples de buses de salida configurables, ruteo mediante matriz outputs→tracks, exportación a WAV 16-bit PCM. Persistencia de configuración en localStorage |

### 3.2 Worklets (`src/assets/js/worklets/`)

Procesadores de audio que corren en el hilo de audio para síntesis de alta precisión:

| Archivo | Propósito |
|---------|----------|
| `synthOscillator.worklet.js` | Oscilador con fase coherente, 4 formas de onda (pulse, sine, triangle, sawtooth), anti-aliasing PolyBLEP, y entrada para hard sync |
| `noiseGenerator.worklet.js` | Generador de ruido con algoritmo Voss-McCartney para ruido rosa (-3dB/octava) y blanco, con parámetro `colour` para interpolación |
| `scopeCapture.worklet.js` | Captura sincronizada de dos canales para osciloscopio con trigger Schmitt, histéresis temporal, anclaje predictivo y detección de período |
| `recordingCapture.worklet.js` | Captura de samples de audio multicanal para grabación WAV. Recibe N canales y envía bloques Float32 al hilo principal para acumulación |

### 3.3 Modules (`src/assets/js/modules/`)

Cada módulo representa un componente de audio del Synthi 100:

| Archivo | Módulo | Descripción |
|---------|--------|-------------|
| `oscillator.js` | `OscillatorModule` | Oscilador básico con forma de onda configurable |
| `pulse.js` | `PulseModule` | Oscilador de onda cuadrada/pulso con ancho variable |
| `noise.js` | `NoiseModule` | Generador de ruido blanco/rosa con AudioWorklet (Voss-McCartney) |
| `inputAmplifier.js` | `InputAmplifierModule` | 8 canales de entrada con control de ganancia individual |
| `oscilloscope.js` | `OscilloscopeModule` | Osciloscopio dual con modos Y-T y X-Y (Lissajous), trigger configurable |
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
| `knob.js` | `Knob` | Control rotativo SVG con eventos de arrastre, curvas de respuesta configurable |
| `toggle.js` | `Toggle` | Interruptor de dos estados con etiquetas personalizables |
| `moduleFrame.js` | `ModuleFrame` | Contenedor visual para módulos con título y controles |
| `moduleUI.js` | `ModuleUI` | Clase base para módulos UI con knobs. Centraliza creación de controles, headers y gestión de valores |
| `oscilloscopeDisplay.js` | `OscilloscopeDisplay` | Canvas para visualización de onda con efecto CRT, knobs TIME/AMP/LEVEL, render sincronizado con rAF |
| `noiseGenerator.js` | — | UI para generadores de ruido (knobs colour/level) |
| `randomVoltage.js` | — | UI para generador de voltaje aleatorio |
| `inputAmplifierUI.js` | `InputAmplifierUI` | UI para los 8 canales de entrada (8 knobs de nivel en fila horizontal) |
| `largeMatrix.js` | `LargeMatrix` | Matriz de pines 63×67 con toggle y visualización |
| `panelManager.js` | `PanelManager` | Gestión de paneles, carga de SVG, posicionamiento |
| `sgmeOscillator.js` | `SgmeOscillator` | UI compuesta de oscilador (knobs + display) |
| `outputRouter.js` | — | Helper para UI del router de salidas |
| `audioSettingsModal.js` | `AudioSettingsModal` | Modal de configuración de audio: matriz de salida (8 buses → N canales físicos), matriz de entrada (N entradas sistema → 8 Input Amplifiers), selección de dispositivos, detección automática de canales, persistencia en localStorage |
| `settingsModal.js` | `SettingsModal` | Modal de ajustes generales: selección de idioma (español/inglés), escala de renderizado (1×-4×), cambio de idioma en caliente, persistencia en localStorage |
| `recordingSettingsModal.js` | `RecordingSettingsModal` | Modal de configuración de grabación: selector de número de pistas (1-8), matriz de ruteo outputs→tracks, configuración de qué buses del sintetizador van a qué pistas del archivo WAV |
| `confirmDialog.js` | `ConfirmDialog` | Modal de confirmación reutilizable (singleton): título, mensaje, botones personalizables, opción "no volver a preguntar" con persistencia localStorage. Métodos estáticos `show()`, `getRememberedChoice()`, `clearRememberedChoice()` |
| `keyboardShortcuts.js` | `KeyboardShortcutsManager` | Gestor centralizado de atajos de teclado (singleton): acciones configurables (mute, record, patches, settings, fullscreen, reset, navegación paneles), persistencia en localStorage, teclas reservadas (Tab, Enter, Escape) |
| `patchBrowser.js` | `PatchBrowser` | Modal para gestionar patches: guardar, cargar, eliminar, renombrar, exportar/importar archivos `.sgme.json`, búsqueda por nombre |
| `quickbar.js` | — | Barra de acciones rápidas para móvil (bloqueo zoom/pan, ajustes, configuración de audio, pantalla completa) |

### 3.5 Navigation (`src/assets/js/navigation/`)

Sistema de navegación del viewport:

| Archivo | Propósito |
|---------|-----------|
| `viewportNavigation.js` | Zoom/pan/pinch del viewport, animación a paneles, botones de enfoque |

#### Gestos Táctiles Soportados

| Gesto | Acción | Notas |
|-------|--------|-------|
| **Un dedo** | Pan (arrastrar) | Solo en zonas no interactivas |
| **Dos dedos** | Pan + Zoom simultáneo | El centroide de los dos dedos controla el pan, la distancia controla el zoom |
| **Pinch** | Zoom con ancla | El zoom se centra en el punto medio entre dedos |

#### Sistema de Bloqueos (Móvil)

La quickbar permite bloquear gestos para evitar navegación accidental:

| Bloqueo | Efecto |
|---------|--------|
| `zoomLocked` | Ignora cambios de distancia en pinch |
| `panLocked` | Ignora desplazamiento del centroide, ancla zoom en centro de viewport |

### 3.6 Utils (`src/assets/js/utils/`)

Utilidades compartidas:

| Archivo | Propósito |
|---------|-----------|
| `canvasBackground.js` | Renderizado de fondos SVG en canvas para móviles |
| `serviceWorker.js` | Registro y actualización del Service Worker |
| `buildVersion.js` | Detección e inyección de versión de build |
| `input.js` | Guardas de interacción: `shouldBlockInteraction()` e `isNavGestureActive()` para evitar conflictos táctiles durante navegación |
| `waveforms.js` | Síntesis de formas de onda: `createPulseWave()` y `createAsymmetricSineWave()` usando Fourier |
| `objects.js` | Utilidades de objetos: `deepMerge()` para combinar configuraciones |

### 3.7 Internacionalización (`src/assets/js/i18n/`)

Sistema de i18n basado en YAML con generación automática de locales.

#### Arquitectura

| Archivo | Propósito |
|---------|----------|
| `translations.yaml` | **Fuente única** de todas las traducciones (editar aquí) |
| `index.js` | Core i18n: `t(key)`, `setLocale()`, `getLocale()`, `onLocaleChange()` |
| `locales/_meta.js` | Metadatos generados (idiomas soportados, por defecto) |
| `locales/es.js` | Traducciones en español (auto-generado) |
| `locales/en.js` | Traducciones en inglés (auto-generado) |

> ⚠️ **Los archivos `locales/*.js` son auto-generados. NO editarlos manualmente.**
> 
> Editar siempre `translations.yaml` y ejecutar `npm run build:i18n`

#### Flujo de trabajo

```
translations.yaml  ──[npm run build:i18n]──►  locales/*.js
     (editar)                                  (generados)
```

#### Estructura del YAML

```yaml
# Metadatos de idiomas (nombres en su idioma nativo)
_meta:
  defaultLocale: es
  languages:
    en: English
    es: Español
    fr: Français  # ← añadir aquí nuevos idiomas

# Traducciones: clave con un valor por idioma
settings.title:
  en: Settings
  es: Ajustes

# Variables usan {placeholder}
toast.resolution:
  en: "Scale: {factor}×"
  es: "Escala: {factor}×"
```

#### Uso en código

```javascript
import { t, setLocale, onLocaleChange } from './i18n/index.js';

// Traducir texto
title.textContent = t('settings.title');  // "Ajustes" o "Settings"

// Con interpolación
toast.textContent = t('toast.resolution', { factor: 2 });  // "Escala: 2×"

// Cambiar idioma (notifica listeners)
await setLocale('en');

// Suscribirse a cambios
const unsub = onLocaleChange(lang => this._updateTexts());
```

#### Añadir nuevos textos

1. Editar `translations.yaml`:
```yaml
mi.nueva.clave:
  en: Text in English
  es: Texto en español
```

2. Regenerar locales:
```bash
npm run build:i18n
```

3. Usar en código:
```javascript
elemento.textContent = t('mi.nueva.clave');
```

#### Añadir un nuevo idioma

1. Añadir el idioma en `_meta.languages`:
```yaml
_meta:
  languages:
    en: English
    es: Español
    fr: Français  # nuevo
```

2. Añadir traducciones a cada clave:
```yaml
settings.title:
  en: Settings
  es: Ajustes
  fr: Paramètres  # nuevo
```

3. Regenerar:
```bash
npm run build:i18n
```

El sistema detectará automáticamente el nuevo idioma y generará `locales/fr.js`.

#### Convención de claves

Las claves siguen el patrón `componente.seccion.elemento`:

| Prefijo | Uso |
|---------|-----|
| `settings.*` | Modal de ajustes generales |
| `audio.*` | Modal de configuración de audio |
| `quickbar.*` | Barra de acciones rápidas |
| `toast.*` | Mensajes toast temporales |
| `error.*` | Mensajes de error |

#### Actualizar componentes existentes para i18n

Para hacer traducible un componente existente:

1. Importar `t` y `onLocaleChange`
2. Guardar referencias a elementos con texto
3. Crear método `_updateTexts()` que actualice todos los textos
4. Suscribirse a cambios: `onLocaleChange(() => this._updateTexts())`

```javascript
import { t, onLocaleChange } from '../i18n/index.js';

constructor() {
  this._create();
  this._unsubscribeLocale = onLocaleChange(() => this._updateTexts());
}

_updateTexts() {
  this.titleElement.textContent = t('mi.titulo');
}
```

### 3.8 Panel Blueprints (`src/assets/js/panelBlueprints/`)

Configuración declarativa de estructura y parámetros de paneles. Sigue el patrón **Blueprint vs Config**:

#### Patrón Blueprint vs Config

Los paneles se configuran con **dos archivos separados** por responsabilidad:

| Tipo | Extensión | Contenido | Cuándo modificar |
|------|-----------|-----------|------------------|
| **Blueprint** | `.blueprint.js` | Estructura visual, slots, layout, mapeo a matriz | Al cambiar posiciones o añadir/quitar módulos |
| **Config** | `.config.js` | Parámetros de audio, rangos de knobs, calibración | Al ajustar sonido o respuesta de controles |

**Ventajas de esta separación:**
- Editar layout sin afectar comportamiento de audio
- Calibrar parámetros sin romper estructura visual
- Reutilizar blueprints con diferentes configuraciones
- Versionado independiente de estructura y calibración

#### Archivos

| Archivo | Tipo | Contenido |
|---------|------|-----------|
| `panel2.blueprint.js` | Blueprint | Layout del panel de osciloscopio (secciones, frame, controles, toggle Y-T/X-Y) |
| `panel2.config.js` | Config | Parámetros de visualización (resolución CRT, glow, colores), audio (buffer, trigger, Schmitt) y knobs (TIME, AMP, LEVEL) |
| `panel3.blueprint.js` | Blueprint | Layout del panel (grid 2×6), slots de osciladores, proporciones de módulos (Noise, RandomCV), mapeo a matriz |
| `panel3.config.js` | Config | Rangos de frecuencia, niveles, tiempos de suavizado, parámetros Voss-McCartney |
| `panel5.audio.blueprint.js` | Blueprint | Mapa de conexiones de la matriz de audio (filas/columnas), fuentes y destinos |
| `panel5.audio.config.js` | Config | Ganancias y atenuaciones para cada cruce de matriz |
| `panel6.control.blueprint.js` | Blueprint | Mapa de conexiones de la matriz de control |
| `panel6.control.config.js` | Config | Ganancias para señales de control (CV) |

#### Ejemplo de Blueprint (estructura)
```javascript
// panel3.blueprint.js
export default {
  schemaVersion: 1,
  panelId: 'panel-3',
  layout: {
    oscillators: { columns: 2, rowsPerColumn: 6, oscSize: { width: 200, height: 90 } },
    modulesRow: { height: 80, proportions: { noise1: 2/9, noise2: 2/9, randomCV: 5/9 } }
  },
  oscillatorSlots: [
    { oscIndex: 0, col: 0, row: 0 },  // Osc 1
    { oscIndex: 1, col: 1, row: 0 },  // Osc 2
    // ...
  ],
  modules: {
    noise1: { id: 'noise-1', type: 'noiseGenerator', matrixRow: 89 },
    noise2: { id: 'noise-2', type: 'noiseGenerator', matrixRow: 90 }
  },
  matrixMapping: { noiseGenerators: { noise1: 89, noise2: 90 } }
};
```

#### Ejemplo de Config (parámetros)
```javascript
// panel3.config.js
export default {
  noiseDefaults: {
    levelSmoothingTime: 0.03,  // 30ms (evita clicks)
    colourSmoothingTime: 0.01,
    vossOctaves: 8             // Octavas del algoritmo Voss-McCartney
  },
  noise1: {
    knobs: {
      colour: { min: 0, max: 1, initial: 0, label: 'Colour' },
      level: { min: 0, max: 1, initial: 0, label: 'Level' }
    }
  }
};
```

---

## 4. Sistema de Patches/Estados

El sistema de patches permite guardar y restaurar el estado completo del sintetizador.

### 4.1 Arquitectura

```
src/assets/js/state/
├── index.js       # API pública (re-exporta todo)
├── schema.js      # Estructura de patches, validación, IDs de módulos
├── storage.js     # Persistencia: IndexedDB para patches, localStorage para sesión
├── conversions.js # Conversiones knob ↔ valores físicos (curvas)
└── migrations.js  # Migraciones entre versiones de formato
```

### 4.2 Almacenamiento

| Tipo | Ubicación | Propósito |
|------|-----------|-----------|
| **Patches guardados** | IndexedDB `synthigme-patches` | Patches con nombre guardados manualmente por el usuario |
| **Último estado** | localStorage `synthigme-last-state` | Autoguardado periódico y al cerrar, para recuperación |
| **Configuración** | localStorage `synthigme-autosave-interval` | Intervalo de autoguardado seleccionado |

### 4.3 Formato de Patch

```javascript
{
  name: "Mi Patch",           // Nombre del patch
  savedAt: "2026-01-04T...",  // Timestamp ISO
  modules: {
    oscillators: {
      "panel1-osc-1": { knobs: [0.5, 0.3, ...], rangeState: "hi" },
      "panel3-osc-1": { ... }
    },
    noise: {
      "panel3-noise-1": { colour: 0.5, level: 0.7 }
    },
    randomVoltage: { ... },
    outputFaders: { levels: [0, 0, 0, 0, 0, 0, 0, 0] },
    inputAmplifiers: { levels: [0, 0, 0, 0, 0, 0, 0, 0] },
    matrixAudio: { connections: [[row, col], ...] },
    matrixControl: { connections: [[row, col], ...] }
  }
}
```

### 4.4 Autoguardado

El sistema guarda automáticamente el estado para prevenir pérdida de trabajo:

| Evento | Comportamiento |
|--------|----------------|
| **Intervalo periódico** | Guarda cada X segundos/minutos (configurable en Ajustes) |
| **Cerrar página** | Guarda en `beforeunload` (incluye recarga, cierre de pestaña, etc.) |
| **Al iniciar** | Pregunta al usuario si desea restaurar el último estado guardado |

**Opciones de intervalo:** Desactivado, 30s, 1m, 5m, 10m

> ⚠️ `beforeunload` se dispara en **cualquier** cierre o recarga (F5, Ctrl+R, cerrar pestaña, etc.)

### 4.5 Serialización

Cada módulo UI implementa `serialize()` y `deserialize()`:

```javascript
// En SGME_Oscillator, ModuleUI, LargeMatrix, etc.
serialize() {
  return {
    knobs: this.knobs.map(k => k.getValue()),
    rangeState: this.rangeState
  };
}

deserialize(data) {
  if (data.knobs) {
    data.knobs.forEach((v, i) => this.knobs[i]?.setValue(v));
  }
}
```

### 4.6 Módulos con Serialización

| Clase | Archivo | Qué serializa |
|-------|---------|---------------|
| `SGME_Oscillator` | `ui/sgmeOscillator.js` | 7 knobs + rangeState (hi/lo) |
| `ModuleUI` (base) | `ui/moduleUI.js` | Todos los knobs por key |
| `NoiseGenerator` | `ui/noiseGenerator.js` | colour, level (hereda de ModuleUI) |
| `RandomVoltage` | `ui/randomVoltage.js` | mean, variance, voltage1, voltage2, key |
| `InputAmplifierUI` | `ui/inputAmplifierUI.js` | 8 niveles de ganancia |
| `OutputFaderModule` | `modules/outputFaders.js` | 8 niveles de salida |
| `LargeMatrix` | `ui/largeMatrix.js` | Array de conexiones [row, col] |

### 4.7 PatchBrowser UI

Modal para gestionar patches (`ui/patchBrowser.js`):

| Acción | Descripción |
|--------|-------------|
| **Guardar** | Serializa estado actual, pide nombre, guarda en IndexedDB |
| **Cargar** | Selecciona patch, confirma, aplica `deserialize()` a todos los módulos |
| **Eliminar** | Borra patch de IndexedDB |
| **Renombrar** | Cambia nombre del patch |
| **Exportar** | Descarga como archivo `.sgme.json` |
| **Importar** | Carga archivo `.sgme.json` y lo guarda en IndexedDB |
| **Buscar** | Filtra lista de patches por nombre |

### 4.8 Flujo de Datos

```
┌─────────────┐     serialize()      ┌──────────────┐
│  UI Modules │ ──────────────────► │ Patch Object │
│  (knobs,    │                      │  { modules } │
│   matrix)   │ ◄────────────────── │              │
└─────────────┘    deserialize()     └──────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
             ┌─────────────┐       ┌──────────────┐      ┌───────────────┐
             │  IndexedDB  │       │ localStorage │      │  .sgme.json   │
             │  (patches)  │       │ (last-state) │      │  (export)     │
             └─────────────┘       └──────────────┘      └───────────────┘
```

### 4.9 Uso en Código

```javascript
// Serializar estado actual
const state = this._serializeCurrentState();  // { modules: {...} }

// Guardar en IndexedDB
import { savePatch } from './state/index.js';
await savePatch({ name: 'Mi Patch', ...state });

// Cargar y aplicar
import { loadPatch } from './state/index.js';
const patch = await loadPatch(patchId);
await this._applyPatch(patch);

// Listar patches
import { listPatches } from './state/index.js';
const patches = await listPatches();  // [{ id, name, savedAt }, ...]
```

---

## 5. Sistema de Osciloscopio

El osciloscopio es uno de los módulos más complejos, implementando técnicas profesionales de estabilización visual.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                 AUDIO THREAD (Worklet)                      │
│  scopeCapture.worklet.js                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Ring Buffer (2× bufferSize)                         │    │
│  │ ├── Schmitt Trigger (histéresis de nivel)           │    │
│  │ ├── Histéresis temporal (holdoff entre triggers)    │    │
│  │ ├── Detección de período (ciclos completos)         │    │
│  │ └── Anclaje predictivo (estabilidad entre frames)   │    │
│  └─────────────────────────────────────────────────────┘    │
│           │ postMessage @ ~43 Hz                            │
└───────────┼─────────────────────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    MAIN THREAD                              │
│  ┌───────────────────┐     ┌────────────────────────────┐   │
│  │ OscilloscopeModule│────▶│ OscilloscopeDisplay        │   │
│  │ oscilloscope.js   │     │ oscilloscopeDisplay.js     │   │
│  │ - Gestión worklet │     │ - Canvas con efecto CRT    │   │
│  │ - Callbacks datos │     │ - Render loop (rAF sync)   │   │
│  │ - Setters config  │     │ - Knobs TIME/AMP/LEVEL     │   │
│  └───────────────────┘     │ - Indicador TRIG/AUTO      │   │
│                            └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Técnicas de Estabilización del Trigger

| Técnica | Propósito | Configuración |
|---------|-----------|---------------|
| **Schmitt Trigger** | Evita disparos múltiples por oscilación cerca del umbral | `schmittHysteresis: 0.05` (5% del rango) |
| **Histéresis temporal** | Ignora triggers por armónicos/ruido | `triggerHysteresis: 150` samples |
| **Detección de período** | Muestra solo ciclos completos | Automático entre triggers |
| **Anclaje predictivo** | Predice posición del siguiente trigger | Basado en período anterior |

### Modos de Visualización

- **Y-T**: Forma de onda tradicional (amplitud vs tiempo)
- **X-Y (Lissajous)**: Canal X horizontal, canal Y vertical

### Efecto CRT

El display simula la apariencia de un osciloscopio analógico:
- Resolución interna baja (400×300) para aspecto pixelado
- Línea gruesa (3px) con puntas redondeadas
- Glow (shadowBlur) para fosforescencia del fósforo

### Sincronización con Monitor

El render usa `requestAnimationFrame` para sincronizar el dibujo con el refresco del monitor (60+ Hz), evitando tearing aunque el worklet envíe datos a ~43 Hz.

---

## 6. Sistema de Grabación de Audio

El sistema de grabación permite exportar audio multitrack a formato WAV, capturando directamente de los buses de salida.

### Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN THREAD                              │
│  ┌───────────────────┐     ┌────────────────────────────┐   │
│  │  RecordingEngine  │────▶│  RecordingSettingsModal    │   │
│  │ recordingEngine.js│     │ recordingSettingsModal.js  │   │
│  │ - Start/Stop      │     │ - Configurar tracks        │   │
│  │ - Routing matrix  │     │ - Matriz outputs→tracks    │   │
│  │ - WAV export      │     │ - UI de configuración      │   │
│  └────────┬──────────┘     └────────────────────────────┘   │
│           │ connect()                                        │
│           ▼                                                  │
│  ┌───────────────────────────────────────────────────┐      │
│  │  AudioWorkletNode (recording-capture-processor)   │      │
│  │  - Recibe N canales (buses ruteados)              │      │
│  └────────┬──────────────────────────────────────────┘      │
└───────────┼─────────────────────────────────────────────────┘
            │ postMessage (Float32 samples)
┌───────────┼─────────────────────────────────────────────────┐
│           ▼           AUDIO THREAD (Worklet)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ RecordingCaptureProcessor                            │   │
│  │ recordingCapture.worklet.js                          │   │
│  │ - Copia bloques de 128 samples por canal             │   │
│  │ - Envía al main thread para acumulación              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Matriz de Ruteo

El sistema usa una matriz configurable para determinar qué buses de salida van a qué pistas del archivo WAV:

| Configuración | Descripción |
|---------------|-------------|
| **Número de pistas** | 1-8 tracks en el archivo WAV final |
| **Matriz outputs→tracks** | Cada bus de salida puede rutearse a una o más pistas |
| **Por defecto** | Bus 1→Track 1, Bus 2→Track 2, etc. (mapeo diagonal) |

### Formato de Exportación

- **Formato**: WAV (RIFF)
- **Bits por sample**: 16-bit PCM
- **Sample rate**: Igual que AudioContext (típicamente 44100 o 48000 Hz)
- **Canales**: Configurable (1-8 tracks)

### Flujo de Grabación

```
┌─────────────┐    ┌────────────────┐    ┌─────────────────┐
│ Bus Outputs │───▶│ Routing Matrix │───▶│ Track Mixers    │
│ (8 buses)   │    │ (gains 0/1)    │    │ (GainNodes)     │
└─────────────┘    └────────────────┘    └───────┬─────────┘
                                                  │
                   ┌──────────────────────────────▼─────────┐
                   │     RecordingCaptureProcessor          │
                   │     (AudioWorklet)                     │
                   └────────────────────┬───────────────────┘
                                        │ Float32 chunks
                                        ▼
                   ┌────────────────────────────────────────┐
                   │   Track Buffers (acumulación)          │
                   │   Float32Array[] por track             │
                   └────────────────────┬───────────────────┘
                                        │ stop()
                                        ▼
                   ┌────────────────────────────────────────┐
                   │   WAV Encoder (16-bit PCM)             │
                   │   → Descarga archivo .wav              │
                   └────────────────────────────────────────┘
```

### Persistencia

| Dato | Almacenamiento | Clave localStorage |
|------|----------------|---------------------|
| Número de pistas | localStorage | `synthigme-recording-tracks` |
| Matriz de ruteo | localStorage | `synthigme-recording-routing` |

### API de Uso

```javascript
// Obtener RecordingEngine
const recording = app.recordingEngine;

// Configurar pistas y ruteo (vía RecordingSettingsModal)
recording.trackCount = 4;
recording.setRouting(busIndex, trackIndex, gain);

// Iniciar/detener grabación
await recording.start();
const wavBlob = await recording.stop();  // Retorna Blob WAV

// Descargar archivo
const url = URL.createObjectURL(wavBlob);
const a = document.createElement('a');
a.href = url;
a.download = `recording-${Date.now()}.wav`;
a.click();
```

---

## 7. Sistema de Atajos de Teclado

Gestor centralizado de shortcuts con soporte para personalización y persistencia.

### Arquitectura

El sistema usa un singleton `KeyboardShortcutsManager` que:
- Registra un único listener `keydown` global
- Mapea combinaciones de teclas a acciones
- Soporta modificadores (Shift, Ctrl, Alt)
- Persiste configuración personalizada en localStorage

### Atajos por Defecto

| Acción | Tecla | Descripción |
|--------|-------|-------------|
| `mute` | `M` | Mute global / panic button — silencia toda la salida |
| `record` | `R` | Iniciar/detener grabación de audio |
| `patches` | `P` | Abrir/cerrar navegador de patches |
| `settings` | `S` | Abrir/cerrar modal de ajustes |
| `fullscreen` | `F` | Alternar pantalla completa |
| `reset` | `Shift+I` | Reiniciar sintetizador a valores por defecto (con confirmación) |
| `panel1` | `1` | Navegar al Panel 1 |
| `panel2` | `2` | Navegar al Panel 2 |
| `panel3` | `3` | Navegar al Panel 3 |
| `panel4` | `4` | Navegar al Panel 4 |
| `panel5` | `5` | Navegar al Panel 5 (Matriz Audio) |
| `panel6` | `6` | Navegar al Panel 6 (Matriz Control) |
| `panelOutput` | `7` | Navegar al Panel de Salida |
| `overview` | `0` | Vista general (todos los paneles) |

### Teclas Reservadas

Las siguientes teclas no pueden asignarse a acciones:
- `Tab` — Navegación del foco
- `Enter` — Confirmación
- `Escape` — Cancelación/cierre
- `Space` — Interacción con controles

### Eventos Disparados

Las acciones emiten eventos personalizados en `document`:

| Evento | Acción |
|--------|--------|
| `synth:toggleMute` | Mute global |
| `synth:toggleRecording` | Grabación |
| `synth:togglePatches` | Navegador patches |
| `synth:toggleSettings` | Modal ajustes |
| `synth:resetToDefaults` | Reinicio (tras confirmación) |

### Persistencia

| Dato | Clave localStorage |
|------|---------------------|
| Atajos personalizados | `synthigme-keyboard-shortcuts` |

### API de Uso

```javascript
import keyboardShortcuts from './ui/keyboardShortcuts.js';

// Habilitar/deshabilitar
keyboardShortcuts.enable();
keyboardShortcuts.disable();

// Obtener atajo actual para una acción
const shortcut = keyboardShortcuts.get('mute');  // { key: 'm', shift: false, ... }

// Modificar atajo
keyboardShortcuts.set('mute', { key: 'x', shift: true, ctrl: false, alt: false });

// Resetear a defaults
keyboardShortcuts.reset();

// Suscribirse a cambios
keyboardShortcuts.onChange(shortcuts => console.log(shortcuts));
```

---

## 8. Flujo de Audio

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

## 9. Sistema de AudioWorklets

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
│  ┌─────────────────┐     ┌──────────────────┐               │
│  │  AudioEngine    │────▶│ AudioWorkletNode │               │
│  │ createSynthOsc()│     │  (proxy)         │               │
│  └─────────────────┘     └────────┬─────────┘               │
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

## 10. Sistema de Salidas

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

## 11. Sistema de Matrices

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

## 12. Build y Distribución

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

## 13. PWA (Progressive Web App)

- **Service Worker** (`sw.js`): Cache de assets para uso offline
- **Web Manifest**: Permite instalación como app nativa
- **Iconos**: Múltiples resoluciones para diferentes dispositivos

---

## 14. Patrones de Código

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

## 15. Consideraciones Futuras

- [ ] **Hard sync**: Conectar señal de sincronización a entrada del worklet (Panel 6)
- [ ] **Paneo por bus**: Añadir control de panorama a cada bus lógico
- [x] **Presets**: Sistema de guardado/carga de patches → Ver [Sección 4](#4-sistema-de-patchesestados)
- [x] **Grabación**: Sistema de grabación multitrack WAV → Ver [Sección 6](#6-sistema-de-grabación-de-audio)
- [x] **Atajos de teclado**: Sistema de shortcuts personalizables → Ver [Sección 7](#7-sistema-de-atajos-de-teclado)
- [ ] **MIDI**: Soporte para controladores externos
- [ ] **Multicanal**: Ruteo a más de 2 salidas físicas si el navegador lo permite
- [ ] **CV para faders**: Validar estabilidad antes de exponer todos los faders como AudioParam
- [ ] **Interpolación de frames**: Suavizado adicional entre frames del osciloscopio si es necesario
- [ ] **Trigger externo**: Permitir sincronizar osciloscopio con señal externa (otro oscilador)
