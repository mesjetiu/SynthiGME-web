# Panel 7: fondo vectorial (noviembre 2026)

Notas del paso 1.4 de la hoja de ruta (fondos vectoriales), escritas mientras
se hacía. El dibujo está en `design/panels/Panel7/panel7_source.svg`, lo
genera `design/panels/Panel7/generar_panel7.py` y la web usa la versión
optimizada, `src/assets/panels/panel7_bg.svg`.

## Cómo carga la web los fondos

- **Vectoriales (paneles 3, 5, 6 y ahora 7):** `app.js` llama a
  `injectInlinePanelSvgBackground(panelId, url)` (`utils/canvasBackground.js`):
  baja el SVG con `fetch` y lo mete **en línea** en un
  `<div class="panel-inline-bg">`, primer hijo del panel, al 100 % de ancho y
  alto. El CSS (`main.css`) lo pone en `position: absolute; inset: 0;
  z-index: 0` y los mandos van encima (en el panel 7, `#panel7Layout` tiene
  `z-index: 1`).
  - En línea, y no como `<img>`, por dos razones: nitidez al hacer zoom (el
    navegador lo vuelve a rasterizar a cada escala) y porque así el texto usa
    las **fuentes de la página** (`@font-face` de Microgramma en `main.css`).
    Un SVG en `<img>` no ve las fuentes de la página.
  - Al ir en línea, su `<style>` y sus `id` son globales en el documento: por
    eso `optimize-svg.mjs` pone a las clases un prefijo por panel (`p7c…`) y
    los `id` del dibujo empiezan por `p7-`.
  - `optimize-svg.mjs` quita `xmlns:xlink`: los clones van con `href` a secas
    (SVG 2), que entienden el navegador e Inkscape.
- **Fotos (paneles 1, 2, 4; antes también el 7):** `setPanelImageBackground`
  pone la foto como `background-image` del panel, estirada al 100 %. Es lo
  provisional: se borra la línea al pasar el panel a vectorial.
- **Modo canvas** (móvil o modo rendimiento): `CANVAS_BG_SVG_BY_PANEL` está
  vacío, así que no interviene; el panel 7 ni siquiera está en su lista.
- El service worker (`src/sw.js`) precachea cada fondo: `panel7_bg.svg` está
  en `CORE_ASSETS`.

## Qué va en el fondo y qué no

Criterio sacado del panel 3 (el SVG de Carlos, renderizado sin mandos): el
fondo lleva **lo serigrafiado en la chapa** (marcos, rótulos, flechas, los
▼ que señalan el cero de cada mando, escalas que no son del mando) y no lleva
nada que pinte un mando de la web.

| En el fondo | Lo pinta la web (no se dibuja) |
|---|---|
| Marco general y separadores (joysticks, secuenciador, 8 canales) | Mandos con su escala transparente (`knob-ring*.png`) |
| Placa SYNTHI 100 | Pads de los joysticks |
| Barras negras con el título calado (máscara, como el panel 3) | Interruptores y botones del secuenciador, dial Clock Rate |
| RANGE ↕ / RANGE ↔ con su ▼ | Interruptor ON/OFF de cada canal |
| Rótulos del secuenciador y sus tres regletas | Fader (ranura con pista y cursor) |
| FILTER, PAN, ▼, flechas curvas, low/high, left/right, OFF, LEVEL | |
| Escala serigrafiada del fader (0–10 a los dos lados) y su ranura | |
| Tornillos y pilotos (no tienen mando en la web) | |

Lo que **no** se ha calcado, a propósito: las letras escritas a mano junto a
los pilotos de los canales 3–8 (D, E, F, G…), el desgaste, las teclas del
secuenciador y los cuerpos de los mandos.

## Tipos de letra de la foto

Comparados letra a letra con `design/fonts/` (muestras renderizadas con cada
fuente al lado de recortes de la foto):

