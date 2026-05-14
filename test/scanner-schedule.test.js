'use strict';

const { normalizeJobInput } = require('../src/scanner');

function baseInput(schedule) {
  return {
    name: 'VJ125 HAN-SGN',
    enabled: true,
    query: {
      from: 'HAN',
      to: 'SGN',
      date: '2026-05-15',
      airline: 'VJ',
      flightNumber: 'VJ125',
    },
    schedule,
  };
}

describe('normalizeJobInput schedule updates', () => {
  it('lets a fresh intervalValue/unit override stale intervalSeconds from existing jobs', () => {
    const existing = normalizeJobInput(baseInput({
      intervalValue: 3600,
      intervalUnit: 'seconds',
    }));

    const updated = normalizeJobInput({
      schedule: {
        intervalValue: 10,
        intervalUnit: 'minutes',
      },
    }, existing);

    expect(updated.schedule).toMatchObject({
      intervalValue: 10,
      intervalUnit: 'minutes',
      intervalSeconds: 600,
      intervalMinutes: 10,
    });
  });

  it('still accepts explicit legacy intervalSeconds updates', () => {
    const existing = normalizeJobInput(baseInput({
      intervalValue: 10,
      intervalUnit: 'minutes',
    }));

    const updated = normalizeJobInput({ intervalSeconds: 20 }, existing);

    expect(updated.schedule).toMatchObject({
      intervalValue: 20,
      intervalUnit: 'seconds',
      intervalSeconds: 20,
    });
  });

  it('preserves the previous schedule when an update omits schedule fields', () => {
    const existing = normalizeJobInput(baseInput({
      intervalValue: 15,
      intervalUnit: 'minutes',
    }));

    const updated = normalizeJobInput({ name: 'Renamed job' }, existing);

    expect(updated.schedule).toMatchObject({
      intervalValue: 15,
      intervalUnit: 'minutes',
      intervalSeconds: 900,
      intervalMinutes: 15,
    });
  });
});
