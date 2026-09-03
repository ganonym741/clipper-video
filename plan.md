# Clipper Studio Web App Plan

## Summary
Build a responsive Next.js creator studio for video clippers with three menu-based workspaces: Short-form, Podcast, and Stream. The app will use server-side FFmpeg rendering, Gemini advanced multimodal analysis, anonymous device-based projects, PostgreSQL via Prisma, Redis-backed jobs, RustFS S3-compatible storage, Zustand for editor state, TanStack Query for server state, and shadcn UI.

No login/register. Projects persist through an anonymous browser token stored locally.

## Feature Set
- Basic features: upload video, import public YouTube URL, project dashboard, media library, transcript view, clip list, manual timestamp selection, export presets, titles/descriptions/hashtags.
- Creator workspaces:
  - Short-form: hooks, Shorts/Reels/TikTok presets, caption styles, vertical crop suggestions.
  - Podcast: speaker moments, quote extraction, chapters, guest/topic segments.
  - Stream: hype moments, funny moments, dead-air trimming, batch highlight candidates.
- Advanced studio: timeline editor, clip scoring, AI scene summaries, visual/audio moment detection, caption generation, thumbnail suggestions, batch render queue, export history.
- Gemini AI pipeline: use video understanding and Files API for large/reusable videos, structured JSON output for clip plans, scores, captions, platform metadata, and scene/timestamp data.
- Rendering pipeline: FFmpeg worker produces clips, resized exports, thumbnails, burned subtitles, and platform-specific outputs.

## Key Implementation Changes
- Scaffold app with Next.js App Router using Bun 1.4 and Turbopack, shadcn UI, Tailwind, Prisma, PostgreSQL, TanStack Query, Zustand, Redis queue, and S3-compatible RustFS client.
- Add Dockerfile for local development/runtime, while assuming PostgreSQL, Redis, and RustFS are external services configured through `.env`.
- Data model: anonymous device, project, source media, transcript segment, clip candidate, render job, export asset, AI analysis result.
- API routes/server actions:
  - media upload/import
  - project CRUD by anonymous token
  - Gemini analysis job creation
  - clip candidate updates
  - render job creation/status
  - signed RustFS upload/download URLs
- Background worker:
  - consumes Redis jobs
  - runs FFmpeg
  - uploads outputs to RustFS
  - updates Prisma job/project state
  - retries failed AI/render jobs with visible error states
- UI/UX:
  - desktop studio layout with sidebar menus, project list, preview/timeline, AI panel, and export queue
  - mobile layout optimized for review, selection, and export management
  - no marketing landing page; first screen is the usable studio/dashboard.

## Test Plan
- Unit tests for clip schemas, Gemini structured output parsing, anonymous token handling, and FFmpeg command builders.
- Integration tests for project creation, upload metadata, job lifecycle, RustFS object references, and render status updates.
- UI tests for responsive dashboard, workspace switching, clip selection, timeline controls, and export queue states.
- Manual acceptance: upload a video, run Gemini analysis, select clips, render vertical/social exports, download output, refresh browser and confirm anonymous project history remains.

## Assumptions
- User has rights to uploaded/imported media; YouTube URL support is for public analysis and rights-confirmed workflows.
- RustFS, PostgreSQL, and Redis are already available externally in local development.
- Gemini API key will be provided via environment variable.
- References used for AI design: Gemini video understanding, Files API, and structured outputs docs:
  - https://ai.google.dev/gemini-api/docs/video-understanding
  - https://ai.google.dev/gemini-api/docs/files
  - https://ai.google.dev/gemini-api/docs/structured-output
