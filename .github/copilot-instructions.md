# Instrucciones para GitHub Copilot

## Estructura del Proyecto

### ⚠️ Carpeta `docs/` - NO MODIFICAR MANUALMENTE

La carpeta `docs/` es **generada automáticamente** por el proceso de build (`npm run build`).
Se usa exclusivamente para servir la PWA en GitHub Pages.

**NUNCA**:
- Crear archivos manualmente en `docs/`
- Editar archivos en `docs/`
- Poner documentación en `docs/`

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
- `docs/` → PWA web para GitHub Pages
- `dist-app/` → App web compilada para Electron (no se sube a git)
- `dist-electron/` → Instaladores generados (no se sube a git)

## Comandos de Build

### Estructura de comandos

Los comandos siguen una nomenclatura consistente:
- `dev` / `dev:web` → Desarrollo rápido (sin instaladores)
- `build:web` → PWA web (genera docs/)
- `build:electron` → App Electron (genera dist-electron/)
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

| Situación | Comando |
|-----------|---------|
| **Build PWA web** (sin tests) | `npm run build:web` |
| **Build PWA web** (con tests) | `npm run build:web:test` |
| **Build Electron** (sin tests) | `npm run build:electron` |
| **Build Electron Linux** | `npm run build:electron:linux` |
| **Build Electron Windows** | `npm run build:electron:win` |
| **Build todo + tests** | `npm run build:all` |

### Regla general:
- **Desarrollo iterativo**: usar `dev` o `build:*` sin sufijo `:test`
- **Antes de commit/release**: usar comandos con `:test` o `build:all`

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
