FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY web/package.json web/bun.lock* ./web/
RUN cd web && bun install --frozen-lockfile

COPY . .
RUN bun run build && cd web && bun run build

FROM oven/bun:alpine

RUN apk add --no-cache git curl procps docker-cli docker-cli-compose

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts \
    && rm -rf ~/.bun/install/cache

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/web/build ./web/build

RUN printf '#!/bin/sh\nexec bun run /app/dist/index.js "$@"\n' > /usr/local/bin/nero \
    && chmod +x /usr/local/bin/nero

ENV TERM=xterm-256color
ENV FORCE_COLOR=1
ENV NODE_ENV=production

EXPOSE 4848

CMD ["bun", "run", "dist/service/entrypoint.js"]
