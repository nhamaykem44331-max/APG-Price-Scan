const axios = require('axios');
const logger = require('../logger');

const DEFAULT_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.TELEGRAM_TIMEOUT_MS || '10000', 10);
const EMPTY_STREAK_ALERT_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.SCAN_EMPTY_STREAK_THRESHOLD || '3', 10) || 3
);
const MESSAGE_SAFE_MAX_LEN = 3700;

function telegramConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    apiBase: process.env.TELEGRAM_API_BASE || DEFAULT_API_BASE,
  };
}

function isTelegramConfigured() {
  const cfg = telegramConfig();
  return !!(cfg.token && cfg.chatId);
}

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '0';
}

function compactLine(value, fallback = '-') {
  const text = String(value || '').trim();
  return text || fallback;
}

function statusEmoji(run) {
  if (!run) return '✅';
  if (run.autoDisabledByCircuitBreaker) return '🛑';
  if (run.status === 'error') return '⚠️';
  if (run.comparison && run.comparison.hasPrevious === false) return '🆕';
  const isEmpty = Array.isArray(run.results) && run.results.length === 0;
  if (isEmpty && Number(run.emptyStreak || 0) >= EMPTY_STREAK_ALERT_THRESHOLD) return '🔇';
  return '✅';
}

function flightLine(item) {
  const seatRaw = item.seatAvailable;
  const seatNum = Number(seatRaw);
  const hasSeat = seatRaw !== undefined && seatRaw !== null && seatRaw !== '' && Number.isFinite(seatNum);
  const cabin = [item.cabinClass, item.class].filter(Boolean).join(' ');

  let prefix = '';
  let seatText = hasSeat ? `${seatNum} ghế` : '-';
  if (hasSeat && seatNum === 0) {
    prefix = '🔴 ';
    seatText = 'SOLD';
  } else if (hasSeat && seatNum > 0 && seatNum < 5) {
    prefix = '🟡 ';
  }

  return `${prefix}${item.flightNumber || '?'} ${item.departTime || '--:--'}-${item.arrivalTime || '--:--'} | ${compactLine(cabin, '-')} | ${money(item.totalAmount)} ${item.currency || 'VND'} | ${seatText}`;
}

function averagePercent(items) {
  const valid = items.filter((it) => it && it.percent !== null && it.percent !== undefined && Number.isFinite(Number(it.percent)));
  if (!valid.length) return null;
  const sum = valid.reduce((acc, it) => acc + Number(it.percent), 0);
  return (sum / valid.length).toFixed(1);
}

function buildChangeSummary(comparison) {
  if (!comparison || !comparison.hasPrevious) return '';
  const changes = Array.isArray(comparison.changes) ? comparison.changes : [];
  if (!changes.length) return '';

  const priceUp = changes.filter((c) => c.type === 'price' && Number(c.delta) > 0);
  const priceDown = changes.filter((c) => c.type === 'price' && Number(c.delta) < 0);
  const seatChanges = changes.filter((c) => c.type === 'seat');
  const newOnes = changes.filter((c) => c.type === 'new');
  const removed = changes.filter((c) => c.type === 'removed');

  const parts = [];
  if (priceDown.length) {
    const avg = averagePercent(priceDown);
    parts.push(`${priceDown.length}↓${avg !== null ? ` avg ${avg}%` : ''}`);
  }
  if (priceUp.length) {
    const avg = averagePercent(priceUp);
    parts.push(`${priceUp.length}↑${avg !== null ? ` avg +${avg}%` : ''}`);
  }
  if (seatChanges.length) {
    const soldCount = seatChanges.filter((c) => c.soldOut).length;
    parts.push(`${seatChanges.length} chỗ đổi${soldCount ? ` (${soldCount} SOLD)` : ''}`);
  }
  if (newOnes.length) parts.push(`${newOnes.length} chuyến mới`);
  if (removed.length) parts.push(`${removed.length} chuyến mất`);

  return parts.length ? `📊 Change: ${parts.join(' | ')}` : '';
}

function groupByAirline(results) {
  const grouped = new Map();
  for (const item of results) {
    const code = String(item.airlineCode || 'OTHER').toUpperCase();
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(item);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0));
  }
  return grouped;
}

function packIntoMessages(header, groupBlocks, maxLen = MESSAGE_SAFE_MAX_LEN) {
  const SEP = '\n\n';
  let current = header;
  const chunks = [];

  for (const block of groupBlocks) {
    const candidate = current ? current + SEP + block.text : block.text;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (block.text.length > maxLen) {
      chunks.push(block.text.slice(0, maxLen - 20) + '\n…(truncated)');
      current = '';
    } else {
      current = block.text;
    }
  }
  if (current) chunks.push(current);

  if (chunks.length <= 1) return chunks;
  return chunks.map((text, idx) => `${text}\n\n(${idx + 1}/${chunks.length})`);
}

