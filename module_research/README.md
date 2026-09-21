# Material de investigación por módulo

Notas, manuales y material de referencia del Synthi 100 real, organizados por
módulo. **Nunca código ni builds.** Cuando se investiga antes de implementar un
módulo, el material va a `<módulo>/`.

---

## Los manuales: dónde están y por qué no están aquí

Los **15 documentos** de referencia (~395 MB) **no están en este repo**, que es
público y son obras con derechos de autor. Viven en un repo privado hermano,
**`SynthiGME-investigacion`**, donde están todos **buscables** (capa de texto
por OCR, un `.txt` por libro y transcripciones revisadas a mano de lo que más
importa). Lo que sí va aquí es lo derivado: notas, transcripciones de lo
relevante para un módulo, y recortes concretos de esquemas cuando hacen falta
para implementar algo.

### La fuente que manda

**`Synthi 100 Technical Manual.pdf`** — 105 páginas escaneadas (en el repo
privado, ya con capa de texto y con las 15 páginas de texto transcritas y
revisadas a mano en `transcripciones/manual_tecnico_1982.md`). Es el manual
técnico de la serie de planos **D100**, la misma que citan nuestros configs
(`D100-16 C1` para la reverb, `D100-22C1` para el banco de octavas). Índice de
secciones:

| Sec. | Módulo | Plano | Pág. del manual |
|---|---|---|---|
| 1 | Specification | — | 1 |
| 2 | Power Supply | D100-28 | 1 |
| 3 | Oscillators | | 2 |
| 4 | Filters | | 4 |
| 5 | Octave Filter Bank | D100-22 | 5 |
| 6 | **Treatment Sends** | | 5 |
| 7 | Pan Circuits | | 5 |
| 8 | Input Amplifiers | | 6 |
| 9 | Dual Noise Generators | | 6 |
| 10 | Envelope Generator | | 6 |
| 11 | Dual V.C.A. | | 7 |
| 12 | Ring Modulators | D100-05 | 9 |
| 13 | Reverb Circuit | D100-16 (esquema en pág. **46** del PDF) | 9 |
| 14 | **Echo Circuit** | D100-09 (esquema en pág. **38** del PDF) | 9 |
| 15 | Meter Circuits | D100-13 | 10 |
| 16 | **Slew-Limiters** | D100-6 | 10 |
| 17 | Frequency Meter | D100-23W, D100-18C | 10 |
| 18 | G/P Operational Amplifiers | D100-15, D100-18, D100-19 | 11 |
| 19 | Sequencer | D100-23, D121-10C1 | 11 |
| 20 | **Envelope Followers** | | 12 |
| 21 | Random Voltage Generator | | 13 |
| 22 | Pitch/Voltage Converter | | 13 |
| 23 | Keyboard | | 14 |
| 24 | Data Sheets etc. | | — |

En negrita, los módulos que **no están implementados** en la emulación.

Mapa del PDF: 1 índice; 2–11 páginas impresas 1–10; 12 funda vacía; 13–15
impresas 11–13; 16 vacía; 17–18 impresas 14–15; **19–26 hojas de datos** (CEM
3330/3335, 3310, 3340/3345, 3320, ZN428, CA3140); **27–29 distribución de los
racks** (qué placa `PC-nn` va en cada ranura); **30–105 planos D100** (`C`
esquemas, `L` layouts, `W` cableado), con el cajetín de Datanomics y fechas de
1982. Para localizar un plano sin ir página a página, va bien montar una hoja
de contactos recortando la esquina inferior derecha (el cajetín) de cada página
y pegándolas en rejilla.

### Los otros 14 documentos

| Fichero | Qué es |
|---|---|
| `1977_synthi_100_sch.pdf` | **63 páginas de esquemas** (escaneo). Donde mirar los planos D100 citados arriba |
| `1977_synthi_100_sheet.pdf` | Hoja de especificación de 1977, 2 páginas |
| `Handbook for Synthi 100.pdf` | 93 páginas, escaneo. Manual de uso |
| `ElectronicStudio-manual.pdf` | 127 páginas, escaneo. Manual de estudio electrónico |
| `1971_synthi_100.pdf` | Folleto de especificación de EMS de 1971. **El mismo** que está transcrito en `manual_ems_1971/` |
| `1970_ems_synthi_users_manual.pdf` | Manual de usuario de 1970, 25 páginas |
| `EMSSynthi-EducationalHandbook.pdf` | Peter Grogono, abril 1972, 90 páginas **con texto** |
| `ems-synthi-aks-service-manual-481665.pdf` | Service manual del Synthi AKS (no del 100), con diagramas |
| `Gould OS300 Dual Trace Oscilloscope Manual and Schematic.pdf` | El osciloscopio es un aparato comercial; este es su manual |
| `Synthi 100.Nomination.V7.27 May 2016_0.pdf` | Nominación de patrimonio de ingeniería (Australia), contexto histórico |
| `FrancesMorgan-LibrarySubmission-RedactedCopy.pdf` | Tesis doctoral (RCA, 2020), 300 páginas, contexto histórico |
| `Synthi_V_Manual_1_0_1_EN.pdf` | Manual del Synthi V de Arturia (emulación comercial del VCS3) |
| `colossus.pdf`, `colossus manual.pdf` | Analogue Solutions Colossus, sintetizador moderno inspirado en el Synthi 100 |

---

## Jerarquía de fuentes

1. **`Synthi 100 Technical Manual`** y los esquemas D100. Es la máquina de la
   serie de Cuenca. Lo que diga aquí, va a misa.
2. **Extractos vía NotebookLM** de los manuales técnicos de 1982, ya en este
   directorio (`*_notebooklm.txt`, `*_MANUALES.txt`). De ahí salieron varios
   módulos ya implementados.
3. **Folleto de EMS de 1971** (`manual_ems_1971/`). Máquina anterior: misma
   arquitectura, **otra electrónica**. Sirve para entender la intención de
   diseño y para descubrir módulos, **no para fijar valores**. Ya indujo tres
   recomendaciones erróneas (ver el aviso en `manual_ems_1971/NOTAS.md`).

---

## Carpetas

| Carpeta | Estado del módulo |
|---|---|
| `echo/` | **Sin implementar.** Especificación completa transcrita del manual |
| `envelope_shapers/` | Implementado |
| `manual_ems_1971/` | Transversal: folleto de 1971 y contraste con el código |
| `octave_filter_bank/` | Implementado |
| `output_channels/` | Implementado |
| `pitch_to_voltage_converter/` | Implementado |
| `sequencer/` | Implementado |
| `spring_reverb/` | Implementado (falta la segunda unidad). **Con el esquema D100-16 C1** |
