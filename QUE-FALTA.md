# Qué le falta al instrumento

> Reflexión escrita el 21-sep-2026, después de la auditoría
> de septiembre (`AUDITORIA-2026-09.md`) y de una lectura de la especificación
> original de EMS de 1971 (`module_research/manual_ems_1971/`).
>
> **Actualizado el 21-sep-2026 por la tarde** con el `Synthi 100 Technical
> Manual` (105 páginas, serie de planos D100 — la misma que citan nuestros
> configs), que apareció en el grupo de Telegram «Synthi documentación» junto
> con otros 14 documentos, entre ellos 63 páginas de esquemas de 1977. Están en
> el servidor, fuera de este repo por ser obra con derechos: ver
> `module_research/README.md`, que lleva el índice de secciones del manual.
>
> **Jerarquía de fuentes.** Manda el manual técnico D100. El folleto de EMS de
> 1971 describe la misma arquitectura con **otra electrónica**: vale para
> entender la intención de cada módulo, **no para fijar valores** — ya indujo
> tres recomendaciones erróneas.
>
> **Esto no es una lista de tareas.** `TODO.md` ya es eso. Esto es un intento de
> responder a otra pregunta, que es distinta: *¿qué le falta a esta emulación
> para ser el Synthi 100 entero?* Unas cosas están verificadas en el código,
> otras son hipótesis razonadas y se señalan como tales.

---

## Lo primero: el instrumento ya es un instrumento

Conviene decirlo antes que nada, porque el resto del documento es una lista de
ausencias y da una impresión injusta. Lo que hay hoy suena y se toca: doce
osciladores con sus dos salidas, ocho filtros, tres moduladores de anillo, tres
generadores de envolvente, dos generadores de ruido, reverberación de muelle,
banco de filtros de octava, convertidor de altura a voltaje, voltaje aleatorio,
dos teclados, dos joysticks, el secuenciador digital 1000, ocho amplificadores
de entrada, ocho canales de salida con sus voltímetros, osciloscopio, y las dos
matrices de 60 × 60 que es lo que convierte todo eso en un Synthi y no en una
colección de módulos.

Se puede componer con esto. Lo que sigue es lo que aún no.

---

## 1. Módulos que faltan enteros

### 1.1 El Echo A.D.L.

Es el agujero más visible y el único módulo grande del panel 1 que sigue siendo
decorado. Tiene sus cuatro mandos dibujados —Delay, Mix, Feedback, Level—, la
clase CSS `panel1-placeholder`, y **ni una sola fila o columna en ninguna de las
dos matrices**: no hay manera de enchufarle nada aunque se quisiera.

Un eco con realimentación, dentro de una matriz de pines, no es un efecto: es un
generador. Realimentas la salida sobre la entrada, metes el oscilador más lento
en el tiempo de retardo, y de ahí sale material que no sale de ningún otro sitio
de la máquina. Es, con diferencia, lo que más cambiaría lo que se puede hacer
con la emulación.

**Ya no hay excusa de documentación**: el manual técnico lo especifica entero en
su sección 14 (plano D100-09) y está transcrito y razonado en
`module_research/echo/NOTAS.md`. En corto: es un **BBD de 4096 celdas** con reloj
controlado por voltaje, medio segundo de retardo máximo, ancho de banda de 5 kHz,
filtros de tres polos **con pico deliberado** a la entrada y a la salida, y
realimentación. Lo importante de modelar: en un BBD el **ancho de banda depende
del retardo** —cuanto más largo el eco, más oscuro y sucio—, y barrer el mando
de Delay cambia el tono de las repeticiones, no hace crossfade. Los cuatro
mandos del panel mapean uno a uno con el circuito.

### 1.2 La segunda unidad de reverberación

La máquina tiene **dos**, nosotros tenemos una. Está documentado en la
especificación de 1971 («Two Voltage Controlled Reverberation Units») y el
propio `reverberation.config.js` lo reconoce por escrito, así que fue una
decisión consciente en su día. Detalle completo, con los cuatro parámetros de
fábrica y el contraste contra nuestro DSP, en
`module_research/spring_reverb/NOTAS.md`.

Lo interesante de tener dos es poder encadenarlas o realimentar una en la otra.

### 1.3 Los tres slew limiters

**Confirmados por el manual técnico**, sección 16, plano D100-6: «a summing
buffer driving an integrator, whose time constant may be voltage controlled».
Un detalle de comportamiento que hay que respetar: «minimum slew is obtained
with zero slew input node current, and **negative inputs produce no further
effect**» — el CV negativo no hace nada.

La especificación de 1971 describe **tres limitadores de pendiente controlados
por voltaje**: amplificadores de ganancia unidad cuya salida sigue a la entrada con
una velocidad máxima definida por un voltaje de control, de 1 ms a 10 s, con
control exponencial.

