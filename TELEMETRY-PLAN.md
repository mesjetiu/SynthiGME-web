# Plan de implementación: Manejo de errores + Telemetría

Estado: **En progreso**
Inicio: 2026-02-12

---

## Visión general

Implementar un sistema completo de manejo de errores y telemetría mínima en 4 fases secuenciales. Cada fase construye sobre la anterior.

**Principios:**
- Opt-in explícito (consentimiento del usuario)
- Sin datos personales, sin IP, sin contenido del usuario
- Un único endpoint (Google Apps Script) que distribuye a Sheets y Telegram
- Token de Telegram oculto en el servidor (no expuesto en cliente)
- Compatible con modo offline (cola local con flush al reconectar)

---

## Fase 1 — Redes de seguridad globales

> **Objetivo:** Capturar errores que hoy desaparecen silenciosamente, sin modificar el código de módulos existentes.

### 1.1 Crear `src/assets/js/utils/errorHandler.js`

Módulo singleton que instala handlers globales al importarse:

- **`window.onerror`** → captura errores JS no controlados
- **`window.addEventListener('unhandledrejection')`** → captura Promises rechazadas
- **Ring buffer en memoria** (últimos 50 errores) con: timestamp, mensaje, stack, fuente, línea
- **Deduplicación por hash** del stack trace (mismo error no se repite en el buffer)
- **Cooldown** de 1s entre errores idénticos (evita floods en bucles de `requestAnimationFrame`)
- **API pública**:
  - `getErrorBuffer()` → retorna array de errores capturados
  - `onError(callback)` → suscribir listeners (para telemetría en Fase 3)
  - `getErrorCount()` → total de errores desde inicio de sesión
- **No muestra nada al usuario** (eso lo hace cada caller o el toast). Solo recolecta.

**Archivos:** nuevo `src/assets/js/utils/errorHandler.js`

### 1.2 Try/catch envolvente en bootstrap `DOMContentLoaded`

Envolver el handler completo de `DOMContentLoaded` en `app.js` con try/catch:
- En caso de error: ocultar splash screen y mostrar mensaje de error crítico al usuario
- Usar `showToast()` o un div de emergencia si el toast no está disponible
- Loguear al `errorHandler` del punto 1.1

**Archivos:** `src/assets/js/app.js` (handler DOMContentLoaded, ~líneas 4814-4884)

### 1.3 Catch en `ensureAudio()` fire-and-forget

La llamada `window._synthApp.ensureAudio()` en DOMContentLoaded es fire-and-forget (sin `await`, sin `.catch()`). Añadir `.catch()` que:
- Logee el error
- Muestre toast "Error al inicializar audio"

**Archivos:** `src/assets/js/app.js` (~línea 4835-4836)

### 1.4 Handler `processorerror` en AudioWorkletNodes

Crear función helper en `engine.js` que añada handler `processorerror` a cualquier `AudioWorkletNode`. Aplicar a todas las 13 instancias:

| Archivo | Nodos | Procesadores |
|---------|-------|-------------|
| `engine.js` | 5 | vca-processor, output-filter, dc-blocker, synth-oscillator (×2) |
| `app.js` | 5 | multichannel-capture, multichannel-playback, cv-thermal-slew (×2), cv-soft-clip |
| `oscilloscope.js` | 1 | scope-capture |
| `noise.js` | 1 | noise-generator |
| `recordingEngine.js` | 1 | recording-capture-processor |

Cada handler:
- Loguea `[processorerror] nombreDelProcesador: error.message`
- Notifica al `errorHandler` ring buffer
- Muestra toast al usuario con nombre del módulo afectado

**Archivos:** `src/assets/js/core/engine.js`, `src/assets/js/app.js`, `src/assets/js/modules/oscilloscope.js`, `src/assets/js/modules/noise.js`, `src/assets/js/core/recordingEngine.js`

### 1.5 `unhandledRejection` en Electron main process

