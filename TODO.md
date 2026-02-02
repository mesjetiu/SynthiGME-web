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

**Señal de re-entrada:** La señal post-VCA (antes de filtro y mute) vuelve a la matriz,
permitiendo usar el canal como VCA interno sin enviar audio a altavoces.

### Plan de implementación (pasos pequeños y testeables)

- [ ] **Paso 1: Constantes de VCA en voltageConstants.js**
  - Añadir `VCA_DB_PER_VOLT = 10`
  - Añadir `VCA_SLIDER_VOLTAGE_AT_MAX = 0` (posición 10 del dial)
  - Añadir `VCA_SLIDER_VOLTAGE_AT_MIN = -12` (posición 0 del dial)
  - Añadir `VCA_CUTOFF_DB = -120` (umbral de silencio absoluto)
  - Crear función `vcaVoltageToGain(voltageSum)`:
    - Si voltage ≤ -12V → return 0 (corte total)
    - Si voltage en rango lineal → ganancia = 10^(voltage × 10 / 20)
    - Si voltage > 0V → aplicar saturación híbrida (reutilizar `hybridSaturation`)
  - Crear función `dialPositionToVoltage(position)`:
    - position 0-10 → voltaje 0V a -12V (lineal)

- [ ] **Paso 2: Tests unitarios para funciones VCA**
  - En `tests/utils/voltageConstants.test.js`:
    - `vcaVoltageToGain(0)` → ~1.0 (0 dB, ganancia unidad)
    - `vcaVoltageToGain(-6)` → ~0.001 (-60 dB)
    - `vcaVoltageToGain(-12)` → 0 (corte total)
    - `vcaVoltageToGain(+2)` → >1.0 pero saturado
    - `dialPositionToVoltage(10)` → 0V
    - `dialPositionToVoltage(5)` → -6V
    - `dialPositionToVoltage(0)` → -12V

- [ ] **Paso 3: Actualizar outputChannel.config.js**
  - Cambiar `faders.level`: min=0, max=10 (escala del dial físico)
  - Añadir sección `vca`:
    ```javascript
    vca: {
      dbPerVolt: 10,
      sliderVoltageRange: { min: -12, max: 0 },
      cutoffDb: -120,
      // Saturación para CV positivo (reutilizar modelo de matriz)
      saturation: {
        linearThreshold: 0,     // 0V: empieza saturación suave
        softThreshold: 2.0,     // +2V: saturación notable
        hardLimit: 3.0,         // +3V: hard clip (equivale a +12V internos)
        softness: 2.0
      }
    }
    ```
  - El CV externo se suma al voltaje del slider para calcular ganancia final

- [ ] **Paso 4: Implementar lógica VCA en outputChannel.js**
  - Modificar `_onLevelChange(dialPosition)`:
    1. Calcular voltaje del slider: `sliderVoltage = dialPositionToVoltage(dialPosition)`
    2. Obtener CV externo actual (si hay): `externalCV = this.currentExternalCV || 0`
    3. Sumar: `totalVoltage = sliderVoltage + externalCV`
    4. Calcular ganancia: `gain = vcaVoltageToGain(totalVoltage)`
    5. Aplicar a `levelNode.gain` con rampa suave
  - Implementar `setExternalCV(voltage)` para recibir CV de la matriz
  - **Caso especial**: Si `dialPosition === 0`, forzar `gain = 0` (emula corte mecánico)

- [ ] **Paso 5: Tests de integración del VCA**
  - Crear/ampliar `tests/modules/outputChannel.test.js`:
    - Verificar curva logarítmica fader→ganancia
    - Verificar suma de CV externo
    - Verificar corte total en posición 0 ignora CV
    - Verificar saturación con CV positivo alto

- [ ] **Paso 6: Conectar CV de matriz a Output Channels**
  - Verificar que `audioMatrix.js` ya conecta columnas 42-49 a `outputLevelCV`
  - Asegurar que el CV llega al método `setExternalCV()` del canal correspondiente
  - El CV debe convertirse a voltios (-1..+1 digital → -4V..+4V) antes de sumar

### Notas adicionales

- El filtro de salida (LP/HP) está POST-VCA, no se ve afectado por este cambio
- La re-entrada a la matriz usa señal POST-VCA, PRE-filtro (ya implementado así)
- NO implementar switch de respuesta rápida (canales 5-7) - mi Synthi de Cuenca no lo tiene
- Todos los valores numéricos en config, nunca hardcodeados

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

- Invongruencia en estado inicial en reiniciar (0) y inicio de app en freq (5).

## Documentación 

- Añadir a README.md referencia a Fuzzy Gab, quien apoya este proyecto y lo difunde.

- Revisar todo el documento ARCHITECTURE.md: errores, omisiones, desactualizaciones... Ha de servir de base a un eventual estudio escrito.