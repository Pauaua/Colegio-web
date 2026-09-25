import "server-only";

import { TZDate } from "@date-fns/tz";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { AuditAction } from "@/generated/prisma/enums";
import { APP_TIME_ZONE } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const AUDIT_PAGE_SIZE = 20;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const isoDate = z.preprocess((v) => {
  const value = first(v);
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}, z.string().optional());

export const auditFiltersSchema = z.object({
  tab: z.preprocess(first, z.enum(["descargas", "acciones"]).catch("descargas")),
  q: z.preprocess(first, z.string().trim().max(100).optional().catch(undefined)),
  accion: z.preprocess(
    first,
    z
      .enum(Object.values(AuditAction) as [AuditAction, ...AuditAction[]])
      .optional()
      .catch(undefined),
  ),
  desde: isoDate,
  hasta: isoDate,
  page: z.preprocess(first, z.coerce.number().int().min(1).max(10_000).catch(1)),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export function auditFiltersToSearch(filters: Partial<AuditFilters>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (key === "page" && value === 1)) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Medianoche de "yyyy-MM-dd" en hora de Chile (respeta el horario de verano). */
function santiagoMidnight(isoDate: string, addDays = 0) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(new TZDate(year, month - 1, day + addDays, APP_TIME_ZONE).getTime());
}

/** Rango [desde 00:00, hasta 24:00) en hora de Chile. */
function dateRange(desde?: string, hasta?: string) {
  if (!desde && !hasta) return undefined;
  return {
    ...(desde ? { gte: santiagoMidnight(desde) } : {}),
    ...(hasta ? { lt: santiagoMidnight(hasta, 1) } : {}),
  };
}

export async function getDownloadLogs(filters: AuditFilters) {
  const range = dateRange(filters.desde, filters.hasta);
  const where: Prisma.DownloadLogWhereInput = {
    ...(filters.q
      ? {
          OR: [
            { user: { fullName: { contains: filters.q, mode: "insensitive" } } },
            { document: { title: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(range ? { downloadedAt: range } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.downloadLog.count({ where }),
    prisma.downloadLog.findMany({
      where,
      orderBy: { downloadedAt: "desc" },
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        downloadedAt: true,
        ipAddress: true,
        user: { select: { fullName: true, role: true } },
        document: { select: { id: true, title: true, isDeleted: true } },
      },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

export async function getAuditLogs(filters: AuditFilters) {
  const range = dateRange(filters.desde, filters.hasta);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.accion ? { action: filters.accion } : {}),
    ...(filters.q ? { user: { fullName: { contains: filters.q, mode: "insensitive" } } } : {}),
    ...(range ? { createdAt: range } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { fullName: true, role: true } },
      },
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}
