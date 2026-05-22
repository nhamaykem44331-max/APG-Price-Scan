const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function defaultStoreFile() {
  return process.env.SCAN_STORE_FILE || path.join(process.cwd(), 'data', 'scan-store.json');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function defaultReservationSettings() {
  return {
    enabled: String(process.env.RESERVATION_WATCH_ENABLED || 'true').toLowerCase() !== 'false',
    scope: ['held', 'all'].includes(String(process.env.RESERVATION_WATCH_SCOPE || '').toLowerCase())
      ? String(process.env.RESERVATION_WATCH_SCOPE).toLowerCase()
      : 'held',
    intervalMinutes: Number.parseInt(process.env.RESERVATION_WATCH_INTERVAL_MINUTES || '30', 10) || 30,
    minDropAmount: Number.parseInt(process.env.RESERVATION_WATCH_MIN_DROP || '0', 10) || 0,
    channel: 'zalo',
  };
}

function defaultData() {
  return {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    jobs: [],
    runs: [],
    notifications: [],
    reservations: [],
    reservationSettings: defaultReservationSettings(),
  };
}

class ScanStore {
  constructor(filePath = defaultStoreFile()) {
    this.filePath = path.resolve(filePath);
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return defaultData();
    }

    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw.trim()) return defaultData();

    const data = JSON.parse(raw);
    return {
      ...defaultData(),
      ...data,
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      runs: Array.isArray(data.runs) ? data.runs : [],
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      reservations: Array.isArray(data.reservations) ? data.reservations : [],
      reservationSettings: { ...defaultReservationSettings(), ...(data.reservationSettings || {}) },
    };
  }

  save(data) {
    const next = {
      ...defaultData(),
      ...data,
      updatedAt: nowIso(),
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2));
    fs.renameSync(tmpPath, this.filePath);
    return next;
  }

  mutate(mutator) {
    const data = this.load();
    const result = mutator(data);
    this.save(data);
    return clone(result);
  }

  listJobs() {
    return clone(
      this.load().jobs.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    );
  }

  getJob(id) {
    const job = this.load().jobs.find((item) => item.id === id);
    return clone(job || null);
  }

  createJob(job) {
    return this.mutate((data) => {
      const next = { ...job, id: job.id || randomId('job'), createdAt: job.createdAt || nowIso(), updatedAt: nowIso() };
      data.jobs.push(next);
      return next;
    });
  }

  updateJob(id, patch) {
    return this.mutate((data) => {
      const index = data.jobs.findIndex((item) => item.id === id);
      if (index < 0) return null;
      data.jobs[index] = {
        ...data.jobs[index],
        ...patch,
        id,
        updatedAt: nowIso(),
      };
      return data.jobs[index];
    });
  }

  deleteJob(id) {
    return this.mutate((data) => {
      const before = data.jobs.length;
      data.jobs = data.jobs.filter((item) => item.id !== id);
      data.runs = data.runs.filter((item) => item.jobId !== id);
      data.notifications = data.notifications.filter((item) => item.jobId !== id);
      return before !== data.jobs.length;
    });
  }

  recordRun(run) {
    return this.mutate((data) => {
      const next = { ...run, id: run.id || randomId('run') };
      data.runs.push(next);
      return next;
    });
  }

  listRuns(jobId, options = {}) {
    const limit = Number.parseInt(options.limit || '50', 10);
    const all = this.load().runs
      .filter((item) => !jobId || item.jobId === jobId)
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    return clone(Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all);
  }

  getRun(id) {
    const run = this.load().runs.find((item) => item.id === id);
    return clone(run || null);
  }

  latestSuccessfulRun(jobId) {
    const run = this.load().runs
      .filter((item) => item.jobId === jobId && item.status === 'success')
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))[0];
    return clone(run || null);
  }

  recordNotification(notification) {
    return this.mutate((data) => {
      const next = { ...notification, id: notification.id || randomId('ntf') };
      data.notifications.push(next);
      return next;
    });
  }

  listNotifications(options = {}) {
    const limit = Number.parseInt(options.limit || '50', 10);
    const status = options.status;
    const jobId = options.jobId;
    const all = (this.load().notifications || [])
      .filter((item) => (!status || item.status === status) && (!jobId || item.jobId === jobId))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return clone(Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all);
  }

  prune(retentionDays) {
    const days = Number.parseFloat(retentionDays);
    if (!Number.isFinite(days) || days <= 0) return { removedRuns: 0, removedNotifications: 0 };

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.mutate((data) => {
      const beforeRuns = data.runs.length;
      const beforeNotifications = data.notifications.length;
      data.runs = data.runs.filter((item) => Date.parse(item.startedAt || item.createdAt || 0) >= cutoff);
      data.notifications = data.notifications.filter((item) => Date.parse(item.createdAt || 0) >= cutoff);
      return {
        removedRuns: beforeRuns - data.runs.length,
        removedNotifications: beforeNotifications - data.notifications.length,
      };
    });
  }

  // ─── Reservation watcher state ─────────────────────
  getReservationSettings() {
    return clone(this.load().reservationSettings || {});
  }

  setReservationSettings(patch = {}) {
    return this.mutate((data) => {
      data.reservationSettings = { ...(data.reservationSettings || {}), ...patch };
      return data.reservationSettings;
    });
  }

  listReservations() {
    return clone(
      (this.load().reservations || [])
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    );
  }

  getReservation(pnr) {
    const key = String(pnr || '').toUpperCase();
    const found = (this.load().reservations || []).find((r) => String(r.pnr || '').toUpperCase() === key);
    return clone(found || null);
  }

  // Upsert một reservation theo pnr; trả về bản đã lưu.
  upsertReservation(pnr, patch = {}) {
    const key = String(pnr || '').toUpperCase();
    if (!key) return null;
    return this.mutate((data) => {
      if (!Array.isArray(data.reservations)) data.reservations = [];
      const idx = data.reservations.findIndex((r) => String(r.pnr || '').toUpperCase() === key);
      const now = nowIso();
      if (idx < 0) {
        const created = { pnr: key, createdAt: now, updatedAt: now, ...patch };
        data.reservations.push(created);
        return created;
      }
      data.reservations[idx] = { ...data.reservations[idx], ...patch, pnr: key, updatedAt: now };
      return data.reservations[idx];
    });
  }

  // Bỏ các reservation không còn trong list hiện tại (đã xuất vé/huỷ/hết hạn).
  pruneReservationsNotIn(activePnrs = []) {
    const keep = new Set(activePnrs.map((p) => String(p || '').toUpperCase()));
    return this.mutate((data) => {
      const before = (data.reservations || []).length;
      data.reservations = (data.reservations || []).filter((r) => keep.has(String(r.pnr || '').toUpperCase()));
      return { removed: before - data.reservations.length };
    });
  }
}

module.exports = {
  ScanStore,
  randomId,
  nowIso,
};
