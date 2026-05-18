# Backend API — 3 endpoint mới cần thêm

Tất cả ở `src/server.js`, tuân thủ pattern xác thực hiện tại (`hasProtectedAccess(req)` hoặc session admin). Trả JSON, dùng helper `respondJson()`.

---

## 1. `GET /scan-jobs/:id/history`

Trả time-series price/seat của 1 job để vẽ chart trên Job Detail.

### Query params

| Param | Type | Default | Mô tả |
|---|---|---|---|
| `range` | enum | `24h` | `1h` \| `24h` \| `7d` \| `all` |
| `bucket` | string | auto | Optional. `none` \| `15m` \| `1h` \| `1d`. Nếu không truyền, server tự chọn theo range (xem dưới) |

### Auto bucket rule

| range | bucket mặc định | Lý do |
|---|---|---|
| `1h` | `none` | ≤ ~12 điểm (5min interval) |
| `24h` | `none` | ≤ ~96 điểm (15min interval) |
| `7d` | `1h` | ~168 điểm |
| `all` | `1d` | ≤ ~3 điểm (retention 3 ngày) — nhưng dự phòng nếu user tăng retention |

### Response (200)

```json
{
  "ok": true,
  "jobId": "job_vj125",
  "range": "24h",
  "bucket": "none",
  "series": [
    {
      "t": "2026-05-17T18:00:00.000Z",
      "price": 1929000,
      "minPrice": 1929000,
      "maxPrice": 1929000,
      "seat": 6,
      "minSeat": 6,
      "maxSeat": 6,
      "status": "success",
      "runCount": 1
    },
    {
      "t": "2026-05-17T18:15:00.000Z",
      "price": 1929000,
      "seat": 6,
      "status": "success",
      "runCount": 1
    }
    // ...
  ],
  "summary": {
    "min": 1846000,
    "max": 2050000,
    "avg": 1925000,
    "first": 1929000,
    "last": 1846000,
    "trendPct": -4.3,
    "lastSeat": 4,
    "soldOutAt": null
  }
}
```

### Source data

Đọc từ `scan-store.json` → `runs` array của job đó. Mỗi run có `results[]` với `totalAmount` + `seatAvailable`. Lấy chuyến match `flightNumber` (hoặc earliest match nếu không khớp duy nhất).

```js
// pseudocode
const runs = store.getRuns(jobId);
const job = store.getJob(jobId);
const cutoff = computeCutoff(range);
const filtered = runs
  .filter(r => Date.parse(r.startedAt) >= cutoff)
  .map(r => ({
    t: r.startedAt,
    flight: pickFlight(r.results, job.query.flightNumber),
  }))
  .filter(x => x.flight)
  .map(x => ({
    t: x.t,
    price: x.flight.totalAmount,
    seat: x.flight.seatAvailable,
    status: r.status,
  }));

if (bucket === 'none') return filtered;
return aggregateByBucket(filtered, bucket);  // average or pick representative per bucket
```

### Aggregation rule

Trong 1 bucket:
- `price` = average của tất cả run trong bucket
- `minPrice`/`maxPrice` = min/max
- `seat` = giá trị seat của run cuối cùng trong bucket (snapshot, không avg vì là count)
- `status` = `error` nếu ≥ 1 run lỗi, else `success`
- `runCount` = số run

### Errors

| Status | Body | Khi nào |
|---|---|---|
| `401` | `{error: "Unauthorized"}` | Chưa login admin |
| `404` | `{error: "Job not found"}` | jobId không tồn tại |
| `400` | `{error: "Invalid range"}` | range không thuộc enum |

---

## 2. `GET /activity`

Trả activity feed cross-job để render bên phải Dashboard.

### Query params

| Param | Type | Default | Mô tả |
|---|---|---|---|
| `limit` | int | `50` | 1-200 |
| `since` | ISO | none | Optional. Chỉ trả event sau timestamp |
| `kinds` | csv | tất cả | Optional. Filter: `sold,up,down,seat,new,removed,error,scan` |

### Response (200)

