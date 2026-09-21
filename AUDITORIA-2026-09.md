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
| Tests de audio (Playwright) | no ejecutados aquí. Según la auditoría de julio (`TODO.md`): 202/218, los 16 fallos con causa conocida y **fix pendiente** (ver abajo) |
| Código fuente | ~79.900 líneas JS en `src/`, ~65.100 en `tests/` (166 ficheros de test) |
| Ramas remotas | 5 ramas muertas de dic-2025/ene-2026, entre 800 y 1559 commits por detrás de `main` |

Valoración del trabajo de marzo: el refactor R7 está bien hecho (delegadores en
`app.js` + un módulo y su test por responsabilidad), el OFB va con 58 tests, y
los diagnósticos de la auditoría de julio son correctos (se han contrastado con
el código). Lo que faltó fue **cerrar**: se diagnosticó sin arreglar y se
refactorizó sin actualizar la arquitectura.

## Hallazgos, por prioridad

### 1. Suite de audio: 16 fallos con fix conocido y no aplicado

`synthOscillator.worklet.js:152-160` inicializa `_smoothedGain`, `_smoothedSymmetry`
y los `_smoothed*Level` con constantes fijas. La app los pasa por
`processorOptions` (sin transitorio en producción), el harness de tests no, y los
primeros ~150 ms contaminan las medidas. Fix preferido: **lazy init** desde el
primer sample de cada AudioParam en el primer `process()`. Elimina el transitorio
para cualquier consumidor sin perder el anti-zipper. Detalle en `TODO.md`
§«Tests de audio».

De paso: `this.mode` se asigna dos veces en ese constructor (líneas 108 y 162).

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

## Hecho en esta auditoría

- `package-lock.json` sincronizado con `package.json` (0.8.0 + `naudiodon`
  opcional). `npm ci` vuelve a funcionar.

## Orden propuesto

1. Lazy init en el worklet → suite de audio verde.
2. Los dos bugs triviales (osciloscopio, menú móvil).
3. `ARCHITECTURE.md` al estado post-R7/OFB.
4. Dependencias y CI: solo si se decide.
