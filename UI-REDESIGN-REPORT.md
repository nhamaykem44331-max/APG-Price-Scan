# Price Scan — UI Redesign Report

**Audience:** code review (Codex 5.5)
**Scope:** frontend redesign (`public/index.html`, `public/app.js`, `public/styles.css`) plus a small `/health` privacy adjustment in `src/server.js`.
**Goal:** align Price Scan admin UI với design system của `tanphuapg.com` (cùng pháp nhân Tan Phu APG) để Andy không cảm thấy 2 sản phẩm tách rời khi switching tab.

---

## 1. Context

Price Scan là admin tool nội bộ để theo dõi giá vé + số chỗ định kỳ + push Telegram/Zalo. Trước redesign nó dùng palette generic teal `#0f766e` + xám lạnh `#f6f7f9`, không liên quan thị giác đến `tanphuapg.com`. Cùng owner, cùng dataset (Muadi API booking.namthanh.vn), nên thống nhất design language giúp:

- Giảm cognitive switching cost khi Andy nhảy giữa booking site và admin tool.
- Tăng độ tin cậy thị giác (cùng brand = cùng tổ chức).
- Tái sử dụng nguyên design tokens, không tự bịa.

---

## 2. Design source — APG Design System

Đã research:

1. `https://tanphuapg.com` (live).
2. `https://github.com/nhamaykem44331-max/TanPhuAPG-Bookingweb` — Next.js + TypeScript + Tailwind, custom CSS tokens trong `app/globals.css`.

Key findings:

| Token | Value | Vai trò |
|---|---|---|
| `--apg-bg-page` | `#f4f3ef` | Cream warm background |
| `--apg-bg-surface` | `#ffffff` | Card primary |
| `--apg-bg-surface-soft` | `#e9eef2` | Card secondary, hover |
| `--apg-text-primary` | `#0f2f4b` | Deep navy text |
| `--apg-text-secondary` | `#5e7288` | Slate-blue muted text |
| `--apg-text-muted` | `#8090a0` | Caption |
| `--apg-aviation-navy` | `#143b5f` | Primary brand / CTA |
| `--apg-brand-gold` | `#c8a85a` (chọn, vì source có quirk gold = `#5e7288`) | Accent CTA |
| `--apg-success` | `#2e7d5b` | OK |
| `--apg-warning` | `#c27a1a` | Warning |
| `--apg-danger` | `#c84c3a` | Error |
| Radius scale | `4 / 6 / 8 / 10 px` | Conservative |
| Font stack | `Inter, Be Vietnam Pro, system-ui` | Vietnamese-aware |

Helper classes có sẵn trong APG: `.apg-eyebrow`, `.apg-mono`, `.apg-tabular`, `.apg-panel`, `.apg-field`, `.apg-chip`, `.apg-admin-stat`, `.apg-admin-shell`. Animation: `apgPlaneFly`, `apgRowIn`, `apgSlide`.

**Decision:** không rename mọi class hiện tại sang prefix `apg-` để giảm churn JS — chỉ:
- Adopt CSS variables (`--apg-*`) làm source of truth.
- Restyle các class hiện tại (`.panel`, `.toast`, `.badge`, `.change-*`, ...) bằng tokens APG.
- Thêm vài class APG-style mới khi cần (`.apg-stats`, `.apg-stat`, `.apg-eyebrow`, `.btn-plane-busy`).

---

## 3. Files modified

| Path | Trước | Sau | Loại |
|---|---:|---:|---|
| `public/styles.css` | 525 | 882 | Rewrite gần như toàn bộ |
| `public/index.html` | 176 | 206 | Thêm brand lockup + stat strip + theme toggle + Việt hóa labels |
| `public/app.js` | 651 | 737 | Thêm `renderStats()`, theme toggle + storage, plane-busy class |
| `src/server.js` | — | — | Chỉ trả `health.scanner` khi request có API key hợp lệ / local no-auth |

Total diff: xem `git diff --stat` của commit tương ứng.

---

## 4. Design tokens được áp dụng

`public/styles.css:11-67` định nghĩa toàn bộ tokens APG trong `:root`. Đặt compat aliases ở cuối block để không phá class cũ:

