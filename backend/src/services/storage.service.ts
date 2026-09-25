import { buildFileKey, isAllowedMimeType, MAX_FILE_SIZE } from '../lib/files';
import { badRequest, HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';
import { putObject } from '../lib/s3';
import type { StoredFile } from './documents.service';

/** Valida y sube a S3 (o MinIO) un archivo recibido directamente por la API (multipart o base64). */
export async function storeFile(buffer: Buffer, fileName: string, mimeType: string): Promise<StoredFile> {
  if (!isAllowedMimeType(mimeType)) throw badRequest('Tipo de archivo no permitido (solo PDF, DOCX, JPG o PNG)');
  if (buffer.length === 0) throw badRequest('El archivo está vacío');
  if (buffer.length > MAX_FILE_SIZE) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'El archivo supera los 10 MB');

  const fileKey = buildFileKey(fileName);
  try {
    await putObject(fileKey, buffer, mimeType);
  } catch (err) {
    logger.error({ err, fileKey }, 'No se pudo subir el archivo a S3');
    throw new HttpError(502, 'STORAGE_ERROR', 'No se pudo almacenar el archivo');
  }
  return { fileKey, fileName, mimeType, fileSize: buffer.length };
}

export function decodeBase64(content: string): Buffer {
  // Admite tanto base64 puro como data URLs ("data:application/pdf;base64,...").
  const raw = content.includes(',') && content.startsWith('data:') ? content.slice(content.indexOf(',') + 1) : content;
  return Buffer.from(raw, 'base64');
}
