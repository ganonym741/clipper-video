import type { ExportPreset } from "@prisma/client";

export const exportPresets: Record<
  ExportPreset,
  {
    label: string;
    width: number;
    height: number;
    extension: "mp4";
    description: string;
  }
> = {
  TIKTOK_9_16: {
    label: "TikTok 9:16",
    width: 1080,
    height: 1920,
    extension: "mp4",
    description: "Vertical clip with burned captions."
  },
  REELS_9_16: {
    label: "Reels 9:16",
    width: 1080,
    height: 1920,
    extension: "mp4",
    description: "Instagram-ready vertical export."
  },
  SHORTS_9_16: {
    label: "Shorts 9:16",
    width: 1080,
    height: 1920,
    extension: "mp4",
    description: "YouTube Shorts preset."
  },
  SQUARE_1_1: {
    label: "Square 1:1",
    width: 1080,
    height: 1080,
    extension: "mp4",
    description: "Feed-friendly square crop."
  },
  LANDSCAPE_16_9: {
    label: "Landscape 16:9",
    width: 1920,
    height: 1080,
    extension: "mp4",
    description: "Standard YouTube landscape export."
  },
  PODCAST_AUDIOGRAM: {
    label: "Podcast Audiogram",
    width: 1080,
    height: 1080,
    extension: "mp4",
    description: "Square podcast highlight format."
  }
};
