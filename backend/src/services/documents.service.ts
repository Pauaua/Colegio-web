import { Prisma, type DocumentStatus, type Role } from '@prisma/client';
import { recordAudit } from '../lib/audit';
import { badRequest } from '../lib/http-error';
import { buildDocumentWhere, isDirective, type AuthUser } from '../lib/permissions';
import { prisma } from '../lib/prisma';

/** Prefijo del folio por tipo de documento (p. ej. ACT-2026-0003). */
const FOLIO_PREFIX: Record<string, string> = {
  MEMO: 'MEM',
  OFICIO: 'OFI',
  CITACION: 'CIT',
  ACUERDO: 'ACU',
  ACTA: 'ACT',
  PERMISO_ADMINISTRATIVO: 'PAD',
};

export const documentInclude = {
  documentType: true,
  author: { select: { id: true, fullName: true, role: true } },
  visibilities: { select: { role: true } },
  recipients: { select: { userId: true, acknowledgedAt: true } },
  courses: { select: { courseId: true } },
} satisfies Prisma.DocumentInclude;

export type DocumentWithRelations = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

/** Convierte "Permiso administrativo", "citación" o "ACTA" al código del tipo. */
export function normalizeTypeCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export async function resolveDocumentType(value: string | number) {
  const type =
    typeof value === 'number'
      ? await prisma.documentType.findUnique({ where: { id: value } })
      : await prisma.documentType.findUnique({ where: { code: normalizeTypeCode(value) } });
  if (!type) throw badRequest(`Tipo de documento desconocido: ${value}`);
  return type;
}

/** Siguiente folio libre para el tipo y año indicados. */
export async function suggestFolio(documentTypeId: number, year: number): Promise<string> {
  const type = await prisma.documentType.findUniqueOrThrow({ where: { id: documentTypeId } });
  const prefix = FOLIO_PREFIX[type.code] ?? type.code.slice(0, 3);
  const last = await prisma.document.findFirst({
    where: { documentTypeId, folioYear: year, folioNumber: { startsWith: `${prefix}-${year}-` } },
    orderBy: { folioNumber: 'desc' },
    select: { folioNumber: true },
  });
  const lastSeq = last ? Number(last.folioNumber.split('-').pop()) || 0 : 0;
  return `${prefix}-${year}-${String(lastSeq + 1).padStart(4, '0')}`;
}

export interface StoredFile {
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface CreateDocumentInput {
  title: string;
  type: string | number;
  documentDate: Date;
  description?: string | null;
  folioNumber?: string | null;
  visibility?: Role[];
  recipientIds?: number[];
  courseIds?: number[];
  requiresAcknowledgement?: boolean;
  file?: StoredFile | null;
}

async function assertRecipientsExist(recipientIds: number[], courseIds: number[]): Promise<void> {
  if (recipientIds.length) {
    const count = await prisma.user.count({ where: { id: { in: recipientIds }, isActive: true } });
    if (count !== recipientIds.length) throw badRequest('Algún destinatario no existe o está desactivado');
  }
  if (courseIds.length) {
    const count = await prisma.course.count({ where: { id: { in: courseIds } } });
    if (count !== courseIds.length) throw badRequest('Algún curso no existe');
  }
}

export async function createDocument(author: AuthUser, input: CreateDocumentInput): Promise<DocumentWithRelations> {
  const type = await resolveDocumentType(input.type);
  const year = input.documentDate.getUTCFullYear();
  // Los directivos siempre ven todo: en la visibilidad solo importan los roles lectores.
  const visibility = [...new Set(input.visibility ?? [])].filter((r) => !isDirective(r));
  const recipientIds = [...new Set(input.recipientIds ?? [])];
  const courseIds = [...new Set(input.courseIds ?? [])];
  await assertRecipientsExist(recipientIds, courseIds);

  const create = (folioNumber: string) =>
    prisma.document.create({
      data: {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        documentTypeId: type.id,
        folioNumber,
        folioYear: year,
        documentDate: input.documentDate,
        authorId: author.id,
        requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        ...(input.file ?? {}),
        visibilities: { create: visibility.map((role) => ({ role })) },
        recipients: { create: recipientIds.map((userId) => ({ userId })) },
        courses: { create: courseIds.map((courseId) => ({ courseId })) },
      },
      include: documentInclude,
    });

  let document: DocumentWithRelations | undefined;
  if (input.folioNumber?.trim()) {
    document = await create(input.folioNumber.trim());
  } else {
    // Con folio automático, si dos subidas simultáneas toman el mismo número se reintenta con el siguiente.
    for (let attempt = 0; attempt < 5 && !document; attempt++) {
      try {
        document = await create(await suggestFolio(type.id, year));
      } catch (err) {
        const isFolioClash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isFolioClash || attempt === 4) throw err;
      }
    }
  }
  if (!document) throw new Error('No se pudo asignar un folio al documento');