| Texto | Fuente | Cómo va en el SVG |
|---|---|---|
| SYNTHI 100 | Microgramma D Extended **Bold**, engordada 0,9 px (la serigrafía es más gruesa) | `<text>` |
| ELECTRONIC MUSIC STUDIOS (LONDON) LTD | Microgramma D Extended **Medium**, muy espaciada, palabra a palabra | `<text>` |
| SEQUENCER OPERATIONAL CONTROL, OUTPUT CH.n | Microgramma Bold, calada en barra negra | `<text>` en máscara |
| RANGE, FILTER, PAN, OFF, números del fader | Microgramma Bold | `<text>` |
| low, high, left, right | minúsculas de Microgramma Bold (son las de Eurostile Extended) | `<text>` |
| LEVEL, CLOCK, RATE | Microgramma Medium | `<text>` |
| Rótulos grabados del secuenciador (RECORD WHEN DOWN, MASTER RESET, KEY 1…) | **No es Microgramma**: palo seco redonda, estrecha y gruesa, de grabado. Lo más cercano: **Univers 55 estrechada ×0,87 y engordada** con un trazo de 0,42 px. B, D, F, más grandes y finas | **trazos** (`<path>`): la web no carga Univers |

Eurostile normal y Bold se descartaron para los grabados: sus O y C son
cuadradas y en la foto son redondas.

## Medidas (px del panel, 760 = ancho de la foto)

Cómo se midió: perfiles de oscuridad de la foto (`tests/visual/lineas.py` y
perfiles por franjas), recortes ampliados con rejilla y, para el canal, una
**plantilla promediada**: los 8 canales de la foto recortados a paso 85,5 px,
alineados por correlación (desvíos de −0,25 a +0,5 px en x y de −0,4 a +1 px
en y) y fundidos con la mediana, que borra el desgaste de cada uno. Después,
superposición dibujo/foto y comparación de bordes de tinta elemento a
elemento (mediana de los 8 canales): casi todo a menos de 1 px.

- **Marco:** verticales x 37,45 y 720,9; horizontales y 88,9 (en la foto, de
  87,6 a 89,9: la chapa está algo combada) y 752,8; línea sobre los canales
  y 331,0 (3 px de grueso); joysticks/secuenciador x 252,6 y 506,5.
- **Canales:** eje del canal 1 en x 80,75 (el de los mandos de la web) y paso
  85,5 px, el mismo de `layout.outputChannels.boxes`. Separadores en
  38 + 85,5·k (en la foto, a ±1,4 px de eso). Escala del fader: 10 en y 583,7
  y 0 en 697,2 (paso 11,35); números a ±16,65 del eje; ranura de y 585,9 a
  722,5, 4,5 de ancho. Piloto y 566,7; tornillo y 740,6.
- **Joysticks:** el derecho es el izquierdo desplazado 582 px (lo que separa
  sus mandos en la web, 89 → 671); en la foto los rótulos coinciden a
  ±1 px con ese desplazamiento.
- **Logo:** marco con laterales de 6–7 px y horizontales de 2–2,6;
  SYNTHI de x 375 a 579 y 100 de 603 a 700, altura de mayúscula 26.
- **Secuenciador:** columnas en x = 269,3 + 31,43·i; regletas y 118–137,5,
  176–196 y 241–261; la de abajo está torcida (1,5 px más alta a la derecha)
  y se ha calcado así.

## Lo que no cuadra (para decidir; no se ha tocado)

La hoja de ruta daba los mandos del panel 7 por cuadrados con la foto. Con el
fondo dibujado se ve que **el secuenciador no lo está** (con la foto pasaba
más desapercibido):

| Mando | En la web | En la foto |
|---|---|---|
| 8 interruptores | x 277,6 + 29,25·i, y 167 | x ≈ 268,5 … 489 (paso ~31,5), tuerca en y ≈ 151 |
| 8 botones (24 px, redondos) | x 278,1 + 29,1·i, y 201 | teclas de ~27 px, x ≈ 269,5 … 490, y ≈ 205–237 (centro 221) |
| Clock Rate (vernier de 30 px) | (380, 236), encima de RESET SEQUENCE | dial de ~54 px con centro ≈ (380, 290), a la derecha de CLOCK RATE |

Y en los canales, el fader de la web (pista de y 579 a 704, carcasa de 574 a
709) es más corto que la ranura real (585,9–722,5) y su carcasa tapa LEVEL y
la raya del 10; por debajo asoma el final de la ranura.
