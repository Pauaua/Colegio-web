import bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { env } from '../config/env';
import { recordAudit } from '../lib/audit';
import { sha256 } from '../lib/crypto';
import { accessTokenTtlSeconds, generateRefreshToken, signAccessToken, signMfaToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type PublicUser = Pick<
  User,
  'id' | 'username' | 'fullName' | 'email' | 'rut' | 'role' | 'phone' | 'isActive' | 'mfaEnabled'
>;

export type LoginResult =
  | { kind: 'success'; user: PublicUser; session: Session }
  | { kind: 'mfa_required'; mfaToken: string }
  | { kind: 'invalid' };

/** Hash de referencia para igualar el tiempo de respuesta cuando el usuario no existe. */
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', env.BCRYPT_ROUNDS);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    rut: user.rut,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
    mfaEnabled: user.mfaEnabled,
  };
}

/** `identifier` acepta el nombre de usuario o el email. */
export async function verifyCredentials(identifier: string, password: string): Promise<User | null> {
  const value = identifier.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: value }, { email: value.toLowerCase() }] },
  });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) return null;
  return user;
}

export async function issueSession(user: Pick<User, 'id' | 'role' | 'username'>): Promise<Session> {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken: signAccessToken(user), refreshToken, expiresIn: accessTokenTtlSeconds() };
}

export async function login(identifier: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const user = await verifyCredentials(identifier, password);
  if (!user) {
    await recordAudit({ action: 'LOGIN_FAILED', entity: 'User', metadata: { username: identifier, ip: meta.ip ?? null } });
    return { kind: 'invalid' };
  }
  if (user.mfaEnabled) {
    await recordAudit({ userId: user.id, action: 'LOGIN_MFA_CHALLENGE', entity: 'User', entityId: user.id });
    return { kind: 'mfa_required', mfaToken: signMfaToken(user.id) };
  }
  const session = await issueSession(user);
  await recordAudit({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, metadata: { ip: meta.ip ?? null } });
  return { kind: 'success', user: toPublicUser(user), session };
}

/**
 * Rota el refresh token: revoca el presentado y emite uno nuevo.
 * Si se presenta un token ya revocado (posible robo), se revocan todas las sesiones del usuario.
 */
export async function rotateRefreshToken(token: string): Promise<{ user: PublicUser; session: Session } | null> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!stored) return null;
  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ userId: stored.userId, action: 'REFRESH_TOKEN_REUSE', entity: 'User', entityId: stored.userId });
    return null;
  }
  if (stored.expiresAt < new Date() || !stored.user.isActive) return null;

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const session = await issueSession(stored.user);
  return { user: toPublicUser(stored.user), session };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
}
