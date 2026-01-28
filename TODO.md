
## Default:

- Salidas planeadas estéreo únicamente. Actualmente están estás y también salidas 1 y 2, lo cual es una redundancia innecesaria.

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

- Invongruencia en estado inicial en reiniciar (0) y inicio de app en freq (5).

## Documentación 

- Añadir a README.md referencia a Fuzzy Gab, quien apoya este proyecto y lo difunde.

- Revisar todo el documento ARCHITECTURE.md: errores, omisiones, desactualizaciones... Ha de servir de base a un eventual estudio escrito.

- Repensar README.md. 