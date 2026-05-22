const axios = require('axios');
const logger = require('../logger');
const { buildScanReport } = require('./telegram');

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS || '10000', 10);
const DEFAULT_MAX_RETRY = Number.parseInt(process.env.N8N_WEBHOOK_MAX_RETRY || '3', 10);

function zaloConfig() {
  const threadType = Number.parseInt(process.env.N8N_ZALO_THREAD_TYPE || process.env.ZALO_THREAD_TYPE || '1', 10);
  return {
    webhookUrl: process.env.N8N_ZALO_WEBHOOK_URL || process.env.ZALO_WEBHOOK_URL || '',
    targetId: process.env.N8N_ZALO_TARGET_ID || process.env.ZALO_TARGET_ID || '',
    threadType: Number.isFinite(threadType) ? threadType : 1,
  };
}

function isZaloConfigured() {
  const cfg = zaloConfig();
  return !!(cfg.webhookUrl && cfg.targetId);
}

function buildZaloWebhookPayload(job, run, text, messageIndex = 1, messageCount = 1) {
  const cfg = zaloConfig();
  const query = job.query || {};
  return {
    event: 'price_scan.report',
    channel: 'zalo',
    content: text,
    summaryText: text,
    messageIndex,
    messageCount,
    zaloTargetId: cfg.targetId,
    zaloThreadType: cfg.threadType,
    job: {
      id: job.id,
      name: job.name,
    },
    query: {
      from: query.from,
      to: query.to,
      date: query.date,
      airline: query.airline,
      flightNumber: query.flightNumber,
      time: query.time,
      departureTimeStart: query.departureTimeStart,
      departureTimeEnd: query.departureTimeEnd,
    },
    run: {
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      matchCount: run.matchCount || 0,
      emptyStreak: run.emptyStreak || 0,
      failureStreak: run.failureStreak || 0,
      autoDisabledByCircuitBreaker: !!run.autoDisabledByCircuitBreaker,
      autoDisableReason: run.autoDisableReason || '',
      comparison: run.comparison || null,
      error: run.error || '',
    },
    results: Array.isArray(run.results) ? run.results : [],
  };
}

