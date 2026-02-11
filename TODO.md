## Output Channels - VCA CEM 3330 (versión Cuenca 1982)

#### ⏳ PENDIENTES

- [ ] **Filtros de Output Channel (tarea genérica)**
  - Hardware: control pasivo 1er orden (6 dB/oct) con potenciómetro lineal 10kΩ
  - Dial 0-10: LP (0) ↔ Flat (5) ↔ HP (10); re-entry se toma antes del filtro
  - Solo colorea salida externa (monitores/Cannon), no modifica señal de matriz
  - Opciones a valorar:
    1. IIRFilterNode 1er orden (coeficientes manuales)
    2. AudioWorklet con filtro RC pasivo
    3. Aproximación pragmática (actual: BiquadFilter 2º orden)

## Oscilador/matriz:

- Implementar, testar y bien documentar todas las distorsiones y limites por voltajes, impedancias, etc. Servirá de base de la arquitectura global del synthi y de próximos módulos.

- Oscilador: Condiciones de entrar en dormant independientes para cada forma de onda.

### Intermodulación entre osciladores (futuro)

Según el Manual Técnico Datanomics 1982, al combinar múltiples formas de onda del 
mismo oscilador (por ejemplo, seno + sierra), se produce un efecto de intermodulación
debido a la saturación en los amplificadores de suma (I/C 6 e I/C 7).

**Comportamiento esperado:**
- La suma de formas de onda no es perfectamente lineal
- Aparecen componentes armónicos adicionales (distorsión por intermodulación)
- El efecto es más pronunciado cuando la suma se acerca a los raíles (±12V)

**Implementación propuesta:**
- Aplicar saturación (tanh o similar) DESPUÉS de sumar las formas de onda
- Usar los parámetros de `hybridClipping` de audioMatrix.config.js
- Calibrar contra el hardware real si es posible

**Prioridad:** Baja - el efecto es sutil y solo audible con amplitudes altas.
**Dependencias:** Requiere que `hybridClipping` esté integrado en el grafo de audio.


## Osciloscopio:


## UI:

- Crear menú contextual de cada mando, de cada módulo... para reiniciar, para poner un valor concreto...

## Sistema Dormancy:

- Detallar condiciones particulares más concretas para cada módulo para entrar y salir del estado "dormant". Hasta ahora solo se mira la matriz de conexiones.

## Pines de Matriz:

### Optimización pendiente: Bypass de filtro RC para pines de alta frecuencia

Los pines con frecuencia de corte muy superior a Nyquist (RED ~589kHz, BLUE ~159kHz, 
YELLOW ~72kHz) crean BiquadFilters efectivamente transparentes que consumen CPU 
innecesariamente.

**Optimización propuesta:**
- Detectar si `PIN_CUTOFF_FREQUENCIES[pinType] > sampleRate / 2` (Nyquist)
- Para esos pines, omitir creación del BiquadFilter y conectar directo: `source → gain → dest`
- La tasa de muestreo puede variar según AudioContext (44.1kHz, 48kHz, 96kHz...)
- Considerar `audioContext.sampleRate` en runtime para el umbral

**Archivos a modificar:**
- `src/assets/js/utils/voltageConstants.js`: añadir `shouldBypassFilter(pinType, sampleRate)`
- `src/assets/js/app.js`: condicional en `_handlePanel5AudioToggle()` y `_handlePanel6ControlToggle()`

**Impacto estimado:** ~0.1% CPU por conexión innecesaria. Con 50+ conexiones activas 
podría ser significativo en dispositivos móviles.

### Futuros (Experimentales - ver manual Belgrado p.2)
- Pines con diodos: comportamiento no lineal (rectificación)
- Pines con capacitores: filtrado pasa-altos/pasa-bajos en conexiones

## Otros:

- Asegurarse de que los patchs están guardando todo (panel 2, 3, 5, 6 y 7, que son los operativos ahora).

- Patches: poder sobrescribir un patch

- Hay 2 entradas de micro tras input amplifiers 

## Traducciones:


## Problemas:

- Al reiniciar patch, permanece el dibujo en el osciloscopio.

- Pines: tooltip molesta. Dar la posibilidad de un solo click en ajustes.

- No se conceden permisos de micro en Chrome android (móvil)

- En móvil no importa patches (en desktop sí, probado) - testear antes

- los menús contextuales de los pines son tan largos que en móvil no se ven enteros. Dar posibilidad de scroll. Lo mismo para la ventana desplegable de detach en el menú de la barra.

- Incongruencia en estado inicial en reiniciar (0) y inicio de app en freq (5).

- Noto un problema he grabado diversas señales en un editor de ondas. veo que hay cierta asimetría en todas ellas: están corridas hacia el negativo. Subiendo el volumen al máximo se nota distorsión en una forma de onda cualquiera porque la parte negativa pica un poco. Pasa con todas las formas. Hay que descubrir en qué punto de la cadena ocurre.

## Documentación 

- Añadir a README.md referencia a Fuzzy Gab, quien apoya este proyecto y lo difunde.

- Revisar todo el documento ARCHITECTURE.md: errores, omisiones, desactualizaciones... Ha de servir de base a un eventual estudio escrito.

## Objetivo v0.7.0

- Cada elemento (panel, módulo, grupo de módulos,se han de poder reiniciar a valor de inicio con menú contextual.
- Colocar todos los módulos aunque no estén funcionando.
- Botón y atajo de refresco (rasterización a demanda)

## Objetivo v0.8.0 (optimización y telemetría)

- Parámetros no modificables por VC pasarlos a control rate.
- Implementación de telemetría mínima.
- OSC: probar entre dispositivos y perfeccionarlo.
- Corregir errores varios en todas las plataformas.

## Objetivo v0.9.0 (publicación tester)

- Release con versión en web, PWA, electro (Linux y Windows)
- Revisar README.md con créditos, info básica. Canal de Telegram.
- Créditos de fotos de paneles (si se mantienen)
- Reordenación de opciones en Ajustes. Intuitivo...
- Hacer los SVGs de paneles.
- Añadir y completar CREDITS.md
