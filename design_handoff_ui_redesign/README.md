# Handoff: APG Price Scan — UI Redesign + Backend Extensions

> Repo gốc: `github.com/nhamaykem44331-max/APG-Price-Scan`
> Stack hiện tại: Node.js (Express-style) backend + vanilla JS frontend tại `public/`
> Mục tiêu: thay frontend hiện tại bằng UI mới "Aviation Operations Terminal" + bổ sung 3 endpoint backend

---

## 0. About the Design Files

Các file trong `design/` là **design references** — prototype HTML/React mô tả look-and-feel và hành vi mong muốn. **KHÔNG copy nguyên xi** sang `public/`.

Repo APG Price Scan hiện đang dùng **vanilla JS + plain CSS + plain HTML** (không có build tool, không React, không bundler). Task là **viết lại UI mới này theo đúng stack vanilla JS hiện có**, dùng các API + tokens + class names hiện có ở `public/styles.css` làm điểm bắt đầu, KHÔNG migrate sang React/Vite.

Stack ràng buộc:
- `public/index.html` — static HTML
- `public/app.js` — vanilla JS, không framework, không build step
- `public/styles.css` — plain CSS với CSS custom properties

Lý do giữ vanilla: backend serve thẳng `public/` qua express.static, không có pipeline build. Đổi stack = phá deploy. Nếu muốn đổi sau, làm trong PR riêng.

---

## 1. Fidelity

**Hi-fi** — pixel-perfect. Mọi màu, font-size, spacing, border-radius, animation đều đã được chốt trong `design/styles.css`. Recreate cần bám sát các giá trị này.

Sai số chấp nhận được: ≤ 2px cho spacing, ≤ 1px cho border-radius. Màu phải đúng hex.

---

## 2. Scope of Work

### Frontend (bắt buộc)

Thay **toàn bộ** `public/index.html`, `public/app.js`, `public/styles.css` bằng implementation mới khớp với design ở `design/Price Scan.html`. Hai view chính:

| View | Trigger | File JSX tham khảo |
|---|---|---|
| **Dashboard** (default) | `/` hoặc `/dashboard` | `design/dashboard.jsx` |
| **Job Detail** | click 1 row trong routes board, hoặc `/jobs/:id` | `design/job-detail.jsx` |

Components dùng chung tham khảo `design/components.jsx`.

### Backend (3 endpoint mới)

Thêm vào `src/server.js`:

| Method | Path | Mục đích |
|---|---|---|
| `GET` | `/scan-jobs/:id/history?range=24h\|7d\|all` | Trả time-series price + seat để vẽ chart |
| `GET` | `/activity?limit=50` | Trả live activity feed cross-job (price up/down, sold, scan, error) |
| `GET` | `/health/extended` | Mở rộng `/health.scanner` với `scansByHour[24]`, `notifySuccessRate24h`, `totalScans24h` |

Spec chi tiết tại `BACKEND_API.md`.

### Backend (giữ nguyên)

Toàn bộ logic scanner/scheduler/Telegram/Zalo trong `src/scanner/*` và `src/server.js` (jobs CRUD, run-now, notifications) — **không sửa**.

---

## 3. Design Tokens (binding)

Đầy đủ tại `DESIGN_TOKENS.md`. Tóm tắt:

```css
/* Brand */
--apg-aviation-navy:  #143b5f;
--apg-brand-gold:     #c8a85a;
--apg-bg-page:        #f4f3ef;   /* cream warm */

/* Status */
--apg-success: #2e7d5b;
--apg-warning: #c27a1a;
--apg-danger:  #c84c3a;

/* Sidebar (NEW — dark navy) */
--apg-bg-sidebar:      #0c2238;
--apg-bg-sidebar-soft: #143b5f;

/* Radius scale */
--apg-radius-xs: 4px;
--apg-radius-sm: 6px;
--apg-radius-md: 10px;
--apg-radius-lg: 14px;
```

Dark mode + 4 accent variants (navy/emerald/copper/violet) đã định nghĩa sẵn — chỉ cần copy nguyên block từ `design/styles.css`.

Font: `Be Vietnam Pro` (sans-serif body) + `JetBrains Mono` (tabular data, IATA codes, prices, time). Đã load qua Google Fonts ở line 1 của `design/styles.css`.

---

## 4. Screens

### 4.1 Dashboard

**Layout (≥ 980px):**

