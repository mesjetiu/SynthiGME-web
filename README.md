# SynthiGME-web

SynthiGME-web es un port del sintetizador modular Synthi GME ("GME Modular Emulator"), inspirado en el EMS Synthi 100 del Gabinete de Música Electroacústica (GME) de Cuenca. El proyecto nació como Trabajo Final del Máster en Arte Sonoro de la Universitat de Barcelona (curso 2019/2020) bajo la tutoría de José Manuel Berenguer Alarcón y se concibió como herramienta de documentación, divulgación y experimentación sonora. Esta versión web persigue el mismo objetivo pedagógico pero con una distribución sin fricciones: basta un navegador moderno para explorar el sistema, sin instalaciones locales ni dependencias especializadas.

## Acceso en línea
La versión compilada está disponible en GitHub Pages: **https://mesjetiu.github.io/SynthiGME-web/**. Solo necesitas abrir ese enlace en un navegador moderno para experimentar el instrumento; no es necesario clonar ni compilar nada para usarlo.

## Características actuales

### Módulos implementados

| Módulo | Descripción |
|--------|-------------|
| **12 Osciladores** | Formas de onda pulse, sine, triangle, sawtooth con anti-aliasing PolyBLEP. **Nuevo**: Modelado híbrido de "Sine Shape" (Symmetry) basado en circuito original (Waveshaper Tanh) para carácter analógico fiel. Rango 1 Hz–10 kHz. **Hard sync** disponible. |
| **2 Generadores de ruido** | Algoritmo Voss-McCartney para ruido rosa. Knob de color (blanco→rosa). |
| **Osciloscopio** | Modos Y-T y X-Y (Lissajous). Trigger Schmitt con histéresis temporal y predictiva. |
| **Matrices de conexión** | Audio (panel 5) y control (panel 6). Conexiones persistentes con tooltips, pines inactivos configurables. **Nuevo**: Selección de color de pin (click derecho / pulsación larga) con **8 tipos**: estándar (blanco, gris, verde, rojo) y especiales (azul, amarillo, cian, púrpura). Resistencias 2.7kΩ–1MΩ según manual Datanomics 1982. Ganancia calculada según modelo de tierra virtual. |
| **8 Entradas de audio** | Input Amplifiers con 8 canales y control de ganancia individual. |
| **8 Salidas de audio** | Canales individuales con filtro bipolar (LP/HP), pan, nivel, y switch on/off. |
| **Stereo buses** | Dos buses estéreo (Pan 1-4 y Pan 5-8) que agrupan 4 canales cada uno con control de panning. |
| **Configuración de audio** | Selección de dispositivo de salida y ruteo de buses lógicos (1-8) a L/R. Matriz 8×2 con persistencia. |
| **Sistema de patches** | Guardar, cargar, renombrar y eliminar patches. Exportar/importar archivos `.sgme.json`. Autoguardado configurable con recuperación de sesión. |
| **Grabación de audio** | Exportación WAV multitrack (1-12 pistas). Matriz de ruteo outputs→tracks adaptativa. |
| **Ajustes** | Idioma, escalado (1×-4×), autoguardado, wake lock, dormancy, modo de latencia, **emulación de voltajes**. Pestaña Visualización para pines y escala. |
| **Dormancy** | Sistema de optimización que silencia automáticamente módulos sin conexiones activas. Reduce carga de CPU en móviles. |
| **Emulación de voltajes** | Emula el modelo eléctrico del Synthi 100 Cuenca/Datanomics (1982): soft clipping con tanh(), tolerancia de pines, deriva térmica. |
| **Paneles flotantes (PiP)** | Extrae paneles a ventanas independientes flotantes. Útil para trabajar con múltiples paneles simultáneamente sin navegar. Menú en quickbar y click derecho. Estado persistente. |
| **Joystick** | Control X-Y integrado en panel 2. |

### Atajos de teclado

| Tecla | Acción |
|-------|--------|
| `M` | Silenciar/activar audio (mute global) |
| `R` | Iniciar/detener grabación |
| `P` | Abrir/cerrar navegador de patches |
| `S` | Abrir/cerrar ajustes |
| `F` | Alternar pantalla completa |
| `Shift+I` | Reiniciar a valores por defecto |
| `Alt` (mantener) | Mostrar números de panel para navegación rápida |
| `Ctrl`/`Cmd` (mantener, knobs) | Knobs: mover 10× más rápido |
| `Shift` (mantener, knobs) | Knobs: mover 10× más preciso |
| `1`-`6` | Navegar a panel 1-6 |
| `7` | Navegar a panel de salida |
| `0` | Vista general (todos los paneles) |
| `Esc` | Cerrar modal activo / Devolver panel flotante |

