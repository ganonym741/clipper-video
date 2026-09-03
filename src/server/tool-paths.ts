import ffmpegStatic from "ffmpeg-static";
import { getServerEnv } from "../lib/env";

export function getFfmpegPath() {
  const configuredPath = getServerEnv().FFMPEG_PATH;

  if (configuredPath && configuredPath !== "ffmpeg") {
    return configuredPath;
  }

  return ffmpegStatic ?? "ffmpeg";
}

export function getYtDlpPath() {
  return getServerEnv().YTDLP_PATH;
}
