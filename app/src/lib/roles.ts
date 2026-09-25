import type { Role } from '@/api/types';

/**
 * Reglas de la interfaz. Solo ocultan lo que el servidor igualmente rechazaría:
 * la verificación real está en backend/src/lib/permissions.ts.
 */
export const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: 'Director(a)',
  SOSTENEDOR: 'Sostenedor',
  EQUIPO_DIRECTIVO: 'Equipo directivo',
  DOCENTE: 'Docente',
  APODERADO: 'Apoderado(a)',
};

export const ALL_ROLES: Role[] = ['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO'];
export const DIRECTIVE_ROLES: Role[] = ['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO'];
export const ADMIN_ROLES: Role[] = ['DIRECTOR', 'SOSTENEDOR'];
export const READER_ROLES: Role[] = ['DOCENTE', 'APODERADO'];

export const isDirective = (role?: Role) => !!role && DIRECTIVE_ROLES.includes(role);
export const isAdmin = (role?: Role) => !!role && ADMIN_ROLES.includes(role);
export const isReader = (role?: Role) => !!role && READER_ROLES.includes(role);

export const STATUS_LABELS = { VIGENTE: 'Vigente', ARCHIVADO: 'Archivado' } as const;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGIN_MFA_CHALLENGE: 'Solicitud de código MFA',
  MFA_FAILED: 'Código MFA incorrecto',
  MFA_ENABLE: 'MFA activado',
  MFA_DISABLE: 'MFA desactivado',
  PASSWORD_CHANGE: 'Cambio de contraseña',
  REFRESH_TOKEN_REUSE: 'Reutilización de sesión revocada',
  DOCUMENT_CREATE: 'Documento subido',
  DOCUMENT_UPDATE: 'Documento editado',
  DOCUMENT_ARCHIVE: 'Documento archivado',
  DOCUMENT_UNARCHIVE: 'Documento restaurado',
  DOCUMENT_DELETE: 'Documento eliminado',
  DOCUMENT_DOWNLOAD: 'Descarga de documento',
  DOCUMENT_VIEW: 'Vista previa de documento',
  DOCUMENT_ACKNOWLEDGE: 'Confirmación de lectura',
  USER_CREATE: 'Usuario creado',
  USER_UPDATE: 'Usuario modificado',
  USER_DEACTIVATE: 'Usuario desactivado',
  COURSE_CREATE: 'Curso creado',
  COURSE_UPDATE: 'Curso modificado',
  COURSE_DELETE: 'Curso eliminado',
  STUDENT_CREATE: 'Estudiante creado',
  STUDENT_UPDATE: 'Estudiante modificado',
  STUDENT_DELETE: 'Estudiante eliminado',
  GUARDIAN_LINK: 'Apoderado vinculado',
  GUARDIAN_UNLINK: 'Apoderado desvinculado',
};

export const actionLabel = (action: string) => AUDIT_ACTION_LABELS[action] ?? action;
