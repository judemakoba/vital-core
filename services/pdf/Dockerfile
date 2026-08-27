# ─── VitalCore PDF sidecar ─────────────────────────────────────────────────
# Slim Node image with Chromium + the puppeteer dependencies installed.
# We base on node:20-bookworm-slim and install the system libs Puppeteer's
# bundled Chromium needs at runtime. We don't run apt-get update against
# the unpinned bookworm repos to keep the image deterministic; pinning
# matters less here than for the main app, where node_modules is huge.

FROM node:20-bookworm-slim

# Chromium runtime dependencies. The list is from the Puppeteer docs:
# https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc-s1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        wget \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund --prefer-offline --legacy-peer-deps

# Copy the source
COPY server.mjs ./

# Run as non-root. Puppeteer can run as root with --no-sandbox, but it's
# a security smell. We create a dedicated user.
RUN groupadd --system --gid 1001 pdfsvc \
    && useradd --system --uid 1001 --gid pdfsvc pdfsvc \
    && chown -R pdfsvc:pdfsvc /app
USER pdfsvc

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:3001/health || exit 1

CMD ["node", "server.mjs"]
