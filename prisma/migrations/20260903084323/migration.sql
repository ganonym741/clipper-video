-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('SHORT_FORM', 'PODCAST', 'STREAM');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('UPLOAD', 'YOUTUBE_URL', 'REMOTE_URL');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'ANALYZING', 'FAILED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('AI_ANALYSIS', 'RENDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('SUGGESTED', 'SELECTED', 'RENDERING', 'EXPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExportPreset" AS ENUM ('TIKTOK_9_16', 'REELS_9_16', 'SHORTS_9_16', 'SQUARE_1_1', 'LANDSCAPE_16_9', 'PODCAST_AUDIOGRAM');

-- CreateTable
CREATE TABLE "AnonymousDevice" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workspace" "WorkspaceKind" NOT NULL DEFAULT 'SHORT_FORM',
    "description" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMedia" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "objectKey" TEXT,
    "originalUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "speaker" TEXT,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipCandidate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceMediaId" TEXT,
    "status" "ClipStatus" NOT NULL DEFAULT 'SUGGESTED',
    "workspace" "WorkspaceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "captionStyle" TEXT,
    "cropSuggestion" JSONB,
    "platformCopy" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysisResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceMediaId" TEXT,
    "workspace" "WorkspaceKind" NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceMediaId" TEXT,
    "clipId" TEXT,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "preset" "ExportPreset",
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clipId" TEXT,
    "jobId" TEXT,
    "preset" "ExportPreset" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousDevice_tokenHash_key" ON "AnonymousDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "Project_deviceId_updatedAt_idx" ON "Project"("deviceId", "updatedAt");

-- CreateIndex
CREATE INDEX "TranscriptSegment_projectId_startSec_idx" ON "TranscriptSegment"("projectId", "startSec");

-- CreateIndex
CREATE INDEX "ClipCandidate_projectId_score_idx" ON "ClipCandidate"("projectId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ExportAsset_jobId_key" ON "ExportAsset"("jobId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AnonymousDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMedia" ADD CONSTRAINT "SourceMedia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipCandidate" ADD CONSTRAINT "ClipCandidate_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "SourceMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisResult" ADD CONSTRAINT "AiAnalysisResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisResult" ADD CONSTRAINT "AiAnalysisResult_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "SourceMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "SourceMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "ClipCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportAsset" ADD CONSTRAINT "ExportAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportAsset" ADD CONSTRAINT "ExportAsset_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "ClipCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportAsset" ADD CONSTRAINT "ExportAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RenderJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
