# Refactoring SynthiGME-web

Plan de refactoring basado en análisis del código actual (~79.000 líneas). Las tareas están organizadas por prioridad e impacto. Empezaremos en el orden que decidas.

---

## Mapa de archivos grandes

| Archivo | Líneas | Categoría |
|---------|--------|-----------|
| `src/assets/js/app.js` | **9.278** | Orquestador principal |
| `src/assets/js/ui/settingsModal.js` | **4.963** | Modal configuración |
| `src/assets/js/ui/pipManager.js` | **3.852** | Gestor Picture-in-Picture |
| `src/assets/js/ui/audioSettingsModal.js` | **2.569** | Modal audio |
| `src/assets/js/ui/viewportNavigation.js` | **2.077** | Navegación viewport |
| `src/assets/js/ui/easterEgg.js` | **1.964** | Easter egg |
| `src/assets/js/core/engine.js` | **2.444** | Motor de audio |
| `src/assets/js/ui/panelNotes.js` | **1.317** | Modal notas |
| `src/assets/js/utils/voltageConstants.js` | **1.276** | Constantes/utilidades |
| `src/assets/js/ui/keyboardWindow.js` | **1.048** | Modal teclado |
| `src/assets/js/ui/patchBrowser.js` | **1.007** | Navegador de patches |
| `src/assets/js/midi/midiLearnManager.js` | **996** | MIDI |
| `src/assets/js/ui/tooltipUtils.js` | **936** | Utilidades tooltip |
| `src/assets/js/modules/outputChannel.js` | **918** | Módulo audio |
| `src/assets/js/core/recordingEngine.js` | **856** | Motor grabación |
| `src/assets/js/configs/oscillator.config.js` | **854** | Configuración |
| `src/assets/js/ui/matrixTooltip.js` | **830** | UI Tooltip |
| `src/assets/js/ui/knob.js` | **806** | Componente UI |
| `src/assets/js/ui/quickbar.js` | **797** | Barra rápida |
| `src/assets/js/osc/oscMatrixSync.js` | **787** | OSC Sync |

---

## 🔴 Alta prioridad — Duplicación activa entre módulos

Código copiado literalmente en varios archivos. Riesgo mínimo al extraerlo.

### R1 · `clamp()` declarada localmente en cada módulo

**Archivos afectados:**
- `src/assets/js/modules/springReverb.js`
- `src/assets/js/modules/ringModulator.js`
- `src/assets/js/modules/synthiFilter.js`
- (posiblemente más)

**Problema:** Cada módulo redeclara la misma función `clamp(value, min, max)` en lugar de importarla de un sitio común.

**Acción:** Moverla a `src/assets/js/utils/math.js` (nuevo) y hacer que cada módulo la importe desde ahí.

---

### R2 · `_levelDialToGain()` copiada en múltiples módulos

**Archivos afectados:**
- `src/assets/js/modules/springReverb.js` (líneas 53-61)
- `src/assets/js/modules/ringModulator.js` (líneas 59-67)
- `src/assets/js/modules/noise.js`

**Problema:** Conversión logarítmica de dial (0–10) a ganancia — lógica idéntica repetida en cada módulo.

**Acción:** Extraer a `src/assets/js/utils/audioConversions.js` como función `dialToLogGain(dialValue, logBase, min, max)`.

---

### R3 · `postMessage` al worklet sin abstracción (12+ instancias)

**Archivos afectados:**
- `src/assets/js/modules/springReverb.js`, `ringModulator.js`, `synthiFilter.js`
- `src/assets/js/modules/noise.js`, `envelopeShaper.js`, `keyboard.js`

**Problema:** Llamadas directas a `workletNode?.port?.postMessage(...)` dispersas por todos los módulos, sin manejo de errores consistente.

**Acción:** Añadir helper `sendWorkletMessage(node, type, value)` en `src/assets/js/utils/audio.js`.

---

### R4 · Patrón `disconnect` manual repetido

**Archivos afectados:**
- `src/assets/js/modules/envelopeShaper.js` (líneas 315-324)
- `src/assets/js/modules/keyboard.js` (líneas 343-348)
- `src/assets/js/modules/noise.js` (líneas 280-282)

**Problema:** Cada módulo desconecta sus nodos de audio manualmente con null-checks repetidos.

**Acción:** Añadir helper `disconnectNodes(nodes)` en `src/assets/js/utils/audio.js`.

---

