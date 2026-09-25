import type { Role } from '@prisma/client';
import { READER_ROLES } from '../lib/permissions';
import { prisma } from '../lib/prisma';

/** Datos mínimos de un documento para calcular su audiencia. */
export interface AudienceSource {
  id: number;
  visibilities: { role: Role }[];
  recipients: { userId: number; acknowledgedAt: Date | null }[];
  courses: { courseId: number }[];
}

export interface AudienceMember {
  userId: number;
  fullName: string;
  role: Role;
  acknowledgedAt: Date | null;
}

/**
 * Carga una sola vez los lectores activos y los apoderados por curso.
 * La escuela es pequeña (208 estudiantes), así que el cálculo en memoria es barato y exacto.
 */
async function loadAudienceContext() {
  const readers = await prisma.user.findMany({
    where: { isActive: true, role: { in: [...READER_ROLES] } },
    select: { id: true, fullName: true, role: true, guardianOf: { select: { student: { select: { courseId: true } } } } },
  });
  const byId = new Map(readers.map((u) => [u.id, u]));
  const guardiansByCourse = new Map<number, Set<number>>();
  for (const u of readers) {
    for (const link of u.guardianOf) {
      const set = guardiansByCourse.get(link.student.courseId) ?? new Set<number>();
      set.add(u.id);
      guardiansByCourse.set(link.student.courseId, set);
    }
  }
  return { readers, byId, guardiansByCourse };
}

type AudienceContext = Awaited<ReturnType<typeof loadAudienceContext>>;

/**
 * Lectores que deben poder ver (y, si corresponde, confirmar) el documento:
 * destinatarios específicos + usuarios de los roles con visibilidad + apoderados de los cursos indicados.
 */
function audienceFor(doc: AudienceSource, ctx: AudienceContext): AudienceMember[] {
  const ids = new Set<number>();
  for (const r of doc.recipients) if (ctx.byId.has(r.userId)) ids.add(r.userId);
  const roles = new Set(doc.visibilities.map((v) => v.role));
  for (const u of ctx.readers) if (roles.has(u.role)) ids.add(u.id);
  for (const c of doc.courses) for (const id of ctx.guardiansByCourse.get(c.courseId) ?? []) ids.add(id);

  const acks = new Map(doc.recipients.map((r) => [r.userId, r.acknowledgedAt]));
  return [...ids].map((id) => {
    const u = ctx.byId.get(id)!;
    return { userId: id, fullName: u.fullName, role: u.role, acknowledgedAt: acks.get(id) ?? null };
  });
}

export async function getAudience(doc: AudienceSource): Promise<AudienceMember[]> {
  return audienceFor(doc, await loadAudienceContext());
}

/** Total de acuses pendientes entre varios documentos. */
export async function countPendingAcknowledgements(docs: AudienceSource[]): Promise<number> {
  if (docs.length === 0) return 0;
  const ctx = await loadAudienceContext();
  return docs.reduce((sum, doc) => sum + audienceFor(doc, ctx).filter((m) => !m.acknowledgedAt).length, 0);
}
