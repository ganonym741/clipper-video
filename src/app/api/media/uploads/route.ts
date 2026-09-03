import { NextRequest, NextResponse } from "next/server";
import { SourceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";
import { createPutUrl, mediaObjectKey } from "@/server/storage";

const uploadSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive()
});

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = uploadSchema.parse(await request.json());
    await assertProjectOwner(input.projectId, device.id);

    const objectKey = mediaObjectKey(input.projectId, input.fileName);
    const sourceMedia = await prisma.sourceMedia.create({
      data: {
        projectId: input.projectId,
        kind: SourceKind.UPLOAD,
        status: "PENDING_UPLOAD",
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        objectKey
      }
    });
    const uploadUrl = await createPutUrl(objectKey, input.mimeType);

    return NextResponse.json(serializeJson({ sourceMedia, uploadUrl }), {
      status: 201
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
