import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { createGetUrl } from "@/server/storage";

type Context = {
  params: Promise<{ assetId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const { assetId } = await context.params;
    const device = await getDeviceFromRequest(request);
    const asset = await prisma.exportAsset.findFirst({
      where: {
        id: assetId,
        project: { deviceId: device.id }
      }
    });

    if (!asset) {
      return new Response("Asset not found", { status: 404 });
    }

    return NextResponse.json({
      url: await createGetUrl(asset.objectKey),
      fileName: asset.fileName
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
