import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";

const completeSchema = z.object({
  projectId: z.string().min(1),
  sourceMediaId: z.string().min(1),
  durationSec: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = completeSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    const sourceMedia = await prisma.sourceMedia.update({
      where: { id: input.sourceMediaId, projectId: input.projectId },
      data: {
        status: "READY",
        durationSec: input.durationSec,
        width: input.width,
        height: input.height
      }
    });

    return NextResponse.json(serializeJson({ sourceMedia }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
