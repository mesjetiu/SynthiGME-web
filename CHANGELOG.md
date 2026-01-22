# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Cambiado
- **Reorganización de archivos de configuración**: Los archivos `.config.js` se han movido de `panelBlueprints/` a `configs/modules/` con nombres semánticos por tipo de módulo:
  - `panel2.config.js` → `oscilloscope.config.js`, `inputAmplifier.config.js`
  - `panel3.config.js` → `oscillator.config.js`, `noise.config.js`, `randomVoltage.config.js`
  - `panel5.audio.config.js` → `audioMatrix.config.js`
  - `panel6.control.config.js` → `controlMatrix.config.js`
  - `panel7.config.js` → `outputChannel.config.js`
  - Nuevo `configs/index.js` centraliza todas las exportaciones
  - Los blueprints permanecen en `panelBlueprints/` para la estructura visual

### Añadido
- **Modificadores fijos para knobs**: Documentación en Ajustes → Atajos y badge visual que indica Ctrl/Cmd (10× más rápido) y Shift (10× más preciso) al arrastrar cualquier knob.
- **Tooltips informativos en knobs de osciladores**: Los controles de frecuencia, niveles, pulse width y sine symmetry muestran tooltips con valores en tiempo real:
  - **Frecuencia**: Muestra Hz con precisión de 3 decimales y rango completo (0.5-20000 Hz). Indica '+ CV' cuando hay modulación activa.
  - **Niveles (Sine/Saw/Tri/Pulse)**: Muestra voltaje (0-10V) basado en emulación del Synthi 100.
  - **Pulse Width y Sine Symmetry**: Muestra porcentaje (0-100%).
  - **Configuración**: Toggle en Ajustes → Visualización para mostrar/ocultar información de parámetros.
  - **Táctil**: Tooltips con tap + auto-hide (3 segundos) para mejor experiencia en móvil.
- **Tooltips en pines de matriz con información técnica**: Al pasar el ratón o tocar un pin, además del origen/destino, ahora se muestra:
  - Resistencia del pin (ej: "100kΩ", "2.7kΩ", etc.)
  - Factor de ganancia (ej: "×1", "×37", "×0.1", etc.)
  - Información localizable vía i18n para todos los idiomas.
- **Sistema expandido de 8 tipos de pin en la matriz**: Basado en documentación Datanomics 1982 y manual de Belgrado:
  - **Pines estándar** (Cuenca 1982): WHITE (100kΩ, ×1), GREY (100kΩ ±0.5%, ×1), GREEN (68kΩ, ×1.5), RED (2.7kΩ, ×37)
  - **Pines especiales** (manual técnico): BLUE (10kΩ, ×10), YELLOW (22kΩ, ×4.5), CYAN (250kΩ, ×0.4), PURPLE (1MΩ, ×0.1)
  - **Menú organizado en secciones**: "Recomendado" (según contexto), "Estándar", "Especiales"
  - **Información de ganancia**: El menú muestra resistencia y ganancia (ej: "100kΩ · ×1")
  - **Categorías en código**: Cada pin tiene `category: 'standard' | 'special' | 'forbidden'`
  - **ORANGE no implementado**: Pin de 0Ω excluido por riesgo de cortocircuito
- **Paneles flotantes (Picture-in-Picture)**: Sistema completo para extraer paneles del layout principal y trabajar con ellos en ventanas independientes:
  - **Extracción de paneles**: Click derecho en panel → "Extraer panel" o desde el menú PiP de la quickbar.
  - **Ventanas flotantes**: Cada panel extraído se muestra en una ventana flotante redimensionable y arrastrable con controles propios de zoom, scroll y cierre.
  - **Menú en quickbar**: Selector de paneles con opciones individuales (Panel 1-7) y acciones globales "Extraer todos" / "Devolver todos".
  - **Menú contextual**: Click derecho en cualquier panel para extraerlo directamente.
  - **Placeholder visual**: Los paneles extraídos dejan un placeholder en el grid principal para mantener el layout.
  - **Persistencia**: El estado de los paneles flotantes (posición, tamaño, scroll interno) se guarda en localStorage.
  - **Nombres simples**: Los paneles se muestran como "Panel 1" a "Panel 7" en los menús.
