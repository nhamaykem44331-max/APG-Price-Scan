#!/usr/bin/env node
/**
 * capture-listbooking.js (throwaway debug)
 * Intercept the EXACT request body the SPA sends to POST /api/management/list-booking
 * by monkeypatching window.fetch + XMLHttpRequest.prototype.send inside the page
 * (Playwright's req.postData() returns null for this request, so DOM-level capture
 * is the only reliable way). Then decrypt the body with the Muadi AES key to learn
 * the plaintext filter shape, so we can replicate it in MuadiApiClient.listBooking().
 */
const crypto = require('crypto');
const { chromium } = require('playwright');
const config = require('../../src/config');

const RES_URL = 'https://booking.namthanh.vn/booking/reservation-status';
const AES_KEY = process.env.MUADI_AES_KEY || '';
const AES_IV = process.env.MUADI_AES_IV || '';

function decryptMuadi(b64) {
  if (!AES_KEY || !AES_IV) return '(no AES key/iv in env)';
  try {
    const decipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(AES_KEY, 'utf8'),
      Buffer.from(AES_IV, 'utf8')
    );
    return decipher.update(b64, 'base64', 'utf8') + decipher.final('utf8');
  } catch (e) {
    return `(decrypt failed: ${e.message})`;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: config.paths.sessionFile,
    userAgent: config.browser.userAgent,
  });

  // Monkeypatch fetch + XHR BEFORE any page script runs, so we record the body
  // the SPA actually puts on the wire (not what Playwright can re-read).
  await context.addInitScript(() => {
    window.__capturedReq = [];
    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
      try {
        const isRequest = typeof Request !== 'undefined' && input instanceof Request;
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/management\/list-booking/i.test(url)) {
          const rec = {
            via: 'fetch',
            url,
            inputType: isRequest ? 'Request' : typeof input,
            initKeys: init ? Object.keys(init) : null,
            method: (init && init.method) || (input && input.method) || 'GET',
            body: init && init.body != null ? String(init.body) : null,
            requestBody: null,
            requestHeaders: null,
            headers: init && init.headers ? JSON.parse(JSON.stringify(
              init.headers instanceof Headers
                ? Object.fromEntries(init.headers.entries())
                : init.headers
            )) : null,
          };
          // If a Request object was passed, the body/headers live on it — clone & read.
          if (isRequest) {
            try {
              const clone = input.clone();
              rec.requestBody = await clone.text();
              rec.requestHeaders = Object.fromEntries(input.headers.entries());
            } catch (e) { rec.requestBody = '(clone failed: ' + e.message + ')'; }
          }
          window.__capturedReq.push(rec);
        }
      } catch (_) { /* ignore */ }
      return origFetch.apply(this, arguments);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__url = url;
      this.__method = method;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (/management\/list-booking/i.test(this.__url || '')) {
          window.__capturedReq.push({
            via: 'xhr',
            url: this.__url,
            method: this.__method,
            body: body != null ? String(body) : null,
          });
        }
      } catch (_) { /* ignore */ }
      return origSend.apply(this, arguments);
    };
  });

  const page = await context.newPage();
  await page.goto('https://booking.namthanh.vn/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.goto(RES_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  const captured = await page.evaluate(() => window.__capturedReq || []);

  console.log('=== CAPTURED LIST-BOOKING REQUESTS:', captured.length, '===');
  for (const c of captured) {
    console.log('\n--- via', c.via, c.method, '---');
    console.log('url:', c.url);
    console.log('inputType:', c.inputType, '| initKeys:', JSON.stringify(c.initKeys));
    if (c.headers) console.log('init.headers:', JSON.stringify(c.headers));
    if (c.requestHeaders) console.log('Request.headers:', JSON.stringify(c.requestHeaders));
    const effectiveBody = c.requestBody != null ? c.requestBody : c.body;
    console.log('init.body:', c.body === null ? '(null)' : c.body);
    console.log('Request.body:', c.requestBody === null ? '(null)' : c.requestBody);
    console.log('effective body length:', effectiveBody ? effectiveBody.length : 0);
    if (effectiveBody) {
      c.body = effectiveBody;
      // Try to parse {encrypted:"..."} and decrypt
      let parsed = null;
      try { parsed = JSON.parse(c.body); } catch (_) {}
      if (parsed && typeof parsed === 'object') {
        console.log('body parsed keys:', Object.keys(parsed).join(','));
        if (parsed.encrypted) {
          console.log('DECRYPTED encrypted field:', decryptMuadi(parsed.encrypted));
        } else {
          console.log('body parsed (plain):', JSON.stringify(parsed));
        }
      } else {
        // maybe the whole body is a bare base64 ciphertext
        console.log('DECRYPTED whole body:', decryptMuadi(c.body));
      }
    }
  }

  await browser.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
