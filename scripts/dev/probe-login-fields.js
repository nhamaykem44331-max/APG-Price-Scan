require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const BASE_URL = 'https://api-gateway.muadi.com.vn/api';
const ORIGIN = 'https://booking.namthanh.vn';
const KEY = process.env.MUADI_AES_KEY, IV = process.env.MUADI_AES_IV;
const enc = (t) => { const c = crypto.createCipheriv('aes-128-cbc', Buffer.from(KEY), Buffer.from(IV)); return c.update(String(t), 'utf8', 'base64') + c.final('base64'); };
const dec = (b) => { try { const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(KEY), Buffer.from(IV)); return d.update(b, 'base64', 'utf8') + d.final('utf8'); } catch (e) { return '(decrypt failed: ' + e.message + ')'; } };
const H = (version) => { const h = { tsp: enc(String(Math.floor(Date.now() / 1000))), 'Client-Type': 'Web', 'X-Language': 'vi', Origin: ORIGIN, Referer: ORIGIN + '/', 'Content-Type': 'application/json' }; if (version) h['X-Api-Version'] = String(version); return h; };

(async () => {
  // 1) v=null with empty body → enumerate required fields via ASP.NET validation errors
  let r = await axios.post(`${BASE_URL}/auth/login`, { encrypted: enc('{}') }, { headers: H(null), validateStatus: () => true, timeout: 20000 });
  console.log('=== v=null empty-body HTTP', r.status, '===');
  console.log(JSON.stringify(r.data, null, 2));

  // 2) v=2 empty body → capture encrypted error string and decrypt it
  r = await axios.post(`${BASE_URL}/auth/login`, { encrypted: enc('{}') }, { headers: H('2'), validateStatus: () => true, timeout: 20000 });
  console.log('\n=== v=2 empty-body HTTP', r.status, '===');
  console.log('raw typeof:', typeof r.data);
  console.log('raw:', typeof r.data === 'string' ? r.data.slice(0, 200) : JSON.stringify(r.data).slice(0, 300));
  if (typeof r.data === 'string') console.log('decrypted:', dec(r.data));
  if (r.data && r.data.encrypted) console.log('decrypted .encrypted:', dec(r.data.encrypted));
})();
