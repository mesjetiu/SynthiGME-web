# Sistema de Manejo de Errores y Telemetría

Estado: **Completado** ✅
Implementación: 12 de febrero de 2026

---

## Visión general

Sistema completo de manejo de errores y telemetría anónima mínima implementado en 4 fases. Cada fase construye sobre la anterior.

**Principios:**
- Opt-in explícito (consentimiento del usuario)
- Sin datos personales, sin IP, sin contenido del usuario
- Un único endpoint (Google Apps Script) que distribuye a Sheets y Telegram
- Token de Telegram oculto en el servidor (no expuesto en cliente)
- Compatible con modo offline (cola local con flush al reconectar)

---

## Resumen de la implementación

### Fase 1 — Redes de seguridad globales ✅

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| Error handler global | `errorHandler.js` | `window.onerror` + `unhandledrejection` + ring buffer (50 errores) con deduplicación por hash y cooldown 1s |
| Bootstrap protegido | `app.js` | Try/catch en `DOMContentLoaded` — splash no se congela ante errores |
| Audio fail handler | `app.js` | Catch en `ensureAudio()` con toast al usuario |
| processorerror | `engine.js`, `app.js`, `oscilloscope.js`, `noise.js`, `recordingEngine.js` | Handler en los 13 AudioWorkletNodes |
| Electron rejections | `electron/main.cjs` | `process.on('unhandledRejection')` |

### Fase 2 — Protección interna de módulos ✅

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| Worklet try/catch | `synthOscillator.worklet.js`, `vcaProcessor.worklet.js`, `noiseGenerator.worklet.js` | `process()` protegido: silencio limpio + `port.postMessage` error (1 vez) |
| Session restore | `sessionManager.js` | Try/catch en restore callback — estado corrupto no rompe inicio |
| Toast unificado | `toast.js` | Niveles info/success/warning/error, CSS por nivel. Reemplaza 3 implementaciones duplicadas |

### Fase 3 — Infraestructura de telemetría ✅

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| Módulo telemetría | `telemetry.js` | Cola en memoria, flush 30s, offline queue en localStorage, sendBeacon al cerrar, rate limiting |
| Apps Script | `scripts/telemetry/appscript.js` | Receptor → Sheets (hoja mensual) + alertas Telegram |
| Guía de despliegue | `scripts/telemetry/README.md` | Instrucciones paso a paso para Sheets, Telegram y Apps Script |
| Build define | `scripts/build.mjs` | `__TELEMETRY_URL__` inyectado en esbuild (también aplica a Electron via `electron-build.mjs`) |
| Storage keys | `constants.js` | `TELEMETRY_ENABLED`, `TELEMETRY_ID`, `TELEMETRY_QUEUE` |
| Conexión errores | `telemetry.js` → `errorHandler.onError()` | Errores auto-reportados (máx 6/sesión) |

### Fase 4 — Consentimiento y UI ✅

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| Diálogo consentimiento | `app.js` → `ConfirmDialog.show()` | Primer inicio si `TELEMETRY_ENABLED` es null. Indica que puede cambiarse en Ajustes |
| Toggle en Ajustes | `settingsModal.js` | Pestaña Avanzado, checkbox que lee/escribe directamente en localStorage |
| Toggle en menú Electron | `electronMenu.cjs` + `electronMenuBridge.js` | Checkbox en submenú Avanzado con sincronización bidireccional |
| i18n | `translations.yaml` | 7 idiomas: en, es, fr, de, it, pt, cs |
| Eventos instrumentados | Varios archivos | session_start, first_run, error, worklet_fail, worklet_crash, audio_fail, export_fail |

---

## Cómo funciona

### Flujo de datos

```
  Usuario acepta consentimiento (primer inicio)
             ↓
  localStorage: TELEMETRY_ENABLED = 'true'
             ↓
  telemetry.init() → suscribe a errorHandler.onError()
                   → inicia flush periódico (30s)
                   → registra listener visibilitychange (sendBeacon)
                   → registra listener online (flush offline queue)
             ↓
  Eventos se acumulan en cola en memoria
             ↓
  Cada 30s (o al cerrar pestaña): POST batch al endpoint
             ↓
  Google Apps Script (doPost)
      ├── Inserta filas en Google Sheets (hoja mensual: "2026-02")
      └── Si es error/worklet_fail/crash → alerta a Telegram
```

### Payload de cada evento

