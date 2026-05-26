#!/usr/bin/env node
/**
 * capture-booking-detail.js (debug) — xác định REQUEST param + RESPONSE pax của
 * POST management/booking-view (endpoint trả số khách cho 1 booking đang giữ).
 * Dùng: node scripts/dev/capture-booking-detail.js <bookingId>
 */
const crypto = require('crypto');
const { chromium } = require('playwright');
const config = require('../../src/config');

const KEY = process.env.MUADI_AES_KEY || '';
const IV = process.env.MUADI_AES_IV || '';
const dec = (b64) => { try { const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(KEY), Buffer.from(IV)); return d.update(b64, 'base64', 'utf8') + d.final('utf8'); } catch (e) { return '(dec fail)'; } };

(async () => {
  const id = process.argv[2] || '43013704';
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({ storageState: config.paths.sessionFile, userAgent: config.browser.userAgent });

  // Bắt request body (fetch + XHR) cho booking-view trước khi script trang chạy.
  await ctx.addInitScript(() => {
    window.__bv = [];
    const of = window.fetch;
    window.fetch = async function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/booking-view/i.test(url)) {
          let body = init && init.body != null ? String(init.body) : null;
          if (!body && typeof Request !== 'undefined' && input instanceof Request) { try { body = await input.clone().text(); } catch (_) {} }
          window.__bv.push({ url, method: (init && init.method) || 'POST', body });
        }
      } catch (_) {}
      return of.apply(this, arguments);
    };
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__m = m; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) { try { if (/booking-view/i.test(this.__u || '')) window.__bv.push({ url: this.__u, method: this.__m, body: b != null ? String(b) : null }); } catch (_) {} return os.apply(this, arguments); };
  });

  const page = await ctx.newPage();
  let viewResp = null;
  page.on('response', async (res) => {
    if (!/management\/booking-view/i.test(res.url())) return;
    let txt = ''; try { txt = await res.text(); } catch (_) { return; }
    let obj = null; try { obj = JSON.parse(txt); } catch (_) {}
    if (obj && typeof obj.encrypted === 'string') { const d = dec(obj.encrypted); try { obj = JSON.parse(d); } catch (_) {} }
    viewResp = obj && (obj.data !== undefined ? obj.data : obj);
  });

  await page.goto('https://booking.namthanh.vn/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.goto('https://booking.namthanh.vn/booking/booking-detail/' + id, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(7000);

  const reqs = await page.evaluate(() => window.__bv || []);
  console.log('=== REQUEST tới booking-view ===');
  for (const r of reqs) {
    console.log(`${r.method} ${r.url.replace(/^https:\/\/api-gateway\.muadi\.com\.vn\/api\//, '')}`);
    let parsed = null; try { parsed = JSON.parse(r.body); } catch (_) {}
    if (parsed && parsed.encrypted) console.log('  body (decrypted):', dec(parsed.encrypted));
    else console.log('  body:', r.body);
  }

  console.log('\n=== RESPONSE pax ===');
  if (viewResp) {
    const ti = viewResp.ticketInfo || viewResp;
    const pax = ti.passengers || ti.paxList || ti.listPassenger || [];
    console.log('passengers count:', Array.isArray(pax) ? pax.length : '(not array)');
    if (Array.isArray(pax)) {
      const byType = {};
      pax.forEach((p) => { const t = (p.paxType || p.type || '?'); byType[t] = (byType[t] || 0) + 1; });
      console.log('by paxType:', JSON.stringify(byType));
      console.log('sample pax:', JSON.stringify(pax[0]).slice(0, 250));
    }
    console.log('top keys of ticketInfo:', Object.keys(ti).slice(0, 25).join(','));
  } else {
    console.log('(không bắt được response booking-view)');
  }
  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
