/**
 * test-direct-login.js — PoC: đăng nhập Muadi qua API trực tiếp (không browser, không captcha).
 * Model login: { UserName, Password, AgentCode, Otp }. Otp = ô captcha (react-simple-captcha
 * validate client-side); server chỉ cần Otp non-empty. Thử vài giá trị Otp + version.
 */
require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'https://api-gateway.muadi.com.vn/api';
const ORIGIN = 'https://booking.namthanh.vn';
const KEY = process.env.MUADI_AES_KEY, IV = process.env.MUADI_AES_IV;
const enc = (t) => { const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(KEY), Buffer.from(IV)); return c.update(String(t), 'utf8', 'base64') + c.final('base64'); };
const dec = (b) => { try { const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(KEY), Buffer.from(IV)); return d.update(b, 'base64', 'utf8') + d.final('utf8'); } catch (e) { return null; } };
const H = (version) => { const h = { tsp: enc(String(Math.floor(Date.now() / 1000))), 'Client-Type': 'Web', 'X-Language': 'vi', Origin: ORIGIN, Referer: ORIGIN + '/', 'Content-Type': 'application/json' }; if (version) h['X-Api-Version'] = String(version); return h; };

function decode(data) {
  let obj = data;
  if (typeof data === 'string' && data) { const d = dec(data); if (d) { try { obj = JSON.parse(d); } catch (_) { obj = d; } } }
  else if (data && typeof data === 'object' && typeof data.encrypted === 'string') { const d = dec(data.encrypted); if (d) { try { obj = JSON.parse(d); } catch (_) { obj = d; } } }
  return obj;
}

const U = process.env.NAMTHANH_USERNAME, P = process.env.NAMTHANH_PASSWORD, A = process.env.NAMTHANH_AGENCY_CODE;

(async () => {
  console.log('User:', U, 'Agency:', A);
  const otps = ['ABC', '000000'];
  for (const version of ['2', null]) {
    for (const otp of otps) {
      const body = { UserName: U, Password: P, AgentCode: A, Otp: otp };
      const res = await axios.post(`${BASE_URL}/auth/login`, { encrypted: enc(JSON.stringify(body)) }, { headers: H(version), validateStatus: () => true, timeout: 20000 });
      const obj = decode(res.data);
      const node = (obj && typeof obj === 'object' && obj.data) ? obj.data : obj;
      const at = node && (node.accessToken || node.access_token);
      console.log(`\n[v=${version} otp=${otp}] HTTP ${res.status} | success=${obj && obj.success} code=${obj && obj.code} msg=${obj && (obj.message || obj.title || obj.error)}`);
      if (node && typeof node === 'object') console.log('   keys:', Object.keys(node).slice(0, 30).join(','));
      if (at) {
        console.log('\n✅✅ DIRECT LOGIN SUCCESS — v=' + version + ' otp=' + otp);
        console.log('   accessToken len:', String(at).length, '| refreshToken?', !!(node.refreshToken || node.refresh_token));
        console.log('   sample fields:', JSON.stringify({ exp: node.exp, userName: node.userName, agentCode: node.agentCode, fullName: node.fullName, balance: node.balance }).slice(0, 300));
        return;
      }
    }
  }
  console.log('\n(no accessToken yet)');
})();
