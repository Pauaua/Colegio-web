"use server";

import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { isAllowedMimeType, MAGIC_BYTES_LENGTH, matchesMagicBytes, MAX_FILE_SIZE } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { deleteFile, FILE_KEY_PATTERN, getFileInfo, readFileHead } from "@/lib/storage";
import { createDocumentSchema, documentFormSchema, folioSuggestionSchema } from "@/lib/validations/document";
import {
  authFailure,
  isUniqueViolation,
  uniqueViolationFields,
  type ActionResult,
} from "@/server/action-utils";
import { loadDocumentFor, resolveRecipients, revalidateDocumentViews } from "@/server/documents/helpers";
import { getNextFolio } from "@/server/queries/documents";

// ─── Folio sugerido ─────────────────────────────────────────────────────

export async function suggestFolioAction(input: {
  documentTypeId: string;
  year: number;
}): Promise<ActionResult<{ folioNumber: number }>> {
  try {
    await authorize("document:create");
  } catch (error) {
    return authFailure(error);
  }
  const parsed = folioSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const folioNumber = await getNextFolio(parsed.data.documentTypeId, parsed.data.year);
  return { ok: true, data: { folioNumber } };
}

// ─── Búsqueda de destinatarios ──────────────────────────────────────────

export type RecipientOption = { id: string; fullName: string; email: string; role: "DOCENTE" | "APODERADO" };

export async function searchRecipientsAction(query: string): Promise<ActionResult<RecipientOption[]>> {
  try {
    await authorize("document:create");
  } catch (error) {
    return authFailure(error);
  }
  const q = String(query ?? "")
    .trim()
    .slice(0, 100);
  if (q.length < 2) return { ok: true, data: [] };

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["DOCENTE", "APODERADO"] },
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { rut: { contains: q.replace(/\./g, ""), mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  return { ok: true, data: users as RecipientOption[] };
}

// ─── Utilidades compartidas por crear y editar ──────────────────────────

/** Comprueba en el storage que el archivo subido existe y es lo que dice ser. */
async function verifyUploadedFile(
  fileKey: string,
  mimeType: string,
  fileSize: number,
): Promise<string | null> {
  if (!FILE_KEY_PATTERN.test(fileKey)) return "Referencia de archivo inválida";
  if (!isAllowedMimeType(mimeType)) return "Tipo de archivo no permitido";

  const info = await getFileInfo(fileKey);
  if (!info) return "No encontramos el archivo subido. Vuelve a intentarlo.";
  if (info.size !== fileSize || info.size > MAX_FILE_SIZE) return "El tamaño del archivo no coincide";
  if (info.contentType && info.contentType !== mimeType) return "El tipo del archivo no coincide";

  const head = await readFileHead(fileKey, MAGIC_BYTES_LENGTH);
  if (!matchesMagicBytes(head, mimeType)) return "El contenido del archivo no corresponde a su tipo";
  return null;
}

function parseDocumentDate(value: string) {
  const documentDate = new Date(`${value}T00:00:00.000Z`);
  return { documentDate, folioYear: documentDate.getUTCFullYear() };
}

function folioConflictMessage(error: Prisma.PrismaClientKnownRequestError, typeName: string, folio: string) {
  if (uniqueViolationFields(error).includes("fileKey"))
    return "Este archivo ya está asociado a otro documento";
  return `Ya existe un documento de tipo «${typeName}» con el folio ${folio}`;
}

// ─── Crear ──────────────────────────────────────────────────────────────

export async function createDocumentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await authorize("document:create");
  } catch (error) {
    return authFailure(error);
  }

  const parsed = createDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario" };
  }
  const data = parsed.data;

  const fileError = await verifyUploadedFile(data.fileKey, data.mimeType, data.fileSize);
  if (fileError) {
    await deleteFile(data.fileKey).catch(() => undefined);
    return { ok: false, error: fileError };
  }

  const documentType = await prisma.documentType.findUnique({ where: { id: data.documentTypeId } });
  if (!documentType) return { ok: false, error: "El tipo de documento no existe" };

  const recipients = await resolveRecipients(data);
  if (!recipients.ok) return recipients;

  const { documentDate, folioYear } = parseDocumentDate(data.documentDate);

  try {
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          title: data.title,
          description: data.description || null,
          documentTypeId: data.documentTypeId,
          folioNumber: data.folioNumber,
          folioYear,
          documentDate,
          authorId: user.id,
          fileKey: data.fileKey,
          fileName: data.fileName,
          mimeType: data.mimeType,
          fileSize: data.fileSize,
          requiresAcknowledgement: data.requiresAcknowledgement,
          visibility: { create: [...new Set(data.visibility)].map((role) => ({ role })) },
          recipients: { create: recipients.recipientIds.map((userId) => ({ userId })) },
          courses: { create: data.courseIds.map((courseId) => ({ courseId })) },
        },
        select: { id: true },
      });
      await logAudit(
        {
          userId: user.id,
          action: "CREATE_DOCUMENT",
          entity: "Document",
          entityId: created.id,
          metadata: {
            title: data.title,
            type: documentType.code,
            folio: `${data.folioNumber}/${folioYear}`,
            visibility: data.visibility,
            recipients: recipients.recipientIds.length,
          },
        },
        tx,
      );
      return created;
    });

    revalidateDocumentViews();
    return { ok: true, data: { id: document.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: folioConflictMessage(error, documentType.name, `${data.folioNumber}/${folioYear}`),
      };
    }
    throw error;
  }
}

// ─── Editar metadatos y visibilidad ─────────────────────────────────────

