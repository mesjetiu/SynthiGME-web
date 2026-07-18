## Octave Filter Bank (placa PC-22, D100-22C1)

#### ✅ COMPLETADO

- [x] **Octave Filter Bank completo**
  - 8 filtros paso-banda BiquadFilterNode nativos en paralelo (sin worklet)
  - Frecuencias centrales: 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz
  - 12 dB/oct (2.º orden), Q = √2, ganancia de compensación +10 dB
  - Potenciómetros 10K logarítmicos (base 100), rango 0-10, valor inicial 10
  - Bypass automático por banda (dial ≥ 9.98 → inputGain directo, sin filtro activo)
  - Entrada audio Panel 5 col 23, salida fila 109. Sin CV
  - Dormancy automática (silencia sumNode), setting global FILTER_BYPASS_ENABLED compartido
  - Tooltips con frecuencia central y nivel en dB (patrón factory getOFBBandTooltipInfo)
  - 58 tests unitarios

---

## Output Channels - VCA CEM 3330 (versión Cuenca 1982)

#### ✅ COMPLETADO

- [x] **Filtros de Output Channel**
  - Hardware: control pasivo 1er orden (6 dB/oct) con potenciómetro lineal 10kΩ
  - Dial -5 a +5: LP ↔ Flat ↔ HP; re-entry se toma antes del filtro
  - Implementado como AudioWorklet con filtro RC pasivo (plano D100-08 C1)
  - Bypass automático cuando |valor| < 0.02

## Pitch to Voltage Converter (placa PC-25)

#### ✅ COMPLETADO

- [x] **PVC completo**
  - Detección de frecuencia por cruce por cero de medio ciclo
  - Conversión logarítmica 1V/Oct (ref A4=440Hz)
  - Track & Hold: mantiene último voltaje cuando señal cae bajo umbral
  - Knob Range vernier con curva piecewise de 3 segmentos
  - Entrada audio Panel 5 col 50, salida CV Panel 6 fila 121
  - Keepalive GainNode, lazy start, dormancy automática
  - Sincronización OSC (/pvc/range), 95 tests

#### ⏳ PENDIENTES

## Joystick Module

#### ✅ COMPLETADO

- [x] **Joystick Module completo (Left y Right)**
  - Señal DC bipolar ±8V (ConstantSourceNode + GainNode, sin worklet)
  - Knobs Range X/Y independientes (pot 10K LIN, dial 0-10)
  - Integración en Panel 6 (filas 117-120)
  - Dormancy automática (ningún eje conectado → silencio)
  - Serialización/deserialización de posición y rangos
  - Config en joystick.config.js, 37 tests unitarios

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

### Auditoría de rendimiento UI (marzo 2026)

- [x] Añadir instrumentación runtime (`window.__synthPerf`) para medir DOM/SVG/FPS/long tasks
- [x] Añadir script reproducible `npm run perf:ui` con Chromium + CDP + informe JSON
- [x] Obtener primera línea base en Linux (viewport principal + PiP)
- [ ] Medir variantes A/B de PiP para reducir `layout` durante zoom
- [ ] Medir impacto real de sombras/glows y desactivación visual agresiva
- [ ] Medir variante con fondos raster/canvas también en desktop
- [ ] Valorar transición de zoom global continuo a navegación centrada en paneles/PiP
- [ ] Añadir batería equivalente manual para Firefox/Linux y comparar contra Chromium

### Auditoría de eficiencia zoom/pan/dibujado (julio 2026) — documentado, sin acción por ahora

Revisión de código y del historial de fixes de zoom/PiP/nitidez. Contexto: las buenas
prácticas ya están aplicadas (gestos coalescidos a 1 rAF, transform-only, `contain`
afinado, snap a píxel de dispositivo, histéresis low-zoom, `isInputPending()` en el
commit del sharp mode, zoom residual, will-change dinámico en modo performance).
El techo es estructural: ~45k nodos DOM / ~26k SVG / 8.442 pines → 33 FPS idle en la
línea base propia. Hallazgos, de más barato a más ambicioso:

1. **Canvas de fondo dibuja en vacío (fix trivial).** `CANVAS_BG_SVG_BY_PANEL` está
   vacío (todo comentado; los paneles usan JPG por CSS), pero `renderCanvasBgViewport()`
   se ejecuta en cada frame de pan/zoom cuando `shouldUseCanvasBg()` es true (táctil y
   modo performance): crea la capa, dimensiona un canvas a 2× CSS px y hace `fillRect`
   negro completo (~8 MP/frame en 1080p) sin dibujar nada, más la VRAM del canvas
   permanente. Guard al inicio: si no hay URLs configuradas → return true sin tocar
   el canvas ni crear la capa. (`canvasBackground.js:19-26,146-213`)

