## Output Channels - VCA CEM 3330 (versión Cuenca 1982)

### Contexto técnico

En el hardware real, los faders de los canales de salida NO procesan audio directamente.
Generan un voltaje de control (CV) que alimenta un chip VCA (CEM 3330).

**Especificaciones del hardware:**
- Fader: potenciómetro lineal 10kΩ que genera 0V (posición 10) a -12V (posición 0)
- VCA: respuesta logarítmica de 10 dB por cada voltio aplicado
- CV externo: se suma algebraicamente al voltaje del fader (entrada desde matriz columnas 42-49)
- Corte total: en posición 0, el fader desconecta mecánicamente (ignora CV externo)
- Raíles: ±12V (saturación suave con CV > 0V, hard clip en ±12V)

**Cadena de señal correcta (Cuenca 1982):**
```
Entrada Matriz → VCA (CEM 3330) → [Nodo división]
                                       ├─→ Re-entry a matriz (POST-VCA, PRE-filtro)
                                       └─→ Filtro LP/HP → Switch ON/OFF → Pan → Salida
```

**IMPORTANTE:** El VCA va ANTES del filtro. El filtro solo afecta a la salida externa,
no a la señal de re-entrada a la matriz.

### Plan de implementación

#### ✅ COMPLETADOS

- [x] **Paso 1: Constantes y funciones VCA** (commit `9a6e14b`)
  - `src/assets/js/utils/voltageConstants.js`:
    - Constantes: `VCA_DB_PER_VOLT`, `VCA_SLIDER_VOLTAGE_AT_MAX/MIN`, `VCA_CUTOFF_*`
    - `vcaDialToVoltage(dialValue)`: dial 0-10 → voltaje -12V a 0V
    - `vcaVoltageToGain(voltage)`: voltaje → ganancia (con saturación para CV > 0V)
    - `vcaCalculateGain(dialValue, externalCV)`: función combinada dial + CV → ganancia
  - `tests/utils/voltageConstants.test.js`: 15 tests unitarios

- [x] **Paso 2: Config VCA en outputChannel.config.js** (pendiente commit)
  - Fader cambiado de escala 0-1 a 0-10 (como dial físico)
  - `schemaVersion` incrementado a 2
  - Nueva sección `vca` con todos los parámetros documentados:
    - `dbPerVolt: 10`
    - `sliderVoltage: { atMax: 0, atMin: -12 }`
    - `cutoffVoltage: -12`
    - `saturation: { linearThreshold: 0, hardLimit: 3, softness: 2 }`
  - `tests/configs/outputChannel.config.test.js`: 13 tests nuevos

- [x] **Paso 3: Integrar VCA en outputChannel.js** (commit `113f65b`)
  - Importar `vcaCalculateGain` desde voltageConstants.js
  - `flushValue()` convierte dial (0-10) a ganancia vía VCA
  - `deserialize()` usa misma conversión
  - Display muestra valor del dial (0.0-10.0)
  - Curva logarítmica funcional: dial 10 = 0 dB, dial 5 = -60 dB
  - **Corte mecánico incluido**: dial=0 ignora CV externo (ya en Paso 1)

#### ⏳ PENDIENTES

- [ ] **Paso 4: Corregir cadena de señal en engine.js** ⚠️ CRÍTICO
  - **Problema actual:** `Entrada → Filtro → VCA → Mute → Pan`
  - **Cadena correcta:** `Entrada → VCA → [split] → Filtro → Mute → Pan`
  - Archivos a modificar:
    - `src/assets/js/core/engine.js`: reorganizar `_initOutput()`
    - Crear nodo de split POST-VCA para re-entry
  - El nodo de re-entry debe tomar señal POST-VCA, PRE-filtro
  - El medidor de nivel (si existe) también debe ir POST-VCA, PRE-filtro
  - Tests de integración para verificar cadena
- [ ] **Filtros de Output Channel (tarea genérica)**
  - Hardware: control pasivo 1er orden (6 dB/oct) con potenciómetro lineal 10kΩ
  - Dial 0-10: LP (0) ↔ Flat (5) ↔ HP (10); re-entry se toma antes del filtro
  - Solo colorea salida externa (monitores/Cannon), no modifica señal de matriz
  - Opciones a valorar:
    1. IIRFilterNode 1er orden (coeficientes manuales)
    2. AudioWorklet con filtro RC pasivo
    3. Aproximación pragmática (shelving) hasta decidir fidelidad
  - Revisar commits recientes de bypass suave en `engine.js` para integrar decisión

#### ✅ COMPLETADOS (CV de matriz)

- [x] **Paso 5: Conectar CV de matriz a Output Channels** (commit pendiente)
  - Columnas 42-49 de matriz de control → CV de canales 1-8
  - Implementado `setExternalCV(voltage)` en OutputChannel
  - Conversión escala: matriz (-1..+1) × 4 → voltios (-4V..+4V)
  - Recalcula ganancia cuando cambia CV externo
  - CV se muestrea via AnalyserNode a ~60Hz para no sobrecargar CPU
  - **Corte mecánico verificado**: dial=0 ignora CV (tests unitarios)

- [x] **Paso 6: Tests de VCA con CV externo** (incluido en Paso 5)
  - Tests unitarios para corte mecánico con CV
  - Tests de dial + CV combinados
  - Tests de curva logarítmica 10 dB/V

### Notas adicionales

- NO implementar switch de respuesta rápida (canales 5-7) - el Synthi de Cuenca no lo tiene
- Todos los valores numéricos en config, nunca hardcodeados
- El switch ON/OFF (mute) solo afecta salida externa, no re-entry

---

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

- Añadir un CREDITS.md