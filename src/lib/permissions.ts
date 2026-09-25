/**
 * Permisos centralizados. Funciones puras (sin acceso a BD): se usan en
 * Server Components, Server Actions, Route Handlers, proxy.ts y la interfaz.
 *
 * Toda consulta de listados de documentos DEBE usar buildDocumentWhere(user).
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

export type PermissionUser = { id: string; role: Role };

export type Action =
  | "document:create"
  | "document:update" // editar metadatos y visibilidad
  | "document:archive"
  | "document:delete" // borrado lógico
  | "document:viewAll"
  | "document:viewActivity" // quién descargó / quién confirmó lectura
  | "document:inbox" // "Mis documentos": dirigidos a mí
  | "document:acknowledge"
  | "user:manage"
  | "course:manage"
  | "audit:view"
  | "dashboard:viewStats"; // estadísticas institucionales

const MANAGEMENT: readonly Role[] = ["DIRECTOR", "SOSTENEDOR", "EQUIPO_DIRECTIVO"];
const TOP: readonly Role[] = ["DIRECTOR", "SOSTENEDOR"];
const COMMUNITY: readonly Role[] = ["DOCENTE", "APODERADO"];

/** Roles con permiso para cada acción (sin considerar el recurso). */
const ROLE_PERMISSIONS: Record<Action, readonly Role[]> = {
  "document:create": MANAGEMENT,
  "document:update": MANAGEMENT,
  "document:archive": MANAGEMENT,
  "document:delete": TOP,
  "document:viewAll": MANAGEMENT,
  "document:viewActivity": MANAGEMENT,
  "document:inbox": COMMUNITY,
  "document:acknowledge": COMMUNITY,
  "user:manage": TOP,
  "course:manage": TOP,
  "audit:view": MANAGEMENT,
  "dashboard:viewStats": MANAGEMENT,
};

/** Acciones que el equipo directivo solo puede hacer sobre documentos propios. */
const OWN_DOCUMENTS_ONLY: Partial<Record<Role, readonly Action[]>> = {
  EQUIPO_DIRECTIVO: ["document:update", "document:archive"],
};

export type DocumentForPermission = {
  authorId: string;
  isDeleted: boolean;
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

  if (OWN_DOCUMENTS_ONLY[user.role]?.includes(action)) {
    return resource.authorId === user.id;
  }

  if (action === "document:acknowledge") {
    return resource.recipientIds.includes(user.id);
  }

  return true;
}

/** Visibilidad de un documento: misma regla que buildDocumentWhere, evaluada en memoria. */
export function canViewDocument(user: PermissionUser, doc: DocumentForPermission): boolean {
  if (doc.isDeleted) return false;
  if (isManagement(user.role)) return true;
  return doc.visibility.includes(user.role) || doc.recipientIds.includes(user.id);
}

/** La descarga exige exactamente lo mismo que la visualización. */
export const canDownloadDocument = canViewDocument;

/**
 * Filtro de Prisma con los documentos que `user` puede ver.
 * Directivos: todos los no eliminados. Docentes y apoderados: los visibles
 * para su rol o dirigidos a ellos (también los archivados, como registro histórico).
 */
export function buildDocumentWhere(user: PermissionUser): Prisma.DocumentWhereInput {
  if (isManagement(user.role)) {
    return { isDeleted: false };
  }
  return {
    isDeleted: false,
    OR: [{ visibility: { some: { role: user.role } } }, { recipients: { some: { userId: user.id } } }],
  };
}

// ─── Rutas ──────────────────────────────────────────────────────────────

/** Secciones restringidas por rol. El orden importa: el prefijo más específico primero. */
const ROUTE_RULES: { pattern: RegExp; action: Action }[] = [
  { pattern: /^\/documentos\/nuevo\/?$/, action: "document:create" },
  { pattern: /^\/documentos\/[^/]+\/editar\/?$/, action: "document:update" },
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
