/**
 * Permisos centralizados. Funciones puras (sin acceso a BD): se usan en
 * Server Components, Server Actions, Route Handlers, proxy.ts y la interfaz.
 *
 * Toda consulta de listados de documentos DEBE usar buildDocumentWhere(user).
 *
 * Roles:
 * - DIRECTOR y EQUIPO_DIRECTIVO: gestión completa (documentos, usuarios, cursos, auditoría).
 * - DOCENTE: genera citaciones a apoderados, ve las que envió y los documentos visibles para docentes.
 * - APODERADO: solo lectura; responde las citaciones dirigidas a él.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

export type PermissionUser = { id: string; role: Role };

export type Action =
  | "document:create" // subir cualquier tipo de documento
  | "document:update" // editar metadatos y visibilidad
  | "document:archive"
  | "document:delete" // borrado lógico
  | "document:viewAll"
  | "document:viewActivity" // quién descargó / leyó / respondió
  | "document:inbox" // "Mis documentos": dirigidos a mí
  | "document:acknowledge" // confirmar lectura
  | "citation:create" // generar una citación a apoderados
  | "citation:viewSent" // "Citaciones": las enviadas (todas para directivos, propias para docentes)
  | "citation:respond" // aceptar / rechazar / pedir otro horario
  | "user:manage"
  | "course:manage"
  | "audit:view"
  | "dashboard:viewStats"; // estadísticas institucionales

const MANAGEMENT: readonly Role[] = ["DIRECTOR", "EQUIPO_DIRECTIVO"];
const STAFF: readonly Role[] = ["DIRECTOR", "EQUIPO_DIRECTIVO", "DOCENTE"];
const COMMUNITY: readonly Role[] = ["DOCENTE", "APODERADO"];

/** Roles con permiso para cada acción (sin considerar el recurso). */
const ROLE_PERMISSIONS: Record<Action, readonly Role[]> = {
  "document:create": MANAGEMENT,
  "document:update": MANAGEMENT,
  "document:archive": MANAGEMENT,
  "document:delete": MANAGEMENT,
  "document:viewAll": MANAGEMENT,
  // Los docentes solo sobre sus propias citaciones (ver can()).
  "document:viewActivity": STAFF,
  "document:inbox": COMMUNITY,
  "document:acknowledge": COMMUNITY,
  "citation:create": STAFF,
  "citation:viewSent": STAFF,
  "citation:respond": ["APODERADO"],
  "user:manage": MANAGEMENT,
  "course:manage": MANAGEMENT,
  "audit:view": MANAGEMENT,
  "dashboard:viewStats": MANAGEMENT,
};

export type DocumentForPermission = {
  authorId: string;
  isDeleted: boolean;
  isCitation: boolean;
  visibility: readonly Role[];
  recipientIds: readonly string[];
};

/** Permiso del rol, sin considerar un recurso concreto (menús, secciones, botones). */
export function roleCan(role: Role, action: Action): boolean {
  return ROLE_PERMISSIONS[action].includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT.includes(role);
}

/**
 * ¿Puede `user` realizar `action`?
 * - Sin `resource`: responde si su rol tiene la acción en general (útil para menús y botones).
 * - Con `resource`: aplica además las reglas sobre ese documento (autoría, destinatario, borrado).
 */
export function can(user: PermissionUser, action: Action, resource?: DocumentForPermission): boolean {
  if (!roleCan(user.role, action)) return false;
  if (!resource) return true;
  if (resource.isDeleted) return false;

  switch (action) {
    case "document:viewActivity":
      return isManagement(user.role) || resource.authorId === user.id;
    case "document:acknowledge":
      return resource.recipientIds.includes(user.id);
    case "citation:respond":
      return resource.isCitation && resource.recipientIds.includes(user.id);
    default:
      return true;
  }
}

/** Visibilidad de un documento: misma regla que buildDocumentWhere, evaluada en memoria. */
export function canViewDocument(user: PermissionUser, doc: DocumentForPermission): boolean {
  if (doc.isDeleted) return false;
  if (isManagement(user.role)) return true;
  return (
    doc.visibility.includes(user.role) || doc.recipientIds.includes(user.id) || doc.authorId === user.id
  );
}

/** La descarga exige exactamente lo mismo que la visualización. */
export const canDownloadDocument = canViewDocument;

/**
 * Filtro de Prisma con los documentos que `user` puede ver.
 * Directivos: todos los no eliminados. Docentes y apoderados: los visibles para su
 * rol, los dirigidos a ellos y los que crearon (también archivados, como registro histórico).
 */
export function buildDocumentWhere(user: PermissionUser): Prisma.DocumentWhereInput {
  if (isManagement(user.role)) {
    return { isDeleted: false };
  }
  return {
    isDeleted: false,
    OR: [
      { visibility: { some: { role: user.role } } },
      { recipients: { some: { userId: user.id } } },
      { authorId: user.id },
    ],
  };
}

// ─── Rutas ──────────────────────────────────────────────────────────────

/** Secciones restringidas por rol. El orden importa: el prefijo más específico primero. */
const ROUTE_RULES: { pattern: RegExp; action: Action }[] = [
  { pattern: /^\/documentos\/nuevo\/?$/, action: "document:create" },
  { pattern: /^\/documentos\/[^/]+\/editar\/?$/, action: "document:update" },
  { pattern: /^\/citaciones\/nueva\/?$/, action: "citation:create" },
  { pattern: /^\/citaciones(\/|$)/, action: "citation:viewSent" },
  { pattern: /^\/mis-documentos(\/|$)/, action: "document:inbox" },
  { pattern: /^\/usuarios(\/|$)/, action: "user:manage" },
  { pattern: /^\/cursos(\/|$)/, action: "course:manage" },
  { pattern: /^\/auditoria(\/|$)/, action: "audit:view" },
];

/** Acción requerida para entrar a `pathname`, o null si basta con tener sesión. */
export function getRequiredAction(pathname: string): Action | null {
  return ROUTE_RULES.find((rule) => rule.pattern.test(pathname))?.action ?? null;
}

export function canAccessPath(user: Pick<PermissionUser, "role">, pathname: string): boolean {
  const action = getRequiredAction(pathname);
  return action === null || roleCan(user.role, action);
}
