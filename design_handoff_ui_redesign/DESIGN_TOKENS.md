# Design Tokens — APG Price Scan

> Toàn bộ tokens định nghĩa trong `design/styles.css`, block `:root` (line 13-67).
> Dark mode: `[data-apg-theme="dark"]` (line 80-110). 4 accent variants: `[data-accent="…"]` (line 113-140).

Copy nguyên các block CSS dưới đây sang `public/styles.css`. Đừng tự đặt lại tên token.

---

## 1. Surfaces (backgrounds)

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--apg-bg-page` | `#f4f3ef` | `#0a131c` | Trang chính (cream warm) |
| `--apg-bg-surface` | `#ffffff` | `#131d28` | Card, panel chính |
| `--apg-bg-surface-soft` | `#ebeef2` | `#1c2935` | Card hover, secondary fill |
| `--apg-bg-surface-muted` | `#eef1f4` | `#182330` | Panel header bg, table head, segmented control track |
| `--apg-bg-sidebar` | `#0c2238` | `#050b13` | Sidebar background (deep navy luôn dark) |
| `--apg-bg-sidebar-soft` | `#143b5f` | `#0c2238` | Sidebar active item bg |

---

## 2. Text

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--apg-text-primary` | `#0f2f4b` | `#ecf1f6` | Body text, headings |
| `--apg-text-secondary` | `#5e7288` | `#98a8b8` | Labels, meta info |
| `--apg-text-muted` | `#8090a0` | `#5b6c7e` | Disabled, low priority |
| `--apg-text-inverse` | `#ffffff` | `#0f2f4b` | Text trên button primary, badge solid |
| `--apg-text-on-sidebar` | `#d9e1ea` | (same) | Text mặc định trong sidebar |
| `--apg-text-on-sidebar-muted` | `#7f93ab` | (same) | Section header, count badge trong sidebar |

---

## 3. Brand

| Token | Light | Dark | Note |
|---|---|---|---|
| `--apg-aviation-navy` | `#143b5f` | `#5fa1e1` | **Primary brand color**. Button primary, accent border, link, active state. Dark mode: chuyển sang blue lighter để contrast trên dark bg. |
| `--apg-aviation-navy-hover` | `#0f2f4b` | `#7ab3ea` | Hover state cho primary |
| `--apg-aviation-navy-soft` | `rgba(20,59,95,0.10)` | `rgba(95,161,225,0.16)` | Soft bg variant (badges, tag bg) |
| `--apg-aviation-navy-ring` | `rgba(20,59,95,0.18)` | `rgba(95,161,225,0.30)` | Focus ring |
| `--apg-brand-gold` | `#c8a85a` | `#e0c275` | **Secondary brand color**. CTA gold buttons, plane icon mark, gradient highlight |
| `--apg-brand-gold-hover` | `#b08f3e` | `#efd285` | Hover state |
| `--apg-brand-gold-soft` | `rgba(200,168,90,0.18)` | `rgba(224,194,117,0.18)` | Soft bg variant |

---

## 4. Status

| Token | Color | Dùng cho |
|---|---|---|
| `--apg-success` | `#2e7d5b` | Success badges, price down arrow, healthy status |
| `--apg-success-soft` | `rgba(46,125,91,0.14)` | Success badge bg |
| `--apg-warning` | `#c27a1a` | Warning, low seat (≤3), seat change |
| `--apg-warning-soft` | `rgba(194,122,26,0.16)` | Warning badge bg |
| `--apg-danger` | `#c84c3a` | Error, sold out, price up arrow |
| `--apg-danger-soft` | `rgba(200,76,58,0.14)` | Error badge bg |
| `--apg-info` | `#2e5a7d` | Info badge, neutral notify status |
| `--apg-info-soft` | `rgba(46,90,125,0.14)` | Info badge bg |

---

