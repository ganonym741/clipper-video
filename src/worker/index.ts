import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Worker } from "bullmq";
import { JobKind, JobStatus, type ExportPreset, type WorkspaceKind } from "@prisma/client";
import { exportPresets } from "../lib/exports";
import { prisma } from "../lib/prisma";
import { AI_QUEUE_NAME, RENDER_QUEUE_NAME, getRedisConnection } from "../server/queues";
import { renderClip } from "../server/ffmpeg";
import { analyzeWithGemini } from "../server/gemini";
import {
  downloadObjectToFile,
  exportObjectKey,
  uploadFileToObject
} from "../server/storage";
import { downloadRemoteVideo, explainVideoDownloaderError } from "../server/video-download";

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), prefix));

  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function assertJobNotCanceled(renderJobId: string) {
  const job = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    select: { status: true }
  });

  if (job?.status === JobStatus.CANCELED) {
    throw new Error(`Job ${renderJobId} was canceled`);
  }
}

async function processAiAnalysis(renderJobId: string) {
  console.info("[worker:ai] Loading job", { renderJobId });

  const renderJob = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    include: { sourceMedia: true }
  });

  if (!renderJob || renderJob.kind !== JobKind.AI_ANALYSIS || !renderJob.sourceMedia) {
    throw new Error(`AI job ${renderJobId} is not valid`);
  }

  if (renderJob.status === JobStatus.CANCELED) {
    console.info("[worker:ai] Skipping canceled job", { renderJobId });
    return;
  }

  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attempts: { increment: 1 },
      progress: 10
    }
  });

  console.info("[worker:ai] Processing started", {
    renderJobId,
    projectId: renderJob.projectId,
    sourceMediaId: renderJob.sourceMediaId
  });

  try {
    let analysis;

    const workspace = (renderJob.payload as { workspace: WorkspaceKind }).workspace;
    const smartAutoClip = (
      renderJob.payload as {
        smartAutoClip?: { enabled: boolean; minScore: number; maxClips: number };
      }
    ).smartAutoClip;

    if (renderJob.sourceMedia.objectKey) {
      analysis = await withTempDir("clipper-ai-", async (dir) => {
        const sourcePath = join(dir, renderJob.sourceMedia?.fileName ?? `${renderJob.sourceMediaId}.mp4`);
        await assertJobNotCanceled(renderJobId);
        await downloadObjectToFile(renderJob.sourceMedia!.objectKey!, sourcePath);
        await assertJobNotCanceled(renderJobId);
        await prisma.renderJob.update({
          where: { id: renderJobId },
          data: { progress: 35 }
        });

        return analyzeWithGemini({
          sourceMedia: renderJob.sourceMedia!,
          workspace,
          localFilePath: sourcePath
        });
      });
    } else {
      await assertJobNotCanceled(renderJobId);
      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { progress: 35 }
      });
      analysis = await analyzeWithGemini({
        sourceMedia: renderJob.sourceMedia,
        workspace
      });
    }

    await assertJobNotCanceled(renderJobId);
    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: { progress: 85 }
    });

    await prisma.$transaction([
      prisma.transcriptSegment.deleteMany({
        where: { projectId: renderJob.projectId }
      }),
      prisma.clipCandidate.deleteMany({
        where: {
          projectId: renderJob.projectId,
          sourceMediaId: renderJob.sourceMediaId,
          status: "SUGGESTED"
        }
      }),
      prisma.aiAnalysisResult.create({
        data: {
          projectId: renderJob.projectId,
          sourceMediaId: renderJob.sourceMediaId,
          workspace,
          model: process.env.GEMINI_MODEL ?? "gemini-3.7-flash",
          summary: analysis.summary,
          raw: analysis
        }
      }),
      prisma.transcriptSegment.createMany({
        data: analysis.transcript.map((segment) => ({
          projectId: renderJob.projectId,
          speaker: segment.speaker,
          startSec: segment.startSec,
          endSec: segment.endSec,
          text: segment.text
        }))
      }),
      prisma.clipCandidate.createMany({
        data: analysis.clips.map((clip, index) => ({
          projectId: renderJob.projectId,
          sourceMediaId: renderJob.sourceMediaId,
          workspace,
          status:
            smartAutoClip?.enabled &&
            clip.score >= smartAutoClip.minScore &&
            index < smartAutoClip.maxClips
              ? "SELECTED"
              : "SUGGESTED",
          title: clip.title,
          hook: clip.hook,
          startSec: clip.startSec,
          endSec: clip.endSec,
          score: clip.score,
          reason: clip.reason,
          captionStyle: clip.captionStyle,
          cropSuggestion: clip.cropSuggestion,
          platformCopy: clip.platformCopy,
          tags: clip.tags
        }))
      }),
      prisma.sourceMedia.update({
        where: { id: renderJob.sourceMediaId! },
        data: { status: "READY", error: null }
      }),
      prisma.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date()
        }
      })
    ]);

    console.info("[worker:ai] Processing completed", {
      renderJobId,
      transcriptSegments: analysis.transcript.length,
      clips: analysis.clips.length,
      selectedClips:
        smartAutoClip?.enabled
          ? analysis.clips.filter(
              (clip, index) => clip.score >= smartAutoClip.minScore && index < smartAutoClip.maxClips
            ).length
          : 0
    });
  } catch (error) {
    const latestJob = await prisma.renderJob.findUnique({
      where: { id: renderJobId },
      select: { status: true }
    });

    if (latestJob?.status === JobStatus.CANCELED) {
      console.info("[worker:ai] Canceled job stopped", { renderJobId });
      return;
    }

    await prisma.$transaction([
      prisma.sourceMedia.update({
        where: { id: renderJob.sourceMediaId! },
        data: { status: "FAILED", error: explainVideoDownloaderError(error) }
      }),
      prisma.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: JobStatus.FAILED,
          error: explainVideoDownloaderError(error),
          completedAt: new Date()
        }
      })
    ]);
    console.error("[worker:ai] Processing failed", {
      renderJobId,
      error
    });
    throw error;
  }
}

