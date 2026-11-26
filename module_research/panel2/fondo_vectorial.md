# Panel 2: fondo vectorial (noviembre 2026)

Notas del paso 1.4 de la hoja de ruta (fondos vectoriales). Es el segundo
panel que se pasa a vectorial, después del 7, y por el mismo método
(`module_research/panel7/fondo_vectorial.md`). El dibujo está en
`design/panels/Panel2/panel2_source.svg`. Lo genera
`design/panels/Panel2/generar_panel2.py`, y la web usa la versión optimizada,
`src/assets/panels/panel2_bg.svg` (131 KB; el fuente, 311 KB).

## Piezas comunes

Al ser el segundo panel, lo que se repetía con el 7 pasó a
`design/panels/piezas_svg.py`, y ahora lo usan los dos generadores. El SVG del 7
sale idéntico byte a byte (107 137 bytes).

| Pieza | Qué hace |
|---|---|
| `Fuente`, `fuente()`, `MG_BOLD`, `MG_MEDIUM`, `UNIVERS` | Medidas de tinta y trazos con fontTools |
| `texto()` | Microgramma como `<text>` |
| `trazos()` | Cualquier otra fuente, como `<path>` |
| `grabado()` | Rótulo grabado del secuenciador del 7 (Univers a trazos) |
| `rect`, `linea`, `polilinea`, `arco`, `capa` | Primitivas |
| `triangulo`, `punta`, `flecha_recta`, `flecha_curva` | Flechas y ▼ |
| `degradado_tornillo`, `tornillo` | El id del degradado lleva el prefijo del panel |
| `barra_titulo()` | Barra negra con el título calado. Con `palabras=[(palabra, x0, x1)…]` coloca cada palabra donde está en la foto |
| `documento()` | Cabecera del SVG con capas de Inkscape |

## Cómo se midió

Las medidas se tomaron con scripts de recorte sobre la foto, en px del panel (760 = ancho de
`design/panels/Panel2/panel_2.jpg`, 2609 px: 3,43 px de foto por px):

| Herramienta | Qué saca |
|---|---|
| Rejilla | Un recorte ampliado con una rejilla cada 1 o 5 px del panel |
| Grupos de tinta | Cajas de la tinta en una franja: palabras, ▼, números. Con un umbral de gris y un hueco máximo entre letras |
| Mezcla | La foto, el dibujo y los dos superpuestos, uno encima de otro |

El dibujo se renderiza con Chromium y las fuentes de la web. La mezcla es lo
que manda: cada rótulo se corrigió hasta que la superposición no dejaba
fantasma.

**Lección:** las posiciones leídas a ojo en un recorte sin rejilla salieron con
errores de hasta 9 px. Siempre con rejilla o midiendo la tinta.

La foto está girada unos **0,13°**: las horizontales suben ~1,5 px de izquierda
a derecha y las verticales se desplazan ~0,9 px. Las líneas del marco van por su
media.

## Tipos de letra de la foto

Cada fuente se comparó letra a letra con recortes de la foto (muestras
renderizadas con cada candidata al lado).

| Dónde | Letra | Cómo va |
|---|---|---|
| Barras de título del Synthi (OCTAVE FILTER BANK, INPUT AMPLIFIER LEVEL, EXTERNAL TREATMENT DEVICES) | Microgramma Bold | `<text>` calado en la barra |
| Rótulos de las filas de mandos (frecuencias, CHANNEL n, números, SEND / RETURN LEVEL, BAND PASS…) | Más fina que la Bold y algo más gruesa que la Medium: **Medium engordada** con un trazo de 0,22 px del mismo color | `<text>` |
| Frecuencímetro (FREQUENCY - COUNTER - TIMER, FUNCTION, RANGE…) | Microgramma Medium. El 1 está serigrafiado como una I: «IOHZ», «·IS», «IKHZ» | `<text>` |
| Gould OS300 | Una palo seco tipo Helvetica; la más cercana en `design/fonts/` es Univers 55 | Trazos (la web no la carga) |
| Logotipo GOULD | Eurostile Bold | Trazos |
| Ω del osciloscopio | Univers no la tiene: Eurostile | Trazos |

Con las letras apretadas como en la foto, el espacio de la Microgramma se queda
corto: los rótulos de varias palabras (FREQUENCY RATIO, TIME INTERVAL…) se
colocan palabra a palabra, cada una con su caja medida.

## ¿Cuadran los mandos de la web con la foto?

Se comprobó antes de dibujar, porque en el 7 no cuadraban del todo.

- Las tres filas de ocho (banco de octavas, entradas y envíos/retornos) tienen
  los ▼ de la foto en 52,6 + 93,47·k. Los mandos de la web están en
  52,75 + 93,5·k (caja x 8, ancho 744; mando 65 y hueco 28,5). Diferencia en x:
  **±0,5 px**. En y, ~1,5 px. **Cuadran: no se ha movido ningún mando.**
- Del vértice del ▼ al centro del mando hay 31,8 px en el banco de octavas
  (centro 525,5) y 34,3 px en las entradas (centro 618,5). En los envíos, el
  anillo de la foto está en 711,2–711,5.
