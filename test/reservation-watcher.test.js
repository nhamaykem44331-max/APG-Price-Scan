'use strict';

jest.mock('../src/scanner/scan-service', () => ({
  withScannerAutoLogin: jest.fn(),
  withAccountAutoLogin: jest.fn(),
}));
jest.mock('../src/config', () => ({
  // 2 tài khoản cho test multi-account (watcher loop lần lượt từng tài khoản).
  accounts: [
    { id: 'primary', username: 'HTXTP01', sessionFile: './session/storage-state.json' },
    { id: 'account2', username: 'HTXTP02', sessionFile: './session/storage-state-2.json' },
  ],
}));
jest.mock('../src/scanner/zalo', () => ({
  isZaloConfigured: jest.fn(() => true),
  sendReservationAlert: jest.fn(async () => ({ ok: true, attempts: 1 })),
}));
jest.mock('../src/booking-workflow', () => ({
  searchJourney: jest.fn(async () => ({ flights: [{ id: 'f1' }] })),
  selectFlight: jest.fn(() => ({ id: 'f1' })),
  cheapestFare: jest.fn(() => ({ fare: {}, total: 0 })),
  summarizeFlightFare: jest.fn(() => ({
    seatAvailable: 5, currencyCode: 'VND', flightNumber: 'VJ125', departDate: '', class: 'E', cabinClass: 'Economy',
  })),
}));

const scanService = require('../src/scanner/scan-service');
const zalo = require('../src/scanner/zalo');
const bw = require('../src/booking-workflow');
const { createReservationWatcher } = require('../src/scanner/reservation-watcher');

function makeStore(settingsOverride = {}) {
  const reservations = new Map();
  let settings = {
    enabled: true, scope: 'all', intervalMinutes: 30, minDropAmount: 0, channel: 'zalo',
    ...settingsOverride,
  };
  return {
    getReservationSettings: () => ({ ...settings }),
    setReservationSettings: (p) => { settings = { ...settings, ...p }; return { ...settings }; },
    getReservation: (pnr) => reservations.get(String(pnr).toUpperCase()) || null,
    upsertReservation: (pnr, patch) => {
      const key = String(pnr).toUpperCase();
      const prev = reservations.get(key) || { pnr: key };
      const next = { ...prev, ...patch, pnr: key };
      reservations.set(key, next);
      return next;
    },
    pruneReservationsNotIn: (pnrs) => {
      const keep = new Set(pnrs.map((p) => String(p).toUpperCase()));
      for (const k of [...reservations.keys()]) if (!keep.has(k)) reservations.delete(k);
      return { removed: 0 };
    },
    pruneInactiveReservations: (maxKeep = 15) => {
      const inactive = [...reservations.values()]
        .filter((r) => r.active === false)
        .sort((a, b) => String(b.bookingTime || '').localeCompare(String(a.bookingTime || '')));
      if (inactive.length <= maxKeep) return { removed: 0 };
      let removed = 0;
      for (const r of inactive.slice(maxKeep)) {
        reservations.delete(String(r.pnr).toUpperCase());
        removed += 1;
      }
      return { removed };
    },
    listReservations: () => [...reservations.values()],
  };
}

// Shape khớp response thật của management/list-booking (depCity/retCity/depDay với giờ,
// bookingStatusNote, timelimit placeholder). Ngày bay đặt xa (2030) để không bị flightPast.
function heldRow(extra = {}) {
  return {
    id: 1, pnrCode: 'P1', totalPrice: 2000000,
    airlines: 'VJ',
    bookingStatusNote: 'TIME OUT COMMING', bookingStatus: 0,
    timelimit: '01-01-2031 00:00', // còn thời gian giữ chỗ trong tương lai → active hold
    depCity: 'HAN', retCity: 'SGN',
    depDay: '25-05-2030 08:00', retDay: '25-05-2030 08:00',
    bookingTime: '20-05-2026 10:00',
    ...extra,
  };
}

// Chỗ giữ ĐÃ HẾT HẠN: status "TIME LIMIT OUT" + timelimit thật đã qua → expired=true, held=false.
function expiredRow(extra = {}) {
  return heldRow({ bookingStatusNote: 'TIME LIMIT OUT', timelimit: '01-01-2020 00:00', ...extra });
}

