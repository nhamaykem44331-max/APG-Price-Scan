# Price Scan - Nam Thanh Flight Fare Scanner

## Huong Dan Deploy Localhost

Xem [docs/LOCALHOST_DEPLOY.md](docs/LOCALHOST_DEPLOY.md) de deploy va test day du du an tren localhost.

Ứng dụng local để tự động quét giá vé máy bay thật từ hệ thống Nam Thanh/booking.namthanh.vn, lưu lịch sử giá và gửi báo cáo qua Telegram Bot hoặc Zalo qua n8n webhook.

## Tính Năng Chính

- Đăng nhập Nam Thanh tự động bằng Playwright và OCR captcha.
- Gọi API Muadi/Nam Thanh trực tiếp để lấy giá thật, không scrape UI kết quả.
- Frontend local tại `http://localhost:3100/` để tạo và quản lý job quét giá.
- Cấu hình job theo ngày bay, chặng bay, hãng bay, số hiệu chuyến bay, giờ bay hoặc khung giờ.
- Quét định kỳ theo phút hoặc theo giây để test nhanh.
- Gửi báo cáo qua Telegram Bot hoặc Zalo sau mỗi lần quét hoặc chỉ khi giá thay đổi.
- Lưu lịch sử quét local trong `data/scan-store.json`.
- Tự xóa lịch sử cũ theo `SCAN_HISTORY_RETENTION_DAYS`, mặc định 3 ngày.

## Kiến Trúc

```text
Frontend static
  public/index.html
  public/app.js
  public/styles.css
        |
        v
Node backend
  src/server.js
        |
        +-- Scanner/scheduler: src/scanner/index.js
        +-- Search service:     src/scanner/scan-service.js
        +-- Telegram notifier:  src/scanner/telegram.js
        +-- Zalo/n8n notifier:  src/scanner/zalo.js
        +-- Local store:        src/scanner/store.js
        |
        v
Nam Thanh session + Muadi API
  session/storage-state.json
  src/muadi-client.js
  src/booking-workflow.js
```

Scheduler hiện dùng `setTimeout` trong chính process Node.js. Mỗi job có `nextRunAt`; khi đến giờ, backend chạy quét, lưu kết quả, gửi thông báo qua nền tảng đã chọn nếu bật, rồi cập nhật `nextRunAt = thời điểm kết thúc + interval`.

## Yêu Cầu

- Node.js 18+.
- npm.
- Python 3.8+ để chạy OCR server.
- Chromium cho Playwright.
- Tài khoản Nam Thanh hợp lệ.
- Telegram Bot token/Chat ID hoặc n8n Zalo webhook nếu muốn nhận thông báo.

## Cài Đặt Lần Đầu

```powershell
cd 'C:\Cá nhân\Dự Án\Price Scan'
npm install
npx playwright install chromium
```

Nếu dùng Python venv local:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install flask ddddocr
```

Tạo `.env` từ mẫu:

```powershell
Copy-Item .env.example .env
```

Sau đó điền các thông tin thật vào `.env`.

## Cấu Hình `.env`

Các biến quan trọng:

```env
NAMTHANH_USERNAME=
NAMTHANH_PASSWORD=
NAMTHANH_AGENCY_CODE=

DDDDOCR_API_URL=http://localhost:8001
HEADLESS=true
SESSION_FILE=./session/storage-state.json

MUADI_AES_KEY=
MUADI_AES_IV=

BACKEND_PORT=3100
BACKEND_ALLOW_NO_AUTH=true
ADMIN_USERNAME=tanphuapg
ADMIN_PASSWORD=8888
ADMIN_SESSION_SECRET=
BACKEND_WARMUP=false

SCAN_STORE_FILE=./data/scan-store.json
SCAN_HISTORY_RETENTION_DAYS=3
SCAN_MIN_INTERVAL_MINUTES=5
SCAN_MIN_INTERVAL_SECONDS=5
SCANNER_AUTO_START=true

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_API_BASE=https://api.telegram.org
TELEGRAM_TIMEOUT_MS=10000
TELEGRAM_DISABLE_NOTIFICATION=false

