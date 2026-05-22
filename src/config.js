/**
 * config.js
 *
 * Selectors đã được xác nhận bằng inspect trên booking.namthanh.vn/login
 */

require('dotenv').config();

const DEFAULT_SESSION_FILE = process.env.SESSION_FILE || './session/storage-state.json';

// Hỗ trợ NHIỀU tài khoản đại lý: tài khoản chính (NAMTHANH_USERNAME...) + các tài khoản
// đánh số NAMTHANH_USERNAME_2/_3... Mỗi tài khoản có session file riêng để giữ token độc lập.
// Watcher quét lần lượt từng tài khoản để gom hết PNR đang giữ trên toàn hệ thống.
function buildAccounts() {
  const list = [];
  if (process.env.NAMTHANH_USERNAME) {
    list.push({
      id: 'primary',
      username: process.env.NAMTHANH_USERNAME,
      password: process.env.NAMTHANH_PASSWORD,
      agencyCode: process.env.NAMTHANH_AGENCY_CODE,
      sessionFile: DEFAULT_SESSION_FILE,
    });
  }
  for (let i = 2; i <= 9; i += 1) {
    const username = process.env[`NAMTHANH_USERNAME_${i}`];
    const password = process.env[`NAMTHANH_PASSWORD_${i}`];
    if (username && password) {
      list.push({
        id: `account${i}`,
        username,
        password,
        agencyCode: process.env[`NAMTHANH_AGENCY_CODE_${i}`] || process.env.NAMTHANH_AGENCY_CODE,
        sessionFile: process.env[`SESSION_FILE_${i}`] || `./session/storage-state-${i}.json`,
      });
    }
  }
  return list;
}

module.exports = {
  loginUrl: 'https://booking.namthanh.vn/login',

  credentials: {
    username: process.env.NAMTHANH_USERNAME,
    password: process.env.NAMTHANH_PASSWORD,
    agencyCode: process.env.NAMTHANH_AGENCY_CODE,
  },

  // Danh sách tài khoản để watcher quét nhiều tài khoản. Phần tử [0] = tài khoản chính.
  accounts: buildAccounts(),

  // Selectors CHÍNH XÁC cho namthanh.vn
  selectors: {
    usernameInput: '#username',
    passwordInput: '#password',
    agencyCodeInput: '#agentCode',

    // Captcha là Canvas element
    captchaCanvas: '#canv',
    captchaInput: '#captcha',
    captchaReload: '#reload_href',  // Click để reload captcha

    // Submit button - tìm theo text "Đăng nhập"
    submitButton: 'button:has-text("Đăng nhập"):not(:has-text("QR"))',

    successIndicator: {
      // Sau khi login thành công, URL sẽ đổi khác /login
      urlPattern: /booking\.namthanh\.vn\/(?!login)/,
    },
  },

  captcha: {
    // Captcha namthanh.vn: 3 ký tự, có cả chữ hoa + chữ thường + số
    // Ví dụ thấy: "Y 3 N", "W0 1" → range 6 (lower+upper+digits)
    charsetRange: 6,

    // Độ dài chính xác là 3 (maxlength="3" trên input)
    expectedLength: { min: 3, max: 3 },

    // Giới hạn TỔNG số lần giải captcha OCR mỗi lần đăng nhập (chống spam/khoá tài khoản).
    // Mặc định 3: thử tối đa 3 lần, vẫn sai thì DỪNG và bắn Zalo cảnh báo.
    maxRetry: Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || '3', 10),

    useBeta: true,
  },

  ddddocr: {
    apiUrl: process.env.DDDDOCR_API_URL || 'http://localhost:8001',
    timeout: 10000,
  },

  browser: {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.HEADLESS === 'true' ? '0' : '100', 10),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
  },

  paths: {
    screenshotDir: process.env.SCREENSHOT_DIR || './screenshots',
    sessionFile: process.env.SESSION_FILE || './session/storage-state.json',
  },
};