- El ▼ de cada fila es uno dibujado y siete clones al paso de 93,5 px, como los
  canales del 7. El test lo ata al blueprint.

## Qué va en el fondo y qué no

| En el fondo | Lo pinta la web |
|---|---|
| Marco y separadores, barras de título, rótulos, ▼ | Los mandos del banco de octavas, las entradas y los envíos/retornos |
| Frecuencímetro: ventana roja con sus 8 cifras apagadas, rótulos y guías de FUNCTION y RANGE, BNC de RATIO/INPUT, tornillos | Selectores FUNCTION y RANGE (inertes) |
| Osciloscopio: caja, bisel, capucha, chapa con sus zonas de color, todo lo serigrafiado (escalas de VOLTS/CM y TIME/CM incluidas) | El haz, en el canvas transparente encima de la pantalla |
| La retícula de la pantalla (10 × 8 divisiones de 17,1 px, subdivisiones y las líneas punteadas a ±2,5 div) | Los mandos provisionales TIME, AMP, LEVEL y el conmutador Y-T / X-Y |
| Los herrajes del Gould sin mando en la web: mandos, botones TRIGGER, BNC, conmutadores deslizantes, borne Cal | |
| Bandas oscuras de arriba y abajo, los dos agujeros tapados bajo el osciloscopio | |

Lo que **no** se ha calcado, a propósito:

- La pegatina del GME (logotipo, dirección y «Referencia») a la derecha del
  frecuencímetro. Es una etiqueta de inventario, no de la máquina, como las
  letras escritas a mano del panel 7.
- El desgaste, los reflejos y los cuerpos de los mandos.

### Mandos sin audio: placeholders en la web

Con la foto, los dos selectores del frecuencímetro y los ocho mandos de los
envíos y retornos se veían aunque la web no los tuviera. Con el dibujo
desaparecían, así que ahora son **mandos inertes**: giran, pero no hacen nada,
como los placeholders del panel 4. Sus posiciones están en el blueprint.

- **FUNCTION y RANGE:** `knob-selector.svg` con centro verde, de 36 px. Su halo
  (124 % del mando, 44,5 px) es la falda transparente de la foto, de 44 px, y
  el centro, de 18 px, su capuchón.
  - Centros de la falda: (197,4, 434,5) y (376,3, 434,2). El capuchón verde
    está desplazado por la perspectiva: (192,4, 435,0).
  - Las posiciones apuntan a las guías serigrafiadas:

    | Selector | Posiciones | Arco | Paso |
    |---|---|---|---|
    | FUNCTION | FREQUENCY, PERIOD, FREQUENCY RATIO, TIME INTERVAL, UNIT COUNTER, OSC FREQUENCY | 286°–434° (±74°) | ~29,5° |
    | RANGE | 1 Hz/·01 s, 10 Hz/·1 s, 100 Hz/1 s, 1 kHz/10 s | 317°–403° (±43°) | ~29° |

  - Empiezan donde la foto: FREQUENCY y 10 Hz.
- **Envíos y retornos:** cuatro mandos blancos por módulo, del mismo tamaño que
  los de las entradas, en sus columnas, con centro en y = 711,5.

## El osciloscopio: propuesta para sus mandos (no hecha)

**Esto es una propuesta: no se ha cambiado nada.**

Los mandos de la web TIME, AMP y LEVEL son provisionales. Están en columna
sobre la chapa del Gould (x 383,5; y 72, 143 y 214), tapando sus rótulos. El
conmutador Y-T / X-Y está debajo del osciloscopio. La propuesta es que pasen a
ser los mandos del propio Gould, en su sitio, y quitar del dibujo el mando
pintado que ocupan:

| Mando de la web | Pasaría a ser | Centro (px del panel) | Escala en el fondo |
|---|---|---|---|
| TIME (base de tiempos) | **TIME/CM** | (566,5, 179,5) | Ya dibujada: 0,5 µs … 0,5 s, arcos de r = 33 |
| AMP (ganancia) | **VOLTS/CM** de CH1 y, si se quiere, de CH2 (dos mandos, uno por haz) | (398,3, 178,4) y (477,1, 178,4) | Ya dibujadas: 12 valores a r = 24,3 |
| LEVEL (disparo) | **Trig Level** | (530, 121,6) | Rótulo ya dibujado |
| Conmutador Y-T / X-Y | Mando **MODE** (en la chapa: CH1, Dual, CH2, X–Y, Add), o al menos sus dos posiciones Y-T / X-Y | (441,4, 118,2) | Rótulos ya dibujados |

Qué haría falta:

- Llevar al blueprint los centros, con mandos de ~22–26 px, el tamaño de los
  del Gould.
- Que TIME/CM y VOLTS/CM sean selectores por pasos. Los de la foto saltan de
  valor en valor: no son continuos.
- Quitar del generador los mandos del Gould pintados en esas posiciones.

## Lo que no cuadra (para decidir; no se ha tocado)

- Los tres mandos provisionales del osciloscopio tapan parte de la chapa del
  Gould: es lo que resolvería la propuesta de arriba.
