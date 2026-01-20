# SynthiGME-web — Arquitectura del Proyecto

> Emulador web del sintetizador EMS Synthi 100 usando Web Audio API.  
> Última actualización: 20 de enero de 2026 (paneles flotantes PiP)

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
        ├── state/          # Gestión de estado, patches, sesión
        ├── i18n/           # Sistema de internacionalización
        ├── utils/          # Utilidades (logging, audio, canvas, etc.)
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
| `engine.js` | `AudioEngine` gestiona el `AudioContext`, buses de salida (8 lógicos → N físicos), registro de módulos, carga de AudioWorklets, y clase base `Module`. Métodos clave: `setOutputLevel()`, `setOutputPan()`, `setOutputFilter()`, `setOutputRouting()` (ruteo multicanal). Incluye sistema de **Filter Bypass** que desconecta los filtros LP/HP cuando están en posición neutral (|v|<0.02) para ahorrar CPU. Exporta `AUDIO_CONSTANTS` (tiempos de rampa, threshold de bypass) y `setParamSmooth()` (helper para cambios suaves de AudioParam) |
| `blueprintMapper.js` | `compilePanelBlueprintMappings()` extrae filas/columnas ocultas de blueprints de paneles para configurar las matrices |
| `matrix.js` | Lógica de conexión de pines para matrices pequeñas |
| `oscillatorState.js` | Estado de osciladores: `getOrCreateOscState()`, `applyOscStateToNode()`. Centraliza valores (freq, niveles, pulseWidth, sineSymmetry) y aplicación a nodos worklet/nativos |
| `recordingEngine.js` | `RecordingEngine` gestiona grabación de audio multitrack. Captura samples de buses de salida configurables, ruteo mediante matriz outputs→tracks, exportación a WAV 16-bit PCM. Persistencia de configuración en localStorage |
| `dormancyManager.js` | `DormancyManager` orquesta el sistema de dormancy para optimización de rendimiento. Detecta módulos sin conexiones activas en las matrices y **suspende su procesamiento DSP** (no solo los silencia). Para osciladores y noise, envía mensaje `setDormant` al worklet que hace early exit en `process()`. Para Output Bus, desconecta el grafo. Para InputAmplifier, silencia GainNodes. Ahorra ~95% CPU por módulo inactivo. Configurable con opción de debug (toasts) |

> **Nota sobre dispositivos móviles:** El procesamiento de audio del sistema (Dolby Atmos, Audio Espacial, ecualizadores) puede interferir con la síntesis en tiempo real, causando cambios de volumen inesperados o distorsión. Ver sección "Solución de problemas" en README.md.

### 3.2 Worklets (`src/assets/js/worklets/`)

Procesadores de audio que corren en el hilo de audio para síntesis de alta precisión:

| Archivo | Propósito |
|---------|----------|
| `synthOscillator.worklet.js` | Oscilador multi-waveform con **fase maestra unificada**. Modo `single` (1 forma de onda, 1 salida) o modo `multi` (4 formas de onda, 2 salidas). Todas las ondas derivan de una única fase (rampa 0→1 = sawtooth), garantizando coherencia perfecta. Anti-aliasing PolyBLEP, entrada para hard sync, parámetro `detune` para V/Oct, AudioParams individuales para niveles de cada onda. **Dormancy**: soporta mensaje `setDormant` para early exit en `process()`, ahorrando ~95% CPU cuando está inactivo |
| `noiseGenerator.worklet.js` | Generador de ruido con algoritmo Voss-McCartney para ruido rosa (-3dB/octava) y blanco, con parámetro `colour` para interpolación. **Dormancy**: soporta mensaje `setDormant` para early exit en `process()` |
| `scopeCapture.worklet.js` | Captura sincronizada de dos canales para osciloscopio con trigger Schmitt, histéresis temporal, anclaje predictivo y detección de período. **Dormancy**: soporta mensaje `setDormant` para pausar captura |
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
| `outputChannel.js` | `OutputChannel` | Canal de salida individual con filtro bipolar LP/HP, pan, nivel, y switch on/off. 8 instancias forman el panel de salida |
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
| `knobFactory.js` | `createKnobElements()`, `createKnob()` | Factory para crear DOM de knobs. Evita duplicación del markup HTML |
| `toggle.js` | `Toggle` | Interruptor de dos estados con etiquetas personalizables |
| `toast.js` | `showToast()` | Notificaciones toast temporales con animación fade-out |
| `layoutHelpers.js` | `labelPanelSlot()`, `getOscillatorLayoutSpec()` | Helpers de layout para configurar posición de paneles en la cuadrícula |
| `portraitBlocker.js` | `initPortraitBlocker()` | Bloquea la app en modo portrait, muestra hint para rotar dispositivo |
| `moduleFrame.js` | `ModuleFrame` | Contenedor visual para módulos con título y controles |
| `moduleUI.js` | `ModuleUI` | Clase base para módulos UI con knobs. Centraliza creación de controles, headers y gestión de valores |
| `oscilloscopeDisplay.js` | `OscilloscopeDisplay` | Canvas para visualización de onda con efecto CRT, knobs TIME/AMP/LEVEL, render sincronizado con rAF |
| `noiseGenerator.js` | — | UI para generadores de ruido (knobs colour/level) |
| `randomVoltage.js` | — | UI para generador de voltaje aleatorio |
| `inputAmplifierUI.js` | `InputAmplifierUI` | UI para los 8 canales de entrada (8 knobs de nivel en fila horizontal) |
| `largeMatrix.js` | `LargeMatrix` | Matriz de pines 63×67 con toggle, colores de pin, y soporte para pines inactivos. **Sistema de colores**: click derecho/long press abre menú de selección, colores por contexto (audio/control/oscilloscope), serialización `[row, col, pinType]`. Callbacks `getPinContext`, `onPinColorChange` |
| `pinColorMenu.js` | `PinColorMenu` | Menú contextual singleton para selección de color de pin. Gestiona memoria de último color por contexto, colores CSS desde variables `:root`, integración con `PIN_RESISTANCES` |
| `matrixTooltip.js` | `MatrixTooltip`, `getLabelForSource()`, `getLabelForDest()` | Sistema de tooltips para pines de matriz: muestra "Source → Destination" en hover (desktop) o tap (móvil). Usa `sourceMap`/`destMap` de blueprints compilados |
| `panelManager.js` | `PanelManager` | Gestión de paneles, carga de SVG, posicionamiento |
| `sgmeOscillator.js` | `SgmeOscillator` | UI compuesta de oscilador (knobs + display) |
| `outputRouter.js` | — | Helper para UI del router de salidas |
| `audioSettingsModal.js` | `AudioSettingsModal` | Modal de configuración de audio: matriz de salida (8 buses → N canales físicos), matriz de entrada (N entradas sistema → 8 Input Amplifiers), selección de dispositivos, detección automática de canales, persistencia en localStorage |
| `settingsModal.js` | `SettingsModal` | Modal de ajustes generales: idioma, autoguardado, wake lock, atajos. Nueva pestaña "Visualización" con escala de renderizado y toggle de pines inactivos. Persistencia en localStorage |
| `recordingSettingsModal.js` | `RecordingSettingsModal` | Modal de configuración de grabación: selector de número de pistas (1-12), matriz de ruteo outputs→tracks adaptativa, configuración de qué buses del sintetizador van a qué pistas del archivo WAV |
| `confirmDialog.js` | `ConfirmDialog` | Modal de confirmación reutilizable (singleton): título, mensaje, botones personalizables, opción "no volver a preguntar" con persistencia localStorage. Métodos estáticos `show()`, `getRememberedChoice()`, `clearRememberedChoice()` |
| `inputDialog.js` | `InputDialog` | Diálogo de entrada de texto personalizado (singleton): reemplaza `prompt()` nativo, título/placeholder/valor por defecto configurables, soporte i18n |
| `keyboardShortcuts.js` | `KeyboardShortcutsManager` | Gestor centralizado de atajos de teclado (singleton): acciones configurables (mute, record, patches, settings, fullscreen, reset, navegación paneles), persistencia en localStorage, teclas reservadas (Tab, Enter, Escape) |
| `patchBrowser.js` | `PatchBrowser` | Modal para gestionar patches: guardar, cargar, eliminar, renombrar, exportar/importar archivos `.sgme.json`, búsqueda por nombre |
| `quickbar.js` | — | Barra de acciones rápidas para móvil (bloqueo zoom/pan, ajustes, configuración de audio, pantalla completa, **menú PiP**) |
| `pipManager.js` | `initPipManager()`, `openPip()`, `closePip()`, `togglePip()` | Sistema de paneles flotantes (Picture-in-Picture). Permite extraer cualquier panel del layout principal a una ventana flotante independiente con zoom/scroll propios. Funciones: `openAllPips()`, `closeAllPips()`, `getOpenPips()`, `isPipped()`. Persistencia de estado (posición, tamaño, scroll) en localStorage. Constante `ALL_PANELS` define los 7 paneles disponibles |

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
| `audio.js` | Utilidades de audio: `safeDisconnect()` para desconexión segura de nodos |
| `constants.js` | Constantes globales centralizadas (ver sección Constantes) |
| `logger.js` | Sistema de logging con niveles (ver sección de Logging) |
| `canvasBackground.js` | Renderizado de fondos SVG en canvas para móviles |
| `serviceWorker.js` | Registro y actualización del Service Worker |
| `buildVersion.js` | Detección e inyección de versión de build |
| `input.js` | Guardas de interacción: `shouldBlockInteraction()` e `isNavGestureActive()` para evitar conflictos táctiles durante navegación |
| `waveforms.js` | Síntesis de formas de onda: `createPulseWave()` y `createAsymmetricSineWave()` usando Fourier |
| `objects.js` | Utilidades de objetos: `deepMerge()` para combinar configuraciones |
| `wakeLock.js` | `WakeLockManager` para mantener pantalla encendida (Screen Wake Lock API) |

