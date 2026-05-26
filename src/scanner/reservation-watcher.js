'use strict';

/**
 * reservation-watcher.js
 * Mỗi N phút (mặc định 30): lấy danh sách giữ chỗ từ management/list-booking,
 * re-scan giá ĐÚNG chuyến đang giữ, nếu giá hiện tại < giá giữ chỗ → bắn Zalo.
 *
 * Dedup: chỉ alert lần đầu rớt dưới giá giữ; re-alert khi rớt sâu hơn mức đã báo.
 * Phạm vi (held-only / all) cấu hình qua settings (store.reservationSettings).
 */

const config = require('../config');
const { ScanStore, nowIso } = require('./store');
const { parseReservations } = require('./reservation-parser');
const { withScannerAutoLogin, withAccountAutoLogin } = require('./scan-service');
const { sendReservationAlert, isZaloConfigured } = require('./zalo');
const {
  searchJourney,
  selectFlight,
  cheapestFare,
  summarizeFlightFare,
} = require('../booking-workflow');
const logger = require('../logger');

const MIN_INTERVAL_MINUTES = 5;

function totalPaxOf(reservation) {
  const adt = Number(reservation.adt) || 1;
  const chd = Number(reservation.chd) || 0;
  const inf = Number(reservation.inf) || 0;
  return Math.max(1, adt + chd + inf);
}

/**
 * Re-scan đúng chuyến đang giữ.
 * NOTE normalize giá: heldPrice là TỔNG booking; ta ước tính tổng hiện tại =
 * giá/người-lớn × tổng số khách (xấp xỉ — chuẩn cho booking toàn người lớn,
 * thiên về conservative khi có trẻ em/em bé). Message hiển thị cả per-adult để
 * người quản lý tự cân nhắc.
 */
async function scanReservationFare(client, reservation) {
  const params = {
    from: reservation.from,
    to: reservation.to,
    date: reservation.date,
    airline: reservation.airline || undefined,
    adt: reservation.adt || 1,
    chd: reservation.chd || 0,
    inf: reservation.inf || 0,
    directOnly: false,
  };
  const journey = await searchJourney(params, { client });
  // list-booking KHÔNG có flightNumber → match đúng chuyến bằng airline + route + departTime.
  // (departTime lấy từ depDay, vd "30-05-2026 20:25" → "20:25"). flightNumber chỉ dùng nếu có.
  const flight = selectFlight(journey.flights || [], {
    airline: reservation.airline || undefined,
    flightNumber: reservation.flightNumber || undefined,
    time: reservation.departTime || undefined,
    from: reservation.from,
    to: reservation.to,
  });
  const { fare, total } = cheapestFare(flight); // total = full fare/người lớn
  const summary = summarizeFlightFare(flight, fare);
  const perAdult = Math.round(total);
  const currentTotal = Math.round(perAdult * totalPaxOf(reservation));
  return {
    perAdult,
    currentTotal,
    seatAvailable: summary.seatAvailable,
    flightNumber: summary.flightNumber,
    departDate: summary.departDate,
    arrivalDate: summary.arrivalDate,
    cabinClass: summary.cabinClass,
    class: summary.class,
    currency: summary.currencyCode || 'VND',
    summary,
  };
}

