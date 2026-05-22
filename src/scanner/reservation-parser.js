'use strict';

/**
 * reservation-parser.js
 * Map raw rows từ `management/list-booking` → reservation object để watcher re-scan giá.
 *
 * ✅ FIELD MAPPING ĐÃ VERIFY bằng capture thật (scripts/dev/capture-listbooking.js).
 * Response thật trả về mỗi row dạng:
 *   {
 *     id, airlines:"VN", depCity:"HAN", depDay:"30-05-2026 20:25",
 *     retCity:"DAD", retDay:"30-05-2026 20:25", pnrCode:"E46PTC",
 *     customerName, customerEmail, customerPhone, timelimit:"01-01-1990 00:00",
 *     bookingTime:"21-05-2026 14:51", bookingStatusNote:"CHECK TIMELIMIT",
 *     bookingStatus:0, totalPrice:2048000, username:"HTXTP01"
 *   }
 *
 * ⚠️ LƯU Ý quan trọng từ data thật:
 *  - KHÔNG có flightNumber → match chuyến bằng airline + route + departTime (giờ trong depDay).
 *  - KHÔNG có pax (adt/chd/inf) → mặc định adt=1, paxKnown=false (watcher cần augment bằng
 *    booking-detail nếu muốn so tổng chính xác cho booking nhiều khách).
 *  - timelimit có thể là placeholder "01-01-1990 00:00" (chưa gán hạn) → KHÔNG coi là hết hạn.
 *  - bookingStatusNote="CHECK TIMELIMIT" + bookingStatus=0 = đang giữ chỗ (chưa xuất vé).
 * Mỗi reservation giữ `raw` để debug nhanh.
 */

