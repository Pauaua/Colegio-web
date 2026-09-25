import { Router, type Request } from 'express';
import { DocumentStatus } from '@prisma/client';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { buildFileKey, isAllowedMimeType, MAX_FILE_SIZE } from '../../lib/files';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { can, DIRECTIVE_ROLES, READER_ROLES } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { DOCUMENTS_PREFIX, DOWNLOAD_URL_TTL_SECONDS, headObject, presignDownload, presignUpload, UPLOAD_URL_TTL_SECONDS } from '../../lib/s3';
import { dateOnly, idList, idParam, pageQuery, roleSchema } from '../../lib/validation';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { getAudience } from '../../services/acknowledgement.service';
import {
  createDocument,
  getDocumentForUser,
  listDocuments,
  resolveDocumentType,
  setArchived,
  softDeleteDocument,
  suggestFolio,
  toApiDocument,
  updateDocument,
  type StoredFile,
} from '../../services/documents.service';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const requireDirective = requireRole(...DIRECTIVE_ROLES);

const requestMeta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 255) ?? null });

// --- Listado ----------------------------------------------------------------------------------
const listSchema = z.object({
  type: z.string().trim().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  authorId: z.coerce.number().int().positive().optional(),
  status: z.enum(DocumentStatus).optional(),
  q: z.string().trim().max(100).optional(),
  scope: z.enum(['all', 'mine']).default('all'),
  ...pageQuery,
  sort: z.enum(['documentDate', 'createdAt', 'title']).default('documentDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

documentsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const query = listSchema.parse(req.query);
  const result = await listDocuments(user, { ...query, q: query.q || undefined, type: query.type || undefined });

  // Para los lectores se indica si ya confirmaron la lectura.
  res.json({
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    items: result.items.map((doc) => ({
      ...toApiDocument(doc),
      myAcknowledgedAt: doc.recipients.find((r) => r.userId === user.id)?.acknowledgedAt?.toISOString() ?? null,
    })),
  });
});

// --- Folio sugerido ---------------------------------------------------------------------------
const nextFolioSchema = z.object({ type: z.string().trim().min(1), date: dateOnly.optional() });

documentsRouter.get('/next-folio', requireDirective, async (req, res) => {
  const { type, date } = nextFolioSchema.parse(req.query);
  const docType = await resolveDocumentType(/^\d+$/.test(type) ? Number(type) : type);
  const year = (date ?? new Date()).getUTCFullYear();
  res.json({ folioNumber: await suggestFolio(docType.id, year), year });
});

// --- Subida: URL firmada PUT ------------------------------------------------------------------
const uploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1),
  fileSize: z.coerce.number().int().positive(),
});

documentsRouter.post('/upload-url', requireDirective, async (req, res) => {
  const { fileName, mimeType, fileSize } = uploadUrlSchema.parse(req.body ?? {});
  if (!isAllowedMimeType(mimeType)) throw badRequest('Tipo de archivo no permitido (solo PDF, DOCX, JPG o PNG)');
  if (fileSize > MAX_FILE_SIZE) throw badRequest('El archivo supera el máximo de 10 MB');

  const fileKey = buildFileKey(fileName);
  const uploadUrl = await presignUpload(fileKey, mimeType);
  res.json({ uploadUrl, fileKey, expiresIn: UPLOAD_URL_TTL_SECONDS, headers: { 'Content-Type': mimeType } });
});

// --- Registro de metadatos ---------------------------------------------------------------------
const fileSchema = z.object({
  fileKey: z.string().startsWith(DOCUMENTS_PREFIX, 'fileKey inválido').max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1),
});

const documentBody = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  description: z.string().max(5000).nullish(),
  documentTypeId: z.coerce.number().int().positive().optional(),
  typeCode: z.string().trim().optional(),
  documentDate: dateOnly,
  folioNumber: z.string().trim().max(30).nullish(),
  visibility: z.array(roleSchema).default([]),
  recipientIds: idList.default([]),
  courseIds: idList.default([]),
  requiresAcknowledgement: z.boolean().default(false),
  file: fileSchema.nullish(),
});

/** Confirma que el archivo subido con la URL firmada existe en S3 y cumple las restricciones. */
async function verifyUploadedFile(file: z.infer<typeof fileSchema>): Promise<StoredFile> {
  if (!isAllowedMimeType(file.mimeType)) throw badRequest('Tipo de archivo no permitido');
  const head = await headObject(file.fileKey);
  if (!head) throw badRequest('El archivo no se encuentra en el almacenamiento; súbalo antes de registrar el documento');
  if (head.size > MAX_FILE_SIZE) throw badRequest('El archivo supera el máximo de 10 MB');
  return { fileKey: file.fileKey, fileName: file.fileName, mimeType: file.mimeType, fileSize: head.size };
}

documentsRouter.post('/', requireDirective, async (req, res) => {
  const body = documentBody.parse(req.body ?? {});
  const type = body.documentTypeId ?? body.typeCode;
  if (type === undefined) throw badRequest('Indique documentTypeId o typeCode');

  const doc = await createDocument(currentUser(req), {
    title: body.title,
    type,
    documentDate: body.documentDate,
    description: body.description,
    folioNumber: body.folioNumber,
    visibility: body.visibility,
    recipientIds: body.recipientIds,
    courseIds: body.courseIds,
    requiresAcknowledgement: body.requiresAcknowledgement,
    file: body.file ? await verifyUploadedFile(body.file) : null,
  });
  res.status(201).json(toApiDocument(doc));
});

