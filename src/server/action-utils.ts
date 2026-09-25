import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, UnauthorizedError } from "@/lib/session";

export type ActionFailure = { ok: false; error: string };

export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | ActionFailure;

/** Convierte errores de autorización en un resultado de acción; relanza el resto. */
export function authFailure(error: unknown): ActionFailure {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return { ok: false, error: error.message };
  }
  throw error;
}

export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Campos únicos que violó un P2002 (la forma de `meta` varía según el driver adapter). */
export function uniqueViolationFields(error: Prisma.PrismaClientKnownRequestError): string {
  return JSON.stringify(error.meta ?? {});
}