```json
{
  "id": "uuid-anonimo-persistente",
  "v": "0.6.0-20260212.143052",
  "env": "web|electron",
  "os": "Linux|Windows|macOS|Android|iOS",
  "browser": "Chrome|Firefox|Edge|Safari|Electron",
  "type": "session_start|error|worklet_fail|...",
  "data": { "message": "...", "type": "...", "source": "..." },
  "ts": 1739349600000
}
```

### Rate limiting

| Límite | Valor |
|--------|-------|
| Eventos por sesión | 20 |
| Errores auto-reportados por sesión | 6 |
| Cola offline máxima | 50 eventos |
| Flush interval | 30 segundos |
| Deduplicación | Por hash de stack (cooldown 1s en errorHandler) |

### Datos NO enviados

- ❌ Nombre, email, IP del usuario
- ❌ Contenido musical (patches, configuraciones de knobs/faders)
- ❌ Paths del sistema de archivos (stacks truncados a 2 líneas)
- ❌ Tiempos de uso detallados ni frecuencia de uso
- ❌ Información de hardware (solo familia de SO y navegador)

---

## Puesta en marcha

Para que la telemetría funcione en producción se necesitan 3 cosas:

### 1. Backend (una sola vez)

Seguir la guía de [scripts/telemetry/README.md](scripts/telemetry/README.md):

1. **Google Sheets**: Crear hoja "SynthiGME Telemetry" → copiar el ID
2. **Bot de Telegram**: Crear con @BotFather → guardar token + chat_id del grupo de alertas
3. **Google Apps Script**: Nuevo proyecto → pegar `scripts/telemetry/appscript.js` → configurar propiedades del script (`SHEET_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) → Deploy como Web App ("Anyone") → copiar URL

### 2. Build con URL (cada vez que se genera un release)

```bash
# Web (GitHub Pages)
TELEMETRY_URL="https://script.google.com/macros/s/XXXXX/exec" npm run build:web

# Electron (Linux + Windows)
TELEMETRY_URL="https://script.google.com/macros/s/XXXXX/exec" npm run build:electron:all
```

Sin `TELEMETRY_URL`, la telemetría se desactiva silenciosamente — la app funciona igual pero no envía nada.

### 3. Verificación

1. Hacer build con `TELEMETRY_URL`
2. Abrir la app → aceptar consentimiento
3. Verificar en Google Sheets que aparece `session_start` y `first_run`
4. Provocar un error (ej: `throw new Error('test')` en consola) → verificar que llega a Sheets y Telegram
5. Cerrar pestaña → verificar que el sendBeacon envió los eventos pendientes

---

## Archivos del sistema

### Código fuente

| Archivo | Propósito |
|---------|-----------|
| `src/assets/js/utils/errorHandler.js` | Captura global de errores, ring buffer, deduplicación |
| `src/assets/js/utils/telemetry.js` | Cola de eventos, flush, offline queue, sendBeacon, rate limiting |
| `src/assets/js/utils/constants.js` | `STORAGE_KEYS.TELEMETRY_*` |
| `src/assets/js/ui/settingsModal.js` | Checkbox en Ajustes > Avanzado |
| `src/assets/js/ui/electronMenuBridge.js` | Sync bidireccional menú Electron ↔ renderer |
| `electron/electronMenu.cjs` | Checkbox en menú Avanzado nativo |
| `src/assets/js/app.js` | Diálogo de consentimiento + eventos instrumentados |
| `src/assets/js/ui/toast.js` | Toast unificado con niveles |

### Backend y despliegue

| Archivo | Propósito |
|---------|-----------|
| `scripts/telemetry/appscript.js` | Google Apps Script (pegar en Code.gs) |
| `scripts/telemetry/README.md` | Guía paso a paso de despliegue |
| `scripts/build.mjs` | Inyecta `__TELEMETRY_URL__` en esbuild |

### Tests (49 tests)

| Archivo | Tests |
|---------|-------|
| `tests/utils/telemetry.test.js` | Módulo telemetry.js: cola, flush, offline, rate limiting |
| `tests/utils/telemetryEvents.test.js` | Eventos instrumentados: payload, auto-error, buildPayload |
| `tests/ui/telemetryConsent.test.js` | Consentimiento: setEnabled/isEnabled, persistencia, toggle |

---

## Tests

1900 tests pasan (0 fallos), incluyendo los 49 nuevos de error handling + telemetría.

```bash
npm test                  # Tests unitarios (Node.js)
npm run build:web:test    # Build + tests completos
```
