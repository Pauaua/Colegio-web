import type { Role } from "@/generated/prisma/enums";

export const ROLES = [
  "DIRECTOR",
  "SOSTENEDOR",
  "EQUIPO_DIRECTIVO",
  "DOCENTE",
  "APODERADO",
] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: "Director(a)",
  SOSTENEDOR: "Sostenedor(a)",
  EQUIPO_DIRECTIVO: "Equipo directivo",
  DOCENTE: "Docente",
  APODERADO: "Apoderado(a)",
};

export type { Role };
