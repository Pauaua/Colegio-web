import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, MemoryStore, type Options } from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Límite de intentos FALLIDOS de login (fuerza bruta), sobre el store de express-rate-limit.
 *
 * No se usa `skipSuccessfulRequests`: ese modo cuenta cada solicitud al entrar y la descuenta al
 * responder, así que muchos logins correctos simultáneos desde una misma IP (JMeter, un colegio
 * detrás de un NAT) superan el límite mientras están en curso, y cada 429 queda contado como fallo.
 * Aquí solo se suma después de verificar que la contraseña es incorrecta, y una solicitud bloqueada
 * no vuelve a sumar.
 *
 *   - IP + usuario: LOGIN_RATE_LIMIT_MAX fallos cada 15 min (20 por defecto).
 *   - IP: 5 veces ese valor, para frenar que se prueben muchos usuarios desde un mismo origen.
 */
const WINDOW_MS = 15 * 60 * 1000;

const store = new MemoryStore();
store.init({ windowMs: WINDOW_MS } as Options);

interface LimitKey {
  key: string;
  limit: number;
}

function limitKeys(req: Request): LimitKey[] {
  const ip = ipKeyGenerator(req.ip ?? 'desconocida');
  const body = req.body as { username?: unknown } | undefined;
  const user = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  return [
    { key: `login:ip-user:${ip}:${user}`, limit: env.LOGIN_RATE_LIMIT_MAX },
    { key: `login:ip:${ip}`, limit: env.LOGIN_RATE_LIMIT_MAX * 5 },
  ];
}

/** Middleware: responde 429 si esa IP (o esa IP con ese usuario) ya agotó sus intentos fallidos. */
export async function rejectIfLoginLocked(req: Request, res: Response, next: NextFunction): Promise<void> {
  for (const { key, limit } of limitKeys(req)) {
    const info = await store.get(key);
    if (info && info.totalHits >= limit) {
      const retryAfter = Math.max(1, Math.ceil(((info.resetTime?.getTime() ?? Date.now() + WINDOW_MS) - Date.now()) / 1000));
      res
        .status(429)
        .set('Retry-After', String(retryAfter))
        .json({ error: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' });
      return;
    }
  }
  next();
}

/** Registra un intento fallido (contraseña o código MFA incorrecto). */
export async function registerFailedLogin(req: Request): Promise<void> {
  await Promise.all(limitKeys(req).map(({ key }) => store.increment(key)));
}

/** Un login correcto limpia los fallos de esa IP con ese usuario. */
export async function clearFailedLogins(req: Request): Promise<void> {
  const [ipUser] = limitKeys(req);
  if (ipUser) await store.resetKey(ipUser.key);
}

/** Solo para pruebas. */
export function resetLoginLimits(): void {
  store.resetAll();
}
