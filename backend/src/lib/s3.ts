import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

export const DOCUMENTS_PREFIX = 'documents/';
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;

/**
 * En AWS no se configuran access keys: el SDK toma las credenciales del rol de la instancia (IMDSv2).
 * En local se apunta a MinIO con S3_ENDPOINT y las claves AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.
 */
function buildClient(endpoint?: string): S3Client {
  return new S3Client({
    region: env.AWS_REGION,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

export const s3 = buildClient(env.S3_ENDPOINT);
/** Cliente usado solo para firmar URLs que abrirá el navegador o el teléfono. */
const presignClient = env.S3_PUBLIC_ENDPOINT ? buildClient(env.S3_PUBLIC_ENDPOINT) : s3;

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

/** Metadatos del objeto, o null si no existe. */
export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as Error).name === 'NotFound') return null;
    throw err;
  }
}

export function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(presignClient, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
}

export function presignDownload(key: string, fileName?: string | null): Promise<string> {
  const disposition = fileName ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` : undefined;
  return getSignedUrl(
    presignClient,
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );
}