### Ajustes de usuario

Accede a los ajustes pulsando `S` o desde la quickbar (icono de engranaje).

| Ajuste | Descripción |
|--------|-------------|
| **Idioma** | Español o inglés. Afecta a toda la interfaz. |
| **Escala de renderizado** | 1× a 4×. Mayor escala = gráficos más nítidos pero mayor consumo de GPU. |
| **Autoguardado** | Guarda automáticamente el estado cada 15s, 30s, 1m, 5m, o desactivado. |
| **Mantener pantalla encendida** | Evita que la pantalla se apague durante sesiones de síntesis (Screen Wake Lock API). Activado por defecto en navegadores compatibles. |

### Tecnología

- **Web Audio API** con AudioWorklet para procesamiento en tiempo real
- **Vanilla JavaScript ES Modules** — sin frameworks de runtime
- **esbuild** para bundling y minificación
- **PWA** con Service Worker para uso offline
- **Electron** para versión de escritorio con funcionalidades avanzadas

Para detalles de arquitectura, ver [ARCHITECTURE.md](ARCHITECTURE.md).

### Salida multicanal (Electron)

La versión Electron soporta salida de audio multicanal (hasta 8 canales independientes), superando la limitación de 2 canales de Web Audio API en navegadores.

| Plataforma | Canales | Estado |
|------------|---------|--------|
| Electron Linux | 8 | ✅ Validado (PipeWire) |
| Electron Windows | 8 | 🔄 Planificado (WASAPI) |
| Electron macOS | 8 | 🔄 Planificado (CoreAudio) |
| PWA / Web | 2 | Limitación de Chromium |

Para detalles técnicos, ver [MULTICANAL-ELECTRON.md](MULTICANAL-ELECTRON.md).

### Versión PWA e instalación
- Fija el sitio en tu dispositivo desde Chrome/Edge/Brave: menú → “Instalar Synthi GME Web”.
- El `manifest.webmanifest` define los iconos (192/512 px) y el modo `standalone`, por lo que la app instalada oculta la UI del navegador.
- El `service worker` (`sw.js`) precachea `index.html`, CSS, JS e iconos, permitiendo abrir la app sin conexión tras la primera visita.
- Cuando se publica una versión nueva, el SW permanece “waiting” y la interfaz muestra un diálogo para recargar; solo al aceptar se activa el SW nuevo para evitar interrupciones.

