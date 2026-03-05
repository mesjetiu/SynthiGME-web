# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Modos de toque para teclados**: Tres modos de interacción táctil/mouse en los keyboards SVG, seleccionables desde el menú contextual: Normal (comportamiento estándar), Latch (toggle: cada clic alterna on/off, acumula varias teclas, glissando retiene cada tecla tocada) y Legato (una sola tecla activa: al pulsar otra se libera la anterior). Los modos solo afectan a la interacción SVG — MIDI externo siempre respeta on/off estrictamente. Preferencia persistida en localStorage. Traducciones en 7 idiomas.
- **Módulo de teclado dual (Keyboard Module)**: Implementación completa del módulo de audio de los teclados duales del Synthi 100. Cada teclado (upper/lower) genera 3 salidas CV: Pitch (1V/Oct con spread=9, pivote F#3), Key Velocity (0 a ±5V proporcional a pulsación) y Gate (0V/±gateLevel, sin memoria). High-note priority, sample & hold en note-off, retrigger gap de 2ms. 6 filas nuevas en Panel 6 de control (111-116) como fuentes de modulación. Knobs del Panel 4 (Pitch vernier, Key Velocity, Env. Control) y selector rotativo de Retrigger conectados al módulo de audio. AudioWorkletProcessor dedicado, dormancy automático, sincronización OSC completa (`/keyboard/{upper|lower}/{noteOn|noteOff|pitchSpread|velocityLevel|gateLevel|retrigger}`): pulsaciones MIDI se envían y reciben por OSC con anti-feedback. Lazy start al primer pin o nota MIDI/OSC. Serialización/deserialización de estado, reset a defaults, y señalización en signal flow y matrix tooltip. Traducciones en 7 idiomas.
- **MIDI Learn en teclados flotantes**: Soporte completo de MIDI Learn para los keyboards upper/lower. Menú contextual con MIDI Learn/Unlearn sobre cualquier tecla. Mapea todo el dispositivo+canal (no una nota concreta), reenviando noteon/noteoff, CC y pitchbend. Feedback visual en SVG: las teclas bajan al tocar el teclado MIDI externo. Funciona aunque la ventana esté cerrada. Traducciones keyboard.upper/lower en 7 idiomas.
- **Teclados flotantes**: Ventana PiP flotante con SVG de los teclados duales del Synthi 100 (vista superior). Sin marco, arrastrable solo desde zonas de housing (raíles, cuero, mejillas), feedback visual de teclas (press/hover), resize con aspect ratio fijo (968:338), menú contextual para cerrar, botón en quickbar con icono de piano, entrada en menú Electron (Paneles → Keyboards), persistencia de posición/tamaño en localStorage. Traducciones en 7 idiomas.
- **Financiación pública**: Logos de financiación (UE, Fondos Europeos, JCCM, UCLM, Fuzzy Gab) en créditos de la app (Ajustes → Acerca de) y README. Imágenes en `src/assets/icons/funding/` y `resources/funding/`. Traducciones en 7 idiomas.
- **Panel 4 blueprint v2**: Estructura visual del Panel 4 con 3 filas: 8 voltímetros (placeholder), Sequencer Event Time (placeholder) y Keyboard Output Range con 7 columnas. Implementadas columnas 1-3: Pitch Voltage Converter + Envelope Followers 1-2 (col 1, apilados), Upper Keyboard (col 2) y Lower Keyboard (col 3) con vernier dials, knobs de colores y selectores rotativos. Columnas 4-7 como placeholders vacíos. Método `_buildPanel4()` en app.js con creación dinámica de DOM desde blueprint.
- **Selector rotativo (RotarySwitch)**: Nuevo componente UI para interruptores rotativos de 2 posiciones, fiel al hardware original del Synthi 100. SVG con base metálica, cuerpo cilíndrico oscuro e indicador que rota ±45°. Usado en Panel 4 para Retrigger Key Release (ON/KBD). Clase `RotarySwitch` con API idéntica a `Toggle`.
- **knobColors en blueprints**: Declarados los colores originales de cada knob en los blueprints de paneles 2, 3 y 7. Centraliza la definición para futura refactorización de los archivos UI.
- **MIDI Learn**: Sistema completo de mapeo MIDI para cualquier control del sintetizador (knobs, sliders, toggles). Menú contextual con "MIDI Learn" / "Quitar MIDI" en cada control. Soporta CC, Note On/Off y Pitch Bend, todos los dispositivos activos simultáneamente, anti-feedback sin pérdida de mensajes. Persistencia en localStorage + exportar/importar JSON. Pestaña MIDI en Ajustes con dispositivos detectados, tabla de mappings y acciones. Overlay visual durante learn con estado de dispositivos. Apertura explícita de puertos MIDI (imprescindible en Linux). Escalado de valor MIDI al rango real de cada control (0-10 para sliders, min-max para knobs). Menú nativo Electron con activar/desactivar MIDI, contadores de dispositivos y mappings, limpiar/exportar/importar y acceso a ajustes. Traducciones en 7 idiomas. 76 tests unitarios (parsing, claves, conversión, rangos, anti-feedback, toggles, mappings).
- **Random Control Voltage Generator (RCVG)**: Implementación completa del generador de voltaje de control aleatorio (placa PC-21, D100-21 C1). Reloj interno 0.2–20 Hz con jitter temporal configurable, dos salidas DC aleatorias independientes (±2.5V, distribución uniforme, pot LOG 10K) y pulso Key de 5ms (±5V, bipolar). Tres filas en Panel 6 (89=Key, 90=V1, 91=V2) como fuentes de modulación CV. AudioWorkletProcessor dedicado, dormancy automático, sincronización OSC (`/random/*`), tooltips con frecuencia/período/voltaje/varianza, y lazy start al primer pin.
- **Tests RCVG**: 211 tests para el generador de voltaje de control aleatorio: config (estructura, matrix rows, audio, LOG, ramps, knobs, coherencia), worklet (meanDialToFreq exponencial, varianceDialToNorm, jitter, constantes, process() 3 canales, Key pulse, dormancy con preservación de fase), módulo (inicialización, LOG gain, bipolar key, clamping, getOutputNode, dormancy), OSC (5 direcciones, coherencia con oscAddressMap), blueprint Panel 6 (3 fuentes, filas 89-91), dormancy (transiciones, _findModule), tooltips (mean freq/período, variance %, voltage LOG/dB, key V/ms).

### Corregido
- **Retrigger del teclado corregido según manual**: El switch Retrigger Key Release (ON/KBD) del Panel 4 ahora implementa la lógica correcta del hardware Synthi 100 Datanomics 1982. Mode Kbd (0): staccato — la envolvente solo se redispara tras soltar todas las teclas (legato sin retrigger). Mode On (1): legato con retrigger — cualquier cambio de pitch (nota más aguda pulsada o nota aguda soltada) genera retrigger automático. Corregido también el retrigger en noteOff con cambio de pitch. Labels del selector rotativo alineados con la posición ON/KBD del panel original. 10 tests nuevos de lógica de retrigger.
- **Fórmulas de Velocity y Gate del teclado corregidas según manual**: Velocity ahora es `(vel/127) * velocityLevel` → rango 0 a ±5V (antes era ±3.5V con offset central erróneo). A dial=0 la velocity no tiene efecto (0V), a dial=+5 pulsación rápida da +5V, a dial=-5 invierte (louder→softer). Gate ahora va de 0V (tecla soltada) a +gateLevel (tecla pulsada), sin memoria — el voltaje desaparece inmediatamente al soltar (antes era simétrico ±level erróneamente).
- **Escalado de pitch del teclado 4× demasiado alto**: La salida de pitch del worklet de teclado no tenía en cuenta `DIGITAL_TO_VOLTAGE=4.0` del sistema CV, causando que 3 semitonos sonaran como 1 octava. Ahora la fórmula divide por DIGITAL_TO_VOLTAGE: 1 octava a spread=9 produce 0.25 digital → ×4800 = 1200 cents correctos.
- **Escalado de velocity y gate del teclado 4× demasiado alto**: Igual que pitch, las salidas de velocity y gate emitían valores en voltios directos (±5) cuando el sistema espera unidades digitales (1 digital = 4V). Corregido dividiendo por DIGITAL_TO_VOLTAGE. Dial +5 ahora produce 1.25 digital = 5V reales. Tests de cadena de audio end-to-end añadidos (148 tests totales).
- **Escalado de salidas del Random CV Generator**: Las ganancias de V1/V2 y Key no tenían en cuenta `DIGITAL_TO_VOLTAGE=4.0`. V1/V2 a dial máximo producían ±4V en vez de ±2.5V (×1.6 exceso). Key a dial ±5 producía ±4V en vez de ±5V (×0.8 defecto). Corregido: `_levelDialToGain` ahora escala por `VOLTAGE_PEAK/DIGITAL_TO_VOLTAGE` (gain max 0.625), `_keyDialToGain` por `KEY_VOLTAGE_PEAK/(5×DIGITAL_TO_VOLTAGE)` (gain max ±1.25).
- **Teclados SVG sin envío de notas**: Al pulsar teclas en la ventana flotante SVG no se despachaban eventos `synth:keyboardMIDI`, por lo que no se generaba audio ni se enviaban notas por OSC. Ahora `pressKey`/`releaseKey` despachan el evento con nota MIDI correcta. Añadida función `keyIdToMidiNote()` para mapeo inverso ID SVG → MIDI. Guard `source:'svg'` para evitar feedback loop con el listener de feedback visual.
- **Glissando en teclados flotantes**: Las teclas no se iluminaban visualmente al arrastrar rápido sobre el teclado. Hit-testing reescrito con caché de rects (sin acceso al DOM), interpolación lineal cada 3px entre posiciones del puntero, `getCoalescedEvents()`, y flash timer de 20ms para garantizar que el navegador renderice cada pulsación. Eliminada transición CSS de las teclas.
- **Menú Electron keyboard**: Corregida desincronización del checkbox al mostrar/ocultar teclados desde el menú nativo. El menú ahora envía estado explícito (visible/oculto) en vez de toggle ciego, y el módulo se precarga al inicio para evitar fallos por import asíncrono.
- **RCVG dormancy**: Pulso key espurio al despertar de dormancy. Los eventos fantasma internos establecían `_keySamplesRemaining` pero nunca lo decrementaban durante dormancy, produciendo un pulso key parcial sin evento asociado al despertar. Ahora se resetea al transicionar de dormant a activo.
- **MIDI Learn**: Corregido rango de valores — el slider (0-10) recibía valores normalizados 0-1, cubriendo solo el 10% del recorrido. Corregida pérdida de mensajes MIDI rápidos — el anti-feedback descartaba mensajes entrantes en vez de aplicar siempre el último valor recibido.
- **MIDI Learn keyboard en Ajustes**: Los mappings de teclado ahora aparecen en la tabla de asignaciones MIDI (Ajustes → MIDI) al cambiar de pestaña. Origen muestra "Keyboard (Ch N)" en vez del nombre redundante del dispositivo.

### Cambiado
- **Tamaño proporcional de teclados flotantes**: El tamaño por defecto del teclado es proporcional a la pantalla (~50% del ancho de viewport) en vez de fijo en 680px. Si el usuario redimensiona manualmente, su tamaño se guarda y se respeta al reabrir. Posición inicial centrada cerca del borde inferior.
- **Rendimiento de knobs**: Eliminada transición CSS (30ms) de `.knob-inner` y `#vd-rotor` que causaba retardo visual durante drag; reemplazada por `will-change: transform` para composición GPU. TextContent del valor y contador solo se escriben al DOM cuando realmente cambian, evitando layout thrashing durante interacción.
- **Toggles SVG escalables**: Integrado el nuevo toggle SVG en todos los osciladores y canales de salida. Eliminados artefactos de glow, focus y tap highlight. El factor de escala ahora se controla por blueprint y se aplica correctamente vía CSS `transform: scale()`. Corregido el factor de escala en panel3.blueprint.js y panel7.blueprint.js para visualización proporcional.
- **Output Channel sliders**: Añadido `shellWidth` independiente del ancho del fader. Eliminada configuración duplicada de slider (`layout.lowerRow.slider` → única fuente de verdad en `outputChannelUI.sliderSize`). Fijado layout vertical de los canales con `align-items: flex-start` para que los gaps no muevan todo el panel.

### Añadido
- **Knob Vernier multivuelta (Spectrol)**: Dial de frecuencia del oscilador reemplazado por SVG realista del Spectrol Model 15 con 10 vueltas completas (3600°), disco negro giratorio, anillo plateado fijo con reflejos cónicos, hexágono central, ventana con contador digital (0-10) que indica la vuelta actual, y palanca de freno. Clase `VernierKnob` hereda toda la interacción de `Knob` (drag, tooltips, precisión progresiva, serialización).
- **Knobs SVG del Synthi 100 original**: Anillo/escala como SVG inline (cargado con `svgInlineLoader.js`, IDs únicos por instancia). Centro de color como div `.knob-center` separado fuera de `.knob-inner` para que NO gire; color vía CSS `--knob-center-color`. Colores del original: azul, verde, blanco, negro, rojo, amarillo. Rango de giro 300°. Diseño CSS anterior conservado como fallback.
- **Selector de estilo de knobs en Ajustes**: Opción en Interfaz para alternar entre knobs SVG auténticos del Synthi 100 (por defecto) y knobs CSS simplificados. Persistencia en localStorage.
- **PWM CV desde matriz de audio (Panel 5)**: Columnas 59-64 permiten modular el ancho de pulso de los osciladores 1-6 desde cualquier fuente de audio. Routing completo: source → filtro RC → GainNode → pulseWidth AudioParam. Escala PWM derivada del config de pulseWidth (max−min)/2, tooltips con KNOB_POT_MAX_VOLTAGE, i18n (7 idiomas), glow de flujo de señal y sincronización OSC incluidos. 7 tests Playwright de audio + 5 blueprint + 2 tooltip + 1 signal flow.
- **Easter egg**: Desintegración visual del Synthi (knobs, sliders, módulos, paneles flotan, giran, explotan y se recomponen con paleta sombría-colorida) + pieza electroacústica "Studie II" (35s, 6 secciones) al completar secuencia de 8 taps alternados en frames de joystick (L,R,L,R…). Cuenta atrás 3-2-1 en los últimos taps. Backdrop estático + overlay animado (dos capas). Sonido siempre activo (ENFORCE_CLEAN_CHECK=false, infraestructura isDirty preservada). Chiptune 8-bit como pieza alternativa. 98 tests.
- **Undo/Redo global**: Deshacer/rehacer basado en snapshots (hasta 50 estados). Botones en quickbar, Ctrl+Z / Ctrl+U. Se limpia al cargar patch o resetear.
- **Confirmación de reinicio opcional**: Checkbox "No volver a preguntar" en el diálogo de reinicio. Opción en Ajustes > General para reactivar/desactivar la confirmación. Se sincroniza con la casilla del diálogo.
- **PiP mejorado**: Auto-lock/unlock de canvas al extraer/cerrar paneles. Escala contain (panel siempre visible completo). Placeholder requiere long-press o click derecho para devolver panel. Resize desde cualquier borde/esquina. Paneo con ratón y flechas. Maximizar/restaurar sin perder posición.
- **Menú contextual jerárquico**: Clic derecho (o long press en móvil) con opciones por elemento: extraer/devolver panel, reiniciar panel, módulo o control concreto. Valores por defecto leídos de configs de módulos (fuente única de verdad).
- **Manejo global de errores**: Captura con `window.onerror`, `unhandledrejection` y `processorerror` en AudioWorklets. Try/catch en worklets críticos con silencio limpio. Toast unificado con niveles de severidad reemplazando 3 sistemas independientes.
- **Telemetría anónima opt-in**: Cola de eventos con flush periódico, cola offline, sendBeacon. Backend Google Apps Script → Sheets + alertas Telegram. Consentimiento en primer inicio, toggle en Ajustes y menú Electron.
- **Atajos de teclado ampliados**: Flechas para paneo del canvas. Zoom Ctrl+/−/0 ahora también en navegador (PWA).\n- **Doble tap/clic para zoom a panel**: Doble tap en zona no interactiva de un panel centra y ajusta ese panel al viewport. Validación de proximidad (50px) para evitar falsos positivos.
- **Opciones de interacción táctil**: Pan con un dedo (ON por defecto) y controles multitáctil (OFF por defecto, evita cambios accidentales durante zoom/pan).
- **Rasterización adaptativa**: Re-rasterización del DOM al hacer zoom para nitidez a resolución real. Desactivada por defecto.
- **Panel 1 blueprint v2**: 16 módulos placeholder (filtros, envelopes, ring modulators, reverb, echo) con 57 knobs y ajuste fino de layout. 68 tests.
- **Panel 2 blueprint v2**: Oscilloscope funcional, Input Amplifier Level funcional (8 canales) y 3 módulos placeholder. Textos ocultos con CSS (ya en imagen de fondo). Knobs y toggle del osciloscopio integrados en sistema de estado: persistencia entre sesiones, guardado/carga en patches y reinicio a valores iniciales (global, panel, módulo y control individual). 36 tests.
- **Panel 7 joysticks y sequencer**: Joysticks Left/Right con 2 knobs y pad circular. Sequencer con 8 switches, 8 botones y knob Clock Rate. Ajuste fino independiente por lado.
- **Entrada multicanal PipeWire 8ch**: 8 canales independientes directo a Input Amplifiers, con activación conjunta y comunicación lock-free via SharedArrayBuffer.
- **Respuesta lineal de faders**: Opción para control de ganancia lineal en Output Channels. CV externo sigue con curva logarítmica 10 dB/V del VCA CEM 3330.
- **Noise Generator mejorado**: Filtro COLOUR auténtico (1er orden, 6 dB/oct, circuito RC del Synthi 100 Cuenca). Filter bypass en posición neutral. Tooltips con tipo de filtro, fc, Vp-p y dB.
- **Electron: confirmación al salir**: Diálogo traducido en Archivo > Salir, Alt+F4 y botón X. 46 tests de contratos Electron-menú.
- **Botones de reset para matrices de entrada**: Estéreo y multicanal con "Restaurar por defecto".
- **Tests de precisión V/oct**: 13 tests de integración para modulación FM 1V/octava.
- **Resaltado de flujo de señal**: Hover/tap sobre módulo o pin muestra orígenes (cyan) y destinos (magenta) con glow animado. Funciona sin tecla modificadora por defecto. Pines muestran flujo independientemente de si están activos. Activar/desactivar en Ajustes > Interfaz (opción de tecla modificadora subordinada e indentada). 86 tests.
- **Notas post-it en paneles**: Notas arrastrables y editables sobre cualquier panel (canvas y PiP) y en el viewport (espacio libre entre paneles). Arrastre desde la zona de texto (además del header); doble clic o menú contextual para editar texto. Notas visibles al sobresalir de cualquier panel (incluido panel 7); panel elevado durante arrastre para no quedar bajo paneles adyacentes. Menú contextual en viewport para crear/pegar notas. Arrastre limitado para que la barra de título nunca salga del panel. Texto enriquecido (negrita/cursiva con Ctrl+B/I). Alineación izquierda/centrado/derecha en menú contextual. Menú contextual propio (cortar/copiar/pegar texto, formato, alineación, editar). Copiar/cortar/pegar notas entre paneles. Botones A+/A- para tamaño de fuente (rango 4–72px) con auto-repeat al mantener pulsado. 6 colores seleccionables. Resize hasta 50×36px. Persistencia en localStorage y patches. Eventos aislados (no traspasan al panel). 100 tests.

### Cambiado
- **Fondo del Synthi aclarado a blanco mate** (`--synthi-bg-color: #e8e4e0`).
- **Reorganización de Ajustes y menú Electron**: Pestañas reducidas de 7 a 6 ("Visualización" → "Interfaz", "Grabación" fusionada en "Audio"). Nuevo menú "Preferencias" en Electron. "Restaurar ajustes" sustituye a "Reiniciar sintetizador" en Avanzado.
- **Panel 3: fondo SVG con textos Microgramma y dibujos de osciladores** en sustitución del JPG provisional.
- **Color de fondo unificado en todos los paneles**: Variable CSS `--synthi-bg-color: #b9afa6` (tomado de foto del Synthi real). Se aplica a paneles 1-7; las imágenes de fondo se superponen y las transparencias muestran este color.
- **"Input Amplifiers" → "Input Amplifier Level"**: Nombre corregido en toda la app según Synthi 100.
- **Output Channel: filtro RC auténtico (1er orden, 6 dB/oct)**: Escala -5 a +5. Circuito RC pasivo del Synthi 100 Cuenca: pot 10K LIN + 2× 0.047µF, transición continua LP↔plano↔HP.
- **Panel 7 Blueprint refactorizado**: Separación blueprint/config completa. Layout dos filas, offsets por módulo, ajuste fino real en knobs y switches verticales.
- **Paneles 1 y 2: ajuste fino de layout**: Soporte real de offsets, knobGap, knobSize, knobInnerPct y offsets por módulo en blueprints. Panel 2 refactorizado: todos los módulos con tamaño fijo en px (`size: { width, height }`), eliminados `flex`, `auto` y tamaños relativos para control preciso del layout.
- **Salida multicanal expandida a 12 canales**: Pan 1-4 L/R, Pan 5-8 L/R (buses estéreo) y Out 1-8. Ruteo unificado con envío a múltiples canales simultáneos. Modo de salida separado del dispositivo con radio buttons.
- **Electron: atajos de recarga bloqueados**: F5, Ctrl+R, Ctrl+Shift+R deshabilitados para evitar reinicios accidentales.
- **Electron: Buscar actualizaciones abre GitHub Releases** en navegador externo.
- **UI: selector de resolución oculto**. La app siempre inicia en 1x.

### Cambiado (herramientas)
- **Script de optimización SVG generalizado**: `optimize-panel-svg.mjs` → `optimize-svg.mjs`. Preserva IDs referenciados (`url(#)`, `href`, `xlink:href`). Eliminación de imágenes opcional (`--keep-images`). Salida por defecto = mismo archivo (in-place). Corregidas regex para elementos sodipodi self-closing y atributos con dígitos (`sodipodi:r1`, `arg2`, etc.). Remapeo automático de fuentes Inkscape→web (`Microgramma D Extended` → `Microgramma Extended`); los SVGs de `design/` mantienen el nombre de sistema para Inkscape.
- **SVGs optimizados**: knob.svg −53%, knob-0-center.svg −53%, panel_3.svg −55%. Centro de color (`<circle id="knob-center-color">`) y gradiente de brillo integrados en los SVG de diseño y optimizados. Tamaño de fuente de knobs ampliado a ~22px.
- **Colores de centro de knobs centralizados**: `configs/knobColors.js` como fuente única de verdad. Color aplicado vía CSS `--knob-center-color` en div `.knob-center` no-rotatorio. Eliminados archivos `centro-knob-*.svg` individuales por color.

### Corregido
- **Knobs bipolares (knob-0-center) mostraban valor incorrecto**: El SVG bipolar tiene rotación interna de 150° que no se compensaba en CSS. Añadido `angleOffset` en Knob (−150° para bipolares) para que la escala −5/+5 muestre el valor correcto.
- **Fuente Microgramma en móvil**: El SVG de panel 3 usaba `font-family:'Microgramma D Extended'` (nombre PostScript local) y se cargaba como `background-image` (aislado del DOM). En móvil la fuente no existe y no heredaba los `@font-face` WOFF2. Corregido: renombrado a `'Microgramma Extended'` (204 ocurrencias) e inyección inline del SVG en el DOM. Ajustado también `font-weight: 600` → `700` en 8 selectores CSS con `--font-synthi`.
- **Knobs SVG: centrado preciso del anillo**: La rotación del grupo SVG se delega a CSS (`transform-origin: 50% 50%`) eliminando el pivot descentrado de Inkscape. SVG sin transform en el grupo principal; ángulos CSS 150°–450°.
- **Viewport no restauraba posición/zoom entre sesiones**: El handler de estabilización de `visualViewport` reseteaba incondicionalmente a vista general durante los primeros 4s de carga, machacando el estado restaurado de localStorage. Ahora respeta `userHasAdjustedView`. Guardado periódico con debounce (2s) además de `beforeunload`/`visibilitychange`.
- **Glow condicional en todos los controles**: Flash de glow solo cuando el valor cambia realmente (knobs, pads, pines, toggles, sliders, switches). Evita flash masivo innecesario al resetear con valores ya en su estado por defecto. Mejora rendimiento con matrices grandes.
- **Joystick pads no se reiniciaban desde quickbar**: El handle visual del pad no se actualizaba al reiniciar el sintetizador desde el botón de quickbar o atajo de teclado, aunque el estado de audio sí se reseteaba.
- **DSP on/off: patch sin sonido tras off→load→on**: Al encender DSP siempre se re-aplica el patch actual.
- **Joystick pad**: Arrastre llegaba solo a ~0.8. Inoperable en PiP tablet. Halo activo añadido.
- **Output Channel DC blocker**: Reposicionado a salida de altavoces (fc=1Hz). Re-entry DC-transparente para CV.
- **PiP: múltiples correcciones**: Resize, filtrado de eventos, paneo táctil unificado, viewport restaurado al cargar patch, controles bloqueaban gestos táctiles, centrado al abrir, paneles recortados.
- **Doble click/tap en controles no activa zoom de panel**: Lista de selectores interactivos corregida. Validación de proximidad: dos clics en zonas distintas del panel ya no se interpretan como doble clic (distancia máxima 50px).
- **Tooltips**: Superpuestos en táctil (exclusión mutua). Calibración V/oct en knobs de nivel. Frecuencia muestra voltaje 0-10V del potenciómetro. Shape muestra voltaje (0-10V) y duty cycle con indicador `+ CV` cuando hay modulación conectada. Sin activación accidental durante pan/zoom. Tooltip de pines no desaparece mientras el ratón sigue encima (auto-hide solo en táctil).
- **Menú contextual**: Knobs bloqueaban click derecho. Detección de controles individuales. Output channel individual. Interpolación de nombres. Cierre en móvil/Escape. Safari iOS.
- **Reinicio global: valores por defecto leídos de configs** (eliminados valores hardcoded incorrectos).
- **OSC**: Frecuencia mapeaba 0-100 en lugar de 0-10. Mensajes propios filtrados por IP local.
- **Electron: menú sin comunicación con la app**: Bridge añadido al inicio. Sincronización bidireccional (7 problemas). Cadenas traducidas.
- **Patch load: módulos dormant no restauraban nivel**: Forzada actualización síncrona de dormancy.
- **Stereo buses multicanal**: Reconexión tras forcePhysicalChannels. Routing persistente. Aislamiento estéreo/multicanal.
- **Re-entry de Output Channels**: DC blocker 1er orden (fc=0.01Hz) elimina drift sub-Hz. Ganancia unitaria corregida.
- **Notas en viewport sin menú contextual**: El bloqueador global capturaba el evento antes de llegar al handler de la nota.
- **Notas recortadas al sobresalir del panel**: `overflow: hidden` en paneles y PiP impedía ver la parte que sobresalía; cambiado a `overflow: visible`.
- **Copiar/pegar notas no preservaba tamaño**: Se leía `style.minHeight` (vacío) en vez de dimensiones computed, y notas de viewport (px) se interpretaban como porcentaje al pegar en panel. Corregido con detección de contexto (viewport/panel) y conversión de unidades.
- **Grabación: canales POST-switch** respetan estado on/off.
- **Output Channels: switches apagados por defecto**.
- **Dormancy: Output Channel despierta con Voltage Input** (Panel 6).
- **Canvas: límite de paneo** máximo 25% viewport vacío. Bloqueo táctil consistente.
- **Créditos actualizados** en Ajustes.
- **Compatibilidad localStorage Node.js 25+**: Mock global reutilizable para tests.

### Eliminado
- **Menú Electron: "Bloquear paneo" y "Bloquear zoom"**: Sin efecto en desktop.

## [0.5.0] - 2026-02-03

### Añadido
- **Precisión progresiva en knobs**: Control de velocidad mediante desplazamiento horizontal (izquierda = 0.1x preciso, derecha = 10x rápido). Factor continuo calculado con `Math.pow(10, normalizedDx)` desde -1 a +1. Funciona en táctil y desktop, compatible con modificadores Shift/Ctrl.
- **Audio multicanal lock-free**: 8 canales independientes via PipeWire nativo en Electron/Linux. Comunicación SharedArrayBuffer entre AudioWorklet y C++ elimina clicks durante interacción con UI.
- **Soporte multiidioma expandido**: Cinco nuevos idiomas además de español e inglés (Français, Deutsch, Italiano, Português, Čeština). Sistema i18n completo con fallback a inglés para traducciones incompletas.
- **Rampas suaves para controles manuales**: Knobs y sliders usan `setTargetAtTime` para evitar "zipper noise". Configurable por módulo en `oscillator.config.js` y `outputChannel.config.js`. CV de matriz y OSC siguen siendo instantáneos para modulación precisa.
- **VCA CEM 3330 en Output Channels**: Emulación del VCA de la versión Cuenca/Datanomics 1982. Curva logarítmica 10 dB/V, corte mecánico en posición 0 (ignora CV externo), saturación suave para CV > 0V. Filtro anti-click τ=5ms limita modulación a <32 Hz (comportamiento fidedigno al hardware, sin selector "Fast Response"). CV de matriz (columnas 42-49) se procesa correctamente a través del modelo VCA.

### Arreglado
- **Modal de ajustes en móvil**: Dropdown desplegable para selección de pestañas, scroll vertical funcional y altura adaptada a viewport dinámico (85dvh).
- **Output Channel: sincronización de power switch al inicio**: El estado del switch on/off de cada canal se sincroniza correctamente con el engine al arrancar. Antes, canales con switch desactivado se comportaban como activos hasta interactuar con ellos.
- **Matriz de audio: clamp de filtro RC**: Se limitan las frecuencias de corte de pines a 24 kHz para evitar warnings de Web Audio al crear filtros de pin con $f_c$ muy alto.
- **ConfirmDialog accesible**: Se elimina `aria-hidden` antes de hacer focus en el botón de confirmar, evitando el warning de accesibilidad.

## [0.4.0] - 2026-01-30

### Añadido
- **Soporte OSC (Open Sound Control)**: Servidor integrado en Electron para comunicación con SuperCollider, Max/MSP, etc. Ventana de log en tiempo real, configuración en Ajustes.
- **Sincronización OSC de osciladores**: Los 12 osciladores envían/reciben mensajes OSC (frequency, levels, shapes, switch HI/LO). Control remoto peer-to-peer.
- **Aplicación de escritorio Electron**: Empaquetado para Linux (AppImage) y Windows (NSIS + portable). Menú nativo, iconos, persistencia y nombre "SynthiGME" en mezcladores.
- **Emulación de voltajes Synthi 100**: 8 tipos de pines con resistencias y ganancias según Datanomics 1982. Menú contextual para tipo de pin y tooltips técnicos.
- **Emulación DSP analógica**: Thermal Slew, saturación ±12V, filtrado RC por pin, soft clipping CV y modelo CEM 3340 (1V/Oct).
- **Paneles flotantes (PiP)**: Extraer paneles a ventanas independientes con persistencia de estado.
- **Tests de audio (Playwright)**: Suite DSP en Chromium headless. Comando `test:all` con resumen estructurado.
- **Hard sync en matriz**: Columnas 24-35 exponen sincronización de los 12 osciladores.
- **Sistema de dormancy**: Suspensión automática DSP en módulos inactivos (~95% ahorro CPU).
- **Tooltips informativos**: Knobs (Hz, V, %, CV) y pines de matriz (ruta, resistencia, ganancia).

### Cambiado
- **Patches v2**: Formato simplificado con valores UI (0-1). Más compacto y resiliente.
- **Osciladores multi-waveform**: Único worklet genera 4 formas de onda (~70% menos nodos). Fase unificada.
- **Seno híbrido**: Precisión digital + modelado analógico, sin "kinks".
- **Voltajes calibrados**: Según Manual Datanomics 1982 (Sine 8V, Saw 6.2V, Tri/Pulse 8.1V).
- **Modal de ajustes rediseñado**: Layout de dos columnas con sidebar, iconos SVG y responsive.

### Arreglado
- **AudioWorklet→AudioParam**: Condicionales bloqueaban señal. Operaciones aritméticas puras.
- **Calibración 1V/Oct**: Factor corregido (1200→4800). +1V = ×2 frecuencia.
- **Cachés Electron**: Limpieza automática de code/HTTP cache. Service Worker deshabilitado.
- **Carga worklets móvil**: Race condition corregida con reintentos.

## [0.3.0] - 2026-01-11

### Añadido
- **Stereo buses (Pan 1-4 y Pan 5-8)**: Dos buses estéreo con control de panning que mezclan los 8 canales de salida en dos grupos de 4.
- **Filtro bipolar LP/HP** en cada canal de salida: Control único que actúa como low-pass (izquierda), bypass (centro) o high-pass (derecha).
- **Botón On/Off** en cada canal de salida para silenciar individualmente.
- **8 Input Amplifiers como fuentes CV** en matriz de control (filas 67-74).
- **8 Output Buses como fuentes** en matriz de audio (filas 75-82) y control.
- **Osciloscopio en matriz de control** (columnas 64-65) para visualizar señales de modulación.
- **Pistas de grabación aumentadas a 12**: Configuración de grabación WAV ahora permite hasta 12 pistas.
- **Tooltips en pines de matriz**: Desktop (hover) y móvil (toque) muestran "Origen → Destino". Labels localizables vía i18n.
- **Visualización de pines inactivos**: Pines sin source o destination aparecen atenuados (20% opacidad). Configurable en Ajustes → Visualización.
- **Infraestructura de tests mejorada**: Mocks de AudioContext para tests unitarios. Suite expandida a 355+ casos.

### Cambiado
- **Idioma de fallback i18n**: Cambiado de español a inglés para traducciones faltantes.
- **Mute separado de CV**: Nodo de mute independiente del nodo de CV para evitar bypass involuntario.

### Corregido
- **Pan modificaba volumen**: Corregido bug donde ajustar el pan alteraba el nivel de salida.
- **Atajos de teclado con controles enfocados**: Ahora funcionan correctamente cuando un control tiene foco.

## [0.2.0] - 2026-01-09

### Añadido
- **Matriz de control (Panel 6) operativa**: Modulación de frecuencia de osciladores desde la matriz.
- **Sistema exponencial V/Oct** para modulación de frecuencia: 1V por octava, rangos ±5 octavas.
- **Mantener pantalla encendida** (Screen Wake Lock API) con toggle en Ajustes → General, activado por defecto.
- **Diálogo de entrada de texto** (`InputDialog`) reemplazando `prompt()` nativo con soporte i18n.

### Cambiado
- SVGs de paneles 5 y 6 re-optimizados: Reducción ~74% (221KB → 58KB, 233KB → 61KB).
- Traducciones en caliente: Cambiar idioma actualiza inmediatamente sin recargar.

### Corregido
- Escala de renderizado (1×-4×) ahora se aplica correctamente al iniciar.
- Flujo de actualización mejorado: Instalación bajo demanda de nuevas versiones.

## [0.1.0] - 2026-01-08

### Añadido
- **Sistema de grabación de audio**: Exportación WAV multitrack (1-8 pistas) con matriz de ruteo configurable.
- **Sistema completo de atajos de teclado**: `M` (mute), `R` (grabar), `P` (patches), `S` (ajustes), `F` (fullscreen), `Shift+I` (reset), `0-7` (navegación). Personalizable con persistencia.
- **Diálogo de confirmación reutilizable** (`ConfirmDialog`) con opción "no volver a preguntar".
- **Sistema completo de patches**: Guardar, cargar, renombrar, eliminar, exportar/importar `.sgme.json`.
- **Autoguardado configurable** (desactivado, 30s, 1m, 5m, 10m) con restauración opcional al inicio.
- **8 Input Amplifiers**: Canales de entrada con control de ganancia individual.
- **PWA instalable** con soporte offline, manifest, service worker versionado y aviso de actualización.
- Panel con 8 salidas (output channels) con volumen y enlace a ambos canales stereo.
- Matriz grande de pines 63×67, optimizada para zoom y paneo.
- Sistema de AudioWorklets para síntesis con fase coherente y anti-aliasing PolyBLEP.

### Cambiado
- Gestos táctiles mejorados: Pan con dos dedos simultáneo a zoom.
- Vista inicial ajustada para mostrar todo el sintetizador.

## [0.0.1] - 2025-12-01
### Añadido
- Prueba de concepto mínima (interfaz + sonido).
- Primera publicación experimental con interfaz Web Audio funcional y build automatizada hacia `docs/` (modo PWA).
