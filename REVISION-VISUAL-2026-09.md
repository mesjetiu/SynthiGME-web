# Revisión de la parte visual de los paneles (septiembre 2026)

Estado verificado del layout de los siete paneles de la web, antes de
unificar los blueprints. Objetivo del proyecto: que cada panel se vea como el
del Synthi 100 de Cuenca, con los controles encima de la foto (o del dibujo)
del panel real. Por eso todo se ha ido ajustando contra la imagen de fondo.

Las posiciones, desvíos y encajes están medidos en la web real (Chromium
headless, `src/`), no deducidos del código; donde un informe teórico decía
otra cosa, manda la medición. La lista de código muerto, errores y duplicados
sale de leer el código y está por confirmar caso a caso al tocar cada uno.

## Red de seguridad: `tests/visual/`

Antes de tocar nada se tomó una referencia del estado actual:

    npm run visual:compare

- `capture.mjs` saca, por panel, una imagen a escala 1 (760×760) y la caja de
  cada elemento (≈19 000 en total) en coordenadas del panel.
- `compare.mjs` compara con `tests/visual/baseline/`: geometría con 0,01 px de
  tolerancia e imagen píxel a píxel, y deja un `.diff.png` donde algo cambie.
- Dos capturas seguidas salen idénticas byte a byte, y detecta un cambio de
  0,1 px en un solo parámetro.

**Regla para el refactor:** cada paso tiene que dejar `visual:compare` en
verde. Si un paso cambia algo visible a propósito (arreglar un panel que no
está encajado), se regenera la referencia de ese panel en el mismo commit y se
explica por qué.

## Qué hay: siete paneles, cinco modelos de layout

Todos los paneles son cajas de 760×760 px con la imagen de fondo estirada al
100 %: 1 px de blueprint = 1/760 del ancho de la imagen. Eso es lo único
común.

| Panel | ¿Encajado con el fondo? | Modelo de layout | Cómo se describe en el blueprint |
|---|---|---|---|
| 1 | **No** (los mandos quedan desplazados respecto a la foto; `showFrames: true`) | Columna flex → filas flex; los mandos los reparte el CSS con `space-evenly` | Secciones por fila; arrays paralelos `knobs`/`knobColors`/`knobTypes` |
| 2 | Sí | Flujo normal de bloques + `translate` por sección | `size{w,h}` + `offset{x,y}` por módulo; un solo color/tipo para todos los mandos |
| 3 | Sí | Rejilla absoluta calculada en JS, **centrada** en el panel | `schemaVersion: 1`; rejilla + `oscillatorSlots` + defaults por tipo |
| 4 | **No** (claramente sin cuadrar; `showFrames: true` y recuadros cian de depuración visibles en los voltímetros) | Flex anidado con proporciones | Árbol filas → columnas → submódulos con `flex`; mandos como objetos |
| 5, 6 | Sí (medido: <1 px) | Tabla HTML escalada dentro de un marco en «steps» | `frame.{squarePercent, referenceSteps, translateSteps, marginsSteps, …}` |
| 7 | Sí | Columna flex **anclada abajo**; filas centradas | Tamaños fijos de marco + offsets por control + variables CSS |

Además, el mismo concepto se escribe de cuatro maneras según el panel:
`knobsOffset{x,y}` (1, 7), `knobsRowOffset{x,y}` (2), `knobRowOffsetX/Y`
sueltos (3, 7); offsets por mando como número (3) o como `{x,y}` (2, 7);
tamaño de mando como número, como `'sm'` o partido en estándar/vernier (4).

## Por qué los números parecen mágicos

Los offsets «a ojo» no son arbitrarios: compensan que cada modelo coloca las
cosas en un sitio que no es el de la imagen, y el ajuste corrige la
diferencia. En concreto:

