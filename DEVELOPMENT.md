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

## Herramientas de desarrollo

### Optimización de SVG de paneles

Los archivos fuente de diseño (Inkscape) están en `design/panels/`. Para generar los SVG optimizados que usa la app:

```bash
npm run optimize:panel-svg -- design/panels/Panel3/panel3_source.svg src/assets/panels/panel3_bg.svg
```

El script (`scripts/tools/optimize-panel-svg.mjs`) realiza:
- Eliminación de metadatos de Inkscape y atributos innecesarios
- Compactación de colores (`#ffffff` → `#fff`)
- Reducción de precisión en coordenadas
- Deduplicación de estilos CSS

## Estructura del Proyecto

Para detalles sobre la arquitectura interna, módulos y flujo de audio, consulta **[ARCHITECTURE.md](ARCHITECTURE.md)**.

La estructura básica de código fuente en `src/`:
- `src/assets/js/`: Código fuente JS modular.
- `src/assets/css/`: Estilos.
- `src/assets/panels/`: SVG de paneles optimizados (producción).
- `design/panels/`: SVG de paneles fuente (Inkscape).
- `scripts/`: Scripts de mantenimiento y build (Node.js).
