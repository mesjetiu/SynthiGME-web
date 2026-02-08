# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **PiP: botón de bloqueo (candado)**: Bloquea tamaño, proporción, zoom interior, paneo y resize de la ventana flotante. Solo permite arrastrar. Estado persistente entre sesiones.
- **Atajos de teclado (1-7) detectan PiP**: Si un panel está en modo flotante (detached), el atajo lo enfoca y trae al frente en lugar de hacer zoom sobre el placeholder vacío del canvas. Al pulsar Alt, el número de shortcut se muestra sobre la ventana PiP, no sobre el canvas.

### Cambiado
- **Fondos de paneles**: Paneles 1, 2, 3, 4 y 7 usan JPG temporales de diseño en lugar de SVGs vacíos. Panel 3 ya no carga su SVG placeholder. Paneles 5 y 6 (matrices) mantienen sus SVGs de producción. Instrucciones de migración a SVG documentadas en código.
- **Paneles 3 y 7: ocultar textos de módulos**: Eliminados títulos, etiquetas de knobs, valores numéricos y textos de switches en Panel 3 (osciladores, noise, random voltage) y Panel 7 (output channels), ya que están en las imágenes de fondo. Reglas CSS comentadas para restaurar fácilmente.
- **PiP: botones +/- son ahora maximizar/minimizar**: El botón + maximiza la ventana proporcionalmente hasta alcanzar un borde de pantalla, − restaura al tamaño por defecto. Se respeta la proporción de lados actual en ambos casos.

## [0.6.0] - 2026-02-08

### Añadido
- **Menú nativo completo en Electron**: 7 menús con i18n (Archivo, Ver, Audio, Paneles, Avanzado, OSC, Ayuda). Sincronización bidireccional de estado con UI web vía IPC. Selector de idioma integrado en menú Archivo.
- **Toggle de visibilidad del quickbar en Electron**: Opción Ver → Mostrar barra rápida. Botón flotante de mute siempre visible como emergencia. Estado persistente en localStorage.
- **Título de ventana localizado en Electron**: Título traducido al idioma activo (7 idiomas), se actualiza automáticamente al cambiar idioma.
- **Entrada multicanal PipeWire (8ch)**: Captura de 8 canales independientes directo a Input Amplifiers. Activación conjunta con salida multicanal. Comunicación lock-free vía SharedArrayBuffer.
- **Respuesta lineal de faders (opcional)**: En Ajustes > Visualización, slider 50% → ganancia 50%. Activado por defecto. El CV externo mantiene la curva logarítmica 10 dB/V auténtica del VCA CEM 3330.
- **Botones de reset para matrices de entrada**: Botón "Restaurar por defecto" en matrices de ruteo estéreo y multicanal.
- **Noise Generator: tooltips informativos**: COLOUR muestra tipo de filtro (LP/White/HP) con fc; LEVEL muestra Vp-p, ganancia y dB.
- **Noise Generator: filter bypass en posición neutral**: Ruido blanco directo sin filtro IIR cuando COLOUR está en centro, ahorrando CPU. Configurable en Ajustes > Optimizaciones.