## Relación con SynthiGME (SuperCollider)
El repositorio original en SuperCollider, [SynthiGME](https://github.com/mesjetiu/SynthiGME), contiene la implementación completa como Quark, documentación histórica detallada y material audiovisual del instrumento. SynthiGME-web reutiliza esa investigación y traslada los paneles a la web para facilitar su difusión; cualquier mejora conceptual debería mantenerse alineada con la referencia original.

## Flujo de compilación
Esta sección solo es necesaria si vas a mantener el proyecto o desplegarlo fuera de GitHub Pages. El flujo técnico genera un bundle estático en `docs/`, que también sirve para alimentar Pages (rama `main` + carpeta `/docs`).

### Requisitos previos
- Node.js 18 o superior
- npm (incluido junto a Node.js)

Verifica tus versiones con:

```bash
node -v
npm -v
```

### Instalación de dependencias
Desde la raíz del repositorio ejecuta una sola vez:

```bash
npm install
```

Esto instala `esbuild`, la herramienta utilizada para empaquetar y minificar los assets.

### Estructura de carpetas
- `src/`: código fuente editable. Incluye `index.html`, `assets/css/main.css` y `assets/js/` con todos los módulos.
- `scripts/`: tareas auxiliares. Actualmente contiene `build.mjs`, que orquesta la compilación.
- `docs/`: salida generada automáticamente por el comando de build. Esta carpeta es la que puede publicar GitHub Pages (rama `main` + carpeta `/docs`). No edites su contenido a mano; se regenera cada vez.

### Ejecutar el build
Lanza el proceso de empaquetado con:

```bash
npm run build
```

Este comando ejecuta `node scripts/build.mjs`, que realiza los siguientes pasos:
1. Limpia la carpeta `docs/` completa.
2. Bundlea y minifica el JavaScript partiendo de `src/assets/js/app.js` (incluyendo sus módulos) usando esbuild.
3. Minifica `src/assets/css/main.css` y lo coloca en `docs/assets/css/`.
4. Copia `src/index.html` a `docs/index.html` para apuntar a los assets generados.

El resultado está listo para publicarse directamente desde la carpeta `docs/`.

### Ejecutar los tests

El proyecto incluye:
- Tests unitarios con el runner nativo de Node.js
- Tests de audio reales en navegador (Playwright + Web Audio)

Ejecuta los distintos tipos de tests según necesites:

```bash
# Tests unitarios (Node.js)
npm test

# Tests de audio (Playwright, Web Audio real)
npm run test:audio

# Ejecutar toda la batería (unitarios + audio) con resumen final
npm run test:all
```

Detalles por tipo de test:
- Unitarios (Node.js): ejecuta `node --test` sobre `tests/**/**.test.js` (excluye los de audio). Cubre, entre otros:
	- Mapeo de matrices Synthi → índice físico
	- Motor de audio (AudioEngine) con mocks
	- Sistema de dormancy y optimizaciones
	- Módulos de síntesis (osciladores, ruido, osciloscopio)
	- Sistema de patches (migraciones, validación, esquema)
	- Internacionalización (paridad de traducciones)
	- Utilidades (logging, constantes, deepMerge)
- Audio reales (Playwright): corre en Chromium headless con Web Audio API real, verificando DSP (hard sync, anti‑aliasing, barridos de frecuencia, modo multi‑waveform, routing de matriz). El servidor HTTP se inicia automáticamente vía configuración de Playwright, no necesitas pasos previos. Reporte HTML disponible con:

```bash
npx playwright show-report test-results/audio-report
```

- Todo (resumen estructurado): `npm run test:all` ejecuta unitarios y audio y muestra un informe final con estado por suite, tiempos y totales agregados.

Consulta la guía avanzada en [tests/audio/README.md](tests/audio/README.md) para opciones `--ui`, `--headed`, filtros y helpers de análisis espectral.

## Licencia
SynthiGME-web se distribuye bajo la licencia [MIT](LICENSE). Puedes reutilizar, modificar y redistribuir el código manteniendo la atribución correspondiente.

### Iconos y gráficos
- La barra de acciones móviles usa iconos de [Tabler Icons](https://tabler-icons.io/) (MIT). Ver `src/assets/icons/ui-sprite.svg` y `src/assets/icons/LICENSE.tabler-icons.txt`.
- Iconos de los paneles del sintetizador diseñados por **Sylvia Molina Muro**.

## Versionado y releases
1. Mantén el número de versión únicamente en `package.json` siguiendo [Semantic Versioning](https://semver.org/lang/es/). Registra tus cambios recientes en `CHANGELOG.md` dentro de la sección `Unreleased`.
2. Cuando quieras publicar una versión, asegúrate de que el repositorio está limpio en la rama `main`, mueve las notas de `Unreleased` a una nueva entrada (p. ej. `## [0.1.1] - AAAA-MM-DD`) y guarda el archivo.
3. Ejecuta `npm run release:patch`, `npm run release:minor` o `npm run release:major` según el alcance de los cambios:
	- El helper `scripts/release/pre.mjs` comprueba que solo `CHANGELOG.md` esté modificado, guarda temporalmente su contenido y limpia el working tree.
	- El hook `preversion` lanza `npm run build`, regenerando la carpeta `docs/` con la salida lista para GitHub Pages.
	- `npm version` actualiza `package.json`, crea el commit automático (`release: Synthi GME vX.Y.Z`) y añade el tag `vX.Y.Z`.
	- El helper `scripts/release/post.mjs` restaura `CHANGELOG.md`, añade `docs/` y enmienda el commit antes de forzar el tag para apuntar al nuevo snapshot.
4. Revisa el diff (incluidos los artefactos de `docs/`). Si todo es correcto, publica la versión con `git push origin main` seguido de `git push origin --tags`.

Tras estos pasos, la carpeta `docs/` contiene la última versión estable y está lista para ser servida por GitHub Pages sin tareas adicionales.

### Notas de trabajo
- Realiza siempre los cambios en `src/` y vuelve a ejecutar `npm run build` cuando necesites un paquete actualizado (por ejemplo antes de subir a GitHub Pages u otro servidor).
- Evita modificar manualmente el contenido de `docs/` para prevenir inconsistencias entre builds. Tras construir, haz commit/push de `docs/` para que Pages publique la última versión.

## Aplicación de escritorio (Electron)

Además de la versión web y PWA, puedes empaquetar Synthi GME como aplicación de escritorio nativa usando Electron. Esto garantiza máxima compatibilidad con Web Audio API y AudioWorklet en todas las plataformas.

### Desarrollo local

Para probar la versión de escritorio sin generar instaladores:

```bash
# 1. Asegúrate de tener el build web actualizado
npm run build

# 2. Ejecuta la app en modo desarrollo
npm run electron:dev
```

### Generar instaladores

Desde Linux puedes compilar para Linux y Windows. macOS requiere un sistema macOS real para firma de código (ver sección CI/CD).

```bash
# Solo Linux (AppImage + .deb)
npm run electron:build:linux

# Solo Windows (installer NSIS + portable)
npm run electron:build:win

# Linux + Windows simultáneo
npm run electron:build:all
```

Los instaladores se generan en la carpeta `dist-electron/`.

| Plataforma | Formatos generados |
|------------|-------------------|
| Linux | `.AppImage`, `.deb` |
| Windows | `.exe` (NSIS installer), `.exe` (portable) |
| macOS | `.dmg` (requiere macOS o CI/CD) |

### Estructura de archivos Electron

```
electron/
├── main.cjs      # Proceso principal: servidor HTTP, ventana, menú
└── preload.cjs   # Script de preload para APIs nativas futuras
```

### Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run electron:dev` | Ejecuta la app en modo desarrollo |
| `npm run electron:build` | Genera instaladores para la plataforma actual |
| `npm run electron:build:linux` | Genera instaladores Linux (AppImage + .deb) |
| `npm run electron:build:win` | Genera instaladores Windows (NSIS + portable) |
| `npm run electron:build:all` | Genera instaladores Linux + Windows |
| `npm run build:all` | Build web + instaladores Electron (con tests) |
| `npm run build:all:skip-tests` | Build web + instaladores Electron (sin tests) |

### CI/CD con GitHub Actions (futuro)

Para compilar automáticamente en las tres plataformas desde GitHub, crea el archivo `.github/workflows/electron-build.yml`:

```yaml
name: Build Electron Apps

on:
  push:
    tags:
      - 'v*'  # Ejecuta en cada tag de versión

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web app
        run: npm run build:skip-tests
      
      - name: Build Electron app
        run: npm run electron:build
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: electron-${{ matrix.os }}
          path: dist-electron/*
```

Este workflow:
1. Se ejecuta automáticamente cuando creas un tag `vX.Y.Z`
2. Compila en paralelo en Linux, Windows y macOS
3. Sube los instaladores como artefactos del workflow

Para publicar releases automáticamente, añade `electron-builder --publish always` y configura el token de GitHub.

### Notas técnicas

- **Compatibilidad de audio**: Electron usa Chromium, garantizando comportamiento idéntico al navegador Chrome
- **Nombre en mezcladores**: La app aparece como "SynthiGME" en PipeWire/PulseAudio (Linux) gracias al flag `AudioServiceOutOfProcess` deshabilitado
- **Limitación multicanal**: Chromium limita `destination.maxChannelCount` a 2 canales independientemente del hardware. Para salida multicanal (>2ch) se requeriría addon nativo (PortAudio) — planificado para futuro
- **Service Worker**: Funciona en Electron pero es menos necesario (la app ya es local)
- **Firma de código**: Sin firma, Windows/macOS mostrarán advertencias de "app no verificada". Para distribución pública, considera obtener certificados de firma
- **Auto-updates**: electron-updater permite actualizaciones automáticas desde GitHub Releases (configuración adicional requerida)

## Solución de problemas

### Audio inestable o cambios de volumen en dispositivos móviles

Si experimentas audio distorsionado, cambios de volumen inesperados o comportamiento errático del sintetizador en dispositivos móviles, desactiva el procesamiento de audio del sistema:

- **Android (Samsung):** Ajustes → Sonidos y vibración → Calidad de sonido y efectos → Desactivar **Dolby Atmos**
- **Android (otros):** Busca "efectos de audio", "Audio Espacial" o "ecualizador" en ajustes de sonido
- **iOS:** Ajustes → Música → Desactivar **Audio Espacial**

Estos efectos de postprocesado pueden interferir con la síntesis de audio en tiempo real generada por la aplicación.

### Crepitaciones o dropouts en Chrome Android

Si experimentas crepitaciones, cortes de audio o inestabilidad en Chrome Android, prueba **Firefox para Android**. Firefox utiliza un motor de audio diferente (cubeb) que maneja mejor la prioridad del thread de audio en dispositivos móviles.

También puedes aumentar el buffer de audio en **Ajustes → Avanzado → Modo de latencia** seleccionando "Seguro (100ms)" o "Máximo (200ms)".
