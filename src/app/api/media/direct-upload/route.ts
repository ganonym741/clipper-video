import { NextRequest, NextResponse } from "next/server";
import { SourceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { assertProjectOwner } from "@/server/project-queries";
import { mediaObjectKey, uploadBlobToObject } from "@/server/storage";

export const runtime = "nodejs";

const metadataSchema = z.object({
  projectId: z.string().min(1),
  durationSec: z.coerce.number().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional()
});

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const metadata = metadataSchema.parse({
      projectId: formData.get("projectId"),
      durationSec: formData.get("durationSec") || undefined,
      width: formData.get("width") || undefined,
      height: formData.get("height") || undefined
    });

    if (!(file instanceof File)) {
      return new Response("Missing upload file", { status: 400 });
    }

    await assertProjectOwner(metadata.projectId, device.id);

    const mimeType = file.type || "video/mp4";
    const objectKey = mediaObjectKey(metadata.projectId, file.name);

    await uploadBlobToObject(file, objectKey, mimeType);

    const sourceMedia = await prisma.sourceMedia.create({
      data: {
        projectId: metadata.projectId,
        kind: SourceKind.UPLOAD,
        status: "READY",
        fileName: file.name,
        mimeType,
        sizeBytes: BigInt(file.size),
        durationSec: metadata.durationSec,
        width: metadata.width,
        height: metadata.height,
        objectKey
      }
    });

    console.info("[api] Direct media upload completed", {
      projectId: metadata.projectId,
      sourceMediaId: sourceMedia.id,
      objectKey,
      sizeBytes: file.size
    });

    return NextResponse.json(serializeJson({ sourceMedia }), { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
