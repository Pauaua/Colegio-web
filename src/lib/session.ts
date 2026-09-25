import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { roleCan, type Action } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
};

/**
 * Usuario de la sesión, confirmado contra la base de datos: si fue desactivado
 * o cambió de rol, se usa el estado actual y no el guardado en el JWT.
 * Se memoiza por request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
});

/** Para Server Components y Server Actions: redirige a /login si no hay sesión válida. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas: exige un permiso de rol; si falta, muestra la página de acceso denegado. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roleCan(user.role, action)) redirect("/acceso-denegado");
  return user;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "No autenticado") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "No tienes permiso para realizar esta acción") {
    super(message);
  }
}

/**
 * Para Server Actions y Route Handlers: devuelve el usuario o lanza
 * UnauthorizedError / ForbiddenError (nunca redirige).
 */
export async function authorize(action?: Action): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (action && !roleCan(user.role, action)) throw new ForbiddenError();
  return user;
}

/** Convierte los errores de autorización en respuestas JSON 401/403 para Route Handlers. */
export function authErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
