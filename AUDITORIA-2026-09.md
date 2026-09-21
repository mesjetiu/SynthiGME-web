# Auditoría del estado del proyecto — 21 de septiembre de 2026

Revisión general tras seis meses sin desarrollo activo. Todo lo que se afirma
aquí se ha **verificado ejecutándolo**, no deducido de la documentación.

## Criterio de prioridades (fijado en esta auditoría)

Lo fundamental es que el sintetizador **funcione en el navegador, servido como
web estática desde cualquier servidor** (hoy GitHub Pages desde `docs/`). Todo
lo demás es secundario y no debe añadir complejidad:

1. PWA en navegador: audio, UI, móvil, y los tests que los protegen.
2. Empaquetado Electron: está bien y se mantiene, pero no dirige decisiones.
3. Telemetría (Apps Script → Sheets → avisos), recuento de usuarios (Umami):
   aparcados. No se sabe si funcionan y no importa ahora. Si estorban, la
   opción simple es quitarlos, no arreglarlos.

Ante dos soluciones, la más simple. No se añade infraestructura sin decidirlo
expresamente.

## Estado verificado

| Qué | Resultado |
|---|---|
| Última release | **v0.8.0** (16-mar-2026). 41 commits después sin release: refactor R7 de `app.js` y Octave Filter Bank (18-19 mar); julio y septiembre solo docs |
| `git status` / `origin` | limpio y sincronizado |
| `npm test` | **4458/4458** pasan (682 ficheros, ~53 s) |
| `npm run build:web` | compila. `docs/` corresponde exactamente a `src/` (única diferencia al regenerar: timestamp del build y `TELEMETRY_URL` si no hay `.env`) |
| `npm ci` | **fallaba**: `package-lock.json` seguía en 0.7.0 y sin `naudiodon`. Arreglado en esta auditoría |
| Tests de audio (Playwright) | **218/218** tras el lazy init del worklet (hallazgo 1, ya aplicado). Antes: 202/218 desde julio |
| Código fuente | ~79.900 líneas JS en `src/`, ~65.100 en `tests/` (166 ficheros de test) |
| Ramas remotas | 5 ramas muertas de dic-2025/ene-2026, entre 800 y 1559 commits por detrás de `main` |

Valoración del trabajo de marzo: el refactor R7 está bien hecho (delegadores en
`app.js` + un módulo y su test por responsabilidad), el OFB va con 58 tests, y
los diagnósticos de la auditoría de julio son correctos (se han contrastado con
el código). Lo que faltó fue **cerrar**: se diagnosticó sin arreglar y se
refactorizó sin actualizar la arquitectura.

## Hallazgos, por prioridad

### 1. Suite de audio: 16 fallos con fix conocido y no aplicado — RESUELTO

`synthOscillator.worklet.js:152-160` inicializaba `_smoothedGain`, `_smoothedSymmetry`
y los `_smoothed*Level` con constantes fijas. La app los pasa por
`processorOptions` (sin transitorio en producción), el harness de tests no, y los
primeros ~150 ms contaminan las medidas. Fix preferido: **lazy init** desde el
primer sample de cada AudioParam en el primer `process()`. Elimina el transitorio
para cualquier consumidor sin perder el anti-zipper. Detalle en `TODO.md`
§«Tests de audio».

De paso: `this.mode` se asignaba dos veces en ese constructor (líneas 108 y 162).

Aplicado el 21-sep (commit `093ba608`): lazy init con 7 tests unitarios que lo fijan;
la suite de audio pasa entera.

### 2. Bugs de navegador/móvil confirmados en código

- **Osciloscopio no se limpia al reiniciar patch.** `clearRect` solo ocurre dentro
  del bucle de dibujo (`oscilloscopeDisplay.js:599,630`); nada limpia el trazo al
  aplicar/reiniciar patch.
- **Menú contextual se sale de pantalla en móvil.** `.pip-context-menu`
  (`main.css:7512`) no tiene `max-height` ni `overflow-y`. Lo mismo para el
  desplegable de detach en la barra.
- Sin verificar (necesitan móvil real): permisos de micro en Chrome Android;
  importar patches en móvil.

### 3. `ARCHITECTURE.md` desactualizado (8-mar-2026)

No recoge el refactor R7 (`panelAssembler`, `panelRouting`, `moduleManager`,
`stateSerializer`, `audioSetup`, `uiInitializer`, `routingSetup`) ni el Octave
Filter Bank, y enlaza `app.js#L7579-L7708` en un fichero que hoy tiene 1918
líneas. Está previsto que sirva de base a un estudio escrito: ahora mismo
describe una estructura que ya no existe.

### 4. Dependencias (secundario: casi todo es toolchain de Electron)

