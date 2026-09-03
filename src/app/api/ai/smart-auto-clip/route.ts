import { NextRequest, NextResponse } from "next/server";
import { JobKind, WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";
import { queueAiAnalysis } from "@/server/queues";

const smartAutoClipSchema = z.object({
  projectId: z.string().min(1),
  sourceMediaId: z.string().min(1),
  workspace: z.nativeEnum(WorkspaceKind)
});

const smartAutoClipDefaults = {
  enabled: true,
  minScore: 80,
  maxClips: 8
};

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = smartAutoClipSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    const sourceMedia = await prisma.sourceMedia.findFirst({
      where: { id: input.sourceMediaId, projectId: input.projectId }
    });

    if (!sourceMedia) {
      return new Response("Source media not found", { status: 404 });
    }

    const renderJob = await prisma.renderJob.create({
      data: {
        projectId: input.projectId,
        sourceMediaId: input.sourceMediaId,
        kind: JobKind.AI_ANALYSIS,
        payload: {
          ...input,
          smartAutoClip: smartAutoClipDefaults
        }
      }
    });

    await prisma.sourceMedia.update({
      where: { id: input.sourceMediaId },
      data: { status: "ANALYZING", error: null }
    });

    await queueAiAnalysis({
      renderJobId: renderJob.id,
      projectId: input.projectId,
      sourceMediaId: input.sourceMediaId,
      workspace: input.workspace,
      smartAutoClip: smartAutoClipDefaults
    });

    console.info("[api] Smart auto clip accepted", {
      renderJobId: renderJob.id,
      projectId: input.projectId,
      sourceMediaId: input.sourceMediaId,
      workspace: input.workspace
    });

    return NextResponse.json(serializeJson({ job: renderJob }), { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
