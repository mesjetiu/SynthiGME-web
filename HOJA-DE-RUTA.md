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
| 1 Filtros, envolventes, ring mod, reverb, eco | foto | **descuadrados** en `main`; cuadrados en la rama `panel1-cuadrar`, a falta del ok | vectorial |
| 2 Osciloscopio, frecuencímetro, octavas, entradas | foto | cuadrados | vectorial; osciloscopio con mandos provisionales; envíos sin widget |
| 3 Osciladores, ruido, aleatorio | **vectorial** | cuadrados | nada |
| 4 Voltímetros, teclado, secuenciador, slew… | foto | **descuadrados** en `main`; cuadrados en la rama `panel4-cuadrar`, a falta del ok | vectorial |
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
- **1.2, matrices (5 y 6) hechas** (26-nov): en una matriz la «caja» es el
  **marco** (`.matrix-container`) donde se encaja la tabla de pines:
  `ui.box` en el blueprint de cada panel. Lo de dentro no cambia y **no se
  ha movido ni un pin**: la tabla llena el ancho del marco y `resizeToFit`
  la escala por el alto (0,999 × alto / 756). Paso medido: 9,11 × 9,67 px
  (panel 5) y 9,10 × 9,66 px (panel 6).
  - Las cajas son los valores que daba el marco viejo en «pasos»
    (`squarePercent`, `translateSteps`, `marginsSteps`, `overflowPercent`,
    `maxSizePercent`, `clip`), tal como los redondeaba el navegador a
    1/64 px; por eso van en `left/top` y el layout es el mismo al bit.
    Panel 5: x 12,71875, y 85,578125, w 779,65625, h 609,640625 (más ancho
    que el panel: la rejilla visible, centrada, mide 628). Panel 6:
    x 14,515625, y 85,96875, w 758,515625, h 609,46875.
  - `referenceSteps: 67` no lo leía nadie (`_normalizeFrame` lo descartaba):
    el panel 5 se calculaba con 69 pasos. Corregido en
    `REVISION-VISUAL-2026-09.md`.
  - Fuera también el marco de reserva de `panelAssembler.js` (valores
    viejos) y el «modo ajuste» (`matrix-adjust`, que nunca se activaba).
  - Imagen y geometría idénticas en los siete paneles: no se regenera nada.
  - Lo que queda de rareza, a propósito: el paso de pin sigue saliendo de
    la combinación ancho/alto del marco y de la celda de 12 px. Describir
    la rejilla por origen y paso (o casilla a casilla del SVG) movería los
    pines y la decisión es dejarlas como están.
- **1.3, panel 4, paso 1 hecho** (26-nov): los 23 módulos en cajas
  (`layout.<módulo>.box`, voltímetros en `layout.voltmeters.boxes`); fuera
  el árbol flex (padding, gap, fila de logo vacía, `voltmetersRow`,
  `keyboardOutputRange` con columnas, secciones y filas). Imagen idéntica
  en los siete paneles; geometría del panel 4 regenerada (solo
  desaparecen los 8 contenedores flex). Test nuevo del blueprint.
  - Una captura de `visual:compare` dio el panel 1 distinto al 99,95 %
    sin haberlo tocado (el fondo no llegó a tiempo); la siguiente, igual.
    Si un panel sale distinto casi entero, recapturar antes de mirar.
- **1.3, panel 4, paso 2: hecho y esperando el ok de Carlos**, en la rama
  `panel4-cuadrar` (un commit, ya subido; `main` sin tocar). Capturas
  antes/después, la foto y las medidas:
  <http://100.119.152.45:8080/synthigme-panel4/index.html>.
  - Cómo se midió: cajas = marcos serigrafiados, detectados como líneas
    oscuras largas (`tests/visual/lineas.py`); mandos con su centro
    `{ x, y }` relativo a la caja, x en el eje de la columna e y en el
    centro de la escala transparente (las dos en el plano del panel; el
    capuchón sobresale y en la foto sale corrido por la paralaje).
  - Lo que se le pregunta a Carlos con la entrega: (a) los capuchones de
    color de la foto asoman por debajo de los nuestros; se pueden tapar
    bajando los mandos ~5 px, a costa de descuadrar la escala; (b) en la
    foto **Offset** del Invertor/Buffer tiene capuchón **azul** y el
    blueprint lo tiene blanco; (c) las etiquetas On/Kbd del selector se
    han ocultado porque están serigrafiadas.
  - **Al recibir el ok:** `git checkout panel4-cuadrar && git rebase
    main`, `npm run visual:capture` y copiar `panel-4.png` y
    `panel-4.geom.json` de `tests/visual/current/` a `baseline/`,
    `npm run visual:compare` en verde, `git commit --amend` (quitar del
    mensaje la línea de «pendiente»), y a `main` con `merge --ff-only`;
    borrar la rama aquí y en origin. Si pide cambios, se hacen en la rama.
  - Arreglado de paso: `signalFlowHighlighter.js` buscaba el marco del PVC
    como `.panel4-pitchToVoltageConverter` (la clase es
    `.panel4-pitchVoltageConverter`). No se notaba, porque el marco también
    es `.synth-module` y lo encontraba por ahí; queda fijado con un test.