El ejemplo que da el propio folleto explica para qué sirven mejor que cualquier
descripción técnica: pon uno entre el teclado y el oscilador, y alimenta su
control de slew con el voltaje de velocidad de pulsación. Resultado: **el
glissando entre dos notas depende de la fuerza con la que tocas**. Eso es un
gesto interpretativo que la máquina hoy no puede hacer.

Además son baratos de implementar: un seguidor de primer orden con constante de
tiempo controlada por voltaje.

### 1.4 Los dos envelope followers

También ausentes, y **confirmados por el manual técnico** (sección 20). Producen
un voltaje proporcional al nivel medio de una señal de audio, con paso bajo de segundo orden a ~50 Hz y mando de cero central
(excursiones de hasta ±1 V por 6 dB). Son la puerta de entrada del audio al
dominio del control: sin ellos, una señal de audio no puede modular nada en
función de su propia amplitud.

### 1.5 Los envíos y retornos externos

El folleto habla de **cuatro** envíos y retornos («for sending out to external
echo plates and other equipment»), y el manual técnico les dedica su sección 6
(«Treatment Sends»). Nosotros tenemos un Send Level y un Return Level, y los dos
son placeholders sin audio.

En una emulación web esto es más interesante de lo que parece, porque el «equipo
externo» podría ser cualquier cosa: un `AudioWorklet` del usuario, una entrada
de micrófono, otra pestaña. Es el punto por donde la máquina histórica se abre
a lo que hoy se puede hacer.

### 1.6 El frecuencímetro

Placeholder, y además oculto (`visible: false`). No es un módulo de EMS: el
manual técnico (sección 17) dice «this meter uses a **commercial unit** with
minor changes», y el folleto de 1971 lo identifica como un **Dawe 3000 AR/6**
(reloj de cristal de 100 kHz ±0,002 %, 0–1 MHz, tiempo de puerta de 1 ms a 10 s).
La entrada va por un convertidor lineal/TTL (planos D100-23W y D100-18C).

De todos los que faltan, es el que menos se echa de menos tocando.

---

## 2. Los huecos de las matrices

Esto no lo había mirado nadie y creo que es la pista más útil de todo el
documento. Conté qué filas y columnas de los dos blueprints no tienen nada
asignado. El resultado encaja con los módulos que faltan de una manera que no
parece casual.

**Verificado** (salido de contar el código):

| Matriz | Huecos |
|---|---|
| Audio (panel 5) | filas 83-86; columnas 2, 44-49, 56 |
| Control (panel 6) | filas 92-96; columnas 2, 3, 54-59 |

**Hipótesis** (razonadas, sin confirmar contra manual ni contra la máquina real):

- **Filas 92-96 de control = los tres slew limiters y los dos envelope
  followers.** Son cinco filas seguidas, justo entre el voltaje aleatorio
  (89-91) y los envelope shapers (97-99). Tres más dos son cinco. El encaje es
  demasiado limpio para ser coincidencia.
- **Filas 83-86 de audio = los cuatro retornos de tratamiento externo.** Cuatro
  filas seguidas, entre los buses de salida (79-82) y el secuenciador (87-88).
  Y el folleto dice cuatro.
- **Columna 2 de audio = entrada de la reverb 2**, y **columna 2 de control =
  su Mix CV**, porque la reverb 1 ocupa la columna 1 en las dos matrices.
- **Columnas 44-49 de audio** (seis) podrían ser los cuatro envíos externos más
  la entrada del eco y alguna más.

Si estas hipótesis se confirman, el mapa de lo que falta deja de ser una lista
de deseos y pasa a ser un plano con coordenadas. **Merece la pena dedicar una
sesión a cerrar ese inventario contra los manuales**, que es trabajo de archivo,
no de programación, y se puede hacer una vez y para siempre.

---

## 3. Lo que está pero podría ser más fiel

Aquí no falta nada: funciona. La pregunta es si se parece bastante. Todo esto
sale de contrastar el código con la especificación de **1971**, que no es la de
esta máquina: son **preguntas para el manual de 1982**, no conclusiones.

> **Dos avisos ya cobrados.** Al escribir la primera versión de este documento
> se propuso, desde el folleto de 1971, cambiar los voltios por octava y la
> frecuencia base del banco de octavas. **Las dos propuestas eran erróneas**: el
> material de 1982 que ya estaba en `module_research/` dice 1 V/oct (extracto
> del convertidor de altura a voltaje) y 63 Hz con pendiente de 12 dB/oct y
> ganancia de 10 dB (extracto del banco de octavas). O sea, lo que tenemos
> implementado. Sirva de recordatorio de lo fácil que es equivocarse con la
> fuente equivocada.

