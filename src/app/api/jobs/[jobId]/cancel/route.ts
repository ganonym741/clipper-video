import { NextRequest, NextResponse } from "next/server";
import { JobKind, JobStatus } from "@prisma/client";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { getAiQueue, getRenderQueue } from "@/server/queues";

type Context = {
  params: Promise<{ jobId: string }>;
};

async function removeBullMqJob(jobId: string, kind: JobKind) {
  const queue = kind === JobKind.AI_ANALYSIS ? getAiQueue() : getRenderQueue();
  const queuedJob = await queue.getJob(jobId);

  if (!queuedJob) {
    return "not-found";
  }

  try {
    await queuedJob.remove();
    return "removed";
  } catch {
    return "active";
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { jobId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const renderJob = await prisma.renderJob.findFirst({
      where: {
        id: jobId,
        project: { deviceId: device.id }
      }
    });

    if (!renderJob) {
      return new Response("Job not found", { status: 404 });
    }

    if (
      renderJob.status === JobStatus.COMPLETED ||
      renderJob.status === JobStatus.FAILED ||
      renderJob.status === JobStatus.CANCELED
    ) {
      return NextResponse.json(serializeJson({ job: renderJob, queueState: "unchanged" }));
    }

    const queueState = await removeBullMqJob(renderJob.id, renderJob.kind);

    const job = await prisma.$transaction(async (tx) => {
      const canceledJob = await tx.renderJob.update({
        where: { id: renderJob.id },
        data: {
          status: JobStatus.CANCELED,
          progress: 0,
          error:
            queueState === "active"
              ? "Cancellation requested while the worker was already processing this job."
              : null,
          completedAt: new Date()
        }
      });

      if (renderJob.kind === JobKind.AI_ANALYSIS && renderJob.sourceMediaId) {
        await tx.sourceMedia.update({
          where: { id: renderJob.sourceMediaId },
          data: { status: "READY", error: null }
        });
      }

      if (renderJob.kind === JobKind.RENDER && renderJob.clipId) {
        await tx.clipCandidate.update({
          where: { id: renderJob.clipId },
          data: { status: "SUGGESTED" }
        });
      }

      return canceledJob;
    });

    console.info("[api] Job cancellation requested", {
      renderJobId: renderJob.id,
      kind: renderJob.kind,
      queueState
    });

    return NextResponse.json(serializeJson({ job, queueState }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
