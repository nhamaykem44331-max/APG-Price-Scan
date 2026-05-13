'use strict';

// shouldNotify depends on isTelegramConfigured() reading TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
// We set both for these tests so the gate doesn't short-circuit.
const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ORIGINAL_CHAT = process.env.TELEGRAM_CHAT_ID;

beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test_token';
  process.env.TELEGRAM_CHAT_ID = 'test_chat';
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_CHAT === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = ORIGINAL_CHAT;
});

jest.resetModules();
const { __test__ } = require('../src/scanner');
const { shouldNotify, EMPTY_STREAK_ALERT_THRESHOLD } = __test__;

function baseJob(extra = {}) {
  return {
    id: 'job_1',
    enabled: true,
    notify: {
      telegramEnabled: true,
      mode: 'every_run',
      notifyOnError: true,
      muted: false,
    },
    ...extra,
  };
}

function baseRun(extra = {}) {
  return {
    status: 'success',
    results: [{ flightNumber: 'VJ125' }],
    comparison: { hasPrevious: true, changed: false },
    ...extra,
  };
}

describe('shouldNotify', () => {
  it('returns false when telegramEnabled is false', () => {
    const job = baseJob();
    job.notify.telegramEnabled = false;
    expect(shouldNotify(job, baseRun())).toBe(false);
  });

  it('every_run mode always notifies on success', () => {
    expect(shouldNotify(baseJob(), baseRun())).toBe(true);
  });

  it('on_change mode skips when no change', () => {
    const job = baseJob();
    job.notify.mode = 'on_change';
    expect(shouldNotify(job, baseRun({ comparison: { hasPrevious: true, changed: false } }))).toBe(false);
  });

  it('on_change mode notifies when changed', () => {
    const job = baseJob();
    job.notify.mode = 'on_change';
    expect(shouldNotify(job, baseRun({ comparison: { hasPrevious: true, changed: true } }))).toBe(true);
  });

  it('mute suppresses success notifications', () => {
    const job = baseJob();
    job.notify.muted = true;
    expect(shouldNotify(job, baseRun())).toBe(false);
  });

  it('mute does NOT suppress error notifications (still respect notifyOnError)', () => {
    const job = baseJob();
    job.notify.muted = true;
    expect(shouldNotify(job, baseRun({ status: 'error' }))).toBe(false);
  });

  it('error notify respects notifyOnError flag', () => {
    const job = baseJob();
    job.notify.notifyOnError = false;
    expect(shouldNotify(job, baseRun({ status: 'error' }))).toBe(false);
  });

  it('alerts once when emptyStreak hits threshold even in on_change', () => {
    const job = baseJob();
    job.notify.mode = 'on_change';
    const run = baseRun({
      results: [],
      emptyStreak: EMPTY_STREAK_ALERT_THRESHOLD,
      comparison: { hasPrevious: true, changed: false },
    });
    expect(shouldNotify(job, run)).toBe(true);
  });

  it('does not alert again when emptyStreak exceeds threshold', () => {
    const job = baseJob();
    job.notify.mode = 'on_change';
    const run = baseRun({
      results: [],
      emptyStreak: EMPTY_STREAK_ALERT_THRESHOLD + 2,
      comparison: { hasPrevious: true, changed: false },
    });
    expect(shouldNotify(job, run)).toBe(false);
  });

  it('circuit breaker auto-disable alert overrides mute', () => {
    const job = baseJob();
    job.notify.muted = true;
    const run = baseRun({
      status: 'error',
      autoDisabledByCircuitBreaker: true,
    });
    expect(shouldNotify(job, run)).toBe(true);
  });
});
