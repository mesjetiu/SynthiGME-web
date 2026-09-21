# Especificación original EMS SYNTHI 100 (1971)

Folleto de especificación de Electronic Music Studios (London) Ltd., 9 páginas.
Es la **máquina de 1971**, anterior a la revisión de Datanomics de 1981-82 que
es la de Cuenca: aquí el secuenciador es el de 256 eventos y hay nueve
osciladores, no doce. Aun así es la fuente primaria más detallada que hay en
abierto sobre niveles, impedancias y rangos, y en casi todo lo que no cambió
sirve tal cual.

- **Origen**: <https://anaphonic.com/wp-content/uploads/ems_synthi100_om.pdf>
  (descargado el 21-sep-2026; PDF de 9,6 MB, escaneado sin capa de texto).
- **Aquí** se guardan solo las cinco páginas de especificación, en JPEG.
  Las páginas 1-2 son portada y presentación, y las 8-9 hablan del ordenador
  PDP-8 y de MUSYS: interesantes para la historia, irrelevantes para el DSP.

| Fichero | Contenido |
|---|---|
| `spec_pag03.jpg` | Niveles de señal e impedancias, osciladores, ruido, random CV |
| `spec_pag04.jpg` | Envolventes, filtros, banco de octavas, **reverberación**, slew limiters |
| `spec_pag05.jpg` | Ring modulators, secuenciador de 256 eventos |
| `spec_pag06.jpg` | Secuenciador (cont.), salidas, joysticks, teclados |
| `spec_pag07.jpg` | Teclados (cont.), matrices, entradas, envíos externos, frecuencímetro, osciloscopio |

---

## Lo que confirma nuestra implementación

Cosas que estaban bien y ahora tienen respaldo documental:

- **Reverberación**: «Each spring unit has two elements with delays of 35 and
  40 ms. Maximum Reverberation Time: 2.4 seconds». Es exactamente lo que hay en
  `springReverb.worklet.js` (`spring1DelayMs: 35`, `spring2DelayMs: 40`,
  `maxReverbTimeS: 2.4`). Detalle en `../spring_reverb/NOTAS.md`.
- **Control de tono de los canales de salida**: «Filter: A single knob providing
  continuous transition between first order low pass and first order high pass».
  Primer orden y transición continua: es lo que hace `outputFilter.worklet.js`.
- **Switch Off de los canales de salida**: «Totally disconnect output from the pan
  control, allowing the amplifier to be used earlier in the signal chain». O sea
  que la re-entrada a matriz es un uso previsto de fábrica, no un añadido nuestro.
- **Forma de onda seno**: «A sine shaper is included by which variable amounts of
  **even** harmonic distortion may be added». Nuestro control de simetría del seno
  debe generar armónicos **pares**; conviene verificarlo con un análisis espectral.
- **Impedancias de entrada**: «All input impedances are approximately 10 KOHM»,
  y los pines llevan resistencias para poder mezclar varias salidas en una
  entrada. Coincide con `STANDARD_FEEDBACK_RESISTANCE` y el modelo de
  `calculateMatrixPinGain()`.
- **Convertidor de altura a voltaje**: «the converter measures the **period** of
  the signal», no cuenta cruces por cero en un intervalo fijo. Nuestra detección
  por cruce por cero de medio ciclo mide periodo, así que va en la línea correcta.
- **Random CV**: «The distribution of levels is **rectangular** rather than
  Gaussian, and the two outputs are **uncorrelated in level, but synchronous in
  time**». Los dos voltajes comparten reloj y son independientes en valor.

## Lo que contradice o matiza lo implementado

Ninguna de estas es necesariamente un error nuestro: la máquina de Cuenca es la
revisión Datanomics de 1982 y varias cosas cambiaron. Pero **hay que decidirlas
a conciencia**, no por inercia.

- **Voltios por octava.** El folleto dice «Voltage Control: 5v/octave» para los
  osciladores de audio, «.5v/octave» para los LFO y «Keyboard voltage: 0.5V per
  octave maximum» para los teclados. Nosotros usamos **1 V/oct**
  (`VOLTS_PER_OCTAVE = 1.0`). El 5 frente al 0,5 huele a errata del propio
  folleto, pero que el estándar de la casa sea 0,5 V/oct y no 1 V/oct aparece
  dos veces y en dos módulos distintos. **Contrastar con el manual Datanomics
  antes de tocar nada**: cambiarlo afectaría a toda la máquina.
- **Dos unidades de reverberación**, no una. Ver `../spring_reverb/NOTAS.md`.
- **Tres generadores de ruido**, no dos: «Three Noise Generators». Nosotros
  tenemos dos (`noiseGen` índices 0 y 1). Verificar cuántos tiene el de Cuenca.