Añadir `process.on('unhandledRejection')` junto al `uncaughtException` existente en `electron/main.cjs`.

**Archivos:** `electron/main.cjs` (~línea 466)

### Criterio de completado Fase 1
- [ ] `errorHandler.js` creado con tests unitarios
- [ ] Bootstrap protegido — splash no se congela ante errores
- [ ] `ensureAudio()` notifica fallos al usuario
- [ ] Los 13 AudioWorkletNodes tienen `processorerror` handler
- [ ] Electron captura rejections no manejadas
- [ ] Tests pasan (`npm run build:web:test`)

---

## Fase 2 — Protección interna de módulos críticos

> **Objetivo:** Proteger los puntos donde errores silenciosos causan degradación de funcionalidad.

### 2.1 Try/catch en `process()` de worklets críticos

Envolver el cuerpo de `process()` en try/catch en:
- `synthOscillator.worklet.js` — si falla, silencio en oscilador
- `vcaProcessor.worklet.js` — si falla, silencio en canal de salida
- `noiseGenerator.worklet.js` — si falla, silencio en ruido

El catch:
- Llena el output con ceros (silencio limpio en vez de basura)
- Envía `port.postMessage({ type: 'error', message })` al hilo principal (1 sola vez, con flag)
- Detecta NaN/Infinity en outputs (opcional, solo en debug)

**Archivos:** `src/assets/js/worklets/synthOscillator.worklet.js`, `vcaProcessor.worklet.js`, `noiseGenerator.worklet.js`

### 2.2 Proteger callback de session restore

En `sessionManager.js`, envolver el `setTimeout` + `_restoreCallback` en try/catch para que un estado corrupto no rompa el inicio:

```
setTimeout(async () => {
  try {
    await this._restoreCallback(...)
  } catch (err) {
    log.error('Error restaurando estado:', err);
    // Limpiar estado corrupto y notificar
  }
}, 500);
```

**Archivos:** `src/assets/js/state/sessionManager.js`

### 2.3 Proteger `triggerRestoreLastState`

En `app.js`, envolver `triggerRestoreLastState()` en try/catch — actualmente puede fallar si `ensureAudio()` falla dentro de esta función.

**Archivos:** `src/assets/js/app.js` (~línea 1237)

### 2.4 Unificar sistema de toasts

Reemplazar las 3 implementaciones duplicadas por una sola en `toast.js` con niveles:

| Nivel | Color | Icono | Uso |
|-------|-------|-------|-----|
| `info` | Actual (neutro) | — | Feedback general |
| `warning` | Amarillo | ⚠ | Degradación, fallback |
| `error` | Rojo | ✕ | Fallo de operación |
| `success` | Verde | ✓ | Operación completada |

- Eliminar `_showToast()` de `patchBrowser.js` y `settingsModal.js`
- Actualizar los ~28 call sites para usar `showToast(msg, { level, duration })`
- CSS con clases por nivel

**Archivos:** `src/assets/js/ui/toast.js`, `src/assets/js/ui/patchBrowser.js`, `src/assets/js/ui/settingsModal.js`, `src/assets/css/` (estilos de toast)

### Criterio de completado Fase 2
- [ ] Worklets críticos no mueren silenciosamente
- [ ] Session restore no puede romper el inicio
- [ ] Sistema de toast unificado con niveles
- [ ] Tests pasan

---

## Fase 3 — Infraestructura de telemetría

> **Objetivo:** Crear el módulo de telemetría y el backend (Apps Script).

### 3.1 Crear `src/assets/js/utils/telemetry.js`

Módulo singleton con:

