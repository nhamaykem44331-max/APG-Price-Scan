// ============================================================
// APG Price Scan — Operations Terminal frontend
// Vanilla JS, no build step. Hashchange routing.
// ============================================================

(function () {
  'use strict';

  // ─── State ─────────────────────────────────────────
  const state = {
    jobs: [],
    health: null,
    activity: [],
    history: {},          // by jobId: { range, series, summary }
    runs: {},             // by jobId: [run, ...]
    notifications: [],
    settings: null,
    route: { view: 'dashboard', jobId: null },
    filter: 'all',        // routes board filter
    chartRange: '24h',    // job detail chart range
    refreshTimer: null,
    chartResizeObs: null,
    chartHoverIdx: null,
    apiBusy: 0,
    lastLoadAt: 0,
  };

  const REFRESH_MS = 30000;

  // ─── Tiny helpers ─────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtVND(n) {
    const num = Number(n || 0);
    return Number.isFinite(num) ? num.toLocaleString('vi-VN') : '0';
  }

  function pad2(v) { return String(v).padStart(2, '0'); }

  function fmtTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function fmtDate(value) {
    if (!value) return '—';
    const text = String(value).trim();
    let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${pad2(m[1])}/${pad2(m[2])}/${m[3]}`;
    return text;
  }

  function fmtRel(iso) {
    if (!iso) return '—';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return String(iso);
    const diff = t - Date.now();
    const future = diff > 0;
    const sec = Math.abs(Math.round(diff / 1000));
    if (sec < 60) return future ? `trong ${sec}s` : `${sec}s trước`;
    const min = Math.round(sec / 60);
    if (min < 60) return future ? `trong ${min} phút` : `${min} phút trước`;
    const hr = Math.round(min / 60);
    if (hr < 24) return future ? `trong ${hr} giờ` : `${hr} giờ trước`;
    const day = Math.round(hr / 24);
    return future ? `trong ${day} ngày` : `${day} ngày trước`;
  }

  // City names for IATA codes (compact subset; backend has full list)
  const AIRPORT_CITY = {
    HAN: 'Hà Nội', SGN: 'TP.HCM', DAD: 'Đà Nẵng', PQC: 'Phú Quốc',
    HPH: 'Hải Phòng', CXR: 'Nha Trang', HUI: 'Huế', VCA: 'Cần Thơ',
    BMV: 'Buôn Ma Thuột', DLI: 'Đà Lạt', PXU: 'Pleiku', UIH: 'Quy Nhơn',
    THD: 'Thanh Hóa', VII: 'Vinh', VDH: 'Đồng Hới', TBB: 'Tuy Hòa',
    VKG: 'Rạch Giá', VCS: 'Côn Đảo', VCL: 'Chu Lai', BKK: 'Bangkok',
    SIN: 'Singapore', KUL: 'Kuala Lumpur', ICN: 'Seoul', NRT: 'Tokyo',
  };
  function cityFor(code) { return AIRPORT_CITY[code] || ''; }

  // ─── API ──────────────────────────────────────────
  function apiKey() { return localStorage.getItem('priceScanApiKey') || ''; }
  function setApiKey(v) {
    if (v) localStorage.setItem('priceScanApiKey', v);
    else localStorage.removeItem('priceScanApiKey');
  }

  async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const key = apiKey();
    if (key) headers['X-API-Key'] = key;
    state.apiBusy += 1;
    try {
      const response = await fetch(path, { ...options, headers });
      const text = await response.text();
      const data = text ? safeJson(text) : {};
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('API key chưa đúng. Bấm 🔑 trên topbar để nhập.');
        }
        throw new Error((data && data.error) || `HTTP ${response.status}`);
      }
      return data;
    } finally {
      state.apiBusy -= 1;
    }
  }

  function safeJson(text) {
    try { return JSON.parse(text); } catch (_) { return {}; }
  }

  // ─── Icons (matching design/components.jsx Icon) ─
  function icon(name, size = 16, color = 'currentColor') {
    const sw = 1.75;
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    switch (name) {
      case 'dashboard':
        return `<svg ${common}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`;
      case 'jobs':
        return `<svg ${common}><path d="M3 7h18M3 12h18M3 17h18"/><circle cx="6" cy="7" r="1.2" fill="${color}"/><circle cx="6" cy="12" r="1.2" fill="${color}"/><circle cx="6" cy="17" r="1.2" fill="${color}"/></svg>`;
      case 'history':
        return `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
      case 'bell':
        return `<svg ${common}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;
      case 'settings':
        return `<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      case 'play': return `<svg ${common}><polygon points="6 4 20 12 6 20 6 4" fill="${color}"/></svg>`;
      case 'pause': return `<svg ${common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      case 'plus': return `<svg ${common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      case 'trash': return `<svg ${common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      case 'edit': return `<svg ${common}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      case 'search': return `<svg ${common}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      case 'arrowLeft': return `<svg ${common}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
      case 'arrowUp': return `<svg ${common}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
      case 'arrowDown': return `<svg ${common}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
      case 'refresh': return `<svg ${common}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
      case 'send': return `<svg ${common}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="${color}" fill-opacity="0.15"/></svg>`;
      case 'check': return `<svg ${common}><polyline points="20 6 9 17 4 12"/></svg>`;
      case 'x': return `<svg ${common}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      case 'eye': return `<svg ${common}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      default: return `<svg ${common}><circle cx="12" cy="12" r="3"/></svg>`;
    }
  }

  // ─── Sparkline + Ring (SVG) ───────────────────────
  function sparklineSvg(data, width = 100, height = 28) {
    if (!Array.isArray(data) || data.length < 2) {
      return `<svg width="${width}" height="${height}"></svg>`;
    }
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - ((v - min) / range) * height).toFixed(1);
      return [x, y];
    });
    const line = 'M ' + points.map(([x, y]) => `${x} ${y}`).join(' L ');
    const area = line + ` L ${width} ${height} L 0 ${height} Z`;
    const id = 'spark-' + Math.random().toString(36).slice(2, 8);
    return `<svg width="${width}" height="${height}" style="display:block;color:currentColor">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="currentColor" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
  </linearGradient></defs>
  <path d="${area}" fill="url(#${id})"/>
  <path d="${line}" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  }

  function ringSvg(percent, size = 44, stroke = 4) {
    const p = Math.max(0, Math.min(100, Number(percent || 0)));
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (p / 100) * c;
    const color = p >= 95 ? 'var(--apg-success)' : p >= 85 ? 'var(--apg-warning)' : 'var(--apg-danger)';
    return `<div class="stat-ring">
  <svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--apg-bg-surface-soft)" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" stroke-linecap="round"
      style="transition:stroke-dashoffset 0.6s ease"/>
  </svg>
  <div class="ring-text">${p.toFixed(0)}%</div>
</div>`;
  }

  // ─── Small component HTML helpers ─────────────────
  function routePillHtml(from, to, date) {
    return `<div class="route-pill">
  <span class="from">${escapeHtml(from || '—')}</span>
  <span class="line"></span>
  <span class="to">${escapeHtml(to || '—')}</span>
  ${date ? `<span class="date">· ${escapeHtml(fmtDate(date))}</span>` : ''}
</div>`;
  }

  function channelChipHtml(channel) {
    const c = (channel || 'telegram') === 'zalo' ? 'zalo' : 'telegram';
    const inner = c === 'zalo' ? 'Z' : icon('send', 13);
    return `<div class="chan-chip ${c}" title="${c}">${inner}</div>`;
  }

  function changePillHtml(change) {
    if (!change) return '';
    if (change.type === 'price') {
      const down = Number(change.delta) < 0;
      const pct = change.percent !== null && change.percent !== undefined && Number.isFinite(Number(change.percent))
        ? Math.abs(Number(change.percent)).toFixed(1) + '%'
        : '';
      return `<span class="delta-pill ${down ? 'down' : 'up'}">${down ? '↓' : '↑'} ${pct}</span>`;
    }
    if (change.type === 'seat') {
      if (change.soldOut) return `<span class="delta-pill sold">SOLD</span>`;
      const d = Number(change.seatDelta);
      const sign = Number.isFinite(d) ? (d > 0 ? '+' : '') + d : '?';
      return `<span class="delta-pill seat">ghế ${sign}</span>`;
    }
    if (change.type === 'new') return `<span class="delta-pill new">NEW</span>`;
    if (change.type === 'removed') return `<span class="delta-pill sold">REMOVED</span>`;
    return `<span class="delta-pill">${escapeHtml(change.type)}</span>`;
  }

  // ─── Route row (departure-board style) ────────────
  function routeRowHtml(job) {
    const last = Number(job.lastPrice || 0);
    const prev = Number(job.prevPrice || 0);
    const delta = last - prev;
    const pct = prev > 0 ? (delta / prev) * 100 : 0;
    const seat = Number.isFinite(Number(job.lastSeat)) ? Number(job.lastSeat) : null;
    const seatClass = seat === 0 ? 'sold' : seat !== null && seat <= 3 ? 'low' : '';
    const seatPct = seat === null ? 0 : Math.max(2, (seat / 9) * 100);
    const rowClass = !job.enabled ? 'paused' : job.lastStatus === 'error' ? 'error' : '';
    const nextMs = job.nextRunAt ? Date.parse(job.nextRunAt) - Date.now() : null;
    const imminent = nextMs != null && nextMs > 0 && nextMs < 5 * 60 * 1000;
    const intervalStr = formatInterval(job.schedule);
    const modeLabel = (job.notify && job.notify.mode === 'on_change') ? 'on change' : 'every run';
    const channel = (job.notify && job.notify.channel) || 'telegram';
    const muted = job.notify && job.notify.muted;
    const flightNum = (job.query && job.query.flightNumber) || job.lastFlight || 'ALL';

    return `<div class="route-row ${rowClass}" data-open="${escapeHtml(job.id)}" role="button" tabindex="0">
  <div class="col-name">
    <span class="status-dot"></span>
    <div class="nm">
      <div class="nm-job">${escapeHtml(job.name || job.id)}</div>
      <div class="nm-flight">${escapeHtml(flightNum)} · ${escapeHtml(intervalStr)} · ${escapeHtml(modeLabel)}</div>
    </div>
  </div>

  <div>${routePillHtml(job.query && job.query.from, job.query && job.query.to, job.query && job.query.date)}</div>

  <div class="price-cell">
    <div class="price">${last ? fmtVND(last) + ' ₫' : '—'}</div>
    <div class="price-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}">
      ${delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} ${prev ? Math.abs(pct).toFixed(1) : '0.0'}%
    </div>
  </div>

  <div class="seat-cell">
    <div class="seat-num ${seatClass}">${seat === 0 ? 'SOLD OUT' : seat !== null ? `${seat} ghế` : '—'}</div>
    <div class="seat-bar"><span class="${seatClass}" style="width:${seatPct}%"></span></div>
  </div>

  <div class="next-cell ${imminent ? 'imminent' : ''}">
    ${!job.enabled
      ? `<span class="next-time" style="color:var(--apg-text-muted)">—</span><span class="next-rel">paused</span>`
      : `<span class="next-time">${fmtTime(job.nextRunAt)}</span><span class="next-rel">${fmtRel(job.nextRunAt)}</span>`}
  </div>

  <div class="chan-cell">
    ${channelChipHtml(channel)}
    ${muted ? '<span class="badge warn">muted</span>' : ''}
    ${job.lastStatus === 'error' ? '<span class="badge danger">err</span>' : ''}
  </div>
</div>`;
  }

  function formatInterval(schedule) {
    if (!schedule) return '—';
    const unit = schedule.intervalUnit || (Number(schedule.intervalSeconds || 0) < 60 ? 'seconds' : 'minutes');
    const value = schedule.intervalValue
      || (unit === 'seconds' ? schedule.intervalSeconds : schedule.intervalMinutes)
      || 60;
    return unit === 'seconds' ? `${value}s` : `${value}m`;
  }

  // ─── Activity feed item ──────────────────────────
  function feedItemHtml(entry) {
    const kindBadge = {
      sold: '<span class="delta-pill sold">SOLD</span>',
      down: `<span class="delta-pill down">${icon('arrowDown', 10)} giá</span>`,
      up: `<span class="delta-pill up">${icon('arrowUp', 10)} giá</span>`,
      seat: '<span class="delta-pill seat">ghế</span>',
      new: '<span class="delta-pill new">NEW</span>',
      removed: '<span class="delta-pill sold">REMOVED</span>',
      error: '<span class="badge danger">error</span>',
      scan: '<span class="badge success">scan</span>',
    }[entry.kind] || `<span class="badge">${escapeHtml(entry.kind || '?')}</span>`;

    return `<div class="feed-item" data-open="${escapeHtml(entry.jobId || '')}" role="button" tabindex="0">
  <div class="feed-time">${fmtRel(entry.t)}</div>
  <div class="feed-body">
    <div class="feed-title">${kindBadge}<b>${escapeHtml(entry.title || entry.jobName || '?')}</b></div>
    <div class="feed-desc">${escapeHtml(entry.detail || '')}</div>
  </div>
</div>`;
  }

  // ─── Toast ────────────────────────────────────────
  const TOAST_DURATIONS = { error: 6000, success: 2200, info: 3600 };
  function toast(message, type = 'info') {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast-${type}`;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.hidden = true; }, TOAST_DURATIONS[type] || TOAST_DURATIONS.info);
  }

  // ─── Theme ────────────────────────────────────────
  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-apg-theme', 'dark');
    else document.documentElement.removeAttribute('data-apg-theme');
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-apg-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('priceScanTheme', next);
    toast(next === 'dark' ? 'Dark mode' : 'Light mode', 'info');
  }
  function initTheme() {
    const saved = localStorage.getItem('priceScanTheme');
    if (saved === 'dark' || saved === 'light') applyTheme(saved);
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme('dark');
  }

  // ─── API key dialog (simple prompt fallback) ─────
  function openApiKeyDialog() {
    const cur = apiKey();
    const next = window.prompt(
      'Nhập BACKEND_API_KEY (lưu trong localStorage). Để trống → xóa key đã lưu.',
      cur
    );
    if (next === null) return; // cancel
    setApiKey(next.trim());
    toast(next.trim() ? 'Đã lưu API key' : 'Đã xóa API key', 'success');
    refreshAll();
  }

  // ─── Routing ──────────────────────────────────────
  function parseHash() {
    const hash = location.hash || '#/';
    if (hash === '' || hash === '#' || hash === '#/') return { view: 'dashboard', jobId: null };
    const detail = hash.match(/^#\/jobs\/(.+)$/);
    if (detail) return { view: 'detail', jobId: decodeURIComponent(detail[1]) };
    if (hash === '#/jobs') return { view: 'jobs', jobId: null };
    if (hash === '#/history') return { view: 'history', jobId: null };
    if (hash === '#/notifications') return { view: 'notifications', jobId: null };
    if (hash === '#/settings') return { view: 'settings', jobId: null };
    return { view: 'dashboard', jobId: null };
  }

  function navigate(hash) {
    if (location.hash === hash) handleRoute().catch(handleFatal);
    else location.hash = hash;
  }

  function updateActiveNav(view) {
    $$('.nav-item').forEach((btn) => {
      const r = btn.dataset.route;
      const active = r === view || (r === 'jobs' && view === 'detail');
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    $$('.mobile-tabbar .tab').forEach((btn) => {
      const r = btn.dataset.route;
      const active = r === view || (r === 'jobs' && view === 'detail');
      btn.classList.toggle('active', active);
    });
  }

  async function handleRoute() {
    state.route = parseHash();
    updateActiveNav(state.route.view);
    teardownChart();
    await loadDataForRoute().catch((err) => {
      toast(err.message || String(err), 'error');
    });
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Data loaders ─────────────────────────────────
  async function loadHealth() {
    try {
      const data = await apiFetch('/health/extended');
      state.health = data;
    } catch (err) {
      try {
        const basic = await apiFetch('/health');
        state.health = basic;
      } catch (_) { state.health = { ok: false }; }
      if (!state.health.ok) throw err;
    }
    updateHealthChip(state.health);
    updateNavCounts();
  }

  async function loadJobs() {
    const data = await apiFetch('/scan-jobs');
    state.jobs = data.jobs || [];
    updateNavCounts();
  }

  async function loadActivity() {
    try {
      const data = await apiFetch('/activity?limit=50');
      state.activity = data.activity || [];
    } catch (_) { state.activity = []; }
  }

  async function loadJobHistory(jobId, range) {
    const r = range || state.chartRange || '24h';
    const data = await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}/history?range=${encodeURIComponent(r)}`);
    state.history[jobId] = { range: r, series: data.series || [], summary: data.summary || {}, bucket: data.bucket };
    return state.history[jobId];
  }

  async function loadJobRuns(jobId) {
    const data = await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}/runs?limit=50`);
    state.runs[jobId] = data.runs || [];
    return state.runs[jobId];
  }

  async function loadNotifications() {
    try {
      const data = await apiFetch('/scan-notifications?limit=50');
      state.notifications = data.notifications || [];
    } catch (_) { state.notifications = []; }
    updateNavCounts();
  }

  async function loadSettings() {
    try {
      const data = await apiFetch('/scan-settings');
      state.settings = (data && data.settings) || null;
    } catch (_) { state.settings = null; }
  }

  async function loadDataForRoute() {
    const v = state.route.view;
    if (v === 'dashboard' || v === 'jobs') {
      await Promise.all([loadHealth(), loadJobs(), loadActivity()]);
    } else if (v === 'detail' && state.route.jobId) {
      await Promise.all([
        loadHealth(),
        loadJobs(),
        loadJobHistory(state.route.jobId, state.chartRange).catch(() => {}),
        loadJobRuns(state.route.jobId).catch(() => {}),
      ]);
    } else if (v === 'history') {
      await Promise.all([loadHealth(), loadJobs(), loadActivity()]);
    } else if (v === 'notifications') {
      await Promise.all([loadHealth(), loadJobs(), loadNotifications()]);
    } else if (v === 'settings') {
      await Promise.all([loadHealth(), loadSettings()]);
    }
    state.lastLoadAt = Date.now();
  }

  async function refreshAll() {
    try { await loadDataForRoute(); renderCurrentView(); }
    catch (err) { toast(err.message || String(err), 'error'); }
  }

  function updateHealthChip(health) {
    const chip = $('healthChip');
    const label = $('healthLabel');
    if (!chip || !label) return;
    const scanner = health && health.scanner;
    const ok = !!(health && (health.ok || scanner));
    chip.classList.toggle('error', !ok);
    if (!ok) { label.textContent = 'offline'; return; }
    if (scanner && scanner.telegramConfigured === false && scanner.zaloConfigured === false) {
      label.textContent = 'no notify';
      chip.classList.add('error');
    } else {
      label.textContent = 'online';
    }
  }

  function updateNavCounts() {
    const cnt = $('navJobCount');
    if (cnt) cnt.textContent = state.jobs.length;
    const notif = $('navNotifyCount');
    if (notif) {
      const failed = state.notifications.filter((n) => n.status === 'failed').length;
      if (failed > 0) { notif.textContent = String(failed); notif.hidden = false; }
      else { notif.hidden = true; }
    }
  }

  // ─── Render: dispatch ─────────────────────────────
  function renderCurrentView() {
    const root = $('root');
    if (!root) return;
    root.setAttribute('aria-busy', 'false');
    const v = state.route.view;
    try {
      if (v === 'detail' && state.route.jobId) renderJobDetail(state.route.jobId);
      else if (v === 'history') renderHistoryView();
      else if (v === 'notifications') renderNotificationsView();
      else if (v === 'settings') renderSettingsView();
      else renderDashboard();
    } catch (err) {
      console.error('[render]', err);
      root.innerHTML = `<div class="empty"><p><strong>Render error</strong></p><p>${escapeHtml(err.message || String(err))}</p></div>`;
    }
  }

  // ─── Dashboard view ───────────────────────────────
  function renderDashboard() {
    const root = $('root');
    root.classList.add('page', 'fade-in');
    const scanner = (state.health && state.health.scanner) || {};
    const jobs = state.jobs || [];
    const total = jobs.length;
    const enabled = jobs.filter((j) => j.enabled).length;
    const paused = total - enabled;
    const enabledPct = total ? Math.round((enabled / total) * 100) : 0;
    const totalScans = scanner.totalScans24h || 0;
    const deltaPct = scanner.totalScansDeltaPct;
    const successRate = (scanner.notifyStats24h && scanner.notifyStats24h.successRate) ?? 100;
    const failures24 = scanner.notificationFailures24h || 0;
    const retried = (scanner.notifyStats24h && scanner.notifyStats24h.retried) || 0;
    const nextJob = jobs
      .filter((j) => j.enabled && j.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))[0];
    const scansByHour = Array.isArray(scanner.scansByHour) && scanner.scansByHour.length
      ? scanner.scansByHour
      : new Array(24).fill(0);
    const filter = state.filter;
    const visibleJobs = filterJobs(jobs, filter);

    const deltaHtml = (deltaPct !== undefined && deltaPct !== null && Number.isFinite(Number(deltaPct)))
      ? `<span class="stat-delta ${deltaPct < 0 ? 'down' : deltaPct > 0 ? 'up' : ''}">${deltaPct < 0 ? '↓' : deltaPct > 0 ? '↑' : '·'} ${Math.abs(deltaPct).toFixed(1)}%</span>`
      : '';

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <div class="crumb">
            <span class="eyebrow">Operations</span>
            <span class="sep">·</span>
            <span>Real-time scan dashboard</span>
          </div>
          <h1>Tổng quan quét giá</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost btn-sm" type="button" id="autoRefreshChip">${icon('refresh', 14)} <span>Auto-refresh 30s</span></button>
          <button class="btn btn-sm" type="button" id="testNotifyBtn">${icon('bell', 14)} Test notify</button>
          <button class="btn btn-primary" type="button" id="newJobBtn">${icon('plus', 14)} Job mới</button>
        </div>
      </div>

      <div class="stats-grid">
        <!-- Tổng job -->
        <div class="stat-card" style="--accent:var(--apg-aviation-navy);--accent-soft:var(--apg-aviation-navy-soft);">
          <div class="stat-head">
            <span class="stat-label">Tổng job</span>
            <span class="stat-icon">${icon('jobs', 13)}</span>
          </div>
          <div class="stat-value">
            <span class="stat-num">${total}</span>
            <span class="stat-unit">job</span>
          </div>
          <div class="stat-bar"><span style="width:${enabledPct}%"></span></div>
          <div class="stat-foot">
            <span class="stat-sub"><b style="color:var(--apg-success)">${enabled} active</b> · ${paused} paused</span>
          </div>
        </div>

        <!-- Scans 24h -->
        <div class="stat-card" style="--accent:var(--apg-success);--accent-soft:var(--apg-success-soft);">
          <div class="stat-head">
            <span class="stat-label">Lượt quét / 24h</span>
            <span class="stat-icon">${icon('refresh', 13)}</span>
          </div>
          <div class="stat-value">
            <span class="stat-num">${totalScans}</span>
            ${deltaHtml}
          </div>
          <div class="stat-foot">
            <span class="stat-sub">Trung bình ${Math.round(totalScans / 24)}/giờ</span>
            <div class="stat-spark" style="color:var(--apg-success)">${sparklineSvg(scansByHour, 86, 26)}</div>
          </div>
        </div>

        <!-- Next run -->
        <div class="stat-card" style="--accent:var(--apg-brand-gold);--accent-soft:var(--apg-brand-gold-soft);">
          <div class="stat-head">
            <span class="stat-label">Quét kế tiếp</span>
            <span class="stat-icon">${icon('history', 13)}</span>
          </div>
          <div class="stat-value">
            <span class="stat-num mono" style="font-size:24px">${nextJob ? fmtRel(nextJob.nextRunAt) : '—'}</span>
          </div>
          <div class="stat-foot">
            <span class="stat-sub">${nextJob
              ? `<b>${escapeHtml((nextJob.query && nextJob.query.flightNumber) || nextJob.lastFlight || 'ALL')}</b> · ${escapeHtml((nextJob.query && nextJob.query.from) || '?')}→${escapeHtml((nextJob.query && nextJob.query.to) || '?')}`
              : 'không có job active'}</span>
          </div>
        </div>

        <!-- Notify health -->
        <div class="stat-card" style="--accent:var(--apg-info);--accent-soft:var(--apg-info-soft);">
          <div class="stat-head">
            <span class="stat-label">Notify health</span>
            <span class="stat-icon">${icon('bell', 13)}</span>
          </div>
          <div class="stat-value">
            <span class="stat-num">${Number(successRate).toFixed(1)}<span style="font-size:18px;font-weight:500">%</span></span>
          </div>
          <div class="stat-foot">
            <span class="stat-sub"><b style="color:var(--apg-danger)">${failures24} fail</b> trong 24h · ${retried} retry</span>
            ${ringSvg(successRate)}
          </div>
        </div>
      </div>

      <div class="dashboard-cols">
        <div class="panel">
          <div class="panel-head">
            <h3><span class="live-dot"></span>Active routes board</h3>
            <div class="tab-row">
              <button class="tab ${filter === 'all' ? 'active' : ''}" data-filter="all" type="button">Tất cả</button>
              <button class="tab ${filter === 'enabled' ? 'active' : ''}" data-filter="enabled" type="button">Active</button>
              <button class="tab ${filter === 'low' ? 'active' : ''}" data-filter="low" type="button">Sắp hết ghế</button>
              <button class="tab ${filter === 'paused' ? 'active' : ''}" data-filter="paused" type="button">Paused</button>
            </div>
          </div>
          <div class="routes-board">
            <div class="board-head desktop-only">
              <div>Job · Flight</div>
              <div>Tuyến · Ngày bay</div>
              <div style="text-align:right">Giá hiện tại</div>
              <div>Số ghế</div>
              <div>Quét kế tiếp</div>
              <div style="text-align:right">Kênh</div>
            </div>
            ${visibleJobs.length === 0
              ? `<div class="empty">${jobs.length === 0 ? 'Chưa có job nào. Bấm "Job mới" để tạo.' : 'Không có job khớp filter này.'}</div>`
              : visibleJobs.map(routeRowHtml).join('')}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h3><span class="live-dot"></span>Live activity</h3>
            <div class="panel-tools"><span class="eyebrow">${state.activity.length} events</span></div>
          </div>
          <div class="scroll-area">
            <div class="feed">
              ${state.activity.length === 0
                ? '<div class="empty">Chưa có activity. Đợi job tiếp theo chạy hoặc bấm Run now ở Job Detail.</div>'
                : state.activity.slice(0, 30).map(feedItemHtml).join('')}
            </div>
          </div>
        </div>
      </div>

      <style>
        .dashboard-cols { display:grid; grid-template-columns: minmax(0, 1fr) 360px; gap: var(--gap-lg); align-items: start; }
        @media (max-width: 980px) { .dashboard-cols { grid-template-columns: 1fr; } }
      </style>
    `;

    bindDashboardEvents();
  }

  function filterJobs(jobs, filter) {
    if (filter === 'enabled') return jobs.filter((j) => j.enabled);
    if (filter === 'paused') return jobs.filter((j) => !j.enabled);
    if (filter === 'low') return jobs.filter((j) => Number(j.lastSeat) !== null && Number(j.lastSeat) <= 4);
    return jobs;
  }

  function bindDashboardEvents() {
    $$('#root .route-row[data-open]').forEach((el) => {
      el.addEventListener('click', () => navigate(`#/jobs/${encodeURIComponent(el.dataset.open)}`));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`#/jobs/${encodeURIComponent(el.dataset.open)}`); }
      });
    });
    $$('#root .feed-item[data-open]').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.open) navigate(`#/jobs/${encodeURIComponent(el.dataset.open)}`);
      });
    });
    $$('#root .tab-row .tab[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { state.filter = btn.dataset.filter; renderDashboard(); });
    });
    const newJob = $('newJobBtn');
    if (newJob) newJob.addEventListener('click', openCreateJobModal);
    const testNotify = $('testNotifyBtn');
    if (testNotify) testNotify.addEventListener('click', testNotify_handler);
    const autoChip = $('autoRefreshChip');
    if (autoChip) autoChip.addEventListener('click', refreshAll);
  }

  // ─── Job Detail view ──────────────────────────────
  function renderJobDetail(jobId) {
    const root = $('root');
    root.classList.add('page', 'fade-in');
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) {
      root.innerHTML = `<div class="empty">
        <p><strong>Không tìm thấy job ${escapeHtml(jobId)}.</strong></p>
        <p><a class="btn btn-ghost btn-sm" href="#/">← Quay lại Dashboard</a></p>
      </div>`;
      return;
    }
    const history = (state.history[jobId] && state.history[jobId].series) || [];
    const summary = (state.history[jobId] && state.history[jobId].summary) || {};
    const range = (state.history[jobId] && state.history[jobId].range) || state.chartRange || '24h';
    const runs = state.runs[jobId] || [];
    const q = job.query || {};
    const notify = job.notify || {};
    const schedule = job.schedule || {};
    const channel = notify.channel === 'zalo' ? 'zalo' : 'telegram';

    const minP = summary.min ?? null;
    const maxP = summary.max ?? null;
    const avgP = summary.avg ?? null;
    const lastP = summary.last ?? job.lastPrice;
    const trendPct = summary.trendPct ?? null;
    const trendUp = (trendPct ?? 0) >= 0;

    const scanner = (state.health && state.health.scanner) || {};
    const tgReady = scanner.telegramConfigured;
    const zReady = scanner.zaloConfigured;

    root.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <div class="crumb">
            <a data-nav="#/" style="cursor:pointer">${icon('arrowLeft', 12)} Dashboard</a>
            <span class="sep">/</span>
            <span>Job detail</span>
          </div>
          <h1>${escapeHtml(job.name || jobId)}</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm" type="button" id="runNowBtn">${icon('play', 12)} Run now</button>
          <button class="btn btn-ghost btn-sm" type="button" id="testNotifyDetailBtn" title="Test notify">${icon('bell', 14)}</button>
          <button class="btn btn-ghost btn-sm" type="button" id="deleteJobBtn" style="color:var(--apg-danger)" title="Xóa job">${icon('trash', 14)}</button>
        </div>
      </div>

      <div class="detail-hero">
        <div class="hero-route">
          <div class="hero-airport">
            <span class="iata">${escapeHtml(q.from || '???')}</span>
            <span class="city">${escapeHtml(cityFor(q.from))}</span>
          </div>
          <div class="route-line"><span class="plane">✈</span></div>
          <div class="hero-airport">
            <span class="iata">${escapeHtml(q.to || '???')}</span>
            <span class="city">${escapeHtml(cityFor(q.to))}</span>
          </div>
        </div>
        <div class="hero-meta">
          <div class="hero-meta-row">
            <div class="hero-meta-item">
              <span class="label">Chuyến</span>
              <span class="value">${escapeHtml(q.flightNumber || job.lastFlight || 'ALL')}</span>
            </div>
            <div class="hero-meta-item">
              <span class="label">Ngày bay</span>
              <span class="value">${escapeHtml(fmtDate(q.date))}</span>
            </div>
            <div class="hero-meta-item">
              <span class="label">Khung giờ</span>
              <span class="value">${escapeHtml(q.departureTimeStart || '--:--')}–${escapeHtml(q.departureTimeEnd || '--:--')}</span>
            </div>
            <div class="hero-meta-item">
              <span class="label">Quét mỗi</span>
              <span class="value">${escapeHtml(formatInterval(schedule))}</span>
            </div>
            <div class="toggle-pill ${job.enabled ? '' : 'off'}" data-toggle-enabled="${escapeHtml(jobId)}" role="button" tabindex="0">${job.enabled ? 'Active' : 'Paused'}</div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div style="display:flex;flex-direction:column;gap:var(--gap-lg)">
          <div class="panel chart-panel">
            <div class="panel-head">
              <h3>Giá vé · Số ghế</h3>
              <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
                <div style="display:flex;gap:18px;align-items:center">
                  ${summaryItem('Min', minP !== null ? fmtVND(minP) : '—', 'var(--apg-success)')}
                  ${summaryItem('Avg', avgP !== null ? fmtVND(avgP) : '—')}
                  ${summaryItem('Max', maxP !== null ? fmtVND(maxP) : '—', 'var(--apg-danger)')}
                  ${summaryItem('Trend', trendPct !== null ? `${trendUp ? '+' : ''}${Number(trendPct).toFixed(1)}%` : '—', trendPct !== null ? (trendUp ? 'var(--apg-danger)' : 'var(--apg-success)') : '')}
                </div>
                <div class="tab-row">
                  ${['1h', '24h', '7d', 'all'].map((r) => `<button type="button" class="tab ${range === r ? 'active' : ''}" data-range="${r}">${r}</button>`).join('')}
                </div>
              </div>
            </div>
            <div id="chartHost" class="chart-container">${history.length < 2
              ? '<div class="empty">Chưa đủ dữ liệu (cần ≥ 2 run thành công).</div>'
              : ''}</div>
            <div class="chart-legend">
              <div class="item"><span class="swatch" style="background:var(--apg-aviation-navy)"></span>Giá (VND)</div>
              <div class="item"><span class="swatch" style="background:var(--apg-brand-gold);border-top:1px dashed var(--apg-brand-gold)"></span>Số ghế khả dụng</div>
              <div class="item" style="margin-left:auto">
                <span class="muted">${history.length} điểm dữ liệu · cập nhật ${history.length ? fmtRel(history[history.length - 1].t) : '—'}</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <h3>Lịch sử lần quét</h3>
              <div class="panel-tools">
                <button type="button" class="btn btn-ghost btn-sm" id="reloadRunsBtn">${icon('refresh', 12)}</button>
                <span class="eyebrow">retention: ${scanner.retentionDays || 3} ngày</span>
              </div>
            </div>
            <div class="runs-table">
              <div class="row head">
                <div>Thời gian</div>
                <div>Trạng thái</div>
                <div>Giá / chỗ</div>
                <div>Thay đổi · Notify</div>
              </div>
              ${runs.length === 0
                ? '<div class="empty">Chưa có run nào. Bấm "Run now" để chạy thử.</div>'
                : runs.slice(0, 8).map(runRowHtml).join('')}
            </div>
          </div>
        </div>

        <div class="panel settings-card" id="settingsCard">
          <div class="panel-head">
            <h3>Cấu hình job</h3>
            <button type="button" class="btn btn-ghost btn-sm" id="applyJobBtn">${icon('check', 12)} Lưu</button>
          </div>

          <div class="settings-section">
            <h4>Lịch quét</h4>
            <div class="field-row-2">
              <div class="field-row">
                <label>Mỗi</label>
                <input type="number" min="1" id="intervalValue" value="${schedule.intervalValue || 60}">
              </div>
              <div class="field-row">
                <label>Đơn vị</label>
                <select id="intervalUnit">
                  <option value="minutes" ${schedule.intervalUnit !== 'seconds' ? 'selected' : ''}>Phút</option>
                  <option value="seconds" ${schedule.intervalUnit === 'seconds' ? 'selected' : ''}>Giây</option>
                </select>
              </div>
            </div>
            <div class="switch-row">
              <div class="label-block">
                <span class="name">Lập lịch tự động</span>
                <span class="desc">Khi tắt, job vẫn lưu nhưng không chạy</span>
              </div>
              <div class="switch ${job.enabled ? 'on' : ''}" data-toggle-enabled="${escapeHtml(jobId)}" role="switch" aria-checked="${job.enabled}" tabindex="0"></div>
            </div>
          </div>

          <div class="settings-section">
            <h4>Thông báo</h4>
            <div class="channel-selector">
              <button type="button" class="channel-card telegram ${channel === 'telegram' ? 'active' : ''}" data-channel="telegram">
                <div class="ch-row"><div class="ch-logo">${icon('send', 13, '#fff')}</div><span class="ch-name">Telegram</span></div>
                <span class="ch-status ${tgReady ? 'ready' : 'missing'}">● ${tgReady ? 'ready' : 'thiếu config'}</span>
              </button>
              <button type="button" class="channel-card zalo ${channel === 'zalo' ? 'active' : ''}" data-channel="zalo">
                <div class="ch-row"><div class="ch-logo"><b style="font-size:12px;font-family:Inter">Z</b></div><span class="ch-name">Zalo (n8n)</span></div>
                <span class="ch-status ${zReady ? 'ready' : 'missing'}">● ${zReady ? 'ready' : 'thiếu config'}</span>
              </button>
            </div>

            <div class="field-row">
              <label>Khi nào gửi</label>
              <div class="seg">
                <button type="button" data-mode="every_run" class="${notify.mode !== 'on_change' ? 'active' : ''}">Mọi lần quét</button>
                <button type="button" data-mode="on_change" class="${notify.mode === 'on_change' ? 'active' : ''}">Chỉ khi đổi</button>
              </div>
            </div>

            <div class="switch-row">
              <div class="label-block">
                <span class="name">Mute</span>
                <span class="desc">Vẫn quét + lưu, không gửi báo</span>
              </div>
              <div class="switch ${notify.muted ? 'on' : ''}" id="muteSwitch" role="switch" aria-checked="${notify.muted}" tabindex="0"></div>
            </div>

            <button type="button" class="btn btn-sm" style="width:100%;justify-content:center" id="testNotifyDetailBtn2">${icon('send', 12)} Gửi thông báo test</button>
          </div>

          <div class="settings-section">
            <h4>Truy vấn</h4>
            <div class="field-row-2">
              <div class="field-row"><label>From</label><input maxlength="3" id="fieldFrom" value="${escapeHtml(q.from || '')}"></div>
              <div class="field-row"><label>To</label><input maxlength="3" id="fieldTo" value="${escapeHtml(q.to || '')}"></div>
            </div>
            <div class="field-row"><label>Ngày bay</label><input type="date" id="fieldDate" value="${isoDateValue(q.date)}"></div>
            <div class="field-row"><label>Số hiệu chuyến</label><input id="fieldFlight" value="${escapeHtml(q.flightNumber || '')}"></div>
            <div class="field-row-2">
              <div class="field-row"><label>Time from</label><input type="time" id="fieldTimeFrom" value="${escapeHtml(q.departureTimeStart || '')}"></div>
              <div class="field-row"><label>Time to</label><input type="time" id="fieldTimeTo" value="${escapeHtml(q.departureTimeEnd || '')}"></div>
            </div>
            <div class="switch-row">
              <div class="label-block">
                <span class="name">Chỉ chuyến thẳng</span>
                <span class="desc">Loại multi-leg</span>
              </div>
              <div class="switch ${q.directOnly ? 'on' : ''}" id="directSwitch" role="switch" aria-checked="${!!q.directOnly}" tabindex="0"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindJobDetailEvents(job);

    if (history.length >= 2) {
      renderPriceChartInto($('chartHost'), history);
    }
  }

  function summaryItem(label, value, color) {
    return `<div style="display:flex;flex-direction:column;gap:1px">
      <span class="eyebrow" style="font-size:9px">${escapeHtml(label)}</span>
      <span class="mono tabular" style="font-size:12px;font-weight:700;${color ? `color:${color}` : ''}">${value}</span>
    </div>`;
  }

  function isoDateValue(value) {
    if (!value) return '';
    const t = String(value).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    return '';
  }

  function runRowHtml(run) {
    const status = run.status || 'unknown';
    const flights = Array.isArray(run.results) ? run.results : [];
    const firstFlight = flights[0];
    const price = firstFlight ? Number(firstFlight.totalAmount) : null;
    const seat = firstFlight && firstFlight.seatAvailable !== undefined ? Number(firstFlight.seatAvailable) : null;
    const notif = run.notification && run.notification.status;
    const changes = (run.comparison && Array.isArray(run.comparison.changes)) ? run.comparison.changes.slice(0, 4) : [];
    const isOk = status === 'success';
    return `<div class="row">
  <div class="when">${fmtTime(run.startedAt)} · ${fmtRel(run.startedAt)}</div>
  <div>${isOk ? '<span class="badge success">success</span>' : '<span class="badge danger">error</span>'}</div>
  <div>
    ${isOk
      ? `<span class="price-cell-inline">${price ? fmtVND(price) + ' ₫' : '—'}</span>
         <span class="muted" style="margin-left:8px">${run.matchCount || 0} chuyến · ${seat === null ? '—' : seat + ' ghế'}</span>`
      : `<span style="color:var(--apg-danger);font-size:12px">${escapeHtml(run.error || 'Unknown error')}</span>`}
  </div>
  <div class="changes-cell">
    ${changes.map(changePillHtml).join('')}
    ${isOk && changes.length === 0 ? '<span class="muted">không đổi</span>' : ''}
    ${notif ? `<span class="badge ${notif === 'sent' ? 'info' : notif === 'failed' ? 'danger' : ''}" style="margin-left:auto">${escapeHtml(notif)}</span>` : ''}
  </div>
</div>`;
  }

  function bindJobDetailEvents(job) {
    const jobId = job.id;

    // Breadcrumb back: handled by [data-nav] delegation in bindStaticEvents.

    // Toggle enabled (pill + switch in settings)
    $$(`[data-toggle-enabled="${cssEscape(jobId)}"]`).forEach((el) => {
      el.addEventListener('click', () => toggleEnabled(jobId, !job.enabled));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEnabled(jobId, !job.enabled); }
      });
    });

    // Range tabs
    $$('#root .tab[data-range]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.chartRange = btn.dataset.range;
        try { await loadJobHistory(jobId, state.chartRange); renderJobDetail(jobId); }
        catch (err) { toast(err.message, 'error'); }
      });
    });

    // Run now
    const runBtn = $('runNowBtn');
    if (runBtn) runBtn.addEventListener('click', () => runJobNow(jobId, runBtn));

    // Delete
    const delBtn = $('deleteJobBtn');
    if (delBtn) delBtn.addEventListener('click', () => deleteJobConfirm(jobId, job.name));

    // Test notify
    ['testNotifyDetailBtn', 'testNotifyDetailBtn2'].forEach((id) => {
      const b = $(id);
      if (b) b.addEventListener('click', () => testNotifyForJob(jobId, b));
    });

    // Reload runs
    const reloadRuns = $('reloadRunsBtn');
    if (reloadRuns) reloadRuns.addEventListener('click', async () => {
      try { await loadJobRuns(jobId); renderJobDetail(jobId); } catch (e) { toast(e.message, 'error'); }
    });

    // Channel cards
    $$('#root .channel-card[data-channel]').forEach((card) => {
      card.addEventListener('click', () => patchJob(jobId, { notify: { channel: card.dataset.channel } }));
    });

    // Mode segmented
    $$('#root .seg button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => patchJob(jobId, { notify: { mode: btn.dataset.mode } }));
    });

    // Mute switch
    const mute = $('muteSwitch');
    if (mute) mute.addEventListener('click', () => patchJob(jobId, { notify: { muted: !(job.notify && job.notify.muted) } }));

    // Direct switch
    const direct = $('directSwitch');
    if (direct) direct.addEventListener('click', () => patchJob(jobId, { query: { directOnly: !(job.query && job.query.directOnly) } }));

    // Apply settings (save form fields)
    const applyBtn = $('applyJobBtn');
    if (applyBtn) applyBtn.addEventListener('click', () => applyJobFormChanges(jobId));
  }

  function cssEscape(value) {
    return String(value).replace(/(["\\])/g, '\\$1');
  }

  // ─── Job actions ─────────────────────────────────
  async function toggleEnabled(jobId, enabled) {
    try {
      await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      toast(enabled ? 'Đã bật scheduler' : 'Đã tạm dừng job', 'success');
      await loadJobs();
      renderCurrentView();
    } catch (err) {
      toast(err.message || 'Patch fail', 'error');
    }
  }

  async function patchJob(jobId, patch) {
    try {
      await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      toast('Đã lưu', 'success');
      await loadJobs();
      renderCurrentView();
    } catch (err) {
      toast(err.message || 'Patch fail', 'error');
    }
  }

  async function runJobNow(jobId, button) {
    if (button) { button.disabled = true; button.classList.add('busy'); }
    toast('Scan started…', 'info');
    try {
      const data = await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}/run-now`, { method: 'POST', body: '{}' });
      const run = data && data.run;
      if (run && run.status === 'success') toast(`Scan xong: ${run.matchCount || 0} chuyến`, 'success');
      else toast(`Scan error: ${run && run.error ? run.error : 'unknown'}`, 'error');
      await Promise.all([loadJobs(), loadJobRuns(jobId), loadJobHistory(jobId, state.chartRange)]).catch(() => {});
      renderCurrentView();
    } catch (err) {
      toast(err.message || 'Run fail', 'error');
    } finally {
      if (button) { button.disabled = false; button.classList.remove('busy'); }
    }
  }

  async function deleteJobConfirm(jobId, name) {
    if (!window.confirm(`Xóa job "${name || jobId}"? Hành động không hoàn tác.`)) return;
    try {
      await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      toast('Đã xóa job', 'success');
      navigate('#/');
    } catch (err) {
      toast(err.message || 'Delete fail', 'error');
    }
  }

  async function applyJobFormChanges(jobId) {
    const interval = Number($('intervalValue').value);
    const unit = $('intervalUnit').value;
    const from = String($('fieldFrom').value || '').toUpperCase().trim();
    const to = String($('fieldTo').value || '').toUpperCase().trim();
    const date = $('fieldDate').value;
    const flightNumber = String($('fieldFlight').value || '').toUpperCase().trim();
    const departureTimeStart = $('fieldTimeFrom').value;
    const departureTimeTo = $('fieldTimeTo').value;
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      toast('From / To phải là mã IATA 3 chữ', 'error');
      return;
    }
    if (!Number.isFinite(interval) || interval <= 0) {
      toast('Interval phải > 0', 'error');
      return;
    }
    try {
      await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          schedule: { intervalValue: interval, intervalUnit: unit },
          query: {
            from, to, date, flightNumber,
            departureTimeStart, departureTimeEnd: departureTimeTo,
          },
        }),
      });
      toast('Đã lưu cấu hình', 'success');
      await loadJobs();
      renderCurrentView();
    } catch (err) {
      toast(err.message || 'Save fail', 'error');
    }
  }

  // ─── Test notify (from any context) ──────────────
  async function testNotify_handler() {
    const text = `Price Scan test ${new Date().toISOString()}`;
    try {
      await apiFetch('/notifications/test', { method: 'POST', body: JSON.stringify({ text }) });
      toast('Đã gửi notify test', 'success');
    } catch (err) {
      // Fallback to telegram endpoint
      try {
        await apiFetch('/notifications/telegram/test', { method: 'POST', body: JSON.stringify({ text }) });
        toast('Đã gửi Telegram test', 'success');
      } catch (e2) {
        toast(e2.message || 'Test notify fail', 'error');
      }
    }
  }

  async function testNotifyForJob(jobId, button) {
    if (button) { button.disabled = true; button.classList.add('busy'); }
    try {
      const text = `Price Scan test from job ${jobId} at ${new Date().toISOString()}`;
      const job = state.jobs.find((j) => j.id === jobId);
      const channel = (job && job.notify && job.notify.channel) === 'zalo' ? 'zalo' : 'telegram';
      try {
        await apiFetch(`/notifications/${channel}/test`, { method: 'POST', body: JSON.stringify({ text }) });
        toast(`Đã gửi ${channel} test`, 'success');
      } catch (err) {
        toast(err.message || 'Test fail', 'error');
      }
    } finally {
      if (button) { button.disabled = false; button.classList.remove('busy'); }
    }
  }

  // ─── Create job modal ────────────────────────────
  function openCreateJobModal() {
    const tomorrow = new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card panel">
        <div class="panel-head">
          <h3>Tạo Scan Job mới</h3>
          <button class="icon-btn" type="button" id="modalClose">${icon('x', 16)}</button>
        </div>
        <form class="settings-section" id="newJobForm" style="display:flex;flex-direction:column;gap:14px">
          <div class="field-row"><label>Tên job</label><input id="njName" required placeholder="VJ125 HAN-SGN sáng"></div>
          <div class="field-row-2">
            <div class="field-row"><label>From</label><input id="njFrom" required maxlength="3" value="HAN"></div>
            <div class="field-row"><label>To</label><input id="njTo" required maxlength="3" value="SGN"></div>
          </div>
          <div class="field-row-2">
            <div class="field-row"><label>Ngày bay</label><input id="njDate" type="date" required value="${tomorrow}"></div>
            <div class="field-row"><label>Số hiệu chuyến (optional)</label><input id="njFlight" placeholder="VJ125"></div>
          </div>
          <div class="field-row-2">
            <div class="field-row"><label>Interval</label><input id="njInterval" type="number" min="1" value="30"></div>
            <div class="field-row"><label>Đơn vị</label><select id="njUnit"><option value="minutes" selected>Phút</option><option value="seconds">Giây</option></select></div>
          </div>
          <div class="field-row">
            <label>Kênh báo</label>
            <div class="seg">
              <button type="button" data-nj-channel="telegram" class="active">Telegram</button>
              <button type="button" data-nj-channel="zalo">Zalo</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="button" class="btn" id="modalCancel">Hủy</button>
            <button type="submit" class="btn btn-primary">${icon('check', 14)} Tạo job</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    let channel = 'telegram';
    modal.querySelectorAll('[data-nj-channel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        channel = btn.dataset.njChannel;
        modal.querySelectorAll('[data-nj-channel]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const close = () => modal.remove();
    modal.querySelector('#modalClose').addEventListener('click', close);
    modal.querySelector('#modalCancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#newJobForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: $('njName').value.trim() || `${$('njFlight').value || 'ALL'} ${$('njFrom').value}-${$('njTo').value}`,
        enabled: true,
        query: {
          from: $('njFrom').value.toUpperCase(),
          to: $('njTo').value.toUpperCase(),
          date: $('njDate').value,
          flightNumber: $('njFlight').value.toUpperCase(),
          directOnly: true,
          adt: 1,
        },
        schedule: { intervalValue: Number($('njInterval').value || 30), intervalUnit: $('njUnit').value },
        notify: { telegramEnabled: true, channel, mode: 'on_change', notifyOnError: true, muted: false },
      };
      try {
        const data = await apiFetch('/scan-jobs', { method: 'POST', body: JSON.stringify(payload) });
        toast('Đã tạo job', 'success');
        close();
        await loadJobs();
        if (data && data.job && data.job.id) navigate(`#/jobs/${encodeURIComponent(data.job.id)}`);
        else renderDashboard();
      } catch (err) {
        toast(err.message || 'Create fail', 'error');
      }
    });
  }

  // Inject modal CSS once
  function injectModalCss() {
    if ($('priceScanModalCss')) return;
    const style = document.createElement('style');
    style.id = 'priceScanModalCss';
    style.textContent = `
      .modal-overlay {
        position: fixed; inset: 0;
        background: rgba(15, 47, 75, 0.45);
        display: flex; align-items: center; justify-content: center;
        z-index: 100; backdrop-filter: blur(4px);
        padding: 24px;
      }
      .modal-card {
        width: 100%; max-width: 520px;
        max-height: calc(100vh - 48px); overflow: auto;
        background: var(--apg-bg-surface);
        box-shadow: var(--apg-shadow-lg);
      }
      .modal-card .panel-head h3 { text-transform: none; letter-spacing: 0; font-size: 16px; }
    `;
    document.head.appendChild(style);
  }

  // ─── Other views ─────────────────────────────────
  function renderHistoryView() {
    const root = $('root');
    root.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <div class="crumb"><span class="eyebrow">Operations</span><span class="sep">·</span><span>History</span></div>
          <h1>Lịch sử scan toàn hệ thống</h1>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Last 50 activity events</h3>
          <span class="eyebrow">${state.activity.length} events</span>
        </div>
        <div class="scroll-area" style="max-height:none">
          <div class="feed">
            ${state.activity.length === 0
              ? '<div class="empty">Chưa có activity nào.</div>'
              : state.activity.map(feedItemHtml).join('')}
          </div>
        </div>
      </div>
    `;
    $$('#root .feed-item[data-open]').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.open) navigate(`#/jobs/${encodeURIComponent(el.dataset.open)}`);
      });
    });
  }

  function renderNotificationsView() {
    const root = $('root');
    const items = state.notifications;
    root.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <div class="crumb"><span class="eyebrow">Operations</span><span class="sep">·</span><span>Notifications</span></div>
          <h1>Lịch sử notify</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm" type="button" id="testNotifyBtn">${icon('bell', 14)} Test notify</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Latest 50 notifications</h3>
        </div>
        <div class="runs-table">
          <div class="row head">
            <div>Thời gian</div>
            <div>Kênh</div>
            <div>Job</div>
            <div>Status · Detail</div>
          </div>
          ${items.length === 0
            ? '<div class="empty">Chưa có notification.</div>'
            : items.map(notifRowHtml).join('')}
        </div>
      </div>
    `;
    const btn = $('testNotifyBtn');
    if (btn) btn.addEventListener('click', testNotify_handler);
  }

  function notifRowHtml(n) {
    const job = state.jobs.find((j) => j.id === n.jobId);
    const status = n.status || '?';
    const klass = status === 'sent' ? 'success' : status === 'failed' ? 'danger' : '';
    return `<div class="row">
      <div class="when">${fmtTime(n.createdAt)} · ${fmtRel(n.createdAt)}</div>
      <div><span class="badge ${(n.channel || '') === 'zalo' ? 'info' : 'navy'}">${escapeHtml(n.channel || '?')}</span></div>
      <div>${job ? `<a data-nav="#/jobs/${encodeURIComponent(job.id)}" style="cursor:pointer;color:var(--apg-aviation-navy)">${escapeHtml(job.name || n.jobId)}</a>` : escapeHtml(n.jobId || '—')}</div>
      <div>
        <span class="badge ${klass}">${escapeHtml(status)}</span>
        ${n.attempts && Number(n.attempts) > 1 ? `<span class="badge warn" style="margin-left:6px">${n.attempts} attempts</span>` : ''}
        ${n.error ? `<span class="muted" style="margin-left:6px">${escapeHtml(n.error)}</span>` : ''}
        ${n.messageId ? `<span class="muted mono" style="margin-left:6px">msg:${escapeHtml(String(n.messageId).slice(0, 16))}</span>` : ''}
      </div>
    </div>`;
  }

  function renderSettingsView() {
    const root = $('root');
    const scanner = state.settings || {};
    const env = [
      ['Retention', `${scanner.retentionDays || 3} ngày`],
      ['Min interval (phút)', `${scanner.minIntervalMinutes || 5}`],
      ['Min interval (giây)', `${scanner.minIntervalSeconds || 5}`],
      ['Empty streak threshold', `${scanner.emptyStreakThreshold || 3}`],
      ['Failure streak threshold', `${scanner.failureStreakThreshold || 5}`],
      ['Telegram', scanner.telegramConfigured ? 'configured' : 'missing'],
      ['Zalo', scanner.zaloConfigured ? 'configured' : 'missing'],
      ['Scanner started', scanner.started ? 'yes' : 'no'],
      ['Store file', scanner.storeFile || '—'],
    ];
    root.innerHTML = `
      <div class="page-header">
        <div class="page-title">
          <div class="crumb"><span class="eyebrow">System</span><span class="sep">·</span><span>Settings</span></div>
          <h1>Hệ thống · Cấu hình</h1>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Backend scanner config</h3></div>
        <div class="runs-table">
          <div class="row head"><div>Key</div><div>Value</div><div></div><div></div></div>
          ${env.map(([k, v]) => `<div class="row"><div class="when">${escapeHtml(k)}</div><div style="grid-column:span 3"><span class="mono">${escapeHtml(v)}</span></div></div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>API key</h3></div>
        <div class="settings-section">
          <p class="muted" style="margin-top:0">API key được lưu trong <code>localStorage.priceScanApiKey</code>. Bấm 🔑 trên topbar để đổi.</p>
          <p class="muted">Nếu backend chạy <code>BACKEND_ALLOW_NO_AUTH=true</code>, có thể bỏ trống.</p>
          <p>Hiện tại: <span class="mono">${apiKey() ? '••••••• (đã lưu)' : '(chưa lưu)'}</span></p>
        </div>
      </div>
    `;
  }

  // ─── Price chart (pure SVG) ───────────────────────
  function teardownChart() {
    if (state.chartResizeObs) {
      try { state.chartResizeObs.disconnect(); } catch (_) { /* ignore */ }
      state.chartResizeObs = null;
    }
  }

  function renderPriceChartInto(container, history) {
    if (!container) return;
    teardownChart();

    const height = 280;
    const padL = 56, padR = 56, padT = 20, padB = 30;

    function draw(width) {
      const w = Math.max(280, width || container.clientWidth || 600);
      const innerW = Math.max(100, w - padL - padR);
      const innerH = height - padT - padB;

      const prices = history.map((p) => Number(p.price)).filter((v) => Number.isFinite(v));
      if (prices.length < 2) {
        container.innerHTML = '<div class="empty">Chưa đủ dữ liệu</div>';
        return;
      }
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const rngP = (maxP - minP) || 1;
      const padding = rngP * 0.15;
      const yMin = minP - padding;
      const yMax = maxP + padding;

      const seats = history.map((p) => Number(p.seat)).map((v) => Number.isFinite(v) ? v : 0);
      const maxSeat = Math.max(9, ...seats);

      const xStep = innerW / (history.length - 1);
      const points = history.map((p, i) => ({
        x: padL + i * xStep,
        y: padT + (1 - (Number(p.price) - yMin) / (yMax - yMin)) * innerH,
        t: p.t, price: Number(p.price), seat: Number(p.seat) || 0,
      }));
      const seatPoints = history.map((p, i) => ({
        x: padL + i * xStep,
        y: padT + (1 - (Number(p.seat) || 0) / maxSeat) * innerH,
      }));

      const linePath = 'M ' + points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
      const areaPath = linePath + ` L ${points[points.length - 1].x.toFixed(1)} ${padT + innerH} L ${points[0].x.toFixed(1)} ${padT + innerH} Z`;
      const seatPath = 'M ' + seatPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');

      const gridSteps = 4;
      let grid = '';
      for (let i = 0; i <= gridSteps; i += 1) {
        const y = padT + (i / gridSteps) * innerH;
        const v = yMax - (i / gridSteps) * (yMax - yMin);
        grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + innerW}" y2="${y.toFixed(1)}" stroke="var(--apg-border-soft)" stroke-width="1" stroke-dasharray="2 4"/>
                 <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" font-size="10" fill="var(--apg-text-muted)" font-family="JetBrains Mono, monospace" text-anchor="end">${Math.round(v / 1000)}k</text>`;
      }

      let xTicks = '';
      const tickEvery = Math.max(1, Math.ceil(history.length / 6));
      const tickIdx = [];
      for (let i = 0; i < history.length; i += tickEvery) tickIdx.push(i);
      if (tickIdx[tickIdx.length - 1] !== history.length - 1) tickIdx.push(history.length - 1);
      tickIdx.forEach((i) => {
        const p = points[i];
        xTicks += `<text x="${p.x.toFixed(1)}" y="${(height - 10).toFixed(1)}" font-size="10" fill="var(--apg-text-muted)" font-family="JetBrains Mono, monospace" text-anchor="middle">${fmtTime(history[i].t)}</text>`;
      });

      const seatDots = seatPoints.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="var(--apg-brand-gold)" opacity="0.6"/>`).join('');
      const priceDots = points.map((p, i) => `<circle data-idx="${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="var(--apg-aviation-navy)"/>`).join('');

      container.innerHTML = `
        <svg width="${w}" height="${height}" class="chart-svg" id="priceChartSvg">
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--apg-aviation-navy)" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="var(--apg-aviation-navy)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${grid}
          ${xTicks}
          <path d="${seatPath}" stroke="var(--apg-brand-gold)" stroke-width="1.5" fill="none" stroke-dasharray="3 3" opacity="0.7"/>
          ${seatDots}
          <path d="${areaPath}" fill="url(#priceGrad)"/>
          <path d="${linePath}" stroke="var(--apg-aviation-navy)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          ${priceDots}
          <g id="crosshair" style="display:none">
            <line stroke="var(--apg-text-muted)" stroke-width="1" stroke-dasharray="3 3"/>
            <circle r="5" fill="var(--apg-aviation-navy)" stroke="var(--apg-bg-surface)" stroke-width="2"/>
          </g>
          <text x="${padL + innerW + 8}" y="${(padT + 4).toFixed(1)}" font-size="9" fill="var(--apg-brand-gold-hover)" font-family="Inter, sans-serif" font-weight="700" letter-spacing="0.12em">GHẾ</text>
          <text x="${padL + innerW + 8}" y="${(padT + 4).toFixed(1)}" dy="14" font-size="10" fill="var(--apg-brand-gold-hover)" font-family="JetBrains Mono, monospace">${maxSeat}</text>
          <text x="${padL + innerW + 8}" y="${(padT + innerH + 4).toFixed(1)}" font-size="10" fill="var(--apg-brand-gold-hover)" font-family="JetBrains Mono, monospace">0</text>
        </svg>
        <div class="chart-tooltip" id="chartTooltip" style="display:none"></div>
      `;

      const svg = container.querySelector('#priceChartSvg');
      const tooltip = container.querySelector('#chartTooltip');
      const crosshair = container.querySelector('#crosshair');
      const crossLine = crosshair.querySelector('line');
      const crossCircle = crosshair.querySelector('circle');

      function onMove(e) {
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const idx = Math.round((x - padL) / xStep);
        const clamped = Math.max(0, Math.min(points.length - 1, idx));
        const p = points[clamped];
        crossLine.setAttribute('x1', p.x);
        crossLine.setAttribute('y1', padT);
        crossLine.setAttribute('x2', p.x);
        crossLine.setAttribute('y2', padT + innerH);
        crossCircle.setAttribute('cx', p.x);
        crossCircle.setAttribute('cy', p.y);
        crosshair.style.display = '';
        tooltip.style.display = '';
        tooltip.style.left = p.x + 'px';
        tooltip.style.top = (p.y - 4) + 'px';
        tooltip.textContent = `${fmtTime(p.t)} · ${fmtVND(p.price)} ₫ · ${p.seat} ghế`;
      }
      function onLeave() { crosshair.style.display = 'none'; tooltip.style.display = 'none'; }
      svg.addEventListener('mousemove', onMove);
      svg.addEventListener('mouseleave', onLeave);
    }

    // initial draw
    draw(container.clientWidth);

    // resize observer
    if (typeof ResizeObserver !== 'undefined') {
      state.chartResizeObs = new ResizeObserver((entries) => {
        for (const e of entries) draw(e.contentRect.width);
      });
      state.chartResizeObs.observe(container);
    } else {
      window.addEventListener('resize', () => draw(container.clientWidth));
    }
  }

  // ─── Static event wiring (sidebar + topbar) ──────
  function bindStaticEvents() {
    // Sidebar nav buttons
    $$('.nav-item[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.href || '#/'));
    });
    // Mobile tabbar
    $$('.mobile-tabbar .tab[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.href || '#/'));
    });
    // Topbar buttons
    const themeBtn = $('themeToggleBtn'); if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const apiBtn = $('apiKeyBtn'); if (apiBtn) apiBtn.addEventListener('click', openApiKeyDialog);
    const refresh = $('refreshBtn'); if (refresh) refresh.addEventListener('click', refreshAll);

    // Global search (Step 4 baseline: filter routes board client-side when on dashboard)
    const search = $('globalSearch');
    if (search) {
      search.addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim().toLowerCase();
        if (state.route.view !== 'dashboard') return;
        if (!q) renderDashboard();
        else {
          const filtered = state.jobs.filter((j) =>
            (j.name || '').toLowerCase().includes(q) ||
            (j.query && (j.query.from || '').toLowerCase().includes(q)) ||
            (j.query && (j.query.to || '').toLowerCase().includes(q)) ||
            (j.query && (j.query.flightNumber || '').toLowerCase().includes(q))
          );
          // Quick override: replace board content
          const board = $$('#root .routes-board')[0];
          if (board) {
            const rows = board.querySelectorAll('.route-row');
            rows.forEach((r) => {
              const open = r.dataset.open;
              const ok = filtered.some((j) => j.id === open);
              r.style.display = ok ? '' : 'none';
            });
          }
        }
      });
      // "/" shortcut to focus search
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement && document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          search.focus();
        }
      });
    }

    // Delegated [data-nav] links inside #root
    $('root').addEventListener('click', (e) => {
      const nav = e.target.closest && e.target.closest('[data-nav]');
      if (nav) { e.preventDefault(); navigate(nav.dataset.nav); }
    });
  }

  // ─── Auto-refresh ────────────────────────────────
  function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
      if (document.hidden) return;
      loadDataForRoute().then(() => renderCurrentView()).catch(() => {});
    }, REFRESH_MS);
  }

  // ─── Fatal handler ───────────────────────────────
  function handleFatal(err) {
    console.error('[fatal]', err);
    toast(err && err.message ? err.message : String(err), 'error');
  }

  // ─── Boot ────────────────────────────────────────
  async function boot() {
    initTheme();
    injectModalCss();
    bindStaticEvents();
    window.addEventListener('hashchange', () => handleRoute().catch(handleFatal));
    try {
      await handleRoute();
    } catch (err) {
      handleFatal(err);
    }
    startAutoRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot().catch(handleFatal));
  } else {
    boot().catch(handleFatal);
  }
})();
