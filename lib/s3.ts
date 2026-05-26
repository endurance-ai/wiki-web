import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// @MX:ANCHOR: [AUTO] single shared S3 client + public-URL builder for wiki-web feed images.
// @MX:REASON: both the live single-brand refresh route and (the TS side of) feed
//   handling upload to the same `feed/` prefix of the wiki-web bucket. Centralizing
//   the bucket/region/credential resolution here keeps the public URL shape and the
//   PUT path from drifting. The standalone backfill script (scripts/, CommonJS) keeps
//   its own copy by repo convention — it cannot import this TS module.

const REGION = process.env.S3_REGION || "ap-northeast-2";
const BUCKET = process.env.S3_BUCKET || "kikoai-wiki-web";
// feed/* is the only public-read prefix (see bucket policy). Public object URL base.
const PUBLIC_BASE =
  process.env.S3_PUBLIC_BASE || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

declare global {
  var __s3Client: S3Client | undefined;
}

// Credentials come from the default AWS provider chain (AWS_PROFILE / env / IAM role).
// Locally that resolves to the `kiko.ai` shared-credentials profile.
function createClient(): S3Client {
  return new S3Client({ region: REGION });
}

export const s3: S3Client = globalThis.__s3Client ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__s3Client = s3;

export const S3_BUCKET = BUCKET;

/** Public https URL for a stored object key (key must live under the feed/ prefix). */
export function publicUrl(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

/**
 * Upload a single object under the feed/ prefix and return its public URL.
 * Caller is responsible for building a stable, collision-free key.
 */
export async function putFeedObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return publicUrl(key);
}
