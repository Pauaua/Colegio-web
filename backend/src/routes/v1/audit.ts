import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DIRECTIVE_ROLES } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { dateOnly, pageQuery } from '../../lib/validation';
import { requireAuth, requireRole } from '../../middleware/auth';

/** Auditoría de acciones y de descargas. Solo directivos. */
export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole(...DIRECTIVE_ROLES));

/** `to` incluye el día completo. */
const range = (from?: Date, to?: Date) =>
  from || to ? { gte: from, lt: to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : undefined } : undefined;

const actionsQuery = z.object({
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(60).optional(),
  userId: z.coerce.number().int().positive().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  ...pageQuery,
});

auditRouter.get('/', async (req, res) => {
  const q = actionsQuery.parse(req.query);
  const where: Prisma.AuditLogWhereInput = {
    action: q.action || undefined,
    entity: q.entity || undefined,
    userId: q.userId,
    createdAt: range(q.from, q.to),
  };
  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { user: { select: { id: true, fullName: true, role: true } } },
    }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: items.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
});

/** Acciones distintas registradas, para el filtro de la pantalla de auditoría. */
auditRouter.get('/actions', async (_req, res) => {
  const rows = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
  res.json(rows.map((r) => r.action));
});

const downloadsQuery = z.object({
  documentId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  ...pageQuery,
});

auditRouter.get('/downloads', async (req, res) => {
  const q = downloadsQuery.parse(req.query);
  const where: Prisma.DownloadLogWhereInput = { documentId: q.documentId, userId: q.userId, downloadedAt: range(q.from, q.to) };
  const [total, items] = await prisma.$transaction([
    prisma.downloadLog.count({ where }),
    prisma.downloadLog.findMany({
      where,
      orderBy: { downloadedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        document: { select: { id: true, title: true, folioNumber: true } },
      },
    }),
  ]);
  res.json({
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: items.map((d) => ({ ...d, downloadedAt: d.downloadedAt.toISOString() })),
  });
});
