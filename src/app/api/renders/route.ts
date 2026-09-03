import { NextRequest, NextResponse } from "next/server";
import { ExportPreset, JobKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";
import { queueRender } from "@/server/queues";

const renderSchema = z.object({
  projectId: z.string().min(1),
  clipId: z.string().min(1),
  preset: z.nativeEnum(ExportPreset)
});

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = renderSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    const clip = await prisma.clipCandidate.findFirst({
      where: { id: input.clipId, projectId: input.projectId }
    });

    if (!clip) {
      return new Response("Clip not found", { status: 404 });
    }

    const renderJob = await prisma.renderJob.create({
      data: {
        projectId: input.projectId,
        sourceMediaId: clip.sourceMediaId,
        clipId: clip.id,
        kind: JobKind.RENDER,
        preset: input.preset,
        payload: input
      }
    });

    await prisma.clipCandidate.update({
      where: { id: clip.id },
      data: { status: "RENDERING" }
    });

    await queueRender({
      renderJobId: renderJob.id,
      projectId: input.projectId,
      clipId: input.clipId,
      preset: input.preset
    });

    console.info("[api] Render accepted", {
      renderJobId: renderJob.id,
      projectId: input.projectId,
      clipId: input.clipId,
      preset: input.preset
    });

    return NextResponse.json(serializeJson({ job: renderJob }), { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
