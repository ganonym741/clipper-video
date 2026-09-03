import { NextRequest, NextResponse } from "next/server";
import { JobKind, JobStatus, WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { getProjectForDevice, projectInclude } from "@/server/project-queries";
import { getAiQueue, getRenderQueue } from "@/server/queues";
import { deleteObjects } from "@/server/storage";

const updateProjectSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  workspace: z.nativeEnum(WorkspaceKind).optional(),
  description: z.string().max(500).nullable().optional()
});

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const project = await getProjectForDevice(projectId, device.id);

    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    return NextResponse.json(serializeJson({ project }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const input = updateProjectSchema.parse(await request.json());
    const existing = await getProjectForDevice(projectId, device.id);

    if (!existing) {
      return new Response("Project not found", { status: 404 });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: input,
      include: projectInclude
    });

    return NextResponse.json(serializeJson({ project }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const existing = await getProjectForDevice(projectId, device.id);

    if (!existing) {
      return new Response("Project not found", { status: 404 });
    }

    const activeJobs = existing.jobs.filter(
      (job) => job.status === JobStatus.QUEUED || job.status === JobStatus.PROCESSING
    );

    await Promise.all(
      activeJobs.map(async (job) => {
        const queue = job.kind === JobKind.AI_ANALYSIS ? getAiQueue() : getRenderQueue();
        const queuedJob = await queue.getJob(job.id);

        if (!queuedJob) {
          return;
        }

        try {
          await queuedJob.remove();
        } catch {
          console.info("[api] Project delete could not remove active queue job", {
            projectId,
            renderJobId: job.id
          });
        }
      })
    );

    const objectKeys = [
      ...existing.media.map((media) => media.objectKey),
      ...existing.exports.map((asset) => asset.objectKey)
    ].filter((key): key is string => Boolean(key));

    if (objectKeys.length > 0) {
      await deleteObjects(objectKeys);
    }

    await prisma.project.delete({ where: { id: projectId } });

    console.info("[api] Project deleted", {
      projectId,
      objectCount: objectKeys.length,
      activeJobCount: activeJobs.length
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
