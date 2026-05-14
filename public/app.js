const state = {
  jobs: [],
  selectedJobId: '',
  settings: null,
  runsCache: [],
  runsShownCount: 10,
  refreshTimer: null,
};

const $ = (id) => document.getElementById(id);

function apiKey() {
  return localStorage.getItem('priceScanApiKey') || '';
}

function requireApiKey() {
  if (apiKey()) return true;
  toast('Nhap BACKEND_API_KEY roi bam Save key truoc khi thao tac.', 'error');
  const input = $('apiKeyInput');
  if (input) input.focus();
  return false;
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const key = apiKey();
  if (key) headers['X-API-Key'] = key;

  const response = await fetch(path, {
    ...options,
    headers,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('API key chua dung hoac chua duoc luu. Nhap BACKEND_API_KEY roi bam Save key.');
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

const TOAST_DURATIONS = { error: 6000, success: 2200, info: 3600 };

function toast(message, type = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('toast-error', 'toast-success', 'toast-info');
  el.classList.add(`toast-${type}`);
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.hidden = true;
  }, TOAST_DURATIONS[type] || TOAST_DURATIONS.info);
}

async function withBusyButton(button, action) {
  if (!button) return action();
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.classList.add('busy');
  try {
    return await action();
  } finally {
    button.disabled = wasDisabled;
    button.classList.remove('busy');
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '0';
}

function displayDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('vi-VN', { hour12: false });
  }
  return value;
}

function toHtmlDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return text;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function statusBadge(status) {
  if (status === 'success') return '<span class="badge ok">success</span>';
  if (status === 'error') return '<span class="badge error">error</span>';
  if (status === 'running') return '<span class="badge warn">running</span>';
  return `<span class="badge">${escapeHtml(status || 'new')}</span>`;
}

function selectedJob() {
  return state.jobs.find((job) => job.id === state.selectedJobId) || null;
}

function scheduleLabel(schedule = {}) {
  const unit = schedule.intervalUnit || (Number(schedule.intervalSeconds || 0) < 60 ? 'seconds' : 'minutes');
  if (unit === 'seconds') return `every ${schedule.intervalValue || schedule.intervalSeconds || 60}s`;
  return `every ${schedule.intervalValue || schedule.intervalMinutes || 60}m`;
}

function updateIntervalBounds() {
  const unit = $('intervalUnitInput').value;
  const min = unit === 'seconds'
    ? (state.settings?.minIntervalSeconds || 5)
    : (state.settings?.minIntervalMinutes || 5);
  $('intervalInput').min = String(min);
  $('intervalInput').step = '1';
  if (Number($('intervalInput').value || 0) < min) {
    $('intervalInput').value = String(min);
  }
}

function updateNotifyStatus() {
  const channel = $('notifyChannelInput') ? $('notifyChannelInput').value : 'telegram';
  const configured = channel === 'zalo'
    ? !!state.settings?.zaloConfigured
    : !!state.settings?.telegramConfigured;
  const label = channel === 'zalo' ? 'Zalo' : 'Telegram';
  if ($('notifyStatusInput')) {
    $('notifyStatusInput').value = configured ? `${label} ready` : `${label} missing config`;
  }
}

function setNotifyChannel(channel) {
  const value = channel === 'zalo' ? 'zalo' : 'telegram';
  if ($('notifyChannelInput')) $('notifyChannelInput').value = value;
  document.querySelectorAll('.channel-option').forEach((button) => {
    button.classList.toggle('active', button.dataset.channel === value);
  });
  updateNotifyStatus();
}

function jobPayloadFromForm() {
  const adults = Number($('adultInput').value || 1);
  return {
    name: $('jobName').value.trim(),
    enabled: $('enabledInput').checked,
    query: {
      from: $('fromInput').value.trim().toUpperCase(),
      to: $('toInput').value.trim().toUpperCase(),
      date: $('dateInput').value,
      airline: $('airlineInput').value.trim().toUpperCase(),
      flightNumber: $('flightInput').value.trim().toUpperCase(),
      time: $('timeInput').value,
      departureTimeStart: $('timeStartInput').value,
      departureTimeEnd: $('timeEndInput').value,
      directOnly: $('directInput').checked,
      adt: Number.isFinite(adults) && adults > 0 ? adults : 1,
      chd: 0,
      inf: 0,
    },
    schedule: {
      intervalValue: Number($('intervalInput').value || 60),
      intervalUnit: $('intervalUnitInput').value,
    },
    notify: {
      telegramEnabled: $('telegramInput').checked,
      channel: $('notifyChannelInput') ? $('notifyChannelInput').value : 'telegram',
      mode: $('notifyModeInput').value,
      notifyOnError: true,
      muted: $('muteInput') ? $('muteInput').checked : false,
    },
  };
}

