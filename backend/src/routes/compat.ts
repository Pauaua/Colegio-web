/**
 * Rutas de compatibilidad exigidas por el documento técnico, el ALB, Selenium y JMeter:
 *   GET /  ·  POST /login  ·  GET /documentos  ·  POST /documentos  ·  GET /health
 * Sus nombres y contratos no deben cambiar.
 */
import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { getInstanceId } from '../lib/instance';
import { MAX_FILE_SIZE } from '../lib/files';
import { badRequest } from '../lib/http-error';
import { DIRECTIVE_ROLES } from '../lib/permissions';
import { prisma } from '../lib/prisma';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { clearFailedLogins, registerFailedLogin, rejectIfLoginLocked } from '../middleware/rate-limit';
import { login } from '../services/auth.service';
import { createDocument, listDocuments, toCompatDocument, type StoredFile } from '../services/documents.service';
import { decodeBase64, storeFile } from '../services/storage.service';
import { serveWebIndex } from './web';

export const compatRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

// --- GET / : pantalla de acceso de la app web -------------------------------------------------
compatRouter.get('/', serveWebIndex);

// --- POST /login ------------------------------------------------------------------------------
const loginSchema = z.object({
  username: z.string().trim().min(1, 'username es obligatorio'),
  password: z.string().min(1, 'password es obligatorio'),
});

compatRouter.post('/login', rejectIfLoginLocked, async (req, res) => {
  const { username, password } = loginSchema.parse(req.body ?? {});
  const result = await login(username, password, { ip: req.ip, userAgent: req.get('user-agent') });

  if (result.kind === 'invalid') {
    await registerFailedLogin(req);
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' });
    return;
  }
  if (result.kind === 'mfa_required') {
    // Esta ruta no maneja el segundo factor: la app usa /api/v1/auth/login + /api/v1/auth/mfa/verify.
    res.status(401).json({ error: 'MFA_REQUIRED', message: 'El usuario tiene MFA activo; use /api/v1/auth/login', mfaToken: result.mfaToken });
    return;
  }
  await clearFailedLogins(req);
  res.json({ token: result.session.accessToken, refreshToken: result.session.refreshToken, user: result.user });
});

// --- GET /documentos --------------------------------------------------------------------------
const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  tipo: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

compatRouter.get('/documentos', requireAuth, async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const result = await listDocuments(currentUser(req), {
    q: query.q || undefined,
    type: query.tipo || undefined,
    page: query.page,
    pageSize: query.pageSize,
    sort: 'createdAt',
    order: 'desc',
  });
  res.json({ total: result.total, page: result.page, pageSize: result.pageSize, documentos: result.items.map(toCompatDocument) });
});

// --- POST /documentos -------------------------------------------------------------------------
/** Acepta arreglos JSON o listas separadas por coma (formularios multipart). */
const listOrCsv = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v), z.array(item))
    .optional();

const booleanLike = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).optional();

const createSchema = z.object({
  titulo: z.string().trim().min(1, 'titulo es obligatorio').max(200),
  tipo: z.string().trim().min(1, 'tipo es obligatorio'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'fecha debe tener el formato AAAA-MM-DD'),
  descripcion: z.string().max(5000).optional(),
  folio: z.string().trim().max(30).optional(),
  visibilidad: listOrCsv(z.enum(Role)),
  destinatarios: listOrCsv(z.coerce.number().int().positive()),
  cursos: listOrCsv(z.coerce.number().int().positive()),
  requiereAcuse: booleanLike,
  archivo: z
    .object({
      nombre: z.string().trim().min(1),
      mimeType: z.string().trim().min(1),
      base64: z.string().min(1),
    })
    .optional(),
});

export function parseDateOnly(value: string): Date {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw badRequest('fecha inválida');
  return date;
}

compatRouter.post('/documentos', requireAuth, requireRole(...DIRECTIVE_ROLES), upload.single('archivo'), async (req, res) => {
  const body = createSchema.parse(req.body ?? {});

  let file: StoredFile | null = null;
  if (req.file) {
    file = await storeFile(req.file.buffer, req.file.originalname, req.file.mimetype);
  } else if (body.archivo) {
    file = await storeFile(decodeBase64(body.archivo.base64), body.archivo.nombre, body.archivo.mimeType);
  }

  const document = await createDocument(currentUser(req), {
    title: body.titulo,
    type: body.tipo,
    documentDate: parseDateOnly(body.fecha),
    description: body.descripcion,
    folioNumber: body.folio,
    visibility: body.visibilidad,
    recipientIds: body.destinatarios,
    courseIds: body.cursos,
    requiresAcknowledgement: body.requiereAcuse,
    file,
  });
  res.status(201).location(`/api/v1/documents/${document.id}`).json(toCompatDocument(document));
});

// --- GET /health ------------------------------------------------------------------------------
const HEALTH_DB_TIMEOUT_MS = 3000;

compatRouter.get('/health', async (_req, res) => {
  const base = { instance: getInstanceId(), timestamp: new Date().toISOString() };
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), HEALTH_DB_TIMEOUT_MS)),
    ]);
    res.set('Cache-Control', 'no-store').json({ status: 'ok', db: 'ok', ...base });
  } catch {
    res.status(503).set('Cache-Control', 'no-store').json({ status: 'error', db: 'error', ...base });
  }
});
