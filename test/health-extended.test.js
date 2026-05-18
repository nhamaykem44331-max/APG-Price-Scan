'use strict';

const { extendedScannerStats } = require('../src/scanner/job-stats');

const NOW = Date.parse('2026-05-18T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function job(id, extra = {}) {
  return { id, enabled: true, query: { flightNumber: 'VJ125' }, ...extra };
}

function run(id, jobId, hoursAgo, status = 'success', notification = null, extra = {}) {
  return {
    id,
    jobId,
    startedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    status,
    notification: notification || undefined,
    results: extra.results,
  };
}

describe('extendedScannerStats', () => {
  it('counts scans in last 24h vs previous 24h', () => {
    const jobs = [job('j1')];
    const runs = [
      run('r1', 'j1', 1),    // in 24h
      run('r2', 'j1', 5),    // in 24h
      run('r3', 'j1', 25),   // in prev 24h
      run('r4', 'j1', 30),   // in prev 24h
      run('r5', 'j1', 60),   // outside
    ];
    const stats = extendedScannerStats(jobs, runs, [], { now: NOW });
    expect(stats.totalScans24h).toBe(2);
    expect(stats.totalScansPrev24h).toBe(2);
    expect(stats.totalScansDeltaPct).toBe(0);
  });

  it('computes negative deltaPct when scans decreased', () => {
    const runs = [run('r1', 'j1', 1), run('r2', 'j1', 25), run('r3', 'j1', 26), run('r4', 'j1', 27)];
    const stats = extendedScannerStats([job('j1')], runs, [], { now: NOW });
    expect(stats.totalScans24h).toBe(1);
    expect(stats.totalScansPrev24h).toBe(3);
    expect(stats.totalScansDeltaPct).toBeLessThan(0);
  });

  it('fills scansByHour array length 24', () => {
    const runs = [run('r1', 'j1', 0), run('r2', 'j1', 1), run('r3', 'j1', 23)];
    const stats = extendedScannerStats([job('j1')], runs, [], { now: NOW });
    expect(stats.scansByHour).toHaveLength(24);
    expect(stats.scansByHour.reduce((acc, v) => acc + v, 0)).toBe(3);
    // Most recent should be at index 23
    expect(stats.scansByHour[23]).toBe(1);
    expect(stats.scansByHour[22]).toBe(1);
    expect(stats.scansByHour[0]).toBe(1);
  });

  it('counts totalScansLastHour separately', () => {
    const runs = [run('r1', 'j1', 0.2), run('r2', 'j1', 0.5), run('r3', 'j1', 3)];
    const stats = extendedScannerStats([job('j1')], runs, [], { now: NOW });
    expect(stats.totalScansLastHour).toBe(2);
  });

  it('aggregates notification stats from run.notification', () => {
    const runs = [
      run('r1', 'j1', 1, 'success', { status: 'sent', attempts: 1 }),
      run('r2', 'j1', 2, 'success', { status: 'sent', attempts: 3 }), // retried
      run('r3', 'j1', 3, 'success', { status: 'failed', attempts: 3 }),
      run('r4', 'j1', 5, 'success', { status: 'sent', attempts: 1 }),
    ];
    const stats = extendedScannerStats([job('j1')], runs, [], { now: NOW });
    expect(stats.notifyStats24h.sent).toBe(3);
    expect(stats.notifyStats24h.failed).toBe(1);
    // r2 sent after 3 attempts + r3 failed after 3 attempts = 2 notifications needed retry
    expect(stats.notifyStats24h.retried).toBe(2);
    expect(stats.notifyStats24h.successRate).toBe(75);
  });

  it('falls back to store notifications when run.notification missing', () => {
    const notifications = [
      { id: 'n1', status: 'sent', createdAt: new Date(NOW - HOUR).toISOString(), attempts: 1 },
      { id: 'n2', status: 'failed', createdAt: new Date(NOW - 2 * HOUR).toISOString(), attempts: 3 },
    ];
    const stats = extendedScannerStats([job('j1')], [], notifications, { now: NOW });
    expect(stats.notifyStats24h.sent).toBe(1);
    expect(stats.notifyStats24h.failed).toBe(1);
    expect(stats.notifyStats24h.retried).toBe(1);
    expect(stats.notifyStats24h.successRate).toBe(50);
  });

  it('returns 100% successRate when no notifications', () => {
    const stats = extendedScannerStats([job('j1')], [run('r1', 'j1', 1)], [], { now: NOW });
    expect(stats.notifyStats24h.successRate).toBe(100);
  });

  it('counts lowSeatCount (1..3) and soldOutCount (0)', () => {
    const runs = [
      run('r_low', 'j_low', 1, 'success', null, { results: [{ flightNumber: 'VJ125', totalAmount: 1000, seatAvailable: 2 }] }),
      run('r_sold', 'j_sold', 1, 'success', null, { results: [{ flightNumber: 'VJ125', totalAmount: 1000, seatAvailable: 0 }] }),
      run('r_ok', 'j_ok', 1, 'success', null, { results: [{ flightNumber: 'VJ125', totalAmount: 1000, seatAvailable: 9 }] }),
    ];
    const jobs = [job('j_low'), job('j_sold'), job('j_ok')];
    const stats = extendedScannerStats(jobs, runs, [], { now: NOW });
    expect(stats.lowSeatCount).toBe(1);
    expect(stats.soldOutCount).toBe(1);
  });

  it('handles zero data without crashing', () => {
    const stats = extendedScannerStats([], [], [], { now: NOW });
    expect(stats.totalScans24h).toBe(0);
    expect(stats.totalScansPrev24h).toBe(0);
    expect(stats.totalScansDeltaPct).toBe(0);
    expect(stats.notifyStats24h.successRate).toBe(100);
    expect(stats.lowSeatCount).toBe(0);
    expect(stats.soldOutCount).toBe(0);
    expect(stats.scansByHour).toHaveLength(24);
  });
});
