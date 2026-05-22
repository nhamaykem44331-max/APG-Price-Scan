FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HEADLESS=true \
    LOGIN_SKIP_SCREENSHOTS=true \
    DDDDOCR_API_URL=http://127.0.0.1:8001

COPY package*.json ./
RUN npm ci --omit=dev

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir flask ddddocr

COPY . .

RUN mkdir -p /app/storage/session /app/storage/data /app/storage/screenshots

EXPOSE 10000

# OCR chạy dưới supervisor (tự restart nếu crash) + chờ OCR sẵn sàng rồi mới start backend.
CMD ["sh", "/app/scripts/docker-start.sh"]