- **1.3, panel 1, paso 1 hecho** (26-nov): los 16 módulos en cajas, por
  id de módulo (`layout.filters.boxes`, `envelopeShapers.boxes`,
  `ringModulators.boxes`, `reverberation.box`, `echo.box`); fuera la
  columna flex con su `offset` y 40, el padding, las filas y sus anchos y
  gaps. Todas las cajas enteras, en `left/top`. Imagen idéntica en los
  siete paneles; geometría del panel 1 regenerada (solo cambia el
  contenedor, de y 40 a 0, y desaparecen las dos filas flex).
  - Arreglado el error conocido: filtros, moduladores de anillo y reverb
    ya no reciben `offset` (lo aplicaban como `transform` y el ensamblador
    lo borraba). Las envolventes ya no se ponen `position: relative`
    encima de su caja.
- **1.3, panel 1, paso 2: hecho y esperando el ok de Carlos**, en la rama
  `panel1-cuadrar` (un commit, ya subido; `main` sin tocar). Capturas
  antes/después a 2×, la foto y las medidas, en la carpeta de entregas
  (`synthigme-panel1/`, con un `index.html` para alternarlas).
  - Cómo se midió: marcos con `lineas.py` y perfiles de oscuridad por
    franjas (la foto está girada ~0,4°: en las fronteras que cruzan el
    panel la caja va por la media de la línea, para que no se solapen);
    mandos por la flecha ▼ serigrafiada encima de cada uno (x de la flecha;
    y = base de la flecha + 38,9, calibrado a vista en cuatro mandos);
    selector de modo, gate y LED, a vista.
  - En la rama, la capa de mandos y la colocación por el centro pasan a
    `utils/panelBox.js` (`createControlsLayer`, `placeAtCenter`). La rama
    del panel 4 tiene su propia copia local (`placeControl`): al llevar
    las dos a `main`, que el panel 4 use las de `panelBox.js`.
  - Lo que se le pregunta a Carlos: (a) como en el panel 4, los capuchones
    de la foto asoman junto a los nuestros por la paralaje; (b) nuestro
    botón de gate (16 px, con «GATE» dentro) tapa el botón negro de la
    foto (~20 px) y la palabra GATE ya está serigrafiada al lado.
  - **Al recibir el ok:** igual que en el panel 4, con `panel-1.png` y
    `panel-1.geom.json`: `git checkout panel1-cuadrar && git rebase main`,
    `npm run visual:capture`, copiar los dos de `tests/visual/current/` a
    `baseline/`, `npm run visual:compare` en verde, `git commit --amend`
    (quitar del mensaje la línea de «pendiente»), a `main` con
    `merge --ff-only` y borrar la rama aquí y en origin.
- **Plan de 1.3 (paneles 4 y 1):**
  1. **Panel 4, migración sin cambio visible.** Como en 2, 3 y 7: medir en
     `tests/visual/baseline/panel-4.geom.json` la caja efectiva de cada
     módulo (voltímetros, teclados, secuenciador, slew, inversor…), pasar
     el árbol flex (`logoArea`, `voltmetersRow`, `flex`, `gap`, `padding`,
     `offset`) a `box: { x, y, w, h }` y dejar `visual:compare` idéntico.
     Un commit.
  2. **Panel 4, cuadrar sobre la foto.** Una página de ajuste (en
     `tests/visual/`, no en la web) que pinte las cajas encima del fondo
     y deje leer coordenadas; medir cada módulo contra la foto y escribir
     las cajas nuevas. Aquí sí cambia la imagen: se regenera la referencia
     del panel 4 en el mismo commit, con capturas antes/después en
     `~/Entregas` para que Carlos lo juzgue. Al acabar, `showFrames: false`.
  3. **Panel 1, los mismos dos pasos.** Ojo con el error ya conocido:
     filtros, moduladores de anillo y reverb reciben `offset` y el
     ensamblador lo borra al reescribir `el.style.cssText`; con cajas
     desaparece. El gate y el LED, que van en px dentro del marco, pasan a
     posición relativa a la caja de su módulo.
  4. Dentro de cada módulo, los mandos con su posición relativa a la caja
     (adiós `space-evenly`), solo donde haga falta para cuadrar.

## Qué documento manda en cada cosa

| Pregunta | Documento |
|---|---|
| ¿Por dónde sigo? | este |
| ¿Está sano el código? | `AUDITORIA-2026-09.md` |
| ¿Qué le falta al instrumento? | `QUE-FALTA.md` |
| ¿Cómo se colocan los paneles? | `REVISION-VISUAL-2026-09.md` |
| Tareas sueltas y bugs | `TODO.md` |
| Cómo está hecho por dentro | `ARCHITECTURE.md` |