- **Selección de color de pines en la matriz**: Sistema completo para elegir el tipo de pin al hacer conexiones:
  - **Menú contextual**: Click derecho (desktop) o pulsación larga (móvil) en cualquier pin abre menú con 8 tipos de pin.
  - **Colores por contexto**: Audio (WHITE), Control CV (GREY para precisión), Osciloscopio (RED). El sistema recuerda el último color usado.
  - **Activación inmediata**: Seleccionar un color en un pin inactivo lo activa directamente con ese color.
  - **Tick visual**: El menú muestra ✓ junto al color actual (pin activo) o el próximo a usar (pin inactivo).
  - **Pines más grandes**: Los pines activos tienen 50% más tamaño (`scale(1.5)`) para mejor visibilidad.
  - **Colores CSS centralizados**: Variables `--pin-color-*` para los 8 colores en `:root`.
  - **Serialización de colores**: Los patches guardan el color de cada pin como tercer elemento opcional `[row, col, pinType]`.
- **Sistema de emulación de voltajes del Synthi 100**: Nuevo módulo `voltageConstants.js` que implementa el modelo eléctrico de la versión Cuenca/Datanomics (1982):
  - **Conversión digital ↔ voltaje**: Factor 1.0 digital = 4V (8V p-p total), estándar 1V/Oct.
  - **Resistencias de pin**: 8 tipos con resistencias de 2.7kΩ a 1MΩ y ganancias de ×0.1 a ×37.
  - **Fórmula de tierra virtual**: `Ganancia = Rf / R_pin` (Rf = 100kΩ típico).
  - **Soft clipping**: Saturación suave con `tanh()` según límites por módulo (8V filtros, 2V reverb, etc.).
  - **Tolerancia reproducible**: Error de resistencia basado en seed para patches consistentes.
  - **Deriva térmica**: Configuración para osciladores CEM 3340 (±0.1%).
- **Métodos de voltaje en clase Module**: La clase base `Module` en `core/engine.js` ahora incluye:
  - `applyInputClipping(digitalValue)`: Satura entradas digitales según límite del módulo.
  - `applyVoltageClipping(voltage)`: Satura voltajes directamente.
  - `setInputVoltageLimit(v)` / `setSoftClipEnabled(bool)`: Configuración por módulo.
- **Soft clipping en entrada CV de osciladores**: Las señales CV que modulan la frecuencia de osciladores ahora pasan por un `WaveShaperNode` con curva tanh que satura suavemente las señales excesivas. Usa `createSoftClipCurve()` de `voltageConstants.js`.
- **Ganancia de pines con fórmula de tierra virtual**: Nueva función `calculateMatrixPinGain()` que calcula la ganancia de cada pin de matriz según el tipo de pin, la Rf del destino y la tolerancia opcional.
- **Sección de Emulación de Voltajes en Ajustes**: Nueva sección en Ajustes → Avanzado que permite controlar:
  - **Saturación suave (soft clip)**: Activar/desactivar el límite de voltaje con tanh().
  - **Tolerancia de pines**: Activar/desactivar variación realista de resistencias (±0.5% gris, ±10% resto).
  - **Deriva térmica**: Activar/desactivar simulación de drift de osciladores.
