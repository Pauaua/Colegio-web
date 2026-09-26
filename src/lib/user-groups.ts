import type { Role } from "@/generated/prisma/enums";

/** Agrupación de roles en la sección Usuarios: cada grupo tiene su propia lista. */
export const USER_GROUPS = {
  directivos: {
    label: "Directivos",
    description: "Director(a) y equipo directivo.",
    roles: ["DIRECTOR", "EQUIPO_DIRECTIVO"],
    newLabel: "Nuevo directivo",
  },
  docentes: {
    label: "Docentes",
    description: "Profesores y profesoras del establecimiento.",
    roles: ["DOCENTE"],
    newLabel: "Nuevo docente",
  },
  apoderados: {
    label: "Apoderados",
    description: "Apoderados y apoderadas de los estudiantes.",
    roles: ["APODERADO"],
    newLabel: "Nuevo apoderado",
  },
} as const satisfies Record<
  string,
  { label: string; description: string; roles: readonly Role[]; newLabel: string }
>;

export type UserGroup = keyof typeof USER_GROUPS;

export const USER_GROUP_KEYS = Object.keys(USER_GROUPS) as UserGroup[];

export function groupForRole(role: Role): UserGroup {
  return USER_GROUP_KEYS.find((key) => (USER_GROUPS[key].roles as readonly Role[]).includes(role))!;
}

export function userGroupHref(role: Role) {
  return `/usuarios/${groupForRole(role)}`;
}
