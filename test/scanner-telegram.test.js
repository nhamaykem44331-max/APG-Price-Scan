'use strict';

const { buildScanReport, buildChangeSummary, flightLine, groupByAirline } = require('../src/scanner/telegram');

function flight(extra = {}) {
  return {
    airlineCode: 'VJ',
    flightNumber: 'VJ125',
    departTime: '07:00',
    arrivalTime: '09:30',
    cabinClass: 'Economy',
    class: 'E',
    totalAmount: 2500000,
    currency: 'VND',
    seatAvailable: 9,
    ...extra,
  };
}

const baseJob = { id: 'job_1', name: 'VJ125', query: { from: 'HAN', to: 'SGN', date: '14-05-2026' } };

describe('flightLine', () => {
  it('uses red prefix when seatAvailable is 0', () => {
    expect(flightLine(flight({ seatAvailable: 0 }))).toMatch(/^🔴/);
    expect(flightLine(flight({ seatAvailable: 0 }))).toMatch(/SOLD$/);
  });

  it('uses yellow prefix when seatAvailable < 5', () => {
    expect(flightLine(flight({ seatAvailable: 3 }))).toMatch(/^🟡/);
  });

  it('uses no prefix when seatAvailable >= 5', () => {
    const line = flightLine(flight({ seatAvailable: 9 }));
    expect(line.startsWith('🔴')).toBe(false);
    expect(line.startsWith('🟡')).toBe(false);
  });
});

describe('buildChangeSummary', () => {
  it('returns empty string when no previous', () => {
    expect(buildChangeSummary(null)).toBe('');
    expect(buildChangeSummary({ hasPrevious: false })).toBe('');
  });

  it('shows ↓ avg % for price drops', () => {
    const comparison = {
      hasPrevious: true,
      changes: [
        { type: 'price', delta: -50000, percent: -2 },
        { type: 'price', delta: -100000, percent: -4 },
      ],
    };
    const summary = buildChangeSummary(comparison);
    expect(summary).toMatch(/2↓/);
    expect(summary).toMatch(/avg -3\.0%/);
  });

  it('counts SOLD flights in seat changes', () => {
    const comparison = {
      hasPrevious: true,
      changes: [
        { type: 'seat', soldOut: true },
        { type: 'seat', soldOut: false },
      ],
    };
    const summary = buildChangeSummary(comparison);
    expect(summary).toMatch(/2 chỗ đổi.*1 SOLD/);
  });
});

describe('groupByAirline', () => {
  it('groups flights by airlineCode and sorts by total', () => {
    const grouped = groupByAirline([
      flight({ airlineCode: 'VJ', flightNumber: 'VJ125', totalAmount: 2500000 }),
      flight({ airlineCode: 'VN', flightNumber: 'VN201', totalAmount: 3000000 }),
      flight({ airlineCode: 'VJ', flightNumber: 'VJ127', totalAmount: 2400000 }),
    ]);
    expect(grouped.get('VJ')[0].flightNumber).toBe('VJ127');
    expect(grouped.get('VN')).toHaveLength(1);
  });
});

describe('buildScanReport', () => {
  it('returns single error message when run failed', () => {
    const messages = buildScanReport(baseJob, { status: 'error', startedAt: 'now', error: 'boom' });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^⚠️ /);
    expect(messages[0]).toMatch(/Status: ERROR/);
  });

  it('uses 🆕 emoji for first scan', () => {
    const run = {
      status: 'success',
      startedAt: 'now',
      results: [flight()],
      comparison: { hasPrevious: false, changed: true },
    };
    const messages = buildScanReport(baseJob, run);
    expect(messages[0]).toMatch(/^🆕 /);
  });

  it('uses 🔇 emoji when emptyStreak threshold reached', () => {
    const run = {
      status: 'success',
      startedAt: 'now',
      results: [],
      emptyStreak: 3,
    };
    const messages = buildScanReport(baseJob, run);
    expect(messages[0]).toMatch(/^🔇 /);
    expect(messages[0]).toMatch(/Empty results 3 lần liên tiếp/);
  });

  it('groups flights by airline with divider', () => {
    const run = {
      status: 'success',
      startedAt: 'now',
      results: [
        flight({ airlineCode: 'VJ', flightNumber: 'VJ125' }),
        flight({ airlineCode: 'VN', flightNumber: 'VN201' }),
      ],
    };
    const messages = buildScanReport(baseJob, run);
    expect(messages[0]).toMatch(/── VJ ──/);
    expect(messages[0]).toMatch(/── VN ──/);
  });

  it('splits into multiple messages when content exceeds safe length', () => {
    const results = [];
    for (const airline of ['VJ', 'VN', 'QH']) {
      for (let i = 0; i < 30; i += 1) {
        results.push(flight({
          airlineCode: airline,
          flightNumber: `${airline}${100 + i}`,
        }));
      }
    }
    const messages = buildScanReport(baseJob, { status: 'success', startedAt: 'now', results });
    expect(messages.length).toBeGreaterThan(1);
    messages.forEach((m) => expect(m.length).toBeLessThanOrEqual(3900));
    expect(messages[0]).toMatch(/\(1\/\d+\)$/);
    expect(messages[messages.length - 1]).toMatch(/\(\d+\/\d+\)$/);
  });

  it('shows 🛑 for auto-disabled job', () => {
    const run = {
      status: 'error',
      startedAt: 'now',
      error: 'down',
      autoDisabledByCircuitBreaker: true,
      autoDisableReason: '5 consecutive failures',
    };
    const messages = buildScanReport(baseJob, run);
    expect(messages[0]).toMatch(/^🛑 /);
  });
});
