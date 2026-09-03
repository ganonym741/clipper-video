import { NextRequest, NextResponse } from "next/server";
import { ClipStatus } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";

const updateClipSchema = z.object({
  projectId: z.string().min(1),
  status: z.nativeEnum(ClipStatus).optional(),
  title: z.string().min(1).max(120).optional(),
  hook: z.string().min(1).max(240).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional()
});

type Context = {
  params: Promise<{ clipId: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { clipId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const input = updateClipSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    const clip = await prisma.clipCandidate.update({
      where: { id: clipId, projectId: input.projectId },
      data: {
        status: input.status,
        title: input.title,
        hook: input.hook,
        startSec: input.startSec,
        endSec: input.endSec
      }
    });

    return NextResponse.json(serializeJson({ clip }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
