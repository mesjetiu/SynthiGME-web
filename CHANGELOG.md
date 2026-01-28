# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **Soporte OSC (Open Sound Control)**: Servidor integrado en Electron para comunicación con SuperCollider, Max/MSP, etc. Incluye ventana de log en tiempo real, configuración en Ajustes y desactivado por defecto.
- **Aplicación de escritorio con Electron**: Empaquetado nativo para Linux (AppImage) y Windows (NSIS + portable). Menú nativo, iconos personalizados, persistencia completa de datos y nombre "SynthiGME" en mezcladores del sistema.
- **Emulación completa del sistema de voltajes Synthi 100**: 8 tipos de pines de matriz con resistencias y ganancias reales según documentación Datanomics 1982. Menú contextual para seleccionar tipo de pin y tooltips con información técnica.
- **Emulación DSP del hardware Synthi 100**: Inercia térmica (Thermal Slew), saturación híbrida de raíles ±12V, filtrado RC por pin de matriz, soft clipping en CV y modelo de frecuencia CEM 3340 con escala 1V/Oct.
- **Paneles flotantes (Picture-in-Picture)**: Extraer cualquier panel a ventana independiente redimensionable con persistencia de estado.
- **Sistema de tests de audio (Playwright)**: Suite completa que valida DSP en Chromium headless. Comando `test:all` ejecuta tests unitarios + audio con resumen estructurado.
- **Hard sync en matriz**: Columnas 24-35 exponen entradas de sincronización de los 12 osciladores para timbres armónicos complejos.
- **Sistema de dormancy**: Suspensión automática de procesamiento DSP en módulos sin conexiones activas (~95% ahorro CPU).
- **Tooltips informativos**: En knobs (Hz, V, %, con CV activo) y pines de matriz (origen→destino, resistencia, ganancia).

### Cambiado
- **Sistema de patches v2**: Formato simplificado que guarda solo valores de UI (0-1). Más compacto, legible y resiliente a cambios de fórmulas.
- **Arquitectura de osciladores multi-waveform**: Único worklet genera 4 formas de onda simultáneas (~70% menos nodos de audio). Fase maestra unificada.
- **Algoritmo de seno híbrido**: Combina precisión digital con modelado analógico para eliminar "kinks" y reproducir estética del hardware.
- **Voltajes de salida calibrados**: Niveles según Manual Técnico Datanomics 1982 (Sine 8V p-p, Saw 6.2V, Tri/Pulse 8.1V).

### Arreglado
- **Bug crítico AudioWorklet→AudioParam**: Condicionales en worklets bloqueaban señal. Reemplazados por operaciones aritméticas puras. 14 tests añadidos.
- **Calibración 1V/octave**: Factor CV→cents corregido (1200→4800). +1V = 1 octava arriba (f×2).
- **Cachés en Electron**: Limpieza automática de code cache, HTTP cache y Service Worker deshabilitado para evitar versiones anteriores.
- **Carga de worklets en móviles**: Race condition corregida con sistema de reintentos para aplicación de patches.

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
