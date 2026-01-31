# SynthiGME-web

SynthiGME-web es una emulación del sintetizador modular **Synthi 100** del Gabinete de Música Electroacústica (GME) de Cuenca. Es una herramienta diseñada para la experimentación sonora, la pedagogía y la preservación digital de este instrumento histórico.

Esta versión web permite explorar el sintetizador directamente desde tu navegador, sin necesidad de instalar nada.

## 🚀 Acceso Rápido

### 🌐 Versión Web
Puedes usar el sintetizador ahora mismo entrando en el siguiente enlace:

👉 **[https://mesjetiu.github.io/SynthiGME-web/](https://mesjetiu.github.io/SynthiGME-web/)**

*Funciona en Chrome, Edge, Firefox y Safari (versiones recientes).*

### 🖥️ Versión de Escritorio
Si prefieres una aplicación nativa para mejorar el rendimiento y evitar limitaciones del navegador:

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
| **12 Osciladores** | Formas de onda: pulso, seno, triángulo, diente de sierra. Rango 1Hz–10kHz. Incluye *Hard Sync*. |
| **Filtros y Ruido** | 2 Generadores de ruido (blanco/rosa) y filtros paso bajo/alto en la salida. |
| **Matrices 60x60** | Dos matrices de conexión: Audio (Panel 5) y Control (Panel 6). Usa los pines para conectar módulos. |
| **Osciloscopio** | Visualización de señal en tiempo real (modos tiempo y X-Y Lissajous). |
| **Grabación** | Exporta tu sesión directamente a archivos de audio WAV multitrack (hasta 12 pistas). |
| **Patches** | Guarda y carga tus configuraciones. Incluye autoguardado para no perder trabajo. |

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
| `1`-`8` | Navegar rápidamente entre paneles |
| `Ctrl` + Click | Mover knobs 10 veces más rápido |
| `Shift` + Click | Mover knobs con precisión fina |

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
- **Emulación de voltajes**: Activa el comportamiento "analógico" (imprecisión de componentes, deriva térmica) para un sonido más auténtico.

---

## 💻 Requisitos del Sistema

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

> **Nota:** La carpeta `docs/` se genera automáticamente. No edites archivos allí.

---

## Licencia y Créditos

Este proyecto se distribuye bajo licencia **[MIT](LICENSE)**.

- **Autoría y Desarrollo**: Carlos Arturo Guerra Parra.
- **Diseño de Paneles**: Sylvia Molina Muro.
- **Tutoría Original**: José Manuel Berenguer Alarcón (Máster Arte Sonoro UB).

Basado en la investigación y el proyecto original en SuperCollider: [SynthiGME](https://github.com/mesjetiu/SynthiGME).