2. **`refreshMetrics()` incondicional por frame en los bucles de zoom.**
   `stepViewportWheelZoom` (viewportNavigation.js ~1087) y `stepViewportKeyboardZoom`
   (~1060) hacen `metricsDirty = true; refreshMetrics()` en cada rAF, y el pinch marca
   `metricsDirty` en cada pointermove. Durante zoom por transform ni el contenido ni el
   outer cambian de tamaño: basta refrescar al inicio del gesto. `refreshMetrics()` hace
   `getBoundingClientRect` + recorrido de paneles leyendo `offsetLeft/offsetWidth`; con
   layout limpio es barato, pero si algo ensucia estilos a mitad de gesto se convierte
   en reflow forzado por frame.

3. **`dismissViewportTransientUi()` dispara evento global cada frame de gesto**
   (throttle 16 ms = 1/frame). Mejor: flag global "navegando" que tooltipManager
   consulte para no mostrar tooltips durante el gesto + un único dismiss al inicio.
   Ataca de raíz el problema (tooltips reapareciendo al pasar contenido bajo el puntero)
   y elimina trabajo por frame.

4. **Experimento clave: ¿es necesario el sharp mode?** Toda la maquinaria de
   rasterización adaptativa (CSS `zoom` + commit diferido + zoom residual) existe porque
   Chrome escala texturas ya rasterizadas → borroso. Pero la causa probable de que Chrome
   NO re-rasterice solo es el `will-change: transform` PERMANENTE de `#viewportInner`
   en modo calidad (main.css ~2067): fija la escala de raster de la capa. Chromium
   moderno re-rasteriza capas compuestas a la escala final al terminar el gesto si la
   capa no está fijada. Experimento: en modo calidad, quitar `will-change` al quedar
   idle (patrón `promoteWillChange`/`demoteWillChange` que ya usa el modo performance)
   y medir con `npm run perf:ui` si la re-raster natural da la misma nitidez. Si
   funciona, el sharp mode entero es prescindible; y CSS `zoom` invalida layout de los
   45k nodos, mientras el re-raster del compositor no toca layout.

5. **Culling manual de paneles fuera de pantalla a zoom alto.** Con foco en un panel,
   los otros 6 siguen pintándose. `content-visibility: auto` descartado (implica
   `contain: paint` → blur del SVG inline en Android, ya documentado). Alternativa:
   el código de navegación ya conoce scale/offsets y geometrías → calcular en JS qué
   paneles quedan completamente fuera del viewport (con margen) y ponerles
   `visibility: hidden` al terminar el gesto, restaurando antes de que entren en vista.
   Salta el paint sin tocar layout ni provocar el blur de contain:paint. A zoom de
   panel puede sacar del paint ~85% de la escena.

6. **Matrices de pines = el siguiente "knobs rasterizados".** Los 8.442 pines-botón son
   el bloque DOM restante más grande. Mismo patrón que knobs→PNG (~17k nodos eliminados):
   fondo pre-rasterizado por matriz (agujeros vacíos), DOM solo para pines colocados,
   hit-testing por coordenadas para hover/click/context-menu. El proyecto más caro,
   pero el único que ataca el techo de 33 FPS idle.

7. **PiP zoom (13,6 FPS, peor punto medido).** Antes de rediseñar, confirmar con
   `?perf=1` si durante rueda sobre PiP se escribe algo más que `transform` por frame
   (p. ej. `scrollLeft/scrollTop`, que fuerzan layout). Enlaza con la variante A/B ya
   pendiente arriba.

Prioridad sugerida: 1-3 son una tarde y sin riesgo; 4 es medición que puede permitir
BORRAR complejidad (hacerlo antes que optimizar más); 5-6 mueven el techo estructural,
en línea con ARCHITECTURE.md §3.1.3.

- ~~Crear menú contextual de cada mando, de cada módulo... para reiniciar, para poner un valor concreto...~~ ✅ Implementado (`contextMenuManager.js`)

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

> Auditoría 2026-07-18: se revisó cada entrada contra el historial de commits y se
> verificó con la suite de audio Playwright (202/218 pasan; los 16 fallos tienen causa
> identificada, ver sección "Tests de audio" más abajo).

### Abiertos (verificado en código, sin fix en el historial)

- Al reiniciar patch, permanece el dibujo en el osciloscopio.
  El commit ca6f2191 (24-feb) integró knobs/toggle del osciloscopio en estado y reinicio,
  pero nada limpia el trazo del canvas: `clearRect` solo ocurre dentro del ciclo de dibujo
  (`oscilloscopeDisplay.js`). Falta una llamada de limpieza al aplicar/reiniciar patch.

- No se conceden permisos de micro en Chrome android (móvil). Sin commits relacionados.

- En móvil no importa patches (en desktop sí, probado) - testear antes. Sin commits relacionados.