```
┌─ Sidebar (248px) ─┬─ Top bar ────────────────────────────┐
│                   ├─ Page header (title + actions) ──────┤
│ • Dashboard       │                                       │
│ • Jobs    [4/6]   │ ┌─ Stat cards × 4 ─────────────────┐ │
│ • History         │ │ Total │ Scans │ Next │ Notify    │ │
│ • Notifications   │ └───────────────────────────────────┘ │
│                   │                                       │
│                   │ ┌─ Routes board ──────┬─ Activity ─┐  │
│                   │ │ ← 6 job rows →      │  Feed      │  │
│ avatar + user     │ │                     │  9 items   │  │
└───────────────────┴─────────────────────────────────────┘
```

**Layout (< 980px):** sidebar ẩn → mobile tab bar dưới đáy. Stats 4→2 cột. Routes board 1 cột (mỗi row stack vertical). Feed nằm dưới routes board.

**Mỗi stat card có:**
- 3px top accent bar (màu theo metric)
- Label uppercase eyebrow 11px
- Icon 24×24 trong rounded square (accent-soft bg)
- Giá trị to (32px Inter, tabular-nums, letter-spacing -0.02em)
- Insight phụ: mini-bar / sparkline / ring progress (xem `design/dashboard.jsx`)

**Routes board row (220 / 1fr / 110 / 130 / 140 / 110 grid):**
1. Status dot + tên job + meta (flight, interval, mode)
2. Route pill `HAN ── ✈ ── SGN · 22/05/2026` (plane chạy ngang khi hover)
3. Giá (mono, tabular) + delta % (↑ đỏ / ↓ xanh)
4. Seat count + horizontal bar (đỏ nếu sold, vàng nếu ≤ 3)
5. Next run absolute time + relative ("trong 8 phút")
6. Channel chip (Telegram blue / Zalo blue Z) + badges (muted, err)

Row paused → opacity 0.55, status dot xám. Row error → status dot đỏ, badge "err".

**Activity feed:** mỗi entry gồm: relative time mono 10px, kind pill (SOLD / ↓ giá / ↑ giá / ghế / error / scan), bold flight number, mô tả phụ. Scroll vertical, max-height 460px.

### 4.2 Job Detail

**Layout (≥ 980px):**

