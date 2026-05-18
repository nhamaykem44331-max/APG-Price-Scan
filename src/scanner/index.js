const { ScanStore, nowIso, randomId } = require('./store');
const { scanJob } = require('./scan-service');
const {
  buildScanReport,
  isTelegramConfigured,
  sendScanReport,
  sendTelegramMessage,
} = require('./telegram');
const {
  isZaloConfigured,
  sendZaloMessage,
  sendZaloReport,
} = require('./zalo');
const logger = require('../logger');
const {
  buildActivity,
  buildHistory,
  enrichJob,
  extendedScannerStats,
} = require('./job-stats');

const DEFAULT_RETENTION_DAYS = Number.parseFloat(process.env.SCAN_HISTORY_RETENTION_DAYS || '3');
const MIN_INTERVAL_MINUTES = Number.parseInt(process.env.SCAN_MIN_INTERVAL_MINUTES || '5', 10);
const MIN_INTERVAL_SECONDS = Number.parseInt(process.env.SCAN_MIN_INTERVAL_SECONDS || '5', 10);
const EMPTY_STREAK_ALERT_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.SCAN_EMPTY_STREAK_THRESHOLD || '3', 10) || 3
);
const FAILURE_STREAK_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.SCAN_FAILURE_THRESHOLD || '5', 10) || 5
);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${match[3].padStart(2, '0')}-${match[2].padStart(2, '0')}-${match[1]}`;
  }
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    return `${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}-${match[3]}`;
  }
  return text;
}

function normalizeTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeFlightNumber(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function maybeUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeIntervalUnit(value, fallback = 'minutes') {
  const unit = String(value || fallback || 'minutes').trim().toLowerCase();
  if (['second', 'seconds', 'sec', 's'].includes(unit)) return 'seconds';
  return 'minutes';
}

function minIntervalSecondsForUnit(unit) {
  if (unit === 'seconds') {
    return Number.isFinite(MIN_INTERVAL_SECONDS) && MIN_INTERVAL_SECONDS > 0 ? MIN_INTERVAL_SECONDS : 5;
  }
  const minutes = Number.isFinite(MIN_INTERVAL_MINUTES) && MIN_INTERVAL_MINUTES > 0 ? MIN_INTERVAL_MINUTES : 5;
  return minutes * 60;
}

function normalizeSchedule(input = {}, existing = null) {
  const prev = existing || {};
  let unit = normalizeIntervalUnit(input.intervalUnit || input.unit, prev.intervalUnit || 'minutes');
  let value = input.intervalValue || input.value;

  if (Object.prototype.hasOwnProperty.call(input, 'intervalSeconds')) {
    unit = 'seconds';
    value = input.intervalSeconds;
  } else if (Object.prototype.hasOwnProperty.call(input, 'intervalMinutes')) {
    unit = normalizeIntervalUnit(input.intervalUnit, 'minutes');
    value = input.intervalMinutes;
  } else if (value === undefined || value === null || value === '') {
    if (prev.intervalValue !== undefined && prev.intervalValue !== null && prev.intervalValue !== '') {
      value = prev.intervalValue;
    } else if (prev.intervalSeconds) {
      value = normalizeIntervalUnit(prev.intervalUnit, unit) === 'seconds'
        ? prev.intervalSeconds
        : prev.intervalSeconds / 60;
    } else if (prev.intervalMinutes) {
      unit = 'minutes';
      value = prev.intervalMinutes;
    } else {
      value = 60;
    }
  }

  const parsedValue = positiveInt(value, unit === 'seconds' ? 60 : 60);
  const requestedSeconds = unit === 'seconds' ? parsedValue : parsedValue * 60;
  const intervalSeconds = Math.max(minIntervalSecondsForUnit(unit), requestedSeconds);
  const intervalValue = unit === 'seconds' ? intervalSeconds : Math.round(intervalSeconds / 60);

  return {
    intervalValue,
    intervalUnit: unit,
    intervalSeconds,
    intervalMinutes: Number((intervalSeconds / 60).toFixed(4)),
  };
}

function scheduleDelayMs(job) {
  const schedule = (job && job.schedule) || {};
  const seconds = positiveInt(
    schedule.intervalSeconds,
    schedule.intervalMinutes ? Number(schedule.intervalMinutes) * 60 : 3600
  );
  return Math.max(1000, seconds * 1000);
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeNotifyChannel(value, fallback = 'telegram') {
  const channel = String(value || fallback || 'telegram').trim().toLowerCase();
  return channel === 'zalo' ? 'zalo' : 'telegram';
}

function mergeQueryInput(input = {}, existing = {}) {
  const prev = existing || {};
  const raw = { ...prev, ...(input.query || {}) };
  for (const key of [
    'from',
    'to',
    'date',
    'airline',
    'flightNumber',
    'time',
    'departureTimeStart',
    'departureTimeEnd',
    'directOnly',
    'adt',
    'chd',
    'inf',
    'adults',
    'children',
    'infants',
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) raw[key] = input[key];
  }

  return {
    from: maybeUpper(raw.from),
    to: maybeUpper(raw.to),
    date: normalizeDate(raw.date),
    airline: maybeUpper(raw.airline),
    flightNumber: normalizeFlightNumber(raw.flightNumber),
    time: normalizeTime(raw.time),
    departureTimeStart: normalizeTime(raw.departureTimeStart),
    departureTimeEnd: normalizeTime(raw.departureTimeEnd),
    directOnly: booleanValue(raw.directOnly, !!prev.directOnly),
    adt: positiveInt(raw.adt || raw.adults, prev.adt || 1),
    chd: Number.parseInt(raw.chd || raw.children || prev.chd || '0', 10) || 0,
    inf: Number.parseInt(raw.inf || raw.infants || prev.inf || '0', 10) || 0,
  };
}

function defaultJobName(query) {
  const target = query.flightNumber || query.airline || 'ALL';
  return `${target} ${query.from}-${query.to} ${query.date}`.trim();
}

function validateJob(job) {
  const missing = [];
  if (!job.query.from) missing.push('from');
  if (!job.query.to) missing.push('to');
  if (!job.query.date) missing.push('date');
  if (missing.length) throw httpError(400, `Missing required scan fields: ${missing.join(', ')}`);
}

function normalizeJobInput(input = {}, existing = null) {
  const now = nowIso();
  const query = mergeQueryInput(input, existing && existing.query);
  const scheduleInput = { ...(input.schedule || {}) };
  if (Object.prototype.hasOwnProperty.call(input, 'intervalSeconds')) {
    scheduleInput.intervalSeconds = input.intervalSeconds;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'intervalMinutes')) {
    scheduleInput.intervalMinutes = input.intervalMinutes;
  }

  const notifyInput = { ...((existing && existing.notify) || {}), ...(input.notify || {}) };
  const notifyMode = ['every_run', 'on_change'].includes(String(notifyInput.mode || '').toLowerCase())
    ? String(notifyInput.mode).toLowerCase()
    : 'every_run';
  const notifyChannel = normalizeNotifyChannel(
    notifyInput.channel || notifyInput.platform,
    existing && existing.notify ? existing.notify.channel : 'telegram'
  );

  const job = {
    ...(existing || {}),
    id: existing && existing.id,
    name: String(input.name || (existing && existing.name) || defaultJobName(query)).trim(),
    enabled: booleanValue(input.enabled, existing ? !!existing.enabled : true),
    query,
    schedule: normalizeSchedule(scheduleInput, existing && existing.schedule),
    notify: {
      telegramEnabled: booleanValue(notifyInput.telegramEnabled, true),
      channel: notifyChannel,
      mode: notifyMode,
      notifyOnError: booleanValue(notifyInput.notifyOnError, true),
      muted: booleanValue(notifyInput.muted, existing && existing.notify ? !!existing.notify.muted : false),
    },
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now,
  };

  if (!job.enabled) {
    job.nextRunAt = null;
  } else {
    job.nextRunAt = new Date(Date.now() + scheduleDelayMs(job)).toISOString();
  }

  validateJob(job);
  return job;
}

function redactError(error) {
  return String(error && error.message ? error.message : error || 'Unknown error')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[REDACTED]')
    .slice(0, 600);
}

function resultKey(item) {
  return `${item.flightNumber || ''}|${item.departTime || ''}`;
}

function seatNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function compareResults(previousRun, nextResults) {
  if (!previousRun || !Array.isArray(previousRun.results)) {
    return { hasPrevious: false, changed: true, summary: 'first scan', counts: {} };
  }

  const previous = new Map(previousRun.results.map((item) => [resultKey(item), item]));
  const changes = [];
  for (const item of nextResults) {
    const old = previous.get(resultKey(item));
    if (!old) {
      changes.push({
        type: 'new',
        flightNumber: item.flightNumber,
        departTime: item.departTime,
        totalAmount: item.totalAmount,
        seatAvailable: item.seatAvailable,
      });
      continue;
    }

    const oldTotal = Number(old.totalAmount || 0);
    const newTotal = Number(item.totalAmount || 0);
    if (oldTotal !== newTotal) {
      const delta = newTotal - oldTotal;
      const percent = oldTotal > 0 ? Number(((delta / oldTotal) * 100).toFixed(2)) : null;
      changes.push({
        type: 'price',
        flightNumber: item.flightNumber,
        departTime: item.departTime,
        oldTotalAmount: oldTotal,
        newTotalAmount: newTotal,
        delta,
        percent,
      });
    }

    const oldSeat = seatNumber(old.seatAvailable);
    const newSeat = seatNumber(item.seatAvailable);
    if (oldSeat !== newSeat) {
      changes.push({
        type: 'seat',
        flightNumber: item.flightNumber,
        departTime: item.departTime,
        oldSeats: oldSeat,
        newSeats: newSeat,
        seatDelta: oldSeat !== null && newSeat !== null ? newSeat - oldSeat : null,
        soldOut: newSeat === 0,
      });
    }
  }

  for (const item of previousRun.results) {
    if (!nextResults.find((next) => resultKey(next) === resultKey(item))) {
      changes.push({
        type: 'removed',
        flightNumber: item.flightNumber,
        departTime: item.departTime,
        oldTotalAmount: item.totalAmount,
        oldSeats: seatNumber(item.seatAvailable),
      });
    }
  }

  const previousCheapest = previousRun.cheapest && Number(previousRun.cheapest.totalAmount || 0);
  const nextCheapest = nextResults.length
    ? Math.min(...nextResults.map((item) => Number(item.totalAmount || 0)).filter((value) => Number.isFinite(value)))
    : 0;
  const cheapestDelta = Number.isFinite(previousCheapest) ? nextCheapest - previousCheapest : null;
  const changed = changes.length > 0 || previousRun.results.length !== nextResults.length;

  const counts = changes.reduce((acc, change) => {
    acc[change.type] = (acc[change.type] || 0) + 1;
    return acc;
  }, {});

  return {
    hasPrevious: true,
    changed,
    summary: changed ? `${changes.length || 1} change(s)` : 'no change',
    counts,
    cheapestDelta,
    changes: changes.slice(0, 20),
  };
}

function shouldNotify(job, run) {
  const notify = job.notify || {};
  const channel = normalizeNotifyChannel(notify.channel);
  const configured = channel === 'zalo' ? isZaloConfigured() : isTelegramConfigured();
  if (!notify.telegramEnabled || !configured) return false;

  // Circuit-breaker auto-disable alert always notifies (overrides mute).
  if (run.autoDisabledByCircuitBreaker) return true;

  if (run.status === 'error') {
    if (notify.muted) return false;
    return notify.notifyOnError !== false;
  }

  if (notify.muted) return false;

  // Alert once when scan returns empty results EMPTY_STREAK_ALERT_THRESHOLD times in a row.
  // This catches silent failures (bad route, API drift) that on_change mode would otherwise hide.
  if (
    Number.isFinite(Number(run.emptyStreak)) &&
    Number(run.emptyStreak) === EMPTY_STREAK_ALERT_THRESHOLD &&
    Array.isArray(run.results) && run.results.length === 0
  ) {
    return true;
  }

  if (notify.mode === 'on_change') {
    return !run.comparison || !run.comparison.hasPrevious || !!run.comparison.changed;
  }
  return true;
}

function createScanner(options = {}) {
  const store = options.store || new ScanStore();
  const timers = new Map();
  const running = new Set();
  let started = false;
  let pruneTimer = null;
  const retentionDays = Number.isFinite(DEFAULT_RETENTION_DAYS) && DEFAULT_RETENTION_DAYS > 0 ? DEFAULT_RETENTION_DAYS : 3;

  function clearJobTimer(id) {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }

  function scheduleJob(job) {
    clearJobTimer(job.id);
    if (!started || !job.enabled) return;
    const nextAt = Date.parse(job.nextRunAt || '');
    const fallbackDelay = scheduleDelayMs(job);
    const delay = Math.max(1000, Number.isFinite(nextAt) ? nextAt - Date.now() : fallbackDelay);
    const timer = setTimeout(() => {
      runJob(job.id, { manual: false }).catch((error) => {
        logger.error('[scanner] scheduled scan failed:', redactError(error));
      });
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    timers.set(job.id, timer);
  }

  function rescheduleAll() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const job of store.listJobs()) {
      if (job.enabled) scheduleJob(job);
    }
  }

  async function notifyIfNeeded(job, run) {
    if (!shouldNotify(job, run)) return { attempted: false, status: 'skipped', attempts: 0 };
    const channel = normalizeNotifyChannel(job.notify && job.notify.channel);
    try {
      const sent = channel === 'zalo'
        ? await sendZaloReport(job, run)
        : await sendScanReport(job, run);
      const attempts = Number(sent && sent.attempts) || 1;
      store.recordNotification({
        jobId: job.id,
        runId: run.id,
        channel,
        status: 'sent',
        createdAt: nowIso(),
        messageId: sent.messageId || (sent.messageIds || []).join(','),
        messageCount: sent.messageCount || 1,
        attempts,
      });
      return {
        attempted: true,
        channel,
        status: 'sent',
        messageId: sent.messageId || (sent.messageIds || []).join(','),
        messageCount: sent.messageCount || 1,
        attempts,
      };
    } catch (error) {
      const message = redactError(error);
      const attempts = Number(error && error.attempts) || 1;
      store.recordNotification({
        jobId: job.id,
        runId: run.id,
        channel,
        status: 'failed',
        createdAt: nowIso(),
        error: message,
        attempts,
      });
      return { attempted: true, channel, status: 'failed', error: message, attempts };
    }
  }

  async function runJob(id, options = {}) {
    const job = store.getJob(id);
    if (!job) throw httpError(404, `Scan job not found: ${id}`);
    if (running.has(id)) throw httpError(409, `Scan job is already running: ${id}`);

    clearJobTimer(id);
    running.add(id);

    const previousEmptyStreak = Number.isFinite(Number(job.emptyStreak)) ? Number(job.emptyStreak) : 0;
    const previousFailureStreak = Number.isFinite(Number(job.failureStreak)) ? Number(job.failureStreak) : 0;

    const run = {
      id: randomId('run'),
      jobId: id,
      manual: !!options.manual,
      status: 'running',
      startedAt: nowIso(),
    };

    try {
      const previousRun = store.latestSuccessfulRun(id);
      const scanned = await scanJob(job);
      run.status = 'success';
      run.finishedAt = nowIso();
      run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
      run.sessionID = scanned.sessionID;
      run.signIns = scanned.signIns;
      run.airlineErrors = scanned.airlineErrors;
      run.matchCount = scanned.resultCount;
      run.cheapest = scanned.cheapest;
      run.results = scanned.results;
      run.comparison = compareResults(previousRun, scanned.results);
    } catch (error) {
      run.status = 'error';
      run.finishedAt = nowIso();
      run.durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
      run.error = redactError(error);
      run.results = [];
    }

    const isError = run.status === 'error';
    const isEmpty = !isError && Array.isArray(run.results) && run.results.length === 0;
    const nextEmptyStreak = isEmpty ? previousEmptyStreak + 1 : 0;
    const nextFailureStreak = isError ? previousFailureStreak + 1 : 0;
    run.emptyStreak = nextEmptyStreak;
    run.failureStreak = nextFailureStreak;

    const shouldAutoDisable = isError && nextFailureStreak >= FAILURE_STREAK_THRESHOLD;
    if (shouldAutoDisable) {
      run.autoDisabledByCircuitBreaker = true;
      run.autoDisableReason = `${nextFailureStreak} consecutive failures (threshold ${FAILURE_STREAK_THRESHOLD})`;
    }

    run.notification = await notifyIfNeeded(job, run);
    const savedRun = store.recordRun(run);

    const stayEnabled = job.enabled && !shouldAutoDisable;
    const nextRunAt = stayEnabled
      ? new Date(Date.now() + scheduleDelayMs(job)).toISOString()
      : null;
    const updatedJob = store.updateJob(id, {
      lastRunAt: savedRun.finishedAt,
      lastStatus: savedRun.status,
      lastError: savedRun.status === 'error' ? savedRun.error : '',
      nextRunAt,
      emptyStreak: nextEmptyStreak,
      failureStreak: nextFailureStreak,
      enabled: stayEnabled,
      ...(shouldAutoDisable
        ? { autoDisabledAt: nowIso(), autoDisabledReason: run.autoDisableReason }
        : {}),
    });

    if (shouldAutoDisable) {
      logger.warn(`[scanner] Job ${id} auto-disabled: ${run.autoDisableReason}`);
    }

    running.delete(id);
    store.prune(retentionDays);
    if (updatedJob && updatedJob.enabled) scheduleJob(updatedJob);
    return savedRun;
  }

  function createJob(input = {}) {
    const job = store.createJob(normalizeJobInput(input));
    scheduleJob(job);
    return job;
  }

  function updateJob(id, input = {}) {
    const existing = store.getJob(id);
    if (!existing) throw httpError(404, `Scan job not found: ${id}`);
    const next = normalizeJobInput(input, existing);
    const saved = store.updateJob(id, next);
    scheduleJob(saved);
    return saved;
  }

  function deleteJob(id) {
    clearJobTimer(id);
    const deleted = store.deleteJob(id);
    if (!deleted) throw httpError(404, `Scan job not found: ${id}`);
    return { success: true, deleted: true, id };
  }

  function start() {
    if (started) return;
    started = true;
    store.prune(retentionDays);
    rescheduleAll();
    pruneTimer = setInterval(() => {
      store.prune(retentionDays);
    }, 60 * 60 * 1000);
    if (typeof pruneTimer.unref === 'function') pruneTimer.unref();
  }

  function stop() {
    started = false;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (pruneTimer) clearInterval(pruneTimer);
    pruneTimer = null;
  }

  function settings(options = {}) {
    const jobs = store.listJobs();
    const enabledJobs = jobs.filter((job) => job.enabled);
    const nextRunTimes = enabledJobs
      .map((job) => Date.parse(job.nextRunAt || ''))
      .filter((value) => Number.isFinite(value));
    const recentRuns = store.listRuns(null, { limit: 50 });
    const recentFailures = recentRuns.filter((run) => run.status === 'error').length;
    const lastRun = recentRuns[0];
    const lastNotification = (typeof store.listNotifications === 'function')
      ? store.listNotifications({ limit: 50 })
      : (store.load().notifications || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 50);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const notificationFailures24h = lastNotification.filter((n) => n.status === 'failed' && Date.parse(n.createdAt || 0) >= cutoff).length;

    const base = {
      retentionDays,
      minIntervalMinutes: Number.isFinite(MIN_INTERVAL_MINUTES) && MIN_INTERVAL_MINUTES > 0 ? MIN_INTERVAL_MINUTES : 5,
      minIntervalSeconds: Number.isFinite(MIN_INTERVAL_SECONDS) && MIN_INTERVAL_SECONDS > 0 ? MIN_INTERVAL_SECONDS : 5,
      emptyStreakThreshold: EMPTY_STREAK_ALERT_THRESHOLD,
      failureStreakThreshold: FAILURE_STREAK_THRESHOLD,
      telegramConfigured: isTelegramConfigured(),
      zaloConfigured: isZaloConfigured(),
      started,
      runningJobIds: Array.from(running),
      storeFile: store.filePath,
      jobCount: jobs.length,
      enabledJobCount: enabledJobs.length,
      nextScheduledRun: nextRunTimes.length ? new Date(Math.min(...nextRunTimes)).toISOString() : null,
      recentFailures,
      notificationFailures24h,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            jobId: lastRun.jobId,
            status: lastRun.status,
            finishedAt: lastRun.finishedAt || lastRun.startedAt,
            matchCount: lastRun.matchCount || 0,
          }
        : null,
    };

    if (!options.extended) return base;

    // /health/extended fields — bigger query (all runs in retention window).
    const allRuns = store.listRuns(null, { limit: 5000 });
    const allNotifications = (typeof store.listNotifications === 'function')
      ? store.listNotifications({ limit: 5000 })
      : lastNotification;
    const extended = extendedScannerStats(jobs, allRuns, allNotifications);
    return { ...base, ...extended };
  }

  function getJobHistory(jobId, options = {}) {
    const job = store.getJob(jobId);
    if (!job) throw httpError(404, `Scan job not found: ${jobId}`);
    const runs = store.listRuns(jobId, { limit: 5000 });
    return buildHistory(job, runs, options);
  }

  function getActivity(options = {}) {
    const jobs = store.listJobs();
    const runs = store.listRuns(null, { limit: 1000 });
    return buildActivity(jobs, runs, options);
  }

  function listNotifications(options) {
    if (typeof store.listNotifications === 'function') {
      return store.listNotifications(options);
    }
    const limit = Number.parseInt((options && options.limit) || '50', 10);
    const status = options && options.status;
    const all = (store.load().notifications || [])
      .filter((n) => !status || n.status === status)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all;
  }

  async function sendTelegramTest(text) {
    const message = String(text || 'Price Scan Telegram test').slice(0, 1000);
    const result = await sendTelegramMessage(message);
    return { success: true, channel: 'telegram', ...result };
  }

  async function sendZaloTest(text) {
    const message = String(text || 'Price Scan Zalo test').slice(0, 1000);
    const result = await sendZaloMessage(message);
    return { success: true, channel: 'zalo', ...result };
  }

  async function sendNotificationTest(channel, text) {
    const normalized = normalizeNotifyChannel(channel);
    return normalized === 'zalo'
      ? sendZaloTest(text)
      : sendTelegramTest(text);
  }

  function enrichedJobs(jobs) {
    const runs = store.listRuns(null, { limit: 5000 });
    return jobs.map((job) => enrichJob(job, runs));
  }

  return {
    buildScanReport,
    createJob: (input) => {
      const created = createJob(input);
      if (!created) return created;
      return enrichJob(created, store.listRuns(created.id, { limit: 500 }));
    },
    deleteJob,
    getJob: (id) => {
      const job = store.getJob(id);
      if (!job) throw httpError(404, `Scan job not found: ${id}`);
      const runs = store.listRuns(id, { limit: 500 });
      return enrichJob(job, runs);
    },
    getRun: (id) => {
      const run = store.getRun(id);
      if (!run) throw httpError(404, `Scan run not found: ${id}`);
      return run;
    },
    getJobHistory,
    getActivity,
    listJobs: () => enrichedJobs(store.listJobs()),
    listRuns: (jobId, options) => store.listRuns(jobId, options),
    listNotifications,
    runJob,
    sendNotificationTest,
    sendTelegramTest,
    sendZaloTest,
    settings,
    start,
    stop,
    updateJob: (id, input) => {
      const saved = updateJob(id, input);
      if (!saved) return saved;
      const runs = store.listRuns(id, { limit: 500 });
      return enrichJob(saved, runs);
    },
  };
}

module.exports = {
  createScanner,
  normalizeDate,
  normalizeJobInput,
  // Internals exposed for tests:
  __test__: {
    compareResults,
    shouldNotify,
    EMPTY_STREAK_ALERT_THRESHOLD,
    FAILURE_STREAK_THRESHOLD,
  },
};