function firstField(obj, keys) {
  if (obj == null) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function upper(value) {
  return str(value).toUpperCase();
}

// Chuẩn hoá ngày về DD-MM-YYYY (định dạng searchJourney/normalizeDate dùng).
function normalizeReservationDate(value) {
  const t = str(value);
  if (!t) return '';
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); // YYYY-MM-DD...
  if (m) return `${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[1]}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); // DD-MM-YYYY...
  if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
  return t;
}

// Lấy "HH:MM" từ "DD-MM-YYYY HH:MM" (depDay/retDay) để match đúng chuyến.
function timeFromDateTime(value) {
  const m = str(value).match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// "DD-MM-YYYY HH:MM[:SS]" → epoch ms (giữ giờ địa phương của tiến trình).
function parseDateTimeMs(value) {
  const t = str(value);
  const m = t.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const ms = new Date(
    Number(m[3]), Number(m[2]) - 1, Number(m[1]),
    Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
  ).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeFlightNumber(value) {
  return upper(value).replace(/\s+/g, '');
}

// Trạng thái "chết" (không còn là chỗ giữ để re-book), xác nhận bằng data thật:
//  - "ISSUE TICKET" / bookingStatus=1 → đã xuất vé.
//  - "TIME LIMIT OUT" → quá hạn giữ chỗ.
//  - huỷ / hoàn / void.
// LƯU Ý: "CHECK TIMELIMIT" (chỗ giữ đang chờ) KHÔNG được dính regex này.
const DEAD_STATUS_RX = /ISSUE|TICKET|XUẤT|XUAT|PAID|THANH\s*TOAN|CANCEL|HUỶ|HỦY|HUY|EXPIR|VOID|REFUND|REJECT|TIME\s*LIMIT\s*OUT|HẾT\s*HẠN|OUT\s*OF\s*TIME/i;
const STATUS_CODE_ISSUED = 1; // verify từ data thật: ISSUE TICKET ↔ bookingStatus=1

function isDeadStatus(note, statusCode) {
  if (Number(statusCode) === STATUS_CODE_ISSUED) return true;
  return DEAD_STATUS_RX.test(str(note));
}

// Đang giữ chỗ = chưa rơi vào trạng thái chết. "CHECK TIMELIMIT", "HOLD", "WAIT", rỗng → giữ.
function isHeldStatus(note, statusCode) {
  return !isDeadStatus(note, statusCode);
}

// timelimit placeholder (vd "01-01-1990") = chưa gán hạn thật → bỏ qua, không coi là hết hạn.
const TIMELIMIT_PLACEHOLDER_BEFORE_MS = new Date(2015, 0, 1).getTime();

function realTimelimitMs(value) {
  const ms = parseDateTimeMs(value);
  if (ms === null) return null;
  if (ms < TIMELIMIT_PLACEHOLDER_BEFORE_MS) return null; // placeholder
  return ms;
}

// Map bookingStatusNote/bookingStatus (thô) → nhãn tiếng Việt giống trang reservation-status.
// Đã verify bằng data thật: "TIME OUT COMMING"→Giữ chỗ; "CHECK TIMELIMIT"→Chưa xác định;
// "ISSUE TICKET"/code1→Đã thanh toán; "TIME LIMIT OUT"→Quá hạn; void/huỷ→Đã void/huỷ.
function reservationStatusLabel(note, statusCode) {
  const s = upper(note);
  if (Number(statusCode) === STATUS_CODE_ISSUED || /ISSUE\s*TICKET|TICKETED|ISSUED|PAID|THANH\s*TOAN|ĐÃ\s*XU/.test(s)) {
    return 'Đã thanh toán';
  }
  if (/VOID|CANCEL|HUỶ|HỦY|HUY|REFUND|REJECT/.test(s)) return 'Đã void/huỷ';
  if (/TIME\s*LIMIT\s*OUT|OUT\s*OF\s*TIME|QUÁ\s*HẠN|EXPIR/.test(s)) return 'Quá hạn';
  if (/CHECK\s*TIMELIMIT/.test(s)) return 'Chưa xác định';
  if (/TIME\s*OUT\s*COMMING|TIME\s*OUT\s*COMING|GIỮ|HOLD|WAIT/.test(s)) return 'Giữ chỗ';
  return note || 'Không rõ';
}

function parseReservationRow(row, options = {}) {
  if (!row || typeof row !== 'object') return null;
  const now = options.now || Date.now();

  const pnr = upper(firstField(row, ['pnrCode', 'pnr', 'PNR', 'code']));

  const heldPrice = num(firstField(row, ['totalPrice', 'total', 'totalAmount', 'grandTotal', 'price']));

  const from = upper(firstField(row, ['depCity', 'from', 'origin', 'originCode', 'departure', 'dep', 'startPoint']));
  const to = upper(firstField(row, ['retCity', 'to', 'destination', 'destinationCode', 'arrival', 'endPoint']));

  const depDay = firstField(row, ['depDay', 'departDate', 'departureDate', 'flightDate', 'date', 'startDate']);
  const retDay = firstField(row, ['retDay', 'returnDate', 'returnDay']);
  const date = normalizeReservationDate(depDay);
  const departTime = timeFromDateTime(depDay);
  const returnDate = normalizeReservationDate(retDay);

  // Round-trip thật khi ngày về KHÁC ngày đi (one-way: retDay copy của depDay → returnDate == date).
  const roundTrip = !!(returnDate && date && returnDate !== date);

  const airline = upper(
    firstField(row, ['airlines', 'airline', 'airlineCode', 'carrier', 'carrierCode'])
  );

  // list-booking KHÔNG có flightNumber → để rỗng; match bằng airline+route+departTime.
  const flightNumber = normalizeFlightNumber(firstField(row, ['flightNumber', 'flightNo', 'flight', 'flightCode']));

  // list-booking KHÔNG có pax → mặc định 1 ADT, đánh dấu paxKnown=false.
  const adtRaw = num(firstField(row, ['adt', 'numberOfAdult', 'adult', 'adults']));
  const chdRaw = num(firstField(row, ['chd', 'numberOfChildren', 'child', 'children']));
  const infRaw = num(firstField(row, ['inf', 'numberOfInfant', 'infant', 'infants']));
  const paxKnown = adtRaw !== null || chdRaw !== null || infRaw !== null;
  const adt = adtRaw || 1;
  const chd = chdRaw || 0;
  const inf = infRaw || 0;

  const statusNote = str(firstField(row, ['bookingStatusNote', 'statusNote', 'status']));
  const statusCode = num(firstField(row, ['bookingStatus', 'statusCode']));
  const timelimit = str(firstField(row, ['timelimit', 'timeLimit', 'timeLimitText', 'expiry']));
  const bookingTime = str(firstField(row, ['bookingTime', 'createdAt', 'createdTime', 'bookingDate']));
  const bookingId = num(firstField(row, ['id', 'bookingId', 'bookingID']));
  const customerName = str(firstField(row, ['customerName', 'passengerName', 'paxName']));
  const username = str(firstField(row, ['username', 'agentUsername', 'userName']));

  const tlMs = realTimelimitMs(timelimit);
  const departMs = parseDateTimeMs(depDay);
  const timelimitExpired = tlMs !== null ? tlMs < now : false;
  const flightPast = departMs !== null ? departMs < now : false;
  const expired = timelimitExpired || flightPast;
  // Chỗ giữ CÒN HIỆU LỰC để auto-canh = có "Thời gian giữ chỗ" thật trong tương lai.
  // Theo nghiệp vụ: không có thời gian giữ chỗ (placeholder 01-01-1990) hoặc đã qua hạn = hết hạn.
  const hasHoldTime = tlMs !== null && tlMs > now;

  return {
    pnr,
    heldPrice,
    from, to, date, departTime,
    returnDate, roundTrip,
    flightNumber, airline,
    adt, chd, inf, paxKnown,
    statusNote, statusCode,
    status: statusNote || (statusCode !== null ? `STATUS_${statusCode}` : ''),
    statusLabel: reservationStatusLabel(statusNote, statusCode),
    timelimit, timelimitDisplay: tlMs !== null ? timelimit : '', timelimitMs: tlMs, expired, flightPast, timelimitExpired, hasHoldTime,
    bookingTime, bookingId, customerName, username,
    held: isHeldStatus(statusNote, statusCode),
    // Đủ field để re-scan đúng chuyến? (one-way; round-trip cần xử lý riêng → để watcher quyết định)
    scannable: !!(pnr && from && to && date && departTime && Number.isFinite(heldPrice) && !roundTrip),
    raw: row,
  };
}

/**
 * @param {Array} rows raw từ list-booking
 * @param {{scope?: 'held'|'all', now?: number}} options
 */
function parseReservations(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const parsed = list
    .map((row) => parseReservationRow(row, options))
    .filter((r) => r && r.pnr);
  if (options.scope === 'held') {
    return parsed.filter((r) => r.held && !r.expired);
  }
  return parsed;
}

module.exports = {
  parseReservations,
  parseReservationRow,
  reservationStatusLabel,
  isHeldStatus,
  isDeadStatus,
  parseDateTimeMs,
  realTimelimitMs,
  timeFromDateTime,
  normalizeReservationDate,
  normalizeFlightNumber,
};