`npm audit`: 27 avisos (1 crítico en `tar`, 22 high), prácticamente todos en
devDependencies de `electron-builder`, y todos con fix dentro de semver
(`npm audit fix` sin `--force`). El único en runtime es `osc → ws` (moderate;
solo afecta al servidor OSC de Electron). `electron` está en 40.0.0 con 40.10.x
disponible en la misma major. Se hará cuando se toque Electron.

### 5. Sin integración continua

Los tests solo corren si alguien los corre: el lock roto estuvo seis meses sin
que nadie lo viera. Un workflow de `npm ci && npm test` lo habría cazado. Es
infraestructura nueva: **propuesto, no decidido.**

### 6. Deuda menor

- 36 ficheros usan `console.*` directo existiendo `utils/logger.js`.
- `.github/copilot-instructions.md` (214 líneas) duplica lo que ya dice
  `CLAUDE.md`, con un encabezado repetido. Reducible a un puntero.
- `REFACTORING.md`: R8-R15 pendientes (`settingsModal` 4963 líneas, `pipManager`
  3852, `engine` 2463). Es plan, no bug.
- 5 ramas remotas muertas, para borrar si no guardan nada:
  `back_main`, `feature/FullScreenButton`, `feature/multichannel-8ch-routing`,
  `feature/multichannel-experimental`, `issue/SVG_resolution_1`.

## Testing: qué protege y qué no

Cifras: 4458 tests unitarios en 166 ficheros (~65.100 líneas de test para
~79.900 de código), más 218 tests de audio Playwright en 19 ficheros que miden
DSP en navegador real (amplitudes, hard sync, FM por octavas, CV, ruteo por
pines, offset DC). Los tests de marzo (R7, OFB) cargan el código real.

### Tests «espejo»: 23 ficheros, 662 tests (15 % de la suite) que no protegen nada

No importan nada de `src/`. Copian la lógica dentro del test (clases
`MockDormancyManager` —«lógica replicada para testing sin DOM»—,
`MockJoystickModule`, funciones `recalcPitch` con el comentario «deben coincidir
con keyboard.worklet.js») y prueban la copia. Si el fichero real cambia, siguen
en verde. Dan sensación de seguridad, no seguridad.

| Ficheros espejo | Tests | Qué creen proteger |
|---|---|---|
| `midi/midiLearn` | 76 | MIDI Learn |
| `worklets/keyboard.worklet` | 61 | teclados (pitch/velocity/gate) |
| `modules/outputChannel` | 58 | Output Channels |
| `core/dormancyManager`, `dormancySequencer`, `dormancyRandomCV`, `dormancyKeyboard`, `dormancyFilters` | 97 | sistema de dormancy |
| `modules/sequencer`, `joystick`, `envelopeShaper`, `pulse` | 111 | esos 4 módulos |
| `worklets/vcaProcessor`, `pitchToVoltageConverter.worklet`, `noiseGenerator.worklet`, `multichannelCapture`, `multichannelPlayback`, `smoothingFilter` | 153 | 6 worklets |
| `ui/oscilloscopeDisplay`, `ui/recordingOverlay`, `osc/oscServer`, `osc/oscOscillatorSync`, `electron/multichannelActivation` | 106 | UI, OSC, Electron |

Parte de esos worklets sí están cubiertos de verdad por Playwright (VCA,
oscilador, filtros, CV). El hueco real está en **dormancy, teclado,
secuenciador, joystick, envelope shaper, MIDI Learn y OSC sync**: ahí solo hay
espejo.

Cómo detectarlos: fichero de test sin ninguna referencia a `src/assets`, sin
`readFile` ni `import()` dinámico. Comando usado:
`grep -LE "src/assets|readFile|import\(" tests/**/*.test.js`.

### Ficheros de `src/` que ningún test carga: 88 de 175 (~37.800 líneas)

Muchos son UI pesada difícil de testear en Node (`settingsModal` 4963 líneas,
`audioSettingsModal` 2569, `viewportNavigation` 2077, `app.js` 1918,
`keyboardWindow`, `patchBrowser`, `quickbar`) y locales i18n. Los que
preocupan por ser lógica, no UI:

- `core/dormancyManager.js` (647), `midi/midiLearnManager.js` (996),
  `modules/outputChannel.js` (918), `ui/oscilloscopeDisplay.js` (704),
  `osc/osc*Sync.js` (5 ficheros).
- 4 worklets sin ningún test, ni unitario ni de audio: `dcBlocker`,
  `outputFilter` (ambos en la cadena de salida que oye todo el mundo),
  `scopeCapture`, `recordingCapture`.

### Tests de audio: 218/218 (desde el 21-sep)

Estaban 16 en rojo por el hallazgo 1. Ahora que pasan todos, cualquier rojo
nuevo es una regresión.

### Medición de cobertura

`node --test --experimental-test-coverage` se cuelga con esta suite (jsdom +
4458 tests: una hora sin terminar). No usar hasta encontrar alternativa; el
análisis estático de arriba basta para decidir.

