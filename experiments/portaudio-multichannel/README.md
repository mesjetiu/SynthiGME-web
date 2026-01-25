# Prueba de Concepto: Salida Multicanal con PortAudio

Este experimento valida si podemos usar naudiodon (wrapper de PortAudio) para obtener salida de audio con más de 2 canales en Linux/PipeWire.

## Requisitos

- Node.js 18+
- Interfaz de audio con >2 canales (o PipeWire configurado para virtual surround)

## Instalación

```bash
cd experiments/portaudio-multichannel
npm install
```

> **Nota**: naudiodon incluye binarios precompilados. Si falla, puede necesitar compilar desde fuente (requiere PortAudio dev headers).

## Uso

### 1. Listar dispositivos

```bash
npm run list
```

Esto muestra todos los dispositivos de audio y cuántos canales soporta cada uno.
**Objetivo**: Verificar que al menos un dispositivo reporta `maxOutputChannels > 2`.

### 2. Test de tonos multicanal

```bash
# Usa el primer dispositivo con 4+ canales
npm run test

# Especificar dispositivo y canales
npm run test -- --device=5 --channels=4

# Con duración personalizada
npm run test -- --device=5 --channels=6 --duration=10
```

Cada canal emitirá un tono diferente (serie armónica: 220Hz, 440Hz, 660Hz...):
- Si solo escuchas 2 tonos mezclados → no hay multicanal real
- Si escuchas tonos separados en diferentes salidas → ¡funciona!

## Resultados esperados

### ✓ Éxito
```
[5] PipeWire ALSA [Scarlett 4i4]
    Canales de salida: 4 ✓ MULTICANAL
```

### ✗ Fallo
```
Ningún dispositivo reporta más de 2 canales.
```

En caso de fallo, verificar:
- Configuración de PipeWire/ALSA
- Que la interfaz de audio esté conectada y reconocida
- `pactl list sinks` muestra los canales correctos

## Siguiente paso

Si esta prueba funciona, procedemos con la integración en Electron según el plan en la conversación original.
