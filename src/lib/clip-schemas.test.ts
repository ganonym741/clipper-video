import { describe, expect, it } from "vitest";
import { aiAnalysisSchema } from "@/lib/clip-schemas";

describe("aiAnalysisSchema", () => {
  it("accepts a structured Gemini clip plan", () => {
    const parsed = aiAnalysisSchema.parse({
      summary: "A strong creator interview with practical advice.",
      transcript: [
        {
          speaker: "Host",
          startSec: 0,
          endSec: 4,
          text: "What is the biggest clipping mistake?"
        }
      ],
      clips: [
        {
          title: "Stop burying the hook",
          hook: "Most clips fail before the first sentence ends.",
          startSec: 12,
          endSec: 42,
          score: 91,
          reason: "Clear tension and immediate payoff.",
          cropSuggestion: {
            aspectRatio: "9:16",
            focus: "Speaker face"
          },
          platformCopy: [
            {
              platform: "shorts",
              title: "Fix your first 3 seconds",
              description: "A concise clip about better hooks.",
              hashtags: ["#creator", "#editing"]
            }
          ],
          tags: ["hook", "education"]
        }
      ],
      chapters: [],
      thumbnailIdeas: ["Close-up with bold hook text"],
      warnings: []
    });

    expect(parsed.clips[0]?.score).toBe(91);
  });

  it("rejects impossible clip scores", () => {
    expect(() =>
      aiAnalysisSchema.parse({
        summary: "Bad score",
        transcript: [],
        clips: [
          {
            title: "Too high",
            hook: "Score check",
            startSec: 0,
            endSec: 10,
            score: 120,
            reason: "Invalid"
          }
        ],
        chapters: [],
        thumbnailIdeas: [],
        warnings: []
      })
    ).toThrow();
  });
});