function buildScanReport(job, run) {
  const query = job.query || {};
  const route = `${compactLine(query.from)}-${compactLine(query.to)}`;
  const target = [query.flightNumber, query.airline].filter(Boolean).join(' / ') || 'all flights';
  const emoji = statusEmoji(run);

  const headerLines = [
    `${emoji} [Price Scan] ${compactLine(job.name, job.id)}`,
    `Route: ${route}`,
    `Date: ${compactLine(query.date)} | Target: ${target}`,
  ];

  if (query.departureTimeStart || query.departureTimeEnd || query.time) {
    headerLines.push(`Time: ${compactLine(query.time || `${query.departureTimeStart || '--:--'}-${query.departureTimeEnd || '--:--'}`)}`);
  }
  headerLines.push(`Run: ${compactLine(run.finishedAt || run.startedAt)}`);

  if (run.status === 'error') {
    headerLines.push('');
    headerLines.push('Status: ERROR');
    headerLines.push(compactLine(run.error, 'Unknown error'));
    return [headerLines.join('\n').slice(0, MESSAGE_SAFE_MAX_LEN)];
  }

  if (run.autoDisabledByCircuitBreaker) {
    headerLines.push('');
    headerLines.push(`🛑 Job auto-disabled: ${compactLine(run.autoDisableReason, 'too many failures')}`);
  }

  const results = Array.isArray(run.results) ? run.results : [];
  headerLines.push(`Status: found ${results.length} flight(s)`);

  if (results.length === 0 && Number(run.emptyStreak || 0) >= EMPTY_STREAK_ALERT_THRESHOLD) {
    headerLines.push(`🔇 Empty results ${run.emptyStreak} lần liên tiếp — kiểm tra route hoặc API.`);
  }

  const changeSummary = buildChangeSummary(run.comparison);
  if (changeSummary) headerLines.push(changeSummary);

  if (results.length === 0) {
    headerLines.push('');
    headerLines.push('Không có chuyến nào khớp filter trong lần quét này.');
    return [headerLines.join('\n').slice(0, MESSAGE_SAFE_MAX_LEN)];
  }

  const grouped = groupByAirline(results);
  const groupBlocks = [];
  for (const [airline, items] of grouped.entries()) {
    const lines = [`── ${airline} ──`];
    for (const item of items) lines.push(flightLine(item));
    groupBlocks.push({ airline, text: lines.join('\n') });
  }

  const header = headerLines.join('\n');
  return packIntoMessages(header, groupBlocks);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramMessage(text, options = {}) {
  const cfg = telegramConfig();
  const token = options.token || cfg.token;
  const chatId = options.chatId || cfg.chatId;
  const apiBase = (options.apiBase || cfg.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');

  if (!token || !chatId) {
    const error = new Error('Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
    error.statusCode = 400;
    throw error;
  }

  const url = `${apiBase}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    disable_notification: String(process.env.TELEGRAM_DISABLE_NOTIFICATION || '').toLowerCase() === 'true',
  };
  const timeout = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 10000;
  const maxRetry = Math.max(1, Number.parseInt(process.env.TELEGRAM_MAX_RETRY || '3', 10) || 3);

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetry; attempt += 1) {
    let response;
    try {
      response = await axios.post(url, body, { timeout, validateStatus: () => true });
    } catch (error) {
      lastError = error;
      if (attempt < maxRetry) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        logger.warn(`[telegram] network error: ${error.message}, retry in ${waitMs}ms (attempt ${attempt}/${maxRetry})`);
        await sleep(waitMs);
        continue;
      }
      const finalError = new Error(`Telegram sendMessage failed after ${maxRetry} attempts: ${error.message}`);
      finalError.statusCode = 502;
      throw finalError;
    }

    const data = response.data || {};
    if (response.status >= 200 && response.status < 300 && data.ok === true) {
      return {
        ok: true,
        messageId: data.result && data.result.message_id,
        chatId,
        attempts: attempt,
      };
    }

    if (response.status === 429 && attempt < maxRetry) {
      const retryAfter = (data.parameters && Number(data.parameters.retry_after)) || 1;
      const waitMs = Math.min((retryAfter + 1) * 1000, 30000);
      logger.warn(`[telegram] 429 rate limit, retry in ${waitMs}ms (attempt ${attempt}/${maxRetry})`);
      await sleep(waitMs);
      continue;
    }

    if (response.status >= 500 && response.status < 600 && attempt < maxRetry) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      logger.warn(`[telegram] ${response.status} server error, retry in ${waitMs}ms (attempt ${attempt}/${maxRetry})`);
      await sleep(waitMs);
      continue;
    }

    const error = new Error((data && data.description) || `Telegram sendMessage failed (status ${response.status})`);
    error.statusCode = [400, 401, 403, 404].includes(response.status) ? response.status : 502;
    throw error;
  }

  const finalError = new Error(`Telegram sendMessage failed after ${maxRetry} attempts.`);
  finalError.statusCode = 502;
  throw finalError;
}

async function sendScanReport(job, run) {
  const messages = buildScanReport(job, run);
  const list = Array.isArray(messages) ? messages : [messages];
  let lastResult = null;
  let totalAttempts = 0;
  for (const text of list) {
    if (!text) continue;
    lastResult = await sendTelegramMessage(text);
    totalAttempts += Number(lastResult && lastResult.attempts) || 1;
  }
  if (lastResult) lastResult.attempts = totalAttempts || 1;
  return lastResult || { ok: false, attempts: 0 };
}

module.exports = {
  buildScanReport,
  buildChangeSummary,
  flightLine,
  groupByAirline,
  isTelegramConfigured,
  sendScanReport,
  sendTelegramMessage,
  telegramConfig,
};
