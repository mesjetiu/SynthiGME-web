# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Undo/Redo global**: Deshacer/rehacer basado en snapshots (hasta 50 estados). Botones en quickbar, Ctrl+Z / Ctrl+U. Se limpia al cargar patch o resetear.
- **PiP mejorado**: Auto-lock/unlock de canvas al extraer/cerrar paneles. Escala contain (panel siempre visible completo). Placeholder requiere long-press o click derecho para devolver panel. Resize desde cualquier borde/esquina. Paneo con ratón y flechas. Maximizar/restaurar sin perder posición.
- **Menú contextual jerárquico**: Clic derecho (o long press en móvil) con opciones por elemento: extraer/devolver panel, reiniciar panel, módulo o control concreto. Valores por defecto leídos de configs de módulos (fuente única de verdad).
- **Manejo global de errores**: Captura con `window.onerror`, `unhandledrejection` y `processorerror` en AudioWorklets. Try/catch en worklets críticos con silencio limpio. Toast unificado con niveles de severidad reemplazando 3 sistemas independientes.
- **Telemetría anónima opt-in**: Cola de eventos con flush periódico, cola offline, sendBeacon. Backend Google Apps Script → Sheets + alertas Telegram. Consentimiento en primer inicio, toggle en Ajustes y menú Electron.
- **Atajos de teclado ampliados**: Flechas para paneo del canvas. Zoom Ctrl+/−/0 ahora también en navegador (PWA).
- **Opciones de interacción táctil**: Pan con un dedo (ON por defecto) y controles multitáctil (OFF por defecto, evita cambios accidentales durante zoom/pan).
- **Rasterización adaptativa**: Re-rasterización del DOM al hacer zoom para nitidez a resolución real. Desactivada por defecto.
- **Panel 1 blueprint v2**: 16 módulos placeholder (filtros, envelopes, ring modulators, reverb, echo) con 57 knobs y ajuste fino de layout. 68 tests.
- **Panel 2 blueprint v2**: Oscilloscope funcional, Input Amplifier Level funcional (8 canales) y 3 módulos placeholder. Textos ocultos con CSS (ya en imagen de fondo). 36 tests.
- **Panel 7 joysticks y sequencer**: Joysticks Left/Right con 2 knobs y pad circular. Sequencer con 8 switches, 8 botones y knob Clock Rate. Ajuste fino independiente por lado.
- **Entrada multicanal PipeWire 8ch**: 8 canales independientes directo a Input Amplifiers, con activación conjunta y comunicación lock-free via SharedArrayBuffer.
- **Respuesta lineal de faders**: Opción para control de ganancia lineal en Output Channels. CV externo sigue con curva logarítmica 10 dB/V del VCA CEM 3330.
- **Noise Generator mejorado**: Filtro COLOUR auténtico (1er orden, 6 dB/oct, circuito RC del Synthi 100 Cuenca). Filter bypass en posición neutral. Tooltips con tipo de filtro, fc, Vp-p y dB.
- **Electron: confirmación al salir**: Diálogo traducido en Archivo > Salir, Alt+F4 y botón X. 46 tests de contratos Electron-menú.
- **Botones de reset para matrices de entrada**: Estéreo y multicanal con "Restaurar por defecto".
- **Tests de precisión V/oct**: 13 tests de integración para modulación FM 1V/octava.
- **Resaltado de flujo de señal**: Hover/tap sobre módulo o pin muestra orígenes (cyan) y destinos (magenta) con glow animado. Funciona sin tecla modificadora por defecto. Pines muestran flujo independientemente de si están activos. Activar/desactivar en Ajustes > Interfaz (opción de tecla modificadora subordinada e indentada). 86 tests.

### Cambiado
- **Reorganización de Ajustes y menú Electron**: Pestañas reducidas de 7 a 6 ("Visualización" → "Interfaz", "Grabación" fusionada en "Audio"). Nuevo menú "Preferencias" en Electron. "Restaurar ajustes" sustituye a "Reiniciar sintetizador" en Avanzado.
- **"Input Amplifiers" → "Input Amplifier Level"**: Nombre corregido en toda la app según Synthi 100.
- **Output Channel: filtro RC auténtico (1er orden, 6 dB/oct)**: Escala -5 a +5. Circuito RC pasivo del Synthi 100 Cuenca: pot 10K LIN + 2× 0.047µF, transición continua LP↔plano↔HP.
- **Panel 7 Blueprint refactorizado**: Separación blueprint/config completa. Layout dos filas, offsets por módulo, ajuste fino real en knobs y switches verticales.
- **Paneles 1 y 2: ajuste fino de layout**: Soporte real de offsets, knobGap, knobSize, knobInnerPct y offsets por módulo en blueprints.
- **Salida multicanal expandida a 12 canales**: Pan 1-4 L/R, Pan 5-8 L/R (buses estéreo) y Out 1-8. Ruteo unificado con envío a múltiples canales simultáneos. Modo de salida separado del dispositivo con radio buttons.
- **Electron: atajos de recarga bloqueados**: F5, Ctrl+R, Ctrl+Shift+R deshabilitados para evitar reinicios accidentales.
- **Electron: Buscar actualizaciones abre GitHub Releases** en navegador externo.
- **UI: selector de resolución oculto**. La app siempre inicia en 1x.

### Corregido
- **DSP on/off: patch sin sonido tras off→load→on**: Al encender DSP siempre se re-aplica el patch actual.
- **Joystick pad**: Arrastre llegaba solo a ~0.8. Inoperable en PiP tablet. Halo activo añadido.
- **Output Channel DC blocker**: Reposicionado a salida de altavoces (fc=1Hz). Re-entry DC-transparente para CV.
- **PiP: múltiples correcciones**: Resize, filtrado de eventos, paneo táctil unificado, viewport restaurado al cargar patch, controles bloqueaban gestos táctiles, centrado al abrir, paneles recortados.
- **Doble click/tap en controles no activa zoom de panel**: Lista de selectores interactivos corregida.
- **Tooltips**: Superpuestos en táctil (exclusión mutua). Calibración V/oct en knobs de nivel. Frecuencia muestra voltaje 0-10V del potenciómetro. Sin activación accidental durante pan/zoom.
- **Menú contextual**: Knobs bloqueaban click derecho. Detección de controles individuales. Output channel individual. Interpolación de nombres. Cierre en móvil/Escape. Safari iOS.
- **Reinicio global: valores por defecto leídos de configs** (eliminados valores hardcoded incorrectos).
- **OSC**: Frecuencia mapeaba 0-100 en lugar de 0-10. Mensajes propios filtrados por IP local.
- **Electron: menú sin comunicación con la app**: Bridge añadido al inicio. Sincronización bidireccional (7 problemas). Cadenas traducidas.
- **Patch load: módulos dormant no restauraban nivel**: Forzada actualización síncrona de dormancy.
- **Stereo buses multicanal**: Reconexión tras forcePhysicalChannels. Routing persistente. Aislamiento estéreo/multicanal.
- **Re-entry de Output Channels**: DC blocker 1er orden (fc=0.01Hz) elimina drift sub-Hz. Ganancia unitaria corregida.
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
