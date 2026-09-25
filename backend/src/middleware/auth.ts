import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/http-error';
import type { AuthUser } from '../lib/permissions';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Exige un access token válido y un usuario activo. Deja el usuario en `req.user`. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token) throw unauthorized('Falta el token de acceso (Authorization: Bearer)');

  const payload = verifyAccessToken(token);
  if (!payload) throw unauthorized('Token inválido o expirado');

  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
    select: { id: true, username: true, fullName: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw unauthorized('Usuario inexistente o desactivado');

  req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  next();
}

export function requireRole(...roles: readonly Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Obtiene el usuario autenticado en un handler protegido por requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
