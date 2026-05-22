#!/bin/sh
# Entrypoint cho Render (Docker): chạy OCR (ddddocr) + backend trong CÙNG container.
#
# Lưu ý vận hành #1: OCR phải LUÔN chạy để watcher tự đăng nhập lại (giải captcha) khi
# token Muadi hết hạn. Ở đây OCR được bọc trong vòng lặp supervisor → nếu crash sẽ tự
# khởi động lại sau 2s (khác với `python ... &` cũ: chết là mất luôn).

# Supervisor: giữ OCR sống, tự restart nếu crash.
(
  while true; do
    echo "[ocr] starting ddddocr on :8001"
    python3 ocr_server.py 8001
    echo "[ocr] exited (code $?) — restarting in 2s"
    sleep 2
  done
) &

# Chờ OCR sẵn sàng (tối đa ~30s) để warmup-login lúc boot không lỗi. Dùng node (luôn có sẵn).
i=0
while [ "$i" -lt 15 ]; do
  if node -e "require('http').get('http://127.0.0.1:8001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "[start] OCR ready"
    break
  fi
  i=$((i + 1))
  echo "[start] waiting OCR ($i/15)..."
  sleep 2
done

# Backend ở foreground → vòng đời container gắn với backend; Render tự restart nếu backend chết.
exec npm run api
