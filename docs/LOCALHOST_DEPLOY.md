# Huong Dan Deploy Localhost

Tai lieu nay huong dan chay day du APG Price Scan tren may local Windows de test thuc te truoc khi deploy len server.

He thong local gom 3 phan:

- OCR sidecar Python: `http://127.0.0.1:8001`
- Backend Node.js va frontend static: `http://127.0.0.1:3100`
- File local: session Nam Thanh, job scan va lich su scan

Khong commit credential that, token Telegram, token n8n, session Nam Thanh, screenshot hoac lich su scan.

## 1. Yeu Cau

Can cai san:

- Git
- Node.js 18 tro len
- npm
- Python 3.8 tro len
- PowerShell
- Chromium do Playwright cai dat

Kiem tra:

```powershell
git --version
node --version
npm --version
python --version
```

## 2. Clone Hoac Cap Nhat Repo

Clone moi:

```powershell
git clone https://github.com/nhamaykem44331-max/APG-Price-Scan.git 'C:\Ca nhan\Du An\Price Scan'
Set-Location -LiteralPath 'C:\Ca nhan\Du An\Price Scan'
```

Neu repo da co san:

```powershell
Set-Location -LiteralPath 'C:\Ca nhan\Du An\Price Scan'
git status
git pull origin main
```

Neu duong dan tren may co dau tieng Viet, van dung duoc trong PowerShell khi dat trong dau nhay va dung `-LiteralPath`.

## 3. Cai Dependency Node Va Playwright

```powershell
npm install
npx playwright install chromium
```

Neu muon cai sach theo `package-lock.json`:

```powershell
npm ci
npx playwright install chromium
```

## 4. Cai OCR Python

Khuyen nghi dung virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install flask ddddocr
```

Neu khong dung virtual environment:

```powershell
python -m pip install flask ddddocr
```

## 5. Tao Va Cau Hinh `.env`

Copy file mau:

```powershell
Copy-Item .env.example .env
```

Sau do mo `.env` va dien gia tri that. Mau cau hinh local toi thieu:

```env
NODE_ENV=development

NAMTHANH_USERNAME=your_namthanh_username
NAMTHANH_PASSWORD=your_namthanh_password
NAMTHANH_AGENCY_CODE=your_agency_code

DDDDOCR_API_URL=http://localhost:8001
HEADLESS=true
SCREENSHOT_DIR=./screenshots
SESSION_FILE=./session/storage-state.json
LOGIN_SKIP_SCREENSHOTS=true

BACKEND_PORT=3100
PORT=3100

BACKEND_ALLOW_NO_AUTH=true
BACKEND_API_KEY=

MUADI_AES_KEY=your_muadi_aes_key
MUADI_AES_IV=your_muadi_aes_iv

SCAN_STORE_FILE=./data/scan-store.json
SCAN_HISTORY_RETENTION_DAYS=3
SCAN_MIN_INTERVAL_MINUTES=5
SCAN_MIN_INTERVAL_SECONDS=5
SCANNER_AUTO_START=true

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
TELEGRAM_API_BASE=https://api.telegram.org
TELEGRAM_TIMEOUT_MS=10000
TELEGRAM_DISABLE_NOTIFICATION=false
TELEGRAM_MAX_RETRY=3

N8N_ZALO_WEBHOOK_URL=https://your-n8n-domain/webhook/price-scan-zalo
N8N_ZALO_TARGET_ID=your_zalo_user_or_group_id
N8N_ZALO_THREAD_TYPE=1
N8N_WEBHOOK_TIMEOUT_MS=10000
N8N_WEBHOOK_MAX_RETRY=3
```

Che do local de thao tac nhanh:

```env
BACKEND_ALLOW_NO_AUTH=true
BACKEND_API_KEY=
```

Che do local co bao ve API key:

```env
BACKEND_ALLOW_NO_AUTH=false
BACKEND_API_KEY=use_a_long_random_value_here
```

Khi bat che do co API key, can paste dung gia tri `BACKEND_API_KEY` vao o `API key` tren goc phai frontend va bam `Save key`.

Quy tac bao mat:

- Khong commit `.env`.
- Khong commit `session/storage-state.json`.
- Khong commit `data/scan-store.json` neu co du lieu that.
- Khong dua mat khau Nam Thanh, token Telegram, token n8n hoac API key vao README/docs/log cong khai.

## 6. Tao Thu Muc Local

```powershell
New-Item -ItemType Directory -Force session, data, screenshots | Out-Null
```

Nhung thu muc nay da duoc ignore trong git.

## 7. Chay OCR Sidecar

Mo Terminal 1:

```powershell
Set-Location -LiteralPath 'C:\Ca nhan\Du An\Price Scan'
npm run ocr
```

Neu dung `.venv`:

```powershell
Set-Location -LiteralPath 'C:\Ca nhan\Du An\Price Scan'
.\.venv\Scripts\python ocr_server.py 8001
```

Kiem tra OCR:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Neu OCR chay dung, endpoint se tra ve trang thai OK/healthy.

## 8. Chay Backend Va Frontend

Mo Terminal 2:

```powershell
Set-Location -LiteralPath 'C:\Ca nhan\Du An\Price Scan'
npm run api
```

Lenh tuong duong:

```powershell
npm run backend
```

Mo trinh duyet:

```text
http://localhost:3100/
```

Neu giao dien chua cap nhat, bam `Ctrl + F5`.

## 9. Kiem Tra Backend

Neu local dang tat auth:

```powershell
Invoke-RestMethod http://127.0.0.1:3100/health
Invoke-RestMethod http://127.0.0.1:3100/scan-settings
```

Neu local dang bat API key:

```powershell
$apiKey = 'paste_your_BACKEND_API_KEY_here'
$headers = @{ 'X-API-Key' = $apiKey }

