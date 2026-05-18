// ============================================================
// Mock data for APG Price Scan prototype
// Shape mirrors public/app.js + scanner/store.js
// ============================================================

const AIRPORTS = {
  HAN: 'Hà Nội',
  SGN: 'TP. Hồ Chí Minh',
  DAD: 'Đà Nẵng',
  CXR: 'Nha Trang',
  PQC: 'Phú Quốc',
  HUI: 'Huế',
  VCA: 'Cần Thơ',
  HPH: 'Hải Phòng',
  DLI: 'Đà Lạt',
};

const AIRLINES = {
  VJ: { name: 'VietJet Air', color: '#ec1c24' },
  VN: { name: 'Vietnam Airlines', color: '#1c5cb8' },
  QH: { name: 'Bamboo Airways', color: '#0e8e6f' },
  BL: { name: 'Pacific Airlines', color: '#f7941e' },
  VU: { name: 'Vietravel Airlines', color: '#0079c2' },
};

// Helper: build price/seat history series for a job
function buildHistory(basePrice, runs, volatility = 0.06) {
  const series = [];
  let price = basePrice;
  let seat = 9;
  const now = Date.now();
  const step = 60 * 60 * 1000; // 1h
  for (let i = runs - 1; i >= 0; i--) {
    // random walk price
    const jitter = (Math.sin(i * 0.7) + Math.cos(i * 0.31)) * volatility;
    const drift = (Math.random() - 0.5) * 0.04;
    price = Math.max(basePrice * 0.6, price * (1 + jitter * 0.5 + drift));
    // seats trend down
    if (Math.random() > 0.7 && seat > 0) seat -= 1;
    if (Math.random() > 0.92 && seat < 9) seat += 1;
    series.push({
      t: now - i * step,
      price: Math.round(price / 1000) * 1000,
      seat: Math.max(0, seat),
      status: Math.random() > 0.95 ? 'error' : 'success',
    });
  }
  return series;
}

// Helper: format VND
const fmtVND = (n) => new Intl.NumberFormat('vi-VN').format(n);

