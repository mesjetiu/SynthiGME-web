# Instrucciones para GitHub Copilot

## Estructura del Proyecto

## Estructura del Proyecto

### ⚠️ Carpeta `docs/` - GENERADA, INCLUIDA EN GIT

La carpeta `docs/` es **generada automáticamente** por el proceso de build (`npm run build:web`).
Se usa exclusivamente para servir la PWA en GitHub Pages.

**Important**:
- **`docs/` SÍ se commitea** - No está en `.gitignore` porque GitHub Pages la necesita
- **NUNCA modificar manualmente** - Siempre regenerar con `npm run build:web`
- **Crear archivos en `src/`, no en `docs/`** - Los cambios en `src/` se copian a `docs/` en el build
- **La rama main es la fuente oficial** - GitHub Pages sirve desde `main:/docs`

Los archivos fuente están en `src/` y se copian/procesan a `docs/` durante el build.

### Ubicación de Documentación

La documentación del proyecto va en la **raíz**:
- `README.md` - Documentación para usuario final (no técnico)
- `DEVELOPMENT.md` - Guía para desarrolladores (build, tests, scripts)
- `ARCHITECTURE.md` - Arquitectura interna del proyecto
- `CHANGELOG.md` - Historial de cambios
- `OSC.md` - Documentación del protocolo OSC
- `TODO.md` - Tareas pendientes

### Estructura de Carpetas

```
/                       # Documentación y configuración
├── src/                # Código fuente de la aplicación web
├── electron/           # Código del wrapper Electron
├── tests/              # Tests automatizados
├── scripts/            # Scripts de build y utilidades
├── docs/               # ⚠️ GENERADO - NO TOCAR
└── dist-electron/      # ⚠️ GENERADO - builds de Electron
```

### Convenciones de Código

- ES Modules (type: "module")
- Vanilla JavaScript (sin frameworks de runtime)
- Web Audio API + AudioWorklet para síntesis
- JSDoc para documentación inline

## Commits

Cuando el usuario pida hacer commits:

### Idioma y formato
- **Siempre en español**
- Mensaje principal breve pero descriptivo
- Cuerpo del mensaje con explicación exhaustiva de lo hecho
- Usar formato convencional: `tipo(ámbito): descripción`
  - Tipos: `feat`, `fix`, `refactor`, `docs`, `build`, `test`, `chore`

### División de commits
- Si se han hecho **múltiples cambios independientes**, dividir en varios commits
- Cada commit debe ser atómico: un cambio lógico por commit
- Solo hacer un único commit si realmente es un solo cambio

### Ejemplo de buen commit
```
feat(oscillator): añadir soporte para hard sync entre osciladores

- Implementada entrada de sincronización en synthOscillator.worklet.js
- El flanco positivo del master resetea la fase del slave
- Expuesto en matriz de audio (Panel 5, columnas 24-35)
- Conexión directa sin GainNode intermedio para mínima latencia
- Añadidos tests de audio para verificar el comportamiento
```

### Carpetas de build

**IMPORTANTE**: Cada flujo de build es independiente. `docs/` NUNCA es paso intermedio para Electron.

| Carpeta | Propósito | Comando |
|---------|-----------|---------|
| `docs/` | PWA web para GitHub Pages | `build:web` |
| `dist-app/` | App compilada para Electron | `build:electron:*` |
| `dist-electron/` | Instaladores (AppImage, exe) | `build:electron:*` |

Flujos:
- **Web**: `src/` → `docs/`
- **Electron**: `src/` → `dist-app/` → `dist-electron/`

## Comandos de Build

### Estructura de comandos

Los comandos siguen una nomenclatura consistente:
- `dev` / `dev:web` → Desarrollo rápido
- `build:web` → PWA web (`src/` → `docs/`)
- `build:electron:*` → Electron (`src/` → `dist-app/` → `dist-electron/`)
- Sufijo `:test` → Incluye ejecución de tests
- Sin sufijo → Sin tests (más rápido para desarrollo)

### Comandos de desarrollo (uso diario):

| Situación | Comando |
|-----------|---------|
| **Probar Electron** (OSC, IPC, etc.) | `npm run dev` |
| **Probar PWA web** | `npm run dev:web` |
| **Solo compilar traducciones** | `npm run build:i18n` |

> **Nota**: `build:i18n` se ejecuta automáticamente en todos los builds (es rápido).
> Solo usarlo manualmente si modificas traducciones y quieres verificar sin hacer build completo.

### Comandos de build (generar artefactos):

| Situación | Comando | Salida |
|-----------|---------|--------|
| **Build PWA web** (sin tests) | `npm run build:web` | `docs/` |
| **Build PWA web** (con tests) | `npm run build:web:test` | `docs/` |
| **Build Electron** (SO actual) | `npm run build:electron` | `dist-electron/` |
| **Build Electron Linux** | `npm run build:electron:linux` | `dist-electron/` |
| **Build Electron Windows** | `npm run build:electron:win` | `dist-electron/` |
| **Build todo + tests** | `npm run build:all` | `docs/` + `dist-electron/` |

### Regla general:
- **Desarrollo iterativo**: usar `dev` o `build:*` sin sufijo `:test`
- **Antes de commit/release**: usar comandos con `:test` o `build:all`

## Uso del terminal

Reglas para evitar que la sesión zsh se congele o deje de renderizar salida:

### ⚠️ Nunca usar strings multilínea en comandos de terminal
- **Prohibido**: `git commit -m "línea 1\nlínea 2"` o heredocs `<<EOF`
- Las comillas anidadas, saltos de línea y caracteres especiales rompen la sesión zsh
- **En su lugar**: escribir el mensaje a un archivo con `create_file` y luego usar `git commit -F archivo.txt`
- Después del commit, eliminar el archivo temporal: `rm archivo.txt`

### Comandos cortos y simples
- Mantener los comandos lo más breves posible
- Encadenar con `&&` solo comandos simples sin caracteres especiales
- Evitar escapes `\"`, `\n`, `$()` dentro de strings en el terminal

### Limitar terminales abiertos
- No acumular terminales — reutilizar los existentes
- Si el terminal no responde, **no insistir** — pedir al usuario que reinicie VS Code

## CHANGELOG

Cada cambio debe registrarse en `CHANGELOG.md` de forma clara y escueta. El changelog es crítico para el versionado.

### Reglas para actualizar CHANGELOG

1. **Revisar antes de añadir**: Siempre revisar la sección `Unreleased` para detectar cambios similares
   - Si ya existe una entrada relacionada, **unificar y actualizar** en lugar de duplicar
   - No debe haber múltiples líneas sobre la misma característica en Unreleased

2. **Estructura**: Mantener el formato semver (Added, Changed, Fixed, Deprecated, Removed, Security)
   - Agrupar cambios por tipo dentro de Unreleased
   - Usar puntos escuetos pero informativos

3. **Ejemplo de buena entrada**:
   ```
   - OSC: Prefijo almacenado sin barras para UI más clara, se formatean automáticamente en mensajes
   ```
   NO hacer:
   ```
   - OSC: Cambiar formato de prefijo
   - OSC: Prefijo sin barras en UI
   - OSC: Barras añadidas automáticamente
   ```

4. **Cuándo unificar**: Si hay cambios secuenciales de la misma característica, fusionarlos en una entrada que describe el estado final
