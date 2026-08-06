# ─── Vital Core HMS — production Dockerfile ────────────────────────────────
# Multi-stage build that produces a slim runtime image.
#
#   Stage 1 (deps)    : installs node_modules
#   Stage 2 (builder) : regenerates Prisma client for Linux, builds Next.js
#   Stage 3 (runner)  : copies standalone build + assets, runs as non-root
#
# Build context: project root. Requires next.config.mjs `output: 'standalone'`.
# See `deploy/DEPLOY.md` for the full deployment walkthrough.

# =============================================================================
# Stage 1 — install dependencies
# =============================================================================
FROM node:20-bookworm-slim AS deps

# libc6-compat for Prisma's query engine on some slim images
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends libc6 openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy ONLY the manifest files first so this layer caches well across rebuilds
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY lib/generated-prisma/schema.prisma ./lib/generated-prisma/schema.prisma

# Install ALL deps (including devDeps — we need them for `next build`).
# `npm ci` is reproducible and fast given a lockfile.
RUN npm ci --no-audit --no-fund --prefer-offline

# =============================================================================
# Stage 2 — build
# =============================================================================
FROM node:20-bookworm-slim AS builder

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends libc6 openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Bring in deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Now copy the rest of the source
COPY . .

# Regenerate the Prisma client for the Linux x64 platform.
# This overwrites the pre-built (Windows) client that ships in the repo.
# Required: the runtime query engine is a native binary, must match the OS.
# The dummy DATABASE_URL is enough — prisma generate doesn't connect.
ENV DATABASE_URL="postgresql://x:x@127.0.0.1:5432/x?schema=public"
RUN npx prisma generate --schema=lib/generated-prisma/schema.prisma

# Build Next.js (standalone output goes to .next/standalone/)
RUN npm run build

# =============================================================================
# Stage 3 — runtime
# =============================================================================
FROM node:20-bookworm-slim AS runner

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends libc6 openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# DATABASE_URL is injected by docker-compose from .env / .env.production
ENV DATABASE_HOST=postgres
ENV DATABASE_PORT=5432

# Create a non-root user to run the app. 1001 is the convention for Next.js
# standalone images (matches the `nextjs` user in the official Next.js Docker
# example). Running as root in a container is a security smell.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app /app/lib/generated-prisma /app/.next /app/public \
    && chown -R nextjs:nodejs /app

# Copy the standalone build output. This includes a `server.js` entrypoint
# and a minimal `node_modules` tree with only what Next.js traced.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Standalone output EXCLUDES these — they need to be copied manually.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma needs the schema (for `prisma db push`) AND the runtime files
# (the Linux query engine binary + helpers). The .dockerignore excludes
# the pre-built Windows client, so we copy the freshly-built one here.
COPY --from=builder --chown=nextjs:nodejs /app/lib/generated-prisma ./lib/generated-prisma

# Entrypoint script — waits for Postgres, runs migrations, starts the server
COPY --from=builder --chown=nextjs:nodejs /app/scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000

# Healthcheck pings the API root. Caddy will return 502 if app:3000 is down.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:3000/api/auth/csrf || exit 1

ENTRYPOINT ["./entrypoint.sh"]
