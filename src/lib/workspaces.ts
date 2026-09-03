import type { WorkspaceKind } from "@prisma/client";
import { Clapperboard, Mic2, Radio } from "lucide-react";

export const workspaceCopy: Record<
  WorkspaceKind,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: typeof Clapperboard;
    accent: string;
    aiGoal: string;
  }
> = {
  SHORT_FORM: {
    label: "Short-form",
    shortLabel: "Shorts",
    description: "Find hooks, vertical crops, captions, and social-ready variants.",
    icon: Clapperboard,
    accent: "bg-studio-lime text-studio-ink",
    aiGoal:
      "Identify viral short-form clips with strong hooks, retention beats, captions, and platform-specific metadata."
  },
  PODCAST: {
    label: "Podcast",
    shortLabel: "Podcast",
    description: "Pull quotable moments, chapters, speaker highlights, and audiogram cuts.",
    icon: Mic2,
    accent: "bg-studio-cyan text-studio-ink",
    aiGoal:
      "Identify self-contained podcast moments with clear context, quote-worthy lines, speaker labels, and chapter themes."
  },
  STREAM: {
    label: "Stream",
    shortLabel: "Stream",
    description: "Batch hype, funny, clutch, and dead-air trimmed stream moments.",
    icon: Radio,
    accent: "bg-studio-coral text-white",
    aiGoal:
      "Identify stream highlights, funny beats, action spikes, audience context, and dead-air trim opportunities."
  }
};

export const workspaceKinds = Object.keys(workspaceCopy) as WorkspaceKind[];