### Plan de testing (decidido el 21-sep-2026)

1. Suite de audio verde (hallazgo 1).
2. Convertir los espejos en tests reales, por lógica que protegen:
   `dormancyManager`, `keyboard.worklet`, `sequencer`, `envelopeShaper`,
   `joystick`, `midiLearn`. Los worklets se cargan en Node como ya hacen
   `synthiFilter.worklet.test.js` o `sequencer.worklet.test.js` (mock de
   `AudioWorkletProcessor` en `tests/mocks`); los módulos, con
   `audioContext.mock.js`. Los espejos sirven de especificación: se conservan
   los casos y se cambia el sujeto.
3. Cubrir los 4 worklets huérfanos.
4. Una comprobación automática de que ningún test nuevo sea espejo.

## Hecho en esta auditoría

- `package-lock.json` sincronizado con `package.json` (0.8.0 + `naudiodon`
  opcional). `npm ci` vuelve a funcionar.
- Lazy init en `synthOscillator.worklet.js` → suite de audio 218/218.
- Espejos de dormancy convertidos: `tests/core/dormancyManager.test.js` prueba
  ahora el `DormancyManager` real (82 tests) y absorbe `dormancySequencer`,
  `dormancyRandomCV`, `dormancyKeyboard` y `dormancyFilters`, que se borran.
  Al hacerlo salieron dos cosas que los espejos ocultaban: usaban claves de
  localStorage inventadas (`synth_dormancy_enabled`; las reales llevan el
  prefijo `synthigme-`), y probaban un `setDormant` de InputAmplifiers **que
  no existe**: el manager registra el estado de `input-amplifiers` pero el
  módulo no hace nada con él (no ahorra CPU). Tampoco hay test real del
  `setDormant` de los output buses (`engine.js:440`) ni del de los osciladores
  (`panelRouting.js:348`): quedan para el paso 2.
- Convertidos también los otros espejos del paso 2: `keyboard.worklet` (54
  tests contra el worklet real; el espejo tenía mal la tolerancia de cents),
  `sequencer` (35), `envelopeShaper` (40), `joystick` (32; el espejo arrancaba
  con rango 5 cuando el módulo real arranca con 0) y `midiLearn` (71, contra
  `midiAccess` y `midiLearnManager` de verdad, incluidos `init()` con puertos y
  conexión en caliente). Con esto, el hueco que la tabla llamaba «real»
  (dormancy, teclado, secuenciador, joystick, envelope shaper, MIDI Learn)
  está cerrado. Quedan como espejo: `outputChannel`, `pulse`, 6 worklets
  (parte con cobertura Playwright), UI, OSC y Electron.
- `outputChannel` convertido (33 tests contra `OutputChannel` y
  `OutputChannelsPanel`; el espejo asumía fader logarítmico cuando el módulo
  arranca en lineal) y, de paso, el primer worklet huérfano cubierto:
  `outputFilter.worklet.test.js` (26) carga el worklet real y **mide** su
  respuesta con senos contra el modelo del circuito (LP −3 dB en 677 Hz,
  6 dB/oct, shelf +6 dB, DC intacta, metering). Quedan huérfanos `dcBlocker`,
  `scopeCapture` y `recordingCapture`.
- `pulse` (19; el espejo arrancaba con pw 0,5 y el módulo con 0; además
  `PulseModule` no lo usa ningún panel), `oscOscillatorSync` (34, contra la
  clase real y el `oscBridge` real con `window.oscAPI` stub) y
  `vcaProcessor` (28, el worklet real procesando bloques: slew medido en
  muestras, AM 5 Hz vs 1 kHz, resync, error interno). `oscServer.test.js`
  no era espejo: carga `electron/oscServer.cjs` con `require`, que el grep
  no buscaba.

### Hallazgo al probar el VCA real (pendiente de decisión)

Hay **dos curvas de saturación distintas** para el mismo VCA:

- `vcaProcessor.worklet.js` (`applySaturation`): `tanh(2·x/3)·3`. La
  pendiente en 0 V es 2, así que un CV de +1 V da **+17,5 dB**, no +10.
- `voltageConstants.js` (`vcaCalculateGain`, el que usa el fader en el hilo
  principal): `3·r/(1+2r)`, que siempre comprime: +1 V → **+6 dB**.

Por debajo de 0 V coinciden (10 dB/V). El test del worklet fija la curva tal
cual está, con un caso marcado `QUIRK`, para que unificarlas sea una decisión
y no un accidente. Desde este servidor no se puede oír cuál suena mejor.

## Orden propuesto

1. Lazy init en el worklet → suite de audio verde.
2. Los dos bugs triviales (osciloscopio, menú móvil).
3. `ARCHITECTURE.md` al estado post-R7/OFB.
4. Dependencias y CI: solo si se decide.