- **Modelo de frecuencia realista del Synthi 100 (CEM 3340)**: Implementación basada en documentación Datanomics 1982:
  - **Escala exponencial 1V/Octava**: El dial (0-10) controla la frecuencia con factor 0.95 unidades por octava.
  - **Frecuencia de referencia**: 261 Hz (C4) en posición dial 5, estándar de afinación MIDI.
  - **Conversión dial→frecuencia**: `f = 261 × 2^((dial - 5) / 0.95 + CV_total)`.
  - **Switch HI/LO**: El modo LO divide la frecuencia por 10 (condensador C10 10nF vs C9 1nF).
  - **Rangos físicos**: HI (5–20.000 Hz), LO (0.5–2.000 Hz), con clamping a límites.
  - **Distorsión de tracking**: Fuera de la zona lineal (±2.5V), tracking cuadrático con α=0.01 configurable.
  - **Nuevas funciones en conversions.js**: `dialToFrequency()`, `frequencyToDial()`, `applyTrackingDistortion()`, `generateFrequencyTable()`.
  - **Constantes en voltageConstants.js**: `OSC_REFERENCE_FREQ`, `DIAL_UNITS_PER_OCTAVE`, `TRACKING_LINEAR_HALF_RANGE`, `OSC_FREQUENCY_RANGES`, `LO_RANGE_DIVISOR`.
  - Todas las opciones están **activadas por defecto** y sus valores se leen dinámicamente desde localStorage.

### Corregido
- **Sensibilidad del osciloscopio**: Ajustada para compensar la ganancia ×37 del pin rojo (`inputSensitivity: 0.027`).
- **Menú contextual con pinch**: El long press para abrir el menú de pines ahora se cancela correctamente al pinzar con dos dedos.
- **Color por defecto en control CV**: Cambiado de GREEN a GREY para mayor precisión (±0.5% vs ±10%).
- **Tooltips de pines durante zoom/pan**: Los tooltips de matriz ahora se ocultan automáticamente al hacer zoom o pan, evitando que queden flotando en posiciones incorrectas.
- **Menú contextual de paneles**: Eliminada la opción "Extraer todos" del menú contextual individual de paneles (ya disponible en menú de quickbar).
- **Menú contextual en knobs**: Desactivado el menú contextual de panel al hacer click derecho sobre knobs u otros mandos, evitando interferencias.
- **Permisos de micrófono en Chrome Android**: Corregido bucle infinito al solicitar permisos. Mejoradas traducciones y sistema de reintentos para mayor fiabilidad.
- **Conversión dial→frecuencia**: Corregida implementación del modelo CEM 3340 para precisión exacta con la especificación Synthi 100.
- **Glissando en osciladores**: Eliminado portamento no deseado. Aumentada resolución de frecuencia para transiciones instantáneas.
- **Precisión de tooltips de frecuencia**: Ajustada precisión decimal para mostrar valores exactos sin redondeos excesivos.

### Mejoras
- **Fluidez de knobs optimizada**: Implementado `requestAnimationFrame` para renderizado suave y sin stuttering durante interacciones con knobs, mejorando especialmente la experiencia en tablets y móviles.
- **Escala Synthi 100 en knobs**: Los knobs de frecuencia ahora usan escala logarítmica (0-10) fiel al hardware original, con visor de valor en tiempo real.
- **Centralización de parámetros de audio**: Parámetros de osciladores (frecuencia, niveles, etc.) ahora centralizados en `oscillator.config.js` para mejor mantenibilidad.
- **Dormancy con early exit real en todos los módulos**: El sistema de dormancy ahora suspende realmente el procesamiento DSP (no solo silencia):
  - **Osciladores**: mensaje `setDormant` al worklet → early exit en `process()`. Ahorra ~95% CPU.
  - **NoiseModule**: mensaje al worklet + silencia levelNode. El generador Voss-McCartney no procesa.
  - **Output Bus**: desconecta `busInput` del grafo (de filterLP o levelNode según bypass). Los filtros LP/HP no procesan audio.
  - **InputAmplifier**: silencia los 8 GainNodes. Restaura niveles al despertar.
  - **Oscilloscope**: mensaje al worklet scopeCapture → pausa captura y trigger.
  - La fase de osciladores se mantiene para coherencia al despertar.
