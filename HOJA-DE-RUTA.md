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

- **1.1 hecho** (26-nov): recuadros de depuración del panel 4 fuera; su
  referencia visual, regenerada. Antes, la referencia de imagen se recapturó
  en `casa` (la de septiembre era de otra máquina y solo difería el
  suavizado del texto; ver `REVISION-VISUAL-2026-09.md`).
- **1.2, panel 2 hecho** (26-nov): cada módulo con `box: { x, y, w, h }` en
  px del panel; helper común en `src/assets/js/utils/panelBox.js` (con su
  test). Imagen idéntica en los siete paneles.
- De paso, arreglado un test inestable: los de `tests/worklets/` fallaban
  1 de cada 3 veces al reimportar el worklet en el mismo milisegundo.
- **1.2, panel 3 hecho** (26-nov): cada oscilador con su caja en
  `oscillatorSlots[].box`, y los ruidos y el aleatorio en
  `layout.<módulo>.box`; fuera `reflowOscillatorPanel` (el centrado en dos
  `requestAnimationFrame`) y la fila flex. Geometría idéntica (797
  elementos, ruta normalizada); los otros seis paneles, idénticos.
  - **Cómo se aplica la caja** (medido; está en `utils/panelBox.js`): el
    layout redondea a 1/64 px, así que cada eje va en `left/top` si la
    coordenada es exacta en esa rejilla (enteros, ,5, ,25…) y en
    `translate` si no (18,3). Con todo en `left/top` cambiaban 94.420
    píxeles; con todo en `translate`, los mandos de Noise 2 (x 174,5).
  - La imagen de referencia del panel 3 se regeneró: los mandos de la
    fila 5 (y 431,5, que antes venía de un `translate`) se pintan ahora
    ajustados a píxel, como cualquier caja de layout. 2,7 % de píxeles, nada
    movido, algo más nítidos. Ninguna regla reproducía la imagen vieja
    exacta, porque mezclaba los dos orígenes.
- **1.2, panel 7 hecho** (26-nov): joysticks y secuenciador con su caja
  en `layout.<módulo>.box`, y los 8 canales en `layout.outputChannels.boxes`
  (x 38,25 + n × 85,5; todas en la rejilla de 1/64 px, así que van en
  `left/top`). Fuera la columna flex anclada abajo con su `offset` (y 19) y
  su `padding`, `upperRow`, `lowerRow` y el `offset` por módulo; la Y de
  los joysticks ya no depende del alto de los canales.
  - `outputChannelsSection` se ha quitado: solo la usaba el montaje del
    panel 7. Los canales cuelgan de `#panel7Layout` como los demás
    módulos; `OutputChannelsPanel.createPanel(container, boxes)`.
  - Las variables `--oc-*` (medidas interiores de los canales) van ahora en
    cada canal, no en el contenedor: los interruptores del secuenciador
    usan las mismas clases y, con ellas en el contenedor, heredaban
    `--oc-button-scale: 0.85` (962 píxeles distintos). Con ellas en cada
    canal, imagen idéntica en los siete paneles.
  - `knobSize: 65` de los joysticks se queda, con su comentario: se ve a
    60 (no hay clase `knob--65`) y el test lo fija.
  - Geometría: los 303 elementos que quedan, en el mismo sitio (ruta
    normalizada); cambian `div.panel7-layout` → `#panel7Layout`, el
    contenedor pasa de y 19 a 0 y desaparecen la fila superior y
    `outputChannelsSection`. Se regenera la geometría del panel 7.
  - Ojo al comparar: los prefijos `kN_` de los SVG en línea se numeran por
    orden de llegada de las descargas, y en una de tres capturas llegaron
    en otro orden (paneles 1 y 3 «distintos» solo de ruta). Si pasa, volver
    a capturar o comparar normalizando `#k\d+_`.
- **Ahora, 1.2 matrices (5, 6)**, un panel por commit (en conversación nueva).

## Qué documento manda en cada cosa

| Pregunta | Documento |
|---|---|
| ¿Por dónde sigo? | este |
| ¿Está sano el código? | `AUDITORIA-2026-09.md` |
| ¿Qué le falta al instrumento? | `QUE-FALTA.md` |
| ¿Cómo se colocan los paneles? | `REVISION-VISUAL-2026-09.md` |
| Tareas sueltas y bugs | `TODO.md` |
| Cómo está hecho por dentro | `ARCHITECTURE.md` |
