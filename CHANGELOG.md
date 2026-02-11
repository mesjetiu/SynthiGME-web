# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Navegación con flechas del teclado**: Las teclas de flecha permiten hacer paneo del canvas principal (15% del viewport por pulsación). Solo activas cuando no se está escribiendo en un campo de texto.
- **Zoom Ctrl+/Ctrl-/Ctrl+0 en navegador**: Los atajos de zoom que solo funcionaban en Electron ahora también funcionan en la versión web (PWA), previniendo el zoom nativo del navegador y controlando el zoom del canvas.

### Eliminado
- **Menú Electron: quitados "Bloquear paneo" y "Bloquear zoom"**: Opciones eliminadas del menú Paneles porque estaban inhabilitadas en desktop (solo afectaban a gestos táctiles móviles) y no tenían efecto.

### Añadido
- **Opciones de interacción táctil**: Dos nuevos ajustes en Ajustes > Visualización, menú Paneles de Electron y electronMenuBridge. *Pan con un dedo* (activado por defecto): permite arrastrar el canvas tocando el fondo con un dedo. *Controles multitáctil* (desactivado por defecto): permite mover varios knobs/faders simultáneamente; al desactivarlo, dos dedos en pantalla siempre activan zoom/pan y bloquean los controles, evitando cambios accidentales.
- **Offset general por panel**: Propiedad `layout.offset: { x, y }` en los 4 blueprints (Paneles 1, 2, 3, 7) para reposicionar todos los módulos de un panel simultáneamente. Se aplica como `transform: translate()` en el contenedor host. Útil para ajustar la alineación cuando cambia la imagen de fondo. 4 tests nuevos.
- **Panel 2: ocultar textos y valores**: Headers, labels de canal, nombres y valores de knobs ocultos con CSS (ya están en la imagen de fondo). Eliminada opacidad 0.5 de placeholders.
- **Panel 7 joysticks y sequencer con controles**: Joysticks Left/Right con 2 knobs (Range Horizontal, Range Vertical) y pad circular. Sequencer Operational Control con 8 switches y 8 botones momentáneos. Eliminados títulos y transparencia de los placeholders. 8 tests nuevos para layout de joystick (knobs) y sequencer (switches, buttons).
- **Panel 1 blueprint v2 con placeholders**: Blueprint completo del Panel 1 a schemaVersion 2 con 16 módulos placeholder: 8 filtros (FLP 1-4, FHP 1-4, 3 knobs c/u), 3 Envelope Shapers (8 knobs c/u), 3 Ring Modulators (1 knob c/u), Reverberation (2 knobs) y Echo A.D.L. (4 knobs). Total 57 knobs sin título, solo visuales. Método `_buildPanel1()` en app.js, CSS dedicado y 68 tests de estructura, layout, módulos, separación blueprint/config y coherencia.
- **Panel 2 blueprint v2**: Refactorización completa del blueprint del Panel 2 a schemaVersion 2. Layout vertical con 5 módulos: Oscilloscope (funcional), Frequency Meter (placeholder), Octave Filter Bank (placeholder), Input Amplifier Level (funcional, 8 canales), External Treatment Devices (placeholder). Eliminados controls, matrixMapping, channels e ids del blueprint (ahora en configs). 36 tests nuevos para estructura, layout, módulos y separación blueprint/config.
- **Electron: confirmación al salir**: Archivo > Salir, Alt+F4 y el botón X de ventana ahora piden confirmación antes de cerrar la aplicación, igual que la opción de recargar. Diálogo traducido a todos los idiomas soportados.
- **Tests de contratos Electron-menú**: 46 tests que verifican la integridad entre electronMenu.cjs, electronMenuBridge.js, preload.cjs y main.cjs. Detectan claves de traducción sin enviar, estado desincronizado, acciones sin handler, canales IPC inconsistentes y rotura de la lógica de confirmación de salida.
- **Rasterización adaptativa (nitidez de zoom)**: Nueva opción en Ajustes > Visualización y menú Ver de Electron para activar/desactivar la re-rasterización del DOM al hacer zoom. Cuando está activa, tras dejar de interactuar se aplica CSS zoom para forzar renderizado nítido a resolución real. Desactivada por defecto, disponible en todos los navegadores. Traducida a los 7 idiomas soportados.

### Corregido
- **PiP: paneles recortados en ventanas flotantes**: El zoom mínimo ahora permite ver el panel completo (antes se cortaba ligeramente por cálculo incorrecto de header y bordes). Corregida altura de cabecera (32→37px), compensación de bordes CSS y escala inicial recalculada con dimensiones reales del viewport.

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
- **Panel 7 Blueprint: refactorizado al patrón Panel 3**: Reescrito `panel7.blueprint.js` siguiendo la separación blueprint/config. Eliminados `channelCount`, lista de `controls`, `routing` y `frame` del blueprint (pertenecen a `outputChannel.config.js`). Añadidos `showFrames`, layout con dos filas (superior: Joystick Left + Sequencer + Joystick Right como frames placeholder visibles; inferior: 8 Output Channels), `outputChannelUI` para defaults visuales, y `modules` con stubs de override por instancia. Creados los marcos DOM de la fila superior en `app.js` usando `ModuleFrame`. Corregido bug latente en `OutputChannelsPanel` (`channelConfig` → `outputChannelConfig`).
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
