/**
 * Servidor del driver de storage "local" (solo desarrollo). Emula las URLs
 * prefirmadas de S3/R2: la firma HMAC de la URL es la autorización.
 */
import { readFile } from "node:fs/promises";

import {
  contentDisposition,
  getStorageDriverName,
  localFilePath,
  putFile,
  verifyLocalUrl,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localDriverEnabled() {
  try {
    return getStorageDriverName() === "local";
  } catch {
    return false;
  }
}

export async function PUT(request: Request) {
  if (!localDriverEnabled()) return new Response(null, { status: 404 });

  const params = verifyLocalUrl(new URL(request.url).searchParams);
  if (!params || params.op !== "put") return new Response("Firma inválida o expirada", { status: 403 });

  if (request.headers.get("content-type") !== params.ct) {
    return new Response("Content-Type no coincide con la firma", { status: 403 });
  }
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length !== Number(params.len)) {
    return new Response("Tamaño no coincide con la firma", { status: 403 });
  }

  await putFile(params.key, body, params.ct);
  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  if (!localDriverEnabled()) return new Response(null, { status: 404 });

  const params = verifyLocalUrl(new URL(request.url).searchParams);
  if (!params || params.op !== "get") return new Response("Firma inválida o expirada", { status: 403 });

  const body = await readFile(localFilePath(params.key)).catch(() => null);
  if (!body) return new Response("Archivo no encontrado", { status: 404 });

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": params.ct,
      "Content-Length": String(body.length),
      "Content-Disposition": contentDisposition({
        fileName: params.name,
        disposition: params.disp === "inline" ? "inline" : "attachment",
      }),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