export async function updateDocumentAction(documentId: string, input: unknown): Promise<ActionResult> {
  const loaded = await loadDocumentFor(documentId, "document:update");
  if (!loaded.ok) return loaded.failure;
  const { user, doc } = loaded;

  const parsed = documentFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario" };
  }
  const data = parsed.data;

  const documentType = await prisma.documentType.findUnique({ where: { id: data.documentTypeId } });
  if (!documentType) return { ok: false, error: "El tipo de documento no existe" };

  const recipients = await resolveRecipients(data);
  if (!recipients.ok) return recipients;

  const { documentDate, folioYear } = parseDocumentDate(data.documentDate);
  const previousRecipientIds = doc.recipients.map((r) => r.userId);
  const removedRecipients = previousRecipientIds.filter((id) => !recipients.recipientIds.includes(id));
  const addedRecipients = recipients.recipientIds.filter((id) => !previousRecipientIds.includes(id));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: doc.id },
        data: {
          title: data.title,
          description: data.description || null,
          documentTypeId: data.documentTypeId,
          folioNumber: data.folioNumber,
          folioYear,
          documentDate,
          requiresAcknowledgement: data.requiresAcknowledgement,
        },
      });
      await tx.documentVisibility.deleteMany({ where: { documentId: doc.id } });
      await tx.documentVisibility.createMany({
        data: [...new Set(data.visibility)].map((role) => ({ documentId: doc.id, role })),
      });
      // Los destinatarios que se mantienen conservan su acuse de recibo.
      await tx.documentRecipient.deleteMany({
        where: { documentId: doc.id, userId: { in: removedRecipients } },
      });
      await tx.documentRecipient.createMany({
        data: addedRecipients.map((userId) => ({ documentId: doc.id, userId })),
      });
      await tx.documentCourse.deleteMany({ where: { documentId: doc.id } });
      await tx.documentCourse.createMany({
        data: data.courseIds.map((courseId) => ({ documentId: doc.id, courseId })),
      });
      await logAudit(
        {
          userId: user.id,
          action: "UPDATE_DOCUMENT",
          entity: "Document",
          entityId: doc.id,
          metadata: {
            title: data.title,
            changes: {
              title: doc.title !== data.title ? { from: doc.title, to: data.title } : undefined,
              folio:
                doc.folioNumber !== data.folioNumber || doc.folioYear !== folioYear
                  ? { from: `${doc.folioNumber}/${doc.folioYear}`, to: `${data.folioNumber}/${folioYear}` }
                  : undefined,
              visibility: {
                from: doc.visibility.map((v) => v.role),
                to: data.visibility,
              },
              recipientsAdded: addedRecipients.length,
              recipientsRemoved: removedRecipients.length,
            },
          },
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: folioConflictMessage(error, documentType.name, `${data.folioNumber}/${folioYear}`),
      };
    }
    throw error;
  }

  revalidateDocumentViews(doc.id);
  return { ok: true };
}

// ─── Archivar / restaurar ───────────────────────────────────────────────

export async function setDocumentArchivedAction(
  documentId: string,
  archived: boolean,
): Promise<ActionResult> {
  const loaded = await loadDocumentFor(documentId, "document:archive");
  if (!loaded.ok) return loaded.failure;
  const { user, doc } = loaded;

  const status = archived === true ? "ARCHIVADO" : "VIGENTE";
  if (doc.status === status) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { status } });
    await logAudit(
      {
        userId: user.id,
        action: archived ? "ARCHIVE_DOCUMENT" : "RESTORE_DOCUMENT",
        entity: "Document",
        entityId: doc.id,
        metadata: { title: doc.title },
      },
      tx,
    );
  });

  revalidateDocumentViews(doc.id);
  return { ok: true };
}

// ─── Eliminar (borrado lógico) ──────────────────────────────────────────

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const loaded = await loadDocumentFor(documentId, "document:delete");
  if (!loaded.ok) return loaded.failure;
  const { user, doc } = loaded;

  // El archivo se conserva en el storage: el borrado es lógico y queda auditado.
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { isDeleted: true } });
    await logAudit(
      {
        userId: user.id,
        action: "DELETE_DOCUMENT",
        entity: "Document",
        entityId: doc.id,
        metadata: { title: doc.title, folio: `${doc.folioNumber}/${doc.folioYear}` },
      },
      tx,
    );
  });

  revalidateDocumentViews(doc.id);
  return { ok: true };
}

// ─── Acuse de recibo ────────────────────────────────────────────────────

export async function acknowledgeDocumentAction(
  documentId: string,
): Promise<ActionResult<{ acknowledgedAt: string }>> {
  const loaded = await loadDocumentFor(documentId, "document:acknowledge");
  if (!loaded.ok) return loaded.failure;
  const { user, doc } = loaded;

  const recipient = await prisma.documentRecipient.findUnique({
    where: { documentId_userId: { documentId: doc.id, userId: user.id } },
  });
  if (recipient?.acknowledgedAt) {
    return { ok: true, data: { acknowledgedAt: recipient.acknowledgedAt.toISOString() } };
  }

  const acknowledgedAt = new Date();
  await prisma.$transaction(async (tx) => {
    // updateMany con acknowledgedAt: null evita pisar un acuse concurrente.
    await tx.documentRecipient.updateMany({
      where: { documentId: doc.id, userId: user.id, acknowledgedAt: null },
      data: { acknowledgedAt },
    });
    await logAudit(
      {
        userId: user.id,
        action: "ACKNOWLEDGE_DOCUMENT",
        entity: "Document",
        entityId: doc.id,
        metadata: { title: doc.title },
      },
      tx,
    );
  });

  revalidateDocumentViews(doc.id);
  return { ok: true, data: { acknowledgedAt: acknowledgedAt.toISOString() } };
}
