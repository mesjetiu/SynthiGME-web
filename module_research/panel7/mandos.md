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
