import "server-only";

import { revalidatePath } from "next/cache";

import type { Role } from "@/generated/prisma/enums";
import { can, type Action } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { authFailure, type ActionFailure } from "@/server/action-utils";
import { permissionInclude, toPermissionDocument } from "@/server/queries/documents";

/**
 * Utilidades compartidas por las Server Actions de documentos y citaciones.
 * Viven fuera de los archivos "use server" para no exponerse como acciones invocables.
 */

export function revalidateDocumentViews(documentId?: string) {
  revalidatePath("/documentos");
  revalidatePath("/mis-documentos");
  revalidatePath("/");
  if (documentId) revalidatePath(`/documentos/${documentId}`);
}

/** Destinatarios finales: los elegidos a mano + los apoderados de los cursos seleccionados. */
export async function resolveRecipients(
  data: { recipientIds: string[]; courseIds: string[]; requiresAcknowledgement: boolean },
  allowedRoles: Role[] = ["DOCENTE", "APODERADO"],
): Promise<{ ok: true; recipientIds: string[] } | ActionFailure> {
  const [directRecipients, courseGuardians, courses] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: data.recipientIds }, isActive: true, role: { in: allowedRoles } },
      select: { id: true },
    }),
    prisma.guardianStudent.findMany({
      where: { student: { courseId: { in: data.courseIds } }, guardian: { isActive: true } },
      select: { guardianId: true },
    }),
    prisma.course.findMany({ where: { id: { in: data.courseIds } }, select: { id: true } }),
  ]);
  if (directRecipients.length !== new Set(data.recipientIds).size) {
    return { ok: false, error: "Uno de los destinatarios no es válido" };
  }
  if (courses.length !== new Set(data.courseIds).size) {
    return { ok: false, error: "Uno de los cursos no es válido" };
  }
  const recipientIds = [
    ...new Set([...directRecipients.map((u) => u.id), ...courseGuardians.map((g) => g.guardianId)]),
  ];
  if (data.requiresAcknowledgement && recipientIds.length === 0) {
    return {
      ok: false,
      error: "Los cursos elegidos no tienen apoderados registrados para el acuse de recibo",
    };
  }
  return { ok: true, recipientIds };
}

/** Carga un documento no eliminado y verifica que `action` esté permitida sobre él. */
export async function loadDocumentFor(
  documentId: string,
  action: Extract<Action, `document:${string}` | "citation:respond">,
) {
  let user;
  try {
    user = await authorize(action);
  } catch (error) {
    return { ok: false as const, failure: authFailure(error) };
  }
  const doc = await prisma.document.findUnique({
    where: { id: String(documentId) },
    include: { ...permissionInclude, documentType: { select: { name: true, code: true } } },
  });
  if (!doc || doc.isDeleted) {
    return { ok: false as const, failure: { ok: false, error: "El documento no existe" } as ActionFailure };
  }
  if (!can(user, action, toPermissionDocument(doc))) {
    return {
      ok: false as const,
      failure: { ok: false, error: "No tienes permiso para realizar esta acción" } as ActionFailure,
    };
  }
  return { ok: true as const, user, doc };
}
