import type { AuditAction } from "@/generated/prisma/enums";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: "Inició sesión",
  CREATE_DOCUMENT: "Subió un documento",
  UPDATE_DOCUMENT: "Editó un documento",
  ARCHIVE_DOCUMENT: "Archivó un documento",
  RESTORE_DOCUMENT: "Restauró un documento",
  DELETE_DOCUMENT: "Eliminó un documento",
  ACKNOWLEDGE_DOCUMENT: "Confirmó la lectura",
  RESPOND_CITATION: "Respondió una citación",
  CREATE_USER: "Creó un usuario",
  UPDATE_USER: "Editó un usuario",
  CHANGE_ROLE: "Cambió un rol",
  DEACTIVATE_USER: "Desactivó un usuario",
  ACTIVATE_USER: "Reactivó un usuario",
  CHANGE_PASSWORD: "Cambió su contraseña",
  CREATE_COURSE: "Creó un curso",
  UPDATE_COURSE: "Editó un curso",
  DELETE_COURSE: "Eliminó un curso",
  CREATE_STUDENT: "Agregó un estudiante",
  UPDATE_STUDENT: "Editó un estudiante",
  DELETE_STUDENT: "Eliminó un estudiante",
  LINK_GUARDIAN: "Vinculó un apoderado",
  UNLINK_GUARDIAN: "Desvinculó un apoderado",
};

/** Texto breve del objeto afectado, tomado de metadata (título, nombre…). */
export function describeAuditTarget(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["title", "fullName", "name", "email"]) {
    if (typeof m[key] === "string" && m[key]) return m[key] as string;
  }
  return null;
}