- **ID anónimo**: `crypto.randomUUID()`, persistido en `STORAGE_KEYS.TELEMETRY_ID`
- **Consentimiento**: lee/escribe `STORAGE_KEYS.TELEMETRY_ENABLED` (boolean)
- **Cola de eventos en memoria** con flush periódico (cada 30s si hay eventos)
- **Cola offline**: si `!navigator.onLine`, guarda en `STORAGE_KEYS.TELEMETRY_QUEUE` (localStorage). Flush en evento `online`.
- **`sendBeacon`** en `visibilitychange` (estado `hidden`) y `beforeunload` como último recurso
- **Rate limiting**: máx 6 eventos por sesión, dedup de errores por hash
- **Envío**: `POST` a `__TELEMETRY_URL__` (inyectado en build) con payload JSON
- **API pública**:
  - `telemetry.init()` — inicializa, conecta con `errorHandler.onError()`
  - `telemetry.trackEvent(type, data)` — registra evento
  - `telemetry.trackError(error, context)` — registra error (delegado desde errorHandler)
  - `telemetry.isEnabled()` / `telemetry.setEnabled(bool)`
  - `telemetry.flush()` — forzar envío de cola

**Payload de cada evento:**
```json
{
  "id": "uuid-anónimo",
  "v": "0.6.0-20260212.143052",
  "env": "web|electron",
  "os": "Linux|Windows|macOS|Android|iOS",
  "browser": "Chrome 120|Firefox 115|Electron",
  "type": "session_start|error|worklet_fail|export_fail",
  "data": { ... },
  "ts": 1739349600000
}
```

### 3.2 Añadir claves de storage

En `constants.js`, añadir a `STORAGE_KEYS`:
- `TELEMETRY_ENABLED`: `synthigme-telemetry-enabled`
- `TELEMETRY_ID`: `synthigme-telemetry-id`
- `TELEMETRY_QUEUE`: `synthigme-telemetry-queue`

### 3.3 Añadir `__TELEMETRY_URL__` al build

En `scripts/build.mjs` y `scripts/electron-build.mjs`, añadir al bloque `define`:
```js
__TELEMETRY_URL__: JSON.stringify(process.env.TELEMETRY_URL || '')
```

Vacío por defecto — la telemetría se desactiva si no hay URL configurada.

### 3.4 Crear Google Apps Script

Ubicación: `scripts/telemetry/appscript.js` + `scripts/telemetry/README.md`

Funcionalidad:
1. Recibe `POST` con JSON de eventos
2. Valida clave simple (`key` en payload, inyectada en build)
3. Inserta fila en Google Sheets (una hoja por mes para organización)
4. Si `type` es `error` o `critical`: reenvía a Telegram via Bot API
5. Devuelve `{ ok: true }` o `{ error: "mensaje" }`

El README documenta:
- Cómo crear el bot de Telegram
- Cómo crear la hoja de Sheets
- Cómo desplegar el Apps Script como web app
- Cómo obtener la URL y configurar `TELEMETRY_URL`

### 3.5 Conectar errorHandler → telemetry

En `app.js`, al inicializar:
```js
import { initErrorHandler } from './utils/errorHandler.js';
import { telemetry } from './utils/telemetry.js';

// Antes de todo (fuera del DOMContentLoaded)
initErrorHandler();

// Después de verificar consentimiento
telemetry.init();
```

### Criterio de completado Fase 3
- [ ] `telemetry.js` creado con tests
- [ ] Apps Script creado y documentado
- [ ] Build inyecta URL de telemetría
- [ ] errorHandler alimenta telemetría automáticamente
- [ ] Cola offline funciona (test con `navigator.onLine = false`)
- [ ] `sendBeacon` funciona al cerrar pestaña

---

## Fase 4 — Consentimiento y UI

> **Objetivo:** Pedir permiso al usuario e integrar la telemetría en la app.

### 4.1 Textos i18n

Añadir a `translations.yaml` (7 idiomas):
- `telemetry.consent.title` — "Reportes anónimos"
- `telemetry.consent.message` — Texto explicativo
- `telemetry.consent.accept` — "Activar"
- `telemetry.consent.decline` — "No, gracias"
- `telemetry.consent.remember` — "Recordar mi elección"
- `telemetry.settings.label` — "Enviar reportes anónimos"
- `telemetry.settings.description` — Texto descriptivo para ajustes

