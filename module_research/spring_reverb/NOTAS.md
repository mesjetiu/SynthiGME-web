# Reverberación de muelle (placa PC-16, D100-16 C1)

Notas de investigación del 21-sep-2026, a partir de la **especificación original
de EMS de 1971** (ver `../manual_ems_1971/NOTAS.md` y las páginas escaneadas; el
dato está en `spec_pag04.jpg`, epígrafe «Two Voltage Controlled Reverberation
Units»).

> ⚠️ Fuente de 1971, no de 1982. La máquina de Cuenca es la revisión Datanomics,
> rediseñada por dentro con chips CEM. **No hay extracto del manual de 1982 para
> este módulo** en `module_research/` —es de los que faltan—, así que todo lo de
> abajo son datos de la máquina vieja y hay que confirmarlos. Lo que sí tenemos
> del 82, vía `reverberation.config.js`, va en la sección «Detalles de circuito».
> Lo tranquilizador es que las dos fuentes **no se contradicen en nada**: los
> 35/40 ms, los 2,4 s y el ±2 V salen igual por los dos lados.

## Lo que dice la fuente, literal

> **Two Voltage Controlled Reverberation Units**
> Each spring unit has two elements with delays of 35 and 40 ms.
> Maximum Reverberation Time: 2.4 seconds.
> Useful Frequency Range: 30 Hz–12 KHz.
> Voltage Control Range: ±2v from no reverberation to maximum reverberation.

Son cuatro datos y los cuatro importan.

## Contraste con lo implementado

`springReverb.worklet.js` + `configs/modules/reverberation.config.js`:

| Dato de fábrica | Nuestra implementación | Veredicto |
|---|---|---|
| Dos muelles de 35 y 40 ms | `spring1DelayMs: 35`, `spring2DelayMs: 40` | ✅ exacto |
| Tiempo máximo 2,4 s | `maxReverbTimeS: 2.4` | ✅ exacto |
| CV: ±2 V de nada a máximo | `mixCVScale: 5` (±2 V → 10 unidades de dial) | ✅ exacto |
| Rango útil 30 Hz – 12 kHz | damping LPF a **4.500 Hz**, sin paso alto | ⚠️ ver abajo |
| **Dos unidades** | **una** (`reverberation1`) | ❌ falta la segunda |

Los tres primeros ya estaban bien y ahora tienen respaldo documental, lo cual es
tranquilizador: quien los puso no se los inventó.

### El rango útil: 30 Hz – 12 kHz

Nuestro damping es un paso bajo de un polo a 4.500 Hz, que es una decisión
razonable de «así suena un muelle», pero la hoja de características habla de un
rango útil que llega hasta **12 kHz**, casi tres veces más arriba. Y por abajo
marca un límite de **30 Hz** que nosotros no modelamos en absoluto: un muelle
físico no transmite graves profundos, y ahí no hay ningún paso alto.

No es evidente que haya que cambiarlo:

- «Useful frequency range» en una hoja comercial suele ser el ancho de banda del
  módulo entero (camino seco incluido), no la respuesta de la cola reverberada.
  La cola de un muelle real **sí** pierde agudos rápido.
- Pero 4.500 Hz puede estar apagando de más, sobre todo en el «clank» metálico
  del ataque, que es parte del carácter del aparato.

**Es una decisión de oído, o sea tuya.** Lo que sí parece claramente ausente y
barato de añadir es el límite inferior: un paso alto de primer orden a ~30 Hz en
el camino húmedo, que además quitaría acumulación de graves en la realimentación.

### La segunda unidad

La máquina tiene **dos** unidades de reverberación idénticas e independientes.
Nosotros tenemos una. El propio `reverberation.config.js` ya lo dice
explícitamente («El Synthi 100 original tiene 2 unidades idénticas, pero esta
implementación incluye solo 1 unidad»), así que fue una decisión consciente, no
un descuido. Pero sigue siendo media máquina.

Dos unidades no son un lujo decorativo: permiten reverberar dos fuentes con
tiempos distintos, o encadenarlas, o —lo más interesante en una matriz— meter la
salida de una en la entrada de la otra y realimentar, que es de donde salen las
texturas largas que caracterizan la música hecha en estos estudios.

**Dónde iría, probablemente.** En la matriz de audio, la reverb 1 tiene la
entrada en la columna 1 y la salida en la fila 124. La **columna 2 está vacía**
en nuestro blueprint. En la matriz de control, el Mix CV de la reverb 1 está en
la columna 1 y la **columna 2 también está vacía**. La hipótesis evidente es que
la columna 2 de ambas matrices sea la segunda unidad. Falta por localizar su
fila de salida, que no está junto a la 124. **Hipótesis, no dato**: hay que
confirmarlo contra el manual Datanomics o contra la máquina de Cuenca antes de
cablear nada.

## Detalles de circuito que ya teníamos (manual Datanomics, vía config)

Esto ya estaba recogido en `reverberation.config.js` y no lo contradice nada de
la fuente de 1971:

- Driver del muelle: IC 1 (CA3140) + TR 1, TR 2.
- VCA de mezcla: IC 3 (seco) / IC 5 (húmedo), crossfader inverso.
- Salida: IC 7 (mezcla) → IC 8 (buffer).
- Entrada máxima 2 V p-p; por encima aparece el «clank» metálico.
- Impedancia de control (Rin): 8 kΩ.
- Constante de tiempo de caída ~35 ms.

## Pendiente de buscar

No he encontrado en abierto el manual de servicio con el esquema de la PC-16.
Existen estas pistas, sin descargar:

- `elektrotanya.com/ems_synthi_100_sch.pdf` — anunciado como «EMS Synthi 100 SCH
  service manual», requiere registro.
- El manual de ~100 páginas de **Pignon** que usan en el estudio de Radio
  Belgrado, citado en la documentación de la restauración de 2016-2018.
- La tesis doctoral de Frances Morgan (RCA, 2020) sobre el Synthi 100, 300+
  páginas, en abierto: <https://researchonline.rca.ac.uk/4730/1/FrancesMorgan-LibrarySubmission-RedactedCopy.pdf>
  (contexto histórico más que técnico).

Cuando se tenga delante el manual Datanomics de 1982 o el de Belgrado, lo que
hay que mirar de la PC-16 es **el valor del condensador del filtro de damping**
(o la respuesta del transductor del muelle): es lo único que decidiría con
criterio si 4.500 Hz es correcto o si hay que subirlo.