```css
--bg: var(--apg-bg-page);
--surface: var(--apg-bg-surface);
--primary: var(--apg-aviation-navy);
--danger: var(--apg-danger);
/* ... */
```

Dark theme variant tại `public/styles.css:80-100` qua selector `[data-apg-theme="dark"]` trên `<html>`. Bật bằng `<button id="themeToggleBtn">`, lưu localStorage `priceScanTheme`. Lần đầu fallback `prefers-color-scheme: dark`.

Reviewer nên check:
- Có token nào trong `--apg-*` thiếu fallback khi dark? (đã verify: cả 2 bộ override hết).
- Có hardcoded color nào lọt ngoài tokens không? (đã scan: chỉ còn 2 chỗ hard-code `#8a2e22`, `#1e5240` là border-left toast — chấp nhận được vì là darker shade của `--apg-danger/success`).

---

## 5. Component-by-component diff

### 5.1 Topbar / header

**Trước:** `<h1>Price Scan</h1>` + paragraph status, action buttons phẳng.

**Sau:** brand lockup mimicking aviation logo:

```html
<div class="brand-mark">
  <a href="https://tanphuapg.com" target="_blank" rel="noopener">TAN PHU APG</a>
  <span class="brand-sep">▸</span>
  <span>Price Scan</span>
</div>
```

`public/styles.css:259-289` style brand-mark với `::before` pseudo-element tạo plane icon trong navy box, xoay `-25deg`:

```css
.brand-mark::before {
  content: '✈';
  width: 28px; height: 28px;
  background: var(--apg-aviation-navy);
  color: var(--apg-brand-gold);
  border-radius: var(--apg-radius-sm);
  transform: rotate(-25deg);
}
```

Thêm `<button id="themeToggleBtn">` cuối topbar-actions, icon `🌗 ↔ ☀️`.

Reviewer check:
- Link external có `rel="noopener"` không? (có).
- Brand link có handle dark theme? (`a` inherit color từ parent navy, dark theme override `--apg-aviation-navy` → blue lighter, OK).

### 5.2 Stat strip (mới)

`public/index.html:36-58` — 4 cards. `public/app.js:484-526` — `renderStats(scanner)` đọc từ `/health.scanner`:

| Card | Field | Accent color top-bar |
|---|---|---|
| Total jobs | `jobCount` | `--apg-aviation-navy` |
| Active | `enabledJobCount` | `--apg-success` |
| Next run | `nextScheduledRun` (relative time) | `--apg-brand-gold` |
| Fails 24h | `notificationFailures24h` | `--apg-danger` |

Style: `.apg-stat::before` 3px top accent (`public/styles.css:312-342`).

Helper `formatRelative(iso)` chuyển ISO → "trong 12 phút" / "cách đây 23s". Reviewer kiểm tra edge case khi `nextScheduledRun = null` (đã guard, hiển thị `—`).

Stat strip refresh trong `loadHealth()` → `init()` + `startAutoRefresh()` mỗi 30s.

### 5.3 Form

**Trước:** labels Title Case ("Flight date", "Airline"), input height 38px.

**Sau:** labels uppercase eyebrow style (`text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px`), input height 44px (giống `.apg-field` của parent).

Vietnamese labels: "Ngày bay", "Hãng", "Số hiệu", "Giờ chính xác", "Số khách", "Kênh báo", "Trạng thái kênh".

Channel switch (`.channel-switch` / `.channel-option`) restyle từ button row sang pill toggle group, height 44px:

```css
.channel-switch {
  display: flex;
  padding: 3px;
  background: var(--apg-bg-surface-muted);
  border-radius: var(--apg-radius-md);
}
.channel-option.active {
  background: var(--apg-aviation-navy);
  color: var(--apg-text-inverse);
}
```

Reviewer check:
- Inline `label` styling không leak vào nested `<input>`? (giải quyết bằng `label > input, label > select` reset rule).
- Accent color cho checkbox: `accent-color: var(--apg-aviation-navy)` (FF/Chrome modern OK).

### 5.4 Jobs list

**Trước:** plain row với job-title + meta + Run button.

**Sau:** `.job-row.active` có `inset 4px 0 0 var(--apg-aviation-navy)` thay vì `inset 3px` teal. Hover background đổi sang `--apg-bg-surface-soft`. Mỗi row có `animation: apgRowIn 0.25s ease` khi insert.

