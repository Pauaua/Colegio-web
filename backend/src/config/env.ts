import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

/** Trata las variables definidas pero vacías (`FOO=`) como no definidas. */
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  LOG_LEVEL: z.string().default('info'),
  LOG_FILE: optionalString,

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  MFA_ENCRYPTION_KEY: optionalString,
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  S3_BUCKET: z.string().min(1, 'S3_BUCKET es obligatoria'),
  AWS_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: optionalString,
  S3_PUBLIC_ENDPOINT: optionalString,

  CORS_ORIGINS: z.string().default('*'),
  WEB_DIST_DIR: optionalString,
  TRUST_PROXY: z.string().default('loopback, linklocal, uniquelocal'),
  INSTANCE_ID: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // El logger depende de env, por eso aquí se usa la consola.
  // eslint-disable-next-line no-console
  console.error(`Configuración inválida:\n${detail}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  WEB_DIST_DIR: parsed.data.WEB_DIST_DIR ?? path.resolve(process.cwd(), '../app/dist'),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
