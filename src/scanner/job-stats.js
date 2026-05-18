'use strict';

/**
 * Pure helpers for derived stats over jobs + runs.
 *
 * Functions exported here are intentionally side-effect free so they can be
 * tested in isolation. The scanner module wires them into the public API
 * (listJobs/getJob/getJobHistory/getActivity/extendedSettings).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const VALID_RANGES = new Set(['1h', '24h', '7d', 'all']);
const VALID_BUCKETS = new Set(['none', '15m', '1h', '1d']);
const VALID_KINDS = new Set(['sold', 'down', 'up', 'seat', 'new', 'removed', 'error', 'scan']);

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function seatNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  return safeNumber(value);
}

function pickFlightForJob(results, job) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const query = (job && job.query) || {};
  const wanted = String(query.flightNumber || '').trim().toUpperCase();
  if (wanted) {
    const match = results.find((r) => String(r.flightNumber || '').trim().toUpperCase() === wanted);
    if (match) return match;
  }
  // Fallback: pick cheapest available so dashboard always shows something sensible.
  const sorted = results
    .slice()
    .filter((r) => Number.isFinite(Number(r.totalAmount)))
    .sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount));
  return sorted[0] || results[0] || null;
}

function startOfTodayMs(now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Enrich a single job with derived fields needed by Dashboard routes board:
 * lastPrice / prevPrice / lastSeat / runsToday / lastFlight / lastStatus.
 */
function enrichJob(job, runs, options = {}) {
  if (!job) return job;
  const enriched = { ...job };
  const allRuns = Array.isArray(runs) ? runs : [];

  // listRuns already sorts DESC by startedAt — but be defensive.
  const sorted = allRuns
    .filter((r) => r && r.jobId === job.id)
    .slice()
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));

  const successfulWithPrice = sorted
    .filter((r) => r.status === 'success')
    .map((r) => ({ run: r, flight: pickFlightForJob(r.results, job) }))
    .filter((entry) => entry.flight && Number.isFinite(Number(entry.flight.totalAmount)));

  const last = successfulWithPrice[0] || null;
  const prev = successfulWithPrice[1] || null;

  enriched.lastPrice = last ? safeNumber(last.flight.totalAmount) : null;
  enriched.prevPrice = prev ? safeNumber(prev.flight.totalAmount) : null;
  enriched.lastSeat = last ? seatNumber(last.flight.seatAvailable) : null;
  enriched.lastFlight = last ? (last.flight.flightNumber || null) : null;
  enriched.lastRunAt = enriched.lastRunAt || (sorted[0] && sorted[0].startedAt) || null;
  enriched.lastStatus = enriched.lastStatus || (sorted[0] && sorted[0].status) || null;

  const startOfDay = startOfTodayMs(options.now || Date.now());
  enriched.runsToday = sorted.filter((r) => Date.parse(r.startedAt || 0) >= startOfDay).length;

  return enriched;
}

function cutoffForRange(range, now = Date.now()) {
  switch (range) {
    case '1h': return now - HOUR_MS;
    case '24h': return now - 24 * HOUR_MS;
    case '7d': return now - 7 * DAY_MS;
    case 'all': return 0;
    default: return now - 24 * HOUR_MS;
  }
}

function defaultBucketForRange(range) {
  if (range === '7d') return '1h';
  if (range === 'all') return '1d';
  return 'none';
}

function bucketSizeMs(bucket) {
  switch (bucket) {
    case '15m': return 15 * 60 * 1000;
    case '1h': return HOUR_MS;
    case '1d': return DAY_MS;
    default: return 0;
  }
}

