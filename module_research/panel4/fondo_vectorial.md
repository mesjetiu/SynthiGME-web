# Panel 4: fondo vectorial (noviembre 2026) — EN CURSO

Notas del paso 1.4 de la hoja de ruta, escritas mientras se hace. Mismo método
que el 7 y el 2 (`module_research/panel7/fondo_vectorial.md`,
`module_research/panel2/fondo_vectorial.md`). **Estado (26-nov, noche):
medición a medias; el generador todavía no existe.** Nada tocado en la web.

Todas las medidas, en px del panel (760 = ancho de
`design/panels/Panel4/panel_4.jpg`, 2604 px: 3,43 px de foto por px).

## Dónde se quedó

- Hecho: captura «antes» de la web a 2× con la foto, y captura de lo que
  pinta la web **sin fondo** (ver abajo). Tipos de letra de la placa de
  arriba y de los voltímetros. Marcos. Escala de los voltímetros. Geometría de
  los adornos de cada tipo de mando (▼, flechas, −/+, 1mS/1S, tornillos de los
  verniers). Barras negras de título. Comprobado que los mandos cuadran.
- Falta: medir los rótulos sueltos de la mitad de abajo (se iba a hacer con un
  medidor de cajas de tinta por palabra), escribir
  `design/panels/Panel4/generar_panel4.py`, iterar con la mezcla foto/dibujo,
  y lo de la web (app.js, sw.js, test, referencia visual, entregas).
- Las herramientas de medida (rejilla, grupos de tinta, mezcla, render,
  plantillas promediadas, perfil de líneas) están en
  `casa:~/trabajo/SynthiGME-web/panel4/`, junto con las capturas «antes» y
  «web sin fondo». Si se han borrado, son unas líneas cada una (las describe
  el encargo y `panel2/fondo_vectorial.md`).

## Qué pinta la web y qué no

Capturada la web sin fondo: pinta las **agujas** de los voltímetros (solo la
aguja, sin escala ni esfera), las **palancas** de cada canal, el **display**
del Sequencer Event Time (caja negra redondeada, 293–460 × 300–356), todos
los **mandos** (verniers, normales, bipolares, de color) y el **selector
rotativo** On/Kbd. **Todo tiene widget**: no hacen falta mandos inertes en
este panel.

Así que el fondo lleva: la placa de arriba, la esfera y la escala de los ocho
voltímetros, marcos, barras de título, rótulos, ▼, flechas, −/+, la pestaña
de SEQUENCER EVENT TIME, los tornillos y el punto oscuro de encima de cada
vernier, y los ▲▽ huecos del selector On/Kbd.

## Tipos de letra

| Dónde | Letra |
|---|---|
| EMS (placa de arriba) | Eurostile **Demi** (entre la Demi y la Bold de grueso) → trazos |
| ELECTRONIC MUSIC STUDIOS | Eurostile normal, algo engordada y espaciada → trazos |
| MADE BY DATANOMICS LTD WAREHAM DORSET ENGLAND TEL (092-95) 6311 TELEX 418480 DISCUS G | Eurostile, entre normal y Demi → trazos |
| SYNTHI 100 (en recuadro) | Microgramma Bold, como en el 7 → `<text>` |
| OUTPUT CH. n | Microgramma Bold calada en barra negra |
| control voltages / signal levels | Microgramma **Medium**, minúsculas, espaciada |
| Cifras de los voltímetros | Palo seco sencilla: Univers a trazos |
| Resto (pendiente de comparar letra a letra) | En principio como el 2: barras en Bold, rótulos en Medium engordada |

INVERTOR/BUFFER, GAIN y OFFSET salen **grises** en la foto, más claros que el
resto: comprobar si es otro color de tinta.

## Medidas

### Placa de arriba

- Placa clara de x ≈ 24 a 741, y ≈ 6,5 a 126,5 (metacrilato con las letras
  detrás: la tinta tiene sombra desplazada). Fuera, el marco oscuro del mueble.