function retryDelayMs(attempt, status, data) {
  if (status === 429 && data && data.parameters && Number(data.parameters.retry_after)) {
    return Math.min((Number(data.parameters.retry_after) + 1) * 1000, 30000);
  }
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

async function postWebhook(payload) {
  const cfg = zaloConfig();
  if (!cfg.webhookUrl || !cfg.targetId) {
    const error = new Error('Zalo/n8n is not configured. Set N8N_ZALO_WEBHOOK_URL and N8N_ZALO_TARGET_ID.');
    error.statusCode = 400;
    throw error;
  }

  const timeout = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 10000;
  const maxRetry = Math.max(1, Number.isFinite(DEFAULT_MAX_RETRY) && DEFAULT_MAX_RETRY > 0 ? DEFAULT_MAX_RETRY : 3);

  for (let attempt = 1; attempt <= maxRetry; attempt += 1) {
    let response;
    try {
      response = await axios.post(cfg.webhookUrl, payload, { timeout, validateStatus: () => true });
    } catch (error) {
      if (attempt >= maxRetry) {
        const finalError = new Error(`n8n Zalo webhook failed after ${maxRetry} attempts: ${error.message}`);
        finalError.statusCode = 502;
        throw finalError;
      }
      const waitMs = retryDelayMs(attempt);
      logger.warn(`[zalo] webhook network error: ${error.message}, retry in ${waitMs}ms (attempt ${attempt}/${maxRetry})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      return {
        ok: true,
        status: response.status,
        data: response.data,
        attempts: attempt,
      };
    }

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetry) {
      const waitMs = retryDelayMs(attempt, response.status, response.data);
      logger.warn(`[zalo] webhook status ${response.status}, retry in ${waitMs}ms (attempt ${attempt}/${maxRetry})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const error = new Error(`n8n Zalo webhook failed with status ${response.status}`);
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.data = response.data;
    throw error;
  }

  const error = new Error(`n8n Zalo webhook failed after ${maxRetry} attempts.`);
  error.statusCode = 502;
  throw error;
}

async function sendZaloReport(job, run) {
  const messages = buildScanReport(job, run);
  const list = Array.isArray(messages) ? messages : [messages];
  let lastResult = null;
  const messageIds = [];
  let totalAttempts = 0;

  for (const [index, text] of list.entries()) {
    if (!text) continue;
    const payload = buildZaloWebhookPayload(job, run, text, index + 1, list.length);
    lastResult = await postWebhook(payload);
    messageIds.push(lastResult.status);
    totalAttempts += Number(lastResult && lastResult.attempts) || 1;
  }

  return {
    ok: true,
    messageCount: list.length,
    messageIds,
    lastResult,
    attempts: totalAttempts || 1,
  };
}

async function sendZaloMessage(text) {
  const message = String(text || 'Price Scan Zalo test').slice(0, 1000);
  const payload = {
    event: 'price_scan.test',
    channel: 'zalo',
    content: message,
    summaryText: message,
    messageIndex: 1,
    messageCount: 1,
    zaloTargetId: zaloConfig().targetId,
    zaloThreadType: zaloConfig().threadType,
  };
  const result = await postWebhook(payload);
  return {
    ok: true,
    messageCount: 1,
    messageIds: [result.status],
    lastResult: result,
  };
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}

// Cảnh báo giá vé hiện tại rẻ hơn giá đang giữ chỗ.
async function sendReservationAlert(reservation, scan) {
  const cfg = zaloConfig();
  const held = Number(reservation.heldPrice) || 0;
  const now = Number(scan.currentTotal) || 0;
  const delta = held - now;
  const pct = held > 0 ? ((delta / held) * 100).toFixed(1) : '0';
  const seats = (scan.seatAvailable === undefined || scan.seatAvailable === null) ? '-' : scan.seatAvailable;
  const route = `${reservation.from}-${reservation.to}`;
  const pax = `${reservation.adt || 1}NL${reservation.chd ? `+${reservation.chd}TE` : ''}${reservation.inf ? `+${reservation.inf}EB` : ''}`;

  const lines = [
    `🔻 GIÁ GIẢM dưới giá giữ chỗ`,
    `PNR: ${reservation.pnr} · ${reservation.flightNumber} ${route} · ${reservation.date}`,
    `Giá giữ: ${money(held)} ₫`,
    `Giá hiện tại: ${money(now)} ₫ (${money(scan.perAdult)} ₫/khách × ${pax})`,
    `Tiết kiệm: ${money(delta)} ₫ (-${pct}%)`,
    `Số chỗ còn: ${seats}`,
  ];
  const content = lines.join('\n');

  const payload = {
    event: 'price_scan.reservation_drop',
    channel: 'zalo',
    content,
    summaryText: content,
    messageIndex: 1,
    messageCount: 1,
    zaloTargetId: cfg.targetId,
    zaloThreadType: cfg.threadType,
    reservation: {
      pnr: reservation.pnr,
      from: reservation.from,
      to: reservation.to,
      date: reservation.date,
      flightNumber: reservation.flightNumber,
      heldPrice: held,
      adt: reservation.adt,
      chd: reservation.chd,
      inf: reservation.inf,
      status: reservation.status,
      timelimit: reservation.timelimit,
    },
    scan: {
      currentTotal: now,
      perAdult: scan.perAdult,
      seatAvailable: scan.seatAvailable,
      delta,
      deltaPct: Number(pct),
      currency: scan.currency || 'VND',
    },
  };

  const result = await postWebhook(payload);
  return {
    ok: true,
    messageCount: 1,
    messageIds: [result.status],
    attempts: result.attempts || 1,
    lastResult: result,
  };
}

module.exports = {
  buildZaloWebhookPayload,
  isZaloConfigured,
  postWebhook,
  sendZaloMessage,
  sendReservationAlert,
  sendZaloReport,
  zaloConfig,
};