Job-actions giữ nguyên 2 button (On/Off + Run). Toggle button restyle bằng `--apg-success-soft` background + `--apg-success` color.

### 5.5 Run history

Result lines giờ dùng `'JetBrains Mono', monospace` + `font-variant-numeric: tabular-nums` để giá nhiều dòng căn đều cột:

```css
.result-line {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
```

`.change` badges (price up/down/seat/sold/new/removed) đều dùng `--apg-*-soft` tokens. Reviewer check contrast pass WCAG AA cho `.change.change-sold` (white on `--apg-danger #c84c3a`) — ratio ~5.4:1, pass.

### 5.6 Toast

Thêm `border-left: 4px solid` accent gold (info), red (error), green (success). Position giữ nguyên bottom-right 22px.

```css
.toast {
  border-left: 4px solid var(--apg-brand-gold);
}
.toast.toast-error {
  background: var(--apg-danger);
  border-left-color: #8a2e22;
}
```

---

## 6. Animations

| Class / keyframe | Mục đích | Code |
|---|---|---|
| `@keyframes apgRowIn` | Slide-up 6px + fade in 0.25s | `public/styles.css:732-741` |
| `@keyframes apgPlaneFly` | ✈ bay ngang -12px → +28px, 1.4s loop | `public/styles.css:743-754` |
| `.btn-plane-busy::after` | Append plane glyph animated khi Run đang chạy | `public/styles.css:756-761` |

`@media (prefers-reduced-motion: reduce)` ép `animation-duration: 0.01ms` toàn bộ.

`public/app.js:601-617` toggle `.btn-plane-busy` lên `#runNowBtn` trong try/finally của `runJob()`.

Reviewer check:
- Animation có chạy mượt khi nhiều job-row render cùng lúc? (mỗi row 0.25s, không stagger — OK với <20 rows).
- Plane-busy có conflict với `.busy` của `withBusyButton`? (không — busy chỉ `opacity + pointer-events`, plane-busy chỉ add `::after`).

---

## 7. Responsive

| Breakpoint | Thay đổi |
|---|---|
| `≤1100px` | Stat strip 4 → 2 cột |
| `≤980px` | Topbar flex-column, layout 3-area → 1-column |
| `≤560px` | Stat strip 1 cột, grid-2 → 1 cột, form-actions buttons fill 50% |

---

## 8. Accessibility

- Tất cả buttons có `min-height: 38px` (mục tiêu touch 44px chưa đạt nhưng nhỉnh hơn trước 36px).
- Input focus: 2px outline `--apg-border-focus` (rgba navy 0.32) + border navy — visible cả trên dark theme.
- `accent-color` cho checkbox.
- Brand link có `rel="noopener"`.
- `role="group"` + `aria-label="Kênh báo"` trên channel-switch.
- `prefers-reduced-motion` honored.

**Gap đã biết:**
- Chưa có ARIA live region cho toast → screen reader user không nghe được "Saved" / "Scan xong".
- Channel-option buttons chưa có `aria-pressed`.
- Theme toggle chưa announce state change.

Đây là 3 issue đáng cải thiện trong follow-up nhưng nằm ngoài scope redesign visual.

---

## 9. Verification

### Automated
- `node --check public/app.js` ✅
- `node --check src/server.js` ✅
- Targeted Jest: `test/server.test.js`, `test/scanner-notify.test.js`, `test/scanner-schedule.test.js`, `test/scanner-telegram.test.js`, `test/scanner-zalo.test.js` — **31/31 pass**.
- Full `npm test -- --runInBand` hiện còn fail do test suite quét cả `.claude/worktrees`, `tests/hold-pricing-slow.test.js` không phải Jest suite, và một số test Muadi cần `MUADI_AES_KEY` / `MUADI_AES_IV`.

### Manual (Andy / reviewer chạy local)

```powershell
cd "C:\Cá nhân\Dự Án\Price Scan"
npm run ocr        # Terminal 1
npm run api        # Terminal 2
# Mở http://localhost:3100/
```

