# Pendiente / En progreso / Hecho

## Pendiente
  - [ ] Implementar OutputRouter multicanal: mover la lógica de buses y paneo al módulo OutputRouter, exponer entradas maestras N en AudioEngine (OUTPUT_CHANNELS configurable, por defecto 8) y mapear los buses lógicos a canales físicos.
  - [ ] Detectar soporte Web Audio y mostrar error/fallback si no está disponible. Implementar en src/assets/js/core/engine.js -> AudioEngine.start().
  - [ ] Manejar estado "suspended" en iOS: reanudar audioCtx (audioCtx.resume()) tras interacción del usuario (App.ensureAudio / handlers que llaman engine.start()).
- [ ] Versionado, Documentación, Traducción
  - [ ] Definir y documentar la estrategia de versionado y publicación (relación rama main ↔ compilación en /docs).
  - [ ] Documentado del código in situ.
  - [ ] Preparar para multidioma.
## En progreso
- [ ] ☐

## Hecho
- [x] Elegir y documentar la licencia del proyecto (archivo LICENSE y mención en README.md).