```
┌─ Top bar + breadcrumb (← Dashboard / Job detail) ────────────┐
│ Title: <job name>                              [Run now] ... │
│                                                               │
│ ┌─ HERO (route + meta + toggle) ────────────────────────────┐ │
│ │ HAN ── ✈ ── SGN     [Flight VJ125 | Date | Time | Every] │ │
│ │ Hà Nội     TP.HCM                              [● ACTIVE] │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌─ Chart panel ─────────────────────┬─ Settings sidebar ───┐ │
│ │ Min/Avg/Max/Trend + [1h 24h 7d ∞] │ Schedule              │ │
│ │ ┌────────────────────────────────┐│  Interval / Unit      │ │
│ │ │   Price line + Seat dash line  ││  ◉ Auto-schedule      │ │
│ │ │   Hover crosshair + tooltip    ││                       │ │
│ │ └────────────────────────────────┘│ Notifications         │ │
│ │ Legend                            │  Channel: [Tg] [Zalo] │ │
│ ├───────────────────────────────────┤  Mode: every/onChange │ │
│ │ Runs table (8 rows)               │  ◉ Mute               │ │
│ │ Time | Status | Price/seat | Δ    │  [Test notify]        │ │
│ └───────────────────────────────────┤                       │ │
│                                     │ Query                  │ │
│                                     │  From/To, Flight, Time │ │
│                                     └───────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Hero:**
- IATA codes 44px mono, tabular, letter-spacing 0.02em
- City name dưới IATA (12px Be Vietnam Pro secondary)
- Route line giữa 2 IATA: gradient navy→gold, 2px, 200px wide, có chấm tròn 2 đầu (navy bên trái, gold bên phải), `✈` 18px đè ở giữa (animation `planeNudge` 2.2s)
- Hero meta phải: 4 cell label/value + ToggleP​ill ACTIVE/PAUSED

**Toggle pill (`.toggle-pill`):**
- ON: bg `--apg-success-soft`, text `--apg-success`, knob fill `--apg-success` dịch sang phải
- OFF: bg `--apg-bg-surface-muted`, text muted

**Price chart (SVG, không dùng lib chart):**
- Container chiều rộng adaptive (ResizeObserver)
- Padding `padL=56 padR=56 padT=20 padB=30`
- Price line: navy 2px stroke + gradient fill area (navy 22% → 0%)
- Seat line: gold 1.5px stroke dashed (3 3) — Y axis bên phải, scale 0→max(9, max(seat))
- Grid: 4 dashed horizontal lines, label k (1k, 2k...) bên trái mono 10px
- X ticks: ~6 ticks evenly, format HH:MM mono 10px
- Hover: crosshair vertical dashed gray + tooltip đen 8/10px mono ("HH:MM · 1.846.000 ₫ · 4 ghế")

**Range tabs:** segmented control 1h / 24h / 7d / all, bg `--apg-bg-surface-muted`, padding 3px, active state white card + shadow xs.

**Runs table grid** `130 / 90 / 1fr / 200`:
- Head row uppercase eyebrow 10px tracking 0.12em
- Time mono 12px secondary
- Status badge (success/error)
- Price mono bold + match count + seat muted
- Changes pill stack (delta % up/down, seat ±, sold, new) + notify badge bên phải

**Settings sidebar — channel selector (rất khác bản cũ):**
2 card lớn (telegram + zalo), border 1.5px:
- Card có icon logo brand color (telegram #268fc8, zalo #0068d4)
- Hover: border darker
- Active: border navy + bg `--apg-aviation-navy-soft` + checkmark ✓ navy ở góc trên phải
- Status "● ready" / "● missing" 10px uppercase

Mode segmented: "Mọi lần quét" / "Chỉ khi đổi"
Switches: Mute + Direct only (`.switch` 40×22 với thumb 16×16 dịch).

---

## 5. Interactions & State

| Trigger | Action | Source |
|---|---|---|
| Click route row | Push to `/jobs/:id` view, scroll to top smooth | `app.jsx:openJob` |
| Click ← Dashboard breadcrumb | Pop back to dashboard | `app.jsx:goBack` |
| Click "Run now" | POST `/scan-jobs/:id/run-now`, refresh job + history | `app.jsx:runNow` |
| Click toggle pill / switch enabled | PATCH `/scan-jobs/:id` body `{enabled}` | `job-detail.jsx:onUpdate` |
| Click channel card | PATCH `/scan-jobs/:id` body `{notify: {channel}}` | `job-detail.jsx` |
| Click mute switch | PATCH `/scan-jobs/:id` body `{notify: {muted}}` | `job-detail.jsx` |
| Change chart range | Re-filter local `history` array, không gọi API | `job-detail.jsx:setRange` |
| Hover chart | Set hover index, render crosshair + tooltip | `components.jsx:PriceChart` |
| Theme toggle | Toggle `data-apg-theme="dark"` trên `<html>`, persist localStorage `priceScanTheme` | giống bản hiện tại |
| Tweaks panel | Postmessage protocol — bỏ trong production, chỉ cho prototype |

**Auto refresh:** mỗi 30s gọi lại `/scan-jobs`, `/health/extended`, `/activity?limit=50` (giữ pattern `startAutoRefresh` hiện tại).

**Animations:**
- `apgRowIn`: fade-up 6px, 0.25s ease (mỗi job row khi mount/insert)
- `planeNudge`: dịch ngang ±4px, 1.4s loop, áp lên `.plane` trong hero & `.route-pill .line::before` khi hover
- `pulse`: opacity 1↔0.4, 2s loop (health chip dot + live-dot)
- `prefers-reduced-motion: reduce` → tất cả animation về 0.01ms (đã có ở cuối CSS)

---

## 6. Responsive

| Breakpoint | Thay đổi |
|---|---|
| `≤ 1100px` | Stats grid 4 → 2 cột |
| `≤ 980px` | Sidebar ẩn → mobile tab bar dưới. Routes board head ẩn, mỗi row stack 1 cột. Detail grid 1 cột. Hero stack vertical. Runs table stack |
| `≤ 560px` | Stats 1 cột. App padding giảm còn 14px. Mobile tabbar safe-area-inset-bottom |

Mobile tab bar 4 tab: Dashboard / Jobs / History / Settings. Active state navy.

---

## 7. Accessibility

- Tất cả button có min-height 36px (38px ở size mặc định, 30px ở `.btn-sm`)
- Input focus: 3px ring `--apg-aviation-navy-ring` + border navy
- `accent-color: var(--apg-aviation-navy)` cho checkbox
- Channel cards là `<button>` — keyboard focusable + Enter để chọn
- `role="radiogroup"` cho channel selector + segmented mode
- ARIA-live region cho toast (CHƯA có ở bản hiện tại — phải thêm)
- `prefers-reduced-motion` honored

---

## 8. Files in `design/`

| File | Mục đích | Recreate as |
|---|---|---|
| `Price Scan.html` | Entry, load tất cả scripts | `public/index.html` |
| `styles.css` | **COPY GẦN NGUYÊN** — tokens + tất cả class names | `public/styles.css` |
| `app.jsx` | Routing + state shell | Vanilla `public/app.js`: dùng `history.pushState` + render functions |
| `dashboard.jsx` | Dashboard view | function `renderDashboard()` trong `public/app.js` |
| `job-detail.jsx` | Job detail view | function `renderJobDetail(jobId)` trong `public/app.js` |
| `components.jsx` | Icon, Sparkline, Ring, RoutePill, PriceChart, FeedItem, ChangePill | Helper functions trả về DOM string hoặc DocumentFragment |
| `mock-data.jsx` | Mock data (bỏ — backend trả thật) | — |
| `tweaks-panel.jsx` | Tweaks (bỏ ở production) | — |

**Quan trọng:** Khi recreate vanilla, giữ nguyên 100% class names trong `design/styles.css` để CSS không phải sửa.

---

## 9. Implementation Checklist

```
☐ Backup public/ hiện tại (rename → public.old/)
☐ Copy design/styles.css → public/styles.css (gần như nguyên xi, có thể bỏ tweaks-related selectors)
☐ Bỏ Google Fonts CDN, self-host hoặc giữ — option, ưu tiên giữ
☐ Viết public/index.html mới với sidebar + topbar + #root khu vực
☐ Viết public/app.js mới — chia thành các function render rõ ràng:
    ☐ renderShell() — sidebar + topbar + container
    ☐ renderDashboard(jobs, health, activity)
    ☐ renderJobDetail(job, history, runs)
    ☐ renderStatCard(label, value, sub, icon, accent, extra)
    ☐ renderRouteRow(job)
    ☐ renderPriceChart(svg, history)  ← SVG manipulation, không lib
    ☐ renderFeedItem(entry)
