import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Limita los intentos FALLIDOS de login por IP (ventana de 15 min).
 * Los logins correctos no cuentan: así una prueba de carga con usuarios válidos
 * (JMeter, 500 usuarios desde una misma IP) no se bloquea, pero sí un ataque de fuerza bruta.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.' },
});
