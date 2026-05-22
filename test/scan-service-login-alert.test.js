'use strict';

// Mock kênh Zalo để kiểm tra logic dedup cảnh báo login thất bại (không gọi mạng thật).
jest.mock('../src/scanner/zalo', () => ({
  isZaloConfigured: jest.fn(() => true),
  sendLoginFailureAlert: jest.fn(async () => ({ ok: true })),
}));

const zalo = require('../src/scanner/zalo');
const { notifyLoginFailureOnce, resetLoginFailureAlert } = require('../src/scanner/scan-service');

describe('login-failure Zalo alert (chống spam khi đăng nhập OCR thất bại)', () => {
  const acc = { id: 'primary', username: 'HTXTP01' };

  beforeEach(() => {
    jest.clearAllMocks();
    resetLoginFailureAlert(acc);
    zalo.isZaloConfigured.mockReturnValue(true);
  });

  it('chỉ bắn Zalo 1 lần, dedup cho tới khi reset (login lại được)', async () => {
    expect(await notifyLoginFailureOnce(acc, new Error('captcha sai 3 lần'))).toBe(true);
    expect(zalo.sendLoginFailureAlert).toHaveBeenCalledTimes(1);

    // Cycle sau vẫn lỗi → KHÔNG bắn lại (tránh spam mỗi 20-30 phút).
    expect(await notifyLoginFailureOnce(acc, new Error('captcha sai 3 lần'))).toBe(false);
    expect(zalo.sendLoginFailureAlert).toHaveBeenCalledTimes(1);

    // Login thành công → reset → lần lỗi kế tiếp lại được cảnh báo.
    resetLoginFailureAlert(acc);
    expect(await notifyLoginFailureOnce(acc, new Error('lỗi mới'))).toBe(true);
    expect(zalo.sendLoginFailureAlert).toHaveBeenCalledTimes(2);
  });

  it('không gọi Zalo khi chưa cấu hình (vẫn dedup)', async () => {
    zalo.isZaloConfigured.mockReturnValue(false);
    expect(await notifyLoginFailureOnce(acc, new Error('x'))).toBe(true);
    expect(zalo.sendLoginFailureAlert).not.toHaveBeenCalled();
  });

  it('dedup riêng theo từng tài khoản', async () => {
    const acc2 = { id: 'account2', username: 'HTXTP' };
    resetLoginFailureAlert(acc2);
    expect(await notifyLoginFailureOnce(acc, new Error('a'))).toBe(true);
    expect(await notifyLoginFailureOnce(acc2, new Error('b'))).toBe(true);
    expect(zalo.sendLoginFailureAlert).toHaveBeenCalledTimes(2);
    resetLoginFailureAlert(acc2);
  });
});
