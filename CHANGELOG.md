# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Mantener pantalla encendida** (Screen Wake Lock API) con toggle en Ajustes → General, activado por defecto, deshabilitado automáticamente en navegadores sin soporte (iOS < 18.4).

## [0.1.0] - 2026-01-08

### Added
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

### Changed
- Gestos táctiles mejorados: pan con dos dedos simultáneo a zoom.
- Vista inicial ajustada para mostrar todo el sintetizador.
- Sistema de despliegue de paneles con animación de zoom centrado (doble click o botón).
- Mejoras de nitidez al hacer zoom en todos los navegadores.

### Fixed
- Correcciones menores de estabilidad en navegación táctil.

## [0.0.1] - 2025-12-01
### Added
- Prueba de concepto mínima (interfaz + sonido).
- Primera publicación experimental de SynthiGME-web con interfaz Web Audio funcional y build automatizada hacia `docs/` (modo PWA).


