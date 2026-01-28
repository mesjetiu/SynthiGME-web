# Guía de Desarrollo de SynthiGME-web

Este documento contiene toda la información necesaria para desarrolladores que quieran compilar, probar o contribuir al proyecto.

> **Importante**: SynthiGME-web es un proyecto "Vanilla JS" que utiliza ES Modules nativos. No usamos frameworks como React, Vue o Angular.

## ⚠️ Nota sobre la carpeta `docs/`

La carpeta `docs/` es el destino de compilación para GitHub Pages.
- **NUNCA modifiques nada dentro de `docs/` manualmente.**
- Cualquier cambio se perderá en el siguiente build.
- Realiza tus cambios en `src/` y ejecuta `npm run build`.

## Requisitos previos

- **Node.js**: v18 o superior.
- **npm**: incluido con Node.js.

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
Esto instala `esbuild` (bundler/minificador) y las dependencias de desarrollo (electron, playwright, etc.).

## Flujo de trabajo

### Compilación Web (PWA)

Para generar la versión web en `docs/`:
```bash
npm run build
```

Pasos que realiza este script (`scripts/build.mjs`):
1. Limpia `docs/`.
2. Empaqueta y minifica JS desde `src/assets/js/app.js` usando esbuild.
3. Minifica CSS y lo mueve a `docs/assets/css/`.
4. Copia `index.html` y assets estáticos.

### Compilación Electron (Escritorio)

Electron utiliza su propia carpeta de salida `dist-app/` y genera instaladores en `dist-electron/`.

**Modo desarrollo:**
```bash
npm run electron:dev
```
Ejecuta la aplicación de escritorio en caliente sin generar instaladores.

**Generar instaladores:**
```bash
# Linux (AppImage)
npm run electron:build:linux

# Windows (exe portable + instalador)
npm run electron:build:win

# Ambos (Linux + Windows)
npm run electron:build:all
```
Los artefactos se generan en `dist-electron/` con fecha y hora en el nombre.

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

### Ejecutar todo
```bash
npm run test:all
```

## Scripts de npm

Referencia rápida de comandos en `package.json`:

| Comando | Descripción |
|---------|-------------|
| `npm run build` | Genera la web PWA en `docs/` (con tests). |
| `npm run build:skip-tests` | Genera la web sin pasar tests. |
| `npm run electron:dev` | Lanza entorno de desarrollo Electron. |
| `npm run electron:build` | Genera instalador para el SO actual. |
| `npm run release:patch` | 0.0.x -> Incrementa versión patch. |
| `npm run release:minor` | 0.x.0 -> Incrementa versión minor. |

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

## Estructura del Proyecto

Para detalles sobre la arquitectura interna, módulos y flujo de audio, consulta **[ARCHITECTURE.md](ARCHITECTURE.md)**.

La estructura básica de código fuente en `src/`:
- `src/assets/js/`: Código fuente JS modular.
- `src/assets/css/`: Estilos.
- `src/assets/panels/`: Definiciones SVG de los paneles.
- `scripts/`: Scripts de mantenimiento y build (Node.js).
