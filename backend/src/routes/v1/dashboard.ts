import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { santiagoYearMonth, startOfSantiagoMonth } from '../../lib/dates';
import { buildDocumentWhere, can, type AuthUser } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { currentUser, requireAuth } from '../../middleware/auth';
import { countPendingAcknowledgements } from '../../services/acknowledgement.service';
import { documentInclude, toApiDocument } from '../../services/documents.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

async function globalSummary() {
  const monthStart = startOfSantiagoMonth();
  const { year } = santiagoYearMonth();
  const active: Prisma.DocumentWhereInput = { isDeleted: false };

  const [totalDocuments, uploadedThisMonth, downloadsThisMonth, ackDocs, byTypeRaw, types, yearDocs, latest, activity] =
    await Promise.all([
      prisma.document.count({ where: active }),
      prisma.document.count({ where: { ...active, createdAt: { gte: monthStart } } }),
      prisma.downloadLog.count({ where: { downloadedAt: { gte: monthStart } } }),
      prisma.document.findMany({
        where: { ...active, status: 'VIGENTE', requiresAcknowledgement: true },
        select: { id: true, visibilities: true, recipients: true, courses: true },
      }),
      prisma.document.groupBy({ by: ['documentTypeId'], where: active, _count: { _all: true } }),
      prisma.documentType.findMany({ orderBy: { id: 'asc' } }),
      prisma.document.findMany({
        where: { ...active, folioYear: year },
        select: { documentDate: true },
      }),
      prisma.document.findMany({ where: active, include: documentInclude, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { id: true, fullName: true, role: true } } },
      }),
    ]);

  const counts = new Map(byTypeRaw.map((r) => [r.documentTypeId, r._count._all]));
  const perMonth = new Array<number>(12).fill(0);
  for (const d of yearDocs) perMonth[d.documentDate.getUTCMonth()]! += 1;

  return {
    scope: 'global' as const,
    kpis: {
      totalDocuments,
      uploadedThisMonth,
      downloadsThisMonth,
      pendingAcknowledgements: await countPendingAcknowledgements(ackDocs),
    },
    byType: types.map((t) => ({ code: t.code, name: t.name, color: t.color, count: counts.get(t.id) ?? 0 })),
    byMonth: MONTHS.map((label, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, label, count: perMonth[i] ?? 0 })),
    latestDocuments: latest.map(toApiDocument),
    recentActivity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      user: a.user,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

async function personalSummary(user: AuthUser) {
  const visible = buildDocumentWhere(user);
  const directedOr: Prisma.DocumentWhereInput[] = [{ recipients: { some: { userId: user.id } } }];
  if (user.role === 'APODERADO') {
    directedOr.push({ courses: { some: { course: { students: { some: { guardians: { some: { guardianId: user.id } } } } } } } });
  }
  const pendingWhere: Prisma.DocumentWhereInput = {
    AND: [
      visible,
      { status: 'VIGENTE', requiresAcknowledgement: true },
      { NOT: { recipients: { some: { userId: user.id, acknowledgedAt: { not: null } } } } },
    ],
  };

  const [totalVisible, recent, directed, pending, pupils] = await Promise.all([
    prisma.document.count({ where: visible }),
    prisma.document.findMany({ where: visible, include: documentInclude, orderBy: { documentDate: 'desc' }, take: 5 }),
    prisma.document.findMany({
      where: { AND: [visible, { OR: directedOr }] },
      include: documentInclude,
      orderBy: { documentDate: 'desc' },
      take: 10,
    }),
    prisma.document.findMany({ where: pendingWhere, include: documentInclude, orderBy: { documentDate: 'desc' } }),
    user.role === 'APODERADO'
      ? prisma.guardianStudent.findMany({ where: { guardianId: user.id }, include: { student: { include: { course: true } } } })
      : Promise.resolve([]),
  ]);

  return {
    scope: 'personal' as const,
    kpis: { totalVisible, directedToMe: directed.length, pendingAcknowledgements: pending.length },
    recentDocuments: recent.map(toApiDocument),
    directedToMe: directed.map(toApiDocument),
    pendingAcknowledgements: pending.map(toApiDocument),
    pupils: pupils.map((p) => ({ id: p.student.id, fullName: p.student.fullName, course: p.student.course.name })),
  };
}

dashboardRouter.get('/summary', async (req, res) => {
  const user = currentUser(req);
  res.json(can(user, 'dashboard:global') ? await globalSummary() : await personalSummary(user));
});
