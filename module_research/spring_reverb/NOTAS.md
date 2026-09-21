# Reverberación de muelle (placa PC-16, D100-16 C1)

Notas de investigación del 21-sep-2026, a partir de la **especificación original
de EMS de 1971** (ver `../manual_ems_1971/NOTAS.md` y las páginas escaneadas; el
dato está en `spec_pag04.jpg`, epígrafe «Two Voltage Controlled Reverberation
Units»).

> **Resuelto el 21-sep-2026 con el plano.** Abajo se conserva el análisis hecho
> desde el folleto de 1971, pero la pregunta que estaba abierta —la frecuencia de
> damping— la contesta el esquema **D100-16 C1 de Datanomics, fechado 14-7-82**,
> que está en `reverb_drive_D100-16C1.jpg` y se analiza en la sección
> «El circuito real» al final. Las dos fuentes no se contradicen en nada.

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

*(Resuelto: ver abajo.)*

---

## El circuito real — D100-16 C1, Datanomics, 14-7-82

Esquema completo en `reverb_drive_D100-16C1.jpg`, titulado **«REVERB DRIVE»**.
Sacado del `Synthi 100 Technical Manual`, página 46 del PDF (ver
`../README.md`). El cajetín lleva el logotipo de **Datanomics Ltd., Wareham,
Dorset**, y la fecha **14-7-82**: es exactamente la máquina de Cuenca.

### Topología

    SIGNAL I/P ─C1 22µ─ IC1 (LF355) ─┬─ R2 150R ─ TR1/TR2 ─ C3 100µ ─ R31 33R ─ MUELLE
                                     │                                            │
                                     └─ R5 100K ─ IC3 (CA3080) ── seco ──┐    (transformador)
                                                                          │         │
    MIX KNOB ±12V ─R8 100K─┐                                              │    IC5 (CA3080)
    PATCHBOARD ────────────┴─ IC2 (3140) ─┬─ D1/TR3 ──→ control de IC3    │      húmedo
                                          │                               │         │
                                          └─ IC4 (3140, INVERSOR)         └── IC6 (3140) ──┘
                                                 └─ D2/TR4 ──→ control de IC5
                                                                    │
                                          IC7 (3140) ── O/P a LEVEL CONTROL
                                          IC8 (3140) ── O/P al patchboard

- **IC1 (LF355)**: buffer de entrada, realimentación R1 68K, C2 33p.
- **TR1 (BC169C) / TR2 (BC258B)**: par complementario que excita el muelle,
  con R3 y R4 de 4R7 y alimentación ±12 V. Es el «high-current amplifier» de
  la descripción.
- **IC3 e IC5 son CA3080**, o sea **OTA**: amplificadores transconductancia
  controlados por **corriente**, no por voltaje. Ese es el elemento no lineal
  del módulo y el que da su curva de mezcla.
- **IC2** suma el mando Mix y el CV del patchboard; **IC4 lo invierte**. Por eso
  la mezcla es un crossfade complementario exacto: la misma señal de control
  llega derecha a un OTA e invertida al otro. Confirma la frase del manual
  («as one increases, the other decreases») a nivel de circuito.
- **IC7** e **IC8** son las etapas de salida, con el corte por el control de
  nivel del panel en medio (pines 32 → 25).

### Las constantes de tiempo, que es lo que buscábamos

| Red | Valor | Frecuencia | Qué es |
|---|---|---|---|
| **C8 330 pF ∥ R23 39 K** (realimentación de IC7) | — | **12,4 kHz** | **Paso bajo de salida** |
| C3 100 µF + R31 33 Ω (excitación del muelle) | — | **48 Hz** | Paso alto al muelle |
| C11 10 pF ∥ R27 330 K (IC8) | — | 48 kHz | Solo estabilidad, fuera de banda |
| C12 0,47 µF + R26 100 K | — | 3,4 Hz | Acoplo, fuera de banda |

**El dato que faltaba: 12,4 kHz.** Y cuadra de forma redonda con el «Useful
Frequency Range: 30 Hz – 12 KHz» de la hoja de 1971. Las dos fuentes, separadas
por once años y por un rediseño entero, dan el mismo número.

### Qué significa para nuestro DSP

1. **La electrónica no corta en 4.500 Hz, corta en 12,4 kHz.** Nuestro
   `dampingFreqHz: 4500` **no** modela el circuito: modela la pérdida de agudos
   **mecánica del muelle**, que es otra cosa y que el esquema no puede decirnos
   porque no está en el esquema, está en el transductor y en el propio muelle.
   Eso es legítimo —todo emulador de muelle lo hace—, pero conviene tenerlo
   escrito para que nadie lo confunda con un valor sacado del plano.
   **Sigue siendo una decisión de oído**, pero ahora se sabe que el techo del
   aparato está tres veces más arriba, así que hay margen para subirlo si se
   juzga que está apagado de más.
2. **Falta el paso alto.** Hay dos limitaciones por abajo que no modelamos: los
   **48 Hz** de la red C3/R31 que excita el muelle (el valor real será algo
   distinto porque la impedancia del transductor entra en la cuenta) y el hecho
   físico de que un muelle no transmite graves. Un paso alto de primer orden en
   torno a 40-50 Hz **solo en el camino húmedo** sería fiel y de paso quitaría
   acumulación de graves en la realimentación.
3. **Los OTA.** Los dos VCA son CA3080 controlados por corriente a través de
   D1/TR3 y D2/TR4. Si alguna vez la curva del mando Mix suena rara, la respuesta
   está ahí: no es un crossfade lineal ni uno en raíz cuadrada, es la
   transconductancia de un CA3080 excitada por un espejo de corriente con diodo.
4. **Lo demás ya estaba bien**: el orden IC1 → driver → muelle → IC5 → IC6 →
   IC7 → IC8 que describe `reverberation.config.js` coincide con el plano, y los
   35/40 ms, los 2,4 s y el ±2 V siguen en pie.

### La segunda unidad, ahora con respaldo de hardware

El esquema se titula **«Reverb Drive»** en singular, pero en el juego de planos
de 1977 hay una hoja de cableado titulada **«MODULE WIRING REVERB DRIVE 1&2»**
(EMS 31/12), y en el manual de 1982 está **D100-16 W 1**, «…ERB DRIVE WIRING».
O sea: **una misma placa, dos ejemplares**. Implementar la segunda unidad es
instanciar el módulo otra vez, no diseñar nada nuevo. Lo que sigue sin
confirmarse es qué fila y qué columna ocupa en cada matriz.