## 🟡 Media prioridad — Archivos con demasiadas responsabilidades

### R5 · `_applyLevel()` y `_onDormancyChange()` repetidas en 6+ módulos

**Archivos afectados:**
- `src/assets/js/modules/springReverb.js`, `ringModulator.js`, `noise.js`
- `src/assets/js/modules/keyboard.js`, `synthiFilter.js`, `envelopeShaper.js`

**Problema:** Lógica casi idéntica para silenciar/restaurar ganancia al entrar/salir de dormancia, duplicada en cada módulo.

**Acción:** Subir a la clase base `Module` como método protegido con hooks opcionales para casos especiales.

---

### R6 · `localStorage` accedido en 29 sitios ignorando `storage.js`

**Problema:** `src/assets/js/state/storage.js` ya existe como capa de abstracción, pero la mayoría del código accede directamente a `localStorage` sin pasar por él.

**Acción:** Auditar todos los accesos directos y redirigirlos por `storage.js`, ampliando su API si es necesario.

---

### R7 · `app.js` — 9.278 líneas ⚠️

**Estructura actual identificada:**

| Sección | Líneas aprox. | Responsabilidad |
|---------|--------------|-----------------|
| Imports | 1-155 | 75 archivos importados |
| Constructor | 175-374 | Init paneles, estado, listeners, OSC |
| `_setupOutputFaders()` | 480-1173 | Panel 7 — output channels |
| `_setupJoystickPad()` | 1174-1521 | Joystick UI |
| `_setupUI()` + modales | 1522-3397 | Modales audio, settings, undo/redo... |
| `_serializeCurrentState()` | 1952-2676 | Serialización de estado (~725 líneas) |
| `_buildPanel1()` | 3485-4097 | Filtros, envelopes, reverb, ring mod |
| `_buildPanel4()` | 4098-5051 | Voltímetros, sequencer display |
| `_buildPanel2()` | 5052-5614 | Osciloscopio |
| `_buildOscillatorPanel()` | 6194-6551 | Paneles 3 y 4 |
| `_setupPanel5AudioRouting()` | 7679-8150 | Matriz audio CV (8x8) |
| `_setupPanel6ControlRouting()` | 8200-8226 | Matriz control CV (8x8) |
| `_buildLargeMatrices()` | 8827-9009 | Construcción matrices |

**División propuesta:**

- `src/assets/js/panelAssembler.js` — `_buildPanelX()` de los 7 paneles (~2.500 líneas)
- `src/assets/js/routingSetup.js` — matrices de audio y control (~1.500 líneas)
- `src/assets/js/stateSerializer.js` — `_serializeCurrentState()` y `_applyPatch()` (~800 líneas)
- `src/assets/js/uiInitializer.js` — setup de modales y componentes UI (~1.000 líneas)
- `src/assets/js/app.js` — bootstrap delgado, orquesta los anteriores (~500 líneas)

> **Riesgo:** Alto. Dependencias cruzadas entre secciones. Requiere suite de tests completa antes y después.

---

### R8 · `settingsModal.js` — 4.963 líneas

**Estructura interna identificada:**

| Sección | Líneas aprox. | Responsabilidad |
|---------|--------------|-----------------|
| Tab system | 172-660 | Gestión de pestañas |
| Tab: General + Interface | 660-858 | Idioma, resolución, UI |
| Tab: OSC | 883-1493 | **610 líneas** — configuración OSC completa |
| Tab: MIDI | 1546-1810 | **264 líneas** — dispositivos, mappings |
| Tab: About | 1810-2100 | **290 líneas** — créditos |
| Tab: Shortcuts | 3957-4415 | **458 líneas** — atajos de teclado + captura |

**División propuesta:**

- `src/assets/js/ui/settingsTabs/oscSettingsTab.js` — tab OSC completo (~610 líneas)
- `src/assets/js/ui/settingsTabs/midiSettingsTab.js` — tab MIDI (~264 líneas)
- `src/assets/js/ui/settingsTabs/keyboardShortcutsTab.js` — tab Shortcuts (~458 líneas)
- `src/assets/js/ui/settingsModal.js` — modal principal delgado, delega a los tabs (~2.000 líneas)

---

### R9 · `pipManager.js` — 3.852 líneas

**Estructura interna identificada:**

