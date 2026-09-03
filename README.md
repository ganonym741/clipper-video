# Clipper Studio

A responsive AI-assisted studio for short-form, podcast, and stream video clippers.

## Stack

- Next.js App Router with Turbopack
- Bun 1.4
- shadcn-style UI components
- Prisma + PostgreSQL
- Redis + BullMQ workers
- RustFS S3-compatible object storage
- Zustand + TanStack Query
- Gemini multimodal analysis
- FFmpeg rendering worker

## Local Setup

1. Copy `.env.example` to `.env` and fill in your external PostgreSQL, Redis, RustFS, and Gemini values.
2. Install dependencies with `bun install`.
3. Generate Prisma with `bun run db:generate`.
4. Run migrations with `bun run db:migrate`.
5. Start the web app with `bun run dev`.
6. Start the queue worker in another terminal with `bun run dev:worker`.

Run `bun run doctor` to check whether FFmpeg, yt-dlp, database, Redis, RustFS,
and Gemini environment values are visible to the app.

AI analysis and rendering are not handled by the Next.js dev server. If a source stays on
`ANALYZING` and a job stays `QUEUED`, the worker process is not running or cannot reach Redis.

For production-like local runs, use `bun run worker` instead of watch mode.

Local file uploads go through `/api/media/direct-upload` so RustFS CORS is not required
for the MVP. YouTube URL rendering requires `yt-dlp`; Smart Auto Clip can still analyze
public YouTube URLs through Gemini.

## Docker Compose

Run the web app and queue worker together:

```bash
docker compose up --build
```

The compose file starts:

- `web`: Next.js on `http://localhost:3999`
- `worker`: BullMQ worker for Gemini analysis and FFmpeg renders

Optional Docker helpers:

```bash
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm doctor
```

Both services read the same `.env` file and expect PostgreSQL, Redis, and RustFS to be reachable
from inside Docker.

If PostgreSQL or Redis runs on your host machine, do not use `localhost` in `.env` for Docker.
Use `host.docker.internal`, for example:

```env
DATABASE_URL="postgresql://user:password@host.docker.internal:5433/clipper?schema=public"
REDIS_URL="redis://default:password@host.docker.internal:5379"
APP_BASE_URL="http://localhost:3999"
```

If uploads return `AccessDenied`, check the RustFS access key permissions. A public bucket
or CORS rule for `http://localhost:3999` does not grant the Next.js server permission to
write objects. The configured key needs write/read/delete access to `RUSTFS_BUCKET`.

The app does not use login. It creates an anonymous device token in the browser and sends it with API requests.
