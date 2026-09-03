import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "@/server/ffmpeg";

describe("buildFfmpegArgs", () => {
  it("creates deterministic vertical export arguments", () => {
    const args = buildFfmpegArgs({
      inputPath: "source.mp4",
      outputPath: "clip.mp4",
      startSec: 10,
      endSec: 40,
      preset: "SHORTS_9_16"
    });

    expect(args).toContain("-ss");
    expect(args).toContain("10");
    expect(args).toContain("-t");
    expect(args).toContain("30");
    expect(args.join(" ")).toContain("scale=1080:1920");
    expect(args.at(-1)).toBe("clip.mp4");
  });
});
