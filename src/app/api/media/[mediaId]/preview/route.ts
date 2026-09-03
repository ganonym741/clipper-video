import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { extractFirstUrl } from "@/lib/url";
import { createGetUrl } from "@/server/storage";
import { isYouTubeUrl } from "@/server/video-download";

type Context = {
  params: Promise<{ mediaId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const { mediaId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const media = await prisma.sourceMedia.findFirst({
      where: {
        id: mediaId,
        project: { deviceId: device.id }
      }
    });

    if (!media) {
      return new Response("Source media not found", { status: 404 });
    }

    if (media.objectKey) {
      return NextResponse.json({
        playable: true,
        url: await createGetUrl(media.objectKey),
        label: media.fileName ?? "Source video"
      });
    }

    if (media.originalUrl) {
      const url = extractFirstUrl(media.originalUrl);

      if (isYouTubeUrl(url)) {
        return NextResponse.json({
          playable: false,
          url,
          label: media.fileName ?? "YouTube source",
          reason:
            "YouTube watch pages cannot be played inside the HTML video player. Render a clip first, then review the exported video."
        });
      }

      return NextResponse.json({
        playable: true,
        url,
        label: media.fileName ?? "Remote source"
      });
    }

    return NextResponse.json({
      playable: false,
      url: null,
      label: media.fileName ?? "Source video",
      reason: "This media record does not have a playable object or URL yet."
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
