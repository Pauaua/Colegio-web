import {
  CalendarClock,
  ClipboardList,
  MailPlus,
  FilePlus2,
  Files,
  Inbox,
  LayoutDashboard,
  School,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { roleCan, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permiso necesario para ver el ítem; sin `action`, lo ven todos. */
  action?: Action;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      { href: "/documentos", label: "Documentos", icon: Files },
      {
        href: "/documentos/nuevo",
        label: "Subir documento",
        icon: FilePlus2,
        action: "document:create",
      },
      {
        href: "/citaciones/nueva",
        label: "Nueva citación",
        icon: MailPlus,
        action: "citation:create",
      },
      {
        href: "/citaciones",
        label: "Citaciones",
        icon: CalendarClock,
        action: "citation:viewSent",
      },
      {
        href: "/mis-documentos",
        label: "Mis documentos",
        icon: Inbox,
        action: "document:inbox",
      },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios", icon: Users, action: "user:manage" },
      { href: "/cursos", label: "Cursos", icon: School, action: "course:manage" },
      {
        href: "/auditoria",
        label: "Auditoría",
        icon: ClipboardList,
        action: "audit:view",
      },
    ],
  },
  {
    title: "Cuenta",
    items: [{ href: "/perfil", label: "Mi perfil", icon: UserRound }],
  },
];

export function getNavSectionsForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.action || roleCan(role, item.action)),
  })).filter((section) => section.items.length > 0);
}

/** El ítem activo es el de href más largo que coincide con la ruta actual. */
export function getActiveHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((item) =>
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
