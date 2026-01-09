# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

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


