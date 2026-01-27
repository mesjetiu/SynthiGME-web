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
