# Echo Circuit (plano D100-09)

**Fuente: `Synthi 100 Technical Manual`, sección 14, páginas 9-10.** Es la fuente
buena —el manual técnico de la serie D100, la misma que cita el resto de los
configs—, no el folleto de 1971. Ver `../README.md` para dónde está el manual.

Este módulo **no está implementado**: en el panel 1 hay cuatro mandos dibujados
(Delay, Mix, Feedback, Level) con la clase `panel1-placeholder`, sin audio y sin
ninguna fila ni columna en las matrices. Con lo de abajo ya se puede hacer.

## Transcripción de lo que dice el manual

> The basis of this unit is an analogue Delay Line. A signal is shifted from
> input to output by transferred charges, from one cell to another on each clock
> pulse. Clearly the clock frequency must be as high as possible, and the delay
> (number of cells) must be large in order to permit a fast clock and a
> reasonable delay. (**The device used has 4096 cells**).
>
> The Input Signal to the Delay Line must be **band-limited to prevent aliasing**,
> and I/C 3 is connected as a **3 Pole filter** to do that. A similar filter
> I/C 4 reduces the **residual clock signal** superimposed upon the delayed
> output signal. These filters have a **deliberate peak at the turn over
> frequency** in order to add presence to the restricted (**5 K c/s**) bandwidth,
> and to achieve a good stop band fall-off.
>
> The delay is controlled by F/P Knob, or by Patched Control Voltage. A two
> phase clock signal is derived from the voltage controlled oscillator I/C 8,
> the **maximum delay being about ½ second**. Voltage control of the ratio of
> Direct/Echo Signal is achieved by I/C 6. The delayed signal may be **fed-back
> for re-delay, the amount controlled by RV 4**, for single/multiple echo's.

Y el procedimiento de ajuste, que dice de paso dónde satura:

> Set Feedback Pot. to minimum. With a sine wave signal of 400 C/S patched to
> signal I/P node, monitor the waveform at Pin 6 I/C 4 […] Vary the input level
> until clipping just starts, then adjust input level and V.R.1 until clipping is
> **symmetrical**. […] Adjust V.R.2 for minimum clock spikes on the 400 C/S
> wave form.

## Qué es, en una frase

Un **BBD** (bucket brigade device, línea de retardo analógica de cubos) de 4096
celdas con reloj controlado por voltaje, no una línea de retardo digital limpia.
Eso es lo que determina su sonido y hay que modelarlo como tal.

## Lo que se deduce para el DSP

En un BBD la señal avanza una celda por flanco de reloj, y con reloj de dos fases
el retardo es:

    retardo = nº de celdas / (2 × frecuencia de reloj) = 4096 / (2 · f_clk)

De ahí sale lo esencial, y es lo que hace que un BBD no suene como un delay
digital:

| f_clock | Retardo | Nyquist del BBD |
|---|---|---|
| ~4,1 kHz | 0,5 s (máximo) | ~2 kHz |
| ~10 kHz | 205 ms | 5 kHz |
| ~40 kHz | 51 ms | 20 kHz |

**El ancho de banda depende del retardo.** Cuanto más largo el eco, más bajo el
reloj y más apagado y sucio suena. El manual cita 5 kHz como el ancho de banda
«restringido» del aparato, lo que sitúa el reloj nominal por los 10 kHz. A medio
segundo, el eco está necesariamente mucho más oscuro que la señal directa. Esto
**no es un defecto a corregir**: es el carácter del módulo, y un eco que suene
igual de brillante en todos los retardos estará mal.

Cadena a implementar, entonces:

1. **Filtro anti-alias de 3 polos** a la entrada, con **pico deliberado en la
   frecuencia de corte** (no es un Butterworth: resuena a propósito).
2. **Línea de retardo** con tiempo controlado por el mando Delay o por CV de
   matriz. El retardo debe moverse de forma continua (barrer el reloj produce
   el característico cambio de tono al variar el delay: un BBD **no** hace
   crossfade, hace pitch shift).
3. **Filtro de reconstrucción de 3 polos** a la salida, igual, con su pico.
   En el hardware quita el residuo del reloj; en la emulación cumple la función
   de limitar la banda de la repetición.
4. **Realimentación** (RV 4) desde la salida retardada a la entrada.
5. **Crossfade directo/eco** controlable por voltaje (I/C 6), igual que en la
   reverb: cuando uno sube el otro baja.
6. **Saturación simétrica** a la entrada del BBD: el propio manual ajusta el
   nivel «hasta que el recorte empieza» y lo quiere simétrico, o sea que el
   aparato se usa cerca de su techo y recorta por los dos lados.

Los cuatro mandos del panel mapean directamente: **Delay** → frecuencia del
reloj (I/C 8), **Mix** → I/C 6, **Feedback** → RV 4, **Level** → salida.

## Lo que falta por mirar en el manual

- El **plano D100-09**, para los valores de los filtros de 3 polos (frecuencia de
  corte y cuánto pica) y el rango real del VCO del reloj. Está en el propio
  manual técnico, sección de planos, y probablemente también en
  `1977_synthi_100_sch.pdf`.
- **Qué fila y qué columna ocupa en las dos matrices.** En nuestros blueprints
  hay huecos sin asignar que encajan (ver `../../QUE-FALTA.md` §2), pero hay que
  confirmarlo, no adivinarlo.
- Si el mando Delay es lineal o exponencial sobre el reloj.