| Sección | Líneas aprox. | Responsabilidad |
|---------|--------------|-----------------|
| Estado global | 29-130 | Maps, flags, variables de estado |
| Helpers y geometría | 184-460 | Normalización de rects, animaciones |
| Interacción | 460-1550 | Rueda, pinch, teclado, context menu |
| Preview y rendering | 2000-2700 | Canvas snapshots, rasterización |
| Lifecycle | 2700-3200 | openPip, closePip, restore |
| State persistence | 3200-3850 | localStorage |

**División propuesta:**

- `src/assets/js/ui/pip/pipInteractionHandler.js` — rueda, pinch, teclado (~600 líneas)
- `src/assets/js/ui/pip/pipRenderer.js` — snapshots, canvas, previews (~400 líneas)
- `src/assets/js/ui/pip/pipGeometryManager.js` — rects, transiciones, animaciones (~250 líneas)
- `src/assets/js/ui/pipManager.js` — lifecycle y persistencia (~1.500 líneas)

---

### R10 · `engine.js` — 2.444 líneas

**Estructura interna identificada:**

Cada bus de salida (8 total) encadena: `GainNode → WaveShaper → GainNode (VCA) → GainNode (postVCA) → filtro RC → GainNode (mute) → DC Blocker → matrix multichannel`. Esa complejidad está toda en `engine.js`.

**División propuesta:**

- `src/assets/js/core/audioContextManager.js` — creación y gestión del AudioContext (~150 líneas)
- `src/assets/js/core/outputBusFactory.js` — construcción de cada bus de salida (~300 líneas)
- `src/assets/js/core/engine.js` — lógica de control, routing, módulos (~900 líneas)

---

### R11 · `viewportNavigation.js` — 2.077 líneas

**División propuesta:**
- `viewportPanZoom.js` — lógica de pan/zoom
- `keyboardNavigationHandler.js` — atajos de teclado
- `gestureHandlers.js` — gestos táctiles y doble-tap

---

## 🟢 Baja prioridad — Deuda técnica menor

### R12 · `undoRedoManager.js` — comparación con `JSON.stringify` doble

Línea 32 serializa el estado completo dos veces en cada comparación. Optimizable con comparación estructural o hash.

### R13 · `knob.js` — 806 líneas mezclando geometría, eventos y render

División posible: `KnobController.js` (eventos + valor) + `KnobGeometry.js` (cálculos de rotación). Bajo riesgo, solo mantenibilidad.

### R14 · Clase base `WorkletModule extends Module`

Reduce boilerplate común de worklet en cada módulo.

### R15 · TODOs inline que deberían ser issues

Varios comentarios `// TODO:` en `app.js` y `settingsModal.js`. Limpiar y convertir en issues de GitHub.

---

## Verificación después de cada cambio

```bash
npm test                # Suite Node (rápido)
npm run test:all        # Node + Playwright (completo)
npm run build:web       # Verifica que el bundle no se rompe
```

---

## Estado

| ID | Descripción | Líneas aprox. resultado | Estado |
|----|-------------|------------------------|--------|
| R1 | `clamp()` a `utils/math.js` | pequeño | ✅ hecho |
| R2 | `dialToLogGain()` a `utils/audioConversions.js` | pequeño | ✅ hecho |
| R3 | `sendWorkletMessage()` helper en `utils/audio.js` | pequeño | ✅ hecho |
| R4 | `disconnectNodes()` helper en `utils/audio.js` | pequeño | ✅ hecho |
| R5 | Dormancy/applyLevel en clase base `Module` | medio | ✅ hecho |
| R6 | Centralizar `localStorage` en `storage.js` | medio | ✅ hecho |
| R7 | Split de `app.js` (9.278 → ~500 + 4 nuevos) | grande | 🔄 parcial (stateSerializer.js ✅) |
| R8 | Split de `settingsModal.js` (4.963 → ~2.000 + 3) | grande | ⬜ pendiente |
| R9 | Split de `pipManager.js` (3.852 → ~1.500 + 3) | grande | ⬜ pendiente |
| R10 | Split de `engine.js` (2.444 → ~900 + 2) | grande | ⬜ pendiente |
| R11 | Split de `viewportNavigation.js` (2.077 → 3) | medio | ⬜ pendiente |
| R12 | Optimizar `undoRedoManager.js` | pequeño | ⬜ pendiente |
| R13 | Split `knob.js` | medio | ⬜ pendiente |
| R14 | `WorkletModule` base class | medio | ⬜ pendiente |
| R15 | Limpiar TODOs inline → issues | pequeño | ⬜ pendiente |
