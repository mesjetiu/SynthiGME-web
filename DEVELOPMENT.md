# Guía de Desarrollo de SynthiGME-web

Este documento contiene toda la información necesaria para desarrolladores que quieran compilar, probar o contribuir al proyecto.

> **Importante**: SynthiGME-web es un proyecto "Vanilla JS" que utiliza ES Modules nativos. No usamos frameworks como React, Vue o Angular.

## ⚠️ Carpetas de salida - NO MODIFICAR MANUALMENTE

| Carpeta | Propósito | Comando que la genera |
|---------|-----------|----------------------|
| `docs/` | PWA para GitHub Pages | `npm run build:web` |
| `dist-app/` | App compilada para Electron | `npm run build:electron:*` |
| `dist-electron/` | Instaladores (AppImage, exe) | `npm run build:electron:*` |

**Importante**: Cada flujo de build es independiente:
- `build:web` → `src/` → `docs/` (web/PWA)
- `build:electron:*` → `src/` → `dist-app/` → `dist-electron/` (escritorio)

`docs/` **NUNCA** es un paso intermedio para Electron. Ambos flujos compilan directamente desde `src/`.

## Materiales previos por módulo

La carpeta `module_research/` agrupa notas, manuales, imágenes de referencia y materiales de investigación usados antes de implementar cada módulo.

- `module_research/envelope_shapers/`: documentación técnica y material visual del Envelope Shaper
- `module_research/sequencer/`: notas iniciales y material de investigación del secuenciador

Convención de uso:

- Crear una subcarpeta por módulo o subsistema
- Guardar aquí solo materiales previos a la implementación, no código fuente ni builds
- Mantener los nombres orientados al módulo para que la investigación sea localizable

## Requisitos previos

- **Node.js**: v18 o superior
- **npm**: incluido con Node.js

Para builds de Electron en Linux con audio multicanal:
- **PipeWire**: Sistema de audio (requerido para 8 canales independientes)
- **Dependencias de compilación**: `build-essential`, `libpipewire-0.3-dev`

Verifica tus versiones:
```bash
node -v
npm -v
```

## Instalación

Desde la raíz del repositorio:
```bash
npm install
```

Para compilar el addon nativo de audio (opcional, solo Linux):
```bash
cd electron/native && npm install && cd ../..
```

## Flujo de trabajo

### Desarrollo diario

Para desarrollo iterativo, usa los comandos rápidos (sin tests):

```bash
# Desarrollo Electron (OSC, IPC, audio nativo)
npm run dev

# Desarrollo PWA web (compila y muestra instrucciones)
npm run dev:web
```

### Compilación Web (PWA)

Genera la versión web en `docs/` para GitHub Pages:

```bash
# Sin tests (desarrollo rápido)
npm run build:web

# Con tests (antes de commit)
npm run build:web:test
```

### Compilación Electron (Escritorio)

Genera instaladores en `dist-electron/`:

```bash
# Plataforma actual (detecta automáticamente)
npm run build:electron

# Linux específico (AppImage)
npm run build:electron:linux

# Windows específico (exe + instalador NSIS)
npm run build:electron:win

# Ambas plataformas
npm run build:electron:all

# Con tests previos
npm run build:electron:test
```

### Build completo (para releases)

Compila todo (web + Electron) con tests:
```bash
npm run build:all
```

## Tests

### Tests unitarios (Node.js)
```bash
npm test
```
Ejecuta tests rápidos de lógica usando el test runner nativo de Node.js (`node --test`).

### Tests de audio (Playwright)
```bash
npm run test:audio
```
Ejecuta tests end-to-end en un navegador Chromium headless. Verifica que el motor de audio realmente produce sonido y que el DSP funciona (hard sync, aliasing, ruteo).

Ver reporte tras ejecución:
```bash
npx playwright show-report test-results/audio-report
```

Opciones avanzadas:
- `npm run test:audio:headed`: Ver el navegador mientras se ejecutan los tests.
- `npm run test:audio:ui`: Usar la interfaz gráfica de Playwright.

### Ejecutar todos los tests
```bash
npm run test:all
```

## Perfilado y medición de rendimiento UI

Desde marzo de 2026 el proyecto incluye una primera infraestructura de perfilado reproducible para la interfaz web.

### Activación en runtime

La app expone un monitor de rendimiento global cuando se abre con:

```bash
http://localhost:xxxx/docs/index.html?perf=1
```

Esto habilita `window.__synthPerf`, que permite:

- Capturar snapshots estructurales (`DOM`, `SVG`, memoria JS cuando el navegador la expone)
- Medir escenarios reproducibles con `requestAnimationFrame`
- Registrar `long tasks`
- Exportar un informe JSON descargable

APIs principales:

