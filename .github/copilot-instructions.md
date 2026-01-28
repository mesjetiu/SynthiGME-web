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
- `README.md` - Documentación principal
- `ARCHITECTURE.md` - Arquitectura del proyecto
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
- `docs/` → Solo para GitHub Pages (PWA web)
- `dist-app/` → Solo para Electron (no se sube a git)
- `dist-electron/` → Instaladores generados (no se sube a git)
