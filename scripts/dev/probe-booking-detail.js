/**
 * probe-booking-detail.js — gọi management/booking-view {ID} trực tiếp để xác định
 * vị trí mảng hành khách + cách đếm paxType (ADT/CHD/INF) cho watcher.
 */
require('dotenv').config();
const { MuadiApiClient } = require('../../src/muadi-client');

// Tìm mảng hành khách "master" (item có firstName/lastName/title) ở bất kỳ độ sâu nào.
function findPaxArray(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (Array.isArray(obj)) {
    if (obj.length && obj.every((x) => x && typeof x === 'object') &&
        obj.some((x) => /firstName|lastName|title|fullName/i.test(Object.keys(x).join(',')) && /paxType|type/i.test(Object.keys(x).join(',')))) {
      return obj;
    }
    for (const x of obj) { const r = findPaxArray(x, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) { const r = findPaxArray(v, depth + 1); if (r) return r; }
  }
  return null;
}

function countPax(arr) {
  const c = { adt: 0, chd: 0, inf: 0, total: arr.length };
  for (const p of arr) {
    const t = String(p.paxType || p.type || '').toUpperCase();
    if (t.includes('ADT') || t.includes('ADULT')) c.adt += 1;
    else if (t.includes('CHD') || t.includes('CHILD')) c.chd += 1;
    else if (t.includes('INF') || t.includes('INFANT')) c.inf += 1;
    else c.adt += 1; // mặc định coi là người lớn nếu không rõ
  }
  return c;
}

async function getBookingView(c, id) {
  for (const version of ['2', null, '3', '1']) {
    try {
      const res = await c.post('management/booking-view', { ID: id }, { version, safeToRetry: false, timeout: 15000 });
      const node = res && (res.data !== undefined ? res.data : res);
      if (node && typeof node === 'object') return { node, version };
    } catch (e) { if (e.status !== 404) { /* keep trying versions */ } }
  }
  return null;
}

(async () => {
  const c = new MuadiApiClient();
  const lb = await c.listBooking();
  const rows = Array.isArray(lb && lb.data) ? lb.data : [];
  console.log('list-booking rows:', rows.length);
  const samples = rows.filter((r) => r.id).slice(0, 4);
  for (const s of samples) {
    const r = await getBookingView(c, s.id);
    if (!r) { console.log(`PNR ${s.pnrCode} id=${s.id}: booking-view FAIL`); continue; }
    const pax = findPaxArray(r.node);
    if (!pax) {
      const ti = r.node.ticketInfo || r.node;
      console.log(`PNR ${s.pnrCode} id=${s.id} (v${r.version}): NO pax array. ticketInfo keys=${Object.keys(ti).slice(0, 20).join(',')}`);
      continue;
    }
    const cnt = countPax(pax);
    console.log(`PNR ${s.pnrCode} id=${s.id} held=${s.totalPrice} → PAX total=${cnt.total} (adt=${cnt.adt} chd=${cnt.chd} inf=${cnt.inf}) | per-pax≈${Math.round(s.totalPrice / cnt.total)}`);
    console.log(`   pax item keys: ${Object.keys(pax[0]).join(',')} | paxTypes: ${pax.map((p) => p.paxType).join(',')}`);
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
