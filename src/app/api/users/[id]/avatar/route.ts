import { prisma } from "@/lib/prisma";
import { authErrorResponse, authorize } from "@/lib/session";
import { getFileInfo, readFileHead } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Foto de perfil de un usuario. Basta con tener sesión. Se entrega desde el
 * servidor (y no con una URL prefirmada) para que el navegador la guarde en
 * caché: la URL incluye la versión de la foto (?v=), así que nunca queda obsoleta.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/users/[id]/avatar">) {
  try {
    await authorize();
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await ctx.params;
  const user = await prisma.user.findUnique({ where: { id }, select: { avatarKey: true } });
  const info = user?.avatarKey ? await getFileInfo(user.avatarKey) : null;
  if (!user?.avatarKey || !info) {
    return Response.json({ error: "Sin foto de perfil" }, { status: 404 });
  }

  const body = await readFileHead(user.avatarKey, info.size);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