### 4.2 Diálogo de consentimiento en primer inicio

Usar `ConfirmDialog.show()` en `app.js` después de ocultar el splash:
- `rememberKey: 'telemetry-consent'`
- Si acepta: `telemetry.setEnabled(true)` + `telemetry.trackEvent('first_run')`
- Si rechaza: `telemetry.setEnabled(false)`
- No bloquea el uso de la app

### 4.3 Toggle en Ajustes

Añadir en la pestaña "Avanzado" de `settingsModal.js`:
- Checkbox "Enviar reportes anónimos" con texto descriptivo
- Lee/escribe `STORAGE_KEYS.TELEMETRY_ENABLED`
- Al cambiar: `telemetry.setEnabled(value)`

### 4.4 Instrumentar eventos clave

| Evento | Dónde | Cuándo |
|--------|-------|--------|
| `session_start` | `app.js` DOMContentLoaded | 1× al inicio |
| `error` | `errorHandler.js` → `telemetry.js` | automático |
| `worklet_fail` | `engine.js` `_loadWorklet` catch | si worklets no cargan |
| `worklet_crash` | `processorerror` handlers | si worklet muere en runtime |
| `audio_fail` | `ensureAudio()` catch | si AudioContext falla |
| `export_fail` | `recordingEngine.js` | si exportación falla |
| `first_run` | consent dialog | 1× si acepta telemetría |

**No instrumentar**: knobs, faders, matrices, parámetros musicales, contenido.

### Criterio de completado Fase 4
- [ ] Diálogo de consentimiento funciona en primer inicio
- [ ] Toggle en ajustes funciona
- [ ] Eventos se envían correctamente a Apps Script
- [ ] Sheets recibe datos estructurados
- [ ] Telegram recibe alertas de errores
- [ ] Sin telemetría si no hay consentimiento
- [ ] Sin telemetría si no hay URL configurada
- [ ] Tests pasan (`npm run build:web:test`)

---

## Archivos afectados (resumen)

### Nuevos
- `src/assets/js/utils/errorHandler.js`
- `src/assets/js/utils/telemetry.js`
- `scripts/telemetry/appscript.js`
- `scripts/telemetry/README.md`
- Tests correspondientes en `tests/`

### Modificados
- `src/assets/js/app.js` — bootstrap, consent, eventos
- `src/assets/js/core/engine.js` — processorerror
- `src/assets/js/modules/oscilloscope.js` — processorerror
- `src/assets/js/modules/noise.js` — processorerror
- `src/assets/js/core/recordingEngine.js` — processorerror
- `src/assets/js/state/sessionManager.js` — protección restore
- `src/assets/js/ui/toast.js` — niveles de severidad
- `src/assets/js/ui/patchBrowser.js` — migrar a toast unificado
- `src/assets/js/ui/settingsModal.js` — migrar toast + toggle telemetría
- `src/assets/js/utils/constants.js` — claves de storage
- `src/assets/js/i18n/locales/translations.yaml` — textos telemetría
- `src/assets/js/worklets/synthOscillator.worklet.js` — try/catch process()
- `src/assets/js/worklets/vcaProcessor.worklet.js` — try/catch process()
- `src/assets/js/worklets/noiseGenerator.worklet.js` — try/catch process()
- `scripts/build.mjs` — define TELEMETRY_URL
- `scripts/electron-build.mjs` — define TELEMETRY_URL
- `electron/main.cjs` — unhandledRejection

---

## Dependencias entre fases

```
Fase 1 (errores globales)
   ↓
Fase 2 (protección interna + toast unificado)
   ↓
Fase 3 (infraestructura telemetría)
   ↓
Fase 4 (consentimiento + UI + instrumentación)
```

Cada fase es funcional por sí misma y aporta valor independiente.
