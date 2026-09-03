import { NextRequest, NextResponse } from "next/server";
import { WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";

const createClipSchema = z
  .object({
    projectId: z.string().min(1),
    sourceMediaId: z.string().min(1).optional(),
    workspace: z.nativeEnum(WorkspaceKind),
    title: z.string().min(1).max(120),
    hook: z.string().min(1).max(240),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    reason: z.string().max(500).optional()
  })
  .refine((value) => value.endSec > value.startSec, {
    message: "Clip end must be after clip start",
    path: ["endSec"]
  });

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = createClipSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    if (input.sourceMediaId) {
      const source = await prisma.sourceMedia.findFirst({
        where: { id: input.sourceMediaId, projectId: input.projectId }
      });

      if (!source) {
        return new Response("Source media not found", { status: 404 });
      }
    }

    const clip = await prisma.clipCandidate.create({
      data: {
        projectId: input.projectId,
        sourceMediaId: input.sourceMediaId,
        workspace: input.workspace,
        title: input.title,
        hook: input.hook,
        startSec: input.startSec,
        endSec: input.endSec,
        score: 60,
        reason: input.reason ?? "Manual clip selection",
        tags: ["manual"]
      }
    });

    return NextResponse.json(serializeJson({ clip }), { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