function aggregateBuckets(points, bucketMs) {
  if (!bucketMs || !Array.isArray(points) || points.length === 0) return points || [];
  const buckets = new Map();
  for (const point of points) {
    const t = Date.parse(point.t);
    if (!Number.isFinite(t)) continue;
    const slot = Math.floor(t / bucketMs) * bucketMs;
    if (!buckets.has(slot)) {
      buckets.set(slot, { slot, points: [] });
    }
    buckets.get(slot).points.push(point);
  }
  const sortedSlots = [...buckets.values()].sort((a, b) => a.slot - b.slot);
  return sortedSlots.map(({ slot, points: items }) => {
    const prices = items.map((p) => safeNumber(p.price)).filter((v) => v !== null);
    const seats = items.map((p) => seatNumber(p.seat));
    const lastSeat = seats.length ? seats[seats.length - 1] : null;
    const errored = items.some((p) => p.status === 'error');
    const avg = prices.length
      ? Math.round(prices.reduce((acc, v) => acc + v, 0) / prices.length)
      : null;
    return {
      t: new Date(slot).toISOString(),
      price: avg,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      seat: lastSeat,
      minSeat: seats.filter((s) => s !== null).length ? Math.min(...seats.filter((s) => s !== null)) : null,
      maxSeat: seats.filter((s) => s !== null).length ? Math.max(...seats.filter((s) => s !== null)) : null,
      status: errored ? 'error' : 'success',
      runCount: items.length,
    };
  });
}

function summarizeSeries(series) {
  const prices = series.map((p) => safeNumber(p.price)).filter((v) => v !== null);
  if (!prices.length) {
    return {
      min: null,
      max: null,
      avg: null,
      first: null,
      last: null,
      trendPct: null,
      lastSeat: null,
      soldOutAt: null,
    };
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((acc, v) => acc + v, 0) / prices.length);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const trendPct = first > 0
    ? Number((((last - first) / first) * 100).toFixed(2))
    : null;
  const lastSeat = seatNumber(series[series.length - 1].seat);
  const soldOutEntry = series.find((p) => seatNumber(p.seat) === 0);
  return {
    min,
    max,
    avg,
    first,
    last,
    trendPct,
    lastSeat,
    soldOutAt: soldOutEntry ? soldOutEntry.t : null,
  };
}

/**
 * @returns {{ jobId, range, bucket, series, summary }}
 */
function buildHistory(job, runs, options = {}) {
  if (!job) {
    return { jobId: null, range: '24h', bucket: 'none', series: [], summary: summarizeSeries([]) };
  }
  const rangeRaw = String(options.range || '24h').toLowerCase();
  const range = VALID_RANGES.has(rangeRaw) ? rangeRaw : '24h';
  const bucketRaw = String(options.bucket || '').toLowerCase();
  const bucket = bucketRaw && VALID_BUCKETS.has(bucketRaw) ? bucketRaw : defaultBucketForRange(range);
  const now = options.now || Date.now();
  const cutoff = cutoffForRange(range, now);

  const candidates = (Array.isArray(runs) ? runs : [])
    .filter((r) => r && r.jobId === job.id)
    .filter((r) => Date.parse(r.startedAt || 0) >= cutoff);

  const points = [];
  for (const run of candidates) {
    const flight = pickFlightForJob(run.results || [], job);
    if (!flight) continue;
    const price = safeNumber(flight.totalAmount);
    if (price === null) continue;
    points.push({
      t: run.startedAt,
      price,
      seat: seatNumber(flight.seatAvailable),
      status: run.status || 'success',
    });
  }

  points.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  let series = points;
  if (bucket !== 'none') {
    series = aggregateBuckets(points, bucketSizeMs(bucket));
  }
  // For non-bucketed points, normalize to canonical shape (add runCount: 1).
  if (bucket === 'none') {
    series = points.map((p) => ({
      t: p.t,
      price: p.price,
      seat: p.seat,
      status: p.status,
      runCount: 1,
    }));
  }

  return {
    jobId: job.id,
    range,
    bucket,
    series,
    summary: summarizeSeries(series),
  };
}

function changeTitle(job, flightNumber) {
  if (flightNumber) return flightNumber;
  if (job.query && job.query.flightNumber) return job.query.flightNumber;
  return job.name || job.id;
}

