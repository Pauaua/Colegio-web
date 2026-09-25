import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { CITATION_TYPE_CODE } from "@/lib/citations";
import { DOCUMENTS_PAGE_SIZE, type DocumentFilters, type DocumentSortField } from "@/lib/document-filters";
import { buildDocumentWhere, canViewDocument, roleCan, type DocumentForPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";

/** Relaciones mínimas para evaluar permisos sobre un documento. */
export const permissionInclude = {
  documentType: { select: { code: true } },
  visibility: { select: { role: true } },
  recipients: { select: { userId: true } },
} satisfies Prisma.DocumentInclude;

type WithPermissionRelations = {
  authorId: string;
  isDeleted: boolean;
  documentType: { code: string };
  visibility: { role: DocumentForPermission["visibility"][number] }[];
  recipients: { userId: string }[];
};

export function toPermissionDocument(doc: WithPermissionRelations): DocumentForPermission {
  return {
    authorId: doc.authorId,
    isDeleted: doc.isDeleted,
    isCitation: doc.documentType.code === CITATION_TYPE_CODE,
    visibility: doc.visibility.map((v) => v.role),
    recipientIds: doc.recipients.map((r) => r.userId),
  };
}

/**
 * Documento para un Route Handler de archivo (descarga / vista previa).
 * Distingue "no existe" de "sin permiso" para responder 404 o 403.
 */
export async function getDocumentFileAccess(documentId: string, user: CurrentUser) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileKey: true,
      fileName: true,
      mimeType: true,
      authorId: true,
      isDeleted: true,
      ...permissionInclude,
    },
  });
  if (!doc || doc.isDeleted) return { status: "not-found" as const };
  if (!canViewDocument(user, toPermissionDocument(doc))) return { status: "forbidden" as const };
  return { status: "ok" as const, document: doc };
}

export async function getDocumentTypes() {
  return prisma.documentType.findMany({ orderBy: { name: "asc" } });
}

/** Siguiente folio libre para un tipo y año. */
export async function getNextFolio(documentTypeId: string, year: number) {
  const last = await prisma.document.aggregate({
    where: { documentTypeId, folioYear: year },
    _max: { folioNumber: true },
  });
  return (last._max.folioNumber ?? 0) + 1;
}

// ─── Listado ────────────────────────────────────────────────────────────

const SORT_ORDER: Record<
  DocumentSortField,
  (dir: Prisma.SortOrder) => Prisma.DocumentOrderByWithRelationInput[]
> = {
  title: (dir) => [{ title: dir }],
  type: (dir) => [{ documentType: { name: dir } }],
  folio: (dir) => [{ folioYear: dir }, { folioNumber: dir }],
  date: (dir) => [{ documentDate: dir }],
  author: (dir) => [{ author: { fullName: dir } }],
  status: (dir) => [{ status: dir }],
};

function filtersToWhere(filters: DocumentFilters): Prisma.DocumentWhereInput[] {
  const conditions: Prisma.DocumentWhereInput[] = [];

  if (filters.q) {
    const search: Prisma.DocumentWhereInput[] = [{ title: { contains: filters.q, mode: "insensitive" } }];
    // Folio: "12" o "12/2026"
    const folio = filters.q.match(/^(?:n[°º]?\s*)?(\d{1,6})(?:\s*\/\s*(\d{4}))?$/i);
    if (folio) {
      search.push({
        folioNumber: Number(folio[1]),
        ...(folio[2] ? { folioYear: Number(folio[2]) } : {}),
      });
    }
    conditions.push({ OR: search });
  }
  if (filters.type) conditions.push({ documentTypeId: filters.type });
  if (filters.author) conditions.push({ authorId: filters.author });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.from) conditions.push({ documentDate: { gte: new Date(`${filters.from}T00:00:00.000Z`) } });
  if (filters.to) conditions.push({ documentDate: { lte: new Date(`${filters.to}T00:00:00.000Z`) } });

  return conditions;
}

export type DocumentListRow = {
  id: string;
  title: string;
  folio: string;
  typeName: string;
  typeColor: string;
  documentDate: string;
  authorName: string;
  status: "VIGENTE" | "ARCHIVADO";
  mimeType: string;
  requiresAcknowledgement: boolean;
};