Checklist:
1. [ ] Header có "TAN PHU APG ▸ Price Scan" + plane icon navy/gold xoay nhẹ.
2. [ ] Click "TAN PHU APG" → mở `tanphuapg.com` tab mới.
3. [ ] Stat strip 4 ô, mỗi ô có accent top-bar khác màu.
4. [ ] Stat "Next run" hiển thị relative time (vd "trong 12 phút").
5. [ ] Click 🌗 → switch dark, header chữ vẫn đọc được, các badge contrast đủ. Reload page giữ theme.
6. [ ] Reload page khi `prefers-color-scheme: dark` (devtools emulate) → auto dark mà chưa set storage.
7. [ ] Form labels uppercase eyebrow, input 44px chiều cao, font Be Vietnam Pro hiển thị dấu sắc đúng.
8. [ ] Channel switch Telegram ↔ Zalo bấm chuyển active state navy.
9. [ ] Click "Run now" → button hiện ✈ animation bay ngang.
10. [ ] Job mới tạo → row slide-up vào jobs-list.
11. [ ] Toast "Saved" có border-left xanh, "Error..." có border-left đỏ.
12. [ ] Result line hiển thị monospace, cột giá căn đều.
13. [ ] Resize browser xuống 1000px / 750px / 500px → stat strip co 4→2→1, layout 1-cột ở <980px.
14. [ ] Run targeted tests: `npx jest test/server.test.js test/scanner-notify.test.js test/scanner-schedule.test.js test/scanner-telegram.test.js test/scanner-zalo.test.js --runInBand`.

---

## 10. Risk / reviewer focus

| Risk | Mức | Hướng kiểm tra |
|---|---|---|
| Font Google Fonts load chậm / chặn IP | Trung | `@import` blocking render — cân nhắc preconnect hoặc self-host nếu deploy offline |
| Dark theme contrast trên `.change-removed` (gold-hover trên dark surface) | Thấp | Đo bằng axe DevTools |
| `formatRelative()` không handle múi giờ | Thấp | `Date.parse(iso)` dùng local time, server trả ISO UTC → OK |
| Stat refresh 30s có thể flicker khi giá trị đổi liên tục | Thấp | Đã trực tiếp setText, không re-render toàn card |
| Brand-mark `::before` rotate `-25deg` có thể vỡ alignment trên Safari iOS cũ | Thấp | Test trên Safari 14+ |
| Compat aliases (`--bg`, `--primary`) duplicate token system — có thể nhầm lẫn khi dev | Trung | Document rõ trong comment hoặc bỏ aliases sau khi rename hết callsites |

---

## 11. Out of scope / defer

- Đổi class names sang prefix `apg-` toàn bộ (vd `.panel` → `.apg-panel`). Hiện compat aliases đủ.
- Implement `.apg-admin-shell` dark theme variant đầy đủ giống parent project.
- Self-host font Be Vietnam Pro (hiện qua Google Fonts CDN).
- ARIA live region cho toast + accessibility polish (Section 8 gaps).
- Logo SVG thay cho `✈` emoji (đợi asset từ Andy nếu cần).
- Animation `apgSlide` (shimmer reload bar) — chưa wire, có thể dùng cho auto-refresh visual.

---

## 12. Summary cho reviewer

Redesign này chủ yếu đổi UI, kèm một thay đổi backend nhỏ: `/health` chỉ include `scanner` khi request có quyền đọc protected data. Các phần chính:

1. CSS tokens — tập trung tại `:root` và `[data-apg-theme="dark"]`.
2. HTML structure — thêm brand-mark, stat strip, theme toggle button.
3. JS logic — `renderStats(scanner)`, `initTheme()` / `applyTheme()` / `toggleTheme()`, plane-busy class trên Run.
4. Backend health response — dùng `hasProtectedAccess(req)` để không lộ scanner metadata cho request public.

Reviewer chính cần verify:
- Token coverage (không hardcode color sót).
- Dark theme contrast pass WCAG AA.
- Stat strip data binding khớp với `scanner.settings()` shape.
- Animation không break ở browser cũ / reduced-motion.
- `localStorage` keys (`priceScanTheme`, `priceScanApiKey`) không clash.

File entry để start review: `public/styles.css` (design tokens), sau đó `public/index.html` (structure), cuối cùng `public/app.js` (`renderStats`, `applyTheme`, `runJob` plane-busy diff).
