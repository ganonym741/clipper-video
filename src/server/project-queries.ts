import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const projectInclude = {
  media: { orderBy: { createdAt: "desc" } },
  transcripts: { orderBy: { startSec: "asc" }, take: 80 },
  clips: { orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "desc" }] },
  analyses: { orderBy: { createdAt: "desc" }, take: 5 },
  jobs: { orderBy: { createdAt: "desc" }, take: 20 },
  exports: { orderBy: { createdAt: "desc" }, take: 20 }
} satisfies Prisma.ProjectInclude;

export async function assertProjectOwner(projectId: string, deviceId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deviceId }
  });

  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  return project;
}

export async function getProjectForDevice(projectId: string, deviceId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, deviceId },
    include: projectInclude
  });
}