```json
{
  "ok": true,
  "activity": [
    {
      "id": "evt_01",
      "t": "2026-05-17T17:59:25.000Z",
      "jobId": "job_vj256",
      "jobName": "VJ256 SGN-PQC",
      "kind": "sold",
      "title": "VJ256 SGN→PQC sáng",
      "detail": "Sold out chuyến 07:30",
      "meta": {
        "flightNumber": "VJ256",
        "departTime": "07:30",
        "from": "SGN",
        "to": "PQC"
      }
    },
    {
      "id": "evt_02",
      "t": "2026-05-17T17:58:00.000Z",
      "jobId": "job_vj125",
      "jobName": "VJ125 HAN-SGN sáng",
      "kind": "down",
      "title": "VJ125 HAN→SGN",
      "detail": "1.929.000 → 1.846.000 ₫ (-4.3%)",
      "meta": {
        "prevPrice": 1929000,
        "price": 1846000,
        "deltaPct": -4.3
      }
    }
    // ...
  ]
}
```

### Kind enum

| kind | Khi nào emit | Color/badge ở UI |
|---|---|---|
| `sold` | Run mới có flight `seatAvailable === 0` mà run trước > 0 | đỏ "SOLD" |
| `down` | Run mới có price < run trước (cùng flightNumber) | xanh `↓ giá` |
| `up` | Run mới có price > run trước | đỏ `↑ giá` |
| `seat` | seatAvailable đổi (không phải sold) | vàng `ghế` |
| `new` | flight xuất hiện run này nhưng run trước không có | navy `NEW` |
| `removed` | flight có run trước nhưng run này không có | gold `REMOVED` |
| `error` | run.status === 'error' | đỏ badge `error` |
| `scan` | run.status === 'success', không có change nào | xanh badge `scan` (fallback ít dùng) |

### Source

Compute on-the-fly từ `runs` array của tất cả jobs. Mỗi run đã có `comparison.changes[]` (theo code hiện tại trong `src/scanner/scan-service.js` hoặc tương tự — verify). Map mỗi change → 1 activity entry, prefix với `run.id` để dedupe.

```js
// pseudocode
const events = [];
for (const job of store.getAllJobs()) {
  const runs = store.getRuns(job.id).slice(0, 100); // gần nhất
  for (const run of runs) {
    if (run.status === 'error') {
      events.push({
        id: `${run.id}_err`,
        t: run.startedAt,
        jobId: job.id,
        jobName: job.name,
        kind: 'error',
        title: `${job.query.flightNumber || job.name}`,
        detail: run.error || 'Unknown error',
        meta: { runId: run.id },
      });
      continue;
    }
    const changes = run.comparison?.changes || [];
    if (changes.length === 0) continue; // skip silent runs (or push 'scan' if --include-scan)
    for (const ch of changes) {
      events.push(mapChangeToEvent(ch, run, job));
    }
  }
}
events.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));
return events.slice(0, limit);
```

### Performance note

Nếu tổng số run quá lớn, cache events trong scanner memory + invalidate khi run mới chạy. Bản đầu: compute on-demand mỗi request là OK (≤ 6 jobs × ≤ 100 runs = 600 iterations, sub-ms).

### Errors

| Status | Body | Khi nào |
|---|---|---|
| `401` | `{error: "Unauthorized"}` | Chưa login |
| `400` | `{error: "Invalid limit"}` | limit < 1 hoặc > 200 |

---

## 3. `GET /health/extended` (hoặc mở rộng `/health`)

### Lựa chọn implementation

**Option A** (đề xuất): Mở rộng `/health` hiện tại — thêm field vào `scanner` object. Tương thích ngược.

**Option B**: Tạo endpoint mới `/health/extended` — `/health` giữ nguyên cho public uptime monitor, `/extended` cho admin UI.

### Response (200) — fields mới

```json
{
  "ok": true,
  "uptime": 12345,
  "scanner": {
    "jobCount": 6,
    "enabledJobCount": 5,
    "nextScheduledRun": "2026-05-17T18:08:00.000Z",
    "recentFailures": 2,
    "notificationFailures24h": 4,
    "lastRun": { "status": "success", "at": "..." },
    "telegramConfigured": true,
    "zaloConfigured": true,
    "minIntervalMinutes": 5,
    "minIntervalSeconds": 5,

    // ─── NEW ───────────────────────────────────────
    "totalScans24h": 236,
    "totalScansPrev24h": 244,
    "totalScansDeltaPct": -3.2,

    "scansByHour": [
      8, 9, 7, 10, 11, 12, 14, 13,
      10, 9, 8, 11, 13, 14, 12, 11,
      10, 9, 8, 7, 9, 10, 11, 10
    ],

    "notifyStats24h": {
      "sent": 178,
      "failed": 4,
      "retried": 2,
      "successRate": 97.8
    },

    "lowSeatCount": 2,
    "soldOutCount": 1
  }
}
```

