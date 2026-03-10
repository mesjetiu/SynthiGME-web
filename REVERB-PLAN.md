# Plan de implementación: Reverberación de Muelle (Spring Reverb)

## Resumen

Implementar la **unidad de reverberación de muelle (Voltage Controlled Reverberation Unit)** del Synthi 100 como módulo funcional. El Synthi 100 original tiene 2 unidades idénticas, pero nuestra implementación incluye **solo 1 unidad** (`reverberation1`).

El módulo ya existe como **placeholder** en Panel 1 (fila 5, con 2 knobs: Mix y Level). Hay que convertirlo en módulo funcional con DSP, ruteo matricial, OSC, dormancy, etc.

---

## Datos técnicos del hardware (PC-16, D100-16 C1)

| Parámetro | Valor |
|-----------|-------|
| Tecnología | Línea de retardo de muelles (Spring Delay Line) |
| Muelles por unidad | 2 (tiempos de retardo: **35 ms** y **40 ms**) |
| Tiempo de caída (decay) | Aprox. **35 ms** de constante de tiempo |
| Tiempo máximo de reverb | **2.4 s** |
| Entrada máxima | **2 V p-p** (distorsión metálica "clank" si se excede) |
| Control de mezcla | VCA crossfader, controlable por voltaje (±2V cubre rango completo) |
| Impedancia de control (Rin) | 8 kΩ |
| Driver del muelle | IC 1 (CA3140) + TR 1, TR 2 |
| VCA dry | IC 3 |
| VCA wet | IC 5 |
| Mezcla final | IC 7 → IC 8 (buffer de salida) |

### Comportamiento y artefactos

- Sonidos con ataques agudos producen "clank" metálico (se escucha el muelle)
- Funciona mejor con sonidos de decaimiento largo
- Saturación no lineal si la entrada supera 2V p-p
- Sensibilidad mecánica a golpes físicos (no modelamos esto)

---

## Posición en las matrices

### Panel 5 (Audio) — Entrada/Salida de señal

| Función | Tipo | Número Synthi | Descripción |
|---------|------|---------------|-------------|
| **Entrada** | Columna (destino) | **colSynth: 1** | Audio input a la reverb |
| **Salida** | Fila (fuente) | **rowSynth: 124** | Audio output de la reverb |

### Panel 6 (Control) — Modulación CV

| Función | Tipo | Número Synthi | Descripción |
|---------|------|---------------|-------------|
| **Mix CV** | Columna (destino) | **colSynth: 1** | Control por voltaje del mix dry/wet |

### Panel 1 (UI) — Knobs

| Knob | Color | Rango | Función |
|------|-------|-------|---------|
| **Mix** | Azul | 0–10 | Proporción dry/wet (crossfader inverso) |
| **Level** | Blanco | 0–10 | Nivel de salida general |

---

## Identificadores del módulo

| Concepto | Identificador | Notas |
|----------|---------------|-------|
| Processor name | `'spring-reverb'` | `registerProcessor()` / `new AudioWorkletNode()` |
| Module ID | `'panel1-reverberation1'` | ID de instancia |
| Source kind (Panel 5) | `'reverberation'` | Para source en blueprint de audio |
| Dest kind (Panel 5) | `'reverbInput'` | Para dest en blueprint de audio |
| Dest kind (Panel 6) | `'reverbMixCV'` | Para dest en blueprint de control |
| Dormancy ID | `'spring-reverb'` | `dormancyManager` |
| CSS class | `'panel1-reverb'` | Ya existe en el placeholder |
| Config export name | `reverberationConfig` | `configs/index.js` |
| UI store key | `_reverberationUIs` | app.js |
| Layout data key | `reverberationAudio` | `_panel1LayoutData.reverberationAudio` |
| State key | `modules.reverberation` | serialize/deserialize |
| Blueprint module key | `'reverberation1'` | Ya existe en `panel1.blueprint.js` |
| OSC addresses | `'reverb/mix'`, `'reverb/level'` | Ya documentados en OSC.md |
| i18n keys | `'matrix.source.reverberation.audio'` | matrixTooltip |

---

## Arquitectura DSP (Worklet)

