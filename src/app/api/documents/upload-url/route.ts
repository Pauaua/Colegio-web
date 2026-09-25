import { randomUUID } from "node:crypto";

import { buildFileKey } from "@/lib/files";
import { authErrorResponse, authorize } from "@/lib/session";
import { getUploadUrl } from "@/lib/storage";
import { uploadUrlRequestSchema } from "@/lib/validations/document";

export const runtime = "nodejs";

/**
 * Entrega una URL prefirmada (PUT) para subir el archivo directamente desde
 * el navegador al storage. Solo para roles que pueden crear documentos.
 */
export async function POST(request: Request) {
  try {
    await authorize("document:create");
  } catch (error) {
    return authErrorResponse(error);
  }

  const body = await request.json().catch(() => null);
  const parsed = uploadUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Archivo inválido" }, { status: 400 });
  }

  const { fileName, mimeType, fileSize } = parsed.data;
  const fileKey = buildFileKey(fileName, randomUUID(), new Date().getFullYear());
  const upload = await getUploadUrl(fileKey, { contentType: mimeType, contentLength: fileSize });

  return Response.json({ fileKey, upload });
}