☐ Routing: hashchange-based hoặc history API
    ☐ #/ hoặc / → dashboard
    ☐ #/jobs/:id hoặc /jobs/:id → detail
☐ Wire up các API call (giữ apiFetch hiện tại):
    ☐ /scan-jobs, /scan-jobs/:id, PATCH, DELETE, /run-now
    ☐ /health/extended (NEW)
    ☐ /scan-jobs/:id/history?range=… (NEW)
    ☐ /activity?limit=50 (NEW)
☐ Auto-refresh 30s
☐ Backend: thêm 3 endpoint trong src/server.js (xem BACKEND_API.md)
☐ Backend: thêm computed fields cho activity feed (trong scanner hoặc store helper)
☐ Test: npm run backend + mở http://localhost:3100/
☐ Test responsive: 1440 / 1100 / 980 / 560 / 380
☐ Test dark mode toggle
☐ Test với job thật: tạo VJ125 HAN-SGN, scan, verify chart hiện đúng
```

---

## 10. Tài liệu chi tiết khác

- **`BACKEND_API.md`** — spec đầy đủ 3 endpoint mới (request, response, edge cases)
- **`DESIGN_TOKENS.md`** — toàn bộ CSS custom properties
- **`SCREENS.md`** — breakdown từng component chi tiết hơn nữa (nếu cần)

---

## 11. Câu hỏi mở (developer quyết)

1. **Routing**: dùng hashchange (đơn giản, không cần backend route) hay HTML5 history API (đẹp URL, cần backend trả `index.html` cho mọi `/jobs/*`)?
   - **Đề xuất**: hashchange — backend đỡ phải sửa, deeplink vẫn dùng được.

2. **Activity feed source**: 
   - Lựa chọn A: compute on-the-fly từ tất cả `runs` trong scan-store.json (đơn giản, không cần schema thay đổi).
   - Lựa chọn B: thêm `events` array vào store (chính xác hơn, cần migration).
   - **Đề xuất**: A — đủ tốt cho retention 3 ngày.

3. **History endpoint payload**: 
   - Trả full series ([{t, price, seat}]) — đơn giản nhưng có thể nặng nếu nhiều run.
   - Hay aggregate theo bucket (15 phút / 1h) theo range.
   - **Đề xuất**: Trả full series cho range ≤ 24h (≤ ~96 điểm với 15-min interval), aggregate 1h-bucket cho range 7d, 1d-bucket cho all.

4. **Tweaks panel**: production có bật accent color picker không?
   - **Đề xuất**: KHÔNG — bỏ luôn TweaksPanel ở production. Theme dark/light vẫn giữ qua nút topbar.

---

## License & Brand

- Toàn bộ assets aviation (plane glyph, navy/gold scheme) tiếp tục dùng theo brand tanphuapg.com
- Font Be Vietnam Pro + JetBrains Mono — Google Fonts free tier
- KHÔNG có dependency npm mới cần thêm

Hết. Có gì không rõ → đọc lại file `design/Price Scan.html` chạy trong browser để xem live.