### Algoritmo: Spring Reverb simplificado

El muelle real se modela con **dos líneas de retardo allpass** (35ms y 40ms) en serie, más feedback para generar la cola de reverberación.

```
                          ┌─────────────────────────────┐
                          │        WORKLET DSP          │
                          │                             │
  input ──→ [soft clip] ──┤                             │
                          │   ┌──────────┐              │
                     dry ─┼──→│          │              │
                          │   │          │              │
              ┌───────────┤   │  VCA     │──→ output    │
              │           │   │  cross-  │              │
              │    wet  ──┼──→│  fader   │              │
              │           │   │          │              │
              │           │   └──────────┘              │
              │           │       ↑ mix CV              │
              │           └───────┼─────────────────────┘
              │                   │
              │   ┌───────────────────┐
              │   │  SPRING MODEL    │
              │   │                  │
              └──→│ AP1 (35ms) ──→   │
                  │      ↓           │
                  │ AP2 (40ms) ──→   │
                  │      ↓           │
                  │ ←── feedback ←───│
                  │                  │
                  │ LPF (damping)    │
                  └──────────────────┘
```

### Detalle del modelo DSP

1. **Saturación de entrada (Soft Clip)**: `tanh(x * drive)` donde drive aumenta al acercarse al límite de 2V p-p (~1.0 normalizado). Modela la distorsión "clank" del muelle.

2. **Dos allpass delays**:
   - AP1: 35ms (a 48kHz = 1680 samples)
   - AP2: 40ms (a 48kHz = 1920 samples)
   - Coeficiente allpass: 0.6–0.7 para dispersión tímbrica del muelle

3. **Feedback loop con LPF**: 
   - Ganancia de feedback calculada para alcanzar RT60 ≈ 2.4s
   - LPF de 1 polo (damping) en el lazo: modela la pérdida de agudos del muelle
   - Frecuencia de corte del damping: ~4-5 kHz

4. **Crossfader VCA**:
   - Mix = 0: 100% dry, 0% wet
   - Mix = 10: 0% dry, 100% wet
   - Proporcionalidad inversa (como el hardware: IC3 vs IC5)
   - Controlable por CV (AudioParam `mixControl`, a-rate)

5. **Level de salida**: GainNode estándar post-mezcla (curva LOG)

### AudioParams del Worklet

| Param | Rate | Rango | Descripción |
|-------|------|-------|-------------|
| `mixControl` | a-rate | -8 a +8 | CV de mezcla (sumado al knob) |

### Mensajes al Worklet

| Tipo | Valor | Descripción |
|------|-------|-------------|
| `setMix` | 0–10 | Valor del dial de Mix |
| `setDormant` | boolean | Entrar/salir de dormancy |
| `stop` | — | Destruir procesador |

---

## Archivos a CREAR (7 fuente + 7 tests = 14)

### Fuente

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `src/assets/js/worklets/springReverb.worklet.js` | DSP: allpass delays + feedback + crossfader + soft clip |
| 2 | `src/assets/js/modules/springReverb.js` | Clase `SpringReverbModule extends Module` |
| 3 | `src/assets/js/ui/reverberation.js` | Clase `Reverberation extends ModuleUI` (2 knobs: Mix, Level) |
| 4 | `src/assets/js/configs/modules/reverberation.config.js` | Configuración del módulo |
| 5 | `src/assets/js/osc/oscReverbSync.js` | Sincronización OSC |

### Tests

| # | Archivo | Cobertura |
|---|---------|-----------|
| 6 | `tests/worklets/springReverb.worklet.test.js` | DSP: allpass, feedback, saturación, dormancy |
| 7 | `tests/modules/springReverb.test.js` | Inicialización, conexiones, outputs, dormancy |
| 8 | `tests/configs/reverberation.config.test.js` | Estructura, rangos, coherencia |
| 9 | `tests/osc/oscReverbSync.test.js` | Direcciones, parámetros, anti-feedback |
| 10 | `tests/core/dormancyReverb.test.js` | Con/sin conexiones, transiciones |
| 11 | `tests/panelBlueprints/panel5Reverb.test.js` | Fuente/destino en panel 5 |
| 12 | `tests/utils/tooltipReverb.test.js` | Mix y Level tooltips |

