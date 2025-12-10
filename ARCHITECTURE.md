# Arquitectura de salidas lógicas

## Objetivo
Replicar el panel de 8 salidas del Synthi 100 dentro de SynthiGME-web. Cada salida es un bus lógico con control independiente de nivel (y, más adelante, paneo) que termina mezclándose en las salidas físicas disponibles (hoy estéreo, mañana potencialmente multicanal si el navegador lo permite).

## Estado actual
- `AudioEngine` (`src/assets/js/core/engine.js`) solo crea dos buses (`bus1`, `bus2`) con sus `GainNode` y mezcla final en L/R.
- `OutputRouterModule` expone las ganancias de esos dos buses como entradas CV pero no encapsula lógica de paneo/ruteo.
- El panel UI `createOutputRouterUI` únicamente controla nivel y paneo de los dos buses existentes.

Este esquema limita el patching a dos salidas físicas y obliga a que cualquier expansión futura toque el motor directamente.

## Diseño propuesto
1. **Buses lógicos configurables**
   - Añadir `OUTPUT_CHANNELS` (por defecto 8) en `AudioEngine` para crear arreglos de `GainNode` por bus (`logicalBuses[]`).
   - Cada bus tendrá: `inputGain`, `levelModGain` (para CV), y referencias a los controles de UI.
   - API pública mínima:
     - `connectSourceToOutput(busIndex, node)`.
     - `setOutputLevel(busIndex, value)`.
     - `getOutputLevel(busIndex)`.

2. **Router maestro físico**
   - Nuevo componente (puede ser clase interna o módulo `OutputRouter`) encargado de mapear los buses lógicos a las salidas físicas (`physicalOutputs[]`).
   - Hoy el router mezcla todos los buses en 2 canales (L/R) respetando la ganancia de cada bus.
   - Futuro: si `audioCtx.destination.maxChannelCount > 2`, crear más `GainNode`/`ChannelMerger` y permitir asignaciones dinámicas (`busAssignments`), sin reescribir los módulos.

3. **Panel UI de 8 sliders**
   - Módulo dedicado con 8 faders verticales (solo nivel) que usa la API pública anterior.
   - Se ubica en un panel independiente mediante `PanelManager` para imitar la disposición del Synthi 100.
   - No se crean valores CV propios aún; solo control manual.

4. **Integración con la matriz**
   - En `Matrix` agregar destinos “Output 1…8” que conectan cada pin a `connectSourceToOutput`.
   - Las conexiones existentes continúan funcionando (bus 1/2 se reasignan a los dos primeros índices).

## Flujo de audio
1. Cada módulo produce audio y lo expone como `AudioNode`.
2. La matriz decide a qué buses lógicos se conecta un pin.
3. El bus lógico suma señales, aplica nivel (slider) y pasa por el router maestro.
4. El router mezcla/dirige el resultado hacia los canales físicos disponibles y finalmente al `AudioContext.destination`.

## Consideraciones
- El paneo por bus se añadirá más adelante; esta fase solo controla nivel para simplificar UI y lógica.
- Documentar esta arquitectura fuera de `docs/` permite referenciarla en issues/PR sin mezclarla con la documentación pública.
- Antes de implementar CV para los sliders, validar la estabilidad del pipeline de 8 buses y el impacto en rendimiento.
