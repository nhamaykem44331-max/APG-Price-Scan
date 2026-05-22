'use strict';

const {
  parseReservations,
  parseReservationRow,
  reservationStatusLabel,
  isHeldStatus,
  isDeadStatus,
  parseDateTimeMs,
  realTimelimitMs,
  timeFromDateTime,
  normalizeReservationDate,
} = require('../src/scanner/reservation-parser');

const NOW = Date.parse('2026-05-20T10:00:00.000Z');

// Shape khớp response thật của management/list-booking (verify bằng capture).
function row(extra = {}) {
  return {
    id: 42968059,
    airlines: 'VN',
    depCity: 'HAN',
    depDay: '30-05-2026 20:25',
    retCity: 'DAD',
    retDay: '30-05-2026 20:25',
    pnrCode: 'E46PTC',
    customerName: 'NGUYEN QUANG KHAI',
    timelimit: '01-01-1990 00:00',
    bookingTime: '21-05-2026 14:51',
    bookingStatusNote: 'CHECK TIMELIMIT',
    bookingStatus: 0,
    totalPrice: 2048000,
    username: 'HTXTP01',
    ...extra,
  };
}

describe('normalizeReservationDate', () => {
  it('YYYY-MM-DD → DD-MM-YYYY', () => {
    expect(normalizeReservationDate('2026-05-25')).toBe('25-05-2026');
  });
  it('keeps DD-MM-YYYY (with trailing time)', () => {
    expect(normalizeReservationDate('30-05-2026 20:25')).toBe('30-05-2026');
  });
  it('empty → empty', () => {
    expect(normalizeReservationDate('')).toBe('');
  });
});

describe('timeFromDateTime', () => {
  it('extracts HH:MM from "DD-MM-YYYY HH:MM"', () => {
    expect(timeFromDateTime('30-05-2026 20:25')).toBe('20:25');
    expect(timeFromDateTime('30-05-2026 6:05')).toBe('06:05');
  });
  it('empty when no time', () => {
    expect(timeFromDateTime('30-05-2026')).toBe('');
  });
});

describe('isHeldStatus / isDeadStatus (exclusion-based)', () => {
  it('held = anything not issued/cancelled/void', () => {
    expect(isHeldStatus('CHECK TIMELIMIT')).toBe(true);
    expect(isHeldStatus('HOLD')).toBe(true);
    expect(isHeldStatus('WAIT')).toBe(true);
    expect(isHeldStatus('')).toBe(true); // chưa rõ trạng thái → mặc định coi là giữ
  });
  it('dead = issued/cancelled/void/refund', () => {
    expect(isDeadStatus('ISSUED')).toBe(true);
    expect(isDeadStatus('TICKETED')).toBe(true);
    expect(isDeadStatus('CANCELLED')).toBe(true);
    expect(isDeadStatus('Đã xuất vé')).toBe(true);
    expect(isHeldStatus('ISSUED')).toBe(false);
    expect(isHeldStatus('VOID')).toBe(false);
  });
});

describe('reservationStatusLabel (map sang nhãn trang reservation-status)', () => {
  it('maps verified real statuses', () => {
    expect(reservationStatusLabel('TIME OUT COMMING', 0)).toBe('Giữ chỗ');
    expect(reservationStatusLabel('CHECK TIMELIMIT', 0)).toBe('Chưa xác định');
    expect(reservationStatusLabel('ISSUE TICKET', 1)).toBe('Đã thanh toán');
    expect(reservationStatusLabel('TIME LIMIT OUT', 0)).toBe('Quá hạn');
    expect(reservationStatusLabel('VOID', 0)).toBe('Đã void/huỷ');
  });
  it('code 1 = đã thanh toán dù note khác', () => {
    expect(reservationStatusLabel('whatever', 1)).toBe('Đã thanh toán');
  });
  it('parsed row carries statusLabel + timelimitDisplay', () => {
    const r = parseReservationRow(row({ bookingStatusNote: 'TIME OUT COMMING', timelimit: '22-05-2026 00:12' }), { now: NOW });
    expect(r.statusLabel).toBe('Giữ chỗ');
    expect(r.timelimitDisplay).toBe('22-05-2026 00:12');
    // placeholder timelimit → display rỗng
    expect(parseReservationRow(row(), { now: NOW }).timelimitDisplay).toBe('');
  });
});

