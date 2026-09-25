import crypto from 'node:crypto';
import { DOCUMENTS_PREFIX } from './s3';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Tipos de archivo admitidos: PDF, DOCX, JPG y PNG. */
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

export function isAllowedMimeType(mimeType: string): boolean {
  return mimeType in ALLOWED_MIME_TYPES;
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'archivo';
  const clean = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
  return clean || 'archivo';
}

/** Clave del objeto en S3: documents/<año>/<uuid>-<nombre-saneado>. */
export function buildFileKey(fileName: string, date = new Date()): string {
  return `${DOCUMENTS_PREFIX}${date.getUTCFullYear()}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}
