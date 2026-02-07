# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Entrada multicanal PipeWire (8ch)**: Nueva captura de 8 canales independientes via PipeWire (input_amp_1..8) que van directamente a los Input Amplifiers. Activación conjunta con salida multicanal mediante el mismo toggle. Comunicación lock-free via SharedArrayBuffer.
- **Respuesta lineal de faders (opcional)**: Nueva opción en Ajustes > Visualización para que los faders de Output Channel controlen la ganancia de forma lineal (slider 50% → ganancia 50%). Por defecto activado para mejor experiencia en ordenador. El CV externo sigue funcionando con la curva logarítmica 10 dB/V auténtica del VCA CEM 3330.
- **Botones de reset para matrices de entrada**: Las matrices de ruteo de entrada (estéreo y multicanal) ahora tienen botones "Restaurar por defecto" para volver a la configuración inicial rápidamente.
- **Noise Generator: tooltips informativos**: Los knobs COLOUR y LEVEL del generador de ruido ahora muestran tooltips con información técnica: COLOUR indica tipo de filtro (LP/White/HP) con fc; LEVEL muestra Vp-p, ganancia y dB. Corregido `ModuleUI._createKnobShell` para propagar `getTooltipInfo` al constructor de `Knob`.
- **Noise Generator: filter bypass en posición neutral**: Cuando COLOUR está en centro (white noise), el worklet genera ruido blanco directamente sin procesar el filtro IIR, ahorrando CPU. Usa el mismo setting de bypass de filtros que los Output Channels en Ajustes > Optimizaciones.

### Cambiado
- **Noise Generator: filtro COLOUR auténtico (1er orden, 6 dB/oct)**: Reescrito el generador de ruido para emular el circuito real del Synthi 100 Cuenca. Reemplazado el algoritmo Voss-McCartney (interpolación white↔pink) por ruido blanco + filtro IIR de 1er orden idéntico al del Output Channel: pot 10K LIN + C 33nF, τ = 3.3×10⁻⁴ s, fc ≈ 965 Hz. Dial COLOUR 0-10: LP dark/pink → flat white → HP bright/blue. Nivel con pot LOG 10kΩ (audio taper). DC-coupled (fmin ≈ 2-3 Hz) para uso dual audio + CV aleatorio.
- **Electron: atajos de recarga bloqueados**: Los atajos F5, Ctrl+R y Ctrl+Shift+R están deshabilitados en la app de escritorio para evitar reinicios accidentales durante performances. El menú Archivo mantiene "Recargar" sin atajo para recarga manual si es necesaria.
- **Modo de salida separado del dispositivo**: Nueva UI con radio buttons para seleccionar entre modo Estéreo (dispositivo del sistema) y Multicanal (PipeWire 12ch). En modo multicanal el selector de dispositivo se deshabilita. Configuración de ruteo independiente para cada modo.
- **Salida multicanal expandida a 12 canales**: La salida multicanal PipeWire ahora soporta 12 canales independientes con nombres descriptivos: Pan 1-4 L/R, Pan 5-8 L/R (buses estéreo) y Out 1-8 (salidas individuales). Ruteo diagonal por defecto en multicanal.
- **UI: Opción de resolución oculta**: Selector de escala 1x/1.5x/2x... removido de Ajustes > Visualización. La app siempre inicia en 1x. Código mantenido para uso futuro.
- **Output Channel: Filter escala -5 a 5**: El knob Filter de los canales de salida ahora usa la escala estándar del Synthi 100 (-5 a +5) con centro en 0 (bypass), en lugar de 0-10 con centro en 5.
- **Output Channel: Filtro RC auténtico (1er orden, 6 dB/oct)**: Reemplazados los 2 BiquadFilter provisionales (LP+HP Butterworth, 12 dB/oct) por un AudioWorklet que modela el circuito RC pasivo real del Synthi 100 Cuenca (plano D100-08 C1): pot 10K LIN + 2× 0.047µF + buffer CA3140. Filtro IIR de un solo polo: LP fc(-3dB) ≈ 677 Hz, HP shelving +6 dB en HF, transición continua LP↔plano↔HP. Pendiente suave de 6 dB/oct para corrección tonal musical.
- **Stereo buses: ruteo multi-canal unificado**: Los stereo buses (Pan 1-4 L/R, Pan 5-8 L/R) ahora usan el mismo sistema de ruteo que Out 1-8, permitiendo enviar cada salida a múltiples canales físicos simultáneamente. Orden de canales PipeWire consistente: primero stereo buses (ch 0-3), luego Out 1-8 (ch 4-11).

### Arreglado
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
- **Re-entry de Output Channels: drift sub-Hz eliminado**: DC blocker elevado de 0.01 Hz a 2 Hz (τ ≈ 80 ms, settling < 0.5 s). Con 0.01 Hz (τ ≈ 16 s), cualquier glitch generaba una señal residual sub-Hz que tardaba > 1 min en asentarse, causando pitch drift audible al usar re-entry como CV para FM. Crossfade del filter bypass ahora fuerza valor exacto con `setValueAtTime` tras 5τ para eliminar el residuo asintótico de `setTargetAtTime`.
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
