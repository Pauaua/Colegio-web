import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rate-limit";
import { authErrorResponse, authorize } from "@/lib/session";
import { getDownloadUrl } from "@/lib/storage";
import { getDocumentFileAccess } from "@/server/queries/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Única puerta de descarga: verifica sesión, rol y visibilidad, registra el
 * DownloadLog y recién entonces redirige a una URL firmada de 5 minutos.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/download">) {
  let user;
  try {
    user = await authorize();
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await ctx.params;
  const access = await getDocumentFileAccess(id, user);
  if (access.status === "not-found") {
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: "No tienes permiso para descargar este documento" }, { status: 403 });
  }

  const { document } = access;
  await prisma.downloadLog.create({
    data: {
      documentId: document.id,
      userId: user.id,
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const url = await getDownloadUrl(document.fileKey, {
    fileName: document.fileName,
    contentType: document.mimeType,
    disposition: "attachment",
  });
  return Response.redirect(new URL(url, request.url), 302);
}
