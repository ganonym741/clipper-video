import { NextRequest, NextResponse } from "next/server";
import { SourceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { extractFirstUrl } from "@/lib/url";
import { assertProjectOwner } from "@/server/project-queries";

const importUrlSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1).max(120).optional()
});

function sourceKindForUrl(url: string) {
  return /youtube\.com|youtu\.be/i.test(url) ? SourceKind.YOUTUBE_URL : SourceKind.REMOTE_URL;
}

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const rawInput = await request.json();
    const input = importUrlSchema.parse({
      ...rawInput,
      url: extractFirstUrl(rawInput.url)
    });
    await assertProjectOwner(input.projectId, device.id);

    const [sourceMedia] = await prisma.$transaction([
      prisma.sourceMedia.create({
        data: {
          projectId: input.projectId,
          kind: sourceKindForUrl(input.url),
          status: "READY",
          originalUrl: input.url,
          fileName: input.title ?? "Imported video"
        }
      }),
      prisma.project.update({
        where: { id: input.projectId },
        data: {
          sourceUrl: input.url,
          title: input.title
            ? input.title
            : undefined
        }
      })
    ]);

    return NextResponse.json(serializeJson({ sourceMedia }), { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
