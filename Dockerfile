# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (needed for some native modules)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# FFmpeg for transcoding
RUN apk add --no-cache ffmpeg curl

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=builder /app/dist ./dist

# ── Data directory layout ─────────────────────────────────────────────────────
# HOMESTREAM_DATA points dataDir.ts at /app/homestream-data so all JSON stores
# (config, library, downloads) land in the mounted volume.
# /app/uploads is a separate volume for user-uploaded files (subtitles, posters).
RUN mkdir -p /app/homestream-data /app/uploads

# Persistent data lives in Docker volumes — mount these in docker-compose.yml
VOLUME ["/app/homestream-data", "/app/uploads"]

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
# Tell dataDir.ts where to store all JSON config/library files
ENV HOMESTREAM_DATA=/app/homestream-data

# Liveness probe — matches GET /api/health (open endpoint, no auth required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.bundle.mjs"]