export async function listDocuments(user: CurrentUser, filters: DocumentFilters) {
  // buildDocumentWhere SIEMPRE va primero: los filtros solo pueden restringir más.
  const where: Prisma.DocumentWhereInput = {
    AND: [buildDocumentWhere(user), ...filtersToWhere(filters)],
  };

  const [total, documents] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: [...SORT_ORDER[filters.sort](filters.dir), { createdAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * DOCUMENTS_PAGE_SIZE,
      take: DOCUMENTS_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        folioNumber: true,
        folioYear: true,
        documentDate: true,
        status: true,
        mimeType: true,
        requiresAcknowledgement: true,
        documentType: { select: { name: true, color: true } },
        author: { select: { fullName: true } },
      },
    }),
  ]);

  const rows: DocumentListRow[] = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    folio: `${doc.folioNumber}/${doc.folioYear}`,
    typeName: doc.documentType.name,
    typeColor: doc.documentType.color,
    documentDate: doc.documentDate.toISOString(),
    authorName: doc.author.fullName,
    status: doc.status,
    mimeType: doc.mimeType,
    requiresAcknowledgement: doc.requiresAcknowledgement,
  }));

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE)) };
}

/** Autores disponibles para el filtro (quienes pueden crear documentos o citaciones). */
export async function getDocumentAuthors() {
  return prisma.user.findMany({
    where: { role: { in: ["DIRECTOR", "EQUIPO_DIRECTIVO", "DOCENTE"] } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

// ─── Detalle ────────────────────────────────────────────────────────────

/**
 * Detalle de un documento si `user` puede verlo; null si no existe o no tiene acceso
 * (la página responde 404 en ambos casos para no revelar que existe).
 * La actividad (descargas y lecturas de todos) solo se incluye para directivos.
 */
export async function getDocumentDetail(documentId: string, user: CurrentUser) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      documentType: true,
      author: { select: { id: true, fullName: true } },
      visibility: { select: { role: true } },
      recipients: {
        select: {
          userId: true,
          acknowledgedAt: true,
          user: { select: { fullName: true, role: true } },
        },
        orderBy: { user: { fullName: "asc" } },
      },
      courses: { select: { course: { select: { name: true, year: true } } } },
    },
  });
  if (!doc || !canViewDocument(user, toPermissionDocument(doc))) return null;

  const canSeeActivity = roleCan(user.role, "document:viewActivity");
  const downloads = canSeeActivity
    ? await prisma.downloadLog.findMany({
        where: { documentId },
        orderBy: { downloadedAt: "desc" },
        take: 100,
        select: { id: true, downloadedAt: true, user: { select: { fullName: true, role: true } } },
      })
    : [];

  const myRecipient = doc.recipients.find((r) => r.userId === user.id);

  return {
    document: doc,
    permission: toPermissionDocument(doc),
    // Los no directivos no ven la lista de otros destinatarios.
    recipients: canSeeActivity ? doc.recipients : [],
    myRecipient: myRecipient ? { acknowledgedAt: myRecipient.acknowledgedAt } : null,
    downloads,
    canSeeActivity,
  };
}

/** Cursos para dirigir un documento, con cuántos apoderados recibirían el documento. */
export async function getCourseOptions() {
  const courses = await prisma.course.findMany({
    orderBy: [{ year: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      year: true,
      students: { select: { _count: { select: { guardians: true } } } },
    },
  });
  return courses.map((course) => ({
    id: course.id,
    name: `${course.name} ${course.year}`,
    guardianCount: course.students.reduce((sum, s) => sum + s._count.guardians, 0),
  }));
}

// ─── Mis documentos ─────────────────────────────────────────────────────

export type InboxFilter = "todos" | "pendientes" | "leidos";

/** Documentos dirigidos a `user` (como destinatario directo o por curso de sus pupilos). */
export async function getInbox(user: CurrentUser, filter: InboxFilter) {
  const base: Prisma.DocumentRecipientWhereInput = { userId: user.id, document: { isDeleted: false } };
  const pendingWhere: Prisma.DocumentRecipientWhereInput = {
    ...base,
    acknowledgedAt: null,
  };
  const where =
    filter === "pendientes"
      ? pendingWhere
      : filter === "leidos"
        ? { ...base, acknowledgedAt: { not: null } }
        : base;

  const [items, counts] = await Promise.all([
    prisma.documentRecipient.findMany({
      where,
      orderBy: [{ acknowledgedAt: { sort: "asc", nulls: "first" } }, { document: { documentDate: "desc" } }],
      select: {
        acknowledgedAt: true,
        document: {
          select: {
            id: true,
            title: true,
            description: true,
            folioNumber: true,
            folioYear: true,
            documentDate: true,
            requiresAcknowledgement: true,
            status: true,
            documentType: { select: { name: true, color: true } },
            author: { select: { fullName: true } },
            courses: { select: { course: { select: { name: true } } } },
          },
        },
      },
    }),
    Promise.all([
      prisma.documentRecipient.count({ where: base }),
      prisma.documentRecipient.count({ where: pendingWhere }),
    ]),
  ]);

  return { items, total: counts[0], pending: counts[1] };
}