// Helper: format time
const fmtTime = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const fmtDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Build relative time string in Vietnamese
function fmtRel(iso) {
  if (!iso) return '—';
  const ms = (iso instanceof Date ? iso.getTime() : Date.parse(iso)) - Date.now();
  if (!Number.isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return sec >= 0 ? `trong ${abs}s` : `${abs}s trước`;
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return min >= 0 ? `trong ${min} phút` : `${Math.abs(min)} phút trước`;
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return hr >= 0 ? `trong ${hr}h` : `${Math.abs(hr)}h trước`;
  const day = Math.round(hr / 24);
  return day >= 0 ? `trong ${day} ngày` : `${Math.abs(day)} ngày trước`;
}

const now = Date.now();
const m = (mins) => now + mins * 60 * 1000;

const JOBS = [
  {
    id: 'job_vj125',
    name: 'VJ125 HAN-SGN sáng',
    enabled: true,
    lastStatus: 'success',
    query: {
      from: 'HAN', to: 'SGN', date: '2026-05-22',
      airline: 'VJ', flightNumber: 'VJ125',
      departureTimeStart: '06:00', departureTimeEnd: '12:00',
      directOnly: true, adt: 1,
    },
    schedule: { intervalValue: 15, intervalUnit: 'minutes', intervalSeconds: 900 },
    notify: { channel: 'telegram', mode: 'on_change', telegramEnabled: true, muted: false },
    nextRunAt: new Date(m(8)).toISOString(),
    lastPrice: 1846000,
    prevPrice: 1929000,
    seat: 4,
    runsToday: 64,
    history: buildHistory(1850000, 36, 0.05),
  },
  {
    id: 'job_vn211',
    name: 'VN211 SGN-DAD trưa',
    enabled: true,
    lastStatus: 'success',
    query: {
      from: 'SGN', to: 'DAD', date: '2026-05-21',
      airline: 'VN', flightNumber: 'VN211',
      departureTimeStart: '10:00', departureTimeEnd: '14:00',
      directOnly: true, adt: 1,
    },
    schedule: { intervalValue: 30, intervalUnit: 'minutes', intervalSeconds: 1800 },
    notify: { channel: 'telegram', mode: 'every_run', telegramEnabled: true, muted: false },
    nextRunAt: new Date(m(22)).toISOString(),
    lastPrice: 1290000,
    prevPrice: 1290000,
    seat: 8,
    runsToday: 32,
    history: buildHistory(1290000, 36, 0.03),
  },
  {
    id: 'job_qh102',
    name: 'QH102 HAN-SGN tối',
    enabled: true,
    lastStatus: 'success',
    query: {
      from: 'HAN', to: 'SGN', date: '2026-05-23',
      airline: 'QH', flightNumber: 'QH102',
      departureTimeStart: '18:00', departureTimeEnd: '22:00',
      directOnly: true, adt: 2,
    },
    schedule: { intervalValue: 60, intervalUnit: 'minutes', intervalSeconds: 3600 },
    notify: { channel: 'zalo', mode: 'on_change', telegramEnabled: true, muted: false },
    nextRunAt: new Date(m(36)).toISOString(),
    lastPrice: 2050000,
    prevPrice: 1980000,
    seat: 2,
    runsToday: 16,
    history: buildHistory(2000000, 36, 0.06),
  },
  {
    id: 'job_vj256',
    name: 'VJ256 SGN-PQC',
    enabled: true,
    lastStatus: 'success',
    query: {
      from: 'SGN', to: 'PQC', date: '2026-05-22',
      airline: 'VJ', flightNumber: 'VJ256',
      departureTimeStart: '07:00', departureTimeEnd: '09:00',
      directOnly: true, adt: 1,
    },
    schedule: { intervalValue: 10, intervalUnit: 'minutes', intervalSeconds: 600 },
    notify: { channel: 'telegram', mode: 'on_change', telegramEnabled: true, muted: false },
    nextRunAt: new Date(m(3)).toISOString(),
    lastPrice: 989000,
    prevPrice: 1090000,
    seat: 0,
    runsToday: 96,
    history: buildHistory(1050000, 36, 0.08),
  },
  {
    id: 'job_vn1545',
    name: 'VN1545 HAN-DAD',
    enabled: false,
    lastStatus: 'success',
    query: {
      from: 'HAN', to: 'DAD', date: '2026-05-25',
      airline: 'VN', flightNumber: 'VN1545',
      departureTimeStart: '08:00', departureTimeEnd: '11:00',
      directOnly: true, adt: 1,
    },
    schedule: { intervalValue: 60, intervalUnit: 'minutes', intervalSeconds: 3600 },
    notify: { channel: 'telegram', mode: 'every_run', telegramEnabled: false, muted: true },
    nextRunAt: null,
    lastPrice: 1320000,
    prevPrice: 1320000,
    seat: 7,
    runsToday: 0,
    history: buildHistory(1350000, 24, 0.04),
  },
  {
    id: 'job_vu215',
    name: 'VU215 SGN-CXR cuối tuần',
    enabled: true,
    lastStatus: 'error',
    query: {
      from: 'SGN', to: 'CXR', date: '2026-05-24',
      airline: 'VU', flightNumber: 'VU215',
      departureTimeStart: '14:00', departureTimeEnd: '17:00',
      directOnly: true, adt: 1,
    },
    schedule: { intervalValue: 30, intervalUnit: 'minutes', intervalSeconds: 1800 },
    notify: { channel: 'telegram', mode: 'every_run', telegramEnabled: true, muted: false },
    nextRunAt: new Date(m(12)).toISOString(),
    lastPrice: 850000,
    prevPrice: 820000,
    seat: 5,
    runsToday: 28,
    history: buildHistory(840000, 36, 0.05),
  },
];

// Compute global stats
function computeStats(jobs) {
  const enabled = jobs.filter(j => j.enabled).length;
  const total = jobs.length;
  const next = jobs
    .filter(j => j.enabled && j.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))[0];
  const totalScans = jobs.reduce((s, j) => s + (j.runsToday || 0), 0);

  // notify reliability
  const successRate = 97.8;
  const fails24 = 4;

  return {
    total, enabled, paused: total - enabled,
    next, totalScans,
    successRate, fails24,
  };
}

