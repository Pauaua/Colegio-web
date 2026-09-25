import { createApp } from './app';
import { env } from './config/env';
import { resolveInstanceId } from './lib/instance';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const instance = await resolveInstanceId();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, instance, env: env.NODE_ENV }, `Gestor Documental escuchando en el puerto ${env.PORT}`);
  });

  // systemd y el ASG envían SIGTERM: se dejan terminar las solicitudes en curso (deregistration delay de 30 s).
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando el servidor');
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 25_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