- **Algoritmo de Seno Híbrido**: Nueva implementación de la forma de onda sinusoidal que combina precisión digital en el centro con un modelado analógico (Tanh Waveshaper) en los extremos. Elimina los "kinks" previos y reproduce fielmente la estética "Vientre Redondo / Punta Aguda" del hardware original.
- **Alineación de Fase Global**: Recalibración de todas las formas de onda para referenciarse al Pico del Seno (Fase 0 = +1.0).
    - **Triángulo**: Invertido para coincidir fase 0 con pico positivo.
    - **Pulso**: Desplazado +90° para estar centrado respecto al pico del seno.
    - **Sawtooth**: Mantiene su rampa estándar de reset.
- **Calibración del Sine Shape**: Nuevos parámetros para ajustar el comportamiento del conformador de seno:
    - `sineShapeAttenuation`: Emula la reducción de amplitud 8:1 del hardware (seno 4V p-p → cuspoide 0.5V p-p).
    - `sinePurity`: Controla cuánto seno digital puro se mezcla en el centro (0=100% analógico, 1=100% digital). Por defecto 0.7 para conservar el "color" del circuito electrónico.

### Añadido
- **Hard sync en matriz de audio (Panel 5)**: columnas 24-35 exponen las entradas de sincronización de los 12 osciladores. Al conectar una señal de audio, esta resetea la fase del oscilador destino en cada flanco positivo, permitiendo crear timbres armónicos complejos característicos de la síntesis analógica clásica.
- **Fase maestra unificada en osciladores**: todas las formas de onda (sine, saw, tri, pulse) ahora derivan de una única fase maestra en el worklet. Garantiza coherencia perfecta entre formas de onda al cambiar frecuencia. La fase maestra es el sawtooth (rampa 0→1), del cual se derivan las demás ondas.
- **Multi-waveform oscillator**: nuevo modo `multi` en el worklet que genera las 4 formas de onda simultáneamente con 2 salidas (sine+saw, tri+pulse). Reduce ~70% los nodos de audio por oscilador.
- **AudioParams de nivel por forma de onda**: `sineLevel`, `sawLevel`, `triLevel`, `pulseLevel` permiten control sample-accurate del volumen de cada forma de onda directamente en el worklet.
- **Preparación para hard sync**: entrada de sincronización lista en el worklet. La fase se resetea en cada flanco positivo de la señal de sync. Método `connectSync()` disponible para conectar osciladores.
- **Sistema de dormancy**: optimización de rendimiento que silencia automáticamente módulos de audio sin conexiones activas en la matriz. Reduce carga de CPU especialmente en dispositivos móviles. Configurable en Ajustes → Avanzado → Optimizaciones.
- **Filter bypass**: optimización que desconecta los filtros LP/HP cuando están en posición neutral (|valor| < 0.02), reduciendo carga de CPU. Habilitado por defecto. Configurable en Ajustes → Avanzado → Optimizaciones.
- **Modo de latencia**: permite elegir entre "Interactivo" (baja latencia, ideal para desktop) y "Reproducción" (buffers grandes, estable en móviles). Por defecto: móviles usan Reproducción, desktop usa Interactivo. Cambiar requiere reiniciar la aplicación.
- **Sección Optimizaciones** en Ajustes: nueva sección extensible en la pestaña Avanzado que agrupa todas las optimizaciones de rendimiento con controles de debug individuales y globales.
- **Modificador CSS `.knob--xs`**: nuevo tamaño extra pequeño (36px) para knobs, disponible para uso futuro.

### Cambiado
- **Panel 1 y Panel 4 son solo visuales**: Los osciladores de estos paneles son módulos dummy que serán reemplazados por otros módulos en el futuro. Se mantiene la UI visual (knobs, controles) para testing de fluidez pero no se crean AudioWorkletNodes ni GainNodes, ahorrando recursos.
- **Arquitectura de osciladores del Panel 3**: cada oscilador ahora usa un único worklet multi-waveform en lugar de 4 nodos separados (2 worklets + 2 OscillatorNode nativos). Reduce overhead de scheduling del AudioGraph.
- **Panel 3 requiere worklet**: eliminado fallback a OscillatorNode nativo. Los navegadores sin soporte de AudioWorklet no podrán usar el Panel 3.
- **Knobs de Output Channels unificados**: ahora usan `createKnobElements()` de `knobFactory.js` y las clases genéricas `.knob`/`.knob--sm`, igual que osciladores e input amplifiers. Permite compartir código común entre módulos.

