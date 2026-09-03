import { NextRequest, NextResponse } from "next/server";
import { WorkspaceKind } from "@prisma/client";
import { z } from "zod";
import { getDeviceFromRequest } from "@/lib/anonymous-device";
import { prisma } from "@/lib/prisma";
import { serializeJson } from "@/lib/serialize";
import { projectInclude } from "@/server/project-queries";

const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  workspace: z.nativeEnum(WorkspaceKind).default(WorkspaceKind.SHORT_FORM),
  description: z.string().max(500).optional(),
  sourceUrl: z.string().url().optional()
});

export async function GET(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const projects = await prisma.project.findMany({
      where: { deviceId: device.id },
      orderBy: { updatedAt: "desc" },
      include: projectInclude
    });

    return NextResponse.json(serializeJson({ projects }));
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const device = await getDeviceFromRequest(request);
    const input = createProjectSchema.parse(await request.json());
    const project = await prisma.project.create({
      data: {
        deviceId: device.id,
        title: input.title,
        workspace: input.workspace,
        description: input.description,
        sourceUrl: input.sourceUrl
      },
      include: projectInclude
    });

    return NextResponse.json(serializeJson({ project }), { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
