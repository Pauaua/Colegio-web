import {
  CloudUpload,
  FileText,
  GraduationCap,
  House,
  Inbox,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import type { Role } from '@/api/types';
import { ADMIN_ROLES, ALL_ROLES, DIRECTIVE_ROLES, READER_ROLES } from '@/lib/roles';

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles que ven el ítem en la sidebar (web / pantallas anchas). */
  roles: Role[];
  /** Roles que lo ven en las tabs inferiores del móvil (máximo 5 por rol). */
  mobileRoles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'inicio', href: '/panel', label: 'Inicio', icon: House, roles: ALL_ROLES, mobileRoles: ALL_ROLES },
  { key: 'documentos', href: '/panel/documentos', label: 'Documentos', icon: FileText, roles: ALL_ROLES, mobileRoles: ALL_ROLES },
  // El apoderado en móvil solo ve Inicio, Documentos y Perfil; "Para mí" está dentro de Documentos.
  { key: 'mis-documentos', href: '/panel/mis-documentos', label: 'Mis documentos', icon: Inbox, roles: READER_ROLES, mobileRoles: ['DOCENTE'] },
  { key: 'subir', href: '/panel/documentos/subir', label: 'Subir', icon: CloudUpload, roles: DIRECTIVE_ROLES, mobileRoles: DIRECTIVE_ROLES },
  { key: 'usuarios', href: '/panel/usuarios', label: 'Usuarios', icon: Users, roles: ADMIN_ROLES, mobileRoles: [] },
  { key: 'cursos', href: '/panel/cursos', label: 'Cursos', icon: GraduationCap, roles: ADMIN_ROLES, mobileRoles: [] },
  { key: 'auditoria', href: '/panel/auditoria', label: 'Auditoría', icon: ShieldCheck, roles: DIRECTIVE_ROLES, mobileRoles: DIRECTIVE_ROLES },
  { key: 'perfil', href: '/panel/perfil', label: 'Perfil', icon: UserRound, roles: ALL_ROLES, mobileRoles: ALL_ROLES },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.key === 'inicio') return pathname === '/panel' || pathname === '/panel/';
  if (item.key === 'subir') return pathname === '/panel/documentos/subir';
  if (item.key === 'documentos') return pathname.startsWith('/panel/documentos') && pathname !== '/panel/documentos/subir';
  return pathname.startsWith(item.href);
}
