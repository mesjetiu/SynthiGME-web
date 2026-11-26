# Panel 7: los mandos calcados de la foto (noviembre 2026)

Notas del paso siguiente al fondo vectorial (`fondo_vectorial.md`): el asa
del fader de los canales, las teclas del secuenciador y el cuadrado del
secuenciador (interruptores y Clock Rate). Escritas mientras se hacía.

Todas las medidas en px del panel (760 = ancho de la foto,
`design/panels/Panel7/panel_7.jpg`, 2994 px: 3,94 px de foto por px).

## Método

- **Perfiles de oscuridad** por filas y columnas sobre la foto en gris, y
  **recortes ampliados con rejilla** (cada 2, 5 o 10 px del panel) para mirar
  a vista lo que el perfil no separa (sombras, reflejos).
- **Plantilla mediana** de lo que se repite: cada ejemplar recortado a 8 px
  por px del panel, alineado con el del medio por correlación (búsqueda de
  ±3 px en pasos de 0,25) y fundido con la mediana. Borra el desgaste y la
  suciedad de cada uno, pero no la perspectiva: la foto se hizo desde el
  centro del panel, y lo que sobresale se desplaza hacia fuera (las piezas
  de la izquierda enseñan su cara derecha y al revés).
- Por eso las piezas se **dibujan de frente y simétricas**, con las medidas
  de la plantilla, y son idénticas en los ocho sitios.
- Comprobación: la web capturada a 2× junto a la foto y superpuestas.

## Asa del fader (canales 1–8)

Plantilla de los canales 2–8 (el 1 no tiene asa: está roto). Todos los
faders de la foto están a cero.

| Medida | Valor |
|---|---|
| Canto de arriba del asa (a cero) | y 697,2 = la raya del 0 de la escala |
| Pie del asa | y 723,3 (la ranura acaba en 722,5) |
| Alto | 26,1 |
| Ancho de la silueta | 14 arriba, 24,6 abajo (trapecio) |
| Cara de delante | 10,8 arriba, 19,4 abajo; casi negra |
| Plaquita blanca | arriba de la cara, y 699,3–704,5, unos 9–12 de ancho |

- **El índice es el canto de arriba**, no el centro: a cero el canto cae en
  la raya del 0 y el pie llega justo al final de la ranura. Si fuera el
  centro, a cero asomaría ranura por debajo y a 10 el asa taparía LEVEL.
  Así que el recorrido es el de la escala, 113,5 px (583,7 → 697,2), y la
  ranura (585,9–722,5) es la escala más el alto del asa.
- La **plaquita blanca** la tienen los canales 2 y 7 (blanca limpia) y 4 y 5
  (gris, sucia); en el 3, el 6 y el 8 no está. Se ha dibujado, blanca: es lo
  que tienen las asas enteras y marca el índice.
- La pieza es un tronco de pirámide: cara de delante y cuatro faldas. De
  frente: falda izquierda a la luz (gris), derecha a la sombra, la de arriba
  como un canto gris de 1,6 px. Sombra sobre la chapa a la derecha y abajo,
  difuminada (en la foto es fuerte: el asa es alta).
- Dibujo: `design/panels/Panel7/generar_mandos.py` → `src/assets/panels/panel7_asa.svg`
  (36 × 30,1: el asa de 26,1 más el sitio de la sombra).

### Cómo lo pinta la web

El fader sigue siendo un `<input type=range>` vertical (teclado, foco,
accesibilidad y el código de arrastre de siempre), pero:

- **sin pista**: la ranura y la escala ya son del fondo;
- el **asa es la imagen del thumb** (`background` de
  `::-webkit-slider-thumb` y `::-moz-range-thumb`);
- va en su **sitio exacto**, fuera del flujo de los mandos de arriba:
  `position:absolute` con `--oc-fader-*` que calcula `faderVars`
  (`utils/panel7Geometry.js`) desde `outputChannelUI.fader` del blueprint. El
  input mide el recorrido más el alto del asa: el navegador lleva el thumb
  sin salirse, así que su borde de arriba va de la raya del 10 a la del 0.
- El clic que coge el asa (y no la ranura) se calculaba con el centro del
  thumb mal puesto (sin descontar su alto); ahora usa `faderThumbCenterY`.

