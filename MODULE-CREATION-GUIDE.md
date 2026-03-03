# Guía para crear un nuevo módulo de sintetizador en SynthiGME

Checklist completo basado en el módulo **Random Control Voltage Generator** como implementación de referencia.

---

## Índice

1. [Resumen de archivos necesarios](#1-resumen-de-archivos-necesarios)
2. [Worklet (AudioWorkletProcessor)](#2-worklet-audioworkletprocessor)
3. [Módulo de audio (Module class)](#3-módulo-de-audio-module-class)
4. [Componente UI](#4-componente-ui)
5. [Config del módulo](#5-config-del-módulo)
6. [Panel Blueprint (Matriz)](#6-panel-blueprint-matriz)
7. [Registro del Worklet (Engine)](#7-registro-del-worklet-engine)
8. [Integración en App.js](#8-integración-en-appjs)
9. [OSC Sync](#9-osc-sync)
10. [Tooltips](#10-tooltips)
11. [Signal Flow Highlighter](#11-signal-flow-highlighter)
12. [Matrix Tooltip](#12-matrix-tooltip)
13. [Dormancy Manager](#13-dormancy-manager)
14. [i18n (Traducciones)](#14-i18n-traducciones)
15. [Layout Helpers](#15-layout-helpers)
16. [Tests](#16-tests)
17. [Checklist rápido](#17-checklist-rápido)

---

## 1. Resumen de archivos necesarios

Para un módulo nuevo llamado `myModule`, hay que crear o modificar estos archivos:

### Archivos a CREAR

| # | Archivo | Propósito |
|---|---------|-----------|
| 1 | `src/assets/js/worklets/myModule.worklet.js` | AudioWorkletProcessor (DSP) |
| 2 | `src/assets/js/modules/myModule.js` | Clase de audio (main thread) |
| 3 | `src/assets/js/ui/myModule.js` | Componente UI (extiende ModuleUI) |
| 4 | `src/assets/js/configs/modules/myModule.config.js` | Configuración de parámetros |
| 5 | `src/assets/js/osc/oscMyModuleSync.js` | Sincronización OSC |
| 6 | `tests/worklets/myModule.worklet.test.js` | Tests del worklet |
| 7 | `tests/modules/myModule.test.js` | Tests del módulo de audio |
| 8 | `tests/configs/myModule.config.test.js` | Tests del config |
| 9 | `tests/osc/oscMyModuleSync.test.js` | Tests de OSC sync |
| 10 | `tests/core/dormancyMyModule.test.js` | Tests de dormancy |
| 11 | `tests/panelBlueprints/panelNMyModule.test.js` | Tests del blueprint |
| 12 | `tests/utils/tooltipMyModule.test.js` | Tests de tooltip |

### Archivos a MODIFICAR

| # | Archivo | Cambio |
|---|---------|--------|
| 13 | `src/assets/js/core/engine.js` | Registrar worklet en `_loadWorklets()` |
| 14 | `src/assets/js/configs/index.js` | Exportar/importar config |
| 15 | `src/assets/js/panelBlueprints/panel6.control.blueprint.js` | Añadir filas source/dest |
| 16 | `src/assets/js/panelBlueprints/panel3.blueprint.js` | Añadir UI defaults + módulo en `modules` |
| 17 | `src/assets/js/app.js` | ~10 puntos de integración (ver sección 8) |
| 18 | `src/assets/js/ui/matrixTooltip.js` | Añadir case en `getLabelForSource()` |
| 19 | `src/assets/js/ui/signalFlowHighlighter.js` | Añadir case en `getModuleElementIds()` |
| 20 | `src/assets/js/core/dormancyManager.js` | Añadir lógica de dormancy |
| 21 | `src/assets/js/utils/tooltipUtils.js` | Funciones de tooltip para los knobs |
| 22 | `src/assets/js/ui/layoutHelpers.js` | Función `getMyModuleUIDefaults()` |
| 23 | `src/assets/js/i18n/translations.yaml` | Traducciones para tooltip de matriz |

---

## 2. Worklet (AudioWorkletProcessor)

**Archivo**: `src/assets/js/worklets/randomCV.worklet.js`  
**Referencia**: `src/assets/js/worklets/randomCV.worklet.js`

### Patrón

```javascript
// Constantes del módulo
const MIN_FREQ = 0.2;
const MAX_FREQ = 20;
// ...

class RandomCVProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Estado interno del DSP
    this._dormant = false;
    this._stopped = false;
    
    // Manejar mensajes del main thread
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }
  
  process(inputs, outputs, parameters) {
    if (this._stopped) return false;       // Detener procesador
    
    const output = outputs[0];
    // ... generar audio ...
    
    if (this._dormant) {
      // Silenciar salida pero mantener reloj interno
      output[0].fill(0);
      return true;
    }
    
    // ... DSP normal ...
    return true;
  }
  
  _handleMessage(data) {
    switch (data.type) {
      case 'setMean':       // Ejemplo de parámetro
        this._meanFreq = this._meanDialToFreq(data.value);
        break;
      case 'setDormant':    // Siempre incluir
        this._dormant = !!data.dormant;
        break;
      case 'stop':          // Siempre incluir
        this._stopped = true;
        break;
    }
  }
  
  // Funciones de conversión dial → valor interno
  _meanDialToFreq(dialValue) { /* ... */ }
}

registerProcessor('random-cv', RandomCVProcessor);
```

### Puntos clave

- **Nombre de registro**: Cadena usada en `registerProcessor('random-cv', ...)` — debe coincidir con el usado en `new AudioWorkletNode(ctx, 'random-cv')`
- **Mensajes obligatorios**: `setDormant` y `stop`
- **Dormancy**: El DSP debe manejar silencio (`.fill(0)`) pero mantener el estado interno (reloj, fase, etc.) para preservar la coherencia al despertar
- **`return false`** en `process()` destruye el procesador (solo en `stop`)
- Las conversiones dial→parámetro interno se hacen aquí (ej: exponencial, lineal, etc.)
- La variable global `sampleRate` está disponible automáticamente en el contexto del worklet

---

## 3. Módulo de audio (Module class)

**Archivo**: `src/assets/js/modules/randomCV.js`  
**Clase**: `RandomCVModule extends Module`

### Patrón

```javascript
import { Module } from '../core/engine.js';
import { createLogger } from '../utils/logger.js';
import { attachProcessorErrorHandler } from '../utils/audio.js';

const log = createLogger('RandomCVModule');

export class RandomCVModule extends Module {
  constructor(engine, id, config = {}) {
    super(engine, id, 'Random CV');  // nombre legible
    
    this.config = { /* merge de config con defaults */ };
    
    // Nodos de audio (null hasta _initAudioNodes)
    this.workletNode = null;
    // ... otros nodos ...
    
    // Valores actuales de los diales (estado)
    this.values = { mean: 0, variance: 0, voltage1: 0, voltage2: 0, key: 0 };
    
    this.isStarted = false;
  }
  
  // ──── CONVERSIONES DE DIAL ────────────────────────────────────
  _levelDialToGain(dial) { /* curva LOG para nivel */ }
  _keyDialToGain(dial)   { return dial / 5; }
  
  // ──── INIT AUDIO ──────────────────────────────────────────────
  _initAudioNodes() {
    const ctx = this.getAudioCtx();
    if (!ctx || this.workletNode) return;
    
    // 1. Crear AudioWorkletNode
    this.workletNode = new AudioWorkletNode(ctx, 'random-cv', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [3]  // 3 canales de salida
    });
    attachProcessorErrorHandler(this.workletNode, 'random-cv');
    
    // 2. Crear nodos auxiliares (splitter, gains, etc.)
    // 3. Conectar grafo de audio
    // 4. Registrar salidas para sistema de ruteo:
    this.outputs.push(
      { id: 'voltage1', kind: 'randomCV', node: this.voltage1Gain, label: 'Random CV V1' },
      { id: 'voltage2', kind: 'randomCV', node: this.voltage2Gain, label: 'Random CV V2' },
      { id: 'key',      kind: 'randomCV', node: this.keyGain,      label: 'Random CV Key' }
    );
    
    // 5. Aplicar valores actuales al worklet
    this._sendToWorklet('setMean', this.values.mean);
  }
  
  // ──── SETTERS DE PARÁMETROS ───────────────────────────────────
  setMean(dialValue) {
    this.values.mean = Math.max(-5, Math.min(5, dialValue));  // clamp
    if (this._isDormant) return;  // no enviar al worklet en dormancy
    this._sendToWorklet('setMean', this.values.mean);
  }
  
  // ──── GETTERS DE NODOS ────────────────────────────────────────
  getOutputNode(outputId) {
    switch (outputId) {
      case 'voltage1': return this.getVoltage1Node();
      // ...
    }
  }
  
  // ──── CICLO DE VIDA ───────────────────────────────────────────
  start() {
    if (this.isStarted) return;
    this._initAudioNodes();
    this.isStarted = true;
  }
  
  stop() {
    // Enviar 'stop' al worklet, desconectar nodos, limpiar
  }
  
  // ──── DORMANCY ────────────────────────────────────────────────
  _onDormancyChange(dormant) {
    // Notificar al worklet
    this.workletNode?.port.postMessage({ type: 'setDormant', dormant });
    
    if (dormant) {
      // Silenciar gains con rampa
    } else {
      // Restaurar valores desde this.values
    }
  }
  
  // ──── HELPERS ─────────────────────────────────────────────────
  _sendToWorklet(type, value) {
    this.workletNode?.port.postMessage({ type, value });
  }
  
  _applyGain(gainNode, targetGain) {
    // setTargetAtTime con rampa suave
  }
}
```

### Puntos clave

- **Hereda de `Module`** (importado de `core/engine.js`)
- `Module` proporciona: `engine`, `id`, `name`, `inputs[]`, `outputs[]`, `_isDormant`, `setDormant()`, `_onDormancyChange()`
- **`this.outputs.push({...})`**: Registra salidas con `id`, `kind` (tipo del módulo para ruteo), `node` (AudioNode) y `label`
  - `kind` debe coincidir con el que se usa en el blueprint y en matrixTooltip, signalFlowHighlighter, dormancyManager
- **Lazy init**: `_initAudioNodes()` se llama desde `start()` o desde getters de nodos
- **`getOutputNode(outputId)`**: Interfaz estándar para que el router obtenga nodos por ID
- **Clamp**: Los setters deben hacer clamp de valores al rango permitido
- **Dormancy guard**: Los setters deben comprobar `if (this._isDormant) return;`

---

## 4. Componente UI

**Archivo**: `src/assets/js/ui/randomVoltage.js`  
**Clase**: `RandomVoltage extends ModuleUI`

### Patrón

```javascript
import { ModuleUI } from './moduleUI.js';
import { KNOB_RED, KNOB_WHITE } from '../configs/knobColors.js';

export class RandomVoltage extends ModuleUI {
  constructor(options = {}) {
    super({
      id: options.id || 'random-voltage',
      title: options.title || 'Random Control Voltage',
      cssClass: 'random-voltage',           // clase CSS del módulo
      knobDefs: [                            // definición de knobs
        { key: 'mean', label: 'Mean', color: KNOB_RED },
        { key: 'variance', label: 'Variance', color: KNOB_RED },
        { key: 'voltage1', label: 'Voltage 1', color: KNOB_WHITE },
        { key: 'voltage2', label: 'Voltage 2', color: KNOB_WHITE },
        { key: 'key', label: 'Key', color: KNOB_WHITE }
      ],
      knobOptions: options.knobOptions || {},
      knobSize: options.knobSize || 40,
      knobInnerPct: options.knobInnerPct,
      knobGap: options.knobGap,
      knobRowOffsetX: options.knobRowOffsetX,
      knobRowOffsetY: options.knobRowOffsetY,
      knobOffsets: options.knobOffsets
    });
  }
}
```

### Puntos clave

- **Hereda de `ModuleUI`** (`ui/moduleUI.js`) — proporciona `createElement()`, `serialize()`, `deserialize()`, `knobs` Map
- **`knobDefs`**: Array de definiciones de knobs con `key` (identifica el knob), `label` (texto mostrado), `color` (constante de color)
- **`knobOptions`**: Se pasa desde app.js con `onChange`, `getTooltipInfo`, y rangos del config
- **`cssClass`**: Clase CSS para el contenedor — usada en `findModuleElement()` del signalFlowHighlighter
- **Parámetros visuales**: `knobSize`, `knobInnerPct`, `knobGap`, `knobRowOffsetX`, `knobRowOffsetY`, `knobOffsets` — vienen del blueprint
- `serialize()` y `deserialize()` son heredados de `ModuleUI` y operan sobre los knobs

---

## 5. Config del módulo

**Archivo**: `src/assets/js/configs/modules/randomVoltage.config.js`

### Estructura

```javascript
export default {
  schemaVersion: 1,
  
  id: 'panel3-random-cv',                    // ID del módulo
  title: 'Random Control Voltage',           // Nombre legible
  
  // Filas de la matriz de control (Panel 6)
  matrixRow: {
    key: 89,
    voltage1: 90,
    voltage2: 91
  },
  
  // Parámetros de audio (pasados al worklet)
  audio: {
    minFreq: 0.2,
    maxFreq: 20,
    keyPulseWidth: 0.005,
    maxVoltage: 2.5,
    keyMaxVoltage: 5.0,
    voltsPerOctave: 0.55
  },
  
  // Curva del potenciómetro
  levelCurve: {
    type: 'log',
    logBase: 100
  },
  
  // Tiempos de rampa (suavizado de parámetros)
  ramps: {
    level: 0.06,
    mean: 0.05
  },
  
  // Definición de knobs (rangos, valores iniciales)
  knobs: {
    mean:     { min: -5, max: 5,  initial: 0, curve: 'linear' },
    variance: { min: -5, max: 5,  initial: 0, curve: 'linear' },
    voltage1: { min: 0,  max: 10, initial: 0, curve: 'linear' },
    voltage2: { min: 0,  max: 10, initial: 0, curve: 'linear' },
    key:      { min: -5, max: 5,  initial: 0, curve: 'linear' }
  }
};
```

### Puntos clave

- **`id`**: ID único del módulo — usado en `new RandomCVModule(engine, id)` y como clave en `_randomVoltageUIs`
- **`matrixRow`**: Mapa de salida → fila en la matriz de control (Panel 6). Debe coincidir con el blueprint
- **`knobs`**: Define los rangos, usados para:
  - Pasar a la UI como opciones de knob
  - Generar los defaults en `_defaultValues` de app.js
  - Validar en tests
- La config se exporta como `default export` e importa en `configs/index.js`

---

## 6. Panel Blueprint (Matriz)

**Archivo**: `src/assets/js/panelBlueprints/panel6.control.blueprint.js`

### Registro de filas de source

```javascript
// RANDOM CONTROL VOLTAGE GENERATOR (filas 89-91)
{ rowSynth: 89, source: { kind: 'randomCV', output: 'key' } },
{ rowSynth: 90, source: { kind: 'randomCV', output: 'voltage1' } },
{ rowSynth: 91, source: { kind: 'randomCV', output: 'voltage2' } },
```

### Puntos clave

- **`kind`**: El identificador del tipo de módulo — debe coincidir en:
  - `module.outputs[].kind` (módulo de audio)
  - `matrixTooltip.js` → `getLabelForSource()` (etiqueta en tooltip)
  - `signalFlowHighlighter.js` → `getModuleElementIds()` (highlight)
  - `dormancyManager.js` → `updateAllStates()` (dormancy)
  - `app.js` → `_handlePanel6AudioToggle()` (ruteo)
- **`output`**: Identificador de la salida específica — debe coincidir con `getOutputNode(outputId)` del módulo
- **`rowSynth`**: Fila en la matriz del Synthi 100 (coincide con `matrixRow` del config)

---

## 7. Registro del Worklet (Engine)

**Archivo**: `src/assets/js/core/engine.js` (~línea 1824)

### Cambio

Añadir la ruta del worklet al array de `_loadWorklets()`:

```javascript
const worklets = [
  './assets/js/worklets/synthOscillator.worklet.js',
  // ... otros worklets ...
  './assets/js/worklets/randomCV.worklet.js',
  './assets/js/worklets/myModule.worklet.js'      // ← NUEVO
];
```

### Puntos clave

- Todos los worklets se cargan en paralelo con `Promise.all()` al iniciar el AudioContext
- La ruta es relativa al HTML raíz (`index.html`)
- El nombre en `registerProcessor('...')` del worklet debe coincidir con el usado en `new AudioWorkletNode(ctx, '...')` del módulo

---

## 8. Integración en App.js

**Archivo**: `src/assets/js/app.js` — El archivo más largo y con más puntos de integración.

### 8.1 Imports (líneas ~18-105)

```javascript
// Módulo de audio
import { RandomCVModule } from './modules/randomCV.js';

// Componente UI
import { RandomVoltage } from './ui/randomVoltage.js';

// Config (via configs/index.js)
import { randomVoltageConfig } from './configs/index.js';

// UI helpers
import { getRandomCVUIDefaults, resolveModuleUI } from './ui/layoutHelpers.js';

// Tooltip utils
import { getRandomCVMeanTooltipInfo, getRandomCVVarianceTooltipInfo, 
         getRandomCVVoltageLevelTooltipInfo, getRandomCVKeyTooltipInfo } from './utils/tooltipUtils.js';

// OSC sync
import { randomCVOSCSync } from './osc/oscRandomCVSync.js';
```

### 8.2 Estado en el constructor (~línea 216)

```javascript
this._randomVoltageUIs = {};  // Mapa de id → instancia UI
```

### 8.3 Inicialización OSC (~línea 240)

```javascript
randomCVOSCSync.init(this);
```

### 8.4 Creación del módulo de audio (~línea 4328)

En `_buildOscillatorPanel()` (solo para Panel 3):

```javascript
randomCVAudio = new RandomCVModule(this.engine, 'panel3-random-cv', {
  levelCurve: { logBase: rvgLevelCurve.logBase || 100 },
  ramps: { level: rvgRamps.level || 0.06, mean: rvgRamps.mean || 0.05 }
});
```

### 8.5 Creación de la UI con callbacks (~líneas 4348-4405)

```javascript
const randomCV = new RandomVoltage({
  id: randomCVId,
  title: randomCVCfg.title || 'Random Control Voltage',
  knobOptions: {
    mean: {
      ...randomCVCfg.knobs?.mean,         // rangos del config
      onChange: (value) => {               // callback a audio
        randomCVAudio.setMean(value);
        if (!randomCVOSCSync.shouldIgnoreOSC()) {
          randomCVOSCSync.sendChange('mean', value);  // notificar OSC
        }
      },
      getTooltipInfo: rvgMeanTooltip       // tooltip dinámico
    },
    // ... otros knobs igual ...
  },
  ...randomCVResolvedUI                    // parámetros visuales del blueprint
});

this._randomVoltageUIs[randomCVId] = randomCV;
```

### 8.6 Visibilidad y DOM (~línea 4408)

```javascript
const randomCVEl = randomCV.createElement();
applyModuleVisibility(randomCVEl, panel3Blueprint, 'randomCV');
reservedRow.appendChild(randomCVEl);
```

### 8.7 Guardar en layout data (~línea 4434)

```javascript
this[layoutDataKey] = {
  // ...
  randomCVAudio  // referencia al módulo de audio
};
```

### 8.8 Serialización del estado (~línea 1675)

```javascript
if (this._randomVoltageUIs) {
  state.modules.randomVoltage = {};
  for (const [id, ui] of Object.entries(this._randomVoltageUIs)) {
    if (ui && typeof ui.serialize === 'function') {
      state.modules.randomVoltage[id] = ui.serialize();
    }
  }
}
```

### 8.9 Deserialización (restaurar patch) (~línea 1787)

```javascript
if (modules.randomVoltage && this._randomVoltageUIs) {
  for (const [id, data] of Object.entries(modules.randomVoltage)) {
    const ui = this._randomVoltageUIs[id];
    if (ui && typeof ui.deserialize === 'function') {
      ui.deserialize(data);
    }
  }
}
```

### 8.10 Reset to defaults (~línea 1918)

```javascript
if (this._randomVoltageUIs) {
  for (const ui of Object.values(this._randomVoltageUIs)) {
    if (ui && typeof ui.deserialize === 'function') {
      ui.deserialize(defaults.randomVoltage);
    }
  }
}
```

### 8.11 Default values getter (~línea 2055)

```javascript
randomVoltage: {
  mean: rvKnobs.mean.initial,
  variance: rvKnobs.variance.initial,
  voltage1: rvKnobs.voltage1.initial,
  voltage2: rvKnobs.voltage2.initial,
  key: rvKnobs.key.initial
},
```

### 8.12 Módulos por panel (~línea 2095)

```javascript
// En _getModulesForPanel('panel-3'):
for (const [id, ui] of Object.entries(this._randomVoltageUIs)) {
  if (id.startsWith('panel3-random')) modules.push({ type: 'randomVoltage', id, ui });
}
```

### 8.13 Búsqueda por ID (~línea 2155)

```javascript
// En _findModuleById(moduleId):
if (this._randomVoltageUIs[moduleId]) {
  return { type: 'randomVoltage', ui: this._randomVoltageUIs[moduleId] };
}
```

### 8.14 Ruteo en Panel 6 (~línea 6236)

En `_handlePanel6AudioToggle()` — el handler que conecta/desconecta fuentes de la matriz:

```javascript
} else if (source.kind === 'randomCV') {
  const rvgOutput = source.output; // 'voltage1', 'voltage2' o 'key'
  const panel3Data = this['_panel3LayoutData'];
  const rvgModule = panel3Data?.randomCVAudio;

  if (!rvgModule) { return false; }

  // Lazy start: arranca el módulo solo al primer pin
  if (!rvgModule.isStarted) {
    rvgModule.start();
  }

  outNode = rvgModule.getOutputNode(rvgOutput);
}
```

---

## 9. OSC Sync

**Archivo**: `src/assets/js/osc/oscRandomCVSync.js`

### Patrón

```javascript
import { oscBridge } from './oscBridge.js';

const PARAM_TO_ADDRESS = {
  mean: 'random/mean',
  variance: 'random/variance',
  // ...
};

const PARAM_TO_AUDIO_METHOD = {
  mean: 'setMean',
  variance: 'setVariance',
  // ...
};

class RandomCVOSCSync {
  constructor() {
    this._unsubscribers = new Map();
    this._app = null;
    this._ignoreOSCUpdates = false;
    this._lastSentValues = new Map();
  }

  init(app) {
    this._app = app;
    this._setupListeners();
  }

  sendChange(param, dialValue) {
    if (!oscBridge.connected) return;
    // Deduplicación + envío
    oscBridge.send(address, dialValue);
  }

  _setupListeners() {
    for (const [param, address] of Object.entries(PARAM_TO_ADDRESS)) {
      const unsub = oscBridge.on(address, (value) => {
        this._handleIncoming(param, value);
      });
      this._unsubscribers.set(param, unsub);
    }
  }

  _handleIncoming(param, oscValue) {
    if (this._ignoreOSCUpdates) return;
    this._ignoreOSCUpdates = true;
    try {
      // Aplicar al módulo de audio
      const audioModule = this._app._panel3LayoutData?.randomCVAudio;
      audioModule?.[audioMethod](oscValue);
      
      // Actualizar knob en la UI
      const ui = this._app._randomVoltageUIs?.['panel3-random-cv'];
      ui?.knobs?.[param]?.setValue(oscValue);
    } finally {
      setTimeout(() => { this._ignoreOSCUpdates = false; }, 10);
    }
  }

  shouldIgnoreOSC() { return this._ignoreOSCUpdates; }
  destroy() { /* limpieza */ }
}

const randomCVOSCSync = new RandomCVOSCSync();
export { randomCVOSCSync, RandomCVOSCSync, PARAM_TO_ADDRESS };
export default randomCVOSCSync;
```

### Puntos clave

- **Singleton**: Una instancia global exportada
- **Anti-feedback**: Flag `_ignoreOSCUpdates` para evitar loops al recibir OSC y actualizar la UI
- **Deduplicación**: Cache de últimos valores enviados para evitar mensajes redundantes
- **Acceso a módulo y UI**: Via `this._app._panel3LayoutData?.randomCVAudio` y `this._app._randomVoltageUIs`
- **En app.js**: `randomCVOSCSync.init(this)` en constructor, `randomCVOSCSync.sendChange('param', value)` en callbacks de knobs
- **Direcciones OSC**: Sin prefijo (se añade automáticamente por oscBridge)

---

## 10. Tooltips

**Archivo**: `src/assets/js/utils/tooltipUtils.js` (~líneas 229-395)

### Patrón

Cada knob tiene una función factory que retorna una función `(dialValue) => string|null`:

```javascript
export function getRandomCVMeanTooltipInfo(voltsPerOctave = 0.55) {
  return (dialValue) => {
    const parts = [];
    
    if (showAudioTooltip()) {
      parts.push(`${freq.toFixed(1)} Hz`);
    }
    
    if (showVoltageTooltip()) {
      parts.push(`${voltage.toFixed(2)}V`);
    }
    
    return parts.length > 0 ? parts.join(' · ') : null;
  };
}
```

### Funciones necesarias por tipo de knob

| Knob | Función | Muestra |
|------|---------|---------|
| Mean | `getRandomCVMeanTooltipInfo(voltsPerOctave)` | freq Hz · período · voltaje CV |
| Variance | `getRandomCVVarianceTooltipInfo()` | % · descripción textual |
| Voltage1/2 | `getRandomCVVoltageLevelTooltipInfo(maxV, logBase)` | ±V · gain · dB |
| Key | `getRandomCVKeyTooltipInfo(pulseWidthMs)` | voltaje · ancho pulso |

### Puntos clave

- Se usan `showAudioTooltip()` y `showVoltageTooltip()` para respetar las preferencias del usuario
- Las funciones se pasan como `getTooltipInfo` en las opciones de cada knob en app.js

---

## 11. Signal Flow Highlighter

**Archivo**: `src/assets/js/ui/signalFlowHighlighter.js` (~línea 90)

### Cambio

Añadir un case en `getModuleElementIds()`:

```javascript
case 'randomCV':
  return ['panel3-random-cv'];  // ID del elemento DOM del módulo
```

### Puntos clave

- `kind` del blueprint source debe coincidir con el case
- Devuelve un array con el ID del elemento DOM (el mismo que se pasa a `RandomVoltage({ id: '...' })`)
- También verificar que la clase CSS del módulo está en el selector de `findModuleElement()`:
  ```javascript
  el.closest('.synth-module, .noise-generator, .random-voltage, ...')
  ```

---

## 12. Matrix Tooltip

**Archivo**: `src/assets/js/ui/matrixTooltip.js` (~línea 94)

### Cambio

Añadir un case en `getLabelForSource()`:

```javascript
case 'randomCV': {
  const outputKey = source.output || 'key';
  return t(`matrix.source.randomCV.${outputKey}`);
}
```

### Puntos clave

- `source.output` viene del blueprint (ej: `'voltage1'`, `'voltage2'`, `'key'`)
- Las claves de traducción deben existir en `translations.yaml`
- Patron: `matrix.source.{kind}.{output}`

---

## 13. Dormancy Manager

**Archivo**: `src/assets/js/core/dormancyManager.js`

### Cambios en `updateAllStates()` (~líneas 246-253)

```javascript
// RANDOM CONTROL VOLTAGE GENERATOR - filas 89-91 en Panel 6
{
  const hasRCVOutput = panel6Connections.some(c =>
    c.source?.kind === 'randomCV'
  );
  this._setModuleDormant('random-cv', !hasRCVOutput);
}
```

### Cambios en `_findModule()` (~líneas 441-444)

```javascript
// Random Control Voltage Generator
if (moduleId === 'random-cv') {
  return this.app._panel3LayoutData?.randomCVAudio;
}
```

### Puntos clave

- **Fuentes (outputs)**: Dormant si ninguna fila del módulo tiene conexión en la matriz
- **Destinos (inputs)**: Dormant si ninguna columna del módulo tiene conexión
- **El ID del módulo aquí** (`'random-cv'`) es el utilizado internamente por el dormancy — puede diferir del ID del módulo de audio (`'panel3-random-cv'`)
- El módulo entero se duerme/despierta como unidad (las 3 salidas del RVG son atómicas)
- Para módulos con múltiples instancias (ej: osciladores), se usan `osc-${index}`

---

## 14. i18n (Traducciones)

**Archivo**: `src/assets/js/i18n/translations.yaml`

### Entradas necesarias

```yaml
matrix.source.randomCV.key:
  en: "Random CV Key"
  es: "Random CV Key"
  fr: "Random CV Key"
  de: "Random CV Key"
  it: "Random CV Key"
  pt: "Random CV Key"
  cs: "Random CV Key"

matrix.source.randomCV.voltage1:
  en: "Random CV V1"
  es: "Random CV V1"
  # ... otros idiomas

matrix.source.randomCV.voltage2:
  en: "Random CV V2"
  es: "Random CV V2"
  # ... otros idiomas
```

### Puntos clave

- Una entrada por cada output del módulo en la matriz
- La clave sigue el patrón `matrix.source.{kind}.{output}`
- Debe haber entrada en todos los idiomas soportados (en, es, fr, de, it, pt, cs)
- Se usan en `matrixTooltip.js` → `getLabelForSource()`
- Después de modificar, ejecutar `npm run build:i18n` para compilar

---

## 15. Layout Helpers

**Archivo**: `src/assets/js/ui/layoutHelpers.js`

### Función necesaria

```javascript
export function getRandomCVUIDefaults() {
  return {
    ...FALLBACK_MODULE_UI,
    ...panel3Blueprint?.randomCVUI    // merge con defaults del blueprint
  };
}
```

### Uso en app.js

```javascript
const randomCVUIDefaults = getRandomCVUIDefaults();
const randomCVBlueprintUI = panel3Blueprint?.modules?.randomCV?.ui || {};
const randomCVResolvedUI = resolveModuleUI(randomCVUIDefaults, randomCVBlueprintUI);
```

---

## 16. Tests

### Estructura de tests por área

| Archivo | Describe blocks |
|---------|----------------|
| `tests/worklets/randomCV.worklet.test.js` | meanDialToFreq, varianceDialToNorm, calculateNextInterval, Constantes, Import real, Dormancy |
| `tests/modules/randomCV.test.js` | inicialización, conexiones y outputs, level dial→gain LOG, key dial→gain bipolar, control de parámetros, clamping, getOutputNode, dormancy |
| `tests/configs/randomVoltage.config.test.js` | Estructura, Matrix rows (Panel 6), Parámetros de audio, Curva LOG, Ramps, Knobs (por cada knob), coherencia |
| `tests/osc/oscRandomCVSync.test.js` | Direcciones OSC, MODULE_PARAMETERS, coherencia PARAM_TO_ADDRESS↔MODULE_PARAMETERS, Valores directos, Rangos |
| `tests/core/dormancyRandomCV.test.js` | sin conexiones, con Key/V1/V2 conectados, cualquiera activa módulo, transiciones, _findModule, conexiones no-RVG |
| `tests/panelBlueprints/panel6RandomCV.test.js` | Random CV sources |
| `tests/utils/tooltipRandomCV.test.js` | Mean (audio+voltaje), Variance, VoltageLevel (curva LOG), Key |

### Patrón de test del worklet

Los worklets se testean extrayendo las funciones de conversión y simulando el procesador con mocks de `AudioWorkletProcessor`, `sampleRate`, y `registerProcessor`.

### Patrón de test del módulo

Se usa un mock del `AudioContext` con `createGain()`, `createChannelSplitter()`, etc., que devuelven objetos stub con contadores de llamadas.

---

## 17. Checklist rápido

### Crear archivos

- [ ] **Worklet** (`src/assets/js/worklets/myModule.worklet.js`)
  - `class extends AudioWorkletProcessor` con `process()`, `_handleMessage()` (`setDormant`, `stop`, params)
  - `registerProcessor('my-module-id', MyModuleProcessor)`
- [ ] **Módulo de audio** (`src/assets/js/modules/myModule.js`)
  - `class extends Module` con `_initAudioNodes()`, setters, getters, `start()`, `stop()`, `_onDormancyChange()`
  - `this.outputs.push({ id, kind, node, label })`
- [ ] **UI** (`src/assets/js/ui/myModule.js`)
  - `class extends ModuleUI` con `knobDefs`, `cssClass`
- [ ] **Config** (`src/assets/js/configs/modules/myModule.config.js`)
  - `id`, `title`, `matrixRow`, `audio`, `knobs`, `levelCurve`, `ramps`
- [ ] **OSC Sync** (`src/assets/js/osc/oscMyModuleSync.js`)
  - `PARAM_TO_ADDRESS`, `PARAM_TO_AUDIO_METHOD`, `init(app)`, `sendChange()`, `shouldIgnoreOSC()`

### Modificar archivos

- [ ] **Engine** (`core/engine.js`): Añadir worklet al array `worklets` en `_loadWorklets()`
- [ ] **Configs index** (`configs/index.js`): `export { default as myModuleConfig } from './modules/myModule.config.js'` + añadir al objeto combinado
- [ ] **Panel Blueprint** (`panelBlueprints/panel6.control.blueprint.js`): Añadir filas `{ rowSynth: N, source: { kind: 'myModule', output: '...' } }`
- [ ] **Panel 3 Blueprint** (`panelBlueprints/panel3.blueprint.js`):
  - Añadir `myModuleUI: { knobSize, knobInnerPct, knobGap, ... }` (defaults visuales)
  - Añadir `modules.myModule: { visible: true }` 
- [ ] **App.js** — 14 puntos:
  1. Import módulo de audio
  2. Import UI
  3. Import config
  4. Import UI defaults helper
  5. Import tooltip utils
  6. Import OSC sync
  7. Añadir `this._myModuleUIs = {}` en constructor
  8. `myModuleOSCSync.init(this)` en constructor
  9. Crear módulo de audio + UI con callbacks en `_buildOscillatorPanel()`
  10. Serialización en `_serializeCurrentState()`
  11. Deserialización en `_applyPatch()`
  12. Reset en `_resetToDefaults()`
  13. Default values en `_defaultValues`
  14. Ruteo de fuente en `_handlePanel6AudioToggle()` (el `source.kind` case)
  15. `_getModulesForPanel()` — añadir al panel correspondiente
  16. `_findModuleById()` — añadir case de búsqueda
- [ ] **matrixTooltip.js**: Añadir case `'myModule'` en `getLabelForSource()`
- [ ] **signalFlowHighlighter.js**: Añadir case `'myModule'` en `getModuleElementIds()` + CSS class en `findModuleElement()`
- [ ] **dormancyManager.js**: 
  - Añadir bloque en `updateAllStates()` que busca conexiones de tipo `'myModule'`
  - Añadir case en `_findModule()` para localizar la instancia
- [ ] **tooltipUtils.js**: Crear funciones `getMyModuleFooTooltipInfo()` para cada knob
- [ ] **layoutHelpers.js**: Crear `getMyModuleUIDefaults()`
- [ ] **translations.yaml**: Añadir `matrix.source.myModule.output1`, etc. en todos los idiomas

### Tests

- [ ] Tests del worklet (conversiones, constantes, dormancy)
- [ ] Tests del módulo (inicialización, conexiones, conversiones, clamping, dormancy)
- [ ] Tests del config (estructura, rangos, coherencia)
- [ ] Tests de OSC sync (direcciones, parámetros, rangos)
- [ ] Tests de dormancy (con/sin conexiones, transiciones, _findModule)
- [ ] Tests del blueprint (filas, kinds)
- [ ] Tests de tooltip (valores, condiciones, formatos)

### Documentación

- [ ] **CHANGELOG.md**: Entrada en `Unreleased > Added`
- [ ] **OSC.md**: Documentar las direcciones OSC del módulo (sección nueva)

---

## Diagrama de dependencias

```
                    ┌──────────────────────┐
                    │   translations.yaml  │
                    └──────────┬───────────┘
                               │ t()
                    ┌──────────▼───────────┐
                    │   matrixTooltip.js   │
                    └──────────────────────┘
                               
┌────────────────┐  ┌──────────────────────┐  ┌───────────────────┐
│  worklet.js    │  │   module class .js   │  │    UI class .js   │
│ (DSP thread)   │  │  (main thread)       │  │ extends ModuleUI  │
│                │◀─│  owns AudioNodes     │  │ owns DOM + knobs  │
│ registerProc   │  │  extends Module      │  └────────┬──────────┘
└────────────────┘  └──────────┬───────────┘           │
                               │                       │
                    ┌──────────▼───────────┐           │
                    │      app.js          │◀──────────┘
                    │  creates both        │
                    │  wires callbacks      │
                    │  serialize/deserialize│
                    └──┬───┬───┬───────────┘
                       │   │   │
          ┌────────────┘   │   └──────────────┐
          ▼                ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ dormancyMgr.js  │ │ oscSync.js   │ │ configs/index.js │
│ _findModule()   │ │ init(app)    │ │ config export    │
│ updateAllStates │ │ sendChange() │ └──────────────────┘
└─────────────────┘ └──────────────┘

┌──────────────────────────────────────────────────────────────┐
│  panel6.control.blueprint.js                                 │
│  { rowSynth: N, source: { kind: 'myModule', output: '...' }}│
└──────────────────────────────────────────────────────────────┘
```

---

## Identifiers cross-reference

| Concepto | Identificador | Usado en |
|----------|---------------|----------|
| Processor name | `'random-cv'` | `registerProcessor()`, `new AudioWorkletNode()` |
| Module ID | `'panel3-random-cv'` | `new RandomCVModule(engine, id)`, `_randomVoltageUIs[id]` |
| Source kind | `'randomCV'` | Blueprint, matrixTooltip, signalFlowHighlighter, dormancyManager, app.js routing |
| Output IDs | `'voltage1'`, `'voltage2'`, `'key'` | Blueprint `output`, `getOutputNode()`, OSC, tooltip |
| Dormancy ID | `'random-cv'` | `dormancyManager._setModuleDormant()`, `_findModule()` |
| CSS class | `'random-voltage'` | UI `cssClass`, `findModuleElement()` selector |
| Config export name | `randomVoltageConfig` | `configs/index.js`, app.js imports |
| UI store key | `_randomVoltageUIs` | app.js (serialize, deserialize, reset, find) |
| Layout data key | `randomCVAudio` | `_panel3LayoutData.randomCVAudio` |
| State key | `modules.randomVoltage` | serialize/deserialize patches |
| Blueprint module key | `'randomCV'` | `panel3Blueprint.modules.randomCV`, `applyModuleVisibility()` |
| Blueprint UI defaults key | `'randomCVUI'` | `panel3Blueprint.randomCVUI` |
| OSC addresses | `'random/mean'`, etc. | `oscRandomCVSync.js`, OSC.md |
| i18n keys | `'matrix.source.randomCV.key'`, etc. | translations.yaml, matrixTooltip.js |
| Tooltip type | `'randomVoltage'` | `_getModulesForPanel`, `_findModuleById` |
