import * as DocumentPicker from 'expo-document-picker';

export interface PickedFile {
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  webFile?: globalThis.File;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function fromBrowserFile(file: globalThis.File): PickedFile {
  return { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, uri: '', webFile: file };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ALLOWED_MIME_TYPES, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.file) return null;
  return fromBrowserFile(asset.file);
}

/** PUT directo a S3 con XMLHttpRequest para tener progreso de subida. */
export function uploadToSignedUrl(url: string, file: PickedFile, onProgress: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!file.webFile) {
      reject(new Error('Archivo no disponible'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Error al subir el archivo (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('No se pudo conectar con el almacenamiento'));
    xhr.send(file.webFile);
  });
}

/** La URL firmada trae Content-Disposition: attachment, así que el navegador descarga el archivo. */
export async function downloadAndShare(url: string, fileName: string): Promise<void> {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** En web se usa la hoja de compartir del navegador si existe; si no, se descarga. */
export async function shareDocument(url: string, fileName: string): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: fileName, url });
      return;
    } catch {
      // El usuario canceló o el navegador no lo permite: se descarga.
    }
  }
  await downloadAndShare(url, fileName);
}

export async function openPreview(url: string): Promise<void> {
  window.open(url, '_blank', 'noopener');
}