- Los menús contextuales de los pines son tan largos que en móvil no se ven enteros.
  Confirmado en código: `.pip-context-menu` (main.css) no tiene `max-height` ni
  `overflow-y`. Fix fácil. Lo mismo para la ventana desplegable de detach en el menú de la barra.

- Pines: tooltip molesta. Dar la posibilidad de un solo click en ajustes.
  Parcialmente mejorado (54fbb543: ya no desaparece con el ratón encima; 565664ab:
  estilo unificado), pero el ajuste de "solo con click" sigue sin existir en settingsModal.

### Probablemente resueltos (verificar de uso antes de cerrar)

- ~~Incongruencia en estado inicial en reiniciar (0) y inicio de app en freq (5).~~
  Casi seguro resuelto por el refactor R7 (62cd8e73, 18-mar): `resetModule`/`resetToDefaults`
  ahora leen los `initial` de los configs como fuente única de verdad
  (oscillator.config.js → `frequency.initial: 5`). Verificar en UI y cerrar.

- Asimetría DC en señales grabadas (corridas hacia el negativo, distorsión al subir volumen).
  Se añadió un DC blocker AudioWorklet de 1er orden en los Output Channels
  (5be9c8c8 → c636d058, 18-feb), en la ruta de altavoces: muteNode → dcBlocker → salida.
  DUDA IMPORTANTE: la grabación de canales individuales toma la señal en `muteNode`
  (engine.js `getRecordingNodes()`), es decir ANTES del DC blocker → las grabaciones
  individuales podrían seguir mostrando el offset. Los stereo buses sí cuelgan de
  `dcBlockerOut` (post-blocker). Pendiente: grabar y medir, y decidir si la toma de
  grabación individual debe moverse post-blocker (ojo: la re-entry debe seguir
  conservando DC para CV, eso es intencional).

## Tests de audio (auditoría 2026-07-18)

Estado: 202/218 pasan. Los 16 fallos NO son bugs de DSP en producción: todos los causa
el suavizado anti-zipper one-pole (5 Hz, τ≈32ms) añadido el 16-mar (6af6466f, 8fed4f25).
Verificado experimentalmente: con `_smoothAlpha = 1.0` los 16 tests pasan.

Detalle de la causa:
- El worklet inicializa `_smoothedFreq` desde `processorOptions.frequency ?? 440` y el
  resto de parámetros suavizados (symmetry 0.5, gain 1.0, levels 0) con defaults fijos.
- La app real (engine.js) SÍ pasa `frequency` por processorOptions → sin transitorio audible
  en producción. El harness de tests (harness.html) NO lo pasa → los primeros ~150ms
  barren desde 440 Hz y contaminan las mediciones (peaks, cruces por cero, octavas FM).
- Ejemplos: cuspoide mide ratio 1.0 porque el peak se captura en los primeros ms
  (symmetry aún ≈0.5); el E2E mide 272 Hz en vez de 261.63 (transitorio 440→261 incluido);
  hard sync cuenta 28 cruces en vez de 22 por la misma razón.

Fix pendiente (elegir uno):
1. (Preferido) Worklet: inicializar todos los `_smoothed*` desde el primer sample de cada
   AudioParam en el primer `process()` (lazy init) → elimina el transitorio para todos los
   consumidores sin perder el anti-zipper.
2. Harness: pasar todos los valores iniciales por `processorOptions` imitando a engine.js.
3. Tests: descartar los primeros ~200ms del buffer antes de medir.

Nota: `detune` NO está suavizado (correcto: la FM por matriz vía detune no se filtra).

## Documentación 

- Añadir a README.md referencia a Fuzzy Gab, quien apoya este proyecto y lo difunde.

- Revisar todo el documento ARCHITECTURE.md: errores, omisiones, desactualizaciones... Ha de servir de base a un eventual estudio escrito.

## Objetivo v0.7.0

- [x] Colocar todos los módulos aunque no estén funcionando.
- [ ] OSC: probar entre dispositivos y perfeccionarlo.
- [ ] Revisar input amplifier levels según manuales técnicos.

## Objetivo v0.8.0 (optimización y publicación tester)

- Release con versión en web, PWA, electro (Linux y Windows)
- Corregir errores varios en todas las plataformas.
- Créditos de fotos de paneles (si se mantienen)
- ~~Hacer los SVGs de paneles.~~ ✅ Panel 3 SVG hecho.

## Después...

- Parámetros no modificables por VC pasarlos a control rate.
- los filtros muestran aliasing cuando pongo una señal estrecha, sinusoidal por el Q alto. Parece que sus armónicos pronto se reflejan creando el efecto clarísimo de aliasing... podemos filtrarlo o hacer algo para evitarlo?
  (Posiblemente mitigado por 92588b72, 10-mar: 2x oversampling LP + HP, incluido en v0.8.0. Verificar de oído antes de cerrar.)


- crear sistema de capas en pip.
