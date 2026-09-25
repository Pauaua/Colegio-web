import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  username: string;
  typ: 'access';
}

export interface MfaTokenPayload {
  sub: string;
  typ: 'mfa';
}

type ExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

const ISSUER = 'gestor-documental';

export function signAccessToken(user: { id: number; role: Role; username: string }): string {
  const payload: AccessTokenPayload = { sub: String(user.id), role: user.role, username: user.username, typ: 'access' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL as ExpiresIn, issuer: ISSUER });
}

/** Token temporal (5 min) entre el paso de contraseña y el del código TOTP. */
export function signMfaToken(userId: number): string {
  const payload: MfaTokenPayload = { sub: String(userId), typ: 'mfa' };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '5m', issuer: ISSUER });
}

function verify<T extends { typ: string }>(token: string, typ: T['typ']): T | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
    if (typeof decoded === 'object' && decoded !== null && (decoded as { typ?: string }).typ === typ) {
      return decoded as unknown as T;
    }
    return null;
  } catch {
    return null;
  }
}

export const verifyAccessToken = (token: string) => verify<AccessTokenPayload>(token, 'access');
export const verifyMfaToken = (token: string) => verify<MfaTokenPayload>(token, 'mfa');

/** Segundos de vida del access token, derivados de JWT_ACCESS_TTL (se informan al cliente). */
export function accessTokenTtlSeconds(): number {
  const decoded = jwt.decode(jwt.sign({}, 'x', { expiresIn: env.JWT_ACCESS_TTL as ExpiresIn })) as { iat: number; exp: number };
  return decoded.exp - decoded.iat;
}

/** Refresh token opaco (no JWT): se guarda solo su hash y se puede revocar. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}