// Recent activity feed entries
const FEED = [
  { t: now - 35 * 1000, jobId: 'job_vj256', kind: 'sold', text: 'VJ256 SGN→PQC sáng', detail: 'Sold out chuyến 07:30' },
  { t: now - 2 * 60 * 1000, jobId: 'job_vj125', kind: 'down', text: 'VJ125 HAN→SGN', detail: '1.929.000 → 1.846.000 ₫ (-4.3%)' },
  { t: now - 6 * 60 * 1000, jobId: 'job_qh102', kind: 'up', text: 'QH102 HAN→SGN', detail: '1.980.000 → 2.050.000 ₫ (+3.5%)' },
  { t: now - 9 * 60 * 1000, jobId: 'job_vu215', kind: 'error', text: 'VU215 SGN→CXR', detail: 'Scan thất bại — auth Nam Thanh' },
  { t: now - 14 * 60 * 1000, jobId: 'job_vn211', kind: 'scan', text: 'VN211 SGN→DAD', detail: 'Scan OK, 6 chuyến, không đổi' },
  { t: now - 22 * 60 * 1000, jobId: 'job_vj125', kind: 'seat', text: 'VJ125 HAN→SGN', detail: 'Còn 4 ghế (giảm từ 6)' },
  { t: now - 35 * 60 * 1000, jobId: 'job_qh102', kind: 'scan', text: 'QH102 HAN→SGN', detail: 'Scan OK, 4 chuyến' },
  { t: now - 48 * 60 * 1000, jobId: 'job_vj256', kind: 'down', text: 'VJ256 SGN→PQC', detail: '1.090.000 → 989.000 ₫ (-9.3%)' },
  { t: now - 65 * 60 * 1000, jobId: 'job_vn211', kind: 'scan', text: 'VN211 SGN→DAD', detail: 'Scan OK, không đổi' },
];

// Detailed runs for one job (used in Job Detail)
function buildRuns(job) {
  const runs = [];
  const total = 24;
  for (let i = 0; i < total; i++) {
    const t = now - i * (job.schedule.intervalSeconds * 1000);
    const isError = Math.random() > 0.96;
    const hist = job.history[job.history.length - 1 - i] || job.history[0];
    const priceChange = i < job.history.length - 1
      ? job.history[job.history.length - 1 - i].price - (job.history[job.history.length - 2 - i]?.price ?? hist.price)
      : 0;
    const seatChange = i < job.history.length - 1
      ? (job.history[job.history.length - 1 - i].seat - (job.history[job.history.length - 2 - i]?.seat ?? hist.seat))
      : 0;
    const changes = [];
    if (Math.abs(priceChange) > 0) {
      changes.push({
        type: 'price', delta: priceChange, percent: Math.round((priceChange / (hist.price || 1)) * 1000) / 10,
      });
    }
    if (seatChange !== 0) changes.push({ type: 'seat', seatDelta: seatChange });
    if (hist.seat === 0 && i === 0) changes.push({ type: 'sold' });

    runs.push({
      id: `run_${job.id}_${i}`,
      startedAt: new Date(t).toISOString(),
      status: isError ? 'error' : 'success',
      durationMs: 800 + Math.round(Math.random() * 2200),
      matchCount: isError ? 0 : (3 + Math.round(Math.random() * 4)),
      price: hist.price,
      seat: hist.seat,
      changes,
      notification: { status: isError ? 'failed' : (Math.random() > 0.6 ? 'sent' : 'skipped') },
      error: isError ? 'Session expired, please re-login' : null,
    });
  }
  return runs;
}

// Make objects globally available
Object.assign(window, {
  AIRPORTS, AIRLINES, JOBS, FEED,
  computeStats, buildRuns,
  fmtVND, fmtTime, fmtDate, fmtRel,
});
