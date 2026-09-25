import pino from 'pino';
import { env } from '../config/env';

function buildDestination(): pino.DestinationStream | undefined {
  if (!env.LOG_FILE) return undefined;
  try {
    return pino.destination({ dest: env.LOG_FILE, mkdir: true, sync: false });
  } catch {
    // Si no se puede escribir el archivo (p. ej. permisos), se registra en stdout.
    return undefined;
  }
}

/** Logs JSON; en EC2 se escriben en /var/log/gestor-documental/app.log y CloudWatch Agent los envía. */
export const logger = pino(
  {
    level: env.isTest ? 'silent' : env.LOG_LEVEL,
    base: { service: 'gestor-documental' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.mfaSecret'],
      censor: '[REDACTED]',
    },
  },
  buildDestination(),
);