#### Constantes globales (`constants.js`)

Centraliza valores que se reutilizan en múltiples archivos:

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `OUTPUT_CHANNELS` | 8 | Canales de salida del sintetizador |
| `INPUT_CHANNELS` | 8 | Canales de entrada (input amplifiers) |
| `MAX_RECORDING_TRACKS` | 12 | Pistas máximas de grabación WAV |
| `STORAGE_KEYS` | objeto | Claves de localStorage (idioma, audio, grabación, sesión, ajustes, wake lock, **PIP_STATE**, **PIP_REMEMBER**) |
| `AUTOSAVE_INTERVALS` | objeto | Intervalos de autoguardado: `15s`, `30s`, `1m`, `5m`, `off` |
| `DEFAULT_AUTOSAVE_INTERVAL` | `'30s'` | Intervalo de autoguardado por defecto |

**Uso:**
```javascript
import { STORAGE_KEYS, OUTPUT_CHANNELS } from './utils/constants.js';

localStorage.getItem(STORAGE_KEYS.LAST_STATE);
for (let i = 0; i < OUTPUT_CHANNELS; i++) { ... }
```

#### Sistema de Logging (`logger.js`)

Sistema centralizado de logs con niveles configurables según entorno:

| Nivel | Valor | Descripción |
|-------|-------|-------------|
| `NONE` | 0 | Sin logs (silencio total) |
| `ERROR` | 1 | Solo errores críticos |
| `WARN` | 2 | Errores y advertencias |
| `INFO` | 3 | Información general (default en desarrollo) |
| `DEBUG` | 4 | Todo, incluyendo debug detallado |