- **Rango de los joysticks**: «The control sticks have a range of 2 x ±2V DC».
  Nuestro `JoystickModule` usa **±8 V**. Diferencia de factor cuatro en toda la
  profundidad de modulación que da un joystick.
- **VCA de los canales de salida**: «All eight are voltage controlled (0.5V per
  6 dB)», o sea **12 dB/V**. Nosotros modelamos el CEM 3330 a **10 dB/V**, que es
  lo propio del chip de la revisión de 1982. Aquí nuestra elección seguramente es
  la correcta para Cuenca, pero conviene dejar dicho por qué.
- **Pendiente de los filtros**: «Cut off rate 12 dB for first octave and 18 dB
  per octave thereafter», y «Maximum stable Q factor — 20». Nosotros hacemos
  24 dB/oct planos (cuatro polos). La curva real no es una pendiente constante:
  arranca más suave y luego se endurece. Explicaría parte del carácter.
- **Banco de filtros de octava**: «eight **resonating** filters, fixed-tune one
  octave apart, in the range 62.5 Hz–8 KHz». Nosotros usamos paso-banda con
  Q = √2 y frecuencia base 63 Hz. «Resonating» sugiere Q más alto que √2; y la
  base exacta es 62,5 Hz (que además es 8000/128, o sea la serie de octavas
  exacta). Cambiar 63 por 62,5 es gratis y es más fiel.
- **Niveles de señal**: «In general, signal levels are about ±1V p-p, although
  most outputs can deliver much more than this». Nuestro modelo razona en raíles
  de ±12 V; el nivel **nominal** de trabajo es mucho menor. Relevante para
  calibrar dónde empieza a saturar cada cosa.
- **Matrices de 60 × 60** (7.200 puntos) en la máquina de 1971. La de Cuenca es
  mayor; no tocar, pero anotado por si aparece en los manuales.

## Módulos del folleto que no existen en la emulación

- **Three Voltage Controlled Slew Limiters.** «A unity gain amplifier in which
  the output exactly follows the input at a rate whose maximum (slew) is defined
  by a control voltage». Rango de slew de 1 ms a 10 s, control **exponencial**,
  ganancia unidad 1 ± 1 %, linealidad ±0,05 %. Sin control de nivel de salida,
  justamente porque tiene ganancia unidad. El ejemplo que da el folleto es
  precioso: ponerlo entre el teclado y el oscilador y alimentar el control de
  slew con la velocidad de pulsación, de forma que **el glissando entre dos notas
  dependa del ataque del dedo**.
- **Two Envelope Followers.** Voltaje proporcional al nivel medio de una señal de
  audio, con paso bajo de segundo orden a ~50 Hz para quitar el rizado, y mando
  de cero central que da excursiones de hasta ±1 V por 6 dB.
- **Four External Treatment Send and Returns** (nosotros tenemos un Send y un
  Return, y como placeholder): «Provision for sending out to external echo
  plates and other equipment».
- **Dawe 3000 AR/6 Digital Frequency Meter**: el frecuencímetro del panel 2 no es
  un módulo EMS, es un instrumento de laboratorio de otra marca. Reloj de
  cristal de 100 kHz ±0,002 %, medida de frecuencia de 0 a 1 MHz con precisión de
  ±1 dígito, tiempo de puerta de 1 ms a 10 s, y además mide periodo (0–300 kHz) y
  tiempo. Si algún día se implementa, esto es la especificación entera.
- **Telequipment D43R**: el osciloscopio tampoco es de EMS. Doble haz, pantalla
  de 6 × 8 cm.

## Cosas sueltas que conviene no perder

- **Dos amplificadores de micrófono** que pueden alimentar dos cualesquiera de
  los ocho canales de entrada. Es justo lo que está apuntado en `TODO.md`
  («Hay 2 entradas de micro tras input amplifiers»): ahora tiene fuente.
- Entradas de línea: máximo 1,8 V AC rms o ±2,5 V DC, distorsión máxima 0,1 %.
- Los ocho canales de salida comparten buses: «Pan... distributes the output
  to between the left and right bus, **these being common to four of the eight
  amplifiers**».
- Teclados: el voltaje de altura «is remembered even when a key is released», y
  con varias teclas pulsadas «the voltage of the highest appears» — prioridad a
  la nota más aguda.
- Relación señal/ruido de los VCA mejor que 74 dB, y el ruido baja
  proporcionalmente al bajar la ganancia: «When the amplifier is cut off, the
  noise at its output is immeasurable».
- Todos los osciladores tienen entrada de sincronismo «so that they can operate
  at an integral multiple of another oscillator».

> Aviso: el folleto se contradice a sí mismo en la pureza del seno (página 3 dice
> «better than 50% total distortion», página 4 dice «better than 3%»). Es un
> folleto comercial escaneado, no un manual de servicio: donde haya duda, manda
> el manual técnico de Datanomics.