## 5. Borders

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--apg-border` | `#dde2e8` | `#283341` | Border mặc định (card, input, button) |
| `--apg-border-soft` | `#e6eaef` | `#1f2935` | Divider nhẹ giữa rows trong panel |
| `--apg-border-strong` | `#b9c2cc` | `#3b4a5d` | Hover/active border |
| `--apg-border-focus` | `rgba(20,59,95,0.32)` | (same) | Focus outline |

---

## 6. Radius scale

| Token | Value | Dùng cho |
|---|---|---|
| `--apg-radius-xs` | `4px` | Badge, small pill |
| `--apg-radius-sm` | `6px` | Input, button, channel chip |
| `--apg-radius-md` | `10px` | Card, panel, dropdown |
| `--apg-radius-lg` | `14px` | Stat card, large panel |
| `--apg-radius-xl` | `18px` | Reserved cho future hero/banner |

Pill/round shapes: dùng `border-radius: 999px` trực tiếp.

---

## 7. Shadows

| Token | Light | Dùng cho |
|---|---|---|
| `--apg-shadow-xs` | `0 1px 2px rgba(15,47,75,0.06)` | Default card |
| `--apg-shadow-sm` | `0 2px 6px rgba(15,47,75,0.08)` | Sticky panel, slight lift |
| `--apg-shadow-md` | `0 8px 24px rgba(15,47,75,0.10)` | Hover lift, dropdown |
| `--apg-shadow-lg` | `0 24px 48px rgba(15,47,75,0.14)` | Modal, toast, panel float |

Dark mode tăng opacity lên 0.4-0.6 (`rgba(0,0,0,...)`).

---

## 8. Density (tweakable)

```css
:root {
  --row-pad-y: 14px;
  --row-pad-x: 16px;
  --card-pad: 18px;
  --gap-tight: 8px;
  --gap-md: 14px;
  --gap-lg: 20px;
}
[data-density="compact"] {
  --row-pad-y: 10px;
  --row-pad-x: 14px;
  --card-pad: 14px;
  --gap-tight: 6px;
  --gap-md: 10px;
  --gap-lg: 14px;
}
```

Default = `comfortable`. User toggle qua Tweaks panel — production có thể bỏ.

---

## 9. Accent variants

Khi user đổi accent color trong Tweaks, `<html>` nhận `data-accent="…"`. Override các navy tokens:

```css
[data-accent="emerald"] {
  --apg-aviation-navy: #1f6e54;
  --apg-aviation-navy-hover: #19583f;
  --apg-aviation-navy-soft: rgba(31, 110, 84, 0.12);
  --apg-bg-sidebar: #07251c;
  --apg-bg-sidebar-soft: #11473a;
}
[data-accent="copper"] {
  --apg-aviation-navy: #a25b29;
  --apg-aviation-navy-hover: #864818;
  --apg-aviation-navy-soft: rgba(162, 91, 41, 0.12);
  --apg-bg-sidebar: #2a1610;
  --apg-bg-sidebar-soft: #4a2818;
}
[data-accent="violet"] {
  --apg-aviation-navy: #5a3ea1;
  --apg-aviation-navy-hover: #46318a;
  --apg-aviation-navy-soft: rgba(90, 62, 161, 0.12);
  --apg-bg-sidebar: #14102a;
  --apg-bg-sidebar-soft: #2a214d;
}
```

Production: cân nhắc bỏ — APG brand chỉ có navy + gold. Giữ là một tính năng "fun" nếu user muốn.

---

## 10. Typography