---

## Archivos a MODIFICAR (12)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/assets/js/core/engine.js` | Registrar `springReverb.worklet.js` en `_loadWorklets()` |
| 2 | `src/assets/js/configs/index.js` | Exportar `reverberationConfig` |
| 3 | `src/assets/js/panelBlueprints/panel5.audio.blueprint.js` | Añadir source (fila 124) + destination (columna 1) |
| 4 | `src/assets/js/panelBlueprints/panel6.control.blueprint.js` | Añadir destination (columna 1, mix CV) |
| 5 | `src/assets/js/app.js` | ~14 puntos de integración (ver detalle abajo) |
| 6 | `src/assets/js/ui/matrixTooltip.js` | Case `'reverberation'` en `getLabelForSource()` |
| 7 | `src/assets/js/ui/signalFlowHighlighter.js` | Case `'reverberation'` en `getModuleElementIds()` + CSS class |
| 8 | `src/assets/js/core/dormancyManager.js` | Bloque en `updateAllStates()` + case en `_findModule()` |
| 9 | `src/assets/js/utils/tooltipUtils.js` | `getReverbMixTooltipInfo()`, `getReverbLevelTooltipInfo()` |
| 10 | `src/assets/js/ui/layoutHelpers.js` | `getReverberationUIDefaults()` |
| 11 | `src/assets/js/i18n/translations.yaml` | `matrix.source.reverberation.audio` (7 idiomas) + `matrix.dest.reverbInput` + `matrix.dest.reverbMixCV` |
| 12 | `CHANGELOG.md` | Entrada en Unreleased > Added |

---

## Detalle de integración en app.js

El módulo sigue el patrón del filtro (módulo de procesamiento de audio con entrada, salida, y CV), adaptado a Panel 1.

| # | Sección | Cambio concreto |
|---|---------|-----------------|
| 1 | Imports | `SpringReverbModule`, `Reverberation`, `reverberationConfig`, `getReverberationUIDefaults`, tooltip utils, `reverbOSCSync` |
| 2 | Constructor | `this._reverberationUIs = {}` |
| 3 | Init OSC | `reverbOSCSync.init(this)` |
| 4 | `_buildPanel1()` | Convertir placeholder de reverb en módulo funcional: crear `SpringReverbModule`, crear `Reverberation` UI con callbacks, conectar onChange → audio + OSC |
| 5 | `_panel1LayoutData` | Guardar `reverberationAudio` |
| 6 | Serialización | Serializar `_reverberationUIs` bajo `state.modules.reverberation` |
| 7 | Deserialización | Restaurar `_reverberationUIs` desde patch |
| 8 | Reset | Usar defaults para reverb |
| 9 | Default values | `reverberation: { mix: 0, level: 0 }` |
| 10 | `_getModulesForPanel('panel-1')` | Incluir reverb |
| 11 | `_findModuleById()` | Case para reverb |
| 12 | `_handlePanel5AudioToggle()` — source | Case `'reverberation'`: `reverbModule.getOutputNode()` |
| 13 | `_handlePanel5AudioToggle()` — dest | Case `'reverbInput'`: `reverbModule.getInputNode()` |
| 14 | `_handlePanel6AudioToggle()` — dest | Case `'reverbMixCV'`: `reverbModule.getMixCVParam()` |

---

## Detalle de la clase SpringReverbModule

```
SpringReverbModule extends Module
├── constructor(engine, id, config)
│   ├── this.values = { mix: 0, level: 0 }
│   └── Nodos: null hasta _initAudioNodes()
│
├── _initAudioNodes()
│   ├── inputGain (GainNode) — punto de entrada
│   ├── workletNode (AudioWorkletNode 'spring-reverb')
│   │   └── AudioParam: mixControl (a-rate)
│   ├── outputGain (GainNode) — nivel de salida
│   ├── Cadena: inputGain → workletNode → outputGain
│   └── this.outputs.push({ id: 'audio', kind: 'reverberation', node: outputGain })
│
├── setMix(dial)      — envía al worklet, rango 0-10
├── setLevel(dial)    — ajusta outputGain, curva LOG
│
├── getInputNode()    — retorna inputGain (para Panel 5 dest)
├── getOutputNode()   — retorna outputGain (para Panel 5 source)
├── getMixCVParam()   — retorna workletNode.parameters.get('mixControl')
│
├── start()           — lazy init + arranque
├── stop()            — destruir procesador
└── _onDormancyChange(dormant)
    ├── dormant: fade outputGain a 0, msg setDormant al worklet
    └── wake: restaurar valores, msg setDormant al worklet
```

