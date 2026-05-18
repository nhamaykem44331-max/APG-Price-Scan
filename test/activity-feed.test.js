'use strict';

const { buildActivity, mapChangeToEvent } = require('../src/scanner/job-stats');

function job(id, name, extra = {}) {
  return {
    id,
    name,
    query: { from: 'HAN', to: 'SGN', flightNumber: 'VJ125', ...(extra.query || {}) },
  };
}

function runWithChanges(id, jobId, offsetSec, changes, extra = {}) {
  const t = new Date(Date.parse('2026-05-18T12:00:00.000Z') - offsetSec * 1000).toISOString();
  return {
    id,
    jobId,
    startedAt: t,
    status: extra.status || 'success',
    matchCount: extra.matchCount || (extra.results ? extra.results.length : 1),
    results: extra.results,
    comparison: { hasPrevious: true, changed: changes.length > 0, changes },
    ...extra,
  };
}

describe('mapChangeToEvent', () => {
  const j = job('job_1', 'VJ125 HAN-SGN');
  const baseRun = { id: 'r1', startedAt: '2026-05-18T12:00:00.000Z' };

  it('price drop → kind=down', () => {
    const ev = mapChangeToEvent(
      { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1929000, newTotalAmount: 1846000, delta: -83000, percent: -4.3 },
      baseRun,
      j
    );
    expect(ev.kind).toBe('down');
    expect(ev.detail).toMatch(/1\.929\.000.*1\.846\.000.*-4\.3%/);
    expect(ev.meta.deltaPct).toBe(-4.3);
  });

  it('price rise → kind=up', () => {
    const ev = mapChangeToEvent(
      { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1846000, newTotalAmount: 1929000, delta: 83000, percent: 4.5 },
      baseRun,
      j
    );
    expect(ev.kind).toBe('up');
    expect(ev.detail).toMatch(/\+4\.5%/);
  });

  it('seat sold-out → kind=sold', () => {
    const ev = mapChangeToEvent(
      { type: 'seat', flightNumber: 'VJ125', departTime: '07:00', oldSeats: 3, newSeats: 0, seatDelta: -3, soldOut: true },
      baseRun,
      j
    );
    expect(ev.kind).toBe('sold');
    expect(ev.detail).toMatch(/Sold out/);
  });

  it('seat change non-sold → kind=seat', () => {
    const ev = mapChangeToEvent(
      { type: 'seat', flightNumber: 'VJ125', departTime: '07:00', oldSeats: 9, newSeats: 3, seatDelta: -6, soldOut: false },
      baseRun,
      j
    );
    expect(ev.kind).toBe('seat');
    expect(ev.detail).toMatch(/9 ghế.*3 ghế/);
  });

  it('new flight → kind=new', () => {
    const ev = mapChangeToEvent(
      { type: 'new', flightNumber: 'VJ127', departTime: '11:30', totalAmount: 2400000 },
      baseRun,
      j
    );
    expect(ev.kind).toBe('new');
  });

  it('removed flight → kind=removed', () => {
    const ev = mapChangeToEvent(
      { type: 'removed', flightNumber: 'VJ129', departTime: '15:00' },
      baseRun,
      j
    );
    expect(ev.kind).toBe('removed');
  });
});

describe('buildActivity', () => {
  it('returns events sorted DESC by t', () => {
    const jobs = [job('job_1', 'VJ125'), job('job_2', 'VJ256')];
    const runs = [
      runWithChanges('r_old', 'job_1', 600, [
        { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1000, newTotalAmount: 900, delta: -100, percent: -10 },
      ]),
      runWithChanges('r_new', 'job_2', 60, [
        { type: 'seat', flightNumber: 'VJ256', departTime: '08:00', oldSeats: 5, newSeats: 0, seatDelta: -5, soldOut: true },
      ]),
    ];
    const events = buildActivity(jobs, runs);
    expect(events).toHaveLength(2);
    expect(events[0].id).toContain('r_new');
    expect(events[1].id).toContain('r_old');
  });

  it('emits one event per change', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [
      runWithChanges('r1', 'job_1', 60, [
        { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1000, newTotalAmount: 900, delta: -100, percent: -10 },
        { type: 'seat', flightNumber: 'VJ125', departTime: '07:00', oldSeats: 5, newSeats: 2, seatDelta: -3, soldOut: false },
      ]),
    ];
    const events = buildActivity(jobs, runs);
    expect(events).toHaveLength(2);
  });

  it('emits error event for failed runs', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [
      { id: 'rerr', jobId: 'job_1', startedAt: '2026-05-18T12:00:00.000Z', status: 'error', error: 'Connection refused' },
    ];
    const events = buildActivity(jobs, runs);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
    expect(events[0].detail).toMatch(/Connection refused/);
  });

  it('respects limit', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [];
    for (let i = 0; i < 20; i += 1) {
      runs.push(runWithChanges(`r${i}`, 'job_1', i * 60, [
        { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1000, newTotalAmount: 900 + i, delta: -100 + i, percent: -10 },
      ]));
    }
    const events = buildActivity(jobs, runs, { limit: 5 });
    expect(events).toHaveLength(5);
  });

  it('honors kinds filter', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [
      runWithChanges('r1', 'job_1', 60, [
        { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1000, newTotalAmount: 900, delta: -100, percent: -10 },
        { type: 'seat', flightNumber: 'VJ125', departTime: '07:00', oldSeats: 5, newSeats: 0, seatDelta: -5, soldOut: true },
      ]),
    ];
    const events = buildActivity(jobs, runs, { kinds: ['sold'] });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('sold');
  });

  it('skips runs without changes when scan kind not included', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [runWithChanges('r1', 'job_1', 60, [], { matchCount: 3 })];
    const events = buildActivity(jobs, runs, { kinds: ['down', 'up'] });
    expect(events).toHaveLength(0);
  });

  it('emits scan kind for unchanged successful runs when not filtered', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [runWithChanges('r1', 'job_1', 60, [], { matchCount: 3 })];
    const events = buildActivity(jobs, runs);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('scan');
  });

  it('drops events before since cutoff', () => {
    const jobs = [job('job_1', 'VJ125')];
    const runs = [
      runWithChanges('r_old', 'job_1', 3600, [
        { type: 'price', flightNumber: 'VJ125', departTime: '07:00', oldTotalAmount: 1000, newTotalAmount: 900, delta: -100, percent: -10 },
      ]),
      runWithChanges('r_new', 'job_1', 60, [
        { type: 'seat', flightNumber: 'VJ125', departTime: '07:00', oldSeats: 5, newSeats: 0, seatDelta: -5, soldOut: true },
      ]),
    ];
    const since = new Date(Date.parse('2026-05-18T12:00:00.000Z') - 30 * 60 * 1000).toISOString();
    const events = buildActivity(jobs, runs, { since });
    expect(events).toHaveLength(1);
    expect(events[0].id).toContain('r_new');
  });
});