### Computation

```js
// pseudocode trong scanner/index.js stats()
const now = Date.now();
const cutoff24 = now - 24 * 3600 * 1000;
const cutoffPrev24 = now - 48 * 3600 * 1000;

let scans24 = 0, scansPrev24 = 0;
const scansByHour = new Array(24).fill(0);
let sent = 0, failed = 0, retried = 0;

for (const job of getAllJobs()) {
  for (const run of getRuns(job.id)) {
    const t = Date.parse(run.startedAt);
    if (t >= cutoff24) {
      scans24++;
      const hourBucket = Math.floor((now - t) / 3600000);
      if (hourBucket < 24) scansByHour[23 - hourBucket]++;
    } else if (t >= cutoffPrev24) {
      scansPrev24++;
    }
    // notification stats
    if (run.notification?.status === 'sent') sent++;
    if (run.notification?.status === 'failed') failed++;
    if ((run.notification?.attempts || 1) > 1) retried++;
  }
}

const successRate = sent + failed > 0
  ? Math.round((sent / (sent + failed)) * 1000) / 10
  : 100;

const lowSeat = getAllJobs().filter(j => j.lastSeat > 0 && j.lastSeat <= 3).length;
const soldOut = getAllJobs().filter(j => j.lastSeat === 0).length;

return {
  ...existingScannerStats,
  totalScans24h: scans24,
  totalScansPrev24h: scansPrev24,
  totalScansDeltaPct: scansPrev24
    ? Math.round(((scans24 - scansPrev24) / scansPrev24) * 1000) / 10
    : 0,
  scansByHour,
  notifyStats24h: { sent, failed, retried, successRate },
  lowSeatCount: lowSeat,
  soldOutCount: soldOut,
};
```

### Privacy

Cùng quy tắc `/health` hiện tại: chỉ trả `scanner` khi `hasProtectedAccess(req)` (admin login) hoặc `BACKEND_ALLOW_NO_AUTH=true` (local).

---

## 4. Field reference — `lastSeat` trong Job

Để UI hiển thị seat count trong routes board, mỗi job object trả từ `GET /scan-jobs` nên có:

```json
{
  "id": "job_vj125",
  // ... existing fields
  "lastPrice": 1846000,
  "prevPrice": 1929000,
  "lastSeat": 4,
  "runsToday": 64
}
```

Compute từ run cuối cùng + run trước-cuối của job. Nếu chưa có run → null.

**Backward compat**: nếu thêm vào response của `/scan-jobs`, frontend cũ sẽ ignore. An toàn.

---

## 5. Implementation order

1. Thêm `lastPrice/prevPrice/lastSeat/runsToday` vào job serializer (helper trong `store.js`)
2. Implement `GET /scan-jobs/:id/history` (đơn giản nhất, không cần aggregate cho range 24h)
3. Implement `GET /activity` (compute từ comparison data)
4. Mở rộng `/health.scanner` với fields mới
5. (Sau) Add bucket aggregation cho range 7d/all nếu cần

Mỗi endpoint nên có test riêng trong `test/`:
- `test/scan-history.test.js`
- `test/activity-feed.test.js`
- `test/health-extended.test.js`

Pattern test: setup store với mock runs → gọi handler → assert shape.

---

## 6. Notify retry tracking (optional polish)

Current code có retry với exponential backoff (xem `src/scanner/telegram.js`). Để compute `retried` count chính xác:

Thêm `run.notification.attempts: number` (1 = lần đầu OK, 2-3 = retry). Đang có hoặc chưa thì verify code hiện tại; nếu chưa thì thêm — chỉ cần tăng `attempts++` trong retry loop.

---

Hết. Mọi endpoint phải khớp với pattern hiện tại trong `src/server.js`. Tham khảo `GET /scan-jobs/:id/runs` cho cách lookup + auth.
