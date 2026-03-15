# Guía para crear un nuevo módulo de sintetizador en SynthiGME

Checklist completo basado en tres implementaciones de referencia:

- **Random Control Voltage Generator** — Módulo estándar con ModuleUI (Panel 3). Patrón típico para módulos con knobs en panel.
- **Keyboard** — Módulo dual con UI flotante, eventos de nota y MIDI (Panel 4). Patrón alternativo para módulos con interacción compleja o UI no-estándar.
- **Digital Sequencer 1000** — Módulo complejo con FSM, memoria, múltiples I/O, UI directa en dos paneles (Panel 4 + Panel 7), y conexiones simultáneas en Panel 5 y Panel 6. Patrón para módulos con lógica de estado compleja y presencia distribuida.

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
18. [Patrones alternativos (lecciones del Keyboard)](#18-patrones-alternativos-lecciones-del-keyboard)
19. [Patrones del Sequencer](#19-patrones-del-sequencer)

---

## 1. Resumen de archivos necesarios

Para un módulo nuevo llamado `myModule`, hay que crear o modificar estos archivos:

### Archivos a CREAR

| # | Archivo | Propósito |
|---|---------|-----------|
| 1 | `src/assets/js/worklets/myModule.worklet.js` | AudioWorkletProcessor (DSP) |
| 2 | `src/assets/js/modules/myModule.js` | Clase de audio (main thread) |
| 3 | `src/assets/js/ui/myModule.js` | Componente UI (extiende ModuleUI) **o** ventana flotante |
| 4 | `src/assets/js/configs/modules/myModule.config.js` | Configuración de parámetros |
| 5 | `src/assets/js/osc/oscMyModuleSync.js` | Sincronización OSC |
| 6 | `tests/worklets/myModule.worklet.test.js` | Tests del worklet |
| 7 | `tests/modules/myModule.test.js` | Tests del módulo de audio |
| 8 | `tests/configs/myModule.config.test.js` | Tests del config |
| 9 | `tests/osc/oscMyModuleSync.test.js` | Tests de OSC sync |
| 10 | `tests/core/dormancyMyModule.test.js` | Tests de dormancy |
| 11 | `tests/panelBlueprints/panelNMyModule.test.js` | Tests del blueprint |
| 12 | `tests/utils/tooltipMyModule.test.js` | Tests de tooltip |

> **Nota**: Módulos con UI interactiva compleja (como el Keyboard) pueden necesitar archivos
> adicionales: un SVG interactivo (`src/assets/panels/`), atajos de teclado (`keyboardShortcuts.js`),
> o integración MIDI directa. Ver [sección 18](#18-patrones-alternativos-lecciones-del-keyboard).

### Archivos a MODIFICAR

| # | Archivo | Cambio |
|---|---------|--------|
| 13 | `src/assets/js/core/engine.js` | Registrar worklet en `_loadWorklets()` |
| 14 | `src/assets/js/configs/index.js` | Exportar/importar config |
| 15 | `src/assets/js/panelBlueprints/panel6.control.blueprint.js` | Añadir filas source/dest |
| 16 | `src/assets/js/panelBlueprints/panel3.blueprint.js` | Añadir UI defaults + módulo en `modules` |
| 17 | `src/assets/js/app.js` | ~14-16 puntos de integración (ver sección 8) |
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

> **Patrón alt (Keyboard)**: Para módulos con eventos discretos (noteOn/noteOff) en lugar de
> parámetros continuos, el worklet recibe mensajes `{ type: 'noteOn', note, velocity }` y
> `{ type: 'noteOff', note }`. Internamente mantiene un `Set<number>` de teclas pulsadas
> con prioridad de nota más alta, y usa sample & hold para pitch y velocity (el valor se
> mantiene después de soltar). El `process()` genera señales DC constantes por frame
> (pitch, velocity, gate = 3 canales) en lugar de señal de audio. También puede implementar
> lógica de retrigger con un gap temporal en samples.

> **Patrón alt (Sequencer)**: Para módulos con máquina de estados (FSM), memoria interna
> y reloj propio. El worklet del sequencer implementa:
> - **FSM de transporte**: estados `stopped`/`running-forward`/`running-reverse` con
>   transiciones via mensajes `pressButton` (masterReset, runForward, runReverse, stop, etc.)
> - **Memoria**: array de 256 eventos × 4 grupos (voltages + keys), escritos/leídos por step
> - **Reloj interno**: genera ticks cada N samples (configurable via `clockRate`); opcionalmente
>   acepta reloj externo vía input de audio con **Schmitt trigger + blanking** para detección
>   de flanco robusta
> - **Múltiples canales**: 13 canales de salida (6 voltages + 4 keys + 2 DAC + clock) y
>   8 canales de entrada (5 control + 3 voltage recording) multiplexados via ChannelSplitter/Merger
> - **Callbacks al main thread**: `port.postMessage({ type: 'counter', value, text })` y
>   `{ type: 'overflow' }` para actualizar display y feedback visual
> - **Dual `process()` path**: un bloque común de tick + counter, con ramas para dormant
>   (silencia salidas pero mantiene estado) y activo (escribe canales de salida)
> Ver [sección 19](#19-patrones-del-sequencer) para patrones detallados.

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
  - Para **módulos con instancias múltiples** (Keyboard upper/lower), usar `kind` diferentes por instancia: `keyboardUpper`, `keyboardLower`
- **Lazy init**: `_initAudioNodes()` se llama desde `start()` o desde getters de nodos
- **`getOutputNode(outputId)`**: Interfaz estándar para que el router obtenga nodos por ID
- **Clamp**: Los setters deben hacer clamp de valores al rango permitido
- **Dormancy guard**: Los setters deben comprobar `if (this._isDormant) return;`

> **Patrón alt (Keyboard)**: El módulo puede tener métodos `noteOn(note, velocity)` y
> `noteOff(note)` que envían mensajes al worklet por `port.postMessage()` en lugar de
> solo setters de parámetros continuos. También, si el módulo tiene un constructor con
> parámetro `side` (`'upper'|'lower'`), debe usar el `side` para diferenciar las salidas
> registradas (ej: `kind: 'keyboardUpper'` vs `kind: 'keyboardLower'`).
> La serialización va en el módulo de audio (`serialize()`/`deserialize()`) en lugar de en
> la UI, porque la UI flotante es independiente del estado de audio.

> **Patrón alt (Sequencer)**: Para módulos con múltiples canales de I/O, usar
> `ChannelSplitter` y `ChannelMerger` para multiplexar un solo `AudioWorkletNode`:
> ```javascript
> // 13 canales de salida multiplexados
> this.workletNode = new AudioWorkletNode(ctx, 'sequencer', {
>   numberOfInputs: 1, numberOfOutputs: 1,
>   outputChannelCount: [13]
> });
> this._splitter = ctx.createChannelSplitter(13);
> this.workletNode.connect(this._splitter);
> // Cada canal → GainNode individual → outputs.push(...)
>
> // 8 canales de entrada multiplexados
> this._merger = ctx.createChannelMerger(8);
> this._merger.connect(this.workletNode);
> // Cada input → GainNode → merger.connect(merger, 0, channelIndex)
> ```
> El módulo registra **tanto outputs como inputs** en `this.outputs` y `this.inputs`,
> usando un solo `kind` (`'sequencer'`) para outputs pero kinds diferenciados para
> inputs (`'sequencerControl'` para Panel 5, `'sequencerInput'` para Panel 6).
> También soporta **callbacks del worklet** (`onCounterChange`, `onOverflow`) que
> el main thread usa para actualizar la UI (display, indicadores).

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

> **Patrón alt (Keyboard)**: No todos los módulos usan `ModuleUI`. El Keyboard usa una
> **ventana flotante** (`keyboardWindow.js`) con funciones exportadas (`initKeyboardWindow()`,
> `openKeyboard()`, `closeKeyboard()`, `serializeKeyboardState()`, `restoreKeyboardState()`).
> Los knobs del panel (Pitch Spread, Velocity, Gate) se crean directamente en el método
> `_buildPanel4()` de app.js usando `createKnob()`, `VernierKnob` y `RotarySwitch`, sin
> pasar por `ModuleUI`. Considerar este patrón cuando:
> - El módulo tiene una interfaz visual separada del panel de knobs (ej: teclado SVG, pantalla)
> - Se necesita arrastrar/redimensionar la ventana
> - La ventana tiene modos de interacción (normal, latch, legato)
> - Se necesita persistir posición/tamaño en localStorage + patches

> **Patrón alt (Sequencer)**: El tercer patrón de UI: **DOM directo en múltiples paneles**
> sin ModuleUI ni ventana flotante. El sequencer construye su interfaz repartida en dos
> métodos de app.js:
> - **`_buildPanel4()`**: Crea el display de 7 segmentos CSS LED (`seq-event-time-display`)
>   con 4 dígitos y supresión de ceros iniciales. Recibe actualizaciones via callback
>   `onCounterChange(value, text)` desde el módulo de audio.
> - **`_buildPanel7()`**: Crea switches (Toggle/RotarySwitch), botones de transporte
>   (step buttons con dual función: navegar + grabar), y knob de clock rate.
>   Los botones usan `mousedown`/`mouseup` (momentary) y `pressButton()`/`releaseButton()`.
>
> Considerar este patrón cuando:
> - El módulo no necesita ventana flotante independiente
> - La UI está visualmente integrada en los paneles del sintetizador
> - Elementos en dos o más paneles (display en uno, controles en otro)
> - Se necesita feedback en tiempo real desde el worklet (callbacks)

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

> **Config del Keyboard**: Para módulos con **instancias múltiples**, `matrixRow` es un
> objeto anidado por lado (ej: `{ upper: { pitch: 111, velocity: 112, gate: 113 }, lower: {...} }`).
> Añade sección `switches` para parámetros binarios (toggles/rotary switches):
> ```javascript
> switches: {
>   retrigger: {
>     initial: 0,
>     labelA: 'On',     // posición izquierda en hardware
>     labelB: 'Kbd'     // posición derecha en hardware
>   }
> }
> ```
> También sección `audio` para constantes del DSP (pivotNote, spreadUnity, retriggerGapMs).

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

> **Módulos con instancias múltiples (Keyboard)**: Usar un `kind` diferente por instancia.
> El Keyboard usa `keyboardUpper` y `keyboardLower`:
> ```javascript
> // 6 filas en total: 3 salidas × 2 teclados
> { rowSynth: 111, source: { kind: 'keyboardUpper', output: 'pitch' } },
> { rowSynth: 112, source: { kind: 'keyboardUpper', output: 'velocity' } },
> { rowSynth: 113, source: { kind: 'keyboardUpper', output: 'gate' } },
> { rowSynth: 114, source: { kind: 'keyboardLower', output: 'pitch' } },
> // ...
> ```
> Esto requiere un case separado por `kind` en matrixTooltip, signalFlowHighlighter,
> dormancyManager y app.js routing.

> **Módulos en dos matrices (Sequencer)**: El sequencer tiene presencia simultánea en
> Panel 5 (audio) y Panel 6 (control), con filas source Y columnas dest en ambos:
> ```javascript
> // Panel 5 (audio) — sources
> { rowSynth: 87, source: { kind: 'sequencer', output: 'dac1' } },
> { rowSynth: 88, source: { kind: 'sequencer', output: 'clock' } },
> // Panel 5 (audio) — destinations (control inputs)
> { colSynth: 51, dest: { kind: 'sequencerControl', controlType: 'clock' } },
> { colSynth: 52, dest: { kind: 'sequencerControl', controlType: 'reset' } },
> // ... 5 control inputs total
>
> // Panel 6 (control) — sources (11 salidas: 6V + 4K + clock)
> { rowSynth: 100, source: { kind: 'sequencer', output: 'voltageA' } },
> // ... 11 output rows total
> // Panel 6 (control) — destinations (voltage inputs para grabación)
> { colSynth: 60, dest: { kind: 'sequencerInput', inputType: 'voltageACE' } },
> { colSynth: 61, dest: { kind: 'sequencerInput', inputType: 'voltageBDF' } },
> { colSynth: 62, dest: { kind: 'sequencerInput', inputType: 'key' } }
> ```
> Nota: el `kind` de las sources es el mismo (`'sequencer'`) en ambas matrices, pero
> las destinations usan kinds diferenciados (`'sequencerControl'` vs `'sequencerInput'`)
> porque se rutean a nodos de audio distintos (control inputs vs voltage recording inputs).

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

> **Integración Keyboard en app.js**: El teclado sigue el mismo esquema de 14+ puntos
> pero con diferencias significativas:
>
> - **Constructor**: `this._keyboardModules = {}` (objeto con claves `upper`/`lower`) +
>   `this._keyboardKnobs = {}` para guardar referencias a las instancias de knob
> - **Build**: Se crea en `_buildPanel4()` en lugar de `_buildOscillatorPanel()`. Los knobs
>   se crean manualmente con `createKnob()` y `VernierKnob`, no via `ModuleUI`
> - **Módulos de audio**: Se crean 2 instancias: `new KeyboardModule(engine, id, 'upper', config)`
>   y `new KeyboardModule(engine, id, 'lower', config)`
> - **Serialización**: Se serializa `this._keyboardModules[side].serialize()` (el módulo de
>   audio, no la UI) bajo la clave `state.modules.keyboards`
> - **Deserialización**: Itera `Object.entries(modules.keyboards)` y llama a `mod.deserialize(data)`
> - **Reset**: Usa `mod.deserialize(defaults.keyboard)` en bucle
> - **Ruteo multi-kind**: En `_handlePanel6AudioToggle()`, dos cases separados para
>   `source.kind === 'keyboardUpper'` y `source.kind === 'keyboardLower'`
> - **getModulesForPanel / findModuleById**: Usa `this._keyboardModules` con prefix `keyboard-`

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

> **OSC del Keyboard**: Además de parámetros continuos (`sendChange(side, param, value)`),
> implementa `sendNoteOn(side, note, velocity)` y `sendNoteOff(side, note)` para eventos
> de nota. Las direcciones OSC incluyen sufijo por instancia:
> `keyboard/upper/noteOn`, `keyboard/lower/pitchSpread`, etc.
> Los noteOn envían un array `[note, velocity]` y los noteOff envían un número (`note`).
> El listener de noteOn entrante incluye también **lazy start** del módulo:
> ```javascript
> if (!kbModule.isStarted) kbModule.start();
> ```

> **OSC del Sequencer**: Tres categorías de parámetros con patrones distintos:
> ```javascript
> // 1. Continuos (knobs) — patrón estándar sendChange
> const KNOB_PARAMETERS = {
>   clockRate: { address: 'seq/clockRate', audioMethod: 'setClockRate' },
>   voltageA:  { address: 'seq/voltageA',  audioMethod: 'setKnob' },
>   // ... 10 knobs más (voltageB-F, key1-4)
> };
>
> // 2. Switches (binarios) — envían 0/1, método setSwitch
> const SWITCH_PARAMETERS = {
>   abKey1:   { address: 'seq/abKey1',   audioMethod: 'setSwitch' },
>   runClock: { address: 'seq/runClock', audioMethod: 'setSwitch' },
>   // ... 8 switches total
> };
>
> // 3. Buttons (triggers momentáneos) — envían 1 al pulsar, 0 al soltar
> const BUTTON_PARAMETERS = {
>   masterReset: { address: 'seq/masterReset', audioMethod: 'pressButton' },
>   runForward:  { address: 'seq/runForward',  audioMethod: 'pressButton' },
>   // ... 8 buttons total (incluye stepForward, stepReverse)
> };
> ```
> Los **knobs** reciben y actualizan UI; los **switches** sincronizan Toggle/RotarySwitch;
> los **buttons** usan `pressButton()`/`releaseButton()` con semántica momentánea.
> El OSC sync del sequencer también sincroniza **step buttons** para navegación y
> grabación remotas.
> Las direcciones OSC no usan deduplicación para buttons (cada evento es único).

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

> **Módulos multi-instancia (Keyboard)**: Un case por instancia, con IDs del DOM diferentes:
> ```javascript
> case 'keyboardUpper': return ['upperKeyboard-module'];
> case 'keyboardLower': return ['lowerKeyboard-module'];
> ```
> Las clases CSS en `findModuleElement()` también deben incluir las de cada instancia:
> `.panel4-upperKeyboard, .panel4-lowerKeyboard`

> **Módulos multi-kind (Sequencer)**: Cuando un módulo usa varios `kind` (para sources
> y destinations en distintas matrices), todos deben apuntar al mismo elemento DOM:
> ```javascript
> case 'sequencer':
> case 'sequencerControl':
> case 'sequencerInput':
>   return ['panel7-sequencer'];
> ```
> La clase CSS `.panel7-sequencer` debe estar en el selector de `findModuleElement()`.

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

> **Tooltip del Sequencer**: Cuando un módulo tiene salidas en Panel 5 con canales
> (DAC sin `output` explícito) y en Panel 6 con outputs nombrados, el tooltip debe
> manejar ambos casos:
> ```javascript
> case 'sequencer': {
>   if (source.channel !== undefined) {
>     return t('matrix.source.sequencerDAC', { channel: source.channel + 1 });
>   }
>   return t(`matrix.source.sequencer.${source.output || 'voltageA'}`);
> }
> ```
> Esto requiere claves i18n con interpolación (`{channel}`) además de las habituales.

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

> **Dormancy del Keyboard**: Con 2 instancias independientes, cada una duerme/despierta
> por separado. Se recorre un array `['upper', 'lower']` y se evalúa cada `kind` por separado:
> ```javascript
> for (const side of ['upper', 'lower']) {
>   const kind = side === 'upper' ? 'keyboardUpper' : 'keyboardLower';
>   const hasOutput = panel6Connections.some(c => c.source?.kind === kind);
>   this._setModuleDormant(`keyboard-${side}`, !hasOutput);
> }
> ```
> En `_findModule()`, dos cases separados devuelven `this.app._keyboardModules?.upper` y
> `this.app._keyboardModules?.lower` respectivamente.

> **Dormancy del Sequencer**: Para módulos con conexiones en dos matrices (Panel 5 +
> Panel 6) y múltiples `kind`s, la comprobación debe cubrir todos los tipos:
> ```javascript
> {
>   const hasSequencerUsage = panel5Connections.some(c =>
>     c.source?.kind === 'sequencer'
>     || c.dest?.kind === 'sequencerControl'
>   ) || panel6Connections.some(c =>
>     c.source?.kind === 'sequencer'
>     || c.dest?.kind === 'sequencerInput'
>   );
>   this._setModuleDormant('sequencer', !hasSequencerUsage);
> }
> ```
> El módulo completo duerme/despierta como una unidad (todas las I/O son atómicas).
> En `_findModule()`: `return this.app._sequencerModule ?? null;`

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

### Adicional (si aplica)

- [ ] **Ventana flotante** (`ui/myModuleWindow.js`): init, open, close, serialize, restore (si no usa ModuleUI)
- [ ] **SVG interactivo** (`src/assets/panels/myModule.svg`): Asset visual (si aplica)
- [ ] **MIDI integration**: Listeners en midiLearnManager, IDs de zona MIDI Learn
- [ ] **Switches en config**: Sección `switches` con `initial`, `labelA`, `labelB`
- [ ] **Knob wiring manual**: Si usa `createKnob()`/`VernierKnob`/`RotarySwitch` directo (sin ModuleUI)

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

### Identifiers cross-reference (Keyboard)

| Concepto | Identificador | Usado en |
|----------|---------------|----------|
| Processor name | `'keyboard'` | `registerProcessor()`, `new AudioWorkletNode()` |
| Module IDs | `'panel4-keyboard-upper'`, `'panel4-keyboard-lower'` | `new KeyboardModule(engine, id, side)` |
| Source kinds | `'keyboardUpper'`, `'keyboardLower'` | Blueprint, matrixTooltip, signalFlowHighlighter, dormancyManager, routing |
| Output IDs | `'pitch'`, `'velocity'`, `'gate'` | Blueprint `output`, `getOutputNode()`, OSC |
| Dormancy IDs | `'keyboard-upper'`, `'keyboard-lower'` | `dormancyManager._setModuleDormant()`, `_findModule()` |
| CSS classes | `'panel4-upperKeyboard'`, `'panel4-lowerKeyboard'` | `findModuleElement()` selector |
| Config export name | `keyboardConfig` | `configs/index.js`, app.js imports |
| Module store key | `_keyboardModules` | app.js `{ upper: KeyboardModule, lower: KeyboardModule }` |
| Knob store key | `_keyboardKnobs` | app.js `{ upper: { pitchSpread, velocityLevel, gateLevel }, lower: ... }` |
| State key | `modules.keyboards` | serialize/deserialize patches |
| Blueprint module key | `'upperKeyboard'`, `'lowerKeyboard'` | `panel4Blueprint.modules`, `applyModuleVisibility()` |
| DOM element IDs | `'upperKeyboard-module'`, `'lowerKeyboard-module'` | `signalFlowHighlighter.getModuleElementIds()` |
| OSC addresses | `'keyboard/upper/pitchSpread'`, `'keyboard/lower/noteOn'`, etc. | `oscKeyboardSync.js`, OSC.md |
| i18n keys | `'matrix.source.keyboardUpper.pitch'`, etc. | translations.yaml, matrixTooltip.js |
| Window functions | `initKeyboardWindow()`, `toggleKeyboard()`, etc. | `keyboardWindow.js`, app.js |

### Identifiers cross-reference (Sequencer)

| Concepto | Identificador | Usado en |
|----------|---------------|----------|
| Processor name | `'sequencer'` | `registerProcessor()`, `new AudioWorkletNode()` |
| Module ID | `'sequencer'` | `new SequencerModule(engine, 'sequencer')` |
| Source kind (outputs) | `'sequencer'` | Blueprint (Panel 5 + 6), matrixTooltip, signalFlowHighlighter, dormancyManager, routing |
| Dest kind (Panel 5 inputs) | `'sequencerControl'` | Blueprint, signalFlowHighlighter, dormancyManager, routing |
| Dest kind (Panel 6 inputs) | `'sequencerInput'` | Blueprint, signalFlowHighlighter, dormancyManager, routing |
| Output IDs (Panel 5) | `'dac1'`, `'clock'` | Blueprint `output`, `getOutputNode()` |
| Output IDs (Panel 6) | `'voltageA'`–`'voltageF'`, `'key1'`–`'key4'`, `'clockRate'` | Blueprint `output`, `getOutputNode()`, OSC |
| Input types (Panel 5) | `'clock'`, `'reset'`, `'forward'`, `'reverse'`, `'stop'` | Blueprint `controlType`, `getInputNode()` |
| Input types (Panel 6) | `'voltageACE'`, `'voltageBDF'`, `'key'` | Blueprint `inputType`, `getInputNode()` |
| Dormancy ID | `'sequencer'` | `dormancyManager._setModuleDormant()`, `_findModule()` |
| CSS class | `'panel7-sequencer'` | `findModuleElement()` selector |
| Config export name | `sequencerConfig` | `configs/index.js`, app.js imports (alias `sequencerModuleConfig`) |
| Module store key | `_sequencerModule` | app.js (single instance, no mapa) |
| Knob store key | `_sequencerKnobs` | app.js `{ voltageA: knobInstance, ..., key4: knobInstance }` |
| Display update ref | `_sequencerDisplayUpdate` | app.js (closure para actualizar 7-segment display) |
| State key | `modules.sequencer` | serialize/deserialize patches `{ values, switches }` |
| DOM element ID | `'panel7-sequencer'` | `signalFlowHighlighter.getModuleElementIds()` |
| Display element | `'seq-event-time-display'` | Panel 4, `_buildPanel4()` |
| OSC addresses (knobs) | `'seq/clockRate'`, `'seq/voltageA'`, etc. | `oscSequencerSync.js`, OSC.md |
| OSC addresses (switches) | `'seq/abKey1'`, `'seq/runClock'`, etc. | `oscSequencerSync.js`, OSC.md |
| OSC addresses (buttons) | `'seq/masterReset'`, `'seq/runForward'`, etc. | `oscSequencerSync.js`, OSC.md |
| i18n keys | `'matrix.source.sequencer.voltageA'`, `'matrix.source.sequencerDAC'`, etc. | translations.yaml, matrixTooltip.js |
| Settings key | `STORAGE_KEYS.SEQUENCER_DISPLAY_FORMAT` | constants.js, settingsModal.js, app.js |

---

## 18. Patrones alternativos (lecciones del Keyboard)

El módulo Keyboard introdujo varios patrones que se apartan del modelo estándar (RandomCV/ModuleUI). Esta sección documenta cuándo y cómo aplicar cada patrón alternativo.

### 18.1 Módulo sin ModuleUI (ventana flotante)

**Cuándo**: El módulo necesita una interfaz visual separada de los knobs del panel (ej: teclado, pantalla gráfica, secuenciador visual).

**Patrón**:
- Crear un archivo de ventana (`ui/myModuleWindow.js`) con funciones exportadas:
  - `initMyModuleWindow()` — crea el contenedor DOM (oculto)
  - `openMyModule()` / `closeMyModule()` / `toggleMyModule()`
  - `serializeMyModuleState()` / `restoreMyModuleState(data)`
- Estado como variables de módulo (no clase): `container`, `isOpen`, `state = { x, y, width, height }`
- Arrastrable desde zonas específicas (no toda la ventana) via `DRAG_SELECTORS`
- Redimensionable con aspect-ratio fijo
- Persistencia en `localStorage` + patches (serialización separada del módulo de audio)
- Los knobs del panel se crean directamente en el método `_buildPanel4()` de app.js

**Archivos adicionales**:
- SVG interactivo: `src/assets/panels/myModule.svg`
- Atajos de teclado (opcional): `src/assets/js/ui/myModuleShortcuts.js`

### 18.2 Módulo con instancias múltiples (dual/N-plexado)

**Cuándo**: El hardware tiene varias unidades del mismo módulo (ej: 2 teclados, 12 osciladores).

**Patrón**:
- Un solo worklet + una sola clase de módulo, instanciados N veces
- Constructor con parámetro `side`/`index` para diferenciar instancias
- `kind` diferenciado por instancia: `keyboardUpper` / `keyboardLower` (no genérico `keyboard`)
- almacén en app.js como objeto/mapa: `this._keyboardModules = { upper: ..., lower: ... }`
- Serialización iterativa: `for (const [side, mod] of Object.entries(...))`
- Dormancy independiente por instancia
- Config compartida (`matrixRow` anidado por side)

### 18.3 Eventos discretos (noteOn/noteOff)

**Cuándo**: El módulo genera señales en respuesta a eventos temporales (notas, triggers) en lugar de parámetros continuos.

**Patrón**:
- Worklet recibe mensajes `{ type: 'noteOn', note, velocity }` y `{ type: 'noteOff', note }`
- Mantiene `Set<number>` de teclas/notas activas internamente
- Prioridad de nota (alta/baja/última) determina qué nota suena
- Sample & hold: pitch/velocity se mantienen al soltar todas las teclas
- Gate: señal ON/OFF sin memoria (desaparece al soltar)
- Retrigger: lógica temporal con gap en samples (~2ms) entre gate OFF → ON

### 18.4 OSC con eventos de nota

**Cuándo**: OSC debe transmitir no solo valores de dial sino también eventos discretos.

**Patrón**:
- Además de `sendChange(side, param, value)`, añadir `sendNoteOn(side, note, velocity)` y `sendNoteOff(side, note)`
- noteOn envía array `[note, velocity]`, noteOff envía número simple
- Listeners separados para `keyboard/${side}/noteOn` y `keyboard/${side}/noteOff`
- El handler entrante incluye **lazy start** del módulo si no estaba iniciado  
- Las direcciones de nota NO usan deduplicación (cada evento es único)

### 18.5 Integración MIDI directa

**Cuándo**: El módulo responde a entrada MIDI (teclado MIDI, controladores).

**Patrón** (Keyboard):
- Import de `midiLearnManager` y `midiAccess` en la ventana flotante
- Registro de zona MIDI Learn por instancia: `keyboard-upper`, `keyboard-lower`
- Listener global de MIDI noteOn/noteOff que:
  1. Identifica a qué instancia va la nota (según MIDI Learn mapping)
  2. Llama al módulo de audio (`mod.noteOn(note, velocity)`)
  3. Actualiza feedback visual (pressed class en SVG)
  4. Envía via OSC si conectado
- Teclas SVG mapeadas por ID: `upper-C4`, `lower-Fs3` etc.

### 18.6 Modos de interacción (touch modes)

**Cuándo**: La interfaz visual soporta varios modos de interacción con ratón/touch.

**Patrón** (Keyboard):
- Estado `touchMode`: `'normal'` | `'latch'` | `'legato'`
- **Normal**: Tecla activa mientras se mantiene pulsada (mousedown/touchstart → mouseup/touchend)
- **Latch**: Toggle — cada clic alterna on/off, se pueden acumular varias teclas
- **Legato**: Solo una tecla activa — al pulsar otra se libera la anterior
- `latchedKeys = new Set()` para rastrear teclas retenidas
- `_releaseAllLatched()` al cambiar modo o cerrar ventana
- Persistencia del modo en `localStorage`

### 18.7 Componentes UI disponibles

Además de los knobs estándar, existen estos componentes de panel:

| Componente | Archivo | Uso |
|---|---|---|
| `Knob` | `ui/knob.js` | Potenciómetro estándar (0-1, con escala configurable) |
| `VernierKnob` | `ui/vernierKnob.js` | Potenciómetro de precisión multivuelta (Pitch Offset) |
| `Toggle` | `ui/toggle.js` | Interruptor de palanca 2 estados (ON/OFF visual de palanca) |
| `RotarySwitch` | `ui/rotarySwitch.js` | Selector rotativo 2 estados (indicador giratorio ±45°) |

- `Toggle` y `RotarySwitch` comparten la misma API: `setValue('a'|'b')`, `getState()`, `onChange(state)`
- En el blueprint, se definen en array `switches` con `type: 'toggle'` o `type: 'rotarySwitch'`
- `RotarySwitch` se usa cuando el hardware original tiene un selector rotativo (no una palanca)

### 18.8 Knobs en blueprint (knobColors)

Los colores de knobs se definen en el blueprint del panel, no en el componente UI:

```javascript
// panel4.blueprint.js — column2.knobs
knobs: [
  { type: 'vernier' },                                    // Pitch (vernier, sin color)
  { key: 'velocityLevel', type: 'knob', color: 'yellow', bipolar: true },
  { key: 'gateLevel',     type: 'knob', color: 'white',  bipolar: true }
]
```

Colores disponibles (de `configs/knobColors.js`): `KNOB_BLUE`, `KNOB_GREEN`, `KNOB_WHITE`, `KNOB_BLACK`, `KNOB_RED`, `KNOB_YELLOW`.

El flag `bipolar: true` hace que se use la variante bipolar del knob (en runtime se resuelve al PNG `knob-ring-bipolar.png`; el SVG fuente editable sigue siendo `design/knobs/knob-0-center.svg`).

### 18.9 Gotchas y errores frecuentes

Lecciones aprendidas de la implementación del Keyboard:

1. **Escalado de voltaje**: Todas las salidas CV deben dividir por `DIGITAL_TO_VOLTAGE` (4.0) para convertir de voltios reales a unidades digitales del sistema. Olvidar esta conversión hace que los valores sean 4× mayores de lo esperado.

2. **Retrigger gap en samples, no en ms**: El gap de retrigger debe calcularse en samples (`96 ≈ 2ms @ 48kHz`), no usar `setTimeout()`. El timing preciso solo es posible contando samples dentro del `process()`.

3. **Prioridad de nota**: Si se implementa high-note priority, la velocity solo debe actualizarse cuando la nueva nota es más aguda que la actual (no en todas las pulsaciones).

4. **Lazy start**: Los módulos solo deben arrancar (`start()`) cuando se necesitan por primera vez (conexión en la matriz o nota entrante). No arrancar en la construcción.

5. **OSC note arrays**: `oscBridge.send()` con arrays `[note, velocity]` — verificar que el receptor puede manejar tanto arrays como valores simples (usar `Array.isArray()`).

6. **Serialización split**: Cuando la UI y el audio son independientes (ventana flotante vs. módulo de audio), serializar ambos por separado. El estado del módulo de audio va en `state.modules.keyboards`, el de la ventana en `state.keyboardVisible` o similar.

7. **Touch events + mouse events**: Para interacción SVG, manejar tanto `mousedown`/`mouseup` como `touchstart`/`touchend`. Usar `e.preventDefault()` en touch para evitar ghost clicks.

---

## 19. Patrones del Sequencer

El Digital Sequencer 1000 introduce patrones que van más allá de los modelos estándar (RandomCV/ModuleUI) y alternativo (Keyboard/ventana flotante). Esta sección documenta los patrones específicos del sequencer, aplicables a módulos con lógica de estado compleja, memoria interna, múltiples I/O y presencia en múltiples paneles.

### 19.1 UI distribuida en múltiples paneles (sin ModuleUI)

**Cuándo**: El módulo necesita elementos visuales en dos o más paneles del sintetizador, sin ventana flotante.

**Patrón**:
- No se crea clase UI ni archivo de ventana — toda la construcción DOM se hace en métodos `_buildPanelN()` de app.js
- **Panel 4** (`_buildPanel4()`): Display de 7 segmentos CSS LED para feedback visual del counter
- **Panel 7** (`_buildPanel7()`): Switches (Toggle/RotarySwitch), botones de transporte, knob de clock rate
- Los knobs se almacenan en `this._sequencerKnobs = {}` (mapa `nombre → instancia`)
- Las closures de display update se almacenan en `this._sequencerDisplayUpdate`
- Serialización del módulo de audio (no de UI): `{ values: {...}, switches: {...} }`

**Diferencias con Keyboard**:
| Aspecto | Keyboard | Sequencer |
|---------|----------|-----------|
| UI principal | Ventana flotante (`keyboardWindow.js`) | DOM directo en paneles |
| Archivo UI | `ui/keyboardWindow.js` | Ninguno — todo en `app.js` |
| Paneles | Panel 4 (knobs) | Panel 4 (display) + Panel 7 (controles) |
| Serialización UI | `serializeKeyboardState()` separado | No hay estado de UI, solo de audio |

### 19.2 Worklet con FSM y memoria

**Cuándo**: El módulo tiene estados de operación distintos (stopped/running/etc.) y almacena datos internos (memoria de eventos, secuencias, buffers).

**Patrón del Sequencer**:
```javascript
// Estados de la FSM de transporte
// stopped → running-forward (via runForward)
// stopped → running-reverse (via runReverse)
// running-* → stopped (via stop)
// cualquiera → counter=0 (via masterReset)

_handleMessage(data) {
  switch (data.type) {
    case 'pressButton':
      this._handleButton(data.button);  // FSM transition
      break;
    case 'releaseButton':
      this._releaseButton(data.button);
      break;
    case 'setSwitch':
      this._switches[data.name] = data.value;
      break;
    // ...
  }
}
```

**Memoria interna**:
- Array de 256 eventos × 4 grupos (voltages A-F + keys 1-4)
- Lectura y escritura por step index dentro de `process()`
- Los eventos grabados persisten entre ticks hasta ser sobrescritos
- La memoria se resetea solo con `masterReset`

**Reloj interno**:
- Genera ticks cada N samples según `clockRate` (dial 0-10 → frecuencia)
- Tick = avance de counter + lectura de memoria + actualización de salidas
- El orden es crítico (Z80): advance counter → record → read outputs

### 19.3 Schmitt trigger para entrada externa

**Cuándo**: El módulo acepta señales de audio como triggers/clocks y necesita detección de flanco robusta.

**Patrón**:
```javascript
// En process(), para cada sample del input de clock externo:
if (!this._lastClockHigh && sample > THRESHOLD_HIGH) {
  // Flanco positivo detectado
  this._lastClockHigh = true;
  this._blankingCounter = BLANKING_SAMPLES;  // ~2ms anti-bounce
  this._doTick();
} else if (this._lastClockHigh && sample < THRESHOLD_LOW) {
  this._lastClockHigh = false;
}
if (this._blankingCounter > 0) this._blankingCounter--;
```

**Puntos clave**:
- **Schmitt trigger**: Dos umbrales (alto/bajo) para evitar rebotes en señales ruidosas
- **Blanking**: Periodo de ignorancia post-trigger (~96 samples ≈ 2ms @ 48kHz) para evitar doble trigger
- Se aplica a cada tipo de control input: clock, reset, forward, reverse, stop
- El switch `runClock` determina si se usa reloj interno o externo

### 19.4 Callbacks worklet → main thread

**Cuándo**: El módulo necesita enviar feedback al main thread (actualizar displays, indicadores LED, estados visuales).

**Patrón**:
```javascript
// En el worklet (dentro de process() o tick handler):
this.port.postMessage({ type: 'counter', value: this._counter, text: this._counterToHex(this._counter) });
this.port.postMessage({ type: 'overflow' });

// En el módulo de audio (main thread):
this.workletNode.port.onmessage = (e) => {
  const data = e.data;
  if (data.type === 'counter' && this.onCounterChange) {
    this.onCounterChange(data.value, data.text);
  } else if (data.type === 'overflow' && this.onOverflow) {
    this.onOverflow();
  }
};

// En app.js (al crear el módulo):
this._sequencerModule.onCounterChange = (value, text) => update(value, text);
this._sequencerModule.onOverflow = () => render('ofof');
```

**Puntos clave**:
- Los callbacks son propiedades del módulo de audio, no eventos DOM
- El worklet envía `value` (numérico) y `text` (hex formateado) — el main thread elige el formato
- La frecuencia de mensajes debe ser razonable (no por cada sample, sino por cada tick/evento)
- Para el display, se soportan formatos alternativos (decimal/hex) via `STORAGE_KEYS` en settings

### 19.5 Botones momentáneos (press/release)

**Cuándo**: El módulo tiene botones de transporte o triggers que deben mantener estado mientras se pulsan.

**Patrón**:
```javascript
// En app.js — creación del botón:
button.addEventListener('mousedown', () => {
  seqModule.pressButton(btnName);
  if (!sequencerOSCSync.shouldIgnoreOSC()) {
    sequencerOSCSync.sendButton(btnName, 1);
  }
});
button.addEventListener('mouseup', () => {
  seqModule.releaseButton(btnName);
  if (!sequencerOSCSync.shouldIgnoreOSC()) {
    sequencerOSCSync.sendButton(btnName, 0);
  }
});

// En el módulo de audio:
pressButton(name) {
  this._sendToWorklet('pressButton', undefined, name);
}
releaseButton(name) {
  this._sendToWorklet('releaseButton', undefined, name);
}
```

**Puntos clave**:
- `mousedown` → `pressButton` (acción), `mouseup` → `releaseButton` (liberación)
- Los step buttons tienen **doble función**: navegar (mueven el counter) y grabar (registran valores actuales de los knobs)
- En OSC, se envía `1` al pulsar y `0` al soltar — el receptor trata el `1` como trigger

### 19.6 Settings de aplicación (STORAGE_KEYS + SettingsModal + CustomEvent)

**Cuándo**: El módulo tiene opciones de visualización o comportamiento que el usuario configura globalmente (no por patch).

**Patrón**:
```javascript
// 1. constants.js — registrar la clave de localStorage
export const STORAGE_KEYS = {
  // ...
  SEQUENCER_DISPLAY_FORMAT: `${STORAGE_PREFIX}sequencer-display-format`,
};

// 2. settingsModal.js — crear sección en la tab correspondiente
_createSeqDisplayFormatSection() {
  // Radio buttons: decimal / hex
  // onChange → localStorage.setItem() + dispatchEvent()
}

_setSeqDisplayFormat(format) {
  localStorage.setItem(STORAGE_KEYS.SEQUENCER_DISPLAY_FORMAT, format);
  document.dispatchEvent(new CustomEvent('synth:seqDisplayFormatChange', { detail: { format } }));
}

// 3. app.js — escuchar el evento y actualizar
document.addEventListener('synth:seqDisplayFormatChange', (e) => {
  this._setSeqDisplayFormat(e.detail.format);
});
```

**Puntos clave**:
- El setting NO va en el patch (serialización) — es una preferencia global del usuario
- Se persiste en `localStorage` via `STORAGE_KEYS`
- Se comunica via `CustomEvent` (no via callback directo, para desacoplar settings de app)
- Se necesitan traducciones i18n para los textos del setting
- La pestaña "Interfaz" del modal de settings es la ubicación típica para opciones de visualización

### 19.7 Gotchas del Sequencer

Lecciones aprendidas de la implementación del Digital Sequencer 1000:

1. **Orden de operaciones Z80**: advance counter → record at new position → update outputs from same position. Cambiar el orden produce bugs donde se graba en la posición anterior o se leen valores desfasados.

2. **Counter hex vs decimal**: El worklet siempre genera el counter en hexadecimal (como el hardware original). La conversión a decimal se hace en el main thread. Enviar ambos (`value` numérico + `text` hex) permite al main thread elegir el formato sin recalcular.

3. **Leading zero suppression**: El display de 7 segmentos debe suprimir ceros iniciales: `0042` → ` 042`, `0001` → `   1`, pero `0000` → `   0` (no string vacío).

4. **Strings especiales del display**: Algunos textos bypass el formateo numérico: `"ofof"` (overflow), `"CAll"` (calibración). Estos se envían directamente a `renderSeqDisplay()`, no a `updateSeqDisplay()`.

5. **Múltiples kinds en un solo módulo**: El sequencer usa 3 kinds (`'sequencer'`, `'sequencerControl'`, `'sequencerInput'`) que apuntan al mismo módulo de audio. El dormancy, signal flow y routing deben cubrir los tres.

6. **Input de voltaje para grabación**: Los voltage inputs (Panel 6, columnas 60-62) son para grabar valores desde fuentes externas. La señal llega al worklet via ChannelMerger y se samplea en el tick. Esto es diferente de inputs de control (Panel 5) que son triggers.

7. **Clock rate vs clock input**: La frecuencia de reloj interna (`clockRate`) es un dial que genera ticks internamente. El clock input externo (Panel 5, col 51) es una entrada de audio que se procesa con Schmitt trigger. El switch `runClock` selecciona cuál se usa. Ambos pueden coexistir si el patching lo requiere.

8. **Lazy start en routing bidireccional**: Como el sequencer tiene tanto outputs (fuentes) como inputs (destinos), el lazy start en `_handlePanel6AudioToggle()` se aplica tanto al conectar una fuente como un destino.
