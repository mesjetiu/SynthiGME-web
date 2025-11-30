# Device routing demo

Ejemplo mínimo para experimentar con dispositivos de entrada y salida expuestos por el navegador.

## Qué demuestra
- Solicitar permisos de micrófono con `navigator.mediaDevices.getUserMedia`.
- Enumerar dispositivos disponibles mediante `navigator.mediaDevices.enumerateDevices`.
- Monitorizar la entrada seleccionada reproduciendo su `MediaStream` en un elemento `<audio>`.
- Enviar un tono de prueba a la salida seleccionada usando `HTMLMediaElement.setSinkId` (solo navegadores compatibles, como Chrome/Edge de escritorio).

## Estructura
- `index.html`: interfaz básica con botones y selectores.
- `app.js`: lógica para pedir permisos, rellenar los `<select>` y rutear audio.
- `styles.css`: estilos rápidos para la demo.

## Cómo ejecutarlo
1. Lanza un servidor estático desde esta carpeta:
   ```bash
   npx serve experiments/device-routing
   ```
2. Abre la URL resultante en un navegador compatible (recomendado Chrome/Edge).
3. Pulsa **"Solicitar permiso"** y concede acceso al micrófono.
4. Usa los selectores para elegir entrada/salida y los botones para monitorizar o lanzar el tono de prueba.

> Desconecta manualmente los dispositivos cuando termines; el código es experimental y puede cambiar en cualquier momento.