async function processRender(renderJobId: string, preset: ExportPreset) {
  console.info("[worker:render] Loading job", { renderJobId, preset });

  const renderJob = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    include: {
      clip: true,
      sourceMedia: true
    }
  });

  if (!renderJob || renderJob.kind !== JobKind.RENDER || !renderJob.clip || !renderJob.sourceMedia) {
    throw new Error(`Render job ${renderJobId} is not valid`);
  }

  if (renderJob.status === JobStatus.CANCELED) {
    console.info("[worker:render] Skipping canceled job", { renderJobId });
    return;
  }

  const clip = renderJob.clip;
  const sourceMedia = renderJob.sourceMedia;

  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attempts: { increment: 1 },
      progress: 15
    }
  });

  console.info("[worker:render] Processing started", {
    renderJobId,
    projectId: renderJob.projectId,
    clipId: clip.id,
    preset
  });

  try {
    await withTempDir("clipper-render-", async (dir) => {
      const sourcePath = join(dir, sourceMedia.fileName ?? `${sourceMedia.id}.mp4`);

      if (sourceMedia.objectKey) {
        await assertJobNotCanceled(renderJobId);
        await downloadObjectToFile(sourceMedia.objectKey, sourcePath);
      } else if (sourceMedia.originalUrl) {
        await assertJobNotCanceled(renderJobId);
        await downloadRemoteVideo(sourceMedia.originalUrl, sourcePath);
      } else {
        throw new Error("Source media has no renderable file or URL");
      }

      await assertJobNotCanceled(renderJobId);

      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { progress: 35 }
      });

      const presetConfig = exportPresets[preset];
      const outputFileName = `${clip.title
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 80)}-${presetConfig.width}x${presetConfig.height}.mp4`;
      const outputPath = join(dir, outputFileName);

      await renderClip({
        inputPath: sourcePath,
        outputPath,
        startSec: clip.startSec,
        endSec: clip.endSec,
        preset
      });

      await assertJobNotCanceled(renderJobId);

      await prisma.renderJob.update({
        where: { id: renderJobId },
        data: { progress: 80 }
      });

      const objectKey = exportObjectKey(renderJob.projectId, clip.id, outputFileName);
      await uploadFileToObject(outputPath, objectKey, "video/mp4");
      await assertJobNotCanceled(renderJobId);
      const outputStat = await stat(outputPath);

      await prisma.$transaction([
        prisma.exportAsset.create({
          data: {
            projectId: renderJob.projectId,
            clipId: clip.id,
            jobId: renderJob.id,
            preset,
            objectKey,
            fileName: outputFileName,
            mimeType: "video/mp4",
            sizeBytes: BigInt(outputStat.size),
            durationSec: clip.endSec - clip.startSec
          }
        }),
        prisma.clipCandidate.update({
          where: { id: clip.id },
          data: { status: "EXPORTED" }
        }),
        prisma.renderJob.update({
          where: { id: renderJobId },
          data: {
            status: JobStatus.COMPLETED,
            progress: 100,
            completedAt: new Date()
          }
        })
      ]);

      console.info("[worker:render] Processing completed", {
        renderJobId,
        objectKey,
        fileName: outputFileName
      });
    });
  } catch (error) {
    const latestJob = await prisma.renderJob.findUnique({
      where: { id: renderJobId },
      select: { status: true }
    });

    if (latestJob?.status === JobStatus.CANCELED) {
      console.info("[worker:render] Canceled job stopped", { renderJobId });
      return;
    }

    await prisma.$transaction([
      prisma.clipCandidate.update({
        where: { id: clip.id },
        data: { status: "SUGGESTED" }
      }),
      prisma.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: JobStatus.FAILED,
          error: explainVideoDownloaderError(error),
          completedAt: new Date()
        }
      })
    ]);
    console.error("[worker:render] Processing failed", {
      renderJobId,
      error
    });
    throw error;
  }
}