- **Panel 2.** Un `translate` no mueve a los hermanos siguientes, así que el
  offset de cada sección es relativo a donde la habría puesto el flujo, que se
  queda corto (acaba en ~692 px). De ahí las Y de +65 a +81. Las posiciones
  reales de las secciones son 32 / 322 / 466 / 559 / 653.
- **Panel 3.** El bloque de osciladores se **centra** verticalmente:
  `top = (760 − alto_bloque)/2 + topOffset`. Por eso subir `gap.y` de 0,3 a
  0,4 **sube** la primera fila en vez de bajarla (comprobado), y por eso
  pareció que `topOffset` «ya no tenía efecto». Hay además dos fuentes de
  verdad para el alto de la fila inferior (`reservedHeight` para centrar,
  `max(noiseSize.h, randomCVSize.h)` para dibujar).
- **Panel 7.** Todo cuelga del borde inferior: la Y de los joysticks depende
  del alto de los canales de salida (760 − 10 − 440 − 240 = 70, +19 de offset).
  Cambiar el alto de un canal mueve los joysticks.
- **Panel 1.** La pila de filas mide 714 px, menos de 760; `offset.y: 40` lo
  compensa. El botón de gate y el LED van en px absolutos dentro del marco,
  pero los mandos los coloca `space-evenly`: dependen uno de otro sin saberlo.

## Las matrices de pines (paneles 5 y 6): el «milagro», explicado

Medido contra las líneas del SVG de fondo (`panel5_bg.svg`, `panel6_bg.svg`,
viewBox 210×210): todos los pines medibles caen a **menos de 1 px** del
centro de su casilla (panel 5: columnas −1,05…+0,24 px, filas −0,44…+0,59 px;
panel 6: columnas −0,44…+0,47 px, filas +0,02…+1,01 px). El resultado es
bueno. El mecanismo, no:

- En el dibujo las casillas **no son cuadradas**: columnas de ~9,11 px y filas
  de ~9,67 px.
- En el código las celdas se declaran cuadradas (12×12 px) y la tabla se
  escala de forma uniforme (`largeMatrix.js`, `resizeToFit`), así que en
  teoría no podrían encajar en los dos ejes.
- Encajan porque la tabla es `table-layout: fixed` y su ancho queda limitado
  por el del contenedor: el navegador **estrecha cada celda** de 12 a ~11,3 px
  (medido: `td` 11,30×12). Esa deformación accidental es la que da la
  proporción 9,11 : 9,67 del dibujo.
- Consecuencia: el paso horizontal lo fija el **ancho** del marco
  (`marginsSteps.left/right`) y el vertical lo fija el **alto**
  (`marginsSteps.top/bottom`). Ningún número del código dice «el paso de
  columna es 9,11 px»; sale de la combinación.
- El «step» del marco (`squarePercent 90 / referenceSteps 67` = 10,21 px) no
  es ni el paso de pin ni el del dibujo: es una unidad inventada.
  `referenceSteps: 67` existe para que el panel 5 no se descuadrara cuando
  pasó a 69 columnas; las dos columnas ocultas extra (67, 68) desplazan la
  rejilla visible, y la diferencia de márgenes entre P5 y P6 lo compensa.
- Tamaños duplicados: CSS dice celda 14 / pin 11 (`main.css`), JS dice 12 / 7
  y gana el JS. Hay un marco de reserva en `panelAssembler.js` con valores
  viejos del panel 5.
- El propio dibujo no es regular (casillas de 2,49 a 2,56 unidades): ninguna
  rejilla uniforme puede bajar de ~±0,5 px en todas las casillas. Sí podría
  hacerlo colocando cada fila y columna en el centro de su casilla del SVG.

## Código muerto, errores y duplicados

Errores (no visibles hoy, pero muerden al tocar):

- **Panel 1:** filtros, moduladores de anillo y reverb reciben `offset`, lo
  aplican como `transform`, y luego el ensamblador lo borra al reescribir
  `el.style.cssText`. Un override de offset en esos módulos no haría nada.