### Mejorado
- **Calidad de sonido del Oscilador Senoidal**: Nuevo algoritmo híbrido para el control "Shape/Symmetry".
    - Centro (0.5): Sinusoide matemáticamente pura (sin armónicos), superando al hardware original en pureza.
    - Extremos: Emulación de circuito analógico (Waveshaper Tanh) con saturación suave y cruce por cero lineal, eliminando los "kinks" de versiones anteriores.
    - Dirección del control invertida para coincidir con el manual original (0 = Vientre arriba).
- **Rendimiento de osciladores**: ~70% menos nodos de audio por oscilador, menos context switches, mejor cache locality al calcular todas las ondas desde la misma fase.

### Corregido
- **Carga de worklets en tablets/móviles**: corregida race condition donde los osciladores intentaban crearse antes de que el worklet terminara de cargar. Ahora `ensureAudio()` espera a `ensureWorkletReady()`.
- **Cambio de latencia en caliente**: corregido error "AudioWorklet does not have valid AudioWorkletGlobalScope" al cambiar el modo de latencia. `closeAudioContext()` ahora llama `stop()` en todos los módulos y resetea el estado del worklet.
- **Patches no se aplicaban en móviles**: corregido problema donde los patches guardados no tenían efecto en dispositivos móviles debido a que el worklet no estaba listo. Añadido sistema de reintentos automáticos.
- **Warning "AudioContext was not allowed to start"**: eliminado el resume automático del AudioContext. El audio se reanuda ahora con gestos del usuario (mover knobs, botón mute) en lugar de al cargar la página.

## [0.3.0] - 2026-01-11

### Añadido
- **Stereo buses (Pan 1-4 y Pan 5-8)**: dos buses estéreo con control de panning que mezclan los 8 canales de salida en dos grupos de 4. Conectados a la matriz de audio (filas 75-82) y control.
- **Filtro bipolar LP/HP** en cada canal de salida: control único que actúa como low-pass (giro izquierda), bypass (centro) o high-pass (giro derecha).
- **Botón On/Off** en cada canal de salida para silenciar individualmente sin afectar el nivel.
- **8 Input Amplifiers como fuentes CV** en matriz de control (filas 67-74).
- **8 Output Buses como fuentes** en matriz de audio (filas 75-82) y control.
- **Osciloscopio en matriz de control** (columnas 64-65) para visualizar señales de modulación.
- **Pistas de grabación aumentadas a 12**: configuración de grabación WAV ahora permite hasta 12 pistas (antes 8).
- **Matriz de grabación adaptativa**: las columnas se ajustan automáticamente al número de pistas configurado.
- **Tooltips en pines de matriz**: al pasar el ratón (desktop) o tocar (móvil) un pin, se muestra un tooltip con "Origen → Destino" (ej: "Input 1 → Out 1"). Labels localizables vía i18n.
- **Efecto visual de pulso** en el pin activo mientras el tooltip es visible.
- **Detección inteligente de gestos móviles**: los tooltips no se activan durante gestos de pinch/pan.
- **Visualización de pines inactivos**: los pines sin source O sin destination aparecen atenuados (20% opacidad) y deshabilitados por defecto. Preferencia configurable con actualización en caliente.
- **Nueva pestaña "Visualización"** en Ajustes: agrupa escala de renderizado (movida desde General) y toggle de pines inactivos.
- **Infraestructura de tests mejorada**: mocks de AudioContext para tests unitarios de módulos de síntesis. Suite de tests expandida a 355+ casos.

