'use strict';

const ENV_KEYS = [
  'N8N_ZALO_WEBHOOK_URL',
  'N8N_ZALO_TARGET_ID',
  'N8N_ZALO_THREAD_TYPE',
  'N8N_WEBHOOK_TIMEOUT_MS',
  'N8N_WEBHOOK_MAX_RETRY',
];
const ORIGINAL_ENV = ENV_KEYS.reduce((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
}

function loadZalo(env = {}) {
  restoreEnv();
  Object.assign(process.env, env);
  jest.resetModules();
  return require('../src/scanner/zalo');
}

afterEach(() => {
  jest.dontMock('axios');
  restoreEnv();
  jest.resetModules();
});

describe('zalo notifier', () => {
  it('requires webhook url and target id', () => {
    expect(loadZalo({ N8N_ZALO_WEBHOOK_URL: 'https://n8n.test/webhook/price-scan-zalo' }).isZaloConfigured()).toBe(false);
    expect(loadZalo({
      N8N_ZALO_WEBHOOK_URL: 'https://n8n.test/webhook/price-scan-zalo',
      N8N_ZALO_TARGET_ID: 'zalo_target_1',
    }).isZaloConfigured()).toBe(true);
  });

  it('builds a webhook payload for n8n Zalo workflow', () => {
    const { buildZaloWebhookPayload } = loadZalo({
      N8N_ZALO_WEBHOOK_URL: 'https://n8n.test/webhook/price-scan-zalo',
      N8N_ZALO_TARGET_ID: 'zalo_target_1',
      N8N_ZALO_THREAD_TYPE: '1',
    });

    const payload = buildZaloWebhookPayload(
      {
        id: 'job_1',
        name: 'VJ125 HAN-SGN',
        query: {
          from: 'HAN',
          to: 'SGN',
          date: '2026-05-14',
          airline: 'VJ',
          flightNumber: 'VJ125',
          departureTimeStart: '06:00',
          departureTimeEnd: '12:00',
        },
      },
      {
        id: 'run_1',
        status: 'success',
        matchCount: 1,
        results: [{ flightNumber: 'VJ125', totalAmount: 1200000 }],
      },
      'Price Scan report'
    );

    expect(payload).toMatchObject({
      event: 'price_scan.report',
      channel: 'zalo',
      content: 'Price Scan report',
      summaryText: 'Price Scan report',
      zaloTargetId: 'zalo_target_1',
      zaloThreadType: 1,
      job: { id: 'job_1', name: 'VJ125 HAN-SGN' },
      query: { from: 'HAN', to: 'SGN', flightNumber: 'VJ125' },
      run: { id: 'run_1', status: 'success', matchCount: 1 },
    });
    expect(payload.results).toHaveLength(1);
  });

  it('posts test messages to the configured n8n webhook', async () => {
    const post = jest.fn().mockResolvedValue({ status: 200, data: { ok: true } });
    jest.doMock('axios', () => ({ post }));
    const { sendZaloMessage } = loadZalo({
      N8N_ZALO_WEBHOOK_URL: 'https://n8n.test/webhook/price-scan-zalo',
      N8N_ZALO_TARGET_ID: 'zalo_target_1',
      N8N_ZALO_THREAD_TYPE: '1',
    });

    const result = await sendZaloMessage('Hello Zalo');

    expect(result).toMatchObject({ ok: true, messageCount: 1, messageIds: [200] });
    expect(post).toHaveBeenCalledWith(
      'https://n8n.test/webhook/price-scan-zalo',
      expect.objectContaining({
        event: 'price_scan.test',
        content: 'Hello Zalo',
        summaryText: 'Hello Zalo',
        zaloTargetId: 'zalo_target_1',
        zaloThreadType: 1,
      }),
      expect.objectContaining({ timeout: 10000, validateStatus: expect.any(Function) })
    );
  });
});