N8N_ZALO_WEBHOOK_URL=
N8N_ZALO_TARGET_ID=
N8N_ZALO_THREAD_TYPE=1
N8N_WEBHOOK_TIMEOUT_MS=10000
N8N_WEBHOOK_MAX_RETRY=3
```

Ghi chú:

- `BACKEND_ALLOW_NO_AUTH=true` chỉ nên dùng khi chạy local.
- Khi deploy server/Render, đặt `BACKEND_ALLOW_NO_AUTH=false`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` và `ADMIN_SESSION_SECRET`.
- `BACKEND_API_KEY` chỉ còn là fallback cho script/client cũ, không còn là cách đăng nhập chính của UI.
- Không commit `.env`, `session/`, `screenshots/`, `data/scan-store.json`.

## Chạy Local

Terminal 1: chạy OCR server.

```powershell
npm run ocr
```

Hoặc nếu dùng venv:

```powershell
.\.venv\Scripts\python ocr_server.py 8001
```

Kiểm tra OCR:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Terminal 2: chạy backend và frontend.

```powershell
npm run backend
```

Mở trình duyệt:

```text
http://localhost:3100/
```

Nếu frontend chưa hiện giao diện mới, bấm `Ctrl + F5` để tải lại cache.

## Hướng Dẫn Sử Dụng Frontend

Mở `http://localhost:3100/`, tạo job quét giá bằng form bên trái.

Các trường chính:

- `Name`: tên job để dễ nhận diện.
- `From`: sân bay đi, ví dụ `HAN`.
- `To`: sân bay đến, ví dụ `SGN`.
- `Flight date`: ngày bay.
- `Airline`: mã hãng, ví dụ `VJ`.
- `Flight number`: số hiệu chuyến bay, ví dụ `VJ125`.
- `Exact time`: nếu chỉ muốn đúng một giờ bay cụ thể.
- `Time from` / `Time to`: khung giờ bay, ví dụ `06:00` đến `12:00`.
- `Interval`: số chu kỳ quét.
- `Interval unit`: chọn `Minutes` hoặc `Seconds`.
- `Notify mode`: chọn cách gửi thông báo (`Every run` hoặc `On change`).
- `Notify platform`: switch chọn kênh nhận thông báo `Telegram` hoặc `Zalo`.
- `Enabled`: bật/tắt lịch quét tự động.
- `Notifications`: bật/tắt gửi thông báo cho job này.
- `Mute`: vẫn quét và lưu lịch sử nhưng không gửi thông báo.
- `Direct only`: chỉ lấy chuyến bay thẳng.

Các nút:

- `Save job`: lưu job và lập lịch tự động.
- `Run now`: quét ngay một lần.
- `Delete`: xóa job và lịch sử của job đó.
- `Test Notify`: gửi tin nhắn test đến nền tảng đang chọn trong switch Telegram/Zalo.

## Quét Theo Giây Để Test

Để test thực tế nhanh:

1. Nhập thông tin chuyến bay.
2. Đặt `Interval = 5`.
3. Chọn `Interval unit = Seconds`.
4. Bật `Enabled`.
5. Bấm `Save job`.

Backend sẽ quét lại sau mỗi 5 giây, tính từ lúc lần quét trước kết thúc.

Ngưỡng tối thiểu được điều khiển bằng:

```env
SCAN_MIN_INTERVAL_SECONDS=5
SCAN_MIN_INTERVAL_MINUTES=5
```

Khuyến nghị:

- Dùng giây chỉ để test local trong thời gian ngắn.
- Khi theo dõi thật, dùng phút, ví dụ 30 hoặc 60 phút.
- Không đặt chu kỳ quá dày khi deploy server để tránh tạo tải không cần thiết lên hệ thống Nam Thanh.

## Cơ Chế Scheduler

Mỗi job được lưu vào `data/scan-store.json` với cấu trúc chính:

```json
{
  "id": "job_xxx",
  "enabled": true,
  "query": {
    "from": "HAN",
    "to": "SGN",
    "date": "14-05-2026",
    "airline": "VJ",
    "flightNumber": "VJ125",
    "departureTimeStart": "06:00",
    "departureTimeEnd": "12:00"
  },
  "schedule": {
    "intervalValue": 60,
    "intervalUnit": "minutes",
    "intervalSeconds": 3600
  },
  "notify": {
    "telegramEnabled": true,
    "mode": "every_run"
  },
  "nextRunAt": "2026-05-13T12:20:23.000Z"
}
```

