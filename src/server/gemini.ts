import { readFile } from "node:fs/promises";
import type { SourceMedia, WorkspaceKind } from "@prisma/client";
import { aiAnalysisSchema, type AiAnalysis } from "../lib/clip-schemas";
import { getServerEnv } from "../lib/env";
import { workspaceCopy } from "../lib/workspaces";

type GeminiFile = {
  name: string;
  uri: string;
  mimeType?: string;
  mime_type?: string;
  state?: { name?: string } | string;
};

const analysisJsonSchema = {
  type: "object",
  required: ["summary", "transcript", "clips", "chapters", "thumbnailIdeas", "warnings"],
  properties: {
    summary: { type: "string" },
    transcript: {
      type: "array",
      items: {
        type: "object",
        required: ["startSec", "endSec", "text"],
        properties: {
          speaker: { type: ["string", "null"] },
          startSec: { type: "number" },
          endSec: { type: "number" },
          text: { type: "string" }
        }
      }
    },
    clips: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "hook", "startSec", "endSec", "score", "reason"],
        properties: {
          title: { type: "string" },
          hook: { type: "string" },
          startSec: { type: "number" },
          endSec: { type: "number" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          reason: { type: "string" },
          captionStyle: { type: "string" },
          cropSuggestion: {
            type: "object",
            properties: {
              aspectRatio: { type: "string", enum: ["9:16", "1:1", "16:9"] },
              focus: { type: "string" },
              notes: { type: "string" }
            }
          },
          platformCopy: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "description", "platform"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } },
                platform: {
                  type: "string",
                  enum: ["tiktok", "reels", "shorts", "linkedin", "x", "youtube"]
                }
              }
            }
          },
          tags: { type: "array", items: { type: "string" } }
        }
      }
    },
    chapters: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "startSec", "endSec"],
        properties: {
          title: { type: "string" },
          startSec: { type: "number" },
          endSec: { type: "number" }
        }
      }
    },
    thumbnailIdeas: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } }
  }
};

export async function uploadVideoToGemini(filePath: string, mimeType: string) {
  const env = getServerEnv();
  const bytes = await readFile(filePath);
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": bytes.byteLength.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType
      },
      body: JSON.stringify({
        file: {
          display_name: filePath.split(/[\\/]/).pop() ?? "source-video"
        }
      })
    }
  );

  if (!startResponse.ok) {
    throw new Error(`Gemini upload start failed: ${await startResponse.text()}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");

  if (!uploadUrl) {
    throw new Error("Gemini upload start did not return an upload URL");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": bytes.byteLength.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: new Uint8Array(bytes)
  });

  if (!uploadResponse.ok) {
    throw new Error(`Gemini upload failed: ${await uploadResponse.text()}`);
  }

  const uploaded = (await uploadResponse.json()) as { file?: GeminiFile };
  const file = uploaded.file;

  if (!file?.name || !file.uri) {
    throw new Error("Gemini upload response did not include a usable file");
  }

  return waitForGeminiFile(file.name);
}

async function waitForGeminiFile(name: string) {
  const env = getServerEnv();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${env.GEMINI_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Gemini file polling failed: ${await response.text()}`);
    }

    const file = (await response.json()) as GeminiFile;
    const state = typeof file.state === "string" ? file.state : file.state?.name;

    if (!state || state === "ACTIVE") {
      return file;
    }

    if (state === "FAILED") {
      throw new Error(`Gemini file processing failed for ${name}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(`Gemini file ${name} was not ready in time`);
}

export async function analyzeWithGemini({
  sourceMedia,
  workspace,
  localFilePath
}: {
  sourceMedia: SourceMedia;
  workspace: WorkspaceKind;
  localFilePath?: string;
}) {
  const env = getServerEnv();

  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for AI analysis");
  }

  const videoInput =
    localFilePath && sourceMedia.mimeType
      ? await uploadVideoToGemini(localFilePath, sourceMedia.mimeType)
      : sourceMedia.originalUrl
        ? {
            uri: sourceMedia.originalUrl,
            mime_type: sourceMedia.mimeType ?? "video/mp4"
          }
        : null;

  if (!videoInput) {
    throw new Error("AI analysis requires an uploaded media object or a video URL");
  }

  const prompt = [
    `You are a senior content strategist for ${workspaceCopy[workspace].label} video clippers.`,
    workspaceCopy[workspace].aiGoal,
    "Analyze both audio and visual content. Return only JSON matching the schema.",
    "Prioritize clips that are self-contained, engaging in the first 3 seconds, safe to publish, and easy to render.",
    "Use seconds from the start of the source video for every timestamp."
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/interactions?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.GEMINI_MODEL,
        input: [
          {
            type: "video",
            uri: videoInput.uri,
            mime_type:
              "mime_type" in videoInput
                ? videoInput.mime_type
                : videoInput.mimeType ?? sourceMedia.mimeType ?? "video/mp4",
            processing: "agentic"
          },
          { type: "text", text: prompt }
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: analysisJsonSchema
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini analysis failed: ${await response.text()}`);
  }

  const json = (await response.json()) as {
    output_text?: string;
    steps?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const text =
    json.output_text ??
    json.steps
      ?.flatMap((step) => step.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .at(-1);

  if (!text) {
    throw new Error("Gemini returned no structured analysis text");
  }

  return aiAnalysisSchema.parse(JSON.parse(text)) satisfies AiAnalysis;
}
