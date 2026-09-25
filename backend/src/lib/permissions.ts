import type { Prisma, Role } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Permisos centralizados del Gestor Documental (sección 5 del documento técnico).
 * Todo se verifica en el servidor: la interfaz solo oculta lo que el servidor igualmente rechazaría.
 */

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

export const DIRECTIVE_ROLES: readonly Role[] = ['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO'];
export const ADMIN_ROLES: readonly Role[] = ['DIRECTOR', 'SOSTENEDOR'];
export const READER_ROLES: readonly Role[] = ['DOCENTE', 'APODERADO'];
export const ALL_ROLES: readonly Role[] = ['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO'];

export const isDirective = (role: Role) => DIRECTIVE_ROLES.includes(role);
export const isAdmin = (role: Role) => ADMIN_ROLES.includes(role);

export type Action =
  | 'document:create'
  | 'document:update'
  | 'document:archive'
  | 'document:delete'
  | 'document:viewAll'
  | 'document:acknowledge'
  | 'document:viewTracking'
  | 'users:manage'
  | 'courses:manage'
  | 'audit:view'
  | 'dashboard:global'
  | 'mfa:use';

/** Recurso opcional para las reglas que dependen de la autoría (p. ej. EQUIPO_DIRECTIVO solo edita lo propio). */
export interface OwnedResource {
  authorId: number;
}

export function can(user: AuthUser, action: Action, resource?: OwnedResource): boolean {
  switch (action) {
    case 'document:create':
    case 'document:viewAll':
    case 'document:viewTracking':
    case 'audit:view':
    case 'dashboard:global':
    case 'mfa:use':
      return isDirective(user.role);

    case 'document:update':
    case 'document:archive':
      if (isAdmin(user.role)) return true;
      if (user.role === 'EQUIPO_DIRECTIVO') return resource !== undefined && resource.authorId === user.id;
      return false;

    case 'document:delete':
    case 'users:manage':
    case 'courses:manage':
      return isAdmin(user.role);

    case 'document:acknowledge':
      return READER_ROLES.includes(user.role);
  }
}

/**
 * Genera el `where` de Prisma con los documentos visibles para el usuario.
 * Se usa en TODAS las consultas de listados y en la verificación individual.
 *
 * - Directivos: todos los documentos no eliminados.
 * - Docente / apoderado: documentos cuyo rol está en la visibilidad, o dirigidos a él como destinatario,
 *   o (apoderado) dirigidos a un curso donde estudia alguno de sus pupilos.
 */
export function buildDocumentWhere(user: AuthUser): Prisma.DocumentWhereInput {
  if (isDirective(user.role)) return { isDeleted: false };

  const or: Prisma.DocumentWhereInput[] = [
    { visibilities: { some: { role: user.role } } },
    { recipients: { some: { userId: user.id } } },
  ];

  if (user.role === 'APODERADO') {
    or.push({
      courses: {
        some: { course: { students: { some: { guardians: { some: { guardianId: user.id } } } } } },
      },
    });
  }

  return { isDeleted: false, OR: or };
}

/** Indica si el usuario puede ver un documento concreto, aplicando exactamente las mismas reglas del listado. */
export async function canViewDocument(user: AuthUser, document: { id: number }): Promise<boolean> {
  const found = await prisma.document.findFirst({
    where: { AND: [{ id: document.id }, buildDocumentWhere(user)] },
    select: { id: true },
  });
  return found !== null;
}
