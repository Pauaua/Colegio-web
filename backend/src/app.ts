import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { compatRouter } from './routes/compat';
import { v1Router } from './routes/v1';
import { serveWebIndex, webStatic } from './routes/web';

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function corsOrigin(): cors.CorsOptions['origin'] {
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.includes('*') ? '*' : origins;
}

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Detrás de CloudFront y del ALB: la IP real del cliente llega en X-Forwarded-For.
  app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      // El ALB atiende por HTTP mientras enable_https = false: forzar https en los recursos rompería la app.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
    }),
  );
  app.use(cors({ origin: corsOrigin() }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          ip: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  // 15 MB para admitir archivos de hasta 10 MB codificados en base64.
  app.use(express.json({ limit: '15mb' }));

  app.use(compatRouter);
  app.use('/api/v1', v1Router);

  // Build web de la app (Expo). Las rutas /panel/* son de la SPA.
  app.use(webStatic);
  app.get('/panel{/*splat}', serveWebIndex);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
