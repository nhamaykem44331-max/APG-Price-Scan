'use strict';

const { __test__ } = require('../src/scanner');
const { compareResults } = __test__;

function flight(extra = {}) {
  return {
    flightNumber: 'VJ125',
    departTime: '07:00',
    totalAmount: 2500000,
    seatAvailable: 9,
    ...extra,
  };
}

describe('compareResults', () => {
  it('returns hasPrevious=false when no previous run', () => {
    const result = compareResults(null, [flight()]);
    expect(result.hasPrevious).toBe(false);
    expect(result.changed).toBe(true);
  });

  it('returns changed=false when nothing changed', () => {
    const prev = { results: [flight()] };
    const next = [flight()];
    const result = compareResults(prev, next);
    expect(result.changed).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it('detects price drop with percent', () => {
    const prev = { results: [flight({ totalAmount: 2500000 })] };
    const next = [flight({ totalAmount: 2400000 })];
    const result = compareResults(prev, next);
    expect(result.changed).toBe(true);
    expect(result.counts.price).toBe(1);
    const change = result.changes.find((c) => c.type === 'price');
    expect(change.delta).toBe(-100000);
    expect(change.percent).toBeCloseTo(-4);
  });

  it('detects seat change (drop)', () => {
    const prev = { results: [flight({ seatAvailable: 9 })] };
    const next = [flight({ seatAvailable: 3 })];
    const result = compareResults(prev, next);
    expect(result.changed).toBe(true);
    expect(result.counts.seat).toBe(1);
    const change = result.changes.find((c) => c.type === 'seat');
    expect(change.oldSeats).toBe(9);
    expect(change.newSeats).toBe(3);
    expect(change.seatDelta).toBe(-6);
    expect(change.soldOut).toBe(false);
  });

  it('marks soldOut=true when seats drop to 0', () => {
    const prev = { results: [flight({ seatAvailable: 5 })] };
    const next = [flight({ seatAvailable: 0 })];
    const result = compareResults(prev, next);
    const change = result.changes.find((c) => c.type === 'seat');
    expect(change.soldOut).toBe(true);
    expect(change.newSeats).toBe(0);
  });

  it('detects both price + seat change on same flight as two entries', () => {
    const prev = { results: [flight({ totalAmount: 2500000, seatAvailable: 9 })] };
    const next = [flight({ totalAmount: 2400000, seatAvailable: 3 })];
    const result = compareResults(prev, next);
    expect(result.counts.price).toBe(1);
    expect(result.counts.seat).toBe(1);
    expect(result.changes).toHaveLength(2);
  });

  it('detects new flight', () => {
    const prev = { results: [flight()] };
    const next = [flight(), flight({ flightNumber: 'VJ127', departTime: '11:30' })];
    const result = compareResults(prev, next);
    expect(result.counts.new).toBe(1);
  });

  it('detects removed flight', () => {
    const prev = { results: [flight(), flight({ flightNumber: 'VJ127', departTime: '11:30' })] };
    const next = [flight()];
    const result = compareResults(prev, next);
    expect(result.counts.removed).toBe(1);
  });

  it('does not divide by zero when previous total was 0', () => {
    const prev = { results: [flight({ totalAmount: 0 })] };
    const next = [flight({ totalAmount: 100000 })];
    const result = compareResults(prev, next);
    const change = result.changes.find((c) => c.type === 'price');
    expect(change.percent).toBeNull();
  });
});
