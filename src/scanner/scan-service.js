const { runLogin } = require('../session-login');
const config = require('../config');
const { MuadiApiClient, MuadiApiError } = require('../muadi-client');
const {
  cheapestFare,
  departTimeOf,
  searchJourney,
  segmentsOf,
  summarizeFlightFare,
} = require('../booking-workflow');
const logger = require('../logger');

// Dedup login đang chạy, theo từng tài khoản (key = account.id), để hỗ trợ quét nhiều tài khoản.
const loginInflight = new Map();

function primaryAccount() {
  return (config.accounts && config.accounts[0]) || null;
}

function clientFor(account) {
  return account && account.sessionFile
    ? new MuadiApiClient({ sessionFile: account.sessionFile })
    : new MuadiApiClient();
}

function normalizeAirport(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeFlightNumber(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
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

function timeToMinutes(value) {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hh, mm] = time.split(':').map((item) => Number.parseInt(item, 10));
  return hh * 60 + mm;
}

function timeInWindow(time, start, end) {
  const value = timeToMinutes(time);
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (value === null) return false;
  if (from === null && to === null) return true;
  if (from !== null && to !== null && from > to) {
    return value >= from || value <= to;
  }
  if (from !== null && value < from) return false;
  if (to !== null && value > to) return false;
  return true;
}

function timeFromDateText(value) {
  const match = String(value || '').match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function deriveAirlineFromFlightNumber(flightNumber) {
  const match = normalizeFlightNumber(flightNumber).match(/^([A-Z0-9]{2,3})\d+/);
  return match ? match[1] : '';
}

function shouldRetryWithLogin(error) {
  if (!(error instanceof MuadiApiError)) return false;
  if (error.safeToRetry === false) return false;
  const code = error.data && String(error.data.code || '');
  const message = [
    error.message,
    error.data && error.data.message,
    error.data && error.data.code,
    error.path,
  ].filter(Boolean).join(' ');
  return error.status === 401 || code === '12' || code === '18' || /token|session time out/i.test(message);
}

async function runLoginOnce(account) {
  const key = account ? account.id : 'primary';
  if (!loginInflight.has(key)) {
    logger.warn(`[scanner] Triggering Playwright login (${account ? account.username : 'primary'}) during scan — may add up to 30s latency for this tick.`);
    const inflight = runLogin({ headless: true, account: account || undefined }).finally(() => {
      loginInflight.delete(key);
    });
    loginInflight.set(key, inflight);
  }
  return loginInflight.get(key);
}

async function createClientOrLogin(account) {
  try {
    return clientFor(account);
  } catch (error) {
    if (!/session|accessToken|localStorage/i.test(error && error.message ? error.message : String(error))) {
      throw error;
    }
    await runLoginOnce(account);
    return clientFor(account);
  }
}

// Bọc 1 operation Muadi cho MỘT tài khoản cụ thể: tự login/refresh-token/retry-401 cho account đó.
async function withAccountAutoLogin(account, operation) {
  let client = await createClientOrLogin(account);
  try {
    return await operation(client);
  } catch (error) {
    if (!shouldRetryWithLogin(error)) throw error;

    try {
      const refreshed = await client.tryRefreshToken();
      if (refreshed) {
        client = clientFor(account);
        return operation(client);
      }
    } catch (_) {
      // Fall through to full login.
    }

    await runLoginOnce(account);
    client = clientFor(account);
    return operation(client);
  }
}

// Tương thích cũ: scanner mặc định dùng tài khoản chính.
async function withScannerAutoLogin(operation) {
  return withAccountAutoLogin(primaryAccount(), operation);
}

function normalizeFlightResult(flight, fare, index) {
  const summary = summarizeFlightFare(flight, fare);
  const segments = segmentsOf(flight);
  const aircraft = segments
    .map((segment) => segment.airCraft || segment.aircraft || '')
    .filter(Boolean)
    .join(' + ');

  return {
    id: String(summary.id || flight.id || `flight_${index}`),
    airlineCode: summary.airline || '',
    flightNumber: summary.flightNumber || '',
    route: summary.route || '',
    from: summary.from || '',
    to: summary.to || '',
    departDate: summary.departDate || '',
    arrivalDate: summary.arrivalDate || '',
    departTime: departTimeOf(flight),
    arrivalTime: timeFromDateText(summary.arrivalDate),
    aircraft,
    class: summary.class || '',
    cabinClass: summary.cabinClass || '',
    fareBasis: summary.fareBasis || '',
    seatAvailable: summary.seatAvailable,
    currency: summary.currencyCode || 'VND',
    totalAmount: Number(summary.total || 0),
    fareBreakdown: {
      fareADT: Number(summary.fareADT || 0),
      taxADT: Number(summary.taxADT || 0),
      vatADT: Number(summary.vatADT || 0),
      issueFeeADT: Number(summary.issueFeeADT || 0),
      totalAmount: Number(summary.total || 0),
    },
    segments: segments.map((segment) => ({
      carrierCode: segment.carrierCode || summary.airline || '',
      flightNumber: `${segment.carrierCode || summary.airline || ''}${segment.flightNumber || ''}`,
      from: segment.from || '',
      to: segment.to || '',
      departDate: segment.departDate || '',
      arrivalDate: segment.arrivalDate || '',
      aircraft: segment.airCraft || segment.aircraft || '',
    })),
  };
}

function flightMatches(item, query) {
  const requestedFlight = normalizeFlightNumber(query.flightNumber);
  const requestedAirline = normalizeAirport(query.airline);
  const exactTime = normalizeTime(query.time);
  const start = normalizeTime(query.departureTimeStart);
  const end = normalizeTime(query.departureTimeEnd);

  if (requestedAirline && normalizeAirport(item.airlineCode) !== requestedAirline) return false;
  if (requestedFlight && normalizeFlightNumber(item.flightNumber) !== requestedFlight) return false;
  if (exactTime && item.departTime !== exactTime) return false;
  if ((start || end) && !timeInWindow(item.departTime, start, end)) return false;
  return true;
}

function scanParamsFromJob(job) {
  const query = job.query || {};
  const flightAirline = deriveAirlineFromFlightNumber(query.flightNumber);
  return {
    from: query.from,
    to: query.to,
    date: query.date,
    airline: query.airline || flightAirline,
    directOnly: !!query.directOnly,
    adt: query.adt || query.adults || 1,
    chd: query.chd || query.children || 0,
    inf: query.inf || query.infants || 0,
  };
}

async function scanJob(job) {
  const params = scanParamsFromJob(job);
  const journey = await withScannerAutoLogin((client) => searchJourney(params, { client }));
  const query = job.query || {};
  const results = [];

  for (const [index, flight] of (journey.flights || []).entries()) {
    try {
      const picked = cheapestFare(flight);
      const item = normalizeFlightResult(flight, picked.fare, index);
      if (flightMatches(item, query)) results.push(item);
    } catch (_) {
      // Sold-out or malformed fare entries are ignored for scan output.
    }
  }

  results.sort((a, b) => {
    const timeCompare = String(a.departTime || '').localeCompare(String(b.departTime || ''));
    if (timeCompare !== 0) return timeCompare;
    return Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
  });

  return {
    sessionID: journey.request && journey.request.sessionID,
    signIns: journey.signIns || [],
    airlineErrors: journey.errorsByAirline || {},
    resultCount: results.length,
    cheapest: results.length
      ? results.slice().sort((a, b) => Number(a.totalAmount || 0) - Number(b.totalAmount || 0))[0]
      : null,
    results,
  };
}

module.exports = {
  deriveAirlineFromFlightNumber,
  normalizeAirport,
  normalizeFlightNumber,
  normalizeTime,
  scanJob,
  timeInWindow,
  withScannerAutoLogin,
  withAccountAutoLogin,
};
