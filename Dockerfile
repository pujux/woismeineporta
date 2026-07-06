# ---- deps + build ----
FROM node:22-alpine AS build
WORKDIR /app
# better-sqlite3 native build toolchain
RUN apk add --no-cache python3 make g++
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/app.db \
    ENABLE_POLLER=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
USER app
VOLUME /data
EXPOSE 3000

CMD ["node", "server.js"]