const connection = getRedisConnection();

const aiWorker = new Worker(
  AI_QUEUE_NAME,
  async (job) => {
    console.info("[worker:ai] BullMQ job active", {
      bullJobId: job.id,
      renderJobId: job.data.renderJobId
    });
    await processAiAnalysis(job.data.renderJobId);
  },
  { connection }
);

const renderWorker = new Worker(
  RENDER_QUEUE_NAME,
  async (job) => {
    console.info("[worker:render] BullMQ job active", {
      bullJobId: job.id,
      renderJobId: job.data.renderJobId
    });
    await processRender(job.data.renderJobId, job.data.preset);
  },
  { connection }
);

aiWorker.on("completed", (job) => {
  console.info("[worker:ai] BullMQ job completed", {
    bullJobId: job.id,
    renderJobId: job.data.renderJobId
  });
});

aiWorker.on("failed", (job, error) => {
  console.error("[worker:ai] BullMQ job failed", {
    bullJobId: job?.id,
    renderJobId: job?.data.renderJobId,
    error
  });
});

aiWorker.on("error", (error) => {
  console.error("[worker:ai] Worker connection error", error);
});

renderWorker.on("completed", (job) => {
  console.info("[worker:render] BullMQ job completed", {
    bullJobId: job.id,
    renderJobId: job.data.renderJobId
  });
});

renderWorker.on("failed", (job, error) => {
  console.error("[worker:render] BullMQ job failed", {
    bullJobId: job?.id,
    renderJobId: job?.data.renderJobId,
    error
  });
});

renderWorker.on("error", (error) => {
  console.error("[worker:render] Worker connection error", error);
});

console.log("Clipper Studio worker is listening for AI and render jobs.");
