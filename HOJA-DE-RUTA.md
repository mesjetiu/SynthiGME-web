# Hoja de ruta (26-nov-2026)

Documento de entrada: dónde está el proyecto y en qué orden se sigue. El
detalle vive en los documentos que se citan; aquí solo el mapa.

## Dónde estamos

- **Historia.** Noviembre 2025 – marzo 2026: unos 1.570 commits y la release
  **v0.8.0** (16-mar). Los días 18-19 de marzo, ya sin release: el refactor de
  `app.js` y el banco de filtros de octava. Julio y septiembre: solo
  auditoría, tests y documentación. Desde el 22-sep, nada.
- **Código.** Sano: en septiembre pasaban 4.778 tests unitarios y 218 de
  audio en navegador real, sin tests «espejo». Ver `AUDITORIA-2026-09.md`.
- **Sonido.** Funcionan: 12 osciladores, 8 filtros, 3 moduladores de anillo,
  3 envolventes, 2 ruidos, voltaje aleatorio, reverb, banco de octavas,
  convertidor de altura a voltaje, 2 teclados, 2 joysticks, secuenciador,
  8 entradas, 8 salidas con voltímetros, osciloscopio y las dos matrices.
- **Sin sonido** (dibujados o ni eso): eco A.D.L., segunda reverb, 3 slew
  limiters, 2 envelope followers, inversor/buffer y «Option 1» del panel 4,
  envíos y retornos externos, frecuencímetro. Ver `QUE-FALTA.md`.

## Estado visual, panel a panel

| Panel | Fondo | Mandos sobre el fondo | Falta |
|---|---|---|---|
| 1 Filtros, envolventes, ring mod, reverb, eco | foto | **descuadrados** | cuadrar y vectorial |
| 2 Osciloscopio, frecuencímetro, octavas, entradas | foto | cuadrados | vectorial; osciloscopio con mandos provisionales; envíos sin widget |
| 3 Osciladores, ruido, aleatorio | **vectorial** | cuadrados | nada |
| 4 Voltímetros, teclado, secuenciador, slew… | foto | **muy descuadrados**, con recuadros de depuración a la vista | cuadrar y vectorial |
| 5 Matriz de audio | **vectorial** | pines a <1 px | nada |
| 6 Matriz de control | **vectorial** | pines a <1 px | nada |
| 7 Joysticks, secuenciador, salidas | foto | cuadrados | vectorial |
| Teclados | **vectorial** | — | nada |

No falta ninguna fotografía. Faltan cuatro vectoriales (1, 2, 4, 7) y cuadrar
dos paneles (1 y 4). El porqué de que cuadrar costase tanto (cinco modelos de
layout distintos) y la solución están en `REVISION-VISUAL-2026-09.md`.

## Lo que nadie ha tocado con las manos

Todo lo del último mes de desarrollo (3–19 de marzo) tiene tests pero no uso
real: **secuenciador**, teclados y MIDI, filtros, moduladores de anillo,
envolventes, convertidor de altura, voltímetros, banco de octavas. Y los dos
arreglos de septiembre (osciloscopio al reiniciar, menús en móvil) siguen
pendientes de verse en un navegador.

## Orden propuesto

1. **Visual.** Es lo que menos falta y lo más visible.
   1. Quitar los recuadros de depuración del panel 4 (se ven en la web publicada).
   2. Un solo modelo de coordenadas (cajas absolutas sobre la imagen), panel a
      panel, con `npm run visual:compare` en verde: 2, 3, 7, y las matrices.
   3. Cuadrar los paneles 4 y 1 midiendo sobre la foto.
   4. Vectoriales de 7, 2, 4 y 1, en ese orden (de menos a más trabajo).
2. **Prueba guiada.** Una hoja de comprobación por módulo, empezando por el
   secuenciador: qué pinchar, qué debe sonar. Lo que falle se arregla y queda
   fijado con un test.
3. **Módulos que faltan.** Eco; slew limiters y envelope followers; segunda
   reverb; envíos externos; frecuencímetro.
4. **Plataforma y release 0.9.** Micrófono e importar patches en Android,
   rendimiento, dependencias.

## Decisiones tomadas (26-nov-2026)

- **Fondos: solo vectoriales.** Las fotos de 1, 2, 4 y 7 se retiran de la web
  cuando su vectorial esté hecho; quedan en `design/` como referencia.
- **Matrices: como están.** No se recolocan los pines.
- **Orden: el de arriba**, empezando por lo visual.

## Siguiente paso

1.1: `debugBorder` de los voltímetros del panel 4 a `false`, regenerando la
referencia visual de ese panel en el mismo commit. Después, 1.2.

## Qué documento manda en cada cosa

| Pregunta | Documento |
|---|---|
| ¿Por dónde sigo? | este |
| ¿Está sano el código? | `AUDITORIA-2026-09.md` |
| ¿Qué le falta al instrumento? | `QUE-FALTA.md` |
| ¿Cómo se colocan los paneles? | `REVISION-VISUAL-2026-09.md` |
| Tareas sueltas y bugs | `TODO.md` |
| Cómo está hecho por dentro | `ARCHITECTURE.md` |
