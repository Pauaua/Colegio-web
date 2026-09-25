"use server";

import { randomUUID } from "node:crypto";

import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { es } from "date-fns/locale";

import { logAudit } from "@/lib/audit";
import { CITATION_RESPONSE_LABELS, CITATION_TYPE_CODE } from "@/lib/citations";
import { APP_TIME_ZONE } from "@/lib/dates";
import { buildFileKey } from "@/lib/files";
import { buildSimplePdf } from "@/lib/pdf";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { deleteFile, putFile } from "@/lib/storage";
import { createCitationSchema, respondCitationSchema } from "@/lib/validations/citation";
import { authFailure, isUniqueViolation, type ActionResult } from "@/server/action-utils";
import type { RecipientOption } from "@/server/actions/documents";
import { loadDocumentFor, resolveRecipients, revalidateDocumentViews } from "@/server/documents/helpers";
import { getNextFolio } from "@/server/queries/documents";

const MAX_FOLIO_ATTEMPTS = 3;

/**
 * Genera una citación a apoderados: crea el PDF, lo guarda en el storage y registra
 * el documento (tipo Citación, visible solo para directivos, el autor y los citados).
 */
export async function createCitationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await authorize("citation:create");
  } catch (error) {
    return authFailure(error);
  }

  const parsed = createCitationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos de la citación" };
  }
  const data = parsed.data;

  const [year, month, day] = data.citationDate.split("-").map(Number);
  const [hour, minute] = data.citationTime.split(":").map(Number);
  const citationAt = new TZDate(year, month - 1, day, hour, minute, APP_TIME_ZONE);
  if (citationAt.getTime() < Date.now()) {
    return { ok: false, error: "La fecha y hora de la citación ya pasaron" };
  }

  // Las citaciones solo se dirigen a apoderados (directamente o por curso).
  const recipients = await resolveRecipients({ ...data, requiresAcknowledgement: true }, ["APODERADO"]);
  if (!recipients.ok) return recipients;

  const citationType = await prisma.documentType.findUnique({ where: { code: CITATION_TYPE_CODE } });
  if (!citationType) return { ok: false, error: "No existe el tipo de documento Citación" };

  const today = TZDate.tz(APP_TIME_ZONE);
  const documentDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const folioYear = documentDate.getUTCFullYear();
  const when = format(citationAt, "EEEE d 'de' MMMM 'de' yyyy 'a las' HH:mm 'h'", { locale: es });
  const author = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { fullName: true } });

  for (let attempt = 1; attempt <= MAX_FOLIO_ATTEMPTS; attempt++) {
    const folioNumber = await getNextFolio(citationType.id, folioYear);
    const fileName = `citacion-${folioNumber}-${folioYear}.pdf`;
    const fileKey = buildFileKey(fileName, randomUUID(), folioYear);
    const pdf = buildSimplePdf({
      heading: `Citación N° ${folioNumber}/${folioYear}`,
      title: data.title,
      meta: [
        `Fecha y hora: ${when.charAt(0).toUpperCase()}${when.slice(1)}`,
        `Lugar: ${data.citationPlace}`,
        `Cita: ${author.fullName}`,
      ],
      body: `Estimado(a) apoderado(a): por medio de la presente se le cita a una reunión en la fecha, hora y lugar indicados. ${data.description} Le pedimos confirmar su asistencia en la plataforma del establecimiento.`,
    });
    await putFile(fileKey, pdf, "application/pdf");

    try {
      const document = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            title: data.title,
            description: data.description || null,
            documentTypeId: citationType.id,
            folioNumber,
            folioYear,
            documentDate,
            authorId: user.id,
            fileKey,
            fileName,
            mimeType: "application/pdf",
            fileSize: pdf.length,
            requiresAcknowledgement: true,
            citationAt,
            citationPlace: data.citationPlace,
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
              type: CITATION_TYPE_CODE,
              folio: `${folioNumber}/${folioYear}`,
              citationAt: citationAt.toISOString(),
              recipients: recipients.recipientIds.length,
            },
          },
          tx,
        );
        return created;
      });
      revalidateDocumentViews();
      revalidatePath("/citaciones");
      return { ok: true, data: { id: document.id } };
    } catch (error) {
      await deleteFile(fileKey).catch(() => undefined);
      // Otra citación tomó el mismo folio al mismo tiempo: se reintenta con el siguiente.
      if (isUniqueViolation(error) && attempt < MAX_FOLIO_ATTEMPTS) continue;
      throw error;
    }
  }
  return { ok: false, error: "No se pudo asignar un folio. Intenta de nuevo." };
}

/** El apoderado citado responde: asistirá, no asistirá o pide otro horario. */
export async function respondCitationAction(documentId: string, input: unknown): Promise<ActionResult> {
  const loaded = await loadDocumentFor(documentId, "citation:respond");
  if (!loaded.ok) return loaded.failure;
  const { user, doc } = loaded;

  const parsed = respondCitationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Respuesta inválida" };
  const { response, comment } = parsed.data;

  if (doc.status === "ARCHIVADO")
    return { ok: false, error: "Esta citación fue archivada y ya no recibe respuestas" };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const recipient = await tx.documentRecipient.findUniqueOrThrow({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
    });
    await tx.documentRecipient.update({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
      data: {
        response,
        responseComment: comment || null,
        respondedAt: now,
        // Responder implica haberla leído.
        acknowledgedAt: recipient.acknowledgedAt ?? now,
      },
    });
    await logAudit(
      {
        userId: user.id,
        action: "RESPOND_CITATION",
        entity: "Document",
        entityId: doc.id,
        metadata: {
          title: doc.title,
          response: CITATION_RESPONSE_LABELS[response].status,
          previous: recipient.response ? CITATION_RESPONSE_LABELS[recipient.response].status : null,
        },
      },
      tx,
    );
  });

  revalidateDocumentViews(doc.id);
  revalidatePath("/citaciones");
  return { ok: true };
}

/** Buscador de apoderados para el formulario de citación. */
export async function searchCitationRecipientsAction(query: string): Promise<ActionResult<RecipientOption[]>> {
  try {
    await authorize("citation:create");
  } catch (error) {
    return authFailure(error);
  }
  const q = String(query ?? "")
    .trim()
    .slice(0, 100);
  if (q.length < 2) return { ok: true, data: [] };

  const guardians = await prisma.user.findMany({
    where: {
      isActive: true,
      role: "APODERADO",
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { rut: { contains: q.replace(/\./g, ""), mode: "insensitive" } },
        { students: { some: { student: { fullName: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    select: { id: true, fullName: true, email: true, role: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  return { ok: true, data: guardians as RecipientOption[] };
}