- `window.__synthPerf.captureSnapshot(label)`
- `window.__synthPerf.runIdleScenario(...)`
- `window.__synthPerf.runMainViewportWheelScenario(...)`
- `window.__synthPerf.runPipViewportWheelScenario(...)`
- `window.__synthPerf.exportSummary(...)`

Ayudas específicas para PiP:

- El canvas principal se mantiene en overview; usa estas ayudas para abrir el foco de trabajo en PiP.
- `window.__synthPipDebug.open(panelId)`
- `window.__synthPipDebug.close(panelId)`
- `window.__synthPipDebug.openAll()`
- `window.__synthPipDebug.closeAll()`
- `window.__synthPipDebug.list()`

### Script automatizado

Para obtener una línea base reproducible en Chromium sobre Linux:

```bash
npm run perf:ui
```

El script:

- levanta un servidor HTTP temporal sobre `docs/`
- abre Chromium con Playwright
- ejecuta escenarios de `idle`, `pan` y `zoom` en viewport principal y PiP
- recoge métricas CDP (`TaskDuration`, `LayoutDuration`, `RecalcStyleDuration`, `Nodes`, `JSHeapUsedSize`, etc.)
- guarda un informe JSON en `test-results/perf/`

Archivo principal: [scripts/perf/measure-ui.mjs](scripts/perf/measure-ui.mjs)

### Línea base inicial (Linux Chromium headless, 1600×1000)

Informe de referencia: [test-results/perf/ui-perf-report-2026-03-06T11-44-59-229Z.json](test-results/perf/ui-perf-report-2026-03-06T11-44-59-229Z.json)

Snapshot base:

- ~45.057 nodos DOM
- ~25.882 nodos SVG
- 191 knobs
- 15 `VernierKnob`
- 8.442 pines

Resultados resumidos:

- `idle-3s`: ~33,5 FPS
- `main-pan-wheel`: ~31,8 FPS
- `main-zoom-wheel`: ~34,7 FPS
- `main-zoom-idle-sharp`: ~56,3 FPS
- `pip-pan-panel-1`: ~20,6 FPS
- `pip-zoom-panel-1`: ~13,6 FPS

Lectura inicial:

- El árbol visual base ya es muy grande antes de interactuar.
- El overview principal parece estar más limitado por raster/compositor/paint que por JS puro.
- El PiP sigue mostrando coste real de `layout/recalc`, especialmente durante zoom y resize.
- El modo `sharp rasterize` mejora claramente el estado en reposo tras el zoom, pero no resuelve el coste durante la interacción continua.

### Objetivo de esta infraestructura

No está pensada para telemetría de usuarios finales, sino para:

- comparar A/B de cambios estructurales de UI
- detectar regresiones de fluidez
- validar regresiones del modelo actual de overview fijo + PiP como foco principal
- medir el coste de previews, locks y redimensionado en paneles flotantes

## Referencia rápida de comandos

### Desarrollo (sin tests, iteración rápida)

| Comando | Genera | Descripción |
|---------|--------|-------------|
| `npm run dev` | - | Electron en modo desarrollo |
| `npm run dev:web` | `docs/` | PWA web (compila y muestra instrucciones) |
| `npm run build:i18n` | - | Solo traducciones YAML → JS |

### Build Web/PWA

| Comando | Genera | Tests |
|---------|--------|-------|
| `npm run build:web` | `docs/` | No |
| `npm run build:web:test` | `docs/` | Sí |

### Build Electron

| Comando | Genera | Plataforma |
|---------|--------|------------|
| `npm run build:electron` | `dist-electron/` | Actual |
| `npm run build:electron:linux` | `dist-electron/` | Linux (AppImage) |
| `npm run build:electron:win` | `dist-electron/` | Windows (exe/NSIS) |
| `npm run build:electron:all` | `dist-electron/` | Linux + Windows |
| `npm run build:electron:test` | `dist-electron/` | Actual + Tests |

### Build completo

| Comando | Genera | Descripción |
|---------|--------|-------------|
| `npm run build:all` | `docs/` + `dist-electron/` | Web + Electron (Linux+Win) con tests |

### Releases

| Comando | Descripción |
|---------|-------------|
| `npm run release:patch` | Incrementa versión 0.0.x |
| `npm run release:minor` | Incrementa versión 0.x.0 |
| `npm run release:major` | Incrementa versión x.0.0 |

## Versionado y Releases

El proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

1. Mantén `CHANGELOG.md` actualizado en la sección `Unreleased`.
2. Para publicar una nueva versión:
   - Asegúrate de estar en `main` y limpio.
   - Ejecuta `npm run release:patch` (o minor/major).
3. El script automáticamente:
   - Pasa los tests.
   - Compila la web (`npm run build`).
   - Actualiza `package.json` y `CHANGELOG.md`.
   - Crea un commit y un tag `vX.Y.Z`.
4. Haz push: `git push origin main && git push origin --tags`.

