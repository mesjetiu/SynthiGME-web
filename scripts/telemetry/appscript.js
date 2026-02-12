/**
 * Google Apps Script — Receptor de telemetría para SynthiGME
 *
 * Recibe POST con eventos de telemetría anónimos y:
 * 1. Inserta filas en Google Sheets (una hoja por mes)
 * 2. Envía alertas a Telegram para errores
 *
 * DESPLIEGUE:
 * 1. Crear proyecto en https://script.google.com
 * 2. Pegar este código en Code.gs
 * 3. Crear propiedades del script:
 *    - SHEET_ID: ID de la hoja de Google Sheets
 *    - TELEGRAM_BOT_TOKEN: Token del bot de Telegram
 *    - TELEGRAM_CHAT_ID: ID del chat/grupo de Telegram
 * 4. Deploy > Web App > Execute as "Me", Access "Anyone"
 * 5. Copiar la URL del deployment
 *
 * @see scripts/telemetry/README.md para instrucciones detalladas
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuración (desde propiedades del script)
// ─────────────────────────────────────────────────────────────────────────────

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    sheetId: props.getProperty('SHEET_ID'),
    telegramToken: props.getProperty('TELEGRAM_BOT_TOKEN'),
    telegramChatId: props.getProperty('TELEGRAM_CHAT_ID')
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler para POST requests.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const events = payload.events;

    if (!Array.isArray(events) || events.length === 0) {
      return jsonResponse({ error: 'No events' }, 400);
    }

    // Limitar a 50 eventos por request
    const batch = events.slice(0, 50);

    const config = getConfig();
    const errors = [];

    for (const event of batch) {
      try {
        insertRow(config, event);

        // Alertar a Telegram en errores
        if (isAlertable(event)) {
          sendTelegramAlert(config, event);
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length > 0) {
      return jsonResponse({ ok: true, warnings: errors.length });
    }

    return jsonResponse({ ok: true, count: batch.length });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/**
 * Handler para GET (health check).
 */
function doGet() {
  return jsonResponse({ status: 'ok', service: 'SynthiGME Telemetry' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserta una fila de evento en la hoja del mes actual.
 * @param {Object} config
 * @param {Object} event
 */
function insertRow(config, event) {
  if (!config.sheetId) return;

  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheetName = getMonthSheetName(event.ts);

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Cabeceras
    sheet.appendRow([
      'Fecha', 'Hora', 'ID', 'Version', 'Entorno', 'SO', 'Navegador',
      'Evento', 'Datos'
    ]);
    sheet.setFrozenRows(1);
  }

  const date = new Date(event.ts || Date.now());
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(date, tz, 'HH:mm:ss');
  const dataStr = event.data ? JSON.stringify(event.data) : '';

  sheet.appendRow([
    dateStr,
    timeStr,
    event.id || '',
    event.v || '',
    event.env || '',
    event.os || '',
    event.browser || '',
    event.type || '',
    dataStr
  ]);
}

/**
 * Genera el nombre de hoja para un timestamp (formato: "2026-02").
 * @param {number} ts
 * @returns {string}
 */
function getMonthSheetName(ts) {
  const d = new Date(ts || Date.now());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si un evento merece alerta en Telegram.
 * @param {Object} event
 * @returns {boolean}
 */
function isAlertable(event) {
  return ['error', 'worklet_fail', 'worklet_crash', 'audio_fail'].includes(event.type);
}

/**
 * Envía una alerta a Telegram.
 * @param {Object} config
 * @param {Object} event
 */
function sendTelegramAlert(config, event) {
  if (!config.telegramToken || !config.telegramChatId) return;

  const emoji = event.type === 'error' ? '🔴' : '⚠️';
  const dataMsg = event.data?.message || JSON.stringify(event.data || {});

  const text = [
    `${emoji} *SynthiGME ${event.type}*`,
    `Version: \`${event.v || '?'}\``,
    `Env: ${event.env || '?'} / ${event.os || '?'} / ${event.browser || '?'}`,
    `Message: ${escapeMarkdown(dataMsg)}`,
    `Time: ${new Date(event.ts).toISOString()}`
  ].join('\n');

  const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: config.telegramChatId,
      text: text,
      parse_mode: 'Markdown',
      disable_notification: false
    }),
    muteHttpExceptions: true
  });
}

/**
 * Escapa caracteres especiales de Markdown para Telegram.
 * @param {string} str
 * @returns {string}
 */
function escapeMarkdown(str) {
  return String(str || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye una respuesta JSON.
 * @param {Object} data
 * @param {number} [status=200]
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(data, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