Luồng chạy:

1. Backend start và gọi `scanner.start()`.
2. Scanner đọc job từ `data/scan-store.json`.
3. Với mỗi job `enabled=true`, scanner tạo `setTimeout` đến `nextRunAt`.
4. Đến giờ, scanner gọi Nam Thanh/Muadi để lấy giá.
5. Kết quả được lưu vào `runs`.
6. Nếu bật thông báo, backend gửi báo cáo qua Telegram hoặc Zalo theo `Notify platform`.
7. Scanner cập nhật `nextRunAt` và lập timer mới.

Nếu backend bị tắt, timer trong RAM mất. Khi bật lại backend, scanner đọc lại job từ store và lập lịch lại.

## Thông Báo: Telegram Và Zalo

Ứng dụng dùng Telegram Bot API `sendMessage`.

Cấu hình:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Cách lấy thông tin:

- Tạo bot bằng BotFather để lấy `TELEGRAM_BOT_TOKEN`.
- Nhắn tin cho bot hoặc thêm bot vào group.
- Lấy `TELEGRAM_CHAT_ID` bằng công cụ/API Telegram phù hợp với bot của bạn.

Chế độ thông báo:

- `Every run`: gửi báo cáo sau mỗi lần quét.
- `On change`: chỉ gửi khi có chuyến mới, hết chuyến, **giá thay đổi**, hoặc **số chỗ thay đổi** (cả tăng lẫn giảm, kể cả sold-out 5 → 0).
- Per-job toggle `Mute`: tạm tắt thông báo mà vẫn tiếp tục quét và lưu lịch sử (error/auto-disable alert vẫn được gửi).

Nội dung Telegram đã được polish:

- Emoji trạng thái: ✅ run thành công, ⚠️ run lỗi, 🆕 lần quét đầu tiên, 🛑 job vừa bị auto-disable, 🔇 cảnh báo empty streak.
- Marker per-flight: 🔴 `SOLD` khi `seatAvailable === 0`, 🟡 khi `seatAvailable < 5`.
- Header `📊 Change:` tóm tắt: số chuyến giá lên/xuống kèm `avg %`, số chỗ đổi (kèm số SOLD), số chuyến mới/mất.
- Group theo airline (`── VJ ──`, `── VN ──`...) để dễ đọc khi quét nhiều hãng cùng route.
- Tự động split thành nhiều message Telegram nếu vượt 3700 ký tự (suffix `(1/N)` / `(2/N)`).
- Retry 3 lần với exponential backoff khi Telegram trả 429 (rate limit) hoặc 5xx; tôn trọng `parameters.retry_after`. Cấu hình `TELEGRAM_MAX_RETRY`.

Cảnh báo tự động:

- **Empty streak**: nếu mode `On change` và scan trả về rỗng `SCAN_EMPTY_STREAK_THRESHOLD` lần liên tiếp (mặc định 3), bắn 1 alert để khỏi bị silent fail.
- **Circuit breaker**: nếu scan lỗi `SCAN_FAILURE_THRESHOLD` lần liên tiếp (mặc định 5), job tự `enabled=false` + bắn alert qua nền tảng đã chọn (luôn gửi, kể cả khi mute).

### Zalo Qua n8n

Khi chọn `Notify platform = Zalo`, backend không gọi Zalo trực tiếp. Backend POST payload vào webhook n8n, workflow n8n dùng node Zalo đã đăng nhập để gửi nội dung sang user hoặc group Zalo.

Cấu hình `.env`:

```env
N8N_ZALO_WEBHOOK_URL=https://n8nhosting-72225366.phoai.vn/webhook/price-scan-zalo
N8N_ZALO_TARGET_ID=
N8N_ZALO_THREAD_TYPE=1
N8N_WEBHOOK_TIMEOUT_MS=10000
N8N_WEBHOOK_MAX_RETRY=3
```

Ý nghĩa:

- `N8N_ZALO_WEBHOOK_URL`: production webhook URL của workflow `Price Scan`.
- `N8N_ZALO_TARGET_ID`: Zalo user ID hoặc group ID nhận thông báo.
- `N8N_ZALO_THREAD_TYPE`: `0` nếu gửi cá nhân, `1` nếu gửi group.
- `N8N_WEBHOOK_MAX_RETRY`: retry khi webhook n8n trả 429/5xx hoặc lỗi mạng.

Workflow n8n `Price Scan` cần có luồng:

```text
Webhook POST /webhook/price-scan-zalo
  -> ZaloUser send message
```

Webhook nhận các field chính từ backend:

```json
{
  "content": "noi dung bao cao",
  "summaryText": "noi dung bao cao",
  "zaloTargetId": "user_or_group_id",
  "zaloThreadType": 1,
  "job": { "id": "job_xxx", "name": "VJ125 HAN-SGN" },
  "query": { "from": "HAN", "to": "SGN", "date": "2026-05-14" },
  "run": { "status": "success", "matchCount": 1 },
  "results": []
}
```

Trên UI, dùng switch `Notify platform` để chọn `Telegram` hoặc `Zalo` cho từng job. Nút `Test Notify` sẽ gửi test theo nền tảng đang chọn.

## Canh Giá Chỗ Giữ (Reservation Watch)

Cơ chế tự động canh giá cho **các chỗ đang giữ** trên `booking.namthanh.vn/booking/reservation-status`:

- Mỗi `RESERVATION_WATCH_INTERVAL_MINUTES` (mặc định **30 phút**), backend gọi `management/list-booking` (API đứng sau trang reservation-status) để lấy danh sách giữ chỗ. Body phải **mã hoá** kèm filter `{fromDate,toDate,serviceType:"Flights",...}` (xem `MuadiApiClient.listBooking`; dùng cửa sổ lookback 7 ngày để bắt cả chỗ giữ từ vài ngày trước).
- Với mỗi chỗ giữ, hệ thống **re-scan đúng chuyến đang giữ** — list-booking không trả số hiệu chuyến nên match bằng **hãng + route + giờ cất cánh** (từ `depDay`) qua `searchJourney` + `selectFlight` + `cheapestFare`.
- Nếu **giá hiện tại < giá đang giữ** → gửi **Zalo** ngay (kèm giá giữ → giá mới, chênh lệch, số chỗ còn).
- Chống spam: chỉ báo **1 lần khi mới rớt**; chỉ re-alert nếu giá **rớt sâu hơn** mức đã báo.
- **Chỉ auto-canh chỗ còn "Thời gian giữ chỗ" thật trong tương lai** (`hasHoldTime`). Chỗ **không có thời gian giữ chỗ** (timelimit placeholder `01-01-1990`) hoặc **đã qua hạn** = coi như **hết hạn** → **tự động dừng canh**, vẫn hiển thị trong bảng kèm nút **"Kích hoạt"** (`POST /reservation-watch/override {pnr,on}`) để canh tiếp nếu vẫn muốn. Chuyến **đã bay** thì bỏ hẳn.
- Bảng "Canh giá chỗ giữ" mirror trang reservation-status (Hãng/PNR/Hành trình/Khách hàng/Giá giữ/Giá hiện tại/Thời gian giữ chỗ/Ngày đặt/Trạng thái/Người dùng) + cột **Giá hiện tại** (chênh lệch + số ghế) và cột **Canh giá** (Đang canh / Kích hoạt).
- Quét **lần lượt nhiều tài khoản** (`config.accounts`: chính + `NAMTHANH_USERNAME_2…`) để gom hết PNR; gộp theo PNR, 1 tài khoản lỗi không làm hỏng cả cycle.
- Round-trip tạm bỏ qua (MVP one-way).
- ⚠️ list-booking **không trả số khách** → mặc định 1 khách. Có guard chặn "rớt giá" bất thường (currentTotal < 60% giá giữ) để tránh báo sai với booking nhiều khách.

Cấu hình (env hoặc Settings UI):

```env
RESERVATION_WATCH_ENABLED=true
RESERVATION_WATCH_INTERVAL_MINUTES=30
RESERVATION_WATCH_SCOPE=held    # 'held' = chỉ chỗ chưa xuất vé + còn hạn; 'all' = mọi booking
RESERVATION_WATCH_MIN_DROP=0    # ngưỡng chênh tối thiểu (VND); 0 = mọi mức rẻ hơn
```