// Configure list-booking rows + current per-adult fare for a cycle.
function setScenario(rows, perAdult) {
  scanService.withAccountAutoLogin.mockImplementation((account, op) => op({
    listBooking: async () => ({ data: rows }),
  }));
  bw.cheapestFare.mockReturnValue({ fare: {}, total: perAdult });
}

beforeEach(() => {
  jest.clearAllMocks();
  zalo.isZaloConfigured.mockReturnValue(true);
  bw.searchJourney.mockResolvedValue({ flights: [{ id: 'f1' }] });
  bw.selectFlight.mockReturnValue({ id: 'f1' });
  bw.summarizeFlightFare.mockReturnValue({
    seatAvailable: 5, currencyCode: 'VND', flightNumber: 'VJ125', departDate: '',
  });
});

describe('reservation watcher — alert + dedup', () => {
  it('alerts once when current drops below held', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 1800000); // held 2.0M, current 1.8M
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(1);
    expect(r.alertsSent).toBe(1);
    expect(zalo.sendReservationAlert).toHaveBeenCalledTimes(1);
    const saved = store.getReservation('P1');
    expect(saved.lastAlertPrice).toBe(1800000);
  });

  it('does NOT re-alert when price stays the same (not deeper)', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 1800000);
    await w.runCycle({ manual: true }); // first alert
    zalo.sendReservationAlert.mockClear();
    setScenario([heldRow()], 1800000); // same price again
    const r2 = await w.runCycle({ manual: true });
    expect(r2.alertsSent).toBe(0);
    expect(zalo.sendReservationAlert).not.toHaveBeenCalled();
  });

  it('re-alerts when price drops deeper than last alert', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 1800000);
    await w.runCycle({ manual: true });
    zalo.sendReservationAlert.mockClear();
    setScenario([heldRow()], 1600000); // deeper drop
    const r2 = await w.runCycle({ manual: true });
    expect(r2.alertsSent).toBe(1);
    expect(store.getReservation('P1').lastAlertPrice).toBe(1600000);
  });

  it('does NOT alert when current is not below held', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 2200000); // current above held
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(0);
    expect(zalo.sendReservationAlert).not.toHaveBeenCalled();
  });

  it('respects minDropAmount threshold', async () => {
    const store = makeStore({ minDropAmount: 100000 });
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 1950000); // only 50k cheaper, below 100k threshold
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(0);

    setScenario([heldRow()], 1850000); // 150k cheaper, above threshold
    const r2 = await w.runCycle({ manual: true });
    expect(r2.alertsSent).toBe(1);
  });

  it('multiplies per-adult by pax for total comparison', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    // held total 4.0M for 2 adults; current 1.8M/adult ×2 = 3.6M < 4.0M → alert
    setScenario([heldRow({ totalPrice: 4000000, numberOfAdult: 2 })], 1800000);
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(1);
    expect(store.getReservation('P1').lastSeenPrice).toBe(3600000);
  });

  it('suppresses implausible drop when pax unknown (likely multi-pax booking)', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    // held 2.0M, current per-adult 0.9M ×1 = 0.9M → ratio 0.45 < 0.6 → suspected pax mismatch, no alert.
    setScenario([heldRow()], 900000);
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(0);
    expect(zalo.sendReservationAlert).not.toHaveBeenCalled();
    expect(store.getReservation('P1').priceNote).toMatch(/bất thường|nhiều khách/);
  });

  it('does NOT suppress implausible drop when pax is known', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    // pax known (2 ADT), held 2.0M, perAdult 0.9M ×2 = 1.8M → ratio 0.9 → genuine drop, alert.
    setScenario([heldRow({ numberOfAdult: 2 })], 900000);
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(1);
  });

  it('scope=held filters out issued bookings', async () => {
    const store = makeStore({ scope: 'held' });
    const w = createReservationWatcher({ store });
    setScenario([
      heldRow({ pnrCode: 'HELD1', bookingStatusNote: 'CHECK TIMELIMIT' }),
      heldRow({ pnrCode: 'ISSUED1', bookingStatusNote: 'ISSUED' }),
    ], 1800000);
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(1); // only HELD1
  });

  it('skips alert when Zalo not configured', async () => {
    zalo.isZaloConfigured.mockReturnValue(false);
    const store = makeStore();
    const w = createReservationWatcher({ store });
    setScenario([heldRow()], 1800000);
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(0);
    expect(zalo.sendReservationAlert).not.toHaveBeenCalled();
  });

  it('merges held reservations across BOTH accounts (quét lần lượt 2 tài khoản)', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    // Mỗi tài khoản chỉ thấy PNR của mình: primary→P1, account2→CTHBN3.
    scanService.withAccountAutoLogin.mockImplementation((account, op) => {
      const rows = account && account.id === 'account2'
        ? [heldRow({ pnrCode: 'CTHBN3', airlines: 'VJ', depCity: 'HAN', retCity: 'PQC' })]
        : [heldRow({ pnrCode: 'P1' })];
      return op({ listBooking: async () => ({ data: rows }) });
    });
    bw.cheapestFare.mockReturnValue({ fare: {}, total: 2200000 }); // không rớt → không alert
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(2);
    expect(r.accounts).toBe(2);
    const pnrs = store.listReservations().map((x) => x.pnr).sort();
    expect(pnrs).toEqual(['CTHBN3', 'P1']);
    // Mỗi reservation lưu đúng tài khoản nguồn.
    expect(store.getReservation('CTHBN3').account).toBe('account2');
    expect(store.getReservation('P1').account).toBe('primary');
  });

  it('still merges when ONE account fails (không làm hỏng cả cycle)', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    scanService.withAccountAutoLogin.mockImplementation((account, op) => {
      if (account && account.id === 'account2') throw new Error('Token hết hạn');
      return op({ listBooking: async () => ({ data: [heldRow({ pnrCode: 'P1' })] }) });
    });
    bw.cheapestFare.mockReturnValue({ fare: {}, total: 2200000 });
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(1); // chỉ primary
    expect(r.accountErrors).toBe(1);
    expect(w.status().lastError).toMatch(/account2/);
  });

  it('does NOT add a brand-new expired hold (auto-skip, scope held)', async () => {
    const store = makeStore({ scope: 'held' });
    const w = createReservationWatcher({ store });
    setScenario([expiredRow({ pnrCode: 'EXP1' })], 1800000);
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(0);
  });

  it('auto-stops scanning when a tracked hold expires (no alert)', async () => {
    const store = makeStore({ scope: 'held' });
    store.upsertReservation('P1', { heldPrice: 2000000 }); // đã từng được theo dõi
    const w = createReservationWatcher({ store });
    setScenario([expiredRow({ pnrCode: 'P1' })], 1000000); // giá rẻ hơn nhưng đã hết hạn
    const r = await w.runCycle({ manual: true });
    expect(r.reservations).toBe(1);
    expect(r.active).toBe(0);
    expect(r.alertsSent).toBe(0);
    const saved = store.getReservation('P1');
    expect(saved.active).toBe(false);
    expect(saved.inactiveReason).toMatch(/hết hạn/i);
    expect(zalo.sendReservationAlert).not.toHaveBeenCalled();
  });

  it('user override keeps scanning an expired hold (alerts on drop)', async () => {
    const store = makeStore({ scope: 'held' });
    store.upsertReservation('P1', { heldPrice: 2000000, watchOverride: true });
    const w = createReservationWatcher({ store });
    setScenario([expiredRow({ pnrCode: 'P1' })], 1800000); // rẻ hơn
    const r = await w.runCycle({ manual: true });
    expect(r.active).toBe(1);
    expect(r.alertsSent).toBe(1);
    expect(store.getReservation('P1').active).toBe(true);
  });

  it('setReservationOverride toggles watchOverride (uppercases pnr, null if missing)', () => {
    const store = makeStore();
    store.upsertReservation('P1', { heldPrice: 2000000 });
    const w = createReservationWatcher({ store });
    expect(w.setReservationOverride('p1', true).watchOverride).toBe(true);
    expect(w.setReservationOverride('NOPE', true)).toBeNull();
  });

  it('handles listBooking failure without throwing', async () => {
    const store = makeStore();
    const w = createReservationWatcher({ store });
    scanService.withAccountAutoLogin.mockImplementation(() => { throw new Error('Token hết hạn'); });
    const r = await w.runCycle({ manual: true });
    expect(r.alertsSent).toBe(0);
    expect(w.status().lastError).toMatch(/Token/);
  });
});
