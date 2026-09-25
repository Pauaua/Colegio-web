/**
 * Reglas de archivos compartidas entre cliente y servidor.
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_FILE_TYPES = {
  "application/pdf": { extensions: ["pdf"], label: "PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: ["docx"],
    label: "Word (DOCX)",
  },
  "image/jpeg": { extensions: ["jpg", "jpeg"], label: "JPG" },
  "image/png": { extensions: ["png"], label: "PNG" },
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_FILE_TYPES;

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_FILE_TYPES) as AllowedMimeType[];

/** Para el atributo `accept` del input de archivo. */
export const FILE_INPUT_ACCEPT = [
  ...ALLOWED_MIME_TYPES,
  ...Object.values(ALLOWED_FILE_TYPES).flatMap((t) => t.extensions.map((e) => `.${e}`)),
].join(",");

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return value in ALLOWED_FILE_TYPES;
}

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** El tipo declarado y la extensión deben coincidir (p. ej. no "foto.pdf" con image/png). */
export function extensionMatchesMime(fileName: string, mimeType: string): boolean {
  if (!isAllowedMimeType(mimeType)) return false;
  return (ALLOWED_FILE_TYPES[mimeType].extensions as readonly string[]).includes(getExtension(fileName));
}

export function isPreviewable(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function slugify(value: string, maxLength = 60): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** documents/{year}/{uuid}-{slug}.{ext} */
export function buildFileKey(fileName: string, uuid: string, year: number): string {
  const extension = getExtension(fileName);
  const base = fileName.slice(0, fileName.length - extension.length - 1);
  return `documents/${year}/${uuid}-${slugify(base) || "archivo"}.${extension}`;
}

/** Firma binaria ("magic bytes") de cada tipo permitido. */
const MAGIC_BYTES: Record<AllowedMimeType, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [0x50, 0x4b, 0x03, 0x04], // ZIP
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export const MAGIC_BYTES_LENGTH = 8;

/** Verifica que el contenido real del archivo corresponda al tipo declarado. */
export function matchesMagicBytes(head: Uint8Array, mimeType: AllowedMimeType): boolean {
  const signature = MAGIC_BYTES[mimeType];
  return signature.every((byte, i) => head[i] === byte);
}
