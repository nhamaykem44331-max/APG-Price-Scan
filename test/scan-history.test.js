'use strict';

const {
  buildHistory,
  cutoffForRange,
  defaultBucketForRange,
  bucketSizeMs,
  aggregateBuckets,
  pickFlightForJob,
  enrichJob,
  summarizeSeries,
} = require('../src/scanner/job-stats');

const NOW = Date.parse('2026-05-18T12:00:00.000Z');

function job(extra = {}) {
  return {
    id: 'job_1',
    name: 'VJ125 HAN-SGN',
    query: { from: 'HAN', to: 'SGN', date: '18-05-2026', flightNumber: 'VJ125' },
    ...extra,
  };
}

function run(offsetMin, price, seat, extra = {}) {
  const t = new Date(NOW - offsetMin * 60 * 1000).toISOString();
  return {
    id: `run_${offsetMin}`,
    jobId: 'job_1',
    startedAt: t,
    status: extra.status || 'success',
    results: extra.results !== undefined ? extra.results : [
      { airlineCode: 'VJ', flightNumber: 'VJ125', departTime: '07:00', totalAmount: price, seatAvailable: seat },
    ],
  };
}

describe('cutoffForRange', () => {
  it('returns now - 1h for 1h', () => {
    expect(cutoffForRange('1h', NOW)).toBe(NOW - 3600 * 1000);
  });
  it('returns 0 for all', () => {
    expect(cutoffForRange('all', NOW)).toBe(0);
  });
  it('defaults to 24h', () => {
    expect(cutoffForRange('unknown', NOW)).toBe(NOW - 24 * 3600 * 1000);
  });
});

describe('defaultBucketForRange', () => {
  it('uses none for 1h and 24h', () => {
    expect(defaultBucketForRange('1h')).toBe('none');
    expect(defaultBucketForRange('24h')).toBe('none');
  });
  it('uses 1h for 7d', () => {
    expect(defaultBucketForRange('7d')).toBe('1h');
  });
  it('uses 1d for all', () => {
    expect(defaultBucketForRange('all')).toBe('1d');
  });
});

describe('pickFlightForJob', () => {
  const j = job();
  it('matches flightNumber if specified', () => {
    const f = pickFlightForJob(
      [
        { flightNumber: 'VJ127', totalAmount: 1000000 },
        { flightNumber: 'VJ125', totalAmount: 2000000 },
      ],
      j
    );
    expect(f.flightNumber).toBe('VJ125');
  });

  it('falls back to cheapest when flightNumber not present', () => {
    const f = pickFlightForJob(
      [
        { flightNumber: 'VJ999', totalAmount: 3000000 },
        { flightNumber: 'VJ888', totalAmount: 1500000 },
      ],
      j
    );
    expect(f.flightNumber).toBe('VJ888');
  });

  it('returns null for empty array', () => {
    expect(pickFlightForJob([], j)).toBeNull();
  });
});

describe('enrichJob', () => {
  it('computes lastPrice / prevPrice / lastSeat from runs', () => {
    const runs = [run(15, 1846000, 4), run(30, 1929000, 6), run(45, 2050000, 7)];
    const enriched = enrichJob(job(), runs, { now: NOW });
    expect(enriched.lastPrice).toBe(1846000);
    expect(enriched.prevPrice).toBe(1929000);
    expect(enriched.lastSeat).toBe(4);
    expect(enriched.lastFlight).toBe('VJ125');
  });

  it('runsToday counts runs since midnight local', () => {
    const runs = [run(15, 1000, 5), run(60, 1000, 5), run(60 * 24, 1000, 5)];
    const enriched = enrichJob(job(), runs, { now: NOW });
    expect(enriched.runsToday).toBeGreaterThanOrEqual(2);
  });

  it('null fields when no successful run', () => {
    const enriched = enrichJob(job(), [], { now: NOW });
    expect(enriched.lastPrice).toBeNull();
    expect(enriched.prevPrice).toBeNull();
    expect(enriched.lastSeat).toBeNull();
    expect(enriched.runsToday).toBe(0);
  });
});