function createReservationWatcher(options = {}) {
  const store = options.store || new ScanStore();
  let timer = null;
  let started = false;
  let running = false;
  let lastRunAt = null;
  let lastError = null;
  let lastReservationCount = 0;
  let lastActiveCount = 0;
  let lastAlertCount = 0;

  function settings() {
    return store.getReservationSettings();
  }

  // Bật/tắt theo dõi thủ công cho 1 PNR (nút "Kích hoạt" khi chỗ đã hết hạn giữ chỗ).
  function setReservationOverride(pnr, on) {
    const key = String(pnr || '').toUpperCase();
    const existing = store.getReservation(key);
    if (!existing) return null;
    return store.upsertReservation(key, {
      watchOverride: !!on,
      // Bật → đánh dấu active ngay để UI phản hồi; giá thật cập nhật ở chu kỳ kế (hoặc bấm Quét ngay).
      active: on ? true : existing.active,
      inactiveReason: on ? '' : existing.inactiveReason,
    });
  }

  function intervalMs() {
    const mins = Math.max(MIN_INTERVAL_MINUTES, Number(settings().intervalMinutes) || 30);
    return mins * 60 * 1000;
  }

  function scheduleNext() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!started || !settings().enabled) return;
    timer = setTimeout(() => {
      runCycle({ manual: false }).catch((e) => logger.error('[reservation-watch] cycle error:', e && e.message));
    }, intervalMs());
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  // Bộ field hiển thị (mirror bảng reservation-status) lưu cho MỌI reservation, bất kể scan được hay không.
  function displayMeta(r) {
    return {
      account: r.account, airline: r.airline,
      from: r.from, to: r.to, date: r.date, departTime: r.departTime,
      customerName: r.customerName, username: r.username,
      heldPrice: r.heldPrice, timelimit: r.timelimitDisplay || '', bookingTime: r.bookingTime || '',
      status: r.status, statusLabel: r.statusLabel,
      adt: r.adt, chd: r.chd, inf: r.inf, paxKnown: r.paxKnown,
      paxTotal: Number(r.paxTotal) || (Number(r.adt || 1) + Number(r.chd || 0) + Number(r.inf || 0)),
    };
  }

  // Lấy SỐ KHÁCH thật của 1 PNR. list-booking KHÔNG trả pax → nếu để mặc định 1 khách thì
  // booking nhiều khách bị so giá sai (held = N×giá, currentTotal ×1 → "rớt giá" giả).
  // Cache trong store (pax 1 PNR không đổi) → chỉ gọi management/booking-view 1 lần/PNR.
  async function resolveReservationPax(r, prev) {
    if (prev && prev.paxKnown && Number(prev.paxTotal) > 0) {
      r.adt = Number(prev.adt) || 1;
      r.chd = Number(prev.chd) || 0;
      r.inf = Number(prev.inf) || 0;
      r.paxKnown = true;
      r.paxTotal = Number(prev.paxTotal);
      return;
    }
    if (r.bookingId) {
      try {
        const pax = await withAccountAutoLogin(r._account || null, (client) => client.getBookingPax(r.bookingId));
        if (pax && pax.paxKnown && pax.total > 0) {
          r.adt = pax.adt; r.chd = pax.chd; r.inf = pax.inf;
          r.paxKnown = true; r.paxTotal = pax.total;
          logger.info('[reservation-watch] pax resolved', { pnr: r.pnr, adt: pax.adt, chd: pax.chd, inf: pax.inf });
          return;
        }
      } catch (paxErr) {
        logger.warn('[reservation-watch] getBookingPax failed', { pnr: r.pnr, error: paxErr && paxErr.message });
      }
    }
    r.paxTotal = totalPaxOf(r); // fallback: pax chưa biết (paxKnown=false) → guard SANE_DROP_RATIO bảo vệ
  }

  async function processReservation(r, s) {
    // Hết hạn giữ chỗ / đã xuất vé / huỷ và user CHƯA kích hoạt → tự động dừng quét.
    if (r._active === false) {
      store.upsertReservation(r.pnr, {
        ...displayMeta(r),
        flightNumber: r.flightNumber || '',
        active: false, watchOverride: !!r._override, scannable: r.scannable,
        inactiveReason: r._inactiveReason || 'Đã dừng quét',
        note: r._inactiveReason ? `Đã dừng quét — ${r._inactiveReason}. Bấm "Kích hoạt" nếu vẫn muốn canh.` : 'Đã dừng quét.',
      });
      return { alerted: false };
    }

    if (!r.scannable) {
      store.upsertReservation(r.pnr, {
        ...displayMeta(r),
        flightNumber: r.flightNumber || '', scannable: false,
        active: true, watchOverride: !!r._override,
        note: r.roundTrip
          ? 'Bỏ qua: vé khứ hồi (MVP chỉ canh one-way).'
          : 'Bỏ qua: thiếu route/ngày/giờ cất cánh để re-scan đúng chuyến.',
      });
      return { alerted: false };
    }

    // Số khách thật (list-booking KHÔNG trả pax → mặc định 1, gây so giá sai cho booking nhiều khách).
    const prev = store.getReservation(r.pnr) || {};
    await resolveReservationPax(r, prev);

    // Re-scan giá bằng CHÍNH tài khoản đã giữ chỗ (giá theo hợp đồng có thể khác nhau giữa tài khoản).
    const scan = await withAccountAutoLogin(r._account || null, (client) => scanReservationFare(client, r));
    const heldPrice = Number(r.heldPrice);
    const minDrop = Number(s.minDropAmount) || 0;
    const currentTotal = scan.currentTotal;
    const dropsBelowHeld = currentTotal < heldPrice - minDrop;
    const risesAboveHeld = currentTotal > heldPrice + minDrop;

    // ⚠️ SAFETY GUARD pax: list-booking KHÔNG trả số khách (paxKnown=false → mặc định 1 ADT).
    // Nếu booking thực tế có nhiều khách, heldPrice = N×giá/khách, currentTotal(×1) sẽ thấp
    // bất thường (~1/N) → "rớt giá" giả. Giá vé thật hiếm khi giảm quá ~40%, nên nếu
    // currentTotal < heldPrice × SANE_DROP_RATIO khi pax chưa biết → coi là lệch pax, KHÔNG alert.
    // (Chỉ áp cho GIẢM — pax chưa biết gây "rớt giả", không gây "tăng giả".)
    const SANE_DROP_RATIO = 0.6;
    const implausibleDrop = !r.paxKnown && heldPrice > 0 && currentTotal < heldPrice * SANE_DROP_RATIO;
    if (implausibleDrop) {
      logger.warn('[reservation-watch] suppressed implausible drop (pax unknown, likely multi-pax booking)', {
        pnr: r.pnr, held: heldPrice, currentTotal, ratio: Number((currentTotal / heldPrice).toFixed(2)),
      });
    }

    const lastAlertPrice = Number.isFinite(Number(prev.lastAlertPrice)) ? Number(prev.lastAlertPrice) : null;
    const lastIncreaseAlertPrice = Number.isFinite(Number(prev.lastIncreaseAlertPrice)) ? Number(prev.lastIncreaseAlertPrice) : null;
    // GIẢM: alert lần đầu rớt, hoặc rớt sâu hơn mức đã alert (chống spam).
    const shouldAlertDrop = dropsBelowHeld
      && !implausibleDrop
      && (lastAlertPrice === null || currentTotal < lastAlertPrice - minDrop);
    // TĂNG (tùy chọn alertOnIncrease): alert lần đầu vượt giá giữ, hoặc tăng cao hơn mức đã báo.
    const shouldAlertIncrease = !!s.alertOnIncrease
      && risesAboveHeld
      && (lastIncreaseAlertPrice === null || currentTotal > lastIncreaseAlertPrice + minDrop);
    const alertKind = shouldAlertDrop ? 'drop' : (shouldAlertIncrease ? 'increase' : null);

    const baseState = {
      ...displayMeta(r),
      flightNumber: scan.flightNumber || r.flightNumber || '',
      active: true, watchOverride: !!r._override, inactiveReason: '', note: undefined,
      lastSeenPrice: currentTotal, lastPerAdult: scan.perAdult, lastSeats: scan.seatAvailable,
      scannable: true, lastScanAt: nowIso(),
      priceNote: implausibleDrop
        ? 'Bỏ qua mức rớt bất thường — list-booking không có số khách, nghi booking nhiều khách.'
        : undefined,
    };

    if (alertKind && isZaloConfigured()) {
      try {
        await sendReservationAlert(r, scan, { direction: alertKind });
        // Reset tracker chiều ngược lại để khi giá đảo chiều vẫn báo lại đúng.
        const alertState = alertKind === 'drop'
          ? { lastAlertPrice: currentTotal, lastAlertAt: nowIso(), lastIncreaseAlertPrice: null }
          : { lastIncreaseAlertPrice: currentTotal, lastIncreaseAlertAt: nowIso(), lastAlertPrice: null };
        store.upsertReservation(r.pnr, { ...baseState, ...alertState });
        logger.success('[reservation-watch] ALERT', { pnr: r.pnr, kind: alertKind, held: heldPrice, now: currentTotal, seats: scan.seatAvailable });
        return { alerted: true };
      } catch (alertErr) {
        logger.error('[reservation-watch] zalo alert failed', { pnr: r.pnr, error: alertErr && alertErr.message });
        store.upsertReservation(r.pnr, baseState);
        return { alerted: false };
      }
    }

    store.upsertReservation(r.pnr, baseState);
    return { alerted: false };
  }

  async function runCycle(opts = {}) {
    if (running) return { skipped: true, reason: 'already running' };
    const s = settings();
    if (!s.enabled && !opts.manual) { scheduleNext(); return { skipped: true, reason: 'disabled' }; }

    running = true;
    const startedAt = Date.now();
    let alertsSent = 0;
    let reservations = [];
    const accounts = (config.accounts && config.accounts.length) ? config.accounts : [null];
    const accountErrors = [];
    try {
      // Quét LẦN LƯỢT từng tài khoản → gom hết PNR đang giữ trên toàn hệ thống.
      const byPnr = new Map();
      for (const account of accounts) {
        const accId = account ? account.id : 'primary';
        try {
          const raw = await withAccountAutoLogin(account, (client) => client.listBooking());
          const rows = Array.isArray(raw && raw.data) ? raw.data : [];
          // Parse 'all' để có cờ held/expired cho mọi booking; lọc theo dõi/đang-quét tính sau.
          const parsed = parseReservations(rows, { scope: 'all', now: Date.now() });
          for (const r of parsed) {
            // PNR thường là duy nhất toàn hệ thống; nếu trùng giữa 2 tài khoản, giữ bản đầu.
            if (byPnr.has(r.pnr)) continue;
            r.account = accId;
            r._account = account; // object runtime để re-scan đúng tài khoản (KHÔNG lưu vào store)
            byPnr.set(r.pnr, r);
          }
          logger.info('[reservation-watch] listBooking', { account: accId, rows: rows.length, parsed: parsed.length });
        } catch (accErr) {
          const msg = String((accErr && accErr.message) || accErr);
          accountErrors.push(`${accId}: ${msg}`);
          logger.error('[reservation-watch] listBooking failed for account', accId, '-', msg);
        }
      }
      // Nếu TẤT CẢ tài khoản đều lỗi → coi như cycle lỗi (đừng prune nhầm hết khi mất mạng).
      if (accountErrors.length === accounts.length && accounts.length > 0) {
        throw new Error(`Tất cả tài khoản lỗi: ${accountErrors.join(' | ')}`);
      }

      // Quyết định theo dõi + đang-quét:
      //  - Chỗ giữ còn sống (held & chưa hết hạn) → tự động theo dõi + quét.
      //  - Chỗ HẾT HẠN giữ chỗ / đã xuất vé / huỷ → TỰ ĐỘNG DỪNG quét (active=false),
      //    vẫn hiện trong bảng kèm nút "Kích hoạt"; chỉ quét tiếp nếu user bật watchOverride.
      //  - Chuyến đã bay → bỏ hẳn (trừ khi user override).
      for (const r of [...byPnr.values()]) {
        const existing = store.getReservation(r.pnr) || null;
        const override = !!(existing && existing.watchOverride);
        // CHỖ GIỮ CÒN HIỆU LỰC = chưa xuất vé/huỷ (held) VÀ còn "thời gian giữ chỗ" trong tương lai.
        // Không có thời gian giữ chỗ (placeholder) hoặc đã qua hạn → hết hạn → tự dừng canh.
        const isActiveHold = r.held && r.hasHoldTime;

        if (r.flightPast && !override) continue; // chuyến đã bay → không theo dõi

        // Hiển thị mọi booking chưa xuất vé/huỷ (held) — kể cả đã hết hạn — để user thấy + Kích hoạt.
        const shouldTrack = s.scope === 'all' || r.held || override || !!existing;
        if (!shouldTrack) continue;

        r._active = isActiveHold || override;
        r._override = override;
        r._inactiveReason = r._active ? '' : (
          r.statusLabel === 'Đã thanh toán' ? 'Đã xuất vé'
            : r.statusLabel === 'Đã void/huỷ' ? 'Đã huỷ/void'
              : 'Hết hạn giữ chỗ' // không còn thời gian giữ chỗ (placeholder hoặc đã qua hạn)
        );
        reservations.push(r);
      }
      lastReservationCount = reservations.length;
      lastActiveCount = reservations.filter((r) => r._active).length;
      store.pruneReservationsNotIn(reservations.map((r) => r.pnr));

      for (const r of reservations) {
        try {
          const res = await processReservation(r, s);
          if (res.alerted) alertsSent += 1;
        } catch (rowErr) {
          logger.warn('[reservation-watch] scan failed for', r.pnr, '-', rowErr && rowErr.message);
          store.upsertReservation(r.pnr, {
            ...displayMeta(r),
            flightNumber: r.flightNumber || '',
            lastError: String((rowErr && rowErr.message) || rowErr).slice(0, 200),
          });
        }
      }
      lastError = accountErrors.length ? accountErrors.join(' | ') : null;
    } catch (err) {
      lastError = String((err && err.message) || err);
      logger.error('[reservation-watch] cycle failed:', lastError);
    } finally {
      running = false;
      lastRunAt = nowIso();
      lastAlertCount = alertsSent;
      scheduleNext();
    }

    const summary = {
      reservations: reservations.length, active: lastActiveCount, alertsSent,
      durationMs: Date.now() - startedAt,
      scope: s.scope, accounts: accounts.length, accountErrors: accountErrors.length,
    };
    logger.info('[reservation-watch] cycle done', summary);
    return summary;
  }

  function start() {
    if (started) return;
    started = true;
    scheduleNext();
    const s = settings();
    logger.info('[reservation-watch] started', { interval: `${s.intervalMinutes}m`, scope: s.scope, enabled: s.enabled });
  }

  function stop() {
    started = false;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function status() {
    const s = settings();
    return {
      enabled: s.enabled, scope: s.scope, intervalMinutes: s.intervalMinutes,
      minDropAmount: s.minDropAmount, alertOnIncrease: !!s.alertOnIncrease, channel: s.channel,
      started, running, lastRunAt, lastError,
      reservationCount: lastReservationCount, activeCount: lastActiveCount, lastAlertCount,
      zaloConfigured: isZaloConfigured(),
    };
  }

  function updateSettings(patch = {}) {
    const clean = {};
    if (patch.enabled !== undefined) clean.enabled = !!patch.enabled;
    if (patch.scope !== undefined && ['held', 'all'].includes(String(patch.scope))) clean.scope = String(patch.scope);
    if (patch.intervalMinutes !== undefined) clean.intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, Number(patch.intervalMinutes) || 30);
    if (patch.minDropAmount !== undefined) clean.minDropAmount = Math.max(0, Number(patch.minDropAmount) || 0);
    if (patch.alertOnIncrease !== undefined) clean.alertOnIncrease = !!patch.alertOnIncrease;
    const saved = store.setReservationSettings(clean);
    scheduleNext();
    return saved;
  }

  return {
    start,
    stop,
    runCycle,
    status,
    settings,
    updateSettings,
    setReservationOverride,
    listReservations: () => store.listReservations(),
  };
}

module.exports = { createReservationWatcher, scanReservationFare, totalPaxOf };
