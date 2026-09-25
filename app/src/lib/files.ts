import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile, Paths, UploadType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

/** Archivo elegido por el usuario, igual en móvil y web. */
export interface PickedFile {
  name: string;
  mimeType: string;
  size: number;
  /** URI local (móvil). */
  uri: string;
  /** Objeto File del navegador (solo web). */
  webFile?: globalThis.File;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Solo se usa en web (arrastrar y soltar); se mantiene aquí para que ambas variantes expongan la misma API. */
export function fromBrowserFile(file: globalThis.File): PickedFile {
  return { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, uri: '', webFile: file };
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ALLOWED_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size ?? 0, uri: asset.uri };
}

/** Sube el archivo directo a S3 con la URL firmada (PUT), informando el progreso de 0 a 1. */
export async function uploadToSignedUrl(url: string, file: PickedFile, onProgress: (ratio: number) => void): Promise<void> {
  const result = await new FsFile(file.uri).upload(url, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': file.mimeType },
    onProgress: ({ bytesSent, totalBytes }) => onProgress(totalBytes ? bytesSent / totalBytes : 0),
  });
  if (result.status < 200 || result.status >= 300) throw new Error(`Error al subir el archivo (${result.status})`);
  onProgress(1);
}

/** Descarga a la caché y abre el menú de compartir/guardar del sistema. */
export async function downloadAndShare(url: string, fileName: string, mimeType?: string | null): Promise<void> {
  const target = new FsFile(Paths.cache, fileName);
  if (target.exists) target.delete();
  const file = await FsFile.downloadFileAsync(url, target);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mimeType ?? undefined, dialogTitle: fileName });
  } else {
    Alert.alert('Descarga completa', `El archivo quedó guardado en ${file.uri}`);
  }
}

/** Compartir en móvil es lo mismo que descargar y abrir el menú del sistema. */
export const shareDocument = downloadAndShare;

/** Vista previa: abre el archivo firmado en el navegador integrado. */
export async function openPreview(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