describe('aggregateBuckets', () => {
  it('groups points into bucket slots and averages price', () => {
    const points = [
      { t: '2026-05-18T10:00:00.000Z', price: 1000, seat: 5, status: 'success' },
      { t: '2026-05-18T10:10:00.000Z', price: 2000, seat: 4, status: 'success' },
      { t: '2026-05-18T11:30:00.000Z', price: 1500, seat: 3, status: 'success' },
    ];
    const buckets = aggregateBuckets(points, bucketSizeMs('1h'));
    expect(buckets).toHaveLength(2);
    expect(buckets[0].price).toBe(1500); // avg(1000,2000)
    expect(buckets[0].seat).toBe(4); // last seat of bucket
    expect(buckets[0].runCount).toBe(2);
    expect(buckets[1].price).toBe(1500);
  });

  it('flags status=error when any point errored', () => {
    const points = [
      { t: '2026-05-18T10:00:00.000Z', price: 1000, seat: 5, status: 'success' },
      { t: '2026-05-18T10:30:00.000Z', price: 1500, seat: 5, status: 'error' },
    ];
    const buckets = aggregateBuckets(points, bucketSizeMs('1h'));
    expect(buckets[0].status).toBe('error');
  });
});

describe('summarizeSeries', () => {
  it('computes min/max/avg/trend', () => {
    const series = [
      { t: 'a', price: 1000, seat: 5 },
      { t: 'b', price: 2000, seat: 4 },
      { t: 'c', price: 1500, seat: 3 },
    ];
    const summary = summarizeSeries(series);
    expect(summary.min).toBe(1000);
    expect(summary.max).toBe(2000);
    expect(summary.avg).toBe(1500);
    expect(summary.first).toBe(1000);
    expect(summary.last).toBe(1500);
    expect(summary.trendPct).toBe(50);
    expect(summary.lastSeat).toBe(3);
  });

  it('returns nulls for empty series', () => {
    const s = summarizeSeries([]);
    expect(s.min).toBeNull();
    expect(s.last).toBeNull();
  });

  it('marks soldOutAt if any point seat=0', () => {
    const series = [
      { t: 'a', price: 1000, seat: 5 },
      { t: 'b', price: 2000, seat: 0 },
    ];
    expect(summarizeSeries(series).soldOutAt).toBe('b');
  });
});

describe('buildHistory', () => {
  it('returns shape { jobId, range, bucket, series, summary }', () => {
    const runs = [run(15, 1846000, 4), run(120, 1929000, 6)];
    const result = buildHistory(job(), runs, { range: '24h', now: NOW });
    expect(result.jobId).toBe('job_1');
    expect(result.range).toBe('24h');
    expect(result.bucket).toBe('none');
    expect(Array.isArray(result.series)).toBe(true);
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.summary).toHaveProperty('avg');
  });

  it('honors range=1h cutoff', () => {
    const runs = [run(30, 1000, 5), run(120, 2000, 5)]; // 30 min ago + 2h ago
    const result = buildHistory(job(), runs, { range: '1h', now: NOW });
    expect(result.series).toHaveLength(1); // only 30min point
  });

  it('aggregates to 1h bucket when range=7d', () => {
    const runs = [run(15, 1000, 5), run(30, 2000, 5), run(60 * 5, 3000, 5)];
    const result = buildHistory(job(), runs, { range: '7d', now: NOW });
    expect(result.bucket).toBe('1h');
    expect(result.series.length).toBeLessThanOrEqual(7 * 24);
  });

  it('rejects unknown range and defaults to 24h', () => {
    const result = buildHistory(job(), [], { range: 'bogus', now: NOW });
    expect(result.range).toBe('24h');
  });

  it('orders series ascending by t', () => {
    const runs = [run(120, 1000, 5), run(30, 2000, 5), run(60, 1500, 5)];
    const result = buildHistory(job(), runs, { range: '24h', now: NOW });
    const ts = result.series.map((p) => Date.parse(p.t));
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
  });

  it('skips runs with no matching flight', () => {
    const runWithoutFlight = run(15, 0, 0, { results: [] });
    const runs = [runWithoutFlight, run(30, 1000, 5)];
    const result = buildHistory(job(), runs, { range: '24h', now: NOW });
    expect(result.series).toHaveLength(1);
  });
});