describe('parseDateTimeMs', () => {
  it('parses DD-MM-YYYY HH:MM:SS', () => {
    expect(parseDateTimeMs('25-05-2026 18:00:00')).toBe(new Date(2026, 4, 25, 18, 0, 0).getTime());
  });
  it('parses date-only DD-MM-YYYY', () => {
    expect(parseDateTimeMs('25-05-2026')).toBe(new Date(2026, 4, 25, 0, 0, 0).getTime());
  });
  it('returns null for junk', () => {
    expect(parseDateTimeMs('n/a')).toBeNull();
  });
});

describe('realTimelimitMs (placeholder handling)', () => {
  it('treats 01-01-1990 placeholder as null (no real timelimit)', () => {
    expect(realTimelimitMs('01-01-1990 00:00')).toBeNull();
  });
  it('returns ms for a real timelimit', () => {
    expect(realTimelimitMs('25-05-2026 18:00:00')).toBe(new Date(2026, 4, 25, 18, 0, 0).getTime());
  });
});

describe('parseReservationRow', () => {
  it('maps verified real fields', () => {
    const r = parseReservationRow(row(), { now: NOW });
    expect(r.pnr).toBe('E46PTC');
    expect(r.heldPrice).toBe(2048000);
    expect(r.from).toBe('HAN');
    expect(r.to).toBe('DAD');
    expect(r.date).toBe('30-05-2026');
    expect(r.departTime).toBe('20:25');
    expect(r.airline).toBe('VN');
    expect(r.adt).toBe(1);
    expect(r.paxKnown).toBe(false);
    expect(r.roundTrip).toBe(false);
    expect(r.held).toBe(true);
    expect(r.expired).toBe(false); // placeholder timelimit + future flight
    expect(r.scannable).toBe(true);
  });

  it('detects round-trip when retDay date differs from depDay date → not scannable (MVP one-way only)', () => {
    const r = parseReservationRow(row({ retDay: '05-06-2026 09:10' }), { now: NOW });
    expect(r.roundTrip).toBe(true);
    expect(r.returnDate).toBe('05-06-2026');
    expect(r.scannable).toBe(false);
  });

  it('hasHoldTime: chỉ true khi timelimit thật & trong tương lai (placeholder/past → false)', () => {
    expect(parseReservationRow(row(), { now: NOW }).hasHoldTime).toBe(false); // placeholder 01-01-1990
    expect(parseReservationRow(row({ timelimit: '25-05-2026 18:00' }), { now: NOW }).hasHoldTime).toBe(true); // future
    expect(parseReservationRow(row({ timelimit: '01-01-2020 00:00' }), { now: NOW }).hasHoldTime).toBe(false); // past
  });

  it('marks expired when a real timelimit passed', () => {
    const r = parseReservationRow(row({ timelimit: '01-01-2020 10:00:00' }), { now: NOW });
    expect(r.expired).toBe(true);
    expect(r.timelimitExpired).toBe(true);
  });

  it('marks expired when flight already departed', () => {
    const r = parseReservationRow(row({ depDay: '01-01-2026 08:00' }), { now: NOW });
    expect(r.flightPast).toBe(true);
    expect(r.expired).toBe(true);
  });

  it('not scannable when departTime missing', () => {
    const r = parseReservationRow(row({ depDay: '30-05-2026' }), { now: NOW });
    expect(r.departTime).toBe('');
    expect(r.scannable).toBe(false);
  });

  it('reads pax when present (paxKnown=true)', () => {
    const r = parseReservationRow(row({ numberOfAdult: 2, numberOfChildren: 1 }), { now: NOW });
    expect(r.adt).toBe(2);
    expect(r.chd).toBe(1);
    expect(r.paxKnown).toBe(true);
  });
});

describe('parseReservations scope', () => {
  const rows = [
    row({ pnrCode: 'HELD1', bookingStatusNote: 'CHECK TIMELIMIT' }),
    row({ pnrCode: 'ISSUED1', bookingStatusNote: 'ISSUED' }),
    row({ pnrCode: 'EXPIRED1', bookingStatusNote: 'CHECK TIMELIMIT', timelimit: '01-01-2020 00:00:00' }),
  ];

  it('scope=all returns everything with a pnr', () => {
    const out = parseReservations(rows, { scope: 'all', now: NOW });
    expect(out.map((r) => r.pnr).sort()).toEqual(['EXPIRED1', 'HELD1', 'ISSUED1']);
  });

  it('scope=held returns only held + not expired', () => {
    const out = parseReservations(rows, { scope: 'held', now: NOW });
    expect(out.map((r) => r.pnr)).toEqual(['HELD1']);
  });

  it('handles empty/non-array input', () => {
    expect(parseReservations(null)).toEqual([]);
    expect(parseReservations(undefined)).toEqual([]);
  });
});