---

## Detalle del Worklet DSP

```javascript
class SpringReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mixControl', defaultValue: 0, minValue: -8, maxValue: 8, automationRate: 'a-rate' }
    ];
  }

  constructor() {
    super();
    // Buffers circulares para los 2 allpass
    this._ap1Buffer = new Float32Array(Math.ceil(0.035 * sampleRate));  // 35ms
    this._ap2Buffer = new Float32Array(Math.ceil(0.040 * sampleRate));  // 40ms
    this._ap1Index = 0;
    this._ap2Index = 0;
    this._ap1Coeff = 0.65;
    this._ap2Coeff = 0.65;
    
    // Feedback state
    this._feedbackSample = 0;
    this._dampingState = 0;  // estado del LPF de 1 polo
    
    // Parámetros
    this._mixDial = 0;      // 0-10
    this._dormant = false;
    this._stopped = false;
    
    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  process(inputs, outputs, parameters) {
    if (this._stopped) return false;
    
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    
    if (this._dormant) {
      output.fill(0);
      return true;
    }

    const mixCV = parameters.mixControl;
    const mixIsConst = mixCV.length === 1;
    
    for (let i = 0; i < output.length; i++) {
      // 1. Soft clip input (modela saturación del muelle)
      const raw = input[i];
      const clipped = Math.tanh(raw * 1.5);
      
      // 2. Procesar allpass delays (modelo de muelle)
      const wet = this._processSpring(clipped);
      
      // 3. Crossfader: mix dial + CV
      const cv = mixIsConst ? mixCV[0] : mixCV[i];
      const mixNorm = this._mixDialToNorm(this._mixDial, cv);
      
      // 4. Mezcla dry/wet inversa
      output[i] = clipped * (1 - mixNorm) + wet * mixNorm;
    }
    
    return true;
  }
  
  _processSpring(input) {
    // Allpass 1 (35ms)
    let ap1Out = this._processAllpass(
      input + this._feedbackSample,
      this._ap1Buffer, this._ap1Index, this._ap1Coeff
    );
    this._ap1Index = (this._ap1Index + 1) % this._ap1Buffer.length;
    
    // Allpass 2 (40ms)  
    let ap2Out = this._processAllpass(
      ap1Out, this._ap2Buffer, this._ap2Index, this._ap2Coeff
    );
    this._ap2Index = (this._ap2Index + 1) % this._ap2Buffer.length;
    
    // LPF damping (1-pole, ~4.5kHz)
    const dampCoeff = ...; // precalculado
    this._dampingState += dampCoeff * (ap2Out - this._dampingState);
    
    // Feedback (calculado para RT60 ≈ 2.4s)
    this._feedbackSample = this._dampingState * this._feedbackGain;
    
    return ap2Out;
  }
  
  _processAllpass(input, buffer, index, coeff) {
    const delayed = buffer[index];
    const output = -coeff * input + delayed;
    buffer[index] = input + coeff * output;
    return output;
  }
}

registerProcessor('spring-reverb', SpringReverbProcessor);
```

### Cálculo del feedback gain

Para conseguir RT60 = 2.4s con delays totales de 75ms:
- Número de ciclos para RT60: `2.4 / 0.075 = 32`
- Ganancia por ciclo: `10^(-60/(20*32))` ≈ `0.893` → `feedbackGain ≈ 0.893`

### Cálculo del damping LPF

Filtro de 1 polo con cutoff ~4.5 kHz:
- `dampCoeff = 1 - exp(-2π × 4500 / sampleRate)` ≈ `0.464` @ 48kHz

