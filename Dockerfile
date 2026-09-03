FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.4 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run db:generate
RUN bun run build

FROM oven/bun:1.4 AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg yt-dlp ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
EXPOSE 3999
CMD ["bun", "run", "start"]