### Cambiado
- **Idioma de fallback i18n**: cambiado de español a inglés para que las traducciones faltantes muestren texto en inglés en lugar de claves entre corchetes.
- **Reorganización de Ajustes**: escala de renderizado movida de General a la nueva pestaña Visualización.
- **Mute separado de CV**: el nodo de mute ahora es independiente del nodo de CV para evitar que modulaciones CV bypaseen el silenciamiento.

### Corregido
- **Pan modificaba volumen**: corregido bug donde ajustar el pan alteraba involuntariamente el nivel de salida.
- **Atajos de teclado con sliders/pines enfocados**: ahora funcionan correctamente cuando un control tiene foco.

## [0.2.0] - 2026-01-09

### Añadido
- **Matriz de control (Panel 6) operativa**: modulación de frecuencia de osciladores desde la matriz.
- **Sistema exponencial V/Oct** para modulación de frecuencia: 1V por octava, rangos ±5 octavas.
- **Mantener pantalla encendida** (Screen Wake Lock API) con toggle en Ajustes → General, activado por defecto, deshabilitado automáticamente en navegadores sin soporte (iOS < 18.4).
- **Diálogo de entrada de texto** (`InputDialog`) reemplazando `prompt()` nativo con soporte i18n.

### Cambiado
- SVGs de paneles 5 y 6 re-optimizados: reducción ~74% (221KB → 58KB, 233KB → 61KB).
- Traducciones en caliente: cambiar idioma actualiza inmediatamente todos los textos sin recargar.
- Paneles 1, 2, 3 y 4 sin fondo SVG temporalmente (en desarrollo).

### Corregido
- Escala de renderizado guardada (1×-4×) ahora se aplica correctamente al iniciar la app.
- Mensaje del bloqueador de orientación ahora traducible.
- Menú contextual del navegador deshabilitado para evitar interferencias.
- Flujo de actualización mejorado: instalación bajo demanda de nuevas versiones.
- Indicador de actualización pendiente visible en ajustes tras rechazar diálogo inicial.

## [0.1.0] - 2026-01-08

### Añadido
- **Sistema de grabación de audio**: exportación WAV multitrack (1-8 pistas) con matriz de ruteo outputs→tracks configurable.
- **Sistema completo de atajos de teclado**: `M` (mute), `R` (grabar), `P` (patches), `S` (ajustes), `F` (fullscreen), `Shift+I` (reset), `0-7` (navegación paneles). Personalizable con persistencia.
- **Diálogo de confirmación reutilizable** (`ConfirmDialog`) con opción "no volver a preguntar".
- **Botón de mute global** siempre visible en la quickbar (panic button).
- **Sistema completo de patches**: guardar, cargar, renombrar, eliminar, exportar/importar archivos `.sgme.json`.
- **Autoguardado configurable** (intervalos: desactivado, 30s, 1m, 5m, 10m) con restauración opcional al inicio.
- **8 Input Amplifiers**: canales de entrada con control de ganancia individual.
- **PWA instalable** con soporte offline, manifest, service worker versionado y aviso de actualización.
- Iconos de paneles diseñados por Sylvia Molina Muro.
- Panel con 8 salidas (output channels) con volumen y enlace a ambos canales stereo.
- Matriz grande de pines 63×67, optimizada para zoom y paneo.
- Sistema de AudioWorklets para síntesis con fase coherente y anti-aliasing PolyBLEP.
- Opciones de conexión entrada/salida con dispositivos del sistema (micros, altavoces).

### Cambiado
- Gestos táctiles mejorados: pan con dos dedos simultáneo a zoom.
- Vista inicial ajustada para mostrar todo el sintetizador.
- Sistema de despliegue de paneles con animación de zoom centrado (doble click o botón).
- Mejoras de nitidez al hacer zoom en todos los navegadores.

### Corregido
- Correcciones menores de estabilidad en navegación táctil.

## [0.0.1] - 2025-12-01
### Añadido
- Prueba de concepto mínima (interfaz + sonido).
- Primera publicación experimental de SynthiGME-web con interfaz Web Audio funcional y build automatizada hacia `docs/` (modo PWA).