**SVG como imagen de fondo, no SVG en línea ni CSS puro.** Una imagen de
fondo se rasteriza una vez (y otra al cambiar de zoom) y luego solo se
compone: mover el fader no repinta nada, y el desenfoque de la sombra es un
filtro dentro de la imagen, no un `filter` de CSS (que sí cuesta en móvil,
`MOBILE-RESEARCH.md`). Con CSS puro (degradados y `clip-path`) no salen las
faldas en trapecio con la fidelidad de la foto, y un SVG en línea movido por
JS obligaría a rehacer el arrastre que ya da el input.

## Secuenciador: interruptores y Clock Rate

La hoja de ruta los daba por cuadrados, pero con el fondo vectorial se veía
que no (`fondo_vectorial.md`, «Lo que no cuadra»). Medido de nuevo:

| Mando | Antes, en la web | En la foto |
|---|---|---|
| 8 interruptores | tuerca de 10 px en (277,6 + 29,25·i, 167) | tuerca de ~13 px en (269,3 + 31,43·i, 152,5) |
| Clock Rate | vernier de 30 px en (380, 236), encima de RESET SEQUENCE | dial de 55 px en (380, 289,5), a la derecha de CLOCK RATE |

- **Tuercas**: el centro, a vista con rejilla (el centroide de la oscuridad
  se va 2 px a la derecha por la sombra). x = la columna del secuenciador
  (+0,5 como mucho), y 152,5 (tuerca de 146 a 159,5). Las palancas de la foto
  están en posiciones distintas; da igual, la tuerca no se mueve.
- El dibujo del interruptor (`toggle-switch.svg`) es tan ancho como su
  tuerca: caja de 13 × 23,25 (su proporción, 104 × 186).
- **Clock Rate**: borde izquierdo del faldón cromado en x 352,4 (el derecho
  se pierde en la sombra), borde de abajo en ≈ 317 (319 con sombra); con el
  centro en el eje del secuenciador (380), radio 27,6: dial de 55 px con
  centro (380, 289,5). Lo de arriba del dial sale más alto en la foto
  porque sobresale y la cámara está más abajo.
- El dial es el vernier de la web (el mismo de otros paneles), solo que a su
  tamaño; su dibujo no se ha tocado.

### Cómo se colocan

Antes, filas flex con huecos y desplazamientos a ojo; ahora cada mando en su
caja absoluta, medida: `layout.sequencer` del blueprint da las columnas
(las mismas del fondo, `COL_SEQ` de `generar_panel7.py`), la fila de
interruptores (centro de la tuerca), la de teclas y el dial (centro y
diámetro). `sequencerPlacement` (`utils/panel7Geometry.js`) saca la caja de
cada uno y `placeInModule` la pone como `--p7-x/y/w/h` relativas al módulo
(clase `.p7-placed`; el CSS descuenta el borde del marco,
`--synth-module-border-width`).

## Teclas del secuenciador

Plantilla mediana de las 8 teclas, a las columnas del secuenciador: teclas
grises de máquina de escribir, de 28 px de ancho centradas en su columna (los
bordes izquierdos, con luz, caen a ±1 px de columna − 14).

- **De frente, cuadradas** (Carlos, 26-nov: «miden igual de altos que de
  anchos… de frente se verían como chocolate»). En la foto la cámara está
  más abajo y al centro: el plato se va hacia arriba (y 204–223), la falda de
  delante parece grande y las de los lados cambian según la tecla. De frente
  se ve el pie (27,5 de lado) con la cara de arriba en el centro y las cuatro
  faldas iguales.
- **Dónde**: lo que no se mueve con la perspectiva es el pie, apoyado en la
  chapa: abajo en y 237,3 y 27,5 de ancho. La tecla va de 209,8 a 237,3,
  centrada en su columna; entre tecla y tecla quedan 3,9 px.
- **El hueco del teclado** es del fondo: entre las teclas, y bajo ellas
  hasta la regleta, se ve oscuro de y 215 a 241 en los siete huecos
  (`generar_panel7.py`, rectángulo de 255 a 505,5).
- **Dibujo** (`panel7_tecla.svg`, 27,5 × 27,5): cara de arriba de 18 px con
  un canto plano de 0,8 y el plato cóncavo dentro (radio 4,5); faldas a la
  luz arriba y a la izquierda, a la sombra a la derecha y abajo. Grises de la
  plantilla (plato #82…#71, faldas #9a…#3b en la foto), algo aclarados porque
  la chapa de la web es más clara que la de la foto.
- **Pulsada** (`panel7_tecla_pulsada.svg`): más a la sombra y con la cara un
  poco más pequeña, como si bajara. El CSS la pide ya a tamaño 0 para que no
  parpadee la primera vez.
- Como el asa: imagen de fondo del `<button>`, sin filtros de CSS.
