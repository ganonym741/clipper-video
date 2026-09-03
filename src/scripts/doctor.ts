import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { explainStorageError } from "../server/storage";
import { getFfmpegPath } from "../server/tool-paths";

if (existsSync(".env")) {
  process.loadEnvFile?.(".env");
}

function checkCommand(command: string, args: string[]) {
  return new Promise<{ command: string; ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ command, ok: false, output: error.message });
    });

    child.on("close", (code) => {
      resolve({
        command,
        ok: code === 0,
        output: output.trim().split("\n")[0] ?? ""
      });
    });
  });
}

async function checkRustFsObjectAccess(env: {
  RUSTFS_ENDPOINT: string;
  RUSTFS_BUCKET: string;
  RUSTFS_REGION: string;
  RUSTFS_ACCESS_KEY_ID?: string;
  RUSTFS_SECRET_ACCESS_KEY?: string;
  RUSTFS_FORCE_PATH_STYLE: boolean;
}) {
  if (!env.RUSTFS_ACCESS_KEY_ID || !env.RUSTFS_SECRET_ACCESS_KEY) {
    return {
      ok: false,
      message: "missing access key or secret key"
    };
  }

  const client = new S3Client({
    endpoint: env.RUSTFS_ENDPOINT,
    region: env.RUSTFS_REGION,
    forcePathStyle: env.RUSTFS_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.RUSTFS_ACCESS_KEY_ID,
      secretAccessKey: env.RUSTFS_SECRET_ACCESS_KEY
    }
  });
  const key = `_doctor/clipper-${Date.now()}.txt`;
  const results: string[] = [];

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.RUSTFS_BUCKET,
        Key: key,
        ContentType: "text/plain",
        Body: "clipper doctor"
      })
    );
    results.push("put ok");

    const getResponse = await client.send(
      new GetObjectCommand({
        Bucket: env.RUSTFS_BUCKET,
        Key: key
      })
    );

    if (!getResponse.Body) {
      throw new Error("GetObject returned no body");
    }

    results.push("get ok");

    await client.send(
      new DeleteObjectCommand({
        Bucket: env.RUSTFS_BUCKET,
        Key: key
      })
    );
    results.push("delete ok");

    return {
      ok: true,
      message: results.join(", ")
    };
  } catch (error) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: env.RUSTFS_BUCKET,
          Key: key
        })
      );
    } catch {
      // Best-effort cleanup only.
    }

    return {
      ok: false,
      message: explainStorageError(error, "doctor put/get/delete")
    };
  }
}

async function main() {
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    RUSTFS_ENDPOINT: process.env.RUSTFS_ENDPOINT ?? "http://localhost:9000",
    RUSTFS_REGION: process.env.RUSTFS_REGION ?? "us-east-1",
    RUSTFS_BUCKET: process.env.RUSTFS_BUCKET ?? "clipper-studio",
    RUSTFS_ACCESS_KEY_ID: process.env.RUSTFS_ACCESS_KEY_ID,
    RUSTFS_SECRET_ACCESS_KEY: process.env.RUSTFS_SECRET_ACCESS_KEY,
    RUSTFS_FORCE_PATH_STYLE: (process.env.RUSTFS_FORCE_PATH_STYLE ?? "true") === "true",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    FFMPEG_PATH: getFfmpegPath(),
    YTDLP_PATH: process.env.YTDLP_PATH ?? "yt-dlp"
  };
  const checks = await Promise.all([
    checkCommand(env.FFMPEG_PATH, ["-version"]),
    checkCommand(env.YTDLP_PATH, ["--version"])
  ]);

  for (const check of checks) {
    const status = check.ok ? "ok" : "missing";
    console.log(`${status.padEnd(8)} ${check.command} ${check.output}`);
  }

  console.log(`ffmpeg  resolved ${env.FFMPEG_PATH}`);
  console.log(`database ${env.DATABASE_URL ? "configured" : "missing"}`);
  console.log(`redis    ${env.REDIS_URL ? "configured" : "missing"}`);
  console.log(
    `rustfs   ${env.RUSTFS_ENDPOINT}/${env.RUSTFS_BUCKET} pathStyle=${env.RUSTFS_FORCE_PATH_STYLE}`
  );
  const rustfsAccess = await checkRustFsObjectAccess(env);
  console.log(`rustfs   ${rustfsAccess.ok ? "ok" : "failed"} ${rustfsAccess.message}`);
  console.log(`gemini   ${env.GEMINI_API_KEY ? "configured" : "missing"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
