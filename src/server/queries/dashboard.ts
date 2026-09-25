import "server-only";

import { TZDate } from "@date-fns/tz";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { APP_TIME_ZONE } from "@/lib/dates";
import { buildDocumentWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";

function startOfCurrentMonth() {
  return new Date(startOfMonth(TZDate.tz(APP_TIME_ZONE)).getTime());
}

const documentCardSelect = {
  id: true,
  title: true,
  folioNumber: true,
  folioYear: true,
  documentDate: true,
  createdAt: true,
  status: true,
  requiresAcknowledgement: true,
  documentType: { select: { name: true, color: true } },
  author: { select: { fullName: true } },
} as const;

// ─── Directivos ─────────────────────────────────────────────────────────

export async function getManagementDashboard() {
  const monthStart = startOfCurrentMonth();
  const chartStart = new Date(startOfMonth(subMonths(TZDate.tz(APP_TIME_ZONE), 11)).getTime());
  const active = { isDeleted: false };

  const [
    totalDocuments,
    uploadedThisMonth,
    downloadsThisMonth,
    pendingCitations,
    types,
    countsByType,
    monthly,
    latestDocuments,
    recentActivity,
  ] = await Promise.all([
    prisma.document.count({ where: active }),
    prisma.document.count({ where: { ...active, createdAt: { gte: monthStart } } }),
    prisma.downloadLog.count({ where: { downloadedAt: { gte: monthStart } } }),
    prisma.documentRecipient.count({
      where: {
        acknowledgedAt: null,
        document: {
          ...active,
          status: "VIGENTE",
          requiresAcknowledgement: true,
          documentType: { code: "CITACION" },
        },
      },
    }),
    prisma.documentType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.document.groupBy({ by: ["documentTypeId"], where: active, _count: { _all: true } }),
    prisma.$queryRaw<{ month: string; count: number }[]>`
      SELECT to_char(date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE}), 'YYYY-MM') AS month,
             count(*)::int AS count
      FROM "Document"
      WHERE "isDeleted" = false AND "createdAt" >= ${chartStart}
      GROUP BY 1
      ORDER BY 1`,
    prisma.document.findMany({
      where: active,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: documentCardSelect,
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      where: { action: { not: "LOGIN" } },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    }),
  ]);

  const countByType = new Map(countsByType.map((c) => [c.documentTypeId, c._count._all]));
  const byType = types.map((t) => ({ name: t.name, color: t.color, count: countByType.get(t.id) ?? 0 }));

  const countByMonth = new Map(monthly.map((m) => [m.month, m.count]));
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(new TZDate(chartStart, APP_TIME_ZONE), i);
    const key = format(month, "yyyy-MM");
    return {
      key,
      label: format(month, "MMM", { locale: es }).replace(".", ""),
      fullLabel: format(month, "MMMM yyyy", { locale: es }),
      count: countByMonth.get(key) ?? 0,
    };
  });

  return {
    kpis: { totalDocuments, uploadedThisMonth, downloadsThisMonth, pendingCitations },
    byType,
    byMonth,
    latestDocuments,
    recentActivity,
  };
}

// ─── Docentes y apoderados ──────────────────────────────────────────────

export async function getCommunityDashboard(user: CurrentUser) {
  const visibleWhere = buildDocumentWhere(user);

  const [visibleCount, recentForRole, addressed, pupils] = await Promise.all([
    prisma.document.count({ where: visibleWhere }),
    prisma.document.findMany({
      where: { isDeleted: false, status: "VIGENTE", visibility: { some: { role: user.role } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: documentCardSelect,
    }),
    prisma.documentRecipient.findMany({
      where: { userId: user.id, document: { isDeleted: false } },
      orderBy: { document: { createdAt: "desc" } },
      select: { acknowledgedAt: true, document: { select: documentCardSelect } },
    }),
    user.role === "APODERADO"
      ? prisma.guardianStudent.findMany({
          where: { guardianId: user.id },
          select: { student: { select: { fullName: true, course: { select: { name: true } } } } },
          orderBy: { student: { fullName: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  const pending = addressed.filter((r) => r.document.requiresAcknowledgement && !r.acknowledgedAt);

  return {
    kpis: { visibleCount, addressedCount: addressed.length, pendingCount: pending.length },
    pending: pending.map((r) => r.document),
    addressed: addressed.slice(0, 5).map((r) => ({ ...r.document, acknowledgedAt: r.acknowledgedAt })),
    recentForRole,
    pupils: pupils.map((p) => p.student),
  };
}