function detailForPriceChange(change) {
  const oldAmt = safeNumber(change.oldTotalAmount);
  const newAmt = safeNumber(change.newTotalAmount);
  const pct = safeNumber(change.percent);
  const oldStr = oldAmt !== null ? oldAmt.toLocaleString('vi-VN') : '—';
  const newStr = newAmt !== null ? newAmt.toLocaleString('vi-VN') : '—';
  const pctStr = pct !== null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : '';
  return `${oldStr} → ${newStr} ₫${pctStr}`;
}

function detailForSeat(change) {
  if (change.soldOut) return `Sold out chuyến ${change.departTime || ''}`.trim();
  const oldS = change.oldSeats !== null && change.oldSeats !== undefined ? change.oldSeats : '?';
  const newS = change.newSeats !== null && change.newSeats !== undefined ? change.newSeats : '?';
  return `${oldS} ghế → ${newS} ghế`;
}

function changeKind(change) {
  if (change.type === 'price') return change.delta < 0 ? 'down' : 'up';
  if (change.type === 'seat') return change.soldOut ? 'sold' : 'seat';
  if (change.type === 'new') return 'new';
  if (change.type === 'removed') return 'removed';
  return change.type;
}

function mapChangeToEvent(change, run, job) {
  const kind = changeKind(change);
  const title = changeTitle(job, change.flightNumber);
  let detail = '';
  if (kind === 'down' || kind === 'up') detail = detailForPriceChange(change);
  else if (kind === 'sold' || kind === 'seat') detail = detailForSeat(change);
  else if (kind === 'new') detail = `Mới: ${title} ${change.departTime || ''}`.trim();
  else if (kind === 'removed') detail = `Mất chuyến ${title} ${change.departTime || ''}`.trim();

  return {
    id: `${run.id || run.startedAt}_${kind}_${change.flightNumber || ''}_${change.departTime || ''}`,
    t: run.startedAt,
    jobId: job.id,
    jobName: job.name,
    kind,
    title,
    detail,
    meta: {
      flightNumber: change.flightNumber,
      departTime: change.departTime,
      from: (job.query && job.query.from) || undefined,
      to: (job.query && job.query.to) || undefined,
      ...(change.type === 'price'
        ? { prevPrice: change.oldTotalAmount, price: change.newTotalAmount, deltaPct: change.percent }
        : {}),
      ...(change.type === 'seat'
        ? { oldSeats: change.oldSeats, newSeats: change.newSeats }
        : {}),
    },
  };
}

function buildActivity(jobs, runs, options = {}) {
  const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit || '50', 10) || 50));
  const sinceTs = options.since ? Date.parse(options.since) : 0;
  const kindFilter = Array.isArray(options.kinds) && options.kinds.length
    ? new Set(options.kinds.filter((k) => VALID_KINDS.has(k)))
    : null;
  const includeScan = !kindFilter || kindFilter.has('scan');

  const jobsById = new Map();
  for (const job of jobs || []) jobsById.set(job.id, job);

  const events = [];
  for (const run of runs || []) {
    if (!run) continue;
    const job = jobsById.get(run.jobId);
    if (!job) continue;
    const ts = Date.parse(run.startedAt || 0);
    if (!Number.isFinite(ts)) continue;
    if (sinceTs && ts <= sinceTs) continue;

    if (run.status === 'error') {
      if (!kindFilter || kindFilter.has('error')) {
        events.push({
          id: `${run.id || run.startedAt}_err`,
          t: run.startedAt,
          jobId: job.id,
          jobName: job.name,
          kind: 'error',
          title: changeTitle(job),
          detail: run.error || 'Unknown error',
          meta: { runId: run.id },
        });
      }
      continue;
    }

    const changes = (run.comparison && Array.isArray(run.comparison.changes)) ? run.comparison.changes : [];
    if (changes.length === 0) {
      if (includeScan && run.status === 'success') {
        events.push({
          id: `${run.id || run.startedAt}_scan`,
          t: run.startedAt,
          jobId: job.id,
          jobName: job.name,
          kind: 'scan',
          title: changeTitle(job),
          detail: `${run.matchCount || 0} chuyến — không thay đổi`,
          meta: { runId: run.id, matchCount: run.matchCount || 0 },
        });
      }
      continue;
    }
    for (const change of changes) {
      const kind = changeKind(change);
      if (kindFilter && !kindFilter.has(kind)) continue;
      events.push(mapChangeToEvent(change, run, job));
    }
  }

  events.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
  return events.slice(0, limit);
}