- Riel oscuro de y 127 a 147 (con un filo más claro en y ≈ 132).
- EMS: E 72,0–112,8, M 124,5–183,5, S 196,3–239,8; y 23,8–77,5.
- ELECTRONIC 70,5–139,7, MUSIC 149,3–184,0, STUDIOS 193,7–242,1; y 85,5–94,6.
- MADE BY…: y 106,3–112,5 (altura 5,6). Palabras (x0–x1): MADE 71,1–90,4;
  BY 94,2–102,6; DATANOMICS 105,8–152,8; LTD 155,7–168,0; WAREHAM 171,2–208,0;
  DORSET 211,5–240,7; ENGLAND 243,0–276,6; TEL 278,9–292,6; (092-95)
  294,7–327,3; 6311 330,8–344,3; TELEX 346,9–369,7; 418480 372,3–399,4;
  DISCUS 402,4–428,6; G 431,5–435,9.
- SYNTHI 100: recuadro x 298,8–684,6, y 20,0–73,1; letras y 33,2–63,9
  (S 317,9 … I 538,2; 1 563,0 … 0 665,5).
- Tornillos, leídos en la rejilla y **sin afinar**: (37,5; 22,5), (37,5; 110),
  (716; 22), (716; 110) y (378; 119); y en la chapa, (211; 162), (542; 162),
  (273; 332) y (480; 332).

### Marcos

Líneas de ~1,8–2,1 px. La foto tiene algo de **trapecio**: las verticales de
la izquierda bajan ~2 px hacia la derecha en 300 px y la de la derecha ~0,8
hacia la izquierda; van por la media, como en el 2.

- Voltímetros: verticales 46,1 + 82,78·k (k = 0…8, uniforme a ±0,2);
  horizontales 179,1 / 218,3 / 299,6.
- Mitad de abajo: verticales 48,4 / 142,9 / 236,8 / 330,8 / 425,8 / 519,4 /
  613,2 / 707,7; horizontales 367,0 (arriba) / 379,5 (bajo la fila de
  cabeceras, desde x 142,9) / 747,0 (abajo, 746,2 a la izquierda y 747,8 a
  la derecha) / 492,4 y 617,8 (columna 1) / 645,0 (slew y Option 1, desde
  330,8) / 556,0 (Key 4, columna 7).
  Las líneas 236,8, 425,8 y 519,4 empiezan en 379,5 (las cabeceras KEYBOARD y
  SEQUENCER OUTPUT RANGE las cruzan sin dividir).

### Voltímetros

- Cada canal: barra OUTPUT CH. n en x 50,7–124,2 (relativo al canal 1),
  y 222,0–230,5, letras de altura 4,1 (223,96–228,05); OUTPUT 54,3–91,6,
  CH. 97,3–111,6, cifra 115,8–120,0. «control» 57,4–83,8 y «voltages»
  87,4–118,3 (altura de x 2,6, base 255,9); «signal» 64,8–84,9 y «levels»
  88,6–108,3 (base ≈ 293,7). Los 8 canales repiten esto a ±0,6 px al paso de
  82,78: uno dibujado y siete clones.
- Esfera: cristal de (50,6; 184) a (124,6; 214,6), con sombras oscuras a los
  lados (50,6–55,5 y 119,8–124,6).
- **Escala** (voltímetro 1; las demás están corridas hasta 6 px por la
  paralaje del cristal, así que no se promedia: se dibuja la del 1 y se
  clona en **la caja de cada voltímetro del blueprint**, que es donde gira
  cada aguja). Dos arcos concéntricos con centro ≈ (89,3; 233,0): exterior
  r 39,3, interior r 36,7; abarcan ±42° (11 marcas mayores cada 8,4°,
  menores a la mitad, solo entre los arcos). Cifras de arriba −5 … +5 en
  r ≈ 43,5 con su raya radial desde el arco interior; de abajo 0 … 10 en
  r ≈ 32,5. Cifras de 2,7 px de alto.
- La aguja de la web gira en (88,75; 228,75) a ±50°: en reposo tapa la de la
  foto y en los extremos cae en los extremos de la escala; en el centro hay
  ~0,5 px de diferencia. Se deja así.

### Adornos de los mandos (relativos al centro del mando en el blueprint)

Medidos en plantillas promediadas (mediana de todos los mandos de cada tipo,
alineados por correlación). Los mandos de la web cuadran entre sí con la foto
a ≤ 1,5 px; la falda transparente de la foto está centrada en ≈ (+1, −2).

