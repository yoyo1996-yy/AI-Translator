FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build
RUN npm run build:fc-server

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=9000
ENV REALTIME_PROXY_PATH=/realtime
ENV TRANSLATION_PROVIDER=mock
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/.fc-build/server ./server
COPY --from=builder /app/.fc-build/lib ./lib
COPY --from=deps /app/node_modules/next ./node_modules/next
COPY --from=deps /app/node_modules/ws ./node_modules/ws
COPY --from=deps /app/node_modules/dotenv ./node_modules/dotenv

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '9000') + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/cloud-server.js"]