// --- Detalle ----------------------------------------------------------------------------------
documentsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);
  const doc = await getDocumentForUser(user, id);
  const myAck = doc.recipients.find((r) => r.userId === user.id)?.acknowledgedAt ?? null;

  res.json({
    ...toApiDocument(doc),
    myAcknowledgedAt: myAck?.toISOString() ?? null,
    canAcknowledge: doc.requiresAcknowledgement && READER_ROLES.includes(user.role) && !myAck,
    permissions: {
      edit: can(user, 'document:update', doc),
      archive: can(user, 'document:archive', doc),
      delete: can(user, 'document:delete'),
      viewTracking: can(user, 'document:viewTracking'),
    },
  });
});

// --- Edición ----------------------------------------------------------------------------------
const patchBody = documentBody
  .omit({ file: true })
  .partial()
  .extend({ file: fileSchema.optional() });

documentsRouter.patch('/:id', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = patchBody.parse(req.body ?? {});
  const doc = await updateDocument(currentUser(req), id, {
    title: body.title,
    description: body.description,
    type: body.documentTypeId ?? body.typeCode,
    documentDate: body.documentDate,
    folioNumber: body.folioNumber ?? undefined,
    visibility: body.visibility,
    recipientIds: body.recipientIds,
    courseIds: body.courseIds,
    requiresAcknowledgement: body.requiresAcknowledgement,
    file: body.file ? await verifyUploadedFile(body.file) : undefined,
  });
  res.json(toApiDocument(doc));
});

const archiveBody = z.object({ archived: z.boolean().default(true) });

documentsRouter.post('/:id/archive', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { archived } = archiveBody.parse(req.body ?? {});
  res.json(toApiDocument(await setArchived(currentUser(req), id, archived)));
});

documentsRouter.delete('/:id', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  await softDeleteDocument(currentUser(req), id);
  res.status(204).end();
});

// --- Descarga protegida -----------------------------------------------------------------------
documentsRouter.get('/:id/download-url', async (req, res) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);
  // getDocumentForUser responde 403 si el usuario no tiene acceso.
  const doc = await getDocumentForUser(user, id);
  if (!doc.fileKey) throw notFound('El documento no tiene archivo adjunto');

  const meta = requestMeta(req);
  await prisma.downloadLog.create({ data: { documentId: id, userId: user.id, ipAddress: meta.ip, userAgent: meta.userAgent } });
  await recordAudit({ userId: user.id, action: 'DOCUMENT_DOWNLOAD', entity: 'Document', entityId: id, metadata: { ip: meta.ip } });

  res.json({
    url: await presignDownload(doc.fileKey, doc.fileName),
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  });
});

/** URL para la vista previa (inline). No cuenta como descarga, pero queda en la auditoría. */
documentsRouter.get('/:id/preview-url', async (req, res) => {
  const user = currentUser(req);
  const { id } = idParam.parse(req.params);
  const doc = await getDocumentForUser(user, id);
  if (!doc.fileKey) throw notFound('El documento no tiene archivo adjunto');
  await recordAudit({ userId: user.id, action: 'DOCUMENT_VIEW', entity: 'Document', entityId: id });
  res.json({
    url: await presignDownload(doc.fileKey, doc.fileName, 'inline'),
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
  });
});

// --- Acuse de recibo --------------------------------------------------------------------------
documentsRouter.post('/:id/acknowledge', async (req, res) => {
  const user = currentUser(req);
  if (!can(user, 'document:acknowledge')) throw forbidden('Solo docentes y apoderados confirman la lectura');
  const { id } = idParam.parse(req.params);
  const doc = await getDocumentForUser(user, id);
  if (!doc.requiresAcknowledgement) throw badRequest('Este documento no requiere acuse de recibo');

  const existing = doc.recipients.find((r) => r.userId === user.id);
  if (existing?.acknowledgedAt) {
    res.json({ acknowledgedAt: existing.acknowledgedAt.toISOString(), alreadyAcknowledged: true });
    return;
  }
  // Si el usuario ve el documento por su rol o curso, se registra como destinatario al confirmar.
  const row = await prisma.documentRecipient.upsert({
    where: { documentId_userId: { documentId: id, userId: user.id } },
    update: { acknowledgedAt: new Date() },
    create: { documentId: id, userId: user.id, acknowledgedAt: new Date() },
  });
  await recordAudit({ userId: user.id, action: 'DOCUMENT_ACKNOWLEDGE', entity: 'Document', entityId: id });
  res.json({ acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null, alreadyAcknowledged: false });
});

// --- Seguimiento (solo directivos) ------------------------------------------------------------
documentsRouter.get('/:id/downloads', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  await getDocumentForUser(currentUser(req), id);
  const downloads = await prisma.downloadLog.findMany({
    where: { documentId: id },
    orderBy: { downloadedAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, fullName: true, role: true } } },
  });
  res.json(
    downloads.map((d) => ({ id: d.id, user: d.user, downloadedAt: d.downloadedAt.toISOString(), ipAddress: d.ipAddress })),
  );
});

documentsRouter.get('/:id/acknowledgements', requireDirective, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const doc = await getDocumentForUser(currentUser(req), id);
  const audience = await getAudience(doc);
  const acknowledged = audience.filter((m) => m.acknowledgedAt).length;
  res.json({
    requiresAcknowledgement: doc.requiresAcknowledgement,
    total: audience.length,
    acknowledged,
    pending: audience.length - acknowledged,
    members: audience
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))
      .map((m) => ({ ...m, acknowledgedAt: m.acknowledgedAt?.toISOString() ?? null })),
  });
});