- **Pendiente de los filtros**: «12 dB for first octave and 18 dB per octave
  thereafter». No es una pendiente constante: arranca suave y se endurece.
  Nosotros hacemos 24 dB/oct planos. Esto es carácter sonoro puro. **Pero los
  filtros de Cuenca son CEM 3320**, así que la curva de 1971 puede no aplicar:
  a verificar en el manual del 82.
- **Rango de los joysticks**: el folleto dice ±2 V; nosotros usamos ±8 V. Un
  factor cuatro en toda la profundidad de modulación que da un joystick.
- **Q del banco de filtros de octava**: el folleto de 1971 los llama
  «resonating filters», y el extracto de 1982 habla de «característica de filtro
  de peine» y de un «ligero efecto de resonancia» en ajustes altos. Las dos
  fuentes apuntan a un Q mayor que el √2 que usamos. Es lo único de ese módulo
  que sigue abierto; lo demás está confirmado correcto.
- ~~Tres generadores de ruido~~. **Falso para esta máquina**: el manual técnico
  titula su sección 9 «**Dual** Noise Generators». Dos, como tenemos. Tercera
  recomendación errónea salida del folleto de 1971.
- **Damping de la reverb**: nuestro paso bajo está en 4.500 Hz y el rango útil
  de fábrica llega a 12 kHz; y por abajo no modelamos el límite de 30 Hz, que un
  muelle real sí tiene. Ver `module_research/spring_reverb/NOTAS.md`.
- **Simetría del seno**: el folleto confirma que el shaper añade armónicos
  **pares**. Conviene verificar con análisis espectral que el nuestro hace eso.

Y de la propia casa, ya apuntado en `TODO.md`: la **intermodulación entre formas
de onda del mismo oscilador** por saturación de los sumadores (IC 6 e IC 7,
manual Datanomics), y los **pines con diodos y condensadores** del manual de
Belgrado, que convierten la matriz de un conmutador en un procesador. Esas dos
son, para mí, las que más «suenan a Synthi» de toda la lista.

---

## 4. Lo que no es el instrumento, sino la plataforma

No es menos importante; es de otra naturaleza.

- **Móvil**: no se conceden los permisos de micrófono en Chrome Android, y no se
  pueden importar patches. Si lo fundamental es que funcione en el navegador
  —y lo es—, estos dos son topes duros, no molestias.
- **Rendimiento**: ~45.000 nodos DOM, ~26.000 SVG, 8.442 pines, 33 FPS en
  reposo en la línea base. Es un techo estructural: no se arregla con trucos,
  se arregla decidiendo si el zoom global continuo sigue siendo la forma
  correcta de navegar por una máquina de este tamaño. Está todo medido y
  razonado en `TODO.md` y en `ARCHITECTURE.md` §3.1.3.
- **Patches**: verificar que guardan absolutamente todo, y poder sobrescribir.
- **Integración continua**: hoy las pruebas solo corren si alguien las corre.

---

## 5. Si tuviera que ordenarlo

Mi lectura, sabiendo que la decisión no es mía:

1. **El eco.** Es el único módulo grande que falta de verdad y es el que más
   cambia lo que la máquina puede hacer, no solo lo que enseña.
2. **El móvil.** Micrófono y patches en Android. Es donde más gente va a abrir
   esto y ahora mismo llegan a una pared.
3. **Cerrar el inventario de las matrices** contra el manual de 1982. Es barato,
   se hace una vez, y convierte todo el punto 1 y el 2 de este documento en un
   plan con coordenadas en vez de en una intuición. Es también la ocasión de
   resolver de una vez las preguntas del punto 3.
4. **Los slew limiters y los envelope followers.** Baratos de implementar y
   añaden gestos que hoy no existen.
5. **La fidelidad analógica**: pendiente real de los filtros, intermodulación,
   pines con diodos. No es urgente para nadie, pero es lo que separa una
   emulación correcta de una emulación viva, y es donde este proyecto tiene algo
   que decir que no tienen otros.

La segunda reverb y los envíos externos los pondría detrás de todo eso. El
frecuencímetro, el último.

---

## Fuentes

- **Manual técnico Datanomics 1982** — la fuente que manda para esta máquina.
  **No está en abierto**: el 21-sep-2026 se buscó en Elektrotanya (403),
  Scribd, Audiofanzine, Archive.org y varios foros, sin resultado. Lo que hay
  en el repo son extractos suyos, vía NotebookLM, en
  `module_research/{envelope_shapers,octave_filter_bank,output_channels,pitch_to_voltage_converter,sequencer}/`.
- `module_research/manual_ems_1971/` — especificación original de EMS (1971),
  páginas escaneadas y notas con el contraste contra nuestra implementación.
  **Fuente secundaria**: misma arquitectura, otra electrónica.
- `module_research/spring_reverb/NOTAS.md` — la reverberación en detalle.
- `AUDITORIA-2026-09.md` — estado verificado del código y prioridades.
- `TODO.md` — la lista de tareas propiamente dicha.
