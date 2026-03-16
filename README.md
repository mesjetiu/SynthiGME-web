# SynthiGME-web

SynthiGME-web es una emulación del sintetizador modular **Synthi 100** del Gabinete de Música Electroacústica (GME) de Cuenca. Es una herramienta diseñada para la experimentación sonora, la pedagogía y la preservación digital de este instrumento histórico.

Esta versión web permite explorar el sintetizador directamente desde tu navegador, sin necesidad de instalar nada.

**Última actualización:** 8 de marzo de 2026 (PiP-first consolidado, knobs rasterizados, scripts SVG→PNG, cleanup de assets y ampliación de cobertura de tests)

## 🚀 Acceso Rápido

### 🌐 Versión Web
Puedes usar el sintetizador ahora mismo entrando en el siguiente enlace:

👉 **[https://mesjetiu.github.io/SynthiGME-web/](https://mesjetiu.github.io/SynthiGME-web/)**

*Funciona en Chrome, Edge, Firefox y Safari (versiones recientes).*

### 🖥️ Versión de Escritorio
Si prefieres una aplicación nativa con menú completo, soporte OSC y audio multicanal (12 canales de salida + 8 de entrada en Linux):

1. Ve a la sección de **[Releases](https://github.com/mesjetiu/SynthiGME-web/releases)**.
2. Descarga el instalador para tu sistema operativo:
   - **Windows**: Archivo `.exe`
   - **Linux**: Archivo `.AppImage`

---

## 📱 Solución de problemas (Móviles y Tablets)

Si usas SynthiGME-web en un dispositivo móvil y no escuchas sonido:

**⚠️ El interruptor de "Silencio" (Mute) de iOS/iPhone bloquea el audio web.**
Asegúrate de que el interruptor físico de silencio de tu iPhone/iPad no está activado. Es una limitación conocida de iOS con aplicaciones Web Audio.

**Rendimiento en móviles:**
El motor de audio es exigente. Si notas cortes o "glitches" en el sonido:
1. Cierra otras pestañas del navegador.
2. Usa el modo "Dormancy" (activado por defecto) que apaga los módulos que no estés usando.

---

## 🎹 Manual de Usuario

### Características Principales

| Módulo | Descripción |
|--------|-------------|
| **12 Osciladores** | Formas de onda: pulso, seno, triángulo, diente de sierra. Rango 1Hz–10kHz. Incluye *Hard Sync* y *PWM CV desde matriz*. |
| **Generadores de Ruido** | 2 Generadores con filtro COLOUR auténtico IIR 6dB/oct (circuito Synthi 100 Cuenca). Transición continua LP↔white↔HP. |
| **Filtros CEM3320** | 8 filtros del Panel 1 (4 LP + 4 HP), 4 polos, 24 dB/oct. Integrador TPT con saturación OTA por etapa. Autooscilación real. Entradas de audio y CV de cutoff en matrices. |
| **3 Envelope Shapers** | Generador de envolvente ADSR+Delay con 5 modos (Gated F/R, Free Run, Gated, Triggered, Hold). Tiempos 1ms–20s. Salida CV ±5V para modulación vía matrices. |
| **3 Ring Modulators** | Multiplicador de señales de precisión (chip 4214AP). Soft-clip tanh, breakthrough −64dB. |
| **Spring Reverb** | Reverberación de muelle con allpass + feedback loop (RT60=2.4s). Mix wet/dry con control CV. |
| **Secuenciador Digital** | Digital Sequencer 1000: memoria de 1024 eventos, 6 pistas de voltaje (0-7V, DAC 8-bit), 4 pistas de key/gate. Grabación selectiva con overdubbing. Clock interno 0.1-500 Hz. Display hex. |
| **Pitch to Voltage** | Convertidor de frecuencia a voltaje 1V/Oct con track & hold. Detecta el pitch de señales de audio y genera CV proporcional. |
| **Teclados duales** | Upper y Lower keyboard con Pitch (1V/Oct), Gate y Velocity. Modos Normal/Latch/Legato. MIDI Learn. Ventana flotante PiP. |
| **Random CV Generator** | Generador de voltaje aleatorio con reloj 0.2-20 Hz y jitter configurable. 2 salidas DC ±2.5V + pulso Key. |
| **Joysticks** | 2 joysticks XY con voltaje DC bipolar (±8V), knobs Range X/Y independientes. Control en tiempo real para modulación de parámetros vía matriz de control. |
| **Filtros de salida** | Filtro RC pasivo de 1er orden (6 dB/oct, fc ≈ 677 Hz) en cada canal de salida. Corrección tonal suave y musical. |
| **VCA de salida** | Curva CEM 3330 (10 dB/V), saturación suave y filtro anti-click de 1 polo (τ=5ms) tras la suma fader+CV. |
| **Matrices 60x60** | Dos matrices de conexión: Audio (Panel 5) y Control (Panel 6). Usa los pines para conectar módulos. |
| **Osciloscopio** | Visualización de señal en tiempo real (modos tiempo y X-Y Lissajous). |
| **Grabación** | Exporta tu sesión directamente a archivos de audio WAV multitrack (hasta 12 pistas). |
| **Patches** | Guarda y carga tus configuraciones. Incluye autoguardado para no perder trabajo. |
| **Undo/Redo** | Deshaz/rehaz cambios con Ctrl+Z / Ctrl+U (hasta 50 estados). |
| **Knobs SVG** | Controles rotativos auténticos del Synthi 100 original con colores reales. Estilo CSS alternativo disponible en Ajustes. |
| **Notas post-it** | Notas arrastrables sobre paneles y viewport. Texto enriquecido, colores, copiar/pegar. |
| **Flujo de señal** | Hover/tap sobre módulo o pin muestra orígenes (cyan) y destinos (magenta) con glow animado. |
| **Menú contextual** | Clic derecho/long press para reiniciar panel, módulo o control individual. |
| **MIDI Learn** | Conecta cualquier controlador MIDI externo a los controles del sintetizador. CC, Pitch Bend y Notes. Menú contextual → "MIDI Learn". Mappings persistentes y exportables. |
| **Easter egg** | Secuencia secreta en joysticks desencadena animación y pieza electroacústica. |
| **Audio Multicanal** | 12 canales de salida + 8 de entrada independientes en Linux (PipeWire). [Más info](MULTICHANNEL.md). |

### Navegación visual y PiP

- **Canvas principal fijo**: la vista principal funciona como overview del sintetizador completo.
- **PiP como foco principal**: haz **doble clic** o **doble tap** sobre un panel del canvas para extraerlo a una ventana flotante. Repite el gesto sobre la PiP para devolverlo.
- **Geometría recordada**: al volver a extraer un panel, se recupera su última posición y tamaño detached.
- **Controles coherentes**: quickbar, menú contextual, menú Electron y atajos de teclado usan el mismo modelo para extraer/devolver paneles y actuar sobre la **PiP enfocada**.

### Atajos de Teclado
Usar el teclado hace la experiencia mucho más fluida:

| Tecla | Acción |
|-------|--------|
| `M` | Silenciar/activar audio (Mute global) |
| `R` | Iniciar/detener grabación |
| `P` | Abrir navegador de Patches |
| `S` | Abrir Ajustes |
| `F` | Pantalla completa |
| `Shift+I` | Reinicializar (Panic) |
| `Ctrl+Z` | Deshacer |
| `Ctrl+U` | Rehacer |
| `1`-`7` | Extraer/devolver rápidamente cada panel usando su última geometría PiP |
| `0` | Extraer/devolver todos los paneles; si una PiP está enfocada, ajustarla a formato cuadrado |
| `←↑→↓` | Panear la PiP enfocada o, si no hay ninguna, el canvas principal |
| `Ctrl+`/`Ctrl-` | Zoom in/out del contenido de la PiP enfocada o del canvas |
| `Ctrl+0` | Restablecer el zoom del contenido de la PiP enfocada o del canvas |
| `+` / `-` / `0` | Con una PiP enfocada: maximizar, restaurar tamaño o ajustar a cuadrado |
| `Esc` (doble) | Cerrar todas las PiP abiertas |
| `Ctrl` + Click | Mover knobs 10 veces más rápido |
| `Shift` + Click | Mover knobs con precisión fina |

> **Versión Electron:** Todas estas acciones también están disponibles desde el menú nativo de la aplicación.

### Ajustes

Pulsa el icono de engranaje (o la tecla `S`) para configurar:
- **Idioma**: Cambia el idioma de la interfaz. Actualmente soportamos:
  - 🇪🇸 Español
  - 🇬🇧 English
  - 🇫🇷 Français
  - 🇩🇪 Deutsch
  - 🇮🇹 Italiano
  - 🇵🇹 Português
  - 🇨🇿 Čeština
- **Escalado**: Aumenta el tamaño de la interfaz (1x - 4x).
- **Estilo de knobs**: Alterna entre knobs SVG auténticos del Synthi 100 (por defecto) y knobs CSS simplificados.
- **Efecto glow**: Elige entre 4 presets de halo en controles: performance, standard, subtle u off.
- **Flujo de señal**: Activa/desactiva el resaltado visual de conexiones al pasar sobre módulos.
- **MIDI**: Dispositivos detectados, tabla de mappings activos, exportar/importar configuración.
- **Emulación de voltajes**: Activa el comportamiento "analógico" (imprecisión de componentes, deriva térmica) para un sonido más auténtico.

---

## � Privacidad y Telemetría

SynthiGME incluye un sistema de **reportes anónimos** completamente opcional:

- **Opt-in**: se te pide permiso la primera vez. Si no aceptas, no se envía nada.
- **Anónimo**: un UUID aleatorio identifica la instalación, sin nombre, email ni IP.
- **Mínimo**: solo se reportan errores técnicos y arranques de sesión.
- **Sin datos musicales**: nunca se envían configuraciones de knobs, patches ni contenido.
- **Configurable**: puedes activar/desactivar en cualquier momento desde Ajustes > Avanzado.

Los reportes ayudan a detectar errores en distintas plataformas y mejorar la estabilidad de la aplicación.

---

## �💻 Requisitos del Sistema

No necesitas un ordenador potente, pero el procesamiento de audio en tiempo real requiere ciertos mínimos:

- **Navegador**: Google Chrome, Edge o Brave (recomendados). Firefox y Safari compatibles.
- **CPU**: Procesador de 4 núcleos recomendado para parches complejos.
- **RAM**: 4GB o más.

---

## 🛠️ Para Desarrolladores

Este es un proyecto Open Source. Si quieres ver el código, compilarlo tú mismo o contribuir, consulta la documentación técnica:

1. **[Guía de Desarrollo (DEVELOPMENT.md)](DEVELOPMENT.md)**: Instrucciones para instalar, compilar y ejecutar tests.
2. **[Arquitectura (ARCHITECTURE.md)](ARCHITECTURE.md)**: Explicación profunda de cómo funciona el motor de audio y la UI.
3. **[Protocolo OSC (OSC.md)](OSC.md)**: Documentación para controlar el sintetizador externamente.
4. **[Audio Multicanal (MULTICHANNEL.md)](MULTICHANNEL.md)**: Guía de configuración de salida/entrada multicanal (Linux + PipeWire).

> **Nota:** La carpeta `docs/` se genera automáticamente. No edites archivos allí.

---

## 📢 Comunidad y Soporte

¿Tienes dudas, sugerencias o quieres estar al día de las novedades? ¡Únete a nuestra comunidad!

👉 **[Grupo de Telegram: SynthiGME](https://t.me/synthigme)**

Es un espacio para compartir parches, proponer mejoras, reportar errores y participar como tester en las versiones beta.

---

## Financiación

Este proyecto ha sido desarrollado con financiación pública. Subvencionado por:

<p align="center">
  <img src="resources/funding/funding-logos.jpg" alt="Subvencionado por: Cofinanciado por la Unión Europea, Ministerio de Hacienda y Función Pública, Fondos Europeos, Castilla-La Mancha" width="700">
</p>

<p align="center">
  <img src="resources/funding/uclm-fuzzygab.jpg" alt="Universidad de Castilla-La Mancha (UCLM) – Fuzzy Gab" width="700">
</p>

---

## Licencia y Créditos

Este proyecto se distribuye bajo licencia **[MIT](LICENSE)**.

- **Autoría y Desarrollo**: Carlos Arturo Guerra Parra.
- **Diseño de iconos**: Sylvia Molina Muro.

Basado en la investigación y el proyecto original en SuperCollider: [SynthiGME](https://github.com/mesjetiu/SynthiGME).