Invoke-RestMethod http://127.0.0.1:3100/health -Headers $headers
Invoke-RestMethod http://127.0.0.1:3100/scan-settings -Headers $headers
```

Can kiem tra cac truong:

- `ok`: backend dang chay
- `sessionOk`: session Nam Thanh dung
- `ocrReachable`: backend goi duoc OCR sidecar
- `scanner.started`: scheduler da start
- `scanner.jobCount`: tong so job
- `scanner.enabledJobCount`: so job dang bat
- `scanner.nextScheduledRun`: lan scan sap toi
- `telegram`: trang thai cau hinh Telegram
- `zalo`: trang thai cau hinh Zalo/n8n

## 10. Tao Hoac Refresh Session Nam Thanh

Neu `BACKEND_WARMUP=true`, backend co the tu warm-up session khi khoi dong.

Co the login/refresh thu cong:

```powershell
npm run login
```

Session se duoc luu tai:

```text
session/storage-state.json
```

Neu login loi:

- Kiem tra `NAMTHANH_USERNAME`, `NAMTHANH_PASSWORD`, `NAMTHANH_AGENCY_CODE`.
- Kiem tra OCR dang chay.
- Tam thoi dat `HEADLESS=false` de xem trinh duyet khi login.
- Xoa `session/storage-state.json` cu va chay lai `npm run login`.

## 11. Su Dung Frontend

Mo:

```text
http://localhost:3100/
```

Neu dang bat API key:

1. Paste `BACKEND_API_KEY` vao o API key.
2. Bam `Save key`.
3. Tiep tuc thao tac job.

Tao job scan:

1. Bam `New`.
2. Nhap `From`, vi du `HAN`.
3. Nhap `To`, vi du `SGN`.
4. Chon `Flight date`.
5. Nhap `Airline`, vi du `VJ`.
6. Neu can, nhap `Flight number`, vi du `VJ125`.
7. Dung `Exact time` hoac `Time from` / `Time to`.
8. Nhap `Interval`.
9. Chon `Interval unit`: `Minutes` de theo doi that, `Seconds` de test nhanh local.
10. Chon `Notify platform`: `Telegram` hoac `Zalo`.
11. De `Enabled` neu muon job tu dong chay theo lich.
12. Bam `Save job`.

Test scheduler nhanh:

```text
Interval = 5
Interval unit = Seconds
Notify mode = Every run
Enabled = checked
```

Khong nen dung interval qua ngan trong thoi gian dai.

## 12. Test Telegram

Dam bao `.env` co:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

Test tu UI:

1. Chon `Notify platform = Telegram`.
2. Bam `Test Notify`.

Test bang PowerShell:

```powershell
$apiKey = 'paste_your_BACKEND_API_KEY_here'
$headers = @{
  'X-API-Key' = $apiKey
  'Content-Type' = 'application/json'
}
$body = @{ channel = 'telegram'; text = 'APG Price Scan local Telegram test' } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3100/notifications/test `
  -Headers $headers `
  -Body $body
```

Neu `BACKEND_ALLOW_NO_AUTH=true`, header `X-API-Key` khong bat buoc.

## 13. Test Zalo Qua n8n

Dam bao `.env` co:

```env
N8N_ZALO_WEBHOOK_URL=https://your-n8n-domain/webhook/price-scan-zalo
N8N_ZALO_TARGET_ID=your_zalo_user_or_group_id
N8N_ZALO_THREAD_TYPE=1
```

Workflow n8n can co luong:

```text
Webhook POST /webhook/price-scan-zalo
  -> Zalo node gui noi dung {{$json.content}}
```

Test tu UI:

1. Chon `Notify platform = Zalo`.
2. Bam `Test Notify`.

Test bang PowerShell:

```powershell
$apiKey = 'paste_your_BACKEND_API_KEY_here'
$headers = @{
  'X-API-Key' = $apiKey
  'Content-Type' = 'application/json'
}
$body = @{ channel = 'zalo'; text = 'APG Price Scan local Zalo test' } | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3100/notifications/test `
  -Headers $headers `
  -Body $body