---

## Detalle del Config

```javascript
export default {
  schemaVersion: 1,
  id: 'panel1-reverberation1',
  title: 'Reverberation',

  // Posiciones en matrices del Synthi 100
  matrix: {
    panel5: {
      input:  { colSynth: 1 },   // Entrada audio
      output: { rowSynth: 124 }  // Salida audio
    },
    panel6: {
      mixCV:  { colSynth: 1 }    // Control voltage para Mix
    }
  },

  // Parámetros del DSP
  audio: {
    spring1DelayMs: 35,
    spring2DelayMs: 40,
    maxReverbTimeS: 2.4,
    dampingFreqHz: 4500,
    allpassCoeff: 0.65,
    inputClipDrive: 1.5,
    maxInputVpp: 2.0
  },

  // Curva del potenciómetro de Level
  levelCurve: {
    type: 'log',
    logBase: 100
  },

  // Tiempos de rampa
  ramps: {
    level: 0.06,
    mix: 0.05
  },

  // Knobs (rango del dial)
  knobs: {
    mix:   { min: 0, max: 10, initial: 0, curve: 'linear' },
    level: { min: 0, max: 10, initial: 0, curve: 'linear' }
  }
};
```

---

## Detalle de OSC Sync

Direcciones ya definidas en OSC.md:

| Dirección | Knob | Rango |
|-----------|------|-------|
| `reverb/mix` | Mix | 0–10 |
| `reverb/level` | Level | 0–10 |

Métodos del módulo de audio:

| Dirección | Método |
|-----------|--------|
| `reverb/mix` | `setMix(value)` |
| `reverb/level` | `setLevel(value)` |

---

## Orden de implementación sugerido

### Fase 1: DSP Core (funcionalidad mínima)
1. **Config** (`reverberation.config.js`) + test
2. **Worklet** (`springReverb.worklet.js`) + test
3. **Módulo de audio** (`springReverb.js`) + test
4. **Engine** — registrar worklet

### Fase 2: UI + Ruteo
5. **UI** (`reverberation.js`) — `ModuleUI` con 2 knobs
6. **Panel 5 blueprint** — source (fila 124) + dest (columna 1)
7. **Panel 6 blueprint** — dest (columna 1, mix CV)
8. **App.js** — los 14 puntos de integración (convertir placeholder a módulo funcional)
9. **Tooltips** (`tooltipUtils.js`)
10. **Layout helpers** (`layoutHelpers.js`)

### Fase 3: Integración completa
11. **Signal Flow Highlighter** + test
12. **Matrix Tooltip** + **i18n** + `build:i18n`
13. **Dormancy Manager** + test
14. **OSC Sync** (`oscReverbSync.js`) + test
15. **Blueprint tests** (panel 5 reverb)

### Fase 4: Cierre
16. **CHANGELOG.md**
17. **Ejecución de tests completa** (`npm run build:web:test`)
18. Verificación manual (dev server)

---

## Notas de diseño

### Diferencias con el hardware

1. **1 unidad vs 2**: Solo implementamos una reverb. No hay crosstalk ni diafonía.
2. **Sin sensibilidad mecánica**: No modelamos golpes físicos al mueble.
3. **Simplificación del modelo de muelle**: Usamos 2 allpass en serie en lugar de un modelo FDN completo. Es suficiente para el carácter tímbrico del muelle.

### Patrón aplicado

El módulo sigue el patrón del **filtro** (procesamiento de audio, no generación de CV):
- Tiene **entrada de audio** (Panel 5, columna destino)
- Tiene **salida de audio** (Panel 5, fila fuente)  
- Tiene **entrada CV** (Panel 6, columna destino para modular Mix)
- Usa `inputGain → worklet → outputGain` como cadena de audio

### Consideraciones futuras

- Si se quisiera añadir la segunda reverb, bastaría con instanciar 2 módulos (como los filtros) y añadir las filas/columnas correspondientes en los blueprints.
- Para un modelo de muelle más realista, se podría usar un Schroeder reverb con 4 comb filters + 2 allpass, pero el enfoque de 2 allpass con feedback ya captura el carácter esencial.