function validateJobPayload(payload) {
  const q = payload.query;
  const errors = [];
  if (!payload.name) errors.push({ field: 'jobName', message: 'Thiếu tên job' });
  if (!/^[A-Z]{3}$/.test(q.from || '')) errors.push({ field: 'fromInput', message: 'From phải là mã IATA 3 chữ' });
  if (!/^[A-Z]{3}$/.test(q.to || '')) errors.push({ field: 'toInput', message: 'To phải là mã IATA 3 chữ' });
  if (q.from && q.to && q.from === q.to) errors.push({ field: 'toInput', message: 'From và To không được trùng' });
  if (!q.date) errors.push({ field: 'dateInput', message: 'Thiếu ngày bay' });
  if (q.airline && !/^[A-Z0-9]{2,3}$/.test(q.airline)) errors.push({ field: 'airlineInput', message: 'Airline code 2–3 ký tự' });
  const intervalNum = Number($('intervalInput').value);
  if (!Number.isFinite(intervalNum) || intervalNum <= 0) errors.push({ field: 'intervalInput', message: 'Interval phải là số dương' });
  return errors;
}

function tomorrowYmd() {
  const date = new Date(Date.now() + 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

function clearForm() {
  state.selectedJobId = '';
  $('jobId').value = '';
  $('jobName').value = '';
  $('fromInput').value = 'HAN';
  $('toInput').value = 'SGN';
  $('dateInput').value = tomorrowYmd();
  $('airlineInput').value = 'VJ';
  $('flightInput').value = 'VJ125';
  $('timeInput').value = '';
  $('timeStartInput').value = '06:00';
  $('timeEndInput').value = '12:00';
  $('intervalInput').value = '60';
  $('intervalUnitInput').value = 'minutes';
  $('adultInput').value = '1';
  $('notifyModeInput').value = 'every_run';
  setNotifyChannel('telegram');
  $('enabledInput').checked = true;
  $('telegramInput').checked = true;
  if ($('muteInput')) $('muteInput').checked = false;
  $('directInput').checked = true;
  updateIntervalBounds();
  updateNotifyStatus();
  renderJobs();
  renderRuns([]);
}

function fillForm(job) {
  const query = job.query || {};
  const schedule = job.schedule || {};
  const notify = job.notify || {};
  state.selectedJobId = job.id;
  $('jobId').value = job.id;
  $('jobName').value = job.name || '';
  $('fromInput').value = query.from || '';
  $('toInput').value = query.to || '';
  $('dateInput').value = toHtmlDate(query.date);
  $('airlineInput').value = query.airline || '';
  $('flightInput').value = query.flightNumber || '';
  $('timeInput').value = query.time || '';
  $('timeStartInput').value = query.departureTimeStart || '';
  $('timeEndInput').value = query.departureTimeEnd || '';
  $('intervalUnitInput').value = schedule.intervalUnit || 'minutes';
  $('intervalInput').value = schedule.intervalValue || (schedule.intervalUnit === 'seconds' ? schedule.intervalSeconds : schedule.intervalMinutes) || 60;
  $('adultInput').value = query.adt || 1;
  $('notifyModeInput').value = notify.mode || 'every_run';
  setNotifyChannel(notify.channel || 'telegram');
  $('enabledInput').checked = !!job.enabled;
  $('telegramInput').checked = notify.telegramEnabled !== false;
  if ($('muteInput')) $('muteInput').checked = !!notify.muted;
  $('directInput').checked = !!query.directOnly;
  updateIntervalBounds();
  updateNotifyStatus();
  renderJobs();
}

function renderJobs() {
  const list = $('jobsList');
  if (!state.jobs.length) {
    list.innerHTML = '<div class="empty-state">Chưa có job nào. Bấm "New" để tạo job đầu tiên.</div>';
    return;
  }

  list.innerHTML = state.jobs.map((job) => {
    const query = job.query || {};
    const notify = job.notify || {};
    const active = job.id === state.selectedJobId ? ' active' : '';
    const channel = notify.channel === 'zalo' ? 'Zalo' : 'Telegram';
    const meta = `${query.from || '-'}-${query.to || '-'} ${query.date || '-'} | ${query.flightNumber || query.airline || 'ALL'} | ${scheduleLabel(job.schedule || {})} | ${channel}`;
    const muteBadge = notify.muted ? '<span class="badge warn">muted</span>' : '';
    const toggleLabel = job.enabled ? 'On' : 'Off';
    const toggleClass = job.enabled ? 'toggle-on' : 'toggle-off';
    return `
      <div class="job-row${active}" data-job-id="${escapeHtml(job.id)}">
        <div>
          <div class="job-title">
            <span>${escapeHtml(job.name || job.id)}</span>
            ${statusBadge(job.lastStatus || (job.enabled ? 'enabled' : 'disabled'))}
            ${muteBadge}
          </div>
          <div class="job-meta">${escapeHtml(meta)}</div>
          <div class="job-meta">Next: ${escapeHtml(displayDate(job.nextRunAt))}</div>
        </div>
        <div class="job-actions">
          <button type="button" class="toggle-btn ${toggleClass}" data-toggle-id="${escapeHtml(job.id)}" title="Bật/tắt scheduler">${toggleLabel}</button>
          <button type="button" data-run-id="${escapeHtml(job.id)}">Run</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.job-row').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      const job = state.jobs.find((item) => item.id === row.dataset.jobId);
      if (job) {
        fillForm(job);
        loadRuns(job.id).catch((error) => toast(error.message, 'error'));
      }
    });
  });

  list.querySelectorAll('button[data-toggle-id]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await withBusyButton(button, () => toggleJobEnabled(button.dataset.toggleId));
    });
  });

  list.querySelectorAll('button[data-run-id]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await withBusyButton(button, () => runJob(button.dataset.runId));
    });
  });
}

async function toggleJobEnabled(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;
  try {
    await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    await loadJobs();
    toast(job.enabled ? 'Đã tắt scheduler' : 'Đã bật scheduler', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function seatBadge(seat) {
  if (seat === 0) return ' <span class="badge error">SOLD OUT</span>';
  const num = Number(seat);
  if (Number.isFinite(num) && num > 0 && num < 5) {
    return ` <span class="badge warn">${num} ghế</span>`;
  }
  if (seat === undefined || seat === null || seat === '') return '';
  return ` <span class="muted">${escapeHtml(String(seat))} ghế</span>`;
}

function comparisonSummary(comparison) {
  if (!comparison || !comparison.hasPrevious) return '';
  const counts = comparison.counts || {};
  const parts = [];
  if (counts.price) parts.push(`${counts.price} giá đổi`);
  if (counts.seat) parts.push(`${counts.seat} chỗ đổi`);
  if (counts.new) parts.push(`${counts.new} chuyến mới`);
  if (counts.removed) parts.push(`${counts.removed} chuyến mất`);
  return parts.length ? `Δ ${parts.join(', ')}` : 'không đổi';
}

function changeBadge(change) {
  if (change.type === 'price') {
    const cls = change.delta < 0 ? 'change-down' : 'change-up';
    const arrow = change.delta < 0 ? '↓' : '↑';
    const pct = change.percent !== null && change.percent !== undefined && Number.isFinite(change.percent)
      ? ` ${change.percent}%`
      : '';
    return `<span class="change ${cls}">${arrow}${pct}</span>`;
  }
  if (change.type === 'seat') {
    if (change.soldOut) return '<span class="change change-sold">SOLD</span>';
    const delta = change.seatDelta;
    if (delta === null || delta === undefined) return '<span class="change change-seat">seat ↻</span>';
    return `<span class="change change-seat">seat ${delta > 0 ? '+' : ''}${delta}</span>`;
  }
  if (change.type === 'new') return '<span class="change change-new">NEW</span>';
  if (change.type === 'removed') return '<span class="change change-removed">REMOVED</span>';
  return `<span class="change">${escapeHtml(change.type)}</span>`;
}

function renderChanges(comparison) {
  if (!comparison || !comparison.hasPrevious || !Array.isArray(comparison.changes) || !comparison.changes.length) {
    return '';
  }
  const top = comparison.changes.slice(0, 6).map((change) => `
    <span class="change-row">
      ${changeBadge(change)} ${escapeHtml(change.flightNumber || '')} ${escapeHtml(change.departTime || '')}
    </span>
  `).join('');
  const more = comparison.changes.length > 6 ? ` <span class="muted">+${comparison.changes.length - 6}</span>` : '';
  return `<div class="run-changes">${top}${more}</div>`;
}

function renderRuns(runs) {
  const list = $('runsList');
  if (!runs || !runs.length) {
    list.innerHTML = '<div class="empty-state">Chưa có scan run nào cho job này. Bấm "Run now" để chạy thử.</div>';
    return;
  }

  const showCount = state.runsShownCount || 10;
  const visible = runs.slice(0, showCount);

  const rowsHtml = visible.map((run) => {
    const results = Array.isArray(run.results) ? run.results : [];
    const resultLines = results.map((item) => `
      <div class="result-line">
        ${escapeHtml(item.flightNumber)} ${escapeHtml(item.departTime || '--:--')}-${escapeHtml(item.arrivalTime || '--:--')}
        | ${money(item.totalAmount)} ${escapeHtml(item.currency || 'VND')}
        | ${escapeHtml(item.cabinClass || '')} ${escapeHtml(item.class || '')}
        ${seatBadge(item.seatAvailable)}
      </div>
    `).join('');

    const comparisonText = comparisonSummary(run.comparison);
    const comparisonLine = comparisonText
      ? `<div class="run-meta">${escapeHtml(comparisonText)}</div>`
      : '';

    return `
      <div class="run-row">
        <div class="run-title">
          <span>${escapeHtml(displayDate(run.startedAt))}</span>
          ${statusBadge(run.status)}
        </div>
        <div class="run-meta">
          ${run.status === 'success'
            ? `${run.matchCount || 0} match(es), ${run.durationMs || 0}ms, notify ${(run.notification && run.notification.status) || 'skipped'}`
            : escapeHtml(run.error || 'Unknown error')}
        </div>
        ${comparisonLine}
        ${renderChanges(run.comparison)}
        <div class="run-results">${resultLines}</div>
      </div>
    `;
  }).join('');

  const moreButton = runs.length > showCount
    ? `<div class="runs-more"><button type="button" id="showMoreRunsBtn">Xem thêm (${runs.length - showCount})</button></div>`
    : '';

  list.innerHTML = rowsHtml + moreButton;

  const showMoreBtn = document.getElementById('showMoreRunsBtn');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      state.runsShownCount = (state.runsShownCount || 10) + 10;
      renderRuns(state.runsCache || runs);
    });
  }
}

async function loadSettings() {
  const data = await apiFetch('/scan-settings');
  state.settings = data.settings;
  $('retentionLabel').textContent = `Retention: ${data.settings.retentionDays} days`;
  updateNotifyStatus();
  return data.settings;
}

async function loadHealth() {
  try {
    const health = await apiFetch('/health');
    const scanner = health.scanner || {};
    state.settings = {
      ...(state.settings || {}),
      telegramConfigured: !!scanner.telegramConfigured,
      zaloConfigured: !!scanner.zaloConfigured,
      minIntervalSeconds: scanner.minIntervalSeconds || state.settings?.minIntervalSeconds,
      minIntervalMinutes: scanner.minIntervalMinutes || state.settings?.minIntervalMinutes,
    };
    const telegram = scanner.telegramConfigured ? 'Telegram ready' : 'Telegram missing';
    const zalo = scanner.zaloConfigured ? 'Zalo ready' : 'Zalo missing';
    $('systemStatus').textContent = `Backend: ${health.ok ? 'ok' : 'needs attention'} | ${telegram} | ${zalo}`;
    updateNotifyStatus();
  } catch (error) {
    $('systemStatus').textContent = `Backend status: ${error.message}`;
  }
}

async function loadJobs() {
  const data = await apiFetch('/scan-jobs');
  state.jobs = data.jobs || [];
  if (state.selectedJobId && !state.jobs.find((job) => job.id === state.selectedJobId)) {
    state.selectedJobId = '';
  }
  renderJobs();
  if (state.selectedJobId) await loadRuns(state.selectedJobId);
}

async function loadRuns(jobId) {
  const data = await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}/runs?limit=50`);
  state.runsCache = data.runs || [];
  state.runsShownCount = 10;
  renderRuns(state.runsCache);
}

async function saveJob(event) {
  event.preventDefault();
  if (!requireApiKey()) return;
  const id = $('jobId').value;
  const payload = jobPayloadFromForm();

  const errors = validateJobPayload(payload);
  if (errors.length) {
    const first = errors[0];
    const field = $(first.field);
    if (field) field.focus();
    toast(first.message, 'error');
    return;
  }

  const submitBtn = event.submitter || event.target.querySelector('button[type="submit"]');
  await withBusyButton(submitBtn, async () => {
    const path = id ? `/scan-jobs/${encodeURIComponent(id)}` : '/scan-jobs';
    const method = id ? 'PATCH' : 'POST';
    try {
      const data = await apiFetch(path, { method, body: JSON.stringify(payload) });
      state.selectedJobId = data.job.id;
      await loadJobs();
      fillForm(data.job);
      await loadRuns(data.job.id);
      toast('Saved', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

async function runJob(id) {
  if (!requireApiKey()) return;
  const jobId = id || $('jobId').value;
  if (!jobId) {
    toast('Save the job first', 'error');
    return;
  }
  toast('Scan started…');
  try {
    const data = await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}/run-now`, { method: 'POST', body: '{}' });
    state.selectedJobId = jobId;
    await loadJobs();
    await loadRuns(jobId);
    if (data.run.status === 'success') {
      toast(`Scan xong: ${data.run.matchCount || 0} chuyến`, 'success');
    } else {
      toast(`Scan error: ${data.run.error || 'unknown'}`, 'error');
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteJob() {
  if (!requireApiKey()) return;
  const jobId = $('jobId').value;
  if (!jobId) {
    clearForm();
    return;
  }
  const name = (selectedJob() && selectedJob().name) || jobId;
  if (!window.confirm(`Xóa job "${name}"? Hành động không hoàn tác.`)) return;
  const button = $('deleteJobBtn');
  await withBusyButton(button, async () => {
    try {
      await apiFetch(`/scan-jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      clearForm();
      await loadJobs();
      toast('Đã xóa', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

async function testNotify() {
  if (!requireApiKey()) return;
  const channel = $('notifyChannelInput') ? $('notifyChannelInput').value : 'telegram';
  const text = `Price Scan ${channel} test ${new Date().toISOString()}`;
  const button = $('notifyTestBtn');
  await withBusyButton(button, async () => {
    try {
      await apiFetch('/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ channel, text }),
      });
      toast(`${channel === 'zalo' ? 'Zalo' : 'Telegram'} sent`, 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function bindEvents() {
  $('apiKeyInput').value = apiKey();
  $('saveApiKeyBtn').addEventListener('click', async () => {
    const key = $('apiKeyInput').value.trim();
    if (!key) {
      toast('Nhap API key truoc khi luu', 'error');
      return;
    }
    await withBusyButton($('saveApiKeyBtn'), async () => {
      localStorage.setItem('priceScanApiKey', key);
      try {
        await apiFetch('/scan-settings');
        toast('API key hop le', 'success');
        await init();
      } catch (error) {
        localStorage.removeItem('priceScanApiKey');
        toast(error.message, 'error');
      }
    });
  });
  const toggleKeyBtn = $('toggleApiKeyBtn');
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const input = $('apiKeyInput');
      input.type = input.type === 'password' ? 'text' : 'password';
      toggleKeyBtn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
  }
  $('notifyTestBtn').addEventListener('click', () => testNotify());
  $('refreshBtn').addEventListener('click', () => init().catch((error) => toast(error.message, 'error')));
  $('newJobBtn').addEventListener('click', clearForm);
  $('intervalUnitInput').addEventListener('change', updateIntervalBounds);
  document.querySelectorAll('.channel-option').forEach((button) => {
    button.addEventListener('click', () => setNotifyChannel(button.dataset.channel));
  });
  $('jobForm').addEventListener('submit', (event) => saveJob(event));
  $('runNowBtn').addEventListener('click', () => runJob());
  $('deleteJobBtn').addEventListener('click', () => deleteJob());
}

async function init() {
  if (!apiKey()) {
    await loadHealth();
    $('retentionLabel').textContent = '';
    $('jobsList').innerHTML = '<div class="empty-state">Nhap API key va bam "Save key" de quan ly job tren server.</div>';
    renderRuns([]);
    return;
  }
  await Promise.all([loadSettings(), loadHealth(), loadJobs()]);
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    loadJobs().catch(() => {});
    loadHealth().catch(() => {});
  }, 30000);
}

bindEvents();
clearForm();
init().then(startAutoRefresh).catch((error) => toast(error.message, 'error'));
