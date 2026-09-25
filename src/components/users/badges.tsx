import { ROLE_LABELS, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<Role, string> = {
  DIRECTOR: "bg-secondary",
  EQUIPO_DIRECTIVO: "bg-accent",
  DOCENTE: "bg-primary",
  APODERADO: "bg-primary-soft",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-tag-foreground",
        ROLE_STYLES[role],
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function UserStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
      Activo
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      Inactivo
    </span>
  );
}
