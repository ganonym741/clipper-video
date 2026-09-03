import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const DEVICE_HEADER = "x-clipper-device";

export function createDeviceToken() {
  return `anon_${randomUUID()}`;
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureDevice(token: string) {
  const tokenHash = hashDeviceToken(token);

  return prisma.anonymousDevice.upsert({
    where: { tokenHash },
    create: { tokenHash },
    update: {}
  });
}

export async function getDeviceFromRequest(request: NextRequest) {
  const token = request.headers.get(DEVICE_HEADER);

  if (!token || token.length < 16) {
    throw new Response("Missing anonymous device token", { status: 401 });
  }

  return ensureDevice(token);
}