/**
 * Compute extended scanner stats for /health/extended.
 */
function extendedScannerStats(jobs, runs, notifications, options = {}) {
  const now = options.now || Date.now();
  const cutoff24 = now - 24 * HOUR_MS;
  const cutoffPrev24 = now - 48 * HOUR_MS;
  const cutoff1h = now - HOUR_MS;

  let totalScans24h = 0;
  let totalScansPrev24h = 0;
  let totalScansLastHour = 0;
  const scansByHour = new Array(24).fill(0);
  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const run of runs || []) {
    if (!run) continue;
    const ts = Date.parse(run.startedAt || 0);
    if (!Number.isFinite(ts)) continue;
    if (ts >= cutoff24 && ts <= now) {
      totalScans24h += 1;
      if (ts >= cutoff1h) totalScansLastHour += 1;
      const hourBucket = Math.floor((now - ts) / HOUR_MS);
      const slot = 23 - hourBucket;
      if (slot >= 0 && slot < 24) scansByHour[slot] += 1;
    } else if (ts >= cutoffPrev24 && ts < cutoff24) {
      totalScansPrev24h += 1;
    }

    const notif = run.notification;
    if (notif) {
      if (notif.status === 'sent') sent += 1;
      if (notif.status === 'failed') failed += 1;
      const attempts = Number(notif.attempts) || 0;
      if (attempts > 1) retried += 1;
    }
  }

  // Fallback: also count notifications recorded in store (in case run.notification was lost on restart).
  if (Array.isArray(notifications) && sent + failed === 0) {
    for (const notification of notifications) {
      const ts = Date.parse(notification.createdAt || 0);
      if (!Number.isFinite(ts) || ts < cutoff24) continue;
      if (notification.status === 'sent') sent += 1;
      if (notification.status === 'failed') failed += 1;
      const attempts = Number(notification.attempts) || 0;
      if (attempts > 1) retried += 1;
    }
  }

  const totalNotify = sent + failed;
  const successRate = totalNotify > 0
    ? Math.round((sent / totalNotify) * 1000) / 10
    : 100;

  const enrichedJobs = (jobs || []).map((job) => enrichJob(job, runs, { now }));
  const lowSeatCount = enrichedJobs.filter((j) => j.lastSeat !== null && j.lastSeat > 0 && j.lastSeat <= 3).length;
  const soldOutCount = enrichedJobs.filter((j) => j.lastSeat === 0).length;

  const totalScansDeltaPct = totalScansPrev24h > 0
    ? Math.round(((totalScans24h - totalScansPrev24h) / totalScansPrev24h) * 1000) / 10
    : 0;

  return {
    totalScans24h,
    totalScansPrev24h,
    totalScansDeltaPct,
    totalScansLastHour,
    scansByHour,
    notifyStats24h: { sent, failed, retried, successRate },
    lowSeatCount,
    soldOutCount,
  };
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  VALID_RANGES,
  VALID_BUCKETS,
  VALID_KINDS,
  aggregateBuckets,
  buildActivity,
  buildHistory,
  bucketSizeMs,
  cutoffForRange,
  defaultBucketForRange,
  enrichJob,
  extendedScannerStats,
  mapChangeToEvent,
  pickFlightForJob,
  seatNumber,
  startOfTodayMs,
  summarizeSeries,
};
