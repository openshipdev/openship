import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
let client;
const bucket = () => {
  if (!process.env.R2_BUCKET) throw new Error("R2 storage is not configured.");
  return process.env.R2_BUCKET;
};
const s3 = () =>
  (client ??= new S3Client({
    region: "auto",
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 },
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  }));
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function put(bytes) {
  const digest = hash(bytes);
  const key = `objects/${digest}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: "application/octet-stream",
    }),
  );
  return { key, digest };
}
export async function readObject(key, range) {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }),
  );
  return Buffer.from(await result.Body.transformToByteArray());
}
export async function readUrl(key) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: "application/octet-stream",
      ResponseContentDisposition: "attachment",
    }),
    { expiresIn: 300 },
  );
}