### Cambiado
- **Patch Browser flotante y no modal**: Arrastrable, no bloquea canvas ni PiP. Permanece abierto tras cargar patch. Indicador de estado activo en quickbar y menú Electron.
- **Electron: zoom según foco**: Ctrl+/- y Ctrl+0 aplican zoom en PiP enfocada o canvas principal. En Linux, acciones directas vía IPC.
- **Electron: confirmación al recargar**: Diálogo antes de Archivo → Recargar para evitar pérdida de estado en performances.
- **Electron: paneles simplificados**: Submenú Paneles muestra "Panel 1", "Panel 2"... sin descripciones.
- **Electron: `dev` reconstruye dist-app/**: Build completo antes de lanzar Electron, garantizando código actualizado.
- **Electron: CSP en servidor local**: Cabecera Content-Security-Policy con permisos mínimos (blob: para AudioWorklet, unsafe-inline para estilos).
- **Electron: atajos de recarga bloqueados**: F5, Ctrl+R, Ctrl+Shift+R deshabilitados para evitar reinicios accidentales en performances.
- **Noise Generator: filtro COLOUR auténtico (1er orden, 6 dB/oct)**: Emulación del circuito real del Synthi 100 Cuenca: ruido blanco + filtro IIR (pot 10K LIN + C 33nF, fc ≈ 965 Hz). Dial 0-10: LP → white → HP. Nivel con pot LOG. DC-coupled para uso dual audio + CV aleatorio.
- **Salida multicanal expandida a 12 canales**: Pan 1-4 L/R, Pan 5-8 L/R (buses estéreo) y Out 1-8 (salidas individuales). Modo estéreo/multicanal separado del dispositivo con ruteo independiente.
- **Output Channel: Filter escala -5 a +5**: Escala estándar del Synthi 100, centro en 0 (bypass).
- **Output Channel: Filtro RC auténtico (1er orden, 6 dB/oct)**: AudioWorklet que modela el circuito RC pasivo real (plano D100-08 C1): LP fc ≈ 677 Hz, HP shelving +6 dB HF, transición continua. Pendiente suave de 6 dB/oct.
- **Stereo buses: ruteo multicanal unificado**: Misma capacidad de ruteo que Out 1-8, con canales PipeWire consistentes (stereo buses ch 0-3, Out 1-8 ch 4-11).
- **UI: Opción de resolución oculta**: Selector de escala removido de Ajustes > Visualización, siempre inicia en 1x.

### Arreglado
- **PiP: bloqueo de controles táctiles tras pinch**: Flag de gesto activo corregido (movido a fase de burbuja), restaurando manipulación de controles tras zoom.
- **PiP: tamaño inicial, paneo y protección pinch**: Tamaño inicial ~50% mayor, paneo expandido a 2/3 visible, protección anti-zoom accidental con estabilización de ratio.
- **PiP: centrado y paneo más suave**: Panel centrado al abrir, paneo suavizado en desktop.
- **PiP: eventos y menú contextual**: Eventos capturados dentro de PiP (evita zoom/pan erráticos en móvil), menú contextual nativo bloqueado, long press para menú en Safari iOS.
- **PiP: controles no bloqueaban gestos táctiles**: Propagado flag de gesto desde pinch-zoom del PiP a `shouldBlockInteraction()`.
- **PiP: warning 'scroll-blocking wheel event'**: Añadido `{ passive: true }` al listener de wheel en pipContainer.
- **Tooltips táctiles durante pan/zoom**: No se activan durante gestos de dos dedos; retraso 80ms + cancelación si se detecta navegación.
- **Nombres de idioma con comillas en Ajustes**: Parser YAML corregido para strip de comillas en `_meta.languages`.
- **Electron: toggle de log OSC desde menú**: Evento corregido a `osc:log-visibility` en `window`.
- **Electron: enlaces GitHub/reportar error**: Abiertos en navegador del sistema via `shell.openExternal` con fallback nativo.
- **Electron: fullscreen unificado**: Menú y quickbar usan la misma Fullscreen API del navegador.
- **Electron: menú desaparecía tras fullscreen**: Reconstrucción del menú con delay 200ms tras salir de pantalla completa.
- **CSP: script inline bloqueado en Electron**: Extraído a archivo externo `fullscreenButton.js`.
- **Stereo buses sin sonido en multicanal**: Reconexión de `channelGains` tras `forcePhysicalChannels(12)` vía `_rebuildStereoBusConnections()`. 23 tests de regresión añadidos.
- **Stereo bus routing multicanal no persistía**: Corregido orden de actualización de `physicalChannels` vs carga de routing.
- **Ruteo de audio: aislamiento estéreo/multicanal**: Configuración de ruteo guardada independientemente por modo, se preserva al cambiar.
- **Output Channels: switches inicialmente apagados**: Apagados por defecto al iniciar y tras cada reinicio.
- **Dormancy: Output Channel con Voltage Input**: Despiertan correctamente al recibir señal por columnas 42-45 de Panel 6.
- **Re-entry de Output Channels**: DC blocker reducido a 0.01Hz para CV lento, resync instantáneo del VCA al despertar, ganancia unitaria corregida en `createHybridClipCurve()`.
- **Grabación: canales individuales POST-switch**: Grabación desde `muteNode` respetando estado on/off de cada canal.
- **Créditos en Ajustes**: Añadido Fuzzy Gab, roles actualizados, texto de inspiración ajustado.

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
