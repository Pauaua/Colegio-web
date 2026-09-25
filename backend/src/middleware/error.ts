import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: `Ruta no encontrada: ${req.method} ${req.path}` });
}

// Express reconoce el manejador de errores por sus 4 parámetros.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Datos inválidos',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: err.code, message: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 10 MB' : err.message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'CONFLICT', message: 'Ya existe un registro con esos datos únicos', details: err.meta });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es JSON válido' });
    return;
  }
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: 'BAD_REQUEST', message: (err as Error).message });
    return;
  }
  logger.error({ err, method: req.method, path: req.path }, 'Error no controlado');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
}