Trên UI: vào **Settings → Canh giá chỗ giữ** để bật/tắt, chọn phạm vi (held/all), chu kỳ, ngưỡng, và bấm **Quét ngay** để chạy thử. Bảng bên dưới liệt kê chỗ giữ + so giá gần nhất.

> ⚠️ Yêu cầu session Muadi còn sống (cần `npm run ocr` + `npm run login`). Field-mapping của `management/list-booking` đã verify bằng response thật (`pnrCode, airlines, depCity/retCity, depDay/retDay, timelimit, bookingStatusNote, bookingStatus, totalPrice` — xem `src/scanner/reservation-parser.js`). Để re-capture/giải mã lại request body khi API đổi, chạy `node scripts/dev/capture-listbooking.js`.

## Lưu Lịch Sử

Store local:

```text
data/scan-store.json
```

File này chứa:

- Danh sách job.
- Lịch sử các lần quét.
- Kết quả từng lần quét.
- Trạng thái gửi thông báo.

Retention mặc định:

```env
SCAN_HISTORY_RETENTION_DAYS=3
```

Scanner tự prune lịch sử cũ khi start và định kỳ trong lúc chạy.

## API Chính

```text
GET    /health                          # Full health + scanner stats
GET    /scan-settings                   # Min interval, thresholds, Telegram/Zalo status
GET    /scan-jobs                       # List all jobs
GET    /scan-jobs/:id                   # Get job detail
POST   /scan-jobs                       # Create job
PATCH  /scan-jobs/:id                   # Update job (partial)
DELETE /scan-jobs/:id                   # Delete job + runs + notifications
POST   /scan-jobs/:id/run-now           # Manual trigger
GET    /scan-jobs/:id/runs?limit=50     # History runs of one job
GET    /scan-runs/:id                   # Get one run detail
GET    /scan-notifications?limit=50&status=sent|failed&jobId=...  # Audit notification delivery
POST   /notifications/test              # Send test message by channel: telegram|zalo
POST   /notifications/telegram/test     # Send test Telegram message
POST   /notifications/zalo/test         # Send test Zalo message through n8n webhook
GET    /reservations                    # Danh sách chỗ giữ đang theo dõi + so giá gần nhất
GET    /reservation-watch/status        # Trạng thái watcher (enabled, scope, lastRunAt, ...)
POST   /reservation-watch/run-now       # Chạy 1 chu kỳ canh giá ngay
PATCH  /reservation-watch/settings      # Cập nhật enabled/scope/intervalMinutes/minDropAmount
```

`/health.scanner` trả về thêm `jobCount`, `enabledJobCount`, `nextScheduledRun`, `recentFailures`, `notificationFailures24h`, `lastRun` để monitor không cần gọi thêm endpoint.

Ví dụ tạo job quét mỗi 60 phút:

```json
{
  "name": "VJ125 HAN-SGN 14-05-2026",
  "enabled": true,
  "query": {
    "from": "HAN",
    "to": "SGN",
    "date": "2026-05-14",
    "airline": "VJ",
    "flightNumber": "VJ125",
    "departureTimeStart": "06:00",
    "departureTimeEnd": "12:00",
    "directOnly": true,
    "adt": 1,
    "chd": 0,
    "inf": 0
  },
  "schedule": {
    "intervalValue": 60,
    "intervalUnit": "minutes"
  },
  "notify": {
    "telegramEnabled": true,
    "channel": "telegram",
    "mode": "every_run",
    "notifyOnError": true,
    "muted": false
  }
}
```

Ví dụ tạo job quét mỗi 5 giây để test:

```json
{
  "name": "Test VJ125 every 5s",
  "enabled": true,
  "query": {
    "from": "HAN",
    "to": "SGN",
    "date": "2026-05-14",
    "airline": "VJ",
    "flightNumber": "VJ125",
    "departureTimeStart": "06:00",
    "departureTimeEnd": "12:00",
    "directOnly": true,
    "adt": 1
  },
  "schedule": {
    "intervalValue": 5,
    "intervalUnit": "seconds"
  },
  "notify": {
    "telegramEnabled": true,
    "mode": "every_run"
  }
}
```

