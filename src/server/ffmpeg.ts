import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExportPreset } from "@prisma/client";
import { exportPresets } from "@/lib/exports";
import { getFfmpegPath } from "@/server/tool-paths";

export type FfmpegRenderInput = {
  inputPath: string;
  outputPath: string;
  startSec: number;
  endSec: number;
  preset: ExportPreset;
  burnCaptionsPath?: string;
};

export function buildFfmpegArgs(input: FfmpegRenderInput) {
  const preset = exportPresets[input.preset];
  const duration = Math.max(0.5, input.endSec - input.startSec);
  const vf = [
    `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=increase`,
    `crop=${preset.width}:${preset.height}`,
    "setsar=1"
  ];

  if (input.burnCaptionsPath) {
    const escapedPath = input.burnCaptionsPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    vf.push(`subtitles='${escapedPath}'`);
  }

  return [
    "-hide_banner",
    "-y",
    "-ss",
    input.startSec.toString(),
    "-t",
    duration.toString(),
    "-i",
    input.inputPath,
    "-vf",
    vf.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    input.outputPath
  ];
}

export async function renderClip(input: FfmpegRenderInput) {
  await mkdir(dirname(input.outputPath), { recursive: true });

  const args = buildFfmpegArgs(input);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "FFmpeg was not found. Install FFmpeg, set FFMPEG_PATH in .env, or reinstall dependencies so ffmpeg-static is available."
            : error.message
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`FFmpeg exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
