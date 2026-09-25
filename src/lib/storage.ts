/**
 * Capa de almacenamiento de archivos. El resto de la app solo usa las funciones
 * exportadas (getUploadUrl, getDownloadUrl, deleteFile, …), así que cambiar de
 * proveedor no toca nada más.
 *
 * Drivers:
 * - "r2": Cloudflare R2 (API compatible con S3), bucket privado y URLs prefirmadas.
 *   Se activa cuando existen las variables R2_*.
 * - "local": disco local (carpeta .storage/) con URLs firmadas con HMAC.
 *   Solo para desarrollo. Nunca en Vercel; con `next start` solo si STORAGE_DRIVER=local.
 *
 * No importa "server-only" para que el seed (tsx) pueda usarlo; nunca debe
 * importarse desde un Client Component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** documents/{year}/{uuid}-{slug}.{ext} — también impide path traversal en el driver local. */
export const FILE_KEY_PATTERN =
  /^documents\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,80}\.[a-z0-9]{2,5}$/;

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };
export type FileInfo = { size: number; contentType: string | null };
export type DownloadOptions = {
  fileName: string;
  contentType: string;
  disposition: "attachment" | "inline";
};

interface StorageDriver {
  readonly name: "r2" | "local";
  getUploadUrl(key: string, file: { contentType: string; contentLength: number }): Promise<UploadTarget>;
  getDownloadUrl(key: string, options: DownloadOptions): Promise<string>;
  deleteFile(key: string): Promise<void>;
  getFileInfo(key: string): Promise<FileInfo | null>;
  readFileHead(key: string, bytes: number): Promise<Buffer>;
  putFile(key: string, body: Buffer, contentType: string): Promise<void>;
}

function assertValidKey(key: string) {
  if (!FILE_KEY_PATTERN.test(key)) throw new Error(`Clave de archivo inválida: ${key}`);
}

/** Content-Disposition con nombre ASCII de respaldo y nombre UTF-8 (RFC 6266). */
export function contentDisposition({
  fileName,
  disposition,
}: Pick<DownloadOptions, "fileName" | "disposition">) {
  const ascii =
    fileName
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "") || "archivo";
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// ─── Cloudflare R2 ──────────────────────────────────────────────────────

function createR2Driver(): StorageDriver {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET!;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // R2 no soporta los checksums CRC32 que el SDK agrega por defecto a las URLs prefirmadas.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  const isNotFound = (error: unknown) =>
    error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey");

  return {
    name: "r2",
    async getUploadUrl(key, { contentType, contentLength }) {
      assertValidKey(key);
      // Content-Type y Content-Length quedan firmados: el navegador no puede subir otra cosa.
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return { url, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async getDownloadUrl(key, options) {
      assertValidKey(key);
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: contentDisposition(options),
      });
      return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    },
    async deleteFile(key) {
      assertValidKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async getFileInfo(key) {
      assertValidKey(key);
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async readFileHead(key, bytes) {
      assertValidKey(key);
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      return Buffer.from(await object.Body!.transformToByteArray());
    },
    async putFile(key, body, contentType) {
      assertValidKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
  };
}

// ─── Disco local (solo desarrollo) ──────────────────────────────────────

export const LOCAL_STORAGE_ROUTE = "/api/storage/local";
const LOCAL_ROOT = path.join(process.cwd(), ".storage");

type LocalParams = Record<string, string>;

function localSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET es necesario para firmar las URLs del storage local");
  return secret;
}

function signLocal(params: LocalParams): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHmac("sha256", localSecret()).update(canonical).digest("base64url");
}

function buildLocalUrl(params: LocalParams): string {
  const search = new URLSearchParams({ ...params, sig: signLocal(params) });
  return `${LOCAL_STORAGE_ROUTE}?${search}`;
}

/** Verifica firma y expiración de una URL del storage local. Devuelve los parámetros o null. */
export function verifyLocalUrl(searchParams: URLSearchParams): LocalParams | null {
  const params: LocalParams = {};
  searchParams.forEach((value, key) => {
    if (key !== "sig") params[key] = value;
  });
  const given = Buffer.from(searchParams.get("sig") ?? "");
  const expected = Buffer.from(signLocal(params));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!params.exp || Number(params.exp) < Date.now() / 1000) return null;
  if (!params.key || !FILE_KEY_PATTERN.test(params.key)) return null;
  return params;
}

export function localFilePath(key: string) {
  assertValidKey(key);
  return path.join(LOCAL_ROOT, ...key.split("/"));
}

function createLocalDriver(): StorageDriver {
  const expiresAt = (ttl: number) => String(Math.floor(Date.now() / 1000) + ttl);

  return {
    name: "local",
    async getUploadUrl(key, { contentType, contentLength }) {
      assertValidKey(key);
      const url = buildLocalUrl({
        op: "put",
        key,
        ct: contentType,
        len: String(contentLength),
        exp: expiresAt(UPLOAD_URL_TTL_SECONDS),
      });
      return { url, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async getDownloadUrl(key, { fileName, contentType, disposition }) {
      assertValidKey(key);
      return buildLocalUrl({
        op: "get",
        key,
        ct: contentType,
        name: fileName,
        disp: disposition,
        exp: expiresAt(DOWNLOAD_URL_TTL_SECONDS),
      });
    },
    async deleteFile(key) {
      await rm(localFilePath(key), { force: true });
      await rm(`${localFilePath(key)}.type`, { force: true });
    },
    async getFileInfo(key) {
      try {
        const info = await stat(localFilePath(key));
        const contentType = await readFile(`${localFilePath(key)}.type`, "utf8").catch(() => null);
        return { size: info.size, contentType };
      } catch {
        return null;
      }
    },
    async readFileHead(key, bytes) {
      const handle = await open(localFilePath(key), "r");
      try {
        const buffer = Buffer.alloc(bytes);
        const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },
    async putFile(key, body, contentType) {
      const filePath = localFilePath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      await writeFile(`${filePath}.type`, contentType);
    },
  };
}

// ─── Selección del driver ───────────────────────────────────────────────

const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

let driver: StorageDriver | undefined;

function getDriver(): StorageDriver {
  if (driver) return driver;
  if (R2_VARS.every((name) => process.env[name])) {
    driver = createR2Driver();
  } else if (
    process.env.VERCEL ||
    (process.env.NODE_ENV === "production" && process.env.STORAGE_DRIVER !== "local")
  ) {
    throw new Error(`Storage no configurado: faltan ${R2_VARS.filter((n) => !process.env[n]).join(", ")}`);
  } else {
    driver = createLocalDriver();
  }
  return driver;
}

export const getStorageDriverName = () => getDriver().name;

export const getUploadUrl = (key: string, file: { contentType: string; contentLength: number }) =>
  getDriver().getUploadUrl(key, file);

export const getDownloadUrl = (key: string, options: DownloadOptions) =>
  getDriver().getDownloadUrl(key, options);

export const deleteFile = (key: string) => getDriver().deleteFile(key);

export const getFileInfo = (key: string) => getDriver().getFileInfo(key);

export const readFileHead = (key: string, bytes: number) => getDriver().readFileHead(key, bytes);

export const putFile = (key: string, body: Buffer, contentType: string) =>
  getDriver().putFile(key, body, contentType);