```css
body {
  font-family: 'Be Vietnam Pro', Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

### Scale

| Use case | Size | Weight | Family | Tracking | Note |
|---|---|---|---|---|---|
| Page title (h1) | 26px | 700 | Be Vietnam Pro | -0.01em | |
| Brand wordmark | 17px | 700 | Be Vietnam Pro | 0.04em | "Price Scan" trong sidebar |
| Brand kicker | 10px | 600 | Inter | 0.22em uppercase | "TAN PHU APG" |
| Panel title (h3) | 13px | 700 | Be Vietnam Pro | 0.10em uppercase | Tất cả panel header |
| Stat value (số to) | 32px | 700 | Inter | -0.02em | Tabular nums |
| Body | 14px | 400-500 | Be Vietnam Pro | normal | Default |
| Body secondary | 12-13px | 400 | Be Vietnam Pro | normal | Meta, sub |
| Eyebrow / label | 11px | 700 | Inter | 0.12em uppercase | Form labels, card labels |
| Eyebrow tiny | 10px | 700 | Inter | 0.14-0.18em uppercase | Stat label, nav section |
| **Mono data** | 12-15px | 600-700 | JetBrains Mono | normal/tight | Prices, IATA codes, times |
| Mono tiny | 10-11px | 500 | JetBrains Mono | normal | Time stamps, deltas |
| IATA huge | 44px | 700 | JetBrains Mono | 0.02em | Hero airport codes |

### Font-variant-numeric

Mọi nơi hiển thị số (prices, deltas, counts, IATA) phải có `font-variant-numeric: tabular-nums` để cột số không nhảy khi giá trị đổi.

### Loading

```css
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

Dòng đầu của `styles.css`. Production cân nhắc self-host (xem `UI-REDESIGN-REPORT.md` cũ — defer).

---

## 11. Sidebar width

```css
:root { --sidebar-w: 248px; }
```

Fixed. Sidebar collapse chưa có ở bản hi-fi này — nếu cần thêm sau, đổi `--sidebar-w` thành `72px` khi `[data-sidebar="collapsed"]`.

---

## 12. Channel brand colors (third-party)

| Channel | Color | Dùng cho |
|---|---|---|
| Telegram | `#268fc8` | Chip bg + logo trong card |
| Zalo | `#0068d4` | Chip bg + logo trong card |

KHÔNG nhập vào `:root` — dùng trực tiếp trong `.chan-chip.telegram` / `.channel-card.zalo .ch-logo`. Hai brand này không thuộc design system APG.

---

## 13. Z-index (informal)

| Layer | z-index | Element |
|---|---|---|
| Sticky topbar | 20 | `.topbar` |
| Tooltip chart | 5 | `.chart-tooltip` |
| Mobile tab bar | 50 | `.mobile-tabbar` |
| Toast | 30 | `.toast` |
| Tweaks panel | 2147483646 | Bỏ ở production |

---

## 14. Compat aliases (legacy)

Code cũ trong `public/app.js` có tham chiếu `--bg, --primary, --danger, --surface...`. Giữ alias block để không vỡ:

```css
:root {
  --bg: var(--apg-bg-page);
  --surface: var(--apg-bg-surface);
  --surface-2: var(--apg-bg-surface-soft);
  --text: var(--apg-text-primary);
  --muted: var(--apg-text-secondary);
  --line: var(--apg-border);
  --primary: var(--apg-aviation-navy);
  --primary-hover: var(--apg-aviation-navy-hover);
  --danger: var(--apg-danger);
  --warning: var(--apg-warning);
  --shadow: var(--apg-shadow-sm);
}
```

Sau khi rewrite frontend xong, các alias này nên xóa dần.

---

## 15. Quick-reference helper classes

Đã có trong CSS, dùng inline khi cần thay vì viết custom:

```html
<span class="eyebrow">Operations</span>
<span class="mono tabular">1.846.000 ₫</span>
<span class="muted">không có dữ liệu</span>

<span class="badge success">success</span>
<span class="badge warn">muted</span>
<span class="badge danger">error</span>
<span class="badge navy">enabled</span>
<span class="badge gold">on change</span>

<span class="delta-pill up">↑ 4.3%</span>
<span class="delta-pill down">↓ 2.1%</span>
<span class="delta-pill sold">SOLD</span>
<span class="delta-pill seat">ghế +2</span>
<span class="delta-pill new">NEW</span>
```

Pattern: `.badge` = ổn định trạng thái, `.delta-pill` = thay đổi data.

---

Hết. Mọi giá trị màu KHÔNG được tự bịa — chỉ dùng các token trong file này.