- **Panel 7:** `knobSize: 65` en los joysticks genera la clase `knob--65`,
  que no existe: se ven a 60 px (el defecto del CSS). Arreglarlo cambiaría el
  aspecto en 5 px, así que la migración debe conservar 60.
- **Panel 3:** `knobRowOffsetY || -6` convierte un 0 explícito en −6 (igual con
  `knobInnerPct`).
- **Panel 4:** `debugBorder: true` en los voltímetros se ve en la web
  publicada (recuadros cian).

Configuración que el blueprint declara pero nadie lee (engaña al que la
ajusta): nombres de mandos de los paneles 1 y 7 (las etiquetas están en el
código), `knobColors`/`knobTypes` de los osciladores (salen de un default que
por casualidad coincide), `knobInnerPct` del amplificador de entrada y del banco de filtros (panel 2),
`min/max/default` de todos los mandos del panel 4, `columns: 2` y
`columns: 7`, `envelopeShapers.gap`, `visible` de los ruidos, los joysticks y
los canales de salida.

Duplicados: `toNum`/`resolveOffset`/`applyOffset` redefinidos en 4
ensambladores y 3 clases de UI; `COLOR_MAP` en 10 sitios; la creación de un
mando con tamaño y % interior repetida en ~8 sitios; el joystick izquierdo y
el derecho copiados enteros; cuatro formas distintas de fusionar overrides.
`ui/envelopeShaper.js` no lo importa nadie.

Cableado por texto o posición (romper el nombre rompe el audio sin avisar):
los mandos del secuenciador se enlazan por su etiqueta (`'Voltage A'`…) y los
del teclado por su índice.

## Propuesta de unificación

La idea central: **un solo modelo de coordenadas, el de la imagen de fondo**.
Cada módulo se coloca con una caja absoluta `{x, y, w, h}` en px del panel
760×760 (= fracción de la imagen), y dentro de cada módulo cada control con
su propia posición relativa a la caja. Nada depende de flujo, centrado,
`space-evenly` ni del alto de otro módulo: mover una cosa no mueve otras.

1. **Migración sin cambio visible (paneles 2, 3, 5, 6, 7).** Se calculan las
   cajas efectivas actuales (las da la captura de referencia) y se escriben
   en el blueprint nuevo. `visual:compare` debe quedar idéntico panel a
   panel. Un panel por commit.
2. **Un solo esquema de blueprint** para todos: mismas claves para mandos
   (`{ id, type, color, size, x, y }`), misma forma de offsets, sin arrays
   paralelos. Un validador en los tests que rechace claves desconocidas, para
   que no vuelva a haber configuración muerta.
3. **Un solo ensamblador genérico** que lea ese esquema, con las piezas
   comunes extraídas (`createSizedKnob`, `COLOR_MAP` único, helpers de
   offset). Los módulos especiales (osciloscopio, voltímetros, joysticks,
   secuenciador) siguen teniendo su clase, pero reciben su caja igual que
   todos.
4. **Matrices:** describir la rejilla en unidades del dibujo (origen y paso de
   columna y de fila, o directamente la lista de casillas del SVG) y colocar
   los pines con esos números, en vez de marco + márgenes + deformación
   accidental de la tabla. La versión que reproduce el aspecto actual es
   posible (paso X y paso Y explícitos que salen hoy de la medición); la que
   centra cada pin en su casilla exacta mejoraría hasta ~1 px y cambiaría la
   referencia.
5. **Paneles 1 y 4 al final,** ya con el modelo nuevo: ahí sí hay que
   cambiar lo visible para encajarlos con la foto, y con cajas absolutas
   el ajuste deja de ser ensayo y error (se puede superponer la caja sobre la
   foto y leer las coordenadas).

Pendiente de decidir (Carlos): si las matrices se reproducen tal cual o se
centran en la casilla exacta; y si los paneles 1 y 4 entran en esta tanda.
