import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { getServerEnv } from "@/lib/env";
import { extractFirstUrl } from "@/lib/url";

export function isYouTubeUrl(url: string) {
  return /(^|\.)youtube\.com|youtu\.be/i.test(new URL(extractFirstUrl(url)).hostname);
}

export async function downloadRemoteVideo(url: string, outputPath: string) {
  const normalizedUrl = extractFirstUrl(url);
  await mkdir(dirname(outputPath), { recursive: true });

  if (isYouTubeUrl(normalizedUrl)) {
    await downloadWithYtDlp(normalizedUrl, outputPath);
    return;
  }

  const response = await fetch(normalizedUrl);

  if (!response.ok || !response.body) {
    throw new Error(`Remote video download failed: ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(outputPath));
}

async function downloadWithYtDlp(url: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      getServerEnv().YTDLP_PATH,
      ["-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best", "-o", outputPath, url],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(explainVideoDownloaderError(error)));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`yt-dlp exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

export function explainVideoDownloaderError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  ) {
    return `yt-dlp was not found. Install yt-dlp or set YTDLP_PATH in .env. Rendering YouTube URLs requires yt-dlp; uploaded local files do not.`;
  }

  return String(error);
}