**Configuración por entorno:**
- **Desarrollo** (localhost, file://): Nivel INFO por defecto
- **Producción** (build): Nivel ERROR (configurado en `scripts/build.mjs` vía `__LOG_LEVEL__`)

**Uso:**
```javascript
import { createLogger } from './utils/logger.js';
const log = createLogger('MiModulo');

log.debug('Detalle interno');    // Solo visible con DEBUG
log.info('Inicializado');        // Visible en desarrollo
log.warn('Posible problema');    // Visible en WARN+
log.error('Error crítico');      // Siempre visible (excepto NONE)
```

**Override en runtime (debugging en producción):**
```javascript
window.__LOG_LEVEL__ = 4;  // Activar DEBUG temporalmente
// Recargar página para aplicar
```

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

## 3.8 Sistema de Emulación de Voltajes

> **Nuevo en v1.x** — Emulación del modelo eléctrico del Synthi 100 versión Cuenca/Datanomics (1982).

El Synthi 100 utiliza un sistema de **suma por tierra virtual** (virtual-earth summing) donde las señales se mezclan como corrientes a través de resistencias.

### 3.8.1 Organización del Código

El sistema de voltajes se divide en dos capas:

| Ubicación | Contenido |
|-----------|-----------|
| **`utils/voltageConstants.js`** | Constantes globales (conversión digital↔voltaje, resistencias de pin, Rf estándar) y funciones de cálculo |
| **Configs de panel** (ej: `panel3.config.js`) | Constantes específicas de cada módulo (niveles de salida, Rf internos, deriva térmica, límites) |

### 3.8.2 Constantes Globales (`voltageConstants.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `DIGITAL_TO_VOLTAGE` | 4.0 | 1.0 digital = 4V (rango ±1 = ±4V = 8V p-p) |
| `MAX_VOLTAGE_PP` | 8.0 | Voltaje pico a pico máximo (amplitud total) |
| `VOLTS_PER_OCTAVE` | 1.0 | Estándar de control: 1V/Oct |
| `STANDARD_FEEDBACK_RESISTANCE` | 100000 | Rf estándar (100kΩ) |

```javascript
import { digitalToVoltage, voltageToDigital } from './utils/voltageConstants.js';

digitalToVoltage(1.0);   // → 4.0V
voltageToDigital(-4.0);  // → -1.0
```

### 3.8.3 Resistencias de Pin (Matriz)

Los pines de la matriz contienen resistencias que determinan la ganancia de mezcla según la fórmula de tierra virtual: `Ganancia = Rf / R_pin` (donde Rf = 100kΩ típico).

#### Pines Estándar (Cuenca/Datanomics 1982)

| Color | Resistencia | Tolerancia | Ganancia | Uso típico |
|-------|-------------|------------|----------|------------|
| **Blanco** | 100kΩ | ±10% | ×1 | Audio general (Panel 5) |
| **Gris** | 100kΩ | ±0.5% | ×1 | CV de precisión (Panel 6) |
| **Verde** | 68kΩ | ±10% | ×1.5 | Mezcla ligeramente amplificada |
| **Rojo** | 2.7kΩ | ±10% | ×37 | Osciloscopio (señal fuerte y nítida) |

#### Pines Especiales (Manual técnico - mezcla personalizada)

Documentados en manuales técnicos para aplicaciones de mezcla avanzada:

| Color | Resistencia | Tolerancia | Ganancia | Uso típico |
|-------|-------------|------------|----------|------------|
| **Azul** | 10kΩ | ±10% | ×10 | Boost de señal débil |
| **Amarillo** | 22kΩ | ±10% | ×4.5 | Ganancia media |
| **Cian** | 250kΩ | ±10% | ×0.4 | Señal suave/atenuada |
| **Morado** | 1MΩ | ±10% | ×0.1 | Mezcla sutil (10%) |

#### Pin Prohibido

| Color | Resistencia | Ganancia | Estado |
|-------|-------------|----------|--------|
| **Naranja** | 0Ω | ∞ | ⚠️ **NO IMPLEMENTADO** |

> **Nota sobre el pin naranja:** Con resistencia 0Ω, la fórmula Rf/Rpin da ganancia infinita. En el hardware real, esto cortocircuita el nodo de suma de tierra virtual, destruyendo el amplificador operacional. Existía en versiones antiguas del Synthi para conexiones directas (bypass), pero en la versión Cuenca/Datanomics 1982 su uso está prohibido. En la emulación, está excluido del selector.

#### Colores por Defecto según Contexto

| Contexto | Color | Razón |
|----------|-------|-------|
| Panel 5 (audio) | Blanco | Ganancia unitaria para mezcla limpia |
| Panel 6 (control) | Gris | Precisión ±0.5% para afinación |
| Osciloscopio | Rojo | Alta ganancia (×37) para visualización clara |

### 3.8.4 Fórmula de Tierra Virtual

La mezcla de señales sigue la fórmula:

```
V_destino = Σ(V_fuente / R_pin) × Rf
```

Donde:
- `V_fuente`: Voltaje de salida del módulo fuente
- `R_pin`: Resistencia del pin usado en la conexión
- `Rf`: Resistencia de realimentación del módulo destino (típicamente 100kΩ)

```javascript
import { calculateVirtualEarthSum } from './utils/voltageConstants.js';

// Dos osciladores (4V) con pines blancos (100k) → módulo con Rf=100k
calculateVirtualEarthSum(
  [{ voltage: 4, resistance: 100000 }, { voltage: 4, resistance: 100000 }],
  100000
);  // → 8V (suma lineal sin pérdida)
```

### 3.8.5 Configuración de Osciladores (`panel3.config.js`)

Los parámetros específicos de voltaje de los osciladores se definen en `defaults.voltage`:

```javascript
voltage: {
  outputLevels: {
    sine: 8.0,        // 8V p-p
    sawtooth: 8.0,    // 8V p-p
    pulse: 8.0,       // 8V p-p (después de compensación ×3)
    triangle: 8.0,    // 8V p-p (después de compensación ×3)
    cusp: 0.5         // 0.5V p-p (deformación extrema)
  },
  feedbackResistance: {
    sineSawtooth: 100000,   // 100k Ω (R28)
    pulseTriangle: 300000   // 300k Ω (R32)
  },
  inputLimit: 8.0,          // Soft clipping a 8V p-p
  thermalDrift: {
    maxDeviation: 0.001,    // ±0.1%
    periodSeconds: 120      // 2 minutos
  }
}
```

### 3.8.6 Soft Clipping (Saturación)

Cuando el voltaje de entrada supera el límite de un módulo, se aplica saturación suave con `tanh()`:

```javascript
import { applySoftClip } from './utils/voltageConstants.js';

applySoftClip(10.0, 8.0);  // → ~7.6V (saturado suavemente)
applySoftClip(4.0, 8.0);   // → ~4.0V (sin cambio notable)
```

#### Curva para WaveShaperNode

Para aplicar soft clipping en tiempo real a señales de audio o CV, se usa `createSoftClipCurve()` con un `WaveShaperNode`:

```javascript
import { createSoftClipCurve, VOLTAGE_DEFAULTS } from './utils/voltageConstants.js';

// Crear curva de saturación para límite de ±2 unidades digitales (8V)
const curve = createSoftClipCurve(256, 2.0, 1.0);

// Aplicar a un WaveShaperNode
const waveshaper = audioCtx.createWaveShaper();
waveshaper.curve = curve;
waveshaper.oversample = 'none';  // CV no necesita oversampling
```

#### Uso en Osciladores

Los osciladores aplican soft clipping a la entrada de CV de frecuencia usando un `WaveShaperNode` entre `freqCVInput` y el parámetro `detune`:

```
[Señal CV] → [freqCVInput] → [cvSoftClip] → [detune del worklet]
                  ↓                ↓
            escala a cents    satura con tanh
```

El límite se lee de `panel3.config.js` → `voltage.inputLimit` (8V = 2.0 digital).

### 3.8.7 Clase Module (core/engine.js)

La clase base `Module` incluye métodos para aplicar soft clipping a las entradas. Todos los módulos heredan estos métodos:

| Propiedad/Método | Descripción |
|------------------|-------------|
| `_inputVoltageLimit` | Límite de entrada en voltios (8V por defecto) |
| `_softClipEnabled` | Activa/desactiva saturación (true por defecto) |
| `setInputVoltageLimit(v)` | Configura límite de voltaje personalizado |
| `setSoftClipEnabled(bool)` | Activa/desactiva soft clipping |
| `applyInputClipping(digital)` | Aplica clip a valor digital (convierte ↔ voltaje) |
| `applyVoltageClipping(volts)` | Aplica clip a valor en voltios directamente |

### 3.8.8 Ganancia de Pines de Matriz

La función `calculateMatrixPinGain()` combina tipo de pin, resistencia de realimentación y tolerancia para calcular la ganancia de cada conexión:

```javascript
import { calculateMatrixPinGain } from './utils/voltageConstants.js';

// Pin gris (100k) con Rf estándar (100k) → ganancia 1.0
calculateMatrixPinGain('GREY');           // → 1.0

// Pin rojo (2.7k) → ganancia ~37× (conexión fuerte)
calculateMatrixPinGain('RED');            // → 37.037

// Pin blanco con tolerancia aplicada
calculateMatrixPinGain('WHITE', 100000, { 
  applyTolerance: true, 
  seed: 42  // Reproducible
});                                        // → ~0.9 a ~1.1
```

#### Uso en la Matriz (app.js)

Las funciones `_getPanel5PinGain()` y `_getPanel6PinGain()` usan `calculateMatrixPinGain()` para aplicar el modelo de tierra virtual a cada conexión:

```javascript
// Jerarquía de ganancia:
// 1. pinGains[key] específico (override manual)
// 2. calculateMatrixPinGain(tipo, rf, { tolerancia, seed })
// 3. × rowGains × colGains × matrixGain
```

La configuración de tipos de pin por coordenada se puede definir en los archivos de configuración (`panel5AudioConfig.pinTypes`, `panel6ControlConfig.pinTypes`). Si no se especifica, se usa pin gris por defecto.

### 3.8.9 Tolerancia de Resistencias

La función `applyResistanceTolerance()` genera un error reproducible basado en un seed (ID de conexión), permitiendo que los patches suenen igual al recargarlos:

```javascript
import { applyResistanceTolerance, PIN_RESISTANCES } from './utils/voltageConstants.js';

const { value, tolerance } = PIN_RESISTANCES.GREY;
const actualResistance = applyResistanceTolerance(value, tolerance, connectionId);
// → 100000 * (1 ± 0.005) basado en seed
```

### 3.8.10 Configuración en Settings

Los parámetros de emulación de voltajes se pueden ajustar en **Ajustes → Avanzado → Emulación de Voltajes**:

| Opción | Clave localStorage | Por defecto | Descripción |
|--------|-------------------|-------------|-------------|
| **Saturación suave** | `sgme-voltage-soft-clip-enabled` | ✓ | Aplica `tanh()` cuando las señales superan los límites de entrada |
| **Tolerancia de pines** | `sgme-voltage-pin-tolerance-enabled` | ✓ | Variación realista según tipo de pin (gris ±0.5%, blanco ±10%) |
| **Deriva térmica** | `sgme-voltage-thermal-drift-enabled` | ✓ | Simula drift lento de osciladores CEM 3340 (±0.1%) |

Los valores se leen dinámicamente desde `localStorage` a través de `VOLTAGE_DEFAULTS`:

```javascript
import { VOLTAGE_DEFAULTS } from './utils/voltageConstants.js';

// Lee el valor actual desde localStorage (o default si no existe)
if (VOLTAGE_DEFAULTS.softClipEnabled) {
  // Aplicar saturación...
}
```

Los eventos de cambio se emiten cuando el usuario modifica las opciones:
- `synth:voltageSoftClipChange`
- `synth:voltagePinToleranceChange`
- `synth:voltageThermalDriftChange`

---

## 4. Sistema de Patches/Estados

El sistema de patches permite guardar y restaurar el estado completo del sintetizador.

### 4.1 Arquitectura

```
src/assets/js/state/
├── index.js          # API pública (re-exporta todo)
├── schema.js         # Estructura de patches, validación, IDs de módulos
├── storage.js        # Persistencia: IndexedDB para patches, localStorage para sesión
├── conversions.js    # Conversiones knob ↔ valores físicos (curvas)
├── migrations.js     # Migraciones entre versiones de formato
└── sessionManager.js # Singleton que gestiona ciclo de sesión (autoguardado, dirty tracking, restauración)
```

### 4.1.1 SessionManager

El `sessionManager` es un singleton que centraliza la gestión del ciclo de vida de la sesión:

| Método | Propósito |
|--------|-----------|
| `setSerializeCallback(fn)` | Registra función que serializa el estado actual |
| `setRestoreCallback(fn)` | Registra función que aplica un patch |
| `markDirty()` | Marca que hay cambios sin guardar |
| `configureAutoSave()` | Configura autoguardado periódico según preferencias |
| `saveOnExit()` | Guarda estado en `beforeunload` |
| `maybeRestoreLastState(options)` | Pregunta al usuario si quiere restaurar el último estado |

**Uso:**
```javascript
import { sessionManager } from './state/sessionManager.js';

// Configurar callbacks
sessionManager.setSerializeCallback(() => this._serializeCurrentState());
sessionManager.setRestoreCallback((patch) => this._applyPatch(patch));

// Marcar cambios
sessionManager.markDirty();

// Restaurar si hay estado guardado
await sessionManager.maybeRestoreLastState({ dialogOptions });
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

Cada módulo UI que guarda estado implementa el **contrato Serializable** definido en `state/schema.js`.

#### Tipos de Estado Serializado

| Tipo | Estructura | Usado por |
|------|------------|-----------|
| `OscillatorState` | `{ knobs: number[], rangeState: 'hi'|'lo' }` | SGME_Oscillator |
| `KnobModuleState` | `{ [key]: number }` | ModuleUI, NoiseGenerator, RandomVoltage |
| `LevelsState` | `{ levels: number[] }` | InputAmplifierUI, OutputFaderModule |
| `MatrixState` | `{ connections: Array<[row, col] | [row, col, pinType]> }` | LargeMatrix (pinType opcional: 'WHITE', 'GREY', 'GREEN', 'RED') |

#### Contrato Serializable

```javascript
/**
 * @typedef {Object} Serializable
 * @property {function(): SerializedState} serialize - Retorna el estado actual
 * @property {function(SerializedState): void} deserialize - Restaura estado
 */

// Ejemplo: SGME_Oscillator
serialize() {
  return {
    knobs: this.knobs.map(k => k.getValue()),
    rangeState: this.rangeState
  };
}

deserialize(data) {
  if (!data) return;
  if (Array.isArray(data.knobs)) {
    data.knobs.forEach((v, i) => {
      if (this.knobs[i] && typeof v === 'number') {
        this.knobs[i].setValue(v);
      }
    });
  }
}
```

#### Validación (opcional)

Para debugging, se puede usar `validateSerializedData()`:

```javascript
import { validateSerializedData, SERIALIZATION_SCHEMAS } from './state/schema.js';

const result = validateSerializedData(data, SERIALIZATION_SCHEMAS.oscillator);
if (!result.valid) {
  console.warn('Invalid data:', result.errors);
}
```

### 4.6 Módulos con Serialización

| Clase | Archivo | Tipo de Estado | Estructura |
|-------|---------|----------------|------------|
| `SGME_Oscillator` | `ui/sgmeOscillator.js` | `OscillatorState` | `{ knobs: number[7], rangeState }` |
| `ModuleUI` (base) | `ui/moduleUI.js` | `KnobModuleState` | `{ [key]: number }` |
| `NoiseGenerator` | `ui/noiseGenerator.js` | `KnobModuleState` | `{ colour, level }` |
| `RandomVoltage` | `ui/randomVoltage.js` | `KnobModuleState` | `{ mean, variance, voltage1, voltage2, key }` |
| `InputAmplifierUI` | `ui/inputAmplifierUI.js` | `LevelsState` | `{ levels: number[8] }` |
| `OutputFaderModule` | `modules/outputFaders.js` | `LevelsState` | `{ levels: number[8] }` |
| `LargeMatrix` | `ui/largeMatrix.js` | `MatrixState` | `{ connections: [row, col][] }` |

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

- **Y-T (Dual Beam)**: Forma de onda tradicional (amplitud vs tiempo) con **dos líneas en posiciones fijas**
  - Las líneas se posicionan en los tercios del display, dividiéndolo en 3 partes iguales:
    ```
    ┌─────────────────────────┐
    │      (espacio 1/3)      │
    ├─────── BEAM 1 ──────────┤  ← a 1/3 del alto
    │      (espacio 1/3)      │
    ├─────── BEAM 2 ──────────┤  ← a 2/3 del alto
    │      (espacio 1/3)      │
    └─────────────────────────┘
    ```
  - El Beam 2 solo se dibuja si hay señal significativa conectada a las columnas X
  - Ambos beams usan verde por defecto (como el original), pero los colores son configurables (`lineColor`, `lineColor2`, `glowColor`, `glowColor2`)
- **X-Y (Lissajous)**: Canal X horizontal, canal Y vertical (un solo trazo centrado)

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

## 8.1 Optimizaciones de Rendimiento

El sistema incluye varias optimizaciones para reducir carga de CPU, especialmente importantes en dispositivos móviles:

### Dormancy (Suspensión de Procesamiento)

El `DormancyManager` detecta módulos de audio sin conexiones activas en las matrices y **suspende su procesamiento DSP**, no solo los silencia.

```
┌──────────────────┐                   ┌──────────────────┐
│   Matriz Audio   │───┐    ┌─────────▶│    Output Bus    │
│   (conexiones)   │   │    │  activo  │  (procesando)    │
└──────────────────┘   │    │          └──────────────────┘
                       │    │
                       ▼    │
               ┌───────────────────┐
               │  DormancyManager  │
               │  (analiza matriz) │
               └───────────────────┘
                       │    │
                       │    │          ┌──────────────────┐
                       │    └─────────▶│   Output Bus     │
                       │       dormant │  (silenciado)    │
                       │               └──────────────────┘
                       ▼
               ┌───────────────────┐
               │  Oscilador sin    │──▶ SUSPENDIDO
               │   conexiones      │    (early exit)
               └───────────────────┘
```

**Comportamiento:**
- Analiza matrices de audio y control en cada cambio
- Módulos sin conexiones → marcados como dormant
- **Osciladores dormant**: mensaje `setDormant` al worklet → `process()` hace early exit (llena buffers con ceros sin calcular ondas). Ahorra ~95% CPU del worklet. La fase se mantiene para coherencia al despertar.
- **NoiseModule dormant**: mensaje `setDormant` al worklet noiseGenerator → early exit sin generar ruido. Silencia levelNode.
- **Output Bus dormant**: desconecta `busInput` del grafo (de `filterLP` si filtros activos, o de `levelNode` si bypass). Los filtros LP/HP no reciben audio y no consumen CPU.
- **InputAmplifier dormant**: silencia los 8 GainNodes. Guarda y restaura niveles al despertar.
- **Oscilloscope dormant**: mensaje `setDormant` al worklet scopeCapture → pausa captura de señal y procesamiento de trigger Schmitt.

**Flujo de mensajes (ejemplo oscilador):**
```
DormancyManager.setDormant(true)
       │
       ▼
app.js: entry.setDormant(dormant)
       │
       ├──▶ multiOsc.port.postMessage({ type: 'setDormant', dormant: true })
       │
       └──▶ Worklet: this.dormant = true → process() hace early exit
```

**Flujo de mensajes (ejemplo Output Bus):**
```
DormancyManager → bus.setDormant(true)
       │
       ├──▶ if (bypassed) bus.input.disconnect(bus.levelNode)
       │    else bus.input.disconnect(bus.filterLP)
       │
       └──▶ Filtros LP/HP no reciben audio → 0 CPU
```

**Configuración:** Ajustes → Avanzado → Optimizaciones → Dormancy

### Filter Bypass (Desconexión de Filtros)

Cada output bus tiene filtros LP/HP en serie. Cuando el filtro está en posición neutral (|valor| < 0.02), los nodos `BiquadFilterNode` se desconectan del grafo de audio.

```
FILTROS ACTIVOS (valor ≠ 0):
busInput → filterLP → filterHP → levelNode → ...

BYPASS (valor ≈ 0):
busInput ─────────────────────▶ levelNode → ...
           (filtros desconectados)
```

**Beneficio:** Los BiquadFilter desconectados no consumen CPU.

**Umbral:** `AUDIO_CONSTANTS.FILTER_BYPASS_THRESHOLD = 0.02`

**Configuración:** Ajustes → Avanzado → Optimizaciones → Filter Bypass

### Modo de Latencia (latencyHint)

El `AudioContext` se crea con un `latencyHint` que determina el tamaño del buffer:

| Modo | latencyHint | Buffer típico | Uso recomendado |
|------|-------------|---------------|-----------------|
| Interactivo | `'interactive'` | ~10ms | Desktop, baja latencia |
| Reproducción | `'playback'` | ~50-100ms | Móviles, estabilidad |

**Comportamiento por defecto:**
- **Móviles** (detectado via userAgent): `'playback'` para evitar dropouts
- **Desktop**: `'interactive'` para respuesta inmediata

**Cambio de latencia:** Requiere reiniciar la aplicación para aplicar los cambios.

**Configuración:** Ajustes → Avanzado → Optimizaciones → Modo de latencia

**Nota sobre navegadores móviles:** Firefox para Android utiliza el motor de audio cubeb, que maneja mejor la prioridad del thread de audio en dispositivos móviles. Chrome Android puede presentar crepitaciones incluso con buffers altos debido a cómo gestiona la prioridad del audio. Si experimentas problemas de audio en Chrome Android, se recomienda usar Firefox.

---

## 9. Sistema de AudioWorklets

### Motivación

Los `OscillatorNode` nativos de Web Audio tienen limitaciones:
- `setPeriodicWave()` cambia la forma de onda instantáneamente → **clicks audibles**
- No exponen la **fase** del oscilador → imposible implementar **hard sync**
- Cada oscilador tiene fase independiente → **imposible sincronizar múltiples formas de onda**

Para resolver esto, SynthiGME-web usa **AudioWorklet** con una **fase maestra unificada**:
- Una única variable `phase` (rampa 0→1) controla todas las formas de onda
- El **sawtooth ES la fase** escalada: `saw = 2 * phase - 1`
- Las demás ondas derivan matemáticamente de la fase maestra
- Modulación suave de parámetros (pulse width, sine symmetry) sin clicks
- Acceso a la fase interna para hard sync entre osciladores

### Arquitectura de Fase Maestra

Para garantizar la coherencia de fase entre todas las formas de onda (crucial para la síntesis aditiva y AM/FM), se utiliza un sistema de **Fase Maestra Unificada**.

**Estándar de Fase (Calibración CEM3340/Synthi)**:
La fase `0.0` se define como el punto de **Reset** o **Ataque**. Todas las formas de onda se alinean a este punto de referencia.

| Onda | Comportamiento en Fase 0.0 | Fórmula/Lógica | Notas de Alineación |
|------|----------------------------|----------------|---------------------|
| **Sine** | **Pico Positivo (+1.0)** | `cos(2πp)` | Se comporta como un Coseno. Alineado con el pico del Triángulo. |
| **Triangle** | **Pico Positivo (+1.0)** | `p<0.5 ? 1-4p : 4p-3` | Invertido respecto a la rampa estándar para coincidir con el Sine. |
| **Pulse** | **Centro del estado ALTO** | `(p+0.25)%1 < w` | Desplazado 90° (+0.25) para que el pulso esté "centrado" en el pico del Sine. |
| **Sawtooth** | **Inicio (-1.0)** | `2*p - 1` | Rampa ascendente estándar (única divergencia de pico, es un reset). |

```
          FASE MAESTRA (rampa 0→1)
                   │
    ┌──────────────┼──────────────┬──────────────┐
    ▼              ▼              ▼              ▼
 SAWTOOTH       SINE          TRIANGLE        PULSE
(Reset -1)    (Peak +1)      (Peak +1)     (Center High)
    │              │              │              │
 [PolyBLEP]   [Hybrid Algo]       │        [PolyBLEP]
    │              │              │              │
    └──────┬───────┘              └──────┬───────┘
           ▼                             ▼
      OUTPUT 0                      OUTPUT 1
```

### Técnicas de Anti-Aliasing

El procesador implementa mitigación de aliasing para las formas de onda con alto contenido armónico:

1.  **PolyBLEP (Polynomial Band-Limited Step):**
    *   Se aplica a la **Sawtooth** en el punto de reset (fase 0→1).
    *   Se aplica a la **Pulse** en ambos flancos (subida y bajada).
    *   Suaviza la discontinuidad teórica infinita usando un polinomio de segundo orden cuando la transición cae dentro de un sample de distancia (`dt`).

2.  **Continuidad Geométrica:**
    *   **Sine (Híbrido):** Al usar `Math.tanh` y `Math.cos`, la señal es C-infinitamente diferenciable, naturalmente libre de aliasing duro.
    *   **Triangle:** Al ser una integral del pulso, sus armónicos decaen cuadráticamente ($1/n^2$). No requiere PolyBLEP agresivo en rangos de frecuencia media/baja.

### SynthOscillatorProcessor

**Modos de operación:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Hilo Principal (JS)                      │
│  ┌─────────────────┐     ┌──────────────────┐               │
│  │  AudioEngine    │────▶│ AudioWorkletNode │               │
│  │createMultiOsc() │     │  (2 outputs)     │               │
│  └─────────────────┘     └────────┬─────────┘               │
└───────────────────────────────────┼─────────────────────────┘
                                    │ MessagePort
┌───────────────────────────────────┼─────────────────────────┐
│                    Hilo de Audio (Worklet)                  │
│                          ┌────────▼─────────┐               │
│                          │ SynthOscillator  │               │
│                          │   Processor      │               │
│                          │  - phase (0→1)   │               │
│                          │  - polyBLEP      │               │
│                          │  - hard sync in  │               │
│                          │  - 4 waveforms   │               │
│                          │  - 4 level params│               │
│                          └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### SynthOscillatorProcessor

**Modos de operación:**
- `single` — Una forma de onda, 1 salida (compatibilidad legacy)
- `multi` — 4 formas de onda, 2 salidas (Panel 3)

**Formas de onda disponibles:**
- `pulse` — con parámetro `pulseWidth` (0.01–0.99)
- `sine` — con parámetro `symmetry` (0.01–0.99) para simetría variable
- `triangle` — onda triangular
- `sawtooth` — diente de sierra (= fase maestra escalada)

**AudioParams (modo multi):**
- `frequency` — Frecuencia base en Hz
- `detune` — Desafinación en cents (para V/Oct)
- `pulseWidth` — Ancho de pulso (0.01–0.99)
- `symmetry` — Simetría del sine (0.01–0.99)
- `sineLevel` — Nivel del sine (0–1)
- `sawLevel` — Nivel del sawtooth (0–1)
- `triLevel` — Nivel del triangle (0–1)
- `pulseLevel` — Nivel del pulse (0–1)

**Características:**
- **Fase coherente**: la fase se mantiene al cambiar parámetros
- **Anti-aliasing PolyBLEP**: reduce aliasing en transiciones abruptas (pulse, saw)
- **Hard sync**: entrada 0 para señal de sincronización (flanco positivo resetea fase)

### Algoritmo de Seno Asimétrico Híbrido (Sine Shape)

Para emular el comportamiento único del control "Shape" del Synthi 100, se ha implementado un algoritmo híbrido que combina precisión matemática con modelado analógico.

**Problemática:**
El circuito original del Synthi 100 (ver diagrama de VCO) utiliza técnicas de conformación de onda analógicas que generan una forma de onda con una estética particular: picos redondeados ("vientres") y valles agudos (o viceversa), manteniendo un cruce por cero lineal. Las aproximaciones matemáticas simples (warping de fase) generaban discontinuidades (kinks) en la derivada, resultando en armónicos indeseados y una forma visualmente incorrecta.

**Solución Implementada:**
Un enfoque híbrido que mezcla dos generadores según el control de simetría:

1.  **Centro (Symmetry = 0.5):** Generación digital pura mediante `Math.cos()`. Esto garantiza una sinusoide perfecta sin distorsión armónica, superando incluso al hardware original en pureza.
2.  **Extremos (Symmetry → 0 o 1):** Un modelo de **Waveshaper (Conformador)** basado en `Math.tanh()` aplicado a una onda triangular con offset.
    *   Este modelo simula la saturación de transistores/OTA del circuito original.
    *   Coeficiente de saturación calibrado a $k=1.55$ tras análisis auditivo y visual.
    *   Produce la característica forma de "Vientre Redondo vs Punta Aguda" sin romper la continuidad de la onda.

**Parámetros de Calibración:**

| Parámetro | Rango | Default | Descripción |
|-----------|-------|---------|-------------|
| `sineShapeAttenuation` | 0.0–1.0 | 1.0 | Atenuación de amplitud en extremos (0=off, 1=8:1 histórico) |
| `sinePurity` | 0.0–1.0 | 0.7 | Mezcla de seno puro en el centro (0=100% analógico, 1=100% digital) |

**Atenuación Histórica de Amplitud (`sineShapeAttenuation`):**
Según el manual del Synthi 100, la amplitud de la forma de onda Sine cambia con el control Shape:
- Centro (seno puro): 4V p-p
- Extremos (cuspoide): 0.5V p-p → ratio **8:1**

La curva de atenuación es cuadrática: $A = 1 - d^2 \cdot (1 - 0.125) \cdot factor$, donde $d$ es la distancia al centro normalizada.

**Pureza del Seno (`sinePurity`):**
Controla cuánto seno digital puro se mezcla en el centro del control de simetría:
- `1.0` = Seno puro matemático en el centro (sin armónicos, comportamiento "ideal")
- `0.7` = **Por defecto**. Conserva 30% de la componente analógica incluso en el centro, manteniendo algo del "color" o armónicos propios de los circuitos electrónicos reales.
- `0.0` = 100% componente analógica (tanh waveshaper) en toda la gama, máximo carácter vintage.

**Fuentes:**
- *Gabinete de Música Electroacústica de Cuenca*: Manual de usuario (para la dirección del control: Izquierda = Vientres Arriba).
- *Circuit Diagrams*: Análisis del VCO para deducir el uso de conformadores de onda sobre núcleo triangular en lugar de distorsión de fase.

### API de Uso

```javascript
// Esperar a que el worklet esté listo
await engine.ensureWorkletReady();

// ═══════════════════════════════════════════════════════════
// MODO SINGLE (legacy, una forma de onda)
// ═══════════════════════════════════════════════════════════
const osc = engine.createSynthOscillator({
  waveform: 'pulse',  // 'pulse' | 'sine' | 'triangle' | 'sawtooth'
  frequency: 440,
  pulseWidth: 0.5,    // solo para pulse
  symmetry: 0.5,      // solo para sine
  gain: 1.0
});

osc.connect(destination);
osc.setFrequency(880);
osc.setPulseWidth(0.3);

// ═══════════════════════════════════════════════════════════
// MODO MULTI (4 formas de onda, fase maestra)
// ═══════════════════════════════════════════════════════════
const multiOsc = engine.createMultiOscillator({
  frequency: 440,
  pulseWidth: 0.5,
  symmetry: 0.5,
  sineLevel: 0.5,     // mezcla de ondas
  sawLevel: 0.3,
  triLevel: 0,
  pulseLevel: 0.2,
  sineShapeAttenuation: 1.0,  // Atenuación histórica (0=off, 1=8:1)
  sinePurity: 0.7             // Pureza del seno (0=vintage, 1=digital puro)
});

// Cambiar parámetros de calibración en runtime
multiOsc.setSineShapeAttenuation(0.5); // 50% de atenuación
multiOsc.setSinePurity(0.8);           // 80% seno puro en centro


// 2 salidas: output 0 = sine+saw, output 1 = tri+pulse
multiOsc.connect(sineSawDestination, 0);
multiOsc.connect(triPulseDestination, 1);

// Métodos de control
multiOsc.setFrequency(880);
multiOsc.setSineLevel(1.0);
multiOsc.setSawLevel(0);
multiOsc.setPulseWidth(0.3);

// ═══════════════════════════════════════════════════════════
// HARD SYNC (conectar oscilador maestro)
// ═══════════════════════════════════════════════════════════
const master = engine.createMultiOscillator({ frequency: 100, sawLevel: 1 });
const slave = engine.createMultiOscillator({ frequency: 300, sawLevel: 1 });

// La fase del slave se resetea en cada ciclo del master
slave.connectSync(master);  // output 0 del master → input 0 del slave

// Detener
multiOsc.stop();
```

### Comparativa de Eficiencia

| Aspecto | Antes (4 nodos) | Ahora (1 worklet multi) |
|---------|-----------------|-------------------------|
| Nodos AudioContext | 10 por oscilador | 3 por oscilador |
| GainNodes intermedios | 4 | 0 |
| Context switches | Alto | Bajo |
| Coherencia de fase | ❌ Imposible | ✅ Perfecta |
| Hard sync | ❌ No disponible | ✅ Preparado |
| Overhead | Alto | Bajo |

### Fallback

Si el navegador no soporta AudioWorklet o falla la carga:
- `engine.workletReady` será `false`
- El Panel 3 no funcionará (requiere worklet)
- Los osciladores del Panel 2 (básicos) usan `OscillatorNode` nativo como fallback

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
- **67 columnas** (destinos: buses, entradas de módulos, hard sync)
- Cada pin conecta una fuente a un destino con ganancia configurable

**Destinos disponibles:**
| Columnas Synthi | Destino | Descripción |
|-----------------|---------|-------------|
| 24-35 | Hard Sync Osc 1-12 | Entrada de sincronización para cada oscilador. La señal resetea la fase del oscilador destino en cada flanco positivo. |
| 36-43 | Output Bus 1-8 | Buses de salida de audio |
| 57-58 | Osciloscopio Y/X | Entradas del osciloscopio (Y-T o Lissajous) |

**Hard Sync:** Permite sincronizar la fase de un oscilador "slave" con la frecuencia de un oscilador "master". El worklet detecta flancos positivos y resetea `this.phase = 0`. Esto crea timbres armónicos complejos característicos de la síntesis analógica clásica.

### Matriz de Control (Panel 6)
- Rutea señales de control (CV) entre módulos
- Permite modulaciones complejas (ej: LFO → frecuencia de oscilador)
- **Sistema V/Oct** para modulación de frecuencia de osciladores:
  - Escala exponencial: 1 voltio = 1 octava
  - Rango: ±5 octavas desde la frecuencia base del oscilador
  - Parámetro `detune` en AudioWorklet para modulación suave
  - Fórmula: `freqFinal = freqBase × 2^(cvValue × 5)`

### Tooltips de Pines de Matriz

Sistema de tooltips informativos para los pines de las matrices grandes (Panel 5 y 6).
Muestra la ruta de señal "Source → Destination" para ayudar al usuario a entender las conexiones.

#### Comportamiento por Dispositivo

| Dispositivo | Mostrar Tooltip | Toggle Pin |
|-------------|-----------------|------------|
| **Desktop** (hover: hover) | Mouse hover | Click |
| **Móvil** (touch) | Tap simple | Doble tap |

#### Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Blueprint       │     │ blueprintMapper  │     │ MatrixTooltip   │
│ (sources/dests) │ ──► │ sourceMap/destMap│ ──► │ getLabelFor*()  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Blueprints** (`panel5.audio.blueprint.js`, `panel6.control.blueprint.js`) definen:
   - `sources[]`: filas → objetos `{ kind, channel?, oscIndex?, channelId? }`
   - `destinations[]`: columnas → objetos `{ kind, bus?, channel?, oscIndex? }`

2. **blueprintMapper** compila a Maps indexadas por índice físico:
   - `sourceMap: Map<rowIndex, source>` 
   - `destMap: Map<colIndex, dest>`

3. **MatrixTooltip** usa `getLabelForSource()`/`getLabelForDest()` para generar labels localizados.

#### Sistema de Numeración Synthi → Índice Físico

> **REGLA DE ORO**: En los blueprints, usar SIEMPRE los números de la serigrafía del Synthi 100.
> El mapper convierte automáticamente. NUNCA compensar manualmente los huecos.

Los blueprints usan **numeración Synthi** (la que aparece en la serigrafía del panel).
Los **huecos** (pines que no existen físicamente) **NO tienen número** en el Synthi.

```
Ejemplo: Panel 6 tiene hiddenCols0: [33] (hueco en índice físico 33)

  Índice físico: 0   1   2  ...  32   33    34   35  ...  63   64   65
                 |   |   |       |    |     |    |        |    |    |
  Visible:       ✓   ✓   ✓       ✓   [gap]  ✓    ✓        ✓    ✓    ✓
                                      ↑
  Synthi #:      1   2   3  ...  33  ---    34   35  ...  63   64   65
                                 (no tiene número)

  La conversión:
  - Synthi 33 → índice 32 ✓
  - Synthi 34 → índice 34 ✓ (salta el 33)
  - Synthi 63 → índice 64 ✓ (hay 1 hueco antes)
  - Synthi 64 → índice 65 ✓
```

**Cómo funciona `blueprintMapper.js`:**
1. Lee `hiddenCols0` / `hiddenRows0` (índices físicos de huecos)
2. Construye `visibleColIndices` / `visibleRowIndices` (solo posiciones visibles)
3. `synthColToPhysicalColIndex(colSynth)` devuelve `visibleColIndices[colSynth - colBase]`

**Ejemplo práctico:**
```javascript
// Panel 6: osciloscopio en columnas Synthi 63-64
{ colSynth: 63, dest: { kind: 'oscilloscope', channel: 'Y' } },
{ colSynth: 64, dest: { kind: 'oscilloscope', channel: 'X' } }
// El mapper convierte 63→64 y 64→65 automáticamente
```

#### Labels Soportados

**Sources (filas):**
| Kind | Parámetros | Ejemplo |
|------|------------|---------|
| `inputAmp` | `channel: 0-7` | "Input 1" |
| `outputBus` | `bus: 1-8` | "Out Bus 1" |
| `noiseGen` | `index: 0-1` | "Noise 1" |
| `panel3Osc` | `oscIndex: 0-11`, `channelId: 'sineSaw'|'triPulse'` | "Osc 1 (sin+saw)" |

**Destinations (columnas):**
| Kind | Parámetros | Ejemplo |
|------|------------|---------|
| `outputBus` | `bus: 1-8` | "Out 1" |
| `oscilloscope` | `channel: 'X'|'Y'` | "Scope Y" |
| `oscFreqCV` | `oscIndex: 0-11` | "Osc 1 Freq CV" |

#### Feedback Visual

Cuando el tooltip está visible, el pin objetivo muestra un **efecto de pulso** (animación CSS `pin-tooltip-pulse`) que lo resalta visualmente con un halo naranja y escala 1.3×.

#### Auto-hide en Móvil

El tooltip se oculta cuando:
- Han pasado **5 segundos** sin interacción
- El usuario toca **fuera del tooltip**
- El usuario hace **doble tap** en el mismo pin (toggle)

#### Detección de Gestos

En móvil, el sistema distingue entre:
- **Tap válido**: un solo dedo, duración < 300ms, movimiento < 10px → muestra tooltip
- **Gesto de navegación**: pinch/pan con dos dedos → NO muestra tooltip

Esto evita que aparezcan tooltips accidentalmente al hacer zoom o desplazarse por el panel.

#### i18n

Los labels están en `translations.yaml` bajo el namespace `matrix.*`:
```yaml
matrix.source.inputAmp:
  en: "Input {channel}"

matrix.tooltip.format:
  en: "{source} → {dest}"
```

> **Nota**: Actualmente solo hay traducciones en inglés. El sistema usa `defaultLocale: en` para que las claves sin traducción en otros idiomas usen el fallback en inglés automáticamente.

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

- [x] **Hard sync**: Entrada de sincronización implementada en worklet y expuesta en matriz de audio (Panel 5, columnas 24-35). Conexión directa sin GainNode intermedio.
- [ ] **Paneo por bus**: Añadir control de panorama a cada bus lógico
- [x] **Presets**: Sistema de guardado/carga de patches → Ver [Sección 4](#4-sistema-de-patchesestados)
- [x] **Grabación**: Sistema de grabación multitrack WAV → Ver [Sección 6](#6-sistema-de-grabación-de-audio)
- [x] **Atajos de teclado**: Sistema de shortcuts personalizables → Ver [Sección 7](#7-sistema-de-atajos-de-teclado)
- [ ] **MIDI**: Soporte para controladores externos
- [ ] **Multicanal**: Ruteo a más de 2 salidas físicas si el navegador lo permite
- [ ] **CV para faders**: Validar estabilidad antes de exponer todos los faders como AudioParam
- [ ] **Interpolación de frames**: Suavizado adicional entre frames del osciloscopio si es necesario
- [ ] **Trigger externo**: Permitir sincronizar osciloscopio con señal externa (otro oscilador)

---

## 16. Tests

El proyecto utiliza el runner nativo de Node.js (`node --test`) para tests de regresión sin dependencias adicionales.

### Estructura
```
tests/
├── blueprintMapper.test.js      # Regresiones del sistema de mapeo Synthi → índice físico
├── mocks/
│   └── audioContext.mock.js     # Mock de AudioContext y AudioWorklet para tests unitarios
├── core/
│   ├── engine.test.js           # Tests de AudioEngine con mocks
│   ├── oscillatorState.test.js  # Tests de estado de osciladores
│   └── recordingEngine.test.js  # Tests de grabación multitrack
├── modules/
│   ├── joystick.test.js         # Tests del módulo joystick
│   ├── noise.test.js            # Tests del generador de ruido
│   ├── oscillator.test.js       # Tests del oscilador
│   ├── oscilloscope.test.js     # Tests del osciloscopio
│   ├── outputChannel.test.js    # Tests del canal de salida
│   └── pulse.test.js            # Tests del oscilador pulse
├── panelBlueprints/
│   ├── configs.test.js          # Tests de consistencia de blueprints
│   └── panel2-3.config.test.js  # Tests específicos de paneles 2 y 3
├── state/
│   ├── conversions.test.js      # Tests de conversiones knob ↔ valores
│   ├── migrations.test.js       # Tests de migraciones de formato
│   └── schema.test.js           # Tests de esquema de patches
├── i18n/
│   └── locales.test.js          # Tests de paridad de traducciones
└── utils/
    ├── constants.test.js        # Tests de constantes globales
    ├── logger.test.js           # Tests del sistema de logging
    └── objects.test.js          # Tests de utilidades de objetos
```

### Ejecutar
```bash
npm test
```

### Cobertura actual (~725 casos)

| Área | Tests | Verificaciones principales |
|------|-------|---------------------------|
| `blueprintMapper` | Regresiones de matrices | Mapeo Synthi→físico, huecos, posiciones críticas |
| `core/engine` | AudioEngine con mocks | Inicialización, niveles, panning, routing, CV |
| `core/oscillatorState` | Estado de osciladores | `getOrCreateOscState()`, valores por defecto |
| `core/recordingEngine` | Grabación multitrack | Configuración 1-12 pistas, matriz de ruteo |
| `core/dormancyManager` | Sistema de dormancy | Detección de conexiones, estados dormant/active |
| `modules/*` | Módulos de síntesis | Inicialización con mocks de AudioContext |
| `panelBlueprints` | Blueprints y configs | Consistencia, proporciones, parámetros válidos |
| `state/*` | Sistema de patches | Conversiones, migraciones, validación de esquema |
| `i18n/locales` | Internacionalización | Paridad en/es, claves esenciales, metadatos |
| `utils/*` | Utilidades | Constantes, logging por niveles, `deepMerge()` |

### Mock de AudioContext

El archivo `tests/mocks/audioContext.mock.js` proporciona un mock completo de:
- `AudioContext` con métodos de creación de nodos
- `AudioWorkletNode` con `AudioParam` simulados
- `GainNode`, `StereoPannerNode`, `BiquadFilterNode`, etc.
- Sistema de conexión/desconexión entre nodos

**Uso en tests:**
```javascript
import { createMockAudioContext } from '../mocks/audioContext.mock.js';

const mockCtx = createMockAudioContext();
const engine = new AudioEngine();
await engine.init(mockCtx);
```

### Añadir nuevos tests
1. Crea un archivo `tests/<categoria>/<modulo>.test.js`
2. Usa `describe` / `it` de `node:test` y `assert` de `node:assert/strict`
3. Para tests de audio, importa y usa el mock de AudioContext
4. Ejecuta `npm test` para validar