## Variables de entorno para builds

El sistema de build lee automáticamente un archivo `.env` en la raíz del proyecto (si existe). Esto permite configurar variables sin tener que escribirlas en cada comando.

### Configuración

1. Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
2. Edita `.env` con tus valores (no se commitea, está en `.gitignore`).

### Variables disponibles

| Variable | Propósito | Efecto si ausente |
|----------|-----------|-------------------|
| `TELEMETRY_URL` | URL del endpoint de telemetría (Google Apps Script) | Telemetría desactivada silenciosamente |

También puedes pasar variables directamente en el comando:
```bash
TELEMETRY_URL="https://..." npm run build:web
```

Las variables de `process.env` tienen prioridad sobre las de `.env`.

---

## Herramientas de desarrollo

### Optimización de SVG

El script `scripts/tools/optimize-svg.mjs` optimiza cualquier SVG de Inkscape para producción.
Siempre se ejecuta sobre archivos en `src/assets/`, **nunca** sobre los fuentes de `design/`.

```bash
# Optimizar in-place (sobreescribe el archivo)
npm run optimize:svg -- src/assets/knobs/knob.svg

# Optimizar con salida a otro archivo
npm run optimize:svg -- design/panels/Panel3/panel3_source.svg src/assets/panels/panel3_bg.svg

# Preservar imágenes embebidas
npm run optimize:svg -- src/assets/panels/panel_3.svg --keep-images
```

### Pipeline de knobs rasterizados

Desde marzo de 2026, los knobs y switches de la UI usan principalmente **PNGs rasterizados** en runtime para reducir nodos DOM y coste de render.

SVGs fuente editables:

- `design/knobs/knob.svg`
- `design/knobs/knob-0-center.svg`
- `design/knobs/toggle-switch.svg`
- `design/knobs/rotary-switch.svg`
- `design/knobs/knob multivuelta/spectrol-vernier-dial.svg`

PNGs runtime generados:

- `src/assets/knobs/knob-ring.png`
- `src/assets/knobs/knob-ring-bipolar.png`
- `src/assets/knobs/toggle-a.png`
- `src/assets/knobs/toggle-b.png`
- `src/assets/knobs/rotary-a.png`
- `src/assets/knobs/rotary-b.png`
- `src/assets/knobs/vernier-rotor.png`
- `src/assets/knobs/vernier-ring.png`

Regeneración:

```bash
./scripts/tools/gen-all-knob-pngs.sh
```

Notas:

- En `src/assets/knobs/` solo permanecen como SVG runtime `toggle-switch.svg` y `vernier-dial.svg`, porque siguen cargándose inline en paths concretos.
- `knob.svg`, `knob-0-center.svg` y `rotary-switch.svg` ya no se usan en runtime desde `src/`.

El script realiza:
- Eliminación de metadatos de Inkscape y atributos innecesarios
- Eliminación de IDs no referenciados (preserva los usados por `url(#)`, `href`, `xlink:href`)
- Compactación de colores (`#ffffff` → `#fff`)
- Reducción de precisión en coordenadas
- Deduplicación de estilos inline → clases CSS
- Minificación de whitespace

## Estructura del Proyecto

Para detalles sobre la arquitectura interna, módulos y flujo de audio, consulta **[ARCHITECTURE.md](ARCHITECTURE.md)**.

La estructura básica de código fuente en `src/`:
- `src/assets/js/`: Código fuente JS modular.
- `src/assets/css/`: Estilos.
- `src/assets/fonts/`: Fuentes tipográficas (Microgramma, Eurostile, Univers).
- `src/assets/knobs/`: PNGs raster de knobs/switches y los SVG runtime que siguen activos (`toggle-switch.svg`, `vernier-dial.svg`).
- `src/assets/panels/`: SVG de paneles optimizados (producción).
- `design/knobs/`: SVGs fuente editables de knobs y switches, usados para regenerar PNGs.
- `design/panels/`: SVG de paneles fuente (Inkscape).
- `scripts/`: Scripts de build y utilidades:
  - `build.mjs`: Build principal (esbuild, copia assets, inyecta versión). Lee `.env` automáticamente.
  - `build-i18n.mjs`: Genera locales JS desde `translations.yaml`.
  - `electron-build.mjs`: Wrapper de electron-builder con timestamp.
  - `run-tests.mjs`: Runner de tests unitarios.
  - `test-all.mjs`: Resumen estructurado de todos los tests.
  - `telemetry/`: Backend de telemetría (Apps Script + guía de despliegue).
  - `release/`: Scripts de versionado y generación de requisitos.
   - `tools/`: Herramientas de desarrollo (optimización SVG, generadores SVG→PNG de knobs, etc.).
- `.env.example`: Plantilla de variables de entorno (committed).
- `.env`: Variables de entorno locales (gitignored).
