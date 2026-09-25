import { isPreviewable } from "@/lib/files";
import { authErrorResponse, authorize } from "@/lib/session";
import { getDownloadUrl } from "@/lib/storage";
import { getDocumentFileAccess } from "@/server/queries/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vista previa embebida (PDF o imagen). Exige los mismos permisos que la
 * descarga, pero no registra un DownloadLog: abrir el detalle no es descargar.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/preview">) {
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
    return Response.json({ error: "No tienes permiso para ver este documento" }, { status: 403 });
  }
  if (!isPreviewable(access.document.mimeType)) {
    return Response.json({ error: "Este tipo de archivo no tiene vista previa" }, { status: 415 });
  }

  const url = await getDownloadUrl(access.document.fileKey, {
    fileName: access.document.fileName,
    contentType: access.document.mimeType,
    disposition: "inline",
  });
  return Response.redirect(new URL(url, request.url), 302);
}