```

Neu UI bao `Zalo sent` nhung Zalo khong nhan tin:

- Kiem tra workflow n8n da active.
- Kiem tra dang dung production webhook URL, khong phai test webhook URL.
- Kiem tra `N8N_ZALO_TARGET_ID` va `N8N_ZALO_THREAD_TYPE`.
- Xem execution moi nhat trong n8n.
- Dam bao Zalo node lay noi dung tu `{{$json.content}}`.

## 14. Kiem Tra Job Scan

Sau khi luu job:

1. Dong job phai hien `Next: ...`.
2. Doi den tick tiep theo hoac bam `Run now`.
3. Mo `History`.
4. Kiem tra run co status `success` hoac loi ro rang.
5. Kiem tra Telegram/Zalo nhan bao cao neu notifications dang bat.

Kiem tra qua API:

```powershell
$apiKey = 'paste_your_BACKEND_API_KEY_here'
$headers = @{ 'X-API-Key' = $apiKey }

Invoke-RestMethod http://127.0.0.1:3100/scan-jobs -Headers $headers
```

## 15. Tuy Chon Chay Bang Docker Local

Dockerfile hien chay OCR va backend trong cung container.

Build image:

```powershell
docker build -t apg-price-scan:local .
```

Tao storage local:

```powershell
New-Item -ItemType Directory -Force .\storage\session, .\storage\data, .\storage\screenshots | Out-Null
```

Run container:

```powershell
docker run --rm `
  --name apg-price-scan-local `
  --env-file .env `
  -e BACKEND_PORT=10000 `
  -e PORT=10000 `
  -e DDDDOCR_API_URL=http://127.0.0.1:8001 `
  -e SESSION_FILE=/app/storage/session/storage-state.json `
  -e SCAN_STORE_FILE=/app/storage/data/scan-store.json `
  -e SCREENSHOT_DIR=/app/storage/screenshots `
  -p 3100:10000 `
  -v ${PWD}\storage:/app/storage `
  apg-price-scan:local
```

Mo:

```text
http://localhost:3100/
```

## 16. Loi Thuong Gap

### Backend bao thieu API key

Nguyen nhan: `BACKEND_ALLOW_NO_AUTH=false` nhung request khong gui `BACKEND_API_KEY`.

Cach sua:

- Paste `BACKEND_API_KEY` vao UI va bam `Save key`, hoac
- Neu chi test local, dat `BACKEND_ALLOW_NO_AUTH=true` roi restart backend.

### OCR khong reachable

Kiem tra:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Cach sua:

- Chay OCR bang `npm run ocr`.
- Kiem tra `DDDDOCR_API_URL=http://localhost:8001`.
- Kiem tra Python da cai `flask` va `ddddocr`.

### Login Nam Thanh that bai

Cach sua:

- Kiem tra tai khoan, mat khau, agency code.
- Set `HEADLESS=false` va chay `npm run login`.
- Xoa `session/storage-state.json` va login lai.

### Job khong tu dong chay

Kiem tra:

```powershell
Invoke-RestMethod http://127.0.0.1:3100/scan-settings
```

Cach sua:

- Kiem tra `SCANNER_AUTO_START=true`.
- Kiem tra job da tick `Enabled`.
- Kiem tra `nextScheduledRun` co gia tri.
- Restart backend sau khi doi `.env`.

### Interval luu sai gia tri

Cach sua:

- Kiem tra UI co ca `Interval` va `Interval unit`.
- Chon lai `Minutes` hoac `Seconds`, sau do bam `Save job`.
- Bam `Ctrl + F5` neu trinh duyet dang cache `public/app.js` cu.

### Telegram ready nhung khong nhan tin

Cach sua:

- Kiem tra bot token dung.
- Kiem tra chat ID dung.
- Neu chat rieng, gui tin nhan cho bot truoc khi test.
- Neu group/channel, kiem tra bot co quyen gui tin.

### Zalo ready nhung khong nhan tin

Cach sua:

- Kiem tra workflow n8n da active.
- Kiem tra production webhook URL.
- Kiem tra credential Zalo node con hieu luc.
- Kiem tra Zalo node doc `{{$json.content}}`.
- Xem execution output trong n8n.

## 17. Dung Local Services

Trong moi terminal, bam:

```text
Ctrl + C
```

Neu chay Docker:

```powershell
docker stop apg-price-scan-local
```

## 18. Checklist Truoc Khi Push

Kiem tra status:

```powershell
git status --short
```

Dam bao khong stage:

- `.env`
- `session/`
- `screenshots/`
- `data/scan-store.json`
- `*.log`
- `node_modules/`

Kiem tra whitespace:

```powershell
git diff --check
```

Commit va push:

```powershell
git add README.md docs/LOCALHOST_DEPLOY.md
git commit -m "docs: add localhost deployment guide"
git push origin main
```