- **Bipolar** (Key Velocity ×2, Env. Control ×2, Key 1–4, Gain, Offset y los
  dos Envelope Follower): ▼ de 7,6 de ancho, base en y −40,8 y punta en
  (0; −34,8). Flechas rectas con punta de arpón: cola (∓34,9; 9) → punta
  (∓25,5; 23,7). «−» centrado en (−20; 26,6), 4,4 × 0,6. «+» centrado en
  (18,1; 27,0), brazos de 2,6, grueso 0,7.
- **Unipolar** (Voltage B/D/F): solo el ▼, igual (base −41,5, punta −35).
- **Slew limiter**: flechas cola (∓35; 1,1) → punta (∓26; 15,1); «1mS»
  x −34,3…−20,6 y «1S» 22,5…30,5, base 21,3, altura 3,8.
- **Option 1**: ▼ propio (no cuadra con la plantilla unipolar; medir aparte).
- **Vernier** (PVC, Pitch ×2, Voltage A/C/E): tornillos de r 4,2 en
  (−27,6; 25,6) y (26,05; 25,6); punto oscuro encima en ≈ (−1; −35…−37)
  (afinar en cada uno). Los Pitch llevan además «V/oct.» y una ↗; el PVC,
  una ← y «1V/oct» debajo.

### Barras de título y rótulos (bordes de la tinta)

| Barra | x | y |
|---|---|---|
| PITCH▸VOLTAGE / CONVERTER (dos renglones) | 51,5–137,4 | 371,0–385,9 |
| KEYBOARD OUTPUT RANGE | 163,7–309,4 | 369,7–377,0 |
| SEQUENCER OUTPUT RANGE | 445,9–597,0 | 369,7–377,0 |
| SEQUENCER EVENT TIME (pestaña bajo el display) | 307,9–443,3 | 355,7–363,3 |
| ENVELOPE / FOLLOWER 1 | 53,0–137,9 | 496,3–510,1 |
| ENVELOPE / FOLLOWER 2 | 53,9–139,4 | 622,5–636,8 |
| SLEW LIMITER 1 / 2 / 3 | 336,2–421,1 / 430,8–514,3 / 523,9–608,9 | 648,3–656,7 |
| OPTION 1 | 617,0–702,0 | 648,8–657,0 |

INVERTOR/BUFFER no va en barra: letras grises, 622,0–697,9, y 371,1–375,5.

Rótulos de la columna 2 (palabra: x0–x1; la columna 3 es la misma a +94):
upper 160,8–180,9 · keyboard 183,3–216,0 (y 385,5–388,8) · PITCH
177,3–200,1 · V/oct. 156,4–177,4 (y 401,6–405,1) · KEY 160,8–176,0 ·
VELOCITY 179,2–219,5 (base 479,6) · ENV.CONTROL 161,7–220,4 (556,8–562,6) ·
RETRIGGER 168,8–213,1 (651,5–655,6) · KEY 165,6–180,4 · RELEASE 183,4–218,1
(660,0–664,1) · ON 164,7–176,3 (684,5–688,8) · KBD 204,4–222,2 · KEY
159,1–174,9 · RELEASE 178,4–214,3 (706,0–710,3) · or 157,6–165,1 · NEW
168,1–186,7 · PITCH 191,1–215,6 (714,3–718,4). Hay además una raya vertical
corta en x ≈ 189 bajo Env. Control (y ≈ 638–648) y los ▲▽ huecos del
selector (y 668,8–681,9 y 692–702,8). Las y de esta lista vienen de franjas
que a veces pillan sombra de los mandos: afinarlas en la mezcla.

## Decisiones tomadas hasta aquí

- La escala del voltímetro se clona en las cajas del blueprint (donde gira
  cada aguja), no al paso de los marcos, que es 82,78 uniforme.
- Las serigrafías repetidas de los canales y los adornos de los mandos van
  como un dibujo y clones (`<use>`), ligados en el test al blueprint.
- El borde de madera del mueble no se dibuja (como en el 2); la placa de
  arriba y el riel oscuro, sí.