## CLI Nam Thanh/Muadi

Các lệnh CLI vẫn dùng được để debug backend trực tiếp.

Login hoặc refresh session:

```powershell
npm run login
```

Tìm chuyến:

```powershell
npm run journey -- --from HAN --to SGN --date 14-05-2026 --airline VJ
```

Xem giá một chuyến theo giờ bay:

```powershell
npm run price -- --from HAN --to SGN --date 14-05-2026 --airline VJ --time 07:00
```

Giữ chỗ dry-run:

```powershell
npm run hold -- --from HAN --to SGN --date 14-05-2026 --airline VJ --time 07:00 --passenger "MR Nguyen Van A" --dry-run
```

Không chạy giữ chỗ thật nếu chưa kiểm tra kỹ passenger/contact/payment policy.

## Cấu Trúc Thư Mục

```text
.
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src/
│   ├── server.js
│   ├── scanner/
│   │   ├── index.js
│   │   ├── scan-service.js
│   │   ├── store.js
│   │   └── telegram.js
│   ├── booking-workflow.js
│   ├── muadi-client.js
│   ├── login.js
│   └── config.js
├── data/
│   ├── airports.json
│   └── scan-store.json        # ignored
├── session/                   # ignored
├── screenshots/               # ignored
├── ocr_server.py
├── package.json
└── .env                       # ignored
```

## Troubleshooting

Kiểm tra backend:

```powershell
Invoke-RestMethod http://127.0.0.1:3100/health
```

Kiểm tra scanner:

```powershell
Invoke-RestMethod http://127.0.0.1:3100/scan-settings
```

Kiểm tra OCR:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Nếu Telegram không gửi:

- Kiểm tra `TELEGRAM_BOT_TOKEN`.
- Kiểm tra `TELEGRAM_CHAT_ID`.
- Chọn `Notify platform = Telegram`, rồi bấm `Test Notify` trên UI.
- Xem response của `POST /notifications/telegram/test`.

Nếu Zalo không gửi:

- Kiểm tra workflow n8n `Price Scan` đang active.
- Kiểm tra `N8N_ZALO_WEBHOOK_URL` trỏ tới production webhook `/webhook/price-scan-zalo`.
- Kiểm tra `N8N_ZALO_TARGET_ID` và `N8N_ZALO_THREAD_TYPE`.
- Chọn `Notify platform = Zalo`, rồi bấm `Test Notify` trên UI.
- Xem response của `POST /notifications/zalo/test`.

Nếu không quét được giá:

- Kiểm tra session Nam Thanh đã login chưa.
- Chạy `npm run login`.
- Kiểm tra `MUADI_AES_KEY` và `MUADI_AES_IV`.
- Kiểm tra route/date/airline/flight number có đúng không.
- Mở `History` để xem lỗi cụ thể của run.

Nếu UI không cập nhật:

- Bấm `Ctrl + F5`.
- Đảm bảo backend đã restart sau khi sửa code.

## Deploy Server Sau Khi Test Ổn

Khi chuyển từ local sang server:

- Đặt `NODE_ENV=production`.
- Đặt `BACKEND_ALLOW_NO_AUTH=false`.
- Đặt `ADMIN_USERNAME`, `ADMIN_PASSWORD` và `ADMIN_SESSION_SECRET`.
- Chỉ đặt `BACKEND_API_KEY` nếu cần giữ fallback cho script/client cũ.
- Chạy backend bằng process manager như PM2 hoặc Docker.
- Mount volume cho `session/` và `data/scan-store.json`.
- Giữ `SCAN_MIN_INTERVAL_SECONDS` đủ cao hoặc tắt quét theo giây ở production.
- Cân nhắc chuyển local JSON store sang SQLite/Postgres nếu số job lớn hoặc cần multi-instance.

## Bảo Mật

- Không commit `.env`.
- Không commit `session/storage-state.json`.
- Không commit `data/scan-store.json` nếu có dữ liệu thật.
- Không gửi token Telegram, token n8n, mật khẩu Nam Thanh hoặc access token qua log/chat.
- Khi deploy public, bắt buộc bật admin login, đặt `ADMIN_SESSION_SECRET` mạnh và giới hạn CORS nếu có frontend khác origin.
