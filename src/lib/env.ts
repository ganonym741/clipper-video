import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  RUSTFS_ENDPOINT: z.string().url().default("http://localhost:9000"),
  RUSTFS_REGION: z.string().default("us-east-1"),
  RUSTFS_ACCESS_KEY_ID: z.string().min(1),
  RUSTFS_SECRET_ACCESS_KEY: z.string().min(1),
  RUSTFS_BUCKET: z.string().min(1).default("clipper-studio"),
  RUSTFS_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.7-flash"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  YTDLP_PATH: z.string().default("yt-dlp"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000")
});

export function getServerEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid server environment: ${issues}`);
  }

  return parsed.data;
}
