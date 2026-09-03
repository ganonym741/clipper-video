import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "@/lib/env";

let s3Client: S3Client | undefined;

export function getS3Client() {
  if (!s3Client) {
    const env = getServerEnv();
    s3Client = new S3Client({
      endpoint: env.RUSTFS_ENDPOINT,
      region: env.RUSTFS_REGION,
      forcePathStyle: env.RUSTFS_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.RUSTFS_ACCESS_KEY_ID,
        secretAccessKey: env.RUSTFS_SECRET_ACCESS_KEY
      }
    });
  }

  return s3Client;
}

export function mediaObjectKey(projectId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  return `projects/${projectId}/source/${Date.now()}-${safeName}`;
}

export function exportObjectKey(projectId: string, clipId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  return `projects/${projectId}/exports/${clipId}/${Date.now()}-${safeName}`;
}

export function explainStorageError(error: unknown, action: string) {
  if (
    error instanceof AggregateError &&
    Array.isArray(error.errors) &&
    error.errors.length > 0
  ) {
    const nested = error.errors
      .map((nestedError) =>
        nestedError instanceof Error ? nestedError.message : String(nestedError)
      )
      .filter(Boolean)
      .join("; ");

    return `RustFS ${action} could not connect to the storage endpoint: ${nested}`;
  }

  const message = error instanceof Error ? error.message : String(error);
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  const code =
    typeof error === "object" && error !== null && "Code" in error
      ? String(error.Code)
      : "";
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? String(error.$metadata.httpStatusCode)
      : "";
  const combined = [name, code, message, statusCode].filter(Boolean).join(" ");

  if (combined.includes("AccessDenied") || statusCode === "403") {
    const actionAdvice =
      action === "download"
        ? "The configured access key needs s3:GetObject permission for existing source videos."
        : action === "delete"
          ? "The configured access key needs s3:DeleteObject permission for cleanup and project deletion."
          : action === "upload"
            ? "The configured access key needs s3:PutObject permission for source uploads and rendered exports."
            : "The configured access key needs the matching S3 permission for this operation.";

    return [
      `RustFS ${action} was denied.`,
      "The bucket being public or having CORS does not grant server-side application permissions.",
      actionAdvice,
      "Check RUSTFS_ACCESS_KEY_ID/RUSTFS_SECRET_ACCESS_KEY, bucket name, endpoint, and bucket/IAM policy."
    ].join(" ");
  }

  if (combined.includes("NoSuchBucket") || statusCode === "404") {
    return `RustFS bucket was not found while trying to ${action}. Check RUSTFS_BUCKET and RUSTFS_ENDPOINT.`;
  }

  if (combined.includes("SignatureDoesNotMatch")) {
    return `RustFS signature failed while trying to ${action}. Check access key, secret key, endpoint, region, and RUSTFS_FORCE_PATH_STYLE.`;
  }

  return `RustFS ${action} failed: ${combined || "unknown storage error"}`;
}

async function sendStorageCommand<T>(command: unknown, action: string) {
  try {
    return (await getS3Client().send(command as never)) as T;
  } catch (error) {
    throw new Error(explainStorageError(error, action));
  }
}

export async function createPutUrl(objectKey: string, contentType: string) {
  const env = getServerEnv();

  return getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: objectKey,
      ContentType: contentType
    }),
    { expiresIn: 60 * 15 }
  );
}

export async function createGetUrl(objectKey: string) {
  const env = getServerEnv();

  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: objectKey
    }),
    { expiresIn: 60 * 30 }
  );
}

export async function downloadObjectToFile(objectKey: string, outputPath: string) {
  const env = getServerEnv();
  const response = await sendStorageCommand<{ Body?: unknown }>(
    new GetObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: objectKey
    }),
    "download"
  );

  if (!response.Body) {
    throw new Error(`RustFS object ${objectKey} returned no body`);
  }

  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(outputPath));
}

export async function uploadFileToObject(
  inputPath: string,
  objectKey: string,
  contentType: string
) {
  const env = getServerEnv();

  await sendStorageCommand(
    new PutObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: objectKey,
      ContentType: contentType,
      Body: createReadStream(inputPath)
    }),
    "upload"
  );
}

export async function uploadBlobToObject(
  blob: Blob,
  objectKey: string,
  contentType: string
) {
  const env = getServerEnv();

  await sendStorageCommand(
    new PutObjectCommand({
      Bucket: env.RUSTFS_BUCKET,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: blob.size,
      Body: Buffer.from(await blob.arrayBuffer())
    }),
    "upload"
  );
}

export async function deleteObjects(objectKeys: string[]) {
  const env = getServerEnv();
  const uniqueKeys = Array.from(new Set(objectKeys.filter(Boolean)));

  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    const batch = uniqueKeys.slice(index, index + 1000);

    if (batch.length === 0) {
      continue;
    }

    await sendStorageCommand(
      new DeleteObjectsCommand({
        Bucket: env.RUSTFS_BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true
        }
      }),
      "delete"
    );
  }
}

export async function assertStorageReady() {
  const env = getServerEnv();

  await sendStorageCommand(
    new HeadBucketCommand({
      Bucket: env.RUSTFS_BUCKET
    }),
    "bucket check"
  );
}
