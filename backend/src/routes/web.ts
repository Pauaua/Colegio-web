import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { env } from '../config/env';

/** Página mínima mientras no exista el build web de la app (`npm run build:web`). */
const FALLBACK_HTML = `<!doctype html>
<html lang="es-CL">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gestor Documental — Chorombo Bajo</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #F7F8FE; color: #3E3B5C;
           display: grid; place-items: center; min-height: 100vh; }
    main { background: #fff; border: 1px solid #E4E1F2; border-radius: 20px; padding: 32px; max-width: 460px; }
    h1 { font-size: 1.3rem; margin-top: 0; }
    code { background: #ECE5F8; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main data-testid="login-screen">
    <h1>Gestor Documental · Escuela Básica G-733 Chorombo Bajo</h1>
    <p>La API está en funcionamiento, pero aún no se ha generado la aplicación web.</p>
    <p>Genérela con <code>npm run build:web</code> y recargue esta página.</p>
    <p>Estado del servicio: <a href="/health">/health</a></p>
  </main>
</body>
</html>`;

const indexPath = () => path.join(env.WEB_DIST_DIR, 'index.html');

/** Entrega el index.html del build web (login en `/` y fallback SPA para `/panel/*`). */
export function serveWebIndex(_req: Request, res: Response): void {
  const index = indexPath();
  if (fs.existsSync(index)) {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
    return;
  }
  res.type('html').send(FALLBACK_HTML);
}

/** Archivos estáticos del build web (`app/dist`). */
export const webStatic = express.static(env.WEB_DIST_DIR, { index: false, maxAge: '1h' });
