import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { ExportPreset, WorkspaceKind } from "@prisma/client";
import { getServerEnv } from "../lib/env";

export const AI_QUEUE_NAME = "clipper-ai-analysis";
export const RENDER_QUEUE_NAME = "clipper-render";

let connection: IORedis | undefined;
let aiQueue: Queue<AiAnalysisJobData> | undefined;
let renderQueue: Queue<RenderJobData> | undefined;

export type AiAnalysisJobData = {
  renderJobId: string;
  projectId: string;
  sourceMediaId: string;
  workspace: WorkspaceKind;
  smartAutoClip?: {
    enabled: boolean;
    minScore: number;
    maxClips: number;
  };
};

export type RenderJobData = {
  renderJobId: string;
  projectId: string;
  clipId: string;
  preset: ExportPreset;
};

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(getServerEnv().REDIS_URL, {
      maxRetriesPerRequest: null
    });
  }

  return connection;
}

export function getAiQueue() {
  if (!aiQueue) {
    aiQueue = new Queue<AiAnalysisJobData>(AI_QUEUE_NAME, {
      connection: getRedisConnection()
    });
  }

  return aiQueue;
}

export function getRenderQueue() {
  if (!renderQueue) {
    renderQueue = new Queue<RenderJobData>(RENDER_QUEUE_NAME, {
      connection: getRedisConnection()
    });
  }

  return renderQueue;
}

export async function queueAiAnalysis(data: AiAnalysisJobData) {
  const job = await getAiQueue().add("analyze-source-media", data, {
    jobId: data.renderJobId,
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });

  console.info("[queue] AI analysis queued", {
    bullJobId: job.id,
    renderJobId: data.renderJobId,
    projectId: data.projectId,
    sourceMediaId: data.sourceMediaId,
    workspace: data.workspace
  });

  return job;
}

export async function queueRender(data: RenderJobData) {
  const job = await getRenderQueue().add("render-clip", data, {
    jobId: data.renderJobId,
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 100,
    removeOnFail: 100
  });

  console.info("[queue] Render queued", {
    bullJobId: job.id,
    renderJobId: data.renderJobId,
    projectId: data.projectId,
    clipId: data.clipId,
    preset: data.preset
  });

  return job;
}