  await recordAudit({
    userId: author.id,
    action: 'DOCUMENT_CREATE',
    entity: 'Document',
    entityId: document.id,
    metadata: { title: document.title, type: type.code, folio: document.folioNumber, hasFile: Boolean(input.file) },
  });
  return document;
}

export interface ListDocumentsQuery {
  type?: string;
  from?: Date;
  to?: Date;
  authorId?: number;
  status?: DocumentStatus;
  q?: string;
  page: number;
  pageSize: number;
  sort: 'documentDate' | 'createdAt' | 'title';
  order: 'asc' | 'desc';
}

/** Listado paginado; SIEMPRE parte de buildDocumentWhere(user). */
export async function listDocuments(user: AuthUser, query: ListDocumentsQuery) {
  const filters: Prisma.DocumentWhereInput[] = [buildDocumentWhere(user)];
  if (query.type) filters.push({ documentType: { code: normalizeTypeCode(query.type) } });
  if (query.from || query.to) filters.push({ documentDate: { gte: query.from, lte: query.to } });
  if (query.authorId) filters.push({ authorId: query.authorId });
  if (query.status) filters.push({ status: query.status });
  if (query.q) filters.push({ OR: [{ title: { contains: query.q } }, { folioNumber: { contains: query.q } }] });

  const where: Prisma.DocumentWhereInput = { AND: filters };
  const [total, items] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      include: documentInclude,
      orderBy: [{ [query.sort]: query.order }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, page: query.page, pageSize: query.pageSize, items };
}

const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Representación en español de las rutas de compatibilidad (/documentos), usada por el informe y las pruebas. */
export function toCompatDocument(doc: DocumentWithRelations) {
  return {
    id: doc.id,
    titulo: doc.title,
    tipo: doc.documentType.code,
    tipoNombre: doc.documentType.name,
    fecha: toDateOnly(doc.documentDate),
    folio: doc.folioNumber,
    estado: doc.status,
    descripcion: doc.description,
    autor: { id: doc.author.id, nombre: doc.author.fullName },
    requiereAcuse: doc.requiresAcknowledgement,
    visibilidad: doc.visibilities.map((v) => v.role),
    archivo: doc.fileKey ? { nombre: doc.fileName, mimeType: doc.mimeType, tamano: doc.fileSize } : null,
    creadoEn: doc.createdAt.toISOString(),
  };
}

/** Representación de la API /api/v1. */
export function toApiDocument(doc: DocumentWithRelations) {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    documentType: { id: doc.documentType.id, code: doc.documentType.code, name: doc.documentType.name, color: doc.documentType.color },
    folioNumber: doc.folioNumber,
    documentDate: toDateOnly(doc.documentDate),
    author: doc.author,
    file: doc.fileKey ? { fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize } : null,
    status: doc.status,
    requiresAcknowledgement: doc.requiresAcknowledgement,
    visibility: doc.visibilities.map((v) => v.role),
    recipientIds: doc.recipients.map((r) => r.userId),
    courseIds: doc.courses.map((c) => c.courseId),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
