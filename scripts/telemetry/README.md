# Telemetría SynthiGME — Guía de despliegue

## Visión general

La telemetría de SynthiGME es 100% opt-in (el usuario debe dar consentimiento explícito).
Los datos son anónimos: un UUID aleatorio identifica la instalación, sin nombre, email, IP ni contenido musical.

La arquitectura es:
```
SynthiGME (web/Electron)  →  Google Apps Script  →  Google Sheets
                                                  →  Telegram Bot
```

## 1. Crear la hoja de Google Sheets

1. Ir a [Google Sheets](https://sheets.google.com) y crear una hoja nueva
2. Nombrarla "SynthiGME Telemetry"
3. Copiar el ID de la URL: `https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit`
4. El script creará hojas mensuales automáticamente (2026-01, 2026-02, etc.)

## 2. Crear el bot de Telegram

1. Hablar con [@BotFather](https://t.me/BotFather) en Telegram
2. Enviar `/newbot` y seguir las instrucciones
3. Guardar el **token** que te da (formato: `123456:ABC-DEF...`)
4. Crear un grupo o canal para las alertas
5. Añadir el bot al grupo
6. Obtener el **chat_id** del grupo:
   - Enviar un mensaje al grupo
   - Visitar `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Buscar `"chat":{"id":-XXXXXXXXX}` — ese número negativo es el chat_id

## 3. Desplegar el Apps Script

1. Ir a [Google Apps Script](https://script.google.com)
2. Crear un nuevo proyecto
3. Pegar el contenido de `appscript.js` en `Code.gs`
4. Ir a **Project Settings** (⚙️) > **Script Properties** y añadir:
   | Propiedad | Valor |
   |-----------|-------|
   | `SHEET_ID` | ID de tu Google Sheet |
   | `TELEGRAM_BOT_TOKEN` | Token del bot |
   | `TELEGRAM_CHAT_ID` | ID del grupo/chat |
5. Ir a **Deploy** > **New deployment**
6. Tipo: **Web App**
7. Execute as: **Me** (tu cuenta de Google)
8. Who has access: **Anyone** (para que la app pueda enviar sin autenticación)
9. Copiar la URL del deployment (formato: `https://script.google.com/macros/s/.../exec`)

## 4. Configurar la variable de entorno

En el build de SynthiGME, establecer la variable de entorno `TELEMETRY_URL`:

```bash
# Build web con telemetría
TELEMETRY_URL="https://script.google.com/macros/s/XXXXX/exec" npm run build:web

# Build Electron con telemetría
TELEMETRY_URL="https://script.google.com/macros/s/XXXXX/exec" npm run build:electron
```

Sin `TELEMETRY_URL`, la telemetría se desactiva silenciosamente (no se envía nada).

## 5. Verificar

1. Hacer build con `TELEMETRY_URL` configurada
2. Abrir la app y aceptar el consentimiento de telemetría
3. Verificar en Google Sheets que aparece un evento `session_start`
4. Provocar un error y verificar que aparece en Sheets y Telegram

## Eventos enviados

| Tipo | Cuándo | Datos |
|------|--------|-------|
| `session_start` | Al iniciar la app | — |
| `error` | Error JS no capturado | message, type, source |
| `worklet_fail` | Worklet no carga | processor name |
| `worklet_crash` | processorerror en worklet | processor name, message |
| `audio_fail` | AudioContext falla | error message |
| `export_fail` | Fallo de exportación | error message |
| `first_run` | Primera vez que acepta telemetría | — |

## Datos NO enviados

- ❌ Nombre, email, IP del usuario
- ❌ Contenido musical (patches, configuraciones de knobs)
- ❌ Paths del sistema de archivos (stacks truncados a 2 líneas)
- ❌ Tiempos de uso, frecuencia de uso detallada
- ❌ Información del hardware (solo familia de SO y navegador)

## Límites de rate

- Máximo 20 eventos por sesión
- Máximo 6 errores auto-reportados por sesión
- Flush cada 30 segundos (o al cerrar pestaña)
- Cola offline de máximo 50 eventos
