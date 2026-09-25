import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";
import { canAccessPath } from "@/lib/permissions";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/health"];

function isPublicPath(pathname: string) {
  return pathname.startsWith("/api/auth") || PUBLIC_PATHS.includes(pathname);
}

/**
 * Primera barrera: sin sesión no se entra a nada salvo el login, y las secciones
 * restringidas se bloquean según el rol del JWT. No es la única: cada Server
 * Component, Server Action y Route Handler vuelve a verificar sesión, rol
 * (leído de la BD) y visibilidad en el servidor.
 */
export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return;

  const user = request.auth?.user;
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.nextUrl.origin);
    if (pathname !== "/") loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return Response.redirect(loginUrl);
  }

  if (!canAccessPath(user, pathname)) {
    return Response.redirect(new URL("/acceso-denegado", request.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
