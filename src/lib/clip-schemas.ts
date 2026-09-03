import { z } from "zod";

export const transcriptSegmentSchema = z.object({
  speaker: z.string().optional().nullable(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  text: z.string().min(1)
});

export const platformCopySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  platform: z.enum(["tiktok", "reels", "shorts", "linkedin", "x", "youtube"])
});

export const clipPlanSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  score: z.number().int().min(0).max(100),
  reason: z.string().min(1),
  captionStyle: z.string().optional(),
  cropSuggestion: z
    .object({
      aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
      focus: z.string(),
      notes: z.string().optional()
    })
    .optional(),
  platformCopy: z.array(platformCopySchema).default([]),
  tags: z.array(z.string()).default([])
});

export const aiAnalysisSchema = z.object({
  summary: z.string().min(1),
  transcript: z.array(transcriptSegmentSchema).default([]),
  clips: z.array(clipPlanSchema).default([]),
  chapters: z
    .array(
      z.object({
        title: z.string(),
        startSec: z.number().min(0),
        endSec: z.number().min(0)
      })
    )
    .default([]),
  thumbnailIdeas: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([])
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
export type ClipPlan = z.infer<typeof clipPlanSchema>;
