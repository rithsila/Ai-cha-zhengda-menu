import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

function createR2Client() {
  const config = getR2Config();
  if (!config) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/** Upload file buffer to R2. Returns public URL. */
export async function uploadToR2(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const config = getR2Config();
  if (!config) throw new Error('R2 is not configured. Set R2_* env vars.');

  const client = createR2Client()!;
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const key = `menu/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  }));

  return `${config.publicUrl.replace(/\/$/, '')}/${key}`;
}

/** Delete image from R2 by its public URL. */
export async function deleteFromR2(publicUrl: string): Promise<void> {
  const config = getR2Config();
  if (!config) return;

  const client = createR2Client()!;
  const baseUrl = config.publicUrl.replace(/\/$/, '');
  const key = publicUrl.replace(baseUrl + '/', '');

  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch { /* file might not exist */ }
}

/** Check if R2 is configured. */
export function isR2Configured(): boolean {
  return getR2Config() !== null;
}
