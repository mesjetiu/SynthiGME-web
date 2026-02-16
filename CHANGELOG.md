# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Visibilidad de módulos en blueprints**: Nueva propiedad `visible` en los módulos de los blueprints. `visible: false` oculta el módulo (ocupa espacio pero invisible y no interactivo, `visibility: hidden` + `pointer-events: none`); `visible: true` lo marca como funcional. Aplicado en todos los paneles: Panel 1 (16 módulos, todos false), Panel 2 (3 false, 2 true), Panel 3 (2 true, Random CV false), Panel 7 (1 false, 10 true). Función `applyModuleVisibility()` en app.js.
- **Joystick Module**: Implementados los 2 joysticks (Left y Right) como módulos de audio completos. Cada uno con pad XY (±8V DC bipolar), knobs Range Y (superior) y Range X (inferior) con pot 10K lineal, integración en Panel 6 (filas 117-120), dormancy automática cuando ningún eje está conectado a la matriz, y serialización/deserialización de estado. Usa ConstantSourceNode nativo (sin worklet) para máxima eficiencia en señales DC.
- **Tooltips técnicos en joysticks (Panel 7)**: Los knobs `Range X/Y` ahora muestran valor Synthi (0-10), ganancia (`×`) y voltaje de salida estimado del eje teniendo en cuenta la posición actual del pad. El pad muestra salida estimada en voltios para ambos ejes (X/Y) y valores de ganancia (range + pad), con lectura dinámica de preferencias de Ajustes para parámetros electrónicos/audio.
- **Enlace a comunidad en Telegram**: Añadido enlace al grupo oficial [https://t.me/synthigme](https://t.me/synthigme) en README.md y en la pestaña "Acerca de" de Ajustes para soporte y feedback de testers. Traducciones en 7 idiomas.
- **Electron: prevención de suspensión del sistema**: Checkbox en menú Audio y sincronizado con la opción Wake Lock de Ajustes > General. Activado por defecto. Usa `powerSaveBlocker` de Electron (suspensión del sistema) + Wake Lock API web (pantalla) bajo una misma preferencia. Se activa al arrancar audio si la preferencia está habilitada. Traducciones en 7 idiomas.
- **Electron: atajo global Ctrl+Shift+M para silenciar**: Funciona incluso sin foco de la app, útil en actuaciones en directo. Usa `globalShortcut` de Electron, reutiliza el pipeline existente del menú (`menu:action` → `toggleMute`).

### Cambiado
- **PiP: placeholder no restaura con click accidental**: La sombra del panel extraído ya no se restaura con un simple click (fácil de activar por accidente). Ahora requiere pulsación larga (500ms, táctil) o click derecho (desktop) para mostrar menú contextual con la opción "Devolver panel". Traducciones actualizadas en 7 idiomas.
- **Reorganización de Ajustes y menú Electron**: Pestañas de ajustes reducidas de 7 a 6 con agrupación coherente por dominio. Pestaña "Visualización" renombrada a "Interfaz" (incluye ahora atajos de teclado). Pestaña "Grabación" eliminada, su contenido fusionado en "Audio". Secciones Actualizaciones y Telemetría movidas de Avanzado a General. Pestaña Avanzado queda solo con optimización, emulación de voltaje y restaurar ajustes. En Electron: nuevo menú "Preferencias" con idioma, opciones de visualización y opciones táctiles; menú "Ver" simplificado a solo controles de ventana; menú "Audio" unificado con un solo enlace a ajustes; menú "Paneles" limpiado de opciones táctiles. Traducciones actualizadas en 7 idiomas.
- **Título de ruteo de grabación clarificado**: "Ruteo de salidas" renombrado a "Ruteo de pistas de grabación" para evitar confusión con salida de audio.
- **Restaurar ajustes por defecto sustituye a reiniciar sintetizador en Ajustes**: El botón de Avanzado ahora borra todas las preferencias de localStorage y recarga la página, en lugar de reiniciar los módulos del sintetizador (que ya está disponible desde quickbar y menú Electron).

### Corregido
- **Tooltips superpuestos en tablet/táctil**: Al tocar un knob, pin de matriz o slider, el tooltip anterior (de cualquier tipo) se oculta automáticamente antes de mostrar el nuevo. En desktop no afecta porque los tooltips ya se cierran con mouseout. Nueva función `hideOtherTooltips()` en tooltipManager centraliza la exclusión mutua.
- **PiP: eventos de ratón/touch filtrados al canvas principal**: El doble click y doble tap en un panel PiP activaba el zoom del viewport principal porque los handlers del panel (`dblclick`, `touchend` double-tap) seguían activos dentro del PiP. Añadida guarda `panel--pipped` en `viewportNavigation.js` y bloqueo de mouse events legacy (`mousedown/up/move`) en el contenedor PiP.
- **PiP: paneo táctil con 1 dedo unificado con lógica de 2 dedos**: El paneo con un dedo en PiP usaba pointer events con `setPointerCapture`, que conflictuaba con pines de matrices y otros elementos interactivos (el pan se bloqueaba o avanzaba solo 1-2 píxeles). Eliminada la lógica duplicada: ahora usa touch events nativos (como el pinch de 2 dedos), sin captura de puntero. Pointer events restringidos exclusivamente al ratón.
- **Menú contextual en tablets: parpadeo al abrir con long-press**: El menú contextual vibraba/parpadeaba al abrirlo con pulsación larga en pantalla táctil por doble invocación (timer long-press + evento contextmenu nativo) y cierre prematuro por eventos sintéticos del finger-lift. Corregido con flag `suppressNextContextMenu`, `longPressFired` con `preventDefault` en touchend, y delay de cierre ampliado a 300ms en touch.
- **Menú Electron: cadenas sin traducir en Preferencias**: Las claves `menu.preferences` y `menu.preferences.settings` no se enviaban al proceso Electron, mostrando siempre "Preferences" y "All Settings…" en inglés. Corregida la lista de claves en electronMenuBridge.
- **Canvas principal: bloqueo de paneo consistente en táctil**: Al activar "bloquear paneo" en quickbar, ahora también se bloquea el paneo con un dedo (no solo el de dos dedos), unificando permisos y restricciones de navegación táctil.

### Añadido
- **Menú contextual jerárquico con reinicio**: Clic derecho (o long press en móvil) muestra opciones contextuales según el elemento clicado: extraer/devolver panel, reiniciar panel completo, reiniciar módulo individual (ej. "Reiniciar Osc 1") y reiniciar control concreto (ej. "Reiniciar Frequency"). Funciona tanto en paneles normales como en paneles flotantes PiP (donde muestra "Devolver panel" en lugar de "Extraer panel"). Nuevo módulo `contextMenuManager.js`, propiedad `initialValue` en Knob con método `resetToDefault()`, y traducciones en 7 idiomas. Los valores por defecto se leen de los configs de módulos (fuente única de verdad), compartidos con el reinicio global del sintetizador.
- **Manejo global de errores (Fases 1-2)**: Sistema de captura de errores no controlados con `window.onerror`, `unhandledrejection` y `processorerror` en AudioWorklets. Ring buffer en memoria con deduplicación, preparado para telemetría futura. Bootstrap protegido contra splash congelado, fallos de audio notificados al usuario, y handler `unhandledRejection` en Electron. Fase 2: try/catch en `process()` de los 3 worklets críticos (oscillator, VCA, noise) con silencio limpio y reporte único en caso de error. Protección de session restore con limpieza automática de estado corrupto. Toast unificado con niveles de severidad (info/success/warning/error) reemplazando los 3 sistemas de toast independientes. 30 tests nuevos.
- **Telemetría anónima (Fases 3-4)**: Módulo `telemetry.js` con cola de eventos en memoria, flush periódico (30s), cola offline en localStorage, sendBeacon al cerrar pestaña, rate limiting (20 eventos/sesión, 6 errores auto). Conexión automática con `errorHandler.onError()`. Backend Google Apps Script que inserta en Sheets (hoja mensual) y alerta a Telegram en errores. URL inyectada en build (`__TELEMETRY_URL__`), desactivada si vacía. Fase 4: diálogo de consentimiento opt-in en primer inicio, toggle en Ajustes > Avanzado y en menú Avanzado de Electron (sincronización bidireccional), textos i18n en 7 idiomas. Eventos instrumentados: session_start, first_run, error (auto), worklet_fail, worklet_crash, audio_fail, export_fail. 49 tests nuevos.
- **Navegación con flechas del teclado**: Las teclas de flecha permiten hacer paneo del canvas principal (15% del viewport por pulsación). Solo activas cuando no se está escribiendo en un campo de texto.
- **Zoom Ctrl+/Ctrl-/Ctrl+0 en navegador**: Los atajos de zoom que solo funcionaban en Electron ahora también funcionan en la versión web (PWA), previniendo el zoom nativo del navegador y controlando el zoom del canvas.

### Eliminado
- **Menú Electron: quitados "Bloquear paneo" y "Bloquear zoom"**: Opciones eliminadas del menú Paneles porque estaban inhabilitadas en desktop (solo afectaban a gestos táctiles móviles) y no tenían efecto.

### Corregido
- **Reinicio global usaba valores hardcoded incorrectos**: `_resetToDefaults()` reseteaba el colour del ruido a 0 (LP oscuro) en vez de 5 (white noise), la frecuencia del oscilador a 0 en vez de 5 (Do central), y el mean/key del Random Voltage a 0.5 en vez de 0. Ahora lee los valores iniciales directamente de los configs de módulos, eliminando la duplicación. Añadido `switches.range.initial` al config del oscilador.
- **Menú contextual: knobs bloqueaban clic derecho**: Los knobs hacían `stopPropagation()` en el evento contextmenu, impidiendo que el menú contextual apareciera sobre ellos. Corregido para que el evento burbujee al panel.
- **Menú contextual: no detectaba controles individuales**: Ahora detecta knobs, sliders y switches en output channels, además de los knob-shells de osciladores y módulos genéricos (noise, random voltage).
- **Menú contextual: reiniciar output channel reseteaba los 8 canales**: `_findModuleById` no resolvía output channels individuales. Ahora usa el ID del DOM (`output-channel-N`) para localizar el canal específico y resetearlo sin afectar a los demás.
- **Menú contextual: nombres mostraban `{name}` literal**: Las llamadas a `t()` usaban firma incorrecta `t(key, fallback, params)` cuando la función solo acepta `t(key, params)`. El objeto con el nombre se descartaba y el placeholder no se interpolaba.
- **PiP: menú contextual no se cerraba en móvil ni con Escape**: El cierre dependía de `click/contextmenu` en burbuja y quedaba bloqueado por `stopPropagation()` dentro de PiP. Añadido cierre por `pointerdown`/`touchstart` en captura y por tecla Escape en `contextMenuManager`.
- **Panel 7: halo activo en pads de joystick**: Los pads de joystick ahora muestran halo palpitante al pasar el ratón, tocar o arrastrar, igual que el feedback visual de controles activos en knobs/sliders.
- **Panel 7: `channelSize` ahora controla realmente ancho y alto de Output Channels**: El layout de la fila inferior aplica `lowerRow.channelSize.width` y `lowerRow.channelSize.height` al tamaño final de cada canal, en lugar de quedar limitado por reglas CSS fijas.
- **Panel 7: más ajuste fino en Output Channels y switch vertical**: Añadidos en `outputChannelUI` los parámetros `sliderSize`, `knobButtonGap`, `buttonSize` y `buttonSliderGap`. El botón On/Off de cada canal ahora es vertical (arriba = ON, abajo = OFF).
- **Panel 7: `outputChannelUI` aplica ajuste fino real en knobs**: `knobSize`, `knobInnerPct`, `knobRowOffsetX`, `knobRowOffsetY` y `knobGap` ya afectan al render de Output Channels. `knobGap` se usa como valor escalar (gap vertical entre Filter y Pan).

### Añadido
- **Opciones de interacción táctil**: Dos nuevos ajustes en Ajustes > Visualización, menú Paneles de Electron y electronMenuBridge. *Pan con un dedo* (activado por defecto): permite arrastrar el canvas tocando el fondo con un dedo. *Controles multitáctil* (desactivado por defecto): permite mover varios knobs/faders simultáneamente; al desactivarlo, dos dedos en pantalla siempre activan zoom/pan y bloquean los controles, evitando cambios accidentales.
- **Offset general por panel**: Propiedad `layout.offset: { x, y }` en los 4 blueprints (Paneles 1, 2, 3, 7) para reposicionar todos los módulos de un panel simultáneamente. Se aplica como `transform: translate()` en el contenedor host. Útil para ajustar la alineación cuando cambia la imagen de fondo. 4 tests nuevos.
- **Panel 2: ocultar textos y valores**: Headers, labels de canal, nombres y valores de knobs ocultos con CSS (ya están en la imagen de fondo). Eliminada opacidad 0.5 de placeholders.
- **Panel 7 joysticks y sequencer con controles**: Joysticks Left/Right con 2 knobs (Range Horizontal, Range Vertical) y pad circular. Sequencer Operational Control con 8 switches y 8 botones momentáneos. Eliminados títulos y transparencia de los placeholders. 8 tests nuevos para layout de joystick (knobs) y sequencer (switches, buttons).
- **Panel 1 blueprint v2 con placeholders**: Blueprint completo del Panel 1 a schemaVersion 2 con 16 módulos placeholder: 8 filtros (FLP 1-4, FHP 1-4, 3 knobs c/u), 3 Envelope Shapers (8 knobs c/u), 3 Ring Modulators (1 knob c/u), Reverberation (2 knobs) y Echo A.D.L. (4 knobs). Total 57 knobs sin título, solo visuales. Método `_buildPanel1()` en app.js, CSS dedicado y 68 tests de estructura, layout, módulos, separación blueprint/config y coherencia.
- **Panel 2 blueprint v2**: Refactorización completa del blueprint del Panel 2 a schemaVersion 2. Layout vertical con 5 módulos: Oscilloscope (funcional), Frequency Meter (placeholder), Octave Filter Bank (placeholder), Input Amplifier Level (funcional, 8 canales), External Treatment Devices (placeholder). Eliminados controls, matrixMapping, channels e ids del blueprint (ahora en configs). Añadido ajuste fino para Input Amplifier Level: offset de módulo, gap de fila, offset de fila y offsets individuales por canal/knob desde blueprint (`layout.inputAmplifierLevel` y `modules.inputAmplifierLevel.ui`). 36 tests nuevos para estructura, layout, módulos y separación blueprint/config.
- **Electron: confirmación al salir**: Archivo > Salir, Alt+F4 y el botón X de ventana ahora piden confirmación antes de cerrar la aplicación, igual que la opción de recargar. Diálogo traducido a todos los idiomas soportados.
- **Tests de contratos Electron-menú**: 46 tests que verifican la integridad entre electronMenu.cjs, electronMenuBridge.js, preload.cjs y main.cjs. Detectan claves de traducción sin enviar, estado desincronizado, acciones sin handler, canales IPC inconsistentes y rotura de la lógica de confirmación de salida.
- **Rasterización adaptativa (nitidez de zoom)**: Nueva opción en Ajustes > Visualización y menú Ver de Electron para activar/desactivar la re-rasterización del DOM al hacer zoom. Cuando está activa, tras dejar de interactuar se aplica CSS zoom para forzar renderizado nítido a resolución real. Desactivada por defecto, disponible en todos los navegadores. Traducida a los 7 idiomas soportados.

### Corregido
- **PiP: paneles recortados en ventanas flotantes**: El zoom mínimo ahora permite ver el panel completo (antes se cortaba ligeramente por cálculo incorrecto de header y bordes). Corregida altura de cabecera (32→37px), compensación de bordes CSS y escala inicial recalculada con dimensiones reales del viewport.
- **PiP: resize desde cualquier borde y esquina proporcional**: Las ventanas PiP se pueden redimensionar arrastrando cualquier borde (solo cambia tamaño de ventana, sin alterar el zoom) o la esquina (proporción de aspecto bloqueada con zoom ajustado para mostrar la misma imagen).
- **PiP: paneo con ratón y flechas de teclado**: El contenido del PiP se puede panear arrastrando con el ratón (click izquierdo en fondo o click central). Las flechas del teclado panean el PiP enfocado en vez del canvas principal. Cuando un PiP tiene foco, absorbe los atajos de navegación.
- **PiP: maximizar (+) y restaurar (-) mantienen posición y visión**: Los botones + y - ya no centran ni reubican la ventana PiP; solo cambian el tamaño en el sitio (ajustando a bordes de pantalla si es necesario). El zoom se escala proporcionalmente al cambio de tamaño para mantener la misma porción del panel visible, corregido cálculo de escala mínima que usaba dimensiones anteriores al cambio.

### Cambiado
- **"Input Amplifiers" → "Input Amplifier Level"**: Corregido el nombre del módulo en toda la aplicación (blueprint, UI, traducciones en/es) para usar el nombre correcto del Synthi 100.
- **Electron: menú Ver renombrado**: "Mostrar tooltips de voltaje" → "Parámetros electrónicos en tooltips" y "Mostrar info de audio-rate" → "Info de audio en tooltips", descripciones más claras de lo que muestran (voltajes, dB, frecuencias, ganancias, etc.).
- **Electron: menú Paneles con título de sección**: El submenú ahora incluye un encabezado "Separar paneles" antes de la lista de paneles individuales, haciendo más clara la función de detach/attach.
- **Electron: Buscar actualizaciones abre GitHub Releases**: Tanto en el menú Ayuda como en Ajustes > Avanzado, "Buscar actualizaciones" abre la página de releases del repositorio en el navegador externo. En versión web (PWA) se mantiene la comprobación de actualizaciones del Service Worker.

### Arreglado
- **Electron: sincronización bidireccional menú ↔ ajustes**: 7 problemas de sincronización entre el menú nativo de Electron y el modal de ajustes. 3 valores por defecto inconsistentes (rememberPip, tooltipVoltage, tooltipAudioRate aparecían desmarcados al inicio cuando debían estar marcados). 4 ajustes sin sincronización inversa (rememberPip, oscSendToSC, oscReceiveFromSC, oscShowLog no actualizaban el menú al cambiar desde ajustes). Añadidos tests de consistencia de defaults y ampliada la cobertura de sync inverso en los tests de contrato.
- **Canvas principal: límite de paneo con margen máximo 1/4**: Se evita desplazar el Synthi casi fuera de pantalla; al hacer pan, como máximo queda un 25% del viewport vacío en cualquier borde.
- **Entrada multicanal PipeWire (8ch)**: Nueva captura de 8 canales independientes via PipeWire (input_amp_1..8) que van directamente a los Input Amplifiers. Activación conjunta con salida multicanal mediante el mismo toggle. Comunicación lock-free via SharedArrayBuffer.
- **Tests de precisión V/oct**: Nueva suite de 13 tests de integración (`fmOctaveAccuracy.audio.test.js`) para verificar la precisión de modulación FM 1V/octava a través de la cadena CV completa (pin → cvChainInput → thermalSlew → softClip → freqCVInput). Incluye diagnóstico etapa por etapa para detectar pérdidas de señal.
- **Respuesta lineal de faders (opcional)**: Nueva opción en Ajustes > Visualización para que los faders de Output Channel controlen la ganancia de forma lineal (slider 50% → ganancia 50%). Por defecto activado para mejor experiencia en ordenador. El CV externo sigue funcionando con la curva logarítmica 10 dB/V auténtica del VCA CEM 3330.
- **Botones de reset para matrices de entrada**: Las matrices de ruteo de entrada (estéreo y multicanal) ahora tienen botones "Restaurar por defecto" para volver a la configuración inicial rápidamente.
- **Noise Generator: tooltips informativos**: Los knobs COLOUR y LEVEL del generador de ruido ahora muestran tooltips con información técnica: COLOUR indica tipo de filtro (LP/White/HP) con fc; LEVEL muestra Vp-p, ganancia y dB. Corregido `ModuleUI._createKnobShell` para propagar `getTooltipInfo` al constructor de `Knob`.
- **Noise Generator: filter bypass en posición neutral**: Cuando COLOUR está en centro (white noise), el worklet genera ruido blanco directamente sin procesar el filtro IIR, ahorrando CPU. Usa el mismo setting de bypass de filtros que los Output Channels en Ajustes > Optimizaciones.

### Cambiado
- **Panel 1: ajuste fino de layout más completo**: Soporte real de offsets y parámetros visuales en placeholders (fila de filtros, envelopes y fila inferior), incluyendo `offset` por fila, `knobGap`, `knobSize` (preset o px), `knobInnerPct`, `knobsOffset` y `offset` por módulo vía `modules.*.ui`.
- **Panel 2: Input Amplifier con knobs totalmente ajustables**: `knobGap` escalar, `knobSize` (preset o px), `knobInnerPct`, `knobsRowOffset` y `knobOffsets` ahora afectan al render real. Se mantiene compatibilidad con `knobsGap` legado.
- **Panel 7 Blueprint: refactorizado al patrón Panel 3**: Reescrito `panel7.blueprint.js` siguiendo la separación blueprint/config. Eliminados `channelCount`, lista de `controls`, `routing` y `frame` del blueprint (pertenecen a `outputChannel.config.js`). Añadidos `showFrames`, layout con dos filas (superior: Joystick Left + Sequencer + Joystick Right como frames placeholder visibles; inferior: 8 Output Channels), `outputChannelUI` para defaults visuales, y `modules` con stubs de override por instancia. Creados los marcos DOM de la fila superior en `app.js` usando `ModuleFrame`. Añadidos ajustes finos de posicionamiento en Panel 7: offsets por fila (`upperRow`/`lowerRow`), offsets por módulo (`modules.*.ui.offset`), y control individual de filas/elementos del sequencer (`switchesOffset`, `buttonsOffset`, `clockRateOffset`, `switchOffsets`, `buttonOffsets`, `clockRateKnobOffset`) incluyendo nueva fila con knob central `Clock Rate`, además de gaps/offsets internos de joysticks. Corregido bug latente en `OutputChannelsPanel` (`channelConfig` → `outputChannelConfig`).
- **Panel 7: ajuste fino totalmente independiente en joysticks Left/Right**: El layout superior ahora usa `layout.upperRow.joystickLeft` y `layout.upperRow.joystickRight` como configuraciones separadas, sin herencia entre lados. Cada joystick se ajusta de forma autónoma en `knobSize`, `padSize`, `layoutGap`, `knobsGap`, `knobsOffset`, `padOffset` y `knobOffsets`.
- **Noise Generator: filtro COLOUR auténtico (1er orden, 6 dB/oct)**: Reescrito el generador de ruido para emular el circuito real del Synthi 100 Cuenca. Reemplazado el algoritmo Voss-McCartney (interpolación white↔pink) por ruido blanco + filtro IIR de 1er orden idéntico al del Output Channel: pot 10K LIN + C 33nF, τ = 3.3×10⁻⁴ s, fc ≈ 965 Hz. Dial COLOUR 0-10: LP dark/pink → flat white → HP bright/blue. Nivel con pot LOG 10kΩ (audio taper). DC-coupled (fmin ≈ 2-3 Hz) para uso dual audio + CV aleatorio.
- **Electron: atajos de recarga bloqueados**: Los atajos F5, Ctrl+R y Ctrl+Shift+R están deshabilitados en la app de escritorio para evitar reinicios accidentales durante performances. El menú Archivo mantiene "Recargar" sin atajo para recarga manual si es necesaria.
- **Modo de salida separado del dispositivo**: Nueva UI con radio buttons para seleccionar entre modo Estéreo (dispositivo del sistema) y Multicanal (PipeWire 12ch). En modo multicanal el selector de dispositivo se deshabilita. Configuración de ruteo independiente para cada modo.
- **Salida multicanal expandida a 12 canales**: La salida multicanal PipeWire ahora soporta 12 canales independientes con nombres descriptivos: Pan 1-4 L/R, Pan 5-8 L/R (buses estéreo) y Out 1-8 (salidas individuales). Ruteo diagonal por defecto en multicanal.
- **UI: Opción de resolución oculta**: Selector de escala 1x/1.5x/2x... removido de Ajustes > Visualización. La app siempre inicia en 1x. Código mantenido para uso futuro.
- **Output Channel: Filter escala -5 a 5**: El knob Filter de los canales de salida ahora usa la escala estándar del Synthi 100 (-5 a +5) con centro en 0 (bypass), en lugar de 0-10 con centro en 5.
- **Output Channel: Filtro RC auténtico (1er orden, 6 dB/oct)**: Reemplazados los 2 BiquadFilter provisionales (LP+HP Butterworth, 12 dB/oct) por un AudioWorklet que modela el circuito RC pasivo real del Synthi 100 Cuenca (plano D100-08 C1): pot 10K LIN + 2× 0.047µF + buffer CA3140. Filtro IIR de un solo polo: LP fc(-3dB) ≈ 677 Hz, HP shelving +6 dB en HF, transición continua LP↔plano↔HP. Pendiente suave de 6 dB/oct para corrección tonal musical.
- **Stereo buses: ruteo multi-canal unificado**: Los stereo buses (Pan 1-4 L/R, Pan 5-8 L/R) ahora usan el mismo sistema de ruteo que Out 1-8, permitiendo enviar cada salida a múltiples canales físicos simultáneamente. Orden de canales PipeWire consistente: primero stereo buses (ch 0-3), luego Out 1-8 (ch 4-11).

### Arreglado
- **OSC: frecuencia de osciladores mapeaba 0-100 en lugar de 0-10**: El knob de frecuencia tiene rango nativo 0-10 (no 0-1 como los demás knobs), pero `sendKnobChange` aplicaba `uiToOSCValue` que asume entrada 0-1, resultando en `10×10=100`. Corregido: frequency pasa el valor directamente como OSC value sin conversión, tanto en envío como en recepción.
- **OSC: mensajes propios recibidos como eco**: Al enviar un mensaje OSC (ej. mover un knob), el multicast loopback lo devolvía al emisor, apareciendo duplicado en el log como enviado y recibido. Ahora el servidor filtra por IP local: si `rinfo.address` coincide con alguna interfaz del host, se descarta. Eliminado el mecanismo frágil de deduplicación por timing+JSON en oscBridge (50ms window, susceptible a pérdida de precisión float32).
- **Electron: menú nativo sin comunicación con la app**: `initElectronMenuBridge()` nunca se llamaba desde `app.js`, dejando el menú de Electron sin traducciones, sin sincronización de estado y sin respuesta a acciones (idioma, OSC, log, etc.). Añadida la llamada en la inicialización de la app.
- **Patch load: nivel de noise (y otros módulos) no se restauraba**: Cuando un módulo estaba dormant (sin conexión en matriz) y se cargaba un patch, `setLevel()` guardaba el valor pero no tocaba el AudioParam (silenciado por dormancy). El wake-up dependía de un `requestAnimationFrame` que podía deduplicarse o retrasarse, dejando el gain a 0 pese a que el knob mostraba la posición correcta. Ahora `_applyPatch` y `_resetToDefaults` fuerzan una actualización síncrona de dormancy (`flushPendingUpdate`) para que los módulos se resincronicen inmediatamente. Mismo fix aplicado a InputAmplifier (usaba snapshot de niveles pre-dormancy en vez de los actuales).
- **Tooltips de nivel de osciladores: calibración V/oct correcta**: Los tooltips de los knobs de nivel (pulse, sine, triangle, sawtooth) ahora muestran voltaje pico-a-pico basado en `DIGITAL_TO_VOLTAGE × 2 = 8.0V` para todas las formas de onda, en lugar de usar los valores de referencia del hardware (`outputLevels`) que varían por forma de onda. Esto garantiza que el voltaje mostrado corresponda exactamente al voltaje procesado por el sistema CV, esencial para modulación FM precisa 1V/octava.
- **Tooltip de frecuencia: voltaje del potenciómetro (0-10V)**: Corregida la fórmula de conversión dial→voltaje en el tooltip del knob de frecuencia. Antes mostraba el voltaje interno del VCO (centrado en 5V, daba -0.263V en posición 0). Ahora muestra el voltaje real del potenciómetro: 0V en dial 0, 5V en dial 5, 10V en dial 10.
- **Tooltips táctiles durante pan/zoom**: En tablets y dispositivos táctiles, los tooltips de knobs y sliders ya no se activan al tocar un control como parte de un gesto de dos dedos (pan/zoom). Solo aparecen con tap explícito o al manejar el control. El tooltip se retrasa 80ms en touch y se cancela si se detecta gesto de navegación.
- **Controles en PiP no bloqueaban gestos táctiles**: Los knobs, sliders y faders dentro de ventanas PiP/Detached respondían al toque durante gestos de pan/zoom (pinch). Propagado el flag `__synthPipGestureActive` desde el pinch-zoom del PiP para que `shouldBlockInteraction()` bloquee controles también en PiP.
- **Stereo buses sin sonido en multicanal**: El ruteo de stereo buses (Pan 1-4 L/R, Pan 5-8 L/R) no afectaba el audio en modo multicanal. Al cambiar de estéreo a multicanal, `forcePhysicalChannels(12)` reconstruía los `masterGains` pero no reconectaba los `channelGains` de los stereo buses, dejándolos conectados a nodos desconectados. Añadido `_rebuildStereoBusConnections()` en `_rebuildOutputArchitecture()` para recrear las conexiones y re-aplicar el routing tras cambiar de modo o dispositivo. Añadidos 23 tests de regresión para `forcePhysicalChannels` y supervivencia de stereo buses.
- **Stereo bus routing multicanal no persistía**: El routing de stereo buses (Pan 5-8 L/R, filas 3-4 de la matriz) en modo multicanal no se guardaba ni cargaba correctamente. El problema era que `physicalChannels` se actualizaba DESPUÉS de llamar a `_loadStereoBusRouting()`, causando que se recortaran los datos guardados a solo 2 columnas. Añadida función `_resizeStereoBusRoutingArrays()` para manejar el redimensionamiento correctamente.
- **Ruteo de audio: aislamiento estéreo/multicanal**: La configuración de ruteo de salida ahora se guarda de forma independiente para modo estéreo y multicanal. Al cambiar de modo, se guarda primero el ruteo del modo anterior antes de cargar el del nuevo modo, evitando que los cambios en un modo afecten al otro.
- **Output Channels: switches inicialmente apagados**: Los switches de los 8 canales de salida están ahora apagados por defecto al iniciar y cada vez que se reinicia el sintetizador. Valor inicial cambio de `true` (encendido) a `false` (apagado).
- **Menú contextual en Safari iOS**: Soporte de long press (500ms) para abrir menú contextual de paneles PiP en dispositivos táctiles donde el evento `contextmenu` no se dispara.
- **Eventos en ventanas PiP**: Todos los eventos de ratón/touch se capturan dentro de las ventanas PiP, evitando propagación al canvas general que causaba zoom/pan erráticos en dispositivos móviles.
- **Menú contextual del navegador en PiP**: Las ventanas PiP ahora bloquean el menú contextual nativo del navegador al hacer click derecho, manteniendo consistencia con el canvas principal.
- **PiP: centrado y paneo más suave**: Al abrir un PiP, el panel queda centrado visualmente, y el paneo del contenido se suaviza en desktop para evitar desplazamientos exagerados.
- **Créditos en Ajustes**: Añadido Fuzzy Gab en enlaces, orden y roles actualizados, y texto de inspiración ajustado a Gabinete de Música Electroacústica.
- **Dormancy: Output Channel con Voltage Input**: Los canales de salida ahora despiertan correctamente al recibir señal por Voltage Input (columnas 42-45 de Panel 6), no solo por conexiones de audio (Panel 5).
- **Re-entry de Output Channels: drift sub-Hz y fidelidad de forma de onda**: DC blocker reemplazado de BiquadFilter 2º orden a AudioWorklet 1er orden (`y[n] = x[n] - x[n-1] + R·y[n-1]`, fc=0.01 Hz). El BiquadFilter tenía dos polos near-unity que causaban trend-following: al cesar la señal, la salida seguía la última pendiente produciendo rampas ascendentes de ~80s. El filtro 1er orden solo tiene decaimiento exponencial (sin memoria de velocidad), eliminando el drift. Auto-reset tras 50ms de silencio borra el estado del filtro para settling instantáneo. Droop de cuadrada 1 Hz ~3% (<0.3 dB), transparente como CV para FM.
- **Re-entry de Output Channels: ganancia unitaria**: Corregido orden de argumentos en `createHybridClipCurve()` que causaba amplificación ~1.6× por cada Output Channel encadenado. Ahora la señal re-entry mantiene ganancia 1:1.
- **Grabación: canales individuales POST-switch**: Los 8 canales individuales ahora se graban desde `muteNode` (POST-switch) en lugar de `levelNode` (PRE-switch), respetando el estado on/off de cada canal.

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
