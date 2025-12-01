# Pendiente / En progreso / Hecho

## Pendiente
- [ ] Implementar OutputRouter multicanal: mover la lógica de buses y paneo al módulo OutputRouter, exponer entradas maestras N en AudioEngine (OUTPUT_CHANNELS configurable, por defecto 8) y mapear por defecto los dos primeros masters a la salida estéreo del navegador.
- [ ] Detectar soporte Web Audio y mostrar error/fallback si no está disponible. Implementar en src/assets/js/core/engine.js -> AudioEngine.start().
- [ ] Manejar estado "suspended" en iOS: reanudar audioCtx (audioCtx.resume()) tras interacción del usuario (App.ensureAudio / handlers que llaman engine.start()).
- [ ] ☐

## En progreso
- [ ] ☐

## Hecho
- [ ] ☐